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
    const visibleLabel =
      label === "TideTradr"
        ? "(TideTradr|Market)"
        : label === "Home"
          ? "(Home|Hearth|Hearth Home)"
          : label === "Scout"
            ? "(Scout|Scout Signals)"
            : label === "Forge"
              ? "(Forge|Forge Workshop)"
          : label;
    const navName = new RegExp(`^${visibleLabel}\\b`, "i");
    const navSelectors = [
      ".web-command-nav button",
      ".mobile-bottom-nav button",
      ".main-tabs button",
    ];
    for (const selector of navSelectors) {
      const targets = page.locator(selector).filter({ hasText: navName });
      const count = await targets.count();
      for (let index = 0; index < count; index += 1) {
        const target = targets.nth(index);
        if (await target.isVisible()) {
          await target.click();
          return;
        }
      }
    }
    const legacyTab = page.locator(".main-tabs button").filter({ hasText: navName }).first();
    if (await legacyTab.count()) {
      // Desktop users now navigate with the command sidebar, while the hidden legacy tab strip
      // remains wired for app routing. Use it only as a test fallback when the dev server is
      // running a cached shell before the sidebar styles hydrate.
      await legacyTab.evaluate((button) => button.click());
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
        {
          id: "workspace-ember-tide",
          name: "Ember & Tide",
          type: "business",
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
        {
          workspaceId: "workspace-ember-tide",
          userId: "local-beta",
          role: "owner",
          status: "active",
          acceptedAt: now,
        },
      ],
      workspaceInvites: [],
      activeWorkspaceId: "workspace-personal-local-beta",
      catalogProducts: [
        {
          id: "catalog-smoke-search-etb",
          name: "Smoke Search Elite Trainer Box",
          productName: "Smoke Search Elite Trainer Box",
          category: "Pokemon",
          catalogType: "sealed",
          productType: "Elite Trainer Box",
          setName: "Smoke Search Set",
          barcode: "098765432109",
          sku: "SMOKE-ETB-1",
          externalProductId: "SMOKE-ETB-EXT",
          packCount: 10,
          imageUrl: "https://example.com/smoke-search-etb.png",
          marketPrice: 60,
          msrpPrice: 49.99,
          sourceType: "smoke",
          marketSource: "Smoke Catalog",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "catalog-smoke-market-action",
          name: "Smoke Market Action Booster Box",
          productName: "Smoke Market Action Booster Box",
          category: "Pokemon",
          catalogType: "sealed",
          productType: "Booster Box",
          setName: "Smoke Market Set",
          barcode: "123456789012",
          sku: "SMOKE-BB-1",
          marketPrice: 119.99,
          msrpPrice: 99.99,
          sourceType: "smoke",
          marketSource: "Smoke Catalog",
          createdAt: now,
          updatedAt: now,
        },
      ],
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
    try {
      await scope.getByLabel(label, { exact: true }).fill(String(value));
    } catch (error) {
      const bodyPreview = await page.locator("body").innerText().catch(() => "");
      error.message = `${error.message}\nBody preview:\n${bodyPreview.slice(0, 1500)}`;
      throw error;
    }
  }

  function addWizardModal() {
    return page.locator('.flow-modal[data-flow="multiDestinationAdd"]').first();
  }

  async function clickAddWizardNext() {
    await addWizardModal().getByRole("button", { name: /^Next/ }).click();
  }

  async function ensureAddWizardDestination(form, destinationLabel) {
    const destination = form.locator("label.destination-checkbox").filter({ hasText: new RegExp(destinationLabel, "i") }).locator("input");
    if (!(await destination.isChecked())) await destination.check();
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

  async function withConfirmStub(returnValue, fn) {
    await page.evaluate((value) => {
      window.__etSmokeConfirmMessages = [];
      if (!window.__etSmokeOriginalConfirm) window.__etSmokeOriginalConfirm = window.confirm;
      window.confirm = (message) => {
        window.__etSmokeConfirmMessages.push(String(message || ""));
        return value;
      };
    }, returnValue);
    try {
      await fn();
      return await page.evaluate(() => window.__etSmokeConfirmMessages || []);
    } finally {
      await page.evaluate(() => {
        if (window.__etSmokeOriginalConfirm) window.confirm = window.__etSmokeOriginalConfirm;
      });
    }
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
      data.userType = "seller";
      data.dashboardPreset = "seller";
      data.profile = {
        ...(data.profile || {}),
        userType: "seller",
        dashboardPreset: "seller",
      };
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

  await step("Workspace: collection management renames, archives, restores, and deletes empty collections", async () => {
    await nav("Vault");
    await page.getByRole("button", { name: "Collection Settings" }).first().click();
    const managerModal = page.locator(".collection-manager-modal").first();
    await managerModal.waitFor({ state: "visible", timeout: 5000 });
    await managerModal.getByRole("button", { name: "Edit Current Collection" }).click();
    const renameModal = page.locator(".workspace-rename-modal").first();
    await renameModal.waitFor({ state: "visible", timeout: 5000 });
    await fillByLabel(renameModal, "Collection name", "Smoke Renamed Collection");
    await renameModal.getByRole("button", { name: "Save Collection" }).click();
    await assertVisibleText("Smoke Renamed Collection");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await nav("Vault");
    await assertVisibleText("Smoke Renamed Collection");
    const renamedWorkspace = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.workspaces || []).find((workspace) => workspace.id === "workspace-personal-local-beta") || null;
    });
    assert.equal(renamedWorkspace?.name, "Smoke Renamed Collection");

    const collectionManagementData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const now = new Date().toISOString();
      data.workspaces = [
        ...(data.workspaces || []).filter((workspace) => workspace.id !== "workspace-empty-smoke"),
        {
          id: "workspace-empty-smoke",
          name: "Smoke Empty Collection",
          type: "business",
          ownerUserId: "local-beta",
          owner_user_id: "local-beta",
          createdAt: now,
          updatedAt: now,
        },
      ];
      data.workspaceMembers = [
        ...(data.workspaceMembers || []).filter((member) => member.workspaceId !== "workspace-empty-smoke" && member.workspace_id !== "workspace-empty-smoke"),
        {
          workspaceId: "workspace-empty-smoke",
          workspace_id: "workspace-empty-smoke",
          userId: "local-beta",
          user_id: "local-beta",
          role: "owner",
          status: "active",
          acceptedAt: now,
        },
      ];
      data.items = [];
      data.expenses = [];
      data.sales = [];
      data.mileageTrips = [];
      data.marketplaceListings = [];
      return data;
    });
    await reloadWithAppData(collectionManagementData);
    await nav("Vault");
    await page.getByRole("button", { name: "Collection Settings" }).first().click();
    const manager = page.locator(".collection-manager-modal").first();
    await manager.waitFor({ state: "visible", timeout: 5000 });
    const emptyCard = manager.locator(".collection-manager-card").filter({ hasText: "Smoke Empty Collection" }).first();
    await emptyCard.getByRole("button", { name: "Archive" }).click();
    const archiveModal = page.locator(".collection-confirm-modal").filter({ hasText: "Archive Smoke Empty Collection" }).first();
    await archiveModal.getByRole("button", { name: "Archive Collection", exact: true }).click();
    await assertVisibleText("Collection archived");
    let emptyWorkspace = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.workspaces || []).find((workspace) => workspace.id === "workspace-empty-smoke") || null;
    });
    assert.ok(emptyWorkspace?.archivedAt || emptyWorkspace?.archived_at, "archived collection should persist archived timestamp");

    const archivedCard = manager.locator(".collection-manager-card").filter({ hasText: "Smoke Empty Collection" }).first();
    await archivedCard.getByRole("button", { name: "Restore" }).click();
    await assertVisibleText("Collection restored");
    await page.waitForFunction(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const workspace = (data.workspaces || []).find((entry) => entry.id === "workspace-empty-smoke");
      return workspace && !workspace.archivedAt && !workspace.archived_at;
    }, null, { timeout: 5000 });
    emptyWorkspace = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.workspaces || []).find((workspace) => workspace.id === "workspace-empty-smoke") || null;
    });
    assert.ok(!emptyWorkspace?.archivedAt && !emptyWorkspace?.archived_at, "restored collection should clear archived timestamp");

    await archivedCard.getByRole("button", { name: "Delete" }).click();
    const deleteModal = page.locator(".collection-confirm-modal").filter({ hasText: "Delete Smoke Empty Collection" }).first();
    await fillByLabel(deleteModal, "Type DELETE to permanently delete this empty collection", "DELETE");
    await deleteModal.getByRole("button", { name: "Delete Permanently" }).click();
    await assertVisibleText("Empty collection deleted");
    const deletedWorkspace = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.workspaces || []).find((workspace) => workspace.id === "workspace-empty-smoke") || null;
    });
    assert.equal(deletedWorkspace, null);
  });

  await step("Forge mode: Ember & Tide lock hides Personal Forge and routes writes", async () => {
    const lockedForgeData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const now = new Date().toISOString();
      data.activeWorkspaceId = "workspace-personal-local-beta";
      data.forgeModeSettings = {
        personalForgeEnabled: false,
        defaultForgeWorkspaceId: "workspace-ember-tide",
        lockToEmberTide: true,
        updatedAt: now,
      };
      localStorage.setItem("et-tcg-forge-mode-settings", JSON.stringify(data.forgeModeSettings));
      data.items = [
        {
          id: "forge-mode-personal-forge",
          name: "Smoke Personal Forge Item",
          destinationScope: ["forge"],
          recordType: "forge_inventory",
          businessInventory: true,
          quantity: 3,
          unitCost: 10,
          marketPrice: 15,
          workspaceId: "workspace-personal-local-beta",
          workspaceName: "My Personal Space",
          status: "In Stock",
          createdAt: now,
        },
        {
          id: "forge-mode-ember-forge",
          name: "Smoke Ember Forge Item",
          destinationScope: ["forge"],
          recordType: "forge_inventory",
          businessInventory: true,
          quantity: 2,
          unitCost: 20,
          marketPrice: 30,
          workspaceId: "workspace-ember-tide",
          workspaceName: "Ember & Tide",
          status: "In Stock",
          createdAt: now,
        },
        {
          id: "forge-mode-vault-source",
          name: "Smoke Locked Vault Source",
          destinationScope: ["vault"],
          recordType: "vault_item",
          vaultStatus: "personal_collection",
          businessInventory: false,
          quantity: 4,
          unitCost: 12,
          marketPrice: 18,
          workspaceId: "workspace-personal-local-beta",
          workspaceName: "My Personal Space",
          status: "Personal Collection",
          createdAt: now,
        },
      ];
      return data;
    });
    await reloadWithAppData(lockedForgeData);
    await nav("Forge");
    await assertVisibleText("Smoke Ember Forge Item");
    assert.equal(await page.getByText("Smoke Personal Forge Item", { exact: false }).count(), 0, "Personal Forge inventory should be hidden while Personal Forge is disabled");
    await page.reload({ waitUntil: "domcontentloaded" });
    await nav("Forge");
    await assertVisibleText("Smoke Ember Forge Item");

    await page.getByRole("button", { name: "Add Inventory", exact: true }).first().click();
    const lockedAddForm = page.locator("form#multi-destination-add-form").first();
    await lockedAddForm.getByRole("button", { name: "Manual Add" }).first().click();
    await fillByLabel(lockedAddForm, "Item Name", "Smoke Locked Forge Add");
    await fillByLabel(lockedAddForm, "Type / Category", "Booster Bundle");
    await clickAddWizardNext();
    await ensureAddWizardDestination(lockedAddForm, "Forge");
    await clickAddWizardNext();
    const forgeWorkspaceSelect = lockedAddForm.getByLabel("Forge Workspace");
    if (await forgeWorkspaceSelect.isVisible().catch(() => false)) {
      assert.equal(await forgeWorkspaceSelect.inputValue(), "workspace-ember-tide");
      const forgeWorkspaceOptions = await forgeWorkspaceSelect.locator("option").allTextContents();
      assert.equal(forgeWorkspaceOptions.some((option) => /My Personal Space/i.test(option)), false, "Personal Forge should be hidden from Forge workspace choices");
    }
    await fillByLabel(lockedAddForm, "Quantity for Forge", "1");
    await fillByLabel(lockedAddForm, "Cost Basis", "10");
    await clickAddWizardNext();
    await page.locator(".flow-modal").getByRole("button", { name: /Save and Close/ }).click();
    const lockedAddRecord = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.items || []).find((item) => item.name === "Smoke Locked Forge Add") || null;
    });
    assert.equal(lockedAddRecord?.workspaceId, "workspace-ember-tide");

    await nav("Vault");
    await assertVisibleText("Smoke Locked Vault Source");
    await page.locator(".compact-card").filter({ hasText: "Smoke Locked Vault Source" }).first().getByRole("button", { name: "Move to Forge" }).click();
    const lockedTransferModal = page.locator(".vault-transfer-modal").first();
    await lockedTransferModal.waitFor({ state: "visible", timeout: 5000 });
    await fillByLabel(lockedTransferModal, "How many do you want to move to Forge?", "2");
    await lockedTransferModal.getByRole("button", { name: /Move 2 to Ember & Tide/ }).click();
    await assertVisibleText("Moved 2 to Ember & Tide. 2 remain in Vault.");
    const lockedTransfer = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const source = (data.items || []).find((item) => item.id === "forge-mode-vault-source");
      const forge = (data.items || []).find((item) => item.name === "Smoke Locked Vault Source" && (item.destinationScope || []).includes("forge"));
      return { source, forge };
    });
    assert.equal(Number(lockedTransfer.source?.quantity), 2);
    assert.equal(lockedTransfer.forge?.workspaceId, "workspace-ember-tide");
    assert.equal(Number(lockedTransfer.forge?.quantity), 2);

    const resetForgeModeData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      data.items = [];
      data.activeWorkspaceId = "workspace-personal-local-beta";
      data.forgeModeSettings = {
        personalForgeEnabled: true,
        defaultForgeWorkspaceId: "",
        lockToEmberTide: false,
      };
      localStorage.setItem("et-tcg-forge-mode-settings", JSON.stringify(data.forgeModeSettings));
      return data;
    });
    await reloadWithAppData(resetForgeModeData);
  });

  await step("Catalog: Add Item search finds seeded sealed products", async () => {
    await nav("Forge");
    await page.getByRole("button", { name: "Add Inventory", exact: true }).first().click();
    const form = page.locator("form#multi-destination-add-form").first();
    const searchInput = form.getByPlaceholder("Search Pokemon product, set, UPC, or card name");
    await searchInput.fill("mini portfolio");
    await form.locator(".catalog-picker-card").filter({ hasText: /Mini Portfolio|Portfolio/i }).first().waitFor({ state: "visible", timeout: 7000 });
    await searchInput.fill("collector chest");
    await form.locator(".catalog-picker-card").filter({ hasText: /Collector/i }).first().waitFor({ state: "visible", timeout: 7000 });
    await searchInput.fill("prismatic");
    await form.locator(".catalog-picker-card").filter({ hasText: "Prismatic Evolutions" }).first().waitFor({ state: "visible", timeout: 7000 });
    await page.keyboard.press("Escape");
    await page.locator('.flow-modal[data-flow="multiDestinationAdd"]').first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  });

  await step("Add Item: validation errors are visible inside the wizard", async () => {
    await nav("Forge");
    await page.getByRole("button", { name: "Add Inventory", exact: true }).first().click();
    const form = page.locator("form#multi-destination-add-form").first();
    await form.waitFor({ state: "visible", timeout: 5000 });

    await clickAddWizardNext();
    await assertVisibleText("Please fix 1 item before saving.");
    await assertVisibleText("Choose an item or add one manually.");
    await form.locator('[data-validation-field="item-name"] .field-error').waitFor({ state: "visible", timeout: 5000 });

    await form.getByRole("button", { name: "Manual Add" }).first().click();
    await form.locator('[data-validation-field="item-name"] input').fill("Smoke Validation ETB");
    assert.equal(await form.locator('[data-validation-field="item-name"] .field-error').count(), 0, "Correcting the item should clear the inline item error");
    await clickAddWizardNext();

    const forgeDestination = form.locator("label.destination-checkbox").filter({ hasText: /Forge/i }).locator("input").first();
    if (await forgeDestination.isChecked()) {
      await forgeDestination.setChecked(false, { force: true });
    }
    await clickAddWizardNext();
    await assertVisibleText("Choose where this should go.");
    await form.locator('[data-validation-field="destination"]').waitFor({ state: "visible", timeout: 5000 });

    await ensureAddWizardDestination(form, "Forge");
    await clickAddWizardNext();
    const forgeQuantity = form.getByLabel("Quantity for Forge");
    await forgeQuantity.fill("");
    await clickAddWizardNext();
    await assertVisibleText("Forge quantity: Enter a quantity.");
    await form.locator('[data-validation-field="forge-quantity"] .field-error').waitFor({ state: "visible", timeout: 5000 });
    await forgeQuantity.fill("0");
    await clickAddWizardNext();
    await assertVisibleText("Quantity must be at least 1.");
    await forgeQuantity.fill("2");
    assert.equal(await form.locator('[data-validation-field="forge-quantity"] .field-error').count(), 0, "Correcting quantity should clear the inline quantity error");

    await clickAddWizardNext();
    await assertVisibleText("Review and Add");
    await page.locator(".flow-modal").getByRole("button", { name: /Save and Close/ }).click();
    await assertVisibleText("Smoke Validation ETB");
    const validationCleanupData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      data.items = (data.items || []).filter((item) => item.name !== "Smoke Validation ETB" && item.itemName !== "Smoke Validation ETB");
      localStorage.setItem("et-tcg-beta-data", JSON.stringify(data));
      return data;
    });
    await reloadWithAppData(validationCleanupData);
  });

  await step("Purchasers: managed list controls Who paid options", async () => {
    await nav("Forge");
    await page.getByRole("button", { name: "Add Inventory", exact: true }).first().click();
    const form = page.locator("form#multi-destination-add-form").first();
    const manualFallback = form.getByRole("button", { name: "Can't find it? Add manually" }).first();
    if (await manualFallback.isVisible().catch(() => false)) await manualFallback.click();
    await fillByLabel(form, "Item Name", "Smoke Purchaser Forge Item");
    await fillByLabel(form, "Type / Category", "Elite Trainer Box");
    await clickAddWizardNext();
    await ensureAddWizardDestination(form, "Forge");
    await clickAddWizardNext();

    const purchaserSelect = form.getByLabel("Who paid?");
    const initialPurchaserOptions = await purchaserSelect.locator("option").allTextContents();
    assert.equal(initialPurchaserOptions.some((text) => /^(Personal|Business|Kids|Other)$/i.test(text.trim())), false, "Who paid should not show generated default purchasers");
    await assertVisibleText("No purchasers yet. Add one to track who paid.");

    await purchaserSelect.selectOption("__add__");
    const inlinePurchaserForm = form.locator(".purchaser-inline-form").first();
    await inlinePurchaserForm.getByPlaceholder("Display name").fill("Smoke Buyer");
    await inlinePurchaserForm.getByPlaceholder(/Optional note/i).fill("business card");
    await inlinePurchaserForm.getByRole("button", { name: "Save Purchaser" }).click();
    await fillByLabel(form, "Quantity for Forge", "1");
    await fillByLabel(form, "Cost Basis", "10");
    await clickAddWizardNext();
    await page.locator(".flow-modal").getByRole("button", { name: /Save and Close/ }).click();
    await assertVisibleText("Smoke Purchaser Forge Item");

    const savedPurchaserState = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const purchaser = (data.purchasers || []).find((entry) => entry.name === "Smoke Buyer");
      const item = (data.items || []).find((entry) => entry.name === "Smoke Purchaser Forge Item");
      return { purchaser, item };
    });
    assert.equal(savedPurchaserState.purchaser?.note, "business card");
    assert.equal(savedPurchaserState.purchaser?.active, true);
    assert.equal(savedPurchaserState.item?.purchaserName, "Smoke Buyer");

    await page.getByRole("button", { name: "Add Inventory", exact: true }).first().click();
    const secondForm = page.locator("form#multi-destination-add-form").first();
    const secondManualFallback = secondForm.getByRole("button", { name: "Can't find it? Add manually" }).first();
    if (await secondManualFallback.isVisible().catch(() => false)) await secondManualFallback.click();
    await fillByLabel(secondForm, "Item Name", "Smoke Purchaser Draft");
    await fillByLabel(secondForm, "Type / Category", "Elite Trainer Box");
    await clickAddWizardNext();
    await ensureAddWizardDestination(secondForm, "Forge");
    await clickAddWizardNext();
    await secondForm.getByLabel("Who paid?").selectOption("__manage__");
    const manager = page.locator(".purchaser-manager-modal").first();
    await manager.waitFor({ state: "visible", timeout: 5000 });
    await overflowAction(manager.locator(".compact-card").filter({ hasText: "Smoke Buyer" }).first(), "Edit");
    await manager.getByPlaceholder("Purchaser name").fill("Smoke Buyer Renamed");
    await manager.getByRole("button", { name: "Save" }).click();
    await assertVisibleText("Renamed purchaser to Smoke Buyer Renamed.");
    await overflowAction(manager.locator(".compact-card").filter({ hasText: "Smoke Buyer Renamed" }).first(), "Archive");
    await assertVisibleText("Archived");
    await manager.getByRole("button", { name: "Close", exact: true }).click();

    const archivedState = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const purchaser = (data.purchasers || []).find((entry) => entry.name === "Smoke Buyer Renamed");
      const item = (data.items || []).find((entry) => entry.name === "Smoke Purchaser Forge Item");
      return { purchaser, item };
    });
    assert.equal(archivedState.purchaser?.active, false);
    assert.equal(archivedState.item?.purchaserName, "Smoke Buyer Renamed");
    const activeOptionsAfterArchive = await secondForm.getByLabel("Who paid?").locator("option").allTextContents();
    assert.equal(activeOptionsAfterArchive.some((text) => /Smoke Buyer Renamed/.test(text)), false, "Archived purchasers should not appear for new items");
    await page.locator(".flow-modal").getByRole("button", { name: "Cancel" }).click();
    const purchaserCleanupData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      data.items = (data.items || []).filter((item) => !String(item.name || "").startsWith("Smoke Purchaser"));
      data.purchasers = (data.purchasers || []).filter((purchaser) => !String(purchaser.name || "").startsWith("Smoke Buyer"));
      localStorage.setItem("et-tcg-beta-data", JSON.stringify(data));
      return data;
    });
    await reloadWithAppData(purchaserCleanupData);
  });

  await step("Public identity: Marketplace and Tidepool render usernames", async () => {
    const identityData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const now = new Date().toISOString();
      data.profile = {
        ...(data.profile || {}),
        userId: "local-beta",
        email: "local beta mode",
        firstName: "Smoke",
        lastName: "Collector",
        displayName: "Private Smoke Name",
        publicUsername: "smoke_trader",
        public_username: "smoke_trader",
        username: "smoke_trader",
        updatedAt: now,
      };
      data.marketplaceListings = [
        ...(data.marketplaceListings || []).filter((listing) => listing.id !== "marketplace-public-identity-smoke"),
        {
          id: "marketplace-public-identity-smoke",
          sellerUserId: "local-beta",
          sellerDisplayName: "Private Smoke Name",
          sellerUsername: "smoke_trader",
          listingType: "For Sale",
          title: "Smoke Public Username ETB",
          category: "Pokemon",
          productType: "Elite Trainer Box",
          condition: "Sealed",
          quantity: 1,
          askingPrice: 49.99,
          tradeValue: 0,
          locationCity: "Chesapeake",
          locationState: "VA",
          pickupOnly: true,
          shippingAvailable: false,
          intendedForKids: true,
          status: "Active",
          photos: [],
          createdAt: now,
          updatedAt: now,
          workspaceId: "workspace-personal-local-beta",
          workspace_id: "workspace-personal-local-beta",
        },
      ];
      localStorage.setItem("et-tcg-beta-data", JSON.stringify(data));

      const tidepool = JSON.parse(localStorage.getItem("et-tcg-beta-tidepool") || '{"posts":[],"comments":[],"reactions":[]}');
      tidepool.posts = [
        {
          postId: "tidepool-public-identity-smoke",
          userId: "local-beta",
          displayName: "Private Smoke Name",
          username: "smoke_trader",
          publicUsername: "smoke_trader",
          postType: "General post",
          title: "Smoke username post",
          body: "Public identity smoke test.",
          city: "Chesapeake",
          state: "VA",
          createdAt: now,
          updatedAt: now,
          status: "active",
          verificationStatus: "unverified",
          commentCount: 0,
          reactionCount: 0,
          sourceType: "user",
        },
        ...(tidepool.posts || []).filter((post) => post.postId !== "tidepool-public-identity-smoke"),
      ];
      localStorage.setItem("et-tcg-beta-tidepool", JSON.stringify(tidepool));
      return data;
    });
    await reloadWithAppData(identityData);

    await nav("Forge");
    await page.locator(".forge-overview-card").filter({ hasText: "Marketplace" }).first().click();
    await assertVisibleText("Smoke Public Username ETB");
    await assertVisibleText("@smoke_trader");
    await assertNotVisibleText("Private Smoke Name");

    await nav("Tidepool");
    await assertVisibleText("Smoke username post");
    await assertVisibleText("@smoke_trader");
    await assertNotVisibleText("Private Smoke Name");
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

  async function openScoutReportWizard() {
    await nav("Scout");
    if (await page.locator("form.scout-report-flow").count() === 0) {
      await page.getByRole("button", { name: /^Submit Report$/ }).first().click();
    }
    const form = page.locator("form.scout-report-flow").first();
    await form.waitFor({ state: "visible", timeout: 10000 });
    return form;
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
      reportDate = "",
      reportTime = "",
    } = options;

    const itemStep = form.getByText(/What did you see\?|Select item or product/i);
    if (!(await itemStep.isVisible().catch(() => false))) {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      throw new Error(`Scout wizard did not open at the item/product step.\n${bodyText.slice(0, 1600)}`);
    }

    if (productName) {
      await form.getByPlaceholder(/Search product|Optional: ETB|booster bundle|UPC|SKU/i).fill(productName);
    }
    const reportTypeButton = form.getByRole("button", { name: new RegExp(reportType, "i") }).first();
    await reportTypeButton.click();
    await page.waitForFunction(
      (button) => button?.classList?.contains("selected"),
      await reportTypeButton.elementHandle(),
      { timeout: 3000 }
    );
    await form.getByRole("button", { name: "Next" }).click();

    const storeSearch = form.getByPlaceholder("Search store, city, ZIP, nickname, or address").first();
    if (await storeSearch.count()) {
      await storeSearch.fill(storeSearchText);
    }
    const smokeStoreCard = form.locator(".scout-report-store-card").filter({ hasText: storeSearchText }).first();
    await smokeStoreCard.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    if (await smokeStoreCard.isVisible().catch(() => false)) {
      await smokeStoreCard.getByRole("button", { name: /Choose this store|Report here/i }).click();
      const selectedStoreCard = form.locator(".scout-report-store-card.selected").filter({ hasText: storeSearchText }).first();
      await selectedStoreCard.waitFor({ state: "visible", timeout: 5000 });
      assert.match(await selectedStoreCard.innerText(), /Store selected|Manual location selected/i);
    } else {
      const formText = await form.innerText().catch(() => "");
      throw new Error(`Scout wizard did not show the requested store "${storeSearchText}".\n${formText.slice(0, 1200)}`);
    }
    await form.getByRole("button", { name: "Next" }).click();

    if (note) {
      await form.getByPlaceholder(/Optional quick note/i).fill(note);
    }

    const proofLabel = proof === "Skip proof" ? "No proof" : proof;
    await form.getByRole("button", { name: new RegExp(proofLabel, "i") }).first().click();
    if (file) {
      await form.locator('input[type="file"]').setInputFiles(file);
    }
    if (proofText) {
      await form.getByPlaceholder(/Receipt detail|screenshot note|site link/i).fill(proofText);
    }
    if (quantity) {
      await form.getByPlaceholder(/Optional qty|estimate/i).fill(quantity);
    }
    if (price) {
      await form.getByLabel("Price / MSRP").fill(price);
    }
    if (reportDate) {
      const reportDateInput = form.getByRole("textbox", { name: "Report date" });
      await reportDateInput.fill(reportDate);
      assert.equal(await reportDateInput.inputValue(), reportDate);
    }
    if (reportTime) {
      const reportTimeInput = form.getByRole("textbox", { name: "Report time" });
      await reportTimeInput.fill(reportTime);
      assert.equal(await reportTimeInput.inputValue(), reportTime);
    }
    if (stockLeft) {
      const stockButton = form.getByRole("button", { name: new RegExp(stockLeft, "i") }).first();
      await stockButton.click();
      await page.waitForFunction(
        (button) => button?.classList?.contains("selected"),
        await stockButton.elementHandle(),
        { timeout: 3000 }
      );
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

  await step("Scout: report wizard shows visible selected choices", async () => {
    const visibleStore = {
      id: "smoke-visible-selection-target",
      name: "Visible Selection Target",
      nickname: "Visible Selection Target",
      chain: "Target",
      retailer: "Target",
      city: "Chesapeake",
      address: "44 Visible Choice Way",
    };
    await page.evaluate((store) => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-scout") || "{}");
      data.stores = [store, ...(data.stores || []).filter((candidate) => (candidate.id || candidate.storeId) !== store.id)];
      localStorage.setItem("et-tcg-beta-scout", JSON.stringify(data));
    }, visibleStore);
    await page.reload({ waitUntil: "domcontentloaded" });
    const form = await openScoutReportWizard();

    await form.getByText("What did you see?").waitFor({ state: "visible", timeout: 5000 });
    const categoryButton = form.getByRole("button", { name: /One Piece/i }).first();
    await categoryButton.click();
    await page.waitForFunction(
      (button) => button?.classList?.contains("selected") && button?.getAttribute("aria-pressed") === "true",
      await categoryButton.elementHandle(),
      { timeout: 3000 }
    );
    await assertVisibleText("Current choice");
    await assertVisibleText("Selected");
    await form.getByRole("button", { name: "Next" }).click();

    await form.getByPlaceholder("Search store, city, ZIP, nickname, or address").fill(visibleStore.nickname);
    const storeCard = form.locator(".scout-report-store-card").filter({ hasText: visibleStore.nickname }).first();
    await storeCard.waitFor({ state: "visible", timeout: 5000 });
    await storeCard.getByRole("button", { name: /Choose this store|Report here/i }).click();
    const selectedStoreCard = form.locator(".scout-report-store-card.selected").filter({ hasText: visibleStore.nickname }).first();
    await selectedStoreCard.waitFor({ state: "visible", timeout: 5000 });
    assert.match(await selectedStoreCard.innerText(), /Store selected/);
    await form.getByRole("button", { name: "Next" }).click();

    const stockFoundButton = form.getByRole("button", { name: /Yes, some left/i }).first();
    await stockFoundButton.click();
    await page.waitForFunction(
      (button) => button?.classList?.contains("selected") && button?.getAttribute("aria-pressed") === "true",
      await stockFoundButton.elementHandle(),
      { timeout: 3000 }
    );

    const receiptProof = form.getByRole("button", { name: /Receipt/i }).first();
    await receiptProof.click();
    await page.waitForFunction(
      (button) => button?.classList?.contains("selected") && button?.getAttribute("aria-pressed") === "true",
      await receiptProof.elementHandle(),
      { timeout: 3000 }
    );
    const stockLeftButton = form.getByRole("button", { name: /Yes, some left/i }).first();
    await stockLeftButton.click();
    await page.waitForFunction(
      (button) => button?.classList?.contains("selected") && button?.getAttribute("aria-pressed") === "true",
      await stockLeftButton.elementHandle(),
      { timeout: 3000 }
    );
    await form.getByRole("button", { name: "Next" }).click();
    await assertVisibleText("Reporting at: Visible Selection Target");
    await assertVisibleText("Product/category");
    await assertVisibleText("One Piece");
    await assertVisibleText("Stock left");
    await assertVisibleText("Yes, some left");
    await closeOpenModals();
  });

  async function submitScoutWizardIfNeeded(form) {
    const explicitAction = form.getByRole("button", { name: /Submit Report|Save Guess/i }).last();
    if (await explicitAction.isVisible().catch(() => false)) {
      await explicitAction.click();
      return;
    }
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

  await step("Scout: reports preserve selected stores and remain visible", async () => {
    const exactStores = [
      {
        id: "smoke-exact-target",
        name: "Smoke Exact Target",
        nickname: "Smoke Exact Target",
        chain: "Target",
        retailer: "Target",
        city: "Norfolk",
        address: "10 Exact Target Way",
      },
      {
        id: "smoke-exact-walmart-richmond",
        name: "Smoke Exact Walmart Richmond",
        nickname: "Smoke Exact Walmart Richmond",
        chain: "Walmart",
        retailer: "Walmart",
        city: "Richmond",
        address: "20 Exact Walmart Way",
      },
      {
        id: "smoke-exact-gamestop",
        name: "Smoke Exact GameStop",
        nickname: "Smoke Exact GameStop",
        chain: "GameStop",
        retailer: "GameStop",
        city: "Virginia Beach",
        address: "30 Exact GameStop Way",
      },
    ];
    await page.evaluate((stores) => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-scout") || "{}");
      const incomingIds = new Set(stores.map((store) => store.id));
      data.stores = [...stores, ...(data.stores || []).filter((store) => !incomingIds.has(store.id || store.storeId))];
      data.reports = (data.reports || []).filter((report) => !String(report.productName || report.itemName || "").startsWith("Exact Scout"));
      localStorage.setItem("et-tcg-beta-scout", JSON.stringify(data));
    }, exactStores);
    await page.reload({ waitUntil: "domcontentloaded" });

    for (const store of exactStores) {
      const form = await openScoutReportWizard();
      await fillScoutReportWizard(form, {
        storeSearchText: store.nickname,
        productName: `Exact Scout ${store.retailer} ETB`,
        quantity: "1",
        note: `Exact report for ${store.nickname}`,
        reportDate: "2026-05-18",
        reportTime: "10:15",
      });
      await assertVisibleText(store.nickname);
      await submitScoutWizardIfNeeded(form);
      await closeScoutSubmitSuccess();
    }

    const savedReports = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-scout") || "{}");
      return (data.reports || [])
        .filter((report) => String(report.productName || report.itemName || "").startsWith("Exact Scout"))
        .map((report) => ({
          productName: report.productName || report.itemName,
          storeId: report.storeId || report.store_id,
          storeName: report.storeName || report.store_name,
          retailer: report.retailer || report.chain,
          workspaceId: report.workspaceId || report.workspace_id || "",
        }));
    });
    assert.equal(savedReports.length, 3, "three exact Scout reports should be saved");
    for (const store of exactStores) {
      const report = savedReports.find((candidate) => candidate.storeId === store.id);
      assert.ok(report, `report should preserve store id ${store.id}`);
      assert.equal(report.storeName, store.nickname);
      assert.equal(report.retailer, store.retailer);
      assert.notEqual(report.storeName, "Suffolk Walmart");
    }

    await nav("Scout");
    for (const store of exactStores) {
      await assertVisibleText(store.nickname);
      await assertVisibleText(`Exact Scout ${store.retailer} ETB`);
    }

    const filterSelect = page.locator(".scout-compact-filterbar select").first();
    if (await filterSelect.isVisible().catch(() => false)) {
      await filterSelect.selectOption("Verified");
      await assertVisibleText("Filters are hiding reports");
      await page.getByRole("button", { name: "Reset filters" }).first().click();
      await assertVisibleText("Smoke Exact Target");
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await nav("Scout");
    for (const store of exactStores) {
      await assertVisibleText(store.nickname);
      await assertVisibleText(`Exact Scout ${store.retailer} ETB`);
    }

    const blankForm = await openScoutReportWizard();
    await blankForm.getByRole("button", { name: "Next" }).click();
    await blankForm.getByRole("button", { name: "Next" }).click();
    await assertVisibleText("Choose the store or enter a manual store/location before submitting.");
    await closeOpenModals();
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
      reportDate: "2026-05-16",
      reportTime: "09:30",
    });
    await submitScoutWizardIfNeeded(reportForm);
    await assertVisibleText("Smoke ETB");
    const savedScoutReport = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-scout") || "{}");
      return (data.reports || []).find((report) => report.productName === "Smoke ETB" || report.itemName === "Smoke ETB") || null;
    });
    assert.ok(savedScoutReport, "Scout report should be saved to local beta storage");
    assert.equal(savedScoutReport.reportDate, "2026-05-16");
    assert.equal(savedScoutReport.reportTime, "09:30");
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
    const forgeCatalogData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const now = new Date().toISOString();
      data.catalogProducts = [
        ...(data.catalogProducts || []).filter((product) => product.id !== "catalog-smoke-search-etb"),
        {
          id: "catalog-smoke-search-etb",
          name: "Smoke Search Elite Trainer Box",
          productName: "Smoke Search Elite Trainer Box",
          category: "Pokemon",
          catalogType: "sealed",
          productType: "Elite Trainer Box",
          setName: "Smoke Search Set",
          barcode: "098765432109",
          sku: "SMOKE-ETB-1",
          externalProductId: "SMOKE-ETB-EXT",
          packCount: 10,
          imageUrl: "https://example.com/smoke-search-etb.png",
          marketPrice: 60,
          msrpPrice: 49.99,
          sourceType: "smoke",
          marketSource: "Smoke Catalog",
          createdAt: now,
          updatedAt: now,
        },
      ];
      localStorage.setItem("et-tcg-beta-data", JSON.stringify(data));
      return data;
    });
    await reloadWithAppData(forgeCatalogData);
    await nav("Forge");
    await page.getByRole("button", { name: "Add Inventory", exact: true }).first().click();
    const form = page.locator("form#multi-destination-add-form").first();
    await form.getByPlaceholder("Search Pokemon product, set, UPC, or card name").fill("Prismatic Evolutions Elite Trainer Box");
    const smokeCatalogResult = form.locator(".catalog-picker-card").filter({ hasText: "Prismatic Evolutions Elite Trainer Box", hasNotText: "Code Card" }).first();
    await smokeCatalogResult.waitFor({ state: "visible", timeout: 5000 });
    await smokeCatalogResult.click();
    await assertVisibleText("Selected item");
    await clickAddWizardNext();
    await ensureAddWizardDestination(form, "Forge");
    await clickAddWizardNext();
    assert.equal(await form.getByLabel("Cost Basis", { exact: true }).inputValue(), "49.99", "Known catalog MSRP should auto-fill Forge cost basis");
    await fillByLabel(form, "Quantity for Forge", "2");
    await fillByLabel(form, "Cost Basis", "40");
    await fillByLabel(form, "Planned Sell Price", "55");
    await fillByLabel(form, "Source / Purchase Location", "Smoke Shared Target");
    await form.getByLabel("Where is this inventory?").selectOption("Storage");
    await clickAddWizardNext();
    await page.locator(".flow-modal").getByRole("button", { name: /Save and Close/ }).click();
    await assertVisibleText("Prismatic Evolutions Elite Trainer Box");
    const smokeForgeCard = page.locator(".compact-card").filter({ hasText: "Prismatic Evolutions Elite Trainer Box" }).first();
    await page.locator(".forge-more-filters summary").click();
    await page.getByLabel("Physical location").selectOption("Storage");
    await smokeForgeCard.waitFor({ state: "visible", timeout: 5000 });
    await page.getByLabel("Physical location").selectOption("At Home");
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Prismatic Evolutions Elite Trainer Box" }).count(), 0, "Storage item should be hidden by the At Home physical location filter");
    await page.getByLabel("Physical location").selectOption("All");
    await smokeForgeCard.waitFor({ state: "visible", timeout: 5000 });
    await smokeForgeCard.getByRole("button", { name: "View" }).click();
    await assertVisibleText("Smoke Shared Target");
    await assertVisibleText("Storage");
    await page.getByRole("button", { name: "Close" }).click();

    await nav("Vault");
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Prismatic Evolutions Elite Trainer Box" }).count(), 0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await nav("Forge");
    await assertVisibleText("Prismatic Evolutions Elite Trainer Box");
    const savedForgeRecord = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.items || []).find((item) => item.name === "Prismatic Evolutions Elite Trainer Box") || null;
    });
    assert.equal(savedForgeRecord?.productType, "Elite Trainer Box");
    assert.equal(Number(savedForgeRecord?.msrpPrice), 49.99);
    assert.equal(Number(savedForgeRecord?.unitCost), 40, "User-edited cost should override the catalog MSRP default");

    await overflowAction(page.locator(".compact-card").filter({ hasText: "Prismatic Evolutions Elite Trainer Box" }), "Edit");
    const editForm = page.locator("form.form").last();
    await editForm.getByText("Step 4: Optional Details").click();
    await editForm.getByLabel("Inventory location").selectOption("Other");
    await fillByLabel(editForm, "Custom physical location notes", "Black tote 2");
    await fillByLabel(editForm, "Unit Cost", "0");
    await fillByLabel(editForm, "Item Name", "Smoke Forge ETB Edited");
    await editForm.getByRole("button", { name: "Save Changes" }).click();
    await assertVisibleText("Smoke Forge ETB Edited");
    const editedForgeRecord = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.items || []).find((item) => item.name === "Smoke Forge ETB Edited") || null;
    });
    assert.equal(editedForgeRecord?.physicalLocation, "Other");
    assert.equal(editedForgeRecord?.physicalLocationNotes, "Black tote 2");
    assert.equal(Number(editedForgeRecord?.unitCost), 0, "Forge edit should save a zero unit cost instead of failing validation");

    const forgeDeleteCard = page.locator(".compact-card").filter({ hasText: "Smoke Forge ETB Edited" });
    const cancelledForgeDelete = await withConfirmStub(false, async () => {
      await overflowAction(forgeDeleteCard, "Delete Forge item");
    });
    assert.match(cancelledForgeDelete.join("\n"), /Delete Forge inventory item\?/);
    assert.match(cancelledForgeDelete.join("\n"), /Vault collection records are not removed/);
    await assertVisibleText("Smoke Forge ETB Edited");

    const acceptedForgeDelete = await withConfirmStub(true, async () => {
      await overflowAction(forgeDeleteCard, "Delete Forge item");
    });
    assert.match(acceptedForgeDelete.join("\n"), /Delete Forge inventory item\?/);
    await assertVisibleText("Ready to track your first sale?");
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

  await step("Expenses: grouped vendor view summarizes and opens records", async () => {
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const now = new Date().toISOString();
      data.expenses = [
        ...(data.expenses || []).filter((expense) => !String(expense.id || "").startsWith("expense-group-smoke-")),
        {
          id: "expense-group-smoke-walmart-1",
          expenseId: "expense-group-smoke-walmart-1",
          date: "2026-05-17",
          vendor: "Walmart #1234",
          category: "Supplies",
          subcategory: "Top loaders",
          buyer: "Zena",
          amount: 100,
          paymentMethod: "Card",
          notes: "Grouped expense smoke test one",
          workspaceId: "workspace-personal-local-beta",
          workspace_id: "workspace-personal-local-beta",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "expense-group-smoke-walmart-2",
          expenseId: "expense-group-smoke-walmart-2",
          date: "2026-05-18",
          vendor: "WALMART SUPERCENTER",
          category: "Supplies",
          subcategory: "Sleeves",
          buyer: "Zena",
          amount: 50,
          paymentMethod: "Card",
          notes: "Grouped expense smoke test two",
          workspaceId: "workspace-personal-local-beta",
          workspace_id: "workspace-personal-local-beta",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "expense-group-smoke-target",
          expenseId: "expense-group-smoke-target",
          date: "2026-05-16",
          vendor: "Target",
          category: "Shipping",
          subcategory: "Boxes",
          buyer: "Zena",
          amount: 20,
          paymentMethod: "Cash",
          notes: "Grouped expense smoke target",
          workspaceId: "workspace-personal-local-beta",
          workspace_id: "workspace-personal-local-beta",
          createdAt: now,
          updatedAt: now,
        },
      ];
      localStorage.setItem("et-tcg-beta-data", JSON.stringify(data));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await nav("Forge");
    const receiptsNav = page.getByRole("button", { name: /Receipts Review/i }).first();
    if (await receiptsNav.isVisible().catch(() => false)) {
      await receiptsNav.click();
    } else {
      await page.locator(".forge-overview-card").filter({ hasText: "Expenses" }).first().click();
    }
    await assertVisibleText("Business Expenses");

    const walmartGroup = page.locator(".expense-vendor-card").filter({ hasText: "Walmart" });
    await walmartGroup.first().waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await walmartGroup.count(), 1, "Walmart variants should group into one vendor card");
    await assertVisibleText("$150.00");
    await assertVisibleText("2 expenses");
    await walmartGroup.first().click();
    const vendorModal = page.locator(".expense-vendor-detail-modal").first();
    await vendorModal.waitFor({ state: "visible", timeout: 5000 });
    await assertVisibleText("Walmart #1234");
    await assertVisibleText("WALMART SUPERCENTER");
    assert.equal(await vendorModal.locator(".expense-record-card").count(), 2);

    await overflowAction(vendorModal.locator(".expense-record-card").filter({ hasText: "Walmart #1234" }).first(), "Edit Expense");
    const editExpenseModal = page.locator('.flow-modal[data-flow="addExpense"]').last();
    await editExpenseModal.waitFor({ state: "visible", timeout: 5000 });
    await fillByLabel(editExpenseModal, "Amount", "111.11");
    await editExpenseModal.getByRole("button", { name: "Save Expense" }).click();
    await assertVisibleText("$111.11");
    const editedExpense = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.expenses || []).find((expense) => expense.id === "expense-group-smoke-walmart-1");
    });
    assert.equal(Number(editedExpense?.amount), 111.11);

    await overflowAction(vendorModal.locator(".expense-record-card").filter({ hasText: "WALMART SUPERCENTER" }).first(), "Delete Expense");
    await page.waitForTimeout(300);
    assert.equal(await vendorModal.locator(".expense-record-card").filter({ hasText: "WALMART SUPERCENTER" }).count(), 0);
    await vendorModal.getByRole("button", { name: "Close", exact: true }).click();

    await fillByLabel(page.locator(".expense-toolbar"), "Search expenses", "walmart");
    assert.equal(await page.locator(".expense-vendor-card").filter({ hasText: "Walmart" }).count(), 1);
    assert.equal(await page.locator(".expense-vendor-card").filter({ hasText: "Target" }).count(), 0);
    await page.getByRole("button", { name: "Clear filters" }).click();
    await page.locator(".expense-toolbar").getByLabel("Category").selectOption("Shipping");
    await assertVisibleText("Target");
    await assertVisibleText("$20.00");
  });

  await step("Mileage: groups logs by vehicle and opens trip details", async () => {
    const mileageData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      data.vehicles = [
        ...(data.vehicles || []).filter((vehicle) => !String(vehicle.id || "").startsWith("vehicle-group-smoke-")),
        {
          id: "vehicle-group-smoke-prius",
          name: "Smoke Toyota Prius",
          owner: "Zena",
          averageMpg: 48,
          wearCostPerMile: 0.12,
          workspaceId: "workspace-personal-local-beta",
          workspace_id: "workspace-personal-local-beta",
          createdAt: new Date().toISOString(),
        },
        {
          id: "vehicle-group-smoke-van",
          name: "Smoke Trade Van",
          owner: "Dillon",
          averageMpg: 22,
          wearCostPerMile: 0.18,
          workspaceId: "workspace-personal-local-beta",
          workspace_id: "workspace-personal-local-beta",
          createdAt: new Date().toISOString(),
        },
      ];
      data.mileageTrips = [
        ...(data.mileageTrips || []).filter((trip) => !String(trip.id || "").startsWith("mileage-group-smoke-")),
        {
          id: "mileage-group-smoke-prius-1",
          vehicleId: "vehicle-group-smoke-prius",
          vehicleName: "Smoke Toyota Prius",
          purpose: "Target restock loop",
          driver: "Zena",
          startMiles: 1000,
          endMiles: 1010,
          businessMiles: 10,
          gasPrice: 3.2,
          fuelCost: 0.67,
          wearCost: 1.2,
          totalVehicleCost: 1.87,
          mileageValue: 6.7,
          workspaceId: "workspace-personal-local-beta",
          workspace_id: "workspace-personal-local-beta",
          createdAt: "2026-05-15T12:00:00.000Z",
        },
        {
          id: "mileage-group-smoke-prius-2",
          vehicleId: "vehicle-group-smoke-prius",
          vehicleName: "Smoke Toyota Prius",
          purpose: "Walmart pickup route",
          driver: "Zena",
          startMiles: 1010,
          endMiles: 1025,
          businessMiles: 15,
          gasPrice: 3.2,
          fuelCost: 1,
          wearCost: 1.8,
          totalVehicleCost: 2.8,
          mileageValue: 10.05,
          workspaceId: "workspace-personal-local-beta",
          workspace_id: "workspace-personal-local-beta",
          createdAt: "2026-05-16T12:00:00.000Z",
        },
        {
          id: "mileage-group-smoke-van-1",
          vehicleId: "vehicle-group-smoke-van",
          vehicleName: "Smoke Trade Van",
          purpose: "Vendor dropoff",
          driver: "Dillon",
          startMiles: 2000,
          endMiles: 2012,
          businessMiles: 12,
          gasPrice: 3.4,
          fuelCost: 1.85,
          wearCost: 2.16,
          totalVehicleCost: 4.01,
          mileageValue: 8.04,
          workspaceId: "workspace-personal-local-beta",
          workspace_id: "workspace-personal-local-beta",
          createdAt: "2026-05-14T12:00:00.000Z",
        },
      ];
      localStorage.setItem("et-tcg-beta-data", JSON.stringify(data));
      return data;
    });
    await reloadWithAppData(mileageData);
    await nav("Forge");
    await page.locator(".forge-overview-card").filter({ hasText: "Mileage" }).first().click();
    const priusGroup = page.locator(".mileage-vehicle-card").filter({ hasText: "Smoke Toyota Prius" });
    await priusGroup.first().waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await priusGroup.count(), 1, "Multiple Prius logs should render as one vehicle card");
    await assertVisibleText("2 trips");
    await assertVisibleText("25.0 mi");
    await priusGroup.first().click();
    const mileageModal = page.locator(".mileage-vehicle-detail-modal").first();
    await mileageModal.waitFor({ state: "visible", timeout: 5000 });
    await assertVisibleText("Target restock loop");
    await assertVisibleText("Walmart pickup route");
    assert.equal(await mileageModal.locator(".mileage-trip-card").count(), 2);
    await mileageModal.getByRole("button", { name: "Close", exact: true }).click();
  });

  await step("Vault: add/edit/delete Vault item", async () => {
    await nav("Vault");
    await page.locator(".vault-command-center").getByRole("button", { name: "Quick Add", exact: true }).click();
    await page.locator(".flow-modal").getByRole("button", { name: /Manual Add/ }).click();
    const vaultForm = page.locator("form#multi-destination-add-form").first();
    const manualFallback = vaultForm.getByRole("button", { name: "Can't find it? Add manually" }).first();
    if (await manualFallback.isVisible().catch(() => false)) await manualFallback.click();
    await fillByLabel(vaultForm, "Item Name", "Smoke Vault Binder");
    await fillByLabel(vaultForm, "Type / Category", "Binder");
    await fillByLabel(vaultForm, "Market Price", "30");
    await clickAddWizardNext();
    await ensureAddWizardDestination(vaultForm, "Vault");
    await clickAddWizardNext();
    await fillByLabel(vaultForm, "Quantity for Vault", "1");
    await fillByLabel(vaultForm, "Collection Category", "Smoke Set");
    await fillByLabel(vaultForm, "Cost Basis", "20");
    await clickAddWizardNext();
    await page.locator(".flow-modal").getByRole("button", { name: /Save and Close/ }).click();
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

    const vaultDeleteCard = page.locator(".compact-card").filter({ hasText: "Smoke Vault Binder Edited" });
    const cancelledVaultDelete = await withConfirmStub(false, async () => {
      await overflowAction(vaultDeleteCard, "Remove from Vault");
    });
    assert.match(cancelledVaultDelete.join("\n"), /Delete vaulted item\?/);
    assert.match(cancelledVaultDelete.join("\n"), /Forge inventory records are not removed/);
    await assertVisibleText("Smoke Vault Binder Edited");

    const acceptedVaultDelete = await withConfirmStub(true, async () => {
      await overflowAction(vaultDeleteCard, "Remove from Vault");
    });
    assert.match(acceptedVaultDelete.join("\n"), /Delete vaulted item\?/);
    await assert.equal(await page.getByText("Smoke Vault Binder Edited", { exact: false }).count(), 0);
  });

  await step("Vault: transfer to Forge respects entered quantity", async () => {
    async function addVaultManualItem(name, quantity) {
      await nav("Vault");
      await page.locator(".vault-command-center").getByRole("button", { name: "Quick Add", exact: true }).click();
      await page.locator(".flow-modal").getByRole("button", { name: /Manual Add/ }).click();
      const vaultForm = page.locator("form#multi-destination-add-form").first();
      const manualFallback = vaultForm.getByRole("button", { name: "Can't find it? Add manually" }).first();
      if (await manualFallback.isVisible().catch(() => false)) await manualFallback.click();
      await fillByLabel(vaultForm, "Item Name", name);
      await fillByLabel(vaultForm, "Type / Category", "Elite Trainer Box");
      await fillByLabel(vaultForm, "Market Price", "50");
      await clickAddWizardNext();
      await ensureAddWizardDestination(vaultForm, "Vault");
      await clickAddWizardNext();
      await fillByLabel(vaultForm, "Quantity for Vault", String(quantity));
      await fillByLabel(vaultForm, "Collection Category", "Transfer Smoke");
      await fillByLabel(vaultForm, "Cost Basis", "40");
      await clickAddWizardNext();
      await page.locator(".flow-modal").getByRole("button", { name: /Save and Close/ }).click();
      await assertVisibleText(name);
    }

    await addVaultManualItem("Smoke Vault Transfer Qty 8", 8);
    const partialCard = page.locator(".compact-card").filter({ hasText: "Smoke Vault Transfer Qty 8" }).first();
    await partialCard.getByRole("button", { name: "Move to Forge" }).click();
    const transferModal = page.locator(".vault-transfer-modal").first();
    await transferModal.waitFor({ state: "visible", timeout: 5000 });
    await fillByLabel(transferModal, "How many do you want to move to Forge?", "0");
    await transferModal.getByRole("button", { name: "Move 0 to Forge" }).click();
    await assertVisibleText("Quantity to move must be a whole number of at least 1.");
    await fillByLabel(transferModal, "How many do you want to move to Forge?", "9");
    await transferModal.getByRole("button", { name: "Move 9 to Forge" }).click();
    await assertVisibleText("Move quantity cannot be higher than owned quantity.");
    await fillByLabel(transferModal, "How many do you want to move to Forge?", "2");
    await transferModal.getByRole("button", { name: "Move 2 to Forge" }).click();
    await assertVisibleText("Moved 2 to Forge. 6 remain in Vault.");

    const partialTransfer = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const source = (data.items || []).find((item) => item.name === "Smoke Vault Transfer Qty 8" && (item.destinationScope || []).includes("vault"));
      const forge = (data.items || []).find((item) => item.name === "Smoke Vault Transfer Qty 8" && (item.destinationScope || []).includes("forge"));
      return { source, forge };
    });
    assert.equal(Number(partialTransfer.source?.quantity), 6);
    assert.equal(partialTransfer.source?.vaultStatus !== "moved_to_forge", true);
    assert.equal(Number(partialTransfer.forge?.quantity), 2);
    assert.equal(Boolean(partialTransfer.forge?.businessInventory), true);

    await nav("Forge");
    await assertVisibleText("Smoke Vault Transfer Qty 8");
    await nav("Vault");
    await assertVisibleText("Smoke Vault Transfer Qty 8");
    const vaultSourceDelete = await withConfirmStub(true, async () => {
      await overflowAction(page.locator(".compact-card").filter({ hasText: "Smoke Vault Transfer Qty 8" }).first(), "Remove from Vault");
    });
    assert.match(vaultSourceDelete.join("\n"), /Delete vaulted item\?/);
    await nav("Forge");
    await assertVisibleText("Smoke Vault Transfer Qty 8");
    const forgeCopyDelete = await withConfirmStub(true, async () => {
      await overflowAction(page.locator(".compact-card").filter({ hasText: "Smoke Vault Transfer Qty 8" }).first(), "Delete Forge item");
    });
    assert.match(forgeCopyDelete.join("\n"), /Delete Forge inventory item\?/);
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Vault Transfer Qty 8" }).count(), 0);

    await addVaultManualItem("Smoke Vault Transfer Qty 1", 1);
    const fullCard = page.locator(".compact-card").filter({ hasText: "Smoke Vault Transfer Qty 1" }).first();
    await fullCard.getByRole("button", { name: "Move to Forge" }).click();
    const fullModal = page.locator(".vault-transfer-modal").first();
    await fillByLabel(fullModal, "How many do you want to move to Forge?", "1");
    await fullModal.getByRole("button", { name: "Move 1 to Forge" }).click();
    await assertVisibleText("Moved 1 to Forge. 0 remain in Vault.");
    const fullTransfer = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const source = (data.items || []).find((item) => item.name === "Smoke Vault Transfer Qty 1" && item.vaultStatus === "moved_to_forge");
      const forge = (data.items || []).find((item) => item.name === "Smoke Vault Transfer Qty 1" && (item.destinationScope || []).includes("forge"));
      return { source, forge };
    });
    assert.equal(Number(fullTransfer.source?.quantity), 0);
    assert.equal(Number(fullTransfer.forge?.quantity), 1);
    await nav("Vault");
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Vault Transfer Qty 1" }).count(), 0);
    await nav("Forge");
    await assertVisibleText("Smoke Vault Transfer Qty 1");
  });

  await step("Inventory: groups identical items while preserving purchaser breakdown", async () => {
    const groupedInventoryData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const now = new Date().toISOString();
      data.purchasers = [
        ...(data.purchasers || []).filter((purchaser) => !String(purchaser.id || "").startsWith("purchaser-group-smoke-")),
        {
          id: "purchaser-group-smoke-zena",
          name: "Zena",
          note: "smoke test",
          active: true,
          workspaceId: "workspace-personal-local-beta",
          workspace_id: "workspace-personal-local-beta",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "purchaser-group-smoke-dillon",
          name: "Dillon",
          note: "smoke test",
          active: true,
          workspaceId: "workspace-personal-local-beta",
          workspace_id: "workspace-personal-local-beta",
          createdAt: now,
          updatedAt: now,
        },
      ];
      data.items = [
        ...(data.items || []).filter((item) => !String(item.id || "").startsWith("inventory-group-smoke-")),
        {
          id: "inventory-group-smoke-vault-zena",
          name: "Smoke Grouped Purchaser ETB",
          catalogProductId: "catalog-smoke-grouped-etb",
          destinationScope: ["vault"],
          recordType: "vault_item",
          businessInventory: false,
          vaultStatus: "personal_collection",
          status: "Personal Collection",
          quantity: 4,
          unitCost: 40,
          marketPrice: 55,
          purchaserId: "purchaser-group-smoke-zena",
          purchaserName: "Zena",
          buyer: "Zena",
          workspaceId: "workspace-personal-local-beta",
          workspace_id: "workspace-personal-local-beta",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "inventory-group-smoke-vault-dillon",
          name: "Smoke Grouped Purchaser ETB",
          catalogProductId: "catalog-smoke-grouped-etb",
          destinationScope: ["vault"],
          recordType: "vault_item",
          businessInventory: false,
          vaultStatus: "personal_collection",
          status: "Personal Collection",
          quantity: 3,
          unitCost: 42,
          marketPrice: 55,
          purchaserId: "purchaser-group-smoke-dillon",
          purchaserName: "Dillon",
          buyer: "Dillon",
          workspaceId: "workspace-personal-local-beta",
          workspace_id: "workspace-personal-local-beta",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "inventory-group-smoke-forge-zena-home",
          name: "Smoke Grouped Purchaser ETB",
          catalogProductId: "catalog-smoke-grouped-etb",
          destinationScope: ["forge"],
          recordType: "forge_inventory",
          businessInventory: true,
          status: "In Stock",
          quantity: 2,
          unitCost: 40,
          marketPrice: 55,
          salePrice: 60,
          physicalLocation: "At Home",
          purchaserId: "purchaser-group-smoke-zena",
          purchaserName: "Zena",
          buyer: "Zena",
          workspaceId: "workspace-personal-local-beta",
          workspace_id: "workspace-personal-local-beta",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "inventory-group-smoke-forge-dillon-store",
          name: "Smoke Grouped Purchaser ETB",
          catalogProductId: "catalog-smoke-grouped-etb",
          destinationScope: ["forge"],
          recordType: "forge_inventory",
          businessInventory: true,
          status: "In Stock",
          quantity: 5,
          unitCost: 42,
          marketPrice: 55,
          salePrice: 60,
          physicalLocation: "At Store",
          purchaserId: "purchaser-group-smoke-dillon",
          purchaserName: "Dillon",
          buyer: "Dillon",
          workspaceId: "workspace-personal-local-beta",
          workspace_id: "workspace-personal-local-beta",
          createdAt: now,
          updatedAt: now,
        },
      ];
      localStorage.setItem("et-tcg-beta-data", JSON.stringify(data));
      return data;
    });
    await reloadWithAppData(groupedInventoryData);

    await nav("Vault");
    const groupedVaultCard = page.locator(".vault-item-card").filter({ hasText: "Smoke Grouped Purchaser ETB" });
    await groupedVaultCard.first().waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await groupedVaultCard.count(), 1, "Vault should show one grouped card for the same product");
    assert.match(await groupedVaultCard.first().innerText(), /Qty\s+7/i);
    await groupedVaultCard.first().getByRole("button", { name: "View" }).click();
    await assertVisibleText("Grouped inventory details");
    await assertVisibleText("Zena");
    await assertVisibleText("Dillon");
    await page.getByRole("button", { name: "Close" }).click();

    await groupedVaultCard.first().getByRole("button", { name: "Move to Forge" }).click();
    const groupedTransferModal = page.locator(".vault-transfer-modal").first();
    await groupedTransferModal.waitFor({ state: "visible", timeout: 5000 });
    await groupedTransferModal.getByLabel("Move from purchaser entry").selectOption("inventory-group-smoke-vault-dillon");
    await fillByLabel(groupedTransferModal, "How many do you want to move to Forge?", "2");
    await groupedTransferModal.getByRole("button", { name: /Move 2 to Forge/ }).click();
    await assertVisibleText("Moved 2 to Forge. 1 remain in Vault.");
    const groupedTransferState = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const vaultDillon = (data.items || []).find((item) => item.id === "inventory-group-smoke-vault-dillon");
      const forgeDillonMoved = (data.items || []).find((item) =>
        item.name === "Smoke Grouped Purchaser ETB" &&
        (item.destinationScope || []).includes("forge") &&
        item.originalVaultItemId === "inventory-group-smoke-vault-dillon"
      );
      return { vaultDillon, forgeDillonMoved };
    });
    assert.equal(Number(groupedTransferState.vaultDillon?.quantity), 1);
    assert.equal(Number(groupedTransferState.forgeDillonMoved?.quantity), 2);
    assert.equal(groupedTransferState.forgeDillonMoved?.purchaserName, "Dillon");

    await nav("Forge");
    await page.locator(".forge-more-filters summary").click();
    await page.getByLabel("Physical location").selectOption("All");
    const groupedForgeCard = page.locator(".forge-inventory-card").filter({ hasText: "Smoke Grouped Purchaser ETB" });
    await groupedForgeCard.first().waitFor({ state: "visible", timeout: 5000 });
    assert.equal(await groupedForgeCard.count(), 1, "Forge should show one grouped card for the same product");
    assert.match(await groupedForgeCard.first().innerText(), /Qty\s+9/i);
    await groupedForgeCard.first().getByRole("button", { name: "View" }).click();
    await assertVisibleText("Inventory locations");
    await assertVisibleText("Zena");
    await assertVisibleText("Dillon");
    await assertVisibleText("At Home");
    await assertVisibleText("At Store");
    await page.getByRole("button", { name: "Close" }).click();
  });

  await step("Vault: wishlist item stays out of Forge inventory", async () => {
    await nav("Vault");
    await page.locator(".vault-command-center").getByRole("button", { name: "Quick Add", exact: true }).click();
    await page.locator(".flow-modal").getByRole("button", { name: /Add Wishlist Item/ }).click();
    const wishlistForm = page.locator("form#multi-destination-add-form").first();
    await fillByLabel(wishlistForm, "Item Name", "Smoke Wishlist Box");
    await fillByLabel(wishlistForm, "Type / Category", "Collection Box");
    await clickAddWizardNext();
    await ensureAddWizardDestination(wishlistForm, "Wishlist");
    await clickAddWizardNext();
    await fillByLabel(wishlistForm, "Quantity Wanted", "1");
    await fillByLabel(wishlistForm, "Target Price", "25");
    await clickAddWizardNext();
    await page.locator(".flow-modal").getByRole("button", { name: /Save and Close/ }).click();
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

  await step("Market: search result saves to Forge and Vault destinations", async () => {
    await nav("TideTradr");
    const searchForm = page.locator(".catalog-search-form").first();
    await searchForm.locator("input").first().fill("Prismatic Evolutions Booster Bundle");
    await searchForm.getByRole("button", { name: /Search Catalog|Search TideTradr|Search/i }).first().click();
    const resultCard = page.locator(".catalog-result-card").filter({ hasText: "Prismatic Evolutions Booster Bundle", hasNotText: "Code Card" }).first();
    await resultCard.waitFor({ state: "visible", timeout: 10000 });
    await resultCard.getByRole("button", { name: /\+ Add|Add/i }).first().click();
    await resultCard.getByRole("button", { name: "Save to Forge" }).click();
    await assertVisibleText("Added to Forge as a draft");
    await resultCard.getByRole("button", { name: /\+ Add|Add/i }).first().click();
    await resultCard.getByRole("button", { name: "Save to Vault" }).click();
    await assertVisibleText("Added to Vault as a draft");

    const marketDrafts = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.items || [])
        .filter((item) => item.name === "Prismatic Evolutions Booster Bundle")
        .map((item) => ({
          destinationScope: item.destinationScope,
          recordType: item.recordType,
          businessInventory: item.businessInventory,
          vaultStatus: item.vaultStatus,
          physicalLocation: item.physicalLocation,
        }));
    });
    assert.ok(marketDrafts.some((item) => (item.destinationScope || []).includes("forge") && item.businessInventory === true && item.physicalLocation === "At Home"), "Market Save to Forge should create a Forge draft");
    assert.ok(marketDrafts.some((item) => (item.destinationScope || []).includes("vault") && item.businessInventory !== true && item.vaultStatus), "Market Save to Vault should create a Vault draft");

    await nav("Forge");
    await assertVisibleText("Prismatic Evolutions Booster Bundle");
    await nav("Vault");
    await page.getByRole("button", { name: "Collection", exact: true }).click();
    await assertVisibleText("Prismatic Evolutions Booster Bundle");
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      data.items = (data.items || []).filter((item) => (item.name || item.itemName) !== "Prismatic Evolutions Booster Bundle");
      localStorage.setItem("et-tcg-beta-data", JSON.stringify(data));
    });
  });

  await step("Home: totals update", async () => {
    await nav("Home");
    await assertVisibleText("Hearth Home");
    await assertVisibleText("Today's Best Action");
    await assertNotVisibleText("Today / Overview");
  });

  await step("Today’s Tide: command view loads", async () => {
    await page.evaluate(() => localStorage.removeItem("et-tcg-daily-tide"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await nav("Today's Tide");
    await assertVisibleText("What needs my attention today?");
    await assertVisibleText("Today's Checklist");
  });

  await step("Command Center: fits desktop and mobile viewports", async () => {
    async function openCommandCenterAtViewport(width, height) {
      await closeOpenModals();
      await page.setViewportSize({ width, height });
      if (width >= 640) {
        await nav("Home");
      } else {
        await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
      }
      const commandCenterButtons = [
        page.locator('button[aria-label="Open Quick Add command center"]'),
        page.locator(".hearth-command-hero").getByRole("button", { name: "Quick Add", exact: true }),
      ];
      let opened = false;
      for (const buttonLocator of commandCenterButtons) {
        const count = await buttonLocator.count();
        for (let index = 0; index < count; index += 1) {
          const button = buttonLocator.nth(index);
          if (await button.isVisible()) {
            await button.click();
            opened = true;
            break;
          }
        }
        if (opened) break;
      }
      assert.equal(opened, true, `Quick Add command entry should be visible at ${width}x${height}`);
      const quickAddModal = page.locator('.flow-modal[data-flow="addActionSheet"]').first();
      await quickAddModal.waitFor({ state: "visible", timeout: 5000 });
      const box = await quickAddModal.boundingBox();
      assert.ok(box, "Quick Add command modal should have a layout box");
      assert.ok(box.x >= -1 && box.y >= -1, `Quick Add should stay inside viewport origin at ${width}x${height}`);
      assert.ok(box.x + box.width <= width + 1, `Quick Add should not overflow horizontally at ${width}x${height}`);
      assert.ok(box.y + box.height <= height + 1, `Quick Add should not overflow vertically at ${width}x${height}`);
      const hasHorizontalOverflow = await quickAddModal.evaluate((element) => element.scrollWidth > element.clientWidth + 2);
      assert.equal(hasHorizontalOverflow, false, `Quick Add should not require horizontal scrolling at ${width}x${height}`);
      await quickAddModal.locator('.modal-close-button[aria-label="Close Quick Add"]').click();
      await quickAddModal.waitFor({ state: "hidden", timeout: 5000 });
    }

    await openCommandCenterAtViewport(1440, 900);
    await openCommandCenterAtViewport(390, 844);
    await page.setViewportSize({ width: 1366, height: 1600 });
  });

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
