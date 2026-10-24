import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformSync } from "esbuild";

// Render the actual deferred view with inert state and storage boundaries.
const require = createRequire(import.meta.url);
const code = transformSync(readFileSync("src/features/deferredViews/ScoutSubmitContent.jsx", "utf8"), { loader: "jsx", format: "cjs", jsx: "automatic" }).code;
const module = { exports: {} };
const viewRequire = (id) => id === "react" ? { ...React, useRef: () => ({ current: null }), useEffect: () => {} }
  : id.endsWith(".css") ? {}
    : id.endsWith("PrivateReceipt.jsx") ? { PrivateStorageImage: ({ authorizePrivate, ...props }) => React.createElement("img", { ...props, "data-private-proof": authorizePrivate ? "true" : undefined }) }
      : id.endsWith("StockScreenshotImport.jsx") ? () => React.createElement("aside", { "data-screenshot-review": true })
        : require(id);
new Function("require", "module", "exports", code)(viewRequire, module, module.exports);
const Report = module.exports.default;
const noop = () => {};
const store = Object.freeze({ id: "synthetic-store", name: "Fixture Card Shop", retailer: "Independent", city: "Fixture City", address: "1 Fixture Way" });
const draft = Object.freeze({ storeSearch: "", productName: "", productCategory: "Pokemon TCG", reportType: "stock_on_shelf", proofType: "manual", photoUrl: "", proofText: "", note: "", quantity: "", price: "", stockLeft: "", visibility: "private" });
const scope = {
  SCOUT_PRODUCT_CATEGORY_OPTIONS: ["Pokemon TCG", "Other"], SCOUT_QUICK_PROOF_TYPES: [{ value: "manual", label: "I saw this" }], SCOUT_REPORT_VISIBILITY_OPTIONS: [{ value: "private", label: "Only me", helper: "Keep this report private." }, { value: "public", label: "Community", helper: "Share the report with collectors." }],
  SCOUT_QUICK_STOCK_LEFT_OPTIONS: [], MIN_SCOUT_POINTS_FOR_GUESS: 10, scoutGuessPoints: 0,
  getScoutQuickStores: () => [], quickScoutReportTypeMeta: () => ({ isGuess: false, label: "Stock seen" }),
  resolveQuickScoutStoreSelection: () => ({ mode: "known", valid: true, store, storeName: store.name, retailer: store.retailer }),
  scoutActiveAreaText: () => "", locationSettings: {}, parseManualLocationCoordinates: () => null,
  quickScoutReportForm: draft, catalogProducts: [], getCatalogPickerResults: () => [],
  getScoutWizardSteps: () => [{ key: "where", label: "Store" }, { key: "details", label: "What you saw" }, { key: "review", label: "Review" }],
  quickScoutReportStep: "where", scoutWizardStepError: () => "", quickScoutConfidenceBadge: () => ({ label: "Unverified", helper: "Reported by a collector." }),
  validateScoutVisitDateTime: () => ({ ok: true }), quickScoutHasMeaningfulReportDetail: () => true,
  quickScoutProofLabel: () => "I saw this", quickScoutStockLeftLabel: () => "", quickScoutDateLabel: () => "Today, 10:00 AM",
  scoutVisibilityOptionLabel: (value) => value, quickScoutStoreNeedsReviewConfirmation: () => false,
  getScoutStoreDisplayName: (value) => value.name, getScoutQuickRetailer: (value) => value.retailer, getScoutQuickStoreZip: () => "",
  scoutStoreAliasDisplayValues: () => [], quickScoutVisitDateTimeValue: () => "2026-10-19T10:00", quickScoutStoreHasHistory: () => false,
  quickScoutWizardTouchRef: { current: 0 }, updateQuickScoutReportForm: noop, setQuickScoutReportForm: noop,
  setQuickScoutReportMessage: noop, setQuickScoutReportStep: noop, submitQuickScoutReport: noop,
  catalogImage: () => "", closeFlowModal: noop,
};
const tree = (overrides = {}) => Report({ scope: { ...scope, ...overrides } });
const render = (overrides) => renderToStaticMarkup(tree(overrides));
const walk = (node, predicate) => {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  return React.Children.toArray(node.props?.children).map((child) => walk(child, predicate)).find(Boolean) || null;
};
const events = [];
const eventScope = { setQuickScoutReportStep: (step) => events.push(["step", step]), setQuickScoutReportMessage: (message) => events.push(["message", message]), submitQuickScoutReport: () => events.push(["save"]) };
const submit = (step, overrides = {}) => {
  events.length = 0;
  const form = tree({ ...eventScope, quickScoutReportStep: step, ...overrides });
  let prevented = false;
  form.props.onSubmit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  return [...events];
};

assert.deepEqual(submit("where"), [["message", ""], ["step", "details"]], "Enter in the store step advances, never saves");
assert.deepEqual(submit("details"), [["message", ""], ["step", "review"]], "Enter in product details reaches explicit review");
assert.deepEqual(submit("review"), [["save"]], "Only review delegates to the existing save handler");
assert.deepEqual(submit("review", { quickScoutReportSubmitting: true }), [], "Repeated Enter while saving cannot delegate a duplicate save");
const previousAnimationFrame = globalThis.requestAnimationFrame;
globalThis.requestAnimationFrame = (callback) => callback();
try {
  assert.deepEqual(submit("where", { scoutWizardStepError: () => "Choose the exact store." }), [["message", "Choose the exact store."]], "Authoritative validation stops invalid advance");
} finally {
  if (previousAnimationFrame) globalThis.requestAnimationFrame = previousAnimationFrame;
  else delete globalThis.requestAnimationFrame;
}

assert.match(render({}), /data-screenshot-review/, "Screenshot import remains available at the store step");
assert.match(render({}), /Step 1 of 3/);
const detailsTree = tree({ quickScoutReportStep: "details" });
const context = walk(detailsTree, (node) => node.props?.className === "stock-report-draft-context");
assert(context, "The selected store and observation time remain visible while describing stock");
assert.match(render({ quickScoutReportStep: "details" }), /Fixture Card Shop/);
const optional = walk(detailsTree, (node) => node.props?.className === "scout-report-disclosure stock-report-extra-disclosure");
assert.equal(optional.props.open, undefined, "Price and quantity stay optional and collapsed on a basic draft");
const privateDraft = Object.freeze({ ...draft, note: "Shelf by customer service", photoUrl: "/synthetic-proof.png", screenshotImportReviewed: true, screenshotSourcePlatform: "discord" });
const before = JSON.stringify(privateDraft);
const review = tree({ quickScoutReportStep: "review", quickScoutReportForm: privateDraft });
const reviewMarkup = renderToStaticMarkup(review);
assert.match(reviewMarkup, /Report photo to review before saving/);
assert.match(reviewMarkup, /data-private-proof="true"/, "The report proof preview opts into current-account authorization");
assert.match(reviewMarkup, /faces, addresses, or personal information/);
assert.match(reviewMarkup, /Shelf by customer service/);
assert.match(reviewMarkup, /From a community screenshot · needs review/);
assert.match(reviewMarkup, /original image is not attached/);
const sharing = walk(review, (node) => node.type === "select" && node.props["aria-label"] === "Who can see this report");
assert.equal(sharing.props.value, "private", "Review keeps the user's existing sharing choice");
assert.equal(JSON.stringify(privateDraft), before, "Rendering guidance never mutates report data");
assert.equal(events.some(([type]) => type === "save"), false, "Rendering and validation never save a report");
console.log("Free stock report guidance checks passed: valid navigation, explicit review, duplicate-submit guard, visible privacy choice, proof review, and unchanged draft.");
