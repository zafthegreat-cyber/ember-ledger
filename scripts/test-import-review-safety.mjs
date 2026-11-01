import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as safety from "../src/utils/importReviewSafety.mjs";
import { catalogIdentifiersForProduct, normalizeBarcodeValue } from "../src/utils/inventoryImportUtils.js";

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("App.jsx", app, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const functions = new Map();
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(ast)); ts.forEachChild(node, visit); }
visit(ast);
function actual(names, dependencies) {
  for (const name of names) assert.ok(functions.has(name), `Actual App handler ${name} exists`);
  return new Function(...Object.keys(dependencies), `${names.map(name => functions.get(name)).join("\n")}\nreturn {${names.join(",")}};`)(...Object.values(dependencies));
}
const row = (changes = {}) => ({ importedItemId: "row-1", itemName: "Example card", quantity: 2, destination: "Vault", costPaid: "", marketValue: "", msrp: "", purchaseDate: "", importStatus: "reviewed", needsReview: false, ...changes });

test("invalid quantities remain visible and cannot save", () => {
  for (const value of ["0", "-3", "2.5", "2x", "bad", "1e2", "9007199254740992"]) {
    assert.equal(safety.importQuantityDraft(value), value);
    assert.ok(safety.importRowIssues(row({ quantity: value })).some(issue => issue.field === "quantity"));
  }
  assert.equal(safety.importQuantityDraft(""), 1);
  assert.equal(safety.importQuantityDraft("003"), 3);
});
test("blank money stays unknown, zero stays zero, malformed amounts are rejected", () => {
  assert.equal(safety.importMoneyDraft(""), "");
  assert.equal(safety.importMoneyDraft(0), 0);
  assert.equal(safety.importMoneyDraft("$1,250.50"), 1250.5);
  for (const value of ["-4", "NaN", "1.234", "1,23", "1e3"]) assert.equal(safety.importRowIssues(row({ costPaid: value }))[0].field, "costPaid");
});
test("invalid calendar dates produce corrections without throwing", () => {
  for (const date of ["wrong", "2026-02-30", "2026-13-01", "2025-02-29"]) assert.equal(safety.importRowIssues(row({ purchaseDate: date }))[0].field, "purchaseDate");
  assert.equal(safety.importRowIssues(row({ purchaseDate: "2024-02-29" })).length, 0);
});
test("CSV preserves multiline notes, escaped quotes, BOM, and physical source lines", () => {
  const records = safety.parseImportRecords('\uFEFFName,Quantity,Notes\r\n"Example, card",2,"First line\nSecond ""quoted"" line"\r\nOther,1,Keep');
  assert.equal(records.length, 3);
  assert.deepEqual(records[1].cells, ["Example, card", "2", 'First line\nSecond "quoted" line']);
  assert.equal(records[2].lineNumber, 4);
  assert.equal(records[1].error, "");
});
test("TSV and pipe separators ignore quoted commas", () => {
  assert.deepEqual(safety.parseImportRecords('"Item, name"|Qty\nExample|2')[1].cells, ["Example", "2"]);
  assert.deepEqual(safety.parseImportRecords("Name\tQty\nExample\t2")[1].cells, ["Example", "2"]);
  assert.equal(safety.parseImportRecords('4" binder')[0].cells[0], '4" binder');
});
test("malformed CSV and bounded batches have actionable errors", () => {
  assert.match(safety.parseImportRecords('Name,Qty\n"Example,2')[1].error, /not closed/);
  assert.match(safety.parseImportRecords('Name,Qty\n"Example"oops,2')[1].error, /Unexpected text/);
  assert.throws(() => safety.parseImportRecords("x".repeat(2 * 1024 * 1024 + 1)), /2 MB/);
  assert.throws(() => safety.parseImportRecords(Array(5002).fill("Example").join("\n")), /5,000/);
});
test("column mapping prefers the specific alias and never reuses a field", () => {
  const fields = [
    { value: "itemName", aliases: ["name", "card", "item"] }, { value: "setName", aliases: ["set name", "set"] },
    { value: "marketValue", aliases: ["market value", "market price"] }, { value: "costPaid", aliases: ["price", "cost"] },
    { value: "cardNumber", aliases: ["card number"] }, { value: "grade", aliases: ["grade"] },
    { value: "gradingCompany", aliases: ["grading company"] },
  ];
  assert.deepEqual(safety.inferImportColumnFields(["Item name", "Set name", "Market price", "Cost", "Card number", "Grade", "Grading company", "Other name"], fields), { 0: "itemName", 1: "setName", 2: "marketValue", 3: "costPaid", 4: "cardNumber", 5: "grade", 6: "gradingCompany" });
  assert.equal(safety.isImportHeaderRecord(["Example card", "2"]), false);
});
test("duplicates compare all copy attributes and keep physical IDs separate", () => {
  const incoming = row({ setName: "Example set", cardNumber: "025/100", variant: "Holo", language: "en", condition: "Near mint" });
  const existing = { id: "physical-copy", name: "Example card", expansion: "Example set", cardNumber: "25/100", printing: "Holo", language: "English", conditionName: "Near mint", quantity: 4 };
  assert.equal(safety.sameImportCopy(incoming, existing), true);
  for (const changes of [{ printing: "Reverse holo" }, { language: "Japanese" }, { conditionName: "Played" }, { expansion: "Other set" }, { cardNumber: "26/100" }, { graded: true }, { grade: "10" }]) assert.equal(safety.sameImportCopy(incoming, { ...existing, ...changes }), false);
  assert.equal(safety.sameImportCopy({ ...incoming, catalogProductId: "catalog-A" }, { ...existing, catalogProductId: "catalog-B" }), false);
  assert.equal(safety.possibleImportDuplicate(incoming, existing), true);
});
test("reference files and unresolved catalog ambiguity cannot become inventory", () => {
  for (const sourceType of ["link", "pdf_reference", "spreadsheet_reference"]) assert.ok(safety.importRowIssues(row({ sourceType })).length);
  assert.ok(safety.importRowIssues(row({ referenceOnly: true, sourceType: "photo_reference" })).length);
  assert.ok(safety.importRowIssues(row({ identityAmbiguous: true })).length);
  assert.equal(safety.importRowIssues(row({ identityAmbiguous: true, manualIdentityConfirmed: true })).length, 0);
});
test("rejected-row CSV includes source and failure corrections and neutralizes formulas", () => {
  const result = safety.buildRejectedImportCsv([
    row({ itemName: "=HYPERLINK()", sourceLine: 8, quantity: -1, upcSku: "001234567890", originalText: 'Example,"private note"' }),
    row({ importedItemId: "failed-row", importStatus: "failed" }), row({ importedItemId: "done", importStatus: "imported", quantity: 0 }), row({ importedItemId: "skip", destination: "Skip" }),
  ], [{ rowId: "failed-row", error: "Save refused" }]);
  assert.equal(result.count, 2);
  assert.match(result.csv, /"8","'=HYPERLINK\(\)"/);
  assert.match(result.csv, /001234567890/);
  assert.match(result.csv, /Save refused/);
  assert.match(result.csv, /Cost paid USD/);
  assert.match(result.csv, /private note""/);
});
test("actual catalog handler requires a choice for shared barcodes or same-name printings", () => {
  const products = [{ id: "holo", name: "Example card", setName: "Example set", variant: "Holo", barcode: "001234567890" }, { id: "reverse", name: "Example card", setName: "Example set", variant: "Reverse holo", barcode: "001234567890" }];
  const handlers = actual(["normalizeImportIdentifier", "findCatalogMatchForImport"], { catalogProducts: products, catalogIdentifiersForProduct, normalizeBarcodeValue, importCatalogCandidateMatches: safety.importCatalogCandidateMatches, getBestCatalogMatches: () => [] });
  const ambiguous = handlers.findCatalogMatchForImport("Example card", "Example set", { upcSku: "001234567890" });
  assert.equal(ambiguous.match, null); assert.equal(ambiguous.identityAmbiguous, true); assert.equal(ambiguous.alternateMatches.length, 2);
  assert.equal(handlers.findCatalogMatchForImport("Example card", "Example set", { variant: "Holo" }).match.id, "holo");
  assert.equal(handlers.findCatalogMatchForImport("Example card", "Example set", { cardNumber: "99/100" }).match, null);
});
test("private import metadata survives the actual inventory mapper without a schema change", () => {
  const record = { setName: "Example set", cardNumber: "25/100", variant: "Holo", language: "Japanese", grade: "10", gradingCompany: "Example grader", notes: "Private binder\nTop shelf", importSourceType: "spreadsheet_csv", actionNotes: "Imported collection item" };
  const serialized = safety.withImportSavedDetails(record);
  assert.equal(safety.readImportSavedDetails(serialized).notes, record.notes);
  assert.equal((safety.withImportSavedDetails({ ...record, actionNotes: serialized }).match(/Code3 import details v1:/g) || []).length, 1);
  const { mapItem } = actual(["mapItem"], { readImportSavedDetails: safety.readImportSavedDetails, normalizeDestinationScopes: () => [], DEFAULT_PERSONAL_WORKSPACE_ID: "personal" });
  const reloaded = mapItem({ id: "saved", name: "Example card", action_notes: serialized, language: "Japanese", printing: "Holo" });
  assert.equal(reloaded.cardNumber, "25/100"); assert.equal(reloaded.grade, "10"); assert.equal(reloaded.gradingCompany, "Example grader"); assert.equal(reloaded.setName, "Example set"); assert.equal(reloaded.notes, record.notes);
  assert.equal(safety.sameImportCopy({ ...record, itemName: "Example card" }, reloaded), true);
  assert.deepEqual(safety.readImportSavedDetails('Code3 import details v1: {broken'), {});
});

