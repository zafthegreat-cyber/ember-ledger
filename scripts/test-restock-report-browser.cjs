const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5242/");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Synthetic restock checks must run locally");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/restock-report");
fs.mkdirSync(output, { recursive: true });
const widths = (process.env.QA_RESTOCK_WIDTHS || "320,390,1440").split(",").map(Number);
const cases = widths.flatMap(width => ["light", "dark"].filter(theme => !process.env.QA_RESTOCK_THEME || theme === process.env.QA_RESTOCK_THEME).map(theme => ({ width, height: width === 320 ? 568 : width === 390 ? 844 : 900, theme })));
const fixtureCatalogName = "Fixture Aurora Booster Bundle";
const fixturePhoto = {
  name: "synthetic-shelf-proof.png",
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQEBAO5W6AMAAAAASUVORK5CYII=", "base64"),
};

async function assertStepFocus(page, modal, label, result) {
  const heading = modal.locator(".scout-report-step-card.active h3").first();
  await expect(heading).toBeVisible();
  // The dialog's existing focus helper also runs in an animation frame. Check
  // the settled target, so a competing effect cannot silently steal focus.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(heading).toBeFocused();
  await expect.poll(() => modal.locator(".flow-modal-body").evaluate(element => element.scrollTop)).toBeLessThanOrEqual(1);
  result.stepFocusChecks.push(label);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const scout = JSON.parse(localStorage.getItem("et-tcg-beta-scout"));
    const data = JSON.parse(localStorage.getItem("et-tcg-beta-data"));
    return { stores: scout.stores, reports: scout.reports, items: scout.items, collection: data.items, sales: data.sales, expenses: data.expenses, catalog: data.catalogProducts };
  });
}

async function openDisclosure(disclosure) {
  if (!(await disclosure.evaluate(element => element.open))) await disclosure.locator(":scope > summary").click();
  await expect(disclosure).toHaveAttribute("open", "");
}

async function checkStartChoices(modal, result) {
  const choices = modal.locator(".stock-report-start-options > button");
  await expect(choices).toHaveCount(2);
  const metrics = await choices.evaluateAll(elements => {
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    const color = value => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1);
      const values = [...context.getImageData(0, 0, 1, 1).data];
      return [...values.slice(0, 3), values[3] / 255];
    };
    const over = (front, back) => front.slice(0, 3).map((channel, index) => channel * front[3] + back[index] * (1 - front[3]));
    const background = node => {
      const chain = []; for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) chain.unshift(ancestor);
      return chain.reduce((back, element) => over(color(getComputedStyle(element).backgroundColor), back), [255, 255, 255]);
    };
    const luminance = channels => channels.map(channel => { const value = channel / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
    return elements.map(button => {
      const rect = button.getBoundingClientRect();
      return { label: button.textContent.trim(), width: rect.width, height: rect.height, selected: button.getAttribute("aria-pressed"), text: [...button.querySelectorAll("strong, span")].filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden").map(node => {
        const back = background(node); const front = over(color(getComputedStyle(node).color), back);
        const a = luminance(front); const b = luminance(back);
        return { label: node.textContent.trim(), ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), foreground: getComputedStyle(node).color, background: back };
      }) };
    });
  });
  for (const choice of metrics) {
    assert.ok(choice.width >= 44 && choice.height >= 44, `${choice.label}: source choice has a usable touch target`);
    assert.ok(choice.text.length, `${choice.label}: readable source label is visible`);
    for (const text of choice.text) assert.ok(text.ratio >= 4.5, `${choice.label}: ${text.label} has readable contrast (${text.ratio.toFixed(2)})`);
  }
  assert.equal(metrics.filter(choice => choice.selected === "true").length, 1, "Exactly one report source is selected");
  result.sourceChoices = metrics;
}

