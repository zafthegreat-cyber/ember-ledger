// Offline beta simulation worker. Generates deterministic synthetic users and
// runs the app's real domain modules against them. No network, no production
// data, no writes outside the artifacts directory. Each worker handles a range
// of user indices and posts aggregated metrics back to the parent.
import { parentPort, workerData } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { summarizeCollectionPortfolio } from "../../src/utils/collectionValueCoverage.mjs";
import { buildPortfolioCsv, summarizePortfolio } from "../../src/utils/collectionPortfolio.mjs";
import { deriveSetCompletionSummary } from "../../src/utils/vaultSetMastery.js";
import {
  buildMileageExportRows, buildSalesExportRows, buildTaxRecordExportRows, buildYearEndTaxSummary,
  groupMileageByVehicle, summarizeSalesRecords, validateManualSaleDraft,
} from "../../src/utils/businessTaxRecords.js";
import { describeExport, fieldsFromRows } from "../../src/utils/exportDisclosure.mjs";
import { canUseFeature, getUserTier, PLAN_IDS } from "../../src/services/featureGates.js";
import { betaAccessAllowedForProfile } from "../../src/utils/betaAccessUtils.js";
import { validateTidepoolPostDraft, validateMarketplaceListingDraft } from "../../src/utils/communitySafety.js";
import { canUserCreateTidepoolPost, buildTidepoolPost, tidepoolStatusVisibility } from "../../src/utils/tidepoolCommunity.js";
import { validateSparkApplication } from "../../src/utils/kidsProgramSafety.js";
import { buildOnboardingChecklist, onboardingChecklistSummary, shouldShowFirstRunOnboarding } from "../../src/utils/onboardingGuidance.js";
import { importRowIssues, parseImportRecords } from "../../src/utils/importReviewSafety.mjs";
import { createVerifiedBackup, previewBackupRestore } from "../../src/features/backup/index.js";
import { planWorkspaceRestore } from "../../src/features/backup/workspaceRestorePlan.js";

// ---------- deterministic randomness ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const between = (rng, low, high) => low + Math.floor(rng() * (high - low + 1));
const money = (rng, low, high) => Math.round((low + rng() * (high - low)) * 100) / 100;
const dateIn = (rng, year = 2026) => `${year}-${String(between(rng, 1, 10)).padStart(2, "0")}-${String(between(rng, 1, 28)).padStart(2, "0")}`;

// ---------- personas ----------
export const PERSONAS = Object.freeze([
  { key: "family-parent", weight: 30, tier: PLAN_IDS.FAMILY, items: [20, 150], sales: [0, 0], expenses: [0, 6], trips: [0, 0], reports: [0, 3], posts: [0, 2], role: "user" },
  { key: "kid-with-parent", weight: 15, tier: PLAN_IDS.FAMILY, items: [5, 60], sales: [0, 0], expenses: [0, 0], trips: [0, 0], reports: [0, 0], posts: [0, 3], role: "kid" },
  { key: "casual-collector", weight: 25, tier: PLAN_IDS.COLLECTOR, items: [50, 600], sales: [0, 5], expenses: [0, 10], trips: [0, 2], reports: [0, 6], posts: [0, 4], role: "user" },
  { key: "active-seller", weight: 15, tier: PLAN_IDS.SELLER, items: [300, 3000], sales: [50, 800], expenses: [20, 300], trips: [5, 120], reports: [0, 10], posts: [0, 3], role: "user" },
  { key: "power-seller", weight: 3, tier: PLAN_IDS.SELLER, items: [3000, 12000], sales: [1000, 5000], expenses: [300, 1500], trips: [100, 600], reports: [0, 20], posts: [0, 5], role: "user" },
  { key: "scout", weight: 8, tier: PLAN_IDS.FREE, items: [0, 40], sales: [0, 0], expenses: [0, 2], trips: [0, 30], reports: [20, 300], posts: [2, 20], role: "user" },
  { key: "new-lurker", weight: 4, tier: PLAN_IDS.FREE, items: [0, 0], sales: [0, 0], expenses: [0, 0], trips: [0, 0], reports: [0, 0], posts: [0, 0], role: "user" },
]);
const PERSONA_TOTAL = PERSONAS.reduce((sum, persona) => sum + persona.weight, 0);
export function personaFor(rng) {
  let roll = rng() * PERSONA_TOTAL;
  for (const persona of PERSONAS) { roll -= persona.weight; if (roll < 0) return persona; }
  return PERSONAS[0];
}

