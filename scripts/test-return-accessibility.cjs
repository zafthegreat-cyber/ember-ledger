const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Use a disposable local browser only.");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/backup-review-accessibility/return-accessibility");

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch(), results = [], pageErrors = [];
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
      await context.route("**/*", route => {
        const url = new URL(route.request().url());
        if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
        if (url.pathname === "/__qa/return-accessibility") return route.fulfill({ contentType: "text/html", body: '<!doctype html><html lang="en"><head><title>Return accessibility fixture</title></head><body><main class="app" id="fixture"></main><button id="outside" type="button">Outside control</button></body></html>' });
        return route.continue();
      });
      const page = await context.newPage();
      page.on("pageerror", error => pageErrors.push(error.message));
      await page.goto(new URL("/__qa/return-accessibility", base).href);
      await page.evaluate(async theme => {
        const main = await (await fetch("/src/main.jsx")).text();
        const imports = [...main.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
        const dependency = name => imports.find(value => new URL(value, location.href).pathname.endsWith("/" + name));
        const react = await import(dependency("react.js")), React = react.default || react;
        const dom = await import(dependency("react-dom_client.js")), { createRoot } = dom.default || dom;
        const runtime = (await import("/@react-refresh")).default;
        runtime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
        await import("/src/index.css"); await import("/src/styles/theme.css"); await import("/src/features/manualLifecycles/manual-lifecycles.css");
        const { default: Settlement } = await import("/src/features/manualLifecycles/SaleReturnSettlement.jsx");
        const { TextField, SelectField } = await import("/src/components/operations/RecordExperience.jsx");
        const host = document.querySelector("#fixture"); host.dataset.theme = theme;
        host.style.cssText = "min-height:0;padding:16px;max-width:100%;box-sizing:border-box";
        const root = createRoot(host); let generation = 0;
        const current = { currency: "USD", quantity: 2, restockedQuantity: 1, refundMinor: 1200, refundReference: "SYN-ORIGINAL", disposition: "Restock review", cogsReversalMinor: 500, availableBefore: 1, availableAfter: 2, blockers: [], corrections: [] };
        window.audit = {
          authorized: true, delayed: false, rejectNext: false, pending: [], calls: [], applied: 0,
          mount(strict, applied = true) {
            this.authorized = true; this.delayed = false; this.rejectNext = false; this.pending = []; this.calls = []; this.applied = 0;
            const request = (kind, value) => {
              this.calls.push(kind);
              if (this.rejectNext) { this.rejectNext = false; return Promise.reject(Error("Synthetic stale review. Check your saved correction draft.")); }
              if (this.delayed) return new Promise(resolve => this.pending.push(() => resolve(value)));
              return Promise.resolve(value);
            };
            const service = {
              previewReturn: () => request("return-preview", { ...current, alreadyApplied: applied }),
              previewReturnCorrection: (id, proposal) => request("correction-preview", { before: current, after: { ...current, ...proposal }, proposal, currency: "USD", expectedVersion: "synthetic", deltas: { refundMinor: 0, stockQuantity: 0, cogsReversalMinor: 0 }, availableBefore: 2, availableAfter: 2, canApply: true }),
              applyReturnCorrection: () => request("correction-apply", { state: {} }),
            };
            const child = React.createElement(Settlement, { key: ++generation, record: { id: "SYN-RETURN", status: applied ? "Closed" : "Inspected" }, service, isOwnerAuthorized: () => this.authorized, onApplied: () => { this.applied++; } });
            root.render(strict ? React.createElement(React.StrictMode, null, child) : child);
          },
          fields(strict, error = "A receipt is required.") {
            const fields = React.createElement("form", { key: "fields" },
              React.createElement("p", { id: "external-help" }, "Use your local records."),
              React.createElement(TextField, { id: "receipt", label: "Receipt reference", required: true, helper: "Find it on the receipt.", error, value: "", "aria-describedby": "external-help" }),
              React.createElement(TextField, { label: "Inspection notes", required: true, helper: "Describe the condition.", multiline: true, value: "" }),
              React.createElement(SelectField, { label: "Disposition", required: true, helper: "Choose after inspection.", value: "Restock", options: ["Restock", "Dispose"] }));
            root.render(strict ? React.createElement(React.StrictMode, null, fields) : fields);
          },
          resolve() { this.pending.splice(0).forEach(resolve => resolve()); },
          remove() { root.render(null); },
        };
      }, theme);
      for (const strict of [false, true]) {
        const checks = [], check = name => checks.push(name);
        await page.evaluate(strict => window.audit.fields(strict), strict);
        const receipt = page.getByRole("textbox", { name: "Receipt reference", exact: true });
        await expect(receipt).toHaveAttribute("aria-required", "true");
        await expect(receipt).toHaveAttribute("aria-invalid", "true");
        await expect(receipt).toHaveAccessibleDescription("Find it on the receipt. A receipt is required. Use your local records.");
        await expect(page.getByRole("textbox", { name: "Inspection notes", exact: true })).toHaveAccessibleDescription("Describe the condition.");
        await expect(page.getByRole("combobox", { name: "Disposition", exact: true })).toHaveAccessibleDescription("Choose after inspection.");
        assert.equal(await receipt.evaluate(node => node.required), false, "Keep existing application validation behavior.");
        assert.equal(await page.locator('label[for="receipt"]').count(), 1);
        check("concise names; linked helper, error and external descriptions; required semantics without changing validation");
        await page.evaluate(strict => window.audit.fields(strict, ""), strict);
        await expect(receipt).toHaveAttribute("aria-invalid", "false");
        await expect(receipt).toHaveAccessibleDescription("Find it on the receipt. Use your local records.");
        check("cleared errors do not leave stale descriptions");

        await page.evaluate(strict => window.audit.mount(strict), strict);
        const review = page.getByRole("button", { name: "Review stock & refund", exact: true });
        await review.focus(); await page.keyboard.press("Enter");
        await expect(page.getByRole("heading", { name: "Applied return totals", exact: true })).toBeFocused();
        await page.keyboard.press("Tab");
        const correct = page.getByRole("button", { name: "Correct applied return", exact: true });
        await expect(correct).toBeFocused(); await page.keyboard.press("Enter");
        const correction = page.getByRole("region", { name: "Return correction", exact: true });
        await expect(correction).toBeFocused(); await page.keyboard.press("Tab");
        await expect(page.getByRole("spinbutton", { name: "Corrected refund total (USD)", exact: true })).toBeFocused();
        await page.getByRole("textbox", { name: "Reason for correction", exact: true }).fill("Synthetic reason retained through review");
        await page.getByRole("button", { name: "Review correction", exact: true }).focus(); await page.keyboard.press("Enter");
        await expect(page.getByRole("heading", { name: "Review correction totals", exact: true })).toBeFocused();
        await page.keyboard.press("Tab");
        const confirm = page.getByRole("checkbox", { name: /I reviewed the before and after/ });
        await expect(confirm).toBeFocused(); await page.keyboard.press("Space");
        await expect(page.getByRole("button", { name: "Apply correction", exact: true })).toBeEnabled();
        check("keyboard entry and review focus lead to fields, totals and explicit confirmation");
        await page.screenshot({ path: path.join(output, `${theme}-${width}-${strict ? "strict" : "normal"}-review.png`), fullPage: true });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        check("review fits representative mobile/desktop viewport");

        await page.getByRole("button", { name: "Edit correction", exact: true }).click();
        await expect(correction).toBeFocused();
        await expect(page.getByRole("textbox", { name: "Reason for correction", exact: true })).toHaveValue("Synthetic reason retained through review");
        await page.evaluate(() => { window.audit.rejectNext = true; });
        await page.getByRole("button", { name: "Review correction", exact: true }).click();
        await expect(page.getByRole("alert")).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(page.getByRole("spinbutton", { name: "Corrected refund total (USD)", exact: true })).toBeFocused();
        check("edit restores form focus; service failure focuses error and retains keyboard route to draft");
        await page.getByRole("button", { name: "Cancel correction", exact: true }).click(); await expect(correct).toBeFocused();
        const reverse = page.getByRole("button", { name: "Reverse applied return", exact: true });
        await reverse.click(); await expect(correction).toBeFocused();
        await page.getByRole("button", { name: "Cancel correction", exact: true }).click(); await expect(reverse).toBeFocused();
        check("cancel restores the exact correction/reversal trigger");

        await correct.click();
        await page.getByRole("textbox", { name: "Reason for correction", exact: true }).fill("Synthetic delayed review");
        await page.evaluate(() => { window.audit.delayed = true; });
        await page.getByRole("button", { name: "Review correction", exact: true }).click();
        const outside = page.getByRole("button", { name: "Outside control", exact: true });
        await outside.focus(); await page.evaluate(() => { window.audit.resolve(); });
        await expect(page.getByRole("heading", { name: "Review correction totals", exact: true })).toBeVisible(); await expect(outside).toBeFocused();
        check("delayed results do not steal focus after navigation elsewhere");
        await page.evaluate(() => { window.audit.delayed = false; });
        await confirm.check(); await page.getByRole("button", { name: "Apply correction", exact: true }).click();
        await expect(review).toBeFocused(); assert.equal(await page.evaluate(() => window.audit.applied), 1);
        check("completed correction returns focus to refreshed review action");

        await page.evaluate(strict => window.audit.mount(strict, false), strict);
        await review.click(); await expect(page.getByRole("heading", { name: "Review return totals", exact: true })).toBeFocused();
        await page.getByRole("button", { name: "Cancel review", exact: true }).click(); await expect(review).toBeFocused();
        await page.evaluate(() => { window.audit.rejectNext = true; });
        await review.click(); await expect(page.getByRole("alert")).toBeFocused();
        await page.keyboard.press("Tab"); await expect(review).toBeFocused();
        check("settlement cancel and errors preserve keyboard position");

        await page.evaluate(() => { window.audit.delayed = true; }); await review.click();
        await outside.focus(); await page.evaluate(() => { window.audit.authorized = false; window.audit.resolve(); });
        await expect(outside).toBeFocused(); await expect(page.getByRole("heading", { name: "Review return totals", exact: true })).toHaveCount(0);
        check("revoked pending review cannot move focus or publish totals");
        await page.evaluate(strict => window.audit.mount(strict, false), strict);
        await page.evaluate(() => { window.audit.delayed = true; }); await review.click();
        await outside.focus(); await page.evaluate(() => { window.audit.remove(); window.audit.resolve(); });
        await expect(outside).toBeFocused(); await expect(page.getByRole("region", { name: "Return settlement", exact: true })).toHaveCount(0);
        check("unmounted pending review cannot move focus or republish content");
        results.push({ theme, width, mode: strict ? "StrictMode" : "normal", passed: true, checks });
      }
      await context.close();
    }
    assert.deepEqual(pageErrors, []);
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ passed: true, noSavedDataWrites: true, externalRequestsBlocked: true, results, pageErrors }, null, 2) + "\n");
    console.log(`${results.length} mobile/desktop theme and React-mode combinations passed; ${results.reduce((sum, row) => sum + row.checks.length, 0)} accessibility checks.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
