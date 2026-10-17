import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import express from "express";

const require = createRequire(import.meta.url);
const { FilesystemPrivateFileStore } = require("../dist/privateFiles/filesystemStore.js");
const { PrivateFileService } = require("../dist/privateFiles/service.js");
const { validateBytes, digest } = require("../dist/privateFiles/validation.js");
const { createPrivateFilesRouter } = require("../dist/routes/privateFiles.routes.js");
const { createOwnerSecurity } = require("../dist/auth/ownerAuthorization.js");
const { createProtectedCors } = require("../dist/security/corsPolicy.js");
const NOW = Date.parse("2026-09-16T12:00:00Z");
const RECORD_ID = "10000000-0000-4000-8000-000000000001";
const principal = (subject = "owner", expiresAt = NOW / 1000 + 3600) => ({ subject, provider: "automated-test", issuedAt: NOW / 1000 - 60, expiresAt });
const owner = (subject = "owner", expiresAt) => ({ ownerSubject: `automated-test:${subject}`, principal: principal(subject, expiresAt) });
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVQImWMAAQAABQABDQottAAAAABJRU5ErkJggg==", "base64");
const upload = (bytes = PNG, extra = {}) => ({ name: "receipt.png", mimeType: "image/png", domain: "PURCHASE", recordId: RECORD_ID, bytes, ...extra });
const errorCode = (expected) => (error) => error.code === expected;

async function fixture(run, options = {}) {
  const root = await mkdtemp(join(tmpdir(), "code3-private-files-test-"));
  let currentTime = NOW;
  let accessible = true;
  let archivedAt = null;
  const records = { async getById(context, domain, id) { return accessible && context.ownerSubject === "automated-test:owner" && domain === "PURCHASE" && id === RECORD_ID ? { id, archivedAt } : null; } };
  const now = () => new Date(currentTime);
  const store = new FilesystemPrivateFileStore(root);
  const service = new PrivateFileService({ store, records, now, ...options });
  try { await run({ root, store, service, records, now, setTime: (value) => { currentTime = value; }, setAccessible: (value) => { accessible = value; }, setArchived: (value) => { archivedAt = value; } }); }
  finally {
    const target = resolve(root);
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes("code3-private-files-test-"));
    await rm(target, { recursive: true, force: true });
  }
}

test("private bytes survive new store/service instances with names and integrity intact", () => fixture(async ({ root, records, now, service }) => {
  const file = await service.upload(owner(), upload());
  const restarted = new PrivateFileService({ store: new FilesystemPrivateFileStore(root), records, now });
  const result = await restarted.read(owner(), file.id);
  assert.deepEqual(result.bytes, PNG);
  assert.equal(result.file.sha256, digest(PNG));
  assert.equal(result.file.originalName, "receipt.png");
  assert.equal("bytesBase64" in result.file, false);
  assert.equal("ownerSubject" in result.file, false);
  assert.equal((await restarted.list(owner(), "PURCHASE", RECORD_ID))[0].availability, "VERIFIED");
}));

test("content signatures support PNG, JPEG, WebP and PDF while rejecting mismatches", () => {
  assert.equal(validateBytes(PNG, "image/png"), "image/png");
  const jpeg = Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex");
  assert.equal(validateBytes(jpeg, "image/jpeg"), "image/jpeg");
  const webp = Buffer.from("524946460c000000574542505650384c00000000", "hex");
  assert.equal(validateBytes(webp, "image/webp"), "image/webp");
  assert.equal(validateBytes(Buffer.from("%PDF-1.7\n1 0 obj\nendobj\n%%EOF\n"), "application/pdf"), "application/pdf");
  for (const bytes of [Buffer.from("<svg>unsafe</svg>"), PNG.subarray(0, 30), Buffer.from("%PDF-1.7\nunfinished document")]) assert.throws(() => validateBytes(bytes, "image/png"), errorCode("file_type_invalid"));
  assert.throws(() => validateBytes(PNG, "application/pdf"), errorCode("file_type_invalid"));
  assert.throws(() => validateBytes(Buffer.alloc(0), "image/png"), errorCode("file_size_invalid"));
  assert.throws(() => validateBytes(Buffer.alloc(8 * 1024 * 1024 + 1), "image/png"), errorCode("file_size_invalid"));
});

