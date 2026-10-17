import { canonicalStringify } from "../backup/canonicalJson.js";
import { inventoryReconciliationVersion } from "../purchaseReceiving/inventoryReconciliation/contracts.js";
import { applicationValues, completedSale, exactSum, returnApplications, returnCorrections, returnMoneyProjection, saleAmountMinor } from "./returnLedger.js";
import { correctionProposalFromEvent, normalizeReturnCorrectionProposal } from "./returnCorrectionContracts.js";
import { returnApplicationFor, validateReturnState, verifiedReturnLedger } from "./returnSettlement.js";

const fail = (message) => { throw new Error(message); };
const equal = (a, b) => canonicalStringify(a) === canonicalStringify(b);
const withCorrection = (state, saleId, correction) => ({ ...state, sales: state.sales.map((sale) => sale.id === saleId ? { ...sale, returnCorrections: [...returnCorrections(sale), correction] } : sale) });

function eventFromPreview(preview, at) {
  const { proposal, application, before, after } = preview;
  return { id: `return-correction:${proposal.idempotencyKey}`, format: "CODE3_LOCAL_RETURN_CORRECTION_V1", idempotencyKey: proposal.idempotencyKey, returnId: application.returnId, applicationId: application.id, saleId: application.saleId, inventoryItemId: application.inventoryItemId, currency: application.currency, sequence: preview.sequence, afterSaleCount: preview.afterSaleCount, afterApplicationCount: preview.afterApplicationCount, appliedAt: at, reason: proposal.reason, inspection: proposal.inspection, physicalReturnConfirmed: proposal.physicalReturnConfirmed, before, after, refundDeltaMinor: preview.refundDeltaMinor, stockDelta: preview.stockDelta, cogsDeltaMinor: preview.cogsDeltaMinor, addedUnitIndexes: after.unitIndexes.filter((unit) => !before.unitIndexes.includes(unit)), removedUnitIndexes: before.unitIndexes.filter((unit) => !after.unitIndexes.includes(unit)) };
}

