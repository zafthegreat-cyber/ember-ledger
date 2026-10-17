import assert from "node:assert/strict";
import fs from "node:fs";
import { createEmptyFlipScoutState, FLIP_SCOUT_STORAGE_KEY } from "../src/features/flipScout/constants.js";
import { createFlipScoutRepository, deserializeFlipScoutState } from "../src/features/flipScout/storageRepository.js";
import { createManualLifecycleService } from "../src/features/manualLifecycles/service.js";
import { inventoryUnitLedger, itemUnitCosts, returnMoneyProjection } from "../src/features/manualLifecycles/returnLedger.js";
import { buildReturnCorrection } from "../src/features/manualLifecycles/returnCorrections.js";
import { availableInventoryCostMajorUnits, validateManagedInventorySales } from "../src/features/flipScout/exactInventoryCost.js";
import { getSaleReportingProjection } from "../src/features/flipScout/selectors.js";
import { deriveAccountantReviewPreview } from "../src/features/purchaseReceiving/accountantReview/contracts.js";
import { createSoldManagedInventory, appendManagedSale, confirmReconciliation, costProposal } from "./inventory-reconciliation-test-helpers.mjs";
import { createVerifiedBackup, verifyBackupJson } from "../src/features/backup/index.js";
import { getBackupSource } from "../src/features/backup/backupSourceRegistry.js";

const results = [];
const test = async (name, action) => { await action(); results.push({ name, passed: true }); console.log(`PASS ${name}`); };
const memory = () => { const values = new Map(); let writes = 0; return { get writes() { return writes; }, getItem: (key) => values.get(key) ?? null, setItem: (key, raw) => { writes++; values.set(key, raw); }, removeItem: (key) => values.delete(key) }; };
let identity = 0;
const serviceFor = (repository, options = {}) => createManualLifecycleService(repository, { now: () => "2026-10-01T12:00:00.000Z", makeId: () => `return-correction-fixture-${++identity}`, isOwnerAuthorized: () => true, ...options });
function ordinary(quantity = 3) {
  const storage = memory(); let tail = Promise.resolve();
  const lockManager = (_key, action) => { const result = tail.then(action); tail = result.catch(() => {}); return result; };
  const repository = createFlipScoutRepository(storage, { lockManager });
  const state = createEmptyFlipScoutState();
  state.inventory = [{ id: "item-a", name: "Synthetic exact pennies", quantity, allocatedItemCost: 10, currency: "USD" }];
  state.sales = [{ id: "sale-a", inventoryItemId: "item-a", quantitySold: 2, allocatedCostOfGoodsSold: 6.67, grossSalePrice: 20, netProceeds: 18, realizedProfit: 11.33, refunds: 0, status: "Completed", saleDate: "2026-09-20", createdAt: "2026-09-20T12:00:00.000Z" }];
  assert.equal(repository.save(state).error, "");
  return { storage, repository, service: serviceFor(repository), sale: state.sales[0], item: state.inventory[0], lockManager };
}
async function applied(h, { saleId = h.sale.id, quantity = 1, refundMinor = 500, disposition = "Restock review" } = {}) {
  let row = (await h.service.save("saleReturn", { saleId, quantity, status: "Requested", disposition: "Quarantine", inspection: "", refundMinor: 0, refundReference: "", notes: "Synthetic" })).record;
  row = (await h.service.save("saleReturn", { status: "Received" }, { id: row.id, expectedVersion: row.recordVersion })).record;
  row = (await h.service.save("saleReturn", { status: "Inspected", disposition, inspection: "Physical item checked", refundMinor, refundReference: refundMinor ? "SYN-ORIGINAL" : "" }, { id: row.id, expectedVersion: row.recordVersion })).record;
  const preview = h.service.previewReturn(row.id);
  await h.service.applyReturn({ returnId: row.id, expectedVersion: preview.expectedVersion, confirmed: true });
  return row;
}
const proposal = (patch = {}) => ({ idempotencyKey: `synthetic-correction-${++identity}`, refundMinor: 0, refundReference: "SYN-MANUAL-REVERSAL", restockedQuantity: 0, disposition: "No physical return", reason: "Corrected synthetic return disposition and manual financial record", physicalReturnConfirmed: false, inspection: "", ...patch });
async function correct(h, row, change = proposal()) { const preview = h.service.previewReturnCorrection(row.id, change); return h.service.applyReturnCorrection({ returnId: row.id, proposal: change, expectedVersion: preview.expectedVersion, confirmed: true }); }
const noWrite = async (h, action, pattern) => { const raw = h.storage.getItem(FLIP_SCOUT_STORAGE_KEY); await assert.rejects(action, pattern); assert.equal(h.storage.getItem(FLIP_SCOUT_STORAGE_KEY), raw); };
function resale(h, id = "resale") { const result = h.repository.upsert("sales", { id, inventoryItemId: h.item.id, quantitySold: 1, allocatedCostOfGoodsSold: 3.34, grossSalePrice: 9, netProceeds: 9, realizedProfit: 5.66, status: "Completed", saleDate: "2026-10-02" }); assert.equal(result.error, ""); return result.record; }