test("invalid names and references cause zero persisted files", () => fixture(async ({ service, store }) => {
  for (const name of ["../receipt.png", "a\\b.png", "a\u0000.png", "", "x".repeat(181)]) await assert.rejects(service.upload(owner(), upload(PNG, { name })), errorCode("invalid_file_name"));
  for (const extra of [{ recordId: "../path" }, { domain: "FILE_ASSET" }, { domain: "UNKNOWN" }]) await assert.rejects(service.upload(owner(), upload(PNG, extra)), errorCode("invalid_file_reference"));
  assert.equal((await store.read(owner())).files.length, 0);
}));

test("owner isolation and record authorization apply to upload, list, download, delete and export", () => fixture(async ({ service, setAccessible, store }) => {
  const file = await service.upload(owner(), upload());
  await assert.rejects(service.upload(owner("other"), upload()), errorCode("file_record_unavailable"));
  await assert.rejects(service.list(owner("other"), "PURCHASE", RECORD_ID), errorCode("file_record_unavailable"));
  await assert.rejects(service.read(owner("other"), file.id), errorCode("file_not_found"));
  await assert.rejects(service.remove(owner("other"), file.id, file.sha256), errorCode("file_not_found"));
  assert.equal((await service.export(owner("other"))).files.length, 0);
  setAccessible(false);
  for (const action of [() => service.read(owner(), file.id), () => service.list(owner(), "PURCHASE", RECORD_ID), () => service.export(owner()), () => service.remove(owner(), file.id, file.sha256)]) await assert.rejects(action(), errorCode("file_record_unavailable"));
  assert.equal((await store.read(owner())).files.length, 1);
}));

test("expired or forged owner context cannot touch a store", () => fixture(async ({ service, root }) => {
  await assert.rejects(service.upload(owner("owner", NOW / 1000), upload()), errorCode("owner_required"));
  await assert.rejects(service.upload({ ...owner(), ownerSubject: "automated-test:someone-else" }, upload()), errorCode("owner_required"));
  assert.deepEqual(await readdir(root), []);
}));

test("archived record accepts reading old attachments but no new uploads", () => fixture(async ({ service, setArchived }) => {
  const file = await service.upload(owner(), upload());
  setArchived(new Date(NOW).toISOString());
  await assert.rejects(service.upload(owner(), upload()), errorCode("file_record_unavailable"));
  assert.deepEqual((await service.read(owner(), file.id)).bytes, PNG);
}));

test("retention and optimistic digest guard deletion; actual bytes are purged with a durable receipt", () => fixture(async ({ service, store, setTime }) => {
  const file = await service.upload(owner(), upload());
  await assert.rejects(service.remove(owner(), file.id, "wrong"), errorCode("file_changed"));
  await assert.rejects(service.remove(owner(), file.id, file.sha256), errorCode("file_retention_active"));
  setTime(NOW + 8 * 86400000);
  const refreshedOwner = owner("owner", (NOW + 9 * 86400000) / 1000);
  await service.remove(refreshedOwner, file.id, file.sha256);
  await assert.rejects(service.read(refreshedOwner, file.id), errorCode("file_not_found"));
  const state = await store.read(refreshedOwner);
  assert.equal(state.files[0].bytesBase64, null);
  assert.equal(state.receipts.at(-1).action, "DELETE");
  const backup = await service.export(refreshedOwner);
  assert.equal(backup.files.length, 0);
  assert.equal(backup.omittedDeletedCount, 1);
}));

