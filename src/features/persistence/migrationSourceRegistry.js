import { BACKUP_SOURCE_REGISTRY } from "../backup/backupSourceRegistry.js";

export const MIGRATION_SOURCE_CLASSIFICATIONS = Object.freeze({
  MIGRATABLE: "MIGRATABLE",
  REQUIRES_MAPPING: "REQUIRES_MAPPING",
  LEGACY_ONLY: "LEGACY_ONLY",
  DUPLICATE_OF_CANONICAL: "DUPLICATE_OF_CANONICAL",
  UNSUPPORTED: "UNSUPPORTED",
});

export const CANONICAL_DOMAINS = Object.freeze({
  DEAL: "DEAL",
  DEAL_SNAPSHOT: "DEAL_SNAPSHOT",
  DEAL_ANALYSIS: "DEAL_ANALYSIS",
  SEARCH_RULE: "SEARCH_RULE",
  AUCTION_EVENT: "AUCTION_EVENT",
  AUCTION_LOT: "AUCTION_LOT",
  BID_PLAN: "BID_PLAN",
  RESTOCK_STORE_PROFILE: "RESTOCK_STORE_PROFILE",
  RESTOCK_EVENT: "RESTOCK_EVENT",
  RESTOCK_PREDICTION: "RESTOCK_PREDICTION",
  STORE_VISIT: "STORE_VISIT",
  PRODUCT_OBSERVATION: "PRODUCT_OBSERVATION",
  PURCHASE: "PURCHASE",
  PURCHASE_LOT: "PURCHASE_LOT",
  COST_ALLOCATION: "COST_ALLOCATION",
  OWNED_ITEM: "OWNED_ITEM",
  INVENTORY_ADJUSTMENT: "INVENTORY_ADJUSTMENT",
  STORAGE_LOCATION: "STORAGE_LOCATION",
  SALE: "SALE",
  SALE_LINE_ITEM: "SALE_LINE_ITEM",
  SHIPMENT: "SHIPMENT",
  RETURN: "RETURN",
  EXPENSE: "EXPENSE",
  MILEAGE_TRIP: "MILEAGE_TRIP",
  RECEIPT_METADATA: "RECEIPT_METADATA",
  OWNER_PREFERENCE: "OWNER_PREFERENCE",
  FEATURE_SETTING: "FEATURE_SETTING",
  FILE_ASSET: "FILE_ASSET",
});

const C = MIGRATION_SOURCE_CLASSIFICATIONS;
const D = CANONICAL_DOMAINS;

function paths(entries) {
  return entries.map(([path, targetDomain, classification = C.MIGRATABLE, options = {}]) => ({
    path,
    targetDomain,
    classification,
    ...options,
  }));
}

