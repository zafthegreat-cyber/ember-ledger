import { canonicalStringify, parseUntrustedBackupJson } from "./canonicalJson.js";
import { ACCOUNT_OPS_RETAILER_PRESET_IDS } from "../accountOps/retailerDirectory.js";
import { BACKUP_SOURCE_REGISTRY, getBackupSource } from "./backupSourceRegistry.js";
import {
  BACKUP_COVERAGE,
  CODE3_BACKUP_FORMAT,
  CODE3_BACKUP_FORMAT_VERSION,
  countSourceRecords,
  verifyBackupEnvelope,
} from "./backupFormat.js";
import { findProhibitedData } from "./backupSecurity.js";
import { validateBackupSourceData } from "./backupValidation.js";

export const RESTORE_PREVIEW_RESULTS = Object.freeze({
  READY_FOR_FUTURE_RESTORE: "READY_FOR_FUTURE_RESTORE",
  READY_WITH_WARNINGS: "READY_WITH_WARNINGS",
  BLOCKED: "BLOCKED",
  UNSUPPORTED: "UNSUPPORTED",
  CORRUPTED: "CORRUPTED",
});

const MONEY_FIELDS = new Set([
  "amount", "askingPrice", "asking_price", "purchasePrice", "purchase_price", "purchaseShipping", "purchase_shipping",
  "purchaseTax", "purchase_tax", "buyerPremium", "buyer_premium", "fixedBuyerFees", "fixed_buyer_fees", "travelCost",
  "travel_cost", "tolls", "laborCost", "labor_cost", "disposalCost", "disposal_cost", "cleaningCost", "cleaning_cost",
  "repairCost", "repair_cost", "preparationCost", "preparation_cost", "otherAcquisitionCosts", "other_acquisition_costs",
  "expectedResaleLow", "expected_resale_low", "expectedResale", "expected_resale", "expectedResaleMid", "expected_resale_mid",
  "expectedResaleHigh", "expected_resale_high", "projectedResaleValue", "projected_resale_value", "grossSalePrice", "gross_sale_price",
  "grossPrice", "gross_price", "shippingCharged", "shipping_charged", "shippingChargedToBuyer", "shipping_charged_to_buyer",
  "discounts", "sellingFees", "selling_fees", "paymentFees", "payment_fees", "fixedSellingFees", "fixed_selling_fees",
  "outboundShipping", "outbound_shipping", "actualShipping", "actual_shipping", "packaging", "insurance", "refunds",
  "returnCosts", "return_costs", "otherCosts", "other_costs", "totalCost", "total_cost", "allocatedCost", "allocated_cost",
  "allocatedItemCost", "allocated_item_cost", "costOfGoodsSold", "cost_of_goods_sold", "netProceeds", "net_proceeds",
  "expectedProfit", "expected_profit", "realizedProfit", "realized_profit", "profit", "revenue", "budget", "deposit", "tax",
  "subtotal", "receiptTotal", "receipt_total", "unitPrice", "unit_price", "unitCost", "unit_cost", "lineTotal", "line_total",
  "marketValue", "market_value", "msrp", "minimumOffer", "minimum_offer", "maximumBid", "maximum_bid", "currentBid", "current_bid",
]);

const NEGATIVE_PROHIBITED_MONEY_FIELDS = new Set([...MONEY_FIELDS].filter((field) => ![
  "expectedProfit", "expected_profit", "realizedProfit", "realized_profit", "profit",
].includes(field)));

const CURRENCY_FIELDS = ["currency", "currencyCode", "currency_code"];
const CERTIFICATION_FIELDS = ["certificationNumber", "certification_number", "certNumber", "cert_number"];
const ID_FIELDS = ["id", "recordId", "record_id", "postId", "post_id", "reportId", "report_id", "eventId", "event_id"];

function emptyCounts() {
  return { newRecords: 0, matchingRecords: 0, potentialUpdates: 0 };
}

