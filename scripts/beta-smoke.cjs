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

  async function openOverflowMenu(scope) {
    const candidates = scope.locator(".overflow-menu-button");
    const count = await candidates.count();
    for (let index = count - 1; index >= 0; index -= 1) {
      const button = candidates.nth(index);
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        const menu = page.locator(".overflow-menu-list").last();
        await menu.waitFor({ state: "visible", timeout: 5000 });
        return menu;
      }
    }
    throw new Error("No visible overflow menu found");
  }

  async function overflowAction(scope, actionLabel) {
    const menu = await openOverflowMenu(scope);
    await menu.getByRole("menuitem", { name: actionLabel }).click();
  }

  async function assertOverflowActionHidden(scope, actionLabel) {
    const menu = await openOverflowMenu(scope);
    assert.equal(
      await menu.getByRole("menuitem", { name: actionLabel }).count(),
      0,
      `${actionLabel} should not be visible in this overflow menu`
    );
    await page.keyboard.press("Escape");
  }

  async function closeScoutSubmitSuccess() {
    const scoutSubmitModal = page.locator('.flow-modal[data-flow="scoutSubmit"]').first();
    const doneButton = scoutSubmitModal.getByRole("button", { name: /^Done$/ }).first();
    await doneButton.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    if (await doneButton.isVisible().catch(() => false)) {
      await doneButton.click({ force: true });
      await scoutSubmitModal.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(250);
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

  await step("Admin modes: regular preview and edit toggle stay gated", async () => {
    const modeBar = page.locator(".admin-mode-control-bar").first();
    if (!(await modeBar.isVisible().catch(() => false))) {
      assert.equal(await page.locator(".admin-mode-control-bar").count(), 0, "regular users should not see the admin mode bar");
      return;
    }

    await modeBar.getByRole("button", { name: "Regular" }).click();
    await assertVisibleText("Regular preview active");
    assert.equal(await page.locator(".admin-edit-mode-banner").count(), 0, "edit banner should be hidden in Regular Mode");

    await modeBar.getByRole("button", { name: "Admin" }).click();
    await assertVisibleText("Admin Mode active");
    await modeBar.getByRole("button", { name: "On" }).click();
    await assertVisibleText("Admin Edit Mode ON");
    await modeBar.getByRole("button", { name: "Off" }).click();
    await page.waitForFunction(() => !document.querySelector(".admin-edit-mode-banner"), null, { timeout: 5000 });
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
        (expected) => {
          const bodyText = document.body?.innerText || "";
          if (expected?.pattern) return new RegExp(expected.pattern, expected.flags || "").test(bodyText);
          return bodyText.toLowerCase().includes(String(expected.value).toLowerCase());
        },
        text instanceof RegExp ? { pattern: text.source, flags: text.flags } : { value: text },
        { timeout: 7000 }
      );
    } catch (error) {
      const bodyPreview = await page.locator("body").innerText().catch(() => "");
      error.message = `${error.message}\nBody preview:\n${bodyPreview.slice(0, 1500)}`;
      throw error;
    }
  }

  async function assertNotVisibleText(text) {
    const bodyText = await page.locator("body").innerText().catch(() => "");
    assert.equal(
      bodyText.toLowerCase().includes(String(text).toLowerCase()),
      false,
      `${text} should not be visible`
    );
  }

  async function fillScoutReportWizard(form, options = {}) {
    const {
      reportType = "Stock found",
      storeSearchText = "Smoke Shared Target",
      proof = "Skip proof",
      file = null,
      proofText = "",
      productName = "",
      quantity = "",
      price = "",
      note = "",
      stockLeft = "",
    } = options;

    const reportTypeButton = form.getByRole("button", { name: new RegExp(reportType, "i") }).first();
    if (!(await reportTypeButton.isVisible().catch(() => false))) {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      throw new Error(`Scout wizard did not open at the report type step.\n${bodyText.slice(0, 1600)}`);
    }
    await reportTypeButton.click();
    if (note) {
      await form.getByPlaceholder(/Optional quick note/i).fill(note);
    }
    await form.getByRole("button", { name: "Next" }).click();

    const storeSearch = form.getByPlaceholder("Search store, city, ZIP, nickname, or address").first();
    if (await storeSearch.count()) {
      await storeSearch.fill(storeSearchText);
    }
    const manualLocation = form.getByPlaceholder("Manual store/location if missing").first();
    if (await manualLocation.count()) {
      await manualLocation.fill(storeSearchText);
    }
    const smokeStoreCard = form.locator(".scout-report-store-card").filter({ hasText: storeSearchText }).first();
    if (await smokeStoreCard.count()) {
      await smokeStoreCard.getByRole("button", { name: "Report here" }).click();
    } else if (await form.getByRole("button", { name: "Report here" }).count()) {
      await form.getByRole("button", { name: "Report here" }).first().click();
    }
    await form.getByRole("button", { name: "Next" }).click();

    await form.getByRole("button", { name: new RegExp(proof, "i") }).first().click();
    if (file) {
      await form.locator('input[type="file"]').setInputFiles(file);
    }
    if (proofText) {
      await form.getByPlaceholder(/Receipt detail|screenshot note|site link/i).fill(proofText);
    }
    await form.getByRole("button", { name: "Next" }).click();

    if (productName) {
      await form.getByPlaceholder(/Optional: ETB|booster bundle|UPC|SKU/i).fill(productName);
    }
    if (quantity) {
      await form.getByPlaceholder(/Optional qty|estimate/i).fill(quantity);
    }
    if (price) {
      await form.getByLabel("Price / MSRP").fill(price);
    }
    if (stockLeft) {
      await form.getByRole("button", { name: new RegExp(stockLeft, "i") }).first().click();
    }
    await form.getByRole("button", { name: "Next" }).click();
    await form.getByText("Review and submit").waitFor({ state: "visible", timeout: 5000 }).catch(async (error) => {
      const formText = await form.innerText().catch(() => "");
      const bodyText = await page.locator("body").innerText().catch(() => "");
      if (bodyText.includes("Report sent. You can add details now or later.")) return;
      error.message = `${error.message}\nScout wizard state:\n${formText.slice(0, 1200)}\nBody:\n${bodyText.slice(0, 1600)}`;
      throw error;
    });
  }

  async function submitScoutWizardIfNeeded(form) {
    const submitButton = form.locator('button[type="submit"]').last();
    if (await submitButton.isVisible().catch(() => false)) {
      await submitButton.click();
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

  await step("Scout: add/edit restock report without user delete", async () => {
    async function openReportWizard() {
      await nav("Scout");
      if (await page.locator("form.scout-report-flow").count() === 0) {
        await page.getByRole("button", { name: /^Submit Report$/ }).first().click();
      }
      const form = page.locator("form.scout-report-flow").first();
      await form.waitFor({ state: "visible", timeout: 10000 });
      return form;
    }

    async function closeReportSuccess() {
      await closeScoutSubmitSuccess();
    }

    const reportForm = await openReportWizard();
    await fillScoutReportWizard(reportForm, {
      productName: "Smoke ETB",
      quantity: "2",
      note: "Two ETBs on the shelf.",
    });
    await submitScoutWizardIfNeeded(reportForm);
    await assertVisibleText("Smoke ETB");
    await closeReportSuccess();

    const reportCard = page.locator(".scout-report-compact-card").filter({ hasText: "Smoke ETB" }).first();
    await reportCard.waitFor({ state: "visible", timeout: 10000 });
    await assertOverflowActionHidden(reportCard, "Delete");
    await overflowAction(reportCard, "Edit");
    const editReportPanel = page.locator("form.scout-report-flow").first();
    await editReportPanel.getByRole("button", { name: "Back to details" }).click();
    await editReportPanel.getByPlaceholder("Search product, UPC, SKU").first().fill("Smoke ETB Edited");
    await editReportPanel.getByPlaceholder("Qty or estimate").first().fill("3");
    await editReportPanel.getByPlaceholder("Notes, shelf status, employee quote, limit, or context").fill("Three ETBs after edit.");
    await editReportPanel.getByRole("button", { name: "Review report" }).click();
    await editReportPanel.getByRole("button", { name: "Save Report" }).click();
    await assertVisibleText("Smoke ETB Edited");
    await closeReportSuccess();

    const editedReportCard = page.locator(".scout-report-compact-card").filter({ hasText: "Smoke ETB Edited" }).first();
    await editedReportCard.waitFor({ state: "visible", timeout: 10000 });
    await assertOverflowActionHidden(editedReportCard, "Delete");

    const quickReportForm = await openReportWizard();
    await fillScoutReportWizard(quickReportForm, {
      note: "Smoke quick report with limit 2 posted.",
      stockLeft: "Low stock",
    });
    await submitScoutWizardIfNeeded(quickReportForm);
    await closeReportSuccess();
    const viewAllReports = page.getByRole("button", { name: "View all reports" }).first();
    if (await viewAllReports.isVisible().catch(() => false)) {
      await viewAllReports.click();
    }
    await assertVisibleText("Smoke quick report with limit 2 posted.");
    const quickReportCard = page.locator(".scout-report-compact-card").filter({ hasText: "Smoke quick report with limit 2 posted." }).first();
    await quickReportCard.waitFor({ state: "visible", timeout: 10000 });
    await assertOverflowActionHidden(quickReportCard, "Delete");
  });

  await step("Scout: add/edit/delete tracked item", async () => {
    await nav("Scout");
    const scoutStoresTab = page.locator(".standard-page-header-tabs").getByRole("button", { name: "Stores", exact: true }).first();
    if (await scoutStoresTab.isVisible().catch(() => false)) {
      await scoutStoresTab.click();
      await page.waitForTimeout(250);
    }
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
    await page.getByRole("button", { name: /^Submit Report$/ }).first().click();
    const reportForm = page.locator("form.scout-report-flow").first();
    await reportForm.waitFor({ state: "visible", timeout: 10000 });
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mP8z8BQDwAFgwJ/lw2nWQAAAABJRU5ErkJggg==",
      "base64"
    );

    await fillScoutReportWizard(reportForm, {
      proof: "Shelf/sign photo",
      file: {
        name: "facebook-tip.png",
        mimeType: "image/png",
        buffer: png,
      },
      proofText: "757 Pokemon Finds",
      productName: "Smoke Screenshot ETB",
      quantity: "4",
      price: "49.99",
      note: "Manual screenshot review save.",
    });
    await submitScoutWizardIfNeeded(reportForm);
    await closeScoutSubmitSuccess();
    const viewAllReports = page.getByRole("button", { name: "View all reports" }).first();
    if (await viewAllReports.isVisible().catch(() => false)) {
      await viewAllReports.click();
    }
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
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await nav("Forge");
    await assertVisibleText("Smoke Forge ETB");

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
    await page.locator(".flow-modal").getByRole("button", { name: /Scan \/ Review Item|Scan to Vault/ }).click();
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
    await nav("Vault");
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Receipt Pack" }).count(), 0);
    await nav("Forge");
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Receipt Pack" }).count(), 0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await nav("Vault");
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Receipt Pack" }).count(), 0);
    await nav("Forge");
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Receipt Pack" }).count(), 0);
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
    await fillByLabel(vaultForm, "Market Price", "30");
    await page.locator(".flow-modal").getByRole("button", { name: "Add Item" }).click();
    await assertVisibleText("Smoke Vault Binder");

    await nav("Forge");
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Vault Binder" }).count(), 0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await nav("Vault");
    await assertVisibleText("Smoke Vault Binder");

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
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Wishlist Box" }).count(), 0);
    await page.getByRole("button", { name: "Wishlist", exact: true }).click();
    await assertVisibleText("Smoke Wishlist Box");
    await nav("Forge");
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Wishlist Box" }).count(), 0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await nav("Vault");
    await page.getByRole("button", { name: "Collection", exact: true }).click();
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Wishlist Box" }).count(), 0);
    await page.getByRole("button", { name: "Wishlist", exact: true }).click();
    await assertVisibleText("Smoke Wishlist Box");
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
    await assertVisibleText("Daily Tide Check");
    await assertVisibleText(/Start Daily Tide|Next:|Daily Tide Complete/);
    await assertNotVisibleText("Today / Overview");
    await assertNotVisibleText("Recent Activity");
  });

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
