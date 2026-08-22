const path = require("node:path");
const fs = require("node:fs/promises");
const { chromium } = require("@playwright/test");

const APP_URL = process.env.APP_URL || "http://127.0.0.1:5318";
const PHASE = process.argv[2] || "after";
const OUTPUT_DIR = path.join(process.cwd(), "artifacts", "qa", "ui-foundation-replacement", PHASE);

async function openPage(browser, viewport, route) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  await page.goto(`${APP_URL}${route}${route.includes("?") ? "&" : "?"}betaLocalMode=true`, { waitUntil: "domcontentloaded" });
  await page.locator("body").waitFor({ state: "visible" });
  await page.waitForTimeout(1800);
  return page;
}

async function capture(page, filename) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUTPUT_DIR, filename), fullPage: true });
}

async function chooseFeatureView(page, names) {
  for (const name of names) {
    const button = page.locator(".flip-main-nav button, .ops-find-nav button").filter({ hasText: name });
    if (await button.count()) {
      await button.click();
      return;
    }
  }
  throw new Error(`Could not find a feature view button: ${names.join(", ")}`);
}

async function seedImportReview(page) {
  await page.evaluate(() => {
    const key = "ember-and-tide.flip-scout.v1";
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    const now = new Date().toISOString();
    saved.schemaVersion = Math.max(Number(saved.schemaVersion || 0), 2);
    saved.providerListings = [
      {
        id: "ebay-qa-new",
        providerId: "ebay",
        externalListingId: "qa-new-001",
        title: "Vintage trading card binder collection",
        listingUrl: "https://www.ebay.com/itm/qa-new-001",
        askingPrice: 240,
        purchaseShipping: 18,
        sellerName: "QA fixture seller",
        sellerRating: "99.7%",
        location: "Richmond, Virginia",
        imageReferences: [],
        reviewStatus: "Pending Review",
        sourceChangeType: "new",
        listingCreationTime: now,
        lastCheckedAt: now,
        dataSourceExplanation: "eBay Browse API active-listing fixture for local visual QA.",
      },
      {
        id: "ebay-qa-changed",
        providerId: "ebay",
        externalListingId: "qa-changed-002",
        title: "Sealed trading card product lot — price changed",
        listingUrl: "https://www.ebay.com/itm/qa-changed-002",
        askingPrice: 175,
        purchaseShipping: 12,
        sellerName: "Fixture collectibles",
        location: "Norfolk, Virginia",
        reviewStatus: "Needs Re-review",
        sourceChangeType: "updated",
        lastCheckedAt: now,
        dataSourceExplanation: "eBay Browse API active-listing fixture for local visual QA.",
      },
      {
        id: "ebay-qa-expired",
        providerId: "ebay",
        externalListingId: "qa-expired-003",
        title: "Ended mixed card lot",
        listingUrl: "https://www.ebay.com/itm/qa-expired-003",
        askingPrice: 90,
        reviewStatus: "Expired",
        sourceChangeType: "expired",
        isExpired: true,
        lastCheckedAt: now,
        dataSourceExplanation: "eBay Browse API active-listing fixture for local visual QA.",
      },
    ];
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1600);
}

async function prepareDecision(page) {
  await page.evaluate(() => sessionStorage.removeItem("private-business-hub.deal-analysis-draft.v1"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await chooseFeatureView(page, ["Deal Analysis", "Appraiser", "Analyze"]);
  await page.evaluate(() => {
    sessionStorage.setItem("private-business-hub.deal-analysis-draft.v1", JSON.stringify({
      step: 4,
      form: {
        marketplace: "Manual entry",
        title: "Local binder opportunity",
        productClassification: "Binder or collection",
        purchasePrice: "100",
        purchaseShipping: "10",
        expectedResaleLow: "160",
        expectedResaleMidpoint: "210",
        expectedResaleHigh: "260",
        expectedSellingPlatform: "eBay",
        sellingFeePercentage: "10",
        minimumDesiredProfit: "30",
        minimumDesiredRoi: "25",
        confidence: "Medium",
        riskNotes: "Condition must be verified in person",
      },
    }));
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".ops-decision-panel").waitFor();
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const mobileHome = await openPage(browser, { width: 360, height: 800 }, "/");
    await capture(mobileHome, "mobile-home.png");
    await mobileHome.close();

    const desktopHome = await openPage(browser, { width: 1440, height: 960 }, "/");
    await capture(desktopHome, "desktop-home.png");
    await desktopHome.close();

    const mobileFind = await openPage(browser, { width: 360, height: 800 }, "/scout/flip-scout");
    await chooseFeatureView(mobileFind, ["Deal Feed", "Deal Inbox", "Listings"]);
    await capture(mobileFind, "mobile-find-deal-feed.png");

    const desktopFind = await openPage(browser, { width: 1440, height: 960 }, "/scout/flip-scout");
    await chooseFeatureView(desktopFind, ["Deal Feed", "Deal Inbox", "Listings"]);
    await capture(desktopFind, "desktop-find-deal-feed.png");
    await desktopFind.close();

    await chooseFeatureView(mobileFind, ["eBay Search", "eBay"]);
    await capture(mobileFind, "mobile-ebay-search.png");
    await seedImportReview(mobileFind);
    await chooseFeatureView(mobileFind, ["eBay Search", "eBay"]);
    const reviewFilter = mobileFind.getByLabel("Review state", { exact: true });
    if (await reviewFilter.count()) await reviewFilter.selectOption("All");
    await capture(mobileFind, "mobile-import-review.png");
    await mobileFind.close();

    const desktopEbay = await openPage(browser, { width: 1440, height: 960 }, "/scout/flip-scout");
    await chooseFeatureView(desktopEbay, ["eBay Search", "eBay"]);
    await capture(desktopEbay, "desktop-ebay-search.png");
    await desktopEbay.close();

    const decision = await openPage(browser, { width: 360, height: 800 }, "/scout/flip-scout");
    await prepareDecision(decision);
    await capture(decision, "mobile-deal-decision.png");
    await decision.close();
  } finally {
    await browser.close();
  }
  console.log(`Captured UI redesign ${PHASE} screenshots in ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