const SETS = ["Scarlet & Violet", "Paldea Evolved", "Obsidian Flames", "151", "Paradox Rift", "Temporal Forces", "Twilight Masquerade", "Surging Sparks", "Prismatic Evolutions", "Evolving Skies", "Base Set", "Journey Together"];
const NAMES = ["Charizard", "Pikachu", "Umbreon", "Gengar", "Mew", "Eevee", "Lugia", "Rayquaza", "Gardevoir", "Snorlax", "Sylveon", "Dragonite", "Mewtwo", "Greninja", "Lucario", "Bulbasaur"];
const SEALED = ["Booster Bundle", "Elite Trainer Box", "Booster Box", "Collection Box", "Tin", "Blister Pack", "Premium Collection"];
const STORES = ["Target", "Walmart", "GameStop", "Best Buy", "Card Shop", "Antique Mall", "Costco", "Barnes & Noble"];
const CITIES = [["Suffolk", "VA"], ["Norfolk", "VA"], ["Chesapeake", "VA"], ["Virginia Beach", "VA"], ["Richmond", "VA"], ["Raleigh", "NC"], ["Hampton", "VA"], ["Newport News", "VA"]];
const PLATFORMS = ["eBay", "TCGplayer", "In person", "Facebook Marketplace", "Whatnot", "Card Show"];
const SAFE_POSTS = ["Found a few booster bundles at the shop today, limit two per person.", "Trading extras from my binder, looking for Eevee cards.", "Our card night is at the library this Saturday, kids welcome with a grown-up.", "Anyone else collecting the 151 set? Love the artwork.", "Restock looked light this morning, shelves were half full."];
const UNSAFE_POSTS = [
  "Text me at 757-555-0199 and I will hold the box for you.",
  "Meet me at 123 Main Street tonight, cash only.",
  "Kids only trade room, no parents needed.",
  "Paypal friends and family only, no other payment.",
  "Email me at trades@example.com for the private list.",
  "Guaranteed restock Friday, 100% restock at every Target.",
  "Selling replica cards cheap, nobody can tell.",
  "Wire transfer only, I ship after.",
];