function emptyPreview(result, overrides = {}) {
  return {
    result,
    formatRecognized: false,
    formatVersion: null,
    manifestIntegrity: "NOT_CHECKED",
    sectionIntegrity: "NOT_CHECKED",
    schemaCompatibility: "NOT_CHECKED",
    includedSources: [],
    excludedSources: [],
    recordCounts: {},
    ...emptyCounts(),
    duplicateIds: [],
    idCollisions: [],
    duplicateProviderListings: [],
    duplicateCertifications: [],
    duplicateAliases: [],
    brokenReferences: [],
    unknownSources: [],
    unsupportedSchemas: [],
    invalidMoney: [],
    unsupportedPrecision: [],
    missingFields: [],
    missingCurrency: [],
    currencyMismatches: [],
    prohibitedFields: [],
    warnings: [],
    errors: [],
    activity: null,
    writesPerformed: 0,
    ...overrides,
  };
}

function getPath(value, path) {
  if (path === "$") return value;
  return String(path).split(".").reduce((current, key) => current?.[key], value);
}

export function enumerateSectionRecords(section, source) {
  const records = [];
  for (const path of source?.recordPaths || []) {
    const value = getPath(section.data, path);
    if (Array.isArray(value)) {
      value.forEach((record, index) => {
        if (record && typeof record === "object" && !Array.isArray(record)) {
          records.push({ sourceId: section.sourceId, collection: path === "$" ? "$" : path, index, record });
        }
      });
    } else if (path === "$" && value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length) {
      records.push({ sourceId: section.sourceId, collection: "$", index: 0, record: value });
    }
  }
  return records;
}

function recordId(record) {
  for (const field of ID_FIELDS) {
    if (record?.[field] != null && String(record[field]).trim()) return String(record[field]);
  }
  return "";
}

function currentSectionData(currentSources, sourceId) {
  if (currentSources instanceof Map) return currentSources.get(sourceId);
  return currentSources?.[sourceId];
}

function compareWithCurrent(sections, sourceRegistry, currentSources = {}) {
  const counts = emptyCounts();
  for (const section of sections) {
    const source = getBackupSource(section.sourceId, sourceRegistry);
    if (!source) continue;
    const incoming = enumerateSectionRecords(section, source);
    const currentData = currentSectionData(currentSources, section.sourceId);
    const current = enumerateSectionRecords({ sourceId: section.sourceId, data: currentData || source.emptyValue }, source);
    const currentByCollectionAndId = new Map();
    for (const row of current) {
      const id = recordId(row.record);
      if (id) currentByCollectionAndId.set(`${row.collection}:${id}`, row.record);
    }
    for (const row of incoming) {
      const id = recordId(row.record);
      const matched = id ? currentByCollectionAndId.get(`${row.collection}:${id}`) : null;
      if (!matched) counts.newRecords += 1;
      else if (canonicalStringify(matched) === canonicalStringify(row.record)) counts.matchingRecords += 1;
      else counts.potentialUpdates += 1;
    }
  }
  return counts;
}

function inspectDuplicates(records) {
  const duplicateIds = [];
  const idCollisions = [];
  const duplicateProviderListings = [];
  const duplicateCertifications = [];
  const duplicateAliases = [];
  const scopedIds = new Map();
  const globalIds = new Map();
  const providerListings = new Map();
  const certifications = new Map();
  const aliases = new Map();

  for (const row of records) {
    const id = recordId(row.record);
    if (id) {
      const scopedKey = `${row.sourceId}:${row.collection}:${id}`;
      if (scopedIds.has(scopedKey)) duplicateIds.push({ sourceId: row.sourceId, collection: row.collection, id });
      else scopedIds.set(scopedKey, row);
      const firstGlobalMatch = globalIds.get(id);
      if (firstGlobalMatch && (
        firstGlobalMatch.sourceId !== row.sourceId
        || firstGlobalMatch.collection !== row.collection
      )) {
        idCollisions.push({
          id,
          first: firstGlobalMatch.collection,
          firstSourceId: firstGlobalMatch.sourceId,
          second: row.collection,
          secondSourceId: row.sourceId,
        });
      } else if (!firstGlobalMatch) globalIds.set(id, row);
    }

    const provider = row.record.providerId || row.record.provider || row.record.marketplace || row.record.source;
    const externalId = row.record.externalListingId || row.record.external_listing_id || row.record.externalId || row.record.external_id;
    if (provider && externalId) {
      const key = `${String(provider).toLowerCase()}:${String(externalId)}`;
      if (providerListings.has(key)) duplicateProviderListings.push({ provider: String(provider), externalListingId: String(externalId) });
      else providerListings.set(key, row);
    }

    for (const field of CERTIFICATION_FIELDS) {
      const certification = row.record[field];
      if (!certification || !String(certification).trim()) continue;
      const key = String(certification).trim().toLowerCase();
      if (certifications.has(key)) duplicateCertifications.push({ certificationNumber: String(certification) });
      else certifications.set(key, row);
      break;
    }

    if (row.sourceId === "account-ops" && row.collection === "emailAliases") {
      const aliasAddress = String(row.record.aliasAddress || "").trim().toLowerCase();
      if (aliasAddress) {
        if (aliases.has(aliasAddress)) {
          duplicateAliases.push({
            aliasAddress,
            firstId: recordId(aliases.get(aliasAddress).record),
            secondId: id,
          });
        } else aliases.set(aliasAddress, row);
      }
    }
  }
  return { duplicateIds, idCollisions, duplicateProviderListings, duplicateCertifications, duplicateAliases };
}

