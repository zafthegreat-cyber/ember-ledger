import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createPrivateStorageReference, normalizePrivateStorageReference, projectPrivateImageReferences } from "../src/services/privateStorageReferences.js";
import { classifyReceiptReference } from "../src/services/privateReceiptAccess.js";
import { captureWorkspaceSources } from "../src/features/persistence/cloudWorkspaceSources.js";
import { readCurrentBackupSources, createVerifiedBackup } from "../src/features/backup/backupFormat.js";
import { createCloudWorkspaceSync } from "../src/features/persistence/cloudWorkspaceSync.js";
import { applyWorkspaceSources, captureRecoverySources, recoverWorkspaceSources, WORKSPACE_RECOVERY_KEY } from "../src/features/backup/workspaceRecovery.js";
import { claimWorkspaceOwner } from "../src/features/persistence/workspaceOwnerBinding.js";
import { previewBackupRestore } from "../src/features/backup/restorePreview.js";
import { preserveLegacyReportZeros } from "../src/utils/restockDetailItems.mjs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const espree = require("espree");
const { transformSync } = require("esbuild");
const origin = "https://synthetic-project.supabase.co";
const owner = "a1111b11-c1d1-4a11-8f11-ab11cd111e11";
const path = `users/${owner}/scout-reports/1792512000002-proof with spaces.png`;
const legacy = `${origin}/storage/v1/object/sign/receipt-images/${encodeURIComponent(path)}?token=expired-private-proof#old`;
const stable = createPrivateStorageReference({ bucket: "receipt-images", path }, origin);
const key = "et-tcg-beta-scout";
const core = "et-tcg-beta-data";
const priceKey = "et-tcg-market-price-cache";
const locks = { request: async (_name, _options, callback) => callback({ name: "synthetic-exclusive" }) };
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
class Storage {
  constructor(initial = {}) { this.data = new Map(Object.entries(initial)); this.block = null; }
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(name) { return this.data.get(name) ?? null; }
  setItem(name, value) { if (this.block?.(name)) throw new Error("synthetic write failure"); this.data.set(name, String(value)); }
  removeItem(name) { if (this.block?.(name)) throw new Error("synthetic write failure"); this.data.delete(name); }
}
const report = () => ({ id: "qa-proof-existing", productName: "Synthetic existing item", photoUrls: [legacy], photo_url: legacy, notes: "Existing reviewed note", price: 29.99, quantity: 2 });
const scout = () => ({ stores: [{ id: "qa-store", name: "QA existing store" }], reports: [report()] });
const registrySource = "legacy-restock-scout";

