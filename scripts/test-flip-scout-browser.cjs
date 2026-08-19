const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const APP_BASE_URL = new URL(process.env.APP_URL || "http://127.0.0.1:5200/");

function appUrl(pathname) {
  const url = new URL(pathname, APP_BASE_URL);
  url.searchParams.set("betaLocalMode", "true");
  return url.toString();
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.equal(overflow <= 1, true, `${label} should not overflow horizontally (difference: ${overflow}px)`);
}

async function openFindMore(page) {
  const menu = page.locator(".flip-more-menu");
  if (!(await menu.evaluate((element) => element.open))) await menu.locator("summary").click();
  return menu;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1 });
    const browserErrors = [];
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      const sourceUrl = message.location()?.url || "";
      const expectedFrontendOnlyHealthCheck = /\/api\/ebay\/health(?:\?|$)/i.test(sourceUrl);
      if (message.type() === "error" && !expectedFrontendOnlyHealthCheck && !/favicon|ResizeObserver/i.test(message.text())) {
        browserErrors.push(`console: ${message.text()}${sourceUrl ? ` (${sourceUrl})` : ""}`);
      }
    });
    await page.addInitScript(() => localStorage.removeItem("ember-and-tide.flip-scout.v1"));

    await page.goto(appUrl("/find/deals"), { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Deal Feed", exact: true }).waitFor();
    assert.equal(await page.locator(".vite-error-overlay").count(), 0, "Vite error overlay should not render");
    assert.equal((await page.locator("body").innerText()).trim().length > 100, true, "Find route should not be blank");
    await assertNoHorizontalOverflow(page, "Deal Feed at 360px");

    await page.getByRole("button", { name: "Paste Listing", exact: true }).click();
    await page.getByLabel("Listing URL").fill("https://example.com/real-manual-listing");
    await page.getByLabel("Title").fill("Manual vintage binder lead");
    await page.getByLabel("Asking price").fill("125");
    await page.getByLabel("Purchase shipping").fill("15");
    await page.getByRole("button", { name: "Save listing", exact: true }).click();
    await page.getByRole("heading", { name: "Manual vintage binder lead" }).waitFor();
    await assertNoHorizontalOverflow(page, "Deal Feed after manual listing at 360px");

    await (await openFindMore(page)).getByRole("button", { name: "Deal Analysis", exact: true }).click();
    await page.getByLabel("Title").fill("Manual appraiser check");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Asking price").fill("100");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Expected resale midpoint").fill("200");
    await page.getByLabel("Selling fee percentage").fill("10");
    await page.getByLabel("Minimum desired profit").fill("25");
    await page.getByLabel("Minimum desired ROI").fill("20");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByText(/Strong Opportunity|Exceptional Deal|Worth an Offer|Fair Price/).first().waitFor();
    const appraisalText = await page.locator(".ops-decision-panel").innerText();
    assert.doesNotMatch(appraisalText, /NaN|Infinity/, "appraisal should not display invalid numeric values");
    await assertNoHorizontalOverflow(page, "Deal decision at 360px");

    await page.locator(".flip-main-nav").getByRole("button", { name: "Auctions", exact: true }).click();
    await page.getByRole("button", { name: "Add Auction", exact: true }).click();
    await page.getByLabel("Title").fill("Local estate auction");
    await page.getByLabel("Estimated resale midpoint").fill("500");
    await page.getByLabel("Buyer premium percentage").fill("10");
    await page.getByLabel("Tax rate").fill("6");
    await page.getByLabel("Desired profit").fill("100");
    await page.getByLabel("Desired ROI").fill("50");
    const auctionText = await page.locator(".flip-auction-calculation").innerText();
    assert.match(auctionText, /Calculated maximum hammer bid/);
    assert.doesNotMatch(auctionText, /NaN|Infinity/);
    await assertNoHorizontalOverflow(page, "Auctions at 360px");

    await (await openFindMore(page)).getByRole("button", { name: "eBay Search", exact: true }).click();
    await page.getByRole("heading", { name: "eBay Browse API" }).first().waitFor();
    await page.waitForTimeout(250);
    const ebayText = await page.locator(".flip-scout-main").innerText();
    console.log(`eBay smoke state: ${ebayText.replace(/\s+/g, " ").slice(0, 500)}`);
    await page.getByText("Not Configured", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Search eBay", exact: true }).isDisabled(), true, "live eBay search stays disabled without server credentials");
    await page.getByRole("heading", { name: "No eBay discoveries to review" }).waitFor();
    assert.match(ebayText, /active eBay listings, not sold comparable records/i);
    assert.match(ebayText, /Import Review/i);
    await assertNoHorizontalOverflow(page, "eBay Search at 360px");

    const savedState = await page.evaluate(() => JSON.parse(localStorage.getItem("ember-and-tide.flip-scout.v1") || "{}"));
    assert.equal(savedState.schemaVersion, 2);
    assert.equal(savedState.deals.length, 1);
    assert.equal(savedState.deals[0].listingUrl, "https://example.com/real-manual-listing");
    await page.screenshot({ path: path.join(process.cwd(), "artifacts", "qa", "flip-scout-phase2-ebay-mobile.png"), fullPage: true });
    assert.deepEqual(browserErrors, [], browserErrors.join("\n"));

    const desktopPage = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    const desktopErrors = [];
    desktopPage.setDefaultTimeout(15000);
    desktopPage.on("pageerror", (error) => desktopErrors.push(`pageerror: ${error.message}`));
    desktopPage.on("console", (message) => {
      const sourceUrl = message.location()?.url || "";
      const expectedFrontendOnlyHealthCheck = /\/api\/ebay\/health(?:\?|$)/i.test(sourceUrl);
      if (message.type() === "error" && !expectedFrontendOnlyHealthCheck && !/favicon|ResizeObserver/i.test(message.text())) {
        desktopErrors.push(`console: ${message.text()}${sourceUrl ? ` (${sourceUrl})` : ""}`);
      }
    });
    await desktopPage.goto(appUrl("/find/ebay"), { waitUntil: "domcontentloaded" });
    await desktopPage.getByRole("heading", { name: "eBay Browse API" }).first().waitFor();
    await desktopPage.getByText("Not Configured", { exact: true }).waitFor();
    await assertNoHorizontalOverflow(desktopPage, "desktop eBay Search");
    await desktopPage.screenshot({ path: path.join(process.cwd(), "artifacts", "qa", "flip-scout-phase2-ebay-desktop.png"), fullPage: true });
    assert.deepEqual(desktopErrors, [], desktopErrors.join("\n"));
    await desktopPage.close();
    console.log("Flip Scout mobile route, listing intake, appraiser, auction calculator, eBay configuration truth, import review, persistence, and browser error checks passed.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