test("missing bytes remain visible and prevent successful download or complete backup", () => fixture(async ({ service, root }) => {
  const file = await service.upload(owner(), upload());
  const path = join(root, digest(owner().ownerSubject), "files.json");
  const state = JSON.parse(await readFile(path, "utf8"));
  state.files[0].bytesBase64 = null;
  await writeFile(path, JSON.stringify(state));
  const listing = await service.list(owner(), "PURCHASE", RECORD_ID);
  assert.equal(listing[0].id, file.id);
  assert.equal(listing[0].availability, "UNAVAILABLE");
  await assert.rejects(service.read(owner(), file.id), errorCode("file_bytes_missing"));
  await assert.rejects(service.export(owner()), errorCode("file_bytes_missing"));
}));

test("same-size tampering fails integrity without silently repairing the file", () => fixture(async ({ service, root }) => {
  const file = await service.upload(owner(), upload());
  const path = join(root, digest(owner().ownerSubject), "files.json");
  const state = JSON.parse(await readFile(path, "utf8"));
  const changed = Buffer.from(PNG); changed[40] ^= 1;
  state.files[0].bytesBase64 = changed.toString("base64");
  const original = JSON.stringify(state); await writeFile(path, original);
  await assert.rejects(service.read(owner(), file.id), errorCode("file_integrity_failed"));
  await assert.rejects(service.export(owner()), errorCode("file_integrity_failed"));
  assert.equal(await readFile(path, "utf8"), original);
}));

test("corrupt manifests are preserved and cannot be normalized into an empty writable store", () => fixture(async ({ service, root }) => {
  await service.upload(owner(), upload());
  const path = join(root, digest(owner().ownerSubject), "files.json");
  await writeFile(path, "{broken private evidence");
  await assert.rejects(service.upload(owner(), upload()), errorCode("file_store_unreadable"));
  assert.equal(await readFile(path, "utf8"), "{broken private evidence");
}));

test("independent instances cannot overlap operations, and interrupted locks are never stolen", () => fixture(async ({ store, service, root }) => {
  let release;
  let entered;
  const ready = new Promise((resolve) => { entered = resolve; });
  const pending = store.transaction(owner(), async () => { entered(); await new Promise((resolve) => { release = resolve; }); });
  await ready;
  await assert.rejects(service.upload(owner(), upload()), errorCode("file_operation_pending"));
  const second = new FilesystemPrivateFileStore(root);
  await assert.rejects(second.read(owner()), errorCode("file_operation_pending"));
  release(); await pending;
  await writeFile(join(root, digest(owner().ownerSubject), "operation.lock"), "interrupted");
  await assert.rejects(service.export(owner()), errorCode("file_operation_pending"));
}));

test("failed transactions leave earlier bytes and revision unchanged", () => fixture(async ({ service, store }) => {
  await service.upload(owner(), upload());
  const before = await store.read(owner());
  await assert.rejects(store.transaction(owner(), async (state) => { state.files.length = 0; throw new Error("Injected failure"); }), /Injected failure/);
  assert.deepEqual(await store.read(owner()), before);
}));

test("8 MB encoded files verify without regex stack overflow and owner byte limit prevents a fifth file", () => fixture(async ({ service, store }) => {
  const large = Buffer.concat([PNG.subarray(0, -12), Buffer.alloc(8 * 1024 * 1024 - PNG.length), PNG.subarray(-12)]);
  for (let index = 0; index < 4; index++) await service.upload(owner(), upload(large));
  const files = await service.list(owner(), "PURCHASE", RECORD_ID);
  assert.equal(files.length, 4);
  assert.equal(files.every((file) => file.availability === "VERIFIED"), true);
  await assert.rejects(service.upload(owner(), upload()), errorCode("file_storage_limit"));
  assert.equal((await store.read(owner())).files.length, 4);
}));

