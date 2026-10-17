const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");
const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/next-ten/manual-lifecycles");
const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
const results = [];

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const { createEmptyFlipScoutState } = await import("../src/features/flipScout/constants.js");
  const seed = createEmptyFlipScoutState();
  seed.inventory = [{ id: "native-card", name: "Synthetic Aurora card", quantity: 1, setName: "Synthetic set", cardNumber: "001", variant: "standard", ownedItemPurpose: "PERSONAL_COLLECTION", allocatedItemCost: 10 }, { id: "native-resale", name: "Synthetic resale card", quantity: 2, ownedItemPurpose: "FOR_RESALE", allocatedItemCost: 20 }];
  seed.auctions = [{ id: "native-auction", title: "Synthetic auction lot", outcome: "Won", source: "Manual", watchStatus: "Watching" }];
  seed.purchases = [{ id: "native-purchase", title: "Synthetic purchase", totalPurchaseCost: 25 }];
  seed.mileage = [{ id: "native-trip", purpose: "Synthetic sourcing trip", miles: 14 }];
  seed.sales = [{ id: "native-sale", inventoryItemId: "native-resale", quantitySold: 1, status: "Completed", grossSalePrice: 50, netProceeds: 50, realizedProfit: 30, allocatedCostOfGoodsSold: 20, saleDate: "2026-09-16", salesChannel: "Synthetic booth" }];
  const browser = await chromium.launch({ headless: true });
  let lastPage;
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const page = await context.newPage(); const errors = [];
      lastPage = page;
      page.setDefaultTimeout(20000);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error" && !/Failed to load resource|net::ERR_|favicon/i.test(message.text())) errors.push(message.text()); });
      page.on("dialog", (dialog) => dialog.accept());
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== base.origin || route.request().method() !== "GET") return route.abort();
        if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: JSON.stringify({ configured: false, healthy: false, status: "Not Configured" }) });
        return route.continue();
      });
      await context.addInitScript(({ seed, theme }) => {
        if (!sessionStorage.getItem("manual-lifecycle-fixture")) {
          localStorage.setItem("ember-and-tide.flip-scout.v1", JSON.stringify(seed));
          localStorage.setItem("et-tcg-app-theme", theme);
          sessionStorage.setItem("manual-lifecycle-fixture", "1");
        }
      }, { seed, theme });
      const go = async (route) => { const url = new URL(route, base); url.searchParams.set("betaLocalMode", "true"); await page.goto(url.href); await page.locator(".app[data-theme]").waitFor(); };
      const panel = () => page.locator(".manual-lifecycles").first();
      const form = () => page.locator(".manual-lifecycle-form");
      const review = () => page.locator(".manual-lifecycle-review");
      const bytes = () => page.evaluate(() => localStorage.getItem("ember-and-tide.flip-scout.v1"));
      const capture = async (name) => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name} overflow`);
        const controls = await page.locator(".manual-lifecycles button:visible, .manual-lifecycles input:visible, .manual-lifecycles select:visible").evaluateAll((elements) => elements.map((element) => ({ text: element.textContent || element.getAttribute("id"), height: element.getBoundingClientRect().height, width: element.getBoundingClientRect().width })));
        assert.ok(controls.every((control) => control.height >= 43.5 && control.width > 0), JSON.stringify(controls.filter((control) => control.height < 43.5)));
        assert.equal(await page.locator(".app").getAttribute("data-theme"), theme);
        await page.screenshot({ path: path.join(output, `${name}-${theme}-${width}.png`), fullPage: true });
      };
      await go("/collection/sets"); await panel().getByRole("button", { name: "Add Binder", exact: true }).click();
      await form().getByLabel("Title", { exact: true }).fill("Synthetic album");
      await form().getByLabel("Pages", { exact: true }).fill("2");
      await capture("binder-form");
      await form().getByRole("button", { name: "Save record", exact: true }).click(); await review().waitFor();
      await review().getByRole("button", { name: "Back to Binder records" }).click();
      await panel().getByRole("button", { name: "Slot assignment", exact: true }).click();
      await panel().getByRole("button", { name: "Add Slot assignment", exact: true }).click();
      await form().getByLabel("Owned item", { exact: true }).selectOption("native-card");
      await form().getByLabel("Binder", { exact: true }).selectOption({ label: "Synthetic album" });
      await form().getByLabel("Slot", { exact: true }).fill("3");
      await form().getByRole("button", { name: "Save record", exact: true }).click(); await review().waitFor();
      await page.reload(); await panel().waitFor();
      await panel().locator(".manual-lifecycle-card").filter({ hasText: "Synthetic album" }).click();
      assert.match(await review().locator(".manual-binder-preview").innerText(), /Synthetic Aurora card/);
      await capture("binder-preview");
      const beforePreview = await bytes(); await review().getByLabel("Preview page").selectOption("2"); await review().getByLabel("Preview page").selectOption("1"); assert.equal(await bytes(), beforePreview, "Preview must not write");
      await go("/collection/wishlist"); await panel().getByRole("button", { name: "Add Wishlist target", exact: true }).click();
      for (const [label, value] of [["Title", "Wanted Aurora"], ["Set name", "Synthetic set"], ["Collector number", "001"]]) await form().getByLabel(label, { exact: true }).fill(value);
      await form().getByRole("button", { name: "Save record", exact: true }).click(); await review().waitFor(); assert.match(await review().innerText(), /Matching owned records[\s\S]*Synthetic Aurora card/); await capture("wishlist-match");
      await go("/collection/grading"); await panel().getByRole("button", { name: "Add Grading submission", exact: true }).click(); await form().getByLabel("Owned item").selectOption("native-card"); await form().getByLabel("Grading company").fill("Synthetic grader"); await form().getByLabel("Submission reference").fill("SYN-NATIVE"); await form().getByRole("button", { name: "Save record", exact: true }).click(); await review().waitFor(); await capture("grading-record");
      await go("/find/auctions"); await panel().getByRole("button", { name: "Add Auction event", exact: true }).click();
      for (const [label, value] of [["Title", "Synthetic sale event"], ["Source", "Manual source"], ["Source terms", "Buyer premium 10%, pickup by appointment"], ["Starts", "2026-10-01T12:00"], ["Ends", "2026-10-01T14:00"], ["Pickup deadline", "2026-10-02T12:00"]]) await form().getByLabel(label, { exact: true }).fill(value);
      await form().getByRole("button", { name: "Save record", exact: true }).click(); await review().waitFor();
      const beforeCalendar = await bytes(); const [file] = await Promise.all([page.waitForEvent("download"), review().getByRole("button", { name: "Download calendar entry" }).click()]); assert.ok(file.suggestedFilename().endsWith(".ics")); assert.equal(await bytes(), beforeCalendar); await capture("event-calendar");
      await review().getByRole("button", { name: "Back to Auction event records" }).click(); await panel().getByRole("button", { name: "Sourcing visit", exact: true }).click(); await panel().getByRole("button", { name: "Add Sourcing visit", exact: true }).click();
      await form().getByLabel("Title", { exact: true }).fill("Synthetic pickup visit"); await form().getByLabel("Exact store or source reference").fill("exact-store-001"); await form().getByLabel("Recorded mileage trip").selectOption("native-trip"); await form().getByLabel("Recorded purchase").selectOption("native-purchase"); await form().getByLabel("Outcome").selectOption("Purchased"); await form().getByRole("button", { name: "Save record", exact: true }).click(); await review().waitFor(); await capture("visit-links");
      await go("/business/inventory"); await page.getByRole("button", { name: "Open Synthetic resale card", exact: true }).click(); await panel().getByRole("button", { name: "Add Processing & storage", exact: true }).click(); await form().getByLabel("Status").selectOption("Stored"); await form().getByLabel("Storage location").fill("Synthetic BIN-A"); await form().getByRole("button", { name: "Save record", exact: true }).click(); await review().waitFor();
      const beforeLabel = await bytes(); const [label] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download label for printing" }).click()]); assert.ok(label.suggestedFilename().endsWith(".svg")); assert.equal(await bytes(), beforeLabel); await capture("storage-label");
      await go("/business/sales"); await page.locator(".everyday-record-card").first().click(); await panel().getByRole("button", { name: "Add Manual shipment", exact: true }).click(); await form().getByRole("button", { name: "Save record", exact: true }).click(); await review().waitFor(); await capture("shipment");
      await go("/business/money/reports"); await panel().getByLabel("Channel / booth").selectOption("Synthetic booth"); const beforeReport = await bytes(); const [csv] = await Promise.all([page.waitForEvent("download"), panel().getByRole("button", { name: "Download statement CSV" }).click()]); assert.ok(csv.suggestedFilename().endsWith(".csv")); assert.equal(await bytes(), beforeReport); await capture("booth-statement");
      assert.deepEqual(JSON.parse(await bytes()).inventory, seed.inventory, "All operations preserve the same physical Inventory records and quantities");
      assert.deepEqual(errors, [], "No runtime errors");
      results.push({ theme, width, passed: true, scenarios: ["binder form/save/reload/slot preview", "wishlist exact match", "grading draft", "event/calendar download", "visit/mileage/purchase links", "processing/storage/label download", "shipment draft", "channel statement"], physicalInventoryPreserved: true });
      await context.close();
    }
  } catch (error) { if (lastPage && !lastPage.isClosed()) { await lastPage.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); fs.writeFileSync(path.join(output, "failure.html"), await lastPage.content()); fs.writeFileSync(path.join(output, "failure.txt"), await lastPage.locator("body").innerText()); } throw error; } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, "browser-results.json"), JSON.stringify({ passed: results.length, results }, null, 2));
  console.log(`Manual lifecycles browser: ${results.length}/4 contexts passed.`);
}
main().catch((error) => { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, "browser-failure.json"), JSON.stringify({ completed: results, error: error.stack }, null, 2)); console.error(error); process.exitCode = 1; });
