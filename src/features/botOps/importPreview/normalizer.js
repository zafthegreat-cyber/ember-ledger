import { INTELLIGENCE_CONFIDENCE } from "../../intelligence/constants.js";
import {
  createMoney,
  normalizeCurrency,
  parseMajorMoney,
} from "../../intelligence/money.js";
import {
  STELLAR_PREVIEW_EXPORTED_STATUSES,
  STELLAR_PREVIEW_FIELD_ALIASES,
  STELLAR_PREVIEW_FIELD_STATES,
  STELLAR_PREVIEW_LIMITS,
} from "./constants.js";

const ALL_TASK_FIELDS = new Set(Object.values(STELLAR_PREVIEW_FIELD_ALIASES).flat());
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SAFE_STATUS_SET = new Set(STELLAR_PREVIEW_EXPORTED_STATUSES);
const RETAILER_MAP = Object.freeze({
  target: "retailer-preset:target",
  walmart: "retailer-preset:walmart",
});

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function comparable(value) {
  if (value == null || ["string", "number", "boolean"].includes(typeof value)) return `${typeof value}:${String(value)}`;
  return "complex-value";
}

function readAlias(record, aliases, warnings) {
  const present = aliases.filter((key) => Object.hasOwn(record, key));
  if (!present.length) return { found: false, conflicting: false, value: undefined, fields: [] };
  const values = new Set(present.map((key) => comparable(record[key])));
  const conflicting = values.size > 1;
  if (conflicting) warnings.add("CONFLICTING_FIELD_ALIASES");
  return { found: true, conflicting, value: conflicting ? undefined : record[present[0]], fields: present };
}

function normalizeBoundedText(value, limits, maximum = limits.maximumFieldLength) {
  if (typeof value !== "string") return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.INVALID };
  const text = value.trim();
  if (!text || text.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.INVALID };
  }
  return { value: text, state: STELLAR_PREVIEW_FIELD_STATES.RECOGNIZED };
}

function normalizeIdentifier(value, limits, options = {}) {
  const text = normalizeBoundedText(value, limits, limits.maximumIdentifierLength);
  if (!text.value || !IDENTIFIER_PATTERN.test(text.value)) {
    return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.INVALID };
  }
  if (options.digits && !new RegExp(`^\\d{${options.minimum || 1},${options.maximum || limits.maximumIdentifierLength}}$`).test(text.value)) {
    return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.INVALID };
  }
  return text;
}

function normalizeRetailer(value, limits) {
  const text = normalizeBoundedText(value, limits, 80);
  if (!text.value) return { sourceLabel: null, canonicalId: null, state: text.state, providerCapabilityVerified: false };
  const canonicalId = RETAILER_MAP[text.value.toLowerCase()] || null;
  return {
    sourceLabel: text.value,
    canonicalId,
    state: canonicalId ? STELLAR_PREVIEW_FIELD_STATES.RECOGNIZED : STELLAR_PREVIEW_FIELD_STATES.AMBIGUOUS,
    providerCapabilityVerified: false,
  };
}

function normalizeCurrencyValue(value) {
  if (value == null || value === "") return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.MISSING };
  try {
    return { value: normalizeCurrency(value, "preview.currency"), state: STELLAR_PREVIEW_FIELD_STATES.RECOGNIZED };
  } catch {
    return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.INVALID };
  }
}