test("byte-inclusive backup round trips through durable empty-destination recovery", () => fixture(async ({ service }) => {
  const original = await service.upload(owner(), upload());
  const backup = await service.export(owner());
  assert.equal(backup.files[0].bytesBase64, PNG.toString("base64"));
  assert.equal(JSON.stringify(backup).includes("ownerSubject"), false);
  await fixture(async ({ service: target, root, records, now, store }) => {
    const plan = await target.previewRestore(owner(), backup);
    assert.equal(plan.fileCount, 1);
    assert.equal(plan.totalBytes, PNG.length);
    await assert.rejects(target.applyRestore(owner(), plan.planId, plan.sha256, "wrong"), errorCode("file_restore_reauthentication_required"));
    assert.equal((await store.read(owner())).files.length, 0);
    await target.applyRestore(owner(), plan.planId, plan.sha256, "fresh-owner-challenge");
    const restarted = new PrivateFileService({ store: new FilesystemPrivateFileStore(root), records, now });
    assert.deepEqual((await restarted.read(owner(), original.id)).bytes, PNG);
    assert.equal((await store.read(owner())).receipts.at(-1).action, "RESTORE");
    await assert.rejects(target.applyRestore(owner(), plan.planId, plan.sha256, "fresh-owner-challenge"), errorCode("file_restore_plan_invalid"));
  }, { authorizeRestore: async (_owner, _plan, proof) => proof === "fresh-owner-challenge" });
}));

test("recovery needs configured fresh-auth adapter and a complete unmodified backup", () => fixture(async ({ service }) => {
  await service.upload(owner(), upload());
  const backup = await service.export(owner());
  await fixture(async ({ service: unavailable }) => { await assert.rejects(unavailable.previewRestore(owner(), backup), errorCode("file_restore_unavailable")); });
  await fixture(async ({ service: target, store }) => {
    const changed = structuredClone(backup); changed.files[0].size += 1;
    await assert.rejects(target.previewRestore(owner(), changed), errorCode("file_backup_integrity_failed"));
    const missing = structuredClone(backup); missing.files[0].bytesBase64 = null;
    const { sha256: _sha, ...payload } = missing; missing.sha256 = digest(JSON.stringify(payload));
    await assert.rejects(target.previewRestore(owner(), missing), errorCode("file_bytes_missing"));
    assert.equal((await store.read(owner())).files.length, 0);
  }, { authorizeRestore: async () => true });
}));

test("recovery preview discloses the latest retained deadline without shortening or extending sibling file policies", () => fixture(async ({ service }) => {
  await service.upload(owner(), upload());
  await service.upload(owner(), upload());
  const backup = await service.export(owner());
  backup.files[0].retainUntil = "2026-12-31T12:00:00.000Z";
  const { sha256: _hash, ...payload } = backup; backup.sha256 = digest(JSON.stringify(payload));
  await fixture(async ({ service: target, store }) => {
    const plan = await target.previewRestore(owner(), backup);
    assert.equal(plan.retainUntil, "2026-12-31T12:00:00.000Z");
    await target.applyRestore(owner(), plan.planId, plan.sha256, "proof");
    const saved = await store.read(owner());
    assert.equal(saved.files[0].retainUntil, "2026-12-31T12:00:00.000Z");
    assert.equal(saved.files[1].retainUntil, "2026-09-23T12:00:00.000Z");
  }, { authorizeRestore: async () => true });
}));

