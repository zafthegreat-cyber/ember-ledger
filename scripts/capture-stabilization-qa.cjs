const path = require("node:path");
const fs = require("node:fs/promises");
const { chromium } = require("@playwright/test");

const APP_URL = process.env.APP_URL || "http://127.0.0.1:5318";
const OUTPUT_DIR = path.join(process.cwd(), "artifacts", "qa", "stabilization-2026-08-14", "screenshots");

function qaState() {
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    updatedAt: now,
    deals: [{ id: "qa-deal", providerId: "manual-url", externalListingId: "qa-listing", marketplace: "Manual URL", source: "Manual URL", title: "QA Sample Binder Listing", listingUrl: "https://example.invalid/qa-listing", askingPrice: 145, purchaseShipping: 15, projectedResaleLow: 210, projectedResaleMid: 245, projectedResaleHigh: 280, projectedProfit: 52, projectedRoi: 0.32, confidence: "Medium", riskLevel: "Medium", status: "Needs Review", dataSourceExplanation: "Temporary local QA fixture; not a live marketplace result.", createdAt: now, updatedAt: now }],
    appraisals: [],
    auctions: [{ id: "qa-auction", title: "QA Sample Local Auction", source: "Manual auction", auctionType: "Local auction", currentBid: 80, myMaximumBid: 135, estimatedResaleMid: 240, riskLevel: "Medium", watchStatus: "Watching", endDateTime: new Date(Date.now() + 86400000).toISOString(), createdAt: now, updatedAt: now }],
    searchRules: [],
    purchases: [{ id: "qa-purchase", title: "QA Sample Collection Purchase", source: "Local seller", purchaseDate: now.slice(0, 10), totalPurchaseCost: 120, notes: "Temporary visual QA fixture.", createdAt: now, updatedAt: now }],
    lots: [{ id: "qa-lot", purchaseId: "qa-purchase", title: "QA Sample Purchase Lot", totalLotCost: 120, allocationMethod: "manual", notes: "Costs reconcile across the two QA items.", createdAt: now, updatedAt: now }],
    inventory: [
      { id: "qa-collection", purchaseId: "qa-purchase", lotId: "qa-lot", name: "QA Collection Binder", quantity: 1, productClassification: "Binder or collection", ownedItemPurpose: "PERSONAL_COLLECTION", setName: "QA Sample Set", condition: "Mixed", purchaseSource: "Local seller", purchaseDate: now.slice(0, 10), allocatedItemCost: 70, projectedResaleMid: 140, storageLocation: "QA shelf", notes: "Temporary visual QA fixture.", purposeHistory: [], createdAt: now, updatedAt: now },
      { id: "qa-inventory", purchaseId: "qa-purchase", lotId: "qa-lot", name: "QA Resale Card Lot", quantity: 2, productClassification: "Mixed lot", ownedItemPurpose: "FOR_RESALE", condition: "Mixed", purchaseSource: "Local seller", purchaseDate: now.slice(0, 10), allocatedItemCost: 50, projectedResaleLow: 85, projectedResaleMid: 110, projectedResaleHigh: 135, storageLocation: "QA inventory bin", intendedSalesChannel: "Local show", status: "In stock", notes: "Temporary visual QA fixture.", purposeHistory: [], createdAt: now, updatedAt: now },
    ],
    sales: [{ id: "qa-sale", inventoryItemId: "qa-inventory", quantitySold: 1, salesChannel: "Local show", saleDate: now.slice(0, 10), grossSalePrice: 65, discounts: 0, sellingFees: 3, paymentFees: 1, shippingChargedToBuyer: 0, actualOutboundShipping: 0, packaging: 1, refunds: 0, otherCosts: 0, allocatedCostOfGoodsSold: 25, netProceeds: 60, realizedProfit: 35, realizedRoi: 1.4, status: "Completed", notes: "Temporary visual QA fixture.", createdAt: now, updatedAt: now }],
    expenses: [{ id: "qa-expense", date: now.slice(0, 10), category: "Supplies", merchant: "QA Merchant", description: "QA sample sleeves", amount: 8, paymentMethod: "Card", businessPercentage: 100, receiptReference: "QA-RECEIPT", notes: "Temporary visual QA fixture.", createdAt: now, updatedAt: now }],
    mileage: [{ id: "qa-mileage", date: now.slice(0, 10), startLocation: "QA start", destination: "QA local pickup", purpose: "Inventory pickup", miles: 12.4, relatedRecordType: "purchase", relatedRecordId: "qa-purchase", notes: "Temporary visual QA fixture.", createdAt: now, updatedAt: now }],
    activity: [{ id: "qa-activity", title: "QA sample records loaded", detail: "Temporary local visual fixture", createdAt: now }],
    providerListings: [],
  };
}

async function makePage(browser, viewport, route) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await context.addInitScript((state) => localStorage.setItem("ember-and-tide.flip-scout.v1", JSON.stringify(state)), qaState());
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/^Failed to load resource:/i.test(message.text())) errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${APP_URL}${route}${route.includes("?") ? "&" : "?"}betaLocalMode=true`, { waitUntil: "domcontentloaded" });
  await page.locator("body").waitFor({ state: "visible" });
  await page.waitForTimeout(1200);
  return { context, page, errors };
}

async function capture(browser, viewport, route, filename, prepare) {
  const session = await makePage(browser, viewport, route);
  try {
    if (prepare) await prepare(session.page);
    await session.page.waitForTimeout(350);
    await session.page.screenshot({ path: path.join(OUTPUT_DIR, filename), fullPage: true });
    if (session.errors.length) throw new Error(`${filename} browser errors:\n${session.errors.join("\n")}`);
  } finally {
    await session.context.close();
  }
}

async function openRecord(page, recordTitle) {
  const card = page.locator(".everyday-record-card").filter({ hasText: recordTitle });
  await card.getByRole("button", { name: "View Details", exact: true }).click();
  await page.locator(".ops-record-detail").waitFor({ state: "visible" });
}

async function openGlobalAdd(page) {
  const buttons = page.locator('button[aria-label="Open global Add menu"]');
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index);
    if (await button.isVisible()) {
      await button.click();
      await page.locator('.flow-modal[data-flow="addActionSheet"]').waitFor({ state: "visible" });
      return;
    }
  }
  throw new Error("Global Add control was not visible.");
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const views = [
    ["home", "/"],
    ["find", "/find/deals"],
    ["collection", "/collection"],
    ["business", "/business/purchases"],
    ["inventory", "/business/inventory"],
    ["sales", "/business/sales"],
    ["money", "/business/money/expenses"],
    ["owner-center", "/owner-center/overview"],
    ["deal-analysis", "/find/deal-analysis"],
  ];
  try {
    for (const [device, viewport] of [["mobile", { width: 360, height: 800 }], ["desktop", { width: 1440, height: 960 }]]) {
      for (const [name, route] of views) await capture(browser, viewport, route, `${device}-${name}.png`);
      await capture(browser, viewport, "/collection", `${device}-collection-detail.png`, (page) => openRecord(page, "QA Collection Binder"));
      await capture(browser, viewport, "/business/purchases", `${device}-purchase-detail.png`, (page) => openRecord(page, "QA Sample Collection Purchase"));
      await capture(browser, viewport, "/business/inventory", `${device}-inventory-detail.png`, (page) => openRecord(page, "QA Resale Card Lot"));
      await capture(browser, viewport, "/", `${device}-global-add.png`, openGlobalAdd);
    }
  } finally {
    await browser.close();
  }
  console.log(`Captured stabilization screenshots in ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
