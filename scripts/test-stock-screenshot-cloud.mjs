import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { encodeScoutReportCloudNotes, decodeScoutReportCloudNotes, mergeScoutReportCloudSave } from "../src/utils/scoutReportCloudContext.mjs";
import { hasConfirmedScoutReportStatus, hasVerifiedScoutReportStatus } from "../src/utils/scoutReportVerification.mjs";
import { normalizePrivateStorageReference } from "../src/services/privateStorageReferences.js";
import { prepareRestockFeedEntries, filterRestockFeed, restockFeedBrowseState, restockReportStockLabel, restockReportStockGroup } from "../src/utils/restockFeedPresentation.mjs";

const require = createRequire(import.meta.url);
const espree = require("espree");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src/App.jsx"), "utf8");
const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
const names = ["mapSupabaseScoutReport", "persistScoutReportToSupabase", "persistScoutReportDetailsToSupabase", "scoutReportPhotoUrls", "getScoutReportId", "normalizeScoutReportVisibility", "scoutBackendNumberOrNull", "scoutReportTimeForBackend", "isScoutBackendOptionalError", "scoutBackendKey", "scoutBackendSyncReady", "updateQuickScoutReportForm", "scoutReportConfidenceBadge"];
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
const stores = Object.freeze([Object.freeze({ id: storeId, name: "Review Store", retailer: "Target", city: "Review City", address: "100 Review Street" })]);
const observedAt = "2026-10-18T15:30:00.000Z";
const pad = (value) => String(value).padStart(2, "0");
const localDate = (value = new Date()) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
const localTime = (value = new Date()) => `${pad(value.getHours())}:${pad(value.getMinutes())}`;

// The deployed table has 26 columns; optional migration columns are absent.
// Validate the payload AND RETURNING columns instead of manufacturing success.
const productionColumns = new Set([
  "id", "store_id", "user_id", "product_id", "report_type", "quantity_seen", "price_seen", "photo_url", "notes",
  "reported_at", "verification_status", "workspace_id", "store_name", "product_name", "product_type", "set_name",
  "quantity_estimate", "report_time", "visibility", "status", "confidence_score", "created_at", "updated_at",
  "archived_at", "archived_by", "observed_at",
]);
const productionStatuses = new Set(["pending", "confirmed", "unverified", "rejected", "stale"]);
const productionVisibility = new Set(["public", "private_from_map", "admin_only"]);
function productionInsert(payload, columns) {
  const requested = columns.split(",").map((column) => column.trim());
  const unknown = [...Object.keys(payload), ...requested].find((column) => !productionColumns.has(column));
  if (unknown) return { data: null, error: { code: "42703", message: `column ${unknown} does not exist` } };
  if (!productionStatuses.has(payload.status ?? "unverified")) return { data: null, error: { code: "23514", message: "store_reports_status_check" } };
  if (!productionVisibility.has(payload.visibility ?? "public")) return { data: null, error: { code: "23514", message: "store_reports_visibility_check" } };
  if (!["", "unverified", "submitted", "Submitted"].includes(payload.verification_status ?? "unverified")) {
    return { data: null, error: { code: "42501", message: "Only admins can set store report verification status" } };
  }
  if (!payload.report_type || !payload.user_id) return { data: null, error: { code: "23502", message: "Required report fields are missing" } };
  const row = { id: reportId, status: "unverified", verification_status: "unverified", visibility: "public", created_at: observedAt, updated_at: observedAt, ...payload };
  return { data: Object.fromEntries(requested.map((column) => [column, row[column] ?? null])), error: null };
}