function normalizeMoney(record, warnings, recognizedFields, limits) {
  const major = readAlias(record, STELLAR_PREVIEW_FIELD_ALIASES.maxPriceMajor, warnings);
  const minor = readAlias(record, STELLAR_PREVIEW_FIELD_ALIASES.maxPriceMinor, warnings);
  const currencyInput = readAlias(record, STELLAR_PREVIEW_FIELD_ALIASES.currency, warnings);
  if (major.found) recognizedFields.add("maxPrice");
  if (minor.found) recognizedFields.add("maxPriceMinor");
  if (currencyInput.found) recognizedFields.add("currency");
  if (!major.found && !minor.found) {
    return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.MISSING, sourceRepresentation: null };
  }
  if (major.conflicting || minor.conflicting || currencyInput.conflicting) {
    warnings.add("CONFLICTING_FIELD_ALIASES");
    return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.INVALID, sourceRepresentation: "CONFLICT" };
  }
  if (major.found && minor.found) {
    warnings.add("CONFLICTING_PRICE_FIELDS");
    return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.INVALID, sourceRepresentation: "CONFLICT" };
  }
  const currency = normalizeCurrencyValue(currencyInput.value);
  if (!currency.value) {
    warnings.add(currency.state === STELLAR_PREVIEW_FIELD_STATES.MISSING ? "PRICE_CURRENCY_MISSING" : "PRICE_CURRENCY_INVALID");
    return { value: null, state: currency.state, sourceRepresentation: minor.found ? "MINOR_UNITS" : "MAJOR_UNITS" };
  }

  try {
    let money;
    let sourceRepresentation;
    if (minor.found) {
      if (!Number.isSafeInteger(minor.value) || minor.value <= 0 || minor.value > limits.maximumMoneyMinorUnits) {
        throw new Error("INVALID_MINOR_UNITS");
      }
      money = createMoney(minor.value, currency.value, { field: "preview.maxPrice" });
      sourceRepresentation = "MINOR_UNITS";
    } else if (typeof major.value === "string") {
      money = parseMajorMoney(major.value, { field: "preview.maxPrice", currency: currency.value });
      sourceRepresentation = "DECIMAL_STRING_MAJOR_UNITS";
    } else if (Number.isSafeInteger(major.value)) {
      const minorUnits = major.value * 100;
      if (major.value <= 0 || !Number.isSafeInteger(minorUnits) || minorUnits > limits.maximumMoneyMinorUnits) {
        throw new Error("INVALID_MAJOR_UNITS");
      }
      money = createMoney(minorUnits, currency.value, { field: "preview.maxPrice" });
      sourceRepresentation = "INTEGER_MAJOR_UNITS";
    } else {
      throw new Error("INVALID_MONEY");
    }
    if (money.minorUnits <= 0 || money.minorUnits > limits.maximumMoneyMinorUnits) throw new Error("MONEY_OUT_OF_RANGE");
    return { value: money, state: STELLAR_PREVIEW_FIELD_STATES.RECOGNIZED, sourceRepresentation };
  } catch {
    warnings.add("MAX_PRICE_INVALID");
    return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.INVALID, sourceRepresentation: minor.found ? "MINOR_UNITS" : "MAJOR_UNITS" };
  }
}

function normalizeQuantity(value, found, warnings, limits) {
  if (!found) return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.MISSING };
  if (!Number.isSafeInteger(value) || value < 1 || value > limits.maximumQuantity) {
    warnings.add("QUANTITY_INVALID");
    return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.INVALID };
  }
  return { value, state: STELLAR_PREVIEW_FIELD_STATES.RECOGNIZED };
}

function normalizeExportedStatus(value, found, warnings, limits) {
  if (!found) return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.MISSING, live: false };
  const text = normalizeBoundedText(value, limits, 64);
  if (!text.value) {
    warnings.add("EXPORTED_STATUS_INVALID");
    return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.INVALID, live: false };
  }
  const status = text.value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!SAFE_STATUS_SET.has(status)) {
    warnings.add("EXPORTED_STATUS_UNSUPPORTED");
    return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.UNSUPPORTED, live: false };
  }
  return { value: status, state: STELLAR_PREVIEW_FIELD_STATES.RECOGNIZED, live: false };
}

function normalizeBoolean(value, found, warnings) {
  if (!found) return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.MISSING };
  if (typeof value !== "boolean") {
    warnings.add("ENABLED_STATE_INVALID");
    return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.INVALID };
  }
  return { value, state: STELLAR_PREVIEW_FIELD_STATES.RECOGNIZED };
}

