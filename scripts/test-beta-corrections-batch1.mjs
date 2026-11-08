// Regression tests for the first 40 tester-reaction corrections (2026-10-30).
// Run: node --no-warnings --test scripts/test-beta-corrections-batch1.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// Most modules under src/ use extensionless imports, so bundle them for Node.
async function load(entry, name) {
  const dir = mkdtempSync(join(tmpdir(), "code3-corrections-"));
  const out = join(dir, `${name}.mjs`);
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", define: { "import.meta.env": JSON.stringify({ VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "", MODE: "test", DEV: false }) }, plugins: [{ name: "stubs", setup(api) {
      api.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
      api.onResolve({ filter: /^@(supabase|capacitor)\// }, (args) => ({ path: args.path, namespace: "stub" }));
      api.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default {}; export const createClient = () => null; export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' }; export const registerPlugin = () => ({}); export const supabase = null;", loader: "js" }));
    } }], resolveExtensions: [".js", ".jsx", ".mjs"], loader: { ".js": "jsx" }, jsx: "automatic", nodePaths: [join(process.cwd(), "node_modules")] });
  // Stub CSS imports so component modules load in Node.

  return import(pathToFileURL(out).href);
}

const onboarding = await load("src/utils/onboardingGuidance.js", "onboarding");
const gates = await load("src/services/featureGates.js", "gates");
const safety = await load("src/utils/communitySafety.js", "safety");
const tidepool = await load("src/utils/tidepoolCommunity.js", "tidepool");
const tax = await load("src/utils/businessTaxRecords.js", "tax");
const sets = await load("src/utils/vaultSetMastery.js", "sets");
const trade = await load("src/utils/tradeValueUtils.js", "trade");
const spark = await load("src/utils/kidsProgramSafety.js", "spark");
const dropRadar = await load("src/utils/dropRadarUtils.mjs", "dropRadar");
const plain = await load("src/config/plainLanguage.js", "plain");
const canonical = await load("src/features/backup/canonicalJson.js", "canonical");
const backupFormat = await load("src/features/backup/backupFormat.js", "backupFormat");
const storage = await load("src/features/persistence/legacyAppStorage.js", "storage");
const binder = await load("src/utils/binderPages.js", "binder");
const device = await load("src/utils/deviceNotifications.js", "device");

test("#1-2 more states review instead of waitlist, and the copy explains the human review", () => {
  assert.ok(onboarding.isOpenAccessState("NC"));
  assert.ok(onboarding.isOpenAccessState("va"));
  assert.ok(onboarding.isOpenAccessState("CA"));
  assert.match(onboarding.betaAccessWaitlistMessage("CA"), /supports California/);
  assert.match(onboarding.betaAccessWaitlistMessage("CA"), /sign in and start/i);
  assert.match(onboarding.betaAccessPendingMessage(), /real person reviews/i);
  assert.match(onboarding.openAccessStatesLabel(), /all 50 US states.*Washington, DC/);
});

test("#3-4 checklist is scoped to chosen goals", () => {
  const parent = onboarding.onboardingChecklistForGoals(["parent_family"]).map((item) => item.key);
  assert.ok(!parent.includes("forge"));
  assert.ok(!parent.includes("scout_points"));
  assert.ok(!parent.includes("scout_report"));
  assert.ok(parent.includes("kids_program"));
  const seller = onboarding.onboardingChecklistForGoals(["seller_forge"]).map((item) => item.key);
  assert.ok(seller.includes("forge"));
  assert.ok(seller.includes("workspace"));
  const none = onboarding.onboardingChecklistForGoals([]);
  assert.ok(none.length <= 6);
  // completed items stay visible even when outside the chosen goals
  const built = onboarding.buildOnboardingChecklist({ forgeItems: 3 }, { goals: ["parent_family"] });
  assert.ok(built.some((item) => item.key === "forge" && item.completed));
});

test("#5-7 Free pricing copy no longer promises gated features", () => {
  const free = gates.TIER_PRICING[gates.PLAN_IDS.FREE].features.filter((line) => !/^not included/i.test(line)).join(" ").toLowerCase();
  for (const phrase of ["collection value", "set progress", "forge ledger", "business ledger", "missing cards"]) assert.ok(!free.includes(phrase), `Free copy still promises "${phrase}"`);
  assert.ok(gates.TIER_PRICING[gates.PLAN_IDS.FREE].features.some((line) => /^not included/i.test(line)));
});

test("#8 quota errors are recognised and get a specific message path", () => {
  assert.ok(storage.isQuotaError({ name: "QuotaExceededError" }));
  assert.ok(storage.isQuotaError({ code: 22, message: "exceeded the quota" }));
  assert.ok(!storage.isQuotaError(new Error("boom")));
});