export function generateUser(index) {
  const rng = mulberry32(0xC0DE3 + index * 7919);
  const persona = personaFor(rng);
  const itemCount = between(rng, persona.items[0], persona.items[1]);
  const items = [];
  const purchaserCount = persona.key === "family-parent" ? between(rng, 1, 4) : 1;
  const purchasers = Array.from({ length: purchaserCount }, (_, i) => ({ id: `p-${index}-${i}`, name: i === 0 ? "Me" : `Kid ${i}` }));
  for (let i = 0; i < itemCount; i += 1) {
    const sealed = rng() < 0.3;
    const unitCost = rng() < 0.9 ? money(rng, 0.5, sealed ? 180 : 60) : "";
    const marketPrice = rng() < 0.75 ? money(rng, 0.25, sealed ? 260 : 400) : "";
    const purchaser = pick(rng, purchasers);
    items.push({
      id: `item-${index}-${i}`,
      name: sealed ? `${pick(rng, SETS)} ${pick(rng, SEALED)}` : `${pick(rng, NAMES)} ${between(rng, 1, 250)}/${between(rng, 150, 250)}`,
      category: "Pokemon", productType: sealed ? "Sealed" : "Single", productClassification: sealed ? "sealed" : "single",
      setName: pick(rng, SETS), expansion: pick(rng, SETS), cardNumber: sealed ? "" : `${between(rng, 1, 250)}`,
      quantity: between(rng, 1, sealed ? 6 : 4), unitCost, marketPrice, salePrice: rng() < 0.4 ? money(rng, 1, 300) : "",
      status: rng() < 0.12 ? "Listed" : rng() < 0.05 ? "Sold" : "In Stock",
      store: pick(rng, STORES), storageLocation: `Bin ${between(rng, 1, 40)}`, condition: pick(rng, ["Near Mint", "Lightly Played", "Moderately Played"]),
      conditionName: "Near Mint", language: "English", purchaserId: purchaser.id, purchaserName: purchaser.name,
      actionNotes: rng() < 0.2 ? "Gift for birthday" : "", listingUrl: rng() < 0.1 ? "https://www.ebay.com/itm/123" : "",
      createdAt: `${dateIn(rng)}T12:00:00.000Z`,
    });
  }
  const salesCount = between(rng, persona.sales[0], persona.sales[1]);
  const sales = Array.from({ length: salesCount }, (_, i) => {
    const item = items.length ? items[between(rng, 0, items.length - 1)] : null;
    const finalSalePrice = money(rng, 2, 400);
    return {
      id: `sale-${index}-${i}`, itemId: item?.id || "", manualItemName: item ? "" : `Manual ${pick(rng, NAMES)}`, saleDate: dateIn(rng),
      platform: pick(rng, PLATFORMS), quantitySold: between(rng, 1, 3), finalSalePrice, shippingCharged: money(rng, 0, 8),
      platformFees: Math.round(finalSalePrice * 0.13 * 100) / 100, paymentProcessingFees: money(rng, 0, 3), shippingCost: money(rng, 0, 7),
      suppliesCost: money(rng, 0, 2), discountsRefunds: rng() < 0.05 ? money(rng, 1, 20) : "", costBasis: item?.unitCost || money(rng, 1, 100),
      buyerName: rng() < 0.5 ? `Buyer ${between(rng, 1, 999)}` : "", referenceId: rng() < 0.7 ? `ORD-${between(rng, 10000, 99999)}` : "", notes: rng() < 0.3 ? "Shipped with tracking" : "",
    };
  });
  const expenses = Array.from({ length: between(rng, persona.expenses[0], persona.expenses[1]) }, (_, i) => ({
    id: `exp-${index}-${i}`, date: dateIn(rng), vendor: pick(rng, STORES), category: pick(rng, ["Supplies", "Shipping", "Inventory", "Fees", "Travel"]),
    amount: money(rng, 1, 250), paymentMethod: pick(rng, ["Card", "Cash"]), notes: rng() < 0.3 ? "Receipt in folder" : "", receiptImage: rng() < 0.5 ? "receipt.jpg" : "",
  }));
  const vehicles = persona.trips[1] ? [{ id: `veh-${index}`, name: pick(rng, ["Sienna", "Civic", "F-150"]) }] : [];
  const mileageTrips = Array.from({ length: between(rng, persona.trips[0], persona.trips[1]) }, (_, i) => {
    const startMiles = between(rng, 1000, 120000);
    return { id: `trip-${index}-${i}`, date: dateIn(rng), purpose: pick(rng, ["Card show", "Store run", "Antique shop drop-off", "Post office"]), driver: rng() < 0.5 ? "Zena" : "Dillon", vehicleId: vehicles[0]?.id || "", startMiles, endMiles: startMiles + between(rng, 3, 420), businessMiles: between(rng, 3, 420), gasPrice: money(rng, 2.5, 4.5) };
  });
  const wishlist = Array.from({ length: between(rng, 0, Math.min(40, itemCount)) }, (_, i) => ({ id: `wish-${index}-${i}`, name: `${pick(rng, NAMES)} ${between(rng, 1, 200)}`, quantity: between(rng, 1, 2), targetPrice: money(rng, 1, 150), marketPrice: rng() < 0.5 ? money(rng, 1, 200) : "" }));
  const reports = Array.from({ length: between(rng, persona.reports[0], persona.reports[1]) }, (_, i) => {
    const [city, region] = pick(rng, CITIES);
    return { id: `rep-${index}-${i}`, storeName: pick(rng, STORES), retailer: pick(rng, STORES), city, region, productName: `${pick(rng, SETS)} ${pick(rng, SEALED)}`, stockStatus: pick(rng, ["in_stock", "low", "out", "unknown"]), itemsSeen: between(rng, 0, 12), observedAt: `2026-10-${String(between(rng, 1, 30)).padStart(2, "0")}T${String(between(rng, 8, 21)).padStart(2, "0")}:00:00.000Z`, reportText: rng() < 0.4 ? "Shelf looked restocked" : "", verificationStatus: pick(rng, ["unverified", "confirmed", "verified"]) };
  });
  const postCount = between(rng, persona.posts[0], persona.posts[1]);
  const posts = Array.from({ length: postCount }, () => {
    const unsafe = rng() < 0.15;
    return { unsafe, title: unsafe ? "Trade offer" : "Shop update", body: unsafe ? pick(rng, UNSAFE_POSTS) : pick(rng, SAFE_POSTS), category: "restock" };
  });
  const profile = {
    id: `user-${index}`, tier: persona.tier, userRole: persona.role === "kid" ? "user" : "user",
    betaStatus: rng() < 0.9 ? "approved" : pick(rng, ["pending", "waitlisted"]),
    restricted: persona.role === "kid", kidsMode: persona.role === "kid", subscriptionStatus: rng() < 0.97 ? "active" : "past_due",
  };
  return { index, persona, rng, items, purchasers, sales, expenses, vehicles, mileageTrips, wishlist, reports, posts, profile };
}

