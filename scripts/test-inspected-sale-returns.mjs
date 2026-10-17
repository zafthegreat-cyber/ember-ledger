import assert from "node:assert/strict";
import fs from "node:fs";
import { createEmptyFlipScoutState, FLIP_SCOUT_STORAGE_KEY } from "../src/features/flipScout/constants.js";
import { createFlipScoutRepository, deserializeFlipScoutState } from "../src/features/flipScout/storageRepository.js";
import { createManualLifecycleService } from "../src/features/manualLifecycles/service.js";
import { availableInventoryCostMajorUnits, suggestedInventorySaleCogsMinorUnits, validateManagedInventorySales } from "../src/features/flipScout/exactInventoryCost.js";
import { soldQuantityForInventory, validateSaleQuantity } from "../src/features/flipScout/inventory.js";
import { getSaleReportingProjection } from "../src/features/flipScout/selectors.js";
import { inventoryUnitLedger, returnMoneyProjection } from "../src/features/manualLifecycles/returnLedger.js";
import { buildSaleReturnApplication, validateReturnState } from "../src/features/manualLifecycles/returnSettlement.js";
import { createSoldManagedInventory, appendManagedSale, confirmReconciliation, costProposal } from "./inventory-reconciliation-test-helpers.mjs";
import { deriveAccountantReviewPreview } from "../src/features/purchaseReceiving/accountantReview/contracts.js";
import { createVerifiedBackup, verifyBackupJson } from "../src/features/backup/index.js";
import { getBackupSource } from "../src/features/backup/backupSourceRegistry.js";

const results = [];
const test = async (name, action) => { await action(); results.push({ name, passed: true }); console.log(`PASS ${name}`); };
const memory = () => { const values = new Map(); let writes = 0; return { get writes() { return writes; }, getItem: (key) => values.get(key) ?? null, setItem: (key, raw) => { writes++; values.set(key, raw); }, removeItem: (key) => values.delete(key) }; };
let ids = 0;
function serviceFor(repository, options = {}) { return createManualLifecycleService(repository, { now: () => "2026-10-01T12:00:00.000Z", makeId: () => `return-fixture-${++ids}`, isOwnerAuthorized: () => true, ...options }); }
function ordinary() {
  const storage = memory(); let tail = Promise.resolve();
  const lockManager = (_key, action) => { const result = tail.then(action); tail = result.catch(() => {}); return result; };
  const repository = createFlipScoutRepository(storage, { lockManager });
  const state = createEmptyFlipScoutState();
  state.inventory = [{ id: "item-a", name: "Synthetic return item", quantity: 3, allocatedItemCost: 10, currency: "USD" }];
  state.sales = [{ id: "sale-a", inventoryItemId: "item-a", quantitySold: 2, allocatedCostOfGoodsSold: 6.67, grossSalePrice: 20, netProceeds: 18, realizedProfit: 11.33, refunds: 0, status: "Completed", saleDate: "2026-09-20", createdAt: "2026-09-20T12:00:00.000Z" }];
  assert.equal(repository.save(state).error, "");
  return { storage, repository, service: serviceFor(repository), sale: state.sales[0], item: state.inventory[0], lockManager };
}
async function inspected(harness, { saleId = harness.sale?.id || harness.sales[0].id, quantity = 1, refundMinor = 500, disposition = "Restock review", stopAt = "Inspected" } = {}) {
  const service = harness.returnService || harness.service;
  let record = (await service.save("saleReturn", { saleId, quantity, status: "Requested", disposition: "Quarantine", inspection: "", refundMinor: 0, refundReference: "", notes: "Synthetic fixture" })).record;
  if (stopAt === "Requested") return record;
  record = (await service.save("saleReturn", { status: "Received" }, { id: record.id, expectedVersion: record.recordVersion })).record;
  if (stopAt === "Received") return record;
  return (await service.save("saleReturn", { status: "Inspected", disposition, inspection: "Condition and identity checked locally", refundMinor, refundReference: refundMinor ? "SYN-MANUAL-REFUND" : "" }, { id: record.id, expectedVersion: record.recordVersion })).record;
}
async function apply(harness, record) { const service = harness.returnService || harness.service; const preview = service.previewReturn(record.id); return service.applyReturn({ returnId: record.id, expectedVersion: preview.expectedVersion, confirmed: true }); }
const noWrite = async (h, action, pattern) => { const raw = h.storage.getItem(FLIP_SCOUT_STORAGE_KEY); await assert.rejects(action, pattern); assert.equal(h.storage.getItem(FLIP_SCOUT_STORAGE_KEY), raw); };

