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

async function assertCode3Branding(page, label) {
  const visibleBranding = await page.evaluate(() => ({
    title: document.title,
    text: document.body.innerText,
    attributes: [...document.querySelectorAll("[aria-label], [title], [alt]")]
      .filter((element) => element.getClientRects().length)
      .flatMap((element) => [element.getAttribute("aria-label"), element.getAttribute("title"), element.getAttribute("alt")])
      .filter(Boolean)
      .join("\n"),
  }));
  assert.match(visibleBranding.title, /^Code 3(?: — .+)?$/, `${label} should use the centralized browser title`);
  assert.doesNotMatch(`${visibleBranding.text}\n${visibleBranding.attributes}`, /Ember\s*(?:&|and)\s*Tide|Private Business Hub/i, `${label} must not expose retired visible branding`);
  const manifest = await page.evaluate(async () => (await fetch("/manifest.webmanifest")).json());
  assert.equal(manifest.name, "Code 3");
  assert.equal(manifest.short_name, "Code 3");
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
    page.on("dialog", (dialog) => dialog.accept());
    await page.addInitScript(() => {
      const initializedKey = "code3.flip-scout-browser-test.initialized";
      if (sessionStorage.getItem(initializedKey)) return;
      localStorage.removeItem("ember-and-tide.flip-scout.v1");
      sessionStorage.setItem(initializedKey, "true");
    });

    await page.goto(appUrl("/find/deals"), { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Deal Feed", exact: true }).waitFor();
    assert.equal(await page.locator(".vite-error-overlay").count(), 0, "Vite error overlay should not render");
    assert.equal((await page.locator("body").innerText()).trim().length > 100, true, "Find route should not be blank");
    await assertCode3Branding(page, "mobile Find");
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
    const futureProgress = page.locator(".flip-analysis-steps button").nth(1);
    assert.equal(await futureProgress.isDisabled(), true, "future Deal Analysis steps should be disabled until reached");
    assert.ok((await futureProgress.boundingBox()).height >= 44, "Deal Analysis progress targets should remain at least 44px high");
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
    const intelligenceResult = page.locator(".code3-intelligence-result");
    await intelligenceResult.waitFor();
    assert.match(await intelligenceResult.getAttribute("data-recommendation"), /^(STRONG_BUY|BUY|WATCH|PASS|INSUFFICIENT_DATA)$/, "analysis should expose an advisory intelligence state");
    await intelligenceResult.getByText(/Strong Opportunity|Buy|Worth Watching|Pass|Not Enough Information/).first().waitFor();
    assert.match(await intelligenceResult.innerText(), /advisory only/i, "analysis must disclose that recommendations cannot purchase, offer, or bid");
    const resultRecommendation = await intelligenceResult.locator(".code3-intelligence-answer > div").nth(3).locator("strong").innerText();
    const stickyRecommendation = await page.locator(".ops-sticky-decision > div").first().locator("strong").innerText();
    assert.equal(stickyRecommendation, resultRecommendation, "mobile sticky recommendation must match the Code 3 result");
    const appraisalText = await page.locator(".ops-decision-panel").innerText();
    assert.doesNotMatch(appraisalText, /NaN|Infinity/, "appraisal should not display invalid numeric values");
    await assertNoHorizontalOverflow(page, "Deal decision at 360px");
    await page.getByRole("button", { name: "Save analysis", exact: true }).evaluate((button) => {
      button.click();
      button.click();
    });
    await page.getByText(/Analysis saved with its evidence/).waitFor();
    const initialHistory = await page.evaluate(() => (JSON.parse(localStorage.getItem("ember-and-tide.flip-scout.v1") || "{}").appraisals || []).filter((record) => record.recordType === "CODE3_INTELLIGENCE_ANALYSIS"));
    assert.equal(initialHistory.length, 1, "rapid duplicate save activation must create only one analysis revision");
    const savedRevision = initialHistory[0];
    assert.ok(savedRevision?.analyzedAt, "saved analysis should retain an analysis timestamp");

    await page.getByRole("button", { name: "Back to Deals", exact: true }).click();
    await (await openFindMore(page)).getByRole("button", { name: "Deal Analysis", exact: true }).click();
    const savedAnalyses = page.locator(".code3-saved-analyses");
    await savedAnalyses.locator("summary").click();
    await savedAnalyses.getByRole("button", { name: "Open", exact: true }).first().click();
    await page.getByRole("button", { name: "Save reanalysis", exact: true }).waitFor();
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".code3-intelligence-result").getAttribute("data-analyzed-at"), savedRevision.analyzedAt, "opening a saved revision must not immediately replace it with an unsaved recalculation");
    await page.locator(".code3-owner-review summary").click();
    await page.getByLabel("Owner-entered value").fill("1.234");
    await page.getByRole("button", { name: "Save reanalysis", exact: true }).click();
    await page.getByText(/more than two decimal places/i).waitFor();
    const historyAfterRejectedCorrection = await page.evaluate(() => (JSON.parse(localStorage.getItem("ember-and-tide.flip-scout.v1") || "{}").appraisals || []).filter((record) => record.recordType === "CODE3_INTELLIGENCE_ANALYSIS"));
    assert.equal(historyAfterRejectedCorrection.length, 1, "invalid owner correction must be rejected before a new revision is written");
    await page.getByLabel("Owner-entered value").fill("");
    await page.waitForFunction((analysisId) => {
      const draft = JSON.parse(sessionStorage.getItem("private-business-hub.deal-analysis-draft.v1") || "{}");
      return draft.analysisId === analysisId;
    }, savedRevision.id);
    const resumeFormDifferences = await page.evaluate((analysisId) => {
      const draft = JSON.parse(sessionStorage.getItem("private-business-hub.deal-analysis-draft.v1") || "{}");
      const record = (JSON.parse(localStorage.getItem("ember-and-tide.flip-scout.v1") || "{}").appraisals || []).find((entry) => entry.id === analysisId);
      const expected = { ...(record?.workflowSnapshot || {}), ownerConfirmedCondition: "", ownerManualEstimatedValue: "", dismissedWarningCodes: [], ownerReviewConfirmed: false };
      return [...new Set([...Object.keys(draft.form || {}), ...Object.keys(expected)])].filter((key) => JSON.stringify(draft.form?.[key]) !== JSON.stringify(expected[key])).map((key) => ({ key, draft: draft.form?.[key], expected: expected[key] }));
    }, savedRevision.id);
    assert.deepEqual(resumeFormDifferences, [], "the persisted draft should match the opened stored revision before reload");
    await page.goto(appUrl("/find/deal-analysis"), { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Save reanalysis", exact: true }).waitFor();
    assert.equal(await page.locator(".code3-intelligence-result").getAttribute("data-analyzed-at"), savedRevision.analyzedAt, "reloaded draft should resume the same saved analysis series without recomputing its stored view");
    await page.getByRole("button", { name: "Save reanalysis", exact: true }).click();
    await page.getByText(/Reanalysis saved/).waitFor();
    const savedAnalysesState = await page.evaluate(() => JSON.parse(localStorage.getItem("ember-and-tide.flip-scout.v1") || "{}"));
    const intelligenceHistory = (savedAnalysesState.appraisals || []).filter((record) => record.recordType === "CODE3_INTELLIGENCE_ANALYSIS");
    assert.equal(intelligenceHistory.length, 2, "reanalysis should append a second local revision");
    assert.equal(new Set(intelligenceHistory.map((record) => record.analysisSeriesId)).size, 1, "reanalysis should remain in one series");
    assert.equal(new Set(intelligenceHistory.map((record) => record.inputHash)).size, 1, "equivalent reopened inputs should retain the deterministic hash");
    const storedViewAnalyzedAt = await page.locator(".code3-intelligence-result").getAttribute("data-analyzed-at");
    await page.evaluate(() => {
      const key = "private-business-hub.deal-analysis-draft.v1";
      const draft = JSON.parse(sessionStorage.getItem(key) || "{}");
      draft.form = { ...(draft.form || {}), title: "Unsaved resumed draft title" };
      sessionStorage.setItem(key, JSON.stringify(draft));
    });
    await page.goto(appUrl("/find/deal-analysis"), { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Save reanalysis", exact: true }).waitFor();
    await page.getByText("Unsaved resumed draft title", { exact: true }).first().waitFor();
    await page.waitForFunction((previous) => document.querySelector(".code3-intelligence-result")?.getAttribute("data-analyzed-at") !== previous, storedViewAnalyzedAt);
    await page.getByRole("button", { name: "Back to Deals", exact: true }).click();
    await page.locator(".flip-main-nav").getByRole("button", { name: "Auctions", exact: true }).click();
    await page.getByRole("button", { name: "Add Auction", exact: true }).click();
    await page.getByLabel("Title").fill("Local estate auction");
    await page.getByLabel("Estimated resale midpoint").fill("500");
    await page.getByLabel("Buyer premium percentage").fill("10");
    await page.getByLabel("Tax rate").fill("6");
    await page.getByLabel("Desired profit").fill("100");
    await page.getByLabel("Desired ROI").fill("50");
    const auctionText = await page.locator(".flip-auction-calculation").innerText();
    assert.match(auctionText, /Maximum recommended bid/);
    assert.match(auctionText, /decision support only and never submits a bid/i);
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
    assert.equal(savedState.schemaVersion, 5);
    assert.equal(savedState.deals.length, 1);
    assert.equal(savedState.deals[0].listingUrl, "https://example.com/real-manual-listing");
    await page.getByRole("button", { name: "Back to Deals", exact: true }).click();
    await page.getByRole("heading", { name: "Manual vintage binder lead", exact: true }).waitFor();
    await page.getByRole("button", { name: "Review", exact: true }).click();
    const detailMore = page.locator(".ops-detail-more");
    await detailMore.locator("summary").click();
    await detailMore.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("heading", { name: "No listings match", exact: true }).waitFor();
    const stateAfterDelete = await page.evaluate(() => JSON.parse(localStorage.getItem("ember-and-tide.flip-scout.v1") || "{}"));
    assert.equal(stateAfterDelete.deals.length, 0, "Deal Inbox deletion should remove only the confirmed listing record");
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
    await assertCode3Branding(desktopPage, "desktop eBay Search");
    await assertNoHorizontalOverflow(desktopPage, "desktop eBay Search");
    await desktopPage.screenshot({ path: path.join(process.cwd(), "artifacts", "qa", "flip-scout-phase2-ebay-desktop.png"), fullPage: true });
    assert.deepEqual(desktopErrors, [], desktopErrors.join("\n"));
    await desktopPage.close();
    console.log("Flip Scout mobile route, listing intake and deletion, appraiser, auction calculator, eBay configuration truth, import review, persistence, and browser error checks passed.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