await check("all four approved buckets have stable exact object identities without credentials", () => {
  for (const bucket of ["receipts", "receipt-images", "product-submissions", "feedback-screenshots"]) {
    const result = createPrivateStorageReference({ bucket, path }, origin);
    assert.deepEqual(classifyReceiptReference(result, origin), { kind: "private", bucket, path });
    assert.equal(new URL(result).search, ""); assert.equal(new URL(result).hash, "");
    for (const mode of ["public", "sign", "authenticated"]) {
      assert.equal(normalizePrivateStorageReference(`${origin}/storage/v1/object/${mode}/${bucket}/${encodeURIComponent(path)}?token=old`, origin), result);
    }
  }
});
await check("unsafe paths, arbitrary buckets and untrusted project origins cannot become stable private references", () => {
  for (const candidate of ["", "../proof.png", "a/../proof.png", "a//proof.png", "a\\proof.png", "a/\u0000proof.png"]) {
    assert.throws(() => createPrivateStorageReference({ bucket: "receipt-images", path: candidate }, origin));
  }
  for (const project of ["", "http://external.test", "https://name:password@synthetic-project.supabase.co"]) assert.throws(() => createPrivateStorageReference({ bucket: "receipt-images", path }, project));
  assert.throws(() => createPrivateStorageReference({ bucket: "unknown-private-bucket", path }, origin));
});
await check("legacy private image projection is immutable and does not sanitize arbitrary notes or foreign links", () => {
  const foreign = legacy.replace("synthetic-project", "other-project");
  const input = { photoUrls: [legacy], nested: { receipt_image: legacy, gasReceiptImage: legacy }, notes: legacy, sourceUrl: legacy, arbitrary: { url: legacy }, photoUrl: foreign, price: 29.99 };
  const before = JSON.stringify(input);
  const result = projectPrivateImageReferences(input, origin);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(result.photoUrls, [stable]); assert.equal(result.nested.receipt_image, stable); assert.equal(result.nested.gasReceiptImage, stable);
  assert.equal(result.notes, legacy); assert.equal(result.sourceUrl, legacy); assert.equal(result.arbitrary.url, legacy); assert.equal(result.photoUrl, foreign); assert.equal(result.price, 29.99);
  for (const value of ["/assets/product.png", "data:image/png;base64,YQ==", "blob:https://code3tcg.app/qa", "https://external.test/image.png"]) assert.equal(normalizePrivateStorageReference(value, origin), value);
});
await check("cloud capture retains exact original storage bytes and all records while excluding old proof tokens", () => {
  const raw = JSON.stringify(scout());
  const storage = new Storage({ [key]: raw });
  const captured = captureWorkspaceSources(storage, { projectUrl: origin });
  assert.equal(storage.getItem(key), raw);
  const value = captured[registrySource].data;
  assert.equal(value.reports[0].photo_url, stable); assert.deepEqual(value.reports[0].photoUrls, [stable]);
  assert.equal(value.reports[0].id, "qa-proof-existing"); assert.equal(value.reports[0].price, 29.99); assert.equal(value.reports[0].notes, "Existing reviewed note");
  assert.equal(JSON.stringify(captured).includes("expired-private-proof"), false);
});
await check("security guards still pause arbitrary token-bearing notes, foreign images and unrecognized image fields", () => {
  for (const patch of [{ notes: legacy }, { photo_url: legacy.replace("synthetic-project", "other-project") }, { arbitraryUrl: legacy }, { password: "unrelated-private-secret" }]) {
    const raw = JSON.stringify({ reports: [{ ...report(), ...patch }] });
    const storage = new Storage({ [key]: raw });
    assert.throws(() => captureWorkspaceSources(storage, { projectUrl: origin }), { code: "SECURITY_REVIEW_REQUIRED" });
    assert.equal(storage.getItem(key), raw);
  }
});
await check("registered backup copies retain proof references without tokens and never rewrite device storage", async () => {
  const raw = JSON.stringify(scout());
  const storage = new Storage({ [key]: raw });
  const result = readCurrentBackupSources({ localStorage: storage, projectUrl: origin });
  assert.equal(result.sources[registrySource].reports[0].photo_url, stable);
  const backup = await createVerifiedBackup({ localStorage: storage, projectUrl: origin, applicationVersion: "qa" });
  assert.equal(JSON.stringify(backup).includes("expired-private-proof"), false);
  assert.equal(backup.backup.sections.find((entry) => entry.sourceId === registrySource).data.reports[0].photo_url, stable);
  assert.ok(["READY_FOR_FUTURE_RESTORE", "READY_WITH_WARNINGS"].includes((await previewBackupRestore(backup.json, { projectUrl: origin })).result));
  assert.equal(storage.getItem(key), raw);
});

