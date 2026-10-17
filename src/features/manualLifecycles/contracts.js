import { soldQuantityForInventory } from "../flipScout/inventory.js";
import { effectiveReturnApplication, returnApplications } from "./returnLedger.js";

// Linked operational records never create, split, or silently restock an owned item.
export const LIFECYCLE_TYPES = Object.freeze({
  binder: ["title", "pages", "slotsPerPage"],
  assignment: ["itemId", "unit", "binderId", "page", "slot"],
  setPlan: ["title", "setName", "variants"],
  wish: ["title", "setName", "collectorNumber", "variant", "status"],
  grading: ["itemId", "unit", "company", "submissionReference", "status", "costMinor", "grade", "certificate", "notes"],
  event: ["title", "source", "terms", "startsAt", "endsAt", "pickupBy", "location"],
  auctionLink: ["auctionId", "eventId", "lotNumber", "purchaseId", "pickupStatus"],
  visit: ["title", "storeReference", "date", "outcome", "mileageId", "purchaseId", "auctionId", "notes"],
  processing: ["itemId", "status", "storageLocation", "notes"],
  listing: ["itemId", "title", "channel", "quantity", "priceMinor", "status", "saleId"],
  shipment: ["saleId", "quantity", "carrier", "tracking", "status", "shippedAt", "notes"],
  saleReturn: ["saleId", "quantity", "status", "disposition", "inspection", "refundMinor", "refundReference", "notes"],
});

const ENUMS = {
  wish: { status: ["Wanted", "Matched", "Archived"] },
  grading: { status: ["Draft", "Submitted", "Received", "Completed", "Cancelled"] },
  auctionLink: { pickupStatus: ["Planned", "Ready", "Collected", "Cancelled"] },
  visit: { outcome: ["Planned", "Visited", "Purchased", "No purchase", "Cancelled"] },
  processing: { status: ["Unprocessed", "Identified", "Cleaned", "Photographed", "Ready", "Stored"] },
  listing: { status: ["Draft", "Active", "Reserved", "Sold", "Withdrawn"] },
  shipment: { status: ["Packed", "Shipped", "Delivered", "Cancelled"] },
  saleReturn: { status: ["Requested", "Received", "Inspected", "Closed"], disposition: ["Quarantine", "Restock review", "Dispose", "No physical return"] },
};
export const lifecycleOptions = (type, field) => ENUMS[type]?.[field] || [];
const FIXED_LINKS = { assignment: ["itemId", "unit"], grading: ["itemId", "unit"], auctionLink: ["auctionId", "eventId", "lotNumber"], processing: ["itemId"], listing: ["itemId"], shipment: ["saleId"], saleReturn: ["saleId", "quantity"] };
const TRANSITIONS = {
  grading: { Draft: ["Draft", "Submitted", "Cancelled"], Submitted: ["Submitted", "Received", "Cancelled"], Received: ["Received", "Completed", "Cancelled"], Completed: ["Completed"], Cancelled: ["Cancelled"] },
  shipment: { Packed: ["Packed", "Shipped", "Cancelled"], Shipped: ["Shipped", "Delivered"], Delivered: ["Delivered"], Cancelled: ["Cancelled"] },
  saleReturn: { Requested: ["Requested", "Received"], Received: ["Received", "Inspected"], Inspected: ["Inspected", "Closed"], Closed: ["Closed"] },
};
const INITIAL_STATUS = { grading: "Draft", shipment: "Packed", saleReturn: "Requested" };
const BASE_KEYS = ["id", "type", "recordVersion", "createdAt", "updatedAt", "history"];
const fail = (message) => { throw new Error(message); };
const json = (value) => JSON.stringify(value);
const text = (value, label, required = true, max = 2000) => {
  if (typeof value !== "string" || value.length > max || [...value].some((character) => character.charCodeAt(0) < 32 && ![9, 10, 13].includes(character.charCodeAt(0))) || (required && !value.trim())) fail(`${label} is required and must be readable text.`);
};
const integer = (value, label, min = 0, max = 100000000) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(`${label} must be a whole number between ${min} and ${max}.`);
};
const validDate = (value, label) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || new Date(value).toISOString() !== value) fail(`${label} must be a valid date and time.`);
};
const requireRecord = (rows, id, label) => rows.find((record) => record.id === id) || fail(`${label} is missing. Reload the current records.`);
const isCompleted = (sale) => !["draft", "cancelled"].includes(String(sale?.status || "").toLowerCase());
export const lifecycleRows = (state, type) => (state.manualLifecycles || []).filter((row) => !type || row.type === type);

