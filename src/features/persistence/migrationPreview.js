import { canonicalStringify, hashCanonicalJson } from "../backup/canonicalJson.js";
import { readCurrentBackupSources } from "../backup/backupFormat.js";
import {
  CANONICAL_DOMAINS,
  extractMigrationCandidates,
  MIGRATION_SOURCE_CLASSIFICATIONS,
  MIGRATION_SOURCE_REGISTRY,
} from "./migrationSourceRegistry.js";
import { inspectRecordMoney, MONEY_PREVIEW_STATUS } from "./moneyConversion.js";
import { validateFileAssetMetadata } from "./fileAsset.js";
import {
  CANONICAL_RELATION_CONTRACT,
  isCanonicalUuid,
  normalizeLegacyStatus,
  validateCanonicalWireInput,
} from "./canonicalWireContract.js";
import {
  createUnavailableRemoteBackupAdapter,
  REMOTE_BACKUP_STATES,
} from "./remoteBackupAdapter.js";
import { PERSISTENCE_MODES } from "./persistenceMode.js";

export const MIGRATION_PREVIEW_STATUSES = Object.freeze({
  READY: "READY",
  READY_WITH_WARNINGS: "READY_WITH_WARNINGS",
  BLOCKED: "BLOCKED",
  NO_DATA: "NO_DATA",
});

export const MIGRATION_ACTIONS = Object.freeze({
  INSERT: "INSERT",
  UPDATE: "UPDATE",
  SKIP: "SKIP",
  REQUIRES_DECISION: "REQUIRES_DECISION",
});

export const MIGRATION_PLAN_FORMAT = "code-3-migration-plan";
export const MIGRATION_PLAN_VERSION = 1;
export const CANONICAL_PERSISTENCE_TARGET = "Owner-authorized Code 3 API and PostgreSQL / Supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STABLE_SOURCE_ID_FIELDS = ["id", "recordId", "record_id"];
const PROVIDER_FIELDS = ["providerId", "provider", "marketplace", "externalProvider", "external_provider"];
const EXTERNAL_ID_FIELDS = ["externalListingId", "external_listing_id", "externalId", "external_id"];
const CERTIFICATION_FIELDS = ["certificationNumber", "certification_number", "certNumber", "cert_number"];
const SALE_REFERENCE_FIELDS = ["saleReference", "sale_reference", "externalSaleId", "external_sale_id", "orderId", "order_id"];
const IMPORT_REFERENCE_FIELDS = ["importReference", "import_reference", "externalImportId", "external_import_id", "sourceImportId", "source_import_id", "importJobId", "import_job_id"];
const EXPENSE_DATE_FIELDS = ["date", "expenseDate", "expense_date", "occurredAt", "occurred_at"];
const EXPENSE_MERCHANT_FIELDS = ["merchant", "merchantName", "merchant_name"];
const EXPENSE_AMOUNT_FIELDS = ["amount", "totalCost", "total_cost"];
const VERSION_FIELDS = ["recordVersion", "record_version", "version"];
const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_DRY_RUN_ACTIONS = 1_000;
const SKIPPED_SOURCE_CLASSIFICATIONS = new Set([
  MIGRATION_SOURCE_CLASSIFICATIONS.LEGACY_ONLY,
  MIGRATION_SOURCE_CLASSIFICATIONS.UNSUPPORTED,
  MIGRATION_SOURCE_CLASSIFICATIONS.DUPLICATE_OF_CANONICAL,
]);
const FILE_REFERENCE_HINT_PATTERN = /^(?:receipt|image|images|photo|photos|screenshot|screenshots|file|files)(?:url|urls|reference|references|path|paths|key|keys|id|ids)?$/i;

const PRIMARY_MONEY_FIELDS_BY_DOMAIN = Object.freeze({
  [CANONICAL_DOMAINS.DEAL]: ["askingPrice", "asking_price", "currentBid", "current_bid", "price"],
  [CANONICAL_DOMAINS.DEAL_ANALYSIS]: ["expectedProfit", "expected_profit", "maximumOffer", "maximum_offer"],
  [CANONICAL_DOMAINS.AUCTION_LOT]: ["currentBid", "current_bid", "maximumBid", "maximum_bid"],
  [CANONICAL_DOMAINS.PURCHASE]: ["totalPurchaseCost", "totalCost", "total_cost", "purchasePrice", "purchase_price"],
  [CANONICAL_DOMAINS.COST_ALLOCATION]: ["amount", "allocatedCost", "allocated_cost"],
  [CANONICAL_DOMAINS.OWNED_ITEM]: ["allocatedCost", "allocated_cost", "allocatedItemCost", "allocated_item_cost"],
  [CANONICAL_DOMAINS.SALE]: ["netProceeds", "net_proceeds", "grossSalePrice", "gross_sale_price", "grossPrice", "gross_price"],
  [CANONICAL_DOMAINS.EXPENSE]: ["amount", "totalCost", "total_cost"],
  [CANONICAL_DOMAINS.RECEIPT_METADATA]: ["receiptTotal", "receipt_total", "amount", "totalCost", "total_cost"],
  [CANONICAL_DOMAINS.PRODUCT_OBSERVATION]: ["msrp", "price"],
});

const REFERENCE_FIELDS = Object.freeze({
  dealId: { domain: CANONICAL_DOMAINS.DEAL, severity: "WARNING" },
  deal_id: { domain: CANONICAL_DOMAINS.DEAL, severity: "WARNING" },
  relatedDealId: { domain: CANONICAL_DOMAINS.DEAL, severity: "WARNING" },
  related_deal_id: { domain: CANONICAL_DOMAINS.DEAL, severity: "WARNING" },
  purchaseId: { domain: CANONICAL_DOMAINS.PURCHASE, severity: "BLOCKER" },
  purchase_id: { domain: CANONICAL_DOMAINS.PURCHASE, severity: "BLOCKER" },
  relatedPurchaseId: { domain: CANONICAL_DOMAINS.PURCHASE, severity: "BLOCKER" },
  related_purchase_id: { domain: CANONICAL_DOMAINS.PURCHASE, severity: "BLOCKER" },
  purchaseLotId: { domain: CANONICAL_DOMAINS.PURCHASE_LOT, severity: "BLOCKER" },
  purchase_lot_id: { domain: CANONICAL_DOMAINS.PURCHASE_LOT, severity: "BLOCKER" },
  lotId: { domain: CANONICAL_DOMAINS.PURCHASE_LOT, severity: "BLOCKER" },
  lot_id: { domain: CANONICAL_DOMAINS.PURCHASE_LOT, severity: "BLOCKER" },
  inventoryItemId: { domain: CANONICAL_DOMAINS.OWNED_ITEM, severity: "BLOCKER" },
  inventory_item_id: { domain: CANONICAL_DOMAINS.OWNED_ITEM, severity: "BLOCKER" },
  ownedItemId: { domain: CANONICAL_DOMAINS.OWNED_ITEM, severity: "BLOCKER" },
  owned_item_id: { domain: CANONICAL_DOMAINS.OWNED_ITEM, severity: "BLOCKER" },
  saleId: { domain: CANONICAL_DOMAINS.SALE, severity: "BLOCKER" },
  sale_id: { domain: CANONICAL_DOMAINS.SALE, severity: "BLOCKER" },
  originalSaleId: { domain: CANONICAL_DOMAINS.SALE, severity: "BLOCKER" },
  original_sale_id: { domain: CANONICAL_DOMAINS.SALE, severity: "BLOCKER" },
  returnId: { domain: CANONICAL_DOMAINS.RETURN, severity: "WARNING" },
  return_id: { domain: CANONICAL_DOMAINS.RETURN, severity: "WARNING" },
  storageLocationId: { domain: CANONICAL_DOMAINS.STORAGE_LOCATION, severity: "WARNING" },
  storage_location_id: { domain: CANONICAL_DOMAINS.STORAGE_LOCATION, severity: "WARNING" },
  auctionEventId: { domain: CANONICAL_DOMAINS.AUCTION_EVENT, severity: "WARNING" },
  auction_event_id: { domain: CANONICAL_DOMAINS.AUCTION_EVENT, severity: "WARNING" },
  auctionLotId: { domain: CANONICAL_DOMAINS.AUCTION_LOT, severity: "WARNING" },
  auction_lot_id: { domain: CANONICAL_DOMAINS.AUCTION_LOT, severity: "WARNING" },
  storeId: { domain: CANONICAL_DOMAINS.RESTOCK_STORE_PROFILE, severity: "WARNING" },
  store_id: { domain: CANONICAL_DOMAINS.RESTOCK_STORE_PROFILE, severity: "WARNING" },
  restockStoreProfileId: { domain: CANONICAL_DOMAINS.RESTOCK_STORE_PROFILE, severity: "WARNING" },
  restock_store_profile_id: { domain: CANONICAL_DOMAINS.RESTOCK_STORE_PROFILE, severity: "WARNING" },
  storeVisitId: { domain: CANONICAL_DOMAINS.STORE_VISIT, severity: "WARNING" },
  store_visit_id: { domain: CANONICAL_DOMAINS.STORE_VISIT, severity: "WARNING" },
  receiptId: { domain: CANONICAL_DOMAINS.RECEIPT_METADATA, severity: "WARNING" },
  receipt_id: { domain: CANONICAL_DOMAINS.RECEIPT_METADATA, severity: "WARNING" },
  fileAssetId: { domain: CANONICAL_DOMAINS.FILE_ASSET, severity: "BLOCKER" },
  file_asset_id: { domain: CANONICAL_DOMAINS.FILE_ASSET, severity: "BLOCKER" },
  parentStorageLocationId: { domain: CANONICAL_DOMAINS.STORAGE_LOCATION, severity: "WARNING" },
  parent_storage_location_id: { domain: CANONICAL_DOMAINS.STORAGE_LOCATION, severity: "WARNING" },
});

