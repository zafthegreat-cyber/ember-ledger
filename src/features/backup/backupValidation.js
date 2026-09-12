import { normalizeAccountOpsState } from "../accountOps/repository.js";
import { normalizeBotOpsState } from "../botOps/repository.js";
import { normalizeInboxOrderState } from "../inboxOrder/repository.js";
import { normalizePurchaseReceivingState } from "../purchaseReceiving/repository.js";
import { normalizeFlipScoutState } from "../flipScout/storageRepository.js";
import { validateManagedInventorySales } from "../flipScout/exactInventoryCost.js";
import {
  validateInventoryCreationStateBundles,
} from "../purchaseReceiving/inventoryCreation/contracts.js";
import { validateInventoryReconciliationState } from "../purchaseReceiving/inventoryReconciliation/contracts.js";
import { validateReplacementInventoryPurchaseProvenance } from "../purchaseReceiving/service.js";

function isJsonContainer(value) {
  return Boolean(value) && typeof value === "object";
}

function valueAtPath(value, path) {
  if (path === "$") return value;
  return String(path).split(".").reduce((current, key) => current?.[key], value);
}

function validateAccountOpsV1(source, data) {
  try {
    normalizeAccountOpsState(data, { now: () => "1970-01-01T00:00:00.000Z" });
    return [];
  } catch (error) {
    const code = error?.code ? ` (${error.code})` : "";
    return [`Account Ops persisted state is invalid${code}: ${error?.message || "validation failed"}`];
  }
}

function validateInboxOrderV1(source, data) {
  try {
    normalizeInboxOrderState(data, { now: () => "1970-01-01T00:00:00.000Z" });
    return [];
  } catch (error) {
    const code = error?.code ? ` (${error.code})` : "";
    return [`Inbox/order persisted state is invalid${code}: ${error?.message || "validation failed"}`];
  }
}

function validateBotOperationsV1(source, data) {
  try {
    normalizeBotOpsState(data, { now: () => "1970-01-01T00:00:00.000Z" });
    return [];
  } catch (error) {
    const code = error?.code ? ` (${error.code})` : "";
    return [`Bot Operations persisted state is invalid${code}: ${error?.message || "validation failed"}`];
  }
}

function validatePurchaseReceivingV1(source, data) {
  try {
    normalizePurchaseReceivingState(data, { now: () => "1970-01-01T00:00:00.000Z" });
    return [];
  } catch (error) {
    const code = error?.code ? ` (${error.code})` : "";
    return [`Purchase/Receiving persisted state is invalid${code}: ${error?.message || "validation failed"}`];
  }
}

function validateDealFinderState(source, data) {
  try {
    const normalized = normalizeFlipScoutState(data, "1970-01-01T00:00:00.000Z");
    validateInventoryCreationStateBundles(normalized);
    validateManagedInventorySales(normalized);
    validateInventoryReconciliationState(normalized);
    return [];
  } catch (error) {
    const code = error?.code ? ` (${error.code})` : "";
    return [`Business Inventory persisted state is invalid${code}: ${error?.message || "validation failed"}`];
  }
}

export function resolveSourceSchemaVersion(source, data) {
  if (Object.prototype.hasOwnProperty.call(data || {}, "schemaVersion")) {
    const version = data.schemaVersion;
    if (!Number.isInteger(version)) throw new Error(`${source.displayName} has an invalid schemaVersion.`);
    return version;
  }
  return source.schemaVersion;
}

