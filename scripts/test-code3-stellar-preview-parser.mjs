import assert from "node:assert/strict";
import {
  STELLAR_PREVIEW_CONTRACT,
  STELLAR_PREVIEW_FIELD_STATES,
  STELLAR_PREVIEW_FORMAT_STATES,
  STELLAR_PREVIEW_LIMITS,
  createStellarTaskExportPreviewFromFile,
  previewStellarTaskExportText,
  stellarPreviewBasename,
  validateStellarPreviewFileMetadata,
} from "../src/features/botOps/importPreview/index.js";

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function deepEqual(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }

function preview(payload, options = {}) {
  const text = typeof payload === "string" && options.raw ? payload : JSON.stringify(payload);
  return previewStellarTaskExportText({
    fileName: options.fileName || "stellar.synthetic.json",
    mimeType: options.mimeType ?? "application/json",
    text,
  });
}

equal(stellarPreviewBasename("C:\\private\\exports\\stellar.json"), "stellar.json", "only a basename may survive selection");
equal(stellarPreviewBasename("/private/exports/stellar.json"), "stellar.json", "POSIX paths must also be reduced to a basename");
ok(stellarPreviewBasename(`${"x".repeat(200)}.json`).length <= STELLAR_PREVIEW_LIMITS.maximumFilenameLength, "display filenames remain bounded");

for (const metadata of [
  { name: "tasks.json", type: "application/json", size: 2 },
  { name: "tasks.JSON", type: "", size: 2 },
]) {
  equal(validateStellarPreviewFileMetadata(metadata).state, "ACCEPTED", "JSON metadata should be accepted");
}
for (const [metadata, code] of [
  [{ name: "tasks.csv", type: "text/csv", size: 2 }, "JSON_FILE_REQUIRED"],
  [{ name: "tasks.json", type: "text/plain", size: 2 }, "JSON_MIME_REQUIRED"],
  [{ name: "tasks.json", type: "application/json", size: 0 }, "FILE_EMPTY_OR_INVALID"],
  [{ name: "tasks.json", type: "application/json", size: STELLAR_PREVIEW_LIMITS.maximumFileBytes + 1 }, "FILE_TOO_LARGE"],
]) {
  const result = validateStellarPreviewFileMetadata(metadata);
  equal(result.state, "REJECTED");
  ok(result.errors.includes(code));
}

const baseTask = {
  id: "task.synthetic.test",
  name: "Synthetic task",
  site: "Target",
  sku: "SKU.TEST.001",
  productTitle: "Synthetic product",
  quantity: 2,
  maxPrice: "49.95",
  currency: "USD",
  status: "WAITING",
  enabled: false,
  groupName: "Synthetic group",
};

for (const payload of [
  [baseTask],
  { tasks: [baseTask] },
  { taskGroups: [{ id: "group.synthetic.test", name: "Synthetic group", site: "Target", tasks: [baseTask] }] },
]) {
  const result = preview(payload);
  equal(result.formatRecognitionState, STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED);
  equal(result.safeToPreview, true);
  equal(result.summary.safeRecognizedTaskCount, 1);
  equal(result.tasks[0].authoritative, false);
  equal(result.tasks[0].imported, false);
  equal(result.tasks[0].retailer.canonicalId, "retailer-preset:target");
  equal(result.tasks[0].retailer.providerCapabilityVerified, false);
  equal(result.tasks[0].product.sku.value, "SKU.TEST.001");
  equal(result.tasks[0].quantity.value, 2);
  equal(result.tasks[0].maxPrice.value.minorUnits, 4995);
  equal(result.tasks[0].maxPrice.value.currency, "USD");
  equal(result.tasks[0].exportedStatus.live, false);
  equal(Object.isFrozen(result), true);
  equal(Object.isFrozen(result.tasks[0]), true);
}

equal(preview([]).formatRecognitionState, STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED, "an empty task array remains only partially recognized");
equal(preview([]).summary.safeRecognizedTaskCount, 0);
equal(preview({ version: "unverified", tasks: [baseTask] }).formatRecognitionState, STELLAR_PREVIEW_FORMAT_STATES.UNKNOWN_FORMAT, "unverified version markers cannot imply compatibility");
equal(preview("not-an-object").formatRecognitionState, STELLAR_PREVIEW_FORMAT_STATES.UNKNOWN_FORMAT);
equal(preview({ tasks: {}, taskGroups: [] }).formatRecognitionState, STELLAR_PREVIEW_FORMAT_STATES.UNKNOWN_FORMAT);
equal(preview({ tasks: [], taskGroups: [] }).formatRecognitionState, STELLAR_PREVIEW_FORMAT_STATES.UNKNOWN_FORMAT);
equal(preview({ somethingElse: [] }).formatRecognitionState, STELLAR_PREVIEW_FORMAT_STATES.UNKNOWN_FORMAT);

