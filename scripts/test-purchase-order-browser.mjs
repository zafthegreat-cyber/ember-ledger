import assert from "node:assert/strict";
import { filterOrderRows, orderBrowserRows, orderFilterOptions } from "../src/features/purchaseReceiving/orderBrowser.js";

const records = [
  { id: "draft-a", retailerLabel: "Target", externalOrderId: "TGT-100", status: "NEEDS_REVIEW", orderedAt: "2026-10-17", money: { grandTotal: { minorUnits: 1250, currency: "USD" } }, lineItems: [{ title: "Collector sleeves", sku: "SLEEVE-7" }] },
  { id: "draft-b", vendorName: "Walmart", externalOrderId: "WM-200", status: "CONFIRMED", lineItems: [{ title: "Sealed booster box" }] },
  { id: "draft-c", retailerLabel: "Target", externalOrderId: "TGT-300", status: "NEEDS_REVIEW", lineItems: [{ title: "Binder" }] },
];
const before = structuredClone(records);
const rows = orderBrowserRows(records, "draft");
assert.equal(rows.length, 3);
assert.equal(rows[0].record, records[0]);
assert.equal(rows[0].amount.minorUnits, 1250);
assert.equal(rows[0].date, "2026-10-17");
assert.equal(rows[0].statusLabel, "Needs review");
assert.equal(rows[1].title, "Walmart");
assert.deepEqual(filterOrderRows(rows, { query: "target sleeves" }).map((row) => row.id), ["draft-a"]);
assert.equal(filterOrderRows(rows, { query: "sleeve-7" }).length, 1);
assert.equal(filterOrderRows(rows, { query: "TGT-300" })[0].record, records[2]);
assert.equal(filterOrderRows(rows, { retailer: "Target" }).length, 2);
assert.equal(filterOrderRows(rows, { retailer: "Target", status: "CONFIRMED" }).length, 0);
assert.equal(filterOrderRows(rows, { query: "box", status: "CONFIRMED" }).length, 1);
assert.deepEqual(filterOrderRows(rows), rows);
assert.deepEqual(orderFilterOptions(rows).retailers, [{ value: "Target", label: "Target", count: 2 }, { value: "Walmart", label: "Walmart", count: 1 }]);
assert.equal(orderFilterOptions(rows).statuses.find((row) => row.value === "NEEDS_REVIEW").count, 2);
assert.deepEqual(records, before, "list presentation cannot change saved records");

const receipt = { sourceId: "email:sample", retailerLabel: "Target", orderId: "EMAIL-9", currency: "CAD", totalMinorUnits: 0, orderedAt: null, receivedAt: "2026-10-18T04:00:00Z", items: [{ description: "Sleeves", quantity: 1 }] };
const receiptRows = orderBrowserRows([receipt, { ...receipt, sourceId: "email:saved", savedStatus: "DRAFT_SAVED" }], "receipt");
assert.equal(receiptRows[0].id, receipt.sourceId);
assert.equal(receiptRows[0].amount.minorUnits, 0);
assert.equal(receiptRows[0].status, "REVIEW_NEEDED");
assert.equal(receiptRows[0].date, "", "message arrival date is never presented as an unknown purchase date");
assert.equal(filterOrderRows(receiptRows, { query: "sleeves email-9", status: "DRAFT_SAVED" }).length, 1);
assert.equal(orderBrowserRows([{ id: "unknown" }])[0].title, "Retailer not recorded");
assert.equal(orderBrowserRows([{ id: "inventory-1", productTitle: "Collector box", purchaseId: "purchase-9", condition: "SEALED" }], "inventory")[0].title, "Collector box");
assert.equal(orderBrowserRows([{ id: "purchase-1", status: "CONFIRMED", receivingStatus: "PARTIALLY_RECEIVED" }])[0].status, "PARTIALLY_RECEIVED");
assert.deepEqual(orderFilterOptions([]), { retailers: [], statuses: [] });
console.log("Purchase order browser: 25 assertions passed (search, combined filters, counts, amounts, fallback labels, receipts, and unchanged records).");
