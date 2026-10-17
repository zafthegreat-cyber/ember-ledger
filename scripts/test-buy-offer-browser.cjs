const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "Use a disposable local browser only.");
const requestedOutput = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/buy-offer/browser");
const output = fs.existsSync(path.join(requestedOutput, "results.json"))
  ? path.join(requestedOutput, `run-${new Date().toISOString().replace(/[:.]/g, "-")}`) : requestedOutput;
const draftKey = "code3.buy-offer-draft.v1";
const results = [];

async function localStorageSnapshot(page) {
  return page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
}

async function ready(page) {
  const screen = page.getByTestId("buy-offer-screen");
  await screen.getByRole("heading", { name: "Buy Offer", exact: true }).waitFor();
  await page.waitForFunction(() => localStorage.getItem("et-tcg-phase2-data") !== null);
  return screen;
}

function resultValue(screen, label) {
  return screen.locator("aside dl > div").filter({ has: screen.page().getByText(label, { exact: true }) }).locator("dd");
}

async function checkOffer(screen, { target, opening, ceiling, reference }) {
  await screen.getByRole("button", { name: "Calculate offer", exact: true }).click();
  await expect(screen.locator("aside")).toBeFocused();
  await expect(screen.getByText("Target offer", { exact: true }).locator("..").locator("strong")).toHaveText(target);
  await expect(resultValue(screen, "Open with")).toHaveText(opening);
  await expect(resultValue(screen, "Offer ceiling")).toHaveText(ceiling);
  if (reference) await expect(resultValue(screen, "Pricing reference")).toHaveText(reference);
}

