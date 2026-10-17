import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BACKUP_SOURCE_REGISTRY,
  createVerifiedBackup,
  isProhibitedDataKey,
  sanitizeBackupData,
} from "../src/features/backup/index.js";
import { createPurchaseReceivingService } from "../src/features/purchaseReceiving/index.js";
import {
  MIGRATION_SOURCE_CLASSIFICATIONS,
  MIGRATION_SOURCE_REGISTRY,
  getMigrationSource,
} from "../src/features/persistence/migrationSourceRegistry.js";
import {
  confirmReconciliation,
  costProposal,
  createSoldManagedInventory,
} from "./inventory-reconciliation-test-helpers.mjs";

const PURCHASE_KEY = "code3.purchase-receiving.v1";
const INVENTORY_KEY = "ember-and-tide.flip-scout.v1";
const FIXED_ORIGINAL_SALE_DATE = "2025-12-31";
const FIXED_RECONCILIATION_DATE = "2026-01-02T14:00:00.000Z";

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function excludes(value, pattern, message) { assert.doesNotMatch(value, pattern, message); assertions += 1; }
function throws(action, matcher, message) { assert.throws(action, matcher, message); assertions += 1; }

class InstrumentedStorage {
  constructor(values = {}) {
    this.values = new Map(Object.entries(values).map(([key, value]) => [String(key), typeof value === "string" ? value : JSON.stringify(value)]));
    this.reads = 0;
    this.writes = 0;
    this.removes = 0;
    this.clears = 0;
  }
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { this.reads += 1; return this.values.get(String(key)) ?? null; }
  setItem(key, value) { this.writes += 1; this.values.set(String(key), String(value)); }
  removeItem(key) { this.removes += 1; this.values.delete(String(key)); }
  clear() { this.clears += 1; this.values.clear(); }
  snapshot() { return JSON.stringify([...this.values.entries()].sort(([left], [right]) => left.localeCompare(right))); }
}

// The verified OWNER boundary must fail before either canonical local store is read.
const deniedPurchaseStorage = new InstrumentedStorage({ [PURCHASE_KEY]: { schemaVersion: 1 } });
const deniedInventoryStorage = new InstrumentedStorage({ [INVENTORY_KEY]: { schemaVersion: 5 } });
const denied = createPurchaseReceivingService({
  storage: deniedPurchaseStorage,
  inventoryStorage: deniedInventoryStorage,
  isOwnerAuthorized: () => false,
});
const deniedReadsBefore = deniedPurchaseStorage.reads + deniedInventoryStorage.reads;
throws(
  () => denied.previewAccountantReview(),
  (error) => error?.code === "OWNER_REQUIRED",
  "Accountant Review requires a verified OWNER session",
);
equal(deniedPurchaseStorage.reads + deniedInventoryStorage.reads, deniedReadsBefore, "OWNER denial occurs before Purchase or Inventory storage access");
equal(deniedPurchaseStorage.writes + deniedInventoryStorage.writes, 0, "OWNER denial performs no canonical writes");

// Build a synthetic canonical history, then measure only the Accountant Review operation.
let clock = "2026-01-01T14:00:00.000Z";
const harness = await createSoldManagedInventory({
  id: "phase2ce-zero-write",
  quantity: 2,
  totalMinorUnits: 1001,
  now: () => clock,
  sales: [{
    id: "sale.phase2ce-zero-write.test",
    quantity: 1,
    saleDate: FIXED_ORIGINAL_SALE_DATE,
    grossSalePrice: 20,
    netProceeds: 20,
  }],
});
clock = FIXED_RECONCILIATION_DATE;
await confirmReconciliation(
  harness.service,
  harness.inventoryItem,
  costProposal("phase2ce-zero-write", 1101),
);

