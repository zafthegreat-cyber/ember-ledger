const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');
const { proofPng, sources } = require('./test-restock-save-reload-browser.cjs');

const base = new URL(process.env.APP_URL || 'http://127.0.0.1:5383');
assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Synthetic loopback only');
const output = path.resolve(process.env.QA_OUTPUT_DIR || 'artifacts/qa/restock-shortcuts');
fs.mkdirSync(output, { recursive: true });
const results = [];
const widths = (process.env.QA_SHORTCUT_WIDTHS || '390,1440').split(',').map(Number);

async function continueForm(modal) { await modal.getByRole('button', { name: 'Continue', exact: true }).filter({ visible: true }).click(); }
async function selectFacts(modal) {
  await modal.getByRole('group', { name: 'Shelf status', exact: true }).getByRole('button', { name: /^No stock/ }).click();
  await modal.locator('.scout-category-chip-row').getByRole('button', { name: 'Pokemon TCG', exact: true }).click();
}
async function save(modal, { visibility = '', expectedVisibility = 'private_from_map' } = {}) {
  await modal.getByRole('button', { name: 'Review report', exact: true }).filter({ visible: true }).click();
  const sharing = modal.getByRole('combobox', { name: 'Who can see this report', exact: true });
  if (visibility) await sharing.selectOption(visibility);
  await expect(sharing).toHaveValue(expectedVisibility);
  await modal.getByRole('button', { name: 'Save Report', exact: true }).filter({ visible: true }).click();
  await expect(modal.locator('.scout-quick-report-success')).toContainText('Saved locally');
  await expect(modal.getByLabel('Device-only report save', { exact: true })).toContainText('Account saving was not confirmed');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
      const result = { width, passed: false, external: [], writes: [], errors: [], physicalPhoneVerified: false };
      const page = await context.newPage(); page.setDefaultTimeout(20000);
      page.on('dialog', dialog => dialog.accept()); page.on('pageerror', error => result.errors.push(error.message));
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (!['GET', 'HEAD'].includes(request.method())) { result.writes.push(request.method()); return route.abort(); }
        if (url.origin !== base.origin) { result.external.push(url.origin); return route.abort(); }
        if (url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: '{"configured":false}' });
        return route.continue();
      });
      await context.addInitScript(() => {
        if (localStorage.getItem('__qa_shortcuts')) return;
        localStorage.setItem('__qa_shortcuts', '1');
        localStorage.setItem('et-tcg-app-theme', 'light');
        localStorage.setItem('et-tcg-beta-data', JSON.stringify({ items: [{ id: 'retained-item', name: 'Synthetic card', quantity: 4, marketValue: 39.25 }], sales: [{ id: 'retained-sale', salePrice: 15 }], expenses: [{ id: 'retained-expense', amount: 7 }], profile: { displayName: 'Synthetic collector' } }));
        localStorage.setItem('et-tcg-beta-scout', JSON.stringify({ stores: [{ id: 'own-store', name: 'Your fixture store', nickname: 'Your fixture store', retailer: 'Target', city: 'Norfolk', state: 'VA', address: '1 Synthetic Lane', active: true }, { id: 'other-store', name: 'Other collector store', nickname: 'Other collector store', retailer: 'Target', city: 'Norfolk', state: 'VA', address: '2 Synthetic Lane', active: true }], reports: [{ id: 'previous-own', userId: 'local-beta', storeId: 'own-store', storeName: 'Your fixture store', productName: 'Original report', reportedAt: '2026-10-20T12:00:00.000Z', stockStatus: 'no_stock' }, { id: 'previous-other', userId: 'different-account', storeId: 'other-store', storeName: 'Other collector store', reportedAt: '2026-10-23T12:00:00.000Z', stockStatus: 'stock_on_shelf' }], items: [], dropRadarSeedDisabled: true }));
      });
      try {
        await page.goto(new URL('/?betaLocalMode=true', base).href);
        await expect(page.locator('.home-restock-hero')).toBeVisible({ timeout: 60000 });
        const original = await sources(page);
        await page.locator('.home-restock-hero').getByRole('button', { name: 'Report a restock', exact: true }).click();
        const modal = page.locator('.flow-modal[data-flow="scoutSubmit"]');
        const recent = modal.getByRole('region', { name: 'Your recent report stores', exact: true });
        await expect(recent).toBeVisible(); await expect(recent.getByRole('button')).toHaveCount(1);
        await expect(recent).toContainText('Your fixture store'); await expect(recent).not.toContainText('Other collector store');
        const target = await recent.getByRole('button').boundingBox();
        assert(target && target.width >= 44 && target.height >= 44);
        assert.equal(await modal.locator('.flow-modal-body').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
        await page.screenshot({ path: path.join(output, `${width}-recent-stores.png`) });
        await context.setOffline(true);
        await expect(modal.getByRole('status').filter({ hasText: 'You’re offline' })).toBeVisible();
        await context.setOffline(false);
        await expect(modal.getByRole('status').filter({ hasText: 'You’re offline' })).toHaveCount(0);
        await recent.getByRole('button').click();
        await expect(modal.locator('.scout-report-store-card.selected')).toContainText('Your fixture store');
        const time = modal.getByLabel(/^Observed time/);
        if (!(await time.isVisible())) await modal.locator('.stock-report-time-disclosure > summary').click();
        await time.fill('2026-10-20T10:15');
        await continueForm(modal); await selectFacts(modal);
        const details = modal.locator('.scout-proof-step');
        const note = details.getByLabel('Useful details (optional)', { exact: true });
        if (!(await note.isVisible())) await details.locator('summary').filter({ hasText: /useful details/i }).click();
        await note.fill('Previous visit context must not carry forward');
        const photo = details.locator('.scout-proof-disclosure');
        if (!(await photo.evaluate(element => element.open))) await photo.locator('summary').click();
        await photo.locator('input[type="file"]').setInputFiles({ name: 'synthetic-proof.png', mimeType: 'image/png', buffer: proofPng });
        await expect(photo.locator('.scout-photo-preview img')).toBeVisible();
        await save(modal, { visibility: 'private_from_map' });
        const first = await sources(page); assert.equal(first.scout.reports.length, original.scout.reports.length + 1);
        await modal.getByRole('button', { name: 'New visit at this store', exact: true }).click();
        await expect(modal.locator('.scout-where-step')).toBeVisible();
        await expect(modal.locator('.scout-report-store-card.selected')).toContainText('Your fixture store');
        assert.notEqual(await modal.getByLabel(/^Observed time/).inputValue(), '2026-10-20T10:15');
        await continueForm(modal);
        await expect(modal.locator('.scout-report-status-panel button[aria-pressed="true"]')).toHaveCount(0);
        await expect(modal.locator('.scout-category-chip-row button[aria-pressed="true"]')).toHaveCount(0);
        await expect(modal.locator('.scout-photo-preview img')).toHaveCount(0);
        await expect(modal.getByLabel('Useful details (optional)', { exact: true })).toHaveValue('');
        await modal.getByRole('button', { name: 'Review report', exact: true }).filter({ visible: true }).click();
        await expect(modal.locator('.scout-proof-step')).toBeVisible();
        await expect(modal.locator('.form-error')).toContainText('Choose the stock status before continuing.');
        assert.equal((await sources(page)).scout.reports.length, first.scout.reports.length, 'Starting a visit cannot save or duplicate a report');
        assert.equal(await modal.locator('.flow-modal-body').evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
        await page.screenshot({ path: path.join(output, `${width}-fresh-visit.png`) });
        await selectFacts(modal); await save(modal);
        const final = await sources(page);
        assert.equal(final.scout.reports.length, original.scout.reports.length + 2);
        for (const field of ['items', 'sales', 'expenses']) assert.deepEqual(final.core[field], original.core[field]);
        for (const report of original.scout.reports) assert.deepEqual(final.scout.reports.find(row => row.id === report.id), report);
        await modal.getByRole('button', { name: 'Check cloud saving', exact: true }).click();
        await expect(modal).toHaveCount(0); await expect(page.getByRole('heading', { name: 'Settings', exact: true }).first()).toBeVisible({ timeout: 30000 });
        assert.deepEqual(result.external, []); assert.deepEqual(result.writes, []); assert.deepEqual(result.errors, []);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        result.passed = true;
      } catch (error) {
        result.error = error.message;
        result.syntheticUiGroups = await page.locator('.flow-modal[data-flow="scoutSubmit"] [role="group"]').evaluateAll(elements => elements.map(element => ({ name: element.getAttribute('aria-label'), buttons: [...element.querySelectorAll('button')].map(button => button.innerText) })));
        await page.screenshot({ path: path.join(output, `${width}-failure.png`) });
      }
      finally { results.push(result); await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ syntheticOnly: true, generatedAt: new Date().toISOString(), results }, null, 2)); }
  assert(results.every(result => result.passed), `Restock shortcut acceptance failed: ${output}`);
  console.log(`PASS restock shortcuts browser: ${results.length} widths; own recent stores, offline/device-only status, fresh facts/private choice, manual save and original records/prices.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
