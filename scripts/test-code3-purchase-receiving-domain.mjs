import assert from "node:assert/strict";
import {
  PRODUCT_MATCH_STATES,
  PURCHASE_DRAFT_STATES,
  PURCHASE_RECEIVING_COLLECTIONS,
  PURCHASE_RECEIVING_SAFETY_CONTRACT,
  PURCHASE_RECEIVING_SCHEMA_VERSION,
  PURCHASE_RECEIVING_STORAGE_KEY,
  createEmptyPurchaseReceivingState,
  createPurchaseReceivingPersistence,
  createPurchaseReceivingRepository,
  createPurchaseReceivingService,
  deserializePurchaseReceivingState,
  matchPurchaseProduct,
  normalizeProductIdentity,
  serializePurchaseReceivingState,
  validateDraftForConfirmation,
} from "../src/features/purchaseReceiving/index.js";
import {
  PHASE2CA_FIXED_NOW,
  createFixtureDraftInput,
} from "../src/features/purchaseReceiving/fixtures/phase2caFixtures.js";

class MemoryStorage {
  constructor() { this.values = new Map(); this.reads = 0; this.writes = 0; }
  getItem(key) { this.reads += 1; return this.values.get(key) ?? null; }
  setItem(key, value) { this.writes += 1; this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

let assertions = 0;
function equal(actual, expected, message) { assert.equal(actual, expected, message); assertions += 1; }
function deepEqual(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions += 1; }
function ok(value, message) { assert.ok(value, message); assertions += 1; }
function throws(callback, predicate, message) { assert.throws(callback, predicate, message); assertions += 1; }
async function rejects(callback, predicate, message) { await assert.rejects(callback, predicate, message); assertions += 1; }

function harness(options = {}) {
  const storage = options.storage || new MemoryStorage();
  let sequence = 0;
  const authority = options.authority || { allowed: true };
  const service = createPurchaseReceivingService({
    storage,
    isOwnerAuthorized: () => authority.allowed,
    idFactory: (prefix) => `${prefix}.domain-${sequence += 1}.test`,
    now: () => PHASE2CA_FIXED_NOW,
  });
  return { authority, service, storage };
}

equal(PURCHASE_RECEIVING_STORAGE_KEY, "code3.purchase-receiving.v1");
equal(PURCHASE_RECEIVING_SCHEMA_VERSION, 1);
deepEqual(PURCHASE_RECEIVING_COLLECTIONS, ["purchaseDrafts", "purchases", "purchaseEvents", "receivingEvents", "activity"]);
equal(PURCHASE_RECEIVING_SAFETY_CONTRACT.authoritative, "LOCAL_ONLY");
equal(PURCHASE_RECEIVING_SAFETY_CONTRACT.remoteActive, false);
equal(PURCHASE_RECEIVING_SAFETY_CONTRACT.automaticPurchaseCreation, false);
equal(PURCHASE_RECEIVING_SAFETY_CONTRACT.automaticReceiving, false);
equal(PURCHASE_RECEIVING_SAFETY_CONTRACT.automaticInventoryMutation, false);
equal(PURCHASE_RECEIVING_SAFETY_CONTRACT.orderCandidateEqualsPurchase, false);
equal(PURCHASE_RECEIVING_SAFETY_CONTRACT.checkoutEvidenceEqualsPurchase, false);
equal(PURCHASE_RECEIVING_SAFETY_CONTRACT.purchaseDraftEqualsPurchase, false);
equal(PURCHASE_RECEIVING_SAFETY_CONTRACT.purchaseEqualsReceivedInventory, false);
equal(PURCHASE_RECEIVING_SAFETY_CONTRACT.receivingEqualsInventory, false);

for (const option of ["mode", "persistenceMode", "remoteDataSource", "request", "remoteActive", "sync", "migrationApply", "rollbackExecutor", "providerNetworkAccess", "inventoryWriter", "purchaseImporter", "orderCandidateImporter", "checkoutEvidenceImporter"]) {
  throws(
    () => createPurchaseReceivingService({ [option]: option === "mode" ? "REMOTE_ACTIVE" : {} }),
    (error) => error.code === "UNSAFE_OPTION_REJECTED",
    `${option} cannot expand Purchase/Receiving authority`,
  );
}

{
  const storage = new MemoryStorage();
  const { service } = harness({ storage, authority: { allowed: false } });
  equal(storage.reads, 0, "service construction performs no pre-authorization storage read");
  await rejects(() => service.createDraft(createFixtureDraftInput()), (error) => error.code === "OWNER_REQUIRED");
  equal(storage.reads, 0, "unauthorized mutation is rejected before storage read");
  equal(storage.writes, 0, "unauthorized mutation is rejected before storage write");
  throws(() => service.snapshot(), (error) => error.code === "OWNER_REQUIRED", "unauthorized snapshot is denied");
  await rejects(() => service.listDrafts(), (error) => error.code === "OWNER_REQUIRED");
  await rejects(() => service.listPurchases(), (error) => error.code === "OWNER_REQUIRED");
  await rejects(() => service.getDraft("purchase-draft.synthetic.test"), (error) => error.code === "OWNER_REQUIRED");
  await rejects(() => service.getPurchase("purchase.synthetic.test"), (error) => error.code === "OWNER_REQUIRED");
  throws(() => service.previewInventoryHandoff("purchase.synthetic.test"), (error) => error.code === "OWNER_REQUIRED");
  throws(() => service.stateHash(), (error) => error.code === "OWNER_REQUIRED");
  throws(() => service.canonicalSnapshot(), (error) => error.code === "OWNER_REQUIRED");
  equal(storage.reads, 0, "all unauthorized read surfaces fail before storage access");
  equal(storage.writes, 0, "all unauthorized read surfaces remain zero-write");
}

{
  const { service, storage } = harness();
  equal(service.mode, "LOCAL_ONLY");
  equal(service.authoritative, "LOCAL_ONLY");
  equal(service.remoteActive, false);
  equal(service.providerNetworkAccess, false);
  equal(service.automaticPurchaseCreation, false);
  equal(service.automaticReceiving, false);
  equal(service.automaticInventoryMutation, false);
  equal(service.inventoryWriterAvailable, false);
  for (const name of ["createInventory", "receiveInventory", "importPurchase", "importOrderCandidate", "importCheckoutEvidence", "sync", "delete"]) {
    equal(name in service, false, `${name} is not an available service capability`);
  }
  const snapshot = service.snapshot();
  equal(snapshot.schemaVersion, 1);
  for (const collection of PURCHASE_RECEIVING_COLLECTIONS) equal(snapshot[collection].length, 0);
}

{
  const { service, storage } = harness();
  const input = createFixtureDraftInput();
  const first = await service.createDraft(input);
  equal(first.deduplicated, false);
  equal(first.wroteDraft, true);
  equal(first.draft.status, PURCHASE_DRAFT_STATES.DRAFT);
  equal(first.draft.recordType, "PURCHASE_DRAFT");
  equal(first.draft.automaticPurchaseCreationAllowed, false);
  equal(first.draft.inventoryCreated, false);
  equal((await service.listDrafts()).length, 1);
  equal((await service.listPurchases()).length, 0, "Purchase Draft != Purchase");
  equal((await service.listReceivingEvents()).length, 0, "draft creation cannot receive inventory");
  ok(storage.writes > 0, "owner-reviewed draft is persisted locally");

  const replay = await service.createDraft({ ...input, id: "purchase-draft.different-ui-id.test" });
  equal(replay.deduplicated, true, "stable source identity deduplicates repeated review");
  equal(replay.wroteDraft, false);
  equal(replay.draft.id, first.draft.id);
  equal((await service.listDrafts()).length, 1);

  const beforeConflict = service.canonicalSnapshot();
  await rejects(
    () => service.createDraft({ ...input, id: "purchase-draft.conflicting-replay.test", retailerLabel: "Conflicting Synthetic Retailer" }),
    (error) => error.code === "DRAFT_IDEMPOTENCY_CONFLICT",
    "a reused source identity with changed business evidence must fail closed",
  );
  equal(service.canonicalSnapshot(), beforeConflict, "conflicting source replay writes nothing");

  const ready = await service.markDraftReady(first.draft.id, first.draft.recordVersion);
  equal(ready.draft.status, PURCHASE_DRAFT_STATES.READY_TO_CONFIRM);
  equal(ready.validation.valid, true);
  equal((await service.listPurchases()).length, 0, "ready state still is not a Purchase");

  const confirmation = await service.confirmDraft(ready.draft.id, { expectedVersion: ready.draft.recordVersion });
  equal(confirmation.deduplicated, false);
  equal(confirmation.wrotePurchase, true);
  equal(confirmation.draft.status, PURCHASE_DRAFT_STATES.CONFIRMED);
  equal(confirmation.purchase.recordType, "PURCHASE");
  equal(confirmation.purchase.sourceDraftId, ready.draft.id);
  equal(confirmation.purchase.confirmationMethod, "VERIFIED_OWNER_SESSION");
  equal(confirmation.purchase.receivingStatus, "NOT_RECEIVED");
  equal(confirmation.purchase.inventoryCreated, false);
  equal(confirmation.purchase.automaticReceivingAllowed, false);
  equal((await service.listPurchases()).length, 1);
  equal((await service.listPurchaseEvents()).length, 1);
  equal((await service.listReceivingEvents()).length, 0, "Purchase != Received Inventory");

  const retry = await service.confirmDraft(ready.draft.id, { expectedVersion: ready.draft.recordVersion });
  equal(retry.deduplicated, true);
  equal(retry.wrotePurchase, false);
  equal(retry.purchase.id, confirmation.purchase.id);
  equal((await service.listPurchases()).length, 1, "interrupted/repeated confirmation creates exactly one Purchase");
  equal((await service.listPurchaseEvents()).length, 1, "confirmation history is idempotent");
}

{
  const { service, storage } = harness();
  const created = await service.createDraft(createFixtureDraftInput({
    id: "purchase-draft.correction.test",
    sourceReference: "source.correction.test",
    vendorName: "Synthetic Retailer",
  }));
  const corrected = await service.correctDraft(created.draft.id, {
    vendorName: "Corrected Synthetic Retailer",
    reason: "Owner verified the synthetic retailer label.",
  }, created.draft.recordVersion);
  equal(corrected.status, PURCHASE_DRAFT_STATES.NEEDS_REVIEW);
  equal(corrected.vendorName, "Corrected Synthetic Retailer");
  equal(corrected.corrections.length, 1);
  equal(corrected.corrections[0].previousValue, "Synthetic Retailer");
  equal(corrected.corrections[0].correctedValue, "Corrected Synthetic Retailer");
  equal(corrected.corrections[0].provenance, "OWNER_CORRECTION");
  equal(created.draft.vendorName, "Synthetic Retailer", "owner correction does not mutate original evidence snapshot");
  const canonicalized = await service.correctDraft(corrected.id, {
    lineItems: corrected.lineItems.map((line) => ({
      ...line,
      title: "Canonicalized Synthetic Product",
      harmlessUnknown: "must-not-persist",
      contactEmail: "owner@example.invalid",
      shippingAddress: "1 Synthetic Way",
    })),
    reason: "Owner corrected the synthetic product label.",
  }, corrected.recordVersion);
  equal(canonicalized.lineItems[0].title, "Canonicalized Synthetic Product");
  equal(canonicalized.lineItems[0].harmlessUnknown, undefined, "unknown correction fields do not enter the canonical line item");
  equal(canonicalized.corrections.at(-1).correctedValue[0].harmlessUnknown, undefined, "unknown correction fields do not enter correction provenance");
  equal(canonicalized.corrections.at(-1).correctedValue[0].contactEmail, undefined, "personal fields do not enter correction provenance");
  equal(canonicalized.corrections.at(-1).correctedValue[0].shippingAddress, undefined, "raw addresses do not enter correction provenance");
  const persistedCorrection = storage.values.get(PURCHASE_RECEIVING_STORAGE_KEY);
  equal(persistedCorrection.includes("must-not-persist"), false, "unknown correction values are absent from local persistence");
  equal(persistedCorrection.includes("owner@example.invalid"), false, "personal correction values are absent from local persistence");
  equal(persistedCorrection.includes("1 Synthetic Way"), false, "raw correction addresses are absent from local persistence");
  await rejects(
    () => service.correctDraft(canonicalized.id, {
      lineItems: canonicalized.lineItems.map((line) => ({ ...line, pwd: "synthetic-password.invalid" })),
    }, canonicalized.recordVersion),
    (error) => error.code === "SECRET_FIELD_REJECTED",
    "secret-bearing correction payloads fail before persistence",
  );
  equal(storage.values.get(PURCHASE_RECEIVING_STORAGE_KEY).includes("synthetic-password.invalid"), false, "rejected correction secrets never reach local persistence");
  const forgedUnknownCorrection = JSON.parse(persistedCorrection);
  forgedUnknownCorrection.purchaseDrafts[0].corrections.at(-1).correctedValue[0].unknownNested = "forged-unknown-value";
  const normalizedForgedCorrection = deserializePurchaseReceivingState(JSON.stringify(forgedUnknownCorrection));
  equal(normalizedForgedCorrection.error, null, "harmless unknown correction keys are canonicalized away on load");
  equal(normalizedForgedCorrection.state.purchaseDrafts[0].corrections.at(-1).correctedValue[0].unknownNested, undefined, "persisted correction snapshots retain only canonical fields");
  const forgedSecretCorrection = JSON.parse(persistedCorrection);
  forgedSecretCorrection.purchaseDrafts[0].corrections.at(-1).correctedValue[0].pwd = "forged-secret.invalid";
  const rejectedForgedCorrection = deserializePurchaseReceivingState(JSON.stringify(forgedSecretCorrection));
  ok(rejectedForgedCorrection.error, "secret-bearing persisted correction snapshots fail closed");
  equal(rejectedForgedCorrection.state.purchaseDrafts.length, 0, "unsafe persisted correction data is not partially loaded");
  await rejects(() => service.correctDraft(canonicalized.id, { status: "CONFIRMED" }, canonicalized.recordVersion), (error) => error.code === "DRAFT_FIELD_NOT_CORRECTABLE");
  const rejected = await service.rejectDraft(canonicalized.id, "Owner rejected this synthetic draft.", canonicalized.recordVersion);
  equal(rejected.status, PURCHASE_DRAFT_STATES.REJECTED);
  equal((await service.listPurchases()).length, 0, "rejected draft creates no Purchase");
  await rejects(() => service.markDraftReady(rejected.id, rejected.recordVersion), (error) => error.code === "DRAFT_TERMINAL");
}

{
  const unresolved = matchPurchaseProduct({ title: "Synthetic title only" }, [{ id: "catalog.one.test", title: "Synthetic title only" }]);
  equal(unresolved.status, PRODUCT_MATCH_STATES.UNRESOLVED, "titles never force product matching");
  equal(unresolved.titleOnlyCandidate, true);
  const matched = matchPurchaseProduct({ upc: "000000000001" }, [{ id: "catalog.one.test", upc: "000000000001" }]);
  equal(matched.status, PRODUCT_MATCH_STATES.MATCHED);
  equal(matched.productReference, "catalog.one.test");
  ok(matched.evidence.includes("upc"));
  const ambiguous = matchPurchaseProduct({ sku: "DUPLICATE-SKU" }, [
    { id: "catalog.a.test", sku: "DUPLICATE-SKU" },
    { id: "catalog.b.test", sku: "DUPLICATE-SKU" },
  ]);
  equal(ambiguous.status, PRODUCT_MATCH_STATES.AMBIGUOUS);
  equal(ambiguous.productReference, null);
  deepEqual(normalizeProductIdentity({ sku: " sku test ", upc: " 000 111 ", title: "Synthetic" }), {
    productReference: null,
    retailerItemId: null,
    sku: "SKUTEST",
    upc: "000111",
    gtin: null,
    tcin: null,
    title: "Synthetic",
    category: null,
  });
}

{
  const empty = createEmptyPurchaseReceivingState(() => PHASE2CA_FIXED_NOW);
  const serialized = serializePurchaseReceivingState(empty);
  const roundTrip = deserializePurchaseReceivingState(serialized);
  equal(roundTrip.error, null);
  deepEqual(roundTrip.state, empty);
  const invalid = deserializePurchaseReceivingState("{not-json", { now: () => PHASE2CA_FIXED_NOW });
  ok(invalid.error);
  equal(invalid.state.purchaseDrafts.length, 0);

  const storage = new MemoryStorage();
  const repository = createPurchaseReceivingRepository(storage, { now: () => PHASE2CA_FIXED_NOW });
  const persistence = createPurchaseReceivingPersistence({ repository, now: () => PHASE2CA_FIXED_NOW });
  equal(persistence.mode, "LOCAL_ONLY");
  equal(persistence.remoteActive, false);
  throws(() => createPurchaseReceivingPersistence({ remoteActive: true }), (error) => error.code === "PERSISTENCE_MODE_NOT_CALLER_SELECTABLE");
  throws(() => persistence.transact(async (state) => state), (error) => error.code === "ASYNC_MUTATOR_REJECTED");
}

{
  const persistedShape = {
    ...createFixtureDraftInput({
      status: "READY_TO_CONFIRM",
      recordVersion: 1,
      createdAt: PHASE2CA_FIXED_NOW,
      updatedAt: PHASE2CA_FIXED_NOW,
    }),
  };
  const valid = validateDraftForConfirmation(persistedShape);
  equal(valid.valid, true);
  const notReady = validateDraftForConfirmation({ ...persistedShape, status: "DRAFT" });
  equal(notReady.valid, false);
  ok(notReady.blockers.includes("DRAFT_NOT_READY"));
}

console.log(`Code 3 Purchase/Receiving domain: ${assertions} assertions passed.`);