const RELATION_FIELD_ALIASES = Object.freeze({
  dealId: ["dealId", "deal_id", "relatedDealId", "related_deal_id"],
  auctionEventId: ["auctionEventId", "auction_event_id", "relatedAuctionId", "related_auction_id"],
  auctionLotId: ["auctionLotId", "auction_lot_id"],
  storeId: ["storeId", "store_id", "restockStoreProfileId", "restock_store_profile_id"],
  purchaseId: ["purchaseId", "purchase_id", "relatedPurchaseId", "related_purchase_id"],
  purchaseLotId: ["purchaseLotId", "purchase_lot_id", "lotId", "lot_id"],
  ownedItemId: ["ownedItemId", "owned_item_id", "inventoryItemId", "inventory_item_id"],
  saleId: ["saleId", "sale_id", "originalSaleId", "original_sale_id"],
  returnId: ["returnId", "return_id"],
  storageLocationId: ["storageLocationId", "storage_location_id"],
  parentStorageLocationId: ["parentStorageLocationId", "parent_storage_location_id"],
  storeVisitId: ["storeVisitId", "store_visit_id"],
  receiptId: ["receiptId", "receipt_id"],
  fileAssetId: ["fileAssetId", "file_asset_id"],
});

function clone(value) {
  return JSON.parse(canonicalStringify(value));
}

function textValue(record, fields) {
  for (const field of fields) {
    if (record?.[field] != null && String(record[field]).trim()) return String(record[field]).trim();
  }
  return "";
}

function sourceRecordId(record) {
  return textValue(record, STABLE_SOURCE_ID_FIELDS);
}

function recordVersion(record) {
  for (const field of VERSION_FIELDS) {
    if (record?.[field] == null || record[field] === "") continue;
    const value = Number(record[field]);
    return Number.isInteger(value) && value > 0 ? value : null;
  }
  return 1;
}

function providerExternalKey(record) {
  const provider = textValue(record, PROVIDER_FIELDS).toLowerCase();
  const externalId = textValue(record, EXTERNAL_ID_FIELDS);
  return provider && externalId ? `${provider}:${externalId}` : "";
}

function domainProviderExternalKey(domain, record) {
  const identity = providerExternalKey(record);
  return domain && identity ? `${domain}:${identity}` : "";
}

function certificationKey(record) {
  return textValue(record, CERTIFICATION_FIELDS).toLowerCase();
}

function saleReferenceKey(record) {
  return textValue(record, SALE_REFERENCE_FIELDS).toLowerCase();
}

function isArchivedRecord(record) {
  return Boolean(record?.archivedAt || record?.archived_at);
}

function importReferenceKey(record) {
  return textValue(record, IMPORT_REFERENCE_FIELDS).toLowerCase();
}

function expenseSemanticKey(record) {
  const rawDate = firstDefined(record, EXPENSE_DATE_FIELDS);
  const merchant = textValue(record, EXPENSE_MERCHANT_FIELDS).toLowerCase().replace(/\s+/g, " ");
  const amount = firstDefined(record, EXPENSE_AMOUNT_FIELDS);
  const currency = textValue(record, ["currency", "currencyCode", "currency_code"]).toUpperCase();
  if (rawDate == null || !merchant || typeof amount !== "number" || !Number.isFinite(amount) || !/^[A-Z]{3}$/.test(currency)) return "";
  const parsedDate = Date.parse(String(rawDate));
  if (!Number.isFinite(parsedDate)) return "";
  return `${new Date(parsedDate).toISOString().slice(0, 10)}|${merchant}|${String(amount)}|${currency}`;
}

