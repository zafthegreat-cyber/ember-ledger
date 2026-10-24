const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, expect } = require('@playwright/test');

const STORE_ID = 'qa-reload-store';
const STORE_NAME = 'Synthetic reload collectibles';
const RAW_MARKER = 'PRIVATE_AUTHOR_MUST_NOT_SAVE';
const FIRST_NOTE = 'QA reviewed shelf context';
const EDIT_NOTE = 'QA context edited after reload';
const PROOF_PATH = '/__qa-restock-reload/proof.png';
const proofPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=', 'base64');

async function openDetails(page, storeName) {
  const feed = page.locator('.scout-reports-landing');
  await expect(feed.getByRole('heading', { name: 'Recent restock reports', exact: true })).toBeVisible({ timeout: 45000 });
  await feed.getByRole('searchbox', { name: 'Search reports', exact: true }).fill(storeName);
  const card = feed.locator('.scout-feed-report-card').filter({ hasText: storeName });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Pokemon TCG');
  await expect(card).toContainText(/In stock|Stock seen/);
  await feed.getByRole('button', { name: /^Stock seen(?:,|$)/ }).click();
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: 'View details', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: storeName, exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Pokemon TCG');
  await expect(dialog).not.toContainText('Details needed');
  return dialog;
}

async function createReviewedCategoryReport(page, { storeId = STORE_ID, storeName = STORE_NAME, manual = false, proofFile = null, onStage = () => {} } = {}) {
  onStage('open-restock');
  await page.locator('.home-restock-hero').getByRole('button', { name: 'Report a restock', exact: true }).click();
  const modal = page.locator('.flow-modal[data-flow="scoutSubmit"]');
  await expect(modal).toBeVisible();
  if (manual) {
    onStage('manual-store');
    const change = modal.getByRole('button', { name: 'Change store', exact: true });
    if (await change.isVisible()) await change.click();
    await modal.getByLabel('Find your store', { exact: true }).fill(storeName);
    const manualLocation = modal.getByPlaceholder('Store name, city, or general location', { exact: true });
    if (!(await manualLocation.isVisible())) await modal.getByRole('button', { name: "Can't find store?", exact: true }).click();
    await manualLocation.fill(storeName);
    await modal.getByRole('checkbox').check();
  }
  const intake = modal.locator('.stock-screenshot-intake');
  onStage('review-community-source');
  await intake.getByRole('button', { name: /^Use a screenshot/ }).click();
  await intake.getByLabel(/^Post source/).selectOption('discord');
  await intake.getByText('Paste or correct post text', { exact: true }).click();
  await intake.getByLabel(/^Private screenshot text/).fill(`Discord stock post\n${RAW_MARKER}\nPokemon TCG in stock\n${storeName}`);
  await intake.getByRole('button', { name: 'Find report details', exact: true }).click();
  await intake.getByLabel(/^Products mentioned/).fill('');
  await intake.getByLabel(/^Product category/).selectOption('Pokemon TCG');
  await intake.getByLabel(/^Stock status in the post/).selectOption('stock_on_shelf');
  const observed = await page.evaluate(() => { const value = new Date(Date.now() - 120000); value.setMinutes(value.getMinutes() - value.getTimezoneOffset()); return value.toISOString().slice(0, 16); });
  await intake.getByLabel('When was the stock seen?', { exact: false }).fill(observed);
  if (!manual) await intake.getByLabel(/^Exact store/).selectOption(storeId);
  await intake.getByRole('button', { name: 'Use reviewed details', exact: true }).click();
  await expect(intake.getByRole('status')).toContainText('Reviewed details added');
  await modal.getByRole('button', { name: 'Continue', exact: true }).filter({ visible: true }).click();
  const details = modal.locator('.scout-proof-step');
  await expect(details).toBeVisible();
  const productDisclosure = details.locator('.stock-report-product-disclosure');
  if (!(await productDisclosure.evaluate(element => element.open))) await productDisclosure.locator('summary').click();
  await details.getByLabel('Product name (optional)', { exact: true }).fill('');
  const notes = details.getByLabel('Useful details (optional)', { exact: true });
  if (!(await notes.isVisible())) await details.locator('summary').filter({ hasText: /useful details/i }).click();
  await notes.fill(FIRST_NOTE);
  if (proofFile) {
    onStage('attach-private-proof');
    const disclosure = details.locator('.scout-proof-disclosure');
    if (!(await disclosure.evaluate(element => element.open))) await disclosure.locator('summary').click();
    await disclosure.locator('input[type="file"]').setInputFiles(proofFile);
    await expect(disclosure.locator('.scout-photo-preview img')).toBeVisible({ timeout: 45000 });
  }
  await modal.getByRole('button', { name: 'Review report', exact: true }).filter({ visible: true }).click();
  onStage('final-review-and-save');
  await expect(modal.locator('.stock-report-source-note')).toContainText('Discord');
  await modal.getByRole('button', { name: 'Save Report', exact: true }).filter({ visible: true }).click();
  await expect(modal.locator('.scout-quick-report-success')).toBeVisible({ timeout: 45000 });
  const savedText = await modal.locator('.scout-quick-report-success').innerText();
  await modal.getByRole('button', { name: 'Done', exact: true }).filter({ visible: true }).click();
  await expect(modal).toHaveCount(0);
  return { observed, savedText };
}

