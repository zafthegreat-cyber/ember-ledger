const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5243").origin;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname), "Use disposable loopback state only");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/bot-provider-setup");
const storageKey = "code3.bot-ops.v1";
const providerKeys = ["HAYHA", "STELLAR", "SHIKARI", "VALOR", "REFRACT", "POLAR", "SNIPED", "SWOOPER"];
const cases = [320, 390, 1440].flatMap(width => ["light", "dark"].map(theme => ({ width, height: width === 320 ? 720 : 900, theme })));
const fixtureFile = path.join(output, "fixture.html");
const preservedRecords = JSON.stringify({
  userType: "collector", dashboardPreset: "simple",
  profile: { userId: "local-beta", email: "bot-setup@example.test", displayName: "Synthetic owner", appRole: "owner", app_role: "owner", userRole: "owner", appAccess: "approved" },
  subscriptionProfile: { tier: "admin", featureTier: "admin", subscriptionPlan: "admin", appRole: "owner", app_role: "owner", isAdmin: true, lifetimeAccess: true, subscriptionStatus: "active" },
  items: [{ id: "qa-existing-card", name: "Existing synthetic card", quantity: 2, photoUrl: "/code3-logo.svg" }],
  sales: [{ id: "qa-existing-sale", title: "Existing synthetic sale", grossSalePrice: 30 }],
  expenses: [{ id: "qa-existing-expense", description: "Existing synthetic expense", amount: 4 }],
});
const accountRecords = JSON.stringify({ synthetic: true, accounts: [{ id: "qa-existing-account", label: "Existing account metadata" }] });
let step = "initialization";
let reviewedDate;

