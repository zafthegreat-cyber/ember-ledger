const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium, expect } = require("@playwright/test");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/menu-workspaces");
fs.mkdirSync(output, { recursive: true });
const appUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(appUrl.hostname), "Synthetic menu checks are loopback only");
const base = appUrl.origin;
const requiredDestinationKeys = [
  "profile", "account", "collections", "membership", "privacySafety", "settings",
  "vault", "exchange", "watchList", "quickAdd", "scout", "tidepool", "parentCenter",
  "shopPortal", "announcements", "scanProduct", "publicBetaFeedback", "help", "feedback", "comingSoon",
];
const requestedWidths = process.env.QA_MENU_WIDTHS?.split(",").map(Number);
const viewports = [{ width: 320, height: 568 }, ...[360, 390, 1440].map(width => ({ width, height: 900 }))].filter(viewport => !requestedWidths || requestedWidths.includes(viewport.width));
assert.ok(viewports.length > 0, "At least one supported viewport must be selected");

async function verifyRestrictedNavigation(browser) {
  // Render the real presentation component with an explicitly restricted set.
  // This proves it never manufactures destinations or workspace permissions.
  const fixture = await build({
    stdin: { contents: `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import MenuNavigation from './src/features/deferredViews/MenuNavigation.jsx';
      import {resolveExperiencePresentation} from './src/utils/experiencePresentation.js';
      const Icon=()=> <svg width="19" height="19" aria-hidden="true"><path d="M2 2h12v12H2z" /></svg>;
      const workspaces=[{id:'COLLECT',label:'Collect',icon:'inventory',shortPurpose:'Your cards'}, {id:'FIND',label:'Find',icon:'find',shortPurpose:'Find cards and prices'}];
      const sections=[{key:'account',title:'Account',items:[{key:'settings',label:'Settings',helper:'Preferences and cloud saving'}]}, {key:'collection',title:'Collection',items:[{key:'vault',label:'Collection',helper:'Your saved cards'}]}, {key:'community',title:'Community',items:[{key:'scout',label:'Restocks',helper:'Available cards'}]}];
      window.qaSelections=[];
      const root=createRoot(document.getElementById('root'));
      window.qaRenderExperience=input=>{const experience=resolveExperiencePresentation(input);root.render(<MenuNavigation sections={sections} NavIcon={Icon} isItemActive={()=>false} onSelect={item=>window.qaSelections.push(item.key)} onAdd={()=>window.qaSelections.push('quick-add')} modeLabel={experience.personaLabel} experiencePresentation={experience} workspaces={workspaces} currentWorkspaceId="COLLECT" onSelectWorkspace={workspace=>window.qaSelections.push(workspace.id)} />);};
      window.qaRenderExperience({});
    `, resolveDir: process.cwd(), loader: "jsx" },
    bundle: true, jsx: "automatic", format: "esm", write: false,
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const unexpectedRequests = [];
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.origin === base && route.request().method() === "GET") {
      if (url.pathname === "/__qa/menu-restricted") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__qa/menu-restricted.js"></script></body></html>' });
      if (url.pathname === "/__qa/menu-restricted.js") return route.fulfill({ contentType: "text/javascript", body: fixture.outputFiles[0].text });
    }
    unexpectedRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort();
  });
  try {
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/__qa/menu-restricted`, { waitUntil: "domcontentloaded" });
    const search = page.getByRole("searchbox", { name: "Search menu", exact: true });
    await expect(search).toBeVisible();
    const destinations = await page.locator("[data-menu-key]").evaluateAll(elements => elements.map(element => element.dataset.menuKey).sort());
    assert.deepEqual(destinations, ["scout", "settings", "vault"]);
    assert.deepEqual(await page.locator("[data-menu-shortcut]").evaluateAll(elements => elements.map(element => element.dataset.menuShortcut)), ["scout", "vault"], "Restocks should lead the supplied quick actions");
    await expect(page.locator('[data-menu-section="find"] .menu-section-title')).toHaveText(/^Find & trade/);
    await page.locator(".menu-workspace-toggle").click();
    assert.deepEqual(await page.locator("[data-menu-workspace]").evaluateAll(elements => elements.map(element => element.dataset.menuWorkspace)), ["COLLECT", "FIND"]);
    await expect(page.locator('[data-menu-workspace="COLLECT"]').getByText("Current workspace", { exact: true })).toBeVisible();
    await expect(page.locator('[data-menu-workspace][aria-current="page"]')).toHaveCount(0);
    await search.fill("workspace");
    assert.deepEqual(await page.locator("[data-menu-workspace]").evaluateAll(elements => elements.map(element => element.dataset.menuWorkspace)), ["COLLECT", "FIND"]);
    for (const unavailable of ["Bot", "Business", "Sell"]) {
      await search.fill(unavailable);
      await expect(page.locator("[data-menu-workspace]")).toHaveCount(0);
      if (unavailable !== "Sell") await expect(page.getByText("No matching pages", { exact: true })).toBeVisible();
    }
    await search.fill("scanning");
    await expect(page.locator('[data-menu-key="vault"]')).toBeVisible();
    await expect(page.locator("[data-menu-key]")).toHaveCount(1);
    await page.keyboard.press("Escape"); await expect(search).toHaveValue(""); await expect(search).toBeFocused();
    await search.fill("Find & trade");
    await expect(page.locator('[data-menu-key="scout"]')).toBeVisible();
    await expect(page.locator("[data-menu-key]")).toHaveCount(1);
    await page.keyboard.press("Escape"); await expect(search).toHaveValue("");
    await search.fill("Find"); await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-menu-workspace="FIND"]')).toBeFocused();
    await page.keyboard.press("Enter");
    assert.deepEqual(await page.evaluate(() => window.qaSelections), ["FIND"]);
    for (const tier of ["free", "collector", "family", "seller", "shop"]) {
      await search.fill("");
      await page.evaluate(tier => window.qaRenderExperience({ canPreview: true, adminVisible: true, ownerVisible: true, preview: { enabled: true, tier } }), tier);
      await expect(page.locator('[data-menu-section="find"] .menu-section-title')).toHaveText(tier === "seller" || tier === "shop" ? /^Find & sell/ : /^Find & trade/);
      assert.deepEqual(await page.locator("[data-menu-key]").evaluateAll(elements => elements.map(element => element.dataset.menuKey).sort()), destinations, "Preview wording must preserve supplied destinations");
      for (const query of ["Bot", "Owner Center", "Account Ops", "Admin Command", "Business"]) {
        await search.fill(query);
        await expect(page.locator("[data-menu-workspace], [data-menu-key]")).toHaveCount(0);
      }
    }
    await search.fill("");
    await page.evaluate(() => window.qaRenderExperience({}));
    await expect(page.locator('[data-menu-section="find"] .menu-section-title')).toHaveText(/^Find & trade/);
    assert.deepEqual(await page.evaluate(() => window.qaSelections), ["FIND"], "Changing presentation must not call navigation or data handlers");
    assert.deepEqual(errors, []); assert.deepEqual(unexpectedRequests, []);
    return { actualComponent: true, actualExperienceHelper: true, collectorRestocksFirst: true, publicTierPreviews: 5, previewCannotInventPrivilegedDestinations: true, presentationChangesDoNotNavigate: true, onlyProvidedDestinations: true, onlyProvidedWorkspaces: true, searchCannotExposeRestrictedWorkspaces: true, taskGroupHintsAndLabelsSearchable: true, arrowDownAndEnterResultSelection: true, currentWorkspaceNotCurrentPage: true, callbackPreserved: true, unexpectedRequests: 0 };
  } finally { await context.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  let lastPage;
  let lastStep = "Starting synthetic menu checks";
  try {
    for (const { width, height } of process.env.QA_MENU_FIXTURE_ONLY ? [] : viewports) for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce", serviceWorkers: "block" });
      await context.route("**/*", (route) => {
        const request = route.request(); const url = new URL(request.url());
        if (url.origin !== base || request.method() !== "GET") return route.abort();
        if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: '{"configured":false}' });
        return route.continue();
      });
      await context.addInitScript(({ theme }) => {
        if (!localStorage.getItem("__qa_menu_seeded")) {
          localStorage.setItem("__qa_menu_seeded", "true");
          localStorage.setItem("et-tcg-app-theme", theme);
          localStorage.setItem("et-tcg-beta-data", JSON.stringify({ items: [{ id: "qa-original-card", name: "Synthetic preserved card", quantity: 2 }], sales: [], expenses: [] }));
        }
      }, { theme });
      const page = await context.newPage(); const errors = [];
      lastPage = page;
      lastStep = `${width} ${theme}: load home and check menu presentation`;
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(`${base}/?betaLocalMode=true`);
      await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible({ timeout: 30000 });
      const existingWorkspaceLabels = await page.getByTestId("workspace-switcher").locator(".code3-workspace-switcher__menu button strong").allTextContents();
      const snapshot = () => page.evaluate(() => { const data = JSON.parse(localStorage.getItem("et-tcg-beta-data")); return JSON.stringify([data.items, data.sales, data.expenses]); });
      const before = await snapshot();
      const opener = page.getByRole("button", { name: "Open profile and menu", exact: true });
      // Desktop uses the existing sidebar, so open the real mobile entry point
      // before checking that the drawer survives a responsive desktop resize.
      const open = async () => { if (width > 520) await page.setViewportSize({ width: 390, height }); await opener.click(); await expect(page.getByRole("dialog", { name: "Menu", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Close menu", exact: true })).toBeFocused(); if (width > 520) await page.setViewportSize({ width, height }); };
      await open();
      const drawer = page.getByRole("dialog", { name: "Menu", exact: true });
      const search = drawer.getByRole("searchbox", { name: "Search menu", exact: true });
      const scrollArea = drawer.locator(".drawer-menu-stack");
      const destinationKeys = async () => [...new Set(await drawer.locator("[data-menu-key]").evaluateAll(rows => rows.map(row => row.dataset.menuKey)))].sort();
      const originalKeys = await destinationKeys();
      for (const key of requiredDestinationKeys) assert.ok(originalKeys.includes(key), `Original destination ${key} remains available`);
      await expect(search).toBeVisible();
      for (const key of ["vault", "scanProduct", "scout", "watchList"]) await expect(drawer.locator(`[data-menu-shortcut="${key}"]`)).toBeInViewport({ ratio: 1 });
      const shortcuts = await drawer.locator("[data-menu-shortcut]").evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, width: rect.width, height: rect.height };
      }));
      assert.equal(shortcuts.length, 4, "Four familiar quick actions remain available");
      assert.ok(shortcuts.every(shortcut => shortcut.width >= 44 && shortcut.height >= 44), "Compact shortcuts retain usable touch targets");
      assert.ok(Math.max(...shortcuts.map(shortcut => shortcut.top)) - Math.min(...shortcuts.map(shortcut => shortcut.top)) < 1, "Quick actions use one compact row");
      assert.equal(await scrollArea.evaluate(element => element.scrollTop), 0, "Quick access requires no scrolling");
      await page.screenshot({ path: path.join(output, `${width}-${theme}-menu-top.png`) });

      lastStep = `${width} ${theme}: workspace disclosure and permission-filtered choices`;
      const workspaceToggle = drawer.locator(".menu-workspace-toggle");
      const workspaceOptions = drawer.locator(".menu-workspace-options");
      await expect(workspaceToggle).toHaveAttribute("aria-expanded", "false");
      await expect(workspaceOptions).toBeHidden();
      const pathBeforeDisclosure = page.url();
      await workspaceToggle.click();
      await expect(workspaceToggle).toHaveAttribute("aria-expanded", "true");
      await expect(workspaceOptions).toBeVisible();
      assert.equal(page.url(), pathBeforeDisclosure, "Expanding workspace choices does not navigate");
      const permittedWorkspaces = await workspaceOptions.locator("[data-menu-workspace]").evaluateAll(elements => elements.map(element => element.dataset.menuWorkspace));
      assert.deepEqual(permittedWorkspaces.slice().sort(), existingWorkspaceLabels.map(label => label.toUpperCase()).sort(), "Menu retains exactly the workspaces allowed by the existing switcher");
      await expect(workspaceOptions.getByText("Current workspace", { exact: true })).toHaveCount(1);
      await expect(workspaceOptions.locator('[aria-current="page"]')).toHaveCount(0);
      await page.screenshot({ path: path.join(output, `${width}-${theme}-menu-workspaces.png`) });
      await workspaceToggle.click();
      await expect(workspaceToggle).toHaveAttribute("aria-expanded", "false");
      assert.equal(page.url(), pathBeforeDisclosure);

      lastStep = `${width} ${theme}: task groups, layout, and keyboard focus`;
      const firstSection = drawer.locator("[data-menu-section]").first();
      const firstToggle = firstSection.locator(".menu-section-toggle");
      const initiallyExpanded = await firstToggle.getAttribute("aria-expanded") === "true";
      await firstToggle.click();
      await expect(firstToggle).toHaveAttribute("aria-expanded", String(!initiallyExpanded));
      if (!initiallyExpanded) await page.screenshot({ path: path.join(output, `${width}-${theme}-menu-expanded.png`) });
      await firstToggle.click();
      await expect(firstToggle).toHaveAttribute("aria-expanded", String(initiallyExpanded));
      for (const toggle of await drawer.locator(".menu-section-toggle").all()) {
        if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
      }
      const layout = await drawer.evaluate(element => {
        const box = element.getBoundingClientRect();
        const rows = [...element.querySelectorAll(".menu-command-link")].map(row => {
          const label = row.querySelector("strong").getBoundingClientRect();
          const helper = row.querySelector("small").getBoundingClientRect();
          return { height: row.getBoundingClientRect().height, separateLines: helper.top >= label.bottom + 1, icon: row.querySelector(".menu-command-icon svg").getBoundingClientRect().width };
        });
        return { position: getComputedStyle(element).position, x: box.x, right: box.right, height: box.height, viewport: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth || element.scrollWidth > element.clientWidth, rows, locked: document.body.style.overflow === "hidden" };
      });
      assert.equal(layout.position, "fixed"); assert.equal(layout.overflow, false); assert.ok(layout.x >= 0 && layout.right <= width + 1 && layout.height <= height);
      assert.equal(layout.locked, true); assert.ok(layout.rows.length >= 15);
      assert.ok(layout.rows.every(row => row.separateLines && row.height >= 44 && row.height < 140 && row.icon <= 20));
      await drawer.getByRole("button", { name: "Close menu", exact: true }).focus();
      await page.keyboard.press("Shift+Tab"); await expect(drawer.locator(".drawer-footer-card button").last()).toBeFocused();
      await page.keyboard.press("Tab"); await expect(drawer.getByRole("button", { name: "Close menu" })).toBeFocused();
      await scrollArea.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await expect(drawer.locator("[data-menu-section]").last()).toBeInViewport();
      await expect(drawer.getByRole("button", { name: "Close menu" })).toBeInViewport();
      await expect(search).toBeInViewport({ ratio: 1 });
      await expect(drawer.locator(".drawer-footer-card")).toBeInViewport();
      await page.screenshot({ path: path.join(output, `${width}-${theme}-menu-bottom.png`) });

      await search.fill("cloud");
      await expect(drawer.locator('[data-menu-key="settings"]')).toBeVisible();
      const cloudMatches = await destinationKeys();
      assert.ok(cloudMatches.includes("settings"), "Cloud saving can be found through Settings keywords");
      await search.fill("   ClOuD    SAVING   ");
      assert.deepEqual(await destinationKeys(), cloudMatches, "Search ignores case and repeated whitespace");
      await page.screenshot({ path: path.join(output, `${width}-${theme}-menu-search.png`) });
      await search.fill("qa-no-such-destination-92841");
      await expect(drawer.getByText("No matching pages", { exact: true })).toBeVisible();
      await expect(drawer.locator("[data-menu-key]")).toHaveCount(0);
      await drawer.getByRole("button", { name: "Clear search", exact: true }).click();
      await expect(search).toHaveValue(""); await expect(search).toBeFocused();
      assert.deepEqual(await destinationKeys(), originalKeys, "Clearing search restores every authorized destination");
      await search.fill("alerts");
      await drawer.getByRole("button", { name: "Clear menu search", exact: true }).click();
      await expect(search).toHaveValue(""); await expect(search).toBeFocused();
      await search.fill("workspace");
      await expect(drawer.getByRole("heading", { name: "Workspaces", exact: true })).toBeVisible();
      assert.deepEqual((await drawer.locator("[data-menu-workspace]").evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => element.dataset.menuWorkspace))).sort(), permittedWorkspaces.slice().sort(), "Search includes only the permitted workspaces");
      await search.fill("Find");
      const workspaceResult = drawer.locator('[data-menu-workspace="FIND"]');
      await expect(workspaceResult).toBeVisible();
      const resultColors = await workspaceResult.evaluate(element => {
        const colorFor = token => {
          const probe = document.createElement("span"); probe.style.color = `var(${token})`; element.append(probe);
          const value = getComputedStyle(probe).color; probe.remove(); return value;
        };
        return { background: getComputedStyle(element).backgroundColor, title: getComputedStyle(element.querySelector("strong")).color, helper: getComputedStyle(element.querySelector("small")).color, primary: colorFor("--text-primary"), secondary: colorFor("--text-secondary") };
      });
      assert.equal(resultColors.background, "rgba(0, 0, 0, 0)", "Workspace search results stay neutral rather than inheriting generic primary-button styling");
      assert.equal(resultColors.title, resultColors.primary, "Workspace result titles use readable primary text");
      assert.equal(resultColors.helper, resultColors.secondary, "Workspace result descriptions use readable secondary text");
      await page.screenshot({ path: path.join(output, `${width}-${theme}-menu-workspace-search.png`) });
      await page.keyboard.press("Escape");
      await expect(search).toHaveValue(""); await expect(search).toBeFocused();
      await expect(drawer).toBeVisible();
      await expect(workspaceToggle).toHaveAttribute("aria-expanded", "false");
      assert.deepEqual(await destinationKeys(), originalKeys, "Escape clears search without losing destinations or dismissing the menu");
      await page.keyboard.press("Escape"); await expect(drawer).toHaveCount(0); if (width <= 520) await expect(opener).toBeFocused();
      assert.notEqual(await page.evaluate(() => document.body.style.overflow), "hidden");
      await open(); await drawer.getByRole("button", { name: "Close menu", exact: true }).click(); await expect(drawer).toHaveCount(0);
      if (width <= 520) await expect(opener).toBeFocused();
      if (width > 520) { await open(); await page.locator(".code3-menu-backdrop").click({ position: { x: 20, y: 200 } }); await expect(drawer).toHaveCount(0); }
      await open(); await drawer.locator(".drawer-footer-card").getByRole("button", { name: /Settings/ }).click(); await page.waitForURL(/\/settings/); await expect(drawer).toHaveCount(0);
      await open(); await expect(drawer.locator('[data-menu-key="settings"]')).toHaveAttribute("aria-current", "page");
      await expect(drawer.locator('[data-menu-key="settings"]').locator("xpath=ancestor::section[@data-menu-section][1]").locator(".menu-section-toggle")).toHaveAttribute("aria-expanded", "true");
      await workspaceToggle.click();
      await expect(workspaceOptions.getByText("Current workspace", { exact: true })).toHaveCount(1);
      await expect(workspaceOptions.locator('[aria-current="page"]')).toHaveCount(0);
      await workspaceToggle.click();
      assert.deepEqual(await destinationKeys(), originalKeys);
      await page.screenshot({ path: path.join(output, `${width}-${theme}-menu-active.png`) });
      await page.keyboard.press("Escape"); await page.goBack(); await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible();

      lastStep = `${width} ${theme}: Find workspace navigation and Back`;
      const previousWorkspacePath = new URL(page.url()).pathname;
      await open(); await workspaceToggle.click();
      await workspaceOptions.locator('[data-menu-workspace="FIND"]').click();
      await page.waitForURL(/\/find\/home(?:\?|$)/); await expect(drawer).toHaveCount(0);
      await open(); await workspaceToggle.click();
      await expect(workspaceOptions.locator('[data-menu-workspace="FIND"]').getByText("Current workspace", { exact: true })).toBeVisible();
      await expect(workspaceOptions.locator('[aria-current="page"]')).toHaveCount(0);
      await page.keyboard.press("Escape"); await page.goBack();
      await expect.poll(() => new URL(page.url()).pathname, { message: "Changing workspace preserves browser Back" }).toBe(previousWorkspacePath);

      for (const { key, route } of [
        { key: "vault", route: /\/collection(?:\/|\?|$)/ },
        { key: "scout", route: /\/find\/restocks(?:\?|$)/ },
        { key: "watchList", route: /\/scout\/calendar(?:\?|$)/ },
        { key: "exchange", route: /\/exchange(?:\/|\?|$)/ },
      ]) {
        lastStep = `${width} ${theme}: navigate ${key}, reopen menu, and check active route and Back`;
        const previousPath = new URL(page.url()).pathname;
        await open();
        if (key === "exchange") {
          const row = drawer.locator(`[data-menu-key="${key}"]`);
          const section = row.locator("xpath=ancestor::section[@data-menu-section][1]");
          const toggle = section.locator(".menu-section-toggle");
          if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
          await row.click();
        } else await drawer.locator(`[data-menu-shortcut="${key}"]`).click();
        await page.waitForURL(route); await expect(drawer).toHaveCount(0);
        if (key === "vault") await expect(page.getByTestId("collection-workspace")).toBeVisible({ timeout: 30000 });
        if (key === "scout") await expect(page.getByRole("heading", { name: "Open restock intelligence", exact: true })).toBeVisible({ timeout: 30000 });
        if (key === "exchange") {
          await expect(page.getByRole("heading", { name: "Exchange decision desk", exact: true })).toBeVisible({ timeout: 30000 });
          await page.screenshot({ path: path.join(output, `${width}-${theme}-sell-research.png`) });
        }
        if (key === "watchList") {
          const alertsHeading = page.getByRole("heading", { name: "Alerts", exact: true });
          await expect(alertsHeading).toBeVisible({ timeout: 30000 });
          if (width <= 520) {
            await expect(opener).toBeVisible(); await expect(opener).toBeInViewport();
            const header = await page.locator(".topbar").boundingBox();
            const heading = await alertsHeading.boundingBox();
            assert.ok(header && heading && heading.y >= header.y + header.height, "Settled Alerts content does not overlap the retained menu header");
          }
          await page.screenshot({ path: path.join(output, `${width}-${theme}-saved-alerts.png`) });
        }
        await open();
        const activeRow = drawer.locator(`[data-menu-key="${key}"]`);
        await expect(activeRow).toHaveAttribute("aria-current", "page");
        await expect(activeRow).toBeVisible();
        await expect(activeRow.locator("xpath=ancestor::section[@data-menu-section][1]").locator(".menu-section-toggle")).toHaveAttribute("aria-expanded", "true");
        if (key !== "exchange") await expect(drawer.locator(`[data-menu-shortcut="${key}"]`)).toHaveAttribute("aria-current", "page");
        await page.keyboard.press("Escape");
        await page.goBack();
        await expect.poll(() => new URL(page.url()).pathname, { message: `${key} preserves browser Back` }).toBe(previousPath);
      }
      await open(); await drawer.locator(".menu-quick-add").click();
      const quickAdd = page.locator('.flow-modal[data-flow="addActionSheet"]');
      await expect(quickAdd).toBeVisible(); await expect(drawer).toHaveCount(0);
      await page.waitForFunction(() => Boolean(document.activeElement?.closest('.flow-modal[data-flow="addActionSheet"]')));
      await page.screenshot({ path: path.join(output, `${width}-${theme}-quick-add.png`) });
      await page.keyboard.press("Escape"); await expect(quickAdd).toHaveCount(0);
      assert.equal(await snapshot(), before); assert.deepEqual(errors, []);
      results.push({ width, height, theme, navigationItems: originalKeys.length, allOriginalDestinations: true, compactQuickAccessWithoutScrolling: true, groupExpansion: true, workspaceDisclosureAndPermissions: true, workspaceSearchAndBack: true, workspaceResultColors: resultColors, searchKeywordsAndEscape: true, fixedLayout: true, separateLabelAndHelper: true, compactTouchRows: true, closeAndFocusTrap: true, pinnedSearchHeaderFooter: true, settingsActiveAndBack: true, collectionRestocksAlertsSellActiveAndBack: true, quickAddHandoff: true, recordsUnchanged: true, errors });
      console.log(`PASS real menu ${width}x${height} ${theme}: ${originalKeys.length} destinations, compact shortcuts, task groups, workspace disclosure, search, Escape, layout, focus, navigation, Back, Quick Add and data preservation.`);
      await context.close();
    }
    lastStep = "Restricted real-component fixture: supplied permissions remain unchanged";
    const restrictedNavigation = await verifyRestrictedNavigation(browser);
    console.log("PASS restricted real menu fixture: only supplied destinations and workspaces appear, including search; no implicit Bot, Business, or Sell access.");
    const reportName = process.env.QA_MENU_FIXTURE_ONLY ? "restricted-results.json" : requestedWidths ? `results-${requestedWidths.join("-")}.json` : "results.json";
    fs.writeFileSync(path.join(output, reportName), JSON.stringify({ createdAt: new Date().toISOString(), realApp: !process.env.QA_MENU_FIXTURE_ONLY, syntheticOnly: true, restrictedNavigation, results }, null, 2));
  } catch (error) {
    console.error(`FAILED ${lastStep}`);
    if (lastPage && !lastPage.isClosed()) {
      await lastPage.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
      fs.writeFileSync(path.join(output, "failure-state.txt"), `${lastStep}\n${lastPage.url()}\n${await lastPage.locator("body").innerText().catch(() => "Body unavailable")}`);
    }
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