const REFERENCE_TARGETS = Object.freeze({
  purchaseId: ["purchases"], purchase_id: ["purchases"], relatedPurchaseId: ["purchases"], related_purchase_id: ["purchases"],
  purchaseLotId: ["lots"], purchase_lot_id: ["lots"], lotId: ["lots"], lot_id: ["lots"],
  inventoryItemId: ["inventory", "items"], inventory_item_id: ["inventory", "items"], ownedItemId: ["inventory", "items"], owned_item_id: ["inventory", "items"],
  saleId: ["sales"], sale_id: ["sales"], relatedSaleId: ["sales"], related_sale_id: ["sales"], originalSaleId: ["sales"], original_sale_id: ["sales"],
  receiptId: ["receiptRecords"], receipt_id: ["receiptRecords"],
  costAllocationId: ["costAllocations", "allocations"], cost_allocation_id: ["costAllocations", "allocations"], allocationId: ["costAllocations", "allocations"], allocation_id: ["costAllocations", "allocations"],
  returnId: ["returns"], return_id: ["returns"], relatedReturnId: ["returns"], related_return_id: ["returns"],
  storeId: ["restockStoreProfiles", "stores"], store_id: ["restockStoreProfiles", "stores"],
  storageLocationId: ["storageLocations"], storage_location_id: ["storageLocations"],
});

const ACCOUNT_OPS_REFERENCE_TARGETS = Object.freeze({
  profileGroupId: ["profileGroups"],
  profileId: ["profiles"],
  aliasId: ["emailAliases"],
  emailDomainId: ["emailDomains"],
  domainId: ["emailDomains"],
  retailerId: ["retailers"],
  accountId: ["storeAccounts"],
  storeAccountId: ["storeAccounts"],
});

const BOT_OPS_REFERENCE_TARGETS = Object.freeze({
  installationId: ["installations"],
  installationIds: ["installations"],
  retailerAccountLinkId: ["retailerAccountLinks"],
  botProfileId: ["botProfiles"],
  proxyGroupId: ["proxyGroups"],
  productTargetId: ["productTargets"],
  taskGroupId: ["taskGroups"],
  taskGroupIds: ["taskGroups"],
  taskId: ["tasks"],
  attemptId: ["attempts"],
  checkoutEvidenceId: ["checkoutEvidence"],
  accountOpsStoreAccountId: ["storeAccounts"],
  accountOpsProfileId: ["profiles"],
  orderCandidateId: ["orderCandidates"],
});

function isStaticAccountOpsReference(row, key, value) {
  return row.sourceId === "account-ops"
    && key === "retailerId"
    && ACCOUNT_OPS_RETAILER_PRESET_IDS.has(String(value));
}

