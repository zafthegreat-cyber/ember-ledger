const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/backup-review-accessibility/backup-browser");
const results = [];
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const fixture = await (await import("./helpers/backup-review-fixtures.mjs")).backupReviewFixtures();
  const browser = await chromium.launch();
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const errors = []; const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
      await context.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
        if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Local fixture: server not configured", configured: false, healthy: false }) });
        return route.continue();
      });
      await context.addInitScript(theme => localStorage.setItem("et-tcg-app-theme", theme), theme);
      try {
        await page.goto(new URL("/owner-center/controls/data-backup?betaLocalMode=true", base).href);
        const panel = page.locator(".backup-recovery"); await panel.getByRole("heading", { name: "Data & Backup", exact: true }).waitFor();
        // Let the existing App startup preference save finish before measuring this read-only operation.
        await page.waitForFunction(() => localStorage.getItem("et-tcg-phase2-data") !== null);
        const storage = () => page.evaluate(() => ({ local: Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])), session: Object.fromEntries(Object.keys(sessionStorage).sort().map(key => [key, sessionStorage.getItem(key)])) }));
        const before = await storage();
        const file = panel.locator('input[type="file"]').first();
        assert.equal(await file.evaluate(node => node.hidden && node.tabIndex === -1), true, "File chooser is not an invisible Tab stop");
        const trigger = panel.getByRole("button", { name: "Preview restore", exact: true });
        await trigger.focus(); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab"); await expect(trigger).toBeFocused();
        await file.setInputFiles({ name: "synthetic-needs-review.json", mimeType: "application/json", buffer: Buffer.from(fixture.invalidJson) });
        const preview = panel.getByRole("region", { name: "Restore preview result", exact: true });
        await expect(preview.getByRole("heading", { name: "Restore preview", exact: true })).toBeFocused();
        await expect(preview).toContainText("BLOCKED");
        for (const title of ["Duplicate IDs", "Broken references", "Invalid money"]) {
          const detail = preview.locator("details.backup-review-findings").filter({ has: page.locator("summary", { hasText: title }) });
          await detail.locator("summary").click();
          await expect(detail.locator("ol")).toBeVisible();
        }
        await expect(preview).toContainText("synthetic-duplicate-item"); await expect(preview).toContainText("synthetic-missing-item");
        await expect(preview).toContainText("Money value is not finite numeric data.");
        assert.equal(await page.locator(".app").getAttribute("data-theme"), theme);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const small = await panel.locator("button:visible, summary:visible").evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height < 43.5).map(node => node.textContent));
        assert.deepEqual(small, [], "Backup action and finding touch targets are at least44px");
        await preview.screenshot({ path: path.join(output, `restore-findings-${theme}-${width}.png`) });
        const [download] = await Promise.all([page.waitForEvent("download"), preview.getByRole("button", { name: "Download review report", exact: true }).click()]);
        const report = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
        assert.equal(report.format, "code3.backup-review-report"); assert.equal(report.kind, "restore-preview"); assert.equal(report.metadata.result, "BLOCKED");
        assert.equal(report.metadata.sourceFileName, "synthetic-needs-review.json"); assert.equal(report.activationAllowed, false); assert.equal(report.writesPerformed, 0);
        assert.match(JSON.stringify(report.findings), /synthetic-missing-item/); assert.equal(report.sections, undefined); assert.ok(!JSON.stringify(report).includes("Synthetic One"));
        fs.writeFileSync(path.join(output, `review-report-${theme}-${width}.json`), JSON.stringify(report, null, 2));
        assert.deepEqual(await storage(), before, "Preview and diagnostic download perform zero stored-data writes");
        await trigger.focus(); await file.setInputFiles({ name: "synthetic-clean.json", mimeType: "application/json", buffer: Buffer.from(fixture.validJson) });
        await expect(preview).toContainText("synthetic-clean.json"); await expect(preview).not.toContainText("synthetic-missing-item");
        await expect(preview.getByRole("heading", { name: "Restore preview", exact: true })).toBeFocused();
        await trigger.focus(); await file.setInputFiles({ name: "synthetic-broken.json", mimeType: "application/json", buffer: Buffer.from("{broken") });
        await expect(preview).toContainText("CORRUPTED"); await expect(preview.getByRole("heading", { name: "Restore preview", exact: true })).toBeFocused();
        await preview.screenshot({ path: path.join(output, `corrupted-preview-${theme}-${width}.png`) });
        await file.setInputFiles({ name: "synthetic-object-display.json", mimeType: "application/json", buffer: Buffer.from(fixture.malformedDisplayJson) });
        await expect(preview).toContainText("synthetic-object-display.json");
        await preview.locator("details").first().locator("summary").first().click();
        await expect(preview).toContainText("deal-finder");
        await file.setInputFiles({ name: "synthetic-object-version.json", mimeType: "application/json", buffer: Buffer.from(fixture.unsupportedJson) });
        await expect(preview).toContainText("UNSUPPORTED"); await expect(preview).toContainText("Not available");
        assert.deepEqual(await storage(), before, "Replacement and corrupt-file previews still write nothing"); assert.deepEqual(errors, []);
        results.push({ theme, width, passed: true, checks: ["real validator duplicate ID/reference/money findings", "keyboard result focus", "hidden picker not tabbable", "theme/overflow/44px", "bounded diagnostic-only report", "old findings replaced", "corrupt JSON fails closed", "zero saved-data writes"] });
      } catch (error) {
        await page.screenshot({ path: path.join(output, `failure-${theme}-${width}.png`), fullPage: true }); fs.writeFileSync(path.join(output, `failure-${theme}-${width}.txt`), await page.locator("body").innerText()); throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ passed: results.length, results }, null, 2)); }
  console.log(`Backup review browser: ${results.length}/4 contexts passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
