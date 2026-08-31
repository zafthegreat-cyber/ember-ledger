const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173";
const ROUTES = [
  ["Collection", "/collection", /My Collection|Collection/],
  ["Business", "/business/inventory", /Inventory|Business/],
  ["Owner Center", "/owner-center/overview", /Owner Center|Owner Only/],
  ["Deal Analysis", "/find/deal-analysis", /Deal Analysis|Guided analysis/],
  ["Auctions", "/find/auctions", /Auctions/],
  ["Restocks", "/owner-center/restocks/live", /Restocks|Restock Intelligence/],
  ["eBay Search", "/find/ebay", /eBay Search|active eBay listings/i],
  ["Bot Operations", "/bot/tasks", /Bot Operations|No tasks|Local-only/i],
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, pathname, expected] of ROUTES) {
      const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const url = new URL(pathname, APP_URL);
      url.searchParams.set("betaLocalMode", "true");
      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await page.locator("body").waitFor({ state: "visible", timeout: 15000 });
      await page.waitForFunction(({ source, flags }) => new RegExp(source, flags).test(document.body.innerText), { source: expected.source, flags: expected.flags }, { timeout: 15000 });
      assert.equal(errors.length, 0, `${name} direct load should not raise browser errors`);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(({ source, flags }) => new RegExp(source, flags).test(document.body.innerText), { source: expected.source, flags: expected.flags }, { timeout: 15000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 1, `${name} should not overflow at 360px after refresh`);
      await page.close();
      console.log(`PASS ${name} direct load and refresh`);
    }
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exit(1); });