function inspectReferences(records) {
  const idsByCollection = new Map();
  for (const row of records) {
    const id = recordId(row.record);
    if (!id) continue;
    if (!idsByCollection.has(row.collection)) idsByCollection.set(row.collection, new Set());
    idsByCollection.get(row.collection).add(id);
  }
  const brokenReferences = [];
  const stack = records.map((row) => ({ value: row.record, row, path: `${row.sourceId}.${row.collection}[${row.index}]` }));
  while (stack.length) {
    const current = stack.pop();
    if (Array.isArray(current.value)) {
      current.value.forEach((entry, index) => stack.push({ ...current, value: entry, path: `${current.path}[${index}]` }));
      continue;
    }
    if (!current.value || typeof current.value !== "object") continue;
    for (const [key, value] of Object.entries(current.value)) {
      const sourceTargets = current.row.sourceId === "account-ops"
        ? ACCOUNT_OPS_REFERENCE_TARGETS
        : current.row.sourceId === "bot-operations"
          ? BOT_OPS_REFERENCE_TARGETS
          : null;
      const targets = sourceTargets?.[key] || REFERENCE_TARGETS[key];
      if (targets && value != null) {
        const references = Array.isArray(value) ? value : [value];
        for (let index = 0; index < references.length; index += 1) {
          const reference = references[index];
          if (reference == null || !String(reference).trim()) continue;
          if (isStaticAccountOpsReference(current.row, key, reference)) continue;
          const targetCollectionsPresent = targets.filter((target) => idsByCollection.has(target));
          const sourceCollectionIsDeclared = Boolean(sourceTargets)
            && Object.prototype.hasOwnProperty.call(sourceTargets, key);
          const found = targets.some((target) => idsByCollection.get(target)?.has(String(reference)));
          if (!found) {
            brokenReferences.push({
              path: Array.isArray(value) ? `${current.path}.${key}[${index}]` : `${current.path}.${key}`,
              reference: String(reference),
              expectedCollections: targets,
              severity: targetCollectionsPresent.length || sourceCollectionIsDeclared ? "ERROR" : "WARNING",
            });
          }
        }
      }
      if (value && typeof value === "object") stack.push({ ...current, value, path: `${current.path}.${key}` });
    }
  }
  return brokenReferences;
}

function decimalPlaces(value) {
  const text = String(value).trim().toLowerCase();
  if (text.includes("e")) {
    const number = Number(text);
    if (!Number.isFinite(number)) return Infinity;
    const normalized = number.toFixed(12).replace(/0+$/, "");
    return normalized.includes(".") ? normalized.split(".")[1].length : 0;
  }
  return text.includes(".") ? text.split(".")[1].length : 0;
}

function inspectMoney(records) {
  const invalidMoney = [];
  const unsupportedPrecision = [];
  const missingCurrency = [];
  const currencies = new Set();

  for (const row of records) {
    const stack = [{ value: row.record, path: `${row.sourceId}.${row.collection}[${row.index}]` }];
    while (stack.length) {
      const current = stack.pop();
      if (Array.isArray(current.value)) {
        current.value.forEach((entry, index) => stack.push({ value: entry, path: `${current.path}[${index}]` }));
        continue;
      }
      if (!current.value || typeof current.value !== "object") continue;
      let hasMoney = false;
      let currency = "";
      for (const currencyField of CURRENCY_FIELDS) {
        if (current.value[currencyField]) currency = String(current.value[currencyField]).trim().toUpperCase();
      }
      if (currency) currencies.add(currency);

      for (const [key, value] of Object.entries(current.value)) {
        if (MONEY_FIELDS.has(key) && value !== "" && value != null) {
          hasMoney = true;
          const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
          if (!Number.isFinite(numeric)) invalidMoney.push({ path: `${current.path}.${key}`, reason: "Money value is not finite numeric data." });
          else {
            if (NEGATIVE_PROHIBITED_MONEY_FIELDS.has(key) && numeric < 0) {
              invalidMoney.push({ path: `${current.path}.${key}`, reason: "Negative value is not allowed for this money field." });
            }
            const precision = decimalPlaces(value);
            if (precision > 2) unsupportedPrecision.push({ path: `${current.path}.${key}`, precision });
          }
        }
        if (value && typeof value === "object") stack.push({ value, path: `${current.path}.${key}` });
      }
      if (hasMoney && !currency) missingCurrency.push({ path: current.path });
    }
  }

  const currencyMismatches = currencies.size > 1 ? [{ currencies: [...currencies].sort() }] : [];
  return { invalidMoney, unsupportedPrecision, missingCurrency, currencyMismatches };
}