const aggregateLimit = preview({ taskGroups: [
  { id: "group.one.test", tasks: Array.from({ length: 251 }, (_, index) => ({ id: `task.one.${index}.test` })) },
  { id: "group.two.test", tasks: Array.from({ length: 250 }, (_, index) => ({ id: `task.two.${index}.test` })) },
] });
equal(aggregateLimit.formatRecognitionState, STELLAR_PREVIEW_FORMAT_STATES.REJECTED, "the record limit applies across every task group, not per nested array");
equal(aggregateLimit.safeToPreview, false);
equal(aggregateLimit.tasks.length, 0);
ok(aggregateLimit.compatibilityNotes.some((note) => /500-record offline preview limit/i.test(note)));

for (const payload of [[baseTask], { tasks: [baseTask] }]) {
  const result = preview(payload);
  equal(result.formatRecognitionState === STELLAR_PREVIEW_FORMAT_STATES.SUPPORTED, false, "no synthetic shape may be labeled supported");
}
equal(STELLAR_PREVIEW_CONTRACT.schemaCompatibilityVerified, false);
equal(STELLAR_PREVIEW_CONTRACT.supportedStateEmitted, false);
equal(STELLAR_PREVIEW_CONTRACT.importAvailable, false);
equal(STELLAR_PREVIEW_CONTRACT.taskCreationAvailable, false);
equal(STELLAR_PREVIEW_CONTRACT.networkAccess, false);

const integerPrice = preview([{ ...baseTask, maxPrice: 50 }]).tasks[0].maxPrice;
equal(integerPrice.state, STELLAR_PREVIEW_FIELD_STATES.RECOGNIZED);
equal(integerPrice.value.minorUnits, 5000);
equal(integerPrice.sourceRepresentation, "INTEGER_MAJOR_UNITS");
const exactMinor = preview([{ ...baseTask, maxPrice: undefined, maxPriceMinor: 1234 }]).tasks[0].maxPrice;
equal(exactMinor.value.minorUnits, 1234);
equal(exactMinor.sourceRepresentation, "MINOR_UNITS");
for (const invalid of ["12.345", "-1.00", "not-money", 12.5, 0]) {
  const result = preview([{ ...baseTask, maxPrice: invalid }]);
  equal(result.tasks[0].maxPrice.state, STELLAR_PREVIEW_FIELD_STATES.INVALID, `price ${String(invalid)} must not be coerced`);
  ok(result.tasks[0].warnings.includes("MAX_PRICE_INVALID"));
}
equal(preview([{ ...baseTask, maxPrice: "1000000.01" }]).tasks[0].maxPrice.state, STELLAR_PREVIEW_FIELD_STATES.INVALID, "out-of-range money must remain invalid");
equal(preview([{ ...baseTask, currency: undefined }]).tasks[0].maxPrice.state, STELLAR_PREVIEW_FIELD_STATES.MISSING, "missing currency must remain missing");
equal(preview([{ ...baseTask, currency: "US" }]).tasks[0].maxPrice.state, STELLAR_PREVIEW_FIELD_STATES.INVALID, "invalid currency must remain invalid");
const currencyAliasConflict = preview([{ ...baseTask, currency: "USD", currencyCode: "CAD" }]);
equal(currencyAliasConflict.tasks[0].maxPrice.value, null, "conflicting currency aliases must not select a currency");
equal(currencyAliasConflict.tasks[0].maxPrice.state, STELLAR_PREVIEW_FIELD_STATES.INVALID);
ok(currencyAliasConflict.tasks[0].warnings.includes("CONFLICTING_FIELD_ALIASES"));
const multiCurrency = preview([baseTask, { ...baseTask, id: "task.currency.two.test", sku: "SKU.CURRENCY.002", currency: "CAD" }]);
ok(multiCurrency.warnings.includes("MULTIPLE_CURRENCIES_IN_EXPORT"), "multiple currencies must remain an explicit preview conflict warning");

for (const invalid of [0, -1, 1.5, "2", "NaN", "Infinity", STELLAR_PREVIEW_LIMITS.maximumQuantity + 1]) {
  const result = preview([{ ...baseTask, quantity: invalid }]);
  equal(result.tasks[0].quantity.state, STELLAR_PREVIEW_FIELD_STATES.INVALID, `quantity ${String(invalid)} must not be coerced`);
  equal(result.tasks[0].quantity.value, null);
}
equal(preview([{ ...baseTask, quantity: 3 }]).tasks[0].quantity.value, 3);

const conflictingAliases = preview([{
  ...baseTask,
  id: "task.one.test",
  taskId: "task.two.test",
  site: "Target",
  retailer: "Walmart",
  quantity: 1,
  qty: 999,
  maxPrice: "10.00",
  max_price: "99.00",
}]);
equal(conflictingAliases.tasks[0].taskReference.value, null, "conflicting task references must not select the first alias");
equal(conflictingAliases.tasks[0].taskReference.state, STELLAR_PREVIEW_FIELD_STATES.INVALID);
equal(conflictingAliases.tasks[0].retailer.canonicalId, null, "conflicting retailers must not create a canonical mapping");
equal(conflictingAliases.tasks[0].retailer.state, STELLAR_PREVIEW_FIELD_STATES.INVALID);
equal(conflictingAliases.tasks[0].quantity.value, null, "conflicting quantities must not select the first alias");
equal(conflictingAliases.tasks[0].quantity.state, STELLAR_PREVIEW_FIELD_STATES.INVALID);
equal(conflictingAliases.tasks[0].maxPrice.value, null, "conflicting prices must not select the first alias");
equal(conflictingAliases.tasks[0].maxPrice.state, STELLAR_PREVIEW_FIELD_STATES.INVALID);
ok(conflictingAliases.tasks[0].warnings.includes("CONFLICTING_FIELD_ALIASES"));

