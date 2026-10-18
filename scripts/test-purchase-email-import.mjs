import assert from "node:assert/strict";
import { buildEmailPurchaseDraft, receiptDuplicate } from "../src/features/purchaseReceiving/emailImport.js";
import { createPurchaseReceivingService } from "../src/features/purchaseReceiving/service.js";
import { createMemoryPurchaseReceivingStorage } from "../src/features/purchaseReceiving/repository.js";
import { PURCHASE_RECEIVING_STORAGE_KEY } from "../src/features/purchaseReceiving/constants.js";
import { assertSafePurchaseReceivingInput } from "../src/features/purchaseReceiving/security.js";

const now = () => "2026-10-17T12:00:00.000Z";
const receipt = { sourceId: `email:${"a".repeat(64)}`, provider: "aol", accountReference: `mailbox:${"b".repeat(64)}`, retailerId: "target", retailerLabel: "Target", orderId: "TCG-2026-123", receivedAt: now(), orderedAt: null, currency: "USD", totalMinorUnits: 2599, items: [], warnings: [] };
const review = { receipt, retailerLabel: "Target", externalOrderId: receipt.orderId, purchasedAt: "2026-10-16", currency: "USD", total: "25.99", tax: "2.01", shipping: "0", fees: "0", discount: "0", items: [{ title: "Collector sleeves", quantity: "2", unitPrice: "11.99" }] };
const input = buildEmailPurchaseDraft(review);
assert.equal(input.money.grandTotal.minorUnits, 2599);
assert.equal(input.money.subtotal.minorUnits, 2398);
assert.equal(input.status, "NEEDS_REVIEW");
assert.equal(input.lineItems[0].productMatchStatus, "UNRESOLVED");
assert.equal(input.provenance[0].recordedAt, now());
assert.equal(input.purchasedAt, "2026-10-16T00:00:00.000Z");
assert.equal(JSON.stringify(input).includes("mailboxAddress"), false);
assert.equal(buildEmailPurchaseDraft({ ...review, externalOrderId: "" }).warnings.includes("EXTERNAL_ORDER_ID_MISSING"), true);
for (const patch of [
  { currency: "" }, { currency: "JPY" }, { purchasedAt: "2026-02-31" }, { total: "25.98" }, { total: "25.999" },
  { total: "9007199254740992" }, { tax: "-1" }, { items: [] },
  { items: [{ title: "Item", quantity: "0", unitPrice: "25.99" }] },
  { items: [{ title: "Item", quantity: "1.5", unitPrice: "25.99" }] },
  { items: [{ title: "Item", quantity: "1", unitPrice: "" }] },
  { items: [{ title: "", quantity: "1", unitPrice: "25.99" }] },
  { receipt: { ...receipt, sourceId: "unverified" } },
  { receipt: { ...receipt, accountReference: "person@example.test" } },
  { appPassword: "never-save-this-credential" }, { rawEmail: "private data" },
]) assert.throws(() => buildEmailPurchaseDraft({ ...review, ...patch }));

let sequence = 0;
let authorized = true;
const storage = createMemoryPurchaseReceivingStorage();
const options = { storage, now, isOwnerAuthorized: () => authorized, idFactory: (prefix) => `${prefix}:${++sequence}` };
const service = createPurchaseReceivingService(options);
const original = await service.createDraft(input);
assert.equal(original.wroteDraft, true);
const replay = await service.createDraft(input);
assert.equal(replay.draft.id, original.draft.id);
assert.equal(replay.deduplicated, true);
const changed = buildEmailPurchaseDraft({ ...review, total: "27.99", tax: "4.01" });
await assert.rejects(service.createDraft(changed), { code: "DRAFT_IDEMPOTENCY_CONFLICT" });
assert.equal(service.snapshot().purchaseDrafts[0].money.grandTotal.minorUnits, 2599);
const otherMailbox = buildEmailPurchaseDraft({ ...review, receipt: { ...receipt, sourceId: `email:${"c".repeat(64)}`, accountReference: `mailbox:${"d".repeat(64)}` } });
const crossMailbox = await service.createDraft(otherMailbox);
assert.equal(crossMailbox.draft.id, original.draft.id);
assert.equal(service.snapshot().purchaseDrafts.length, 1);
assert.equal(receiptDuplicate(receipt, service.snapshot()).reason, "source");
assert.equal(receiptDuplicate({ ...receipt, sourceId: "different", retailerId: "TARGET" }, service.snapshot()).reason, "order");
assert.equal(receiptDuplicate({ ...receipt, sourceId: "different", retailerId: "walmart", retailerLabel: "Walmart" }, service.snapshot()), null);
assert.equal(receiptDuplicate(receipt, { purchases: [{ ...input, id: "existing" }] }).kind, "purchase");
assert.equal(receiptDuplicate(receipt, { purchaseDrafts: [{ retailerId: "retailer-preset:target", retailerLabel: null, externalOrderId: receipt.orderId }] }).reason, "order");
assert.equal(receiptDuplicate({ ...receipt, retailerId: "pokemon-center", retailerLabel: "Pokémon Center" }, { purchases: [{ vendorName: "Pokémon Center", externalOrderId: receipt.orderId }] }).reason, "order");