export function minorUnitsFromInput(value) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(String(value))) fail("Enter a nonnegative amount with at most two decimal places.");
  const [whole, fraction = ""] = String(value).split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  integer(amount, "Amount", 0, 100000000);
  return amount;
}

export function validateLifecycleRecord(record, state) {
  if (!record || typeof record !== "object" || Array.isArray(record) || !LIFECYCLE_TYPES[record.type]) fail("Unsupported operational record.");
  const keys = [...BASE_KEYS, ...LIFECYCLE_TYPES[record.type]];
  if (Object.keys(record).some((key) => !keys.includes(key))) fail("Operational record contains unsupported fields.");
  text(record.id, "Record identity", true, 160);
  integer(record.recordVersion, "Record version", 1);
  validDate(record.createdAt, "Created time"); validDate(record.updatedAt, "Updated time");
  if (!Array.isArray(record.history) || !record.history.length || record.history.length > 2000) fail("Operational history is required.");
  for (const [index, entry] of record.history.entries()) {
    if (!entry || Object.keys(entry).some((key) => !["at", "version", "values"].includes(key))) fail("Invalid operational history.");
    validDate(entry.at, "History time"); integer(entry.version, "History version", 1);
    if (!entry.values || typeof entry.values !== "object" || Array.isArray(entry.values) || Object.keys(entry.values).some((key) => !LIFECYCLE_TYPES[record.type].includes(key))) fail("Invalid operational history values.");
    if (entry.version !== index + 1 || Object.keys(entry.values).length !== LIFECYCLE_TYPES[record.type].length) fail("Operational history must contain every revision and field.");
    for (const [field, value] of Object.entries(entry.values)) {
      if (["pages", "slotsPerPage", "unit", "page", "slot", "quantity", "priceMinor", "costMinor", "refundMinor"].includes(field)) integer(value, `Historical ${field}`);
      else text(value, `Historical ${field}`, false, field === "variants" ? 20000 : 2000);
    }
  }
  const projection = Object.fromEntries(LIFECYCLE_TYPES[record.type].map((key) => [key, record[key]]));
  if (record.history.length !== record.recordVersion || record.history.at(-1).version !== record.recordVersion || record.history.at(-1).at !== record.updatedAt || json(record.history.at(-1).values) !== json(projection)) fail("Operational record and history do not match.");
  if (record.history[0].at !== record.createdAt) fail("Operational history does not match its creation time.");
  for (const [field, options] of Object.entries(ENUMS[record.type] || {})) if (!options.includes(record[field])) fail(`Choose a valid ${field}.`);
  for (const field of LIFECYCLE_TYPES[record.type]) {
    if (!["pages", "slotsPerPage", "unit", "page", "slot", "quantity", "priceMinor", "costMinor", "refundMinor"].includes(field)) text(record[field], field, false, field === "variants" ? 20000 : 2000);
  }
  if (["binder", "setPlan", "wish", "event", "visit", "listing"].includes(record.type)) text(record.title, "Title");
  let item;
  if (record.itemId) item = requireRecord(state.inventory, record.itemId, "Owned item");
  if (["assignment", "grading", "processing", "listing"].includes(record.type) && !item) fail("Choose an owned item.");
  if (["assignment", "grading"].includes(record.type)) {
    const active = record.type === "assignment" ? Boolean(record.binderId) : !["Completed", "Cancelled"].includes(record.status);
    integer(record.unit, "Physical unit", 1, active ? Number(item.quantity) : 100000000);
  }
  if (record.type === "binder") { integer(record.pages, "Pages", 1, 500); integer(record.slotsPerPage, "Slots per page", 1, 36); }
  if (record.type === "assignment" && record.binderId) {
    const binder = requireRecord(lifecycleRows(state, "binder"), record.binderId, "Binder");
    integer(record.page, "Page", 1, binder.pages); integer(record.slot, "Slot", 1, binder.slotsPerPage);
    if (lifecycleRows(state, "assignment").some((other) => other.id !== record.id && other.binderId === record.binderId && other.page === record.page && other.slot === record.slot)) fail("That binder slot is occupied. Move or unassign its item first.");
  }
  if (record.type === "assignment" && lifecycleRows(state, "assignment").some((other) => other.id !== record.id && other.itemId === record.itemId && other.unit === record.unit)) fail("This physical unit already has an assignment. Edit its existing assignment.");
  if (["setPlan", "wish"].includes(record.type)) text(record.setName, "Set name");
  if (record.type === "setPlan") {
    const targets = variantTargets(record.variants);
    if (!targets.length || new Set(targets).size !== targets.length) fail("Add unique collector number | variant targets, one per line.");
  }
  if (record.type === "wish") text(record.collectorNumber, "Collector number");
  if (record.type === "grading") {
    integer(record.costMinor, "Grading cost");
    if (record.status !== "Draft" && record.status !== "Cancelled") { text(record.company, "Grading company"); text(record.submissionReference, "Submission reference"); }
    if (record.status === "Completed") text(record.grade, "Grade result");
    else if (record.grade || record.certificate) fail("Record the result only when grading is completed.");
    if (!["Completed", "Cancelled"].includes(record.status) && lifecycleRows(state, "grading").some((other) => other.id !== record.id && other.itemId === record.itemId && other.unit === record.unit && !["Completed", "Cancelled"].includes(other.status))) fail("This unit already has an active grading submission.");
  }
  if (record.type === "event") {
    text(record.source, "Source"); text(record.terms, "Source terms"); validDate(record.startsAt, "Start"); validDate(record.endsAt, "End");
    if (record.endsAt < record.startsAt) fail("The event must end after it starts.");
    if (record.pickupBy) { validDate(record.pickupBy, "Pickup deadline"); if (record.pickupBy < record.startsAt) fail("Pickup cannot precede the event."); }
  }
  if (record.type === "auctionLink") {
    requireRecord(state.auctions, record.auctionId, "Auction lot"); requireRecord(lifecycleRows(state, "event"), record.eventId, "Auction event"); text(record.lotNumber, "Lot number");
    if (lifecycleRows(state, "auctionLink").some((other) => other.id !== record.id && (other.auctionId === record.auctionId || (other.eventId === record.eventId && other.lotNumber === record.lotNumber)))) fail("This auction or event lot already has an identity link.");
    if (record.pickupStatus === "Collected" && !record.purchaseId) fail("Link the recorded purchase before marking this lot collected.");
  }
  if (record.purchaseId) requireRecord(state.purchases, record.purchaseId, "Purchase");
  if (record.mileageId) requireRecord(state.mileage, record.mileageId, "Mileage trip");
  if (record.type === "visit") {
    text(record.storeReference, "Store or source reference");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date) || new Date(`${record.date}T12:00:00Z`).toISOString().slice(0, 10) !== record.date) fail("Choose a valid visit date.");
    if (record.auctionId) requireRecord(state.auctions, record.auctionId, "Auction");
    if (record.outcome === "Purchased" && !record.purchaseId) fail("Link a purchase when the visit outcome is Purchased.");
  }
  if (record.type === "processing" && record.status === "Stored") text(record.storageLocation, "Storage location");
  if (record.type === "listing") {
    integer(record.quantity, "Listing quantity", 1, Math.max(1, Number(item.quantity))); integer(record.priceMinor, "Listing price"); text(record.channel, "Sales channel");
    if (record.saleId) {
      const sale = requireRecord(state.sales, record.saleId, "Sale");
      if (sale.inventoryItemId !== record.itemId || Number(sale.quantitySold) !== record.quantity || String(sale.status).toLowerCase() === "cancelled") fail("The linked sale must match this item and quantity.");
      if (lifecycleRows(state, "listing").some((other) => other.id !== record.id && other.saleId === record.saleId)) fail("This sale is already linked to another listing.");
    }
    if (record.status === "Sold" && (!record.saleId || !isCompleted(state.sales.find((sale) => sale.id === record.saleId)))) fail("Record and link the completed sale before marking a listing sold.");
  }
  if (["shipment", "saleReturn"].includes(record.type)) {
    const sale = requireRecord(state.sales, record.saleId, "Sale");
    if (!isCompleted(sale)) fail("Choose a completed sale.");
    integer(record.quantity, "Quantity", 1, Number(sale.quantitySold));
    const siblings = lifecycleRows(state, record.type).filter((other) => other.id !== record.id && other.saleId === record.saleId && other.status !== "Cancelled");
    if (record.status !== "Cancelled" && siblings.reduce((sum, other) => sum + other.quantity, record.quantity) > Number(sale.quantitySold)) fail("The linked quantity exceeds this sale.");
    if (record.type === "shipment" && ["Shipped", "Delivered"].includes(record.status)) { text(record.carrier, "Carrier"); text(record.tracking, "Tracking or handoff reference"); validDate(record.shippedAt, "Shipped time"); }
    if (record.type === "saleReturn") {
      integer(record.refundMinor, "Refund amount");
      if (["Inspected", "Closed"].includes(record.status)) text(record.inspection, "Inspection findings");
      else if (record.refundMinor || record.disposition !== "Quarantine") fail("Inspect the returned item before recording its disposition or refund.");
      if (record.refundMinor) text(record.refundReference, "Manual refund reference");
      const refundFor = (row) => { const application = returnApplications(sale).find((event) => event.returnId === row.id); return application ? effectiveReturnApplication(sale, application).refundMinor : row.refundMinor; };
      const totalRefund = siblings.reduce((sum, other) => sum + refundFor(other), refundFor(record));
      const paid = Math.max(0, Math.round((Number(sale.grossSalePrice || 0) + Number(sale.shippingChargedToBuyer || 0) - Number(sale.discounts || 0) - Number(sale.refunds || 0)) * 100));
      if (totalRefund > paid) fail("Return refunds exceed the sale's remaining recorded payment.");
    }
  }
  return record;
}