function server() {
  const state = { revision: 0, sources: {}, updatedAt: null };
  const transport = {
    async authorize() {},
    async read() { return structuredClone({ format: "code3-workspace-v1", ...state }); },
    async write({ expectedRevision, sources }) {
      assert.equal(expectedRevision, state.revision);
      state.revision++; state.sources = structuredClone(sources); state.updatedAt = new Date().toISOString();
      return this.read();
    },
  };
  return { state, transport };
}
async function device(remote, initial) {
  const storage = new Storage(initial);
  await claimWorkspaceOwner({ storage, ownerId: owner, confirmed: true, locks });
  return { storage, sync: createCloudWorkspaceSync({ storage, ownerId: owner, transport: remote.transport, applySources: applyWorkspaceSources, locks, projectUrl: origin, idFactory: randomUUID }) };
}
await check("two simulated devices sync stable proofs, preserve existing items/prices and accept subsequent report edits", async () => {
  const remote = server();
  const initialCore = JSON.stringify({ items: [{ id: "qa-existing-inventory", quantity: 4, purchasePrice: 45.5, customField: "kept" }] });
  const initialPrices = JSON.stringify({ "qa-latest-price": 45.5 });
  const raw = JSON.stringify(scout());
  const a = await device(remote, { [key]: raw, [core]: initialCore, [priceKey]: initialPrices });
  assert.equal((await a.sync.sync({ allowApply: true })).status, "SYNCED");
  assert.equal(a.storage.getItem(key), raw, "capture/upload must retain original device bytes");
  assert.equal(JSON.stringify(remote.state.sources).includes("expired-private-proof"), false);
  const b = await device(remote, {});
  assert.equal((await b.sync.sync({ allowApply: true })).status, "SYNCED");
  assert.equal(JSON.parse(b.storage.getItem(key)).reports[0].photo_url, stable);
  assert.deepEqual(JSON.parse(b.storage.getItem(core)), JSON.parse(initialCore));
  const edited = JSON.parse(b.storage.getItem(key)); edited.reports[0].notes = "Reviewed on second synthetic device";
  b.storage.setItem(key, JSON.stringify(edited));
  assert.equal((await b.sync.sync({ allowApply: true })).status, "SYNCED");
  assert.equal((await a.sync.sync({ allowApply: true })).status, "SYNCED", "legacy-token compare-and-swap must agree with snapshot projection");
  const saved = JSON.parse(a.storage.getItem(key)).reports[0];
  assert.equal(saved.notes, edited.reports[0].notes); assert.equal(saved.photo_url, stable); assert.equal(saved.price, 29.99); assert.equal(saved.id, "qa-proof-existing");
  assert.equal(a.storage.getItem(core), initialCore); assert.equal(a.storage.getItem(priceKey), initialPrices);
  assert.equal((await a.sync.sync()).status, "SYNCED");
});
await check("legacy proof recovery preserves unrelated private device fields and detects stale edits", async () => {
  const raw = JSON.stringify({ ...scout(), localOnly: { password: "preserve-on-device" } });
  const storage = new Storage({ [key]: raw });
  const safeRaw = JSON.stringify(scout());
  const expectedSources = captureRecoverySources(storage, { projectUrl: origin });
  const nextSources = { [registrySource]: structuredClone(expectedSources[registrySource]) }; nextSources[registrySource].data.reports[0].notes = "Updated safely";
  await applyWorkspaceSources({ storage, expectedSources, nextSources, ownerId: owner, locks, projectUrl: origin });
  const updated = JSON.parse(storage.getItem(key));
  assert.equal(updated.localOnly.password, "preserve-on-device"); assert.equal(updated.reports[0].photo_url, stable); assert.equal(updated.reports[0].notes, "Updated safely");
  const changed = new Storage({ [key]: safeRaw });
  changed.setItem(key, JSON.stringify({ ...scout(), reports: [{ ...report(), notes: "newer device edit" }] }));
  await assert.rejects(applyWorkspaceSources({ storage: changed, expectedSources, nextSources, ownerId: owner, locks, projectUrl: origin }), { code: "STALE_SNAPSHOT" });
});
await check("interrupted legacy proof writes can recover through the same stable reference projection", async () => {
  const storage = new Storage({ [key]: JSON.stringify(scout()) });
  const expectedSources = captureWorkspaceSources(storage, { projectUrl: origin });
  const nextSources = structuredClone(expectedSources); nextSources[registrySource].data.reports[0].notes = "Committed QA update";
  let markerWrites = 0;
  storage.block = (name) => name === WORKSPACE_RECOVERY_KEY && ++markerWrites >= 3;
  await assert.rejects(applyWorkspaceSources({ storage, expectedSources, nextSources, ownerId: owner, locks, projectUrl: origin }));
  storage.block = null;
  assert.equal((await recoverWorkspaceSources({ storage, ownerId: owner, locks, projectUrl: origin })).status, "RECOVERED_COMMIT");
  assert.equal(JSON.parse(storage.getItem(key)).reports[0].notes, "Committed QA update");
  assert.equal(JSON.parse(storage.getItem(key)).reports[0].photo_url, stable);
});

