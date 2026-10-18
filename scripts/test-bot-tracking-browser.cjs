const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5243").origin;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname), "Use disposable loopback state only");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/bot-tracking");
const fixtureFile = path.join(output, "fixture.html");
const storageKey = "code3.bot-ops.v1";
const providerKeys = ["HAYHA", "STELLAR", "SHIKARI", "VALOR", "REFRACT", "POLAR", "SNIPED", "SWOOPER"];
const cases = [320, 390, 1440].flatMap(width => ["light", "dark"].map(theme => ({ width, height: width === 320 ? 720 : 900, theme })));
const preservedRecords = JSON.stringify({
  userType: "collector", dashboardPreset: "simple",
  profile: { userId: "local-beta", email: "bot-tracking@example.test", displayName: "Synthetic owner", appRole: "owner", app_role: "owner", userRole: "owner", appAccess: "approved" },
  subscriptionProfile: { tier: "admin", featureTier: "admin", subscriptionPlan: "admin", appRole: "owner", app_role: "owner", isAdmin: true, lifetimeAccess: true, subscriptionStatus: "active" },
  items: [{ id: "qa-existing-card", name: "Existing synthetic card", quantity: 2, marketValue: 47, photoUrl: "/code3-logo.svg" }],
  sales: [{ id: "qa-existing-sale", title: "Existing synthetic sale", grossSalePrice: 30 }],
  expenses: [{ id: "qa-existing-expense", description: "Existing synthetic expense", amount: 4 }],
});
const accountRecords = JSON.stringify({ synthetic: true, accounts: [{ id: "qa-existing-account", label: "Existing account metadata" }] });
let step = "initialization";