await test("owner denial happens before any storage read", async () => {
  let reads = 0; const repo = createFlipScoutRepository({ getItem() { reads++; throw new Error("private read"); } });
  const svc = createManualLifecycleService(repo);
  assert.throws(() => svc.previewReturn("missing"), /OWNER/); await assert.rejects(async () => svc.applyReturn({ returnId: "missing" }), /OWNER/); assert.equal(reads, 0);
});
await test("requested and received returns cannot be applied", async () => {
  for (const stopAt of ["Requested", "Received"]) { const h = ordinary(); const record = await inspected(h, { stopAt }); assert.throws(() => h.service.previewReturn(record.id), /inspect/); await noWrite(h, () => h.service.applyReturn({ returnId: record.id, confirmed: true }), /inspect/); }
});
await test("ordinary partial restoration and refund commit together once and preserve original facts", async () => {
  const h = ordinary(); const record = await inspected(h); const before = h.repository.load(); const writes = h.storage.writes;
  const preview = h.service.previewReturn(record.id); assert.equal(preview.availableBefore, 1); assert.equal(preview.availableAfter, 2); assert.equal(preview.cogsReversalMinor, 334);
  const result = await apply(h, record); assert.equal(h.storage.writes, writes + 1);
  assert.deepEqual(result.state.inventory, before.inventory); const sale = result.state.sales[0]; const { returnApplications: events, ...original } = sale; assert.deepEqual(original, before.sales[0]); assert.equal(events.length, 1);
  assert.equal(soldQuantityForInventory(h.item.id, result.state.sales), 1); assert.equal(availableInventoryCostMajorUnits(h.item, result.state.sales), 6.67);
  assert.equal(result.state.manualLifecycles.find((row) => row.id === record.id).status, "Closed");
  const money = getSaleReportingProjection(sale, result.state); assert.equal(money.effectiveCogs, 3.33); assert.equal(money.effectiveNetProceeds, 13); assert.ok(Math.abs(money.effectiveProfit - 9.67) < 1e-9);
  const again = await h.service.applyReturn({ returnId: record.id, expectedVersion: preview.expectedVersion, confirmed: true }); assert.equal(again.alreadyApplied, true); assert.equal(h.storage.writes, writes + 1);
  const appliedPreview = h.service.previewReturn(record.id); assert.equal(appliedPreview.status, "APPLIED"); assert.equal(appliedPreview.quantity, 1); assert.equal(appliedPreview.refundMinor, 500); assert.equal(appliedPreview.cogsReversalMinor, 334);
  assert.deepEqual(createFlipScoutRepository(h.storage).load().sales, result.state.sales);
});
await test("two independent applicants retain one application", async () => {
  const h = ordinary(); const record = await inspected(h); const peer = serviceFor(createFlipScoutRepository(h.storage, { lockManager: h.lockManager })); const expectedVersion = h.service.previewReturn(record.id).expectedVersion; const writes = h.storage.writes;
  const results = await Promise.all([h.service, peer].map((service) => service.applyReturn({ returnId: record.id, expectedVersion, confirmed: true })));
  assert.equal(results.filter((result) => result.alreadyApplied).length, 1); assert.equal(h.storage.writes, writes + 1);
});
await test("resale consumes restored exact units and can itself be inspected and returned", async () => {
  const h = ordinary(); const record = await inspected(h); await apply(h, record);
  assert.equal(suggestedInventorySaleCogsMinorUnits(h.item, h.repository.load().sales, 1), 334);
  const sale = h.repository.upsert("sales", { id: "resale", inventoryItemId: h.item.id, quantitySold: 1, allocatedCostOfGoodsSold: 3.34, grossSalePrice: 9, netProceeds: 9, realizedProfit: 5.66, status: "Completed", saleDate: "2026-10-02" }); assert.equal(sale.error, ""); assert.deepEqual(sale.record.returnSaleAllocation.unitIndexes, [0]);
  const resoldReturn = await inspected(h, { saleId: "resale", refundMinor: 900 }); await apply(h, resoldReturn);
  const state = h.repository.load(); assert.equal(inventoryUnitLedger(h.item, state.sales).available.length, 2); assert.equal(returnMoneyProjection(state.sales.find((row) => row.id === "resale")).cogsReversalMinor, 334);
});
await test("disposed units cannot later be mistaken for the remaining return cost slice", async () => {
  const h = ordinary(); await apply(h, await inspected(h, { disposition: "Dispose", refundMinor: 0 }));
  const next = await inspected(h, { refundMinor: 0 }); const preview = h.service.previewReturn(next.id); assert.equal(preview.cogsReversalMinor, 333); assert.deepEqual(preview.unitIndexes, [1]); await apply(h, next);
  assert.equal(soldQuantityForInventory(h.item.id, h.repository.load().sales), 1);
});
await test("a saved sale draft can complete against returned stock without bypassing allocation", async () => {
  const h = ordinary(); const draft = h.repository.upsert("sales", { id: "saved-draft", inventoryItemId: h.item.id, quantitySold: 1, allocatedCostOfGoodsSold: 3.34, grossSalePrice: 9, netProceeds: 9, realizedProfit: 5.66, status: "Draft", saleDate: "2026-10-02" }); assert.equal(draft.error, "");
  await apply(h, await inspected(h));
  const forged = h.repository.load(); forged.sales.find((sale) => sale.id === draft.record.id).status = "Completed"; assert.match(h.repository.save(forged).error, /verified sale writer/);
  const result = h.repository.upsert("sales", { ...draft.record, status: "Completed" }); assert.equal(result.error, ""); assert.deepEqual(result.record.returnSaleAllocation.unitIndexes, [0]);
});
await test("refund-only disposition preserves consumed stock and COGS", async () => {
  const h = ordinary(); await apply(h, await inspected(h, { disposition: "No physical return", refundMinor: 1000 })); const state = h.repository.load(); const projection = getSaleReportingProjection(state.sales[0], state);
  assert.equal(soldQuantityForInventory(h.item.id, state.sales), 2); assert.equal(projection.effectiveCogs, 6.67); assert.equal(projection.additionalRefund, 10); assert.equal(projection.effectiveNetProceeds, 8);
});
await test("stock and money cannot apply without explicit confirmation", async () => { const h = ordinary(); const row = await inspected(h); const preview = h.service.previewReturn(row.id); await noWrite(h, () => h.service.applyReturn({ returnId: row.id, expectedVersion: preview.expectedVersion }), /explicitly confirm/); });
await test("stale reviewed inventory, sale, and return snapshots fail without writing", async () => {
  for (const target of ["inventory", "sales", "return"]) {
    const h = ordinary(); const row = await inspected(h); const preview = h.service.previewReturn(row.id);
    if (target === "return") await h.service.save("saleReturn", { notes: "Later review" }, { id: row.id, expectedVersion: row.recordVersion });
    else { const state = h.repository.load(); state[target][0].notes = "Changed after review"; assert.equal(h.repository.save(state).error, ""); }
    await noWrite(h, () => h.service.applyReturn({ returnId: row.id, expectedVersion: preview.expectedVersion, confirmed: true }), /changed after review/);
  }
});
await test("lock-wait session loss prevents application", async () => {
  const h = ordinary(); const row = await inspected(h); let allowed = true; let release; const held = new Promise((resolve) => { release = resolve; });
  const repository = createFlipScoutRepository(h.storage, { lockManager: async (_key, action) => { await held; return action(); } });
  const service = serviceFor(repository, { isOwnerAuthorized: () => allowed }); const preview = service.previewReturn(row.id); const pending = service.applyReturn({ returnId: row.id, expectedVersion: preview.expectedVersion, confirmed: true }); allowed = false; release();
  await noWrite(h, () => pending, /OWNER/);
});
await test("quota denial preserves both pre-application stock and refund bytes", async () => {
  const h = ordinary(); const row = await inspected(h); const preview = h.service.previewReturn(row.id); h.storage.setItem = () => { throw new Error("Synthetic quota"); };
  await noWrite(h, () => h.service.applyReturn({ returnId: row.id, expectedVersion: preview.expectedVersion, confirmed: true }), /quota/);
});
await test("silent write failure is not reported as a successful application", async () => {
  const h = ordinary(); const row = await inspected(h); const preview = h.service.previewReturn(row.id); h.storage.setItem = () => {};
  await noWrite(h, () => h.service.applyReturn({ returnId: row.id, expectedVersion: preview.expectedVersion, confirmed: true }), /could not be verified/);
});
await test("post-commit exception is resolved by exact readback and repeat stays idempotent", async () => {
  const h = ordinary(); const row = await inspected(h); const preview = h.service.previewReturn(row.id); const write = h.storage.setItem;
  h.storage.setItem = (key, raw) => { write(key, raw); throw new Error("Synthetic error after durable write"); };
  const result = await h.service.applyReturn({ returnId: row.id, expectedVersion: preview.expectedVersion, confirmed: true }); assert.equal(result.application.refundMinor, 500);
  assert.equal((await h.service.applyReturn({ returnId: row.id, expectedVersion: preview.expectedVersion, confirmed: true })).alreadyApplied, true);
});
await test("blank optional money and floating-point legacy net preserve exact cents", async () => {
  const h = ordinary(); const state = h.repository.load(); Object.assign(state.sales[0], { grossSalePrice: 3.3, sellingFees: 1, netProceeds: 2.3 + Number.EPSILON, discounts: "", refunds: "", shippingChargedToBuyer: "", allocatedCostOfGoodsSold: 6.67 }); assert.equal(h.repository.save(state).error, "");
  const row = await inspected(h, { refundMinor: 100 }); await apply(h, row); const projection = getSaleReportingProjection(h.repository.load().sales[0], h.repository.load()); assert.equal(projection.effectiveNetProceeds, 1.3); assert.equal(projection.effectiveProfit, -2.03);
});
await test("generic save cannot forge a reviewed application", async () => {
  const h = ordinary(); const row = await inspected(h); const preview = h.service.previewReturn(row.id); const built = buildSaleReturnApplication(h.repository.load(), { returnId: row.id, expectedVersion: preview.expectedVersion, confirmed: true }, "2026-10-01T12:00:00.000Z"); const before = h.storage.getItem(FLIP_SCOUT_STORAGE_KEY);
  assert.match(h.repository.save(built.state).error, /reviewed apply/); assert.equal(h.storage.getItem(FLIP_SCOUT_STORAGE_KEY), before);
});
await test("immutable applications reject removal, alteration, and original sale rewrites", async () => {
  const h = ordinary(); await apply(h, await inspected(h)); const before = h.storage.getItem(FLIP_SCOUT_STORAGE_KEY);
  for (const change of [(state) => { delete state.sales[0].returnApplications; }, (state) => { state.sales[0].returnApplications[0].refundMinor++; }, (state) => { state.sales[0].grossSalePrice++; }]) {
    const state = h.repository.load(); change(state); try { assert.ok(h.repository.save(state).error); } catch (error) { assert.ok(error.message); } assert.equal(h.storage.getItem(FLIP_SCOUT_STORAGE_KEY), before);
  }
});
await test("reviewed return currency cannot be reinterpreted by a later Inventory edit", async () => {
  const h = ordinary(); const row = await inspected(h); await apply(h, row); const state = h.repository.load(); state.inventory[0].currency = "EUR"; const before = h.storage.getItem(FLIP_SCOUT_STORAGE_KEY);
  assert.throws(() => h.repository.save(state), /currency/); assert.equal(h.storage.getItem(FLIP_SCOUT_STORAGE_KEY), before); assert.equal(h.service.previewReturn(row.id).currency, "USD"); assert.equal(h.service.previewReturn(row.id).application.currency, "USD");
});
await test("unsafe derived net or profit is blocked before applying or saving a return", async () => {
  for (const net of ["-90071992547409.91", "-90071992547400.91"]) {
    const h = ordinary(); const state = h.repository.load(); state.sales[0].netProceeds = net; assert.equal(h.repository.save(state).error, ""); const row = await inspected(h, { refundMinor: 1500 });
    assert.throws(() => h.service.previewReturn(row.id), /exact total.*range/); await noWrite(h, () => h.service.applyReturn({ returnId: row.id, confirmed: true }), /exact total.*range/);
  }
});
await test("missing or invalid original sale date blocks an unreadable accounting application", async () => {
  for (const date of ["", "2026-02-30"]) { const h = ordinary(); const state = h.repository.load(); state.sales[0].saleDate = date; assert.equal(h.repository.save(state).error, ""); const row = await inspected(h); assert.throws(() => h.service.previewReturn(row.id), /valid original sale date/); await noWrite(h, () => h.service.applyReturn({ returnId: row.id, confirmed: true }), /valid original sale date/); }
});
await test("corrupt persisted return authority refuses normalization and preserves bytes", async () => {
  const h = ordinary(); await apply(h, await inspected(h)); const state = h.repository.load(); state.sales[0].returnApplications[0].unitCostsMinor[0]++;
  const raw = JSON.stringify(state); h.storage.setItem(FLIP_SCOUT_STORAGE_KEY, raw); assert.ok(deserializeFlipScoutState(raw).error); assert.ok(h.repository.load()); assert.match(h.repository.getLastError(), /cost/); assert.equal(h.storage.getItem(FLIP_SCOUT_STORAGE_KEY), raw);
});
await test("unsupported ordinary cost basis blocks instead of inventing zero or average history", async () => {
  for (const bad of [undefined, 10.001]) { const h = ordinary(); const state = h.repository.load(); state.inventory[0].allocatedItemCost = bad; assert.equal(h.repository.save(state).error, ""); const row = await inspected(h); assert.throws(() => h.service.previewReturn(row.id), /exact amount/); }
  const h = ordinary(); const state = h.repository.load(); state.sales[0].allocatedCostOfGoodsSold = 5; assert.equal(h.repository.save(state).error, ""); const row = await inspected(h); assert.throws(() => h.service.previewReturn(row.id), /original sale cost/);
});
await test("over-return and over-refund are rejected before application", async () => {
  const h = ordinary(); await assert.rejects(() => inspected(h, { quantity: 3 }), /Quantity|quantity/);
  const another = ordinary(); await assert.rejects(() => inspected(another, { refundMinor: 2001 }), /exceed/);
});
await test("resale rejects insufficient stock, forged allocation, and generic snapshot append", async () => {
  const h = ordinary(); await apply(h, await inspected(h));
  assert.equal(validateSaleQuantity({ inventoryItem: h.item, sales: h.repository.load().sales, saleDraft: { quantitySold: 3, status: "Completed" } }).valid, false);
  assert.throws(() => h.repository.upsert("sales", { inventoryItemId: h.item.id, quantitySold: 1, status: "Completed", returnSaleAllocation: { sequence: 2 } }), /authority/);
  const state = h.repository.load(); state.sales.push({ id: "bypass", inventoryItemId: h.item.id, quantitySold: 1, allocatedCostOfGoodsSold: 3.34, grossSalePrice: 9, netProceeds: 9, status: "Completed", saleDate: "2099-01-01", createdAt: "2099-01-01" }); assert.match(h.repository.save(state).error, /verified sale writer/);
});
await test("ordinary returns appear in read-only Accountant Review with exact current money", async () => {
  const h = ordinary(); await apply(h, await inspected(h)); const review = deriveAccountantReviewPreview({ inventoryState: h.repository.load() });
  assert.equal(review.items[0].sourceKind, "CUSTOMER_RETURN"); assert.equal(review.saleReviews[0].refundAmountMinorUnits, 500); assert.equal(review.saleReviews[0].effectiveProfitMinorUnits, 967); assert.equal(review.summary.currentEffectiveProfitMinorUnits, 967);
});
await test("managed returned units retain complete provenance, exact pennies and resale authority", async () => {
  const h = await createSoldManagedInventory({ id: "customer-return-managed", quantity: 3, totalMinorUnits: 1000, soldQuantity: 2 }); h.returnService = serviceFor(h.repository);
  const before = h.repository.load(); const record = await inspected(h); const preview = h.returnService.previewReturn(record.id); assert.equal(preview.cogsReversalMinor, 334); const applied = await apply(h, record);
  for (const key of ["inventory", "inventoryLots", "inventoryCreationApplications", "inventoryCreationEvents", "inventoryAdjustments", "inventoryReconciliationEvents"]) assert.deepEqual(applied.state[key], before[key]);
  const resale = appendManagedSale(h.repository, h.inventoryItem, { id: "managed-resale", quantity: 1 }); assert.equal(resale.allocatedCostOfGoodsSoldMinorUnits, 334); assert.equal(validateManagedInventorySales(h.repository.load()), true);
  assert.equal(availableInventoryCostMajorUnits(h.inventoryItem, h.repository.load().sales), 3.33); const review = deriveAccountantReviewPreview({ inventoryState: h.repository.load() }); assert.equal(review.lotReviews[0].remainingAvailableQuantity, 1); assert.equal(review.lotReviews[0].customerRefundMinorUnits, 500); assert.equal(review.lotReviews[0].realizedCogsEffectMinorUnits, -334); assert.equal(review.lotReviews[0].remainingInventoryEffectMinorUnits, 334);
  assert.throws(() => h.service.previewInventoryReconciliation(h.inventoryItem.id, costProposal("blocked-after-customer-return", 1200)), /return-aware/);
});
await test("previous managed COGS reconciliation is respected before customer return", async () => {
  const h = await createSoldManagedInventory({ id: "return-after-reconcile", quantity: 3, totalMinorUnits: 1000, soldQuantity: 1 }); await confirmReconciliation(h.service, h.inventoryItem, costProposal("before-customer-return", 1100)); h.returnService = serviceFor(h.repository);
  const row = await inspected(h); assert.equal(h.returnService.previewReturn(row.id).cogsReversalMinor, 367); await apply(h, row); assert.equal(validateManagedInventorySales(h.repository.load()), true);
});
await test("managed cost correction cannot hide unsafe original historical profit", async () => {
  const h = await createSoldManagedInventory({ id: "managed-original-overflow", quantity: 1, totalMinorUnits: 1000, sales: [{ quantity: 1, netProceeds: "-90071992547409.90" }] });
  await confirmReconciliation(h.service, h.inventoryItem, costProposal("overflow-basis-reconciled", 0)); h.returnService = serviceFor(h.repository);
  const row = await inspected(h, { refundMinor: 0 }); const before = h.inventoryStorage.getItem(FLIP_SCOUT_STORAGE_KEY);
  assert.throws(() => h.returnService.previewReturn(row.id), /exact total.*range/); await assert.rejects(() => h.returnService.applyReturn({ returnId: row.id, confirmed: true }), /exact total.*range/); assert.equal(h.inventoryStorage.getItem(FLIP_SCOUT_STORAGE_KEY), before);
});
await test("verified backup includes and validates immutable return applications", async () => {
  const h = ordinary(); await apply(h, await inspected(h)); const source = getBackupSource("deal-finder"); const backup = await createVerifiedBackup({ localStorage: h.storage, sessionStorage: memory(), sourceRegistry: [source] }); assert.equal(backup.verified, true);
  assert.deepEqual(backup.backup.sections[0].data.sales, h.repository.load().sales); assert.equal((await verifyBackupJson(JSON.stringify(backup.backup), { sourceRegistry: [source] })).valid, true);
  const state = h.repository.load(); state.sales[0].returnApplications[0].afterSaleCount = 999; assert.throws(() => validateReturnState(state), /order/);
});
fs.mkdirSync("artifacts/qa/reliability-returns/returns", { recursive: true });
fs.writeFileSync("artifacts/qa/reliability-returns/returns/domain-results.json", JSON.stringify({ passed: results.length, results }, null, 2));
console.log(`Inspected return workflow: ${results.length}/${results.length} passed.`);