// ---------- metrics ----------
class Timer { constructor() { this.samples = []; } add(ms) { this.samples.push(ms); } }
function summarizeTimer(timer) {
  const sorted = timer.samples.slice().sort((a, b) => a - b);
  const at = (q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted[sorted.length - 1] || 0, total: sorted.reduce((sum, value) => sum + value, 0) };
}

class MemoryStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])); this.writes = 0; }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes += 1; this.values.set(key, String(value)); }
  removeItem(key) { this.writes += 1; this.values.delete(key); }
}

const ISSUE_LIMIT = 40;
export function newMetrics() {
  return {
    users: 0, byPersona: {}, timers: { user: new Timer(), portfolio: new Timer(), setCompletion: new Timer(), sales: new Timer(), tax: new Timer(), importReview: new Timer(), backupExport: new Timer(), restorePreview: new Timer(), restorePlan: new Timer() },
    storage: { bytesSamples: [], over4_5MB: 0, over5MB: 0, maxBytes: 0, maxPersona: "" },
    portfolio: { invariantFailures: 0, zeroValueWithPricedItems: 0 },
    sales: { records: 0, summaryFailures: 0, draftValidationUnexpected: 0 },
    exports: { disclosures: 0, missingPrivateFlag: 0, errors: 0 },
    gates: { checks: 0, unexpected: 0, byFeature: {}, kidBlockedSeller: 0, kidAllowedSeller: 0, pendingBetaBlocked: 0, pendingBetaAllowed: 0 },
    community: { posts: 0, unsafePosts: 0, unsafeBlocked: 0, unsafePassed: 0, safeBlocked: 0, safePosted: 0, kidPostsAttempted: 0, kidPostsAllowedWhileRestricted: 0, pendingReviewByDefault: 0, publicByDefault: 0, unsafePassedSamples: [], safeBlockedSamples: [] },
    spark: { applications: 0, validAccepted: 0, validRejected: 0, birthdateLeakAccepted: 0, birthdateLeakRejected: 0 },
    onboarding: { newUsersShown: 0, newUsersHidden: 0, checklistAvg: 0, checklistSum: 0, checklistCount: 0 },
    imports: { files: 0, rows: 0, rowsWithIssues: 0, parseFailures: 0 },
    backups: { sampled: 0, verified: 0, notVerified: 0, previewReady: 0, previewWarnings: 0, previewBlocked: 0, planOk: 0, planMismatch: 0, planFailures: 0, coverage: {}, maxBackupBytes: 0 },
    issues: [],
  };
}
function issue(metrics, code, detail) {
  if (metrics.issues.length < ISSUE_LIMIT) metrics.issues.push({ code, ...detail });
  metrics.issueCounts = metrics.issueCounts || {};
  metrics.issueCounts[code] = (metrics.issueCounts[code] || 0) + 1;
}
const time = (timer, fn) => { const start = performance.now(); try { return fn(); } finally { timer.add(performance.now() - start); } };
const timeAsync = async (timer, fn) => { const start = performance.now(); try { return await fn(); } finally { timer.add(performance.now() - start); } };

const FEATURE_EXPECTATIONS = {
  // feature: tiers expected to pass
  vault_basic: [PLAN_IDS.FREE, PLAN_IDS.COLLECTOR, PLAN_IDS.FAMILY, PLAN_IDS.SELLER],
  portfolio_value: [PLAN_IDS.COLLECTOR, PLAN_IDS.FAMILY, PLAN_IDS.SELLER],
  kid_profiles: [PLAN_IDS.FAMILY],
  forge_inventory: [PLAN_IDS.SELLER],
  sales_tracking: [PLAN_IDS.SELLER],
  mileage: [PLAN_IDS.SELLER],
  collection_export: [PLAN_IDS.COLLECTOR, PLAN_IDS.FAMILY, PLAN_IDS.SELLER],
  scout_reports_basic: [PLAN_IDS.FREE, PLAN_IDS.COLLECTOR, PLAN_IDS.FAMILY, PLAN_IDS.SELLER],
};

