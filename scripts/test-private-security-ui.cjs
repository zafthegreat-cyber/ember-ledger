const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
const output = path.resolve(__dirname, "../artifacts/qa/next-ten/private-files");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVQImWMAAQAABQABDQottAAAAABJRU5ErkJggg==", "base64");

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch(); const results = [];
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true });
      const page = await context.newPage(); const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
        if (url.pathname === "/__qa/private-security") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="fixture"></div></body></html>' });
        return route.continue();
      });
      await page.goto(new URL("/__qa/private-security", base).href);
      await page.evaluate(async ({ theme, png }) => {
        const main = await (await fetch("/src/main.jsx")).text();
        const imports = [...main.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
        const dependency = (name) => imports.find((value) => new URL(value, location.href).pathname.endsWith(`/${name}`));
        const react = await import(dependency("react.js")), React = react.default || react;
        const dom = await import(dependency("react-dom_client.js")), { createRoot } = dom.default || dom;
        const runtime = (await import("/@react-refresh")).default;
        runtime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;
        await import("/src/index.css"); await import("/src/App.css");
        const { default: AttachmentPanel } = await import("/src/features/privateFiles/AttachmentPanel.jsx");
        const { default: OwnerSessionPanel } = await import("/src/features/security/OwnerSessionPanel.jsx");
        const root = createRoot(document.getElementById("fixture"));
        const bytes = Uint8Array.from(atob(png), (value) => value.charCodeAt(0));
        const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((value) => value.toString(16).padStart(2, "0")).join("");
        const recordId = "10000000-0000-4000-8000-000000000001";
        const knownFile = { id: "20000000-0000-4000-8000-000000000001", originalName: "Condition photo - synthetic collector evidence.png", mimeType: "image/png", size: bytes.length, sha256,
          createdAt: "2026-09-01T12:00:00Z", retainUntil: "2026-09-08T12:00:00Z", deletedAt: null, relatedRecordType: "PURCHASE", relatedRecordId: recordId, availability: "VERIFIED", issue: null };
        let files = [knownFile, { ...knownFile, id: "20000000-0000-4000-8000-000000000002", originalName: "Receipt requiring recovery review.pdf", mimeType: "application/pdf", availability: "UNAVAILABLE", issue: "This attachment is missing or failed its integrity check. Include it in recovery review." }];
        const sessions = [
          { id: "30000000-0000-4000-8000-000000000001", label: "Desktop collector workstation", current: true, firstSeenAt: "2026-09-01T12:00:00Z", lastSeenAt: "2026-09-16T12:00:00Z", expiresAt: "2026-09-16T18:00:00Z", revokedAt: null },
          { id: "30000000-0000-4000-8000-000000000002", label: "Phone at the collector show", current: false, firstSeenAt: "2026-09-01T12:00:00Z", lastSeenAt: "2026-09-16T11:30:00Z", expiresAt: "2026-09-16T18:00:00Z", revokedAt: null },
        ];
        window.calls = []; window.pendingReads = []; window.fixtureMode = "normal"; window.freshCalls = 0;
        const request = async (url, init = {}) => {
          window.calls.push({ url, method: init.method || "GET" });
          if (window.fixtureMode === "unavailable") return Response.json({ ok: false, error: { code: "owner_sessions_not_active", message: "Private services are not active." } }, { status: 503 });
          if (window.fixtureMode === "delayed" && (init.method || "GET") === "GET") return new Promise((resolve) => window.pendingReads.push(() => resolve(Response.json(url.includes("private-files") ? { ok: true, files } : { ok: true, sessions }))));
          if (url.includes("/private-files/records/")) {
            if (init.method === "POST") { const file = { ...knownFile, id: "20000000-0000-4000-8000-000000000003", originalName: init.body.name }; files = [...files, file]; return Response.json({ ok: true, file }); }
            return Response.json({ ok: true, files });
          }
          if (url.endsWith("/bytes")) return new Response(bytes, { headers: { "Content-Type": "image/png" } });
          if (url.endsWith("/audit")) return Response.json({ ok: true, entries: [{ id: "audit-one", action: "RECOVERY_COMPLETED", at: "2026-09-16T12:00:00Z", count: 8 }] });
          if (url.includes("/owner-sessions")) return Response.json({ ok: true, sessions });
          throw new Error("Unexpected fixture request");
        };
        window.mountPanels = (authorized = true, identityKey = "synthetic-owner-a") => {
          const session = { status: authorized ? "authorized" : "sign_in_required", identityKey, localDevelopment: true };
          root.render(React.createElement(React.StrictMode, null, React.createElement("main", { className: "app", "data-theme": theme, style: { minHeight: "100vh", padding: "20px", display: "grid", gap: "32px", background: "var(--app-background)", color: "var(--text-primary)" } },
            React.createElement(AttachmentPanel, { authorized, identityKey, domain: "PURCHASE", recordId, request }),
            React.createElement(OwnerSessionPanel, { session, request, getFreshProof: async () => { window.freshCalls++; return null; } })
          )));
        };
        window.mountPanels();
      }, { theme, png: PNG.toString("base64") });
      await page.getByText("Condition photo - synthetic collector evidence.png", { exact: true }).waitFor();
      await page.getByText("Phone at the collector show", { exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Download", exact: true }).nth(1).isDisabled(), true);
      await page.screenshot({ path: path.join(output, `private-security-${theme}-${width}.png`), fullPage: true });
      const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth,
        buttons: [...document.querySelectorAll("button")].map((button) => ({ text: button.textContent, height: button.getBoundingClientRect().height })) }));
      assert.ok(dimensions.width <= dimensions.viewport + 1, JSON.stringify(dimensions));
      assert.ok(dimensions.buttons.every((button) => button.height >= 43), JSON.stringify(dimensions.buttons));
      await page.getByRole("button", { name: "Delete", exact: true }).first().click();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("button", { name: "Revoke session", exact: true }).nth(1).click();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await page.evaluate(() => window.freshCalls), 0);
      assert.equal(await page.evaluate(() => window.calls.filter((call) => call.method !== "GET").length), 0);
      await page.getByLabel("Add an attachment").setInputFiles({ name: "added.png", mimeType: "image/png", buffer: PNG });
      await page.getByText("added.png", { exact: true }).waitFor();
      const download = page.waitForEvent("download");
      await page.getByRole("button", { name: "Download", exact: true }).first().click();
      assert.match((await download).suggestedFilename(), /synthetic collector evidence/);
      await page.getByRole("button", { name: "View security history", exact: true }).click();
      await page.getByText("recovery completed", { exact: true }).waitFor();
      await page.evaluate(() => { window.fixtureMode = "delayed"; window.mountPanels(true, "synthetic-owner-b"); });
      await page.waitForFunction(() => window.pendingReads.length >= 2);
      await page.evaluate(() => { window.calls = []; window.mountPanels(false); });
      await page.getByText("Sign in as the owner to view private attachments.", { exact: true }).waitFor();
      await page.evaluate(() => { for (const resolve of window.pendingReads) resolve(); });
      assert.equal(await page.getByText("added.png", { exact: true }).count(), 0);
      assert.equal(await page.evaluate(() => window.calls.length), 0);
      await page.evaluate(() => { window.fixtureMode = "unavailable"; window.mountPanels(true, "synthetic-owner-c"); });
      await page.getByRole("alert").first().waitFor();
      assert.equal(await page.getByLabel("Add an attachment").isDisabled(), true);
      assert.deepEqual(errors, []);
      results.push({ theme, width, controls: dimensions.buttons.length, noOverflow: true, cancellationZeroWrites: true, uploadReload: true, verifiedDownload: true, lateIdentityResponseDiscarded: true, deniedZeroRequests: true, unavailableVisible: true });
      await context.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, "ui-results.json"), JSON.stringify({ passed: results.length, results }, null, 2));
  process.stdout.write(`Private attachment and owner session UI: ${results.length}/4 contexts passed.\n`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
