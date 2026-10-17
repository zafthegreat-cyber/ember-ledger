const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const origin = new URL(process.env.APP_URL || "http://127.0.0.1:5217/").origin;
const output = path.resolve(process.env.QA_OUTPUT || "artifacts/qa/mobile-onboarding-2026-09-29");
const appModule = (url) => /\/src\/App\.jsx$|\/assets\/App-[^/]+\.js$/.test(url.pathname);
const entryModule = (url) => /\/src\/main\.jsx$|\/assets\/(?:main|index)-[^/]+\.js$/.test(url.pathname);
const results = [];

async function isolatedContext(browser, theme, width, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 844 }, serviceWorkers: "block", ...options });
  await context.addInitScript(({ theme, origin }) => {
    if (window.location.origin !== origin) return;
    // Every context is synthetic. window.name prevents a reload from re-seeding lost records.
    if (window.name !== "boot-fallback-proof") {
      window.name = "boot-fallback-proof";
      localStorage.setItem("et-tcg-app-theme", theme);
      localStorage.setItem("boot-proof-records", '{"records":["preserve me"]}');
      sessionStorage.setItem("boot-proof-session", "preserve session");
    }
    window.__bootStorageWrites = [];
    for (const method of ["setItem", "removeItem", "clear"]) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        window.__bootStorageWrites.push({ method, key: args[0] });
        return original.apply(this, args);
      };
    }
  }, { theme, origin });
  // Tests must never send an authentication or business-data request.
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin || url.pathname.startsWith("/api/")) return route.abort();
    return route.continue();
  });
  return context;
}

async function fallbackGeometry(page, theme) {
  const geometry = await page.locator(".app-load-fallback").evaluate((element) => {
    const card = element.querySelector(".app-load-fallback-card").getBoundingClientRect();
    const brand = element.querySelector(".app-load-fallback-brand");
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      card: { left: card.left, right: card.right, top: card.top, bottom: card.bottom },
      viewport: { width: innerWidth, height: innerHeight },
      background: getComputedStyle(element).backgroundColor,
      gradient: getComputedStyle(brand).backgroundImage,
      buttons: [...element.querySelectorAll("button, a")].map((button) => ({ height: button.getBoundingClientRect().height, width: button.getBoundingClientRect().width })),
    };
  });
  assert.ok(geometry.overflow <= 1, JSON.stringify(geometry));
  assert.ok(geometry.card.left >= 0 && geometry.card.right <= geometry.viewport.width, JSON.stringify(geometry));
  assert.ok(geometry.card.top >= 0 && geometry.card.bottom <= geometry.viewport.height, JSON.stringify(geometry));
  assert.ok(geometry.buttons.every((button) => button.height >= 44 && button.width >= 44), JSON.stringify(geometry));
  assert.equal(geometry.gradient, "none");
  assert.equal(geometry.background, theme === "dark" ? "rgb(16, 21, 28)" : "rgb(245, 247, 250)");
  return geometry;
}

