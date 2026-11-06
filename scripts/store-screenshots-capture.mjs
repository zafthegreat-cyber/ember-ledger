// Captures raw app screens for store listings from the local dev server.
// Usage: node capture-store-shots.mjs <repoDir> <outDir>
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [repo, out] = process.argv.slice(2);
const require = createRequire(join(repo, "package.json"));
const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:5320";
mkdirSync(out, { recursive: true });

const SEED = () => {
  const d = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
  const base = { category: "Trading cards", forgeQuantity: 0, status: "Personal Collection", vaultStatus: "personal_collection", vaultCategory: "Personal collection", conditionName: "Near Mint", language: "English", destinationScope: ["vault"], recordType: "vault_item", businessInventory: false, ownedItemPurpose: "PERSONAL_COLLECTION", isWishlist: false, sourceType: "manual", workspaceId: "workspace-personal-local-beta", workspace_id: "workspace-personal-local-beta", workspaceName: "My Personal Space", workspaceType: "personal", workspaceScope: "workspace" };
  const rows = [["Elite trainer box", "Elite Trainer Box", 59.99, 49.99, 1, "Shelf 1"], ["Booster bundle (6 packs)", "Booster Bundle", 42.5, 29.99, 2, "Shelf 1"], ["Sealed booster box", "Booster Box", 165, 143.64, 1, "Closet bin A"], ["Collector tin", "Tin", 24.99, 19.99, 3, "Shelf 2"], ["Ember Drake holo rare 045/198", "Single Card", 18.5, 4, 1, "Binder A"], ["9-pocket binder, 360 cards", "Accessory", 29.99, 24.99, 1, "Desk"]];
  const now = Date.now();
  d.items = rows.map(([name, type, mp, cost, q, loc], i) => ({ ...base, id: `vault-shot-${i + 1}`, name, productType: type, marketPrice: mp, msrpPrice: cost, unitCost: cost, quantity: q, ownedQuantity: q, storageLocation: loc, createdAt: new Date(now - i * 86400000 * 3).toISOString() }));
  localStorage.setItem("et-tcg-beta-data", JSON.stringify(d));
  const s = JSON.parse(localStorage.getItem("et-tcg-beta-scout") || "{}");
  const stores = [["Target", "Target - Suffolk North", "Suffolk"], ["Walmart", "Walmart Supercenter - Chesapeake", "Chesapeake"], ["GameStop", "GameStop - Greenbrier", "Chesapeake"], ["Best Buy", "Best Buy - Virginia Beach", "Virginia Beach"], ["Barnes & Noble", "Barnes & Noble - Norfolk", "Norfolk"]];
  const notes = ["Elite trainer boxes and booster bundles on the end cap", "Two cases of tins just put out in electronics", "Restocked booster packs behind the counter", "Shelf is empty, staff said truck comes Thursday", "Collector tins and mini portfolios near the front"];
  const status = ["in_stock", "in_stock", "low_stock", "out_of_stock", "behind_counter"];
  const who = ["@baysidebinders", "@tidewatercollector", "@norfolkpulls", "@vbcardmom", "@greenbriertcg"];
  s.reports = stores.map(([chain, name, city], i) => {
    const t = new Date(now - (i * 47 + 12) * 60000);
    return { id: `5a5a5a5a-0000-4000-8000-00000000000${i}`, storeName: name, retailer: chain, city, state: "Virginia", region: "Hampton Roads / 757", userId: `bbbbbbbb-0000-4000-8000-00000000000${i}`, submittedByDisplay: who[i], reportDate: t.toISOString().slice(0, 10), reportTime: t.toTimeString().slice(0, 5), createdAt: t.toISOString(), observedAt: t.toISOString(), stockStatus: status[i], note: notes[i], visibility: "public", status: "Published", sourceType: "in_store" };
  });
  localStorage.setItem("et-tcg-beta-scout", JSON.stringify(s));
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function clickText(page, text, { starts = false } = {}) {
  await page.evaluate(({ text, starts }) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.offsetParent && (starts ? x.textContent.trim().startsWith(text) : x.textContent.trim() === text));
    b?.click();
  }, { text, starts });
  await wait(1200);
}
async function scrollToText(page, text, offset = 90) {
  await page.evaluate(({ text, offset }) => {
    const el = [...document.querySelectorAll("h1,h2,h3,strong,span,p")].find((x) => x.offsetParent && x.textContent.trim() === text);
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - offset);
  }, { text, offset });
  await wait(600);
}

const sets = [
  { name: "ios", viewport: { width: 380, height: 760 }, scale: 3 },
  { name: "play", viewport: { width: 360, height: 680 }, scale: 2.5 },
];

const browser = await chromium.launch();
for (const set of sets) {
  const context = await browser.newContext({ viewport: set.viewport, deviceScaleFactor: set.scale, colorScheme: "dark", isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${BASE}/?betaLocalMode=true`);
  await wait(3500);
  await page.evaluate(SEED);
  await page.addStyleTag({ content: ".scroll-to-top, [aria-label='Back to top'] { display: none !important; }" }).catch(() => {});
  const hideTop = () => page.addStyleTag({ content: "button[aria-label*='top' i], .back-to-top, .scroll-top-button { display:none !important }" });

  const shot = async (id) => { await hideTop(); await page.evaluate(() => document.activeElement?.blur()); await page.addStyleTag({ content: "*:focus, *:focus-visible { outline: none !important; box-shadow: none !important; }" }); await page.screenshot({ path: join(out, `${set.name}-${id}.png`) }); console.log("saved", set.name, id); };

  await page.goto(`${BASE}/?betaLocalMode=true`); await wait(3500); await shot("1-home");

  await page.goto(`${BASE}/scout?betaLocalMode=true`); await wait(3500);
  await clickText(page, "ReportsSubmit", { starts: true });
  await page.evaluate(() => { const el = document.querySelector(".scout-feed-report-card"); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 10); }); await wait(600);
  await shot("2-restocks");

  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.offsetParent && b.textContent.includes("View details"))?.click());
  await wait(1500); await page.evaluate(() => document.activeElement?.blur()); await shot("3-report-details");

  await page.goto(`${BASE}/scout?betaLocalMode=true`); await wait(3500);
  await clickText(page, "Report a restock");
  await wait(800); await shot("4-report-form");

  await page.goto(`${BASE}/vault?betaLocalMode=true`); await wait(3500);
  await clickText(page, "Portfolio", { starts: true });
  await scrollToText(page, "Your protected collection", 40);
  await shot("5-collection");

  await context.close();
}
await browser.close();
