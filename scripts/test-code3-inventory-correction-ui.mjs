import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync(new URL("../src/features/purchaseReceiving/PurchaseReceivingPage.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../src/features/purchaseReceiving/purchase-receiving.css", import.meta.url), "utf8");
const service = fs.readFileSync(new URL("../src/features/purchaseReceiving/service.js", import.meta.url), "utf8");
let assertions = 0;
const has = (source, pattern, message) => { assert.match(source, pattern, message); assertions += 1; };
const lacks = (source, pattern, message) => { assert.doesNotMatch(source, pattern, message); assertions += 1; };

for (const copy of [
  "Corrections & Returns", "Review Correction or Return", "Review Inventory Correction", "Current State", "Proposed Change", "Downstream Effect",
  "Confirm Correction", "Confirm Return", "Inventory Correction Candidate != Inventory Mutation", "Refund != Return", "Refund != Inventory Removal",
  "Record Replacement Receiving", "Replacement Receiving != Inventory",
]) has(page, new RegExp(copy), `${copy} is explicit`);

has(page, /service\.previewInventoryCorrection/, "preview uses the dedicated non-authoritative boundary");
has(page, /service\.confirmInventoryCorrection/, "mutation uses the dedicated owner-confirmed boundary");
has(page, /expectedVersion: correctionCandidate\.expectedVersion/, "confirmation carries the reviewed version");
has(page, /if \(\[INVENTORY_CORRECTION_CATEGORIES\.CONDITION_CORRECTION, INVENTORY_CORRECTION_CATEGORIES\.DAMAGED_AFTER_RECEIVING\]\.includes\(category\)\)/, "condition-only fields are emitted only for condition categories");
has(page, /category === INVENTORY_CORRECTION_CATEGORIES\.ACQUISITION_COST_CORRECTION/, "cost input is emitted only for exact-cost correction");
has(page, /category === INVENTORY_CORRECTION_CATEGORIES\.REVERSAL_CORRECTION/, "reversal identity is emitted only for append-only reversal");
has(page, /actionInFlightRef\.current/, "same-turn duplicate submissions are synchronously blocked");
has(page, /disabled=\{busy \|\| !candidate\.eligible\}/, "blocked candidates cannot be confirmed");
has(page, /setCorrectionCandidate\(null\)/, "form changes invalidate the stale preview");
has(page, /Replacement items require a new Receiving event/, "replacement preserves the receiving boundary");
has(page, /never creates a product automatically/, "product correction has no product writer");
has(page, /applies to this entire current acquisition lot/, "whole-lot impact is disclosed");
has(page, /Existing product relationship/, "product correction selects an existing canonical relationship");
has(page, /Corrected total cost \(minor units\)/, "exact integer cost authority is explicit");
has(page, /Original Purchase, Receiving, creation, sale, and transfer history remains append-only/, "history preservation is explicit");

has(service, /function previewInventoryCorrection[\s\S]*assertOwner\(\);[\s\S]*inventoryCorrectionGateway\.preview/, "OWNER authorization precedes preview storage access");
has(service, /allowed = new Set\(\["expectedVersion", "proposal"\]\)/, "confirmation rejects extra browser authority fields");
has(service, /getTransferredQuantity: options\.getTransferredQuantity \|\| assertManagedInventoryHasNoTransferUsage/, "production correction service explicitly proves the schema-4 no-transfer invariant");
has(page, /service\.recordPurchaseEvent[\s\S]*PURCHASE_EVENT_TYPES\.REPLACEMENT_NOTED[\s\S]*service\.recordReceivingEvent/, "replacement workflow records scoped Purchase history before new physical Receiving");
has(page, /relatedEventId: adjustment\.id/, "replacement Receiving is bound to the exact return disposition");
has(page, /deriveEffectiveInventoryAdjustmentIds\(inventoryAdjustments\)/, "replacement actions use the effective append-only reversal chain");
has(page, /replacementReceivedSourceIds/, "replacement action closes only after physical replacement Receiving exists");
has(page, /existingEvent\?\.replacementReference/, "an interrupted noted replacement reuses its safe existing reference after refresh");

for (const forbidden of [/fetch\s*\(/, /WebSocket\s*\(/, /supabase/i, /upstash/i, /automaticReplacementInventory:\s*true/, /automaticProductCreation:\s*true/]) {
  lacks(page, forbidden, "correction UI has no remote, automatic, or provider path");
}
has(css, /inventory-correction-preview/, "impact preview has dedicated responsive layout");
has(css, /grid-template-columns:\s*repeat\(2/, "tabs collapse safely on mobile");
has(css, /@media \(max-width: 700px\)/, "mobile layout exists");
has(css, /min-height:\s*44px/, "interactive target floor is preserved");
has(css, /prefers-reduced-motion/, "reduced motion remains supported");
has(css, /:focus-visible/, "keyboard focus remains visible");

console.log(`Code 3 Inventory Correction UI: ${assertions} assertions passed.`);
