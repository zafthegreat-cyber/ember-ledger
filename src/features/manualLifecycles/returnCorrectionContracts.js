import { canonicalStringify } from "../backup/canonicalJson.js";
import { applicationValues, exactSum, itemUnitCosts, returnApplications, returnCorrections } from "./returnLedger.js";

const fail = (message) => { throw new Error(message); };
const equal = (a, b) => canonicalStringify(a) === canonicalStringify(b);
const dispositions = ["Restock review", "Dispose", "No physical return"];
const proposalKeys = ["idempotencyKey", "refundMinor", "refundReference", "restockedQuantity", "disposition", "reason", "physicalReturnConfirmed", "inspection"];
const valueKeys = ["refundMinor", "refundReference", "restockedQuantity", "cogsReversalMinor", "unitIndexes", "disposition"];
const eventKeys = ["id", "format", "idempotencyKey", "returnId", "applicationId", "saleId", "inventoryItemId", "currency", "sequence", "afterSaleCount", "afterApplicationCount", "appliedAt", "reason", "inspection", "physicalReturnConfirmed", "before", "after", "refundDeltaMinor", "stockDelta", "cogsDeltaMinor", "addedUnitIndexes", "removedUnitIndexes"];
const objectWithKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every((key) => keys.includes(key));
const safeText = (value, label, required = false) => { if (typeof value !== "string" || value.length > 2000 || [...value].some((character) => { const code = character.charCodeAt(0); return code < 32 && ![9, 10, 13].includes(code); }) || (required && !value.trim())) fail(`${label} must be readable text.`); };

export function normalizeReturnCorrectionProposal(input) {
  if (!input || Object.keys(input).some((key) => !proposalKeys.includes(key))) fail("Unsupported return correction input.");
  const proposal = { idempotencyKey: input.idempotencyKey, refundMinor: input.refundMinor, refundReference: input.refundReference ?? "", restockedQuantity: input.restockedQuantity, disposition: input.disposition, reason: input.reason, physicalReturnConfirmed: input.physicalReturnConfirmed ?? false, inspection: input.inspection ?? "" };
  if (!/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,119}$/.test(proposal.idempotencyKey || "")) fail("A stable correction identity is required; use a fresh UUID for a new reviewed correction.");
  if (!Number.isSafeInteger(proposal.refundMinor) || proposal.refundMinor < 0 || proposal.refundMinor > 100000000) fail("Corrected refund must be nonnegative integer minor units within the supported range.");
  if (!Number.isSafeInteger(proposal.restockedQuantity) || proposal.restockedQuantity < 0 || proposal.restockedQuantity > 100000) fail("Corrected restock quantity must be a supported whole number.");
  if (!dispositions.includes(proposal.disposition) || (proposal.restockedQuantity > 0) !== (proposal.disposition === "Restock review")) fail("Choose Restock review for a positive available quantity, or a non-restock disposition for zero.");
  safeText(proposal.reason, "Correction reason", true); safeText(proposal.refundReference, "Manual correction reference", proposal.refundMinor > 0); safeText(proposal.inspection, "Inspection");
  if (typeof proposal.physicalReturnConfirmed !== "boolean") fail("Physical confirmation must be explicit.");
  return proposal;
}

export function correctionProposalFromEvent(event) {
  return { idempotencyKey: event.idempotencyKey, refundMinor: event.after.refundMinor, refundReference: event.after.refundReference, restockedQuantity: event.after.restockedQuantity, disposition: event.after.disposition, reason: event.reason, physicalReturnConfirmed: event.physicalReturnConfirmed, inspection: event.inspection };
}

function validateValues(values, application, costs) {
  if (!objectWithKeys(values, valueKeys) || !Number.isSafeInteger(values.refundMinor) || values.refundMinor < 0 || values.refundMinor > 100000000 || !Number.isSafeInteger(values.restockedQuantity) || values.restockedQuantity < 0 || values.restockedQuantity > application.quantity || !Array.isArray(values.unitIndexes)) fail("Saved correction targets are invalid.");
  const expected = application.returnedUnitIndexes.slice(0, values.restockedQuantity);
  if (!equal(expected, values.unitIndexes) || values.cogsReversalMinor !== exactSum(expected.map((unit) => costs[unit]))) fail("Correction targets do not preserve the original returned units and exact costs.");
  if (!dispositions.includes(values.disposition) || (values.restockedQuantity > 0) !== (values.disposition === "Restock review")) fail("Saved correction disposition does not match its available stock.");
  safeText(values.refundReference, "Saved manual refund reference", values.refundMinor > 0);
}

export function validateReturnCorrectionRecords(state) {
  const ids = new Set();
  for (const sale of state.sales || []) {
    if (sale.returnCorrections != null && !Array.isArray(sale.returnCorrections)) fail("Return correction history is unreadable and has been preserved.");
    const valuesByApplication = new Map(returnApplications(sale).map((event) => [event.id, applicationValues(event)]));
    for (const event of returnCorrections(sale).slice().sort((a, b) => a.sequence - b.sequence)) {
      if (!objectWithKeys(event, eventKeys) || event.format !== "CODE3_LOCAL_RETURN_CORRECTION_V1" || event.id !== `return-correction:${event.idempotencyKey}` || ids.has(event.id)) fail("Saved correction identity or shape is invalid.");
      ids.add(event.id);
      const application = returnApplications(sale).find((row) => row.id === event.applicationId);
      const item = (state.inventory || []).find((row) => row.id === event.inventoryItemId);
      if (!application || !item || event.saleId !== sale.id || event.inventoryItemId !== sale.inventoryItemId || event.returnId !== application.returnId || event.currency !== application.currency || event.currency !== (item.currency || "USD")) fail("Correction history lost its original sale, return, stock or currency authority.");
      if (![event.sequence, event.afterSaleCount, event.afterApplicationCount].every((value) => Number.isSafeInteger(value) && value > 0)) fail("Correction ordering watermarks are invalid.");
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(event.appliedAt) || new Date(event.appliedAt).toISOString() !== event.appliedAt || event.appliedAt < application.appliedAt) fail("Correction time cannot precede its application.");
      const costs = itemUnitCosts(item);
      validateValues(event.before, application, costs); validateValues(event.after, application, costs);
      if (!equal(valuesByApplication.get(application.id), event.before) || equal(event.before, event.after)) fail("Correction history must continue its exact previous target and make an explicit change.");
      const proposal = normalizeReturnCorrectionProposal(correctionProposalFromEvent(event));
      const added = event.after.unitIndexes.filter((unit) => !event.before.unitIndexes.includes(unit));
      const removed = event.before.unitIndexes.filter((unit) => !event.after.unitIndexes.includes(unit));
      if (!equal(added, event.addedUnitIndexes) || !equal(removed, event.removedUnitIndexes) || event.refundDeltaMinor !== exactSum([event.after.refundMinor, -event.before.refundMinor]) || event.stockDelta !== event.after.restockedQuantity - event.before.restockedQuantity || event.cogsDeltaMinor !== exactSum([event.after.cogsReversalMinor, -event.before.cogsReversalMinor])) fail("Correction signed effects do not match its reviewed before/after values.");
      if (event.refundDeltaMinor) safeText(proposal.refundReference, "Reference for the refund correction", true);
      if (added.length && (!proposal.physicalReturnConfirmed || !proposal.inspection.trim())) fail("Increasing returned stock requires a fresh physical inspection and explicit confirmation.");
      valuesByApplication.set(application.id, event.after);
    }
  }
}