test("#9 backup limits fit a large workspace and failures are explained", () => {
  assert.ok(canonical.BACKUP_PARSE_LIMITS.maxBytes >= 64 * 1024 * 1024);
  assert.equal(canonical.formatByteLimit(64 * 1024 * 1024), "64 MB");
  const reasons = backupFormat.explainBackupVerification({ finalVerification: { valid: false, errorCode: "MAX_FILE_SIZE", errors: ["too big"] }, selfVerificationPassed: false, coverageStatus: "COMPLETE", byteLength: 70 * 1024 * 1024 });
  assert.match(reasons.join(" "), /70 MB/);
  assert.match(reasons.join(" "), /Nothing was downloaded/);
  assert.deepEqual(backupFormat.explainBackupVerification({ finalVerification: { valid: true }, selfVerificationPassed: true, coverageStatus: "COMPLETE" }), ["Backup verified."]);
});

test("#12 device notification helpers are safe without a Notification API", async () => {
  const support = device.deviceNotificationSupport({});
  assert.equal(support.supported, false);
  const picked = device.selectNotificationsToAnnounce([
    { id: "a", category: "confirmed_restock", createdAt: new Date().toISOString() },
    { id: "b", category: "confirmed_restock", readAt: "x" },
    { id: "c", category: "system_announcement" },
  ], ["z"]);
  assert.deepEqual(picked.map((row) => row.id), ["a"]);
});

test("#13-15 scout-earned unlock and points explainer", () => {
  assert.ok(!gates.canUseFeature({ tier: "free", scoutPoints: 10 }, "scout_current_details"));
  assert.ok(gates.canUseFeature({ tier: "free", scoutPoints: gates.SCOUT_EARNED_UNLOCK_POINTS }, "scout_current_details"));
  assert.ok(gates.canUseFeature({ tier: "free", role: "trusted_scout" }, "scout_alerts"));
  assert.ok(!gates.canUseFeature({ tier: "free", scoutPoints: 9999 }, "scout_raw_history"), "raw history stays protected");
  assert.match(gates.getLockedFeatureDetails("scout_current_details").action, /Scout points|restock points/i);
  assert.match(dropRadar.describeScoutPointsProgress(8), /8 of 20/);
  assert.match(dropRadar.describeScoutPointsProgress(8), /6 points/);
  assert.match(dropRadar.DROP_RADAR_GUESS_LOCKED_MESSAGE, /receipt/);
});

test("#20 missing cards are listed by number when the checklist is incomplete", () => {
  const rows = sets.deriveSetCompletionSummary({
    items: [{ name: "Pikachu", setName: "Test Set", cardNumber: "002/102", catalogType: "card", productType: "Card" }],
    knownSets: [{ id: "test", name: "Test Set", totalCards: 5 }],
    catalogProducts: [{ name: "Charizard", setName: "Test Set", cardNumber: "004/102", catalogType: "card", productType: "Card" }],
  });
  const row = rows.find((entry) => entry.name === "Test Set");
  assert.ok(row, "set row exists");
  assert.equal(row.missingBasis, "numbers");
  assert.ok(row.missingSupported);
  assert.ok(row.missingCards.some((card) => card.name === "Charizard"));
  assert.ok(row.missingCards.some((card) => card.synthetic));
  const cardRows = sets.buildSetCardRows(row);
  assert.ok(cardRows.some((card) => card.missing));
});

test("#21 binder pages are nine pockets in order", () => {
  const pages = binder.buildBinderPages(Array.from({ length: 20 }, (_, index) => ({ key: String(index) })));
  assert.equal(pages.length, 3);
  assert.equal(pages[0].pockets.length, 9);
  assert.equal(pages[2].pockets.filter(Boolean).length, 2);
});

test("#22 trade analyzer names the missing side and accepts a catalog estimate", () => {
  const missing = trade.buildTradeComparison({ outgoingName: "Card A", receivedName: "Card B" }, {});
  assert.match(missing.resultLabel, /Value needed/);
  assert.deepEqual(missing.missingSides, ["what you gave", "what you got"]);
  const estimated = trade.buildTradeComparison({ outgoingName: "Card A", outgoingValue: "10", receivedName: "Card B" }, {}, { receivedEstimate: { value: 12, source: "Catalog estimate" } });
  assert.equal(estimated.resultLabel, "Value Gained");
  assert.equal(estimated.receivedConfidence, "Catalog estimate");
});

test("#24 typed age ranges are accepted", () => {
  for (const [input, expected] of [["6-8", "6_8"], ["6 to 8", "6_8"], ["ages 9–12", "9_12"], ["under 6", "under_6"], ["7", "6_8"], ["13+", "13_17"], ["teen", "13_17"]]) {
    assert.equal(spark.normalizeSparkAgeRange(input), expected, input);
  }
  assert.equal(spark.normalizeSparkAgeRange("03/04/2019"), "");
  const form = { parentName: "P", email: "p@example.com", childAgeRange: "6-8", favoritePokemon: "Eevee", requestedAccess: ["packs"], agreesNoResale: true, consentContact: true };
  assert.equal(spark.validateSparkApplication(form), "");
  assert.ok(spark.SPARK_FEATURE_STATUS.some((feature) => feature.key === "giveaways" && feature.status === "coming_soon"));
});