export function validateLifecycleTransition(current, next) {
  if (current.manualLifecycles != null && !Array.isArray(current.manualLifecycles)) fail("Operational records cannot be read safely.");
  if (!Array.isArray(next.manualLifecycles)) fail("Operational records must be preserved.");
  const oldRows = lifecycleRows(current); const rows = lifecycleRows(next);
  if (new Set(rows.map((row) => row.id)).size !== rows.length) fail("Duplicate operational identities.");
  for (const row of oldRows) if (!rows.some((nextRow) => nextRow.id === row.id)) fail("Operational history cannot be deleted.");
  for (const row of rows) {
    validateLifecycleRecord(row, next);
    const previous = oldRows.find((old) => old.id === row.id);
    if (!previous) {
      if (row.recordVersion !== 1 || (INITIAL_STATUS[row.type] && row.status !== INITIAL_STATUS[row.type])) fail("Start a new operational record at its first stage.");
      if (["assignment", "grading"].includes(row.type)) integer(row.unit, "Physical unit", 1, Number(next.inventory.find((item) => item.id === row.itemId)?.quantity));
      continue;
    }
    if (json(previous) === json(row)) continue;
    if (row.type !== previous.type || row.createdAt !== previous.createdAt || row.recordVersion !== previous.recordVersion + 1 || json(row.history.slice(0, -1)) !== json(previous.history)) fail("Operational history is append-only. Reload before saving.");
    for (const field of FIXED_LINKS[row.type] || []) if (row[field] !== previous[field]) fail("A saved physical identity or source link cannot be reassigned.");
    if (TRANSITIONS[row.type] && !TRANSITIONS[row.type][previous.status]?.includes(row.status)) fail("Complete each lifecycle stage in order.");
    if (row.type === "saleReturn" && (row.refundMinor < previous.refundMinor || (previous.status === "Closed" && json(row.history.at(-1).values) !== json(previous.history.at(-1).values)))) fail("Recorded refunds cannot be reduced and closed returns cannot be rewritten.");
  }
  // This runs inside the existing repository commit for every sale entry point.
  for (const item of next.inventory) {
    const listings = rows.filter((row) => row.type === "listing" && row.itemId === item.id);
    const reserved = listings.filter((row) => row.status === "Reserved" && !next.sales.some((sale) => sale.id === row.saleId && isCompleted(sale))).reduce((sum, row) => sum + row.quantity, 0);
    if (listings.length && soldQuantityForInventory(item.id, next.sales) + reserved > Number(item.quantity)) fail(reserved ? "This quantity is reserved. Link its sale draft or release the reservation before selling." : "Completed sales exceed this listed item's physical stock. Review its existing sales before saving.");
  }
}