function uuidFromHash(hash) {
  const clean = String(hash).replace(/[^a-f0-9]/gi, "").padEnd(32, "0").slice(0, 32).toLowerCase().split("");
  clean[12] = "5";
  clean[16] = ["8", "9", "a", "b"][parseInt(clean[16] || "0", 16) % 4];
  const value = clean.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function stableSemanticIdentity(candidate) {
  const providerKey = isArchivedRecord(candidate.record)
    ? ""
    : domainProviderExternalKey(candidate.targetDomain, candidate.record);
  if (providerKey) return { kind: "PROVIDER_EXTERNAL_ID", value: providerKey };
  if (candidate.targetDomain === CANONICAL_DOMAINS.OWNED_ITEM && !isArchivedRecord(candidate.record)) {
    const certification = certificationKey(candidate.record);
    if (certification) return { kind: "CERTIFICATION_NUMBER", value: certification };
  }
  if (candidate.targetDomain === CANONICAL_DOMAINS.SALE) {
    const saleReference = saleReferenceKey(candidate.record);
    if (saleReference) return { kind: "SALE_REFERENCE", value: saleReference };
  }
  return null;
}

async function identifyCandidate(candidate, hashImplementation) {
  const legacyId = sourceRecordId(candidate.record);
  const fingerprint = await hashCanonicalJson(candidate.record, hashImplementation);
  const preserved = UUID_PATTERN.test(legacyId);
  const semanticIdentity = legacyId ? null : stableSemanticIdentity(candidate);
  const identitySeed = {
    formatVersion: MIGRATION_PLAN_VERSION,
    sourceId: candidate.sourceId,
    sourceCollection: candidate.sourceCollection,
    identity: legacyId
      ? { kind: "LEGACY_ID", legacyId }
      : semanticIdentity,
  };
  const proposedId = preserved
    ? legacyId.toLowerCase()
    : identitySeed.identity
      ? uuidFromHash(await hashCanonicalJson(identitySeed, hashImplementation))
      : null;
  return {
    ...candidate,
    legacyId,
    proposedId,
    idOrigin: preserved
      ? "PRESERVED_UUID"
      : legacyId
        ? "DETERMINISTIC_LEGACY_ID_PROPOSAL"
        : semanticIdentity
          ? "DETERMINISTIC_SEMANTIC_ID_PROPOSAL"
          : "OWNER_ASSIGNMENT_REQUIRED",
    semanticIdentity,
    fingerprint,
    recordVersion: recordVersion(candidate.record),
  };
}

function finding(code, message, details = {}) {
  return { code, message, ...details };
}

function findingKey(value) {
  return canonicalStringify(value);
}

function dedupeAndSort(findings) {
  const unique = new Map();
  for (const entry of findings) unique.set(findingKey(entry), entry);
  return [...unique.values()].sort((left, right) => findingKey(left).localeCompare(findingKey(right)));
}

function inspectUnsafeKeys(record, basePath) {
  const blockers = [];
  const stack = [{ value: record, path: basePath, depth: 0 }];
  while (stack.length) {
    const current = stack.pop();
    if (current.depth > 40) {
      blockers.push(finding("MAX_NESTING_DEPTH", `Record exceeds the nesting limit at ${current.path}.`, { path: current.path }));
      continue;
    }
    if (!current.value || typeof current.value !== "object") continue;
    if (Array.isArray(current.value)) {
      if (current.value.length > 50_000) blockers.push(finding("MAX_ARRAY_LENGTH", `Record array is too large at ${current.path}.`, { path: current.path }));
      current.value.forEach((value, index) => stack.push({ value, path: `${current.path}[${index}]`, depth: current.depth + 1 }));
      continue;
    }
    for (const [key, value] of Object.entries(current.value)) {
      if (PROTOTYPE_KEYS.has(key)) blockers.push(finding("PROHIBITED_KEY", `Record contains a prohibited key at ${current.path}.${key}.`, { path: `${current.path}.${key}` }));
      stack.push({ value, path: `${current.path}.${key}`, depth: current.depth + 1 });
    }
  }
  return blockers;
}

function remoteDomains(remoteSnapshot) {
  if (remoteSnapshot?.domains && typeof remoteSnapshot.domains === "object") return remoteSnapshot.domains;
  return {};
}

function remoteStatus(remoteSnapshot) {
  return remoteSnapshot?.status || REMOTE_BACKUP_STATES.UNAVAILABLE;
}

function remoteDomainAbsenceIsAuthoritative(remoteSnapshot, domain) {
  if (remoteStatus(remoteSnapshot) !== REMOTE_BACKUP_STATES.AVAILABLE) {
    return { authoritative: false, reason: "Canonical remote records were unavailable." };
  }
  if (!Object.prototype.hasOwnProperty.call(remoteDomains(remoteSnapshot), domain)) {
    return { authoritative: false, reason: `Remote export did not include ${domain}.` };
  }
  if ((remoteSnapshot.truncatedDomains || []).includes(domain)) {
    return { authoritative: false, reason: `Remote export truncated ${domain}.` };
  }
  if (!['COMPLETE', 'PARTIAL'].includes(remoteSnapshot.coverageStatus)) {
    return { authoritative: false, reason: "Remote export coverage could not be verified." };
  }
  return { authoritative: true, reason: "" };
}

function remoteIndexes(remoteSnapshot) {
  const byId = new Map();
  const byDomainId = new Map();
  const byLegacy = new Map();
  const byProviderExternal = new Map();
  const records = [];
  for (const [domain, domainRecords] of Object.entries(remoteDomains(remoteSnapshot))) {
    if (!Array.isArray(domainRecords)) continue;
    for (const record of domainRecords) {
      if (!record || typeof record !== "object" || Array.isArray(record)) continue;
      const row = { domain, record };
      records.push(row);
      const id = textValue(record, STABLE_SOURCE_ID_FIELDS);
      if (id) {
        const normalizedId = id.toLowerCase();
        if (!byId.has(normalizedId)) byId.set(normalizedId, row);
        byDomainId.set(`${domain}:${normalizedId}`, row);
      }
      const migration = record.metadata?.migration || record.migration || {};
      const migrationSourceId = record.migrationSourceId || migration.sourceId;
      const migrationCollection = record.migrationSourceCollection || migration.sourceCollection;
      const migrationLegacyId = record.legacyId || migration.sourceRecordId || migration.legacyId;
      if (migrationSourceId && migrationCollection && migrationLegacyId) {
        byLegacy.set(`${domain}:${migrationSourceId}:${migrationCollection}:${migrationLegacyId}`, row);
      }
      const externalKey = domainProviderExternalKey(domain, record);
      if (externalKey && !isArchivedRecord(record)) byProviderExternal.set(externalKey, row);
    }
  }
  return { byId, byDomainId, byLegacy, byProviderExternal, records };
}

function findRemoteMatch(candidate, indexes) {
  const byId = candidate.proposedId
    ? indexes.byDomainId.get(`${candidate.targetDomain}:${candidate.proposedId.toLowerCase()}`)
    : null;
  if (byId) return { ...byId, matchedBy: "STABLE_ID" };
  if (candidate.legacyId) {
    const key = `${candidate.targetDomain}:${candidate.sourceId}:${candidate.sourceCollection}:${candidate.legacyId}`;
    const byLegacy = indexes.byLegacy.get(key);
    if (byLegacy) return { ...byLegacy, matchedBy: "MIGRATION_SOURCE" };
  }
  const providerKey = !isArchivedRecord(candidate.record)
    ? domainProviderExternalKey(candidate.targetDomain, candidate.record)
    : "";
  const byProvider = providerKey ? indexes.byProviderExternal.get(providerKey) : null;
  return byProvider ? { ...byProvider, matchedBy: "PROVIDER_EXTERNAL_ID" } : null;
}

function hasProvenMigrationLineage(candidate, remoteRecord) {
  const migration = remoteRecord?.metadata?.migration || remoteRecord?.migration || {};
  if (migration.sourceId !== candidate.sourceId || migration.sourceCollection !== candidate.sourceCollection) return false;
  if (candidate.legacyId) {
    return String(migration.sourceRecordId || migration.legacyId || "") === candidate.legacyId;
  }
  return false;
}

async function remoteFingerprint(record, hashImplementation) {
  if (typeof record?.sourceFingerprint === "string" && /^[a-f0-9]{64}$/i.test(record.sourceFingerprint)) {
    return record.sourceFingerprint.toLowerCase();
  }
  if (typeof record?.metadata?.migration?.sourceFingerprint === "string" && /^[a-f0-9]{64}$/i.test(record.metadata.migration.sourceFingerprint)) {
    return record.metadata.migration.sourceFingerprint.toLowerCase();
  }
  if (record?.migrationSourceRecord && typeof record.migrationSourceRecord === "object") {
    return hashCanonicalJson(record.migrationSourceRecord, hashImplementation);
  }
  if (record?.metadata?.sourceRecord && typeof record.metadata.sourceRecord === "object") {
    return hashCanonicalJson(record.metadata.sourceRecord, hashImplementation);
  }
  return "";
}

function duplicateFindings(candidates) {
  const duplicateIds = [];
  const duplicateProviderExternalIds = [];
  const duplicateCertifications = [];
  const duplicateSaleReferences = [];
  const duplicateExpenseSemanticKeys = [];
  const duplicateImportReferences = [];
  const ids = new Map();
  const externalIds = new Map();
  const certifications = new Map();
  const saleReferences = new Map();
  const expenseSemanticKeys = new Map();
  const importReferences = new Map();

  for (const candidate of candidates.filter((entry) => entry.targetDomain && !SKIPPED_SOURCE_CLASSIFICATIONS.has(entry.classification))) {
    const canonicalId = candidate.proposedId;
    const idKey = canonicalId?.toLowerCase();
    if (idKey && ids.has(idKey)) {
      const first = ids.get(idKey);
      duplicateIds.push(finding("DUPLICATE_STABLE_ID", `Canonical ID ${canonicalId} appears more than once for this owner.`, {
        domain: candidate.targetDomain,
        id: canonicalId,
        firstDomain: first.targetDomain,
        secondDomain: candidate.targetDomain,
        firstSource: first.sourceId,
        secondSource: candidate.sourceId,
      }));
    } else if (idKey) ids.set(idKey, candidate);

    if (!isArchivedRecord(candidate.record)) {
      const key = domainProviderExternalKey(candidate.targetDomain, candidate.record);
      if (key && externalIds.has(key)) duplicateProviderExternalIds.push(finding(
        "DUPLICATE_PROVIDER_EXTERNAL_ID",
        `Provider/external identity ${providerExternalKey(candidate.record)} appears more than once in ${candidate.targetDomain}.`,
        {
          domain: candidate.targetDomain,
          providerExternalId: providerExternalKey(candidate.record),
          domainProviderExternalId: key,
        },
      ));
      else if (key) externalIds.set(key, candidate);
    }

    if (candidate.targetDomain === CANONICAL_DOMAINS.OWNED_ITEM && !isArchivedRecord(candidate.record)) {
      const key = certificationKey(candidate.record);
      if (key && certifications.has(key)) duplicateCertifications.push(finding(
        "DUPLICATE_CERTIFICATION_NUMBER",
        `Certification number ${key} is assigned to more than one owned item.`,
        { domain: candidate.targetDomain, certificationNumber: key },
      ));
      else if (key) certifications.set(key, candidate);
    }

    if (candidate.targetDomain === CANONICAL_DOMAINS.SALE) {
      const key = saleReferenceKey(candidate.record);
      if (key && saleReferences.has(key)) duplicateSaleReferences.push(finding(
        "DUPLICATE_SALE_REFERENCE",
        `Sale reference ${key} appears more than once.`,
        { domain: candidate.targetDomain, saleReference: key },
      ));
      else if (key) saleReferences.set(key, candidate);
    }

    if (candidate.targetDomain === CANONICAL_DOMAINS.EXPENSE) {
      const key = expenseSemanticKey(candidate.record);
      if (key && expenseSemanticKeys.has(key)) duplicateExpenseSemanticKeys.push(finding(
        "DUPLICATE_EXPENSE_SEMANTIC_KEY",
        "Two expenses share the same normalized date, merchant, amount, and currency and require owner review.",
        { domain: candidate.targetDomain, expenseSemanticKey: key },
      ));
      else if (key) expenseSemanticKeys.set(key, candidate);
    }

    const explicitImportReference = importReferenceKey(candidate.record);
    if (explicitImportReference && importReferences.has(explicitImportReference)) duplicateImportReferences.push(finding(
      "DUPLICATE_IMPORT_REFERENCE",
      `Explicit import reference ${explicitImportReference} appears more than once and requires owner review.`,
      { domain: candidate.targetDomain, importReference: explicitImportReference },
    ));
    else if (explicitImportReference) importReferences.set(explicitImportReference, candidate);
  }

  return {
    duplicateIds: dedupeAndSort(duplicateIds),
    duplicateProviderExternalIds: dedupeAndSort(duplicateProviderExternalIds),
    duplicateCertifications: dedupeAndSort(duplicateCertifications),
    duplicateSaleReferences: dedupeAndSort(duplicateSaleReferences),
    duplicateExpenseSemanticKeys: dedupeAndSort(duplicateExpenseSemanticKeys),
    duplicateImportReferences: dedupeAndSort(duplicateImportReferences),
  };
}

function inspectReferences(candidates, remoteSnapshot) {
  const availableIds = new Map();
  for (const candidate of candidates.filter((entry) => entry.targetDomain && !SKIPPED_SOURCE_CLASSIFICATIONS.has(entry.classification))) {
    if (!availableIds.has(candidate.targetDomain)) availableIds.set(candidate.targetDomain, new Set());
    const target = availableIds.get(candidate.targetDomain);
    if (candidate.proposedId) target.add(candidate.proposedId);
    if (candidate.legacyId) target.add(candidate.legacyId);
  }
  for (const [domain, records] of Object.entries(remoteDomains(remoteSnapshot))) {
    if (!availableIds.has(domain)) availableIds.set(domain, new Set());
    for (const record of Array.isArray(records) ? records : []) {
      const id = sourceRecordId(record);
      if (id) availableIds.get(domain).add(id);
      if (record?.legacyId) availableIds.get(domain).add(String(record.legacyId));
    }
  }

  const problems = [];
  for (const candidate of candidates.filter((entry) => entry.targetDomain)) {
    const rootPath = `${candidate.sourceId}.${candidate.sourceCollection}[${candidate.sourceIndex}]`;
    if (candidate.targetDomain === CANONICAL_DOMAINS.FILE_ASSET) {
      const relatedRecordType = candidate.record.relatedRecordType;
      const relatedRecordId = candidate.record.relatedRecordId;
      if (
        Object.values(CANONICAL_DOMAINS).includes(relatedRecordType)
        && isCanonicalUuid(relatedRecordId)
        && !availableIds.get(relatedRecordType)?.has(relatedRecordId)
      ) {
        problems.push(finding(
          "BROKEN_REFERENCE",
          `${rootPath}.relatedRecordId references missing ${relatedRecordType} ${relatedRecordId}.`,
          {
            path: `${rootPath}.relatedRecordId`,
            reference: relatedRecordId,
            expectedDomain: relatedRecordType,
            severity: "BLOCKER",
          },
        ));
      }
    }
    const stack = [{ value: candidate.record, path: rootPath }];
    while (stack.length) {
      const current = stack.pop();
      if (Array.isArray(current.value)) {
        current.value.forEach((value, index) => stack.push({ value, path: `${current.path}[${index}]` }));
        continue;
      }
      if (!current.value || typeof current.value !== "object") continue;
      for (const [key, value] of Object.entries(current.value)) {
        const contract = REFERENCE_FIELDS[key];
        if (contract && value != null && String(value).trim()) {
          const reference = String(value).trim();
          if (!availableIds.get(contract.domain)?.has(reference)) {
            problems.push(finding(
              "BROKEN_REFERENCE",
              `${current.path}.${key} references missing ${contract.domain} ${reference}.`,
              { path: `${current.path}.${key}`, reference, expectedDomain: contract.domain, severity: contract.severity },
            ));
          }
        }
        if (value && typeof value === "object") stack.push({ value, path: `${current.path}.${key}` });
      }
    }
  }
  return dedupeAndSort(problems);
}

function inspectUnmanifestedFileReferences(candidates, manifestProvided) {
  if (manifestProvided) return [];
  const findings = [];
  for (const candidate of candidates.filter((entry) => entry.targetDomain && entry.targetDomain !== CANONICAL_DOMAINS.FILE_ASSET && !SKIPPED_SOURCE_CLASSIFICATIONS.has(entry.classification))) {
    const rootPath = `${candidate.sourceId}.${candidate.sourceCollection}[${candidate.sourceIndex}]`;
    const stack = [{ value: candidate.record, path: rootPath }];
    while (stack.length) {
      const current = stack.pop();
      if (Array.isArray(current.value)) {
        current.value.forEach((value, index) => stack.push({ value, path: `${current.path}[${index}]` }));
        continue;
      }
      if (!current.value || typeof current.value !== "object") continue;
      for (const [key, value] of Object.entries(current.value)) {
        if (FILE_REFERENCE_HINT_PATTERN.test(key) && value != null && value !== "" && (!Array.isArray(value) || value.length)) {
          findings.push(finding(
            "FILE_REFERENCE_MANIFEST_MISSING",
            `${current.path}.${key} contains a file or image reference without an explicit FileAsset manifest.`,
            { domain: candidate.targetDomain, recordId: candidate.proposedId, sourceId: candidate.sourceId, path: `${current.path}.${key}`, severity: "WARNING" },
          ));
        }
        if (value && typeof value === "object") stack.push({ value, path: `${current.path}.${key}` });
      }
    }
  }
  return dedupeAndSort(findings);
}

function makeAction(candidate, action, reason, extra = {}) {
  return {
    action,
    domain: candidate.targetDomain || "ExcludedLegacySource",
    ...(candidate.proposedId ? { recordId: candidate.proposedId } : {}),
    sourceRecordId: candidate.legacyId || null,
    sourceId: candidate.sourceId,
    sourceCollection: candidate.sourceCollection,
    sourceIndex: candidate.sourceIndex,
    adapterId: candidate.adapterId,
    recordFingerprint: candidate.fingerprint,
    recordVersion: candidate.recordVersion,
    reason,
    ...extra,
  };
}

function firstDefined(record, fields) {
  for (const field of fields) {
    if (record?.[field] != null && record[field] !== "") return record[field];
  }
  return undefined;
}

function normalizedText(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function buildReferenceResolver(candidates, remoteSnapshot) {
  const identities = new Map();
  const add = (domain, sourceId, canonicalId) => {
    if (!domain || sourceId == null || !isCanonicalUuid(canonicalId)) return;
    const key = `${domain}:${String(sourceId).trim().toLowerCase()}`;
    if (!identities.has(key)) identities.set(key, new Set());
    identities.get(key).add(String(canonicalId).toLowerCase());
  };
  for (const candidate of candidates) {
    add(candidate.targetDomain, candidate.proposedId, candidate.proposedId);
    if (candidate.legacyId) add(candidate.targetDomain, candidate.legacyId, candidate.proposedId);
  }
  for (const [domain, records] of Object.entries(remoteDomains(remoteSnapshot))) {
    for (const record of Array.isArray(records) ? records : []) {
      const canonicalId = sourceRecordId(record);
      if (!isCanonicalUuid(canonicalId)) continue;
      add(domain, canonicalId, canonicalId);
      const migration = record.metadata?.migration || record.migration || {};
      add(domain, record.legacyId || migration.sourceRecordId || migration.legacyId, canonicalId);
    }
  }
  return (domain, sourceId) => {
    const values = identities.get(`${domain}:${String(sourceId || "").trim().toLowerCase()}`);
    return values?.size === 1 ? [...values][0] : null;
  };
}

function canonicalRelationsForCandidate(candidate, resolveReference, { update = false } = {}) {
  const rules = CANONICAL_RELATION_CONTRACT[candidate.targetDomain] || {};
  const rawRelations = candidate.record.relations;
  const issues = [];
  const relations = {};
  let supplied = false;
  if (rawRelations !== undefined && (!rawRelations || typeof rawRelations !== "object" || Array.isArray(rawRelations))) {
    issues.push(finding("INVALID_RELATIONS", "relations must be an object.", { path: "relations" }));
  }
  if (rawRelations && typeof rawRelations === "object" && !Array.isArray(rawRelations)) {
    for (const key of Object.keys(rawRelations)) {
      if (!rules[key]) issues.push(finding("UNKNOWN_RELATION", `Unknown relation ${key} for ${candidate.targetDomain}.`, { path: `relations.${key}` }));
    }
  }
  for (const [relationName, rule] of Object.entries(rules)) {
    const values = [];
    const direct = rawRelations && typeof rawRelations === "object" && !Array.isArray(rawRelations)
      ? rawRelations[relationName]
      : undefined;
    if (direct != null && String(direct).trim()) values.push(String(direct).trim());
    for (const alias of RELATION_FIELD_ALIASES[relationName] || [relationName]) {
      const value = candidate.record[alias];
      if (value != null && String(value).trim()) values.push(String(value).trim());
    }
    const unique = [...new Set(values)];
    if (unique.length) supplied = true;
    if (unique.length > 1) {
      issues.push(finding("AMBIGUOUS_RELATION", `${relationName} has conflicting source references.`, { path: `relations.${relationName}`, values: unique }));
      continue;
    }
    if (!unique.length) {
      if (!update && rule.required) issues.push(finding("REQUIRED_RELATION_MISSING", `${relationName} is required for ${candidate.targetDomain}.`, { path: `relations.${relationName}` }));
      continue;
    }
    const resolved = resolveReference(rule.targetDomain, unique[0]);
    if (!resolved) {
      issues.push(finding("RELATION_TARGET_UNRESOLVED", `${relationName} could not be mapped to a canonical ${rule.targetDomain} ID.`, {
        path: `relations.${relationName}`,
        sourceReference: unique[0],
        expectedDomain: rule.targetDomain,
      }));
      continue;
    }
    relations[relationName] = resolved;
  }
  return { relations, issues, supplied };
}

function canonicalInputForCandidate(candidate, moneyConversions, resolveReference, { update = false, expectedVersion } = {}) {
  const record = candidate.record;
  const provider = normalizedText(firstDefined(record, PROVIDER_FIELDS));
  const externalId = normalizedText(firstDefined(record, EXTERNAL_ID_FIELDS));
  const sourceUrl = normalizedText(record.sourceUrl || record.source_url || record.listingUrl || record.listing_url || record.url);
  const notes = normalizedText(record.notes || record.note);
  const statusProposal = normalizeLegacyStatus(candidate.targetDomain, record.status || record.currentStatus || record.current_status);
  const quantityValue = firstDefined(record, ["quantity", "qty"]);
  const quantity = quantityValue === undefined ? undefined : quantityValue;
  const certificationNumber = normalizedText(firstDefined(record, CERTIFICATION_FIELDS));
  const occurredAtValue = record.occurredAt || record.occurred_at || record.date || record.purchaseDate || record.saleDate || record.discoveredAt;
  const occurredAt = occurredAtValue === undefined ? undefined : normalizedText(occurredAtValue);
  const primaryFields = PRIMARY_MONEY_FIELDS_BY_DOMAIN[candidate.targetDomain] || [];
  const primaryMoney = primaryFields
    .map((field) => moneyConversions.find((conversion) => conversion.field === field && conversion.status !== MONEY_PREVIEW_STATUS.BLOCKED))
    .find(Boolean);
  const safeMoneyConversions = moneyConversions.map((conversion) => ({
    field: conversion.field,
    path: conversion.path,
    originalValue: conversion.originalValue,
    proposedAmountMinor: conversion.proposedAmountMinor,
    currency: conversion.currency,
    status: conversion.status,
    issueCodes: conversion.issues.map((entry) => entry.code),
  }));
  const metadata = {
    migration: {
      sourceId: candidate.sourceId,
      sourceCollection: candidate.sourceCollection,
      sourceRecordId: candidate.legacyId || null,
      sourceFingerprint: candidate.fingerprint,
      sourceSchemaVersion: candidate.sourceSchemaVersion,
      adapterId: candidate.adapterId,
    },
    sourceRecord: clone(record),
    proposedMoneyConversions: safeMoneyConversions,
  };
  const relationProposal = canonicalRelationsForCandidate(candidate, resolveReference, { update });
  const fileAssetMetadata = candidate.targetDomain === CANONICAL_DOMAINS.FILE_ASSET
    ? validateFileAssetMetadata(record).normalized
    : null;
  const fileAsset = fileAssetMetadata
    ? {
      storageProvider: fileAssetMetadata.storageProvider,
      storagePath: fileAssetMetadata.storagePath,
      mimeType: fileAssetMetadata.mimeType,
      size: fileAssetMetadata.size,
      sha256: fileAssetMetadata.sha256,
      relatedRecordType: fileAssetMetadata.relatedRecordType,
      relatedRecordId: fileAssetMetadata.relatedRecordId,
      ...(fileAssetMetadata.originalName != null ? { originalName: fileAssetMetadata.originalName } : {}),
    }
    : null;
  const input = {
    ...(!update ? { id: candidate.proposedId } : {}),
    ...(statusProposal.value ? { status: statusProposal.value } : {}),
    source: candidate.sourceId,
    ...(provider ? { externalProvider: provider } : {}),
    ...(externalId ? { externalId } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(notes ? { notes } : {}),
    metadata,
    ...(primaryMoney?.proposedAmountMinor != null ? {
      amountMinor: primaryMoney.proposedAmountMinor,
      currency: primaryMoney.currency,
    } : {}),
    ...(quantity !== undefined ? { quantity } : {}),
    ...(certificationNumber ? { certificationNumber } : {}),
    ...(occurredAt ? { occurredAt } : {}),
    ...(!update || relationProposal.supplied ? { relations: relationProposal.relations } : {}),
    ...(fileAsset ? { fileAsset } : {}),
    ...(update ? { expectedVersion } : {}),
  };
  const validation = validateCanonicalWireInput(candidate.targetDomain, input, { update });
  const issues = [...relationProposal.issues, ...validation.issues];
  if (!statusProposal.valid && statusProposal.issue) issues.push(statusProposal.issue);
  const warnings = [];
  if (statusProposal.valid && statusProposal.changed) {
    warnings.push(finding("STATUS_NORMALIZED", `Status ${record.status || record.currentStatus || record.current_status} is proposed as ${statusProposal.value}.`, {
      path: "status",
      proposedStatus: statusProposal.value,
    }));
  }
  return { input: clone(input), issues: dedupeAndSort(issues), warnings };
}

function summarizeDomains(actions, candidateIssues) {
  const names = new Set(actions.filter((action) => action.domain !== "ExcludedLegacySource").map((action) => action.domain));
  const summaries = [];
  for (const domain of [...names].sort()) {
    const domainActions = actions.filter((action) => action.domain === domain);
    const domainIssues = candidateIssues.filter((issue) => issue.domain === domain);
    const invalidRecordIds = new Set(domainIssues.filter((issue) => issue.severity === "BLOCKER").map((issue) => issue.recordId));
    summaries.push({
      domain,
      localRecords: domainActions.length,
      validRecords: domainActions.filter((action) => !invalidRecordIds.has(action.recordId) && action.action !== MIGRATION_ACTIONS.REQUIRES_DECISION).length,
      invalidRecords: domainActions.filter((action) => invalidRecordIds.has(action.recordId) || action.action === MIGRATION_ACTIONS.REQUIRES_DECISION).length,
      proposedInserts: domainActions.filter((action) => action.action === MIGRATION_ACTIONS.INSERT).length,
      potentialUpdates: domainActions.filter((action) => action.action === MIGRATION_ACTIONS.UPDATE).length,
      existingMatches: domainActions.filter((action) => action.action === MIGRATION_ACTIONS.SKIP && action.reason === "EXISTING_IDENTICAL").length,
      conflicts: domainActions.filter((action) => action.action === MIGRATION_ACTIONS.REQUIRES_DECISION).length,
      excluded: domainActions.filter((action) => action.action === MIGRATION_ACTIONS.SKIP && action.reason !== "EXISTING_IDENTICAL").length,
      warnings: domainIssues.filter((issue) => issue.severity === "WARNING").length,
      blockers: domainIssues.filter((issue) => issue.severity === "BLOCKER").length,
    });
  }
  return summaries;
}

function planHashPayload(plan) {
  const copy = clone(plan);
  delete copy.createdAt;
  delete copy.planHash;
  return copy;
}

function previewHashPayload(preview) {
  return {
    status: preview.status,
    persistenceMode: preview.persistenceMode,
    persistenceTarget: preview.persistenceTarget,
    localRecordCount: preview.localRecordCount,
    remoteRecordCount: preview.remoteRecordCount,
    remoteStatus: preview.remoteStatus,
    domains: preview.domains,
    moneyIssues: preview.moneyIssues,
    moneyConversions: preview.moneyConversions,
    referenceProblems: preview.referenceProblems,
    conflicts: preview.conflicts,
    duplicateIds: preview.duplicateIds,
    duplicateProviderExternalIds: preview.duplicateProviderExternalIds,
    duplicateCertifications: preview.duplicateCertifications,
    duplicateSaleReferences: preview.duplicateSaleReferences,
    duplicateExpenseSemanticKeys: preview.duplicateExpenseSemanticKeys,
    duplicateImportReferences: preview.duplicateImportReferences,
    warnings: preview.warnings,
    blockers: preview.blockers,
    planHash: preview.plan.planHash,
  };
}

export async function createMigrationPreview(options = {}) {
  const localSources = options.localSources || {};
  const sourceRegistry = options.sourceRegistry || MIGRATION_SOURCE_REGISTRY;
  const hashImplementation = options.hashImplementation;
  const lastPreviewAt = options.createdAt || new Date().toISOString();
  const sourceBackupHash = options.sourceBackupHash || await hashCanonicalJson(localSources, hashImplementation);
  const ownerSubjectHash = options.ownerSubject
    ? await hashCanonicalJson({ providerQualifiedOwnerSubject: String(options.ownerSubject) }, hashImplementation)
    : "UNAVAILABLE";
  const remoteSnapshot = options.remoteSnapshot || {
    status: REMOTE_BACKUP_STATES.UNAVAILABLE,
    included: false,
    domains: {},
    recordCount: 0,
  };
  const remote = remoteIndexes(remoteSnapshot);
  const extracted = extractMigrationCandidates(localSources, { sourceRegistry });
  const identified = [];
  for (const candidate of extracted.candidates) {
    identified.push(await identifyCandidate(candidate, hashImplementation));
  }
  identified.sort((left, right) => canonicalStringify({
    domain: left.targetDomain || "",
    sourceId: left.sourceId,
    collection: left.sourceCollection,
    id: left.proposedId,
    index: left.sourceIndex,
  }).localeCompare(canonicalStringify({
    domain: right.targetDomain || "",
    sourceId: right.sourceId,
    collection: right.sourceCollection,
    id: right.proposedId,
    index: right.sourceIndex,
  })));
  const resolveReference = buildReferenceResolver(identified, remoteSnapshot);

  const duplicates = duplicateFindings(identified);
  const referenceProblems = inspectReferences(identified, remoteSnapshot);
  const fileReferenceWarnings = inspectUnmanifestedFileReferences(identified, Array.isArray(localSources["file-assets"]));
  const duplicateCanonicalIds = new Set(duplicates.duplicateIds.map((entry) => String(entry.id).toLowerCase()));
  const providerConflictKeys = new Set(duplicates.duplicateProviderExternalIds.map((entry) => entry.domainProviderExternalId));
  const certificationConflicts = new Set(duplicates.duplicateCertifications.map((entry) => entry.certificationNumber));
  const saleReferenceConflicts = new Set(duplicates.duplicateSaleReferences.map((entry) => entry.saleReference));
  const expenseSemanticConflicts = new Set(duplicates.duplicateExpenseSemanticKeys.map((entry) => entry.expenseSemanticKey));
  const importReferenceConflicts = new Set(duplicates.duplicateImportReferences.map((entry) => entry.importReference));
  const actions = [];
  const candidateIssues = [];
  const moneyIssues = [];
  const moneyConversions = [];
  const conflicts = [];
  const warnings = [];
  const blockers = [];

  if (ownerSubjectHash === "UNAVAILABLE") {
    warnings.push(finding("OWNER_REFERENCE_UNAVAILABLE", "Owner identity was not included; the server must derive owner scope before any future migration."));
  }
  if (remoteStatus(remoteSnapshot) !== REMOTE_BACKUP_STATES.AVAILABLE) {
    warnings.push(finding("REMOTE_UNAVAILABLE", remoteSnapshot.reason || "Canonical remote records were not available for comparison."));
  } else if (remoteSnapshot.coverageStatus !== "COMPLETE") {
    warnings.push(finding(
      "REMOTE_COVERAGE_PARTIAL",
      remoteSnapshot.coverageExplanation || "Canonical remote export coverage is partial; missing records cannot be treated as absent.",
      { truncatedDomains: [...(remoteSnapshot.truncatedDomains || [])] },
    ));
  }
  for (const sourceWarning of options.sourceReadWarnings || []) {
    warnings.push(finding(
      "SOURCE_READ_WARNING",
      sourceWarning.message || "A registered local source could not be read completely.",
      { sourceId: sourceWarning.sourceId || "unknown" },
    ));
  }
  const fileSource = sourceRegistry.find((source) => source.sourceId === "file-assets");
  if (fileSource && !Array.isArray(localSources["file-assets"])) {
    warnings.push(finding(
      "FILE_REFERENCE_MANIFEST_UNSUPPORTED",
      "File references may be counted, but no explicit FileAsset manifest was supplied; file bytes are never embedded by migration preview.",
      { sourceId: "file-assets", coverageImpact: "PARTIAL_WHEN_REFERENCED" },
    ));
  } else if (fileSource) {
    warnings.push(finding(
      "FILE_BYTES_EXCLUDED",
      "FileAsset metadata can be previewed, but referenced file bytes are not copied or uploaded.",
      { sourceId: "file-assets", coverageImpact: "METADATA_ONLY" },
    ));
  }
  for (const sourceFinding of extracted.sourceFindings) {
    const target = sourceFinding.severity === "ERROR" ? blockers : warnings;
    target.push(finding("SOURCE_ADAPTER_FINDING", sourceFinding.message, sourceFinding));
  }
  blockers.push(
    ...duplicates.duplicateIds,
    ...duplicates.duplicateProviderExternalIds,
    ...duplicates.duplicateCertifications,
    ...duplicates.duplicateSaleReferences,
    ...duplicates.duplicateExpenseSemanticKeys,
    ...duplicates.duplicateImportReferences,
  );
  warnings.push(...fileReferenceWarnings);
  candidateIssues.push(...fileReferenceWarnings);

  for (const candidate of identified) {
    const path = `${candidate.sourceId}.${candidate.sourceCollection}[${candidate.sourceIndex}]`;
    const issueBase = { domain: candidate.targetDomain, recordId: candidate.proposedId, sourceId: candidate.sourceId, path };
    if (SKIPPED_SOURCE_CLASSIFICATIONS.has(candidate.classification)) {
      const reason = candidate.classification === MIGRATION_SOURCE_CLASSIFICATIONS.DUPLICATE_OF_CANONICAL
        ? "POTENTIAL_DUPLICATE_SOURCE"
        : candidate.classification;
      actions.push(makeAction(candidate, MIGRATION_ACTIONS.SKIP, reason));
      warnings.push(finding("SOURCE_EXCLUDED", `${path} is classified ${candidate.classification} and is preserved without canonical validation or a migration write.`, { ...issueBase, classification: candidate.classification }));
      continue;
    }
    if (candidate.classification === MIGRATION_SOURCE_CLASSIFICATIONS.REQUIRES_MAPPING) {
      const conflict = finding("REQUIRES_MAPPING", candidate.mappingReason || `${path} requires an owner-reviewed mapping.`, { ...issueBase, conflictType: "MAPPING_REQUIRED" });
      conflicts.push(conflict);
      blockers.push(conflict);
      candidateIssues.push({ ...conflict, severity: "BLOCKER" });
      actions.push(makeAction(candidate, MIGRATION_ACTIONS.REQUIRES_DECISION, "MAPPING_REQUIRED", { futureDecisionOptions: ["Keep Local", "Keep Remote", "Review Manually"] }));
      continue;
    }
    const candidateStatus = normalizeLegacyStatus(
      candidate.targetDomain,
      candidate.record.status || candidate.record.currentStatus || candidate.record.current_status,
    );
    if (isArchivedRecord(candidate.record) || candidateStatus.value === "ARCHIVED") {
      const conflict = finding(
        "ARCHIVE_ACTION_REQUIRED",
        `${path} is archived; Phase 1B does not propose archive writes and requires owner review.`,
        { ...issueBase, conflictType: "ARCHIVE_ACTION_REQUIRED" },
      );
      conflicts.push(conflict);
      blockers.push(conflict);
      candidateIssues.push({ ...conflict, severity: "BLOCKER" });
      actions.push(makeAction(candidate, MIGRATION_ACTIONS.REQUIRES_DECISION, "ARCHIVE_ACTION_REQUIRED", { futureDecisionOptions: ["Keep Local", "Review Manually"] }));
      continue;
    }
    if (!candidate.proposedId) {
      const conflict = finding(
        "STABLE_ID_ASSIGNMENT_REQUIRED",
        `${path} has no stable legacy or semantic identity; owner review must assign and persist an ID before migration.`,
        { ...issueBase, conflictType: "STABLE_ID_REQUIRED" },
      );
      conflicts.push(conflict);
      blockers.push(conflict);
      candidateIssues.push({ ...conflict, severity: "BLOCKER" });
      actions.push(makeAction(candidate, MIGRATION_ACTIONS.REQUIRES_DECISION, "STABLE_ID_ASSIGNMENT_REQUIRED", { futureDecisionOptions: ["Assign Stable ID", "Keep Local", "Review Manually"] }));
      continue;
    }
    const unsafe = inspectUnsafeKeys(candidate.record, path);
    for (const entry of unsafe) {
      const issueEntry = { ...entry, ...issueBase, severity: "BLOCKER" };
      blockers.push(issueEntry);
      candidateIssues.push(issueEntry);
    }
    if (candidate.recordVersion == null) {
      const issueEntry = finding("INVALID_RECORD_VERSION", `${path} has an invalid record version.`, { ...issueBase, severity: "BLOCKER" });
      blockers.push(issueEntry);
      candidateIssues.push(issueEntry);
    }
    if (!candidate.legacyId) {
      const issueEntry = finding(
        "SEMANTIC_ID_PROPOSED",
        `${path} has a stable ${candidate.semanticIdentity?.kind || "semantic"} identity; preview proposes ${candidate.proposedId} without writing it.`,
        { ...issueBase, severity: "WARNING", proposedId: candidate.proposedId, semanticIdentityKind: candidate.semanticIdentity?.kind },
      );
      warnings.push(issueEntry);
      candidateIssues.push(issueEntry);
    } else if (candidate.idOrigin !== "PRESERVED_UUID") {
      const issueEntry = finding(
        "CANONICAL_UUID_PROPOSED",
        `${path} keeps legacy ID ${candidate.legacyId} as provenance and proposes canonical UUID ${candidate.proposedId}.`,
        { ...issueBase, severity: "WARNING", legacyId: candidate.legacyId, proposedId: candidate.proposedId },
      );
      warnings.push(issueEntry);
      candidateIssues.push(issueEntry);
    }

    const money = inspectRecordMoney(candidate.record, { path, defaultCurrency: options.defaultCurrency || "USD" });
    moneyConversions.push(...money.conversions.map((entry) => ({
      domain: candidate.targetDomain,
      recordId: candidate.proposedId,
      sourceId: candidate.sourceId,
      path: entry.path,
      field: entry.field,
      originalValue: entry.originalValue,
      proposedAmountMinor: entry.proposedAmountMinor,
      currency: entry.currency,
      status: entry.status,
      issues: entry.issues.map((issue) => ({ code: issue.code, severity: issue.severity })),
    })));
    for (const entry of money.conversions.filter((conversion) => conversion.status !== MONEY_PREVIEW_STATUS.VALID)) {
      const issueEntry = finding(
        entry.status === MONEY_PREVIEW_STATUS.BLOCKED ? "MONEY_CONVERSION_BLOCKED" : "MONEY_CONVERSION_WARNING",
        entry.issues.map((item) => item.message).join(" "),
        { ...issueBase, severity: entry.status === MONEY_PREVIEW_STATUS.BLOCKED ? "BLOCKER" : "WARNING", money: entry },
      );
      moneyIssues.push(issueEntry);
      candidateIssues.push(issueEntry);
      if (entry.status === MONEY_PREVIEW_STATUS.BLOCKED) blockers.push(issueEntry);
      else warnings.push(issueEntry);
    }

    if (candidate.targetDomain === CANONICAL_DOMAINS.FILE_ASSET) {
      const fileValidation = validateFileAssetMetadata(candidate.record);
      for (const message of fileValidation.errors) {
        const issueEntry = finding("INVALID_FILE_ASSET", message, { ...issueBase, severity: "BLOCKER" });
        blockers.push(issueEntry);
        candidateIssues.push(issueEntry);
      }
      for (const message of fileValidation.warnings) {
        const issueEntry = finding("FILE_ASSET_WARNING", message, { ...issueBase, severity: "WARNING" });
        warnings.push(issueEntry);
        candidateIssues.push(issueEntry);
      }
    }

    const idKey = candidate.proposedId?.toLowerCase();
    const candidateProviderKey = isArchivedRecord(candidate.record)
      ? ""
      : domainProviderExternalKey(candidate.targetDomain, candidate.record);
    const candidateCert = isArchivedRecord(candidate.record) ? "" : certificationKey(candidate.record);
    const candidateSaleRef = saleReferenceKey(candidate.record);
    const candidateExpenseKey = candidate.targetDomain === CANONICAL_DOMAINS.EXPENSE
      ? expenseSemanticKey(candidate.record)
      : "";
    const candidateImportReference = importReferenceKey(candidate.record);
    const hasLocalConflict = (idKey && duplicateCanonicalIds.has(idKey))
      || (candidateProviderKey && providerConflictKeys.has(candidateProviderKey))
      || (candidateCert && certificationConflicts.has(candidateCert))
      || (candidateSaleRef && saleReferenceConflicts.has(candidateSaleRef))
      || (candidateExpenseKey && expenseSemanticConflicts.has(candidateExpenseKey))
      || (candidateImportReference && importReferenceConflicts.has(candidateImportReference));

    if (hasLocalConflict || unsafe.length || candidate.recordVersion == null || money.blockers.length) {
      const conflict = finding("LOCAL_RECORD_CONFLICT", `${path} has blocking validation or duplicate findings.`, { ...issueBase, conflictType: "LOCAL_VALIDATION" });
      conflicts.push(conflict);
      actions.push(makeAction(candidate, MIGRATION_ACTIONS.REQUIRES_DECISION, "LOCAL_VALIDATION_BLOCKED", { futureDecisionOptions: ["Keep Local", "Keep Remote", "Review Manually"] }));
      continue;
    }

    const ownerWideRemoteCollision = idKey ? remote.byId.get(idKey) : null;
    if (ownerWideRemoteCollision && ownerWideRemoteCollision.domain !== candidate.targetDomain) {
      const conflict = finding(
        "OWNER_WIDE_ID_COLLISION",
        `${path} proposes an ID already used by ${ownerWideRemoteCollision.domain} for this owner.`,
        { ...issueBase, conflictType: "OWNER_WIDE_ID_COLLISION", existingDomain: ownerWideRemoteCollision.domain },
      );
      conflicts.push(conflict);
      blockers.push(conflict);
      candidateIssues.push({ ...conflict, severity: "BLOCKER" });
      actions.push(makeAction(candidate, MIGRATION_ACTIONS.REQUIRES_DECISION, "OWNER_WIDE_ID_COLLISION", { futureDecisionOptions: ["Assign New Stable ID", "Keep Remote", "Review Manually"] }));
      continue;
    }

    const match = findRemoteMatch(candidate, remote);
    if (!match) {
      const remoteCoverage = remoteDomainAbsenceIsAuthoritative(remoteSnapshot, candidate.targetDomain);
      if (!remoteCoverage.authoritative) {
        const warning = finding("REMOTE_DOMAIN_NOT_AUTHORITATIVE", remoteCoverage.reason, { ...issueBase, severity: "WARNING" });
        warnings.push(warning);
        candidateIssues.push(warning);
        const conflict = finding(
          "REMOTE_COMPARISON_REQUIRED",
          `${path} cannot be proposed as an INSERT until ${candidate.targetDomain} has complete remote comparison coverage.`,
          { ...issueBase, conflictType: "REMOTE_COVERAGE_INCOMPLETE" },
        );
        conflicts.push(conflict);
        blockers.push(conflict);
        candidateIssues.push({ ...conflict, severity: "BLOCKER" });
        actions.push(makeAction(candidate, MIGRATION_ACTIONS.REQUIRES_DECISION, "REMOTE_COVERAGE_INCOMPLETE", { futureDecisionOptions: ["Refresh Remote Export", "Keep Local", "Review Manually"] }));
        continue;
      }
      const proposal = canonicalInputForCandidate(candidate, money.conversions, resolveReference);
      for (const warning of proposal.warnings) {
        const issueEntry = { ...warning, ...issueBase, severity: "WARNING" };
        warnings.push(issueEntry);
        candidateIssues.push(issueEntry);
      }
      if (proposal.issues.length) {
        for (const inputIssue of proposal.issues) {
          const issueEntry = finding("CANONICAL_INPUT_INVALID", inputIssue.message, {
            ...issueBase,
            severity: "BLOCKER",
            inputPath: inputIssue.path,
            inputCode: inputIssue.code,
          });
          blockers.push(issueEntry);
          candidateIssues.push(issueEntry);
        }
        const conflict = finding("CANONICAL_INPUT_REQUIRES_DECISION", `${path} cannot produce a backend-valid canonical INSERT without owner review.`, {
          ...issueBase,
          conflictType: "CANONICAL_INPUT_INVALID",
        });
        conflicts.push(conflict);
        actions.push(makeAction(candidate, MIGRATION_ACTIONS.REQUIRES_DECISION, "CANONICAL_INPUT_INVALID", { futureDecisionOptions: ["Keep Local", "Review Manually"] }));
        continue;
      }
      actions.push(makeAction(candidate, MIGRATION_ACTIONS.INSERT, "LOCAL_ONLY_RECORD", {
        input: proposal.input,
      }));
      continue;
    }

    const remoteId = sourceRecordId(match.record);
    if (match.matchedBy === "PROVIDER_EXTERNAL_ID" && remoteId && remoteId.toLowerCase() !== candidate.proposedId.toLowerCase()) {
      const conflict = finding(
        "PROVIDER_EXTERNAL_ID_CONFLICT",
        `${path} matches an existing provider/external ID under a different canonical record ID.`,
        { ...issueBase, conflictType: "PROVIDER_EXTERNAL_ID", remoteRecordId: remoteId },
      );
      conflicts.push(conflict);
      blockers.push(conflict);
      candidateIssues.push({ ...conflict, severity: "BLOCKER" });
      actions.push(makeAction(candidate, MIGRATION_ACTIONS.REQUIRES_DECISION, "PROVIDER_EXTERNAL_ID_CONFLICT", { futureDecisionOptions: ["Keep Local", "Keep Remote", "Review Manually"] }));
      continue;
    }

    const remoteMigration = match.record.metadata?.migration || match.record.migration || {};
    const remoteSourceId = match.record.migrationSourceId || remoteMigration.sourceId;
    const remoteCollection = match.record.migrationSourceCollection || remoteMigration.sourceCollection;
    if (match.matchedBy === "STABLE_ID" && remoteSourceId && (remoteSourceId !== candidate.sourceId || remoteCollection !== candidate.sourceCollection)) {
      const conflict = finding(
        "STABLE_ID_CONTENT_COLLISION",
        `${path} shares a canonical ID with a record from a different migration source.`,
        { ...issueBase, conflictType: "STABLE_ID_COLLISION", remoteRecordId: remoteId || candidate.proposedId },
      );
      conflicts.push(conflict);
      blockers.push(conflict);
      candidateIssues.push({ ...conflict, severity: "BLOCKER" });
      actions.push(makeAction(candidate, MIGRATION_ACTIONS.REQUIRES_DECISION, "STABLE_ID_COLLISION", { futureDecisionOptions: ["Keep Local", "Keep Remote", "Review Manually"] }));
      continue;
    }

    const existingFingerprint = await remoteFingerprint(match.record, hashImplementation);
    if (existingFingerprint && existingFingerprint === candidate.fingerprint) {
      actions.push(makeAction(candidate, MIGRATION_ACTIONS.SKIP, "EXISTING_IDENTICAL", { remoteRecordId: remoteId || candidate.proposedId }));
      continue;
    }

    if (match.matchedBy === "STABLE_ID" && !hasProvenMigrationLineage(candidate, match.record)) {
      const conflict = finding(
        "STABLE_ID_CONTENT_COLLISION",
        `${path} shares a stable canonical ID with different content but has no matching migration lineage.`,
        { ...issueBase, conflictType: "STABLE_ID_CONTENT_COLLISION", remoteRecordId: remoteId || candidate.proposedId },
      );
      conflicts.push(conflict);
      blockers.push(conflict);
      candidateIssues.push({ ...conflict, severity: "BLOCKER" });
      actions.push(makeAction(candidate, MIGRATION_ACTIONS.REQUIRES_DECISION, "STABLE_ID_CONTENT_COLLISION", { futureDecisionOptions: ["Keep Local", "Keep Remote", "Review Manually"] }));
      continue;
    }

    const currentRemoteVersion = recordVersion(match.record);
    if (currentRemoteVersion == null || currentRemoteVersion !== candidate.recordVersion) {
      const conflictType = currentRemoteVersion != null && currentRemoteVersion > candidate.recordVersion
        ? "REMOTE_NEWER"
        : "VERSION_MISMATCH";
      const conflict = finding(
        conflictType,
        `${path} conflicts with remote version ${currentRemoteVersion ?? "invalid"}; local version is ${candidate.recordVersion}.`,
        { ...issueBase, conflictType, remoteRecordId: remoteId || candidate.proposedId, localVersion: candidate.recordVersion, remoteVersion: currentRemoteVersion },
      );
      conflicts.push(conflict);
      blockers.push(conflict);
      candidateIssues.push({ ...conflict, severity: "BLOCKER" });
      actions.push(makeAction(candidate, MIGRATION_ACTIONS.REQUIRES_DECISION, conflictType, { futureDecisionOptions: ["Keep Local", "Keep Remote", "Review Manually"] }));
      continue;
    }

    const updateProposal = canonicalInputForCandidate(candidate, money.conversions, resolveReference, { update: true, expectedVersion: currentRemoteVersion });
    for (const warning of updateProposal.warnings) {
      const issueEntry = { ...warning, ...issueBase, severity: "WARNING" };
      warnings.push(issueEntry);
      candidateIssues.push(issueEntry);
    }
    if (updateProposal.issues.length) {
      for (const inputIssue of updateProposal.issues) {
        const issueEntry = finding("CANONICAL_INPUT_INVALID", inputIssue.message, {
          ...issueBase,
          severity: "BLOCKER",
          inputPath: inputIssue.path,
          inputCode: inputIssue.code,
        });
        blockers.push(issueEntry);
        candidateIssues.push(issueEntry);
      }
      const conflict = finding("CANONICAL_INPUT_REQUIRES_DECISION", `${path} cannot produce a backend-valid canonical UPDATE without owner review.`, {
        ...issueBase,
        conflictType: "CANONICAL_INPUT_INVALID",
      });
      conflicts.push(conflict);
      actions.push(makeAction(candidate, MIGRATION_ACTIONS.REQUIRES_DECISION, "CANONICAL_INPUT_INVALID", { futureDecisionOptions: ["Keep Local", "Keep Remote", "Review Manually"] }));
      continue;
    }
    actions.push(makeAction(candidate, MIGRATION_ACTIONS.UPDATE, "EXISTING_CHANGED_VERSION_MATCH", {
      recordId: remoteId || candidate.proposedId,
      expectedVersion: currentRemoteVersion,
      remoteRecordId: remoteId || candidate.proposedId,
      input: updateProposal.input,
    }));
  }

  for (const problem of referenceProblems) {
    const target = problem.severity === "BLOCKER" ? blockers : warnings;
    target.push(problem);
    candidateIssues.push({ ...problem, domain: null, recordId: null });
  }

  const sortedActions = [...actions].sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right)));
  const sortedWarnings = dedupeAndSort(warnings);
  const sortedBlockers = dedupeAndSort(blockers);
  const sortedConflicts = dedupeAndSort(conflicts);
  const sortedMoneyIssues = dedupeAndSort(moneyIssues);
  const sortedMoneyConversions = dedupeAndSort(moneyConversions);
  const domains = summarizeDomains(sortedActions, candidateIssues);
  const localRecordCount = identified.length;
  const remoteRecordCount = Number.isInteger(remoteSnapshot.recordCount)
    ? remoteSnapshot.recordCount
    : remote.records.length;
  let status = MIGRATION_PREVIEW_STATUSES.READY;
  if (localRecordCount === 0) status = sortedWarnings.length ? MIGRATION_PREVIEW_STATUSES.READY_WITH_WARNINGS : MIGRATION_PREVIEW_STATUSES.NO_DATA;
  else if (sortedBlockers.length || sortedActions.some((action) => action.action === MIGRATION_ACTIONS.REQUIRES_DECISION)) status = MIGRATION_PREVIEW_STATUSES.BLOCKED;
  else if (sortedWarnings.length) status = MIGRATION_PREVIEW_STATUSES.READY_WITH_WARNINGS;

  if (sortedActions.length > MAX_DRY_RUN_ACTIONS) {
    const limitBlocker = finding(
      "DRY_RUN_ACTION_LIMIT_EXCEEDED",
      `Migration plan contains ${sortedActions.length} actions; the bounded dry-run limit is ${MAX_DRY_RUN_ACTIONS}.`,
    );
    sortedBlockers.push(limitBlocker);
    status = MIGRATION_PREVIEW_STATUSES.BLOCKED;
  }

  const plan = {
    format: MIGRATION_PLAN_FORMAT,
    formatVersion: MIGRATION_PLAN_VERSION,
    createdAt: lastPreviewAt,
    ownerSubjectHash,
    sourceCommit: String(options.sourceCommit || "unknown"),
    sourceBackupHash,
    persistenceTarget: CANONICAL_PERSISTENCE_TARGET,
    domains: domains.map((domain) => ({
      domain: domain.domain,
      localRecords: domain.localRecords,
      proposedInserts: domain.proposedInserts,
      potentialUpdates: domain.potentialUpdates,
      existingMatches: domain.existingMatches,
      conflicts: domain.conflicts,
      excluded: domain.excluded,
    })),
    actions: sortedActions,
    moneyConversions: sortedMoneyConversions,
    warnings: sortedWarnings,
    blockers: sortedBlockers,
    planHash: "",
  };
  if (plan.actions.some((action) => !Object.values(MIGRATION_ACTIONS).includes(action.action))) {
    throw new Error("Migration plan contains an unsupported action.");
  }
  plan.planHash = await hashCanonicalJson(planHashPayload(plan), hashImplementation);

  const preview = {
    status,
    persistenceMode: PERSISTENCE_MODES.MIGRATION_PREVIEW,
    persistenceTarget: CANONICAL_PERSISTENCE_TARGET,
    localRecordCount,
    remoteRecordCount,
    remoteStatus: remoteStatus(remoteSnapshot),
    domains,
    domainsReady: domains.filter((domain) => domain.blockers === 0 && domain.conflicts === 0).length,
    domainsWithWarnings: domains.filter((domain) => domain.warnings > 0 || domain.blockers > 0 || domain.conflicts > 0).length,
    moneyIssues: sortedMoneyIssues,
    moneyConversions: sortedMoneyConversions,
    referenceProblems,
    conflicts: sortedConflicts,
    duplicateIds: duplicates.duplicateIds,
    duplicateProviderExternalIds: duplicates.duplicateProviderExternalIds,
    duplicateCertifications: duplicates.duplicateCertifications,
    duplicateSaleReferences: duplicates.duplicateSaleReferences,
    duplicateExpenseSemanticKeys: duplicates.duplicateExpenseSemanticKeys,
    duplicateImportReferences: duplicates.duplicateImportReferences,
    warnings: sortedWarnings,
    blockers: sortedBlockers,
    lastPreviewAt,
    previewHash: "",
    writesPerformed: 0,
    plan,
  };
  preview.previewHash = await hashCanonicalJson(previewHashPayload(preview), hashImplementation);
  return preview;
}