export async function simulateUser(index, metrics, heavySample) {
  const start = performance.now();
  const user = generateUser(index);
  const { persona, items, sales, expenses, vehicles, mileageTrips, wishlist, reports, posts, profile, rng } = user;
  metrics.users += 1;
  metrics.byPersona[persona.key] = (metrics.byPersona[persona.key] || 0) + 1;

  // Storage footprint: what this user's legacy workspace would occupy in localStorage.
  const legacy = { items, purchasers: user.purchasers, sales, expenses, mileageTrips, vehicles, tideTradrWatchlist: wishlist, catalogProducts: [], marketplaceListings: [], workspaces: [{ id: "ws-1", name: "Forge" }], activeWorkspaceId: "ws-1" };
  const legacyJson = JSON.stringify(legacy);
  const bytes = Buffer.byteLength(legacyJson, "utf16le"); // browsers store UTF-16 code units
  metrics.storage.bytesSamples.push(bytes);
  if (bytes > 4.5 * 1024 * 1024) metrics.storage.over4_5MB += 1;
  if (bytes > 5 * 1024 * 1024) { metrics.storage.over5MB += 1; if (metrics.storage.over5MB <= 3) issue(metrics, "STORAGE_OVER_QUOTA", { user: index, persona: persona.key, items: items.length, sales: sales.length, bytes }); }
  if (bytes > metrics.storage.maxBytes) { metrics.storage.maxBytes = bytes; metrics.storage.maxPersona = `${persona.key}#${index}`; }

  // Vault / portfolio
  try {
    const cards = items.filter((item) => item.productClassification === "single");
    const sealed = items.filter((item) => item.productClassification === "sealed");
    const summary = time(metrics.timers.portfolio, () => summarizeCollectionPortfolio({ owned: items, cards, sealed, wishlist }));
    const ownedQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const ok = summary.ownedQuantity === ownedQuantity && summary.pricedQuantity <= summary.ownedQuantity && Number.isFinite(summary.totalKnownValue) && summary.totalKnownValue >= 0 && summary.unpricedQuantity === summary.ownedQuantity - summary.pricedQuantity;
    if (!ok) { metrics.portfolio.invariantFailures += 1; issue(metrics, "PORTFOLIO_INVARIANT", { user: index, persona: persona.key, summary: { owned: summary.ownedQuantity, expected: ownedQuantity, priced: summary.pricedQuantity, value: summary.totalKnownValue } }); }
    if (summary.pricedQuantity > 0 && summary.totalKnownValue === 0) metrics.portfolio.zeroValueWithPricedItems += 1;
    const portfolio = time(metrics.timers.portfolio, () => summarizePortfolio(items));
    if (!Number.isFinite(portfolio.total)) { metrics.portfolio.invariantFailures += 1; issue(metrics, "PORTFOLIO_TOTAL_NAN", { user: index, persona: persona.key }); }
    if (items.length && items.length <= 3000) {
      const csv = buildPortfolioCsv(items, { includeValues: true });
      if (csv.split("\r\n").length !== items.length + 1) issue(metrics, "PORTFOLIO_CSV_ROWS", { user: index, persona: persona.key, rows: csv.split("\r\n").length, items: items.length });
    }
    if (items.length && items.length <= 1500) {
      time(metrics.timers.setCompletion, () => deriveSetCompletionSummary({ items, wishlistItems: wishlist }));
    }
  } catch (error) { issue(metrics, "PORTFOLIO_THROW", { user: index, persona: persona.key, message: error.message }); }

  // Forge: sales, expenses, mileage, year-end
  if (sales.length || expenses.length || mileageTrips.length) {
    try {
      const summary = time(metrics.timers.sales, () => summarizeSalesRecords(sales));
      metrics.sales.records += sales.length;
      if (!summary || !Number.isFinite(Number(summary.revenue ?? summary.totalRevenue ?? summary.grossSales ?? 0))) { metrics.sales.summaryFailures += 1; issue(metrics, "SALES_SUMMARY", { user: index, persona: persona.key }); }
      const rows = buildSalesExportRows(sales.slice(0, 200));
      const mileageGroups = groupMileageByVehicle(mileageTrips, vehicles);
      const mileageRows = buildMileageExportRows(mileageGroups);
      const tax = time(metrics.timers.tax, () => buildYearEndTaxSummary({ year: 2026, expenses, mileageTrips, vehicles, inventoryItems: items, sales }));
      const taxRows = buildTaxRecordExportRows(tax);
      for (const [disclosure, expectPrivate] of [
        [describeExport({ format: "csv", rows, recordCount: sales.length }), sales.length > 0],
        [describeExport({ format: "csv", fields: [...fieldsFromRows(mileageRows), "driver"], recordCount: mileageTrips.length }), mileageTrips.length > 0],
        [describeExport({ format: "csv/json", fields: fieldsFromRows(taxRows) }), true],
      ]) {
        metrics.exports.disclosures += 1;
        if (expectPrivate && !disclosure.containsPrivateData) metrics.exports.missingPrivateFlag += 1;
        if (!disclosure.sentence.startsWith("This ")) metrics.exports.errors += 1;
      }
      // Manual sale drafts: a valid one and two invalid ones.
      const valid = validateManualSaleDraft({ manualItemName: "Charizard", saleDate: "2026-05-01", platform: "eBay", quantitySold: 1, finalSalePrice: "25", costBasis: "5" });
      const noPrice = validateManualSaleDraft({ manualItemName: "Charizard", saleDate: "2026-05-01", platform: "eBay", quantitySold: 1 });
      const badDate = validateManualSaleDraft({ manualItemName: "Charizard", saleDate: "not a date", platform: "eBay", quantitySold: 1, finalSalePrice: "25" });
      const validOk = !valid || valid === "" || valid?.valid === true || (typeof valid === "object" && !Object.keys(valid.errors || valid).length);
      const invalidFlagged = (value) => Boolean(value) && value !== "" && (typeof value === "string" || value?.valid === false || Object.keys(value?.errors || value || {}).length);
      if (!validOk || !invalidFlagged(noPrice) || !invalidFlagged(badDate)) { metrics.sales.draftValidationUnexpected += 1; if (metrics.sales.draftValidationUnexpected <= 2) issue(metrics, "SALE_DRAFT_VALIDATION", { user: index, valid, noPrice, badDate }); }
    } catch (error) { issue(metrics, "FORGE_THROW", { user: index, persona: persona.key, message: error.message, stack: String(error.stack).split("\n")[1] }); }
  }

  // Feature gates and beta access
  const tier = getUserTier(profile);
  for (const [feature, allowedTiers] of Object.entries(FEATURE_EXPECTATIONS)) {
    const actual = canUseFeature(profile, feature);
    const expected = allowedTiers.includes(tier);
    metrics.gates.checks += 1;
    if (actual !== expected) { metrics.gates.unexpected += 1; metrics.gates.byFeature[feature] = (metrics.gates.byFeature[feature] || 0) + 1; if (metrics.gates.unexpected <= 5) issue(metrics, "FEATURE_GATE_UNEXPECTED", { user: index, persona: persona.key, tier, feature, actual, expected }); }
  }
  if (persona.role === "kid") {
    const sellerAccess = canUseFeature(profile, "forge_inventory") || canUseFeature(profile, "sales_tracking");
    if (sellerAccess) metrics.gates.kidAllowedSeller += 1; else metrics.gates.kidBlockedSeller += 1;
  }
  const betaAllowed = betaAccessAllowedForProfile(profile);
  if (profile.betaStatus !== "approved") { if (betaAllowed) { metrics.gates.pendingBetaAllowed += 1; issue(metrics, "PENDING_BETA_ALLOWED", { user: index, status: profile.betaStatus }); } else metrics.gates.pendingBetaBlocked += 1; }

  // Community posting (Tidepool)
  // app_access is a boolean in the profiles table; kid profiles are modelled as
  // parent-managed (blocked from posting) rather than as a string status.
  const kidBlocked = persona.role === "kid";
  for (const post of posts) {
    metrics.community.posts += 1;
    const canPost = canUserCreateTidepoolPost({ betaAccessAllowed: betaAllowed, blocked: kidBlocked });
    if (persona.role === "kid") { metrics.community.kidPostsAttempted += 1; if (canPost) metrics.community.kidPostsAllowedWhileRestricted += 1; continue; }
    if (!canPost) continue;
    const error = validateTidepoolPostDraft({ title: post.title, body: post.body });
    if (post.unsafe) { metrics.community.unsafePosts += 1; if (error) metrics.community.unsafeBlocked += 1; else { metrics.community.unsafePassed += 1; if (metrics.community.unsafePassedSamples.length < 8 && !metrics.community.unsafePassedSamples.includes(post.body)) metrics.community.unsafePassedSamples.push(post.body); } }
    else if (error) { metrics.community.safeBlocked += 1; if (metrics.community.safeBlockedSamples.length < 8 && !metrics.community.safeBlockedSamples.includes(post.body)) metrics.community.safeBlockedSamples.push(post.body); }
    else {
      metrics.community.safePosted += 1;
      const built = buildTidepoolPost({ title: post.title, body: post.body, category: post.category, authorId: profile.id });
      if (tidepoolStatusVisibility(built.status) === "public") metrics.community.publicByDefault += 1; else metrics.community.pendingReviewByDefault += 1;
    }
    if (rng() < 0.2) {
      const listingError = validateMarketplaceListingDraft({ title: "Booster bundle", quantity: 1, description: post.body, condition: "Sealed", askingPrice: 20 }, { requirePublicFields: true });
      if (post.unsafe && !listingError && !metrics.community.unsafePassedSamples.includes(`listing: ${post.body}`) && metrics.community.unsafePassedSamples.length < 8) metrics.community.unsafePassedSamples.push(`listing: ${post.body}`);
    }
  }

  // Spark (kids program) applications from parents
  if (persona.key === "family-parent" && rng() < 0.4) {
    metrics.spark.applications += 1;
    const base = { parentName: "Parent", email: "parent@example.com", childAgeRange: "6_8", favoritePokemon: "Eevee", requestedAccess: ["packs"], agreesNoResale: true, consentContact: true, childFirstName: "J", reason: "Loves collecting" };
    const validError = validateSparkApplication(base);
    if (validError) { metrics.spark.validRejected += 1; if (metrics.spark.validRejected <= 2) issue(metrics, "SPARK_VALID_REJECTED", { user: index, validError }); } else metrics.spark.validAccepted += 1;
    const leakError = validateSparkApplication({ ...base, reason: "Born 05/14/2019, loves Pikachu" });
    if (leakError) metrics.spark.birthdateLeakRejected += 1; else { metrics.spark.birthdateLeakAccepted += 1; if (metrics.spark.birthdateLeakAccepted <= 2) issue(metrics, "SPARK_BIRTHDATE_ACCEPTED", { user: index }); }
  }

  // Onboarding for new users
  if (persona.key === "new-lurker" || items.length === 0) {
    const shown = shouldShowFirstRunOnboarding({ hasUser: true, appAccessAllowed: betaAllowed, onboarding: {} });
    if (betaAllowed) { if (shown) metrics.onboarding.newUsersShown += 1; else { metrics.onboarding.newUsersHidden += 1; issue(metrics, "ONBOARDING_HIDDEN_FOR_NEW_USER", { user: index }); } }
  }
  const checklist = buildOnboardingChecklist({ vaultItems: items.length, forgeItems: sales.length, scoutReports: reports.length, hasPublicUsername: rng() < 0.6 }, {});
  const checklistSummary = onboardingChecklistSummary(checklist);
  metrics.onboarding.checklistSum += Number(checklistSummary.completed ?? checklistSummary.completedCount ?? 0);
  metrics.onboarding.checklistCount += 1;

  // Bulk import review for sellers (CSV with a few bad rows)
  if ((persona.key === "active-seller" || persona.key === "power-seller") && rng() < 0.5) {
    const rowCount = between(rng, 20, 200);
    const lines = ["name,quantity,unit cost,set,condition,notes"];
    for (let i = 0; i < rowCount; i += 1) {
      const bad = rng() < 0.08;
      lines.push([`"${pick(rng, NAMES)} ${between(rng, 1, 200)}/198"`, bad ? "two" : between(rng, 1, 5), bad ? "$abc" : money(rng, 0.5, 90), pick(rng, SETS), "Near Mint", `"Lot ${i}, shelf ${between(rng, 1, 9)}"`].join(","));
    }
    try {
      const parsed = time(metrics.timers.importReview, () => parseImportRecords(lines.join("\n")));
      const records = Array.isArray(parsed) ? parsed : parsed?.records || parsed?.rows || [];
      metrics.imports.files += 1; metrics.imports.rows += records.length;
      const dataRecords = records.filter((record) => !record?.isHeader && !record?.header);
      if (dataRecords.length < rowCount || dataRecords.length > rowCount + 1) issue(metrics, "IMPORT_ROW_COUNT", { user: index, expected: rowCount, parsed: dataRecords.length });
      for (const record of records) { const issues = importRowIssues(record); if ((Array.isArray(issues) ? issues.length : Object.keys(issues || {}).length)) metrics.imports.rowsWithIssues += 1; }
    } catch (error) { metrics.imports.parseFailures += 1; issue(metrics, "IMPORT_THROW", { user: index, message: error.message }); }
  }

  // Heavy path on a sample: export a verified backup, preview it, plan a restore
  // into a device that holds half of the same records.
  if (heavySample) {
    metrics.backups.sampled += 1;
    try {
      const scout = { stores: [], reports, tidepoolReports: [], items: [] };
      const sightings = reports.slice(0, 50).map((report, i) => ({ id: `sight-${index}-${i}`, storeName: report.storeName, items: [{ name: report.productName }], createdAt: report.observedAt }));
      const storage = new MemoryStorage({ "et-tcg-beta-data": legacy, "et-tcg-beta-scout": scout, "tide_tradr_what_did_i_see_reports": sightings, "et-tcg-beta-feedback": [] });
      const result = await timeAsync(metrics.timers.backupExport, () => createVerifiedBackup({ localStorage: storage, sessionStorage: new MemoryStorage(), applicationVersion: "sim-1.0.0", sourceCommit: "sim" }));
      metrics.backups.coverage[result.coverageStatus] = (metrics.backups.coverage[result.coverageStatus] || 0) + 1;
      if (!result.verified) { metrics.backups.notVerified += 1; issue(metrics, "BACKUP_NOT_VERIFIED", { user: index, persona: persona.key, errors: result.errors?.slice?.(0, 3) }); }
      else {
        metrics.backups.verified += 1;
        metrics.backups.maxBackupBytes = Math.max(metrics.backups.maxBackupBytes, result.json.length);
        const preview = await timeAsync(metrics.timers.restorePreview, () => previewBackupRestore(result.json, { currentApplicationVersion: "sim-1.0.0" }));
        if (preview.result === "READY_FOR_FUTURE_RESTORE") metrics.backups.previewReady += 1; else if (preview.result === "READY_WITH_WARNINGS") metrics.backups.previewWarnings += 1; else { metrics.backups.previewBlocked += 1; issue(metrics, "PREVIEW_BLOCKED", { user: index, persona: persona.key, result: preview.result, errors: preview.errors.slice(0, 3) }); }
        const half = { ...legacy, items: items.slice(0, Math.floor(items.length / 2)), sales: sales.slice(0, Math.floor(sales.length / 2)) };
        const device = new MemoryStorage({ "et-tcg-beta-data": half });
        try {
          const planned = await timeAsync(metrics.timers.restorePlan, () => planWorkspaceRestore(result.json, { storage: device, currentApplicationVersion: "sim-1.0.0" }));
          const expectedAdded = (items.length - half.items.length) + (sales.length - half.sales.length);
          const legacyRow = planned.review.dryRun.sources.find((row) => row.sourceId === "legacy-core-business");
          if (planned.plan.addedRecords !== planned.review.dryRun.totals.newRecords || (legacyRow && legacyRow.newRecords !== expectedAdded)) { metrics.backups.planMismatch += 1; issue(metrics, "PLAN_DRYRUN_MISMATCH", { user: index, persona: persona.key, planAdded: planned.plan.addedRecords, dryRunNew: planned.review.dryRun.totals.newRecords, legacyNew: legacyRow?.newRecords, expectedAdded }); }
          else metrics.backups.planOk += 1;
          if (device.writes) issue(metrics, "PLAN_WROTE_STORAGE", { user: index });
        } catch (error) { metrics.backups.planFailures += 1; issue(metrics, "PLAN_FAILED", { user: index, persona: persona.key, code: error.code, message: error.message }); }
      }
    } catch (error) { issue(metrics, "BACKUP_THROW", { user: index, persona: persona.key, message: error.message, stack: String(error.stack).split("\n").slice(1, 3).join(" | ") }); }
  }

  metrics.timers.user.add(performance.now() - start);
}

