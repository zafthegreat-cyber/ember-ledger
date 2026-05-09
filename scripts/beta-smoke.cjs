const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const APP_URL = process.env.APP_URL || "http://127.0.0.1:5200/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1600 } });
  const results = [];

  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  async function step(name, fn) {
    try {
      await fn();
      results.push({ name, status: "PASS" });
      console.log(`PASS ${name}`);
    } catch (error) {
      results.push({ name, status: "FAIL", error: error.message });
      console.error(`FAIL ${name}: ${error.message}`);
      throw error;
    }
  }

  async function closeOpenModals() {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const modalCount = await page.locator(".location-modal-backdrop, .catalog-detail-backdrop, .drawer-backdrop").count();
      if (!modalCount) return;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
  }

  async function nav(label) {
    await closeOpenModals();
    await page.locator(".main-tabs button").filter({ hasText: new RegExp(`^${label}$`) }).click();
  }

  async function resetBetaData() {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.removeItem("et-tcg-beta-data");
      localStorage.removeItem("et-tcg-beta-scout");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      const sharedStore = {
        id: "shared-store-smoke-target",
        name: "Smoke Shared Target",
        chain: "Target",
        nickname: "Smoke Shared Target",
        address: "123 Verified Beta Way",
        city: "Suffolk",
        state: "VA",
        zip: "23434",
        region: "Hampton Roads / 757",
        phone: "757-555-0100",
        storeType: "Big Box",
        sellsPokemon: true,
        notes: "Seeded shared directory store for beta smoke testing.",
        status: "Unknown",
      };
      localStorage.setItem("et-tcg-beta-scout", JSON.stringify({
        stores: [sharedStore],
        reports: [],
        items: [],
        routes: [],
      }));
    });
  }

  async function fillByLabel(scope, label, value) {
    await scope.getByLabel(label, { exact: true }).fill(String(value));
  }

  async function overflowAction(scope, actionLabel) {
    const candidates = scope.locator(".overflow-menu-button");
    const count = await candidates.count();
    for (let index = count - 1; index >= 0; index -= 1) {
      const button = candidates.nth(index);
      if (await button.isVisible().catch(() => false)) {
        await button.click({ force: true });
        await scope.getByRole("menuitem", { name: actionLabel }).click();
        return;
      }
    }
    throw new Error(`No visible overflow menu found for ${actionLabel}`);
  }

  await step("app opens and beta data resets", async () => {
    await resetBetaData();
    await assertVisibleText("E&T TCG");
    await assertVisibleText("Home");
    await assertVisibleText("Forge");
    await assertVisibleText("Scout");
    await assertVisibleText("Vault");
    await assertVisibleText("TideTradr");
  });

  async function assertVisibleText(text) {
    const matches = page.getByText(text, { exact: false });
    const count = await matches.count();
    for (let index = 0; index < count; index += 1) {
      if (await matches.nth(index).isVisible()) return;
    }
    assert.fail(`Expected visible text: ${text}`);
  }

  await step("Scout: shared store directory loads", async () => {
    await nav("Scout");
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /Nearby stores|Stores/i }).first().click();
    if (await page.getByRole("dialog", { name: "Location Needed" }).count()) {
      await page.getByLabel("ZIP or city").fill("23434");
      await page.getByRole("button", { name: "Enter ZIP" }).click();
      await page.getByRole("button", { name: /Nearby stores|Stores/i }).first().click();
    }
    await assertVisibleText("Retailers");
    if (await page.getByRole("button", { name: /Target/i }).count()) {
      await page.getByRole("button", { name: /Target/i }).first().click();
    }
    const storeSearch = page.getByPlaceholder(/Search .*city, ZIP, nickname, or address|Search store, city, ZIP/i).first();
    if (await storeSearch.count()) {
      await storeSearch.fill("Smoke Shared Target");
    }
    await assert.match(await page.locator("body").innerText(), /Smoke Shared Target/);
    const smokeStoreCard = page.locator(".scout-store-card").filter({ hasText: "Smoke Shared Target" }).first();
    await smokeStoreCard.getByRole("button", { name: /Open Store|Open/i }).click();
    await assertVisibleText("Submit Report");
  });

  await step("Scout: add/edit/delete restock report", async () => {
    await nav("Scout");
    if (await page.locator('textarea[placeholder="What did you see?"]').count() === 0) {
      await page.getByRole("button", { name: /^Submit Report$/ }).first().click();
    }
    const reportForm = page.locator("form").filter({ has: page.locator('textarea[placeholder="What did you see?"]') }).first();
    await reportForm.getByPlaceholder("Item name").fill("Smoke ETB");
    await reportForm.getByPlaceholder("What did you see?").fill("Two ETBs on the shelf.");
    await reportForm.locator('input[type="date"]').fill("2026-05-08");
    await reportForm.locator('input[type="time"]').fill("10:30");
    await reportForm.locator('button[type="submit"]').click();
    await assertVisibleText("Smoke ETB");

    const reportCard = page.locator(".scout-report-card").filter({ hasText: "Smoke ETB" }).first();
    await reportCard.waitFor({ state: "visible", timeout: 10000 });
    await overflowAction(reportCard, "Edit");
    const editReportPanel = page.locator("form").filter({ has: page.getByRole("heading", { name: "Edit Report" }) }).last();
    await editReportPanel.getByPlaceholder("Item name").fill("Smoke ETB Edited");
    await editReportPanel.getByPlaceholder("What did you see?").fill("Three ETBs after edit.");
    await editReportPanel.getByRole("button", { name: "Save Report" }).click();
    await assertVisibleText("Smoke ETB Edited");

    const editedReportCard = page.locator(".scout-report-card").filter({ hasText: "Smoke ETB Edited" }).first();
    await editedReportCard.waitFor({ state: "visible", timeout: 10000 });
    await overflowAction(editedReportCard, "Delete");
    await assert.equal(await page.locator(".scout-report-card").filter({ hasText: "Smoke ETB Edited" }).count(), 0);
  });

  await step("Scout: add/edit/delete tracked item", async () => {
    await nav("Scout");
    if (await page.getByRole("button", { name: /^Stores$/ }).count()) {
      await page.getByRole("button", { name: /^Stores$/ }).first().click();
    } else if (await page.getByRole("button", { name: /Nearby stores/i }).count()) {
      await page.getByRole("button", { name: /Nearby stores/i }).first().click();
    }
    if (await page.getByRole("dialog", { name: "Location Needed" }).count()) {
      await page.getByLabel("ZIP or city").fill("23434");
      await page.getByRole("button", { name: "Enter ZIP" }).click();
      await page.getByRole("button", { name: /^Stores$|Nearby stores/i }).first().click();
    }
    if (await page.getByRole("button", { name: "Back to Retailers" }).count()) {
      await page.getByRole("button", { name: "Back to Retailers" }).click();
    }
    if (await page.getByRole("button", { name: /Target/i }).count()) {
      await page.getByRole("button", { name: /Target/i }).first().click();
    }
    const storeSearch = page.getByPlaceholder(/Search .*city, ZIP, nickname, or address|Search store, city, ZIP/i).first();
    if (await storeSearch.count()) {
      await storeSearch.fill("Smoke Shared Target");
    }
    const smokeStoreCard = page.locator(".scout-store-card").filter({ hasText: "Smoke Shared Target" }).first();
    await smokeStoreCard.waitFor({ state: "visible", timeout: 10000 });
    const openButton = smokeStoreCard.getByRole("button", { name: /Open Store|Open/i });
    if (await openButton.count()) {
      await openButton.click();
    } else {
      await smokeStoreCard.click();
    }
    if (await page.getByRole("button", { name: "Add Product Sighting" }).count()) {
      await page.getByRole("button", { name: "Add Product Sighting" }).first().click();
    }
    const trackedForm = page.locator("form").filter({ has: page.getByPlaceholder("Retailer item number") }).first();
    await trackedForm.getByPlaceholder("Category").fill("Pokemon");
    await trackedForm.getByPlaceholder("Item name").fill("Smoke Booster Bundle");
    await trackedForm.getByPlaceholder("Retailer item number").fill("BB-001");
    await trackedForm.getByPlaceholder("SKU").fill("SKU-SMOKE");
    await trackedForm.getByPlaceholder("UPC").fill("012345678905");
    await trackedForm.getByPlaceholder("Product URL").fill("https://example.com/smoke");
    await trackedForm.locator('button[type="submit"]').click();
    await assertVisibleText("Smoke Booster Bundle");

    const trackedCard = page.locator(".scout-tracked-item-card").filter({ hasText: "Smoke Booster Bundle" }).first();
    await trackedCard.waitFor({ state: "visible", timeout: 10000 });
    await trackedCard.getByRole("button", { name: "Delete" }).first().click();
    await assert.equal(await page.locator(".scout-tracked-item-card").filter({ hasText: "Smoke Booster Bundle" }).count(), 0);
  });

  await step("Scout: Screenshot upload/manual save", async () => {
    await nav("Scout");
    if (await page.getByRole("heading", { name: /Screenshot/i }).count() === 0) {
      await page.getByRole("button", { name: /^Submit Report$/ }).first().click();
      await page.getByRole("button", { name: "Screenshot" }).click();
    }
    const screenshotPanel = page.locator("div").filter({ has: page.getByRole("heading", { name: /Screenshot/i }) }).last();
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mP8z8BQDwAFgwJ/lw2nWQAAAABJRU5ErkJggg==",
      "base64"
    );

    await screenshotPanel.locator('input[type="file"]').setInputFiles({
      name: "facebook-tip.png",
      mimeType: "image/png",
      buffer: png,
    });
    await screenshotPanel.getByPlaceholder("Product name").fill("Smoke Screenshot ETB");
    await screenshotPanel.locator('input[type="date"]').fill("2026-05-08");
    await screenshotPanel.locator('input[type="time"]').fill("09:15");
    await screenshotPanel.getByPlaceholder("Quantity seen").fill("4");
    await screenshotPanel.getByPlaceholder("Price if visible").fill("49.99");
    await screenshotPanel.getByPlaceholder("Source notes / group name").fill("757 Pokemon Finds");
    await screenshotPanel.getByPlaceholder("Notes from the screenshot").fill("Manual screenshot review save.");
    await screenshotPanel.getByRole("button", { name: "Copy to Report Review" }).click();
    const reportForm = page.locator("form").filter({ has: page.locator('textarea[placeholder="What did you see?"]') }).first();
    await reportForm.locator('button[type="submit"]').click();
    await assertVisibleText("Smoke Screenshot ETB");
    await assertVisibleText("Manual screenshot review save.");
  });

  await step("Forge: add/edit/delete inventory item", async () => {
    await nav("Forge");
    await page.getByRole("button", { name: "Add Inventory", exact: true }).first().click();
    const form = page.locator("form.form").last();
    await form.locator("select").nth(1).selectOption("__add__");
    await form.getByPlaceholder("New purchaser name").fill("Smoke Buyer");
    await form.getByRole("button", { name: "Save Purchaser" }).click();
    await fillByLabel(form, "Item Name", "Smoke Forge ETB");
    await fillByLabel(form, "Store / Source", "Smoke Shared Target");
    await fillByLabel(form, "Barcode / UPC", "098765432109");
    await fillByLabel(form, "Quantity Purchased", "2");
    await fillByLabel(form, "Unit Cost", "40");
    await fillByLabel(form, "Planned Sale Price", "55");
    await fillByLabel(form, "MSRP Price", "49.99");
    await fillByLabel(form, "Product Type", "Elite Trainer Box");
    await fillByLabel(form, "Pack Count", "9");
    await fillByLabel(form, "TideTradr Market Price", "60");
    await form.getByRole("button", { name: "Add Item" }).click();
    await assertVisibleText("Smoke Forge ETB");
    const smokeForgeCard = page.locator(".compact-card").filter({ hasText: "Smoke Forge ETB" }).first();
    await smokeForgeCard.getByRole("button", { name: "View" }).click();
    await assertVisibleText("Purchaser");
    await assertVisibleText("Smoke Buyer");
    await page.getByRole("button", { name: "Close" }).click();

    await overflowAction(page.locator(".compact-card").filter({ hasText: "Smoke Forge ETB" }), "Edit");
    const editForm = page.locator("form.form").last();
    await fillByLabel(editForm, "Item Name", "Smoke Forge ETB Edited");
    await editForm.getByRole("button", { name: "Save Changes" }).click();
    await assertVisibleText("Smoke Forge ETB Edited");

    await overflowAction(page.locator(".compact-card").filter({ hasText: "Smoke Forge ETB Edited" }), "Delete");
    await assertVisibleText("No Forge items found");
  });

  await step("Vault: add/edit/delete Vault item", async () => {
    await nav("Vault");
    await page.locator(".vault-command-center").getByRole("button", { name: "Quick Add", exact: true }).click();
    await page.locator(".flow-modal").getByRole("button", { name: /Manual Add/ }).click();
    const vaultForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Add Item to Vault" }) }).first();
    await fillByLabel(vaultForm, "Item Name", "Smoke Vault Binder");
    await fillByLabel(vaultForm, "Quantity", "1");
    await fillByLabel(vaultForm, "Category / Product Type", "Binder");
    await fillByLabel(vaultForm, "Set / Collection", "Smoke Set");
    await vaultForm.getByRole("button", { name: /Pricing/ }).click();
    await fillByLabel(vaultForm, "Cost Paid", "20");
    await fillByLabel(vaultForm, "MSRP", "25");
    await fillByLabel(vaultForm, "Market Value", "30");
    await vaultForm.getByRole("button", { name: /Extra Details/ }).click();
    await fillByLabel(vaultForm, "Pack Count", "0");
    await vaultForm.getByRole("button", { name: "Add Item to Vault" }).click();
    await assertVisibleText("Smoke Vault Binder");

    await overflowAction(page.locator(".compact-card").filter({ hasText: "Smoke Vault Binder" }), "Edit");
    const editVaultForm = page.locator("form.vault-edit-form").last();
    await fillByLabel(editVaultForm, "Item Name", "Smoke Vault Binder Edited");
    await editVaultForm.getByRole("button", { name: "Save Changes" }).click();
    await assertVisibleText("Smoke Vault Binder Edited");

    await overflowAction(page.locator(".compact-card").filter({ hasText: "Smoke Vault Binder Edited" }), "Delete");
    await assert.equal(await page.getByText("Smoke Vault Binder Edited", { exact: false }).count(), 0);
  });

  await step("Market: run TideTradr deal check", async () => {
    await nav("TideTradr");
    await page.getByRole("button", { name: "Check Deal", exact: true }).first().click();
    await fillByLabel(page, "Deal Title", "Smoke Deal");
    await fillByLabel(page, "Asking Price", "60");
    await page.getByText("More Details").click();
    await fillByLabel(page, "Market Total", "100");
    await fillByLabel(page, "Retail / MSRP Total", "120");
    await fillByLabel(page, "Notes", "Smoke deal check");
    await assertVisibleText("Great deal");
    await page.getByRole("button", { name: /Close Deal Finder/i }).click();
  });

  await step("Home: totals update", async () => {
    await nav("Home");
    await assertVisibleText("Collection Value");
    await assertVisibleText("$0.00");
    await assertVisibleText("Recent Activity");
  });

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