const invalidOnly = preview([{ quantity: "not-an-integer" }]);
equal(invalidOnly.summary.safeRecognizedTaskCount, 0, "a record with no valid identity must not count as a recognized task");
equal(invalidOnly.summary.rejectedRecordCount, 1);
equal(invalidOnly.tasks.length, 0);

const groupConflicts = preview({ taskGroups: [{
  id: "group.one.test",
  groupId: "group.two.test",
  name: "Group One",
  groupName: "Group Two",
  site: "Target",
  tasks: [{ ...baseTask, groupId: "group.three.test", site: "Walmart" }],
}] });
equal(groupConflicts.tasks[0].group.reference, null, "conflicting group-envelope references must not select an arbitrary alias");
equal(groupConflicts.tasks[0].group.label, null, "conflicting group-envelope labels must not select an arbitrary alias");
equal(groupConflicts.tasks[0].retailer.canonicalId, null, "task and group retailer contradictions must not pick either retailer");
equal(groupConflicts.tasks[0].retailer.state, STELLAR_PREVIEW_FIELD_STATES.INVALID);
ok(groupConflicts.tasks[0].warnings.includes("CONFLICTING_FIELD_ALIASES"));
ok(groupConflicts.tasks[0].warnings.includes("CONFLICTING_TASK_GROUP_RETAILER"));

const impossibleTimestamp = preview([{ ...baseTask, createdAt: "2025-02-30T00:00:00Z" }]);
equal(impossibleTimestamp.tasks[0].createdAt.value, null, "calendar-invalid timestamps must not roll over silently");
equal(impossibleTimestamp.tasks[0].createdAt.state, STELLAR_PREVIEW_FIELD_STATES.INVALID);
ok(impossibleTimestamp.tasks[0].warnings.includes("TIMESTAMP_INVALID"));
equal(preview([{ ...baseTask, createdAt: "2024-02-29T23:59:59Z" }]).tasks[0].createdAt.value, "2024-02-29T23:59:59.000Z", "valid UTC leap-day timestamps remain accepted");

const walmart = preview([{ ...baseTask, site: "Walmart", sku: undefined, upc: "012345678905" }]).tasks[0];
equal(walmart.retailer.canonicalId, "retailer-preset:walmart");
equal(walmart.product.upc.value, "012345678905");
const unknownRetailer = preview([{ ...baseTask, site: "Example Store" }]).tasks[0];
equal(unknownRetailer.retailer.canonicalId, null);
equal(unknownRetailer.retailer.state, STELLAR_PREVIEW_FIELD_STATES.AMBIGUOUS);
equal(unknownRetailer.retailer.providerCapabilityVerified, false);

const unknown = preview([{ ...baseTask, harmlessFutureField: { nested: "ignored-value" } }]);
ok(unknown.ignoredFields.includes("harmlessFutureField"));
equal(JSON.stringify(unknown).includes("ignored-value"), false, "unknown field values must not survive normalization");
equal(Object.hasOwn(unknown, "raw"), false);
equal(Object.hasOwn(unknown, "sourceHash"), false);
equal(Object.hasOwn(unknown, "rawText"), false);

const duplicates = preview([baseTask, { ...baseTask }]);
equal(duplicates.summary.duplicateCount, 1);
equal(duplicates.tasks[0].warnings.includes("DUPLICATE_PREVIEW_TASK"), true);
equal(duplicates.tasks[1].duplicate, true);
equal(duplicates.tasks[1].duplicateOfPreviewIndex, 0);

const malformed = preview("{\"tasks\":[", { raw: true });
equal(malformed.formatRecognitionState, STELLAR_PREVIEW_FORMAT_STATES.REJECTED);
ok(malformed.warnings.includes("MALFORMED_JSON"));
equal(malformed.tasks.length, 0);

const fakeFile = {
  name: "C:\\fakepath\\owner-selected.json",
  type: "application/json",
  size: JSON.stringify([baseTask]).length,
  async text() { return JSON.stringify([baseTask]); },
};
const fromFile = await createStellarTaskExportPreviewFromFile(fakeFile);
equal(fromFile.file.displayName, "owner-selected.json");
equal(fromFile.safeToPreview, true);
equal(fromFile.summary.safeRecognizedTaskCount, 1);

console.log(`Code 3 Stellar export preview parser: ${assertions} assertions passed.`);