function normalizeTimestamp(value, found, warnings) {
  if (!found) return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.MISSING };
  const match = typeof value === "string"
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(value)
    : null;
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const hour = Number(match?.[4]);
  const minute = Number(match?.[5]);
  const second = Number(match?.[6]);
  const maximumDay = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (!match || year < 1 || month < 1 || month > 12 || day < 1 || day > maximumDay || hour > 23 || minute > 59 || second > 59) {
    warnings.add("TIMESTAMP_INVALID");
    return { value: null, state: STELLAR_PREVIEW_FIELD_STATES.INVALID };
  }
  return { value: new Date(value).toISOString(), state: STELLAR_PREVIEW_FIELD_STATES.RECOGNIZED };
}

function confidenceFor(task) {
  const hasProduct = Boolean(task.product.productIdentifier.value || task.product.sku.value || task.product.upc.value || task.product.gtin.value || task.product.tcin.value);
  const exactRetailer = Boolean(task.retailer.canonicalId);
  if (exactRetailer && hasProduct && task.quantity.state === STELLAR_PREVIEW_FIELD_STATES.RECOGNIZED) return INTELLIGENCE_CONFIDENCE.HIGH;
  if ((exactRetailer && hasProduct) || (hasProduct && task.taskReference.value)) return INTELLIGENCE_CONFIDENCE.MEDIUM;
  if (exactRetailer || hasProduct || task.taskReference.value) return INTELLIGENCE_CONFIDENCE.LOW;
  return INTELLIGENCE_CONFIDENCE.INSUFFICIENT;
}

function duplicateKey(task) {
  if (task.taskReference.value) return `reference:${task.taskReference.value}`;
  const product = task.product.productIdentifier.value || task.product.sku.value || task.product.upc.value || task.product.gtin.value || task.product.tcin.value;
  if (!product) return null;
  return [task.retailer.canonicalId || task.retailer.sourceLabel || "unknown", product, task.group.reference || task.group.label || "ungrouped"].join("|");
}

function normalizeGroup(group, limits) {
  if (!isPlainObject(group)) return {
    reference: null,
    label: null,
    retailer: null,
    referenceConflicting: false,
    labelConflicting: false,
    retailerConflicting: false,
    warnings: [],
  };
  const warnings = new Set();
  const reference = readAlias(group, ["id", ...STELLAR_PREVIEW_FIELD_ALIASES.groupReference], warnings);
  const label = readAlias(group, ["name", ...STELLAR_PREVIEW_FIELD_ALIASES.groupLabel], warnings);
  const retailer = readAlias(group, STELLAR_PREVIEW_FIELD_ALIASES.retailer, warnings);
  return {
    reference: reference.found ? normalizeIdentifier(reference.value, limits).value : null,
    label: label.found ? normalizeBoundedText(label.value, limits).value : null,
    retailer: retailer.found ? normalizeBoundedText(retailer.value, limits, 80).value : null,
    referenceConflicting: reference.conflicting,
    labelConflicting: label.conflicting,
    retailerConflicting: retailer.conflicting,
    warnings: [...warnings],
  };
}

