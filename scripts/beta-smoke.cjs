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

  async function nav(label) {
    await page.locator(".main-tabs button").filter({ hasText: new RegExp(`^${label}$`) }).click();
  }

  async function resetBetaData() {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.removeItem("et-tcg-beta-data");
      localStorage.removeItem("et-tcg-beta-scout");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
  }

  async function fillByLabel(scope, label, value) {
    await scope.getByLabel(label, { exact: true }).fill(String(value));
  }

  async function overflowAction(scope, actionLabel) {
    await scope.locator(".overflow-menu-button").click();
    await scope.getByRole("menuitem", { name: actionLabel }).click();
  }

  await step("app opens and beta data resets", async () => {
    await resetBetaData();
    await assertVisibleText("E&T TCG");
    await assertVisibleText("Home");
    await assertVisibleText("Vault");
    await assertVisibleText("Scout");
    await assertVisibleText("Market");
    await assertVisibleText("Forge");
  });

  async function assertVisibleText(text) {
    await assert.ok(await page.getByText(text, { exact: false }).first().isVisible());
  }

  await step("Scout: add/edit/delete store", async () => {
    await nav("Scout");
    const addStoreForm = page.locator("form").filter({ has: page.getByPlaceholder("Store name") }).first();
    await addStoreForm.getByPlaceholder("Store name").fill("Smoke Cards");
    await addStoreForm.getByPlaceholder("Chain").fill("Target");
    await addStoreForm.getByPlaceholder("City").fill("Suffolk");
    await addStoreForm.getByPlaceholder("Address").fill("123 Beta Way");
    await addStoreForm.getByPlaceholder("Phone").fill("757-555-0100");
    await addStoreForm.getByRole("button", { name: "Add Store" }).click();
    await assertVisibleText("Smoke Cards");

    await overflowAction(page, "Edit");
    await page.locator('input[placeholder="Store name"]').nth(1).fill("Smoke Cards Edited");
    await page.locator('input[placeholder="Chain"]').nth(1).fill("Walmart");
    await page.locator('input[placeholder="City"]').nth(1).fill("Chesapeake");
    await page.locator('input[placeholder="Address"]').nth(1).fill("456 Beta Road");
    await page.locator('input[placeholder="Phone"]').nth(1).fill("757-555-0199");
    await page.getByRole("button", { name: "Save Store Changes" }).click();
    await assertVisibleText("Smoke Cards Edited");
  });

  await step("Scout: add/edit/delete restock report", async () => {
    const reportPanel = page.locator("div").filter({ has: page.getByRole("heading", { name: "Add Report" }) }).last();
    await reportPanel.getByPlaceholder("Item name").fill("Smoke ETB");
    await reportPanel.getByPlaceholder("What did you see?").fill("Two ETBs on the shelf.");
    await reportPanel.locator('input[type="date"]').fill("2026-05-08");
    await reportPanel.locator('input[type="time"]').fill("10:30");
    await reportPanel.getByRole("button", { name: "Add Report" }).click();
    await assertVisibleText("Smoke ETB");

    await overflowAction(page.locator("div").filter({ hasText: "Smoke ETB" }).last(), "Edit");
    const editReportPanel = page.locator("div").filter({ has: page.getByRole("heading", { name: "Edit Report" }) }).last();
    await editReportPanel.getByPlaceholder("Item name").fill("Smoke ETB Edited");
    await editReportPanel.getByPlaceholder("What did you see?").fill("Three ETBs after edit.");
    await editReportPanel.getByRole("button", { name: "Save Report" }).click();
    await assertVisibleText("Smoke ETB Edited");

    await overflowAction(page.locator("div").filter({ hasText: "Smoke ETB Edited" }).last(), "Delete");
    await assert.equal(await page.getByText("Smoke ETB Edited", { exact: false }).count(), 0);
  });

  await step("Scout: add/edit/delete tracked item", async () => {
    const trackedPanel = page.locator("div").filter({ has: page.getByRole("heading", { name: "Add Tracked Item" }) }).last();
    await trackedPanel.getByPlaceholder("Category").fill("Pokemon");
    await trackedPanel.getByPlaceholder("Item name").fill("Smoke Booster Bundle");
    await trackedPanel.getByPlaceholder("Retailer item number").fill("BB-001");
    await trackedPanel.getByPlaceholder("SKU").fill("SKU-SMOKE");
    await trackedPanel.getByPlaceholder("UPC").fill("012345678905");
    await trackedPanel.getByPlaceholder("Product URL").fill("https://example.com/smoke");
    await trackedPanel.getByRole("button", { name: "Add Tracked Item" }).click();
    await assertVisibleText("Smoke Booster Bundle");

    await overflowAction(page.locator("div").filter({ hasText: "Smoke Booster Bundle" }).last(), "Edit");
    const editTrackedPanel = page.locator("div").filter({ has: page.getByRole("heading", { name: "Edit Tracked Item" }) }).last();
    await editTrackedPanel.getByPlaceholder("Item name").fill("Smoke Booster Bundle Edited");
    await editTrackedPanel.getByRole("button", { name: "Save Tracked Item" }).click();
    await assertVisibleText("Smoke Booster Bundle Edited");

    await overflowAction(page.locator("div").filter({ hasText: "Smoke Booster Bundle Edited" }).last(), "Delete");
    await assert.equal(await page.getByText("Smoke Booster Bundle Edited", { exact: false }).count(), 0);
  });

  await step("Scout: Screenshot Tip Import upload/manual save", async () => {
    const screenshotPanel = page.locator("div").filter({ has: page.getByRole("heading", { name: "Screenshot Tip Import" }) }).last();
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
    await screenshotPanel.getByPlaceholder("Product category").fill("Pokemon");
    await screenshotPanel.locator('input[type="date"]').fill("2026-05-08");
    await screenshotPanel.locator('input[type="time"]').fill("09:15");
    await screenshotPanel.getByPlaceholder("Quantity seen").fill("4");
    await screenshotPanel.getByPlaceholder("Quantity remaining").fill("2");
    await screenshotPanel.getByPlaceholder("Limit policy").fill("Limit 2");
    await screenshotPanel.getByPlaceholder("Source group/name if visible").fill("757 Pokemon Finds");
    await screenshotPanel.getByPlaceholder("Extraction confidence 0-100").fill("80");
    await screenshotPanel.getByPlaceholder("Notes from the screenshot").fill("Manual screenshot review save.");
    await screenshotPanel.getByRole("button", { name: "Save Screenshot Tip Report" }).click();
    await assertVisibleText("Smoke Screenshot ETB");
    await assertVisibleText("facebook_screenshot");
  });

  await step("Forge: add/edit/delete inventory item", async () => {
    await nav("Forge");
    await page.locator(".forge-toolbar button").click();
    const form = page.locator("form.form").last();
    await form.locator("select").nth(1).selectOption("__add__");
    await form.getByPlaceholder("New purchaser name").fill("Smoke Buyer");
    await form.getByRole("button", { name: "Save Purchaser" }).click();
    await fillByLabel(form, "Item Name", "Smoke Forge ETB");
    await fillByLabel(form, "Store / Source", "Smoke Cards Edited");
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
    await assertVisibleText("Purchased By:");
    await assert.ok(
      await page.locator(".compact-card").filter({ hasText: "Smoke Forge ETB" }).getByText("Smoke Buyer").first().isVisible()
    );

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
    const vaultForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Add to Vault" }) }).first();
    await fillByLabel(vaultForm, "Item Name", "Smoke Vault Binder");
    await fillByLabel(vaultForm, "Quantity / Item Count", "1");
    await fillByLabel(vaultForm, "Pack Count", "0");
    await fillByLabel(vaultForm, "Cost Paid", "20");
    await fillByLabel(vaultForm, "MSRP", "25");
    await fillByLabel(vaultForm, "Market Value", "30");
    await fillByLabel(vaultForm, "Set / Collection", "Smoke Set");
    await fillByLabel(vaultForm, "Product Type", "Binder");
    await vaultForm.getByRole("button", { name: "Add to Vault" }).click();
    await assertVisibleText("Smoke Vault Binder");

    await overflowAction(page.locator(".compact-card").filter({ hasText: "Smoke Vault Binder" }), "Edit");
    const editVaultForm = page.locator("form.form").last();
    await fillByLabel(editVaultForm, "Item Name", "Smoke Vault Binder Edited");
    await editVaultForm.getByRole("button", { name: "Save Vault Item" }).click();
    await assertVisibleText("Smoke Vault Binder Edited");

    await overflowAction(page.locator(".compact-card").filter({ hasText: "Smoke Vault Binder Edited" }), "Delete");
    await assert.equal(await page.getByText("Smoke Vault Binder Edited", { exact: false }).count(), 0);
  });

  await step("Market: run TideTradr deal check", async () => {
    await nav("Market");
    await fillByLabel(page, "Deal Title", "Smoke Deal");
    await fillByLabel(page, "Asking Price", "60");
    await fillByLabel(page, "Market Total", "100");
    await fillByLabel(page, "Retail / MSRP Total", "120");
    await fillByLabel(page, "Notes", "Smoke deal check");
    await assertVisibleText("Great deal");
  });

  await step("Home: totals update", async () => {
    await nav("Home");
    await assertVisibleText("COLLECTION VALUE");
    await assertVisibleText("$0.00");
    await assertVisibleText("Daily Scout Report");
  });

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
