import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AccountantReviewValidationError,
  deriveAccountantReviewPreview,
  normalizeAccountantReviewFilters,
} from "../src/features/purchaseReceiving/accountantReview/index.js";
import {
  confirmReconciliation,
  costProposal,
  createSoldManagedInventory,
} from "./inventory-reconciliation-test-helpers.mjs";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const ok = (actual, message) => { assert.ok(actual, message); assertions += 1; };

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const harness = await createSoldManagedInventory({
  id: "accountant-review-security",
  quantity: 3,
  soldQuantity: 1,
  sales: [{ quantity: 1, saleDate: "2025-12-31" }],
});
await confirmReconciliation(harness.service, harness.inventoryItem, costProposal("accountant-review-security", 1100));
const state = harness.repository.load();
const before = JSON.stringify(state);
const safe = deriveAccountantReviewPreview({ inventoryState: state });
equal(JSON.stringify(state), before, "derivation leaves the complete source state byte-equivalent");
equal(safe.readOnly, true);
equal(safe.mutatesHistoricalSales, false);
equal(safe.mutatesHistoricalCogs, false);
equal(safe.mutatesPurchases, false);
equal(safe.mutatesInventory, false);
equal(safe.mutatesTransfers, false);
equal(safe.infersTaxTreatment, false);

for (const [field, value, expectedCode] of [
  ["password", "synthetic-password-value", "SECRET_FIELD_REJECTED"],
  ["role", "OWNER", "AUTHORITY_FIELD_REJECTED"],
  ["rawProviderPayload", "synthetic provider body", "RAW_SOURCE_DATA_REJECTED"],
]) {
  const malicious = clone(state);
  malicious[field] = value;
  assert.throws(
    () => deriveAccountantReviewPreview({ inventoryState: malicious }),
    (error) => error.code === expectedCode,
    `top-level ${field} is rejected before projection`,
  ); assertions += 1;
}

{
  const malicious = clone(state);
  malicious.sales[0].apiToken = "synthetic-token-value";
  assert.throws(() => deriveAccountantReviewPreview({ inventoryState: malicious }), (error) => error.code === "SECRET_FIELD_REJECTED"); assertions += 1;
}

{
  const malicious = clone(state);
  malicious.sales[0].notes = "Authorization: Bearer synthetic-accountant-review-token";
  assert.throws(() => deriveAccountantReviewPreview({ inventoryState: malicious }), (error) => error.code === "CREDENTIAL_TEXT_REJECTED"); assertions += 1;
}

{
  const malicious = clone(state);
  malicious.sales[0].notes = "Synthetic card-like value 4000 0000 0000 0002";
  assert.throws(() => deriveAccountantReviewPreview({ inventoryState: malicious }), (error) => error.code === "CREDENTIAL_TEXT_REJECTED"); assertions += 1;
}

for (const [field, value] of [
  ["semanticDigest", "Bearer synthetic-accountant-review-token"],
  ["proposalDigest", "https://synthetic-user:synthetic-password@example.invalid/review"],
  ["semantic_digest", "4000 0000 0000 0002"],
]) {
  const malicious = clone(state);
  malicious[field] = value;
  assert.throws(
    () => deriveAccountantReviewPreview({ inventoryState: malicious }),
    (error) => error.code === "CREDENTIAL_TEXT_REJECTED",
    `${field} cannot bypass credential-value screening`,
  ); assertions += 1;
}

{
  const malicious = clone(state);
  malicious.inventoryReconciliationEvents[0].semanticDigest = "Bearer synthetic-accountant-review-token";
  assert.throws(
    () => deriveAccountantReviewPreview({ inventoryState: malicious }),
    (error) => error.code === "CREDENTIAL_TEXT_REJECTED",
    "a canonical digest field is masked only when its value has canonical digest syntax",
  ); assertions += 1;
}

{
  const malicious = clone(state);
  malicious.inventoryReconciliationEvents[0].proposalDigest = "https://synthetic-user:synthetic-password@example.invalid/review";
  assert.throws(
    () => deriveAccountantReviewPreview({ inventoryState: malicious }),
    (error) => error.code === "CREDENTIAL_TEXT_REJECTED",
    "a canonical proposalDigest field cannot hide a credential-bearing URL",
  ); assertions += 1;
}

{
  const malicious = clone(state);
  malicious.inventoryReconciliationEvents[0].semantic_digest = "4000 0000 0000 0002";
  assert.throws(
    () => deriveAccountantReviewPreview({ inventoryState: malicious }),
    (error) => error.code === "CREDENTIAL_TEXT_REJECTED",
    "a digest-name variant cannot hide payment-card-like data",
  ); assertions += 1;
}

{
  const malicious = clone(state);
  malicious.sales[0].unsafeInteger = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(
    () => deriveAccountantReviewPreview({ inventoryState: malicious }),
    (error) => error.code === "UNSAFE_NUMBER",
    "unsafe integers remain visible to the recursive security scanner",
  ); assertions += 1;
}

{
  const malicious = clone(state);
  Object.defineProperty(malicious, "__proto__", { enumerable: true, value: { polluted: true } });
  assert.throws(() => deriveAccountantReviewPreview({ inventoryState: malicious }), (error) => error.code === "PROTOTYPE_KEY_REJECTED"); assertions += 1;
  equal({}.polluted, undefined);
}

{
  const malicious = clone(state);
  malicious.sales[0].extra = new Date();
  assert.throws(() => deriveAccountantReviewPreview({ inventoryState: malicious }), (error) => error.code === "UNSAFE_OBJECT"); assertions += 1;
}

{
  const missingDate = clone(state);
  delete missingDate.sales[0].saleDate;
  assert.throws(
    () => deriveAccountantReviewPreview({ inventoryState: missingDate }),
    (error) => error instanceof AccountantReviewValidationError && error.code === "REQUIRED_FIELD",
    "transaction period never falls back to record or allocation timestamps",
  ); assertions += 1;
}

assert.throws(
  () => deriveAccountantReviewPreview({ inventoryState: state, localStorage: {} }),
  (error) => error.code === "UNSUPPORTED_REVIEW_INPUT",
); assertions += 1;
assert.throws(
  () => normalizeAccountantReviewFilters({ session: "synthetic-session" }),
  (error) => error.code === "AUTHORITY_FIELD_REJECTED",
); assertions += 1;
assert.throws(
  () => normalizeAccountantReviewFilters({ category: "POST_JOURNAL_ENTRY" }),
  (error) => error.code === "INVALID_CATEGORY_FILTER",
); assertions += 1;
assert.throws(
  () => normalizeAccountantReviewFilters({ unexpected: "field" }),
  (error) => error.code === "UNSUPPORTED_FILTER",
); assertions += 1;

const source = await readFile(new URL("../src/features/purchaseReceiving/accountantReview/contracts.js", import.meta.url), "utf8");
for (const prohibited of [
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bindexedDB\b/,
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /\.setItem\s*\(/,
  /\.removeItem\s*\(/,
]) {
  equal(prohibited.test(source), false, `domain contains no ${prohibited} capability`);
}
ok(!source.includes("POST_JOURNAL_ENTRY"), "domain has no journal-posting action");
ok(!source.includes("AMEND_TAX_RETURN"), "domain has no tax-amendment action");

console.log(`Code 3 Accountant Review security: ${assertions} assertions passed.`);