function fixture(options = {}) {
  const calls = [];
  const messages = [];
  const logs = [];
  const badgeEvaluations = [];
  let form = options.form || {};
  const responses = [...(options.responses || [])];
  const environment = {
    encodeScoutReportCloudNotes,
    decodeScoutReportCloudNotes,
    normalizePrivateStorageReference,
    hasConfirmedScoutReportStatus,
    hasVerifiedScoutReportStatus,
    getScoutQuickStoreId: (store) => store.id || store.storeId || "",
    getScoutQuickStoreName: (store) => store.name || "",
    getScoutQuickRetailer: (store) => store.retailer || "",
    getLocalDateInputKey: localDate,
    getLocalTimeKey: localTime,
    makeId: (prefix) => `${prefix}-test-only`,
    scoutConfidenceScore: (confidence) => confidence === "confirmed" ? 90 : 26,
    isHistoricalScoutImport: (report) => report.sourceType === "historical_import" || report.source_type === "historical_import" || Boolean(report.importedByAdmin || report.imported_by_admin),
    scoutConfidenceBadgeMeta: (key) => ({ key, score: key === "verified" ? 90 : 26 }),
    evaluateScoutReportReliability: (report, options = {}) => {
      badgeEvaluations.push({ report, options });
      return { key: options.needsReview ? "unusual-needs-review" : "unconfirmed", score: 26 };
    },
    uuidOrNull: (value) => /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(String(value || "")) ? value : null,
    getScoutQuickStores: () => stores,
    logAppError: (...args) => logs.push(args),
    adminEditModeActive: options.adminEditMode ?? false,
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
      supabaseUrl: "https://synthetic-project.supabase.co",
      from(table) {
        calls.push({ operation: "from", table });
        assert.equal(table, "store_reports", "These saves must not change another table");
        return {
          update(payload) {
            calls.push({ operation: "update", payload });
            return { eq(field, id) {
              calls.push({ operation: "eq", field, id });
              assert.equal(field, "id"); assert.equal(id, reportId, "Details must update the existing saved ID");
              return { select(columns) {
                calls.push({ operation: "select", columns });
                return { single: async () => {
                  const requested = columns.split(",").map((column) => column.trim());
                  const unknown = [...Object.keys(payload), ...requested].find((column) => !productionColumns.has(column));
                  if (unknown) return { data: null, error: { code: "42703", message: `column ${unknown} does not exist` } };
                  const original = options.existingRow || cloudRow();
                  const row = { ...original, ...payload };
                  const result = { data: Object.fromEntries(requested.map((column) => [column, row[column] ?? null])), error: null };
                  const response = responses.shift();
                  return response === undefined ? result : response;
                } };
              } };
            } };
          },
          insert(payload) {
            calls.push({ operation: "insert", payload });
            return {
              select(columns) {
                calls.push({ operation: "select", columns });
                return { single: async () => {
                  const schemaResult = productionInsert(payload, columns);
                  if (schemaResult.error) return schemaResult;
                  const response = responses.shift();
                  return response === undefined ? schemaResult : typeof response === "function" ? response(payload, columns) : response;
                } };
              },
            };
          },
        };
      },
    },
  };
  const api = new Function(...Object.keys(environment), `${[...functions.values()].join("\n")}\nreturn {${names.join(",")}};`)(...Object.values(environment));
  return { api, calls, logs, messages, badgeEvaluations, get form() { return form; } };
}