async function checkPresentation(page, modal, name, result) {
  const body = modal.locator(".flow-modal-body");
  const footer = modal.locator(".flow-modal-footer--scout-inline");
  await expect(footer).toBeVisible();
  const metrics = await modal.evaluate(dialog => {
    const visible = element => {
      if (!element.getClientRects().length || getComputedStyle(element).visibility === "hidden") return false;
      // Chromium can return layout rectangles for descendants of closed details.
      // Measure only visible summaries and controls, including nested disclosures.
      for (let ancestor = element.parentElement; ancestor && ancestor !== dialog; ancestor = ancestor.parentElement) {
        if (ancestor.tagName === "DETAILS" && !ancestor.open && !ancestor.querySelector(":scope > summary")?.contains(element)) return false;
      }
      return true;
    };
    const rect = element => { const value = element.getBoundingClientRect(); return { x: value.x, y: value.y, width: value.width, height: value.height, right: value.right, bottom: value.bottom }; };
    const foot = dialog.querySelector(".flow-modal-footer--scout-inline");
    const bodyElement = dialog.querySelector(".flow-modal-body");
    return {
      overflow: Math.max(dialog.scrollWidth - dialog.clientWidth, bodyElement.scrollWidth - bodyElement.clientWidth),
      controls: [...dialog.querySelectorAll("button, input, select, summary")].filter(visible).map(element => ({ name: element.textContent.trim() || element.type, ...rect(element) })),
      footer: rect(foot), body: rect(bodyElement), header: rect(dialog.querySelector(".modal-title-row")),
      choices: [...dialog.querySelectorAll(".scout-report-choice-card")].filter(visible).map(element => ({ label: element.querySelector("strong").textContent, row: rect(element), title: rect(element.querySelector("strong")), helper: rect(element.querySelector(":scope > span")) })),
      overflowElements: [...bodyElement.querySelectorAll("*")].filter(visible).filter(element => element.clientWidth && element.scrollWidth - element.clientWidth > 1).map(element => ({ className: element.className, tag: element.tagName, overflow: element.scrollWidth - element.clientWidth, text: element.textContent.slice(0, 70) })),
    };
  });
  result.presentation[name] = metrics;
  assert.ok(metrics.overflow <= 1, `${name}: no horizontal overflow (${metrics.overflow}px)`);
  assert.ok(metrics.header.y >= -1 && metrics.footer.bottom <= result.height + 1, `${name}: header and actions stay in the viewport`);
  assert.ok(metrics.body.bottom <= metrics.footer.y + 1, `${name}: body clears the fixed action bar`);
  for (const control of metrics.controls) {
    if (control.name === "checkbox") continue;
    assert.ok(control.width >= 44 && control.height >= 44, `${name}: ${control.name} has a 44px target (${control.width}x${control.height})`);
    assert.ok(control.x >= -1 && control.right <= result.width + 1, `${name}: ${control.name} stays inside viewport`);
  }
  for (const choice of metrics.choices) {
    assert.ok(choice.helper.y >= choice.title.bottom - 1, `${choice.label}: description sits below title`);
    assert.ok(choice.helper.right <= choice.row.right + 1, `${choice.label}: description stays in card`);
  }
  const before = await modal.locator(".modal-close-button").boundingBox();
  await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const after = await modal.locator(".modal-close-button").boundingBox();
  assert.equal(before.y, after.y, "Close stays fixed while the body scrolls");
  await body.evaluate(element => { element.scrollTop = 0; });
  if (name === "catalog-matches") await modal.locator(".scout-report-catalog-matches").scrollIntoViewIfNeeded();
  if (name === "catalog-selected") await modal.locator(".scout-report-catalog-selection").scrollIntoViewIfNeeded();
  if (name === "proof-photo") await modal.locator(".scout-photo-preview").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, `${result.width}-${result.theme}-${name}.png`) });
  await body.evaluate(element => { element.scrollTop = 0; });
  result.presentation[name] = metrics;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const testCase of cases) {
      const { width, height, theme } = testCase;
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
      const blockedWrites = [];
      const blockedExternal = [];
      const catalogLookupRequests = [];
      let checkingCatalog = false;
      await context.route("**/*", route => {
        const request = route.request(); const url = new URL(request.url());
        if (!["GET", "HEAD"].includes(request.method())) { blockedWrites.push(`${request.method()} ${url.pathname}`); return route.abort(); }
        if (checkingCatalog && (url.pathname.startsWith("/api/") || url.pathname.startsWith("/rest/v1/"))) catalogLookupRequests.push(`${request.method()} ${url.pathname}`);
        if (url.origin !== base.origin) { blockedExternal.push(url.origin); return route.abort(); }
        if (url.pathname === "/__qa-broken-catalog.png") return route.fulfill({ status: 404, body: "Synthetic unavailable reference image" });
        if (url.pathname.endsWith("/sealedProducts.json") && request.resourceType() === "fetch") return route.fulfill({ contentType: "application/json", body: JSON.stringify([{ id: "restock-fixture-warm-catalog", productName: "Synthetic catalog hydration marker", productType: "Supply", sourceType: "manual", marketValue: 19.75 }]) });
        if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
        return route.continue();
      });
      await context.addInitScript(({ theme, fixtureCatalogName }) => {
        if (localStorage.getItem("__qa_restock_seeded")) return;
        localStorage.setItem("__qa_restock_seeded", "true");
        localStorage.setItem("et-tcg-app-theme", theme);
        localStorage.setItem("et-tcg-beta-data", JSON.stringify({ items: [{ id: "retained-card", name: "Retained collection card", quantity: 3 }], sales: [], expenses: [], catalogProducts: [
          { id: "restock-fixture-catalog", name: fixtureCatalogName, productName: fixtureCatalogName, productType: "Booster Bundle", productKind: "sealed", setName: "Fixture Aurora", imageUrl: "/assets/brand/code3tcg-app-icon.svg", sourceType: "manual", marketValue: 37.25 },
          { id: "restock-fixture-catalog-other", name: "Fixture Aurora Collector Tin", productName: "Fixture Aurora Collector Tin", productType: "Tin", productKind: "sealed", setName: "Fixture Aurora", imageUrl: "/__qa-broken-catalog.png", sourceType: "manual", marketValue: 14.5 },
        ] }));
        localStorage.setItem("et-tcg-beta-scout", JSON.stringify({
          stores: [
            { id: "restock-fixture-north", name: "North Collectibles", nickname: "North Collectibles", retailer: "Target", chain: "Target", city: "Norfolk", state: "VA", address: "1 Fixture North Way", zip: "23510" },
            { id: "restock-fixture-south", name: "South Collectibles", nickname: "South Collectibles", retailer: "Target", chain: "Target", city: "Norfolk", state: "VA", address: "2 Fixture South Way", zip: "23510" },
          ],
          reports: [{ id: "retained-observation", storeId: "restock-fixture-south", storeName: "South Collectibles", productName: "Retained pack observation", note: "Keep this existing report", reportedAt: "2026-09-14T13:00:00.000Z", stockStatus: "in_stock" }],
          items: [{ id: "retained-sighting", storeId: "restock-fixture-south", name: "Retained tracked pack" }], dropRadarSeedDisabled: true,
        }));
      }, { theme, fixtureCatalogName });
      const page = await context.newPage(); const errors = [];
      page.setDefaultTimeout(10000);
      page.on("pageerror", error => errors.push(error.message));
      page.on("dialog", dialog => dialog.accept());
      const result = { ...testCase, presentation: {}, stepFocusChecks: [], blockedWrites, blockedExternal, catalogLookupRequests };
      try {
        await page.goto(new URL(`/?betaLocalMode=true&themeInspect=${theme}`, base).href);
        const homeReport = page.locator(".home-restock-hero").getByRole("button", { name: "Report a restock", exact: true });
        await expect(homeReport).toBeVisible({ timeout: 30000 });
        await homeReport.click();
        const entryModal = page.locator('.flow-modal[data-flow="scoutSubmit"]');
        await expect(entryModal.locator(".scout-where-step")).toBeVisible();
        await entryModal.locator(".modal-close-button").focus();
        await page.keyboard.press("Escape");
        await expect(entryModal).toHaveCount(0);
        await page.getByRole("button", { name: "Open global Add menu", exact: true }).filter({ visible: true }).first().click();
        // Let the existing deferred catalog hydration settle before taking the
        // exact preservation baseline; loading the Add menu warms this data.
        await expect.poll(() => page.evaluate(() => {
          const catalog = JSON.parse(localStorage.getItem("et-tcg-beta-data")).catalogProducts || [];
          return {
            warm: catalog.some(row => row.id === "restock-fixture-warm-catalog"),
            bundlePrice: catalog.find(row => row.id === "restock-fixture-catalog")?.marketValue,
            tinPrice: catalog.find(row => row.id === "restock-fixture-catalog-other")?.marketValue,
          };
        }), { timeout: 30000 }).toEqual({ warm: true, bundlePrice: 37.25, tinPrice: 14.5 });
        await page.getByRole("button", { name: "Report a restock. Share what you saw at a store.", exact: true }).click();
        await expect(entryModal.locator(".scout-where-step")).toBeVisible();
        await entryModal.locator(".modal-close-button").click();
        await expect(entryModal).toHaveCount(0);
        result.homeAndAddEntry = true;
        await page.goto(new URL(`/scout/stores/restock-fixture-north?betaLocalMode=true&themeInspect=${theme}`, base).href);
        await expect(page.getByRole("heading", { name: "North Collectibles", exact: true }).first()).toBeVisible({ timeout: 30000 });
        const original = await snapshot(page);
        await page.getByRole("button", { name: "Submit Report", exact: true }).first().click();
        const modal = page.locator('.flow-modal[data-flow="scoutSubmit"]');
        await expect(modal).toBeVisible();
        await assertStepFocus(page, modal, "initial store", result);
        await checkStartChoices(modal, result);
        await expect(modal.locator(".scout-report-step-pill")).toHaveCount(3);
        await expect(modal.locator(".scout-flow-guidance-card")).toHaveCount(0);
        const continueButton = modal.getByRole("button", { name: "Continue", exact: true });
        await expect(continueButton).toHaveCount(1);
        const next = () => continueButton.filter({ visible: true });
        const observed = modal.locator('input[type="datetime-local"]');
        const observedTime = await page.evaluate(() => { const date = new Date(Date.now() - 3600000); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); });
        await openDisclosure(modal.locator(".stock-report-time-disclosure"));
        await observed.fill(observedTime);
        await checkPresentation(page, modal, "store", result);

        if (width === 320 && theme === "dark") {
          const future = await page.evaluate(() => { const date = new Date(Date.now() + 172800000); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); });
          await observed.fill(future); await next().click();
          await expect(modal.locator(".scout-where-step")).toBeVisible();
          await expect(modal.locator(".form-error").first()).toBeVisible();
          await expect(modal.getByRole("alert").first()).toBeVisible();
          await observed.fill(observedTime);
          await modal.getByRole("button", { name: "Change store", exact: true }).click();
          await modal.getByLabel("Find your store", { exact: true }).fill("No matching fixture location");
          await modal.getByRole("button", { name: "Can't find store?", exact: true }).click();
          await modal.getByPlaceholder("Store name, city, or general location", { exact: true }).fill("Fixture Corner Shop, Norfolk VA");
          await next().click();
          await expect(modal.locator(".form-error").first()).toContainText("Confirm the manual store/location");
          await expect(modal.getByRole("alert").first()).toContainText("Confirm the manual store/location");
          await modal.getByRole("checkbox").check();
          await next().click();
          await expect(modal.locator(".scout-proof-step")).toBeVisible();
          await modal.getByRole("button", { name: "Back", exact: true }).filter({ visible: true }).click();
          await expect(observed).toHaveValue(observedTime);
          await modal.getByRole("button", { name: "Change store", exact: true }).click();
          await modal.getByLabel("Find your store", { exact: true }).fill("North Collectibles");
          await modal.locator(".scout-report-store-card--result").filter({ hasText: "North Collectibles" }).getByRole("button", { name: "Select store", exact: true }).click();
          result.dateAndManualGuards = true;
        }
        await next().click();
        await expect(modal.getByRole("heading", { name: "What did you see?", exact: true })).toBeVisible();
        await assertStepFocus(page, modal, "store to shelf details", result);
        await expect(modal.getByRole("group", { name: "Shelf status", exact: true }).getByRole("button")).toHaveCount(4);
        await expect(modal.locator(".scout-proof-disclosure")).not.toHaveAttribute("open", "");
        const observations = modal.getByText("Other shelf observations", { exact: true });
        await observations.click();
        await expect(modal.getByRole("group", { name: "Other shelf observations", exact: true }).getByRole("button")).toHaveCount(5);
        await modal.getByRole("button", { name: /^Behind counter/ }).click();
        await expect(modal.getByRole("button", { name: /^Behind counter/ })).toHaveAttribute("aria-pressed", "true");
        await modal.getByRole("button", { name: /^Low stock/ }).click();
        const categories = modal.getByRole("group", { name: /report item category/i }).getByRole("button");
        await categories.first().click();
        const productInput = modal.getByLabel("Product name (optional)", { exact: true });
        checkingCatalog = true;
        await openDisclosure(modal.locator(".stock-report-product-disclosure"));
        await productInput.fill("Fixture Aurora");
        await expect(productInput).toBeFocused();
        const matches = modal.getByRole("group", { name: "Catalog matches", exact: true });
        await expect(matches.getByRole("button", { name: `Use ${fixtureCatalogName}`, exact: true })).toBeVisible();
        const unavailableReference = matches.getByRole("button", { name: "Use Fixture Aurora Collector Tin", exact: true });
        await expect(unavailableReference.locator(".scout-report-catalog-placeholder")).toBeVisible();
        await expect(unavailableReference.locator("img")).toBeHidden();
        assert.ok(await matches.getByRole("button").count() <= 3, "Catalog suggestions stay compact");
        await checkPresentation(page, modal, "catalog-matches", result);
        await matches.getByRole("button", { name: "Use Fixture Aurora Collector Tin", exact: true }).click();
        const selection = modal.getByRole("article", { name: "Selected catalog product", exact: true });
        await expect(selection).toContainText("Fixture Aurora Collector Tin");
        await expect(selection.locator(".scout-report-catalog-placeholder")).toBeVisible();
        await expect(selection.locator("img")).toBeHidden();
        await expect(selection.locator("img")).toHaveAttribute("src", "/__qa-broken-catalog.png");
        await selection.getByRole("button", { name: "Clear match", exact: true }).click();
        await expect(selection).toHaveCount(0);
        await expect(productInput).toHaveValue("Fixture Aurora Collector Tin");
        await openDisclosure(modal.locator(".stock-report-product-disclosure"));
        await productInput.fill("Fixture Aurora");
        await matches.getByRole("button", { name: `Use ${fixtureCatalogName}`, exact: true }).click();
        await expect(selection).toContainText("Catalog reference image");
        await expect(selection.locator("img")).toHaveAttribute("src", "/assets/brand/code3tcg-app-icon.svg");
        await expect(selection.locator("img")).toBeVisible();
        await checkPresentation(page, modal, "catalog-selected", result);
        await modal.getByRole("button", { name: "Review report", exact: true }).filter({ visible: true }).click();
        await expect(modal.locator(".scout-report-review-grid").first()).toContainText(fixtureCatalogName);
        await modal.getByRole("button", { name: "Back", exact: true }).filter({ visible: true }).click();
        await expect(selection).toContainText(fixtureCatalogName);
        const changedCategory = await categories.nth(1).innerText();
        await categories.nth(1).click();
        await expect(selection).toHaveCount(0);
        await openDisclosure(modal.locator(".stock-report-product-disclosure"));
        await productInput.fill("");
        await modal.getByRole("button", { name: "Review report", exact: true }).filter({ visible: true }).click();
        await expect(modal.getByRole("heading", { name: "Ready to share this report?", exact: true })).toBeVisible();
        await expect(modal.locator(".scout-report-review-grid").first()).toContainText(changedCategory);
        await modal.getByRole("button", { name: "Back", exact: true }).filter({ visible: true }).click();
        await openDisclosure(modal.locator(".stock-report-product-disclosure"));
        await productInput.fill("Fixture Aurora");
        await matches.getByRole("button", { name: `Use ${fixtureCatalogName}`, exact: true }).click();
        await openDisclosure(modal.locator(".stock-report-product-disclosure"));
        await productInput.fill("Fixture booster bundle");
        await expect(selection).toHaveCount(0);
        const savedProductName = theme === "light" ? fixtureCatalogName : "Fixture booster bundle";
        if (theme === "light") {
          await openDisclosure(modal.locator(".stock-report-product-disclosure"));
          await productInput.fill("Fixture Aurora");
          await matches.getByRole("button", { name: `Use ${fixtureCatalogName}`, exact: true }).click();
        }
        checkingCatalog = false;
        assert.deepEqual(catalogLookupRequests, [], "Product matching uses the loaded catalog without API/provider lookups");
        assert.deepEqual(await snapshot(page), original, "Matching, category-only review, edits and Back do not write saved records");
        result.catalogSelectionAndFallback = true;
        await openDisclosure(modal.locator(".stock-report-notes-disclosure"));
        await modal.getByLabel("Useful details (optional)", { exact: true }).fill("Three bundles near customer service.");
        const notesInput = modal.locator(".scout-report-notes-field textarea");
        await expect(notesInput).toBeFocused();
        const proofDisclosure = modal.locator(".scout-proof-disclosure");
        await proofDisclosure.locator("summary").click();
        const proofText = proofDisclosure.getByLabel("Proof text or link", { exact: true });
        const sourceText = "Synthetic fixture shelf tag; no personal information.";
        await proofText.fill(sourceText);
        const proofSource = proofDisclosure.getByRole("group", { name: "How you know this report", exact: true });
        const sourceBeforePhoto = await proofSource.locator('[aria-pressed="true"]').innerText();
        const photoInput = proofDisclosure.locator('input[type="file"]');
        for (const attempt of ["first attach", "same file reselect"]) {
          await photoInput.setInputFiles(fixturePhoto);
          const preview = proofDisclosure.locator(".scout-photo-preview");
          await expect(preview.locator("img")).toHaveAttribute("src", /^data:image\/png;base64,/);
          await expect.poll(() => preview.locator("img").evaluate(image => image.naturalWidth)).toBe(1);
          await expect(proofText).toHaveValue(sourceText);
          if (attempt === "first attach") await checkPresentation(page, modal, "proof-photo", result);
          await preview.getByRole("button", { name: "Remove photo", exact: true }).click();
          await expect(preview).toHaveCount(0);
          await expect(photoInput).toHaveValue("");
          await expect(proofText).toHaveValue(sourceText);
          assert.equal(await proofSource.locator('[aria-pressed="true"]').innerText(), sourceBeforePhoto, `${attempt}: removing the photo keeps the source selection`);
          await expect(productInput).toHaveValue(savedProductName);
          await expect(modal.getByRole("button", { name: /^Low stock/ })).toHaveAttribute("aria-pressed", "true");
          assert.ok(await modal.evaluate(element => element.contains(document.activeElement)), `${attempt}: removing the photo keeps focus inside the dialog`);
          assert.deepEqual(await snapshot(page), original, `${attempt}: attaching/removing synthetic draft proof does not change saved data`);
        }
        result.photoRemovalAndSameFileReselect = true;
        await photoInput.setInputFiles(fixturePhoto);
        await expect(proofDisclosure.locator(".scout-photo-preview img")).toHaveAttribute("src", /^data:image\/png;base64,/);
        // Delay only this synthetic replacement's FileReader callback. Removing
        // the current photo must also invalidate that in-flight draft selection.
        await page.evaluate(() => {
          const RealFileReader = window.FileReader;
          window.__qaPhotoReader = { pending: false, restore: () => { window.FileReader = RealFileReader; } };
          window.FileReader = class extends RealFileReader {
            readAsDataURL(file) {
              const onload = this.onload;
              this.onload = event => {
                window.__qaPhotoReader.flush = () => onload?.call(this, event);
                window.__qaPhotoReader.pending = true;
              };
              super.readAsDataURL(file);
            }
          };
        });
        await photoInput.setInputFiles({ ...fixturePhoto, name: "synthetic-replacement-proof.png" });
        await expect.poll(() => page.evaluate(() => window.__qaPhotoReader.pending)).toBe(true);
        await proofDisclosure.getByRole("button", { name: "Remove photo", exact: true }).click();
        await expect(proofDisclosure.locator(".scout-photo-preview")).toHaveCount(0);
        await page.evaluate(() => { window.__qaPhotoReader.flush(); window.__qaPhotoReader.restore(); delete window.__qaPhotoReader; });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await expect(proofDisclosure.locator(".scout-photo-preview")).toHaveCount(0);
        await expect(photoInput).toHaveValue("");
        await expect(proofText).toHaveValue(sourceText);
        await expect(productInput).toHaveValue(savedProductName);
        await expect(notesInput).toHaveValue("Three bundles near customer service.");
        assert.deepEqual(await snapshot(page), original, "A removed, pending replacement cannot reattach proof or write saved data");
        await photoInput.setInputFiles(fixturePhoto);
        await expect(proofDisclosure.locator(".scout-photo-preview img")).toHaveAttribute("src", /^data:image\/png;base64,/);
        await proofDisclosure.getByRole("button", { name: "Remove photo", exact: true }).click();
        await expect(proofDisclosure.locator(".scout-photo-preview")).toHaveCount(0);
        result.pendingPhotoReplacementCancelled = true;
        await checkPresentation(page, modal, "details", result);
        if (width === 320 && theme === "dark") {
          await modal.locator(".scout-report-wizard").evaluate(form => {
            const styles = [...form.querySelectorAll("h3, h4, p, label, button, strong, span, small, summary")].map(node => [node, parseFloat(getComputedStyle(node).fontSize)]);
            for (const [node, size] of styles) node.style.setProperty("font-size", `${size * 2}px`, "important");
          });
          await checkPresentation(page, modal, "details-text200", result);
          await modal.locator(".scout-report-wizard").evaluate(form => { for (const node of form.querySelectorAll("[style]")) node.style.removeProperty("font-size"); });
          result.text200Verified = true;
        }
        await modal.getByRole("button", { name: "Review report", exact: true }).filter({ visible: true }).click();
        await expect(modal.getByRole("heading", { name: "Ready to share this report?", exact: true })).toBeVisible();
        await assertStepFocus(page, modal, "details to review", result);
        await expect(modal.getByText("1 Fixture North Way", { exact: false }).first()).toBeVisible();
        await expect(modal.getByRole("combobox", { name: "Who can see this report", exact: true })).toBeVisible();
        await checkPresentation(page, modal, "review", result);
        assert.deepEqual(await snapshot(page), original, "Reviewing a report cannot write any records");
        const editStore = modal.getByRole("button", { name: "Edit store and time", exact: true });
        const editDetails = modal.getByRole("button", { name: "Edit shelf status and products", exact: true });
        await expect(editStore).toHaveCount(1);
        await expect(editDetails).toHaveCount(1);
        await modal.locator(".flow-modal-body").evaluate(element => { element.scrollTop = element.scrollHeight; });
        await editStore.click();
        await expect(modal.locator(".scout-where-step")).toBeVisible();
        await assertStepFocus(page, modal, "review edit store", result);
        await expect(observed).toHaveValue(observedTime);
        await expect(modal.locator(".scout-where-step")).toContainText("North Collectibles");
        await next().click();
        await assertStepFocus(page, modal, "edited store to details", result);
        await expect(productInput).toHaveValue(savedProductName);
        await expect(notesInput).toHaveValue("Three bundles near customer service.");
        await expect(proofText).toHaveValue(sourceText);
        assert.equal(await proofSource.locator('[aria-pressed="true"]').innerText(), sourceBeforePhoto, "Editing store/time preserves the selected source");
        await modal.getByRole("button", { name: "Review report", exact: true }).filter({ visible: true }).click();
        await assertStepFocus(page, modal, "edited store back to review", result);
        for (const attempt of [1, 2]) {
          await modal.locator(".flow-modal-body").evaluate(element => { element.scrollTop = element.scrollHeight; });
          await editDetails.click();
          await assertStepFocus(page, modal, `review edit details ${attempt}`, result);
          await expect(productInput).toHaveValue(savedProductName);
          await expect(modal.getByRole("button", { name: /^Low stock/ })).toHaveAttribute("aria-pressed", "true");
          await expect(notesInput).toHaveValue("Three bundles near customer service.");
          await expect(proofText).toHaveValue(sourceText);
          assert.equal(await proofSource.locator('[aria-pressed="true"]').innerText(), sourceBeforePhoto, `Detail edit ${attempt} preserves the selected source`);
          if (theme === "light") await expect(selection).toContainText(fixtureCatalogName);
          else await expect(selection).toHaveCount(0);
          await modal.getByRole("button", { name: "Review report", exact: true }).filter({ visible: true }).click();
          await assertStepFocus(page, modal, `edited details back to review ${attempt}`, result);
          assert.deepEqual(await snapshot(page), original, `Contextual review edit ${attempt} keeps all saved records and prices untouched`);
        }
        result.contextualReviewEditsPreserveDraft = true;
        await modal.getByRole("button", { name: "Back", exact: true }).filter({ visible: true }).click();
        await assertStepFocus(page, modal, "review Back", result);
        await expect(modal.getByLabel("Product name (optional)", { exact: true })).toHaveValue(savedProductName);
        await expect(modal.getByRole("button", { name: /^Low stock/ })).toHaveAttribute("aria-pressed", "true");
        await modal.getByRole("button", { name: "Review report", exact: true }).filter({ visible: true }).click();
        await assertStepFocus(page, modal, "final review", result);
        const save = modal.getByRole("button", { name: "Save Report", exact: true }).filter({ visible: true });
        await save.focus();
        const focus = await save.evaluate(element => ({ outline: parseFloat(getComputedStyle(element).outlineWidth), bottom: element.getBoundingClientRect().bottom }));
        assert.ok(focus.outline >= 2 && focus.bottom <= height, "Save has a visible keyboard focus ring inside viewport");
        await save.evaluate(button => { button.click(); button.click(); });
        await expect(modal.locator(".scout-quick-report-success")).toBeVisible();
        await expect(modal.locator(".scout-quick-report-success")).toContainText("Saved locally");
        await expect(modal.locator(".scout-quick-report-success")).toContainText("It has not been posted to the community");
        await expect(modal.getByRole("button", { name: "Add details", exact: true })).toHaveCount(1);
        await expect(modal.getByRole("button", { name: "Done", exact: true })).toHaveCount(1);
        await expect(modal.locator(".scout-post-submit-actions")).toHaveCount(0);
        const saved = await snapshot(page);
        assert.equal(saved.reports.length, original.reports.length + 1, "Repeated save adds only one report");
        assert.equal(saved.reports.filter(report => report.productName === savedProductName).length, 1);
        const newReport = saved.reports.find(report => report.productName === savedProductName);
        assert.equal(newReport.catalogProductId, theme === "light" ? "restock-fixture-catalog" : "", "A manual name cannot retain a stale catalog ID");
        assert.equal(newReport.productImageUrl, theme === "light" ? "/assets/brand/code3tcg-app-icon.svg" : "", "A manual name cannot retain another product's reference image");
        assert.equal(newReport.photoUrl || "", "", "Catalog artwork is not report proof");
        assert.deepEqual(newReport.photoUrls, [], "Reference images are not saved as report photos");
        assert.equal(newReport.proofType, "manual", "Selecting artwork does not change the report's source");
        assert.equal(newReport.price, "", "Catalog matching does not import a price into the report");
        assert.deepEqual(saved.reports.find(report => report.id === "retained-observation"), original.reports.find(report => report.id === "retained-observation"));
        for (const key of ["stores", "items", "collection", "sales", "expenses", "catalog"]) assert.deepEqual(saved[key], original[key], `${key} are preserved`);
        await checkPresentation(page, modal, "saved", result);
        await modal.locator(".flow-modal-footer--scout-inline").getByRole("button", { name: "Done", exact: true }).click();
        await expect(modal).toHaveCount(0);
        assert.deepEqual(errors, [], "No browser runtime errors");
        result.passed = true;
        assert.deepEqual(blockedWrites, [], "Local draft editing, photo removal and saving make no provider writes");
        console.log(`PASS restock ${width} ${theme}: review edit shortcuts, settled step focus/scroll, synthetic proof removal/reselect, local catalog fallback, Back, guarded save and original records/prices preserved`);
      } catch (error) {
        result.passed = false; result.error = error.message; result.errors = errors;
        fs.writeFileSync(path.join(output, `${width}-${theme}-failure.html`), await page.content());
        await page.screenshot({ path: path.join(output, `${width}-${theme}-failure.png`) }).catch(() => {});
        console.error(`FAIL restock ${width} ${theme}: ${error.message}`);
      } finally { results.push(result); await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2)); }
  assert.ok(results.every(result => result.passed), `Restock browser checks failed; see ${path.join(output, "results.json")}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
