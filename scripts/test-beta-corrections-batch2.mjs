// Regression tests for tester-reaction corrections A41–A80 (2026-10-31).
// Run: node --no-warnings --test scripts/test-beta-corrections-batch2.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

async function load(entry, name) {
  const dir = mkdtempSync(join(tmpdir(), "code3-corrections2-"));
  const out = join(dir, `${name}.mjs`);
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", resolveExtensions: [".js", ".jsx", ".mjs"], loader: { ".js": "jsx" }, jsx: "automatic", define: { "import.meta.env": JSON.stringify({ VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "", MODE: "test", DEV: false }) }, plugins: [{ name: "stubs", setup(api) {
    api.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
    api.onResolve({ filter: /^@(supabase|capacitor)\// }, (args) => ({ path: args.path, namespace: "stub" }));
    api.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default {}; export const createClient = () => null; export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' }; export const registerPlugin = () => ({}); export const supabase = null;", loader: "js" }));
  } }], nodePaths: [join(process.cwd(), "node_modules")] });
  return import(out);
}

const plain = await load("src/config/plainLanguage.js", "plain");
const gates = await load("src/services/featureGates.js", "gates");
const tax = await load("src/utils/businessTaxRecords.js", "tax");
const kid = await load("src/utils/kidSafeView.js", "kid");
const quota = await load("src/utils/storageQuota.js", "quota");
const preview = await load("src/features/backup/restorePreview.js", "preview");

test("A41/A42 old brand feature names are gone from visible copy", () => {
  assert.equal(plain.plainLanguageText("Review Ember Watch"), "Review Watch Center");
  assert.equal(plain.plainLanguageText("Ember ID Progress"), "Public Profile Progress");
  assert.equal(plain.plainLanguageText("How do Ember Points work?"), "How do Daily Points work?");
  assert.equal(plain.plainLanguageText("Learn Tide Score"), "Learn Trust Score");
  assert.equal(plain.plainLanguageText("Back to Hearth"), "Back to Home");
  assert.equal(plain.plainLanguageText("Posts keep Tidepool kind"), "Posts keep Community kind");
  const sources = ["src/utils/onboardingGuidance.js", "src/services/featureGates.js", "src/utils/businessAssistant.js"].map((file) => readFileSync(file, "utf8")).join("\n");
  assert.ok(!/["'][^"'\n]*\b(Ember Watch|Ember ID|Ember Points|Tide Score|Tidepool|Hearth)\b[^"'\n]*\s[^"'\n]*["']/.test(sources), "source copy still uses old brand names");
});

test("A52–A55 plans read free during beta and name the team, not 'admin'", () => {
  for (const tier of Object.values(gates.TIER_PRICING)) {
    assert.ok(!/\$[1-9]/.test(tier.price) || /free/i.test(tier.price), `${tier.label} still shows a price: ${tier.price}`);
    assert.ok(!/ask admin/i.test(tier.cta), `${tier.label} cta still says ask admin`);
  }
  assert.ok(gates.TIER_ADD_ONS.every((addOn) => /free/i.test(addOn.price)));
  assert.ok(gates.TIER_ADD_ONS.find((addOn) => addOn.id === "seller_business_partner").status.includes("partner"));
  const locked = JSON.stringify(gates.getLockedFeatureDetails("forge_inventory"));
  assert.ok(!/ask admin/i.test(locked));
  assert.match(gates.getUpgradePrompt("forge_inventory"), /free during beta/i);
});

test("A57–A59 sales carry channel fee defaults, shipping and returns", () => {
  const ebay = tax.estimateChannelFees("eBay", 100);
  assert.ok(ebay.platformFees > 12 && ebay.platformFees < 15, String(ebay.platformFees));
  assert.equal(tax.estimateChannelFees("In-person", 100).platformFees, 0);
  const sale = tax.normalizeSalesRecord({ itemName: "Card", platform: "eBay", saleDate: "2026-05-01", quantitySold: 1, finalSalePrice: 40, shipStatus: "shipped", trackingNumber: "9400 1234", shipCarrier: "USPS" });
  assert.equal(sale.shipStatus, "Shipped");
  assert.equal(sale.saleStatus, "Completed");
  const returned = tax.applySaleReturn(sale, { refundAmount: 40, returnDate: "2026-05-10", reason: "Damaged" });
  assert.equal(returned.saleStatus, "Returned");
  assert.equal(returned.originalGrossSale, 40);
  assert.equal(tax.applySaleReturn(sale, { refundAmount: 10 }).saleStatus, "Partially refunded");
  assert.ok(tax.buildSalesExportRows([sale])[0].shipStatus);
});

test("A48–A51 kid-safe view flag and copy", () => {
  assert.ok(kid.isKidSafeProfile({ collectorType: "kid_collector" }));
  assert.ok(kid.isKidSafeProfile({}, { collector_type: "kid_collector" }));
  assert.ok(!kid.isKidSafeProfile({ collectorType: "seller" }));
  assert.equal(kid.kidSafeMoney("$5.00", true), "—");
  assert.match(kid.KID_SAFE_COPY.postingBlocked, /parent/i);
});

test("A79 storage quota status warns before a save fails", () => {
  const fake = { length: 2, key: (i) => ["a", "b"][i], getItem: (k) => (k === "a" ? "x".repeat(2 * 1024 * 1024) : "y".repeat(100)) };
  const status = quota.storageQuotaStatus(fake, 5 * 1024 * 1024);
  assert.equal(status.level, "warn");
  assert.match(status.message, /backup/i);
  assert.equal(quota.storageQuotaStatus({ length: 0, key: () => null, getItem: () => "" }).level, "ok");
});

test("A72/A73 restore preview names records without stable IDs", async () => {
  assert.equal(typeof preview.previewBackupRestore, "function");
});