// Additive-schema installations must remain readable too.
const cloudRow = (overrides = {}) => ({
  id: reportId, store_id: storeId, user_id: userId, workspace_id: workspaceId,
  store_name: "Review Store", product_name: "Prismatic Evolutions ETB", product_type: "Pokemon TCG",
  report_type: "restock", report_status: "stock_on_shelf", observed_at: observedAt,
  reported_at: observedAt, report_time: observedAt, created_at: observedAt, updated_at: observedAt,
  status: "unverified", verification_status: "unverified", visibility: "private_from_map", confidence_score: 26,
  confidence: "unusual-needs-review", source_type: "text_screenshot", source_label: "Facebook screenshot",
  photo_url: "", notes: "Reviewed product details only", ...overrides,
});
const localReport = (overrides = {}) => ({
  id: "local-report", storeId, workspaceId, storeName: "Review Store", productName: "Prismatic Evolutions ETB", productCategory: "Pokemon TCG",
  report_type: "restock", reportStatus: "stock_on_shelf", observedAt, sourceType: "text_screenshot", source_type: "text_screenshot",
  sourceLabel: "Facebook screenshot", screenshotImportReviewed: true, screenshotSourcePlatform: "facebook",
  proofType: "text_screenshot", visibility: "private_from_map", status: "active", verification_status: "needs_review",
  verified: false, needsReview: true, confidenceScore: 26, confidence: "unusual-needs-review", notes: "Reviewed product details only",
  ...overrides,
});
const ordinaryReport = (overrides = {}) => localReport({ sourceType: "user_report", source_type: "user_report", screenshotImportReviewed: false, screenshotSourcePlatform: "", proofType: "manual", sourceLabel: "Community report", verification_status: "new_report", ...overrides });
let passed = 0;
async function check(name, run) {
  try { await run(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
const inserts = (f) => f.calls.filter((call) => call.operation === "insert");

await check("schema fake rejects the original missing-column, status and moderation regressions", () => {
  const minimal = { user_id: userId, report_type: "restock", status: "unverified", verification_status: "unverified" };
  assert.equal(productionInsert({ ...minimal, source_type: "text_screenshot" }, "id").error.code, "42703");
  assert.equal(productionInsert(minimal, "id,source_label").error.code, "42703");
  assert.equal(productionInsert({ ...minimal, status: "active" }, "id").error.code, "23514");
  for (const verification_status of ["needs_review", "new_report", "verified"]) {
    assert.equal(productionInsert({ ...minimal, verification_status }, "id").error.code, "42501");
  }
});
await check("modern mapping retains screenshot provenance, proof, privacy and review", () => {
  const row = Object.freeze(cloudRow());
  const mapped = fixture().api.mapSupabaseScoutReport(row, stores);
  assert.equal(mapped.sourceType, "text_screenshot"); assert.equal(mapped.source_type, "text_screenshot");
  assert.equal(mapped.proofType, "text_screenshot"); assert.equal(mapped.screenshotImportReviewed, true);
  assert.equal(mapped.screenshotSourcePlatform, "facebook"); assert.equal(mapped.visibility, "private_from_map");
  assert.equal(mapped.needsReview, true); assert.equal(mapped.needs_review, true); assert.equal(mapped.verified, false);
  assert.equal(mapped.verificationStatus, "unverified"); assert.equal(mapped.verification_status, "unverified");
  assert.equal(mapped.shouldTrainPredictions, false); assert.equal(mapped.trainingEligible, false);
  assert.equal(mapped.observedAt, observedAt); assert.equal(mapped.notes, row.notes); assert.equal(mapped.stockStatus, "stock_on_shelf");
});
await check("controlled platform labels never interpret arbitrary source text", () => {
  for (const [label, expected] of [["Discord screenshot", "discord"], ["Community screenshot", "other"], ["unknown person @private-name says Facebook", "other"]]) {
    assert.equal(fixture().api.mapSupabaseScoutReport(cloudRow({ source_label: label }), stores).screenshotSourcePlatform, expected);
  }
});
await check("a proof photo cannot turn an indirect screenshot into a shelf-photo report", () => {
  const mapped = fixture().api.mapSupabaseScoutReport(cloudRow({ photo_url: "https://proof.example.test/user-selected-proof.jpg" }), stores);
  assert.equal(mapped.proofType, "text_screenshot"); assert.equal(mapped.needsReview, true);
  assert.equal(mapped.photoUrl, "https://proof.example.test/user-selected-proof.jpg");
});
await check("unverified and lookalike statuses never become confirmed for either source", () => {
  for (const source_type of ["user_report", "text_screenshot"]) {
    for (const status of ["unverified", "pending", "not_verified", "confirmed_by_user", "not_confirmed", "unconfirmed"]) {
      const mapped = fixture().api.mapSupabaseScoutReport(cloudRow({ status, verification_status: status, source_type }), stores);
      assert.equal(mapped.verified, false, `${source_type}: ${status}`); assert.equal(mapped.trainingEligible, false, `${source_type}: ${status}`);
    }
  }
});
await check("explicit server confirmation resolves review and retains provenance", () => {
  const mapped = fixture().api.mapSupabaseScoutReport(cloudRow({ status: "confirmed", verification_status: "verified" }), stores);
  assert.equal(mapped.verified, true); assert.equal(mapped.needsReview, false); assert.equal(mapped.proofType, "text_screenshot");
  assert.equal(mapped.sourceType, "text_screenshot"); assert.equal(mapped.screenshotSourcePlatform, "facebook");
});
await check("rejected or stale rows override a prior confirmation field", () => {
  for (const status of ["rejected", "stale"]) {
    const mapped = fixture().api.mapSupabaseScoutReport(cloudRow({ status, verification_status: "verified" }), stores);
    assert.equal(mapped.verified, false); assert.equal(mapped.trainingEligible, false);
  }
});
await check("ordinary photo reports retain photo proof and unverified state", () => {
  const mapped = fixture().api.mapSupabaseScoutReport(cloudRow({ source_type: "user_report", photo_url: "photo.jpg" }), stores);
  assert.equal(mapped.proofType, "stock_photo"); assert(!Object.hasOwn(mapped, "screenshotImportReviewed"));
  assert.equal(mapped.verified, false); assert.equal(mapped.trainingEligible, false);
});
await check("status edits preserve source markers and private sharing", () => {
  const f = fixture({ form: { ...localReport(), reportType: "stock_on_shelf" } });
  f.api.updateQuickScoutReportForm("reportType", "no_stock");
  assert.equal(f.form.reportType, "no_stock"); assert.equal(f.form.reportTypeTouched, true);
  assert.equal(f.form.screenshotImportReviewed, true); assert.equal(f.form.proofType, "text_screenshot");
  assert.equal(f.form.screenshotSourcePlatform, "facebook"); assert.equal(f.form.visibility, "private_from_map");
});
await check("private screenshot saves and reloads against the actual 26-column schema", async () => {
  const f = fixture();
  const input = Object.freeze(localReport({ quantity: 3, price: 49.99, setName: "Prismatic Evolutions", rawText: "Private OCR author @test-handle", screenshotImage: "private-image-bytes", screenshotPreview: "blob:private-preview" }));
  const saved = await f.api.persistScoutReportToSupabase(input);
  assert.equal(saved.ok, true, JSON.stringify(saved.error)); assert.equal(saved.source, "supabase");
  assert.equal(inserts(f).length, 1, "No second, lossy insert is allowed");
  const payload = inserts(f)[0].payload;
  assert.equal(payload.visibility, "private_from_map"); assert.equal(payload.verification_status, "unverified");
  assert.equal(payload.status, "unverified"); assert.equal(payload.observed_at, observedAt); assert.equal(payload.photo_url, "");
  assert.equal(payload.user_id, userId); assert.equal(payload.workspace_id, workspaceId);
  assert.equal(payload.store_name, input.storeName); assert.equal(payload.product_name, input.productName);
  assert.equal(payload.quantity_seen, 3); assert.equal(payload.price_seen, 49.99); assert.equal(payload.set_name, input.setName);
  const context = decodeScoutReportCloudNotes(payload.notes);
  assert.equal(context.notes, input.notes); assert.equal(context.sourceType, "text_screenshot");
  assert.equal(context.sourceLabel, "Facebook screenshot"); assert.equal(context.reportStatus, "stock_on_shelf");
  for (const key of ["rawText", "screenshotImage", "screenshotPreview"]) assert(!Object.hasOwn(payload, key));
  for (const value of ["@test-handle", "private-image-bytes", "blob:private-preview"]) assert(!JSON.stringify(payload).includes(value));
  const persisted = productionInsert(payload, [...productionColumns].join(",")).data;
  const reloaded = fixture().api.mapSupabaseScoutReport(persisted, stores);
  for (const report of [saved.report, reloaded]) {
    assert.equal(report.id, reportId); assert.equal(report.proofType, "text_screenshot");
    assert.equal(report.sourceType, "text_screenshot"); assert.equal(report.screenshotSourcePlatform, "facebook");
    assert.equal(report.visibility, "private_from_map"); assert.equal(report.needsReview, true); assert.equal(report.verified, false);
    assert.equal(report.trainingEligible, false); assert.equal(report.notes, input.notes);
    assert.equal(report.stockStatus, "stock_on_shelf"); assert.equal(report.observedAt, observedAt);
    assert.equal(report.storeName, input.storeName); assert.equal(report.productName, input.productName);
  }
});
await check("ordinary private reports retain product, directory store, time, sharing and notes", async () => {
  const f = fixture();
  const input = ordinaryReport({ notes: "Phone check 1019 A", reportStatus: "no_stock", storeId: "directory-location-7", storeName: "Directory location" });
  const saved = await f.api.persistScoutReportToSupabase(input);
  assert.equal(saved.ok, true, JSON.stringify(saved.error)); assert.equal(inserts(f).length, 1); assert.equal(saved.usedDirectoryStoreFallback, true);
  const payload = inserts(f)[0].payload;
  assert.equal(payload.store_id, null); assert.equal(payload.store_name, input.storeName);
  assert.equal(payload.product_name, input.productName); assert.equal(payload.visibility, "private_from_map");
  assert.equal(payload.observed_at, observedAt); assert.equal(payload.verification_status, "unverified");
  assert.equal(saved.report.notes, input.notes); assert.equal(saved.report.stockStatus, "no_stock");
  assert.equal(saved.report.visibility, "private_from_map"); assert.equal(saved.report.verified, false);
  assert.equal(saved.report.sourceType, "user_report"); assert.equal(saved.report.proofType, "manual");
  assert(!Object.hasOwn(saved.report, "screenshotImportReviewed"));
});
await check("schema-persisted unverified screenshot and ordinary rows never display a verified badge", async () => {
  for (const input of [localReport(), ordinaryReport()]) {
    const f = fixture();
    const saved = await f.api.persistScoutReportToSupabase(input);
    assert.equal(saved.ok, true); assert.equal(saved.report.verificationStatus, "unverified");
    assert.notEqual(f.api.scoutReportConfidenceBadge(saved.report).key, "verified");
    assert.equal(f.badgeEvaluations.length, 1, "Unverified rows must still reach reliability evaluation");
    assert.equal(Boolean(f.badgeEvaluations[0].options.needsReview), input.sourceType === "text_screenshot", "Screenshot review must remain explicit");
  }
});
await check("lookalike and negated verification statuses never display a verified badge", () => {
  for (const rawStatus of ["unverified", "unconfirmed", "not_verified", "not_confirmed", "confirmed_by_user", "unverified_historical"]) {
    for (const key of ["verificationStatus", "verification_status", "status"]) {
      const f = fixture();
      const badge = f.api.scoutReportConfidenceBadge({ [key]: rawStatus, confidence: "unconfirmed", verified: false });
      assert.notEqual(badge.key, "verified", `${key}: ${rawStatus}`);
      assert.equal(f.badgeEvaluations.length, 1, `${key}: ${rawStatus}`);
    }
  }
});
await check("explicit verification status tokens retain their existing badge behavior", () => {
  for (const verificationStatus of ["confirmed", "verified", "confirmed_restock", "verified_user_report"]) {
    const f = fixture();
    assert.equal(f.api.scoutReportConfidenceBadge({ verificationStatus }).key, "verified", verificationStatus);
    assert.equal(f.badgeEvaluations.length, 0);
  }
});
await check("unverified screenshot review reaches the existing needs-review branch", () => {
  const f = fixture();
  const report = { sourceType: "text_screenshot", verificationStatus: "unverified", confidence: "unconfirmed", needsReview: true };
  assert.equal(f.api.scoutReportConfidenceBadge(report).key, "unusual-needs-review");
  assert.deepEqual(f.badgeEvaluations, [{ report, options: { needsReview: true } }]);
});
await check("public and administrator-only sharing remain explicit", async () => {
  for (const visibility of ["public", "admin_only"]) {
    const f = fixture();
    const saved = await f.api.persistScoutReportToSupabase(ordinaryReport({ visibility }));
    assert.equal(saved.ok, true, JSON.stringify(saved.error)); assert.equal(inserts(f)[0].payload.visibility, visibility); assert.equal(saved.report.visibility, visibility);
  }
});
await check("every screenshot marker retains indirect provenance in a schema-compatible save", async () => {
  for (const marker of [{ sourceType: "text_screenshot" }, { source_type: "text_screenshot" }, { screenshotImportReviewed: true }, { proofType: "text_screenshot" }]) {
    const f = fixture();
    const saved = await f.api.persistScoutReportToSupabase(ordinaryReport({ ...marker, sourceLabel: "Discord screenshot" }));
    assert.equal(saved.ok, true, JSON.stringify(marker)); assert.equal(inserts(f).length, 1);
    assert.equal(saved.report.sourceType, "text_screenshot", JSON.stringify(marker)); assert.equal(saved.report.proofType, "text_screenshot", JSON.stringify(marker));
    assert.equal(saved.report.screenshotSourcePlatform, "discord", JSON.stringify(marker));
    assert.equal(saved.report.needsReview, true); assert.equal(saved.report.visibility, "private_from_map");
  }
});
await check("an explicitly selected proof photo survives cloud saving without publishing the screenshot", async () => {
  const f = fixture();
  const photo = "https://proof.example.test/selected-shelf-proof.jpg";
  const saved = await f.api.persistScoutReportToSupabase(localReport({ photoUrls: [photo], screenshotImage: "private-screenshot-bytes", screenshotPreview: "blob:private-screenshot" }));
  assert.equal(saved.ok, true); assert.equal(inserts(f)[0].payload.photo_url, photo);
  assert.equal(saved.report.photoUrl, photo); assert.equal(saved.report.proofType, "text_screenshot");
  assert.equal(saved.report.needsReview, true);
  assert(!JSON.stringify(inserts(f)[0].payload).includes("private-screenshot"));
});
await check("new drafts cannot grant themselves moderation or historical-import authority", async () => {
  for (const adminEditMode of [false, true]) {
    const f = fixture({ adminEditMode });
    const saved = await f.api.persistScoutReportToSupabase(ordinaryReport({ status: "confirmed", verification_status: "verified", verificationStatus: "verified", verified: true, importedByAdmin: true, imported_by_admin: true, importedBatch: "not-a-server-import", sourceType: "historical_import", source_type: "historical_import", reportStatus: "stock_seen" }));
    assert.equal(saved.ok, true, JSON.stringify(saved.error));
    const payload = inserts(f)[0].payload;
    assert.equal(payload.status, "unverified"); assert.equal(payload.verification_status, "unverified");
    assert.equal(saved.report.verified, false); assert.equal(saved.report.trainingEligible, false);
    assert.equal(saved.report.importedByAdmin, false); assert.equal(saved.report.importedBatch, ""); assert.notEqual(saved.report.sourceType, "historical_import");
  }
});
await check("optional-column failures never retry a lossy insert for either source", async () => {
  for (const report of [localReport(), ordinaryReport()]) {
    const f = fixture({ responses: [{ data: null, error: { code: "42703", message: "column observed_at does not exist" } }] });
    const saved = await f.api.persistScoutReportToSupabase(Object.freeze(report));
    assert.equal(saved.ok, false); assert.equal(saved.reason, "backend_save_failed"); assert.equal(inserts(f).length, 1); assert.equal(f.logs.length, 1);
  }
});
await check("network and policy errors preserve the local-failure result without mutating other rows", async () => {
  for (const error of [{ code: "NETWORK", message: "network unavailable" }, { code: "42501", message: "row-level security policy denied the insert" }]) {
    const f = fixture({ responses: [{ data: null, error }] });
    const saved = await f.api.persistScoutReportToSupabase(localReport());
    assert.equal(saved.ok, false); assert.equal(saved.reason, "backend_save_failed"); assert.equal(inserts(f).length, 1); assert.equal(f.logs.length, 1);
    assert.equal(f.calls.some((call) => call.operation === "delete" || call.operation === "update"), false);
  }
});
await check("guest, unsigned, unconfigured, unready and local-beta sessions never call cloud persistence", async () => {
  for (const options of [{ guest: true }, { signedIn: false }, { configured: false }, { protectedReady: false }, { localBeta: true }]) {
    const f = fixture(options);
    const saved = await f.api.persistScoutReportToSupabase(localReport());
    assert.equal(saved.ok, false); assert.equal(saved.skipped, true); assert.equal(saved.reason, "backend_unavailable"); assert.equal(f.calls.length, 0, JSON.stringify(options));
  }
});
await check("context is idempotent, bounded and excludes OCR, images and draft authority", () => {
  const report = localReport({ rawText: "private-ocr", screenshotImage: "data:image/private", verified: true, importedByAdmin: true });
  const encoded = encodeScoutReportCloudNotes(report);
  assert.equal(encodeScoutReportCloudNotes({ ...report, notes: encoded }), encoded);
  assert(encoded.length - report.notes.length < 300);
  for (const value of ["private-ocr", "data:image/private", "verified", "importedByAdmin"]) assert(!encoded.includes(value));
  assert.deepEqual(decodeScoutReportCloudNotes(encoded), { notes: report.notes, sourceType: "text_screenshot", sourceLabel: "Facebook screenshot", reportStatus: "stock_on_shelf" });
  assert.equal(decodeScoutReportCloudNotes(encodeScoutReportCloudNotes(ordinaryReport({ reportStatus: "employee_restock_coming" }))).reportStatus, "employee_restock_coming");
});
await check("successful cloud saves retain reviewed device details while server identity and authority win", () => {
  const local = localReport({
    itemsSeen: [{ productName: "Prismatic Evolutions ETB", quantity: "3" }],
    photoUrls: ["https://proof.example.test/selected-shelf-proof.jpg"],
    catalogProductId: "reviewed-catalog-id", catalogProductName: "Prismatic Evolutions ETB",
    productImageUrl: "https://art.example.test/etb.webp", manualLocation: { city: "Review City", address: "100 Review Street" },
    city: "Review City", address: "100 Review Street", region: "VA", state: "VA", zip: "23435",
    retailer: "Target", chain: "Target", needsStoreReview: true, stockLeft: "some", storeFollowPreference: true,
    rawText: "private-ocr-text", screenshotImage: "private-image-bytes", screenshotPreview: "blob:private-preview",
    status: "confirmed", verification_status: "verified", verified: true, importedByAdmin: true,
    visibility: "public", notes: "obsolete local note", userId: "other-user",
  });
  const cloud = fixture().api.mapSupabaseScoutReport(cloudRow({ notes: "Server-reviewed note" }), []);
  const merged = mergeScoutReportCloudSave(Object.freeze(local), Object.freeze(cloud));
  for (const key of ["itemsSeen", "photoUrls", "catalogProductId", "catalogProductName", "productImageUrl", "manualLocation", "state", "zip", "needsStoreReview", "stockLeft", "storeFollowPreference"]) {
    assert.deepEqual(merged[key], local[key], key);
  }
  for (const key of ["city", "address", "region", "retailer", "chain"]) assert.equal(merged[key], local[key], key);
  for (const key of ["id", "userId", "status", "verification_status", "verified", "visibility", "sourceType", "notes", "needsReview", "trainingEligible", "importedByAdmin"]) {
    assert.deepEqual(merged[key], cloud[key], key);
  }
  for (const key of ["rawText", "screenshotImage", "screenshotPreview"]) assert(!Object.hasOwn(merged, key));
  for (const value of ["private-ocr-text", "private-image-bytes", "blob:private-preview"]) assert(!JSON.stringify(merged).includes(value));
  assert(source.includes("mergeScoutReportCloudSave(report, backendSaveResult.report)"), "The real submit flow must use the preservation helper");
});
await check("cloud location details override an older device location", () => {
  const local = { city: "Old City", address: "Old address", region: "Old region", retailer: "Old retailer", chain: "Old chain" };
  const cloud = { city: "Current City", address: "Current address", region: "Current region", retailer: "Current retailer", chain: "Current chain" };
  assert.deepEqual(mergeScoutReportCloudSave(local, cloud), cloud);
});
await check("malformed or authority-spoofing context remains literal notes and never creates trust", () => {
  for (const footer of ["not-json", "null", "[]", '{"verified":true}', '{"source":"historical_import"}', '{"source":"text_screenshot","platform":"private person"}', '{"stockStatus":"verified"}', "x".repeat(241)]) {
    const notes = `Keep my note\n\n[Code 3 report context v1:${footer}]`;
    assert.deepEqual(decodeScoutReportCloudNotes(notes), { notes, sourceType: "", sourceLabel: "", reportStatus: "" });
    const mapped = fixture().api.mapSupabaseScoutReport(cloudRow({ source_type: undefined, report_status: undefined, notes }), stores);
    assert.equal(mapped.notes, notes); assert.equal(mapped.verified, false); assert.equal(mapped.trainingEligible, false); assert.notEqual(mapped.sourceType, "historical_import");
  }
});
await check("core report-loader fallback retains privacy and identity fields", () => {
  const match = source.match(/const reportFallbackSelect\s*=\s*"([^"]+)"/);
  assert(match, "The optional-schema loader needs a named core fallback selection");
  const columns = new Set(match[1].split(","));
  for (const column of ["visibility", "status", "verification_status", "store_name", "product_name", "observed_at", "notes", "workspace_id"]) assert(columns.has(column), `Fallback omits ${column}`);
  for (const column of columns) assert(productionColumns.has(column), `Fallback still requests unavailable ${column}`);
});
await check("private proof links persist and reload as token-free object references", async () => {
  const origin = "https://synthetic-project.supabase.co";
  const oldLink = `${origin}/storage/v1/object/sign/receipt-images/users/${userId}/scout-reports/proof.png?token=expired-private-proof`;
  const stable = `${origin}/storage/v1/object/authenticated/receipt-images/users/${userId}/scout-reports/proof.png`;
  const f = fixture();
  const saved = await f.api.persistScoutReportToSupabase(localReport({ photoUrls: [oldLink] }));
  assert.equal(saved.ok, true);
  assert.equal(inserts(f)[0].payload.photo_url, stable);
  const mapped = f.api.mapSupabaseScoutReport(cloudRow({ photo_url: oldLink }), stores);
  assert.equal(mapped.photoUrl, stable); assert.equal(mapped.photo_url, stable);
  assert.equal(JSON.stringify(inserts(f)[0].payload).includes("expired-private-proof"), false);
});
await check("existing screenshot details update the core schema while keeping manual location, privacy and source", async () => {
  const original = cloudRow({ store_id: null, store_name: "QA manual location", source_type: undefined, report_status: undefined, notes: encodeScoutReportCloudNotes(localReport()) });
  const before = JSON.stringify(original);
  const f = fixture({ existingRow: original });
  const saved = await f.api.persistScoutReportDetailsToSupabase(localReport({ id: reportId, storeId: "", storeName: "QA manual location", notes: "Additional reviewed context", quantitySeen: "2" }));
  const updates = f.calls.filter((call) => call.operation === "update");
  assert.equal(updates.length, 1); assert.equal(inserts(f).length, 0);
  assert.equal(saved.id, reportId); assert.equal(saved.storeName, original.store_name); assert.equal(saved.storeId, "");
  assert.equal(saved.visibility, "private_from_map"); assert.equal(saved.sourceType, "text_screenshot"); assert.equal(saved.sourceLabel, "Facebook screenshot");
  assert.equal(saved.verified, false); assert.equal(saved.needsReview, true); assert.equal(saved.notes, "Additional reviewed context");
  assert.equal(Object.hasOwn(updates[0].payload, "source_type"), false); assert.equal(Object.hasOwn(updates[0].payload, "visibility"), false); assert.equal(Object.hasOwn(updates[0].payload, "verification_status"), false);
  assert.equal(decodeScoutReportCloudNotes(updates[0].payload.notes).sourceType, "text_screenshot");
  assert.equal(JSON.stringify(original), before);
});
await check("detail cloud errors retain the existing record without lossy retry or new insert", async () => {
  const f = fixture({ responses: [{ data: null, error: { code: "42501", message: "synthetic owner policy denial" } }] });
  const original = Object.freeze(localReport({ id: reportId }));
  const before = JSON.stringify(original);
  await assert.rejects(f.api.persistScoutReportDetailsToSupabase(original), (error) => error.code === "42501");
  assert.equal(f.calls.filter((call) => call.operation === "update").length, 1); assert.equal(inserts(f).length, 0); assert.equal(JSON.stringify(original), before);
});
await check("local beta and non-cloud report identities never trigger detail cloud writes", async () => {
  for (const options of [{ localBeta: true }, { guest: true }, { signedIn: false }, { protectedReady: false }]) {
    const f = fixture(options);
    assert.equal(await f.api.persistScoutReportDetailsToSupabase(localReport({ id: reportId })), null); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); assert.equal(await f.api.persistScoutReportDetailsToSupabase(localReport({ id: "local-existing-report" })), null); assert.equal(f.calls.length, 0);
});
await check("actual cloud-mapped category-only stock reports retain feed labels, search and stock-filter counts", () => {
  const states = [
    ["stock_on_shelf", "stock", "Stock seen"], ["restock_happening_now", "stock", "Vendor stocking"],
    ["low_stock", "low", "Low stock"], ["no_stock", "empty", "Empty shelves"],
    ["vendor_seen", "other", "Stock not specified"], ["customer_service", "other", "Stock not specified"],
  ];
  const mapped = states.map(([stockStatus, group, label], index) => {
    const row = cloudRow({ id: `mapped-${index}`, product_name: "", product_type: "Pokemon TCG", source_type: undefined, report_status: undefined,
      status: "unverified", verification_status: "unverified", notes: encodeScoutReportCloudNotes({ sourceType: "user_report", reportStatus: stockStatus, notes: "QA category-only observation" }) });
    const before = JSON.stringify(row);
    const result = fixture().api.mapSupabaseScoutReport(row, stores);
    assert.equal(result.stockStatus, stockStatus); assert.equal(restockReportStockGroup(result), group); assert.equal(restockReportStockLabel(result), label);
    assert.equal(result.productType, "Pokemon TCG"); assert.equal(result.verified, false); assert.equal(result.visibility, "private_from_map");
    assert.equal(JSON.stringify(row), before); return result;
  });
  const before = JSON.stringify(mapped);
  const entries = prepareRestockFeedEntries(mapped);
  const now = Date.parse(observedAt) + 60000;
  assert.deepEqual(restockFeedBrowseState(entries, {}, now).counts, { all: 6, stock: 2, low: 1, empty: 1 });
  assert.equal(filterRestockFeed(entries, { stock: "stock", search: "Pokemon TCG" }, now).length, 2);
  assert.equal(filterRestockFeed(entries, { stock: "low" }, now).length, 1);
  assert.equal(filterRestockFeed(entries, { stock: "empty" }, now).length, 1);
  assert.equal(JSON.stringify(mapped), before, "Feed display must not rewrite synced records, privacy or verification");
});
console.log(`Stock screenshot cloud: ${passed} actual App behavior checks passed against a production-schema fake. No live requests were made.`);