const SOURCE_DECISIONS = Object.freeze({
  "deal-finder": {
    classification: C.MIGRATABLE,
    adapterId: "deal-finder-v2-to-canonical-v1",
    paths: paths([
      ["deals", D.DEAL],
      ["providerListings", D.DEAL_SNAPSHOT],
      ["appraisals", D.DEAL_ANALYSIS],
      ["searchRules", D.SEARCH_RULE],
      ["auctions", D.AUCTION_LOT, C.REQUIRES_MAPPING, { reason: "Current auctions combine event, lot, bid-plan, and pickup fields." }],
      ["purchases", D.PURCHASE],
      ["lots", D.PURCHASE_LOT],
      ["costAllocations", D.COST_ALLOCATION],
      ["inventory", D.OWNED_ITEM],
      ["sales", D.SALE],
      ["returns", D.RETURN],
      ["expenses", D.EXPENSE],
      ["mileage", D.MILEAGE_TRIP],
      ["activity", null, C.LEGACY_ONLY, { reason: "Local activity summaries are not canonical audit events." }],
    ]),
  },
  "owner-center": {
    classification: C.MIGRATABLE,
    adapterId: "owner-center-v1-to-canonical-v1",
    paths: paths([
      ["restockStoreProfiles", D.RESTOCK_STORE_PROFILE],
      ["restockEvents", D.RESTOCK_EVENT],
      ["restockPredictions", D.RESTOCK_PREDICTION],
      ["storeVisits", D.STORE_VISIT],
      ["productObservations", D.PRODUCT_OBSERVATION],
      ["controls.scoring", D.OWNER_PREFERENCE, C.MIGRATABLE, { singleton: true }],
      ["controls.features", D.FEATURE_SETTING, C.MIGRATABLE, { expandObjectEntries: true }],
      ["imports", null, C.LEGACY_ONLY, { reason: "Local import summaries do not contain canonical import provenance." }],
      ["jobs", null, C.LEGACY_ONLY, { reason: "Local job summaries are not durable scheduler history." }],
    ]),
  },
  "legacy-core-business": {
    classification: C.REQUIRES_MAPPING,
    adapterId: "legacy-core-v0-review",
    paths: paths([
      ["items", D.OWNED_ITEM, C.REQUIRES_MAPPING, { reason: "Legacy item purpose and physical identity require owner review." }],
      ["purchasers", null, C.LEGACY_ONLY, { reason: "Legacy purchaser summaries have no canonical Phase 1B owner-record domain." }],
      ["sales", D.SALE, C.DUPLICATE_OF_CANONICAL, { reason: "May overlap canonical Deal Finder sales." }],
      ["expenses", D.EXPENSE, C.DUPLICATE_OF_CANONICAL, { reason: "May overlap canonical Deal Finder expenses." }],
      ["mileageTrips", D.MILEAGE_TRIP, C.DUPLICATE_OF_CANONICAL, { reason: "May overlap canonical Deal Finder mileage." }],
      ["marketplaceListings", D.DEAL, C.REQUIRES_MAPPING],
      ["marketplaceReports", D.DEAL, C.REQUIRES_MAPPING, { reason: "Legacy marketplace reports require owner review before becoming canonical opportunities." }],
      ["marketPriceMemories", null, C.LEGACY_ONLY, { reason: "Legacy price memories are not licensed or structured canonical comparable records." }],
      ["itemComparisons", null, C.LEGACY_ONLY, { reason: "Legacy comparison summaries have no canonical Phase 1B domain." }],
      ["tideTradrWatchlist", D.DEAL, C.REQUIRES_MAPPING],
      ["vaultCollectionSets", null, C.LEGACY_ONLY],
      ["vaultDisplayCase", null, C.LEGACY_ONLY],
      ["tradeRecords", null, C.LEGACY_ONLY],
      ["trades", null, C.LEGACY_ONLY],
      ["sparkGifts", null, C.LEGACY_ONLY],
      ["sparkKidPacks", null, C.LEGACY_ONLY],
      ["sparkEventPlans", null, C.LEGACY_ONLY],
      ["collectorEventPlans", null, C.LEGACY_ONLY],
      ["vehicles", null, C.LEGACY_ONLY, { reason: "Vehicle settings are not a canonical Phase 1B owner-record domain." }],
      ["workspaces", null, C.LEGACY_ONLY, { reason: "Legacy workspace layout data is compatibility-only." }],
    ]),
  },
  "legacy-restock-scout": {
    classification: C.REQUIRES_MAPPING,
    adapterId: "legacy-restock-v0-review",
    paths: paths([
      ["reports", D.RESTOCK_EVENT, C.REQUIRES_MAPPING],
      ["stores", D.RESTOCK_STORE_PROFILE, C.REQUIRES_MAPPING],
      ["restockPatterns", D.RESTOCK_PREDICTION, C.REQUIRES_MAPPING],
      ["items", D.PRODUCT_OBSERVATION, C.REQUIRES_MAPPING],
      ["routes", null, C.LEGACY_ONLY, { reason: "Legacy trip-route drafts are not canonical route data." }],
      ["restockIntel", D.RESTOCK_PREDICTION, C.REQUIRES_MAPPING, { reason: "Derived legacy intelligence requires evidence and owner review." }],
      ["tidepoolReports", D.RESTOCK_EVENT, C.REQUIRES_MAPPING],
      ["tidepoolEvents", null, C.LEGACY_ONLY],
      ["intelImportReviews", null, C.LEGACY_ONLY, { reason: "Legacy import-review summaries are preserved but are not canonical restock evidence." }],
      ["storeAliases", null, C.LEGACY_ONLY, { reason: "Legacy store aliases remain compatibility metadata." }],
      ["bestBuyStockResults", null, C.UNSUPPORTED, { reason: "Legacy monitor cache is not canonical restock evidence." }],
      ["bestBuyStockHistory", null, C.UNSUPPORTED, { reason: "Legacy monitor cache is not canonical restock evidence." }],
      ["bestBuyStoreStock", null, C.UNSUPPORTED, { reason: "Legacy monitor cache is not canonical restock evidence." }],
      ["bestBuyAlerts", null, C.UNSUPPORTED, { reason: "Legacy alert cache is not canonical restock evidence." }],
      ["bestBuyNightlyReports", null, C.UNSUPPORTED, { reason: "Legacy monitor reports are not canonical restock evidence." }],
    ]),
  },
  "product-sightings": {
    classification: C.REQUIRES_MAPPING,
    adapterId: "product-sightings-v0-review",
    paths: paths([["$", D.PRODUCT_OBSERVATION, C.REQUIRES_MAPPING]]),
  },
  "phase2-local-fallback": {
    classification: C.REQUIRES_MAPPING,
    adapterId: "phase2-local-v0-review",
    paths: paths([
      ["receiptRecords", D.RECEIPT_METADATA, C.REQUIRES_MAPPING],
      ["receiptLineItems", D.RECEIPT_METADATA, C.REQUIRES_MAPPING],
      ["dealFinderItems", D.DEAL, C.DUPLICATE_OF_CANONICAL],
      ["dealFinderSessions", null, C.LEGACY_ONLY],
      ["scannerIntakeSessions", null, C.LEGACY_ONLY],
      ["marketplaceListingChannels", null, C.LEGACY_ONLY],
      ["kidCommunityProjects", null, C.LEGACY_ONLY],
      ["kidCommunityProjectItems", null, C.LEGACY_ONLY],
      ["aiAssistEvents", null, C.UNSUPPORTED],
    ]),
  },
  "safe-ui-preferences": {
    classification: C.REQUIRES_MAPPING,
    adapterId: "safe-preferences-v1-review",
    paths: paths([["$", D.OWNER_PREFERENCE, C.REQUIRES_MAPPING, { singleton: true }]]),
  },
  "file-assets": {
    classification: C.MIGRATABLE,
    adapterId: "file-asset-manifest-v1-to-canonical-v1",
    paths: paths([["$", D.FILE_ASSET]]),
  },
  "supabase-owner-data": {
    classification: C.DUPLICATE_OF_CANONICAL,
    adapterId: "remote-source-manifest-only",
    paths: [],
  },
  "postgres-owner-data": {
    classification: C.DUPLICATE_OF_CANONICAL,
    adapterId: "remote-source-manifest-only",
    paths: paths([["records", null, C.DUPLICATE_OF_CANONICAL, { reason: "Owner-authorized canonical server records are comparison data, not local migration candidates." }]]),
  },
  "authentication-state": {
    classification: C.UNSUPPORTED,
    adapterId: null,
    paths: [],
  },
});

