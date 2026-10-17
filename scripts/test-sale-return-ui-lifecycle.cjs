const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const base = new URL(process.env.APP_URL || 'http://127.0.0.1:5217');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname));
const output = process.env.QA_OUTPUT_DIR ? path.resolve(process.env.QA_OUTPUT_DIR) : path.resolve(__dirname, '../artifacts/qa/reliability-returns/return-ui-lifecycle');
const repositoryFixture = `
  export function createFlipScoutRepository() {
    return {
      load: () => window.wrapperState,
      getLastError: () => '',
      previewSaleReturn: (id, { isOwnerAuthorized }) => window.wrapperRequest('preview', id, isOwnerAuthorized),
      applySaleReturn: (command, { isOwnerAuthorized }) => window.wrapperRequest('apply', command, isOwnerAuthorized),
      runLocked: () => { throw Error('This fixture must not edit inspection records'); },
      save: () => { throw Error('This fixture must not save primary records'); },
    };
  }
`;
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base.origin || route.request().method() !== 'GET') return route.abort();
      if (url.pathname === '/__qa/return-ui') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main id="fixture"></main></body></html>' });
      if (url.pathname === '/src/features/flipScout/storageRepository.js') return route.fulfill({ contentType: 'text/javascript', body: repositoryFixture });
      return route.continue();
    });
    const page = await context.newPage(), pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(new URL('/__qa/return-ui', base).href);
    const result = await page.evaluate(async () => {
      const main = await (await fetch('/src/main.jsx')).text();
      const imports = [...main.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
      const dependency = name => imports.find(value => new URL(value, location.href).pathname.endsWith('/' + name));
      const react = await import(dependency('react.js')), React = react.default || react;
      const dom = await import(dependency('react-dom_client.js')), { createRoot } = dom.default || dom;
      const { act } = React;
      window.IS_REACT_ACT_ENVIRONMENT = true;
      const runtime = (await import('/@react-refresh')).default;
      runtime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
      const { default: Panel } = await import('/src/features/manualLifecycles/SaleReturnSettlement.jsx');
      const { default: ManualLifecycles } = await import('/src/features/manualLifecycles/ManualLifecycles.jsx');
      const { createEmptyFlipScoutState } = await import('/src/features/flipScout/constants.js');
      const results = [], cleanups = [];
      const check = (name, passed) => { results.push({ name, passed }); if (!passed) throw Error(name); };
      const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
      const record = { id: 'Exact-Return-ID', recordVersion: 3, type: 'saleReturn', status: 'Inspected', saleId: 'Exact-Sale-ID', itemId: 'Exact-Item-ID', quantity: 1, disposition: 'Restock', refundMinor: 1200, inspection: 'Synthetic inspection', refundReference: 'Synthetic refund', history: [] };
      const ready = { quantity: 1, restockedQuantity: 1, refundMinor: 1200, refundReference: 'Synthetic refund', disposition: 'Restock', cogsReversalMinor: 500, availableBefore: 0, availableAfter: 1, expectedVersion: 'Synthetic-current-version', blockers: [], alreadyApplied: false };
      const button = (host, text) => [...host.querySelectorAll('button')].find(node => node.textContent.trim() === text);
      const click = node => act(async () => { if (!node) throw Error('Expected control is missing'); node.click(); });
      async function panel(strict, initialRecord = record) {
        const host = document.createElement('div'); document.querySelector('#fixture').append(host);
        const root = createRoot(host), calls = [], callbacks = [];
        let authorized = true, currentRecord = initialRecord;
        const request = (kind, input) => { const gate = deferred(); calls.push({ kind, input, ...gate }); return gate.promise; };
        const service = { previewReturn: id => request('preview', id), applyReturn: command => request('apply', command) };
        async function render(next = currentRecord) {
          currentRecord = next;
          const child = React.createElement(Panel, { key: `${currentRecord.id}-${currentRecord.recordVersion}`, record: currentRecord, service, isOwnerAuthorized: () => authorized, onApplied: result => callbacks.push(result) });
          await act(async () => root.render(strict ? React.createElement(React.StrictMode, null, child) : child));
        }
        let closed = false;
        const close = async () => { if (!closed) { closed = true; await act(async () => root.unmount()); host.remove(); } };
        cleanups.push(close); await render();
        return { host, calls, callbacks, render, close, authorize: value => { authorized = value; }, settle: (call, value = ready) => act(async () => call.resolve(value)), review: () => click(button(host, 'Review stock & refund')), confirm: () => click(host.querySelector('input[type="checkbox"]')) };
      }
      try {
        for (const strict of [false, true]) {
          const tag = strict ? 'StrictMode' : 'normal';
          let f = await panel(strict);
          check('nothing is previewed or applied on mount: ' + tag, f.calls.length === 0 && !button(f.host, 'Apply return & close record'));
          const review = button(f.host, 'Review stock & refund'); await act(async () => { review.click(); review.click(); });
          check('double Review issues one preview: ' + tag, f.calls.length === 1);
          await f.settle(f.calls[0]);
          check('preview requires explicit confirmation: ' + tag, button(f.host, 'Apply return & close record').disabled);
          await f.confirm(); await click(button(f.host, 'Cancel review'));
          check('Cancel clears preview and confirmation without apply: ' + tag, f.calls.every(call => call.kind === 'preview') && !f.host.querySelector('input') && !!button(f.host, 'Review stock & refund'));
          await f.review(); await f.settle(f.calls.at(-1));
          check('new preview requires new confirmation after cancel: ' + tag, button(f.host, 'Apply return & close record').disabled);
          await f.confirm(); const apply = button(f.host, 'Apply return & close record'); await act(async () => { apply.click(); apply.click(); });
          check('double Apply issues one mutation with exact reviewed version: ' + tag, f.calls.filter(call => call.kind === 'apply').length === 1 && JSON.stringify(f.calls.at(-1).input) === JSON.stringify({ returnId: record.id, expectedVersion: ready.expectedVersion, confirmed: true }));
          await f.settle(f.calls.at(-1), { state: { synthetic: true } });
          check('successful apply publishes once: ' + tag, f.callbacks.length === 1); await f.close();
          f = await panel(strict); await f.review(); await f.settle(f.calls[0]); await f.confirm(); await click(button(f.host, 'Apply return & close record'));
          await act(async () => f.calls.at(-1).reject(Error('Saved records changed. Review the latest version.')));
          check('stale preview rejection clears confirmation and requires fresh review: ' + tag, !!button(f.host, 'Review stock & refund') && !f.host.querySelector('input') && f.host.textContent.includes('Saved records changed') && f.callbacks.length === 0); await f.close();
          for (const blocked of [{ ...ready, blockers: ['Inspection still needs review'] }, { ...ready, alreadyApplied: true }]) {
            f = await panel(strict); await f.review(); await f.settle(f.calls[0], blocked);
            check((blocked.alreadyApplied ? 'already-applied' : 'blocked') + ' preview has no Apply control: ' + tag, !button(f.host, 'Apply return & close record') && !f.host.querySelector('input'));
            if (blocked.alreadyApplied) {
              check('applied preview retains immutable nonzero amounts and refund reference: ' + tag, f.host.textContent.includes('$12.00') && f.host.textContent.includes('$5.00') && f.host.textContent.includes('Synthetic refund') && f.host.textContent.includes('Units restocked'));
              check('applied preview labels current availability without historical before/after claims: ' + tag, f.host.textContent.includes('Available units now') && !f.host.textContent.includes('Available units before') && !f.host.textContent.includes('Available units after'));
            }
            await f.close();
          }
          f = await panel(strict, { ...record, status: 'Received' });
          check('uninspected return cannot request a preview: ' + tag, !button(f.host, 'Review stock & refund') && f.calls.length === 0); await f.close();
          f = await panel(strict); await f.review(); await f.settle(f.calls[0]); await f.confirm(); f.authorize(false); await click(button(f.host, 'Apply return & close record'));
          check('authority is checked again at Apply click: ' + tag, f.calls.filter(call => call.kind === 'apply').length === 0); await f.close();
          f = await panel(strict); await f.review(); await f.render({ ...record, id: 'Other-Return-ID' }); await f.settle(f.calls[0]);
          check('record change discards pending old preview: ' + tag, !f.host.textContent.includes('Ready for your review') && !!button(f.host, 'Review stock & refund')); await f.close();
          for (const mode of ['preview-unmount', 'preview-revoke', 'apply-unmount', 'apply-revoke']) {
            f = await panel(strict); await f.review();
            if (mode.startsWith('apply')) { await f.settle(f.calls[0]); await f.confirm(); await click(button(f.host, 'Apply return & close record')); }
            const pending = f.calls.at(-1);
            if (mode.endsWith('unmount')) await f.close(); else f.authorize(false);
            await f.settle(pending, mode.startsWith('apply') ? { state: {} } : ready);
            check('late completion cannot publish after ' + mode + ': ' + tag, f.callbacks.length === 0 && !f.host.textContent.includes('Ready for your review')); await f.close();
          }

          window.wrapperState = { ...createEmptyFlipScoutState(), manualLifecycles: [record] };
          const wrapperCalls = []; let fakeWrites = 0;
          window.wrapperRequest = (kind, input, authority) => {
            if (!authority()) return Promise.reject(Error('Owner access required'));
            const gate = deferred(); wrapperCalls.push({ kind, input, authority, ...gate });
            return gate.promise.then(value => { if (!authority()) throw Error('Owner access revoked'); if (kind === 'apply') fakeWrites++; return value; });
          };
          const host = document.createElement('div'); document.querySelector('#fixture').append(host); const root = createRoot(host);
          const renderWrapper = async (identity, status = 'authorized') => {
            const child = React.createElement(ManualLifecycles, { types: ['saleReturn'], saleId: record.saleId, ownerSession: { status, ownerAuthorized: status === 'authorized', provider: 'synthetic-test', identityKey: identity } });
            await act(async () => root.render(strict ? React.createElement(React.StrictMode, null, child) : child));
          };
          const openReturn = () => click(host.querySelector('.manual-lifecycle-card'));
          await renderWrapper('owner-a', 'sign_in_required'); await openReturn();
          check('wrapper restricts settlement without owner authorization: ' + tag, !button(host, 'Review stock & refund') && wrapperCalls.length === 0);
          await renderWrapper('owner-a'); await openReturn(); await click(button(host, 'Review stock & refund'));
          const oldPreview = wrapperCalls.at(-1); check('wrapper passes live authorized capability: ' + tag, oldPreview.authority());
          await renderWrapper('owner-a', 'sign_in_required'); await act(async () => oldPreview.resolve(ready));
          check('wrapper revocation invalidates old service and clears preview: ' + tag, !oldPreview.authority() && !host.textContent.includes('Ready for your review') && fakeWrites === 0);
          await renderWrapper('owner-b'); await openReturn(); await click(button(host, 'Review stock & refund')); const newPreview = wrapperCalls.at(-1); await act(async () => newPreview.resolve(ready));
          check('new identity receives fresh authority without reviving old service: ' + tag, newPreview.authority() && !oldPreview.authority());
          await click(host.querySelector('input[type="checkbox"]')); await click(button(host, 'Apply return & close record')); const oldApply = wrapperCalls.at(-1);
          await renderWrapper('owner-c'); await act(async () => oldApply.resolve({ state: window.wrapperState }));
          check('identity change blocks pending apply at the injected service boundary: ' + tag, !oldApply.authority() && fakeWrites === 0 && !host.textContent.includes('Return applied on this device'));
          await openReturn(); await click(button(host, 'Review stock & refund')); const unmountPreview = wrapperCalls.at(-1); await act(async () => root.unmount()); host.remove(); await act(async () => unmountPreview.resolve(ready));
          check('wrapper unmount revokes the retained service capability: ' + tag, !unmountPreview.authority() && fakeWrites === 0);
        }
        return { passed: true, results };
      } catch (error) { return { passed: false, failure: error.message, results }; }
      finally { for (const close of cleanups) await close(); }
    });
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ ...result, pageErrors, noRemoteRequests: true }, null, 2) + '\n');
    assert.deepEqual(pageErrors, []); assert.equal(result.passed, true, result.failure);
    console.log(`${result.results.length}/${result.results.length} return component/wrapper lifecycle checks passed in normal and StrictMode React.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
