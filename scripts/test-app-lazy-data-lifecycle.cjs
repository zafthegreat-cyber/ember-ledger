const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const { chromium } = require('@playwright/test');
const rootPath = path.resolve(__dirname, '..');
const source = fs.readFileSync(process.env.APP_LAZY_SOURCE || path.join(rootPath, 'src/App.jsx'), 'utf8');
const effects = [];
traverse(parser.parse(source, { sourceType: 'module', plugins: ['jsx'] }), {
  CallExpression(p) { if (p.node.callee.name === 'useEffect') effects.push(source.slice(p.node.start, p.node.end)); },
});
const cases = [
  { name: 'calendar', loader: 'loadCalendarDataOnDemand', warm: 'calendarDataWarmNeeded', status: 'calendarDataStatus', setStatus: 'setCalendarDataStatus', setBundle: 'setCalendarDataBundle', empty: 'EMPTY_CALENDAR_DATA_BUNDLE' },
  { name: 'restock', loader: 'loadScoutRestockIntelOnDemand', warm: 'scoutRestockIntelWarmNeeded', status: 'scoutRestockIntelStatus', setStatus: 'setScoutRestockIntelStatus', setBundle: 'setScoutRestockIntelBundle', empty: 'EMPTY_SCOUT_RESTOCK_INTEL_BUNDLE' },
];
for (const definition of cases) {
  const matches = effects.filter(effect => effect.includes(`${definition.loader}()`));
  assert.equal(matches.length, 1, 'Execute the actual ' + definition.name + ' effect');
  definition.effect = matches[0];
}
const base = new URL(process.env.APP_URL || 'http://127.0.0.1:5217');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname));
const output = path.resolve(rootPath, process.env.QA_OUTPUT_DIR || 'artifacts/qa/next-ten/release-quality/lazy-data-lifecycle');
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base.origin || route.request().method() !== 'GET') return route.abort();
      if (url.pathname === '/__qa/lazy-data') return route.fulfill({ contentType: 'text/html', body: '<div id="fixture"></div>' });
      return route.continue();
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('/__qa/lazy-data', base).href);
    const result = await page.evaluate(async definitions => {
      const main = await (await fetch('/src/main.jsx')).text();
      const imports = [...main.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
      const dependency = name => imports.find(value => new URL(value, location.href).pathname.endsWith('/' + name));
      const module = await import(dependency('react.js')), React = module.default || module;
      const dom = await import(dependency('react-dom_client.js')), { createRoot } = dom.default || dom;
      const { act } = React;
      window.IS_REACT_ACT_ENVIRONMENT = true;
      const results = [];
      const check = (name, passed) => { results.push({ name, passed }); if (!passed) throw Error(name); };
      try {
        for (const definition of definitions) for (const strict of [false, true]) {
          const tag = `${definition.name}, ${strict ? 'StrictMode' : 'normal'}`;
          async function fixture(initialWarm) {
            const requests = [], writes = [], errors = [];
            let observed = {}, model = { warm: initialWarm };
            const load = () => new Promise((resolve, reject) => requests.push({ resolve, reject }));
            const capture = value => { observed = value; };
            const track = (kind, value) => writes.push({ kind, value });
            const report = (...args) => errors.push(args);
            const code = `return function Probe({ model }) {
              const { useEffect, useState } = React;
              const ${definition.warm} = model.warm;
              const [${definition.status}, setStatusState] = useState('idle');
              const [bundle, setBundleState] = useState({});
              const ${definition.setStatus} = value => { track('status', value); setStatusState(value); };
              const ${definition.setBundle} = value => { track('bundle', value); setBundleState(value); };
              const ${definition.empty} = { defaultField: 'retained' };
              const ${definition.loader} = load, onEffectError = report, logAppError = report;
              capture({ status: ${definition.status}, bundle });
              ${definition.effect}; return null;
            }`;
            const Probe = new Function('React', 'load', 'capture', 'track', 'report', code)(React, load, capture, track, report);
            const root = createRoot(document.querySelector('#fixture'));
            async function render(patch = {}) {
              model = { ...model, ...patch };
              await act(async () => root.render(strict ? React.createElement(React.StrictMode, null, React.createElement(Probe, { model })) : React.createElement(Probe, { model })));
            }
            await render();
            return { requests, writes, errors, render, state: () => observed, close: () => act(async () => root.unmount()) };
          }
          let f = await fixture(false);
          check('inactive route defers imports: ' + tag, f.requests.length === 0);
          await f.render({ warm: true });
          check('active route enters loading once: ' + tag, f.state().status === 'loading' && f.requests.length === 1);
          await f.render({ unrelated: 'new value' });
          check('unrelated render does not replace pending load: ' + tag, f.requests.length === 1);
          await act(async () => f.requests[0].resolve({ value: 'loaded' }));
          check('asynchronous bundle reaches ready: ' + tag, f.state().status === 'ready' && f.state().bundle.value === 'loaded' && f.state().bundle.defaultField === 'retained');
          await f.render({ warm: false }); await f.render({ warm: true });
          check('reentering preserves ready presentation: ' + tag, f.state().status === 'ready');
          await f.close();
          f = await fixture(true);
          await act(async () => f.requests.at(-1).reject(new Error('synthetic import failure')));
          check('active rejection reaches error and reports once: ' + tag, f.state().status === 'error' && f.errors.length === 1);
          const failedCount = f.requests.length; await f.render({ unrelated: 'error render' });
          check('error does not cause an automatic retry loop: ' + tag, f.requests.length === failedCount);
          await f.close();
          f = await fixture(true);
          await f.render({ warm: false }); const writesAtLeave = f.writes.length;
          await act(async () => f.requests.forEach(request => request.resolve({ value: 'stale' })));
          check('route leave discards pending completion: ' + tag, f.writes.length === writesAtLeave && f.state().bundle.value !== 'stale');
          await f.render({ warm: true });
          await act(async () => f.requests.at(-1).resolve({ value: 'fresh' }));
          check('route reentry can finish a fresh subscription: ' + tag, f.state().status === 'ready' && f.state().bundle.value === 'fresh');
          await f.close();
          f = await fixture(true); await f.close(); const writesAtUnmount = f.writes.length;
          await act(async () => f.requests.forEach(request => request.resolve({ value: 'unmounted' })));
          check('unmount discards pending completion: ' + tag, f.writes.length === writesAtUnmount);
        }
        return { passed: true, results };
      } catch (error) { return { passed: false, failure: error.message, results }; }
    }, cases);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ ...result, pageErrors: errors }, null, 2) + '\n');
    assert.deepEqual(errors, []);
    assert.equal(result.passed, true, result.failure);
    console.log(`${result.results.length}/${result.results.length} actual App lazy-data lifecycle cases passed in normal and StrictMode React.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