function normalizeRecord(entry, index, globalFields, globalIgnored, limits) {
  const record = entry.record;
  if (!isPlainObject(record)) return null;
  const warnings = new Set();
  const recognizedFields = new Set();
  const take = (canonical) => {
    const result = readAlias(record, STELLAR_PREVIEW_FIELD_ALIASES[canonical], warnings);
    if (result.found) recognizedFields.add(canonical);
    return result;
  };
  const taskReferenceInput = take("taskReference");
  const taskLabelInput = take("taskLabel");
  const retailerInput = take("retailer");
  const productIdentifierInput = take("productIdentifier");
  const skuInput = take("sku");
  const upcInput = take("upc");
  const gtinInput = take("gtin");
  const tcinInput = take("tcin");
  const productTitleInput = take("productTitle");
  const quantityInput = take("quantity");
  const modeInput = take("mode");
  const enabledInput = take("enabled");
  const statusInput = take("status");
  const createdAtInput = take("createdAt");
  const updatedAtInput = take("updatedAt");
  const groupReferenceInput = take("groupReference");
  const groupLabelInput = take("groupLabel");
  const group = normalizeGroup(entry.group, limits);
  for (const warning of group.warnings) warnings.add(warning);

  const ignoredFields = Object.keys(record)
    .filter((key) => !ALL_TASK_FIELDS.has(key))
    .slice(0, limits.maximumUnknownFields);
  for (const field of ignoredFields) globalIgnored.add(field);
  for (const field of recognizedFields) globalFields.add(field);
  const money = normalizeMoney(record, warnings, globalFields, limits);
  if (!recognizedFields.size && money.state === STELLAR_PREVIEW_FIELD_STATES.MISSING) return null;

  const recordRetailer = retailerInput.found ? normalizeBoundedText(retailerInput.value, limits, 80).value : null;
  const retailerConflict = group.retailerConflicting || Boolean(recordRetailer && group.retailer && recordRetailer.toLowerCase() !== group.retailer.toLowerCase());
  if (retailerConflict) warnings.add("CONFLICTING_TASK_GROUP_RETAILER");
  const retailer = retailerConflict
    ? { sourceLabel: null, canonicalId: null, state: STELLAR_PREVIEW_FIELD_STATES.INVALID, providerCapabilityVerified: false }
    : normalizeRetailer(retailerInput.found ? retailerInput.value : group.retailer, limits);
  if (retailer.state === STELLAR_PREVIEW_FIELD_STATES.AMBIGUOUS) warnings.add("RETAILER_UNRECOGNIZED");
  const quantity = normalizeQuantity(quantityInput.value, quantityInput.found, warnings, limits);
  const recordGroupReference = groupReferenceInput.found ? normalizeIdentifier(groupReferenceInput.value, limits).value : null;
  const recordGroupLabel = groupLabelInput.found ? normalizeBoundedText(groupLabelInput.value, limits).value : null;
  const groupReferenceConflict = group.referenceConflicting || Boolean(recordGroupReference && group.reference && recordGroupReference !== group.reference);
  const groupLabelConflict = group.labelConflicting || Boolean(recordGroupLabel && group.label && recordGroupLabel !== group.label);
  if (groupReferenceConflict || groupLabelConflict) warnings.add("CONFLICTING_TASK_GROUP_IDENTITY");
  const task = {
    previewIndex: index,
    authoritative: false,
    imported: false,
    taskReference: taskReferenceInput.found
      ? normalizeIdentifier(taskReferenceInput.value, limits)
      : { value: null, state: STELLAR_PREVIEW_FIELD_STATES.MISSING },
    taskLabel: taskLabelInput.found
      ? normalizeBoundedText(taskLabelInput.value, limits)
      : { value: null, state: STELLAR_PREVIEW_FIELD_STATES.MISSING },
    group: {
      reference: groupReferenceConflict ? null : (recordGroupReference || group.reference),
      label: groupLabelConflict ? null : (recordGroupLabel || group.label),
    },
    retailer,
    product: {
      productIdentifier: productIdentifierInput.found ? normalizeIdentifier(productIdentifierInput.value, limits) : { value: null, state: STELLAR_PREVIEW_FIELD_STATES.MISSING },
      sku: skuInput.found ? normalizeIdentifier(skuInput.value, limits) : { value: null, state: STELLAR_PREVIEW_FIELD_STATES.MISSING },
      upc: upcInput.found ? normalizeIdentifier(upcInput.value, limits, { digits: true, minimum: 8, maximum: 14 }) : { value: null, state: STELLAR_PREVIEW_FIELD_STATES.MISSING },
      gtin: gtinInput.found ? normalizeIdentifier(gtinInput.value, limits, { digits: true, minimum: 8, maximum: 14 }) : { value: null, state: STELLAR_PREVIEW_FIELD_STATES.MISSING },
      tcin: tcinInput.found ? normalizeIdentifier(tcinInput.value, limits, { digits: true, minimum: 6, maximum: 12 }) : { value: null, state: STELLAR_PREVIEW_FIELD_STATES.MISSING },
      title: productTitleInput.found ? normalizeBoundedText(productTitleInput.value, limits) : { value: null, state: STELLAR_PREVIEW_FIELD_STATES.MISSING },
      canonicalProductCreated: false,
    },
    quantity,
    maxPrice: money,
    mode: modeInput.found ? normalizeBoundedText(modeInput.value, limits, 64) : { value: null, state: STELLAR_PREVIEW_FIELD_STATES.MISSING },
    enabled: normalizeBoolean(enabledInput.value, enabledInput.found, warnings),
    exportedStatus: normalizeExportedStatus(statusInput.value, statusInput.found, warnings, limits),
    createdAt: normalizeTimestamp(createdAtInput.value, createdAtInput.found, warnings),
    updatedAt: normalizeTimestamp(updatedAtInput.value, updatedAtInput.found, warnings),
    ignoredFields,
    warnings: [...warnings],
    duplicate: false,
    duplicateOfPreviewIndex: null,
  };
  const hasRecognizedIdentity = [
    task.taskReference,
    task.taskLabel,
    task.product.productIdentifier,
    task.product.sku,
    task.product.upc,
    task.product.gtin,
    task.product.tcin,
    task.product.title,
  ].some((field) => field.state === STELLAR_PREVIEW_FIELD_STATES.RECOGNIZED && field.value);
  if (!hasRecognizedIdentity) return null;
  task.mappingConfidence = confidenceFor(task);
  return task;
}

