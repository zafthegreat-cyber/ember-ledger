const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const espree = require("espree");
const { ESLint } = require("eslint");

const root = path.resolve(__dirname, "..");
const file = path.join(root, "src/pages/Scout.jsx");
const output = path.join(root, "artifacts/qa/release-readiness/scout-lint");
const source = fs.readFileSync(file, "utf8");
const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
const functions = new Map();
function visit(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration") functions.set(node.id.name, node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit); else if (value?.type) visit(value);
  }
}
visit(ast);
const body = functions.get("Scout").body.body;
const text = (node) => source.slice(...node.range);
const declaration = (name) => body.find((node) => node.type === "VariableDeclaration" && node.declarations.some((entry) => entry.id.name === name));
const guard = (phrase) => body.find((node) => node.type === "IfStatement" && text(node.test).includes(phrase));
const targetCode = [text(functions.get("applyTargetSubTab")), text(declaration("targetToken")), text(declaration("targetReport")), text(guard("handledTargetSubTab.token"))].join("\n");
const copy = (value) => JSON.parse(JSON.stringify(value));
const results = [];
async function check(name, run) { await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
function harness() {
  const updates = [], edits = [];
  const ctx = vm.createContext({
    targetSubTabKey: "stores", targetSubTabId: "handoff-1", targetSubTabAction: "", targetSubTabProductId: "", targetSubTabProductName: "", targetSubTabReportId: "", targetSubTabStoreId: "Exact-Store-ID", targetSubTabProductSnapshot: null,
    handledTargetSubTab: { token: "", reportPending: false }, allReports: [], selectedStoreId: "", scoutSubTab: "overview", storeDirectoryView: "landing",
    reportForm: { note: "Retain my existing note", stockStatus: "in_stock" }, reportInputMethod: "Manual", reportProductSearch: "", canSubmitLegacyScoutGuess: false, scoutGuessPoints: 0,
    DROP_RADAR_GUESS_LOCKED_MESSAGE: "Guess is locked.", MIN_SCOUT_POINTS_FOR_GUESS: 10,
    findStoreRecord: (id) => id.toLowerCase() === "exact-store-id" ? { id: "Exact-Store-ID" } : null,
    startEditingReport: (report) => { edits.push(copy(report)); ctx.editingReportId = report.id; },
    previousStoreFilterKey: "old", storeFilterKey: "old", storePage: 4,
    selectedMapStoreId: "Exact-Store-ID", scoutOverviewMapRows: [{ id: "Exact-Store-ID" }],
    editStoreSource: null, selectedStore: null, editStoreForm: { name: "Draft name" },
    normalizeStoreExpansionFields: (value) => value, createBlankStoreForm: () => ({ name: "", nickname: "" }),
    normalizeStateLabel: (value) => value, normalizeVirginiaRegion: (value) => value, getStoreGroup: (value) => value.storeGroup || "Other",
    VIRGINIA_STORE_STATE: "Virginia", DEFAULT_VIRGINIA_REGION: "Hampton Roads / 757",
    useMemo: (run) => run(), scoutNow: Date.parse("2026-09-15T12:00:00Z"), tidepoolReports: [], filteredTidepoolEvents: [],
  });
  for (const key of ["handledTargetSubTab", "selectedStoreId", "scoutSubTab", "storeDirectoryView", "missingStoreModalOpen", "reportForm", "reportProductSearch", "reportInputMethod", "error", "previousStoreFilterKey", "storePage", "selectedMapStoreId", "editStoreSource", "editStoreForm", "scoutNow"]) {
    ctx[`set${key[0].toUpperCase()}${key.slice(1)}`] = (value) => { ctx[key] = typeof value === "function" ? value(ctx[key]) : value; updates.push(key); };
  }
  vm.runInContext(text(functions.get("makeBlankReportItem")) + "\n" + text(functions.get("openStoreDetail")), ctx);
  const run = (code) => vm.runInContext(`(() => { ${code} })()`, ctx);
  return { ctx, updates, edits, run, handoff: () => run(targetCode) };
}

async function main() {
  await check("Scout passes the configured lint rules without errors or warnings", async () => {
    const lint = await new ESLint({ cwd: root }).lintFiles([file]);
    assert.equal(lint[0].errorCount, 0); assert.equal(lint[0].warningCount, 0);
    fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, "lint-final.json"), JSON.stringify(lint, null, 2));
  });
  await check("new store handoff resolves exact ID once and preserves subsequent user navigation", () => {
    const h = harness(); h.ctx.targetSubTabStoreId = "exact-store-id"; h.handoff();
    assert.equal(h.ctx.selectedStoreId, "Exact-Store-ID"); assert.equal(h.ctx.storeDirectoryView, "detail"); assert.equal(h.ctx.scoutSubTab, "stores");
    h.ctx.scoutSubTab = "overview"; const count = h.updates.length; h.handoff();
    assert.equal(h.updates.length, count); assert.equal(h.ctx.scoutSubTab, "overview");
    h.ctx.targetSubTabId = "handoff-2"; h.handoff(); assert.equal(h.ctx.scoutSubTab, "stores");
  });
  await check("unknown store handoff keeps its requested exact ID for the unavailable view", () => {
    const h = harness(); h.ctx.targetSubTabStoreId = "Unknown-Exact-ID"; h.handoff();
    assert.equal(h.ctx.selectedStoreId, "Unknown-Exact-ID"); assert.equal(h.ctx.storeDirectoryView, "detail");
  });
  await check("missing-store handoff opens its existing dialog and directory landing", () => {
    const h = harness(); h.ctx.targetSubTabStoreId = ""; h.ctx.targetSubTabAction = "missingStore"; h.handoff();
    assert.equal(h.ctx.missingStoreModalOpen, true); assert.equal(h.ctx.storeDirectoryView, "landing");
  });
  await check("report edit waits for loaded data without a render loop or draft reset, then applies once", () => {
    const h = harness(); Object.assign(h.ctx, { targetSubTabKey: "reports", targetSubTabAction: "editReport", targetSubTabReportId: "Exact-Report-ID" });
    h.handoff(); assert.equal(h.ctx.scoutSubTab, "reports"); assert.equal(h.ctx.handledTargetSubTab.reportPending, true); assert.equal(h.edits.length, 0);
    const count = h.updates.length; h.handoff(); assert.equal(h.updates.length, count); assert.equal(h.ctx.reportForm.note, "Retain my existing note");
    h.ctx.allReports = [{ id: "Exact-Report-ID", storeId: "Report-Owned-Store", note: "Original report" }]; h.handoff();
    assert.equal(h.ctx.selectedStoreId, "Report-Owned-Store"); assert.equal(h.edits.length, 1); assert.equal(h.ctx.handledTargetSubTab.reportPending, false);
    h.ctx.allReports = [...h.ctx.allReports, { id: "unrelated" }]; h.ctx.reportForm.note = "Now editing"; h.handoff();
    assert.equal(h.edits.length, 1); assert.equal(h.ctx.reportForm.note, "Now editing");
  });
  await check("a newer handoff supersedes a pending old report edit", () => {
    const h = harness(); Object.assign(h.ctx, { targetSubTabKey: "reports", targetSubTabAction: "editReport", targetSubTabReportId: "old" }); h.handoff();
    Object.assign(h.ctx, { targetSubTabKey: "stores", targetSubTabAction: "", targetSubTabId: "new" }); h.handoff();
    h.ctx.allReports = [{ id: "old", storeId: "old-store" }]; h.handoff(); assert.equal(h.edits.length, 0); assert.equal(h.ctx.scoutSubTab, "stores");
  });
  await check("removing and reissuing a consumed target does not replay it; a new handoff ID does", () => {
    const h = harness(); h.handoff(); h.ctx.scoutSubTab = "overview";
    h.ctx.targetSubTabKey = undefined; const count = h.updates.length; h.handoff(); assert.equal(h.updates.length, count);
    h.ctx.targetSubTabKey = "stores"; h.handoff(); assert.equal(h.ctx.scoutSubTab, "overview");
    h.ctx.targetSubTabId = "reissued-2"; h.handoff(); assert.equal(h.ctx.scoutSubTab, "stores");
  });
  await check("changing pending report IDs ignores old data and edits only the latest exact report", () => {
    const h = harness(); Object.assign(h.ctx, { targetSubTabKey: "reports", targetSubTabAction: "editReport", targetSubTabReportId: "old" }); h.handoff();
    h.ctx.targetSubTabReportId = "new"; h.handoff(); h.ctx.allReports = [{ id: "old", storeId: "old-store" }]; h.handoff(); assert.equal(h.edits.length, 0);
    h.ctx.allReports.push({ id: "new", storeId: "new-store" }); h.handoff(); assert.equal(h.edits.length, 1); assert.equal(h.edits[0].id, "new"); assert.equal(h.ctx.selectedStoreId, "new-store");
  });
  for (const productId of ["catalog-exact", ""]) await check(`product handoff preserves ${productId ? "catalog snapshot" : "manual entry"} and unrelated form content`, () => {
    const h = harness(); Object.assign(h.ctx, { targetSubTabKey: "whatDidISee", targetSubTabAction: "productSighting", targetSubTabProductId: productId, targetSubTabProductName: "Synthetic pack", targetSubTabProductSnapshot: productId ? { id: productId, name: "Synthetic pack" } : null });
    h.handoff(); assert.equal(h.ctx.scoutSubTab, "reports"); assert.equal(h.ctx.reportForm.note, "Retain my existing note"); assert.equal(h.ctx.reportForm.manualItemEntry, !productId);
    assert.equal(h.ctx.reportForm.itemsSeen[0].productId, productId); assert.equal(h.ctx.reportForm.itemsSeen[0].productName, "Synthetic pack");
    assert.deepEqual(copy(h.ctx.reportForm.catalogProductSnapshot), productId ? { id: productId, name: "Synthetic pack" } : null);
    const rowId = h.ctx.reportForm.itemsSeen[0].rowId; h.handoff(); assert.equal(h.ctx.reportForm.itemsSeen[0].rowId, rowId);
  });
  await check("correction, import and guess handoffs retain their original workflow and eligibility", () => {
    const h = harness(); h.ctx.targetSubTabKey = "reports";
    h.ctx.targetSubTabAction = "storeCorrection"; h.handoff(); assert.equal(h.ctx.reportForm.reportType, "Store Correction");
    h.ctx.targetSubTabAction = "importIntel"; h.handoff(); assert.equal(h.ctx.reportInputMethod, "Import Intel");
    h.ctx.targetSubTabAction = "addGuess"; h.handoff(); assert.match(h.ctx.error, /Guess is locked/); assert.equal(h.ctx.reportForm.reportType, "Store Correction");
    h.ctx.canSubmitLegacyScoutGuess = true; h.ctx.scoutGuessPoints = 10; h.ctx.targetSubTabId = "new-guess"; h.handoff();
    assert.equal(h.ctx.reportInputMethod, "Manual"); assert.equal(h.ctx.reportForm.reportType, "Restock Pattern Suggestion"); assert.equal(h.ctx.reportForm.visibility, "private"); assert.equal(h.ctx.reportForm.stockStatus, "in_stock");
  });
  await check("filter changes reset pagination once; unchanged filters retain the user's page", () => {
    const h = harness(), code = text(guard("previousStoreFilterKey")); h.run(code); assert.equal(h.ctx.storePage, 4);
    h.ctx.storeFilterKey = "new"; h.run(code); assert.equal(h.ctx.storePage, 1);
    h.ctx.storePage = 3; h.run(code); assert.equal(h.ctx.storePage, 3);
    h.ctx.storeFilterKey = "old"; h.run(code); assert.equal(h.ctx.storePage, 1);
  });
  await check("selected-store draft follows a different record but does not reset unsaved typing", () => {
    const h = harness(), code = text(guard("editStoreSource"));
    h.ctx.selectedStore = { id: "A", name: "Store A", city: "Norfolk", active: true }; h.run(code); assert.equal(h.ctx.editStoreForm.name, "Store A");
    h.ctx.editStoreForm.name = "My unsaved edit"; h.run(code); assert.equal(h.ctx.editStoreForm.name, "My unsaved edit");
    h.ctx.selectedStore = { id: "B", name: "Store B", city: "Richmond", active: false }; h.run(code);
    assert.equal(h.ctx.editStoreForm.name, "Store B"); assert.equal(h.ctx.editStoreForm.city, "Richmond"); assert.equal(h.ctx.editStoreForm.active, false);
  });
  await check("map selection stays when present and clears once when filtering removes it", () => {
    const h = harness(), code = text(guard("selectedMapStoreId &&")); h.run(code); assert.equal(h.ctx.selectedMapStoreId, "Exact-Store-ID");
    h.ctx.scoutOverviewMapRows = []; h.run(code); assert.equal(h.ctx.selectedMapStoreId, ""); const count = h.updates.length; h.run(code); assert.equal(h.updates.length, count);
  });
  await check("clock subscription updates outside render and releases its interval on unmount", () => {
    const h = harness(); let callback, delay, cleared;
    h.ctx.window = { setInterval: (run, ms) => { callback = run; delay = ms; return 42; }, clearInterval: (id) => { cleared = id; } };
    const effect = body.find((node) => node.type === "ExpressionStatement" && node.expression.callee?.name === "useEffect" && text(node).includes("setScoutNow"));
    const cleanup = h.run(`return (${text(effect.expression.arguments[0])})();`);
    assert.equal(delay, 60000); const old = h.ctx.scoutNow; callback(); assert.ok(h.ctx.scoutNow >= old); cleanup(); assert.equal(cleared, 42);
  });
  await check("expiry and event urgency use the subscribed clock without changing score formulas", () => {
    const h = harness(); h.ctx.tidepoolReports = [{ reportType: "Restock sighting", reportTime: "2026-09-15T05:00:00Z", verificationStatus: "pending", confidenceScore: 50 }, { reportType: "Restock sighting", reportTime: "2026-09-15T05:00:00Z", verificationStatus: "verified", confidenceScore: 50 }];
    const rows = h.run(`${text(declaration("enrichedTidepoolReports"))} return enrichedTidepoolReports;`);
    assert.equal(rows[0].computedStatus, "expired"); assert.equal(rows[1].computedStatus, "verified"); assert.equal(rows[1].weightedScore, 70);
    h.ctx.filteredTidepoolEvents = [{ id: "event", eventTitle: "Synthetic event", startDate: "2026-09-17" }];
    const events = h.run(`${text(declaration("scoutOverviewEventRows"))} return scoutOverviewEventRows;`);
    assert.equal(events[0].urgency, "live"); assert.equal(events[0].label, "2d");
  });
  fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, "hook-results.json"), JSON.stringify({ count: results.length, results, scope: "actual Scout transition guards, handlers, clock callback, and derivations with isolated state; no browser data or external calls" }, null, 2));
  console.log(`${results.length}/${results.length} Scout lint/state regressions passed.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