function dedupeByJson(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = canonicalStringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseFailureResult(error) {
  if (error?.code === "MALFORMED_JSON" || error?.code === "INVALID_TOP_LEVEL") return RESTORE_PREVIEW_RESULTS.CORRUPTED;
  return RESTORE_PREVIEW_RESULTS.BLOCKED;
}

export async function previewBackupRestore(raw, options = {}) {
  const sourceRegistry = options.sourceRegistry || BACKUP_SOURCE_REGISTRY;
  const startedAt = options.startedAt || new Date().toISOString();
  let backup;
  try {
    backup = parseUntrustedBackupJson(raw, options.limits);
  } catch (error) {
    return emptyPreview(parseFailureResult(error), {
      errors: [error.message],
      activity: { type: "RESTORE_PREVIEW_COMPLETED", startedAt, result: parseFailureResult(error), warningCount: 0, errorCount: 1 },
    });
  }

  const formatRecognized = backup.format === CODE3_BACKUP_FORMAT;
  if (!formatRecognized || backup.formatVersion !== CODE3_BACKUP_FORMAT_VERSION) {
    return emptyPreview(RESTORE_PREVIEW_RESULTS.UNSUPPORTED, {
      formatRecognized,
      formatVersion: backup.formatVersion ?? null,
      errors: [formatRecognized ? "Backup format version is unsupported." : "Backup format is unsupported."],
      activity: { type: "RESTORE_PREVIEW_COMPLETED", startedAt, result: RESTORE_PREVIEW_RESULTS.UNSUPPORTED, warningCount: 0, errorCount: 1 },
    });
  }

  const earlyProhibitedFields = findProhibitedData(backup).map((match) => match.path);
  const integrity = await verifyBackupEnvelope(backup, options);
  if (!integrity.valid) {
    return emptyPreview(RESTORE_PREVIEW_RESULTS.CORRUPTED, {
      formatRecognized: true,
      formatVersion: backup.formatVersion,
      manifestIntegrity: integrity.errors.some((error) => /manifest/i.test(error)) ? "FAILED" : "UNKNOWN",
      sectionIntegrity: integrity.errors.some((error) => /section/i.test(error)) ? "FAILED" : "UNKNOWN",
      prohibitedFields: earlyProhibitedFields,
      errors: [...integrity.errors, ...(earlyProhibitedFields.length ? ["Backup contains prohibited security or session fields."] : [])],
      activity: { type: "RESTORE_PREVIEW_COMPLETED", startedAt, result: RESTORE_PREVIEW_RESULTS.CORRUPTED, warningCount: 0, errorCount: integrity.errors.length + (earlyProhibitedFields.length ? 1 : 0) },
    });
  }

  const preview = emptyPreview(RESTORE_PREVIEW_RESULTS.READY_FOR_FUTURE_RESTORE, {
    formatRecognized: true,
    formatVersion: backup.formatVersion,
    manifestIntegrity: "VALID",
    sectionIntegrity: "VALID",
    schemaCompatibility: "COMPATIBLE",
    includedSources: backup.manifest.includedSources || [],
    excludedSources: backup.manifest.excludedSources || [],
  });
  const records = [];

  for (const section of backup.sections) {
    const source = getBackupSource(section.sourceId, sourceRegistry);
    if (!source) {
      preview.unknownSources.push(section.sourceId || "unknown");
      preview.warnings.push(`Unknown source ${section.sourceId || "unknown"} will not be restorable without a future adapter.`);
      continue;
    }
    if (!source.supportedSchemaVersions?.includes(section.schemaVersion)) {
      preview.unsupportedSchemas.push({ sourceId: section.sourceId, schemaVersion: section.schemaVersion });
      continue;
    }
    const sourceValidation = validateBackupSourceData(source, section.data);
    if (!sourceValidation.valid) {
      preview.errors.push(...sourceValidation.errors.map((error) => `${section.sourceId}: ${error}`));
      continue;
    }
    const actualCount = countSourceRecords(section.data, source);
    preview.recordCounts[section.sourceId] = actualCount;
    if (actualCount !== section.recordCount) preview.errors.push(`Record count does not match for ${section.sourceId}.`);
    records.push(...enumerateSectionRecords(section, source));
  }

  if (preview.unsupportedSchemas.length) {
    preview.schemaCompatibility = "UNSUPPORTED";
    preview.errors.push("One or more registered sources use an unsupported schema version.");
  }

  preview.prohibitedFields = earlyProhibitedFields;
  if (preview.prohibitedFields.length) preview.errors.push("Backup contains prohibited security or session fields.");

  Object.assign(preview, inspectDuplicates(records));
  preview.missingFields = records
    .filter((row) => !recordId(row.record))
    .map((row) => ({ path: `${row.sourceId}.${row.collection}[${row.index}]`, field: "stable ID" }));
  preview.brokenReferences = inspectReferences(records);
  Object.assign(preview, inspectMoney(records));
  Object.assign(preview, compareWithCurrent(backup.sections, sourceRegistry, options.currentSources));

  preview.duplicateIds = dedupeByJson(preview.duplicateIds);
  preview.idCollisions = dedupeByJson(preview.idCollisions);
  preview.duplicateProviderListings = dedupeByJson(preview.duplicateProviderListings);
  preview.duplicateCertifications = dedupeByJson(preview.duplicateCertifications);
  preview.duplicateAliases = dedupeByJson(preview.duplicateAliases);
  preview.brokenReferences = dedupeByJson(preview.brokenReferences);
  preview.missingCurrency = dedupeByJson(preview.missingCurrency);

  if (preview.duplicateIds.length) preview.errors.push("Duplicate stable IDs were found within a source collection.");
  if (preview.duplicateProviderListings.length) preview.errors.push("Duplicate provider and external listing ID pairs were found.");
  if (preview.duplicateCertifications.length) preview.errors.push("Duplicate certification numbers were found.");
  if (preview.duplicateAliases.length) preview.errors.push("Duplicate Account Ops email aliases were found.");
  if (preview.invalidMoney.length) preview.errors.push("Invalid money values were found.");
  if (preview.brokenReferences.some((issue) => issue.severity === "ERROR")) preview.errors.push("Broken record references were found.");
  if (preview.idCollisions.length) preview.warnings.push("Stable IDs collide across different record collections.");
  if (preview.missingFields.length) preview.warnings.push("Some records do not have a stable ID and require review before a future restore.");
  if (preview.brokenReferences.some((issue) => issue.severity === "WARNING")) preview.warnings.push("Some references target sources that are not present in this backup.");
  if (preview.unsupportedPrecision.length) preview.warnings.push("Some money values need future conversion to integer minor units; no values were rounded.");
  if (preview.missingCurrency.length) preview.warnings.push("Some records with money values do not declare a currency.");
  if (preview.currencyMismatches.length) preview.warnings.push("Multiple currencies are present and require explicit migration handling.");
  if (backup.coverageStatus !== BACKUP_COVERAGE.COMPLETE) preview.warnings.push(`Backup coverage is ${backup.coverageStatus || "unknown"}.`);
  if (preview.unknownSources.length) preview.schemaCompatibility = "UNKNOWN_SOURCES";

  if (preview.unsupportedSchemas.length) preview.result = RESTORE_PREVIEW_RESULTS.UNSUPPORTED;
  else if (preview.errors.length) preview.result = RESTORE_PREVIEW_RESULTS.BLOCKED;
  else if (preview.warnings.length) preview.result = RESTORE_PREVIEW_RESULTS.READY_WITH_WARNINGS;

  preview.activity = {
    type: "RESTORE_PREVIEW_COMPLETED",
    startedAt,
    result: preview.result,
    warningCount: preview.warnings.length,
    errorCount: preview.errors.length,
  };
  return preview;
}
