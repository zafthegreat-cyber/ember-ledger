import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const espree = require("espree");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
const names = ["mapSupabaseScoutReport", "persistScoutReportToSupabase", "normalizeScoutReportVisibility", "scoutBackendNumberOrNull", "scoutReportTimeForBackend", "isScoutBackendOptionalError", "scoutBackendKey", "scoutBackendSyncReady", "updateQuickScoutReportForm"];
const functions = new Map();
function visit(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration" && names.includes(node.id?.name)) {
    assert(!functions.has(node.id.name), `Expected one actual App function named ${node.id.name}`);
    functions.set(node.id.name, source.slice(...node.range));
  }
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value?.type) visit(value);
}
visit(ast);
for (const name of names) assert(functions.has(name), `Missing actual App function: ${name}`);

const storeId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const workspaceId = "33333333-3333-4333-8333-333333333333";
const reportId = "44444444-4444-4444-8444-444444444444";
const stores = Object.freeze([Object.freeze({ id: storeId, name: "Test Store", retailer: "Target", city: "Test City", address: "100 Test Street" })]);
const observedAt = "2026-10-18T15:30:00.000Z";
const pad = (value) => String(value).padStart(2, "0");
const localDate = (value = new Date()) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
const localTime = (value = new Date()) => `${pad(value.getHours())}:${pad(value.getMinutes())}`;

function fixture(options = {}) {
  const calls = [];
  const messages = [];
  const logs = [];
  let form = options.form || {};
  const responses = [...(options.responses || [])];
  const environment = {
    getScoutQuickStoreId: (store) => store.id || store.storeId || "",
    getScoutQuickStoreName: (store) => store.name || "",
    getScoutQuickRetailer: (store) => store.retailer || "",
    getLocalDateInputKey: localDate,
    getLocalTimeKey: localTime,
    makeId: (prefix) => `${prefix}-test-only`,
    scoutConfidenceScore: (confidence) => confidence === "confirmed" ? 90 : 26,
    uuidOrNull: (value) => /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(String(value || "")) ? value : null,
    getScoutQuickStores: () => stores,
    logAppError: (...args) => logs.push(args),
    adminEditModeActive: false,
    user: { id: userId },
    activeWorkspaceId: workspaceId,
    BETA_LOCAL_MODE: options.localBeta ?? false,
    guestPreviewActive: options.guest ?? false,
    signedInWithSupabase: options.signedIn ?? true,
    isSupabaseConfigured: options.configured ?? true,
    protectedAppDataAccessReady: () => options.protectedReady ?? true,
    quickScoutReportForm: form,
    setQuickScoutReportMessage: (message) => messages.push(message),
    setQuickScoutReportForm: (update) => { form = typeof update === "function" ? update(form) : update; },
    SCOUT_QUICK_REPORT_TYPES: [
      { value: "stock_on_shelf", isGuess: false }, { value: "no_stock", isGuess: false }, { value: "guess", isGuess: true },
    ],
    SCOUT_WEEKDAYS: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    normalizeScoutGuessVisibility: (value) => value,
    supabase: {
      from(table) {
        calls.push({ operation: "from", table });
        return {
          insert(payload) {
            calls.push({ operation: "insert", payload });
            const response = responses.shift();
            assert(response, "Unexpected Supabase insert: all requests must be explicitly mocked");
            return {
              select(columns) {
                calls.push({ operation: "select", columns });
                return { single: async () => typeof response === "function" ? response(payload) : response };
              },
            };
          },
        };
      },
    },
  };
  const api = new Function(...Object.keys(environment), `${[...functions.values()].join("\n")}\nreturn {${names.join(",")}};`)(...Object.values(environment));
  return { api, calls, logs, messages, get form() { return form; } };
}