function writeFixture() {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(fixtureFile, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic bot tracking</title></head><body><div id="root"></div><script type="module">
import React from "react";
import {createRoot} from "react-dom/client";
import "/src/index.css";
import "/src/App.css";
import WorkspaceHomePage from "/src/features/workspaces/WorkspaceHomePage.jsx";
const theme = new URLSearchParams(location.search).get("theme") || "light";
document.documentElement.dataset.theme = theme;
const root = createRoot(document.getElementById("root"));
window.qaRender = (status = "authorized", extra = {}, section = "tasks") => {
  root.render(React.createElement("div", {className:"app app-command-shell", "data-theme":theme, style:{padding:"16px", minHeight:"100dvh"}},
    React.createElement(WorkspaceHomePage, {workspace:"BOT", botOpsSection:section, ownerSession:{status, authenticated:status==="authorized", ownerAuthorized:status==="authorized", provider:"synthetic-test", userId:"qa-owner", identityKey:"qa-owner-initial", ...extra}})));
};
window.qaRender();
</script></body></html>`, "utf8");
}

async function makeFixture() {
  const fixtures = await import(pathToFileURL(path.resolve("src/features/botOps/fixtures/phase2dQaFixtures.js")).href);
  const { normalizeBotOpsState } = await import(pathToFileURL(path.resolve("src/features/botOps/repository.js")).href);
  const state = structuredClone(fixtures.getPhase2dQaFixture("checkout-evidence-review").state);
  const originalInstallation = structuredClone(state.installations[0]);
  const originalTarget = structuredClone(state.productTargets[0]);
  const originalGroup = structuredClone(state.taskGroups[0]);
  const originalTask = structuredClone(state.tasks[0]);
  for (const provider of providerKeys) state.installations.push({ ...originalInstallation, id: `qa-installation-${provider.toLowerCase()}`, provider, friendlyName: `${provider} home computer`, runtimeLabel: `${provider} desk`, connectionMode: "MANUAL_RECORD", enabled: false, healthState: "DISCONNECTED", lastSeenAt: null, warnings: [], capabilitySnapshot: Object.fromEntries(Object.keys(originalInstallation.capabilitySnapshot).map(key => [key, false])) });
  state.installations.push({ ...state.installations.find(row => row.provider === "POLAR"), id: "qa-installation-polar-second", friendlyName: "POLAR travel laptop", runtimeLabel: "Travel laptop" });
  state.installations.push({ ...state.installations.find(row => row.provider === "POLAR"), id: "qa-installation-archived", friendlyName: "Archived bot", status: "ARCHIVED", archivedAt: "2026-10-17T12:00:00.000Z" });
  for (const [suffix, installationId, retailerId, title, runtimeStatus, warnings, archived] of [
    ["polar", "qa-installation-polar", "target", "Shared collector box", "DRAFT", [], false],
    ["polar-second", "qa-installation-polar-second", "walmart", "Shared collector box", "READY", ["OWNER_REVIEW_NEEDED"], false],
    ["sniped", "qa-installation-sniped", "target", "Long synthetic collector product title for mobile wrapping with repeated details and several distinct words", "PAUSED", [], false],
    ["archived", "qa-installation-polar", "target", "Archived collector box", "STOPPED", [], true],
  ]) {
    const installation = state.installations.find(row => row.id === installationId);
    const stamp = archived ? { status: "ARCHIVED", archivedAt: "2026-10-17T12:00:00.000Z" } : { status: "ACTIVE", archivedAt: null };
    const productTargetId = `qa-target-${suffix}`; const taskGroupId = `qa-group-${suffix}`;
    state.productTargets.push({ ...originalTarget, id: productTargetId, retailerId, canonicalProductId: null, sku: `QA-SKU-${suffix.toUpperCase()}`, tcin: null, upc: null, title, provenance: "OWNER_ENTERED", ...stamp });
    state.taskGroups.push({ ...originalGroup, id: taskGroupId, name: `${installation.friendlyName} ${retailerId} plans`, installationId, provider: installation.provider, retailerId, retailerAccountLinkId: null, botProfileId: null, proxyGroupId: null, enabled: false, warnings: [], ...stamp });
    state.tasks.push({ ...originalTask, id: `qa-task-${suffix}`, taskGroupId, productTargetId, installationId, provider: installation.provider, retailerId, runtimeStatus, taskMode: "MANUAL_DRAFT", retailerAccountLinkId: null, botProfileId: null, proxyGroupId: null, lastAttemptAt: null, lastResult: "", providerReferenceId: null, provenance: "OWNER_ENTERED", warnings, ...stamp });
  }
  return normalizeBotOpsState(state);
}

async function makeContext(browser, testCase, initialBotState) {
  const context = await browser.newContext({ viewport: { width: testCase.width, height: testCase.height }, colorScheme: testCase.theme, timezoneId: "America/New_York", reducedMotion: "reduce", serviceWorkers: "block" });
  const external = []; const writes = []; const errors = [];
  await context.route("**/*", route => {
    const request = route.request(); const url = new URL(request.url());
    if (request.method() !== "GET") { writes.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
    if (url.origin !== base) { external.push(`${request.method()} ${url.origin}${url.pathname}`); return route.abort(); }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
    return route.continue();
  });
  await context.addInitScript(({ theme, initialBotState, storageKey, preservedRecords, accountRecords }) => {
    if (!localStorage.getItem("__qa_bot_tracking")) {
      localStorage.setItem("__qa_bot_tracking", "true");
      localStorage.setItem("et-tcg-app-theme", theme);
      localStorage.setItem("et-tcg-beta-data", preservedRecords);
      localStorage.setItem("qa-preserved-account-records", accountRecords);
      localStorage.setItem(storageKey, JSON.stringify(initialBotState));
    }
    window.__qaBotReads = 0; window.__qaStorageWrites = []; window.__qaBlockedBotWrites = 0;
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) { if (key === storageKey) window.__qaBotReads += 1; return originalGetItem.call(this, key); };
    Storage.prototype.setItem = function(key, value) {
      if (window.__qaBlockBotWrites && key === storageKey) { window.__qaBlockedBotWrites += 1; throw new Error("Synthetic storage unavailable"); }
      if (this === localStorage) window.__qaStorageWrites.push(key);
      return originalSetItem.call(this, key, value);
    };
    window.open = () => null;
  }, { theme: testCase.theme, initialBotState, storageKey, preservedRecords, accountRecords });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  return { context, page, external, writes, errors };
}

const fixtureUrl = theme => `${base}/${path.relative(process.cwd(), fixtureFile).replaceAll(path.sep, "/")}?theme=${theme}`;
const tracker = page => page.getByTestId("bot-task-tracker");
const taskCards = page => tracker(page).locator('.ops-record-browser__row');
const botState = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
const rawBotState = page => page.evaluate(key => localStorage.getItem(key), storageKey);

async function assertProtectedRecords(page, before, appBaseline = null) {
  const current = await botState(page);
  for (const key of ["installations", "retailerAccountLinks", "botProfiles", "proxyGroups", "attempts", "checkoutEvidence"]) assert.deepEqual(current[key], before[key], `${key} unchanged`);
  for (const key of ["tasks", "taskGroups", "productTargets", "activity"]) for (const row of before[key]) assert.deepEqual(current[key].find(entry => entry.id === row.id), row, `Existing ${key} record ${row.id} preserved`);
  const appRecords = await page.evaluate(() => localStorage.getItem("et-tcg-beta-data"));
  if (appBaseline) {
    const expected = JSON.parse(appBaseline); const actual = JSON.parse(appRecords);
    for (const key of ["items", "sales", "expenses", "subscriptionProfile"]) assert.deepEqual(actual[key], expected[key]);
    assert.equal(actual.profile.appRole, expected.profile.appRole);
  } else assert.equal(appRecords, preservedRecords);
  assert.equal(await page.evaluate(() => localStorage.getItem("qa-preserved-account-records")), accountRecords);
}

async function assertLayout(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No horizontal overflow");
  const undersized = await tracker(page).locator("button:visible,input:visible:not([type=checkbox]),select:visible,summary:visible").evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { label: node.getAttribute("aria-label") || node.name || node.textContent?.trim(), width: box.width, height: box.height }; }).filter(row => row.width < 43.9 || row.height < 43.9));
  assert.deepEqual(undersized, [], "Controls meet 44px target minimum");
}

async function openAdd(page, name, installationId = "qa-installation-polar") {
  const root = tracker(page);
  await root.getByRole("button", { name: "Add manual plan", exact: true }).click();
  const form = root.getByRole("form", { name: "Add manual plan", exact: true });
  await form.getByRole("combobox", { name: "Installation", exact: true }).selectOption(installationId);
  await form.getByRole("combobox", { name: "Retailer", exact: true }).selectOption({ label: "Target" });
  await form.getByLabel("Product name", { exact: true }).fill(name);
  await form.getByRole("combobox", { name: "Identifier type", exact: true }).selectOption("sku");
  await form.getByLabel("Product identifier", { exact: true }).fill(`SKU-${name.replace(/[^a-z0-9]/gi, "-").slice(0, 80)}`);
  await form.getByLabel("Quantity", { exact: true }).fill("2");
  await form.getByLabel("Max price per item (optional)", { exact: true }).fill("54.99");
  return form;
}

async function savePlan(page, name, installationId = "qa-installation-polar") {
  const form = await openAdd(page, name, installationId);
  await form.getByRole("button", { name: "Save manual plan", exact: true }).click();
  await expect(tracker(page).getByRole("button", { name: `Edit plan ${name}`, exact: true })).toBeVisible();
  const state = await botState(page); const target = state.productTargets.find(row => row.title === name);
  const task = state.tasks.find(row => row.productTargetId === target?.id);
  assert.ok(task); assert.equal(task.runtimeStatus, "DRAFT"); assert.equal(task.taskMode, "MANUAL_DRAFT"); assert.equal(task.provenance, "OWNER_ENTERED");
  assert.equal(task.quantityTarget, 2); assert.deepEqual(task.maxPrice, { minorUnits: 5499, currency: "USD" });
  assert.equal(state.taskGroups.find(row => row.id === task.taskGroupId).enabled, false);
  return task;
}

async function editPlan(page, title, quantity, stage = "READY") {
  const state = await botState(page); const target = state.productTargets.find(row => row.title === title); const task = state.tasks.find(row => row.productTargetId === target.id);
  await openTask(page, task.id);
  await tracker(page).getByRole("button", { name: `Edit plan ${title}`, exact: true }).click();
  const form = tracker(page).getByRole("form", { name: /Edit manual plan/i });
  await form.getByLabel("Quantity", { exact: true }).fill(String(quantity));
  await form.getByLabel("Max price per item (optional)", { exact: true }).fill("63.45");
  await form.getByRole("combobox", { name: "Plan stage", exact: true }).selectOption(stage);
  return form;
}

async function assertFilters(page, fixture) {
  const root = tracker(page);
  const activeTasks = fixture.tasks.filter(row => row.status !== "ARCHIVED");
  await expect(taskCards(page)).toHaveCount(activeTasks.length);
  await expect(page.getByTestId("bot-task-qa-task-archived")).toHaveCount(0);
  await root.getByLabel("Search tasks", { exact: true }).fill("QA-SKU-POLAR-SECOND");
  await expect(taskCards(page)).toHaveCount(1); await expect(page.getByTestId("bot-task-qa-task-polar-second")).toBeVisible();
  await root.getByRole("button", { name: "Clear filters", exact: true }).click();
  await root.getByLabel("Search tasks", { exact: true }).fill("travel laptop");
  await expect(taskCards(page)).toHaveCount(1);
  await root.getByRole("button", { name: "Clear filters", exact: true }).click();
  const filterDisclosure = root.locator("summary").filter({ hasText: "Filter records" });
  if (await filterDisclosure.count() && !await root.getByRole("combobox", { name: "Provider filter", exact: true }).isVisible()) await filterDisclosure.click();
  await root.getByRole("combobox", { name: "Provider filter", exact: true }).selectOption("POLAR");
  await expect(taskCards(page)).toHaveCount(2);
  await root.getByRole("combobox", { name: "Installation filter", exact: true }).selectOption("qa-installation-polar");
  await expect(taskCards(page)).toHaveCount(1);
  await root.getByRole("button", { name: "Clear filters", exact: true }).click();
  await root.getByRole("combobox", { name: "Retailer filter", exact: true }).selectOption("walmart");
  await expect(taskCards(page)).toHaveCount(1);
  await root.getByRole("combobox", { name: "Plan stage filter", exact: true }).selectOption("DRAFT");
  await expect(taskCards(page)).toHaveCount(0);
  await root.getByRole("button", { name: "Clear filters", exact: true }).click();
  await root.getByLabel("Needs attention only", { exact: true }).check();
  await expect(page.getByTestId("bot-task-qa-task-polar-second")).toBeVisible();
  await expect(page.getByTestId("bot-task-qa-task-polar")).toHaveCount(0);
  await root.getByRole("button", { name: "Clear filters", exact: true }).click();
  await root.getByLabel("Include archived", { exact: true }).check();
  await expect(taskCards(page)).toHaveCount(fixture.tasks.length);
  await expect(page.getByTestId("bot-task-qa-task-archived")).toBeVisible();
  await root.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(taskCards(page)).toHaveCount(activeTasks.length);
}

async function chooseSection(page, name) {
  const root = page.getByTestId("bot-operations");
  const select = root.locator(".ops-workspace__mobile-select select");
  if (await select.isVisible()) await select.selectOption(name.toLowerCase().replaceAll(" ", "-"));
  else await root.getByRole("navigation", { name: "Bot Operations navigation", exact: true }).getByText(name, { exact: true }).click();
}

async function openTask(page, id) {
  const detail = page.getByTestId("bot-task-detail");
  if (await detail.count() && await detail.getAttribute("data-task-id") === id) return;
  const row = page.getByTestId(`bot-task-${id}`);
  if (!await row.isVisible() && await tracker(page).getByRole("button", { name: "Back to tasks" }).count()) await tracker(page).getByRole("button", { name: "Back to tasks" }).click();
  await row.click(); await expect(detail).toHaveAttribute("data-task-id", id);
}

async function assertRecordLayout(page, id, testCase) {
  const root = tracker(page); const before = await rawBotState(page);
  await root.getByLabel("Search tasks", { exact: true }).fill("QA-SKU-POLAR-SECOND");
  await expect(taskCards(page)).toHaveCount(1);
  const row = taskCards(page).first(); await row.focus(); await page.keyboard.press("Enter");
  const detail = page.getByTestId("bot-task-detail"); await expect(detail).toBeVisible();
  await expect(root.locator(".ops-record-browser__selection-heading")).toBeFocused();
  await expect(detail).toContainText("POLAR travel laptop"); await expect(detail).toContainText("QA-SKU-POLAR-SECOND");
  const browserWidth = await root.locator(".ops-record-browser").evaluate(element => element.getBoundingClientRect().width);
  if (testCase.width < 1100 || browserWidth < 700) await expect(root.locator(".ops-record-browser__list-pane")).toBeHidden();
  else await expect(root.locator(".ops-record-browser__list-pane")).toBeVisible();
  await assertLayout(page); await page.screenshot({ path: path.join(output, `${id}-task-detail.png`), fullPage: true });
  await root.getByRole("button", { name: "Back to tasks", exact: true }).click(); await expect(row).toBeFocused();
  await expect(root.getByLabel("Search tasks", { exact: true })).toHaveValue("QA-SKU-POLAR-SECOND");
  await root.getByRole("button", { name: "Clear filters", exact: true }).click();
  const disclosure = root.locator(".ops-record-browser__filters"); if (await disclosure.getAttribute("open") === null) await disclosure.locator("summary").click();
  const group = root.getByRole("group", { name: "Task group filters", exact: true });
  await group.getByRole("button").filter({ hasText: "POLAR travel laptop walmart plans" }).click();
  await expect(taskCards(page)).toHaveCount(1); await expect(page.getByTestId("bot-task-qa-task-polar-second")).toBeVisible();
  await root.getByRole("button", { name: "Clear filters", exact: true }).click();
  assert.equal(await rawBotState(page), before, "List, group filtering, detail and Back do not mutate records");
}

async function assertOverviewAndHistory(page, fixture, id) {
  await chooseSection(page, "Overview");
  const polar = page.getByTestId("bot-tracking-installation-qa-installation-polar");
  await expect(polar).toBeVisible();
  await expect(polar.locator("dl > div").filter({ has: page.getByText("Saved tasks", { exact: true }) }).locator("dd")).toHaveText("1");
  await expect(page.getByTestId("bot-tracking-installation-qa-installation-archived")).toHaveCount(0);
  await page.screenshot({ path: path.join(output, `${id}-overview.png`), fullPage: true });
  await polar.getByRole("button", { name: "View tasks for POLAR home computer", exact: true }).click();
  await expect(tracker(page)).toBeVisible();
  await expect(taskCards(page)).toHaveCount(1);
  await expect(page.getByTestId("bot-task-qa-task-polar")).toBeVisible();
  await tracker(page).getByRole("button", { name: "Clear filters", exact: true }).click();
  await openTask(page, "qa-task-polar"); const card = page.getByTestId("bot-task-detail");
  await expect(card).toContainText("POLAR home computer");
  await expect(card).toContainText("QA-SKU-POLAR");
  await chooseSection(page, "Activity");
  const history = page.getByTestId("bot-operations").locator(".bot-tracking-history");
  await expect(history).toBeVisible();
  const fixtureTitle = fixture.productTargets.find(row => row.id === fixture.tasks[0].productTargetId)?.title;
  await expect(history).toContainText(fixtureTitle);
  await history.getByLabel("Search history", { exact: true }).fill("definitely absent synthetic term");
  await expect(history.getByRole("heading", { name: "No matching activity", exact: true })).toBeVisible();
  await history.getByRole("button", { name: "Clear filters", exact: true }).click();
  await history.getByRole("combobox", { name: "Installation", exact: true }).selectOption("qa-installation-polar-second");
  await expect(history.getByRole("heading", { name: "No matching activity", exact: true })).toBeVisible();
  await expect(history.getByRole("heading", { name: "No matching checkout evidence", exact: true })).toBeVisible();
  await chooseSection(page, "Tasks"); await expect(tracker(page)).toBeVisible();
}

async function captureFailure(page, name, error) {
  await page.screenshot({ path: path.join(output, `${name}-failure.png`), fullPage: true }).catch(() => {});
  fs.writeFileSync(path.join(output, `${name}-failure.txt`), `${step}\n${error.stack}\n${await page.locator("body").innerText()}`);
}

async function componentCase(browser, fixture, testCase) {
  const { context, page, errors, external, writes } = await makeContext(browser, testCase, fixture);
  const id = `${testCase.width}-${testCase.theme}`;
  try {
    step = `${id}: load tracker and search joined records`;
    await page.goto(fixtureUrl(testCase.theme)); await expect(tracker(page)).toBeVisible();
    const before = await botState(page);
    await assertFilters(page, fixture);
    await assertRecordLayout(page, id, testCase);
    await assertOverviewAndHistory(page, fixture, id);
    const search = tracker(page).getByLabel("Search tasks", { exact: true });
    await search.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
    await expect(search).toBeFocused(); assert.notEqual(await search.evaluate(node => getComputedStyle(node).outlineStyle), "none");
    await assertLayout(page);
    await page.screenshot({ path: path.join(output, `${id}-tracking.png`), fullPage: true });
    step = `${id}: all eight bot installations offered and local plan saves`;
    const form = await openAdd(page, `Synthetic ${id} plan`);
    const options = await form.getByRole("combobox", { name: "Installation", exact: true }).locator("option").allTextContents();
    for (const provider of providerKeys) assert.ok(options.some(label => label.includes(`${provider} home computer`)), provider);
    assert.ok(options.every(label => !label.includes("Archived bot")));
    await assertLayout(page);
    await page.screenshot({ path: path.join(output, `${id}-plan-form.png`), fullPage: true });
    await form.getByRole("button", { name: "Save manual plan", exact: true }).click();
    await expect(tracker(page).getByRole("button", { name: `Edit plan Synthetic ${id} plan`, exact: true })).toBeVisible();
    let state = await botState(page);
    const target = state.productTargets.find(row => row.title === `Synthetic ${id} plan`);
    const task = state.tasks.find(row => row.productTargetId === target.id);
    assert.equal(state.tasks.length, before.tasks.length + 1); assert.equal(state.productTargets.length, before.productTargets.length + 1); assert.equal(state.taskGroups.length, before.taskGroups.length + 1);
    assert.equal(task.runtimeStatus, "DRAFT"); assert.equal(task.quantityTarget, 2); assert.deepEqual(task.maxPrice, { minorUnits: 5499, currency: "USD" });
    const edit = await editPlan(page, target.title, 3);
    await edit.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(edit).toHaveCount(0);
    await page.reload(); await expect(tracker(page)).toBeVisible();
    state = await botState(page); const updated = state.tasks.find(row => row.id === task.id);
    assert.equal(updated.quantityTarget, 3); assert.equal(updated.runtimeStatus, "READY"); assert.deepEqual(updated.maxPrice, { minorUnits: 6345, currency: "USD" });
    assert.equal(updated.recordVersion, task.recordVersion + 1);
    assert.deepEqual(state.productTargets.find(row => row.id === target.id), target, "Editing plan must not change shared target");
    step = `${id}: secret rejection and failed write preserve data atomically`;
    const saved = await rawBotState(page);
    let rejected = await openAdd(page, "licenseKey=synthetic-secret-rejected");
    await rejected.getByRole("button", { name: "Save manual plan", exact: true }).click();
    await expect(tracker(page).getByRole("alert")).toBeVisible(); assert.equal(await rawBotState(page), saved);
    assert.equal(await page.evaluate(() => window.__qaBlockedBotWrites), 0, "Secret input rejected before storage");
    assert.doesNotMatch(await tracker(page).getByRole("alert").innerText(), /synthetic-secret-rejected/);
    await rejected.getByLabel("Product name", { exact: true }).fill("Storage failure must leave no orphans");
    await page.evaluate(() => { window.__qaBlockBotWrites = true; });
    await rejected.getByRole("button", { name: "Save manual plan", exact: true }).click();
    await expect(tracker(page).getByRole("alert")).toBeVisible(); assert.equal(await rawBotState(page), saved);
    assert.equal(await page.evaluate(() => window.__qaBlockedBotWrites), 1, "Atomic-failure case must reach the attempted storage commit");
    await page.evaluate(() => { window.__qaBlockBotWrites = false; });
    await page.reload(); await expect(tracker(page)).toBeVisible();
    await assertProtectedRecords(page, before);
    step = `${id}: owner denied states never read private records`;
    for (const status of ["loading", "sign_in_required", "owner_access_required", "unavailable"]) {
      await page.evaluate(status => { window.__qaBotReads = 0; window.qaRender(status, { ownerAuthorized: true, appRole: "owner" }); }, status);
      await expect(tracker(page)).toHaveCount(0); await expect(page.getByTestId("owner-workspace-access-state")).toBeVisible();
      assert.equal(await page.evaluate(() => window.__qaBotReads), 0);
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(writes, []);
    const writtenKeys = [...new Set(await page.evaluate(() => window.__qaStorageWrites))];
    const collateralKeys = await page.evaluate(({ keys, storageKey }) => keys.filter(key => key !== storageKey && !(key.startsWith("lswt-") && localStorage.getItem(key) === null)), { keys: writtenKeys, storageKey });
    assert.deepEqual(collateralKeys, [], "Only Bot data writes and removed library storage capability probes are permitted");
    console.log(`PASS ${id}: filters, joined names, archived and attention, all eight installations, create/edit/reload, atomic failure, owner gate.`);
    return { ...testCase, joinedFilters: true, groupCounts: true, keyboardSelectAndBack: true, responsiveListDetail: true, archivedExcludedByDefault: true, attentionFilter: true, allEightInstallationsAvailable: true, createEditReload: true, atomicWriteFailure: true, secretRejected: true, ownerGateStates: 4, existingDataPreserved: true, externalRequests: external, networkWrites: writes, browserErrors: errors, screenshots: [`${id}-tracking.png`, `${id}-plan-form.png`, `${id}-task-detail.png`, `${id}-overview.png`] };
  } catch (error) { await captureFailure(page, id, error); throw error; } finally { await context.close(); }
}

async function layoutCase(browser, fixture, testCase) {
  const { context, page, errors, external, writes } = await makeContext(browser, testCase, fixture);
  const id = testCase.width + "-" + testCase.theme;
  try {
    await page.goto(fixtureUrl(testCase.theme)); await expect(tracker(page)).toBeVisible();
    await assertRecordLayout(page, id, testCase); await assertOverviewAndHistory(page, fixture, id);
    await assertLayout(page); await page.screenshot({ path: path.join(output, id + "-tracking.png"), fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(writes, []);
    console.log("PASS final layout " + id + ": responsive list/detail, group filter, keyboard focus and Back.");
    return { ...testCase, responsiveListDetail: true, keyboardSelectAndBack: true, groupFilters: true, screenshots: [id + "-tracking.png", id + "-task-detail.png", id + "-overview.png"] };
  } catch(error) { await captureFailure(page, id + "-layout", error); throw error; } finally { await context.close(); }
}

async function concurrencyCase(browser, fixture) {
  const { context, page: first, errors, external, writes } = await makeContext(browser, { width: 390, height: 844, theme: "dark" }, fixture);
  const second = await context.newPage(); second.on("pageerror", error => errors.push(error.message));
  try {
    step = "two tabs: concurrent atomic manual plans";
    await Promise.all([first.goto(fixtureUrl("dark")), second.goto(fixtureUrl("dark"))]);
    await Promise.all([expect(tracker(first)).toBeVisible(), expect(tracker(second)).toBeVisible()]);
    const before = await botState(first);
    const rows = await Promise.all([savePlan(first, "Concurrent first plan"), savePlan(second, "Concurrent second plan", "qa-installation-sniped")]);
    let state = await botState(first);
    for (const key of ["tasks", "taskGroups", "productTargets"]) assert.equal(state[key].length, before[key].length + 2);
    assert.ok(rows.every(row => state.tasks.some(saved => saved.id === row.id)));
    await Promise.all([first.reload(), second.reload()]);
    await Promise.all([expect(tracker(first)).toBeVisible(), expect(tracker(second)).toBeVisible()]);
    step = "two tabs: same-version manual plan edit conflict";
    const contested = state.tasks.find(row => row.id === rows[0].id);
    const forms = await Promise.all([editPlan(first, "Concurrent first plan", 4), editPlan(second, "Concurrent first plan", 5)]);
    await Promise.all(forms.map(form => form.getByRole("button", { name: "Save changes", exact: true }).click()));
    await expect.poll(async () => await tracker(first).getByRole("alert").count() + await tracker(second).getByRole("alert").count()).toBe(1);
    state = await botState(first); const winner = state.tasks.find(row => row.id === contested.id);
    assert.ok([4, 5].includes(winner.quantityTarget)); assert.equal(winner.recordVersion, contested.recordVersion + 1);
    await Promise.all([first.reload(), second.reload()]);
    await Promise.all([expect(tracker(first)).toBeVisible(), expect(tracker(second)).toBeVisible()]);
    const beforeQueue = await rawBotState(first);
    for (const change of ["signout", "identity"]) {
      step = `queued plan: ${change} cancels entire transaction`;
      await first.evaluate(() => { window.__qaLockHeld = false; window.__qaHoldingLock = navigator.locks.request("code3.bot-ops-write.v1", { mode: "exclusive" }, async () => { window.__qaLockHeld = true; await new Promise(resolve => { window.__qaReleaseLock = resolve; }); }); });
      await first.waitForFunction(() => window.__qaLockHeld);
      const form = await openAdd(second, `Must not save after ${change}`);
      await form.getByRole("button", { name: "Save manual plan", exact: true }).click();
      await first.waitForFunction(async () => (await navigator.locks.query()).pending.some(lock => lock.name === "code3.bot-ops-write.v1"));
      await second.evaluate(change => window.qaRender(change === "signout" ? "sign_in_required" : "authorized", change === "identity" ? { identityKey: "qa-new-owner-session" } : {}), change);
      if (change === "signout") await expect(second.getByTestId("owner-workspace-access-state")).toBeVisible();
      else { await expect(tracker(second)).toBeVisible(); await expect(tracker(second).getByRole("form", { name: "Add manual plan", exact: true })).toHaveCount(0); }
      await first.evaluate(async () => { window.__qaReleaseLock(); await window.__qaHoldingLock; });
      await first.waitForFunction(async () => { const locks = await navigator.locks.query(); return ![...locks.pending, ...locks.held].some(lock => lock.name === "code3.bot-ops-write.v1"); });
      assert.equal(await rawBotState(first), beforeQueue);
      await second.evaluate(() => window.qaRender("authorized")); await expect(tracker(second)).toBeVisible();
    }
    await assertProtectedRecords(first, before);
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(writes, []);
    console.log("PASS two tabs: atomic creates, same-version edit conflict, queued signout/identity cancellation.");
    return { concurrentAtomicCreates: true, sameVersionConflict: true, queuedSignoutCancelled: true, queuedIdentityCancelled: true, existingDataPreserved: true, externalRequests: external, networkWrites: writes, browserErrors: errors };
  } catch (error) { await captureFailure(first, "concurrency", error); throw error; } finally { await context.close(); }
}

async function actualAppCase(browser, fixture, testCase) {
  const { context, page, errors, external, writes } = await makeContext(browser, testCase, fixture);
  try {
    step = "actual App: local owner tracking route";
    await page.goto(`${base}/bot/tasks?betaLocalMode=true`);
    const controls = page.getByRole("region", { name: "Admin display controls", exact: true });
    await expect(controls).toBeVisible({ timeout: 45000 });
    await controls.getByRole("button", { name: "Admin", exact: true }).click(); await expect(tracker(page)).toBeVisible();
    const before = await botState(page); const appBaseline = await page.evaluate(() => localStorage.getItem("et-tcg-beta-data"));
    await assertLayout(page);
    await page.screenshot({ path: path.join(output, `${testCase.width}-${testCase.theme}-actual-app-list.png`), fullPage: true });
    await openTask(page, "qa-task-polar-second");
    const browserWidth = await tracker(page).locator(".ops-record-browser").evaluate(element => element.getBoundingClientRect().width);
    if (testCase.width >= 1100 && browserWidth >= 700) await expect(tracker(page).locator(".ops-record-browser__list-pane")).toBeVisible();
    else await expect(tracker(page).locator(".ops-record-browser__list-pane")).toBeHidden();
    await assertLayout(page);
    await page.screenshot({ path: path.join(output, `${testCase.width}-${testCase.theme}-actual-app-task-detail.png`), fullPage: true });
    await tracker(page).getByRole("button", { name: "Back to tasks", exact: true }).click();
    await savePlan(page, "Actual app synthetic plan");
    await assertLayout(page);
    await page.screenshot({ path: path.join(output, `${testCase.width}-${testCase.theme}-actual-app.png`), fullPage: true });
    await chooseSection(page, "Overview");
    assert.equal(new URL(page.url()).pathname, "/bot");
    await page.goBack(); await expect(tracker(page)).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/bot/tasks");
    const savedState = await botState(page); const target = savedState.productTargets.find(row => row.title === "Actual app synthetic plan"); await openTask(page, savedState.tasks.find(row => row.productTargetId === target.id).id);
    await expect(tracker(page).getByRole("button", { name: "Edit plan Actual app synthetic plan", exact: true })).toBeVisible();
    await page.reload(); await expect(tracker(page)).toBeVisible();
    await assertProtectedRecords(page, before, appBaseline);
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(writes, []);
    console.log(`PASS actual App: ${testCase.width}px ${testCase.theme} local plan, route/Back/reload and existing data preservation.`);
    return { actualApp: true, ...testCase, createReload: true, browserBack: true, existingDataPreserved: true, externalRequests: external, networkWrites: writes, browserErrors: errors };
  } catch (error) { await captureFailure(page, "actual-app", error); throw error; } finally { await context.close(); }
}

async function evidenceReferenceCase(browser, fixture) {
  const results = [];
  for (const kind of ["different-task-product", "missing-task", "missing-evidence-product"]) {
    const state = structuredClone(fixture);
    const evidence = state.checkoutEvidence[0];
    evidence.productTargetId = kind === "missing-evidence-product" ? "qa-target-does-not-exist" : "qa-target-sniped";
    if (kind === "missing-task") evidence.taskId = "qa-task-does-not-exist";
    const title = kind === "missing-evidence-product" ? "Product not recorded" : state.productTargets.find(row => row.id === evidence.productTargetId).title;
    const { context, page, errors, external, writes } = await makeContext(browser, { width: 390, height: 844, theme: "dark" }, state);
    try {
      step = `evidence reference: ${kind}`;
      await page.goto(fixtureUrl("dark")); await expect(tracker(page)).toBeVisible();
      const before = await rawBotState(page);
      await chooseSection(page, "Activity");
      const evidenceSection = page.locator(".bot-ops-evidence");
      await expect(evidenceSection.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(evidenceSection.getByRole("heading", { name: "Synthetic Pokémon product", exact: true })).toHaveCount(0);
      const history = page.getByTestId("bot-operations").locator(".bot-tracking-history").first();
      await history.getByLabel("Search history", { exact: true }).fill(title);
      await expect(evidenceSection.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await history.getByLabel("Search history", { exact: true }).fill("Synthetic Pokémon product");
      await expect(evidenceSection.getByRole("heading", { name: "No matching checkout evidence", exact: true })).toBeVisible();
      assert.equal(await rawBotState(page), before, "Evidence display/filter must not rewrite its record");
      await assertProtectedRecords(page, state);
      assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(writes, []);
      results.push({ kind, correctEvidenceProduct: true, searchUsesEvidenceProduct: true, dataUnchanged: true });
    } catch (error) { await captureFailure(page, kind, error); throw error; } finally { await context.close(); }
  }
  console.log("PASS evidence product references: mismatched task, missing task, and missing target display/filter without misattribution or writes.");
  return { evidenceProductReferences: results };
}

(async () => {
  writeFixture(); const fixture = await makeFixture(); const browser = await chromium.launch({ headless: true });
  const results = []; const layoutOnly = process.argv.includes("--layout-only"); const targeted = process.argv.includes("--targeted"); const single = process.argv.includes("--single"); const evidenceOnly = process.argv.includes("--evidence-only");
  try {
    if (layoutOnly) { for (const testCase of cases) results.push(await layoutCase(browser, fixture, testCase)); for (const testCase of [cases[0], cases[5]]) results.push(await actualAppCase(browser, fixture, testCase)); }
    if (!layoutOnly && !targeted && !evidenceOnly) { for (const testCase of single ? cases.slice(0, 1) : cases) results.push(await componentCase(browser, fixture, testCase)); if (!single) for (const testCase of [cases[0], cases[5]]) results.push(await actualAppCase(browser, fixture, testCase)); }
    if (!layoutOnly && !single && !evidenceOnly) results.push(await concurrencyCase(browser, fixture));
    if (!layoutOnly && !single) results.push(await evidenceReferenceCase(browser, fixture));
    fs.writeFileSync(path.join(output, layoutOnly ? "results-layout.json" : evidenceOnly ? "results-evidence.json" : single ? "results-single.json" : targeted ? "results-targeted.json" : "results.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), syntheticOnly: true, liveProvidersTested: false, results }, null, 2)}\n`);
  } finally { await browser.close(); }
})().catch(error => { console.error(`FAILED ${step}`); console.error(error); process.exitCode = 1; });