export function buildLifecycleRecord(type, values, previous, { id, at }) {
  if (!LIFECYCLE_TYPES[type]) fail("Choose a supported workflow.");
  if (Object.keys(values).some((key) => !LIFECYCLE_TYPES[type].includes(key))) fail("Unsupported workflow values.");
  const projection = Object.fromEntries(LIFECYCLE_TYPES[type].map((key) => [key, values[key] ?? previous?.[key] ?? ""]));
  const recordVersion = (previous?.recordVersion || 0) + 1;
  return { id: previous?.id || id, type, recordVersion, createdAt: previous?.createdAt || at, updatedAt: at, ...projection, history: [...(previous?.history || []), { at, version: recordVersion, values: projection }] };
}

const normalized = (value) => String(value || "").trim().toLowerCase();
export const variantTargets = (value) => String(value || "").split(/\r?\n/).map(normalized).filter(Boolean).map((entry) => { const [number, variant = "standard", ...extra] = entry.split("|").map((part) => part.trim()); if (!number || !variant || extra.length) fail("Use collector number | variant, one target per line."); return `${number}|${variant}`; });
export function matchCollectionTarget(items, target, sales = []) {
  return items.filter((item) => Number(item.quantity ?? 1) - soldQuantityForInventory(item.id, sales) > 0 && normalized(item.setName) === normalized(target.setName) && normalized(item.cardNumber || item.collectorNumber) === normalized(target.collectorNumber) && normalized(item.variant || "standard") === normalized(target.variant || "standard"));
}
export function setCoverage(items, plan, sales = []) {
  const targets = variantTargets(plan.variants);
  const matches = targets.map((key) => { const [collectorNumber, variant] = key.split("|"); return { key, matches: matchCollectionTarget(items, { setName: plan.setName, collectorNumber, variant }, sales) }; });
  return { total: targets.length, owned: matches.filter((row) => row.matches.length).length, targets: matches };
}
export function binderPreview(state, binder, page) {
  integer(page, "Page", 1, binder.pages);
  return Array.from({ length: binder.slotsPerPage }, (_, index) => {
    const assignment = lifecycleRows(state, "assignment").find((row) => row.binderId === binder.id && row.page === page && row.slot === index + 1);
    return { slot: index + 1, assignment, item: assignment ? state.inventory.find((item) => item.id === assignment.itemId) : null };
  });
}
export function eventCalendar(event) {
  const escape = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
  const stamp = (value) => value.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const fold = (line) => { let length = 0; let result = ""; for (const character of line) { const bytes = new TextEncoder().encode(character).length; if (length + bytes > 75) { result += "\r\n "; length = 1; } result += character; length += bytes; } return result; };
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Code 3 TCG//Manual Events//EN", "BEGIN:VEVENT", `UID:${escape(event.id)}@code3tcg.local`, `DTSTAMP:${stamp(event.updatedAt)}`, `DTSTART:${stamp(event.startsAt)}`, `DTEND:${stamp(event.endsAt)}`, `SUMMARY:${escape(event.title)}`, `LOCATION:${escape(event.location)}`, `DESCRIPTION:${escape(`${event.source}\n${event.terms}${event.pickupBy ? `\nPickup by ${event.pickupBy}` : ""}`)}`, "END:VEVENT", "END:VCALENDAR", ""].map(fold).join("\r\n");
}