async function safeVisualCheck(page, screen, theme) {
  assert.equal(await page.locator(".app").getAttribute("data-theme"), theme);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Page has no horizontal overflow");
  const small = await screen.locator('button:visible, summary:visible, input:not([type="radio"]):visible, select:visible, fieldset label:visible').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height < 43.5).map(node => node.textContent || node.getAttribute("aria-label") || node.name));
  assert.deepEqual(small, [], "Controls and radio labels provide 44px touch targets");
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce", colorScheme: theme });
      const page = await context.newPage();
      const errors = [], blockedRequests = [], checks = [];
      page.on("pageerror", error => errors.push(error.message));
      await context.route("**/*", route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== base.origin || request.method() !== "GET") {
          blockedRequests.push({ method: request.method(), origin: url.origin, pathname: url.pathname });
          return route.abort();
        }
        if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Local fixture: server not configured", configured: false, healthy: false }) });
        return route.continue();
      });
      await context.addInitScript(theme => localStorage.setItem("et-tcg-app-theme", theme), theme);
      try {
        await page.goto(new URL("/find/buy-offer?betaLocalMode=true", base).href);
        let screen = await ready(page);
        const storedBefore = await localStorageSnapshot(page);
        const blockedBefore = blockedRequests.length;
        await page.evaluate(() => {
          window.buyOfferFocusProof = [];
          document.addEventListener("focusin", event => {
            const target = event.target;
            if (!target.closest('[data-testid="buy-offer-screen"]')) return;
            if (target.name === "marketPrice") window.buyOfferFocusProof.push({ kind: "market", invalid: target.getAttribute("aria-invalid"), descriptions: (target.getAttribute("aria-describedby") || "").split(" ").map(id => document.getElementById(id)?.textContent || "") });
            if (target.tagName === "ASIDE") window.buyOfferFocusProof.push({ kind: "result", text: target.innerText });
          });
        });
        await expect(screen.locator("aside")).toContainText("What should you offer?");
        await expect(screen.locator("aside")).not.toContainText("$0.00");
        checks.push("Empty state has no invented monetary result");

        const market = screen.getByRole("textbox", { name: "Market value (USD)", exact: true });
        await screen.getByRole("button", { name: "Calculate offer", exact: true }).click();
        await expect(market).toBeFocused();
        await expect(market).toHaveAttribute("aria-invalid", "true");
        const description = await market.getAttribute("aria-describedby");
        assert.ok(description && description.split(" ").length >= 2, "Validation error and helper are associated with the input");
        const invalidFocus = await page.evaluate(() => window.buyOfferFocusProof.filter(row => row.kind === "market").at(-1));
        assert.equal(invalidFocus.invalid, "true", "Invalid aria state exists when focus arrives");
        assert.ok(invalidFocus.descriptions.some(text => text.includes("two decimal places")), "Error description exists when focus arrives");
        await market.fill("100.123");
        await screen.getByRole("button", { name: "Calculate offer", exact: true }).click();
        await expect(market).toBeFocused();
        await expect(screen.getByRole("alert")).toContainText("two decimal places");
        checks.push("Missing market and excess precision focus an accessibly described error");

        await screen.getByRole("textbox", { name: "Product or lot", exact: true }).fill("Synthetic collector product " + "W".repeat(100));
        await market.fill("100");
        await screen.getByRole("combobox", { name: "Product type", exact: true }).selectOption("sealed");
        await screen.getByRole("combobox", { name: "Availability", exact: true }).selectOption("scarce");
        await screen.getByRole("combobox", { name: "How sought after is it?", exact: true }).selectOption("high");
        await checkOffer(screen, { target: "$83.00", opening: "$78.85", ceiling: "$88.00", reference: "$100.00" });
        const resultFocus = await page.evaluate(() => window.buyOfferFocusProof.filter(row => row.kind === "result").at(-1));
        assert.match(resultFocus.text, /A starting point for this deal/);
        assert.match(resultFocus.text, /\$83\.00/, "Updated result exists when focus arrives");
        fs.writeFileSync(path.join(output, `focus-proof-${theme}-${width}.json`), JSON.stringify({ invalidFocus, resultFocus }, null, 2));
        await expect(screen.locator("aside")).toContainText("83% of market value");
        await safeVisualCheck(page, screen, theme);
        await screen.screenshot({ path: path.join(output, `buy-offer-${theme}-${width}.png`) });
        checks.push("Sealed/scarce/high-demand calculation and long-name responsive result");

        await screen.locator("summary").filter({ hasText: "Costs & offer settings" }).click();
        await screen.getByRole("textbox", { name: "Selling fee percentage", exact: true }).fill("15");
        await expect(screen.locator("aside")).toContainText("What should you offer?");
        await screen.getByRole("textbox", { name: "Other selling costs (USD)", exact: true }).fill("5");
        await screen.getByRole("textbox", { name: "Minimum profit (USD)", exact: true }).fill("10");
        await checkOffer(screen, { target: "$70.00", opening: "$66.50", ceiling: "$70.00" });
        await expect(resultValue(screen, "Profit at entered resale value")).toHaveText("$10.00");
        checks.push("Input edits clear the old result and the stricter resale cost ceiling applies");

        await screen.getByRole("textbox", { name: "MSRP (USD)", exact: true }).fill("60");
        await screen.getByRole("combobox", { name: "Availability", exact: true }).selectOption("retail");
        await screen.getByRole("combobox", { name: "How sought after is it?", exact: true }).selectOption("steady");
        await checkOffer(screen, { target: "$42.00", opening: "$39.90", ceiling: "$45.00", reference: "$60.00" });
        await screen.getByRole("textbox", { name: "Seller’s asking price (USD)", exact: true }).fill("30");
        await checkOffer(screen, { target: "$30.00", opening: "$28.50", ceiling: "$30.00" });
        checks.push("Retail availability uses lower MSRP reference and seller asking price caps both target and ceiling");

        await screen.getByRole("textbox", { name: "Seller’s asking price (USD)", exact: true }).fill("");
        await screen.getByRole("radio", { name: "My collection", exact: true }).check();
        await expect(screen.getByRole("textbox", { name: "Starting offer percentage", exact: true })).toHaveValue("85");
        await expect(screen.getByRole("textbox", { name: "Selling fee percentage", exact: true })).toHaveCount(0);
        await screen.getByRole("textbox", { name: "Buying costs (USD)", exact: true }).fill("10");
        await checkOffer(screen, { target: "$50.00", opening: "$47.50", ceiling: "$50.00", reference: "$60.00" });
        await expect(resultValue(screen, "Profit at entered resale value")).toHaveCount(0);
        await screen.getByRole("radio", { name: "Resale", exact: true }).check();
        await expect(screen.getByRole("textbox", { name: "Selling fee percentage", exact: true })).toHaveValue("15");
        await screen.getByRole("textbox", { name: "Minimum profit (USD)", exact: true }).fill("100");
        await screen.getByRole("button", { name: "Calculate offer", exact: true }).click();
        await expect(screen.locator("aside")).toContainText("No offer fits these costs");
        await expect(screen.getByText("Target offer", { exact: true })).toHaveCount(0);
        checks.push("Collection mode ignores retained resale inputs; costs that prevent a positive offer show a blocked result");

        await screen.getByRole("radio", { name: "My collection", exact: true }).check();
        await screen.getByRole("textbox", { name: "Starting offer percentage", exact: true }).fill("80");
        await screen.getByRole("radio", { name: "Resale", exact: true }).check();
        await expect(screen.getByRole("textbox", { name: "Starting offer percentage", exact: true })).toHaveValue("80");
        await screen.getByRole("radio", { name: "My collection", exact: true }).check();
        await checkOffer(screen, { target: "$48.00", opening: "$45.60", ceiling: "$50.00" });
        assert.deepEqual(await localStorageSnapshot(page), storedBefore, "Calculator operations do not write business data or preferences");
        assert.equal(blockedRequests.length, blockedBefore, "Calculator operations attempt no provider, auth or outbound calls");
        checks.push("A custom base percentage survives mode changes; calculations leave local business data unchanged");

        await page.reload(); screen = await ready(page);
        await expect(screen.getByRole("radio", { name: "My collection", exact: true })).toBeChecked();
        await expect(screen.getByRole("textbox", { name: "Market value (USD)", exact: true })).toHaveValue("100");
        await expect(screen.locator("aside")).toContainText("What should you offer?");
        await screen.locator("summary").filter({ hasText: "Costs & offer settings" }).click();
        await expect(screen.getByRole("textbox", { name: "Starting offer percentage", exact: true })).toHaveValue("80");
        await page.getByRole("button", { name: "Back to Deals", exact: true }).click();
        await expect(page).toHaveURL(/\/find\/deals/);
        await page.goBack(); screen = await ready(page);
        await expect(screen.getByRole("textbox", { name: "Market value (USD)", exact: true })).toHaveValue("100");
        await page.goForward(); await expect(page).toHaveURL(/\/find\/deals/);
        await page.locator(".flip-more-menu > summary").click();
        await page.locator(".flip-more-menu").getByRole("button", { name: "Buy Offer", exact: true }).click();
        screen = await ready(page);
        await expect(screen.getByRole("textbox", { name: "Market value (USD)", exact: true })).toHaveValue("100");
        await page.goto(new URL("/find/home?betaLocalMode=true", base).href);
        await page.getByRole("button", { name: "Buy Offer", exact: true }).click(); screen = await ready(page);
        await expect(screen.getByRole("textbox", { name: "Market value (USD)", exact: true })).toHaveValue("100");
        checks.push("Reload, Back/Forward, Find More and Find Home preserve calculator inputs");

        page.once("dialog", dialog => dialog.dismiss());
        await screen.getByRole("button", { name: "Reset inputs", exact: true }).click();
        await expect(screen.getByRole("textbox", { name: "Market value (USD)", exact: true })).toHaveValue("100");
        page.once("dialog", dialog => dialog.accept());
        await screen.getByRole("button", { name: "Reset inputs", exact: true }).click();
        await expect(screen.getByRole("textbox", { name: "Market value (USD)", exact: true })).toHaveValue("");
        await expect(screen.getByRole("textbox", { name: "Product or lot", exact: true })).toBeFocused();
        await expect(screen.getByRole("radio", { name: "My collection", exact: true })).toBeChecked();
        await safeVisualCheck(page, screen, theme);
        checks.push("Reset cancellation preserves inputs; confirmed reset keeps mode and returns focus");

        await page.evaluate(key => sessionStorage.setItem(key, "{broken"), draftKey);
        await page.reload(); screen = await ready(page);
        await expect(screen.getByRole("status")).toContainText("previous calculator draft could not be read");
        await expect(screen.getByRole("textbox", { name: "Market value (USD)", exact: true })).toHaveValue("");
        await page.evaluate(key => sessionStorage.setItem(key, JSON.stringify({ version: 1, form: { title: { html: "<script>throw Error('untrusted')</script>" }, marketPrice: { invalid: true }, mode: "malicious", productType: ["sealed"], basePercent: "9".repeat(500) } })), draftKey);
        await page.reload(); screen = await ready(page);
        await expect(screen.getByRole("textbox", { name: "Product or lot", exact: true })).toHaveValue("");
        await expect(screen.getByRole("textbox", { name: "Market value (USD)", exact: true })).toHaveValue("");
        await expect(screen.getByRole("combobox", { name: "Product type", exact: true })).toHaveValue("sealed");
        checks.push("Corrupt JSON and object-valued draft fields remain safe and recoverable");

        await page.addInitScript(key => {
          const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
          Storage.prototype.getItem = function(name) { if (this === sessionStorage && name === key) throw new DOMException("Synthetic denied storage", "SecurityError"); return get.call(this, name); };
          Storage.prototype.setItem = function(name, value) { if (this === sessionStorage && name === key) throw new DOMException("Synthetic denied storage", "QuotaExceededError"); return set.call(this, name, value); };
        }, draftKey);
        await page.reload(); screen = await ready(page);
        await expect(screen.getByRole("status")).toContainText("previous calculator draft could not be read");
        await screen.getByRole("textbox", { name: "Market value (USD)", exact: true }).fill("100");
        await expect(screen.getByRole("status")).toContainText("could not save your draft");
        await checkOffer(screen, { target: "$65.00", opening: "$61.75", ceiling: "$70.00" });
        await screen.screenshot({ path: path.join(output, `storage-unavailable-${theme}-${width}.png`) });
        checks.push("Denied draft storage reports the limitation while calculations remain usable");
        assert.deepEqual(errors, [], "No browser runtime errors");
        results.push({ theme, width, passed: true, checks, runtimeErrors: errors, blockedRequests });
      } catch (error) {
        results.push({ theme, width, passed: false, checks, error: error.message, runtimeErrors: errors, blockedRequests });
        await page.screenshot({ path: path.join(output, `failure-${theme}-${width}.png`), fullPage: true });
        fs.writeFileSync(path.join(output, `failure-${theme}-${width}.txt`), await page.locator("body").innerText());
        throw error;
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify({ checkedAt: new Date().toISOString(), passed: results.filter(row => row.passed).length, expected: 4, results }, null, 2));
  }
  console.log(`Buy offer browser: ${results.length}/4 contexts passed. Evidence: ${output}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
