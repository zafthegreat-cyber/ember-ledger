import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../src/features/purchaseReceiving/PurchaseReceivingPage.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/features/purchaseReceiving/purchase-receiving.css", import.meta.url), "utf8");
let assertions = 0;
function has(source, pattern, message) { assert.match(source, pattern, message); assertions += 1; }
function lacks(source, pattern, message) { assert.doesNotMatch(source, pattern, message); assertions += 1; }

has(page, /data-page="purchase-receiving"/, "page has stable QA identity");
for (const state of ["loading", "sign-in", "required", "authorized"]) {
  has(page, new RegExp(`data-owner-gate="${state}"`), `owner gate exposes ${state} state`);
}
has(page, /session\.status === OWNER_SESSION_STATES\.AUTHORIZED/, "owner authorization is derived from canonical session state");
has(page, /if \(!authorized\)[\s\S]*setService\(null\)[\s\S]*setSnapshot\(EMPTY_SNAPSHOT\)/, "downgrade clears service and protected state before rendering");
has(page, /createPurchaseReceivingService\(\{ isOwnerAuthorized:/, "service receives a fresh owner-authority callback");
has(page, /data-owner-gate="required"[\s\S]*No Purchase records were loaded/, "unauthorized UI states disclose no purchase records");

for (const [key, label] of [["drafts", "Drafts"], ["purchases", "Purchases"], ["receiving", "Receiving"]]) {
  has(page, new RegExp(`key: "${key}", label: "${label}"`), `${label} workflow section exists`);
}
for (const label of ["Correct", "Reject", "Confirm Purchase", "Receive Items", "Record Receiving", "Preview Inventory Handoff", "Inventory Handoff Preview"]) {
  has(page, new RegExp(label), `${label} owner-review affordance exists`);
}
for (const invariant of ["Order Candidate != Purchase", "Checkout Evidence != Purchase", "Purchase Draft != Purchase", "Receiving != Inventory"]) {
  has(page, new RegExp(invariant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${invariant} is explicit in the UI`);
}
has(page, /data-inventory-writer="false"/, "UI identifies that inventory writing is unavailable");
has(page, /Inventory was not created/, "receiving success copy remains non-mutating");
has(page, /Delivery evidence alone does not prove receipt/, "delivery is not treated as physical receiving");
has(page, /Original evidence remains in history/, "correction copy preserves source evidence");
has(page, /No Purchase was created/, "rejection copy is explicit");
has(page, /Legacy compatibility/, "existing legacy Purchase records remain separate");

for (const forbidden of [
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket\s*\(/,
  /REMOTE_ACTIVE/,
  /supabase/i,
  /upstash/i,
  /createInventory\s*\(/,
  /receiveInventory\s*\(/,
  /automaticPurchase/i,
]) lacks(page, forbidden, "Purchase/Receiving page has no network, remote-authority, or inventory writer path");

has(css, /min-width:\s*0/, "layout permits grid children to shrink");
has(css, /min-height:\s*44px/, "interactive targets meet the mobile target floor");
has(css, /@media \(max-width:\s*700px\)/, "compact responsive layout is present");
has(css, /grid-template-columns:\s*1fr/, "mobile forms collapse to one column");
has(css, /overflow-wrap:\s*anywhere/, "long identifiers cannot force horizontal overflow");
has(css, /env\(safe-area-inset-bottom/, "safe-area bottom padding is preserved");
has(css, /:focus-visible/, "visible keyboard focus exists");
has(css, /prefers-reduced-motion:\s*reduce/, "reduced motion is respected");
has(css, /transition:\s*none\s*!important/, "reduced-motion transitions are disabled");

console.log(`Code 3 Purchase/Receiving UI contract: ${assertions} assertions passed.`);