export async function runLocalMigrationPreview(options = {}) {
  const beforeLocal = typeof options.localStorage?.snapshot === "function" ? options.localStorage.snapshot() : null;
  const beforeSession = typeof options.sessionStorage?.snapshot === "function" ? options.sessionStorage.snapshot() : null;
  const current = readCurrentBackupSources({
    localStorage: options.localStorage,
    sessionStorage: options.sessionStorage,
  });
  const remoteAdapter = options.remoteAdapter || createUnavailableRemoteBackupAdapter();
  const remoteSnapshot = options.remoteSnapshot || await remoteAdapter.inspect({ signal: options.signal });
  const preview = await createMigrationPreview({
    ...options,
    localSources: current.sources,
    remoteSnapshot,
    sourceReadWarnings: current.warnings,
  });
  if (beforeLocal != null && options.localStorage.snapshot() !== beforeLocal) {
    throw new Error("Migration Preview changed localStorage; zero-write verification failed.");
  }
  if (beforeSession != null && options.sessionStorage.snapshot() !== beforeSession) {
    throw new Error("Migration Preview changed sessionStorage; zero-write verification failed.");
  }
  return preview;
}

export function assertMigrationPlanIsReadOnly(plan) {
  if (!plan || plan.format !== MIGRATION_PLAN_FORMAT || plan.formatVersion !== MIGRATION_PLAN_VERSION) {
    throw new Error("Migration plan format is not supported.");
  }
  const forbidden = (plan.actions || []).filter((action) => action.action === "DELETE" || !Object.values(MIGRATION_ACTIONS).includes(action.action));
  if (forbidden.length) throw new Error("Migration plans may never contain DELETE or unsupported actions.");
  return true;
}