export function normalizeStellarTaskExportRecords(formatResult, limitOverrides = {}) {
  const limits = { ...STELLAR_PREVIEW_LIMITS, ...limitOverrides };
  const recognizedFields = new Set();
  const ignoredFields = new Set(formatResult.ignoredRootFields || []);
  const tasks = [];
  let rejectedRecordCount = 0;
  for (let index = 0; index < formatResult.records.length; index += 1) {
    const task = normalizeRecord(formatResult.records[index], index, recognizedFields, ignoredFields, limits);
    if (task) tasks.push(task);
    else rejectedRecordCount += 1;
  }

  const seen = new Map();
  for (const task of tasks) {
    const key = duplicateKey(task);
    if (!key) continue;
    if (seen.has(key)) {
      const original = seen.get(key);
      task.duplicate = true;
      task.duplicateOfPreviewIndex = original.previewIndex;
      if (!task.warnings.includes("DUPLICATE_PREVIEW_TASK")) task.warnings.push("DUPLICATE_PREVIEW_TASK");
      if (!original.warnings.includes("DUPLICATE_PREVIEW_TASK")) original.warnings.push("DUPLICATE_PREVIEW_TASK");
    } else {
      seen.set(key, task);
    }
  }

  const currencies = [...new Set(tasks.map((task) => task.maxPrice.value?.currency).filter(Boolean))];
  const retailers = [...new Set(tasks.map((task) => task.retailer.sourceLabel).filter(Boolean))];
  const warnings = new Set();
  if (currencies.length > 1) warnings.add("MULTIPLE_CURRENCIES_IN_EXPORT");
  if (ignoredFields.size) warnings.add("UNKNOWN_FIELDS_IGNORED");
  if (tasks.some((task) => task.duplicate)) warnings.add("DUPLICATE_TASKS_DETECTED");
  if (rejectedRecordCount) warnings.add("UNRECOGNIZED_RECORDS_REJECTED");

  return {
    tasks,
    rejectedRecordCount,
    recognizedFields: [...recognizedFields].sort(),
    ignoredFields: [...ignoredFields].sort().slice(0, limits.maximumUnknownFields),
    detectedRetailerLabels: retailers,
    currencies,
    warnings: [...warnings],
  };
}