const purchaseBytesBefore = harness.purchaseStorage.values.get(PURCHASE_KEY);
const inventoryBytesBefore = harness.inventoryStorage.values.get(INVENTORY_KEY);
const purchaseWritesBefore = harness.purchaseStorage.writes;
const inventoryWritesBefore = harness.inventoryStorage.writes;

const globals = {
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  indexedDB: globalThis.indexedDB,
  fetch: globalThis.fetch,
  XMLHttpRequest: globalThis.XMLHttpRequest,
  WebSocket: globalThis.WebSocket,
  EventSource: globalThis.EventSource,
};
const throwingStorage = Object.freeze({
  getItem() { throw new Error("global storage access prohibited"); },
  setItem() { throw new Error("global storage access prohibited"); },
  removeItem() { throw new Error("global storage access prohibited"); },
  clear() { throw new Error("global storage access prohibited"); },
});
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: throwingStorage });
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: throwingStorage });
Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: Object.freeze({ open() { throw new Error("IndexedDB access prohibited"); }, deleteDatabase() { throw new Error("IndexedDB access prohibited"); } }) });
Object.defineProperty(globalThis, "fetch", { configurable: true, value: () => { throw new Error("network access prohibited"); } });
Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, value: class { constructor() { throw new Error("network access prohibited"); } } });
Object.defineProperty(globalThis, "WebSocket", { configurable: true, value: class { constructor() { throw new Error("network access prohibited"); } } });
Object.defineProperty(globalThis, "EventSource", { configurable: true, value: class { constructor() { throw new Error("network access prohibited"); } } });

let preview;
try {
  preview = harness.service.previewAccountantReview();
} finally {
  for (const [key, value] of Object.entries(globals)) {
    if (value === undefined) delete globalThis[key];
    else Object.defineProperty(globalThis, key, { configurable: true, value });
  }
}

equal(preview.recordType, "ACCOUNTANT_REVIEW_PREVIEW", "the service returns the dedicated non-ledger preview model");
equal(preview.readOnly, true, "Accountant Review is read only");
equal(preview.authoritative, false, "Accountant Review is non-authoritative");
equal(preview.persisted, false, "Accountant Review projection is not persisted");
equal(preview.createsAccountingLedger, false, "Accountant Review does not create a ledger");
equal(preview.postsJournalEntries, false, "Accountant Review posts no journal entries");
equal(preview.mutatesHistoricalSales, false, "Accountant Review cannot mutate historical Sales");
equal(preview.mutatesHistoricalCogs, false, "Accountant Review cannot mutate original COGS");
equal(preview.mutatesPurchases, false, "Accountant Review cannot mutate Purchases");
equal(preview.mutatesInventory, false, "Accountant Review cannot mutate Inventory");
equal(preview.mutatesTransfers, false, "Accountant Review cannot mutate Transfers");
equal(preview.remoteActive, false, "Accountant Review cannot activate remote persistence");
equal(preview.filingStatus, "FILING_STATUS_UNKNOWN", "Accountant Review never infers filed-tax status");
equal(preview.items.length, 1, "the synthetic prior-year reconciliation derives one review item");
equal(preview.items[0].originalTransactionDate, FIXED_ORIGINAL_SALE_DATE, "the original Sale date remains distinct");
ok(Date.parse(preview.items[0].correctionDate) > Date.parse(`${FIXED_ORIGINAL_SALE_DATE}T00:00:00.000Z`), "the later reconciliation date remains distinct from the original Sale date");
equal(preview.items[0].correctionPeriod.yearKey, "2026", "the reconciliation retains its later calendar year");
equal(preview.items[0].periodComparison.priorPeriodRelevant, true, "the read-only projection identifies a prior reporting period");
equal(Object.isFrozen(preview), true, "the ephemeral preview is frozen");
equal(Object.isFrozen(preview.items), true, "derived review items are frozen");