const LEGACY_ONLY_SOURCES = new Set([
  "legacy-community",
  "legacy-feedback",
  "legacy-suggestions",
  "legacy-admin-review-history",
  "manual-market-price-cache",
  "beta-readiness-records",
  "grade-assist-checklists",
  "assistant-thread",
  "daily-progress",
  "workflow-drafts",
]);

function sourceDecision(source) {
  if (SOURCE_DECISIONS[source.sourceId]) return SOURCE_DECISIONS[source.sourceId];
  if (LEGACY_ONLY_SOURCES.has(source.sourceId)) {
    return {
      classification: C.LEGACY_ONLY,
      adapterId: "legacy-preserve-only",
      paths: (source.recordPaths || []).map((path) => ({ path, targetDomain: null, classification: C.LEGACY_ONLY })),
    };
  }
  return { classification: C.UNSUPPORTED, adapterId: null, paths: [] };
}

export const MIGRATION_SOURCE_REGISTRY = Object.freeze(BACKUP_SOURCE_REGISTRY.map((source) => Object.freeze({
  sourceId: source.sourceId,
  displayName: source.displayName,
  storageType: source.storageType,
  sourceSchemaVersion: source.schemaVersion,
  includedInPhase1AExport: source.includedInPhase1AExport,
  containsSecurityOrSessionState: source.containsSecurityOrSessionState,
  ...sourceDecision(source),
})));

export function getMigrationSource(sourceId, sourceRegistry = MIGRATION_SOURCE_REGISTRY) {
  return sourceRegistry.find((source) => source.sourceId === sourceId) || null;
}

