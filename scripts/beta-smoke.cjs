const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const rawAppUrl = process.env.APP_URL || "http://127.0.0.1:5200/";
const appUrl = new URL(rawAppUrl);
appUrl.searchParams.set("betaLocalMode", "true");
const APP_URL = appUrl.toString();
const CLI_ARGS = process.argv.slice(2);
const AREA_FLAG_INDEX = CLI_ARGS.indexOf("--area");
const REQUESTED_AREA = String(
  AREA_FLAG_INDEX >= 0 ? CLI_ARGS[AREA_FLAG_INDEX + 1] || "" : process.env.BETA_SMOKE_AREA || ""
).trim().toLowerCase();
const VALID_AREAS = new Set(["hearth", "scout", "vault", "market", "forge", "admin", "spark", "tidepool"]);
if (REQUESTED_AREA && !VALID_AREAS.has(REQUESTED_AREA)) {
  throw new Error(`Unknown beta smoke area "${REQUESTED_AREA}". Expected one of: ${[...VALID_AREAS].join(", ")}`);
}
const BETA_SMOKE_MODE = CLI_ARGS.includes("--regression") || process.env.BETA_SMOKE_MODE === "regression"
  ? "regression"
  : REQUESTED_AREA
    ? `area:${REQUESTED_AREA}`
  : "smoke";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 1600 } });
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(45000);
  const results = [];
  const fatalBrowserErrors = [];
  console.log(`Beta smoke mode: ${BETA_SMOKE_MODE}`);

  function recordFatalBrowserError(kind, message, url = "") {
    const text = String(message || "").trim();
    if (!text) return;
    if (/ResizeObserver loop completed|favicon/i.test(text)) return;
    if (/React does not recognize .* prop on a DOM element/i.test(text)) return;
    fatalBrowserErrors.push(`${kind}: ${text}${url ? ` (${url})` : ""}`);
  }

  page.on("console", (message) => {
    if (message.type() === "error") {
      recordFatalBrowserError("console", message.text(), message.location()?.url || "");
    }
  });
  page.on("pageerror", (error) => {
    recordFatalBrowserError("pageerror", error.message);
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    const resourceType = request.resourceType();
    const failureText = request.failure()?.errorText || "request failed";
    if (/ERR_ABORTED/i.test(failureText)) return;
    if (url.startsWith(new URL(APP_URL).origin) && ["document", "script", "stylesheet"].includes(resourceType)) {
      recordFatalBrowserError("requestfailed", failureText, url);
    }
  });

  async function assertNoFatalBrowserErrors() {
    if (fatalBrowserErrors.length) {
      const errors = fatalBrowserErrors.splice(0, fatalBrowserErrors.length);
      throw new Error(`Fatal browser errors:\n${errors.join("\n")}`);
    }
  }

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
    const startedAt = Date.now();
    console.log(`START ${name}`);
    try {
      await fn();
      if (BETA_SMOKE_MODE.startsWith("area:") || BETA_SMOKE_MODE === "smoke") {
        await assertNoFatalBrowserErrors();
      }
      const elapsedMs = Date.now() - startedAt;
      results.push({ name, status: "PASS", elapsedMs });
      console.log(`PASS ${name} (${elapsedMs}ms)`);
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      results.push({ name, status: "FAIL", elapsedMs, error: error.message });
      console.error(`FAIL ${name} (${elapsedMs}ms): ${error.message}`);
      throw error;
    }
  }

  async function closeOpenModals() {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const modalCount = await page.locator(".location-modal-backdrop, .catalog-detail-backdrop, .drawer-backdrop, .flow-modal-backdrop").count();
      if (!modalCount) return;
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => !document.querySelector(".location-modal-backdrop, .catalog-detail-backdrop, .drawer-backdrop, .flow-modal-backdrop"),
        null,
        { timeout: 700 }
      ).catch(() => {});
    }
  }

  async function clickCardAction(card, actionName) {
    const directAction = card.getByRole("button", { name: actionName });
    if (await directAction.isVisible().catch(() => false)) {
      await directAction.click();
      return;
    }
    await card.getByRole("button", { name: /More actions|More/ }).click();
    await card.getByRole("menuitem", { name: actionName }).click();
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
                : label === "The Spark"
                  ? "(The Spark|Kids Program)"
                  : label === "Admin"
                    ? "(Admin|Admin Command Center|Admin Review)"
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
    if (await topbarSection.count()) {
      const topbarValue = {
        Home: "home",
        "Today's Tide": "today",
        Scout: "scout",
        Vault: "vault",
        TideTradr: "tideTradr",
        Forge: "forge",
        "The Spark": "kidsProgram",
        Admin: "adminReview",
      }[label];
      if (topbarValue) {
        const changed = await topbarSection.evaluate((select, value) => {
          const option = Array.from(select.options || []).find((entry) => entry.value === value);
          if (!option) return false;
          select.value = value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }, topbarValue);
        if (changed) return;
      }
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
      const nativeMessages = await page.evaluate(() => window.__etSmokeConfirmMessages || []);
      const appDialog = page.locator(".app-confirmation-dialog").last();
      if (await appDialog.isVisible({ timeout: 800 }).catch(() => false)) {
        const dialogText = await appDialog.innerText();
        const actionButtons = appDialog.locator(".app-confirmation-actions button");
        if (returnValue) await actionButtons.last().click();
        else await actionButtons.first().click();
        await appDialog.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
        return [...nativeMessages, dialogText];
      }
      return nativeMessages;
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

  async function openScoutReportDetails(reportCard) {
    const detailButton = reportCard.getByRole("button", { name: /^View details$/ }).first();
    await detailButton.waitFor({ state: "visible", timeout: 10000 });
    await detailButton.click();
    const detailSheet = page.locator(".scout-report-detail-sheet").last();
    await detailSheet.waitFor({ state: "visible", timeout: 10000 });
    return detailSheet;
  }

  async function closeScoutReportDetails(detailSheet) {
    const closeButton = detailSheet.getByRole("button", { name: /^Close$/ }).last();
    await closeButton.click();
    await detailSheet.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  }

  async function visibleScoutReportCard(matchText) {
    const cards = page.locator(".scout-report-compact-card").filter({ hasText: matchText });
    const count = await cards.count();
    for (let index = 0; index < count; index += 1) {
      const card = cards.nth(index);
      if (
        (await card.isVisible().catch(() => false)) &&
        (await card.getByRole("button", { name: /^View details$/ }).first().isVisible().catch(() => false))
      ) {
        return card;
      }
    }
    throw new Error(`No visible Scout report card found for ${matchText}`);
  }

  async function openVisibleScoutReportDetailsContaining(cardText, detailText) {
    const cards = cardText
      ? page.locator(".scout-report-compact-card").filter({ hasText: cardText })
      : page.locator(".scout-report-compact-card");
    const count = await cards.count();
    for (let index = 0; index < count; index += 1) {
      const card = cards.nth(index);
      if (
        !(await card.isVisible().catch(() => false)) ||
        !(await card.getByRole("button", { name: /^View details$/ }).first().isVisible().catch(() => false))
      ) {
        continue;
      }
      const detailSheet = await openScoutReportDetails(card);
      if ((await detailSheet.getByText(detailText).count()) > 0) {
        return { card, detailSheet };
      }
      await closeScoutReportDetails(detailSheet);
    }
    throw new Error(`No visible Scout report details found for ${detailText}`);
  }

  async function assertScoutReportDetailDeleteHidden(detailSheet) {
    await detailSheet.getByText("Current report only").first().waitFor({ state: "visible", timeout: 5000 });
    await detailSheet.getByText("Community trust").first().waitFor({ state: "visible", timeout: 5000 });
    await detailSheet.getByRole("button", { name: /^Confirm Report$/ }).first().waitFor({ state: "visible", timeout: 5000 });
    await detailSheet.getByRole("button", { name: /^Add Proof$/ }).first().waitFor({ state: "visible", timeout: 5000 });
    await detailSheet.getByRole("button", { name: /^Flag Report$/ }).first().waitFor({ state: "visible", timeout: 5000 });
    await detailSheet.getByRole("button", { name: /^Add Report for Store$/ }).first().waitFor({ state: "visible", timeout: 5000 });
    await detailSheet.getByText("Protected Scout context").first().waitFor({ state: "visible", timeout: 5000 });
    assert.equal(
      await detailSheet.getByRole("button", { name: /Delete/i }).count(),
      0,
      "Delete should not be visible in Scout report details for normal users"
    );
  }

  async function assertScoutReportDeleteHidden(reportCard) {
    const overflowButtons = reportCard.locator(".overflow-menu-button");
    const overflowCount = await overflowButtons.count();
    let visibleOverflowCount = 0;
    for (let index = 0; index < overflowCount; index += 1) {
      if (await overflowButtons.nth(index).isVisible().catch(() => false)) visibleOverflowCount += 1;
    }
    assert.equal(
      visibleOverflowCount,
      0,
      "Scout report summary cards should not expose overflow actions"
    );
    const detailSheet = await openScoutReportDetails(reportCard);
    await assertScoutReportDetailDeleteHidden(detailSheet);
    return detailSheet;
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

  async function assertNoHorizontalOverflow(label = "page") {
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    assert.ok(
      metrics.scrollWidth <= metrics.clientWidth + 2,
      `${label} should not horizontally overflow: ${metrics.scrollWidth}px > ${metrics.clientWidth}px`
    );
  }

  async function expectVisible(locator, label, timeout = 7000) {
    await locator.waitFor({ state: "visible", timeout }).catch(async (error) => {
      const bodyPreview = await page.locator("body").innerText().catch(() => "");
      error.message = `${label} was not visible.\n${error.message}\nBody preview:\n${bodyPreview.slice(0, 1500)}`;
      throw error;
    });
  }

  async function focusedHearthTest() {
    await page.setViewportSize({ width: 390, height: 844 });
    await nav("Hearth");
    const dailyCommandCenter = page.locator(".hearth-daily-command-center").first();
    await expectVisible(dailyCommandCenter, "Hearth Daily Command Center");
    await assertVisibleText("Daily Command Center");
    await assertVisibleText("Today's Tide");
    await assertVisibleText("Next Best Step");
    await assertVisibleText("Collection Pulse");
    await assertVisibleText("Scout Watch");
    await assertVisibleText("Forge Reminder");
    await assertVisibleText("Market Reminder");
    await assertVisibleText("Wishlist / ISO");
    await assertVisibleText("Event Planner");
    await assertVisibleText("Spark Moment");
    await assertVisibleText("Keep Building");
    await assertVisibleText("Open Next");
    await assertVisibleText("Start by adding something to your Vault.");
    await assertVisibleText("Smart Daily Cards");
    await assertVisibleText("Today's Collector Path");
    await assertVisibleText("Organize one item");
    await assertVisibleText("Check one Market Memory");
    await assertVisibleText("Review one trade");
    await assertVisibleText("Help one kid/family Spark action");
    await assertVisibleText("Explore one upgrade preview");
    await expectVisible(page.locator(".upgrade-value-preview-card-hearth").first(), "Hearth Upgrade Value Preview card");
    await assertVisibleText("What upgrading unlocks next");
    const hearthInitialText = await page.locator(".hearth-mockup-rebuild").first().innerText();
    assert.equal(
      /guaranteed restock notifications|live alerts are enabled|AI automatically|verified sellers are enabled/i.test(hearthInitialText),
      false,
      "Hearth should not show fake live-alert, AI, or verification claims"
    );
    await page.locator(".upgrade-value-preview-card-hearth").getByRole("button", { name: /^Compare Plans$/ }).first().click();
    await assertVisibleText("Membership Foundation");
    await assertVisibleText("No payment flow is connected.");
    await nav("Hearth");
    const hearthEventCard = page.locator(".hearth-daily-command-card").filter({ hasText: "Event Planner" }).first();
    await expectVisible(hearthEventCard, "Hearth Event Planner card");
    await hearthEventCard.getByRole("button", { name: "Plan Event", exact: true }).click();
    const hearthEventModal = page.locator('.flow-modal[data-flow="collectorEventPlanner"]').first();
    await expectVisible(hearthEventModal, "Hearth Event Planner modal");
    await expectVisible(hearthEventModal.getByText("Event Planner is local beta planning only.").first(), "Event Planner local-only copy");
    await hearthEventModal.getByRole("button", { name: "Close", exact: true }).first().click();
    await hearthEventModal.waitFor({ state: "hidden", timeout: 5000 });
    await nav("Hearth");
    const hearthCommandRoutes = [
      { button: "Open Vault", expected: "Vault", label: "Collection Pulse" },
      { button: "Open Scout", expected: "Scout", label: "Scout Watch" },
      { button: "Open Forge", expected: "Forge", label: "Forge Reminder" },
      { button: "Open Market", expected: "Market", label: "Market Reminder" },
      { button: "Open Wishlist", expected: "Wishlist / ISO", label: "Wishlist / ISO" },
      { button: "Open The Spark", expected: "The Spark", label: "Spark Moment" },
    ];
    for (const route of hearthCommandRoutes) {
      await nav("Hearth");
      const commandSection = page.locator(".hearth-daily-command-center").first();
      await expectVisible(commandSection.getByText(route.label).first(), `Hearth ${route.label} card`);
      await commandSection.getByRole("button", { name: route.button, exact: true }).first().click();
      await assertVisibleText(route.expected);
    }
    await nav("Hearth");
    const sparksPanel = page.locator(".hearth-today-sparks-panel").first();
    await expectVisible(sparksPanel, "Today’s Sparks panel");
    await assertVisibleText("Today's Sparks");
    await assertVisibleText("Complete helpful actions to earn Ember Points.");
    assert.equal(await sparksPanel.locator('input[type="checkbox"]').count(), 0, "Today’s Sparks should not use manual checkboxes");
    const sparkText = await sparksPanel.innerText();
    assert.match(sparkText, /Start|Continue|Done|No Sparks today|Today's Sparks Complete/, "Today’s Sparks should expose an action or terminal state");
    assert.ok(await page.locator(".hearth-feature-card").count() > 0, "Phone Hearth feature cards should render");
    const featureText = await page.locator(".hearth-feature-list").innerText();
    assert.equal(/Open Scout|Open Vault|Open Forge|Open The Spark/i.test(featureText), false, "Phone feature cards should not show redundant Open buttons");
    await expectVisible(page.locator(".mobile-bottom-nav").first(), "mobile bottom nav");
    await assertNoHorizontalOverflow("Hearth mobile");
    const hearthSampleData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const now = new Date().toISOString();
      data.items = [
        ...(data.items || []).filter((item) => item.id !== "hearth-smart-vault-item"),
        {
          id: "hearth-smart-vault-item",
          name: "Hearth Smart Vault Card",
          destinationScope: ["vault"],
          recordType: "vault_item",
          businessInventory: false,
          vaultStatus: "personal_collection",
          status: "Personal Collection",
          quantity: 1,
          workspaceId: "workspace-personal-local-beta",
          workspaceName: "My Personal Space",
          createdAt: now,
          updatedAt: now,
        },
      ];
      data.tradeRecords = [
        ...(data.tradeRecords || []).filter((record) => record.id !== "hearth-smart-trade"),
        {
          id: "hearth-smart-trade",
          sourceItemName: "Hearth Binder Card",
          receivedItemName: "Hearth Sealed Pack",
          valueGiven: 12,
          valueReceived: 18,
          tradeDate: "2026-06-10",
          balanceLabel: "Value Gained",
          workspaceId: "workspace-personal-local-beta",
          workspaceName: "My Personal Space",
          createdAt: now,
          updatedAt: now,
        },
      ];
      data.marketPriceMemories = [
        ...(data.marketPriceMemories || []).filter((entry) => entry.id !== "hearth-smart-price-memory"),
        {
          id: "hearth-smart-price-memory",
          itemName: "Hearth ETB",
          price: 42,
          priceType: "Shop Price",
          sourcePlace: "Smoke local shop",
          condition: "Sealed",
          dateSeen: "2026-06-10",
          notes: "Manual smoke snapshot.",
          createdAt: now,
          updatedAt: now,
        },
      ];
      data.sparkKidPacks = [
        ...(data.sparkKidPacks || []).filter((pack) => pack.id !== "hearth-smart-kid-pack"),
        {
          id: "hearth-smart-kid-pack",
          packName: "Hearth Starter Pack",
          packTheme: "First binder day",
          packType: "Starter Pack",
          packStatus: "Planning",
          dateCreated: "2026-06-10",
          packContents: "Sleeves, starter cards, and a small binder.",
          createdAt: now,
          updatedAt: now,
        },
      ];
      return data;
    });
    await reloadWithAppData(hearthSampleData);
    await nav("Hearth");
    await assertVisibleText("Smart Daily Cards");
    await assertVisibleText("Collection needs attention");
    await assertVisibleText("Trade to review");
    await assertVisibleText("Check saved Price Memory");
    await assertVisibleText("Spark pack in progress");
    await assertVisibleText("Today's Collector Path");
    await assertNoHorizontalOverflow("Hearth smart daily cards mobile");
    await page.setViewportSize({ width: 1366, height: 1600 });
  }

  async function focusedScoutTest() {
    await page.setViewportSize({ width: 390, height: 844 });
    await nav("Scout");
    await assertVisibleText("Scout");
    await assertVisibleText("Current reports, not raw patterns.");
    await assertVisibleText("Watchlist Rules");
    await assertVisibleText("Scout Access");
    await assertVisibleText("Pattern Protected");
    await assertVisibleText("Free plan includes 1 watched store. You can change it once every 30 days.");
    await assertVisibleText("Upgrade unlocks more tracking capacity");
    await expectVisible(page.locator(".scout-watch-stores-card").first(), "My Watch Stores section");
    await assertVisibleText("Nearby Reports");
    const scanScreenshotButton = page.getByRole("button", { name: /^Scan Screenshot$/ }).first();
    await expectVisible(scanScreenshotButton, "Scout Scan Screenshot action");
    await scanScreenshotButton.click();
    await expectVisible(page.locator(".scout-live-flow--scan").first(), "Scout Scan Screenshot page");
    await assertVisibleText("Upload, extract, review, then submit.");
    await assertVisibleText("This local preview shell does not send files, extract live text, or save reports.");
    await page.getByRole("button", { name: /^Review extracted report$/ }).first().click();
    await expectVisible(page.locator(".scout-live-flow--review").first(), "Scout Review Report page");
    await assertVisibleText("Nothing is shared until you review and confirm.");
    await page.getByRole("button", { name: /^Back to Scout$/ }).first().click();
    const addReportButton = page.getByRole("button", { name: /^Add Report$/ }).first();
    await expectVisible(addReportButton, "Scout Add Report action");
    await addReportButton.click();
    await expectVisible(page.locator(".scout-live-flow--add").first(), "Scout Add Report page");
    await assertVisibleText("Add Report");
    await assertVisibleText("Share useful proof, not exploitable patterns.");
    await assertVisibleText("Please avoid employee names, private messages, vendor schedules, and unsafe details.");
    await assertVisibleText("Review report");
    await page.getByRole("button", { name: /^Back to Scout$/ }).first().click();
    await assertNoHorizontalOverflow("Scout mobile");
    await page.getByRole("button", { name: /^Stores$/ }).first().click();
    await assertVisibleText("My Watch Stores");
    await assertVisibleText("Choose the stores you want Scout to watch for current signals.");
    await expectVisible(page.locator(".scout-watch-tier-summary").first(), "watched store slot summary");
    await expectVisible(page.locator(".scout-watch-store-page").first(), "My Watch Stores management page");
    await assertVisibleText(/Slots|Change rule|Watchlist Rules|Pattern Protected/i);
    await assertVisibleText(/Upgrade for More Watches|Choose your first watched store|Choose another store|Watched store slots are full/i);
    await assertVisibleText(/Choose your first watched store|Choose another store|Watched store slots are full|Choose from nearby stores/i);
    await clickFirstVisible(page.getByRole("button", { name: /^Choose Store$|^Change Store$/ }), "watched store picker action");
    await assertVisibleText(/Choose watched store|Change watched store/i);
    await expectVisible(page.locator(".scout-watch-picker-sheet").first(), "watched store picker sheet");
    await assertVisibleText("Raw restock patterns stay protected.");
    await page.getByRole("button", { name: /^Close watched store picker$/ }).first().click();
    await page.locator(".scout-watch-picker-sheet").first().waitFor({ state: "hidden", timeout: 5000 });
    await assertNoHorizontalOverflow("Scout stores mobile");
    await clickFirstVisible(page.locator(".scout-watch-store-picker-panel").getByRole("button", { name: /^View$/ }), "Scout store detail View action");
    const storeDetailSheet = page.locator(".store-map-detail-sheet").first();
    await expectVisible(storeDetailSheet, "Scout Store Detail sheet");
    await assertVisibleText("Current reports only.");
    await assertVisibleText(/Signal: Hot|Signal: Warm|Signal: Cool|Signal: Calm/);
    await assertVisibleText("Current Activity");
    await assertVisibleText("Recent Reports");
    await expectVisible(storeDetailSheet.getByRole("button", { name: /^Add Report$/ }).first(), "Store Detail Add Report action");
    await expectVisible(storeDetailSheet.getByRole("button", { name: /^Scan Screenshot$/ }).first(), "Store Detail Scan Screenshot action");
    const storeDetailText = await storeDetailSheet.innerText();
    assert.equal(/Known restock\/truck days|Predicted Windows|Community Guesses/i.test(storeDetailText), false, "Store Detail should not expose raw pattern or forecast sections to normal users");
    await storeDetailSheet.getByRole("button", { name: /^Add Report$/ }).first().click();
    await expectVisible(page.locator("form.scout-report-flow").first(), "Store Detail Add Report form");
    await closeOpenModals();
    await assertNoHorizontalOverflow("Scout Store Detail mobile");
    await page.setViewportSize({ width: 1366, height: 1600 });
  }

  async function focusedVaultTest() {
    const vaultData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const now = new Date().toISOString();
      data.items = [
        ...(data.items || []).filter((item) => item.id !== "focused-vault-smoke-item" && item.id !== "focused-vault-smoke-sealed" && item.id !== "focused-vault-wishlist-iso" && !item.wishlistIso && item.recordType !== "wishlist_item"),
        {
          id: "focused-vault-smoke-item",
          name: "Focused Vault Smoke Card",
          destinationScope: ["vault"],
          recordType: "vault_item",
          businessInventory: false,
          vaultStatus: "personal_collection",
          status: "Personal Collection",
          quantity: 1,
          unitCost: 5,
          actionNotes: "Smoke note for collection intelligence.",
          conditionName: "Near Mint",
          conditionNotes: "Smoke original corner note.",
          storageCareNotes: "Sleeved in a smoke test binder.",
          conditionCheckedAt: "2026-06-08",
          conditionMode: "manual_collector_note",
          gradingMode: "not_professional_grade",
          language: "English",
          variantLabel: "Holo",
          rarity: "Rare Holo",
          cardNumber: "ET-001",
          setName: "Smoke Set",
          workspaceId: "workspace-personal-local-beta",
          workspaceName: "My Personal Space",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "focused-vault-smoke-sealed",
          name: "Focused Vault Smoke Sealed Box",
          destinationScope: ["vault"],
          recordType: "vault_item",
          businessInventory: false,
          vaultStatus: "sealed",
          status: "Sealed / Holding",
          productType: "Booster Box",
          quantity: 1,
          marketPrice: 42,
          conditionName: "Sealed",
          setName: "Smoke Set",
          workspaceId: "workspace-personal-local-beta",
          workspaceName: "My Personal Space",
          createdAt: now,
          updatedAt: now,
        },
      ];
      data.vaultDisplayCase = (data.vaultDisplayCase || []).filter((entry) => entry.itemId !== "focused-vault-smoke-item" && entry.itemName !== "Focused Vault Smoke Card");
      data.tradeRecords = [
        ...(data.tradeRecords || []).filter((record) => record.id !== "focused-vault-linked-trade"),
        {
          id: "focused-vault-linked-trade",
          sourceItemName: "Focused Vault Smoke Card",
          receivedName: "Focused Vault Trade Memory",
          resultLabel: "Fair Trade",
          tradeDate: "2026-06-10",
          vaultLinkedSourceItemId: "focused-vault-smoke-item",
          vaultLinkedSourceName: "Focused Vault Smoke Card",
          inventoryMutation: "none",
          workspaceId: "workspace-personal-local-beta",
          workspaceName: "My Personal Space",
          createdAt: now,
          updatedAt: now,
        },
      ];
      return data;
    });
    await reloadWithAppData(vaultData);
    await nav("Vault");
    await assertVisibleText("Vault");
    await assertVisibleText("Focused Vault Smoke Card");
    await assertVisibleText("Collection Summary");
    await assertVisibleText("Total items");
    await assertVisibleText("Wishlist count");
    await assertVisibleText("Items with notes");
    await assertVisibleText("Items without value");
    await assertVisibleText("Sets created");
    await assertVisibleText("Recently added");
    await assertVisibleText("Needs profile details");
    await assertVisibleText("Display Case");
    await assertVisibleText("Your Display Case is waiting.");
    await assertVisibleText("Local display only");
    await assertVisibleText("Collection Sets");
    await assertVisibleText("Set Shelf");
    await assertVisibleText("Vault upgrade preview");
    await assertVisibleText("Your Set Shelf is waiting. Create a set for favorites, sealed product, slabs, kid collections, trade binders, or master set goals.");
    await page.getByRole("button", { name: /^Create Set$/ }).first().click();
    const collectionSetModal = page.locator('.flow-modal[data-flow="vaultCollectionSet"]').first();
    await expectVisible(collectionSetModal, "Vault Collection Sets modal");
    await fillByLabel(collectionSetModal, "Set name", "Smoke Trade Binder Shelf");
    await collectionSetModal.locator("label").filter({ hasText: /^Set type/ }).locator("select").selectOption({ label: "Trade Binder" });
    await fillByLabel(collectionSetModal, "Optional goal", "Keep trades easy to review");
    await fillByLabel(collectionSetModal, "Family / kid label", "Family trade night");
    await fillByLabel(collectionSetModal, "Date created", "2026-06-09");
    await fillByLabel(collectionSetModal, "Set Notes", "Smoke coverage for local Collection Sets.");
    await assertVisibleText("Soon you’ll be able to tuck Vault items directly into this set.");
    await collectionSetModal.getByRole("button", { name: /^Create Set$/ }).click();
    await assertVisibleText(/Collection Set saved locally/i);
    await page.waitForFunction(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.vaultCollectionSets || []).some((entry) => entry.setName === "Smoke Trade Binder Shelf" && entry.setType === "Trade Binder");
    }, null, { timeout: 5000 });
    const savedCollectionSets = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return data.vaultCollectionSets || [];
    });
    assert.ok(savedCollectionSets.some((entry) => entry.setName === "Smoke Trade Binder Shelf" && entry.setType === "Trade Binder"), "Vault Collection Sets should persist saved set shelves locally");
    await collectionSetModal.getByRole("button", { name: /^Close$/ }).first().click();
    await collectionSetModal.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await expectVisible(page.locator(".vault-collection-set-card").filter({ hasText: "Smoke Trade Binder Shelf" }).first(), "Vault saved Collection Set card");
    await assertVisibleText("Set progress");
    await assertVisibleText("0 items assigned");
    await assertVisibleText("Add items later. Vault items are not assigned automatically in this local beta.");
    await assertVisibleText("Add to Set");
    await page.getByRole("button", { name: /^Wishlist$/ }).first().click();
    const wishlistPanel = page.locator("#wishlist-items-section").first();
    await expectVisible(wishlistPanel, "Vault Wishlist / ISO panel");
    await expectVisible(wishlistPanel.getByText("Your Wishlist / ISO planner is quiet.").first(), "Wishlist / ISO empty state");
    await assertVisibleText("No automatic matching. No live seller offers.");
    await wishlistPanel.getByRole("button", { name: /^Add Wishlist \/ ISO$/ }).first().click();
    const wishlistModal = page.locator('.flow-modal[data-flow="wishlistIso"]').first();
    await expectVisible(wishlistModal, "Wishlist / ISO modal");
    await fillByLabel(wishlistModal, "Wanted item name", "Focused ISO Chase Card");
    await wishlistModal.getByLabel("Category").selectOption("card");
    await wishlistModal.getByLabel("Priority").selectOption("high");
    await fillByLabel(wishlistModal, "Target price text", "under $30");
    await wishlistModal.getByLabel("Status").selectOption("looking");
    await fillByLabel(wishlistModal, "Notes", "Smoke coverage for local Wishlist / ISO planning.");
    await wishlistModal.getByRole("button", { name: /^Save Wishlist \/ ISO$/ }).click();
    await expectVisible(wishlistModal.getByText("Wishlist / ISO item saved locally.").first(), "Wishlist / ISO saved message");
    await page.waitForFunction(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.items || []).some((item) => item.name === "Focused ISO Chase Card" && item.wishlistIso === true && item.planningMode === "local_only" && item.matchingMode === "none" && item.sellerOfferMode === "none");
    }, null, { timeout: 5000 });
    await wishlistModal.getByRole("button", { name: /^Close$/ }).first().click();
    await wishlistModal.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await expectVisible(wishlistPanel.locator(".wishlist-iso-row").filter({ hasText: "Focused ISO Chase Card" }).first(), "Saved Wishlist / ISO row");
    await page.getByRole("button", { name: /^Collection$/ }).first().click();
    await page.getByRole("button", { name: /^Showcase$/ }).first().click();
    await assertVisibleText("3D Collector Showcase");
    await assertVisibleText("Collection pieces with depth");
    await assertVisibleText("Rare Holo");
    await expectVisible(
      page.locator(".vault-showcase-grid .collector-showcase-card").filter({ hasText: "Focused Vault Smoke Card" }).first(),
      "Vault Showcase card"
    );
    const focusedFlipCard = page.locator(".vault-showcase-grid .collector-flip-card").filter({ hasText: "Focused Vault Smoke Card" }).first();
    await expectVisible(focusedFlipCard, "Vault flip detail card");
    await focusedFlipCard.locator("summary").click();
    await expectVisible(focusedFlipCard.locator(".collector-flip-back").filter({ hasText: "Back-side details" }).first(), "Vault flip back-side details");
    await expectVisible(focusedFlipCard.getByRole("button", { name: /^Open Profile$/ }).first(), "Vault flip Open Profile action");
    await page.getByRole("button", { name: /^Shelf$/ }).first().click();
    await assertVisibleText("Sealed Product Shelf");
    await assertVisibleText("Sealed products on display");
    await assertVisibleText("Visual display only");
    await expectVisible(
      page.locator(".sealed-product-shelf-card").filter({ hasText: "Focused Vault Smoke Sealed Box" }).first(),
      "Vault sealed shelf card"
    );
    await page.getByRole("button", { name: /^Gallery$/ }).first().click();
    await assertVisibleText("Collection Gallery");
    await assertVisibleText("Collector wall");
    const focusedGalleryTile = page.locator(".vault-gallery-tile").filter({ hasText: "Focused Vault Smoke Card" }).first();
    await expectVisible(focusedGalleryTile, "Vault Gallery item tile");
    await focusedGalleryTile.click();
    await assertVisibleText("Item Profile");
    await page.locator(".vault-detail-card").getByRole("button", { name: /^Close$/ }).first().click();
    await page.getByRole("button", { name: /^Standard view$/ }).first().click();
    const focusedVaultCard = page.locator(".vault-item-card").filter({ hasText: "Focused Vault Smoke Card" }).first();
    await expectVisible(focusedVaultCard, "focused Vault item card");
    await focusedVaultCard.getByRole("button", { name: /Item Profile/i }).first().click();
    await assertVisibleText("Item Profile");
    await assertVisibleText("3D Collector Showcase");
    await assertVisibleText("Vault Item");
    await assertVisibleText("Collector Notes");
    await assertVisibleText("Condition Notes");
    await assertVisibleText("Manual collector note");
    await assertVisibleText("Not a professional grade");
    await assertVisibleText("Condition can affect price");
    await assertVisibleText("Smoke original corner note.");
    await assertVisibleText("Sleeved in a smoke test binder.");
    await assertVisibleText("Estimated Value");
    await assertVisibleText("Memory / Story");
    await assertVisibleText("Family View");
    await assertVisibleText("Kid Safe Notes");
    await assertVisibleText("No value saved yet. Add an estimate when you are ready.");
    await assertVisibleText("No collector notes yet. Add why this item matters, where it came from, or what makes it special.");
    await assertVisibleText("Profile details");
    await assertVisibleText("Condition / language / variant");
    await assertVisibleText("Value source");
    await assertVisibleText("Linked trade history preview");
    await assertVisibleText("Focused Vault Smoke Card for Focused Vault Trade Memory");
    await assertVisibleText("Actions");
    await expectVisible(page.getByRole("button", { name: /^Edit Profile$/ }).first(), "Vault Item Profile edit action");
    await expectVisible(page.getByRole("button", { name: /^Add note$/ }).first(), "Vault Item Profile add note action");
    await expectVisible(page.getByRole("button", { name: /^Add to trade$/ }).first(), "Vault Item Profile add trade action");
    await expectVisible(page.getByRole("button", { name: /^Use in Forge$/ }).first(), "Vault Item Profile Forge action");
    await expectVisible(page.getByRole("button", { name: /^Check in Market$/ }).first(), "Vault Item Profile Market action");
    await expectVisible(page.getByRole("button", { name: /^Add to set$/ }).first(), "Vault Item Profile add to set coming soon action");
    await expectVisible(page.getByRole("button", { name: /^Add to Display Case$/ }).first(), "Vault Item Profile Display Case action");
    await page.getByRole("button", { name: /^Add to Display Case$/ }).first().click();
    const displayCaseModal = page.locator('.flow-modal[data-flow="vaultDisplayCase"]').first();
    await expectVisible(displayCaseModal, "Vault Display Case modal");
    await fillByLabel(displayCaseModal, "Position / order", "1");
    await displayCaseModal.locator("label").filter({ hasText: /^Display category/ }).locator("select").selectOption("grail");
    await fillByLabel(displayCaseModal, "Display note", "Smoke favorite display note.");
    await expectVisible(displayCaseModal.getByText("Display Case does not remove items from Vault.").first(), "Display Case local safety copy");
    await displayCaseModal.getByRole("button", { name: /^Add to Display Case$/ }).click();
    await expectVisible(displayCaseModal.getByText("Added to Display Case.").first(), "Display Case saved message");
    await page.waitForFunction(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.vaultDisplayCase || []).some((entry) => (
        entry.itemId === "focused-vault-smoke-item" &&
        entry.itemName === "Focused Vault Smoke Card" &&
        entry.displayCategory === "grail" &&
        entry.displayMode === "local_only" &&
        entry.publicSharing === "not_connected" &&
        entry.listingMode === "none"
      ));
    }, null, { timeout: 5000 });
    await displayCaseModal.getByRole("button", { name: /^Close$/ }).first().click();
    await displayCaseModal.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await page.locator(".vault-detail-card").getByRole("button", { name: /^Close$/ }).first().click();
    await expectVisible(page.locator(".vault-display-case-card").filter({ hasText: "Focused Vault Smoke Card" }).first(), "Vault Display Case filled card");
    await nav("Hearth");
    await assertVisibleText("Featured in your Display Case");
    await page.getByRole("button", { name: /^Open Display Case$/ }).first().click();
    await assertVisibleText("Display Case");
    await expectVisible(page.locator(".vault-display-case-card").filter({ hasText: "Focused Vault Smoke Card" }).first(), "Hearth Display Case link target");
    await page.locator(".vault-display-case-card").filter({ hasText: "Focused Vault Smoke Card" }).first().getByRole("button", { name: /^Remove from Display Case$/ }).click();
    await page.waitForFunction(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return !(data.vaultDisplayCase || []).some((entry) => entry.itemId === "focused-vault-smoke-item");
    }, null, { timeout: 5000 });
    const displayCaseRemovalState = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return {
        displayCaseCount: (data.vaultDisplayCase || []).filter((entry) => entry.itemId === "focused-vault-smoke-item").length,
        itemStillInVault: (data.items || []).some((item) => item.id === "focused-vault-smoke-item" && (item.destinationScope || []).includes("vault")),
      };
    });
    assert.equal(displayCaseRemovalState.displayCaseCount, 0, "Display Case entry should be removable");
    assert.equal(displayCaseRemovalState.itemStillInVault, true, "Removing from Display Case should not delete the Vault item");
    const focusedVaultCardAfterDisplayCase = page.locator(".vault-item-card").filter({ hasText: "Focused Vault Smoke Card" }).first();
    await expectVisible(focusedVaultCardAfterDisplayCase, "focused Vault item card after Display Case removal");
    await focusedVaultCardAfterDisplayCase.getByRole("button", { name: /Item Profile/i }).first().click();
    await expectVisible(page.getByRole("button", { name: /^Compare$/ }).first(), "Vault Item Profile Compare action");
    await page.getByRole("button", { name: /^Compare$/ }).first().click();
    const vaultCompareModal = page.locator('.flow-modal[data-flow="itemComparison"]').first();
    await expectVisible(vaultCompareModal, "Vault Item Profile Compare modal");
    assert.equal(await vaultCompareModal.getByLabel("Item name").inputValue(), "Focused Vault Smoke Card", "Vault Compare should seed item name");
    await expectVisible(vaultCompareModal.getByText("Not live market pricing").first(), "Vault Compare safety copy");
    await vaultCompareModal.getByRole("button", { name: /^Close$/ }).first().click();
    await vaultCompareModal.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await page.getByRole("button", { name: /^Edit Profile$/ }).first().click();
    const profileEditForm = page.locator("form.vault-edit-form").first();
    await expectVisible(profileEditForm, "Vault Item Profile edit form");
    const profileNotesSection = profileEditForm.locator(".vault-form-section").filter({ hasText: /^Notes/ }).first();
    await profileNotesSection.getByRole("button").first().click();
    await profileNotesSection.locator("label").filter({ hasText: /^Manual condition/ }).locator("select").selectOption("Light Play");
    await profileNotesSection.locator("label").filter({ hasText: /^Condition Notes/ }).locator("textarea").fill("Smoke updated edge whitening note.");
    await profileNotesSection.locator("label").filter({ hasText: /^Sleeve \/ toploader \/ storage notes/ }).locator("textarea").fill("Toploaded after smoke review.");
    await profileNotesSection.locator("label").filter({ hasText: /^Date checked/ }).locator("input").fill("2026-06-10");
    await profileEditForm.getByRole("button", { name: /^Save Changes$/ }).click();
    await page.waitForFunction(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const item = (data.items || []).find((entry) => entry.id === "focused-vault-smoke-item");
      return item &&
        item.conditionName === "Light Play" &&
        item.conditionNotes === "Smoke updated edge whitening note." &&
        item.storageCareNotes === "Toploaded after smoke review." &&
        item.conditionCheckedAt === "2026-06-10" &&
        item.conditionMode === "manual_collector_note" &&
        item.gradingMode === "not_professional_grade";
    }, null, { timeout: 5000 });
    await assertVisibleText("Smoke updated edge whitening note.");
    await assertVisibleText("Toploaded after smoke review.");
    await assertVisibleText("Manual collector note");
    await assertVisibleText("Not a professional grade");
    assert.ok(
      await page.getByRole("button", { name: /Quick Add|Add Item|Search \/ Scan Item/i }).count() > 0,
      "Vault should expose a primary add/search action"
    );
    await page.getByRole("button", { name: /^Check in Market$/ }).first().click();
    await assertVisibleText(/Market|Market Watch|Fair price discovery/i);
  }

  async function focusedMarketTest() {
    const marketData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const smokeNames = new Set(["Smoke Compare Mystery Card", "Smoke Price Memory ETB"]);
      data.marketPriceMemories = (data.marketPriceMemories || []).filter((entry) => !smokeNames.has(entry.itemName));
      data.itemComparisons = (data.itemComparisons || []).filter((entry) => !smokeNames.has(entry.itemName));
      return data;
    });
    await reloadWithAppData(marketData);
    await nav("Market");
    await assertVisibleText(/Market|TideTradr/i);
    await assertVisibleText("Price Memory");
    await assertVisibleText("Not Live Pricing");
    await assertVisibleText("Use this as a memory/checklist, not a guaranteed live price.");
    await assertVisibleText("Market Memory Comparison");
    await assertVisibleText("No selected item yet");
    await assertVisibleText("Compare Table");
    await assertVisibleText("Your Compare Table is empty.");
    await assertVisibleText("Comparison uses saved/local data.");
    await assertVisibleText("Market upgrade preview");
    await assertVisibleText("Wishlist / ISO");
    await assertVisibleText("No automatic matching. No live seller offers.");
    const marketText = await page.locator("body").innerText();
    assert.doesNotMatch(marketText, /price accuracy guaranteed|automated market sync|live market average|matched with sellers|seller offers are live|automatic matching is live|grading verified|authentication verified|investment advice is provided/i);
    const compareSection = page.locator(".item-compare-table-card").first();
    await expectVisible(compareSection.getByRole("button", { name: /^Add Item to Compare$/ }).first(), "Compare Table add action");
    await compareSection.getByRole("button", { name: /^Add Item to Compare$/ }).first().click();
    const compareModal = page.locator('.flow-modal[data-flow="itemComparison"]').first();
    await expectVisible(compareModal, "Compare Table modal");
    await fillByLabel(compareModal, "Item name", "Smoke Compare Mystery Card");
    await compareModal.getByLabel("Item type").selectOption("card");
    await fillByLabel(compareModal, "Set / product", "Smoke Set");
    await fillByLabel(compareModal, "Condition text", "Unknown");
    await fillByLabel(compareModal, "Status", "Manual compare");
    await fillByLabel(compareModal, "Notes", "Missing value should stay unknown.");
    await expectVisible(compareModal.getByText("Missing value warning").first(), "Compare Table missing value helper");
    await compareModal.getByRole("button", { name: /^Add to Compare$/ }).click();
    await expectVisible(compareModal.getByText("Added to Compare Table.").first(), "Compare Table saved message");
    await page.waitForFunction(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.itemComparisons || []).some((entry) => entry.itemName === "Smoke Compare Mystery Card" && entry.compareMode === "local_only" && entry.pricingMode === "saved_or_manual" && entry.livePricing === false);
    }, null, { timeout: 5000 });
    await compareModal.getByRole("button", { name: /^Close$/ }).click();
    await compareModal.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await expectVisible(page.locator(".item-compare-card").filter({ hasText: "Smoke Compare Mystery Card" }).first(), "Compare Table saved manual missing-value card");
    await assertVisibleText("Missing value warning");
    const priceMemorySection = page.locator(".market-price-memory-card").first();
    await expectVisible(priceMemorySection.getByRole("button", { name: /^Save Price$/ }).first(), "Market Price Memory Save Price action");
    await priceMemorySection.getByRole("button", { name: /^Save Price$/ }).first().click();
    const priceMemoryModal = page.locator('.flow-modal[data-flow="marketPriceMemory"]').first();
    await expectVisible(priceMemoryModal, "Market Price Memory modal");
    await fillByLabel(priceMemoryModal, "Item name", "Smoke Price Memory ETB");
    await fillByLabel(priceMemoryModal, "Price", "42.50");
    await priceMemoryModal.locator("select").first().selectOption({ label: "Sold Price" });
    await fillByLabel(priceMemoryModal, "Where You Saw It", "Local shop shelf");
    await fillByLabel(priceMemoryModal, "Condition", "Sealed");
    await fillByLabel(priceMemoryModal, "Date seen", "2026-06-09");
    await fillByLabel(priceMemoryModal, "Price Note", "Manual local snapshot for smoke coverage.");
    await priceMemoryModal.getByRole("button", { name: /^Save Price$/ }).click();
    await assertVisibleText(/Saved Price added to Price Memory/i);
    await page.waitForFunction(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.marketPriceMemories || []).some((entry) => entry.itemName === "Smoke Price Memory ETB" && entry.priceType === "Sold Price");
    }, null, { timeout: 5000 });
    const savedPriceMemory = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return data.marketPriceMemories || [];
    });
    assert.ok(savedPriceMemory.some((entry) => entry.itemName === "Smoke Price Memory ETB" && entry.priceType === "Sold Price"), "Market Price Memory should persist saved price snapshots locally");
    await priceMemoryModal.getByRole("button", { name: /^Close$/ }).click();
    await priceMemoryModal.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    const savedPriceMemoryRow = page.locator(".market-price-memory-row").filter({ hasText: "Smoke Price Memory ETB" }).first();
    await expectVisible(savedPriceMemoryRow, "Market saved Price Memory row");
    await savedPriceMemoryRow.getByRole("button", { name: /^Add to Compare$/ }).click();
    const priceCompareModal = page.locator('.flow-modal[data-flow="itemComparison"]').first();
    await expectVisible(priceCompareModal, "Price Memory Compare modal");
    assert.equal(await priceCompareModal.getByLabel("Item name").inputValue(), "Smoke Price Memory ETB", "Price Memory Compare should seed item name");
    await priceCompareModal.getByRole("button", { name: /^Add to Compare$/ }).click();
    await expectVisible(priceCompareModal.getByText("Added to Compare Table.").first(), "Price Memory Compare saved message");
    await page.waitForFunction(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.itemComparisons || []).some((entry) => entry.itemName === "Smoke Price Memory ETB" && Number(entry.rememberedPrice) === 42.5);
    }, null, { timeout: 5000 });
    await priceCompareModal.getByRole("button", { name: /^Close$/ }).click();
    await priceCompareModal.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await expectVisible(page.locator(".item-compare-card").filter({ hasText: "Smoke Price Memory ETB" }).first(), "Compare Table saved Price Memory card");
    await assertVisibleText("Lowest saved");
    await assertVisibleText("Highest saved");
    await assertVisibleText("Average saved");
    await assertVisibleText("Compare Later");
    const searchForm = page.locator(".catalog-search-form").first();
    await expectVisible(searchForm, "Market catalog search form");
    await searchForm.locator("input").first().fill("Prismatic Evolutions Booster Bundle");
    await searchForm.getByRole("button", { name: /Search Catalog|Search Market Watch|Search/i }).first().click();
    const focusedMarketCard = page.locator(".catalog-result-card").filter({ hasText: "Prismatic Evolutions Booster Bundle", hasNotText: "Code Card" }).first();
    await expectVisible(
      focusedMarketCard,
      "Market focused search result",
      20000
    );
    await expectVisible(focusedMarketCard.locator(".market-showcase-preview").first(), "Market compact 3D showcase preview");
    await expectVisible(focusedMarketCard.getByRole("button", { name: /^Save Price$/ }).first(), "Market result Save Price action");
    await expectVisible(focusedMarketCard.getByRole("button", { name: /^Compare$/ }).first(), "Market result Compare action");
    await focusedMarketCard.getByRole("button", { name: /^Compare$/ }).first().click();
    const resultCompareModal = page.locator('.flow-modal[data-flow="itemComparison"]').first();
    await expectVisible(resultCompareModal, "Market result Compare modal");
    assert.match(await resultCompareModal.getByLabel("Item name").inputValue(), /Prismatic Evolutions Booster Bundle/i, "Market result Compare should seed item name");
    await resultCompareModal.getByRole("button", { name: /^Close$/ }).first().click();
    await resultCompareModal.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await expectVisible(focusedMarketCard.getByRole("button", { name: /^Add to Wishlist \/ ISO$/ }).first(), "Market result Add to Wishlist / ISO action");
    await focusedMarketCard.getByRole("button", { name: /^Add to Wishlist \/ ISO$/ }).first().click();
    const marketWishlistModal = page.locator('.flow-modal[data-flow="wishlistIso"]').first();
    await expectVisible(marketWishlistModal, "Market seeded Wishlist / ISO modal");
    assert.match(
      await marketWishlistModal.getByLabel("Wanted item name").inputValue(),
      /Prismatic Evolutions Booster Bundle/i,
      "Market result should seed Wishlist / ISO item name"
    );
    await expectVisible(marketWishlistModal.getByText("No automatic matching").first(), "Wishlist / ISO safety copy from Market");
    await marketWishlistModal.getByRole("button", { name: /^Close$/ }).first().click();
    await marketWishlistModal.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  }

  async function focusedForgeTest() {
    const forgeData = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const now = new Date().toISOString();
      data.userType = "seller";
      data.dashboardPreset = "seller";
      data.profile = {
        ...(data.profile || {}),
        userType: "seller",
        dashboardPreset: "seller",
      };
      data.items = [
        ...(data.items || []).filter((item) => ![
          "focused-forge-smoke-item",
          "focused-vault-trade-item",
        ].includes(item.id) && item.name !== "Focused Smoke Booster Bundle" && item.receivedThroughTradeId !== "focused-smoke-trade"),
        {
          id: "focused-forge-smoke-item",
          name: "Focused Forge Smoke ETB",
          destinationScope: ["forge"],
          recordType: "forge_inventory",
          businessInventory: true,
          status: "In Stock",
          quantity: 2,
          unitCost: 40,
          marketPrice: 55,
          salePrice: 60,
          physicalLocation: "At Home",
          workspaceId: "workspace-personal-local-beta",
          workspaceName: "My Personal Space",
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "focused-vault-trade-item",
          name: "Focused Vault Trade Card",
          itemName: "Focused Vault Trade Card",
          destinationScope: ["vault"],
          recordType: "vault_item",
          businessInventory: false,
          status: "Personal Collection",
          vaultStatus: "personal_collection",
          quantity: 1,
          ownedQuantity: 1,
          marketPrice: 35,
          marketValue: 35,
          setName: "Smoke Test Set",
          productType: "Card",
          conditionName: "Near Mint",
          workspaceId: "workspace-personal-local-beta",
          workspaceName: "My Personal Space",
          createdAt: now,
          updatedAt: now,
        },
      ];
      data.tradeRecords = (data.tradeRecords || []).filter((record) => !String(record.sourceItemName || "").startsWith("Focused Smoke") && !String(record.sourceItemName || "").startsWith("Focused Vault"));
      return data;
    });
    await reloadWithAppData(forgeData);
    await nav("Forge");
    await assertVisibleText("Forge");
    await assertVisibleText("Focused Forge Smoke ETB");
    await assertVisibleText("Forge upgrade preview");
    await assertVisibleText("Wishlist / ISO");
    await assertVisibleText("no automatic matching and no live seller offers");
    const forgeWishlistCard = page.locator(".forge-wishlist-iso-card").first();
    await expectVisible(forgeWishlistCard, "Forge Wishlist / ISO card");
    await forgeWishlistCard.getByRole("button", { name: /^Add Wishlist \/ ISO$/ }).click();
    const forgeWishlistModal = page.locator('.flow-modal[data-flow="wishlistIso"]').first();
    await expectVisible(forgeWishlistModal, "Forge Wishlist / ISO modal");
    await expectVisible(forgeWishlistModal.getByText("No matching or seller offers").first(), "Forge Wishlist / ISO safety copy");
    await forgeWishlistModal.getByRole("button", { name: /^Close$/ }).first().click();
    await forgeWishlistModal.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    await expectVisible(page.getByRole("button", { name: "Add Inventory", exact: true }).first(), "Forge Add Inventory action");
    const tradeCompassAction = page.getByRole("button", { name: "Trade Compass", exact: true }).first();
    await expectVisible(tradeCompassAction, "Forge Trade Compass action");
    await tradeCompassAction.click();
    const compassModal = page.locator('.flow-modal[data-flow="tradeCompass"]').first();
    await expectVisible(compassModal, "Forge Trade Compass modal");
    await expectVisible(compassModal.getByText("Is This Trade Worth It?").first(), "Trade Compass prompt");
    await expectVisible(compassModal.getByText("Unknown Reading").first(), "Trade Compass unknown reading");
    await compassModal.getByLabel("Your Side", { exact: true }).fill("Focused Compass Gave Card");
    await compassModal.getByLabel("Their Side", { exact: true }).fill("Focused Compass Got Card");
    await compassModal.getByLabel("Estimated value for Your Side").fill("35");
    await compassModal.getByLabel("Estimated value for Their Side").fill("44");
    await compassModal.getByLabel("Condition notes").fill("Both sides checked together.");
    await compassModal.getByLabel("Demand notes").fill("Their card helps finish a set.");
    await compassModal.getByLabel("Personal importance notes").fill("Good trade for a family binder goal.");
    await expectVisible(compassModal.getByText("Strong Offer").first(), "Trade Compass Strong Offer reading");
    await compassModal.getByLabel("Estimated value for Their Side").fill("35");
    await expectVisible(compassModal.getByText("Fair Trade").first(), "Trade Compass Fair Trade reading");
    await compassModal.getByLabel("Estimated value for Your Side").fill("50");
    await compassModal.getByLabel("Estimated value for Their Side").fill("30");
    await expectVisible(compassModal.getByText("Use Caution").first(), "Trade Compass Use Caution reading");
    await compassModal.getByLabel("Estimated value for Their Side").fill("");
    await expectVisible(compassModal.getByText("Unknown Reading").first(), "Trade Compass missing value reading");
    await compassModal.getByLabel("Estimated value for Your Side").fill("35");
    await compassModal.getByLabel("Estimated value for Their Side").fill("44");
    await compassModal.getByRole("button", { name: "Save to Trade Ledger" }).click();
    await expectVisible(compassModal.getByText("Saved to Trade Ledger. Inventory counts were not changed.").first(), "Trade Compass saved message");
    await compassModal.getByRole("button", { name: "Close", exact: true }).click();
    await compassModal.waitFor({ state: "hidden", timeout: 5000 });
    await expectVisible(page.locator(".forge-trade-history-card").filter({ hasText: "Focused Compass Gave Card" }).first(), "Trade Compass saved ledger record");
    const addTradeAction = page.getByRole("button", { name: "Log a Trade", exact: true }).first();
    await expectVisible(addTradeAction, "Forge Log a Trade action");
    await addTradeAction.click();
    const tradeModal = page.locator('.flow-modal[data-flow="tradeValue"]').first();
    await expectVisible(tradeModal, "Forge Trade Ledger modal");
    await tradeModal.getByLabel("What You Gave").fill("Focused Smoke Binder Lot");
    await tradeModal.getByLabel("Estimated value given").fill("35");
    await tradeModal.getByLabel("What You Got").fill("Focused Smoke Booster Bundle");
    await tradeModal.getByLabel("Estimated value received").fill("44");
    await tradeModal.getByLabel("Condition or notes").fill("Mixed binder condition");
    await tradeModal.getByLabel("Trade date").fill("2026-06-09");
    await tradeModal.getByLabel("Trade Story").fill("Traded at a family-friendly card night after checking condition together.");
    await tradeModal.getByRole("button", { name: "Review Trade Balance" }).click();
    await expectVisible(tradeModal.getByText("Value Gained").first(), "Forge Trade Balance result");
    await tradeModal.getByRole("button", { name: "Save Trade" }).click();
    await expectVisible(tradeModal.getByText("Trade saved to your Trade Ledger.").first(), "Forge trade saved state");
    await expectVisible(tradeModal.getByText("Collection Update").first(), "Forge trade collection update panel");
    await expectVisible(tradeModal.getByText("Manual trade memory").first(), "Forge manual trade Vault Link state");
    await tradeModal.getByRole("button", { name: "Add Received Item to Vault" }).click();
    await expectVisible(tradeModal.getByText("Received Through Trade added to Vault").first(), "Forge received item added to Vault message");
    await tradeModal.getByRole("button", { name: "Close", exact: true }).click();
    await tradeModal.waitFor({ state: "hidden", timeout: 5000 });
    await expectVisible(page.locator(".forge-trade-history-card").filter({ hasText: "Focused Smoke Binder Lot" }).first(), "Forge Trade Ledger saved record");
    await page.waitForFunction(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.tradeRecords || []).some((record) => record.sourceItemName === "Focused Smoke Binder Lot" && record.receivedVaultItemId);
    }, null, { timeout: 5000 });
    const savedTradeState = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const trade = (data.tradeRecords || []).find((record) => record.sourceItemName === "Focused Smoke Binder Lot");
      const item = (data.items || []).find((record) => record.id === "focused-forge-smoke-item");
      const receivedItem = (data.items || []).find((record) => record.id === trade?.receivedVaultItemId);
      return { trade, itemQuantity: item?.quantity, receivedItem };
    });
    assert.equal(savedTradeState.trade?.resultLabel, "Value Gained");
    assert.equal(savedTradeState.trade?.inventoryMutation, "explicit_vault_update");
    assert.equal(savedTradeState.itemQuantity, 2, "Saving trade history should not change Forge inventory quantity");
    assert.equal(savedTradeState.receivedItem?.status, "Received Through Trade", "Add Received Item to Vault should create an explicit Vault record");

    await addTradeAction.click();
    await expectVisible(tradeModal, "Forge linked Trade Ledger modal");
    await tradeModal.getByLabel("Trade Source").selectOption("focused-vault-trade-item");
    await expectVisible(tradeModal.getByText("Vault Link").first(), "Forge linked trade Vault Link helper");
    await tradeModal.getByLabel("What You Got").fill("Focused Linked Trade Reward");
    await tradeModal.getByLabel("Estimated value received").fill("35");
    await tradeModal.getByLabel("Trade Story").fill("Linked the trade to a Vault item and reviewed the update manually.");
    await tradeModal.getByRole("button", { name: "Review Trade Balance" }).click();
    await expectVisible(tradeModal.getByText("Fair Trade").first(), "Forge linked trade balance");
    await tradeModal.getByRole("button", { name: "Save Trade" }).click();
    await expectVisible(tradeModal.getByText("Focused Vault Trade Card").first(), "Forge linked source appears on saved trade");
    await tradeModal.getByRole("button", { name: "Mark Given Item" }).click();
    await expectVisible(tradeModal.getByText("Given item marked Moved Through Trade").first(), "Forge Mark Given Item message");
    await tradeModal.getByRole("button", { name: "Close", exact: true }).click();
    await tradeModal.waitFor({ state: "hidden", timeout: 5000 });
    await expectVisible(page.locator(".forge-trade-history-card").filter({ hasText: "Focused Vault Trade Card" }).first(), "Forge linked Vault trade record");
    const linkedTradeState = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const trade = (data.tradeRecords || []).find((record) => record.vaultLinkedSourceItemId === "focused-vault-trade-item");
      const item = (data.items || []).find((record) => record.id === "focused-vault-trade-item");
      return { trade, item };
    });
    assert.equal(linkedTradeState.trade?.givenVaultItemStatus, "Moved Through Trade");
    assert.equal(linkedTradeState.item?.vaultStatus, "traded");
    assert.equal(linkedTradeState.item?.quantity, 1, "Mark Given Item should not delete or decrement the Vault item");
  }

  async function focusedAdminTest() {
    const adminUrl = new URL(APP_URL);
    adminUrl.pathname = "/admin";
    await page.goto(adminUrl.toString(), { waitUntil: "domcontentloaded" });
    await assertVisibleText(/Admin|Hearth|permission|Beta/i);
    const adminModeBar = page.locator(".admin-mode-control-bar").first();
    if (await adminModeBar.isVisible().catch(() => false)) {
      await adminModeBar.getByRole("button", { name: "Regular" }).click();
      await assertVisibleText("Regular preview active");
      assert.equal(await page.locator(".admin-edit-mode-banner").count(), 0, "regular preview should not show the admin edit banner");
      await adminModeBar.getByRole("button", { name: "Admin" }).click();
      await assertVisibleText("Admin Mode active");
      return;
    }
    assert.equal(await page.locator(".admin-edit-mode-banner").count(), 0, "non-admin users should not see admin edit controls");
    assert.equal(await page.locator(".admin-danger-action, .admin-destructive-action").count(), 0, "non-admin users should not see destructive admin controls");
  }

  async function focusedSparkTest() {
    await nav("The Spark").catch(async () => {
      const sparkUrl = new URL(APP_URL);
      sparkUrl.pathname = "/kids-program";
      await page.goto(sparkUrl.toString(), { waitUntil: "domcontentloaded" });
    });
    await assertVisibleText(/The Spark|Kids Program|Igniting the spark/i);
    assert.ok(
      await page.getByRole("button", { name: /Apply|Request|Learn|Rules|Kids Program/i }).count() > 0,
      "The Spark should expose a primary family-safe action"
    );
    await assertVisibleText("Giving Ledger");
    await assertVisibleText("Kid Packs");
    await assertVisibleText("Spark Family Program Summary");
    await assertVisibleText("Kid packs planned");
    await assertVisibleText("Gifts/support logged");
    await assertVisibleText("Supplies tracked");
    await assertVisibleText("Event support notes");
    await assertVisibleText("Family impact preview");
    await assertVisibleText("Items still needed");
    await assertVisibleText("Event Support Planner");
    await assertVisibleText("Spark upgrade preview");
    await assertVisibleText("Keep child details private. Use initials, group names, or simple notes when needed.");
    const buildKidPackAction = page.getByRole("button", { name: "Build a Kid Pack", exact: true }).first();
    await expectVisible(buildKidPackAction, "The Spark Build a Kid Pack action");
    await buildKidPackAction.click();
    const kidPackModal = page.locator('.flow-modal[data-flow="sparkKidPack"]').first();
    await expectVisible(kidPackModal, "The Spark Kid Pack modal");
    await expectVisible(kidPackModal.getByText("Pack Builder").first(), "Kid Pack Pack Builder title");
    await expectVisible(kidPackModal.getByText("Keep child details private. Use initials, group names, or simple notes when needed.").first(), "Kid Pack privacy helper");
    await kidPackModal.getByLabel("Kid Packs").fill("Focused Spark Starter Pack");
    await kidPackModal.getByLabel("Pack Theme").fill("First binder day");
    await kidPackModal.getByLabel("Child age range").fill("9-12");
    await kidPackModal.getByLabel("Theme / interests").fill("Starter binder and favorite art cards");
    await kidPackModal.getByLabel("Pack Type").selectOption("Starter Pack");
    await kidPackModal.getByLabel("Pack Status").selectOption("Ready to Gift");
    await kidPackModal.getByLabel("Intended recipient or group optional").fill("Family table");
    await kidPackModal.getByLabel("Pack Contents").fill("Cards, sleeves, binder pages, deck box, and welcome note.");
    await kidPackModal.getByLabel("Items planned").fill("Sleeves, binder pages, deck box, snacks, and welcome note.");
    await kidPackModal.getByLabel("Estimated Value").fill("28");
    await kidPackModal.getByLabel("Pack Notes").fill("Use group notes only. No private child details.");
    await kidPackModal.getByRole("button", { name: "Save Kid Pack", exact: true }).click();
    await expectVisible(kidPackModal.getByText("Kid Pack saved locally.").first(), "The Spark Kid Pack saved message");
    await kidPackModal.getByRole("button", { name: "Close", exact: true }).first().click();
    await kidPackModal.waitFor({ state: "hidden", timeout: 5000 });
    await expectVisible(page.locator(".spark-kid-pack-row").filter({ hasText: "Focused Spark Starter Pack" }).first(), "The Spark saved Kid Pack row");
    await expectVisible(page.locator(".spark-kid-pack-row").filter({ hasText: "Ready to Gift" }).first(), "The Spark Kid Pack status row");
    await page.waitForFunction(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.sparkKidPacks || []).some((pack) => pack.packName === "Focused Spark Starter Pack" && pack.packStatus === "Ready to Gift" && pack.inventoryMutation === "none");
    }, null, { timeout: 5000 });
    const logGiftAction = page.getByRole("button", { name: "Log a Gift", exact: true }).first();
    await expectVisible(logGiftAction, "The Spark Log a Gift action");
    await logGiftAction.click();
    const giftModal = page.locator('.flow-modal[data-flow="sparkGift"]').first();
    await expectVisible(giftModal, "The Spark Giving Ledger modal");
    await expectVisible(giftModal.getByText("Giving Ledger is for program tracking only. It is not a tax receipt.").first(), "Giving Ledger tax disclaimer");
    await giftModal.getByLabel("Spark Gift").fill("Focused Spark Kid Pack Supplies");
    await giftModal.getByLabel("Donation Type").selectOption("supplies");
    await giftModal.getByLabel("Quantity or amount").fill("12 sleeves and deck boxes");
    await giftModal.getByLabel("Estimated Value").fill("36");
    await giftModal.getByLabel("Who It Helps").selectOption("Kid Pack");
    await giftModal.getByLabel("Donor or sponsor name optional").fill("Smoke Test Sponsor");
    await giftModal.getByLabel("Sponsor Note").fill("Supplies for reviewed kid packs.");
    await giftModal.getByLabel("Thank You Note").fill("Thank you for helping families collect safely.");
    await giftModal.getByRole("button", { name: "Save Spark Gift", exact: true }).click();
    await expectVisible(giftModal.getByText("Spark Gift saved to Giving Ledger.").first(), "The Spark Gift saved message");
    await giftModal.getByRole("button", { name: "Close", exact: true }).first().click();
    await giftModal.waitFor({ state: "hidden", timeout: 5000 });
    await expectVisible(page.locator(".spark-gift-ledger-row").filter({ hasText: "Focused Spark Kid Pack Supplies" }).first(), "The Spark saved gift row");
    const planEventAction = page.getByRole("button", { name: "Plan Event Support", exact: true }).first();
    await expectVisible(planEventAction, "The Spark Plan Event Support action");
    await planEventAction.click();
    const eventModal = page.locator('.flow-modal[data-flow="sparkEventSupport"]').first();
    await expectVisible(eventModal, "The Spark Event Support Planner modal");
    await expectVisible(eventModal.getByText("Local beta planning tool").first(), "Event Support local beta helper");
    await expectVisible(eventModal.getByText("It does not process payments, create tax receipts, verify sponsors, fulfill gifts, ship items, or expose private child/family details.").first(), "Event Support safety disclaimer");
    await eventModal.getByLabel("Event name").fill("Focused Spark Family Day");
    await eventModal.getByLabel("Date text").fill("Saturday TBD");
    await eventModal.getByLabel("Expected kids/families").fill("8 kids and 4 families");
    await eventModal.getByLabel("Status").selectOption("Collecting");
    await eventModal.getByLabel("Supplies needed").fill("Packs, sleeves, snacks, and table signs.");
    await eventModal.getByLabel("Volunteer notes").fill("Two parent helpers for setup and cleanup.");
    await eventModal.getByLabel("Sponsor / shop notes").fill("Local shop may offer table space after review.");
    await eventModal.getByLabel("Event notes").fill("General area only. No private child details or shipping promises.");
    await eventModal.getByRole("button", { name: "Save Event Plan", exact: true }).click();
    await expectVisible(eventModal.getByText("Event Support plan saved locally.").first(), "The Spark Event Support saved message");
    await page.waitForFunction(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.sparkEventPlans || []).some((plan) => plan.eventName === "Focused Spark Family Day" && plan.eventStatus === "Collecting" && plan.paymentProcessing === "none");
    }, null, { timeout: 5000 });
    await eventModal.getByRole("button", { name: "Close", exact: true }).first().click();
    await eventModal.waitFor({ state: "hidden", timeout: 5000 });
    await expectVisible(page.locator(".spark-event-support-row").filter({ hasText: "Focused Spark Family Day" }).first(), "The Spark saved Event Support row");
    await assertVisibleText("Event Planner");
    await assertVisibleText("Plan trade nights, shop visits, kid pack events, release days, giveaways, and family collecting activities. Local beta planning only.");
    await assertVisibleText("No RSVP, ticketing, payment, public listing, calendar sync, notification, or shop verification is connected.");
    const planCollectorEventAction = page.getByRole("button", { name: "Plan Event", exact: true }).first();
    await expectVisible(planCollectorEventAction, "The Spark Event Planner action");
    await planCollectorEventAction.click();
    const collectorEventModal = page.locator('.flow-modal[data-flow="collectorEventPlanner"]').first();
    await expectVisible(collectorEventModal, "Collector Event Planner modal");
    await expectVisible(collectorEventModal.getByText("Event Planner is local beta planning only.").first(), "Collector Event Planner local-only disclaimer");
    await collectorEventModal.getByLabel("Event name").fill("Focused Collector Trade Night");
    await collectorEventModal.getByLabel("Event Type").selectOption("trade night");
    await collectorEventModal.getByLabel("Date / time text").fill("Friday 6 PM");
    await collectorEventModal.getByLabel("Location text").fill("Local shop table");
    await collectorEventModal.getByLabel("People / shops involved").fill("Focused Friendly Shop and family collectors");
    await collectorEventModal.getByLabel("Status").selectOption("planning");
    await collectorEventModal.getByLabel("Supplies needed").fill("Trade binders, sleeves, snacks");
    await collectorEventModal.getByLabel("Notes").fill("Local planner only. No public listing.");
    await collectorEventModal.getByRole("button", { name: "Save Event", exact: true }).click();
    await expectVisible(collectorEventModal.getByText("Collector event saved locally.").first(), "Collector Event Planner saved message");
    await page.waitForFunction(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      return (data.collectorEventPlans || []).some((plan) => (
        plan.eventName === "Focused Collector Trade Night" &&
        plan.eventType === "trade night" &&
        plan.status === "planning" &&
        plan.rsvpStatus === "not_connected" &&
        plan.ticketingStatus === "not_connected" &&
        plan.paymentStatus === "not_connected" &&
        plan.publicListingStatus === "not_listed" &&
        plan.verificationStatus === "not_verified" &&
        plan.calendarIntegration === "none"
      ));
    }, null, { timeout: 5000 });
    await collectorEventModal.getByRole("button", { name: "Close", exact: true }).first().click();
    await collectorEventModal.waitFor({ state: "hidden", timeout: 5000 });
    await expectVisible(page.locator(".collector-event-row").filter({ hasText: "Focused Collector Trade Night" }).first(), "The Spark saved Collector Event row");
    const sparkEventPlannerText = await page.locator("body").innerText();
    assert.doesNotMatch(
      sparkEventPlannerText,
      /RSVPs are live|ticketing is live|payments are live|public event listing is live|shops are verified|calendar sync is live|notifications are sent/i,
      "Event Planner should not claim RSVP, ticketing, payment, public listing, calendar sync, notifications, or shop verification"
    );
  }

  async function focusedTidepoolTest() {
    await page.setViewportSize({ width: 390, height: 844 });
    await nav("Tidepool");
    await assertVisibleText("Tidepool trust dashboard");
    await assertVisibleText("Trusted Circle entries");
    await assertVisibleText("Shop/family notes");
    await assertVisibleText("People to follow up with");
    await assertVisibleText("Future community preview");
    await assertVisibleText("Community Safety Checklist");
    await assertVisibleText("Meet in public.");
    await assertVisibleText("Verify prices independently.");
    await assertVisibleText("Protect kids' info.");
    await assertVisibleText("Trusted Circle");
    await assertVisibleText("Trusted Circle is your private note space. It does not verify people, run background checks, or replace your own safety judgment.");
    await assertVisibleText("No Trusted Circle entries yet.");
    await assertVisibleText("Event Planner");
    await assertVisibleText("Tidepool notes can help remember trusted contacts and community context. This planner does not publish events or verify shops.");
    await assertVisibleText("No RSVP, ticketing, payment, public listing, calendar sync, notification, or shop verification is connected.");
    await assertVisibleText("Tidepool upgrade preview");
    const tidepoolInitialText = await page.locator("body").innerText();
    assert.doesNotMatch(
      tidepoolInitialText,
      /users are verified|background checks complete|background-checked by Ember|invites? sent automatically|officially verified|RSVPs are live|ticketing is live|payments are live|public event listing is live|shops are verified|calendar sync is live|notifications are sent/i,
      "Tidepool should not show fake verification, invite, background-check, event listing, RSVP, ticketing, payment, calendar sync, or notification claims"
    );
    const addToCircleButton = page.getByRole("button", { name: "Add to Circle", exact: true }).first();
    await expectVisible(addToCircleButton, "Tidepool Add to Circle action");
    await addToCircleButton.click();
    const circleModal = page.locator('.flow-modal[data-flow="tidepoolTrustedCircle"]').first();
    await expectVisible(circleModal, "Tidepool Trusted Circle modal");
    await expectVisible(circleModal.getByText("Invite Later is a placeholder only. No messages or invites are sent.").first(), "Trusted Circle invite safety copy");
    await circleModal.getByLabel("Name").fill("Focused Friendly Shop");
    await circleModal.getByLabel("Relationship / type").selectOption("Trusted Shop");
    await circleModal.getByLabel("Circle Status").selectOption("Shop/Seller Contact");
    await circleModal.getByLabel("Contact method").fill("Ask at the front counter");
    await circleModal.getByLabel("Circle Note").fill("Private phone 757-555-0199");
    await circleModal.getByLabel("Trust notes").fill("Family-friendly shop that hosts trading tables.");
    await circleModal.getByLabel("Reminder notes").fill("Follow up before the next family trade night.");
    await circleModal.getByLabel("Safety / comfort notes").fill("Parent should review event details before visiting.");
    await circleModal.getByLabel("Date added").fill("2026-06-09");
    await circleModal.getByRole("button", { name: "Add to Circle", exact: true }).click();
    await expectVisible(circleModal.getByText("Trusted Circle entry saved locally. This does not verify people or send invitations.").first(), "Trusted Circle saved message");
    const circleState = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-tidepool") || "{}");
      return (data.trustedCircle || []).find((entry) => entry.name === "Focused Friendly Shop") || null;
    });
    assert.equal(circleState?.roleType, "Trusted Shop");
    assert.equal(circleState?.relationshipType, "Trusted Shop");
    assert.equal(circleState?.circleStatus, "Shop/Seller Contact");
    assert.equal(circleState?.contactMethod, "Ask at the front counter");
    assert.equal(circleState?.reminderNotes, "Follow up before the next family trade night.");
    assert.equal(circleState?.verificationClaim, "not_verified");
    assert.equal(circleState?.invitationStatus, "not_sent");
    await circleModal.getByRole("button", { name: "Close", exact: true }).click();
    await circleModal.waitFor({ state: "hidden", timeout: 5000 });
    await assertVisibleText("Focused Friendly Shop");
    await assertVisibleText("Shop/Seller Contact");
    await assertVisibleText("Follow up before the next family trade night.");
    await assertVisibleText("Private contact method/Circle Note saved locally.");
    await assertVisibleText("No invites sent");
    await assertNotVisibleText("757-555-0199");
    const tidepoolSavedText = await page.locator("body").innerText();
    assert.doesNotMatch(
      tidepoolSavedText,
      /users are verified|background checks complete|background-checked by Ember|invites? sent automatically|officially verified|RSVPs are live|ticketing is live|payments are live|public event listing is live|shops are verified|calendar sync is live|notifications are sent/i,
      "Saved Tidepool state should not show fake verification, invite, background-check, event listing, RSVP, ticketing, payment, calendar sync, or notification claims"
    );
    await assertNoHorizontalOverflow("Tidepool Trusted Circle mobile");
    await page.setViewportSize({ width: 1366, height: 1600 });
  }

  const focusedAreaTests = {
    hearth: focusedHearthTest,
    scout: focusedScoutTest,
    vault: focusedVaultTest,
    market: focusedMarketTest,
    forge: focusedForgeTest,
    admin: focusedAdminTest,
    spark: focusedSparkTest,
    tidepool: focusedTidepoolTest,
  };

  if (BETA_SMOKE_MODE.startsWith("area:")) {
    await step("app opens and local beta shell loads", async () => {
      await resetBetaData();
      await assertVisibleText("E&T TCG");
      await assertVisibleText("Beta");
      await assertVisibleText("Hearth");
    });

    await step(`${REQUESTED_AREA}: focused critical path`, focusedAreaTests[REQUESTED_AREA]);

    await browser.close();
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  if (BETA_SMOKE_MODE === "smoke") {
    await step("app opens and local beta shell loads", async () => {
      await resetBetaData();
      await assertVisibleText("E&T TCG");
      await assertVisibleText("Beta");
      await assertVisibleText("Collector");
      await assertVisibleText("Hearth");
    });

    await step("Quick Add opens from command shell", async () => {
      await nav("Hearth");
      const commandCenterButtons = [
        page.locator('button[aria-label="Open Quick Add command center"]'),
        page.locator(".hearth-command-hero").getByRole("button", { name: "Quick Add", exact: true }),
      ];
      let opened = false;
      for (const buttonLocator of commandCenterButtons) {
        opened = await clickFirstVisible(buttonLocator, "").catch(() => false);
        if (opened) break;
      }
      assert.equal(opened, true, "Quick Add command entry should be visible");
      const quickAddModal = page.locator('.flow-modal[data-flow="addActionSheet"]').first();
      await quickAddModal.waitFor({ state: "visible", timeout: 5000 });
      await assertVisibleText("Scan Product/Card");
      await quickAddModal.locator('.modal-close-button[aria-label="Close Quick Add"]').click();
      await quickAddModal.waitFor({ state: "hidden", timeout: 5000 });
    });

    await step("Scout opens", async () => {
      await nav("Scout");
      await assertVisibleText("Scout");
    });

    await step("Vault opens", async () => {
      await nav("Vault");
      await assertVisibleText("Vault");
    });

    await step("Market opens", async () => {
      await nav("TideTradr");
      await assertVisibleText(/Market|TideTradr/i);
    });

    await browser.close();
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  await step("app opens and beta data resets", async () => {
    await resetBetaData();
    await assertVisibleText("E&T TCG");
    await assertVisibleText("Hearth");
    await assertVisibleText("Forge");
    await assertVisibleText("Scout");
    await assertVisibleText("Vault");
    await assertVisibleText("Market");
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
    const lockedVaultCard = page.locator(".compact-card").filter({ hasText: "Smoke Locked Vault Source" }).first();
    await clickCardAction(lockedVaultCard, "Move to Forge");
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
    const searchInput = form.getByPlaceholder(/Search product, set, UPC, or SKU/i);
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
    await form.getByRole("button", { name: "Manual Add" }).first().click();
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
    await inlinePurchaserForm.getByRole("button", { name: "Save Person" }).click();
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
    await secondForm.getByRole("button", { name: "Manual Add" }).first().click();
    await fillByLabel(secondForm, "Item Name", "Smoke Purchaser Draft");
    await fillByLabel(secondForm, "Type / Category", "Elite Trainer Box");
    await clickAddWizardNext();
    await ensureAddWizardDestination(secondForm, "Forge");
    await clickAddWizardNext();
    await secondForm.getByLabel("Who paid?").selectOption("__manage__");
    const manager = page.locator(".purchaser-manager-modal").first();
    await manager.waitFor({ state: "visible", timeout: 5000 });
    await overflowAction(manager.locator(".compact-card").filter({ hasText: "Smoke Buyer" }).first(), "Edit");
    await manager.getByPlaceholder("Person name").fill("Smoke Buyer Renamed");
    await manager.getByRole("button", { name: "Save" }).click();
    await assertVisibleText("Updated person: Smoke Buyer Renamed.");
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

  await step("Public identity: Tidepool renders usernames", async () => {
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
    const existingForm = page.locator("form.scout-report-flow").first();
    if (await existingForm.count()) {
      const existingText = await existingForm.innerText().catch(() => "");
      if (!/Where and when|Post the restock essentials|Post store, status, and time|What did you see\?|Select item or product/i.test(existingText)) {
        const firstStepButton = existingForm.getByRole("button", { name: /Report|What/ }).first();
        if (await firstStepButton.count()) {
          await firstStepButton.click();
          await page.waitForTimeout(250);
        }
      }
    }
    if (await page.locator("form.scout-report-flow").count() === 0) {
      let submitReportButton = page.getByRole("button", { name: /^Submit Report$/ }).first();
      if (!(await submitReportButton.isVisible().catch(() => false))) {
        const followingTab = page.getByRole("button", { name: /^Following$/ }).first();
        if (await followingTab.isVisible().catch(() => false)) {
          await followingTab.click();
          await page.waitForTimeout(250);
        }
        submitReportButton = page.getByRole("button", { name: /^Submit Report$/ }).first();
      }
      if (await submitReportButton.isVisible().catch(() => false)) {
        await submitReportButton.click();
      } else {
        await page.getByRole("button", { name: /^Add Report$/ }).first().click();
      }
    }
    const form = page.locator("form.scout-report-flow").first();
    await form.waitFor({ state: "visible", timeout: 10000 });
    return form;
  }

  async function openScoutReportsPage() {
    await nav("Scout");
    const followingTab = page.getByRole("button", { name: /^Following$/ }).first();
    if (await followingTab.isVisible().catch(() => false)) {
      await followingTab.click();
      await page.waitForTimeout(250);
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
      reportType = "Stock seen",
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

    const essentialsStep = form.getByText(/Where and when|Post the restock essentials|Post store, status, and time|What did you see\?|Select item or product/i).first();
    if (!(await essentialsStep.isVisible().catch(() => false))) {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      throw new Error(`Scout wizard did not open at the essentials step.\n${bodyText.slice(0, 1600)}`);
    }

    const storeSearch = form.getByPlaceholder("Search store, city, ZIP, or nickname").first();
    if (await storeSearch.count()) {
      await storeSearch.scrollIntoViewIfNeeded().catch(() => {});
      await storeSearch.fill(storeSearchText);
      const filled = await page.waitForFunction(
        ({ selector, expected }) => {
          const inputs = [...document.querySelectorAll(selector)];
          return inputs.some((input) => input.value === expected);
        },
        { selector: 'form.scout-report-flow input[placeholder="Search store, city, ZIP, or nickname"]', expected: storeSearchText },
        { timeout: 1200 }
      ).then(() => true).catch(() => false);
      if (!filled) {
        await storeSearch.click({ force: true }).catch(() => {});
        await storeSearch.fill("").catch(() => {});
        await storeSearch.pressSequentially(storeSearchText, { delay: 8 }).catch(async () => {
          await storeSearch.fill(storeSearchText);
        });
      }
      await page.waitForTimeout(200);
    }
    const smokeStoreCard = form.locator(".scout-report-store-pick, .scout-report-store-card").filter({ hasText: storeSearchText }).first();
    await smokeStoreCard.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    if (await smokeStoreCard.isVisible().catch(() => false)) {
      if ((await smokeStoreCard.evaluate((node) => node.tagName.toLowerCase())) === "button") {
        await smokeStoreCard.click();
      } else {
        await smokeStoreCard.getByRole("button", { name: /Select store|Choose this store|Report here/i }).click();
      }
      const selectedStoreCard = form.locator(".scout-report-store-card.selected").filter({ hasText: storeSearchText }).first();
      await selectedStoreCard.waitFor({ state: "visible", timeout: 5000 });
      assert.match(await selectedStoreCard.innerText(), /Store selected|Manual location selected/i);
    } else {
      const inputValue = await storeSearch.count() ? await storeSearch.inputValue().catch(() => "") : "";
      const formText = await form.innerText().catch(() => "");
      throw new Error(`Scout wizard did not show the requested store "${storeSearchText}" after store search value "${inputValue}".\n${formText.slice(0, 1200)}`);
    }
    if (reportDate || reportTime) {
      const visitDateTimeInput = form.getByLabel(/Observed time|Visit date & time/i).first();
      const currentValue = await visitDateTimeInput.inputValue();
      const [currentDate = new Date().toISOString().slice(0, 10), currentTime = "12:00"] = currentValue.split("T");
      const nextVisitDateTime = `${reportDate || currentDate}T${reportTime || currentTime || "12:00"}`;
      await visitDateTimeInput.fill(nextVisitDateTime);
      assert.equal(await visitDateTimeInput.inputValue(), nextVisitDateTime);
    }
    await form.getByRole("button", { name: "Next" }).click();
    await form.getByText(/Shelf status/i).first().waitFor({ state: "visible", timeout: 5000 });
    const requestedStatus = stockLeft && /low stock/i.test(stockLeft) ? "Low stock" : reportType;
    const reportTypeButton = form.getByRole("button", { name: new RegExp(requestedStatus, "i") }).first();
    await reportTypeButton.click();
    await page.waitForFunction(
      (button) => button?.classList?.contains("selected"),
      await reportTypeButton.elementHandle(),
      { timeout: 3000 }
    );
    await form.getByRole("button", { name: "Next" }).click();
    await form.getByText(/Items and proof|Optional proof\/details|Add details and proof|Add guess context/i).first().waitFor({ state: "visible", timeout: 5000 });
    const detailsText = await form.innerText().catch(() => "");
    if (!/Add guess context|Save Guess|Community guess/i.test(detailsText)) {
      const categoryButton = form.getByRole("button", { name: /Pokemon TCG|Sealed product|Packs|ETBs/i }).first();
      if (await categoryButton.isVisible().catch(() => false)) {
        await categoryButton.click();
      }
    }
    if (productName) {
      const productInput = form.getByPlaceholder(/Surging Sparks ETB|booster bundles|binders/i).first();
      if (await productInput.count()) {
        await productInput.fill(productName);
      }
    }
    if (note) {
      await form.getByPlaceholder(/Optional quick note|Aisle, limit sign|vendor cart|display location/i).fill(note);
    }

    if (file) {
      await form.locator('input[type="file"]').setInputFiles(file);
    }
    if (proofText) {
      await form.getByPlaceholder(/Optional receipt detail|sign text|link|Receipt detail|screenshot note|site link/i).fill(proofText);
    }
    await form.getByRole("button", { name: "Next" }).click();
    await form.getByText(/Review and post|Review and save/).first().waitFor({ state: "visible", timeout: 5000 }).catch(async (error) => {
      const formText = await form.innerText().catch(() => "");
      const bodyText = await page.locator("body").innerText().catch(() => "");
      if (bodyText.includes("Scout report saved. Want to add proof or more details?")) return;
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

    await form.getByText(/Where and when|Post the restock essentials|Post store, status, and time/i).first().waitFor({ state: "visible", timeout: 5000 }).catch(async (error) => {
      const formText = await form.innerText().catch(() => "");
      const bodyText = await page.locator("body").innerText().catch(() => "");
      error.message = `${error.message}\nScout wizard state:\n${formText.slice(0, 1200)}\nBody:\n${bodyText.slice(0, 1600)}`;
      throw error;
    });
    await assertVisibleText("Current choice");

    await form.getByPlaceholder("Search store, city, ZIP, or nickname").fill(visibleStore.nickname);
    const storeCard = form.locator(".scout-report-store-pick, .scout-report-store-card").filter({ hasText: visibleStore.nickname }).first();
    await storeCard.waitFor({ state: "visible", timeout: 5000 });
    if ((await storeCard.evaluate((node) => node.tagName.toLowerCase())) === "button") {
      await storeCard.click();
    } else {
      await storeCard.getByRole("button", { name: /Select store|Choose this store|Report here/i }).click();
    }
    const selectedStoreCard = form.locator(".scout-report-store-card.selected").filter({ hasText: visibleStore.nickname }).first();
    await selectedStoreCard.waitFor({ state: "visible", timeout: 5000 });
    assert.match(await selectedStoreCard.innerText(), /Store selected|Manual location/);
    await form.getByRole("button", { name: "Next" }).click();
    await form.getByText(/Shelf status/i).first().waitFor({ state: "visible", timeout: 5000 });
    const statusButton = form.getByRole("button", { name: /No stock/i }).first();
    await statusButton.click();
    await page.waitForFunction(
      (button) => button?.classList?.contains("selected") && button?.getAttribute("aria-pressed") === "true",
      await statusButton.elementHandle(),
      { timeout: 3000 }
    );
    await assertVisibleText("Selected");
    await form.getByRole("button", { name: "Next" }).click();
    await form.getByText(/Items and proof|Optional proof\/details/i).first().waitFor({ state: "visible", timeout: 5000 });
    await form.getByRole("button", { name: "Next" }).click();
    await assertVisibleText("Add a category, item name, or useful detail before saving this report.");
    await form.getByRole("button", { name: /Pokemon TCG/i }).first().click();
    await form.getByRole("button", { name: "Next" }).click();
    await assertVisibleText("Reporting at: Visible Selection Target");
    await assertVisibleText("Product details");
    await assertVisibleText("Pokemon TCG");
    await assertVisibleText("No stock");
    await closeOpenModals();
  });

  async function submitScoutWizardIfNeeded(form) {
    const explicitAction = form.getByRole("button", { name: /Submit Report|Post Report|Save Report|Save Guess/i }).last();
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
    await assertVisibleText("My Watch Stores");
    await assertVisibleText("Choose from nearby stores");
    if (await page.getByRole("button", { name: /Target/i }).count()) {
      await page.getByRole("button", { name: /Target/i }).first().click();
    }
    const targetStoreName = "Greenbrier Target";
    const storeSearch = page.getByPlaceholder(/Search .*city, ZIP, nickname, or address|Search store, city, ZIP/i).first();
    if (await storeSearch.count()) {
      await storeSearch.fill(targetStoreName);
    }
    await assert.match(await page.locator("body").innerText(), /Greenbrier Target/);
    const smokeStoreCard = page.locator(".scout-store-card").filter({ hasText: targetStoreName }).first();
    await smokeStoreCard.getByRole("button", { name: /Open Store|Open|View/i }).click();
    await assertVisibleText(/Add Report|Submit Report/);
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
      data.reports = (data.reports || []).filter((report) => !String(report.note || report.notes || report.reportText || "").includes("Exact report for Smoke Exact"));
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
        .filter((report) => String(report.note || report.notes || report.reportText || "").includes("Exact report for Smoke Exact"))
        .map((report) => ({
          note: report.note || report.notes || report.reportText,
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

    await openScoutReportsPage();
    for (const store of exactStores) {
      await assertVisibleText(store.nickname);
    }

    const filterSelect = page.locator(".scout-compact-filterbar select").first();
    if (await filterSelect.isVisible().catch(() => false)) {
      await filterSelect.selectOption("Verified");
      await assertVisibleText("Filters are hiding reports");
      await page.getByRole("button", { name: "Reset filters" }).first().click();
      await assertVisibleText("Smoke Exact Target");
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await openScoutReportsPage();
    for (const store of exactStores) {
      await assertVisibleText(store.nickname);
    }

    const blankForm = await openScoutReportWizard();
    await blankForm.getByRole("button", { name: "Next" }).click();
    await assertVisibleText("Choose the store or enter a manual store/location before saving.");
    await closeOpenModals();
  });

  await step("Scout: add/edit restock report without user delete", async () => {
    async function openReportWizard() {
      return openScoutReportWizard();
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
    await assertVisibleText("Scout report saved.");
    const savedScoutReport = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-scout") || "{}");
      return (data.reports || []).find((report) => String(report.note || report.notes || "").includes("Two ETBs on the shelf.")) || null;
    });
    assert.ok(savedScoutReport, "Scout report should be saved to local beta storage");
    assert.equal(savedScoutReport.reportDate, "2026-05-16");
    assert.equal(savedScoutReport.reportTime, "09:30");
    await closeReportSuccess();
    await page.getByRole("button", { name: "My Reports" }).first().click();
    await page.waitForTimeout(250);

    const reportCard = await visibleScoutReportCard(savedScoutReport.storeName || "Smoke Shared Target");
    const reportDetailSheet = await assertScoutReportDeleteHidden(reportCard);
    await reportDetailSheet.getByRole("button", { name: /^Add Details$/i }).click();
    await reportDetailSheet.locator('[data-scout-detail-section="details"]').waitFor({ state: "visible", timeout: 5000 });
    await assertVisibleText(savedScoutReport.storeName || "Smoke Shared Target");
    const matchingReportCount = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-scout") || "{}");
      return (data.reports || []).filter((report) => String(report.note || report.notes || "").includes("Two ETBs on the shelf.")).length;
    });
    assert.equal(matchingReportCount, 1, "Add details should open the saved report without creating a duplicate");
    await closeScoutReportDetails(reportDetailSheet);

    const quickReportForm = await openReportWizard();
    await fillScoutReportWizard(quickReportForm, {
      note: "Smoke quick report with limit 2 posted.",
      stockLeft: "Low stock",
    });
    await submitScoutWizardIfNeeded(quickReportForm);
    await closeReportSuccess();
    await page.getByRole("button", { name: "My Reports" }).first().click();
    await page.waitForTimeout(250);
    const viewAllReports = page.getByRole("button", { name: "View all reports" }).first();
    if (await viewAllReports.isVisible().catch(() => false)) {
      await viewAllReports.click();
    }
    const { detailSheet: quickReportDetailSheet } = await openVisibleScoutReportDetailsContaining(
      "Low stock",
      "Smoke quick report with limit 2 posted."
    );
    await assertScoutReportDetailDeleteHidden(quickReportDetailSheet);
    await closeScoutReportDetails(quickReportDetailSheet);
  });

  await step("Scout: add/edit/delete tracked item", async () => {
    const targetStoreName = "Greenbrier Target";
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
    if (!(await page.locator(".scout-store-card").filter({ hasText: targetStoreName }).count())) {
      await clickFirstVisible(page.getByRole("button", { name: /Target/i }), "Target retailer button");
    }
    const storeSearch = page.getByPlaceholder(/Search .*city, ZIP, nickname, or address|Search store, city, ZIP/i).first();
    if (await storeSearch.count()) {
      await storeSearch.fill(targetStoreName);
    }
    const smokeStoreCard = page.locator(".scout-store-card").filter({ hasText: targetStoreName }).first();
    try {
      await smokeStoreCard.waitFor({ state: "visible", timeout: 10000 });
    } catch (error) {
      const pageText = (await page.locator("body").innerText()).slice(0, 2000);
      throw new Error(`${targetStoreName} store card was not visible. Current Scout view: ${pageText}`);
    }
    const openButton = smokeStoreCard.getByRole("button", { name: /Open Store|Open|View/i });
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
    const reportForm = await openScoutReportWizard();
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
    await page.getByRole("button", { name: "My Reports" }).first().click();
    await page.waitForTimeout(250);
    const viewAllReports = page.getByRole("button", { name: "View all reports" }).first();
    if (await viewAllReports.isVisible().catch(() => false)) {
      await viewAllReports.click();
    }
    const { detailSheet: screenshotReportDetailSheet } = await openVisibleScoutReportDetailsContaining(
      "",
      "Manual screenshot review save."
    );
    await closeScoutReportDetails(screenshotReportDetailSheet);
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
    await form.getByPlaceholder(/Search product, set, UPC, or SKU/i).fill("Prismatic Evolutions Elite Trainer Box");
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
    await smokeForgeCard.getByRole("button", { name: /View|View \/ Edit/ }).click();
    const advancedForgeDetails = page.getByText("Advanced business details").first();
    if (await advancedForgeDetails.isVisible().catch(() => false)) {
      await advancedForgeDetails.click();
    }
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
    await page.waitForFunction(
      () => !document.body.innerText.includes("Smoke Forge ETB Edited"),
      null,
      { timeout: 7000 }
    );
    await assertVisibleText("Start tracking sales and trades.");
    await assertVisibleText("Your workshop is ready. Add inventory, a receipt, mileage, or a sale when you are ready.");
  });

  await step("Receipt: draft/verify/submit expense-only report", async () => {
    await nav("Vault");
    await page.locator(".vault-command-center").getByRole("button", { name: "Quick Add", exact: true }).click();
    const receiptModal = page.locator(".receipt-scan-modal").first();
    const quickAddModal = page.locator(".flow-modal").first();
    const directReceiptAction = quickAddModal.getByRole("button", { name: /Upload Receipt|Add Receipt|Open receipt review|Continue to Receipt Review/i }).first();
    if (await directReceiptAction.isVisible().catch(() => false)) {
      await directReceiptAction.click();
    } else {
      await quickAddModal.getByRole("button", { name: /Scan Product\/Card|Search \/ Scan Item/i }).first().click();
      const scanModal = page.locator(".scan-product-modal").first();
      await scanModal.getByRole("tab", { name: "Receipt" }).click();
      await scanModal.locator(".scan-product-mode-panel--receipt").getByRole("button", { name: "Continue" }).click();
    }
    await receiptModal.waitFor({ state: "visible", timeout: 7000 });
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
    const deleteExpenseDialog = page.getByRole("dialog", { name: /Delete (?:this )?expense/i });
    await deleteExpenseDialog.waitFor({ state: "visible", timeout: 5000 });
    await deleteExpenseDialog.getByRole("button", { name: "Delete expense" }).click();
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
    await clickCardAction(partialCard, "Move to Forge");
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
    await clickCardAction(fullCard, "Move to Forge");
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
    await groupedVaultCard.first().getByRole("button", { name: /Item Profile|View/ }).first().click();
    await assertVisibleText("Grouped inventory details");
    await assertVisibleText("Zena");
    await assertVisibleText("Dillon");
    await page.getByRole("button", { name: "Close" }).click();

    await clickCardAction(groupedVaultCard.first(), "Move to Forge");
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
    assert.match(await groupedForgeCard.first().innerText(), /(?:Available|Total)\s+9/i);
    await groupedForgeCard.first().locator("button").filter({ hasText: "View / Edit" }).first().click();
    await page.locator(".forge-detail-card").waitFor({ state: "visible", timeout: 5000 });
    const groupedForgeDetailText = await page.locator(".forge-detail-card").first().innerText();
    assert.match(groupedForgeDetailText, /Smoke Grouped Purchaser ETB/i);
    const groupedForgePreservedBreakdown = await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      const rows = (data.items || []).filter((item) => item.name === "Smoke Grouped Purchaser ETB" && (item.destinationScope || []).includes("forge"));
      return {
        purchasers: rows.map((row) => row.purchaserName || row.buyer).filter(Boolean),
        locations: rows.map((row) => row.physicalLocation).filter(Boolean),
      };
    });
    assert.ok(groupedForgePreservedBreakdown.purchasers.includes("Zena"));
    assert.ok(groupedForgePreservedBreakdown.purchasers.includes("Dillon"));
    assert.ok(groupedForgePreservedBreakdown.locations.includes("At Home"));
    assert.ok(groupedForgePreservedBreakdown.locations.includes("At Store"));
    await page.locator(".forge-detail-card").first().getByRole("button", { name: "Close" }).click();
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
    await page.getByLabel("Vault sections").getByRole("button", { name: "Wishlist", exact: true }).click();
    await assertVisibleText("Smoke Wishlist Box");
    await nav("Forge");
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Wishlist Box" }).count(), 0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await nav("Vault");
    await page.getByLabel("Vault sections").getByRole("button", { name: "Collection", exact: true }).click();
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Wishlist Box" }).count(), 0);
    await page.getByLabel("Vault sections").getByRole("button", { name: "Wishlist", exact: true }).click();
    await assertVisibleText("Smoke Wishlist Box");
    await nav("Forge");
    assert.equal(await page.locator(".compact-card").filter({ hasText: "Smoke Wishlist Box" }).count(), 0);
    await page.evaluate(() => {
      const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
      data.items = (data.items || []).filter((item) => item.name !== "Smoke Wishlist Box" && item.itemName !== "Smoke Wishlist Box");
      localStorage.setItem("et-tcg-beta-data", JSON.stringify(data));
    });
  });

  await step("Market Watch: run deal check", async () => {
    await nav("Market");
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
    await nav("Market");
    const searchForm = page.locator(".catalog-search-form").first();
    await searchForm.locator("input").first().fill("Prismatic Evolutions Booster Bundle");
    await searchForm.getByRole("button", { name: /Search Catalog|Search Market Watch|Search/i }).first().click();
    const resultCard = page.locator(".catalog-result-card").filter({ hasText: "Prismatic Evolutions Booster Bundle", hasNotText: "Code Card" }).first();
    await resultCard.waitFor({ state: "visible", timeout: 20000 });
    const marketResultAddButton = resultCard.getByRole("button", { name: /Add to (Vault|Forge)/i }).first();
    await marketResultAddButton.scrollIntoViewIfNeeded();
    await marketResultAddButton.click();
    const marketAddModal = addWizardModal();
    await marketAddModal.waitFor({ state: "visible", timeout: 10000 }).catch(async () => {
      const productDetailAdd = page.locator(".location-modal, .catalog-detail-modal, .market-product-detail-modal").filter({ hasText: "Prismatic Evolutions Booster Bundle" }).getByRole("button", { name: /Add to (Vault|Forge)/i }).first();
      if (await productDetailAdd.isVisible().catch(() => false)) {
        await productDetailAdd.click();
      }
      await marketAddModal.waitFor({ state: "visible", timeout: 10000 });
    });
    await marketAddModal.locator('[aria-label="Market add destination choices"]').getByRole("button", { name: /^Add to both$/i }).click();
    await clickAddWizardNext();
    await clickAddWizardNext();
    await page.locator(".flow-modal").getByRole("button", { name: /Save and Close/ }).click();
    await assertVisibleText("saved to Vault");
    await page.locator(".flow-modal").getByRole("button", { name: /^Finish$/ }).click();
    await marketAddModal.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});

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
    await nav("Hearth");
    await assertVisibleText("Hearth");
    await assertVisibleText("Your Next Move");
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
        await nav("Hearth");
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