export function validateBackupSourceData(source, data, { requireSupportedSchema = true } = {}) {
  const errors = [];
  if (!source?.validationAdapter) errors.push("No validation adapter is registered.");
  if (!isJsonContainer(data)) errors.push("Source data must be a JSON object or array.");

  const expectsArray = source?.validationAdapter === "record-array";
  if (expectsArray && !Array.isArray(data)) errors.push("Source data must be an array.");
  if (!expectsArray && isJsonContainer(data) && Array.isArray(data) && source?.validationAdapter !== "generic-local-json") {
    errors.push("Source data must be an object.");
  }

  let schemaVersion = source?.schemaVersion;
  if (isJsonContainer(data) && !Array.isArray(data)) {
    try {
      schemaVersion = resolveSourceSchemaVersion(source, data);
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (requireSupportedSchema && Number.isInteger(schemaVersion) && !source?.supportedSchemaVersions?.includes(schemaVersion)) {
    errors.push(`Schema version ${schemaVersion} is not supported.`);
  }

  for (const path of source?.recordPaths || []) {
    if (path === "$") continue;
    const records = valueAtPath(data, path);
    if (records != null && !Array.isArray(records)) errors.push(`Record path ${path} must be an array when present.`);
  }

  if (source?.validationAdapter === "account-ops-v1") {
    errors.push(...validateAccountOpsV1(source, data));
  }
  if (source?.validationAdapter === "inbox-order-v1") {
    errors.push(...validateInboxOrderV1(source, data));
  }
  if (source?.validationAdapter === "bot-operations-v1") {
    errors.push(...validateBotOperationsV1(source, data));
  }
  if (source?.validationAdapter === "purchase-receiving-v1") {
    errors.push(...validatePurchaseReceivingV1(source, data));
  }
  if (["deal-finder-v3", "deal-finder-v4", "deal-finder-v5"].includes(source?.validationAdapter)) {
    errors.push(...validateDealFinderState(source, data));
  }

  return { valid: errors.length === 0, errors, schemaVersion };
}

export function validateBackupCrossSourceRelationships(sections = []) {
  const errors = [];
  if (!Array.isArray(sections)) {
    return { valid: false, errors: ["Backup sections must be an array for cross-source validation."] };
  }
  for (const sourceId of ["deal-finder", "purchase-receiving"]) {
    if (sections.filter((section) => section?.sourceId === sourceId).length > 1) {
      errors.push(`Backup contains duplicate ${sourceId} sections.`);
    }
  }
  if (errors.length) return { valid: false, errors };
  const sourceSections = new Map(
    sections
      .filter((section) => section?.sourceId)
      .map((section) => [section.sourceId, section]),
  );
  const inventorySection = sourceSections.get("deal-finder");
  if (!inventorySection) return { valid: true, errors };

  try {
    validateReplacementInventoryPurchaseProvenance(
      inventorySection.data,
      sourceSections.get("purchase-receiving")?.data || {},
    );
  } catch (error) {
    const code = error?.code ? ` (${error.code})` : "";
    errors.push(`Business Inventory replacement provenance does not match Purchase/Receiving history${code}.`);
  }

  const reconciliationEvents = Array.isArray(inventorySection.data?.inventoryReconciliationEvents)
    ? inventorySection.data.inventoryReconciliationEvents
    : [];
  if (reconciliationEvents.length) {
    const purchaseState = sourceSections.get("purchase-receiving")?.data;
    try {
      if (!purchaseState || typeof purchaseState !== "object" || Array.isArray(purchaseState)
        || !Array.isArray(purchaseState.purchases) || !Array.isArray(purchaseState.receivingEvents)
        || !Array.isArray(inventorySection.data?.inventoryCreationApplications)) {
        throw Object.assign(new Error("Purchase/Receiving history is required for Inventory reconciliation provenance."), { code: "RECONCILIATION_PURCHASE_PROVENANCE_REQUIRED" });
      }
      const purchases = new Map(purchaseState.purchases.map((purchase) => [String(purchase?.id || ""), purchase]));
      const receivingEvents = new Map(purchaseState.receivingEvents.map((event) => [String(event?.id || ""), event]));
      const applications = new Map(inventorySection.data.inventoryCreationApplications.map((application) => [String(application?.id || ""), application]));
      for (const event of reconciliationEvents) {
        const purchaseId = String(event?.purchaseId || "");
        const application = applications.get(String(event?.applicationId || ""));
        const purchase = purchases.get(purchaseId);
        const eventReceivingIds = Array.isArray(event?.receivingEventReferences) ? event.receivingEventReferences.map(String) : [];
        const applicationReceivingIds = Array.isArray(application?.receivingEventReferences)
          ? application.receivingEventReferences.map(String)
          : [];
        if (!application || !purchase || String(application.purchaseId || "") !== purchaseId) {
          throw Object.assign(new Error("Inventory reconciliation Purchase provenance does not match its acquisition application."), { code: "RECONCILIATION_PURCHASE_PROVENANCE_INVALID" });
        }
        const purchaseLineId = String(application.purchaseLineItemId || "");
        if (!purchaseLineId || !(purchase.lineItems || []).some((line) => String(line?.lineItemId || "") === purchaseLineId)) {
          throw Object.assign(new Error("Inventory reconciliation Purchase-line provenance is invalid."), { code: "RECONCILIATION_PURCHASE_LINE_INVALID" });
        }
        if (JSON.stringify([...eventReceivingIds].sort()) !== JSON.stringify([...applicationReceivingIds].sort())) {
          throw Object.assign(new Error("Inventory reconciliation Receiving provenance does not match its acquisition application."), { code: "RECONCILIATION_RECEIVING_PROVENANCE_INVALID" });
        }
        for (const receivingEventId of eventReceivingIds) {
          const receivingEvent = receivingEvents.get(receivingEventId);
          if (!receivingEvent
            || String(receivingEvent.purchaseId || "") !== purchaseId
            || !(receivingEvent.entries || []).some((entry) => String(entry?.lineItemId || "") === purchaseLineId)) {
            throw Object.assign(new Error("Inventory reconciliation Receiving provenance is invalid."), { code: "RECONCILIATION_RECEIVING_PROVENANCE_INVALID" });
          }
        }
      }
    } catch (error) {
      const code = error?.code ? ` (${error.code})` : "";
      errors.push(`Inventory reconciliation provenance does not match Purchase/Receiving history${code}.`);
    }
  }

  return { valid: errors.length === 0, errors };
}
