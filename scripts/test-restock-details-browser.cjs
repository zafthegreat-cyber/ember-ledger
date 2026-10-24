const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5264/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Synthetic report details checks must stay local");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/restock-details-upgrade");
fs.mkdirSync(output, { recursive: true });
const widths = (process.env.QA_DETAILS_WIDTHS || "320,390,1440").split(",").map(Number);
const cases = widths.flatMap(width => ["light", "dark"].filter(theme => !process.env.QA_DETAILS_THEME || theme === process.env.QA_DETAILS_THEME).map(theme => ({ width, height: width === 320 ? 568 : width === 390 ? 844 : 900, theme })));
const proofPixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQEBAO5W6AMAAAAASUVORK5CYII=", "base64");

async function snapshot(page) {
  return page.evaluate(() => {
    const scout = JSON.parse(localStorage.getItem("et-tcg-beta-scout"));
    const data = JSON.parse(localStorage.getItem("et-tcg-beta-data"));
    return { stores: scout.stores, reports: scout.reports, items: scout.items, collection: data.items, sales: data.sales, expenses: data.expenses, catalog: data.catalogProducts };
  });
}

async function settleFocus(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function presentation(page, dialog, name, result) {
  const metrics = await dialog.evaluate(element => {
    const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden";
    const rect = node => { const value = node.getBoundingClientRect(); return { text: node.getAttribute("aria-label") || node.textContent.trim().slice(0, 70), width: value.width, height: value.height, x: value.x, right: value.right, bottom: value.bottom, y: value.y }; };
    const body = element.querySelector(".scout-report-detail-body");
    return {
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      dialogOverflow: element.scrollWidth - element.clientWidth,
      bodyOverflow: body.scrollWidth - body.clientWidth,
      dialog: rect(element), header: rect(element.querySelector(".modal-title-row")), footer: rect(element.querySelector(".location-modal-actions")),
      controls: [...element.querySelectorAll("button,input,select,summary,a[href]")].filter(visible).map(rect),
    };
  });
  result.presentation[name] = metrics;
  assert.ok(Math.max(metrics.pageOverflow, metrics.dialogOverflow, metrics.bodyOverflow) <= 1, `${name}: no horizontal overflow: ${JSON.stringify(metrics)}`);
  assert.ok(metrics.header.y >= -1 && metrics.footer.bottom <= result.height + 1, `${name}: header and footer stay reachable in viewport`);
  for (const control of metrics.controls) {
    assert.ok(control.width >= 44 && control.height >= 44, `${name}: 44px target: ${JSON.stringify(control)}`);
    assert.ok(control.x >= -1 && control.right <= result.width + 1, `${name}: control stays in viewport: ${JSON.stringify(control)}`);
  }
}

async function focusTrap(page, dialog, result) {
  const close = dialog.getByRole("button", { name: "Close report details", exact: true });
  await settleFocus(page); await expect(close).toBeFocused();
  const focusables = dialog.locator('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex="0"]');
  const handles = await focusables.elementHandles();
  const visible = [];
  for (const handle of handles) if (await handle.isVisible()) visible.push(handle);
  assert.ok(visible.length >= 3, "Dialog exposes useful keyboard controls");
  await visible[visible.length - 1].focus(); await page.keyboard.press("Tab"); await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  assert.ok(await visible[visible.length - 1].evaluate(element => element === document.activeElement), "Shift+Tab wraps to last dialog control");
  await page.keyboard.press("Tab"); await expect(close).toBeFocused();
  const focusStyle = await close.evaluate(element => { const css = getComputedStyle(element); return { outline: parseFloat(css.outlineWidth), style: css.outlineStyle }; });
  assert.ok(focusStyle.outline >= 2 && focusStyle.style !== "none", "Keyboard focus is visible");
  result.keyboardTrap = true;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const testCase of cases) {
      const { width, height, theme } = testCase;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
      const writes = [], external = [], errors = [];
      let phase = "startup";
      await context.route("**/*", route => {
        const request = route.request(), url = new URL(request.url());
        if (!["GET", "HEAD"].includes(request.method())) { writes.push(`${request.method()} ${url.pathname}`); return route.abort(); }
        if (url.origin !== base.origin) { external.push({ origin: url.origin, path: url.pathname, method: request.method(), type: request.resourceType(), phase, blocked: true }); return route.abort(); }
        if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
        if (url.pathname.startsWith("/__qa-details/")) return route.fulfill({ contentType: "image/png", body: proofPixel });
        return route.continue();
      });
      await context.addInitScript(({ theme }) => {
        if (localStorage.getItem("__qa_details_seeded")) return;
        localStorage.setItem("__qa_details_seeded", "true");
        localStorage.setItem("et-tcg-app-theme", theme);
        const now = Date.now(), date = hours => new Date(now + hours * 3600000).toISOString();
        const reference = { id: "retained-reference", name: "Aurora reference bundle", productName: "Aurora reference bundle", productType: "Booster Bundle", productKind: "sealed", imageUrl: "/__qa-details/catalog-reference.png", sourceType: "manual", marketValue: 37.25 };
        const reports = [
          { id: "details-rich", storeId: "details-north", storeName: "North Collectibles", reportType: "Store Restock Report", stockStatus: "low_stock", visibility: "public", sourceType: "historical_import", reportedBy: "Fixture collector", confidence: "possible", note: "Top-level shelf note retained alongside every product.", proofText: "Synthetic proof text retained; not a verified live stock claim.", sourceText: "Synthetic imported source note preserved verbatim.", observedAt: date(-240), reportedAt: date(-1), submittedAt: date(-1), itemsSeen: Array.from({ length: 5 }, (_, i) => ({ rowId: `fixture-row-${i}`, productId: i === 0 ? reference.id : "", productName: i === 0 ? reference.name : `Aurora fixture product ${i + 1}`, quantity: i === 0 ? 0 : `${i + 1}`, price: i === 0 ? 0 : i === 1 ? "Ask staff" : `${(i + 1) * 4.5}`, note: `Item note ${i + 1} retained`, catalogProductSnapshot: i === 0 ? reference : null })), catalogProductSnapshot: reference, productImageUrl: reference.imageUrl, photoUrls: Array.from({ length: 6 }, (_, i) => `/__qa-details/proof-${i + 1}.png`) },
          { id: "future-observation", storeId: "details-north", storeName: "North Collectibles", stockStatus: "in_stock", visibility: "public", sourceType: "user_report", productName: "Future observation fixture", observedAt: date(24), reportedAt: date(-1) },
          { id: "malformed-observation", storeId: "details-north", storeName: "North Collectibles", stockStatus: "unknown", visibility: "public", sourceType: "user_report", productName: "Malformed observation fixture", observedAt: "not-a-date", reportedAt: date(-1) },
          { id: "unknown-store", storeId: "not-in-directory", storeName: "Name only location", stockStatus: "empty", visibility: "public", sourceType: "user_report", productName: "Unmatched exact store fixture", observedAt: date(-4), note: "Do not infer a new visit destination from a name." },
        ];
        localStorage.setItem("et-tcg-beta-scout", JSON.stringify({ dropRadarSeedDisabled: true, stores: [{ id: "details-north", name: "North Collectibles", nickname: "North Collectibles", chain: "Target", retailer: "Target", city: "Norfolk", region: "Hampton Roads", state: "VA", address: "1 Synthetic Lane", active: true }], reports, items: [{ id: "retained-sighting", storeId: "details-north", name: "Retained tracked product" }] }));
        localStorage.setItem("et-tcg-beta-data", JSON.stringify({ items: [{ id: "retained-card", name: "Retained collection", quantity: 3, marketValue: 51.75 }], sales: [{ id: "retained-sale", salePrice: 12.25 }], expenses: [{ id: "retained-expense", amount: 3.5 }], catalogProducts: [reference] }));
      }, { theme });
      const page = await context.newPage();
      page.setDefaultTimeout(10000); page.on("pageerror", error => errors.push(error.message));
      const result = { ...testCase, presentation: {}, writes, external, errors };
      try {
        await page.goto(new URL(`/scout/reports?betaLocalMode=true&themeInspect=${theme}`, base).href);
        const feed = page.locator(".scout-reports-landing");
        await expect(feed.getByRole("heading", { name: "Recent restock reports", exact: true })).toBeVisible({ timeout: 30000 });
        await expect(page.locator(".app[data-theme]")).toHaveAttribute("data-theme", theme);
        // Warm the existing deferred local catalog through a real UI entry before
        // taking the preservation baseline. Read-only report inspection must not
        // be confused with the app's unrelated asynchronous seed hydration.
        await page.getByRole("button", { name: "Open global Add menu", exact: true }).filter({ visible: true }).first().click();
        await expect.poll(async () => {
          const data = await snapshot(page);
          return Boolean(data.catalog.find(row => row.id === "retained-reference" && row.marketValue === 37.25) && data.catalog.find(row => row.id === "sealed-pokemon-booster-box-assorted"));
        }, { timeout: 30000 }).toBe(true);
        await page.keyboard.press("Escape");
        await settleFocus(page);
        const original = await snapshot(page);
        assert.equal(original.catalog.find(row => row.id === "retained-reference").marketValue, 37.25, "The original synthetic market price is retained at startup");
        const originalOverflow = await page.evaluate(() => document.body.style.overflow);
        phase = "report-details";
        const cardFor = text => feed.locator(".scout-feed-report-card").filter({ hasText: text });
        const richCard = cardFor("Aurora reference bundle");
        const launch = richCard.getByRole("button", { name: "View details", exact: true });
        await launch.focus(); await page.keyboard.press("Enter");
        const dialog = page.getByRole("dialog", { name: "North Collectibles", exact: true });
        await expect(dialog).toBeVisible();
        await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
        await focusTrap(page, dialog, result);
        await expect(dialog).toContainText("Top-level shelf note retained alongside every product.");
        for (let i = 1; i <= 5; i++) await expect(dialog).toContainText(`Item note ${i} retained`);
        await expect(dialog).toContainText("Historical import");
        await expect(dialog).toContainText(/not.*live|not guaranteed/i);
        const firstItem = dialog.locator(".scout-report-details__item").first();
        await expect(firstItem.locator("dd")).toHaveText(["0", "0"]);
        await expect(dialog.locator(".scout-report-details__item").nth(1)).toContainText("Ask staff");
        await expect(dialog.getByRole("button", { name: "Add details", exact: true })).toBeVisible();
        await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
        await presentation(page, dialog, "details", result);
        await page.screenshot({ path: path.join(output, `${width}-${theme}-details.png`) });

        // Expand all saved proof while keeping reference artwork out of proof counts.
        await dialog.locator("summary").filter({ hasText: "Proof / Photos" }).click();
        await expect(dialog.getByText("Synthetic proof text retained; not a verified live stock claim.", { exact: true })).toBeVisible();
        const more = dialog.getByRole("button", { name: /Show .*more.*(photo|image)/i });
        await more.click();
        const proof = dialog.getByRole("img", { name: /^Report proof \d/ });
        await expect(proof).toHaveCount(6);
        for (let i = 0; i < 6; i++) { await proof.nth(i).scrollIntoViewIfNeeded(); await expect(proof.nth(i)).toBeVisible(); await expect(proof.nth(i)).toHaveAttribute("src", `/__qa-details/proof-${i + 1}.png`); }
        await expect(dialog).toContainText("Catalog reference");
        await expect(dialog.locator('img[src="/__qa-details/catalog-reference.png"]')).toHaveCount(1);
        await dialog.locator("summary").filter({ hasText: "Context / Source" }).click();
        await expect(dialog.getByText("Synthetic imported source note preserved verbatim.", { exact: true })).toHaveCount(0);
        await expect(dialog.locator(".scout-report-details__context")).toContainText("Historical import");
        await presentation(page, dialog, "all-proof", result);
        result.allSixProofPhotosReachable = true; result.referenceArtSeparateFromProof = true;
        assert.deepEqual(await snapshot(page), original, "Inspecting all details and proof does not write records");

        if (width === 320 && theme === "dark") {
          await dialog.evaluate(element => {
            const textStyles = [...element.querySelectorAll("h2,h3,h4,p,label,button,strong,span,small,summary")].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
            for (const [node, size] of textStyles) node.style.setProperty("font-size", `${size * 2}px`, "important");
          });
          await presentation(page, dialog, "text200", result);
          const fewerPhotos = dialog.getByRole("button", { name: "Show fewer photos", exact: true });
          await fewerPhotos.scrollIntoViewIfNeeded();
          const targetReach = await fewerPhotos.evaluate(button => {
            const rect = button.getBoundingClientRect(), body = button.closest(".scout-report-detail-body").getBoundingClientRect();
            return { top: rect.top, bottom: rect.bottom, bodyTop: body.top, bodyBottom: body.bottom };
          });
          assert.ok(targetReach.top >= targetReach.bodyTop - 1 && targetReach.bottom <= targetReach.bodyBottom + 1, "A 200% text gallery action can be brought fully clear of the fixed header and footer");
          result.text200GalleryActionReachable = targetReach;
          await page.screenshot({ path: path.join(output, "320-dark-200percent.png") });
          await dialog.evaluate(element => { for (const node of element.querySelectorAll("[style]")) node.style.removeProperty("font-size"); });
          result.text200Verified = true;
        }
        await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await settleFocus(page); await expect(launch).toBeFocused();
        assert.equal(await page.evaluate(() => document.body.style.overflow), originalOverflow, "Escape restores the page's original scroll policy");
        result.escapeAndFocusReturn = true;

        for (const [text, expected] of [["Future observation fixture", /Future observation date/], ["Malformed observation fixture", /Observation time unavailable/]]) {
          const button = cardFor(text).getByRole("button", { name: "View details", exact: true });
          await button.click(); await expect(dialog).toBeVisible(); await expect(dialog).toContainText(expected);
          assert.ok(!/(Freshness:\s*Fresh|Observed just now)/i.test(await dialog.innerText()), "Future and malformed observations cannot be presented as fresh");
          await dialog.getByRole("button", { name: "Close report details", exact: true }).click(); await settleFocus(page); await expect(button).toBeFocused();
        }
        const unknownLaunch = cardFor("Unmatched exact store fixture").getByRole("button", { name: "View details", exact: true });
        await unknownLaunch.click();
        const unknown = page.getByRole("dialog", { name: "Name only location", exact: true });
        await expect(unknown).toBeVisible(); await expect(unknown.getByRole("button", { name: "Report a new visit", exact: true })).toHaveCount(0);
        await unknown.getByRole("button", { name: "Close report details", exact: true }).click();
        assert.deepEqual(await snapshot(page), original, "Legacy, future and unknown-store details preserve every source record and price");
        result.truthfulLegacyDates = true; result.exactStoreGuard = true;

        // Store-history More → View must return to its persistent launcher too.
        phase = "store-history";
        await page.goto(new URL(`/scout/stores/details-north?betaLocalMode=true&themeInspect=${theme}`, base).href);
        await expect(page.getByRole("heading", { name: "North Collectibles", exact: true }).first()).toBeVisible({ timeout: 30000 });
        const storeCard = page.locator(".scout-report-compact-card").filter({ hasText: "Aurora reference bundle" }).first();
        const moreAction = storeCard.getByRole("button", { name: "More actions", exact: true });
        await moreAction.click(); await storeCard.getByRole("menuitem", { name: "View", exact: true }).click();
        await expect(dialog).toBeVisible(); await focusTrap(page, dialog, result);
        await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await settleFocus(page); await expect(moreAction).toBeFocused();
        assert.deepEqual(await snapshot(page), original, "Store history More/View/Escape does not mutate report data");
        result.moreViewFocusReturn = true;
        await page.goto(new URL(`/scout/reports?betaLocalMode=true&themeInspect=${theme}`, base).href);
        await expect(feed.getByRole("heading", { name: "Recent restock reports", exact: true })).toBeVisible({ timeout: 30000 });

        phase = "new-visit";
        await launch.click(); await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: "Report a new visit", exact: true }).click();
        const report = page.locator('.flow-modal[data-flow="scoutSubmit"]');
        await expect(report.locator(".scout-where-step")).toBeVisible();
        await expect(dialog).toHaveCount(0); await expect(report.locator(".scout-where-step")).toContainText("North Collectibles");
        await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
        const observed = await report.locator('input[type="datetime-local"]').inputValue();
        const observedTime = await page.evaluate(value => new Date(value).getTime(), observed);
        assert.ok(Math.abs(Date.now() - observedTime) < 5 * 60000, "New visit starts at current observation time, not the old report's date");
        await report.getByRole("button", { name: "Continue", exact: true }).click();
        await expect(report.getByLabel("Product name (optional)", { exact: true })).toHaveValue("");
        await expect(report.getByLabel("Useful details (optional)", { exact: true })).toHaveValue("");
        await expect(report.locator(".scout-photo-preview")).toHaveCount(0);
        await expect(report.getByRole("button", { name: /^Low stock/ })).toHaveAttribute("aria-pressed", "false");
        const proofDisclosure = report.locator(".scout-proof-disclosure");
        await proofDisclosure.locator("summary").click();
        await expect(proofDisclosure.getByLabel("Proof text or link", { exact: true })).toHaveValue("");
        assert.deepEqual(await snapshot(page), original, "Starting a new visit cannot change or overwrite old observations");
        await report.locator(".stock-report-product-disclosure > summary").click();
        await report.getByLabel("Product name (optional)", { exact: true }).fill("ZXQ fixture observation 7731");
        await report.getByRole("button", { name: "Review report", exact: true }).filter({ visible: true }).click();
        await report.getByRole("button", { name: "Save Report", exact: true }).filter({ visible: true }).click();
        await expect(report.locator(".scout-quick-report-success")).toBeVisible();
        const saved = await snapshot(page), newReport = saved.reports.find(row => !original.reports.some(old => old.id === row.id));
        assert.equal(saved.reports.length, original.reports.length + 1, "New visit adds exactly one new report");
        assert.ok(newReport, "New visit has its own record"); assert.equal(newReport.storeId, "details-north");
        assert.equal(newReport.productName, "ZXQ fixture observation 7731");
        assert.equal(newReport.note || "", ""); assert.equal(newReport.proofText || "", "");
        assert.deepEqual(newReport.photoUrls, []); assert.equal(newReport.photoUrl || "", "");
        assert.notEqual(newReport.sourceType, "historical_import");
        for (const old of original.reports) assert.deepEqual(saved.reports.find(row => row.id === old.id), old, `Old observation ${old.id} is retained exactly`);
        for (const key of ["stores", "items", "collection", "sales", "expenses", "catalog"]) assert.deepEqual(saved[key], original[key], `${key} are preserved exactly`);
        assert.equal(saved.catalog.find(row => row.id === "retained-reference").marketValue, 37.25, "The original synthetic market price is unchanged after saving a new visit");
        result.newVisitFreshDraftAndOldDataPreserved = true;
        await report.getByRole("button", { name: "Done", exact: true }).click(); await expect(report).toHaveCount(0);
        assert.equal(await page.evaluate(() => document.body.style.overflow), originalOverflow, "Closing the new-visit flow restores the original page scroll policy");
        result.bodyScrollLockAndRestoration = true;
        assert.deepEqual(writes, []); assert.ok(external.every(request => request.blocked && ["GET", "HEAD"].includes(request.method)), "Every outside-origin request was blocked before reaching its service"); assert.deepEqual(errors, []);
        result.escapedExternalRequests = 0;
        result.passed = true;
        console.log(`PASS details ${width}/${theme}: proof, source, dates, focus, fresh new visit and saved data preservation`);
      } catch (error) {
        result.passed = false; result.error = error.message;
        fs.writeFileSync(path.join(output, `${width}-${theme}-failure.html`), await page.content());
        await page.screenshot({ path: path.join(output, `${width}-${theme}-failure.png`) }).catch(() => {});
        console.error(`FAIL details ${width}/${theme}: ${error.message}`);
      } finally { results.push(result); await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ syntheticOnly: true, actualApp: true, results }, null, 2)); }
  assert.ok(results.every(row => row.passed), `Report details checks failed; see ${path.join(output, "results.json")}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
