const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const espree = require("espree");
const { transformSync } = require("esbuild");
const { chromium } = require("@playwright/test");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname));
const captureOnly = process.argv.includes("--capture-before");
const output = path.resolve(__dirname, "../artifacts/qa/release-readiness/shared-feedback");
const source = fs.readFileSync(path.resolve(__dirname, "../src/App.jsx"), "utf8");
const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
const names = ["renderToastViewport", "renderConfirmationModal", "renderRoleManagementSection", "Field", "DetailItem", "maskEmail"];
const extracted = {};
function walk(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration" && names.includes(node.id.name)) extracted[node.id.name] = source.slice(...node.range);
  for (const value of Object.values(node)) for (const child of Array.isArray(value) ? value : value?.type ? [value] : []) walk(child);
}
walk(ast);
assert.equal(Object.keys(extracted).length, names.length);
const compiled = transformSync(Object.values(extracted).join("\n"), { loader: "jsx", jsx: "transform", target: "es2022" }).code;
const results = [];
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage(), errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
        if (url.pathname === "/__qa/shared-feedback") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body><div id="fixture"></div></body></html>' });
        return route.continue();
      });
      await page.goto(new URL("/__qa/shared-feedback", base).href);
      await page.evaluate(async ({ compiled, theme }) => {
        const main = await (await fetch("/src/main.jsx")).text();
        const imports = [...main.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
        const dependency = (name) => imports.find((value) => new URL(value, location.href).pathname.endsWith(`/${name}`));
        const react = await import(dependency("react.js")), React = react.default || react;
        const dom = await import(dependency("react-dom_client.js")), { createRoot } = dom.default || dom;
        await import("/src/index.css"); await import("/src/App.css"); await import("/src/components/operations/operations-ui.css");
        const roles = await import("/src/utils/rolePermissions.js");
        const root = createRoot(document.querySelector("#fixture"));
        window.fixtureActions = [];
        const person = { userId: "synthetic-reader", displayName: "Synthetic collector with a longer display name", email: "qa@example.test", username: "collector", appRole: "user", appAccess: true, betaAccessStatus: "approved", planTier: "free" };
        const state = {
          appToasts: [], confirmationState: null, roleChangeTarget: null,
          roleManagementVisible: true, rolePermissionProfile: { id: "synthetic-owner", appRole: "owner" }, actualAdminRole: "owner",
          shorelineState: { roleManagementUsers: [person], roleManagementUsersReady: true, roleAuditLog: [] },
          roleManagementSearch: "", roleManagementFilter: "All", roleChangeRole: "moderator", roleChangeReason: "", roleChangeSaving: false,
        };
        let mode = "toast";
        const callbacks = {
          dismissToast: (id) => { window.fixtureActions.push(`dismiss:${id}`); state.appToasts = state.appToasts.filter((row) => row.id !== id); render(); },
          closeConfirmation: (accepted) => { window.fixtureActions.push(`confirmation:${accepted}`); state.confirmationState = null; render(); },
          confirmationCancelRef: { current: null }, refreshRoleManagementData: () => {}, setRoleManagementSearch: () => {}, setRoleManagementFilter: () => {},
          openRoleChangeConfirmation: (row, role) => { state.roleChangeTarget = row; state.roleChangeRole = role; render(); },
          setRoleChangeTarget: (row) => { state.roleChangeTarget = row; render(); }, setRoleChangeReason: (value) => { state.roleChangeReason = value; render(); },
          confirmRoleChange: () => { throw new Error("Role changes must never be submitted by presentation fixture"); },
        };
        const helper = { ...roles, ...callbacks, statusLabel: (value) => String(value || "Unknown"), shortDate: (value) => String(value).slice(0, 10),
          TOAST_TYPE_LABELS: { success: "Success", error: "Error", warning: "Warning", info: "Info" }, TOAST_ICON_LABELS: { success: "✓", error: "!", warning: "!", info: "i" } };
        async function render() {
          const bindings = { ...state, ...helper };
          const functions = new Function("React", ...Object.keys(bindings), `${compiled};return {toast:renderToastViewport,confirmation:renderConfirmationModal,roles:renderRoleManagementSection}`)(React, ...Object.values(bindings));
          const dock = React.createElement("nav", { className: "ops-mobile-nav", "aria-label": "Synthetic navigation" }, ...["Home", "Collect", "Add", "Find", "Settings"].map((label) => React.createElement("button", { key: label }, label)));
          const content = React.createElement("div", { style: { padding: "24px 16px 120px", maxWidth: "1000px", margin: "auto" } }, mode === "roles" ? functions.roles() : React.createElement("h1", null, "Code 3 TCG"));
          const feedback = mode === "stacked" ? React.createElement(React.Fragment, null, functions.confirmation(), functions.toast()) : mode === "roles" ? null : functions[mode]();
          await React.act(async () => root.render(React.createElement("div", { className: "app app-command-shell ops-app-shell", "data-theme": theme }, content, dock, feedback)));
        }
        window.showFeedback = async (nextMode, type = "error") => {
          mode = nextMode; state.roleChangeTarget = null;
          state.confirmationState = { title: "Delete synthetic record?", message: "This removes the selected local record. Review the details before continuing.", details: "No action is submitted by this presentation check.", destructive: true, confirmLabel: "Delete record", cancelLabel: "Keep record" };
          state.appToasts = [{ id: "qa-notice", type, title: `${type.charAt(0).toUpperCase() + type.slice(1)}: synthetic status`, message: "Your collection review needs attention. Saved information remains available.", actionLabel: "Review details", onAction: () => window.fixtureActions.push("review") }];
          await render();
        };
        await window.showFeedback("toast");
      }, { compiled, theme });
      const prefix = `${captureOnly ? "before-" : ""}${theme}-${width}`;
      const metrics = { theme, width, states: {} };
      for (const type of ["error", "warning", "success", "info"]) {
        await page.evaluate((type) => window.showFeedback("toast", type), type);
        metrics.states[type] = await measure(page, ".app-toast");
        if (type === "error") await page.screenshot({ path: path.join(output, `${prefix}-toast.png`) });
        if (!captureOnly) {
          checkMetrics(metrics.states[type], `toast ${type}`);
          const semantic = await page.locator(".app-toast").evaluate((card, type) => {
            const probe = document.createElement("span"); probe.style.color = `var(--status-${type === "error" ? "danger" : type})`; card.append(probe);
            const expected = getComputedStyle(probe).color; probe.remove();
            return { expected, border: getComputedStyle(card).borderLeftColor, icon: getComputedStyle(card.querySelector(".app-toast-icon")).color, pointer: getComputedStyle(card).pointerEvents, viewportPointer: getComputedStyle(card.parentElement).pointerEvents };
          }, type);
          assert.equal(semantic.border, semantic.expected); assert.equal(semantic.icon, semantic.expected);
          assert.equal(semantic.pointer, "auto"); assert.equal(semantic.viewportPointer, "none");
        }
      }
      if (!captureOnly) {
        await page.getByRole("button", { name: "Review details", exact: true }).click();
        assert.deepEqual(await page.evaluate(() => window.fixtureActions), ["review", "dismiss:qa-notice"]);
        await page.evaluate(() => window.showFeedback("toast", "error"));
        await page.getByRole("button", { name: "Dismiss Error", exact: true }).focus(); await page.keyboard.press("Enter");
        assert.equal(await page.locator(".app-toast").count(), 0);
      }
      await page.evaluate(() => window.showFeedback("confirmation"));
      metrics.confirmation = await measure(page, ".app-confirmation-dialog");
      await page.screenshot({ path: path.join(output, `${prefix}-confirmation.png`) });
      if (!captureOnly) {
        checkMetrics(metrics.confirmation, "confirmation");
        await page.getByRole("button", { name: "Keep record", exact: true }).click();
        assert.equal(await page.getByRole("dialog").count(), 0);
        assert.ok(!(await page.evaluate(() => window.fixtureActions)).includes("confirmation:true"));
      }
      if (!captureOnly) {
        await page.setViewportSize({ width, height: 660 });
        await page.evaluate(() => window.showFeedback("stacked", "error"));
        metrics.stackedToast = await measure(page, ".app-toast");
        metrics.stackedConfirmation = await measure(page, ".app-confirmation-dialog");
        checkMetrics(metrics.stackedToast, "toast over modal"); checkMetrics(metrics.stackedConfirmation, "confirmation with feedback");
        assert.ok(metrics.stackedToast.box.bottom <= metrics.stackedConfirmation.box.top || metrics.stackedToast.box.left >= metrics.stackedConfirmation.box.right || metrics.stackedToast.box.right <= metrics.stackedConfirmation.box.left, "toast does not obscure confirmation content/actions");
        await page.screenshot({ path: path.join(output, `${prefix}-stacked.png`) });
        await page.getByRole("button", { name: "Keep record", exact: true }).click();
        await page.setViewportSize({ width, height: 900 });
      }
      await page.evaluate(() => window.showFeedback("roles"));
      metrics.roles = await measure(page, ".role-management-panel");
      await page.screenshot({ path: path.join(output, `${prefix}-roles.png`), fullPage: true });
      if (!captureOnly) {
        assert.equal(metrics.roles.overflow, false, "role management does not overflow");
        assert.ok(metrics.roles.minimumContrast >= 4.5, `role management text contrast ${JSON.stringify(metrics.roles.contrastIssues)}`);
        assert.deepEqual(metrics.roles.clippedText, [], "role helper content is not ellipsized");
        for (const button of await page.locator(".role-management-panel button:enabled").all()) {
          await button.scrollIntoViewIfNeeded();
          await button.evaluate((element) => element.scrollIntoView({ block: "center" }));
          const box = await button.boundingBox(); assert.ok(box.width >= 43.5 && box.height >= 43.5);
          assert.equal(await button.evaluate((element) => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), true, `role action ${await button.innerText()} uncovered`);
        }
      }
      await page.getByRole("button", { name: "Make Moderator", exact: true }).click();
      metrics.roleDialog = await measure(page, ".role-change-modal");
      await page.screenshot({ path: path.join(output, `${prefix}-role-dialog.png`) });
      if (!captureOnly) checkMetrics(metrics.roleDialog, "role dialog");
      await page.getByRole("button", { name: "Cancel", exact: true }).focus();
      if (!captureOnly) assert.ok(await page.getByRole("button", { name: "Cancel", exact: true }).evaluate((button) => parseFloat(getComputedStyle(button).outlineWidth) >= 2), "role dialog cancel has visible focus");
      await page.keyboard.press("Enter");
      assert.equal(await page.locator(".role-change-modal").count(), 0);
      assert.deepEqual(errors, []);
      results.push(metrics);
      console.log(`${captureOnly ? "CAPTURED" : "PASS"} ${theme}-${width}`);
      await context.close();
    }
    if (!captureOnly) await checkFullAppDialogs(browser);
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, captureOnly ? "before.json" : "results.json"), JSON.stringify(results, null, 2));
}
async function checkFullAppDialogs(browser) {
  const nativeResults = [];
  const storageKey = "et-tcg-phase2-data";
  for (const theme of ["light", "dark"]) for (const width of [360, 1440]) for (const height of [660, 900]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const result = { theme, width, height, kind: "actual App Deal Finder quota error" };
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.origin === base.origin && ["GET", "HEAD"].includes(route.request().method()) ? route.continue() : route.abort();
    });
    await context.addInitScript(() => {
      localStorage.setItem("et-tcg-beta-data", JSON.stringify({
        userType: "seller", dashboardPreset: "seller", forgeModeSettings: { personalForgeEnabled: true, lockToEmberTide: false },
        catalogProducts: [{ id: "qa-feedback-product", name: "Synthetic feedback booster bundle", sourceType: "manual", catalogType: "sealed", marketPrice: 30, msrpPrice: 20 }],
        tideTradrWatchlist: [{ id: "qa-feedback-watch", productId: "qa-feedback-product", name: "Synthetic feedback booster bundle", workspaceId: "workspace-personal-local-beta" }],
      }));
      localStorage.setItem("et-tcg-phase2-data", JSON.stringify({ dealFinderSessions: [], dealFinderItems: [] }));
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(new URL(`/exchange/market?betaLocalMode=true&themeInspect=${theme}`, base).href);
      const product = page.locator(".market-v4-result-row").filter({ hasText: "Synthetic feedback booster bundle" });
      await product.waitFor({ timeout: 30000 });
      await product.getByRole("button", { name: "Compare", exact: true }).click();
      const modal = page.locator(".deal-finder-modal"); await modal.waitFor();
      await modal.getByLabel("Asking Price", { exact: true }).fill("10");
      const before = await page.evaluate((key) => localStorage.getItem(key), storageKey);
      await page.evaluate((key) => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function(name, value) {
          if (name === key) throw new DOMException("Synthetic feedback quota failure", "QuotaExceededError");
          return original.call(this, name, value);
        };
      }, storageKey);
      await modal.getByRole("button", { name: "Calculate & Save Deal", exact: true }).click();
      const errorToast = page.locator(".app-toast--error").filter({ hasText: "Deal was not saved because local storage" });
      await errorToast.waitFor();
      await modal.evaluate((dialog) => { dialog.scrollTop = 0; });
      result.toast = await measure(page, ".app-toast--error");
      result.dialog = await modal.boundingBox();
      assert.ok(result.toast.box.bottom <= result.dialog.y - 8, "full-height dialog starts below feedback region");
      assert.ok(result.dialog.y >= 0 && result.dialog.y + result.dialog.height <= height + 1, "full-height dialog fits viewport");
      assert.ok(await modal.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth + 1), "full-height dialog has no horizontal overflow");
      const checkFocusedButton = async (button) => {
        await button.focus();
        const evidence = await button.evaluate((element) => {
          const r = element.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          const parent = element.closest('[role="dialog"]').getBoundingClientRect();
          return { label: element.getAttribute("aria-label") || element.textContent.trim(), width: r.width, height: r.height, top: r.top, bottom: r.bottom, hit: element.contains(hit), focused: document.activeElement === element, insideDialog: r.top >= parent.top - 1 && r.bottom <= parent.bottom + 1, outline: parseFloat(getComputedStyle(element).outlineWidth) };
        });
        assert.ok(evidence.width >= 44 && evidence.height >= 44, `${evidence.label} touch target`);
        assert.ok(evidence.top >= 0 && evidence.bottom <= height && evidence.insideDialog && evidence.hit && evidence.focused, `${evidence.label} remains visible and uncovered`);
        assert.ok(evidence.outline >= 2, `${evidence.label} visible keyboard focus`);
        return evidence;
      };
      result.headerClose = await checkFocusedButton(modal.getByRole("button", { name: "Close Deal Finder", exact: true }));
      await page.screenshot({ path: path.join(output, `native-${theme}-${width}-${height}-header.png`) });
      result.saveAction = await checkFocusedButton(modal.getByRole("button", { name: "Calculate & Save Deal", exact: true }));
      result.footerClose = await checkFocusedButton(modal.getByRole("button", { name: "Close", exact: true }));
      await page.screenshot({ path: path.join(output, `native-${theme}-${width}-${height}-footer.png`) });
      assert.equal(await modal.getByLabel("Asking Price", { exact: true }).inputValue(), "10");
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), storageKey), before, "quota failure preserves saved bytes");
      await page.keyboard.press("Escape");
      assert.equal(await modal.count(), 0, "actual App Escape still closes dialog");
      assert.deepEqual(errors, []);
      result.passed = true;
      console.log(`PASS native ${theme}-${width}-${height} error feedback/header/footer/focus/Escape`);
    } catch (error) {
      result.passed = false; result.error = error.message;
      await page.screenshot({ path: path.join(output, `native-${theme}-${width}-${height}-failure.png`) }).catch(() => {});
      throw error;
    } finally {
      nativeResults.push(result);
      fs.writeFileSync(path.join(output, "native-results.json"), JSON.stringify(nativeResults, null, 2));
      await context.close();
    }
  }
}
async function measure(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const box = element.getBoundingClientRect(), style = getComputedStyle(element);
    const dock = document.querySelector(".ops-mobile-nav"), dockBox = dock.getBoundingClientRect(), dockVisible = getComputedStyle(dock).display !== "none";
    function rgb(value) { const parts = value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0]; return value.startsWith("color(srgb") ? parts.slice(0, 3).map((x) => x * 255) : parts.slice(0, 3); }
    function luminance(value) { return rgb(value).map((channel) => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0); }
    function background(node) { for (let current = node; current; current = current.parentElement) { const bg = getComputedStyle(current).backgroundColor; if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg; } return "rgb(255,255,255)"; }
    const text = [...element.querySelectorAll("h2,h3,h4,p,strong,small,button:not(:disabled),.app-toast-message,.field-label-row")].filter((row) => row.getClientRects().length && row.textContent.trim());
    const contrast = text.map((row) => { const foreground = luminance(getComputedStyle(row).color), surface = luminance(background(row)); return (Math.max(foreground, surface) + 0.05) / (Math.min(foreground, surface) + 0.05); });
    const clippedText = text.filter((row) => row.matches("p,small") && (row.scrollWidth > row.clientWidth + 1 || row.scrollHeight > row.clientHeight + 1)).map((row) => row.textContent.trim().slice(0, 80));
    const contrastIssues = text.map((row, index) => ({ label: row.textContent.trim().slice(0, 60), ratio: contrast[index], color: getComputedStyle(row).color, background: background(row) })).filter((row) => row.ratio < 4.5);
    return { display: style.display, background: style.backgroundColor, backgroundImage: style.backgroundImage, border: style.borderColor, color: style.color, overflow: document.documentElement.scrollWidth > innerWidth + 1, minimumContrast: Math.min(...contrast), contrastIssues, clippedText,
      box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom }, width: innerWidth, height: innerHeight, dockTop: dockVisible ? dockBox.top : innerHeight,
      buttons: [...element.querySelectorAll("button")].filter((row) => !row.disabled).map((button) => { const r = button.getBoundingClientRect(); return { label: button.textContent.trim() || button.getAttribute("aria-label"), width: r.width, height: r.height, top: r.top, bottom: r.bottom, hit: button.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) }; }),
    };
  });
}
function checkMetrics(metrics, label) {
  assert.equal(metrics.overflow, false, `${label} document overflow`);
  assert.notEqual(metrics.background, "rgba(0, 0, 0, 0)", `${label} has an opaque surface`);
  assert.equal(metrics.backgroundImage, "none", `${label} has no decorative gradient`);
  assert.ok(metrics.minimumContrast >= 4.5, `${label} text contrast ${metrics.minimumContrast}`);
  assert.deepEqual(metrics.clippedText, [], `${label} helper text is fully painted`);
  assert.ok(metrics.box.left >= 0 && metrics.box.right <= metrics.width + 1 && metrics.box.top >= 0 && metrics.box.bottom <= metrics.height, `${label} fits viewport`);
  if (label.startsWith("toast")) assert.ok(metrics.box.bottom <= metrics.dockTop - 8, `${label} clears mobile navigation`);
  for (const button of metrics.buttons) { assert.ok(button.width >= 43.5 && button.height >= 43.5, `${label} ${button.label} 44px`); assert.equal(button.hit, true, `${label} ${button.label} uncovered`); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
