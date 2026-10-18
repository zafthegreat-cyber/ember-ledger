const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5243").origin;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname));
const output = path.resolve("artifacts/qa/operations-workspace");
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "fixture.html"), `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Operations layout QA</title></head><body><div id="root"></div><script type="module">
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import '/src/index.css';import '/src/App.css';
import {OperationsWorkspace,OperationsRecordBrowser} from '/src/components/operations/OperationsWorkspace.jsx';
const records=[{id:'one',title:'Target — collector supplies',subtitle:'ORDER-2026-ALPHA',meta:'2 items · Oct 18, 2026',status:'Needs review',statusTone:'warning'},{id:'two',title:'Pokémon Center — long product name with delivery details',subtitle:'ORDER-2026-BETA',meta:'1 item · Oct 17, 2026',status:'Received',statusTone:'success'}];
function App(){const [selected,setSelected]=useState(null);const [query,setQuery]=useState('');const [section,setSection]=useState('orders');const theme=new URLSearchParams(location.search).get('theme');return React.createElement('div',{className:'app app-command-shell','data-theme':theme,style:{padding:'16px',minHeight:'100dvh'}},React.createElement(OperationsWorkspace,{label:'Operations',navigation:[{key:'orders',label:'Email & Orders',icon:'mail',count:2},{key:'accounts',label:'Accounts',count:0}],activeKey:section,onNavigate:setSection},React.createElement(OperationsRecordBrowser,{label:'Orders',records:records.filter(r=>r.title.toLowerCase().includes(query.toLowerCase())),selectedId:selected,onSelect:setSelected,onBack:()=>setSelected(null),backLabel:'Back to orders',toolbar:React.createElement('label',null,'Search orders',React.createElement('input',{value:query,onChange:e=>setQuery(e.target.value)})),filters:React.createElement('p',null,'Grouped filters remain in the list.'),renderDetail:record=>React.createElement('article',{className:'ops-card ops-record-card'},React.createElement('h2',null,record.title),React.createElement('p',null,'Complete order details and existing actions.'),React.createElement('button',{type:'button',className:'ops-button ops-button--secondary'},'Review order'))})));}createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const width of [320, 390, 1440]) for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: "reduce", serviceWorkers: "block" });
      const errors = []; const external = [];
      await context.route("**/*", route => { if (new URL(route.request().url()).origin !== base) { external.push(route.request().url()); return route.abort(); } return route.continue(); });
      const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
      try {
        await page.goto(`${base}/artifacts/qa/operations-workspace/fixture.html?theme=${theme}`);
        const rows = page.locator('.ops-record-browser__row'); await expect(rows).toHaveCount(2);
        if (width < 1100) {
          await expect(page.getByRole('combobox', { name: 'Section' })).toBeVisible();
          await expect(page.getByRole('navigation', { name: 'Operations navigation' })).toBeHidden();
        } else {
          const navigation = page.getByRole('navigation', { name: 'Operations navigation' });
          await expect(navigation).toBeVisible();
          const neutralBackground = await navigation.getByRole('button', { name: 'Accounts 0' }).evaluate(node => getComputedStyle(node).backgroundColor);
          assert.equal(neutralBackground, 'rgba(0, 0, 0, 0)', 'Inactive workspace links must remain neutral, not inherit the app primary-button fill');
          assert.notEqual(await navigation.locator('[aria-current="page"]').evaluate(node => getComputedStyle(node).backgroundColor), neutralBackground);
        }
        await page.getByRole('textbox', { name: 'Search orders' }).fill('Target'); await expect(rows).toHaveCount(1);
        await rows.first().focus(); await page.keyboard.press('Enter');
        await expect(page.locator('.ops-record-browser__selection-heading')).toBeFocused();
        await expect(page.getByRole('button', { name: 'Review order', exact: true })).toBeVisible();
        if (width < 1100) await expect(rows.first()).toBeHidden(); else await expect(rows.first()).toBeVisible();
        const targets = await page.locator('.ops-workspace__navigation button:visible,.ops-workspace__mobile-select select:visible,.ops-record-browser button:visible').evaluateAll(nodes => nodes.map(node => ({ label: node.textContent, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })).filter(item => item.width < 44 || item.height < 44));
        assert.deepEqual(targets, []);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: path.join(output, `${width}-${theme}-detail.png`), fullPage: true });
        await page.getByRole('button', { name: 'Back to orders' }).click(); await expect(rows.first()).toBeFocused();
        await expect(page.getByRole('textbox', { name: 'Search orders' })).toHaveValue('Target');
        await page.getByRole('textbox', { name: 'Search orders' }).fill(''); await expect(rows).toHaveCount(2);
        await page.screenshot({ path: path.join(output, `${width}-${theme}-list.png`), fullPage: true });
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0, 'Presentation performs no storage writes');
        results.push({ width, theme, keyboardSelectAndBack: true, filterPreserved: true, overflow: false, touchTargets: true, storageWrites: 0 });
      } catch (error) { await page.screenshot({ path: path.join(output, `${width}-${theme}-failure.png`), fullPage: true }); throw error; }
      finally { await context.close(); }
    }
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), syntheticOnly: true, results }, null, 2));
    console.log('PASS shared operations workspace: six mobile/desktop theme combinations, keyboard selection/Back, preserved filters,44px targets, zero storage writes or overflow.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
