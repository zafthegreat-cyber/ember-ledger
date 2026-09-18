import assert from "node:assert/strict";
import {
  PHASE2CA_FIXED_NOW,
  PHASE2CA_FIXTURE_COUNT,
  PHASE2CA_QA_FIXTURES,
  createFixtureDraftInput,
  createFixtureLineItem,
  createFixturePurchase,
  getPhase2caFixture,
} from "../src/features/purchaseReceiving/fixtures/phase2caFixtures.js";
import {
  normalizePurchaseDraftInput,
  normalizeReceivingEvent,
} from "../src/features/purchaseReceiving/index.js";

let assertions = 0;
const equal = (actual, expected, message) => { assert.equal(actual, expected, message); assertions += 1; };
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const deepEqual = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions += 1; };

const requiredFixtureIds = [
  "simple-one-item-draft", "multi-item-purchase", "target-order", "walmart-order", "pickup-order",
  "shipped-order", "tax", "shipping", "coupon", "discount", "zero-shipping", "partial-cancellation",
  "full-cancellation", "partial-refund", "full-refund", "split-shipment", "partial-receiving",
  "damaged-item", "missing-item", "wrong-item", "replacement", "duplicate-source",
  "duplicate-external-order-id", "same-order-id-different-account", "conflicting-currency",
  "malformed-total", "line-total-mismatch", "penny-rounding-allocation", "ambiguous-product",
  "unmatched-product", "owner-correction", "rejected-draft", "confirmed-draft",
  "inventory-handoff-preview", "duplicate-receiving-event", "interrupted-confirmation-repair",
];

ok(PHASE2CA_FIXTURE_COUNT >= 36, "at least the 36 required scenarios are present");
equal(PHASE2CA_FIXTURE_COUNT, PHASE2CA_QA_FIXTURES.length, "fixture count export stays exact");
equal(new Set(PHASE2CA_QA_FIXTURES.map((fixture) => fixture.id)).size, PHASE2CA_FIXTURE_COUNT, "fixture ids are unique");

for (const id of requiredFixtureIds) ok(getPhase2caFixture(id), `required fixture ${id} exists`);

function inspectMoneyObjects(value, path = "root") {
  if (!value || typeof value !== "object") return;
  if (Object.hasOwn(value, "minorUnits")) {
    ok(Number.isSafeInteger(value.minorUnits) || typeof value.minorUnits === "string", `${path} minor units remain exact or intentionally malformed`);
    equal(typeof value.currency, "string", `${path} currency is explicit`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectMoneyObjects(item, `${path}[${index}]`));
    return;
  }
  Object.entries(value).forEach(([key, nested]) => inspectMoneyObjects(nested, `${path}.${key}`));
}

for (const fixture of PHASE2CA_QA_FIXTURES) {
  ok(/^[a-z0-9-]+$/.test(fixture.id), `${fixture.id} has a stable fixture id`);
  ok(["PURCHASE_DRAFT", "RECEIVING"].includes(fixture.kind), `${fixture.id} has a known fixture kind`);
  equal(typeof fixture.description, "string", `${fixture.id} has a description`);
  ok(fixture.input && typeof fixture.input === "object", `${fixture.id} input is an object`);
  inspectMoneyObjects(fixture.input, fixture.id);

  const serialized = JSON.stringify(fixture);
  ok(!/\b(?:password|accessToken|refreshToken|bearerToken|sessionCookie|securityAnswer|cvv|cardNumber|proxyPassword)\b/i.test(serialized), `${fixture.id} excludes secret-bearing field names`);
  ok(!/@(?![^\s"]*\.test\b|[^\s"]*\.invalid\b)/i.test(serialized), `${fixture.id} uses reserved email domains only`);
  ok(!/https?:\/\//i.test(serialized), `${fixture.id} contains no network endpoint`);
}

const draft = createFixtureDraftInput();
const purchase = createFixturePurchase();
const line = createFixtureLineItem();
equal(draft.status, "DRAFT");
ok(draft.id !== purchase.id, "Purchase Draft != Purchase");
equal(purchase.sourceDraftId, draft.id, "purchase retains draft lineage");
equal(purchase.confirmationMethod, "VERIFIED_OWNER_SESSION", "purchase fixture requires explicit owner confirmation");
equal(line.quantityOrdered, 1);
equal(line.receivedQuantity, 0, "purchase fixture is not received inventory");
equal(line.remainingQuantity, 1);
equal(PHASE2CA_FIXED_NOW, "2026-08-31T14:00:00.000Z", "fixture clock is deterministic");

const defensiveLookup = getPhase2caFixture("missing-fixture");
equal(defensiveLookup, null, "unknown fixture lookup is explicit");
deepEqual(
  PHASE2CA_QA_FIXTURES.filter((fixture) => fixture.kind === "RECEIVING").map((fixture) => fixture.id),
  ["partial-receiving", "damaged-item", "missing-item", "wrong-item", "replacement", "inventory-handoff-preview", "duplicate-receiving-event", "full-receiving", "wrong-quantity", "unexpected-extra-item"],
  "receiving scenarios remain deterministic",
);

for (const id of [
  "simple-one-item-draft", "multi-item-purchase", "target-order", "walmart-order", "pickup-order",
  "shipped-order", "tax", "shipping", "coupon", "discount", "zero-shipping", "partial-cancellation",
  "full-cancellation", "partial-refund", "full-refund", "split-shipment", "ambiguous-product",
  "unmatched-product", "owner-correction", "rejected-draft", "confirmed-draft",
]) {
  const normalized = normalizePurchaseDraftInput(getPhase2caFixture(id).input);
  equal(normalized.recordType, "PURCHASE_DRAFT", `${id} normalizes only as a Purchase Draft`);
  equal(normalized.automaticPurchaseCreationAllowed, false, `${id} cannot auto-create a Purchase`);
  equal(normalized.inventoryCreated, false, `${id} cannot create Inventory`);
}

for (const id of ["partial-receiving", "damaged-item", "missing-item", "wrong-item", "replacement", "inventory-handoff-preview", "duplicate-receiving-event", "full-receiving"]) {
  const normalized = normalizeReceivingEvent(getPhase2caFixture(id).input);
  equal(normalized.recordType, "RECEIVING_EVENT", `${id} normalizes as a review-only Receiving Event`);
  equal(normalized.createsInventory, false, `${id} creates no Inventory`);
}

for (const id of ["conflicting-currency", "malformed-total", "refund-greater-than-paid", "currency-mismatch-line"]) {
  assert.throws(() => normalizePurchaseDraftInput(getPhase2caFixture(id).input), undefined, `${id} fails closed`);
  assertions += 1;
}

console.log(`Phase 2C-A fixtures: ${PHASE2CA_FIXTURE_COUNT}/${PHASE2CA_FIXTURE_COUNT} scenarios, ${assertions} assertions passed.`);
