const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const { build } = require("esbuild");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5243").origin;
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(base).hostname), "Keep synthetic tests on loopback");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/experience-controls");
fs.mkdirSync(output, { recursive: true });
const fixture = path.join(output, "fixture.html");
fs.writeFileSync(fixture, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React,{useState} from "react";import {createRoot} from "react-dom/client";
import "/src/index.css";import "/src/App.css";
import {AdminPlanPreviewControls,ExperiencePreferences} from "/src/components/ExperienceControls.jsx";
import {resolveExperiencePresentation} from "/src/utils/experiencePresentation.js";
const h=React.createElement;window.qaCalls=[];
function Fixture(){const[tier,setTier]=useState('free');const[persona,setPersona]=useState('collector');const[tools,setTools]=useState({});const[preview,setPreview]=useState(false);
 window.qaPreview=setPreview;
 return h('main',{className:'app', 'data-theme':new URLSearchParams(location.search).get('theme'),style:{padding:'16px',minHeight:'100dvh'}},
 h(AdminPlanPreviewControls,{tier,persona,onTierChange:value=>{window.qaCalls.push(['tier',value]);setTier(value);},onPersonaChange:value=>{window.qaCalls.push(['persona',value]);setPersona(value);},onViewPlans:()=>window.qaCalls.push(['plans'])}),
 h('div',{style:{height:'20px'}}),h(ExperiencePreferences,{experience:resolveExperiencePresentation({personaPreference:persona}),optionalTools:tools,previewActive:preview,onPersonaChange:value=>{window.qaCalls.push(['preference',value]);setPersona(value);},onOptionalToolChange:(key,value)=>{window.qaCalls.push(['optional',key,value]);setTools(current=>({...current,[key]:value}));}}));}
createRoot(document.getElementById('root')).render(h(Fixture));
</script></body></html>`);
const fixtureUrl = `${base}/${path.relative(process.cwd(), fixture).replaceAll(path.sep, "/")}`;
const cases = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }].flatMap(viewport => ["light", "dark"].map(theme => ({ ...viewport, theme })));
const results = [];

async function bundleFixture() {
  const entry = fs.readFileSync(fixture, "utf8").split('<script type="module">')[1].split("</script>")[0].replaceAll('"/src/', '"./src/');
  await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "jsx" }, bundle: true, jsx: "automatic", format: "esm", outfile: path.join(output, "fixture.js"), external: ["/assets/*"] });
  fs.writeFileSync(fixture, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/__qa/experience-fixture.css"></head><body><div id="root"></div><script type="module" src="/__qa/experience-fixture.js"></script></body></html>');
}

async function isolatedContext(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const networkWrites = [];
  await context.route("**/*", route => {
    const request = route.request(); const url = new URL(request.url());
    if (request.method() !== "GET") { networkWrites.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    if (url.origin !== base) return route.abort();
    if (url.pathname === new URL(fixtureUrl).pathname) return route.fulfill({ contentType: "text/html", body: fs.readFileSync(fixture) });
    if (url.pathname === "/__qa/experience-fixture.js") return route.fulfill({ contentType: "text/javascript", body: fs.readFileSync(path.join(output, "fixture.js")) });
    if (url.pathname === "/__qa/experience-fixture.css") return route.fulfill({ contentType: "text/css", body: fs.readFileSync(path.join(output, "fixture.css")) });
    if (url.pathname === "/assets/fonts/SpaceGrotesk-Variable.ttf") return route.fulfill({ contentType: "font/ttf", body: fs.readFileSync(path.resolve("public/assets/fonts/SpaceGrotesk-Variable.ttf")) });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
    return route.continue();
  });
  return { context, networkWrites };
}

async function checkLayout(page, scope) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "No horizontal page overflow");
  const boxes = await scope.locator("select, button, label.experience-preferences__persona, label.experience-preferences__optional-tool").evaluateAll(elements => elements.map(element => ({ text: element.textContent, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
  assert.ok(boxes.length > 0);
  for (const box of boxes) assert.ok(box.width >= 44 && box.height >= 44, `${box.text} has a usable touch target`);
  return boxes.length;
}

async function fixtureChecks(browser) {
  for (const item of cases) {
    const { context, networkWrites } = await isolatedContext(browser, item);
    const page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto(`${fixtureUrl}?theme=${item.theme}`);
      const preferences = page.getByRole("region", { name: "Make it yours" });
      await expect(preferences).toBeVisible();
      await expect(preferences.getByRole("radio", { name: /^Collector/ })).toBeChecked();
      for (const checkbox of await preferences.getByRole("checkbox").all()) await expect(checkbox).not.toBeChecked();
      const targets = await checkLayout(page, page.locator("main"));
      await preferences.getByRole("radio", { name: /^Seller/ }).check();
      await preferences.getByRole("checkbox", { name: /^Community/ }).check();
      await page.getByRole("combobox", { name: "Preview plan", exact: true }).selectOption("shop");
      await page.getByRole("combobox", { name: "Preview experience", exact: true }).selectOption("store");
      await expect(page.getByText("Shop Basic and Shop Plus currently share the existing Shop features.", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Compare plans", exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.qaCalls), [["preference", "seller"], ["optional", "community", true], ["tier", "shop"], ["persona", "store"], ["plans"]]);
      await page.getByRole("combobox", { name: "Preview plan", exact: true }).focus();
      await page.keyboard.press("Tab");
      const focus = await page.getByRole("combobox", { name: "Preview experience", exact: true }).evaluate(element => ({ active: document.activeElement === element, outline: getComputedStyle(element).outlineStyle, width: parseFloat(getComputedStyle(element).outlineWidth) }));
      assert.equal(focus.active, true); assert.notEqual(focus.outline, "none"); assert.ok(focus.width >= 2);
      await page.evaluate(() => window.qaPreview(true));
      await expect(preferences.getByRole("status")).toContainText("Use the preview controls above");
      for (const input of await preferences.locator("input").all()) await expect(input).toBeDisabled();
      assert.equal(await page.evaluate(() => window.qaCalls.length), 5);
      await checkLayout(page, page.locator("main"));
      await page.screenshot({ path: path.join(output, `${item.width}-${item.theme}-controls.png`), fullPage: true });
      assert.deepEqual(networkWrites, []); assert.deepEqual(errors, []);
      results.push({ kind: "components", ...item, targets, disabledPreferences: true, keyboardFocus: true, callbacksOnly: true, errors });
      console.log(`PASS controls ${item.width}-${item.theme}`);
    } catch (error) { await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); throw error; }
    finally { await context.close(); }
  }
}

async function seedApp(context, { theme, admin = false, family = false }) {
  await context.addInitScript(({ theme, admin, family }) => {
    if (localStorage.getItem("__qa_experience_seeded")) return;
    localStorage.setItem("__qa_experience_seeded", "true");
    localStorage.setItem("et-tcg-app-theme", theme);
    localStorage.setItem("et-tcg-admin-mode:local-beta", JSON.stringify({ viewMode: "regular", editMode: false }));
    if (family) localStorage.setItem("et-tcg-beta-readiness", JSON.stringify({ onboarding: { completedAt: "2026-10-17T12:00:00Z", smartSetup: { primaryMode: "collector_parent", purposes: ["collect_pokemon_with_my_family_kids"] } } }));
    localStorage.setItem("et-tcg-beta-data", JSON.stringify({
      userType: "collector", dashboardPreset: "simple", appThemeChoice: theme,
      profile: { userId: "local-beta", email: "qa-experience@example.test", displayName: "Synthetic account", appRole: admin ? "owner" : "user", app_role: admin ? "owner" : "user", userRole: admin ? "owner" : "user", appAccess: "approved" },
      subscriptionProfile: { tier: admin ? "admin" : "seller", featureTier: admin ? "admin" : "seller", subscriptionPlan: admin ? "admin" : "seller", appRole: admin ? "owner" : "user", app_role: admin ? "owner" : "user", isAdmin: admin, lifetimeAccess: admin, subscriptionStatus: "active" },
      appSetupPersonalization: { experiencePersona: "collector", optionalTools: { community: false, family: false, assistant: false }, pagePreferences: {
        hearth: { visibleKeys: ["scoutSignals", "vaultSnapshot", "marketWatch", "forgeSummary"], updatedAt: "2026-10-17T12:00:00Z" },
        quickAdd: { visibleKeys: ["addSale", "uploadReceipt", "reviewFlaggedReports", "addScoutReport", "addVaultItem"], updatedAt: "2026-10-17T12:00:00Z" },
      } },
      items: [{ id: "qa-preserved-card", name: "Synthetic preserved card", quantity: 2, marketValue: 31.75 }],
      sales: [{ id: "qa-preserved-sale", productName: "Synthetic completed sale", quantity: 1, salePrice: 24.50, date: "2026-10-17" }],
      expenses: [{ id: "qa-preserved-expense", vendor: "Synthetic supplies", amount: 7.25, category: "Supplies", date: "2026-10-17" }],
    }));
  }, { theme, admin, family });
}

async function appSnapshot(page) {
  return page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("et-tcg-beta-data"));
    return { records: JSON.stringify([data.items, data.sales, data.expenses]), subscription: JSON.stringify(data.subscriptionProfile), role: data.profile?.appRole, preferences: JSON.stringify(data.appSetupPersonalization) };
  });
}

async function openAppPreferences(page) {
  await expect(page.locator(".settings-layout")).toBeVisible();
  const preferences = page.getByRole("region", { name: "Make it yours" });
  if (!await preferences.isVisible()) {
    await page.locator("summary").filter({ hasText: "Appearance & preferences" }).click();
  }
  await expect(preferences).toBeVisible();
  return preferences;
}

async function adminAppChecks(browser, item) {
  const { context, networkWrites } = await isolatedContext(browser, item); await seedApp(context, { ...item, admin: true });
  const page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`${base}/?betaLocalMode=true`);
    const control = page.getByRole("region", { name: "Admin display controls" });
    await expect(control.getByRole("combobox", { name: "Preview plan", exact: true })).toBeVisible({ timeout: 30000 });
    await expect(page.locator("[data-home-card='vaultSnapshot']")).toBeVisible();
    const before = await appSnapshot(page);
    assert.equal(before.role, "owner");
    assert.ok(JSON.parse(before.preferences).pagePreferences.quickAdd.visibleKeys.includes("reviewFlaggedReports"), "Opening Regular preview retains the admin's saved Add layout");
    for (const id of ["qa-preserved-card", "qa-preserved-sale", "qa-preserved-expense"]) assert.ok(before.records.includes(id), `${id} exists before preview`);
    const tiers = [["free", "Free", "collector", 1], ["collector", "Collector", "collector", 3], ["family", "Family", "collector", 3], ["seller", "Seller", "seller", 3], ["shop", "Shop", "store", 1]];
    for (const [tier, label, persona, storeSlots] of tiers) {
      await control.getByRole("combobox", { name: "Preview plan", exact: true }).selectOption(tier);
      await expect(control.getByRole("combobox", { name: "Preview experience", exact: true })).toHaveValue(persona);
      await expect(control.getByRole("button", { name: "On", exact: true })).toBeDisabled();
      await expect(page.locator(".admin-edit-mode-banner")).toHaveCount(0);
      if (persona === "collector") await expect(page.locator("[data-home-card='forgeSummary']")).toHaveCount(0);
      else await expect(page.locator("[data-home-card='forgeSummary']")).toContainText(persona === "store" ? "Your store records" : "Your selling records");
      await control.getByRole("button", { name: "Compare plans", exact: true }).click();
      const membership = page.locator(".membership-v4-route");
      await expect(membership).toBeVisible();
      await expect(membership.locator(".command-board-v4-rail a[href^='/business']")).toHaveCount(persona === "collector" ? 0 : 1);
      await expect(membership.locator(".command-board-v4-mobile-dock a[href^='/business']")).toHaveCount(persona === "collector" ? 0 : 1);
      await expect(membership.locator(".command-board-v4-route-strip [data-command-key='spark']")).toHaveCount(tier === "family" ? 1 : 0);
      await expect(membership.locator(".command-board-v4-guard b")).toHaveText(tier === "family" ? "Family guard" : "Privacy & safety");
      if (persona === "store") await expect(membership.locator(".command-board-v4-rail a[href^='/business']")).toHaveText("Store");
      const barBox = await control.boundingBox(); const mainBox = await page.locator("main.main").boundingBox();
      assert.ok(barBox.y + barBox.height <= mainBox.y + 1, "Plan preview controls remain above the complete membership page");
      const sidebar = page.locator(".ops-desktop-sidebar");
      if (await sidebar.isVisible()) {
        const sidebarBox = await sidebar.boundingBox();
        assert.ok(barBox.x >= sidebarBox.x + sidebarBox.width, "Fixed desktop sidebar does not cover preview controls");
      }
      if (process.env.QA_LAYOUT_INSPECT === "1") {
        await page.evaluate(() => window.scrollTo(0, 0));
        const layout = await page.evaluate(() => [".app", ".admin-mode-control-bar", ".admin-mode-control-summary", ".admin-mode-controls", ".experience-preview-controls", "main.main", ".membership-v4-route"].map(selector => {
          const element = document.querySelector(selector); if (!element) return { selector, missing: true };
          const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
          return { selector, top: rect.top, bottom: rect.bottom, height: rect.height, display: style.display, position: style.position, gridRow: style.gridRow, alignItems: style.alignItems, flexDirection: style.flexDirection, order: style.order };
        }));
        fs.writeFileSync(path.join(output, `${item.width}-${item.theme}-admin-layout.json`), JSON.stringify(layout, null, 2));
        console.log(JSON.stringify({ viewport: item, layout }));
        await page.screenshot({ path: path.join(output, `${item.width}-${item.theme}-admin-top.png`) });
        return;
      }
      await expect(membership.locator(`.membership-v4-plan-card[data-tier-plan='${tier}']`)).toHaveClass(/current/);
      await expect(membership.locator(".membership-v4-status")).toContainText(`Preview plan: ${label}`);
      const metrics = membership.locator(".membership-v4-status-grid");
      await expect(metrics).toContainText("Protected");
      const values = await metrics.locator("strong").allTextContents();
      assert.ok(values.includes(String(storeSlots)), `${label} preview uses ${storeSlots} watched stores, not inherited admin limits`);
      assert.equal(values.includes("999"), false);
      await expect(membership.getByText("Visible for this session", { exact: true })).toHaveCount(0);
      if (tier === "free") {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: path.join(output, `${item.width}-${item.theme}-admin-top.png`) });
      }
      await page.screenshot({ path: path.join(output, `${item.width}-${item.theme}-${tier}-preview.png`), fullPage: true });
      await membership.getByRole("button", { name: /Back to (Home|Hearth)/ }).click();
      await expect(page.locator("[data-home-card='vaultSnapshot']")).toBeVisible();
    }
    await page.getByRole("button", { name: "Customize", exact: true }).click();
    const preferences = await openAppPreferences(page);
    for (const input of await preferences.locator("input").all()) await expect(input).toBeDisabled();
    assert.deepEqual(await appSnapshot(page), before, "Previewing tiers does not change subscriptions, actual role, preferences, or records");
    await checkLayout(page, control);
    await control.getByRole("button", { name: "Admin", exact: true }).click();
    await expect(control.getByRole("combobox", { name: "Preview plan", exact: true })).toHaveCount(0);
    await expect(preferences.getByRole("radio", { name: /^Collector/ })).toBeChecked();
    await expect(preferences.getByRole("radio", { name: /^Collector/ })).toBeEnabled();
    assert.deepEqual(await appSnapshot(page), before, "Exiting preview restores actual account without writes");
    assert.deepEqual(networkWrites, []); assert.deepEqual(errors, []);
    results.push({ kind: "actual-admin-app", ...item, publicTiers: 5, noInheritedAdminLimits: true, previewPreferencesDisabled: true, savedDataUnchanged: true, networkWrites, errors });
    console.log(`PASS actual admin App ${item.width}-${item.theme}: five tiers, preserved data, restored preferences`);
  } catch (error) { await page.screenshot({ path: path.join(output, "failure-actual-admin.png"), fullPage: true }); throw error; }
  finally { await context.close(); }
}

async function collectorAppChecks(browser) {
  const item = { width: 390, height: 844, theme: "dark" };
  const { context, networkWrites } = await isolatedContext(browser, item); await seedApp(context, item);
  const page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`${base}/?betaLocalMode=true`);
    await expect(page.locator("[data-home-card='vaultSnapshot']")).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("region", { name: "Admin display controls" })).toHaveCount(0);
    await expect(page.locator("[data-home-card='forgeSummary']")).toHaveCount(0);
    const before = await appSnapshot(page);
    const originalLayout = JSON.parse(before.preferences).pagePreferences;
    assert.ok(originalLayout.quickAdd.visibleKeys.includes("addSale"), "Collector presentation keeps hidden saved layout choices in storage");
    await page.getByRole("button", { name: "Open profile and menu", exact: true }).click();
    const menu = page.locator(".code3-menu-drawer[role='dialog']");
    await expect(menu).toBeVisible();
    await expect(menu.locator("[data-menu-shortcut]").first()).toHaveAttribute("data-menu-shortcut", "scout");
    await menu.locator(".menu-workspace-toggle").click();
    assert.deepEqual(await menu.locator("[data-menu-workspace]").evaluateAll(elements => elements.map(element => element.dataset.menuWorkspace)), ["COLLECT", "FIND"], "Ordinary collector menu has only the collecting and finding workspaces");
    await expect(menu.locator("[data-menu-key='exchange']")).toHaveAttribute("aria-label", /^Sell or trade\./);
    await expect(menu.locator("[data-menu-key='owner-center'], [data-menu-key='account-ops'], [data-menu-key='admin'], [data-menu-workspace='BOT']")).toHaveCount(0);
    await menu.getByRole("button", { name: "Close menu", exact: true }).click();
    assert.deepEqual(await appSnapshot(page), before, "Opening the ordinary menu changes no records, account, or saved preferences");
    await page.getByRole("button", { name: "Sell or trade", exact: true }).click();
    await expect(page).toHaveURL(/\/exchange(?:\/|\?|$)/);
    const exchangeUrl = page.url();
    await page.getByRole("button", { name: "Check market prices", exact: true }).click();
    await expect(page).toHaveURL(/\/exchange\/market(?:\/|\?|$)/);
    await page.goBack();
    await expect(page).toHaveURL(exchangeUrl);
    await expect(page.getByRole("button", { name: "Check market prices", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.locator("[data-home-card='vaultSnapshot']")).toBeVisible();
    await expect(page.locator("[data-home-card='forgeSummary']")).toHaveCount(0);
    assert.equal((await appSnapshot(page)).preferences, before.preferences, "One occasional sale/trade visit does not switch persona");
    await page.getByRole("button", { name: "Customize", exact: true }).click();
    const preferences = await openAppPreferences(page);
    await expect(preferences.getByRole("radio", { name: /^Collector/ })).toBeChecked();
    for (const checkbox of await preferences.getByRole("checkbox").all()) await expect(checkbox).not.toBeChecked();
    await preferences.getByRole("radio", { name: /^Store/ }).check();
    await preferences.getByRole("checkbox", { name: /^Community/ }).check();
    await expect.poll(async () => JSON.parse((await appSnapshot(page)).preferences).experiencePersona).toBe("store");
    await page.reload(); await openAppPreferences(page);
    await expect(preferences.getByRole("radio", { name: /^Store/ })).toBeChecked();
    await expect(preferences.getByRole("checkbox", { name: /^Community/ })).toBeChecked();
    await preferences.getByRole("radio", { name: /^Collector/ }).check();
    await preferences.getByRole("checkbox", { name: /^Community/ }).uncheck();
    await checkLayout(page, preferences);
    await page.screenshot({ path: path.join(output, "390-dark-actual-preferences.png"), fullPage: true });
    const after = await appSnapshot(page);
    assert.equal(after.records, before.records); assert.equal(after.subscription, before.subscription); assert.equal(after.role, before.role);
    for (const pageKey of ["hearth", "quickAdd"]) {
      assert.deepEqual(JSON.parse(after.preferences).pagePreferences[pageKey], originalLayout[pageKey], "Changing persona and returning preserves custom page layouts");
    }
    assert.deepEqual(networkWrites, []); assert.deepEqual(errors, []);
    results.push({ kind: "actual-collector-app", ...item, ordinaryMenuScoped: true, nestedBackPreserved: true, tierAloneDoesNotPromote: true, occasionalSellingDoesNotPromote: true, explicitPreferencesPersist: true, savedDataUnchanged: true, networkWrites, errors });
    console.log("PASS actual collector App: scoped menu, nested Back, explicit preferences persist; occasional selling leaves collector unchanged");
  } catch (error) { await page.screenshot({ path: path.join(output, "failure-actual-collector.png"), fullPage: true }); throw error; }
  finally { await context.close(); }
}

async function familyPreferenceChecks(browser) {
  const item = { width: 390, height: 844, theme: "light" };
  const { context, networkWrites } = await isolatedContext(browser, item); await seedApp(context, { ...item, family: true });
  const page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`${base}/settings?betaLocalMode=true`);
    const preferences = await openAppPreferences(page);
    const family = preferences.getByRole("checkbox", { name: /^Family tools/ });
    await expect(family).toBeChecked();
    const before = await appSnapshot(page);
    await family.uncheck();
    await expect(family).not.toBeChecked();
    await expect.poll(async () => JSON.parse((await appSnapshot(page)).preferences).optionalToolsCustomized).toContain("family");
    await page.reload(); await openAppPreferences(page);
    await expect(family).not.toBeChecked();
    await family.check(); await expect(family).toBeChecked();
    const after = await appSnapshot(page);
    assert.equal(after.records, before.records); assert.equal(after.subscription, before.subscription);
    assert.deepEqual(networkWrites, []); assert.deepEqual(errors, []);
    results.push({ kind: "actual-legacy-family", ...item, inheritedFamilyChecked: true, explicitOffPersists: true, reenableWorks: true, savedDataUnchanged: true });
    console.log("PASS actual legacy family settings: effective toggle matches display and explicit off survives reload");
  } catch (error) { await page.screenshot({ path: path.join(output, "failure-actual-family.png"), fullPage: true }); throw error; }
  finally { await context.close(); }
}

(async () => {
  await bundleFixture();
  const browser = await chromium.launch({ headless: true });
  try {
    if (process.env.QA_ACTUAL_ONLY !== "1") await fixtureChecks(browser);
    if (process.env.QA_FIXTURE_ONLY !== "1") {
      const selected = (process.env.QA_APP_CASES || "admin,collector,family").split(",");
      if (selected.includes("admin")) {
        await adminAppChecks(browser, { width: 320, height: 568, theme: "dark" });
        await adminAppChecks(browser, { width: 1440, height: 900, theme: "light" });
      }
      if (selected.includes("collector")) await collectorAppChecks(browser);
      if (selected.includes("family")) await familyPreferenceChecks(browser);
    }
    if (process.env.QA_LAYOUT_INSPECT !== "1") fs.writeFileSync(path.join(output, process.env.QA_FIXTURE_ONLY === "1" ? "component-results.json" : "results.json"), JSON.stringify({ passed: results.length, results }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
