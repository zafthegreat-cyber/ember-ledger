const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5271/");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Synthetic screenshot reports must only run locally");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/stock-screenshot-import");
fs.mkdirSync(output, { recursive: true });
const widths = (process.env.QA_SCREENSHOT_WIDTHS || "320,390,1440").split(",").map(Number);
const themes = process.env.QA_SCREENSHOT_THEME ? [process.env.QA_SCREENSHOT_THEME] : ["light", "dark"];
const cases = widths.flatMap((width) => themes.map((theme) => ({ width, height: width === 320 ? 568 : width === 390 ? 844 : 900, theme })));
const observed = "2026-09-15T10:30";
const privateMarker = "PRIVATE_AUTHOR_SYNTHETIC";
const northId = "screenshot-fixture-north";

async function snapshot(page) {
  return page.evaluate(() => {
    const scout = JSON.parse(localStorage.getItem("et-tcg-beta-scout"));
    const data = JSON.parse(localStorage.getItem("et-tcg-beta-data"));
    return { stores: scout.stores, reports: scout.reports, scoutItems: scout.items, items: data.items, sales: data.sales, expenses: data.expenses, catalog: data.catalogProducts };
  });
}

async function presentation(page, modal, result, label) {
  const controls = await modal.locator("button,input,select,textarea,summary").filter({ visible: true }).evaluateAll((elements) => elements.map((element) => {
    const target = element.type === "checkbox" ? element.closest("label") || element : element;
    const rect = target.getBoundingClientRect();
    return { name: element.getAttribute("aria-label") || element.textContent.trim().slice(0, 55) || element.type || element.tagName, width: rect.width, height: rect.height, x: rect.x, right: rect.right };
  }));
  const metrics = await modal.evaluate((dialog) => {
    const body = dialog.querySelector(".flow-modal-body");
    return { dialogOverflow: dialog.scrollWidth - dialog.clientWidth, bodyOverflow: body.scrollWidth - body.clientWidth, pageOverflow: document.documentElement.scrollWidth - window.innerWidth };
  });
  for (const [name, value] of Object.entries(metrics)) assert.ok(value <= 1, `${label}: ${name} is ${value}px`);
  for (const control of controls) {
    assert.ok(control.width >= 44 && control.height >= 44, `${label}: ${control.name} target is ${control.width} x ${control.height}`);
    assert.ok(control.x >= -1 && control.right <= result.width + 1, `${label}: ${control.name} leaves viewport`);
  }
  result.presentation.push({ label, ...metrics, controlCount: controls.length });
  await modal.locator(".flow-modal-body").evaluate((element) => { element.scrollTop = 0; });
  await page.screenshot({ path: path.join(output, `${result.width}-${result.theme}-${label}.png`) });
}