const saved = storage.getItem(PURCHASE_RECEIVING_STORAGE_KEY);
const blocked = createPurchaseReceivingService({ ...options, storage: { getItem: storage.getItem, setItem() { throw new Error("Quota"); } } });
await assert.rejects(blocked.createDraft({ ...input, sourceReference: "email-receipt:new-source", externalOrderId: "NEW-ORDER" }), { code: "LOCAL_SAVE_FAILED" });
assert.equal(storage.getItem(PURCHASE_RECEIVING_STORAGE_KEY), saved);
const damaged = createMemoryPurchaseReceivingStorage({ [PURCHASE_RECEIVING_STORAGE_KEY]: "{broken" });
await assert.rejects(createPurchaseReceivingService({ ...options, storage: damaged }).createDraft(input), { code: "LOCAL_LOAD_FAILED" });
assert.equal(damaged.getItem(PURCHASE_RECEIVING_STORAGE_KEY), "{broken");

let release;
const queued = createPurchaseReceivingService({ ...options, inventoryLockManager: (_name, action) => new Promise((resolve, reject) => { release = () => { try { resolve(action()); } catch (error) { reject(error); } }; }) });
const pending = queued.createDraft({ ...input, sourceReference: "email-receipt:new-source", externalOrderId: "NEW-ORDER" });
authorized = false;
release();
await assert.rejects(pending, { code: "OWNER_REQUIRED" });
assert.equal(storage.getItem(PURCHASE_RECEIVING_STORAGE_KEY), saved);

authorized = true;
let queue = Promise.resolve();
const concurrentStorage = createMemoryPurchaseReceivingStorage();
const locked = createPurchaseReceivingService({ ...options, storage: concurrentStorage, inventoryLockManager: (_name, action) => { const result = queue.then(action); queue = result.catch(() => {}); return result; } });
const results = await Promise.all([locked.createDraft(input), locked.createDraft(otherMailbox)]);
assert.equal(results.filter((result) => result.wroteDraft).length, 1);
assert.equal(locked.snapshot().purchaseDrafts.length, 1);
assert.equal(locked.snapshot().purchases.length, 0);
// A real browser run exposed Luhn-valid digit runs across UUID hyphens.
// Generate safe opaque IDs without weakening checks for supplied card data.
const collidingUuid = "aaaaaaaa-aaaa-4aaa-8411-111111111119";
assert.throws(() => assertSafePurchaseReceivingInput({ id: `purchase-activity:${collidingUuid}` }), { code: "CREDENTIAL_TEXT_REJECTED" });
const originalRandomUUID = globalThis.crypto.randomUUID;
try {
  globalThis.crypto.randomUUID = () => collidingUuid;
  const generated = createPurchaseReceivingService({ storage: createMemoryPurchaseReceivingStorage(), now, isOwnerAuthorized: () => true });
  const result = await generated.createDraft(input);
  assert.equal(result.wroteDraft, true);
  assert.equal(generated.snapshot().purchaseDrafts.length, 1);
  assert.equal(generated.snapshot().activity.length, 1);
  assertSafePurchaseReceivingInput(generated.snapshot().purchaseDrafts);
} finally { globalThis.crypto.randomUUID = originalRandomUUID; }
console.log("Purchase email import: exact totals, review validation, replay/cross-mailbox dedupe, concurrent saves, owner cancellation, corrupt/quota preservation passed.");
