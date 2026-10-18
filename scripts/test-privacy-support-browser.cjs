const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5252").origin;
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname));
const output = path.resolve("artifacts/qa/mobile-beta/privacy-support");
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "fixture.html"), `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import{createRoot}from'react-dom/client';import'/src/index.css';import'/src/App.css';import'/src/styles/theme.css';
import AccountDeletionPage from '/src/features/privacy/AccountDeletionPage.jsx';import{PublicSupportPage}from'/src/features/privacy/PrivacyCenter.jsx';
const params=new URLSearchParams(location.search);window.__deleteCalls=0;window.__copies=[];
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(params.get('clipboard')==='denied')throw new Error('denied');window.__copies.push(text)}}});
const mode=params.get('mode');const status={available:mode!=='shared'&&mode!=='storage',state:mode==='pending'?'pending':'ready',accountEmail:'synthetic@example.invalid',deletionScope:['Synthetic account records'],retainedScope:['Downloaded copies'],blockers:mode==='shared'?[{code:'account_shared_workspace',message:'Shared workspace ownership must be transferred.'}]:mode==='storage'?[{code:'account_storage_review_required',message:'Stored file ownership needs review.'}]:[]};
const content=mode==='support'?React.createElement(PublicSupportPage):React.createElement(AccountDeletionPage,{user:{id:'11111111-1111-4111-8111-111111111111'},statusLoader:async()=>{if(mode==='unavailable')throw Object.assign(new Error('Account deletion is not available right now.'),{code:'account_deletion_unavailable'});return status},deleteAccount:async()=>{window.__deleteCalls++;throw new Error('No deletion should run')},onNavigate:tab=>{window.__navigation=tab}});
createRoot(document.getElementById('root')).render(React.createElement('main',{className:'app code3-public-privacy','data-theme':params.get('theme')||'light'},content));
</script></body></html>`);
async function checkLayout(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const small = await page.locator('.code3-privacy button:visible,.code3-privacy-actions a:visible,select:visible,textarea:visible,summary:visible').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height < 44).map(node => node.textContent));
  assert.deepEqual(small, []);
  const failures = await page.locator('.code3-privacy h2,.code3-privacy h3,.code3-privacy p,.code3-privacy label,.code3-privacy li').evaluateAll(nodes => {
    const rgb = value => (value.match(/[0-9.]+/g) || []).map(Number);
    const light = values => values.slice(0, 3).map(value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
    return nodes.filter(node => node.getClientRects().length).filter(node => {
      let ancestor = node; let background;
      while (ancestor) { const color = rgb(getComputedStyle(ancestor).backgroundColor); if (color.length === 3 || color[3] === 1) { background = color; break; } ancestor = ancestor.parentElement; }
      if (!background) return true; const foreground = light(rgb(getComputedStyle(node).color)); const back = light(background);
      return (Math.max(foreground, back) + .05) / (Math.min(foreground, back) + .05) < 4.5;
    }).map(node => node.textContent.slice(0, 80));
  });
  assert.deepEqual(failures, []);
}
(async () => {
  const browser = await chromium.launch({ headless: true }); const results = [];
  try {
    for (const width of [320,390,1440]) for (const theme of ['light','dark']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, serviceWorkers: 'block' });
      const external = []; const errors = [];
      await context.route('**/*', route => { if (new URL(route.request().url()).origin !== base) { external.push(route.request().url()); return route.abort(); } return route.continue(); });
      await context.addInitScript(() => { localStorage.setItem('synthetic-existing-records', '{"record":"keep","price":123}'); });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      for (const mode of ['unavailable','shared','storage','pending']) {
        await page.goto(`${base}/artifacts/qa/mobile-beta/privacy-support/fixture.html?mode=${mode}&theme=${theme}`);
        await page.getByRole('button', { name: 'Review account deletion' }).click();
        await expect(page.getByRole('heading', { name: 'Contact Code 3 TCG support' })).toBeVisible();
        await expect(page.getByText('Opening or copying a draft does not send it.', { exact: false })).toBeVisible();
        if (mode !== 'pending') await expect(page.getByRole('button', { name: 'Permanently delete my account' })).toHaveCount(0);
        else await expect(page.getByRole('alert')).toContainText('Some cloud files may already be removed');
        await page.getByLabel('What happened?', { exact: false }).fill('Android: I cannot finish this step.');
        const href = await page.getByRole('link', { name: 'Open email draft' }).getAttribute('href');
        const draft = new URL(href); assert.equal(decodeURIComponent(draft.pathname), 'support@code3tcg.com');
        assert.match(draft.searchParams.get('body'), /Android: I cannot finish this step/);
        assert.ok(!href.includes('synthetic@example.invalid')); assert.ok(!href.includes('11111111'));
        await page.getByRole('button', { name: 'Copy support message' }).focus();
        await page.keyboard.press('Enter');
        await expect(page.getByText('Support message copied.', { exact: false })).toBeVisible();
        assert.equal((await page.evaluate(() => window.__copies)).length, 1);
        assert.equal(await page.evaluate(() => window.__deleteCalls), 0);
        await checkLayout(page);
        if (mode === 'shared') await page.screenshot({ path: path.join(output, `${width}-${theme}-ownership-help.png`), fullPage: true });
      }
      await page.goto(`${base}/artifacts/qa/mobile-beta/privacy-support/fixture.html?mode=support&theme=${theme}&clipboard=denied`);
      await page.getByLabel('Help topic').selectOption('records');
      await page.getByRole('button', { name: 'Copy support message' }).click();
      const manual = page.getByLabel('Support message', { exact: true });
      await expect(manual).toBeVisible(); await expect(manual).toBeFocused();
      assert.match(await manual.inputValue(), /keep my existing data/);
      await checkLayout(page);
      assert.equal(await page.evaluate(() => localStorage.getItem('synthetic-existing-records')), '{"record":"keep","price":123}');
      assert.equal(await page.evaluate(() => localStorage.length), 1); assert.equal(await page.evaluate(() => sessionStorage.length), 0);
      assert.deepEqual(external, []); assert.deepEqual(errors, []);
      results.push({ width, theme, unavailableAndOwnershipHelp: true, partialDeletionTruthful: true, noMessagesSent: true, noDeletion: true, copyAndManualFallback: true, noAutomaticAccountIdentifiers: true, recordsAndPricesUnchanged: true });
      await context.close();
    }
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), syntheticOnly: true, results }, null, 2));
    console.log('PASS privacy support browser: six viewport/theme contexts, unavailable/shared/storage/pending guidance, reviewed drafts, copy/manual fallback, no writes or messages sent.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