async function makeScreenshot(page, theme) {
  const encoded = await page.evaluate(({ dark, privateMarker }) => {
    const canvas = document.createElement("canvas"); canvas.width = 1000; canvas.height = 750;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = dark ? "#232428" : "#ffffff"; ctx.fillRect(0, 0, 1000, 750);
    ctx.fillStyle = dark ? "#ffffff" : "#202124"; ctx.font = "bold 32px Arial";
    ctx.fillText(dark ? "Discord local stock alerts" : "Facebook local collectors", 32, 64);
    ctx.font = "28px Arial";
    [privateMarker, "Target - 1 Fixture North Way, Norfolk", "September 15, 2026 at 10:30 AM", "Pokemon Prismatic Evolutions ETBs", "Pokemon Prismatic Evolutions booster bundles", "In stock - purchase limit applies", "PRIVATE CONVERSATION: please keep this out"].forEach((line, index) => ctx.fillText(line, 32, 140 + index * 75));
    return canvas.toDataURL("image/png").split(",")[1];
  }, { dark: theme === "dark", privateMarker });
  return { name: `${theme === "dark" ? "discord" : "facebook"}-synthetic.png`, mimeType: "image/png", buffer: Buffer.from(encoded, "base64") };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const testCase of cases) {
      const context = await browser.newContext({ viewport: { width: testCase.width, height: testCase.height }, reducedMotion: "reduce", serviceWorkers: "block" });
      const result = { ...testCase, presentation: [], blockedWrites: [], blockedExternal: [], ocrExternal: [], ocrAssets: [], errors: [] };
      let phase = "startup";
      await context.route("**/*", (route) => {
        const request = route.request(); const url = new URL(request.url());
        if (!["GET", "HEAD"].includes(request.method())) { result.blockedWrites.push(`${request.method()} ${url.pathname}`); return route.abort(); }
        if (url.origin !== base.origin) { result.blockedExternal.push(url.origin); if (phase === "ocr") result.ocrExternal.push(url.origin); return route.abort(); }
        if (url.pathname.startsWith("/ocr/")) result.ocrAssets.push(url.pathname);
        if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
        return route.continue();
      });
      await context.addInitScript(({ theme, northId }) => {
        if (localStorage.getItem("__qa_screenshot_seeded")) return;
        localStorage.setItem("__qa_screenshot_seeded", "yes");
        localStorage.setItem("et-tcg-app-theme", theme);
        localStorage.setItem("et-tcg-beta-data", JSON.stringify({
          items: [{ id: "keep-screenshot-card", name: "Preserved collection card", quantity: 3, purpose: "personal_collection", marketValue: 21.75 }],
          sales: [{ id: "keep-screenshot-sale", itemName: "Preserved sale", salePrice: 12.5 }],
          expenses: [{ id: "keep-screenshot-expense", vendor: "Preserved expense vendor", notes: "Preserved expense notes", amount: 4.5, category: "Supplies" }],
          catalogProducts: [{ id: "keep-screenshot-catalog", name: "Fixture Aurora Booster Bundle", productName: "Fixture Aurora Booster Bundle", productType: "Booster Bundle", productKind: "sealed", setName: "Fixture Aurora", sourceType: "manual", marketValue: 37.25, imageUrl: "/assets/brand/code3tcg-app-icon.svg" }],
        }));
        localStorage.setItem("et-tcg-beta-scout", JSON.stringify({ stores: [
          { id: northId, name: "North Collectibles", nickname: "North Collectibles", retailer: "Target", chain: "Target", city: "Norfolk", state: "VA", address: "1 Fixture North Way", zip: "23510" },
          { id: "screenshot-fixture-south", name: "South Collectibles", nickname: "South Collectibles", retailer: "Target", chain: "Target", city: "Norfolk", state: "VA", address: "2 Fixture South Way", zip: "23510" },
        ], reports: [{ id: "keep-screenshot-report", storeId: "screenshot-fixture-south", storeName: "South Collectibles", productName: "Preserved restock report", note: "Keep this report", reportedAt: "2026-09-14T13:00:00.000Z", stockStatus: "in_stock" }], items: [{ id: "keep-screenshot-sighting", storeId: northId, name: "Preserved tracked pack" }], dropRadarSeedDisabled: true }));
      }, { theme: testCase.theme, northId });
      const page = await context.newPage(); page.setDefaultTimeout(12000);
      page.on("pageerror", (error) => result.errors.push(error.message));
      page.on("dialog", (dialog) => dialog.accept());
      try {
        await page.goto(new URL(`/?betaLocalMode=true&themeInspect=${testCase.theme}`, base).href);
        const opener = page.locator(".home-restock-hero").getByRole("button", { name: "Report a restock", exact: true });
        await expect(opener).toBeVisible({ timeout: 45000 });
        // Let the app's ordinary, deferred local catalog hydration finish
        // before checking screenshot actions against a stable baseline.
        await page.getByRole("button", { name: "Open global Add menu", exact: true }).filter({ visible: true }).first().click();
        await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem("et-tcg-beta-data")).catalogProducts || []).some((row) => row.id === "sealed-pokemon-3-pack-blister-assorted")), { timeout: 30000 }).toBe(true);
        await page.keyboard.press("Escape");
        await expect(page.locator('.flow-modal[data-flow="addActionSheet"]')).toHaveCount(0);
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const original = await snapshot(page);
        assert.ok(original.items.some((item) => item.id === "keep-screenshot-card"));
        assert.ok(original.reports.some((report) => report.id === "keep-screenshot-report"));
        assert.equal(original.items.find((item) => item.id === "keep-screenshot-card").quantity, 3);
        assert.equal(original.items.find((item) => item.id === "keep-screenshot-card").marketValue, 21.75);
        assert.equal(original.sales.find((sale) => sale.id === "keep-screenshot-sale").salePrice, 12.5);
        assert.equal(original.expenses.find((expense) => expense.id === "keep-screenshot-expense").amount, 4.5);
        assert.equal(original.expenses.find((expense) => expense.id === "keep-screenshot-expense").vendor, "Preserved expense vendor");
        assert.equal(original.expenses.find((expense) => expense.id === "keep-screenshot-expense").notes, "Preserved expense notes");
        assert.equal(original.catalog.find((product) => product.id === "keep-screenshot-catalog").marketValue, 37.25);
        await opener.click();
        const modal = page.locator('.flow-modal[data-flow="scoutSubmit"]');
        const intake = modal.locator(".stock-screenshot-intake");
        await intake.getByRole("button", { name: /^Use a screenshot/ }).click();
        const fileInput = intake.locator('input[type="file"]');
        assert.equal(await fileInput.getAttribute("capture"), null, "Screenshot picker must not force the camera");
        await expect(intake.getByLabel(/^Exact store/)).toHaveValue("");
        await expect(intake.getByLabel("When was the stock seen?", { exact: false })).toHaveValue("");
        await intake.getByLabel(/^Post source/).selectOption(testCase.theme === "dark" ? "discord" : "facebook");
        const fixture = await makeScreenshot(page, testCase.theme);
        fs.writeFileSync(path.join(output, `${testCase.width}-${testCase.theme}-source-fixture.png`), fixture.buffer);
        phase = "ocr";
        await fileInput.setInputFiles(fixture);
        await expect(intake.getByText("Text read. Check the suggestions below before using them.", { exact: true })).toBeVisible({ timeout: 90000 });
        phase = "review";
        await intake.getByText("Paste or correct post text", { exact: true }).click();
        await expect(intake.getByLabel(/^Private screenshot text/)).toHaveValue(/Prismatic Evolutions/);
        await expect(intake.getByLabel(/^Products mentioned/)).toHaveValue(/Prismatic Evolutions/);
        await expect(intake.getByLabel(/^Product category/)).toHaveValue("Pokemon TCG");
        await expect(intake.getByLabel(/^Stock status in the post/)).toHaveValue("stock_on_shelf");
        await expect(intake.getByLabel(/^Exact store/)).toHaveValue("");
        await expect(intake.getByLabel("When was the stock seen?", { exact: false })).toHaveValue("");
        assert.deepEqual(await snapshot(page), original, "Uploading and OCR must not save a report or alter records");
        await presentation(page, modal, result, "screenshot-read");
        const apply = intake.getByRole("button", { name: "Use reviewed details", exact: true });
        await apply.click();
        await expect(intake.getByRole("alert")).toContainText(/Confirm when the stock/);
        await intake.getByLabel("When was the stock seen?", { exact: false }).fill(observed);
        await apply.click();
        await expect(intake.getByRole("alert")).toContainText(/exact store/);
        await intake.getByLabel(/^Exact store/).selectOption(northId);
        if (testCase.width === 320) {
          await modal.locator(".scout-report-wizard").evaluate((form) => {
            const nodes = [...form.querySelectorAll("h3,h4,p,label,button,strong,span,small,summary,input,select,textarea,li")];
            window.__qaScreenshotText200 = nodes.map((node) => [node, node.style.getPropertyValue("font-size"), node.style.getPropertyPriority("font-size")]);
            const sizes = nodes.map((node) => parseFloat(getComputedStyle(node).fontSize));
            nodes.forEach((node, index) => node.style.setProperty("font-size", `${sizes[index] * 2}px`, "important"));
          });
          await presentation(page, modal, result, "screenshot-text-200");
          await page.evaluate(() => { for (const [node, value, priority] of window.__qaScreenshotText200) value ? node.style.setProperty("font-size", value, priority) : node.style.removeProperty("font-size"); delete window.__qaScreenshotText200; });
          result.text200Verified = true;
        }
        await apply.click();
        await expect(intake.getByRole("status")).toContainText("Reviewed details added");
        await expect(modal.locator(".scout-where-step")).toContainText("North Collectibles");
        await expect(modal.locator(".stock-report-observed-summary")).toContainText("2026-09-15");
        assert.deepEqual(await snapshot(page), original, "Applying reviewed details only edits the draft");
        await modal.getByRole("button", { name: "Continue", exact: true }).filter({ visible: true }).click();
        const details = modal.locator(".scout-proof-step");
        await expect(details).toBeVisible();
        await expect(details.getByLabel("Product name (optional)", { exact: true })).toHaveValue(/Prismatic Evolutions/);
        await expect(details.getByRole("button", { name: /^Stock seen/ })).toHaveAttribute("aria-pressed", "true");
        // A later status/source selection must not turn secondhand screenshot
        // evidence into a verified first-person sighting.
        await details.getByRole("button", { name: /^Low stock/ }).click();
        const howKnow = details.getByRole("group", { name: "How you know this report", exact: true });
        await expect(howKnow).toBeVisible();
        await howKnow.getByRole("button", { name: "No proof", exact: true }).click();
        await modal.getByRole("button", { name: "Review report", exact: true }).filter({ visible: true }).click();
        await expect(modal.getByRole("heading", { name: "Ready to share this report?", exact: true })).toBeVisible();
        await expect(modal.locator(".stock-report-source-note")).toContainText("needs review");
        await expect(modal.locator(".stock-report-source-note")).toContainText(testCase.theme === "dark" ? "Discord" : "Facebook");
        const sharing = modal.locator(".stock-report-sharing-disclosure");
        await sharing.locator("summary").click();
        await expect(sharing.getByRole("combobox")).toHaveValue("private_from_map");
        await expect(sharing).toContainText("Needs review");
        await presentation(page, modal, result, "private-review");
        assert.deepEqual(await snapshot(page), original, "Final review cannot save or upload anything");
        const save = modal.getByRole("button", { name: "Save Report", exact: true }).filter({ visible: true });
        await save.focus();
        assert.ok(await save.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth) >= 2), "Save needs visible keyboard focus");
        await save.evaluate((button) => { button.click(); button.click(); });
        await expect(modal.locator(".scout-quick-report-success")).toBeVisible();
        const saved = await snapshot(page);
        assert.equal(saved.reports.length, original.reports.length + 1, "Only final save creates exactly one report");
        const record = saved.reports.find((report) => !original.reports.some((old) => old.id === report.id));
        assert.equal(record.storeId, northId);
        assert.equal(record.reportDate, "2026-09-15"); assert.equal(record.reportTime, "10:30");
        assert.equal(record.stockStatus, "low_stock");
        assert.equal(record.sourceType, "text_screenshot"); assert.equal(record.proofType, "text_screenshot");
        assert.equal(record.screenshotImportReviewed, true);
        assert.equal(record.screenshotSourcePlatform, testCase.theme === "dark" ? "discord" : "facebook");
        assert.equal(record.visibility, "private_from_map"); assert.equal(record.verified, false);
        assert.equal(record.needsReview, true); assert.equal(record.verificationStatus, "needs_review");
        assert.equal(record.confidenceScore, 26); assert.equal(record.shouldTrainPredictions, false);
        assert.deepEqual(record.photoUrls, []);
        for (const key of ["sourceText", "rawSourceText", "source_text", "raw_source_text", "scoutScanPhotoUrl", "screenshotFileName"]) assert.ok(!record[key], `${key} must stay out of the saved report`);
        assert.ok(!JSON.stringify(saved).includes(privateMarker), "Raw private screenshot text must not persist");
        assert.ok(!JSON.stringify(record).includes("PRIVATE CONVERSATION"));
        assert.ok(!JSON.stringify(record).includes("blob:"));
        for (const key of ["stores", "scoutItems", "items", "sales", "expenses", "catalog"]) assert.deepEqual(saved[key], original[key], `${key} preserved`);
        assert.deepEqual(saved.reports.find((report) => report.id === "keep-screenshot-report"), original.reports.find((report) => report.id === "keep-screenshot-report"));
        await modal.locator(".flow-modal-footer--scout-inline").getByRole("button", { name: "Done", exact: true }).click();
        await expect(modal).toHaveCount(0);
        if (testCase.width === 390 && testCase.theme === "light") {
          const savedBeforeEntries = await snapshot(page);
          const addOpener = page.getByRole("button", { name: "Open global Add menu", exact: true }).filter({ visible: true }).first();
          for (const entry of ["direct", "scan-anything"]) {
            await addOpener.click();
            const addModal = page.locator('.flow-modal[data-flow="addActionSheet"]');
            const entryButton = addModal.getByRole("button", { name: entry === "direct" ? /^Review a restock screenshot before saving/ : /^Scan (Listing|or review)\./ });
            if (!(await entryButton.isVisible())) await addModal.locator(".add-anything-more > summary").click();
            await entryButton.click();
            if (entry === "scan-anything") {
              await expect(addModal.locator(".add-anything-scan-foundation")).toBeVisible();
              await addModal.getByRole("button", { name: /^Scout screenshot or photo review\./ }).click();
            }
            await expect(modal).toBeVisible();
            await expect(modal.locator(".stock-screenshot-panel")).toBeVisible();
            await expect(page.locator('.flow-modal[data-flow="addActionSheet"]')).toHaveCount(0);
            await expect(page.locator(".add-anything-scout-scan-review")).toHaveCount(0);
            await expect(modal.locator('input[type="file"]').first()).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
            assert.deepEqual(await snapshot(page), savedBeforeEntries, `${entry}: opening a screenshot draft cannot save records`);
            await modal.locator(".modal-close-button").click();
            await expect(modal).toHaveCount(0);
            assert.deepEqual(await snapshot(page), savedBeforeEntries, `${entry}: cancelling a screenshot draft preserves data`);
          }
          result.screenshotQuickEntries = ["global-add-review-screenshot", "scan-anything-screenshot"];
        }
        if (testCase.width === 390 && testCase.theme === "dark") {
          const afterSaved = await snapshot(page);
          await opener.click();
          await intake.getByRole("button", { name: /^Use a screenshot/ }).click();
          await intake.getByLabel(/^Products mentioned/).fill("Reviewer selected product");
          await intake.getByLabel(/^Product category/).selectOption("Magic: The Gathering");
          await intake.getByLabel(/^Stock status in the post/).selectOption("low_stock");
          await fileInput.setInputFiles({ name: "unsupported.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg></svg>") });
          await expect(intake.getByRole("alert")).toContainText("Choose a JPG, PNG, or WebP screenshot");
          await expect(intake.getByLabel(/^Products mentioned/)).toHaveValue("Reviewer selected product");
          await expect(intake.getByLabel(/^Product category/)).toHaveValue("Magic: The Gathering");
          await expect(intake.getByLabel(/^Stock status in the post/)).toHaveValue("low_stock");
          let pending = false;
          let release;
          const held = new Promise((resolve) => { release = resolve; });
          const holdModel = async (route) => { pending = true; await held; await route.abort().catch(() => {}); };
          await context.route("**/ocr/tesseract-7.0.0/lang/eng.traineddata.gz", holdModel);
          try {
            await fileInput.setInputFiles(fixture);
            await expect.poll(() => pending, { timeout: 15000 }).toBe(true);
            await intake.getByRole("button", { name: "Cancel text reading", exact: true }).click();
            await expect(intake.getByText("Text reading stopped. You can paste text or enter the details.", { exact: true })).toBeVisible();
            await expect(intake.getByRole("button", { name: "Cancel text reading", exact: true })).toHaveCount(0);
            await expect.poll(() => page.workers().length, { timeout: 3000 }).toBe(0);
          } finally { release(); await context.unroute("**/ocr/tesseract-7.0.0/lang/eng.traineddata.gz", holdModel); }
          await expect(intake.getByLabel(/^Products mentioned/)).toHaveValue("Reviewer selected product");
          await expect(intake.getByLabel(/^Product category/)).toHaveValue("Magic: The Gathering");
          await expect(intake.getByLabel(/^Stock status in the post/)).toHaveValue("low_stock");
          const privateText = intake.getByLabel(/^Private screenshot text/);
          if (!(await privateText.isVisible())) await intake.getByText("Paste or correct post text", { exact: true }).click();
          await privateText.fill("Target Norfolk\nPokemon Prismatic Evolutions ETBs in stock\nPRIVATE_AUTHOR_SYNTHETIC");
          await intake.getByRole("button", { name: "Find report details", exact: true }).click();
          await expect(intake.getByLabel(/^Products mentioned/)).toHaveValue("Reviewer selected product");
          await expect(intake.getByLabel(/^Product category/)).toHaveValue("Magic: The Gathering");
          await expect(intake.getByLabel(/^Stock status in the post/)).toHaveValue("low_stock");
          assert.deepEqual(await snapshot(page), afterSaved, "Cancelled OCR, invalid replacement and manual paste never save or alter records");
          await modal.locator(".modal-close-button").click();
          await expect(modal).toHaveCount(0);
          result.manualReviewPreserved = true;
          result.cancelledOcrNeverSaves = true;
        }
        assert.deepEqual(result.ocrExternal, []); assert.deepEqual(result.blockedWrites, []); assert.deepEqual(result.errors, []);
        assert.ok(result.ocrAssets.some((asset) => asset.endsWith("eng.traineddata.gz")));
        result.savedRecord = { id: record.id, storeId: record.storeId, sourceType: record.sourceType, visibility: record.visibility, needsReview: record.needsReview, observedAt: record.observedAt };
        result.passed = true;
        console.log(`PASS stock screenshot ${testCase.width} ${testCase.theme}: genuine OCR, review guards, private provenance, final-only save, original data/prices retained`);
      } catch (error) {
        result.passed = false; result.error = error.message;
        fs.writeFileSync(path.join(output, `${testCase.width}-${testCase.theme}-failure.html`), await page.content());
        await page.screenshot({ path: path.join(output, `${testCase.width}-${testCase.theme}-failure.png`) }).catch(() => {});
        console.error(`FAIL stock screenshot ${testCase.width} ${testCase.theme}: ${error.message}`);
      } finally { results.push(result); await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2)); }
  assert.ok(results.every((result) => result.passed), `Stock screenshot app checks failed: ${path.join(output, "results.json")}`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
