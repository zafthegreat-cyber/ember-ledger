const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

(async () => {
  const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
  assert.ok(["localhost", "127.0.0.1"].includes(base.hostname));
  const output = path.resolve("artifacts/qa/next-ten/browser"); fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true }); const results = [];
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.route("**/*", (route) => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
      const page = await context.newPage(); const errors = []; page.on("pageerror", (error) => errors.push(error.message));
      const result = { theme, width };
      try {
        await page.goto(`${base.origin}/settings?betaLocalMode=true&themeInspect=${theme}`);
        await expect(page.locator(".settings-layout")).toBeVisible({ timeout: 30000 });
        await page.evaluate(async () => {
          const { createAccountOpsService } = await import("/src/features/accountOps/service.js");
          await createAccountOpsService().createProfileGroup({ displayName: "Synthetic browser group" });
        });
        const before = await page.evaluate(() => localStorage.getItem("code3.account-ops.v1"));
        await page.goto(`${base.origin}/owner-center/records?betaLocalMode=true&themeInspect=${theme}&recordQ=Synthetic`);
        await expect(page.getByRole("heading", { name: "Record search", exact: true })).toBeVisible({ timeout: 30000 });
        await expect(page.getByRole("link", { name: /^Synthetic browser group profileGroups:/ })).toBeVisible();
        assert.equal(await page.locator(".app").getAttribute("data-theme"), theme);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: path.join(output, `${theme}-${width}-search.png`), fullPage: true });
        const searchUrl = page.url();
        await page.getByRole("link", { name: /^Synthetic browser group profileGroups:/ }).click();
        await expect(page.getByRole("heading", { name: "Synthetic browser group", exact: true })).toBeVisible();
        const exactId = new URL(page.url()).searchParams.get("record"); assert.ok(exactId.startsWith("profileGroups:"));
        await page.reload();
        await expect(page.getByRole("heading", { name: "Synthetic browser group", exact: true })).toBeVisible();
        await page.screenshot({ path: path.join(output, `${theme}-${width}-detail.png`), fullPage: true });
        await page.goBack();
        await expect(page.getByRole("heading", { name: "Record search", exact: true })).toBeVisible();
        assert.equal(page.url(), searchUrl);
        await page.goForward();
        await expect(page.getByRole("heading", { name: "Synthetic browser group", exact: true })).toBeVisible();
        assert.equal(new URL(page.url()).searchParams.get("record"), exactId);
        assert.equal(await page.evaluate(() => localStorage.getItem("code3.account-ops.v1")), before);
        await page.goto(`${base.origin}/owner-center/controls/data-backup?betaLocalMode=true&themeInspect=${theme}`);
        await expect(page.getByRole("heading", { name: "Account Ops recovery", exact: true })).toBeVisible({ timeout: 30000 });
        const download = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export Account Ops only", exact: true }).click();
        assert.match((await download).suggestedFilename(), /code-3-account-ops/);
        await expect(page.getByRole("status").filter({ hasText: /Account Ops-only backup verified/ })).toBeVisible();
        assert.equal(await page.evaluate(() => localStorage.getItem("code3.account-ops.v1")), before);
        await page.screenshot({ path: path.join(output, `${theme}-${width}-backup.png`), fullPage: true });
        assert.deepEqual(errors, []);
        result.passed = true;
      } catch (error) { result.passed = false; result.error = error.stack; result.pageErrors = errors; await page.screenshot({ path: path.join(output, `${theme}-${width}-failure.png`) }).catch(() => {}); }
      results.push(result); await context.close(); console.log(`${result.passed ? "PASS" : "FAIL"} new record/recovery UI ${theme} ${width}${result.error ? `: ${result.error}` : ""}`);
    }
    const context = await browser.newContext();
    await context.route("**/*", (route) => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
    const one = await context.newPage(); const two = await context.newPage();
    await context.addInitScript(() => {
      window.__accountOpsWrites = [];
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "code3.account-ops.v1") {
          const data = JSON.parse(value);
          window.__accountOpsWrites.push({ names: data.profileGroups.map((row) => row.displayName), activity: data.activity.length, stack: new Error().stack, at: Date.now() });
        }
        return original.call(this, key, value);
      };
    });
    await Promise.all([one.goto(`${base.origin}/?betaLocalMode=true`), two.goto(`${base.origin}/?betaLocalMode=true`)]);
    const create = (page, prefix) => page.evaluate(async (label) => {
      const { createAccountOpsService } = await import("/src/features/accountOps/service.js"); const service = createAccountOpsService();
      await Promise.all(Array.from({ length: 8 }, (_, i) => service.createProfileGroup({ displayName: `${label} ${i}` })));
    }, prefix);
    await Promise.all([create(one, "Tab A"), create(two, "Tab B")]);
    const snapshot = await one.evaluate(() => JSON.parse(localStorage.getItem("code3.account-ops.v1")));
    fs.writeFileSync(path.join(output, "two-tab-write-trace.json"), JSON.stringify({ one: await one.evaluate(() => window.__accountOpsWrites), two: await two.evaluate(() => window.__accountOpsWrites), counts: { groups: snapshot.profileGroups.length, activity: snapshot.activity.length } }, null, 2));
    assert.equal(snapshot.profileGroups.length, 20); assert.equal(snapshot.activity.length, 16);
    const direct = await two.evaluate(async () => { const { createAccountOpsRepository } = await import("/src/features/accountOps/repository.js"); const repo = createAccountOpsRepository(); try { repo.save(repo.load()); return "BYPASSED"; } catch (error) { return error.code; } });
    assert.equal(direct, "COORDINATED_WRITE_REQUIRED");
    results.push({ name: "two actual browser tabs preserve 16 concurrent records and activities; direct writer cannot bypass Web Locks", passed: true });
    await context.close();
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2)); }
  assert.ok(results.length === 5 && results.every((row) => row.passed));
})().catch((error) => { console.error(error); process.exitCode = 1; });