await test("owner denial precedes private reads for preview and correction", async () => {
  let reads = 0; const repo = createFlipScoutRepository({ getItem() { reads++; throw new Error("Private read"); } }); const service = createManualLifecycleService(repo);
  assert.throws(() => service.previewReturnCorrection("missing", proposal()), /OWNER/); await assert.rejects(async () => service.applyReturnCorrection({}), /OWNER/); assert.equal(reads, 0);
});
await test("complete reversal appends one exact event and preserves original closed inspection and sale", async () => {
  const h = ordinary(); const row = await applied(h); const before = h.repository.load(); const change = proposal(); const writes = h.storage.writes;
  const preview = h.service.previewReturnCorrection(row.id, change); assert.deepEqual(preview.deltas, { refundMinor: -500, stockQuantity: -1, cogsReversalMinor: -334 }); assert.equal(preview.currency, "USD"); assert.equal(preview.availableAfter, 1);
  const result = await correct(h, row, change); assert.equal(h.storage.writes, writes + 1); assert.equal(result.correction.appliedAt, "2026-10-01T12:00:00.000Z");
  const { returnCorrections, ...original } = result.state.sales[0]; assert.deepEqual(original, before.sales[0]); assert.deepEqual(result.state.manualLifecycles, before.manualLifecycles); assert.deepEqual(result.state.inventory, before.inventory); assert.equal(returnCorrections.length, 1);
  assert.equal(availableInventoryCostMajorUnits(h.item, result.state.sales), 3.33); assert.equal(getSaleReportingProjection(result.state.sales[0], result.state).effectiveProfit, 11.33);
  const current = h.service.previewReturn(row.id); assert.equal(current.refundMinor, 0); assert.equal(current.restockedQuantity, 0); assert.equal(current.application.refundMinor, 500); assert.equal(current.corrections.length, 1);
  assert.deepEqual(createFlipScoutRepository(h.storage).load().sales, result.state.sales);
});
await test("reversal then fresh inspected reapplication supports subsequent resale and its return", async () => {
  const h = ordinary(); const row = await applied(h); await correct(h, row);
  assert.throws(() => h.service.previewReturnCorrection(row.id, proposal({ refundMinor: 400, restockedQuantity: 1, disposition: "Restock review" })), /fresh physical/);
  await correct(h, row, proposal({ refundMinor: 400, restockedQuantity: 1, disposition: "Restock review", physicalReturnConfirmed: true, inspection: "Rechecked identity and condition" }));
  resale(h); const returned = await applied(h, { saleId: "resale", refundMinor: 900 }); await correct(h, returned);
  assert.deepEqual(inventoryUnitLedger(h.item, h.repository.load().sales).available, [2]);
});
await test("partial restock correction preserves exact remainder pennies", async () => {
  const h = ordinary(); const row = await applied(h, { quantity: 2, refundMinor: 1000 });
  const result = await correct(h, row, proposal({ refundMinor: 700, restockedQuantity: 1, disposition: "Restock review" })); assert.equal(result.correction.cogsDeltaMinor, -333); assert.deepEqual(result.correction.removedUnitIndexes, [1]); assert.deepEqual(result.correction.after.unitIndexes, [0]); assert.equal(availableInventoryCostMajorUnits(h.item, result.state.sales), 6.67);
});
await test("refund-only correction remains possible after resale but removing consumed stock is blocked", async () => {
  const h = ordinary(); const row = await applied(h); resale(h);
  await correct(h, row, proposal({ refundMinor: 600, restockedQuantity: 1, disposition: "Restock review" }));
  assert.throws(() => h.service.previewReturnCorrection(row.id, proposal()), /already resold/);
  await applied(h, { saleId: "resale", refundMinor: 900 }); assert.throws(() => h.service.previewReturnCorrection(row.id, proposal()), /later return/);
});
await test("reservation removal is conservative and release enables review", async () => {
  const h = ordinary(); const row = await applied(h); let listing = (await h.service.save("listing", { itemId: h.item.id, title: "Synthetic held item", channel: "Manual", quantity: 1, priceMinor: 500, status: "Reserved", saleId: "" })).record;
  assert.throws(() => h.service.previewReturnCorrection(row.id, proposal()), /reservation/);
  listing = (await h.service.save("listing", { status: "Withdrawn" }, { id: listing.id, expectedVersion: listing.recordVersion })).record;
  await correct(h, row); assert.equal(listing.status, "Withdrawn");
});
await test("exact binder assignment and active grading block stock removal until released", async () => {
  for (const type of ["assignment", "grading"]) {
    const h = ordinary(); const row = await applied(h); let linked;
    if (type === "assignment") { const binder = (await h.service.save("binder", { title: "Synthetic binder", pages: 1, slotsPerPage: 9 })).record; linked = (await h.service.save("assignment", { itemId: h.item.id, unit: 1, binderId: binder.id, page: 1, slot: 1 })).record; }
    else linked = (await h.service.save("grading", { itemId: h.item.id, unit: 1, company: "Synthetic", submissionReference: "", status: "Draft", costMinor: 0, grade: "", certificate: "", notes: "" })).record;
    assert.throws(() => h.service.previewReturnCorrection(row.id, proposal()), /Unassign/);
    await h.service.save(type, type === "assignment" ? { binderId: "" } : { status: "Cancelled" }, { id: linked.id, expectedVersion: linked.recordVersion }); await correct(h, row);
  }
});
await test("repeat reviewed proposal is idempotent across peers and conflicts require a new key", async () => {
  const h = ordinary(); const row = await applied(h); const change = proposal(); const expectedVersion = h.service.previewReturnCorrection(row.id, change).expectedVersion; const writes = h.storage.writes;
  const peer = serviceFor(createFlipScoutRepository(h.storage, { lockManager: h.lockManager })); const command = { returnId: row.id, proposal: change, expectedVersion, confirmed: true };
  const result = await Promise.all([h.service.applyReturnCorrection(command), peer.applyReturnCorrection(command)]); assert.equal(result.filter((entry) => entry.alreadyApplied).length, 1); assert.equal(h.storage.writes, writes + 1);
  assert.equal(peer.previewReturnCorrection(row.id, change).status, "APPLIED"); assert.throws(() => peer.previewReturnCorrection(row.id, { ...change, refundMinor: 100 }), /different proposal/);
});
await test("stale linked records and changed proposal fail without writing", async () => {
  for (const target of ["linked", "proposal"]) { const h = ordinary(); const row = await applied(h); const change = proposal(); const preview = h.service.previewReturnCorrection(row.id, change);
    if (target === "linked") await h.service.save("binder", { title: "New concurrent binder", pages: 1, slotsPerPage: 9 });
    const command = { returnId: row.id, proposal: target === "proposal" ? { ...change, reason: "Changed after reviewed proposal" } : change, expectedVersion: preview.expectedVersion, confirmed: true };
    await noWrite(h, () => h.service.applyReturnCorrection(command), /changed after review/);
  }
});
await test("correction cannot overrefund, overrestore, omit reference/reason or bypass confirmation", async () => {
  const h = ordinary(); const row = await applied(h);
  for (const patch of [{ refundMinor: 2001 }, { restockedQuantity: 2, disposition: "Restock review" }, { refundReference: "" }, { reason: "" }, { refundMinor: 1.01 }, { idempotencyKey: "bad key" }]) assert.throws(() => h.service.previewReturnCorrection(row.id, proposal(patch)));
  const change = proposal(); const preview = h.service.previewReturnCorrection(row.id, change); await noWrite(h, () => h.service.applyReturnCorrection({ returnId: row.id, proposal: change, expectedVersion: preview.expectedVersion }), /explicitly confirm/);
});
await test("pending manual refunds are included in corrected payment cap", async () => {
  const h = ordinary(); const row = await applied(h); let second = (await h.service.save("saleReturn", { saleId: h.sale.id, quantity: 1, status: "Requested", disposition: "Quarantine", inspection: "", refundMinor: 0, refundReference: "", notes: "" })).record;
  second = (await h.service.save("saleReturn", { status: "Received" }, { id: second.id, expectedVersion: second.recordVersion })).record;
  await h.service.save("saleReturn", { status: "Inspected", disposition: "No physical return", inspection: "Checked", refundMinor: 1200, refundReference: "PENDING" }, { id: second.id, expectedVersion: second.recordVersion });
  assert.throws(() => h.service.previewReturnCorrection(row.id, proposal({ refundMinor: 900, restockedQuantity: 1, disposition: "Restock review" })), /pending refunds/);
  await correct(h, row); // original closed refund stays 500; effective total releases capacity honestly.
});
await test("owner loss while waiting for lock prevents every correction write", async () => {
  const h = ordinary(); const row = await applied(h); let release; let owner = true; const held = new Promise((resolve) => { release = resolve; }); const service = serviceFor(createFlipScoutRepository(h.storage, { lockManager: async (_key, action) => { await held; return action(); } }), { isOwnerAuthorized: () => owner });
  const change = proposal(); const expectedVersion = service.previewReturnCorrection(row.id, change).expectedVersion; const pending = service.applyReturnCorrection({ returnId: row.id, proposal: change, expectedVersion, confirmed: true }); owner = false; release(); await noWrite(h, () => pending, /OWNER/);
});
await test("quota denial and silent-write failure preserve original effects", async () => {
  for (const mode of ["quota", "silent"]) { const h = ordinary(); const row = await applied(h); const change = proposal(); const expectedVersion = h.service.previewReturnCorrection(row.id, change).expectedVersion; h.storage.setItem = () => { if (mode === "quota") throw new Error("Synthetic quota"); };
    await noWrite(h, () => h.service.applyReturnCorrection({ returnId: row.id, proposal: change, expectedVersion, confirmed: true }), mode === "quota" ? /quota/ : /could not be verified/);
  }
});
await test("postcommit exception resolves through readback and retains one correction", async () => {
  const h = ordinary(); const row = await applied(h); const change = proposal(); const write = h.storage.setItem; h.storage.setItem = (key, raw) => { write(key, raw); throw new Error("Synthetic after write"); }; const result = await correct(h, row, change); assert.equal(result.alreadyApplied, false); assert.equal((await correct(h, row, change)).alreadyApplied, true); assert.equal(h.repository.load().sales[0].returnCorrections.length, 1);
});
await test("generic save and direct sale inputs cannot forge correction authority", async () => {
  const h = ordinary(); const row = await applied(h); const change = proposal(); const preview = h.service.previewReturnCorrection(row.id, change); const built = buildReturnCorrection(h.repository.load(), { returnId: row.id, proposal: change, expectedVersion: preview.expectedVersion, confirmed: true }, "2026-10-01T12:00:00.000Z");
  assert.match(h.repository.save(built.state).error, /reviewed correction/); assert.throws(() => h.repository.upsert("sales", built.state.sales[0]), /authority/);
  await correct(h, row, change); const bytes = h.storage.getItem(FLIP_SCOUT_STORAGE_KEY);
  for (const mutate of [(state) => { state.sales[0].returnCorrections = []; }, (state) => { state.sales[0].returnCorrections[0].reason = "Rewritten history"; }, (state) => { state.sales[0].returnApplications[0].refundMinor = 0; }]) {
    const state = h.repository.load(); mutate(state); try { assert.ok(h.repository.save(state).error); } catch (error) { assert.ok(error.message); } assert.equal(h.storage.getItem(FLIP_SCOUT_STORAGE_KEY), bytes);
  }
});
await test("real form canonical quantity strings support returns and malformed quantity remains blocked", async () => {
  const h = ordinary("3"); const row = await applied(h); await correct(h, row); assert.equal(h.repository.load().inventory[0].quantity, "3");
  for (const quantity of ["3.0", "03", "3e0", "-3", "3.5", " 3 ", "", null, true]) assert.throws(() => itemUnitCosts({ ...h.item, quantity }), /whole-unit/);
});
await test("accountant review sums immutable signed correction effects once", async () => {
  const h = ordinary(); const row = await applied(h); await correct(h, row); const review = deriveAccountantReviewPreview({ inventoryState: h.repository.load() });
  assert.deepEqual(review.items.map((item) => item.sourceKind).sort(), ["CUSTOMER_RETURN", "CUSTOMER_RETURN_CORRECTION"]); assert.equal(review.items.reduce((sum, item) => sum + item.refundAmountMinorUnits, 0), 0); assert.equal(review.items.reduce((sum, item) => sum + item.remainingInventoryEffectMinorUnits, 0), 0); assert.equal(review.saleReviews[0].effectiveProfitMinorUnits, 1133); assert.equal(review.summary.currentEffectiveProfitMinorUnits, 1133); assert.equal(review.saleReviews[0].returnCorrectionIds.length, 1);
});
await test("managed reversal preserves provenance, exact resale, and corrected accounting", async () => {
  const source = await createSoldManagedInventory({ id: "correction-managed", quantity: 3, totalMinorUnits: 1000, soldQuantity: 2 }); const h = { ...source, storage: source.inventoryStorage, item: source.inventoryItem, sale: source.sales[0], service: serviceFor(source.repository) }; const original = h.repository.load(); const row = await applied(h); await correct(h, row); await correct(h, row, proposal({ refundMinor: 300, restockedQuantity: 1, disposition: "Restock review", physicalReturnConfirmed: true, inspection: "Fresh exact unit inspection" }));
  const state = h.repository.load(); for (const key of ["inventory", "inventoryLots", "inventoryCreationApplications", "inventoryCreationEvents", "inventoryAdjustments", "inventoryReconciliationEvents"]) assert.deepEqual(state[key], original[key]);
  assert.equal(validateManagedInventorySales(state), true); assert.equal(deriveAccountantReviewPreview({ inventoryState: state }).lotReviews[0].customerRefundMinorUnits, 300); const resold = appendManagedSale(h.repository, h.item, { id: "resold-after-correction", quantity: 1 }); assert.equal(resold.allocatedCostOfGoodsSoldMinorUnits, 334);
  assert.throws(() => source.service.previewInventoryReconciliation(h.item.id, costProposal("blocked", 1500)), /return-aware/);
});
await test("prior managed cost reconciliation remains exact through reversal", async () => {
  const source = await createSoldManagedInventory({ id: "correction-prior-reconciliation", quantity: 3, totalMinorUnits: 1000, soldQuantity: 1 }); await confirmReconciliation(source.service, source.inventoryItem, costProposal("prior", 1100));
  const h = { ...source, storage: source.inventoryStorage, item: source.repository.load().inventory[0], sale: source.sales[0], service: serviceFor(source.repository) }; const row = await applied(h); const result = await correct(h, row); assert.equal(result.correction.cogsDeltaMinor, -367); assert.equal(validateManagedInventorySales(result.state), true);
});
await test("verified schema8 backups retain and validate correction lineage", async () => {
  const h = ordinary(); const row = await applied(h); await correct(h, row); const source = getBackupSource("deal-finder"); const backup = await createVerifiedBackup({ localStorage: h.storage, sessionStorage: memory(), sourceRegistry: [source] }); assert.equal(source.schemaVersion, 8); assert.equal(backup.verified, true); assert.equal((await verifyBackupJson(JSON.stringify(backup.backup), { sourceRegistry: [source] })).valid, true); assert.deepEqual(backup.backup.sections[0].data.sales, h.repository.load().sales);
  assert.equal(h.repository.load().schemaVersion, 8);
  for (const mutate of [(event) => { event.after.refundMinor++; }, (event) => { event.sequence = 99; }, (event) => { event.before.unitIndexes = []; }, (event) => { event.currency = "EUR"; }, (event) => { event.afterApplicationCount = 99; }]) { const state = h.repository.load(); mutate(state.sales[0].returnCorrections[0]); assert.ok(deserializeFlipScoutState(JSON.stringify(state)).error); }
});