function actualFunction(source, name) {
  const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
  let found;
  function visit(node) { if (!node || typeof node !== "object") return; if (node.type === "FunctionDeclaration" && node.id?.name === name) found = source.slice(...node.range); for (const child of Object.values(node)) if (Array.isArray(child)) child.forEach(visit); else if (child?.type) visit(child); }
  visit(ast); assert(found, `Missing actual ${name}`); return found;
}
const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
await check("actual feed detail component retains a category after context/proof edits and readback", () => {
  const source = fs.readFileSync(new URL("../src/components/RestockReportDetails.jsx", import.meta.url), "utf8");
  const code = transformSync(source, { loader: "jsx", format: "cjs", jsx: "automatic" }).code;
  const module = { exports: {} };
  const viewRequire = (id) => id === "react" ? React
    : id.endsWith(".css") ? {}
      : id.endsWith("PrivateReceipt.jsx") ? { PrivateStorageImage: ({ authorizePrivate, ...props }) => React.createElement("img", { ...props, "data-private-proof": authorizePrivate ? "true" : undefined }) }
        : id.endsWith("restockDetailItems.mjs") ? { preserveLegacyReportZeros }
          : require(id);
  new Function("require", "module", "exports", code)(viewRequire, module, module.exports);
  const Details = module.exports.default;
  const render = (report, photos = [], items = []) => renderToStaticMarkup(React.createElement(Details, {
    report, photos, items, stockLabel: "Stock seen", sourceLabel: "Discord screenshot", visibilityLabel: "Only me",
  }));
  for (const field of ["productCategory", "product_category", "productType", "product_type"]) {
    for (const photos of [[], [stable], ["http://127.0.0.1:5383/__qa-restock-reload/proof.png"]]) {
      const record = Object.freeze({ id: "qa-category-after-edit", [field]: "Pokemon TCG", note: "QA context edited after reload", sourceType: "text_screenshot", visibility: "private_from_map", verified: false, photoUrls: Object.freeze([...photos]) });
      const before = JSON.stringify(record);
      const html = render(record, photos);
      assert.match(html, /Pokemon TCG/); assert.match(html, /Category reported/);
      assert.match(html, /Individual products were not specified/);
      assert.match(html, /QA context edited after reload/);
      assert.doesNotMatch(html, /General shelf observation|Items have not been identified/);
      if (photos.length) assert.match(html, /data-private-proof="true"/, "Observation photos retain explicit authorization");
      assert.equal(JSON.stringify(record), before, "Rendering after readback cannot rewrite saved context, proof, privacy, or trust");
    }
  }
  const named = render({ productCategory: "Pokemon TCG" }, [], [{ productName: "Existing named item", quantity: 2, price: 0 }]);
  assert.match(named, /Existing named item/); assert.match(named, /1 reported item/);
  assert.doesNotMatch(named, /Category reported|Individual products were not specified/);
  assert.match(render({}), /General shelf observation/);
  assert.match(render({}, [stable]), /Items have not been identified/);
});
await check("actual saved report details show category-only observations without a false missing-details warning", () => {
  const ast = espree.parse(app, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
  let expression;
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "ConditionalExpression") {
      const code = app.slice(...node.range);
      if (code.startsWith("normalizeScoutReportItems(selectedScoutReport).length") && code.includes("Product or category details have not been added yet.")) expression = code;
    }
    for (const child of Object.values(node)) if (Array.isArray(child)) child.forEach(visit); else if (child?.type) visit(child);
  }
  visit(ast); assert(expression, "Extract the real saved-report details JSX");
  const helpers = new Function(`${actualFunction(app, "normalizeScoutReportItems")}\n${actualFunction(app, "scoutReportDetailItemSummary")}\nreturn { normalizeScoutReportItems, scoutReportDetailItemSummary };`)();
  const code = transformSync(`function DetailsRows({selectedScoutReport}) { return (${expression}); }`, { loader: "jsx", format: "cjs" }).code;
  const DetailsRows = new Function("React", "normalizeScoutReportItems", "scoutReportDetailItemSummary", "money", `${code}\nreturn DetailsRows;`)(React, helpers.normalizeScoutReportItems, helpers.scoutReportDetailItemSummary, (value) => `$${value}`);
  const categoryOnly = Object.freeze({ id: "qa-category-only", productCategory: "Pokemon TCG", visibility: "private_from_map", verified: false });
  const before = JSON.stringify(categoryOnly);
  const render = (report) => renderToStaticMarkup(React.createElement(DetailsRows, { selectedScoutReport: report }));
  for (const record of [categoryOnly, { product_category: "Pokemon TCG" }, { productType: "Pokemon TCG" }, { product_type: "Pokemon TCG" }]) {
    const markup = render(record);
    assert.match(markup, /Pokemon TCG/); assert.match(markup, /Individual products were not specified/);
    assert.doesNotMatch(markup, /Details needed|Product or category details have not been added yet/);
  }
  assert.match(render({}), /Details needed/);
  const itemMarkup = render({ itemsSeen: [{ productName: "Existing named item", quantity: 2 }] });
  assert.match(itemMarkup, /Existing named item/); assert.match(itemMarkup, /Qty 2/); assert.doesNotMatch(itemMarkup, /Category reported/);
  assert.equal(JSON.stringify(categoryOnly), before);
});
await check("actual report detail edits retain indirect screenshot provenance, all products and unverified state", () => {
  const environment = {
    scoutReportDetailsDraft: null, getScoutReportId: (report) => report.id,
    normalizeScoutReportItems: (report) => report.itemsSeen || [],
    normalizePrivateStorageReference, supabase: { supabaseUrl: origin },
    evaluateScoutReportReliability: (report) => ({ key: report.sourceType === "text_screenshot" ? "unusual-needs-review" : "incorrectly-upgraded", label: "Needs review", score: 26, reasons: ["Indirect evidence"] }),
  };
  const build = new Function(...Object.keys(environment), `${actualFunction(app, "scoutReportPhotoUrls")}\n${actualFunction(app, "buildScoutReportDetailsPatch")}\nreturn buildScoutReportDetailsPatch;`)(...Object.values(environment));
  const original = { ...report(), sourceType: "text_screenshot", source_type: "text_screenshot", proofType: "text_screenshot", sourceLabel: "Discord screenshot", source_label: "Discord screenshot", screenshotImportReviewed: true, screenshotSourcePlatform: "discord", verified: false, verification_status: "needs_review", itemsSeen: [{ productName: "QA product one" }, { productName: "QA product two" }] };
  const before = JSON.stringify(original);
  for (const sourceType of ["text_screenshot", "screenshot", "stock_photo", "manual", "receipt"]) {
    const result = build(original, { sourceType, detailNote: "Reviewed QA note", productName: "QA product one", proofUrl: legacy });
    for (const field of ["sourceType", "source_type", "proofType", "proof_type"]) assert.equal(result[field], "text_screenshot");
    assert.equal(result.id, original.id); assert.equal(result.itemsSeen.length, 2); assert.equal(result.itemsSeen[1].productName, "QA product two");
    assert.equal(result.sourceLabel, "Discord screenshot"); assert.equal(result.source_label, "Discord screenshot"); assert.equal(result.screenshotSourcePlatform, "discord");
    assert.equal(result.verified, false); assert.equal(result.verification_status, "needs_review"); assert.equal(result.confidence, "unusual-needs-review"); assert.deepEqual(result.photoUrls, [stable]);
  }
  assert.equal(JSON.stringify(original), before);
});
await check("actual additional-proof action also keeps Discord screenshot provenance and token-free photos", () => {
  const environment = {
    scoutReportActionDraft: null, normalizePrivateStorageReference, supabase: { supabaseUrl: origin },
    scoutSourceTypeLabel: () => "Shelf/sign photo",
    evaluateScoutReportReliability: (report) => ({ key: report.sourceType === "text_screenshot" ? "unusual-needs-review" : "incorrectly-upgraded", label: "Needs review", score: 26 }),
  };
  const build = new Function(...Object.keys(environment), `${actualFunction(app, "scoutReportPhotoUrls")}\n${actualFunction(app, "buildScoutReportActionPatch")}\nreturn buildScoutReportActionPatch;`)(...Object.values(environment));
  const original = { ...report(), sourceType: "text_screenshot", source_type: "text_screenshot", proofType: "text_screenshot", sourceLabel: "Discord screenshot", screenshotImportReviewed: true, verified: false };
  const result = build(original, { type: "proof", proofType: "stock_photo", proofUrl: legacy, note: "QA additional context" });
  assert.equal(result.sourceType, "text_screenshot"); assert.equal(result.proofType, "text_screenshot"); assert.equal(result.sourceLabel, "Discord screenshot"); assert.equal(result.source_label, "Discord screenshot");
  assert.equal(result.confidence, "unusual-needs-review"); assert.equal(result.verified, false); assert.equal(result.photoUrls[0], stable); assert.equal(result.id, original.id);
});
await check("feed and details-sheet edit actions hand the existing report to the canonical App editor", () => {
  const source = fs.readFileSync(new URL("../src/pages/Scout.jsx", import.meta.url), "utf8");
  const projected = Object.freeze({ id: "qa-existing-report", itemName: "QA item" });
  let handed;
  const edit = new Function("onEditReport", `${actualFunction(source, "startEditingReport")}\nreturn startEditingReport;`)((report) => { handed = report; return "canonical-details-editor"; });
  assert.equal(edit(projected), "canonical-details-editor"); assert.equal(handed, projected);
  assert.match(app, /onEditReport=\{openScoutReportAddDetails\}/);
  const canonical = Object.freeze({ ...projected, manualLocation: "QA manual location", storeName: "QA manual location", sourceType: "text_screenshot", screenshotImportReviewed: true, visibility: "private_from_map", verified: false });
  let permitted = true; const drafts = []; const opened = []; const errors = [];
  const environment = { selectedScoutReport: null, findScoutReportForDetail: (report) => { assert.equal(report.id, canonical.id); return canonical; }, canAddScoutReportDetails: () => permitted, createScoutReportDetailsDraft: (report) => ({ reportId: report.id }), setScoutReportDetailsDraft: (draft) => drafts.push(draft), openScoutReportDetail: (report, options) => opened.push({ report, options }), showErrorToast: (...args) => errors.push(args) };
  const open = new Function(...Object.keys(environment), `${actualFunction(app, "openScoutReportAddDetails")}\nreturn openScoutReportAddDetails;`)(...Object.values(environment));
  open(projected); assert.equal(opened.length, 1); assert.equal(opened[0].report, canonical); assert.equal(opened[0].options.focus, "details"); assert.equal(drafts[0].reportId, canonical.id);
  permitted = false; open(projected); assert.equal(opened.length, 1); assert.equal(errors.length, 1);
});
await check("actual Scout upload stores stable object identity without creating a persistent signed URL", async () => {
  const calls = []; let saved;
  const fake = { supabaseUrl: origin, storage: { from(bucket) { return { async upload(objectPath, file, options) { calls.push({ bucket, objectPath, file, options }); return { error: null }; } }; } } };
  const environment = { BETA_LOCAL_MODE: false, blockGuestSave: () => false, user: { id: owner }, supabase: fake, PRIVATE_UPLOAD_BUCKET: "receipt-images", createPrivateStorageReference, showAppMessage: (message) => { throw new Error(message); } };
  const upload = new Function(...Object.keys(environment), `${actualFunction(app, "handleImageUpload")}\nreturn handleImageUpload;`)(...Object.values(environment));
  const file = { type: "image/png", name: "synthetic-proof.png" };
  await upload({ target: { files: [file] } }, (reference) => { saved = reference; }, "scout-reports");
  assert.equal(calls.length, 1); assert.equal(calls[0].bucket, "receipt-images"); assert.equal(calls[0].options.upsert, false);
  assert.deepEqual(classifyReceiptReference(saved, origin), { kind: "private", bucket: "receipt-images", path: calls[0].objectPath });
  assert.equal(new URL(saved).search, "");
});
await check("every existing non-Scout upload folder keeps its signed preview and owner-scoped object path", async () => {
  const calls = []; const signed = []; const saved = [];
  const fake = { supabaseUrl: origin, storage: { from(bucket) { return {
    async upload(objectPath, file, options) { calls.push({ bucket, objectPath, file, options }); return { error: null }; },
    async createSignedUrl(objectPath, expiresIn) { const url = `${origin}/storage/v1/object/sign/${bucket}/${objectPath}?token=existing-shared-preview`; signed.push({ bucket, objectPath, expiresIn, url }); return { data: { signedUrl: url }, error: null }; },
  }; } } };
  const environment = { BETA_LOCAL_MODE: false, blockGuestSave: () => false, user: { id: owner }, supabase: fake, PRIVATE_UPLOAD_BUCKET: "receipt-images", PRIVATE_UPLOAD_SIGNED_URL_SECONDS: 60 * 60 * 24 * 7, createPrivateStorageReference, showAppMessage: (message) => { throw new Error(message); } };
  const upload = new Function(...Object.keys(environment), `${actualFunction(app, "handleImageUpload")}\nreturn handleImageUpload;`)(...Object.values(environment));
  const file = { type: "image/png", name: "existing-item-photo.png" };
  for (const folder of ["catalog-products", "vault-items", "item-photos", "sales", "expenses", "gas", "vault-receipts", "inventory", undefined]) {
    await upload({ target: { files: [file] } }, (reference) => saved.push(reference), folder);
    const call = calls.at(-1); const preview = signed.at(-1);
    assert.equal(call.bucket, "receipt-images"); assert.equal(call.options.upsert, false);
    assert.ok(call.objectPath.startsWith(`users/${owner}/${folder || "misc"}/`));
    assert.equal(preview.objectPath, call.objectPath); assert.equal(preview.expiresIn, 604800);
    assert.equal(saved.at(-1), preview.url, "The exact existing signed-link contract remains unchanged");
  }
  assert.equal(calls.length, 9); assert.equal(signed.length, 9); assert.equal(saved.length, 9);
});
await check("upload failures and MIME/account guards never create a successful proof or preview", async () => {
  const file = { type: "image/png", name: "synthetic-proof.png" };
  for (const scenario of ["not-image", "guest", "unsigned", "upload-error", "sign-error"]) {
    const calls = []; const saved = []; const messages = [];
    const fake = { supabaseUrl: origin, storage: { from() { return {
      async upload() { calls.push("upload"); return { error: scenario === "upload-error" ? { message: "Synthetic failure" } : null }; },
      async createSignedUrl() { calls.push("sign"); return { data: null, error: { message: "Synthetic sign failure" } }; },
    }; } } };
    const environment = { BETA_LOCAL_MODE: false, blockGuestSave: () => scenario === "guest", user: scenario === "unsigned" ? null : { id: owner }, supabase: fake, PRIVATE_UPLOAD_BUCKET: "receipt-images", PRIVATE_UPLOAD_SIGNED_URL_SECONDS: 604800, createPrivateStorageReference, showAppMessage: (message) => messages.push(message) };
    const upload = new Function(...Object.keys(environment), `${actualFunction(app, "handleImageUpload")}\nreturn handleImageUpload;`)(...Object.values(environment));
    await upload({ target: { files: [scenario === "not-image" ? { ...file, type: "text/plain" } : file] } }, (reference) => saved.push(reference), scenario === "sign-error" ? "catalog-products" : "scout-reports");
    assert.equal(saved.length, 0, scenario);
    assert.deepEqual(calls, scenario === "upload-error" ? ["upload"] : scenario === "sign-error" ? ["upload", "sign"] : [], scenario);
    if (scenario !== "guest") assert.equal(messages.length, 1, scenario);
  }
});
await check("actual image display authorizes canonical private locators and explicit legacy proof without a direct fallback", () => {
  const source = fs.readFileSync(new URL("../src/components/PrivateReceipt.jsx", import.meta.url), "utf8");
  const jsx = actualFunction(source, "PrivateStorageImage");
  const compiled = transformSync(jsx, { loader: "jsx", format: "cjs" }).code;
  const AuthorizedArtwork = Symbol("AuthorizedArtwork");
  const render = new Function("classifyReceiptReference", "supabase", "AuthorizedArtwork", "React", `${compiled}\nreturn PrivateStorageImage;`)(classifyReceiptReference, { supabaseUrl: origin }, AuthorizedArtwork, { createElement: (type, props) => ({ type, props }) });
  for (const bucket of ["receipts", "receipt-images", "product-submissions", "feedback-screenshots"]) {
    const locator = createPrivateStorageReference({ bucket, path }, origin);
    assert.equal(render({ src: locator, alt: "QA proof" }).type, AuthorizedArtwork);
    const old = `${origin}/storage/v1/object/sign/${bucket}/${encodeURIComponent(path)}?token=expired-private-proof`;
    assert.equal(render({ src: old, alt: "QA proof", authorizePrivate: true }).type, AuthorizedArtwork);
  }
  const foreign = stable.replace("synthetic-project.supabase.co", "foreign-project.supabase.co");
  assert.equal(classifyReceiptReference(foreign, origin).kind, "invalid");
  assert.equal(render({ src: foreign }).type, AuthorizedArtwork, "a foreign authenticated locator never falls back to an image request");
  assert.equal(render({ src: "/assets/product.png" }).type, "img");
  assert.match(source, /onAuthStateChange/); assert.match(source, /next\.expiresAt - Date\.now\(\) - 15_000/);
});
await check("generic legacy signed artwork retains its exact URL while legacy receipts remain authorized", () => {
  const source = fs.readFileSync(new URL("../src/components/PrivateReceipt.jsx", import.meta.url), "utf8");
  const compiled = transformSync(actualFunction(source, "PrivateStorageImage"), { loader: "jsx", format: "cjs" }).code;
  const AuthorizedArtwork = Symbol("AuthorizedArtwork");
  const render = new Function("classifyReceiptReference", "supabase", "AuthorizedArtwork", "React", `${compiled}\nreturn PrivateStorageImage;`)(classifyReceiptReference, { supabaseUrl: origin }, AuthorizedArtwork, { createElement: (type, props) => ({ type, props }) });
  for (const bucket of ["receipt-images", "product-submissions", "feedback-screenshots"]) {
    for (const mode of ["public", "sign"]) {
      const src = `${origin}/storage/v1/object/${mode}/${bucket}/${encodeURIComponent(path)}?token=existing-artwork-token`;
      const image = render({ src, alt: "Existing product artwork" });
      assert.equal(image.type, "img"); assert.equal(image.props.src, src);
      assert.equal(Object.hasOwn(image.props, "authorizePrivate"), false);
    }
  }
  assert.equal(render({ src: legacy.replace("/receipt-images/", "/receipts/") }).type, AuthorizedArtwork);
  assert.equal(render({ src: "https://external.test/catalog.png", authorizePrivate: true }).type, "img");
});
console.log(`Stock proof references: ${checks} checks passed. Simulated storage/accounts only; no live service or browser requests.`);