equal(harness.purchaseStorage.values.get(PURCHASE_KEY), purchaseBytesBefore, "preview leaves the canonical Purchase document byte-equivalent");
equal(harness.inventoryStorage.values.get(INVENTORY_KEY), inventoryBytesBefore, "preview leaves the canonical Inventory document byte-equivalent");
equal(harness.purchaseStorage.writes, purchaseWritesBefore, "preview performs zero Purchase writes");
equal(harness.inventoryStorage.writes, inventoryWritesBefore, "preview performs zero Inventory writes");

const filtered = harness.service.previewAccountantReview({ year: "2025", severity: "HIGH_ATTENTION" });
equal(filtered.items.length, 1, "owner review filters select the synthetic historical item in memory");
equal(filtered.activeFilters.year, "2025", "the returned preview reports its ephemeral year filter");
equal(filtered.activeFilters.severity, "HIGH_ATTENTION", "the returned preview reports its ephemeral attention filter");
const regenerated = harness.service.previewAccountantReview();
equal(regenerated.activeFilters.year, null, "a fresh preview does not restore a prior year filter");
equal(regenerated.activeFilters.severity, null, "a fresh preview does not restore a prior severity filter");
equal(regenerated.items.length, preview.items.length, "closing/reopening semantics regenerate from canonical history");
equal(harness.purchaseStorage.values.get(PURCHASE_KEY), purchaseBytesBefore, "filtering leaves Purchase bytes unchanged");
equal(harness.inventoryStorage.values.get(INVENTORY_KEY), inventoryBytesBefore, "filtering leaves Inventory bytes unchanged");
equal(harness.purchaseStorage.writes, purchaseWritesBefore, "filtering performs zero Purchase writes");
equal(harness.inventoryStorage.writes, inventoryWritesBefore, "filtering performs zero Inventory writes");

// Derived review records deliberately have no backup or migration authority.
equal(BACKUP_SOURCE_REGISTRY.some((source) => /accountant.?review/i.test(`${source.sourceId} ${source.displayName} ${source.storageKey || ""} ${JSON.stringify(source.recordPaths || [])}`)), false, "Accountant Review adds no backup source or record path");
equal(MIGRATION_SOURCE_REGISTRY.some((source) => /accountant.?review/i.test(`${source.sourceId} ${source.displayName} ${JSON.stringify(source.paths || [])}`)), false, "Accountant Review adds no migration source or path");
equal(MIGRATION_SOURCE_REGISTRY.length, BACKUP_SOURCE_REGISTRY.length, "the migration registry still classifies only registered backup sources");
const dealMigration = getMigrationSource("deal-finder");
for (const path of ["inventory", "inventoryLots", "inventoryReconciliationEvents", "sales"]) {
  equal(dealMigration.paths.find((entry) => entry.path === path)?.classification, MIGRATION_SOURCE_CLASSIFICATIONS.REQUIRES_MAPPING, `${path} remains REQUIRES_MAPPING`);
}

for (const key of [
  "accountantReview",
  "accountantReviews",
  "accountantReviewItem",
  "accountantReviewItems",
  "accountant_review_candidate",
  "accountantReviewCandidates",
  "Accountant Review Preview",
  "accountantReviewPreviews",
  "accountantReviewFilter",
  "accountantReviewFilters",
  "accountantReviewGroup",
  "accountantReviewGroups",
  "accountantReviewSummary",
  "accountantReviewSummaries",
  "accountantReviewPeriodSummary",
  "accountantReviewPeriodSummaries",
  "accountantReviewImpactProjection",
  "accountantReviewImpactProjections",
]) {
  equal(isProhibitedDataKey(key), true, `${key} is excluded by the backup security boundary`);
}
const sanitized = sanitizeBackupData({
  safeCanonicalValue: "retained",
  accountantReviewItem: { id: "derived-review-must-not-persist" },
  nested: {
    accountantReviewPreview: { originalCogsMinorUnits: 10000 },
    accountantReviewFilters: { year: "2025" },
    accountantReviewGroups: [{ id: "prior-year" }],
    accountantReviewSummary: { reviewItemCount: 1 },
    accountantReviewPeriodSummaries: { years: [] },
    accountantReviewImpactProjections: [{ cogsAdjustmentMinorUnits: 100 }],
  },
});
equal(sanitized.data.safeCanonicalValue, "retained", "backup sanitation retains unrelated safe data");
equal(Object.hasOwn(sanitized.data, "accountantReviewItem"), false, "backup sanitation removes derived review items");
equal(Object.hasOwn(sanitized.data.nested, "accountantReviewPreview"), false, "backup sanitation recursively removes derived previews");
for (const key of ["accountantReviewFilters", "accountantReviewGroups", "accountantReviewSummary", "accountantReviewPeriodSummaries", "accountantReviewImpactProjections"]) {
  equal(Object.hasOwn(sanitized.data.nested, key), false, `backup sanitation recursively removes ${key}`);
}
equal(sanitized.excludedPaths.length, 7, "backup sanitation records every excluded derived projection");

