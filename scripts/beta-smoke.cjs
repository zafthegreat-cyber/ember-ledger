const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const rawAppUrl = process.env.APP_URL || "http://127.0.0.1:5200/";
const appUrl = new URL(rawAppUrl);
appUrl.searchParams.set("betaLocalMode", "true");
const APP_URL = appUrl.toString();

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1600 } });
  const results = [];

  await page.addInitScript(() => {
    const appSeed = sessionStorage.getItem("__etSmokeAppData");
    if (appSeed) {
      localStorage.setItem("et-tcg-beta-data", appSeed);
      sessionStorage.removeItem("__etSmokeAppData");
    }
    const scoutSeed = sessionStorage.getItem("__etSmokeScoutData");
    if (scoutSeed) {
      localStorage.setItem("et-tcg-beta-scout", scoutSeed);
      sessionStorage.removeItem("__etSmokeScoutData");
    }
  });

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
    const tab = page.locator(".main-tabs button").filter({ hasText: new RegExp(`^${label}$`) });
    if (await tab.count()) {
      await tab.click();
      return;
    }
    const topbarSection = page.locator(".topbar-section-select");
    if (label === "TideTradr" && (await topbarSection.count())) {
      await topbarSection.evaluate((select) => {
        select.value = "tideTradr";
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      return;
    }
    throw new Error(`No visible navigation target found for ${label}`);
  }

  async function resetBetaData() {
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
    const now = new Date().toISOString();
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
    const scoutData = {
      stores: [sharedStore],
      reports: [],
      items: [],
      routes: [],
    };
    const appData = {
      workspaces: [
        {
          id: "workspace-personal-local-beta",
          name: "My Personal Space",
          type: "personal",
          ownerUserId: "local-beta",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "workspace-smoke-shared",
          name: "Smoke Shared Workspace",
          type: "shared_collection",
          ownerUserId: "local-beta",
          createdAt: now,
          updatedAt: now,
        },
      ],
      workspaceMembers: [
        {
          workspaceId: "workspace-personal-local-beta",
          userId: "local-beta",
          role: "owner",
          status: "active",
          acceptedAt: now,
        },
        {
          workspaceId: "workspace-smoke-shared",
          userId: "local-beta",
          role: "owner",
          status: "active",
          acceptedAt: now,
        },
      ],
      workspaceInvites: [],
      activeWorkspaceId: "workspace-personal-local-beta",
      items: [],
      expenses: [],
      sales: [],
      mileageTrips: [],
      locationSettings: {
        mode: "manual",
        manualLocation: "23434",
        selectedSavedLocation: "23434",
        savedLocations: ["23434"],
        trackingEnabled: false,
        lastUpdated: now,
      },
    };
    await page.evaluate(({ appData, scoutData }) => {
      localStorage.removeItem("et-tcg-beta-data");
      localStorage.removeItem("et-tcg-beta-scout");
      localStorage.removeItem("et-tcg-beta-tidepool");
      localStorage.removeItem("et-tcg-beta-suggestions");
      localStorage.removeItem("et-tcg-beta-feedback");
      sessionStorage.setItem("__etSmokeAppData", JSON.stringify(appData));
      sessionStorage.setItem("__etSmokeScoutData", JSON.stringify(scoutData));
    }, { appData, scoutData });
    await page.reload({ waitUntil: "domcontentloaded" });
  }

  async function reloadWithAppData(appData) {
    await page.evaluate((nextAppData) => {
      sessionStorage.setItem("__etSmokeAppData", JSON.stringify(nextAppData));
    }, appData);
    await page.reload({ waitUntil: "domcontentloaded" });
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

  async function clickFirstVisible(locator, label) {
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click();
        return true;
      }
    }
    if (label) throw new Error(`No visible ${label} found`);
    return false;
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

  await step("Workspace: personal and shared records stay separated", async () => {
    const personalWorkspaceData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      data.items = [
        {
          id: "workspace-smoke-personal-vault",
          name: "Smoke Personal Vault Item",
          destinationScope: ["vault"],
          recordType: "vault_item",
          vaultStatus: "personal_collection",
          quantity: 1,
          unitCost: 10,
          marketPrice: 12,
          workspaceId: "workspace-personal-local-beta",
          workspaceName: "My Personal Space",
          createdAt: new Date().toISOString(),
        },
        {
          id: "workspace-smoke-shared-vault",
          name: "Smoke Shared Vault Item",
          destinationScope: ["vault"],
          recordType: "vault_item",
          vaultStatus: "personal_collection",
          quantity: 1,
          unitCost: 20,
          marketPrice: 25,
          workspaceId: "workspace-smoke-shared",
          workspaceName: "Smoke Shared Workspace",
          createdAt: new Date().toISOString(),
        },
        {
          id: "workspace-smoke-shared-forge",
          name: "Smoke Shared Forge Item",
          destinationScope: ["forge"],
          recordType: "forge_inventory",
          businessInventory: true,
          quantity: 2,
          unitCost: 30,
          marketPrice: 40,
          workspaceId: "workspace-smoke-shared",
          workspaceName: "Smoke Shared Workspace",
          createdAt: new Date().toISOString(),
        },
      ];
      data.activeWorkspaceId = "workspace-personal-local-beta";
      return data;
    });
    await reloadWithAppData(personalWorkspaceData);
    await nav("Vault");
    await assertVisibleText("Smoke Personal Vault Item");
    assert.equal(await page.getByText("Smoke Shared Vault Item", { exact: false }).count(), 0);

    const sharedWorkspaceData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      data.activeWorkspaceId = "workspace-smoke-shared";
      return data;
    });
    await reloadWithAppData(sharedWorkspaceData);
    await nav("Vault");
    await assertVisibleText("Smoke Shared Vault Item");
    assert.equal(await page.getByText("Smoke Personal Vault Item", { exact: false }).count(), 0);
    await nav("Forge");
    await assertVisibleText("Smoke Shared Forge Item");

    const cleanedWorkspaceData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      data.items = [];
      data.activeWorkspaceId = "workspace-personal-local-beta";
      return data;
    });
    await reloadWithAppData(cleanedWorkspaceData);
  });

  async function assertVisibleText(text) {
    try {
      await page.waitForFunction(
        (expectedText) => document.body && document.body.innerText.toLowerCase().includes(String(expectedText).toLowerCase()),
        text,
        { timeout: 7000 }
      );
    } catch (error) {
      const bodyPreview = await page.locator("body").innerText().catch(() => "");
      error.message = `${error.message}\nBody preview:\n${bodyPreview.slice(0, 1500)}`;
      throw error;
    }
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
    const noteSelector = 'textarea[placeholder="Quick note, limit, or shelf details"], textarea[placeholder="What did you see?"]';
    if (await page.locator(noteSelector).count() === 0) {
      await page.getByRole("button", { name: /^Submit Report$/ }).first().click();
    }
    const reportForm = page.locator("form").filter({ has: page.locator(noteSelector) }).first();
    const optionalItems = reportForm.locator("details.scout-report-optional-items").first();
    if (await optionalItems.count()) {
      const open = await optionalItems.evaluate((node) => node.open);
      if (!open) await optionalItems.locator("summary").click();
    }
    await reportForm.getByPlaceholder("Search product, UPC, SKU").first().fill("Smoke ETB");
    await reportForm.getByPlaceholder("Qty or unknown").first().fill("2");
    await reportForm.locator(noteSelector).fill("Two ETBs on the shelf.");
    await reportForm.locator('button[type="submit"]').click();
    await assertVisibleText("Smoke ETB");

    const reportCard = page.locator(".scout-report-compact-card").filter({ hasText: "Smoke ETB" }).first();
    await reportCard.waitFor({ state: "visible", timeout: 10000 });
    await overflowAction(reportCard, "Edit");
    const editReportPanel = page.locator("form").filter({ has: page.locator(noteSelector) }).first();
    const editOptionalItems = editReportPanel.locator("details.scout-report-optional-items").first();
    if (await editOptionalItems.count()) {
      const editOpen = await editOptionalItems.evaluate((node) => node.open);
      if (!editOpen) await editOptionalItems.locator("summary").click();
    }
    await editReportPanel.getByPlaceholder("Search product, UPC, SKU").first().fill("Smoke ETB Edited");
    await editReportPanel.locator(noteSelector).fill("Three ETBs after edit.");
    await editReportPanel.locator('button[type="submit"]').click();
    await assertVisibleText("Smoke ETB Edited");

    const editedReportCard = page.locator(".scout-report-compact-card").filter({ hasText: "Smoke ETB Edited" }).first();
    await editedReportCard.waitFor({ state: "visible", timeout: 10000 });
    await overflowAction(editedReportCard, "Delete");
    await page.getByRole("button", { name: "Delete Report" }).click();
    await assert.equal(await page.locator(".scout-report-compact-card").filter({ hasText: "Smoke ETB Edited" }).count(), 0);

    if (await page.locator(noteSelector).count() === 0) {
      await page.getByRole("button", { name: /^Submit Report$/ }).first().click();
    }
    const quickReportForm = page.locator("form").filter({ has: page.locator(noteSelector) }).first();
    await quickReportForm.getByRole("button", { name: "Low stock" }).click();
    await quickReportForm.locator(noteSelector).fill("Smoke quick report with limit 2 posted.");
    await quickReportForm.locator('button[type="submit"]').click();
    await assertVisibleText("Low stock");
    await assertVisibleText("Smoke quick report with limit 2 posted.");
    const quickReportCard = page.locator(".scout-report-compact-card").filter({ hasText: "Smoke quick report with limit 2 posted." }).first();
    await quickReportCard.waitFor({ state: "visible", timeout: 10000 });
    await overflowAction(quickReportCard, "Delete");
    await page.getByRole("button", { name: "Delete Report" }).click();
  });

  await step("Scout: add/edit/delete tracked item", async () => {
    await nav("Scout");
    const storesAccordion = page.locator(".scout-accordion-header").filter({ hasText: "Stores" }).first();
    if (await storesAccordion.count()) {
      const expanded = await storesAccordion.getAttribute("aria-expanded");
      if (expanded !== "true") {
        await storesAccordion.click();
      }
    }
    if (await page.getByRole("button", { name: /^Open Stores$/ }).count()) {
      await clickFirstVisible(page.getByRole("button", { name: /^Open Stores$/ }), "Open Stores button");
    } else if (await page.getByRole("button", { name: /^Stores$/ }).count()) {
      await clickFirstVisible(page.getByRole("button", { name: /^Stores$/ }), "Stores button");
    } else if (await page.getByRole("button", { name: /Nearby stores/i }).count()) {
      await clickFirstVisible(page.getByRole("button", { name: /Nearby stores/i }), "Nearby stores button");
    }
    if (await page.getByRole("button", { name: /^Open Stores$/ }).count()) {
      await clickFirstVisible(page.getByRole("button", { name: /^Open Stores$/ }), "Open Stores button");
    }
    if (await page.getByRole("dialog", { name: "Location Needed" }).count()) {
      await page.getByLabel("ZIP or city").fill("23434");
      await page.getByRole("button", { name: "Enter ZIP" }).click();
      if (await page.getByRole("button", { name: /^Open Stores$/ }).count()) {
        await clickFirstVisible(page.getByRole("button", { name: /^Open Stores$/ }), "Open Stores button");
      } else {
        await clickFirstVisible(page.getByRole("button", { name: /^Stores$|Nearby stores/i }), "Stores button");
      }
    }
    if (await page.getByRole("button", { name: "Back to Retailers" }).count()) {
      await page.getByRole("button", { name: "Back to Retailers" }).click();
    }
    if (!(await page.locator(".scout-store-card").filter({ hasText: "Smoke Shared Target" }).count())) {
      await clickFirstVisible(page.getByRole("button", { name: /Target/i }), "Target retailer button");
    }
    const storeSearch = page.getByPlaceholder(/Search .*city, ZIP, nickname, or address|Search store, city, ZIP/i).first();
    if (await storeSearch.count()) {
      await storeSearch.fill("Smoke Shared Target");
    }
    const smokeStoreCard = page.locator(".scout-store-card").filter({ hasText: "Smoke Shared Target" }).first();
    try {
      await smokeStoreCard.waitFor({ state: "visible", timeout: 10000 });
    } catch (error) {
      const pageText = (await page.locator("body").innerText()).slice(0, 2000);
      throw new Error(`Smoke Shared Target store card was not visible. Current Scout view: ${pageText}`);
    }
    const openButton = smokeStoreCard.getByRole("button", { name: /Open Store|Open/i });
    if (await openButton.count()) {
      await openButton.click();
    } else {
      await smokeStoreCard.click();
    }
    const trackedForm = page.locator("form").filter({ has: page.getByPlaceholder("Retailer item number") }).first();
    if (!(await trackedForm.count())) {
      const addSightings = page.getByRole("button", { name: "Add Product Sighting" });
      const sightingCount = await addSightings.count();
      for (let index = 0; index < sightingCount; index += 1) {
        const button = addSightings.nth(index);
        if (await button.isVisible().catch(() => false)) {
          await button.click();
          break;
        }
      }
    }
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
    const reportForm = page.locator("form").filter({ has: page.locator('textarea[placeholder="Quick note, limit, or shelf details"], textarea[placeholder="What did you see?"]') }).first();
    await reportForm.locator('button[type="submit"]').click();
    await assertVisibleText("Smoke Screenshot ETB");
    await assertVisibleText("Manual screenshot review save.");
  });

  await step("Forge: add/edit/delete inventory item", async () => {
    await nav("Forge");
    await page.getByRole("button", { name: "Add Inventory", exact: true }).first().click();
    const form = page.locator("form#multi-destination-add-form").first();
    const forgeDestination = form.locator("label.destination-checkbox").filter({ hasText: "Add to Forge" }).locator("input");
    if (!(await forgeDestination.isChecked())) await forgeDestination.check();
    await fillByLabel(form, "Item Name", "Smoke Forge ETB");
    await fillByLabel(form, "Type / Category", "Elite Trainer Box");
    await fillByLabel(form, "UPC / SKU if known", "098765432109");
    await fillByLabel(form, "Quantity for Forge", "2");
    await fillByLabel(form, "Cost Basis", "40");
    await fillByLabel(form, "Planned Sell Price", "55");
    await fillByLabel(form, "Source / Purchase Location", "Smoke Shared Target");
    await fillByLabel(form, "MSRP", "49.99");
    await fillByLabel(form, "Market Price", "60");
    await page.locator(".flow-modal").getByRole("button", { name: "Add Item" }).click();
    await assertVisibleText("Smoke Forge ETB");
    const smokeForgeCard = page.locator(".compact-card").filter({ hasText: "Smoke Forge ETB" }).first();
    await smokeForgeCard.getByRole("button", { name: "View" }).click();
    await assertVisibleText("Smoke Shared Target");
    await page.getByRole("button", { name: "Close" }).click();

    await nav("Vault");
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Forge ETB" }).count(), 0);
    await nav("Forge");

    await overflowAction(page.locator(".compact-card").filter({ hasText: "Smoke Forge ETB" }), "Edit");
    const editForm = page.locator("form.form").last();
    await fillByLabel(editForm, "Item Name", "Smoke Forge ETB Edited");
    await editForm.getByRole("button", { name: "Save Changes" }).click();
    await assertVisibleText("Smoke Forge ETB Edited");

    await overflowAction(page.locator(".compact-card").filter({ hasText: "Smoke Forge ETB Edited" }), "Delete");
    await assertVisibleText("No Forge items found");
  });

  await step("Receipt: draft/verify/submit expense-only report", async () => {
    await nav("Vault");
    await page.locator(".vault-command-center").getByRole("button", { name: "Quick Add", exact: true }).click();
    await page.locator(".flow-modal").getByRole("button", { name: /Scan to Vault/ }).click();
    await page.locator(".flow-modal").getByRole("button", { name: /Open Scanner/ }).click();
    await page.getByRole("button", { name: "Scan Receipt" }).click();
    const receiptModal = page.locator(".receipt-scan-modal").first();
    await fillByLabel(receiptModal, "Receipt OCR / visible text", "Smoke Receipt Pack 11.35");
    await fillByLabel(receiptModal, "Store", "Smoke Receipt Target");
    await fillByLabel(receiptModal, "Store location", "Smoke City, VA");
    await fillByLabel(receiptModal, "Purchase date", "2026-05-10");
    await fillByLabel(receiptModal, "Transaction / barcode", "SMOKE-RCPT-1");
    await fillByLabel(receiptModal, "Subtotal", "11.35");
    await fillByLabel(receiptModal, "Tax / fees", "0.99");
    await fillByLabel(receiptModal, "Receipt total", "12.34");
    await receiptModal.getByRole("button", { name: "Review Receipt" }).click();
    await assertVisibleText("Smoke Receipt Target review");
    await receiptModal.locator(".receipt-draft-card").first().getByRole("button", { name: "Verify Items" }).click();
    await receiptModal.getByRole("button", { name: "Submit Report" }).click();
    await assertVisibleText("Receipt saved locally");
    await assertVisibleText("Receipt Report");
    await receiptModal.getByRole("button", { name: "Close" }).first().click();
  });

  await step("Vault: add/edit/delete Vault item", async () => {
    await nav("Vault");
    await page.locator(".vault-command-center").getByRole("button", { name: "Quick Add", exact: true }).click();
    await page.locator(".flow-modal").getByRole("button", { name: /Manual Add/ }).click();
    const vaultForm = page.locator("form#multi-destination-add-form").first();
    await fillByLabel(vaultForm, "Item Name", "Smoke Vault Binder");
    await fillByLabel(vaultForm, "Type / Category", "Binder");
    await vaultForm.getByRole("checkbox", { name: /Add to Vault/ }).check();
    await fillByLabel(vaultForm, "Quantity for Vault", "1");
    await fillByLabel(vaultForm, "Collection Category", "Smoke Set");
    await fillByLabel(vaultForm, "Cost Basis", "20");
    await fillByLabel(vaultForm, "MSRP", "25");
    await fillByLabel(vaultForm, "Market Price", "30");
    await page.locator(".flow-modal").getByRole("button", { name: "Add Item" }).click();
    await assertVisibleText("Smoke Vault Binder");

    await nav("Forge");
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Vault Binder" }).count(), 0);
    await nav("Vault");

    await overflowAction(page.locator(".compact-card").filter({ hasText: "Smoke Vault Binder" }), "Edit");
    const editVaultForm = page.locator("form.vault-edit-form").last();
    await fillByLabel(editVaultForm, "Item Name", "Smoke Vault Binder Edited");
    await editVaultForm.getByRole("button", { name: "Save Changes" }).click();
    await assertVisibleText("Smoke Vault Binder Edited");

    await overflowAction(page.locator(".compact-card").filter({ hasText: "Smoke Vault Binder Edited" }), "Delete");
    await assert.equal(await page.getByText("Smoke Vault Binder Edited", { exact: false }).count(), 0);
  });

  await step("Vault: wishlist item stays out of Forge inventory", async () => {
    await nav("Vault");
    await page.locator(".vault-command-center").getByRole("button", { name: "Quick Add", exact: true }).click();
    await page.locator(".flow-modal").getByRole("button", { name: /Add Wishlist Item/ }).click();
    const wishlistForm = page.locator("form#multi-destination-add-form").first();
    await fillByLabel(wishlistForm, "Item Name", "Smoke Wishlist Box");
    await fillByLabel(wishlistForm, "Type / Category", "Collection Box");
    await fillByLabel(wishlistForm, "Quantity Wanted", "1");
    await fillByLabel(wishlistForm, "Target Price", "25");
    await page.locator(".flow-modal").getByRole("button", { name: "Add Item" }).click();
    await page.waitForTimeout(300);
    const wishlistRecord = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.items || []).find((item) => item.name === "Smoke Wishlist Box" || item.itemName === "Smoke Wishlist Box") || null;
    });
    assert.ok(wishlistRecord, "Wishlist record should be written to beta storage");
    assert.ok((wishlistRecord.destinationScope || []).includes("wishlist"), "Wishlist destination scope should be present");
    assert.equal(Boolean(wishlistRecord.businessInventory), false);
    assert.equal(wishlistRecord.workspaceId, "workspace-personal-local-beta");
    await nav("Forge");
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Wishlist Box" }).count(), 0);
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      data.items = (data.items || []).filter((item) => item.name !== "Smoke Wishlist Box" && item.itemName !== "Smoke Wishlist Box");
      localStorage.setItem("et-tcg-beta-data", JSON.stringify(data));
    });
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
