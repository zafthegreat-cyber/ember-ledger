import assert from "node:assert/strict";
import {
  PHASE_2DB2_STELLAR_PREVIEW_FIXTURES,
  STELLAR_PREVIEW_FORMAT_STATES,
  previewStellarTaskExportText,
  stellarPreviewFixtureRawText,
} from "../src/features/botOps/importPreview/index.js";

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function excludes(value, pattern, message) { assert.doesNotMatch(value, pattern, message); assertions += 1; }

ok(PHASE_2DB2_STELLAR_PREVIEW_FIXTURES.length >= 38, "all requested Phase 2D-B2 synthetic cases must exist");
equal(new Set(PHASE_2DB2_STELLAR_PREVIEW_FIXTURES.map((fixture) => fixture.key)).size, PHASE_2DB2_STELLAR_PREVIEW_FIXTURES.length, "fixture keys must be unique");

const requiredKeys = [
  "minimal-safe", "multi-task", "multiple-task-groups", "target-style-identifier", "walmart-style-identifier",
  "upc-product", "sku-only-product", "quantity-more-than-one", "integer-max-price", "decimal-max-price",
  "missing-price", "malformed-price", "negative-price", "malformed-quantity", "duplicate-task",
  "unknown-harmless-field", "deeply-nested-unknown", "password-field", "token-field", "cookie-field",
  "session-field", "proxy-credential", "credential-bearing-url", "payment-card-field", "cvv-field",
  "authorization-header", "license-key", "nested-secret", "prototype-pollution-key", "oversized-field",
  "oversized-file", "oversized-record-set", "malformed-json", "wrong-root-shape", "empty-export",
  "unknown-export-version", "partially-recognized-format", "unsupported-file-format", "mixed-safe-and-unsafe",
];
for (const key of requiredKeys) ok(PHASE_2DB2_STELLAR_PREVIEW_FIXTURES.some((fixture) => fixture.key === key), `fixture ${key} is required`);

let securityFixtureCount = 0;
let partialFixtureCount = 0;
for (const fixture of PHASE_2DB2_STELLAR_PREVIEW_FIXTURES) {
  const rawText = stellarPreviewFixtureRawText(fixture);
  const result = previewStellarTaskExportText({
    fileName: fixture.file.name,
    mimeType: fixture.file.type,
    text: rawText,
  });
  equal(result.formatRecognitionState, fixture.expectedState, `${fixture.key} must have its deterministic state`);
  equal(result.ephemeral, true, `${fixture.key} remains ephemeral`);
  equal(result.imported, false, `${fixture.key} is not imported`);
  equal(result.persisted, false, `${fixture.key} is not persisted`);
  equal(result.contract.networkAccess, false, `${fixture.key} cannot use provider networking`);
  equal(result.contract.taskCreationAvailable, false, `${fixture.key} cannot create Bot Tasks`);
  equal(result.contract.checkoutEvidenceCreationAvailable, false, `${fixture.key} cannot create Checkout Evidence`);
  equal(result.contract.purchaseMutationAvailable, false, `${fixture.key} cannot create a Purchase`);
  equal(result.contract.inventoryMutationAvailable, false, `${fixture.key} cannot mutate inventory`);
  equal(Object.hasOwn(result, "rawText"), false, `${fixture.key} must not retain raw text`);
  equal(Object.hasOwn(result, "rawFile"), false, `${fixture.key} must not retain the raw file`);
  equal(Object.hasOwn(result, "sourceHash"), false, `${fixture.key} must not hash the raw source`);
  excludes(JSON.stringify(result), /C:\\\\|\/Users\/|file:\/\//i, `${fixture.key} must not retain a local path`);
  if (fixture.expectedSecurityCategory) {
    securityFixtureCount += 1;
    equal(result.safeToPreview, false);
    equal(result.tasks.length, 0);
    ok(result.blockingSecurityFindings.some((finding) => finding.category === fixture.expectedSecurityCategory));
  }
  if (fixture.expectedState === STELLAR_PREVIEW_FORMAT_STATES.PARTIALLY_RECOGNIZED) {
    partialFixtureCount += 1;
    equal(result.formatRecognitionState === STELLAR_PREVIEW_FORMAT_STATES.SUPPORTED, false, "fixtures cannot overclaim supported compatibility");
  }
  if (fixture.expectedWarning) {
    ok(result.warnings.includes(fixture.expectedWarning) || result.tasks.some((task) => task.warnings.includes(fixture.expectedWarning)), `${fixture.key} should expose ${fixture.expectedWarning}`);
  }
}

ok(securityFixtureCount >= 14, "security fixtures cover nested and category-specific rejection");
ok(partialFixtureCount >= 15, "safe and invalid-field preview cases exercise partial recognition");

const unsupported = PHASE_2DB2_STELLAR_PREVIEW_FIXTURES.find((fixture) => fixture.key === "unsupported-file-format");
const unsupportedResult = previewStellarTaskExportText({ fileName: unsupported.file.name, mimeType: unsupported.file.type, text: stellarPreviewFixtureRawText(unsupported) });
equal(unsupportedResult.file.state, "REJECTED");
equal(unsupportedResult.tasks.length, 0);

console.log(`Code 3 Stellar export preview fixtures: ${PHASE_2DB2_STELLAR_PREVIEW_FIXTURES.length}/${PHASE_2DB2_STELLAR_PREVIEW_FIXTURES.length} cases, ${securityFixtureCount} security fixtures, ${assertions} assertions passed.`);