function valueAtPath(value, path) {
  if (path === "$" || !path) return value;
  return String(path).split(".").reduce((current, key) => current?.[key], value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function rowsForMapping(data, mapping) {
  const value = valueAtPath(data, mapping.path);
  if (mapping.expandObjectEntries && value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([settingKey, enabled]) => ({ settingKey, enabled: Boolean(enabled) }));
  }
  if (mapping.singleton) {
    return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length ? [value] : [];
  }
  if (mapping.path === "$" && Array.isArray(value)) return value;
  return Array.isArray(value) ? value : [];
}

export function classifyMigrationSources(sourceRegistry = MIGRATION_SOURCE_REGISTRY) {
  return sourceRegistry.map((source) => ({
    sourceId: source.sourceId,
    displayName: source.displayName,
    classification: source.classification,
    adapterId: source.adapterId,
  }));
}

export function extractMigrationCandidates(localSources = {}, options = {}) {
  const sourceRegistry = options.sourceRegistry || MIGRATION_SOURCE_REGISTRY;
  const candidates = [];
  const sourceFindings = [];

  for (const source of sourceRegistry) {
    const data = localSources instanceof Map ? localSources.get(source.sourceId) : localSources?.[source.sourceId];
    if (data == null) continue;

    if (source.containsSecurityOrSessionState && source.classification === C.UNSUPPORTED) {
      sourceFindings.push({
        sourceId: source.sourceId,
        classification: source.classification,
        severity: "INFO",
        message: "Security and authentication persistence is intentionally excluded from migration.",
      });
      continue;
    }

    for (const mapping of source.paths || []) {
      const rows = rowsForMapping(data, mapping);
      rows.forEach((record, index) => {
        if (!record || typeof record !== "object" || Array.isArray(record)) {
          sourceFindings.push({
            sourceId: source.sourceId,
            collection: mapping.path,
            classification: mapping.classification,
            severity: "ERROR",
            message: "Migration source contains a non-record entry.",
          });
          return;
        }
        candidates.push({
          sourceId: source.sourceId,
          sourceDisplayName: source.displayName,
          sourceSchemaVersion: source.sourceSchemaVersion,
          sourceClassification: source.classification,
          adapterId: source.adapterId,
          sourceCollection: mapping.path,
          sourceIndex: index,
          targetDomain: mapping.targetDomain,
          classification: mapping.classification,
          mappingReason: mapping.reason || "",
          record: clone(record),
        });
      });
    }
  }

  return { candidates, sourceFindings };
}

export function validateMigrationSourceRegistry(
  sourceRegistry = MIGRATION_SOURCE_REGISTRY,
  backupRegistry = BACKUP_SOURCE_REGISTRY,
) {
  const errors = [];
  const validClassifications = new Set(Object.values(MIGRATION_SOURCE_CLASSIFICATIONS));
  const sourceIds = new Set();
  for (const source of sourceRegistry) {
    if (!source.sourceId || sourceIds.has(source.sourceId)) errors.push(`Duplicate or missing migration source ID: ${source.sourceId || "empty"}.`);
    sourceIds.add(source.sourceId);
    if (!validClassifications.has(source.classification)) errors.push(`Source ${source.sourceId} has an invalid classification.`);
    for (const mapping of source.paths || []) {
      if (!validClassifications.has(mapping.classification)) errors.push(`Source ${source.sourceId}.${mapping.path} has an invalid classification.`);
      if (mapping.classification === C.MIGRATABLE && !mapping.targetDomain) errors.push(`Migratable source ${source.sourceId}.${mapping.path} has no canonical domain.`);
    }
  }
  for (const source of backupRegistry) {
    if (!sourceIds.has(source.sourceId)) errors.push(`Backup source ${source.sourceId} is not classified for migration.`);
    const migrationSource = sourceRegistry.find((entry) => entry.sourceId === source.sourceId);
    const classifiedPaths = new Set((migrationSource?.paths || []).map((mapping) => mapping.path));
    for (const recordPath of source.recordPaths || []) {
      if (!classifiedPaths.has(recordPath)) errors.push(`Backup source ${source.sourceId}.${recordPath} has no explicit migration classification.`);
    }
  }
  return { valid: errors.length === 0, errors };
}