function serialize(metrics) {
  const timers = Object.fromEntries(Object.entries(metrics.timers).map(([key, timer]) => [key, summarizeTimer(timer)]));
  const bytes = metrics.storage.bytesSamples.slice().sort((a, b) => a - b);
  const at = (q) => bytes.length ? bytes[Math.min(bytes.length - 1, Math.floor(q * bytes.length))] : 0;
  return { ...metrics, timers, storage: { ...metrics.storage, bytesSamples: undefined, p50: at(0.5), p95: at(0.95), p99: at(0.99) }, onboarding: { ...metrics.onboarding, checklistAvg: metrics.onboarding.checklistCount ? metrics.onboarding.checklistSum / metrics.onboarding.checklistCount : 0 } };
}

// Only act as the data-scale worker when launched as one; other workers import
// this module for its generator.
if (parentPort && workerData && workerData.heavyEvery !== undefined) {
  const { start, end, heavyEvery, heavyPowerSellerCap } = workerData;
  const metrics = newMetrics();
  let powerSellersSampled = 0;
  let lastReport = performance.now();
  for (let index = start; index < end; index += 1) {
    const persona = personaFor(mulberry32(0xC0DE3 + index * 7919));
    let heavy = index % heavyEvery === 0;
    if (persona.key === "power-seller" && powerSellersSampled < heavyPowerSellerCap) { heavy = true; powerSellersSampled += 1; }
    await simulateUser(index, metrics, heavy);
    if (performance.now() - lastReport > 5000) { parentPort.postMessage({ type: "progress", done: index - start + 1 }); lastReport = performance.now(); }
  }
  parentPort.postMessage({ type: "done", metrics: serialize(metrics) });
}