function writeFixture() {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(fixtureFile, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic bot provider setup</title></head><body><div id="root"></div><script type="module">
import React from "react";
import {createRoot} from "react-dom/client";
import "/src/index.css";
import "/src/App.css";
import WorkspaceHomePage from "/src/features/workspaces/WorkspaceHomePage.jsx";
const theme = new URLSearchParams(location.search).get("theme") || "light";
document.documentElement.dataset.theme = theme;
const root = createRoot(document.getElementById("root"));
window.qaRender = (status = "authorized", extra = {}) => {
  root.render(React.createElement("div", {className:"app app-command-shell", "data-theme":theme, style:{padding:"16px", minHeight:"100dvh"}},
    React.createElement(WorkspaceHomePage, {workspace:"BOT", botOpsSection:"bots", ownerSession:{status, authenticated:status==="authorized", ownerAuthorized:status==="authorized", provider:"synthetic-test", userId:"qa-owner", identityKey:"qa-owner-initial", ...extra}})));
};
window.qaRender();
window.qaReady = true;
</script></body></html>`, "utf8");
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
    if (!localStorage.getItem("__qa_bot_provider_setup")) {
      localStorage.setItem("__qa_bot_provider_setup", "true");
      localStorage.setItem("et-tcg-app-theme", theme);
      localStorage.setItem("et-tcg-beta-data", preservedRecords);
      localStorage.setItem("qa-preserved-account-records", accountRecords);
      localStorage.setItem(storageKey, JSON.stringify(initialBotState));
    }
    window.__qaBotReads = 0;
    const originalGetItem = Storage.prototype.getItem;
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.getItem = function(key) {
      if (key === storageKey) {
        window.__qaBotReads += 1;
        if (originalGetItem.call(sessionStorage, "__qa_block_bot_reads") === "true") throw new Error("Synthetic storage read failure");
      }
      return originalGetItem.call(this, key);
    };
    Storage.prototype.setItem = function(key, value) { if (window.__qaBlockBotWrites && key === storageKey) throw new Error("Synthetic storage unavailable"); return originalSetItem.call(this, key, value); };
    window.open = () => null;
  }, { theme: testCase.theme, initialBotState, storageKey, preservedRecords, accountRecords });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => errors.push(error.message));
  return { context, page, external, writes, errors };
}

async function botState(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey); }
async function rawBotState(page) { return page.evaluate(key => localStorage.getItem(key), storageKey); }
async function assertProtectedRecords(page, before, initializedAppRecords = null) {
  const current = await botState(page);
  for (const [key, value] of Object.entries(before)) {
    if (!["installations", "updatedAt"].includes(key)) assert.deepEqual(current[key], value, `${key} records must remain unchanged`);
  }
  for (const row of before.installations) assert.deepEqual(current.installations.find(entry => entry.id === row.id), row, "Existing installation preserved");
  const actualAppRecords = await page.evaluate(() => localStorage.getItem("et-tcg-beta-data"));
  if (initializedAppRecords) {
    const expected = JSON.parse(initializedAppRecords); const actual = JSON.parse(actualAppRecords);
    for (const key of ["items", "sales", "expenses", "subscriptionProfile"]) assert.deepEqual(actual[key], expected[key]);
    assert.equal(actual.profile.appRole, expected.profile.appRole);
  } else assert.equal(actualAppRecords, preservedRecords, "Existing collection, sales, expenses, account and plan bytes are unchanged");
  assert.equal(await page.evaluate(() => localStorage.getItem("qa-preserved-account-records")), accountRecords);
}

async function assertLayout(page, root) {
  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - innerWidth, 0));
  assert.ok(overflow <= 1, `Page overflows by ${overflow}px`);
  const undersized = await root.locator("button:visible, input:visible, select:visible, summary:visible").evaluateAll(nodes => nodes.map(node => {
    const box = node.getBoundingClientRect(); return { label: node.getAttribute("aria-label") || node.textContent?.trim() || node.name, width: box.width, height: box.height };
  }).filter(item => item.width < 43.9 || item.height < 43.9));
  assert.deepEqual(undersized, [], "Interactive targets are at least 44px");
}

async function assertManualOnly(page, baselineCount) {
  const state = await botState(page);
  for (const row of state.installations.slice(baselineCount)) {
    assert.equal(row.connectionMode, "MANUAL_RECORD");
    assert.equal(row.enabled, false);
    assert.equal(row.healthState, "DISCONNECTED");
    assert.equal(row.lastSeenAt, null);
    assert.ok(Object.values(row.capabilitySnapshot).every(value => value === false));
  }
  const buttons = await page.getByTestId("bot-provider-setup").getByRole("button").allTextContents();
  assert.ok(buttons.every(label => !/^(start|stop|restart|checkout|buy now|connect|sync|run)\b/i.test(label.trim())), "No live command is exposed");
}

async function saveProvider(page, provider, label) {
  const setup = page.getByTestId("bot-provider-setup");
  await setup.getByLabel("Bot provider", { exact: true }).selectOption(provider);
  await expect(setup.getByTestId("bot-provider-connection")).toContainText(/not connected/i);
  await expect(setup.getByTestId("bot-provider-guidance")).toContainText(`Reviewed ${reviewedDate}`);
  await setup.getByLabel("Installation name", { exact: true }).fill(label);
  await setup.getByLabel("Device label (optional)", { exact: true }).fill("Synthetic desktop");
  await setup.getByLabel("Bot version (optional)", { exact: true }).fill("qa-1.0");
  await setup.getByRole("button", { name: "Save installation", exact: true }).click();
  await expect(setup.getByRole("button", { name: `Edit ${label}`, exact: true })).toBeVisible();
  return (await botState(page)).installations.find(row => row.friendlyName === label);
}

async function editProvider(page, row, label) {
  const setup = page.getByTestId("bot-provider-setup");
  await setup.getByRole("button", { name: `Edit ${row.friendlyName}`, exact: true }).click();
  await expect(setup.getByLabel("Bot provider", { exact: true })).toBeDisabled();
  await setup.getByLabel("Installation name", { exact: true }).fill(label);
  await setup.getByLabel("Device label (optional)", { exact: true }).fill("Synthetic laptop");
  await setup.getByLabel("Bot version (optional)", { exact: true }).fill("qa-1.1");
  await setup.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(setup.getByRole("button", { name: `Edit ${label}`, exact: true })).toBeVisible();
  const updated = (await botState(page)).installations.find(entry => entry.id === row.id);
  assert.equal(updated.provider, row.provider); assert.equal(updated.friendlyName, label);
  assert.equal(updated.runtimeLabel, "Synthetic laptop"); assert.equal(updated.version, "qa-1.1");
  assert.ok(updated.recordVersion > row.recordVersion);
  return updated;
}

async function componentCase(browser, testCase, fixture) {
  const { context, page, external, writes, errors } = await makeContext(browser, testCase, fixture);
  const id = `${testCase.width}-${testCase.theme}`;
  try {
    step = `${id}: owner provider setup load`;
    const fixturePath = path.relative(process.cwd(), fixtureFile).replaceAll(path.sep, "/");
    await page.goto(`${base}/${fixturePath}?theme=${testCase.theme}`);
    const setup = page.getByTestId("bot-provider-setup");
    await expect(setup).toBeVisible();
    assert.deepEqual((await setup.getByLabel("Bot provider", { exact: true }).locator("option").evaluateAll(nodes => nodes.map(node => node.value))).sort(), [...providerKeys].sort());
    const before = await botState(page);
    await assertLayout(page, setup);
    const select = setup.getByLabel("Bot provider", { exact: true });
    await select.focus(); await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
    await expect(select).toBeFocused();
    assert.notEqual(await select.evaluate(node => getComputedStyle(node).outlineStyle), "none", "Visible keyboard focus");
    for (const provider of providerKeys) {
      step = `${id}: save/edit/reload ${provider}`;
      const label = `${provider} synthetic installation`;
      const row = await saveProvider(page, provider, label);
      assert.ok(row?.id); assert.equal(row.provider, provider);
      await editProvider(page, row, `${label} reviewed`);
      await page.reload(); await expect(setup).toBeVisible();
      await expect(setup.getByRole("button", { name: `Edit ${label} reviewed`, exact: true })).toBeVisible();
      await assertProtectedRecords(page, before);
      await assertManualOnly(page, before.installations.length);
    }
    assert.equal((await botState(page)).installations.length, before.installations.length + providerKeys.length);
    step = `${id}: reject secrets without changing data`;
    const savedState = await rawBotState(page);
    for (const field of ["Installation name", "Device label (optional)", "Bot version (optional)"]) {
      await setup.getByLabel("Installation name", { exact: true }).fill("Reject unsafe synthetic input");
      await setup.getByLabel("Device label (optional)", { exact: true }).fill("QA device");
      await setup.getByLabel("Bot version (optional)", { exact: true }).fill("qa-2");
      await setup.getByLabel(field, { exact: true }).fill("password=synthetic-secret-rejected");
      await setup.getByRole("button", { name: "Save installation", exact: true }).click();
      await expect(setup.getByRole("alert")).toBeVisible();
      assert.equal(await rawBotState(page), savedState);
      assert.doesNotMatch(await setup.getByRole("alert").innerText(), /synthetic-secret-rejected/);
    }
    step = `${id}: failed storage preserves prior records`;
    await setup.getByLabel("Installation name", { exact: true }).fill("Synthetic storage failure");
    await setup.getByLabel("Device label (optional)", { exact: true }).fill("QA device");
    await setup.getByLabel("Bot version (optional)", { exact: true }).fill("qa-2");
    await page.evaluate(() => { window.__qaBlockBotWrites = true; });
    await setup.getByRole("button", { name: "Save installation", exact: true }).click();
    await expect(setup.getByRole("alert")).toBeVisible();
    assert.equal(await rawBotState(page), savedState);
    await page.evaluate(() => { window.__qaBlockBotWrites = false; });
    await page.reload(); await expect(setup).toBeVisible();
    await setup.getByLabel("Bot provider", { exact: true }).selectOption("POLAR");
    await assertLayout(page, setup);
    await page.screenshot({ path: path.join(output, `${id}-provider-setup.png`), fullPage: true });
    step = `${id}: owner gate does not read saved Bot records`;
    for (const status of ["loading", "sign_in_required", "owner_access_required", "unavailable"]) {
      await page.evaluate(status => { window.__qaBotReads = 0; window.qaRender(status, { ownerAuthorized: true, appRole: "owner" }); }, status);
      await expect(setup).toHaveCount(0);
      await expect(page.getByTestId("owner-workspace-access-state")).toBeVisible();
      assert.equal(await page.evaluate(() => window.__qaBotReads), 0, `${status} never loads private Bot records`);
    }
    await page.evaluate(() => window.qaRender("authorized")); await expect(setup).toBeVisible();
    await assertProtectedRecords(page, before);
    assert.equal(await rawBotState(page), savedState);
    assert.deepEqual(errors, []); assert.deepEqual(writes, []); assert.deepEqual(external, []);
    console.log(`PASS ${id}: eight providers save/edit/reload, owner gate, rejected secrets, failure recovery, data preservation.`);
    return { ...testCase, providers: providerKeys, ownerGateStates: 4, secretFieldsRejected: 3, storageFailurePreservesData: true, existingRecordsUnchanged: true, liveCapabilitiesDisabled: true, horizontalOverflow: 0, browserErrors: errors, externalRequests: external, attemptedNetworkWrites: writes, screenshot: path.relative(process.cwd(), path.join(output, `${id}-provider-setup.png`)).replaceAll(path.sep, "/") };
  } catch (error) {
    await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(output, "failure.txt"), `${step}\n${error.stack}\n${await page.locator("body").innerText()}`);
    throw error;
  } finally { await context.close(); }
}

async function actualAppCase(browser, fixture, testCase) {
  const { context, page, errors, external, writes } = await makeContext(browser, testCase, fixture);
  try {
    step = "actual App: owner route";
    await page.goto(`${base}/bot/bots?betaLocalMode=true`);
    const controls = page.getByRole("region", { name: "Admin display controls", exact: true });
    await expect(controls).toBeVisible({ timeout: 45000 });
    await controls.getByRole("button", { name: "Admin", exact: true }).click();
    const setup = page.getByTestId("bot-provider-setup"); await expect(setup).toBeVisible();
    const before = await botState(page);
    const initializedAppRecords = await page.evaluate(() => localStorage.getItem("et-tcg-beta-data"));
    const row = await saveProvider(page, "POLAR", "POLAR actual app synthetic");
    await editProvider(page, row, "POLAR actual app reviewed");
    await page.reload(); await expect(setup).toBeVisible();
    await expect(setup.getByRole("button", { name: "Edit POLAR actual app reviewed", exact: true })).toBeVisible();
    await assertManualOnly(page, before.installations.length);
    await assertLayout(page, setup);
    await page.screenshot({ path: path.join(output, `${testCase.width}-${testCase.theme}-actual-app.png`), fullPage: true });
    step = "actual App: all nine sections reachable on mobile";
    const selectSection = async label => {
      const select = page.getByTestId("bot-operations").locator(".ops-workspace__mobile-select select");
      if (await select.isVisible()) await select.selectOption(label.toLowerCase().replaceAll(" ", "-"));
      else await page.getByRole("navigation", { name: "Bot Operations navigation", exact: true }).getByText(label, { exact: true }).click();
    };
    for (const [label, pathname, heading] of [["Overview", "/bot", "Overview"], ["Bots", "/bot/bots", "Set up your bot list"], ["Task Groups", "/bot/task-groups", "Task Groups"], ["Tasks", "/bot/tasks", "Task tracker"], ["Accounts", "/bot/accounts", "Accounts"], ["Profiles", "/bot/profiles", "Profiles"], ["Proxies", "/bot/proxies", "Proxies"], ["Targets", "/bot/targets", "Product Targets"], ["Activity", "/bot/activity", "Activity"]]) {
      await selectSection(label);
      await expect(page.getByTestId("bot-operations").getByRole("heading", { name: heading, exact: true })).toBeVisible();
      assert.equal(new URL(page.url()).pathname, pathname);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    }
    await selectSection("Bots");
    await expect(setup).toBeVisible();
    const botBeforePreview = await rawBotState(page);
    step = "actual App: ordinary-user preview hides Bot";
    await controls.getByRole("button", { name: "Regular", exact: true }).click();
    await expect(setup).toHaveCount(0);
    await page.goto(`${base}/bot/bots?betaLocalMode=true`);
    await expect(page.getByRole("heading", { name: "Outside the user preview", exact: true })).toBeVisible({ timeout: 30000 });
    await controls.getByRole("button", { name: "Admin", exact: true }).click();
    await expect(setup).toBeVisible();
    assert.equal(await rawBotState(page), botBeforePreview);
    await assertProtectedRecords(page, before, initializedAppRecords);
    assert.deepEqual(errors, []); assert.deepEqual(writes, []); assert.deepEqual(external, []);
    console.log("PASS actual App: owner route, persisted local metadata, ordinary preview gate and records unchanged.");
    return { actualApp: true, ...testCase, saveEditReload: true, mobileSectionsReachable: 9, ordinaryPreviewHidesBot: true, existingRecordsUnchanged: true, browserErrors: errors, attemptedNetworkWrites: writes, externalRequests: external };
  } catch (error) {
    await page.screenshot({ path: path.join(output, "actual-app-failure.png"), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(output, "actual-app-failure.txt"), `${step}\n${error.stack}\n${await page.locator("body").innerText()}`);
    throw error;
  } finally { await context.close(); }
}

async function corruptedStorageCase(browser, fixture) {
  const testCase = { width: 320, height: 720, theme: "dark" };
  const { context, page, errors, external, writes } = await makeContext(browser, testCase, fixture);
  try {
    step = "damaged storage: initial valid state";
    const fixturePath = path.relative(process.cwd(), fixtureFile).replaceAll(path.sep, "/");
    await page.goto(`${base}/${fixturePath}?theme=dark`);
    const setup = page.getByTestId("bot-provider-setup"); await expect(setup).toBeVisible();
    const original = await rawBotState(page);
    const unsupported = structuredClone(fixture); unsupported.schemaVersion = 999;
    const unknownProvider = structuredClone(fixture); unknownProvider.installations[0].provider = "UNKNOWN_PROVIDER";
    for (const [kind, raw] of [["malformed JSON", '{"savedRecords":'], ["unsupported schema", JSON.stringify(unsupported)], ["unknown provider", JSON.stringify(unknownProvider)]]) {
      step = `damaged storage: ${kind} must remain intact`;
      await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: storageKey, raw });
      await page.reload();
      await expect(page.getByRole("heading", { name: "Bot Operations unavailable", exact: true })).toBeVisible();
      await expect(page.getByText(/Existing data has been kept/)).toBeVisible();
      await expect(setup).toHaveCount(0);
      assert.equal(await rawBotState(page), raw, `${kind} original bytes preserved`);
      await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: storageKey, raw: original });
      await page.reload(); await expect(setup).toBeVisible();
    }
    step = "damaged storage: read exception does not expose empty setup";
    await page.evaluate(() => sessionStorage.setItem("__qa_block_bot_reads", "true"));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Bot Operations unavailable", exact: true })).toBeVisible();
    await expect(setup).toHaveCount(0);
    await page.evaluate(() => sessionStorage.removeItem("__qa_block_bot_reads"));
    assert.equal(await rawBotState(page), original);
    await page.reload(); await expect(setup).toBeVisible();
    step = "damaged storage: corrupted after load cannot be overwritten by save";
    const lateCorruption = '{"preserve-this-original":';
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: storageKey, raw: lateCorruption });
    await setup.getByLabel("Installation name", { exact: true }).fill("Must not overwrite damaged data");
    await setup.getByRole("button", { name: "Save installation", exact: true }).click();
    await expect(setup.getByRole("alert")).toBeVisible();
    assert.equal(await rawBotState(page), lateCorruption);
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: storageKey, raw: original });
    await page.reload(); await expect(setup).toBeVisible();
    await assertProtectedRecords(page, fixture);
    assert.equal(await rawBotState(page), original);
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(writes, []);
    console.log("PASS damaged storage: invalid JSON/schema/provider, read failure, stale loaded save and recovery all preserve original bytes.");
    return { corruptedStorage: true, invalidJsonPreserved: true, unsupportedSchemaPreserved: true, unknownProviderPreserved: true, readFailurePreserved: true, corruptionAfterLoadPreserved: true, validRecoveryWorks: true, browserErrors: errors, externalRequests: external, attemptedNetworkWrites: writes };
  } catch (error) {
    await page.screenshot({ path: path.join(output, "storage-failure.png"), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(output, "storage-failure.txt"), `${step}\n${error.stack}\n${await page.locator("body").innerText()}`);
    throw error;
  } finally { await context.close(); }
}

async function concurrencyCase(browser, fixture) {
  const { context, page: first, errors, external, writes } = await makeContext(browser, { width: 390, height: 844, theme: "dark" }, fixture);
  const second = await context.newPage(); second.on("pageerror", error => errors.push(error.message));
  const fixturePath = path.relative(process.cwd(), fixtureFile).replaceAll(path.sep, "/");
  const url = `${base}/${fixturePath}?theme=dark`;
  try {
    step = "two tabs: simultaneous creates";
    await Promise.all([first.goto(url), second.goto(url)]);
    await Promise.all([expect(first.getByTestId("bot-provider-setup")).toBeVisible(), expect(second.getByTestId("bot-provider-setup")).toBeVisible()]);
    const before = await botState(first);
    const rows = await Promise.all([saveProvider(first, "POLAR", "Concurrent first installation"), saveProvider(second, "SNIPED", "Concurrent second installation")]);
    let state = await botState(first);
    assert.equal(state.installations.length, before.installations.length + 2);
    assert.ok(rows.every(row => state.installations.some(entry => entry.id === row.id)));
    await Promise.all([first.reload(), second.reload()]);
    await Promise.all([expect(first.getByTestId("bot-provider-setup")).toBeVisible(), expect(second.getByTestId("bot-provider-setup")).toBeVisible()]);
    step = "two tabs: simultaneous different-record edits";
    await Promise.all([editProvider(first, rows[0], "Concurrent first updated"), editProvider(second, rows[1], "Concurrent second updated")]);
    state = await botState(first);
    assert.equal(state.installations.find(row => row.id === rows[0].id).friendlyName, "Concurrent first updated");
    assert.equal(state.installations.find(row => row.id === rows[1].id).friendlyName, "Concurrent second updated");
    await Promise.all([first.reload(), second.reload()]);
    await Promise.all([expect(first.getByTestId("bot-provider-setup")).toBeVisible(), expect(second.getByTestId("bot-provider-setup")).toBeVisible()]);
    step = "two tabs: same-record conflict preserves one version";
    const contested = (await botState(first)).installations.find(row => row.id === rows[0].id);
    for (const [page, name] of [[first, "Concurrent winner A"], [second, "Concurrent winner B"]]) {
      const setup = page.getByTestId("bot-provider-setup");
      await setup.getByRole("button", { name: `Edit ${contested.friendlyName}`, exact: true }).click();
      await setup.getByLabel("Installation name", { exact: true }).fill(name);
    }
    await Promise.all([first.getByRole("button", { name: "Save changes", exact: true }).click(), second.getByRole("button", { name: "Save changes", exact: true }).click()]);
    await expect.poll(async () => await first.getByTestId("bot-provider-setup").getByRole("alert").count() + await second.getByTestId("bot-provider-setup").getByRole("alert").count()).toBe(1);
    const winner = (await botState(first)).installations.find(row => row.id === contested.id);
    assert.ok(["Concurrent winner A", "Concurrent winner B"].includes(winner.friendlyName));
    assert.equal(winner.recordVersion, contested.recordVersion + 1);
    for (const page of [first, second]) if (await page.getByTestId("bot-provider-setup").getByRole("alert").count()) await expect(page.getByTestId("bot-provider-setup").getByRole("alert")).toContainText(/changed|reload|version|conflict/i);
    await Promise.all([first.reload(), second.reload()]);
    await Promise.all([expect(first.getByTestId("bot-provider-setup")).toBeVisible(), expect(second.getByTestId("bot-provider-setup")).toBeVisible()]);
    step = "queued save: signout cancels before acquiring lock";
    const beforeQueuedSave = await rawBotState(first);
    await first.evaluate(() => {
      window.__qaLockHeld = false;
      window.__qaHoldingLock = navigator.locks.request("code3.bot-ops-write.v1", { mode: "exclusive" }, async () => {
        window.__qaLockHeld = true;
        await new Promise(resolve => { window.__qaReleaseLock = resolve; });
      });
    });
    await first.waitForFunction(() => window.__qaLockHeld);
    await second.getByLabel("Installation name", { exact: true }).fill("Must not save after signout");
    await second.getByRole("button", { name: "Save installation", exact: true }).click();
    await first.waitForFunction(async () => (await navigator.locks.query()).pending.some(lock => lock.name === "code3.bot-ops-write.v1"));
    await second.evaluate(() => window.qaRender("sign_in_required"));
    await expect(second.getByTestId("owner-workspace-access-state")).toBeVisible();
    await first.evaluate(async () => { window.__qaReleaseLock(); await window.__qaHoldingLock; });
    await first.waitForFunction(async () => { const locks = await navigator.locks.query(); return ![...locks.pending, ...locks.held].some(lock => lock.name === "code3.bot-ops-write.v1"); });
    assert.equal(await rawBotState(first), beforeQueuedSave, "Queued save after signout cannot write");
    step = "queued save: identity replacement cancels old session write";
    await second.evaluate(() => window.qaRender("authorized"));
    await expect(second.getByTestId("bot-provider-setup")).toBeVisible();
    await first.evaluate(() => {
      window.__qaLockHeld = false;
      window.__qaHoldingLock = navigator.locks.request("code3.bot-ops-write.v1", { mode: "exclusive" }, async () => {
        window.__qaLockHeld = true;
        await new Promise(resolve => { window.__qaReleaseLock = resolve; });
      });
    });
    await first.waitForFunction(() => window.__qaLockHeld);
    await second.getByLabel("Installation name", { exact: true }).fill("Must not save under replacement identity");
    await second.getByRole("button", { name: "Save installation", exact: true }).click();
    await first.waitForFunction(async () => (await navigator.locks.query()).pending.some(lock => lock.name === "code3.bot-ops-write.v1"));
    await second.evaluate(() => window.qaRender("authorized", { identityKey: "qa-owner-replacement" }));
    await expect(second.getByTestId("bot-provider-setup")).toBeVisible();
    await expect(second.getByLabel("Installation name", { exact: true })).toHaveValue("");
    await first.evaluate(async () => { window.__qaReleaseLock(); await window.__qaHoldingLock; });
    await first.waitForFunction(async () => { const locks = await navigator.locks.query(); return ![...locks.pending, ...locks.held].some(lock => lock.name === "code3.bot-ops-write.v1"); });
    assert.equal(await rawBotState(first), beforeQueuedSave, "Queued save from a replaced owner session cannot write");
    step = "explicit license text is rejected";
    await first.getByLabel("Installation name", { exact: true }).fill("licenseKey=synthetic-license-rejected");
    await first.getByRole("button", { name: "Save installation", exact: true }).click();
    await expect(first.getByTestId("bot-provider-setup").getByRole("alert")).toBeVisible();
    assert.equal(await rawBotState(first), beforeQueuedSave);
    await assertProtectedRecords(first, before);
    assert.deepEqual(errors, []); assert.deepEqual(external, []); assert.deepEqual(writes, []);
    console.log("PASS two-tab writes: concurrent creates/edits preserved, same-record conflict rejected, queued signout/identity saves cancelled, license label rejected.");
    return { crossTabConcurrency: true, concurrentCreatesPreserved: true, differentRecordEditsPreserved: true, sameRecordConflictRejected: true, queuedSignoutWriteCancelled: true, queuedIdentityWriteCancelled: true, explicitLicenseRejected: true, existingRecordsUnchanged: true, browserErrors: errors, externalRequests: external, attemptedNetworkWrites: writes };
  } catch (error) {
    await first.screenshot({ path: path.join(output, "concurrency-failure.png"), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(output, "concurrency-failure.txt"), `${step}\n${error.stack}\n${await first.locator("body").innerText()}`);
    throw error;
  } finally { await context.close(); }
}

(async () => {
  writeFixture();
  const fixtures = await import(pathToFileURL(path.resolve("src/features/botOps/fixtures/phase2dQaFixtures.js")).href);
  const catalog = await import(pathToFileURL(path.resolve("src/features/botOps/providerCatalog.js")).href);
  reviewedDate = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(catalog.BOT_PROVIDER_REVIEWED_AT));
  const fixture = fixtures.getPhase2dQaFixture("checkout-evidence-review").state;
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const targeted = process.argv.includes("--targeted");
  try {
    if (!targeted) {
      for (const testCase of cases) results.push(await componentCase(browser, testCase, fixture));
      for (const testCase of [{ width: 320, height: 720, theme: "light" }, { width: 390, height: 844, theme: "dark" }]) results.push(await actualAppCase(browser, fixture, testCase));
    }
    results.push(await corruptedStorageCase(browser, fixture));
    results.push(await concurrencyCase(browser, fixture));
    fs.writeFileSync(path.join(output, targeted ? "results-targeted.json" : "results.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), syntheticOnly: true, actualProviderConnectionsTested: false, results }, null, 2)}\n`);
  } finally { await browser.close(); }
})().catch(error => { console.error(`FAILED ${step}`); console.error(error); process.exitCode = 1; });