test("changed destination, account, hash and expired preview all prevent recovery", () => fixture(async ({ service }) => {
  await service.upload(owner(), upload()); const backup = await service.export(owner());
  await fixture(async ({ service: target, setTime }) => {
    const plan = await target.previewRestore(owner(), backup);
    await assert.rejects(target.applyRestore(owner("other"), plan.planId, plan.sha256, true), errorCode("file_restore_plan_invalid"));
    await assert.rejects(target.applyRestore(owner(), plan.planId, "wrong", true), errorCode("file_restore_plan_invalid"));
    setTime(NOW + 300001);
    await assert.rejects(target.applyRestore(owner(), plan.planId, plan.sha256, true), errorCode("file_restore_plan_invalid"));
  }, { authorizeRestore: async () => true });
  await fixture(async ({ service: target }) => {
    const plan = await target.previewRestore(owner(), backup);
    await target.upload(owner(), upload());
    await assert.rejects(target.applyRestore(owner(), plan.planId, plan.sha256, true), errorCode("file_restore_destination_changed"));
    await assert.rejects(target.previewRestore(owner(), backup), errorCode("file_restore_destination_not_empty"));
  }, { authorizeRestore: async () => true });
}));

async function withServer(service, run) {
  const security = createOwnerSecurity({ env: { CODE3_OWNER_SUBJECTS: "supabase:owner" }, runtimeKind: "production", now: () => NOW,
    identityProvider: { providerId: "supabase", isConfigured: () => true, async verifyAccessToken(token) { return ["owner", "other"].includes(token) ? { ok: true, principal: { ...principal(token), provider: "supabase" } } : { ok: false, reason: "invalid" }; } } });
  // Route principal uses supabase; adapt only the fixture repository owner, without bypassing route authorization.
  const app = express();
  app.use("/files", createProtectedCors({ env: { CODE3_CORS_ALLOWED_ORIGINS: "https://code3.example.test" }, runtimeKind: "production" }), createPrivateFilesRouter({ requireOwner: security.requireOwner, service }));
  const server = await new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("routes authenticate before parsing large/malformed bodies and remain unavailable by default", () => withServer(undefined, async (base) => {
  for (const path of ["/files/export", `/files/records/PURCHASE/${RECORD_ID}`, "/files/restore/preview"]) {
    const response = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{broken" });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal((await fetch(base + "/files/export", { headers: { Authorization: "Bearer other" } })).status, 403);
  assert.equal((await fetch(base + "/files/export", { headers: { Authorization: "Bearer owner" } })).status, 503);
  assert.equal((await fetch(base + "/files/export", { headers: { Authorization: "Bearer owner", Origin: "https://hostile.example" } })).status, 403);
}));

test("real HTTP upload/download/export/delete uses private headers and reports malformed requests", () => fixture(async ({ store, now }) => {
  const service = new PrivateFileService({ store, now, retentionDays: 0, records: { async getById(context, domain, id) { return context.ownerSubject === "supabase:owner" && domain === "PURCHASE" && id === RECORD_ID ? { id, archivedAt: null } : null; } } });
  await withServer(service, async (base) => {
    const headers = { Authorization: "Bearer owner" };
    const response = await fetch(`${base}/files/records/PURCHASE/${RECORD_ID}?name=receipt.png`, { method: "POST", headers: { ...headers, "Content-Type": "image/png" }, body: PNG });
    assert.equal(response.status, 201);
    const { file } = await response.json();
    const downloaded = await fetch(`${base}/files/${file.id}/bytes`, { headers });
    assert.equal(downloaded.status, 200);
    assert.match(downloaded.headers.get("content-disposition"), /^attachment;/);
    assert.equal(downloaded.headers.get("x-content-type-options"), "nosniff");
    assert.equal(downloaded.headers.get("cache-control"), "no-store");
    assert.match(downloaded.headers.get("content-security-policy"), /sandbox/);
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), PNG);
    const exported = await (await fetch(`${base}/files/export`, { headers })).json();
    assert.equal(exported.verified, true);
    assert.equal(exported.backup.files.length, 1);
    const malformed = await fetch(`${base}/files/${file.id}/delete`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{bad" });
    assert.equal(malformed.status, 400);
    const deleted = await fetch(`${base}/files/${file.id}/delete`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ sha256: file.sha256 }) });
    assert.equal(deleted.status, 200);
    assert.equal((await fetch(`${base}/files/${file.id}/bytes`, { headers })).status, 404);
  });
}));