function batchHarness(rows, { candidates = [], failFirstVault = false } = {}) {
  const state = { rows, items: [], calls: [], closed: false, failFirstVault };
  let nextId = 0;
  const pending = { current: false };
  const dependencies = () => ({
    importRows: state.rows, importSavePending: pending, importOptions: {}, importRowIssues: safety.importRowIssues,
    setImportRows: updater => { state.rows = updater(state.rows); }, setImportSaving: value => { state.saving = value; },
    setImportBatchMessage: message => { state.message = message; }, showAppMessage: message => { state.message = message; },
    defaultImportDestination: () => "Vault", findImportDuplicateCandidates: () => candidates,
    findImportDuplicate: () => null, applyImportedQuantityIncrease: () => assert.fail("Unexpected merge"),
    importedRowToItem: (source, destination) => ({ id: `record-${++nextId}`, sourceId: source.importedItemId, destination }),
    saveInventoryRecords: async records => {
      state.calls.push(records);
      const failures = records.filter(record => record.destination === "Vault" && state.failFirstVault).map(record => ({ rowId: record.id, itemName: "Example card", error: "Simulated failure" }));
      state.failFirstVault = false;
      return { saved: records.filter(record => !failures.some(failure => failure.rowId === record.id)), failures };
    },
    setItems: updater => { state.items = updater(state.items); }, makeId: () => "batch", setImportLastBatchResult: result => { state.result = result; },
    normalizeInventoryDestination: item => item.destination.toLowerCase(), setImportAssistantOpen: () => {}, closeFlowModal: () => { state.closed = true; }, setActiveTab: () => {}, addProductToTideTradrWatchlist: () => {},
  });
  return { state, pending, confirm: () => actual(["confirmInventoryImport"], dependencies()).confirmInventoryImport() };
}
test("actual batch retries only the failed destination and maps failures to the source row", async () => {
  const harness = batchHarness([row({ destination: "Both" })], { failFirstVault: true });
  await harness.confirm();
  assert.equal(harness.state.rows[0].importStatus, "failed");
  assert.deepEqual(harness.state.rows[0].completedDestinations, ["Forge"]);
  assert.equal(harness.state.result.failures[0].rowId, "row-1");
  await harness.confirm();
  assert.deepEqual(harness.state.calls[1].map(record => record.destination), ["Vault"]);
  assert.equal(harness.state.rows[0].importStatus, "imported");
  await harness.confirm(); assert.equal(harness.state.calls.length, 2);
});
test("actual batch blocks invalid rows and concurrent confirmation", async () => {
  const invalid = batchHarness([row({ quantity: -1 })]); await invalid.confirm(); assert.equal(invalid.state.calls.length, 0);
  const harness = batchHarness([row()]);
  await Promise.all([harness.confirm(), harness.confirm()]); assert.equal(harness.state.calls.length, 1); assert.equal(harness.pending.current, false);
});
test("actual batch refuses a quantity merge with an incompatible or unchosen copy", async () => {
  const harness = batchHarness([row({ duplicateAction: "increase_quantity" })], { candidates: [{ id: "different-printing" }] });
  await harness.confirm(); assert.equal(harness.state.calls.length, 0); assert.equal(harness.state.rows[0].importStatus, "failed"); assert.match(harness.state.result.failures[0].error, /Choose a matching existing copy/);
});
test("actual quantity update confirms the expected quantity before changing local state", async () => {
  const calls = [];
  let localWrites = 0, fail = false;
  const query = { update: patch => { calls.push(patch); return query; }, eq: (key, value) => { calls.push([key, value]); return query; }, select: () => query, single: async () => fail ? { error: {} } : { data: { quantity: 5 } } };
  const { applyImportedQuantityIncrease } = actual(["applyImportedQuantityIncrease"], { ensureWorkspaceEditor: () => true, activeWorkspace: { id: "workspace" }, BETA_LOCAL_MODE: false, user: { id: "user" }, supabase: { from: table => { assert.equal(table, "inventory_items"); return query; } }, setItems: () => { localWrites++; } });
  await applyImportedQuantityIncrease({ id: "copy", quantity: 3 }, row());
  assert.equal(calls[0].quantity, 5); assert.equal(Object.hasOwn(calls[0], "action_notes"), false); assert.equal(Object.hasOwn(calls[0], "notes"), false); assert.deepEqual(calls[2], ["quantity", 3]); assert.equal(localWrites, 1);
  fail = true; await assert.rejects(() => applyImportedQuantityIncrease({ id: "copy", quantity: 3 }, row()), /could not be confirmed/); assert.equal(localWrites, 1);
});