async function editContext(page, dialog, { note = EDIT_NOTE, proofUrl = '' } = {}) {
  await dialog.getByRole('button', { name: /^(Add details|Edit details)$/i }).click();
  const form = page.locator('.scout-report-add-details-form');
  await expect(form).toBeVisible();
  await expect(form.getByLabel(/^Source type/)).toHaveValue('text_screenshot');
  await form.getByLabel(/^Context note/).fill(note);
  if (proofUrl) await form.getByLabel(/^Proof image\/link/).fill(proofUrl);
  await form.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(form).toHaveCount(0, { timeout: 45000 });
}

async function sources(page) {
  return page.evaluate(() => ({ core: JSON.parse(localStorage.getItem('et-tcg-beta-data')), scout: JSON.parse(localStorage.getItem('et-tcg-beta-scout')) }));
}
function reportIdentity(record) {
  return { id: record.id, storeId: record.storeId, storeName: record.storeName, productName: record.productName || '', productCategory: record.productCategory || record.product_category || record.productType || record.product_type || '', sourceType: record.sourceType, proofType: record.proofType, visibility: record.visibility, verified: record.verified, needsReview: record.needsReview, screenshotSourcePlatform: record.screenshotSourcePlatform, observedAt: record.observedAt, reportStatus: record.reportStatus, stockStatus: record.stockStatus };
}
async function runLocal() {
  const base = new URL(process.env.APP_URL || 'http://127.0.0.1:5383');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Synthetic report checks only run on loopback');
  const output = path.resolve(process.env.QA_OUTPUT_DIR || 'artifacts/qa/restock-save-reload');
  fs.mkdirSync(output, { recursive: true });
  const widths = (process.env.QA_RELOAD_WIDTHS || '390,1440').split(',').map(Number);
  const results = [];
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of widths) for (const theme of (process.env.QA_RELOAD_THEME ? [process.env.QA_RELOAD_THEME] : ['light', 'dark'])) {
      const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
      const result = { width, theme, passed: false, writes: [], external: [], errors: [], actualHostedSyncVerified: false, physicalDeviceVerified: false };
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => result.errors.push(error.message));
      page.on('dialog', dialog => dialog.accept());
      await context.route('**/*', route => {
        const request = route.request(), url = new URL(request.url());
        if (!['GET', 'HEAD'].includes(request.method())) { result.writes.push(`${request.method()} ${url.pathname}`); return route.abort(); }
        if (url.origin !== base.origin) { result.external.push(url.origin); return route.abort(); }
        if (url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: '{"configured":false}' });
        if (url.pathname === PROOF_PATH) return route.fulfill({ contentType: 'image/png', body: proofPng });
        return route.continue();
      });
      await context.addInitScript(({ theme, storeId, storeName }) => {
        if (localStorage.getItem('__qa_restock_reload_seeded')) return;
        localStorage.setItem('__qa_restock_reload_seeded', 'true');
        localStorage.setItem('et-tcg-app-theme', theme);
        localStorage.setItem('et-tcg-beta-data', JSON.stringify({ items: [{ id: 'keep-reload-item', name: 'Synthetic retained card', quantity: 3, purpose: 'personal_collection', marketValue: 51.75 }], sales: [{ id: 'keep-reload-sale', salePrice: 12.25 }], expenses: [{ id: 'keep-reload-expense', amount: 3.5 }], catalogProducts: [{ id: 'keep-reload-price', name: 'Synthetic price sentinel', sourceType: 'manual', marketValue: 37.25 }] }));
        localStorage.setItem('et-tcg-beta-scout', JSON.stringify({ stores: [{ id: storeId, name: storeName, nickname: storeName, chain: 'Target', retailer: 'Target', city: 'Norfolk', state: 'VA', address: '1 Synthetic Lane', active: true }, { id: 'qa-preserved-store', name: 'Preserved old report location', nickname: 'Preserved old report location', city: 'Norfolk', state: 'VA', address: '2 Synthetic Lane', active: true }], reports: [{ id: 'keep-reload-report', storeId: 'qa-preserved-store', storeName: 'Preserved old report location', productName: 'Preserved report', note: 'Original synthetic note', stockStatus: 'no_stock', reportedAt: '2026-09-14T13:00:00.000Z' }], items: [{ id: 'keep-reload-sighting', storeId, name: 'Preserved tracking row' }], dropRadarSeedDisabled: true }));
      }, { theme, storeId: STORE_ID, storeName: STORE_NAME });
      try {
        await page.goto(new URL(`/?betaLocalMode=true&themeInspect=${theme}`, base).href);
        await expect(page.locator('.home-restock-hero')).toBeVisible({ timeout: 45000 });
        // Settle normal deferred catalog hydration through the existing Add UI.
        await page.getByRole('button', { name: 'Open global Add menu', exact: true }).filter({ visible: true }).first().click();
        await expect.poll(async () => Boolean((await sources(page)).core.catalogProducts.find(row => row.id === 'sealed-pokemon-booster-box-assorted')), { timeout: 30000 }).toBe(true);
        await page.keyboard.press('Escape');
        // The initial local identity creates a workspace; its next normal load
        // fills empty workspace metadata defaults. Settle that bootstrap before
        // comparing the entire core record object across report operations.
        await page.reload();
        await expect(page.locator('.home-restock-hero')).toBeVisible({ timeout: 45000 });
        const original = await sources(page);
        const created = await createReviewedCategoryReport(page);
        assert.match(created.savedText, /Saved locally/);
        const afterSave = await sources(page);
        assert.equal(afterSave.scout.reports.length, original.scout.reports.length + 1);
        const record = afterSave.scout.reports.find(row => row.id !== 'keep-reload-report');
        assert(record?.id);
        const identity = reportIdentity(record);
        assert.equal(identity.productCategory, 'Pokemon TCG');
        assert.equal(identity.productName, '');
        assert.equal(identity.sourceType, 'text_screenshot');
        assert.equal(identity.screenshotSourcePlatform, 'discord');
        assert.equal(identity.visibility, 'private_from_map');
        assert.equal(identity.verified, false);
        assert.equal(identity.needsReview, true);
        assert(!JSON.stringify(afterSave).includes(RAW_MARKER));
        await page.goto(new URL(`/scout/reports?betaLocalMode=true&themeInspect=${theme}`, base).href);
        await page.reload();
        const dialog = await openDetails(page, STORE_NAME);
        await expect(dialog).toContainText(FIRST_NOTE);
        const reloaded = (await sources(page)).scout.reports.find(row => row.id === identity.id);
        assert.deepEqual(reportIdentity(reloaded), identity);
        await page.screenshot({ path: path.join(output, `${width}-${theme}-reloaded.png`) });
        await editContext(page, dialog, { proofUrl: new URL(PROOF_PATH, base).href });
        await page.reload();
        const editedDialog = await openDetails(page, STORE_NAME);
        await expect(editedDialog).toContainText(EDIT_NOTE);
        const proofDisclosure = editedDialog.locator('summary').filter({ hasText: /Proof.*Photos/i });
        if (await proofDisclosure.count()) await proofDisclosure.click();
        const proof = editedDialog.locator(`img[src="${new URL(PROOF_PATH, base).href}"]`);
        await expect(proof).toBeVisible();
        await proof.scrollIntoViewIfNeeded();
        await expect.poll(() => proof.evaluate(image => image.complete && image.naturalWidth > 0), { timeout: 15000 }).toBe(true);
        const final = await sources(page);
        assert.equal(final.scout.reports.length, afterSave.scout.reports.length);
        const edited = final.scout.reports.find(row => row.id === identity.id);
        assert.deepEqual(reportIdentity(edited), identity);
        assert(JSON.stringify(edited).includes(EDIT_NOTE));
        assert(!JSON.stringify(final).includes(RAW_MARKER));
        assert.deepEqual(final.core, original.core, 'All collection, sales, expenses and price records survive save/reload/edit');
        assert.deepEqual(final.scout.reports.find(row => row.id === 'keep-reload-report'), original.scout.reports[0]);
        assert.deepEqual(final.scout.stores, original.scout.stores);
        assert.deepEqual(final.scout.items, original.scout.items);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        assert.deepEqual(result.writes, []);
        assert.deepEqual(result.external, []);
        assert.deepEqual(result.errors, []);
        await page.screenshot({ path: path.join(output, `${width}-${theme}-edited-proof.png`) });
        Object.assign(result, { passed: true, reportId: identity.id, sameIdAfterTwoReloads: true, savedCategoryAndStockFilter: true, provenanceRetained: true, photo: 'Synthetic same-origin public image; no private authorization claim', originalRecordsAndPricesRetained: true });
      } catch (error) {
        result.error = error.message;
        result.syntheticReportShapes = (await sources(page)).scout?.reports?.filter(row => row.id !== 'keep-reload-report');
        console.error(`FAIL restock reload ${width}/${theme}: ${error.message}`);
        await page.screenshot({ path: path.join(output, `${width}-${theme}-failure.png`) }).catch(() => {});
        fs.writeFileSync(path.join(output, `${width}-${theme}-failure.html`), await page.content());
      } finally { results.push(result); await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ generatedAt: new Date().toISOString(), syntheticOnly: true, results }, null, 2)); }
  assert(results.every(result => result.passed), `Restock reload browser failure: ${path.join(output, 'results.json')}`);
  console.log(`PASS restock save/reload/edit: ${results.length} viewport/theme cases; IDs, category, stock filter, source, public proof and original records/prices retained.`);
}

module.exports = { createReviewedCategoryReport, openDetails, editContext, sources, reportIdentity, FIRST_NOTE, EDIT_NOTE, RAW_MARKER, proofPng };
if (require.main === module) runLocal().catch(error => { console.error(error.message); process.exitCode = 1; });