export function previewReturnCorrection(state, returnId, input) {
  const proposal = normalizeReturnCorrectionProposal(input);
  validateReturnState(state);
  const application = returnApplicationFor(state, returnId);
  if (!application) fail("Apply the inspected return before correcting its recorded effects.");
  const sale = state.sales.find((row) => row.id === application.saleId);
  const item = state.inventory.find((row) => row.id === application.inventoryItemId);
  const ledger = verifiedReturnLedger(item, state);
  const existing = state.sales.flatMap(returnCorrections).find((event) => event.idempotencyKey === proposal.idempotencyKey);
  const corrections = returnCorrections(sale).filter((event) => event.applicationId === application.id);
  const shared = { returnId, saleId: sale.id, inventoryItemId: item.id, currency: application.currency, application, proposal, corrections };
  if (existing) {
    if (existing.returnId !== returnId || !equal(correctionProposalFromEvent(existing), proposal)) fail("This correction identity has already been used for a different proposal. Start a new review.");
    return Object.freeze({ ...shared, status: "APPLIED", canApply: false, alreadyApplied: true, correction: existing, before: existing.before, after: existing.after, deltas: { refundMinor: existing.refundDeltaMinor, stockQuantity: existing.stockDelta, cogsReversalMinor: existing.cogsDeltaMinor }, refundDeltaMinor: existing.refundDeltaMinor, stockDelta: existing.stockDelta, cogsDeltaMinor: existing.cogsDeltaMinor, availableBefore: ledger.available.length, availableAfter: ledger.available.length });
  }
  if (proposal.restockedQuantity > application.quantity) fail("Corrected stock cannot exceed this original inspected return quantity.");
  const before = applicationValues(ledger.effectiveApplications.get(application.id));
  const unitIndexes = application.returnedUnitIndexes.slice(0, proposal.restockedQuantity);
  const after = { refundMinor: proposal.refundMinor, refundReference: proposal.refundReference, restockedQuantity: proposal.restockedQuantity, cogsReversalMinor: exactSum(unitIndexes.map((unit) => ledger.costs[unit])), unitIndexes, disposition: proposal.disposition };
  if (equal(before, after)) fail("The correction must change the recorded refund, reference, stock or disposition.");
  const refundDeltaMinor = exactSum([after.refundMinor, -before.refundMinor]);
  const stockDelta = after.restockedQuantity - before.restockedQuantity;
  const cogsDeltaMinor = exactSum([after.cogsReversalMinor, -before.cogsReversalMinor]);
  if (refundDeltaMinor && !proposal.refundReference.trim()) fail("Record a manual reference for the refund correction, including a reversal.");
  if (stockDelta > 0 && (!proposal.physicalReturnConfirmed || !proposal.inspection.trim())) fail("Increasing returned stock requires a fresh physical inspection and explicit confirmation.");
  const removed = before.unitIndexes.filter((unit) => !after.unitIndexes.includes(unit));
  if (removed.some((unit) => !ledger.available.includes(unit) || ledger.stockCreditOwners.get(unit) !== application.id)) fail("Returned units already resold or attributed to a later return cannot be removed by this correction.");
  const rows = state.manualLifecycles || [];
  if (removed.length && rows.some((row) => row.type === "listing" && row.itemId === item.id && row.status === "Reserved" && !state.sales.some((entry) => entry.id === row.saleId && completedSale(entry)))) fail("Release this item's active reservation before removing returned stock.");
  if (rows.some((row) => row.itemId === item.id && removed.includes(row.unit - 1) && ((row.type === "assignment" && row.binderId) || (row.type === "grading" && !["Completed", "Cancelled"].includes(row.status))))) fail("Unassign the returned unit and finish or cancel its grading submission before removing stock.");
  const paid = exactSum([saleAmountMinor(sale, "grossSalePrice"), saleAmountMinor(sale, "shippingChargedToBuyer"), -saleAmountMinor(sale, "discounts"), -saleAmountMinor(sale, "refunds")]);
  const pendingRefunds = rows.filter((row) => row.type === "saleReturn" && row.saleId === sale.id && !returnApplications(sale).some((event) => event.returnId === row.id)).map((row) => row.refundMinor);
  if (exactSum([returnMoneyProjection(sale).refundMinor, refundDeltaMinor, ...pendingRefunds]) > paid) fail("Corrected and pending refunds exceed the original recorded payment.");
  const preview = { ...shared, status: "READY", canApply: true, alreadyApplied: false, before, after, deltas: { refundMinor: refundDeltaMinor, stockQuantity: stockDelta, cogsReversalMinor: cogsDeltaMinor }, refundDeltaMinor, stockDelta, cogsDeltaMinor, availableBefore: ledger.available.length, availableAfter: ledger.available.length + stockDelta, sequence: ledger.corrections.length + 1, afterSaleCount: ledger.ordered.length, afterApplicationCount: ledger.events.length, expectedVersion: inventoryReconciliationVersion({ application, item, sales: ledger.ordered, manualLifecycles: rows, reconciliation: state.inventoryReconciliationEvents || [], proposal }) };
  // Replaying the proposed envelope validates exact unit ownership, money bounds,
  // and reporting before a caller is allowed to review or commit it.
  const latestAt = [...ledger.events, ...ledger.corrections].reduce((latest, event) => event.appliedAt > latest ? event.appliedAt : latest, application.appliedAt);
  validateReturnState(withCorrection(state, sale.id, eventFromPreview(preview, latestAt)));
  return Object.freeze(preview);
}

export function buildReturnCorrection(state, { returnId, proposal, expectedVersion, confirmed }, at) {
  if (confirmed !== true) fail("Review and explicitly confirm the correction before applying it.");
  const preview = previewReturnCorrection(state, returnId, proposal);
  if (preview.alreadyApplied) return { state, correction: preview.correction, alreadyApplied: true };
  if (!expectedVersion || expectedVersion !== preview.expectedVersion) fail("The proposal, sale, Inventory or linked records changed after review. Refresh the correction preview before applying.");
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(at) || new Date(at).toISOString() !== at) fail("A valid correction time is required.");
  const related = state.sales.filter((sale) => sale.inventoryItemId === preview.inventoryItemId).flatMap((sale) => [...returnApplications(sale), ...returnCorrections(sale)]);
  if (related.some((event) => event.appliedAt > at)) fail("A correction cannot predate the recorded return history.");
  const correction = eventFromPreview(preview, at);
  const next = withCorrection(state, preview.saleId, correction);
  validateReturnState(next);
  return { state: next, correction, alreadyApplied: false };
}