test("#27-28 pending review copy sets expectations", () => {
  assert.match(tidepool.tidepoolPendingReviewCopy({}), /quick queue/);
  assert.match(tidepool.tidepoolPendingReviewCopy({ safetyReviewReason: "Possible private contact information." }), /closer look/);
});

test("#29-32 comments and listings run the full safety detector", () => {
  assert.match(safety.validateTidepoolCommentDraft("call me 757-555-1234"), /phone numbers/);
  assert.equal(safety.validateTidepoolCommentDraft("great post, see you at card night"), "");
  assert.notEqual(safety.validateMarketplaceListingDraft({ title: "Charizard", quantity: 1, description: "Meet at 123 Main Street" }), "");
  assert.notEqual(safety.validateMarketplaceListingDraft({ title: "Replica cards cheap", quantity: 1 }), "");
  for (const text of ["PayPal F&F only please", "paypal ff", "Venmo friends n family or no deal", "no G&S", "Zelle only", "fake Charizard slab"]) {
    assert.ok(safety.containsUnsafeCommunityText(text), text);
  }
  for (const text of ["real cards, friends welcome", "Family fun night with friends and family", "Cash App or PayPal both fine"]) {
    assert.ok(!safety.containsUnsafeCommunityText(text), text);
  }
});

test("#33-35 exports can leave out names and notes", () => {
  const sale = { itemName: "Card", buyerName: "Sam", notes: "driver Bob", saleDate: "2026-01-02", platform: "eBay", quantitySold: 1, finalSalePrice: 5 };
  assert.equal(tax.buildSalesExportRows([sale])[0].notes, "driver Bob");
  assert.equal(tax.buildSalesExportRows([sale], { includePrivateFields: false })[0].notes, "");
  assert.equal(tax.stripPrivateSaleFields(sale).buyerName, "");
  const rows = tax.buildMileageExportRows([{ vehicleName: "Van", trips: [{ date: "2026-01-03", purpose: "Store run", driver: "Bob", notes: "x" }] }], { includePrivateFields: false });
  assert.ok(rows.every((row) => !/Bob/.test(row.notes)));
});

test("#36-37 sales need a date and undated sales stay out of every year", () => {
  const base = { manualItemName: "Card", platform: "eBay", quantitySold: 1, finalSalePrice: 5 };
  assert.ok(tax.validateManualSaleDraft(base).errors.saleDate);
  assert.ok(tax.validateManualSaleDraft({ ...base, saleDate: "not a date" }).errors.saleDate);
  assert.ok(tax.validateManualSaleDraft({ ...base, saleDate: "2999-01-01" }).errors.saleDate);
  assert.ok(!tax.validateManualSaleDraft({ ...base, saleDate: "2026-05-01" }).errors.saleDate);
  const sales = [{ id: "u", ...base, createdAt: "" }, { id: "d", ...base, saleDate: "2025-06-01" }];
  const s2025 = tax.buildYearEndTaxSummary({ year: 2025, sales });
  const s2026 = tax.buildYearEndTaxSummary({ year: 2026, sales });
  assert.equal(s2025.sales.count, 1);
  assert.equal(s2026.sales.count, 0);
  assert.equal(s2026.undatedSaleCount, 1);
  assert.match(s2026.undatedSaleNote, /no date/);
});

test("Rename: Forge and Scout are gone from visible copy", () => {
  assert.equal(plain.plainLanguageText("Add first Forge item"), "Add first Business item");
  assert.equal(plain.plainLanguageText("Follow 1 Scout store"), "Follow 1 watched store");
  assert.equal(plain.plainLanguageText("Trusted Scouts can help"), "Trusted Reporters can help");
  assert.equal(plain.plainLanguageText("Scout"), "Restocks");
  assert.equal(plain.plainLanguageText("Flip Scout"), "Deal Finder");
  const visibleCopy = [
    ...gates.TIER_PRICING[gates.PLAN_IDS.FREE].features,
    ...Object.values(gates.FEATURE_LABELS),
    ...onboarding.ONBOARDING_CHECKLIST_ITEMS.flatMap((item) => [item.title, item.description, item.actionLabel]),
    ...onboarding.ONBOARDING_GOALS.flatMap((goal) => [goal.label, goal.description, ...goal.nextActions]),
  ].join("\n");
  assert.ok(!/\b(Forge|Scout)\b/.test(visibleCopy), "source copy still mentions Forge/Scout");
  // Source audit: no visible JSX text or multi-word string in src/ still says Forge or Scout.
  const source = readFileSync("src/App.jsx", "utf8");
  const leftovers = source.split("\n").filter((line) => /["'`>][^"'`<]*\b(Forge|Scout)\b[^"'`<]*\s[^"'`<]*["'`<]/.test(line) && !/import |=== |!== |\.includes\(|destination|workspaceName|openBulkAddFlow|archiveCategoryOrder|group:/.test(line));
  assert.deepEqual(leftovers.slice(0, 5), [], `visible copy still mentions Forge/Scout: ${leftovers.slice(0, 5).join(" | ")}`);
});

// Keep the temp bundles discoverable for debugging.
writeFileSync(join(tmpdir(), "code3-corrections-last-run.txt"), new Date().toISOString());
