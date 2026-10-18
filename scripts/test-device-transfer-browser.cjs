const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5252");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Synthetic transfer tests use a disposable local browser context only.");
const output = path.resolve("artifacts/qa/mobile-beta/device-transfer");
const results = [];
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const theme of ["light", "dark"]) for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const page = await context.newPage(); const errors = []; page.on("pageerror", (error) => errors.push(error.message));
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
        if (url.pathname.includes("@capacitor_filesystem.js")) return route.fulfill({ contentType: "application/javascript", body: 'export const Directory = { Cache: "CACHE" }; export const Filesystem = { async writeFile(value) { window.__nativeExports.push(value); return { uri: "file:///private/cache/synthetic.json" }; }, async deleteFile() {} };' });
        if (url.pathname.includes("@capacitor_share.js")) return route.fulfill({ contentType: "application/javascript", body: 'export const Share = { async share(value) { window.__nativeShareCalls.push(value); if (window.__cancelNativeShare) throw new Error("Share cancelled"); } };' });
        if (url.pathname === "/__qa/transfer") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic device transfer</title><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script></head><body style="margin:0"><div id="root"></div></body></html>' });
        return route.continue();
      });
      try {
        await page.goto(new URL("/__qa/transfer", base).href);
        await page.evaluate(async (theme) => {
          const React = (await import("/node_modules/.vite/deps/react.js")).default;
          const renderer = await import("/node_modules/.vite/deps/react-dom_client.js");
          const createRoot = renderer.createRoot || renderer.default.createRoot;
          await import("/src/index.css"); await import("/src/App.css");
          const { default: Panel } = await import("/src/features/persistence/CloudSyncPanel.jsx");
          const { default: Restore } = await import("/src/features/backup/WorkspaceRestorePanel.jsx");
          const { CloudWorkspaceContext } = await import("/src/features/persistence/CloudWorkspaceContext.js");
          const { default: sessions } = await import("/src/services/accountSessionService.js");
          sessions.currentUser = async () => ({ id: "00000000-0000-4000-8000-000000000001" });
          sessions.register = async () => undefined;
          sessions.list = async () => [];
          const { hashCanonicalJson } = await import("/src/features/backup/canonicalJson.js");
          await import("/src/styles/theme.css"); await import("/src/features/persistence/cloud-workspace.css");
          const userId = "00000000-0000-4000-8000-000000000001";
          localStorage.setItem("code3.workspace-owner.v1", JSON.stringify({ version: 1, ownerId: userId }));
          localStorage.setItem("et-tcg-beta-data", JSON.stringify({ items: [{ id: "synthetic-one", quantity: 2 }, { id: "synthetic-two", quantity: 1 }] }));
          window.before = JSON.stringify(Object.entries(localStorage).sort());
          const root = createRoot(document.getElementById("root"));
          const payload = { format: "code3-cloud-backup", version: 1, createdAt: "2026-10-18T10:00:00.000Z", records: { format: "code3-legacy-cloud-records", version: 1, ownerId: userId, sections: { inventory_items: [{ id: "00000000-0000-4000-8000-000000000011", user_id: userId, quantity: 1 }] }, recordCount: 1, fileManifest: [], missingTables: [], exclusions: [] }, attachments: [], coverage: "COMPLETE_FOR_LISTED_SCOPE", fileErrors: [], externalFileReferences: 0 };
          const cloudBackup = { ...payload, integrity: await hashCanonicalJson(payload) };
          const cloud = { verified: true, fileName: "synthetic-cloud-backup.json", backup: cloudBackup, json: JSON.stringify(cloudBackup) };
          const shell = (child) => React.createElement("main", { className: "app", "data-theme": theme, style: { minHeight: "100vh", padding: "16px", maxWidth: "1000px", margin: "auto" } },
            React.createElement("div", { className: "utility-page you-command-only-route data-backup-utility-page" },
              React.createElement("h1", null, "Data Safety & Export"),
              React.createElement("div", { className: "utility-page-layout" }, child)));
          const openRecovery = () => root.render(shell(React.createElement(Restore, { userId, onRestore: async () => { throw new Error("QA never applies actual recovery"); }, onRestoreCloud: async () => { throw new Error("QA never applies actual recovery"); } })));
          root.render(shell(React.createElement(CloudWorkspaceContext.Provider, { value: { user: { id: userId }, enabled: true, status: { status: "SYNCED", message: "Synthetic records saved to this test account." }, exportCloudBackup: async () => cloud, openRecovery } }, React.createElement(Panel))));
        }, theme);
        const panel = page.locator(".device-transfer"); await panel.getByRole("heading", { name: "Move to a new device" }).waitFor();
        for (const name of ["Download device backup", "Download cloud backup"]) {
          const [backup] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name, exact: true }).click()]);
          const exported = JSON.parse(fs.readFileSync(await backup.path(), "utf8"));
          assert.ok(exported.format || exported.formatVersion, `${name} must produce actual backup content`);
          await expect(page.getByText("Download started.", { exact: false }).first()).toBeVisible();
        }
        await page.evaluate(() => { window.__nativeExports = []; window.__nativeShareCalls = []; window.Capacitor = { isNativePlatform: () => true }; });
        for (const name of ["Download device backup", "Download cloud backup", "Save transfer file"]) {
          const previous = await page.evaluate(() => window.__nativeShareCalls.length);
          await page.getByRole("button", { name, exact: true }).click();
          await page.waitForFunction(count => window.__nativeShareCalls.length > count, previous);
          await expect(page.getByText("Share sheet closed.", { exact: false }).first()).toBeVisible();
        }
        const nativeFiles = await page.evaluate(() => window.__nativeExports.map(file => ({ directory: file.directory, format: JSON.parse(atob(file.data)).format })));
        assert.equal(nativeFiles.length, 3); assert.ok(nativeFiles.every(file => file.directory === "CACHE")); assert.equal(nativeFiles[2].format, "code3-device-transfer");
        await page.evaluate(() => { window.__cancelNativeShare = true; });
        await page.getByRole("button", { name: "Download device backup", exact: true }).click();
        await expect(page.getByText("Export cancelled. No saved backup was confirmed; your records are unchanged.", { exact: true })).toBeVisible();
        await page.evaluate(() => { window.Capacitor = { isNativePlatform: () => false }; });
        const exportButton = panel.getByRole("button", { name: "Save transfer file" });
        await exportButton.focus(); await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab"); await expect(exportButton).toBeFocused();
        const [download] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
        const buffer = fs.readFileSync(await download.path()); assert.equal(JSON.parse(buffer).format, "code3-device-transfer");
        await expect(panel).toContainText("Included: 2 device records, 1 cloud records, and 0 cloud attachments.");
        await panel.locator('input[type="file"]').setInputFiles({ name: "synthetic-transfer.json", mimeType: "application/json", buffer });
        await expect(panel).toContainText("All compared source records match");
        assert.equal(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()) === window.before), true);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const undersized = await panel.locator("button:visible, summary:visible").evaluateAll((nodes) => nodes.filter((node) => node.getBoundingClientRect().height < 43.5).map((node) => node.textContent)); assert.deepEqual(undersized, []);
        const contrast = await panel.locator("p, dt, dd, h3").evaluateAll(nodes => {
          const rgb = value => value.match(/[\d.]+/g).map(Number);
          const luminance = channels => channels.slice(0, 3).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
          return nodes.map(node => {
            const foreground = luminance(rgb(getComputedStyle(node).color));
            let background = [255, 255, 255];
            for (let parent = node; parent; parent = parent.parentElement) { const value = rgb(getComputedStyle(parent).backgroundColor); if (value.length === 3 || value[3] === 1) { background = value; break; } }
            const bg = luminance(background);
            return { text: node.textContent.slice(0, 80), ratio: (Math.max(foreground, bg) + .05) / (Math.min(foreground, bg) + .05) };
          });
        });
        assert.deepEqual(contrast.filter(item => item.ratio < 4.5), [], "Transfer copy needs readable contrast in the actual CloudSyncPanel wrapper.");
        await panel.screenshot({ path: path.join(output, `transfer-${theme}-${width}.png`) });
        await page.locator(".cloud-workspace-panel").screenshot({ path: path.join(output, `settings-wrapper-${theme}-${width}.png`) });
        await panel.getByRole("button", { name: "Review recovery options" }).click();
        await page.getByLabel("Select backup or transfer file").setInputFiles({ name: "synthetic-transfer.json", mimeType: "application/json", buffer });
        await expect(page.getByText("This transfer is linked to your signed-in account.", { exact: false })).toBeVisible();
        await expect(page.getByRole("button", { name: "Verify account and recover missing records" })).toBeDisabled();
        await page.getByRole("button", { name: "Review cloud records and attachments" }).click();
        await expect(page.getByText("Cloud records checked", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Verify account and recover missing records" })).toBeDisabled();
        assert.equal(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()) === window.before), true);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: path.join(output, `recovery-${theme}-${width}.png`), fullPage: true });
        assert.deepEqual(errors, []);
        results.push({ theme, width, passed: true, checks: ["actual CloudSyncPanel and app styles", "web device/cloud backup downloads", "native bridge mocked for device/cloud/transfer export and cancel", "real transfer file export and import", "matching identifier/content comparison", "zero storage writes", "owner-bound package opens existing recovery", "cloud/device part selection", "password required", "keyboard focus", "no horizontal overflow", "44px controls", "text contrast at least 4.5:1"] });
      } catch (error) { await page.screenshot({ path: path.join(output, `failure-${theme}-${width}.png`), fullPage: true }); throw error; }
      finally { await context.close(); }
    }
  } finally { await browser.close(); fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ passed: results.length, results }, null, 2)); }
  console.log(`Device transfer browser: ${results.length}/6 contexts passed. No production data or services used.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
