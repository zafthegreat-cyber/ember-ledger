import { normalizeAccountOpsState } from "../accountOps/repository.js";
import { normalizeInboxOrderState } from "../inboxOrder/repository.js";

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

  return { valid: errors.length === 0, errors, schemaVersion };
}
