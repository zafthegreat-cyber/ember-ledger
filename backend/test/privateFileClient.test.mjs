import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { createPrivateFileClient, verifyPrivateFileBackup } from "../../src/features/privateFiles/privateFileClient.js";

test("client uses protected owner routes, no-store and cancellable requests", async () => {
  const calls = [];
  const client = createPrivateFileClient({ request: async (...args) => { calls.push(args); return Response.json({ ok: true, files: [] }); } });
  const signal = new AbortController().signal;
  assert.deepEqual(await client.list("PURCHASE", "record/id", signal), []);
  assert.equal(calls[0][0], "/api/code3/private-files/records/PURCHASE/record%2Fid");
  assert.equal(calls[0][1].cache, "no-store");
  assert.equal(calls[0][1].signal, signal);
});

test("client fails closed on storage errors and malformed successful lists", async () => {
  const unavailable = createPrivateFileClient({ request: async () => Response.json({ ok: false, error: { code: "private_files_not_active", message: "Storage unavailable" } }, { status: 503 }) });
  await assert.rejects(unavailable.list("PURCHASE", "id"), (error) => error.code === "private_files_not_active" && error.message === "Storage unavailable");
  const malformed = createPrivateFileClient({ request: async () => Response.json({ ok: true }) });
  await assert.rejects(malformed.list("PURCHASE", "id"), /could not be verified/);
});

test("invalid upload type and size cause zero requests", async () => {
  let count = 0;
  const client = createPrivateFileClient({ request: async () => { count++; return Response.json({ ok: true }); } });
  for (const file of [new File([], "empty.png", { type: "image/png" }), new File(["<svg/>"], "bad.svg", { type: "image/svg+xml" }), { size: 8 * 1024 * 1024 + 1 }]) await assert.rejects(client.upload("PURCHASE", "id", file));
  assert.equal(count, 0);
});

test("upload and delete send bounded expected metadata, without caller-controlled storage paths", async () => {
  const calls = [];
  const client = createPrivateFileClient({ request: async (...args) => { calls.push(args); return Response.json({ ok: true, file: { id: "new" }, result: { id: "old" } }); } });
  const file = new File(["fake image body"], "receipt #1.png", { type: "image/png" });
  assert.equal((await client.upload("PURCHASE", "id", file)).id, "new");
  assert.match(calls[0][0], /name=receipt%20%231.png$/);
  assert.equal(calls[0][1].body, file);
  await client.remove({ id: "old", sha256: "digest" });
  assert.equal(calls[1][1].body, '{"sha256":"digest"}');
});

test("download verifies actual bytes and rejects altered or truncated responses", async () => {
  const bytes = Buffer.from("synthetic bytes");
  const file = { id: "file", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  const client = createPrivateFileClient({ request: async () => new Response(bytes) });
  assert.equal((await client.download(file)).size, bytes.length);
  await assert.rejects(client.download({ ...file, size: bytes.length - 1 }), /integrity check/);
  const altered = createPrivateFileClient({ request: async () => new Response("changed bytes!!") });
  await assert.rejects(altered.download(file), /integrity check/);
});

test("export does not promote unverified bytes to a successful backup", async () => {
  const client = createPrivateFileClient({ request: async () => Response.json({ ok: true, verified: false, backup: {} }) });
  await assert.rejects(client.exportBackup(), /could not be verified/);
});

test("browser verifies each actual file and manifest before accepting an export or restore preview", async () => {
  const bytes = Buffer.from("byte-inclusive backup fixture");
  const file = { id: "10000000-0000-4000-8000-000000000001", originalName: "receipt.png", mimeType: "image/png", size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"), relatedRecordType: "PURCHASE", relatedRecordId: "20000000-0000-4000-8000-000000000002",
    createdAt: "2026-09-16T12:00:00Z", retainUntil: "2026-09-23T12:00:00Z", deletedAt: null, bytesBase64: bytes.toString("base64") };
  const payload = { format: "code3-private-files-v1", files: [file], exportedAt: "2026-09-16T12:00:00Z", omittedDeletedCount: 0 };
  const backup = { ...payload, sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
  assert.equal(await verifyPrivateFileBackup(backup), backup);
  const valid = createPrivateFileClient({ request: async () => Response.json({ ok: true, verified: true, backup }) });
  assert.deepEqual(await valid.exportBackup(), backup);
  for (const changed of [{ ...backup, sha256: "wrong" }, { ...backup, files: [{ ...file, bytesBase64: null }] }, { ...backup, files: [{ ...file, size: file.size + 1 }] }, { ...backup, files: [file, file] }]) {
    const forged = createPrivateFileClient({ request: async () => Response.json({ ok: true, verified: true, backup: changed }) });
    await assert.rejects(forged.exportBackup());
  }
  let calls = 0;
  const client = createPrivateFileClient({ request: async () => { calls++; return Response.json({ ok: true }); } });
  await assert.rejects(client.previewRestore({ ...backup, files: [{ ...file, bytesBase64: "AAAA" }] }));
  assert.equal(calls, 0);
});

test("recovery sends exact preview identity/digest and ephemeral proof", async () => {
  let call;
  const client = createPrivateFileClient({ request: async (...args) => { call = args; return Response.json({ ok: true, result: { restoredCount: 2 } }); } });
  const result = await client.applyRestore({ planId: "plan", sha256: "exact-digest" }, "ephemeral-grant");
  assert.equal(result.restoredCount, 2);
  assert.equal(call[1].body, '{"planId":"plan","sha256":"exact-digest","proof":"ephemeral-grant"}');
});