export function toCanonicalDryRunRequest(plan) {
  assertMigrationPlanIsReadOnly(plan);
  if (typeof plan.sourceBackupHash !== "string" || !/^[a-f0-9]{64}$/i.test(plan.sourceBackupHash)) {
    throw new Error("Migration plan sourceBackupHash must be a SHA-256 hexadecimal digest.");
  }
  if (!Array.isArray(plan.actions)) {
    throw new Error("Migration dry-run requests require an actions array.");
  }
  const supportedDomains = new Set(Object.values(CANONICAL_DOMAINS));
  const canonicalActions = plan.actions.filter((action) => {
    if (supportedDomains.has(action.domain)) return true;
    if (action.domain === "ExcludedLegacySource" && action.action === MIGRATION_ACTIONS.SKIP) return false;
    throw new Error(`Migration action uses unsupported canonical domain ${action.domain}.`);
  });
  if (canonicalActions.length > MAX_DRY_RUN_ACTIONS) {
    throw new Error(`Migration dry-run requests support at most ${MAX_DRY_RUN_ACTIONS} actions.`);
  }
  return {
    formatVersion: MIGRATION_PLAN_VERSION,
    sourceBackupHash: plan.sourceBackupHash,
    actions: canonicalActions.map((action) => {
      const requestAction = { action: action.action, domain: action.domain };
      if (action.recordId) requestAction.recordId = action.recordId;
      if ([MIGRATION_ACTIONS.INSERT, MIGRATION_ACTIONS.UPDATE].includes(action.action)) {
        if (!action.input || typeof action.input !== "object" || Array.isArray(action.input)) {
          throw new Error(`${action.action} action ${action.recordId || "unknown"} has no canonical input.`);
        }
        requestAction.input = clone(action.input);
        const validation = validateCanonicalWireInput(action.domain, requestAction.input, { update: action.action === MIGRATION_ACTIONS.UPDATE });
        if (!validation.valid) {
          throw new Error(`${action.action} action ${action.recordId || "unknown"} has invalid canonical input: ${validation.issues.map((entry) => `${entry.path}:${entry.code}`).join(", ")}.`);
        }
      }
      if (action.action === MIGRATION_ACTIONS.UPDATE && !Number.isInteger(requestAction.input.expectedVersion)) {
        throw new Error(`UPDATE action ${action.recordId || "unknown"} has no expectedVersion in input.`);
      }
      return requestAction;
    }),
  };
}