const cloudRow = (overrides = {}) => ({
  id: reportId, store_id: storeId, user_id: userId, workspace_id: workspaceId,
  store_name: "Test Store", product_name: "Prismatic Evolutions ETB", product_type: "Pokemon TCG",
  report_type: "restock", report_status: "stock_on_shelf", observed_at: observedAt,
  reported_at: observedAt, report_time: observedAt, created_at: observedAt, updated_at: observedAt,
  status: "active", verification_status: "needs_review", visibility: "private_from_map", confidence_score: 26,
  confidence: "unusual-needs-review", source_type: "text_screenshot", source_label: "Facebook screenshot",
  photo_url: "", notes: "Reviewed product details only", ...overrides,
});
const localReport = (overrides = {}) => ({
  id: "local-report", storeId, workspaceId, productName: "Prismatic Evolutions ETB", productCategory: "Pokemon TCG",
  report_type: "restock", reportStatus: "stock_on_shelf", observedAt, sourceType: "text_screenshot", source_type: "text_screenshot",
  sourceLabel: "Facebook screenshot", screenshotImportReviewed: true, screenshotSourcePlatform: "facebook",
  proofType: "text_screenshot", visibility: "private_from_map", status: "active", verification_status: "needs_review",
  verified: false, needsReview: true, confidenceScore: 26, confidence: "unusual-needs-review", notes: "Reviewed product details only",
  ...overrides,
});
const optionalError = Object.freeze({ code: "42703", message: "column source_type does not exist" });
let passed = 0;
async function check(name, run) {
  try { await run(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}

await check("modern cloud mapping retains screenshot provenance, proof, privacy and review", () => {
  const row = Object.freeze(cloudRow());
  const mapped = fixture().api.mapSupabaseScoutReport(row, stores);
  assert.equal(mapped.sourceType, "text_screenshot"); assert.equal(mapped.source_type, "text_screenshot");
  assert.equal(mapped.proofType, "text_screenshot"); assert.equal(mapped.screenshotImportReviewed, true);
  assert.equal(mapped.screenshotSourcePlatform, "facebook"); assert.equal(mapped.visibility, "private_from_map");
  assert.equal(mapped.needsReview, true); assert.equal(mapped.needs_review, true); assert.equal(mapped.verified, false);
  assert.equal(mapped.verificationStatus, "needs_review"); assert.equal(mapped.verification_status, "needs_review");
  assert.equal(mapped.shouldTrainPredictions, false); assert.equal(mapped.trainingEligible, false);
  assert.equal(mapped.observedAt, observedAt); assert.equal(mapped.notes, row.notes);
  assert.equal(mapped.stockStatus, "stock_on_shelf");
});
await check("controlled platform labels survive cloud mapping without trusting arbitrary source text", () => {
  for (const [label, expected] of [["Discord screenshot", "discord"], ["Community screenshot", "other"], ["unknown person @private-name says Facebook", "other"]]) {
    assert.equal(fixture().api.mapSupabaseScoutReport(cloudRow({ source_label: label }), stores).screenshotSourcePlatform, expected);
  }
});
await check("an existing proof image cannot turn an indirect screenshot into a shelf-photo report", () => {
  const mapped = fixture().api.mapSupabaseScoutReport(cloudRow({ photo_url: "https://proof.example.test/user-selected-proof.jpg" }), stores);
  assert.equal(mapped.proofType, "text_screenshot"); assert.equal(mapped.needsReview, true);
  assert.equal(mapped.photoUrl, "https://proof.example.test/user-selected-proof.jpg");
});
await check("unverified screenshot status is not mistaken for verified by substring", () => {
  const mapped = fixture().api.mapSupabaseScoutReport(cloudRow({ status: "unverified", verification_status: "unverified" }), stores);
  assert.equal(mapped.verified, false); assert.equal(mapped.needsReview, true); assert.equal(mapped.trainingEligible, false);
});
await check("explicit moderator confirmation retains provenance and can resolve review", () => {
  const mapped = fixture().api.mapSupabaseScoutReport(cloudRow({ verification_status: "verified" }), stores);
  assert.equal(mapped.verified, true); assert.equal(mapped.needsReview, false); assert.equal(mapped.proofType, "text_screenshot");
  assert.equal(mapped.sourceType, "text_screenshot"); assert.equal(mapped.screenshotSourcePlatform, "facebook");
});
await check("ordinary photo report mapping remains unchanged", () => {
  const mapped = fixture().api.mapSupabaseScoutReport(cloudRow({ source_type: "user_report", verification_status: "new_report", photo_url: "photo.jpg" }), stores);
  assert.equal(mapped.proofType, "stock_photo"); assert(!Object.hasOwn(mapped, "screenshotImportReviewed"));
});
await check("status edits preserve source markers and private sharing", () => {
  const f = fixture({ form: { ...localReport(), reportType: "stock_on_shelf" } });
  f.api.updateQuickScoutReportForm("reportType", "no_stock");
  assert.equal(f.form.reportType, "no_stock"); assert.equal(f.form.reportTypeTouched, true);
  assert.equal(f.form.screenshotImportReviewed, true); assert.equal(f.form.proofType, "text_screenshot");
  assert.equal(f.form.screenshotSourcePlatform, "facebook"); assert.equal(f.form.visibility, "private_from_map");
});
await check("modern persistence sends indirect/private fields and remaps a safe report", async () => {
  const f = fixture({ responses: [(payload) => ({ data: cloudRow({ ...payload }), error: null })] });
  const input = Object.freeze(localReport({ rawText: "Private OCR author @test-handle", screenshotImage: "private-image-bytes", screenshotPreview: "blob:private-preview" }));
  const saved = await f.api.persistScoutReportToSupabase(input);
  assert.equal(saved.ok, true); assert.equal(saved.report.proofType, "text_screenshot");
  assert.equal(saved.report.needsReview, true); assert.equal(saved.report.visibility, "private_from_map");
  const payload = f.calls.find((call) => call.operation === "insert").payload;
  assert.equal(payload.source_type, "text_screenshot"); assert.equal(payload.source_label, "Facebook screenshot");
  assert.equal(payload.visibility, "private_from_map"); assert.equal(payload.verification_status, "needs_review");
  assert.equal(payload.observed_at, observedAt); assert.equal(payload.photo_url, ""); assert.equal(payload.notes, input.notes);
  assert.equal(payload.user_id, userId); assert.equal(payload.workspace_id, workspaceId);
  for (const key of ["rawText", "screenshotImage", "screenshotPreview"]) assert(!Object.hasOwn(payload, key));
  assert(!JSON.stringify(payload).includes("@test-handle"));
});
await check("screenshot metadata errors never retry a legacy public/source-less insert", async () => {
  const f = fixture({ responses: [{ data: null, error: optionalError }] });
  const saved = await f.api.persistScoutReportToSupabase(Object.freeze(localReport()));
  assert.equal(saved.ok, false); assert.equal(saved.reason, "backend_save_failed");
  assert.equal(f.calls.filter((call) => call.operation === "insert").length, 1);
  assert.equal(f.calls.some((call) => call.operation === "delete" || call.operation === "update"), false);
});
await check("every recognized screenshot marker blocks legacy fallback", async () => {
  for (const marker of [{ sourceType: "text_screenshot" }, { source_type: "text_screenshot" }, { screenshotImportReviewed: true }, { proofType: "text_screenshot" }]) {
    const f = fixture({ responses: [{ data: null, error: optionalError }] });
    const report = { ...localReport(), sourceType: "user_report", source_type: "user_report", screenshotImportReviewed: false, proofType: "manual", ...marker };
    const saved = await f.api.persistScoutReportToSupabase(report);
    assert.equal(saved.ok, false, JSON.stringify(marker));
    assert.equal(f.calls.filter((call) => call.operation === "insert").length, 1, JSON.stringify(marker));
  }
});
await check("ordinary reports retain the existing legacy fallback behavior", async () => {
  const f = fixture({ responses: [{ data: null, error: optionalError }, { data: cloudRow({ source_type: undefined, verification_status: "new_report", photo_url: "proof.jpg" }), error: null }] });
  const saved = await f.api.persistScoutReportToSupabase(localReport({ sourceType: "user_report", source_type: "user_report", screenshotImportReviewed: false, proofType: "photo" }));
  assert.equal(saved.ok, true);
  const payloads = f.calls.filter((call) => call.operation === "insert").map((call) => call.payload);
  assert.equal(payloads.length, 2); assert.equal(payloads[1].user_id, userId);
  assert(!Object.hasOwn(payloads[1], "source_type")); assert(!Object.hasOwn(payloads[1], "visibility"));
});
await check("unrelated backend errors keep the existing local-failure result", async () => {
  const f = fixture({ responses: [{ data: null, error: { code: "NETWORK", message: "network unavailable" } }] });
  const saved = await f.api.persistScoutReportToSupabase(localReport());
  assert.equal(saved.ok, false); assert.equal(saved.reason, "backend_save_failed");
  assert.equal(f.calls.filter((call) => call.operation === "insert").length, 1);
});
await check("guest, unsigned, unconfigured, unready and local-beta sessions cannot call cloud persistence", async () => {
  for (const options of [{ guest: true }, { signedIn: false }, { configured: false }, { protectedReady: false }, { localBeta: true }]) {
    const f = fixture(options);
    const saved = await f.api.persistScoutReportToSupabase(localReport());
    assert.equal(saved.ok, false); assert.equal(saved.skipped, true); assert.equal(saved.reason, "backend_unavailable");
    assert.equal(f.calls.length, 0, JSON.stringify(options));
  }
});
console.log(`Stock screenshot cloud: ${passed} actual App behavior checks passed. No live requests were made.`);