await test("persisted correction chronology cannot move backwards across the application chain", async () => {
  const h = ordinary(); const row = await applied(h); h.service = serviceFor(h.repository, { now: () => "2026-10-02T12:00:00.000Z" }); await correct(h, row);
  h.service = serviceFor(h.repository, { now: () => "2026-10-03T12:00:00.000Z" }); await correct(h, row, proposal({ refundMinor: 200, restockedQuantity: 1, disposition: "Restock review", physicalReturnConfirmed: true, inspection: "New physical inspection" }));
  const state = h.repository.load(); state.sales[0].returnCorrections[1].appliedAt = state.sales[0].returnApplications[0].appliedAt;
  assert.match(deserializeFlipScoutState(JSON.stringify(state)).error, /backwards in time/);
});

await test("applications and corrections interleave at the same sale watermark without reordering", async () => {
  const h = ordinary(); const first = await applied(h); await correct(h, first); const second = await applied(h, { refundMinor: 200 });
  await correct(h, first, proposal({ refundMinor: 100, restockedQuantity: 1, disposition: "Restock review", physicalReturnConfirmed: true, inspection: "First unit rechecked after second return" }));
  await correct(h, second); assert.deepEqual(inventoryUnitLedger(h.item, h.repository.load().sales).available, [0, 2]);
  assert.deepEqual(returnMoneyProjection(h.repository.load().sales[0]).refundMinor, 100);
});
await test("correction exact overflow and backwards dates fail before durable mutation", async () => {
  const h = ordinary(); const state = h.repository.load(); state.sales[0].netProceeds = "-90071992547403.24"; assert.equal(h.repository.save(state).error, ""); const row = await applied(h, { refundMinor: 0 });
  assert.throws(() => h.service.previewReturnCorrection(row.id, proposal({ refundMinor: 500, restockedQuantity: 1, disposition: "Restock review" })), /exact total.*range/);
  const change = proposal(); const expectedVersion = h.service.previewReturnCorrection(row.id, change).expectedVersion; const older = serviceFor(h.repository, { now: () => "2026-09-30T12:00:00.000Z" });
  await noWrite(h, () => older.applyReturnCorrection({ returnId: row.id, proposal: change, expectedVersion, confirmed: true }), /predate/);
});
await test("two different reviewed proposals conflict instead of overwriting each other", async () => {
  const h = ordinary(); const row = await applied(h); const one = proposal(); const two = proposal({ refundMinor: 100 }); const a = h.service.previewReturnCorrection(row.id, one), b = h.service.previewReturnCorrection(row.id, two);
  await h.service.applyReturnCorrection({ returnId: row.id, proposal: one, expectedVersion: a.expectedVersion, confirmed: true });
  await noWrite(h, () => h.service.applyReturnCorrection({ returnId: row.id, proposal: two, expectedVersion: b.expectedVersion, confirmed: true }), /changed after review/);
});
await test("owner is rechecked after correction derivation and before persistence", async () => {
  const h = ordinary(); const row = await applied(h); const change = proposal(); let owner = true; const service = serviceFor(h.repository, { isOwnerAuthorized: () => owner, now: () => { owner = false; return "2026-10-01T12:00:00.000Z"; } });
  const expectedVersion = service.previewReturnCorrection(row.id, change).expectedVersion; await noWrite(h, () => service.applyReturnCorrection({ returnId: row.id, proposal: change, expectedVersion, confirmed: true }), /OWNER/);
});
await test("deterministic resale/return/correction stress conserves every unit and penny", async () => {
  for (const managed of [false, true]) {
    const source = managed ? await createSoldManagedInventory({ id: "correction-conservation", quantity: 3, totalMinorUnits: 1000, soldQuantity: 2 }) : null;
    const h = managed ? { ...source, storage: source.inventoryStorage, item: source.inventoryItem, sale: source.sales[0], service: serviceFor(source.repository) } : ordinary();
    await applied(h); let random = 47;
    const choose = (limit) => { random = (Math.imul(random, 1664525) + 1013904223) >>> 0; return random % limit; };
    for (let step = 0; step < 90; step++) {
      const state = h.repository.load(); const ledger = inventoryUnitLedger(h.item, state.sales); const action = choose(3);
      if (action === 0 && ledger.available.length) {
        const id = `stress-sale-${managed}-${step}`;
        if (managed) appendManagedSale(h.repository, h.item, { id, quantity: 1 });
        else { const cogs = ledger.costs[ledger.available[0]] / 100; const result = h.repository.upsert("sales", { id, inventoryItemId: h.item.id, quantitySold: 1, allocatedCostOfGoodsSold: cogs, grossSalePrice: 20, netProceeds: 20, realizedProfit: 20 - cogs, status: "Completed", saleDate: "2026-10-02" }); assert.equal(result.error, ""); }
      } else if (action === 1) {
        const possible = state.sales.filter((sale) => (sale.returnApplications || []).reduce((sum, event) => sum + event.quantity, 0) < Number(sale.quantitySold));
        if (possible.length) { const sale = possible[choose(possible.length)]; await applied(h, { saleId: sale.id, refundMinor: 0, disposition: choose(2) ? "Restock review" : "No physical return" }); }
      } else {
        const application = ledger.events[choose(ledger.events.length)]; const current = ledger.effectiveApplications.get(application.id); const stock = choose(2); const change = proposal({ refundMinor: choose(100), restockedQuantity: stock, disposition: stock ? "Restock review" : "No physical return", physicalReturnConfirmed: stock > current.restockedQuantity, inspection: stock > current.restockedQuantity ? "Synthetic repeated physical inspection" : "" }); const bytes = h.storage.getItem(FLIP_SCOUT_STORAGE_KEY);
        try { await correct(h, { id: application.returnId }, change); } catch (error) { assert.match(error.message, /already resold|later return|recredit/); assert.equal(h.storage.getItem(FLIP_SCOUT_STORAGE_KEY), bytes); }
      }
      const saved = h.repository.load(); const after = inventoryUnitLedger(h.item, saved.sales); const remaining = after.available.reduce((sum, unit) => sum + after.costs[unit], 0);
      const consumed = saved.sales.reduce((sum, sale) => sum + Math.round(getSaleReportingProjection(sale, saved).effectiveCogs * 100), 0);
      assert.equal(remaining + consumed, 1000); assert.equal(new Set(after.available).size, after.available.length); assert.equal(deserializeFlipScoutState(h.storage.getItem(FLIP_SCOUT_STORAGE_KEY)).error, ""); if (managed) assert.equal(validateManagedInventorySales(saved), true);
    }
  }
});

fs.mkdirSync("artifacts/qa/private-beta-candidate/return-corrections", { recursive: true });
fs.writeFileSync("artifacts/qa/private-beta-candidate/return-corrections/domain-results.json", JSON.stringify({ passed: results.length, results }, null, 2));
console.log(`Return corrections: ${results.length}/${results.length} passed.`);