const rawPreviewSentinel = "derived-accountant-review-must-not-enter-backup";
const backupStorage = new InstrumentedStorage({
  [PURCHASE_KEY]: purchaseBytesBefore,
  [INVENTORY_KEY]: inventoryBytesBefore,
  "code3.accountant-review-preview.test-only": {
    rawPreviewSentinel,
    items: preview.items,
    activeFilters: { year: "2025" },
  },
  "et-tcg-beta-scout": {
    stores: [],
    accountantReviewSummary: { rawPreviewSentinel },
  },
});
const backup = await createVerifiedBackup({
  localStorage: backupStorage,
  sessionStorage: new InstrumentedStorage(),
  createdAt: FIXED_RECONCILIATION_DATE,
});
equal(backup.verified, true, "canonical backup remains verifiable without a derived Accountant Review section");
const backupText = JSON.stringify(backup.backup);
excludes(backupText, new RegExp(rawPreviewSentinel), "backup excludes ephemeral review contents");
excludes(backupText, /accountant[._ -]?review/i, "backup contains no Accountant Review source, preview, or filter state");
const genericSourceSection = backup.backup.sections.find((section) => section.sourceId === "legacy-restock-scout");
equal(Object.hasOwn(genericSourceSection.data, "accountantReviewSummary"), false, "registered generic backup sources strip derived Accountant Review summaries");

const accountantSourceFiles = [
  "src/features/purchaseReceiving/accountantReview/constants.js",
  "src/features/purchaseReceiving/accountantReview/periods.js",
  "src/features/purchaseReceiving/accountantReview/contracts.js",
  "src/features/purchaseReceiving/accountantReview/AccountantReviewPanel.jsx",
];
for (const sourceFile of accountantSourceFiles) {
  const source = readFileSync(new URL(`../${sourceFile}`, import.meta.url), "utf8");
  excludes(source, /\b(?:localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket|EventSource)\b/, `${sourceFile} has no browser persistence or network dependency`);
  excludes(source, /\b(?:postJournalEntry|createJournalEntry|amendTaxReturn|syncQuickBooks|markDeductible)\b/, `${sourceFile} has no accounting or tax mutation surface`);
}
const serviceSource = readFileSync(new URL("../src/features/purchaseReceiving/service.js", import.meta.url), "utf8");
ok(/function previewAccountantReview\(filters = \{\}\) \{\s*assertOwner\(\);\s*assertSafePurchaseReceivingInput\(filters\);\s*const inventoryState = inventoryCorrectionGateway\.load\(\);/s.test(serviceSource), "verified OWNER authorization precedes Accountant Review storage access");
excludes(serviceSource, /function (?:postAccountant|saveAccountant|createAccountant|confirmAccountant|exportAccountant)/i, "the service exposes no Accountant Review mutation or export function");

console.log(`Code 3 Accountant Review zero-write contract: ${assertions} assertions passed.`);