async function assertStoragePreserved(page, theme) {
  const stored = await page.evaluate(() => ({ theme: localStorage.getItem("et-tcg-app-theme"), records: localStorage.getItem("boot-proof-records"), session: sessionStorage.getItem("boot-proof-session"), writes: window.__bootStorageWrites }));
  assert.deepEqual(stored, { theme, records: '{"records":["preserve me"]}', session: "preserve session", writes: [] });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const theme of ["light", "dark"]) {
      for (const width of [320, 390]) {
        const context = await isolatedContext(browser, theme, width, { reducedMotion: "reduce" });
        const page = await context.newPage();
        const errors = [];
        const apiRequests = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) apiRequests.push(request.method()); });
        let release;
        const hold = new Promise((resolve) => { release = resolve; });
        await page.route(appModule, async (route) => { await hold; await route.abort().catch(() => {}); });
        try {
          await page.clock.install();
          await page.goto(`${origin}/vault`, { waitUntil: "domcontentloaded" });
          const fallback = page.locator(".app-load-fallback[data-boot-theme]");
          await expect(fallback).toBeVisible();
          await expect(fallback).toHaveAttribute("role", "status");
          await expect(page.getByRole("heading", { name: "Loading Code 3 TCG...", exact: true })).toBeVisible();
          await expect(page.getByRole("button", { name: "Refresh app" })).toHaveCount(0);
          const normal = await fallbackGeometry(page, theme);
          await page.screenshot({ path: path.join(output, `boot-${theme}-${width}-loading.png`) });
          await page.clock.fastForward(12001);
          await expect(page.getByRole("heading", { name: "Still loading your workspace" })).toBeVisible();
          const slow = await fallbackGeometry(page, theme);
          assert.equal(await page.locator(".app-load-fallback-progress span").evaluate((element) => getComputedStyle(element).animationName), "none");
          await assertStoragePreserved(page, theme);
          assert.deepEqual(apiRequests, []);
          assert.deepEqual(errors, []);
          await page.getByRole("button", { name: "Refresh app" }).focus();
          assert.equal(await page.getByRole("button", { name: "Refresh app" }).evaluate((element) => getComputedStyle(element).outlineStyle), "solid");
          await page.screenshot({ path: path.join(output, `boot-${theme}-${width}-slow.png`) });

          await Promise.all([page.waitForEvent("domcontentloaded"), page.getByRole("button", { name: "Refresh app" }).click()]);
          await expect(fallback).toBeVisible();
          await expect(page.getByRole("heading", { name: "Loading Code 3 TCG...", exact: true })).toBeVisible();
          await assertStoragePreserved(page, theme);
          await page.clock.fastForward(12001);
          await expect(page.getByRole("button", { name: "Return home" })).toBeVisible();
          await Promise.all([page.waitForURL(`${origin}/`), page.getByRole("button", { name: "Return home" }).click()]);
          await expect(fallback).toBeVisible();
          await assertStoragePreserved(page, theme);
          assert.deepEqual(apiRequests, []);
          results.push({ case: "pending-app-module", theme, width, normal, slow, storagePreservedAcrossRefreshAndHome: true, apiRequests, errors });
        } finally { release(); await context.close(); }
      }
    }

    for (const theme of ["light", "dark"]) {
      const context = await isolatedContext(browser, theme, 390);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const startedAt = Date.now();
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Welcome back!", exact: true })).toBeVisible({ timeout: 60000 });
      await expect(page.locator(".app-load-fallback")).toHaveCount(0);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => localStorage.getItem("et-tcg-app-theme")), theme);
      await page.screenshot({ path: path.join(output, `boot-${theme}-normal-login.png`) });
      results.push({ case: "normal-startup", theme, actualLoginVisible: true, readyMs: Date.now() - startedAt, errors });
      await context.close();
    }

    for (const theme of ["light", "dark"]) {
      const context = await isolatedContext(browser, theme, 390);
      const page = await context.newPage();
      let fail = true;
      await page.route(appModule, (route) => fail ? route.abort() : route.continue());
      await page.goto(origin, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Code 3 TCG may have just updated" })).toBeVisible();
      await expect(page.locator(".app-load-fallback")).toHaveAttribute("role", "alert");
      const geometry = await fallbackGeometry(page, theme);
      await assertStoragePreserved(page, theme);
      await page.screenshot({ path: path.join(output, `boot-${theme}-module-error.png`) });
      fail = false;
      await page.getByRole("button", { name: "Refresh app" }).click();
      await expect(page.getByRole("heading", { name: "Welcome back!", exact: true })).toBeVisible({ timeout: 60000 });
      await expect(page.locator(".app-load-fallback")).toHaveCount(0);
      await page.screenshot({ path: path.join(output, `boot-${theme}-recovered-to-login.png`) });
      results.push({ case: "failed-module-then-refresh", theme, geometry, recoveredToRealLogin: true });
      await context.close();
    }

    const staticContext = await isolatedContext(browser, "dark", 320);
    const staticPage = await staticContext.newPage();
    await staticPage.route(entryModule, (route) => route.abort());
    await staticPage.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(staticPage.getByRole("heading", { name: "Loading Code 3 TCG...", exact: true })).toBeVisible();
    await expect(staticPage.getByRole("button", { name: "Refresh app" })).toBeVisible();
    await assertStoragePreserved(staticPage, "dark");
    results.push({ case: "entry-script-unavailable", geometry: await fallbackGeometry(staticPage, "dark") });
    await staticPage.screenshot({ path: path.join(output, "boot-static-entry-unavailable.png") });
    await staticContext.close();

    const noScriptContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 640 } });
    const noScriptPage = await noScriptContext.newPage();
    await noScriptPage.goto(origin);
    await expect(noScriptPage.getByRole("heading", { name: "Code 3 TCG needs JavaScript" })).toBeVisible();
    await noScriptPage.screenshot({ path: path.join(output, "boot-javascript-disabled.png") });
    results.push({ case: "javascript-disabled", visibleGuidance: true });
    await noScriptContext.close();

    fs.writeFileSync(path.join(output, "boot-results.json"), JSON.stringify({ environment: "Local browser fault injection; not physical phone evidence or a production outage diagnosis", results }, null, 2));
    console.log(`PASS ${results.length} startup/recovery scenarios. Evidence: ${output}`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
