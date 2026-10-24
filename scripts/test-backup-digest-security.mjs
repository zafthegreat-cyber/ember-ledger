import assert from "node:assert/strict";
import { canonicalStringify } from "../src/features/backup/canonicalJson.js";
import { sealBackupEnvelope, verifyBackupEnvelope } from "../src/features/backup/backupFormat.js";
import { findProhibitedData, sanitizeBackupData } from "../src/features/backup/backupSecurity.js";
import { previewBackupRestore } from "../src/features/backup/restorePreview.js";
import { createVerifiedWorkspaceSnapshotBackup, planWorkspaceRestore } from "../src/features/backup/workspaceRestorePlan.js";

// A fixed real export that previously failed intermittently as timestamps changed:
// its SHA-256 manifest digest contains a Luhn-valid card-like digit substring.
const sources = {
  "legacy-core-business": { schemaVersion: 0, data: { items: [{ id: "cloud-version", name: "Selected cloud revision" }] } },
  "safe-ui-preferences": { schemaVersion: 1, data: { "et-tcg-app-theme": "dark" } },
};
const exported = await createVerifiedWorkspaceSnapshotBackup(sources, { createdAt: "2026-10-20T14:51:00.123Z" });
const backup = exported.backup;
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
const scannerOptions = (value) => ({ verifiedBackupManifestHash: value.manifest.manifestHash });
const paths = (value, options) => findProhibitedData(value, options).map((match) => match.path);
const ready = (preview) => ["READY_FOR_FUTURE_RESTORE", "READY_WITH_WARNINGS"].includes(preview.result);

await check("fixed real digest is rejected by the general scanner but accepted after verified backup integrity", async () => {
  assert.equal(exported.verified, true);
  assert.ok(paths(backup).includes("$.manifest.manifestHash"), "fixture must exercise the original false positive");
  const verification = await verifyBackupEnvelope(backup);
  assert.equal(verification.valid, true);
  assert.deepEqual(paths(backup, { verifiedBackupManifestHash: verification.manifestHash }), []);
  const preview = await previewBackupRestore(exported.json);
  assert.equal(ready(preview), true, JSON.stringify(preview.errors));
  assert.deepEqual(preview.prohibitedFields, []);
});

await check("recovery preview adds missing records without altering the existing device bytes", async () => {
  const existingRaw = JSON.stringify({ items: [{ id: "existing", name: "Keep existing" }] });
  const storage = { getItem: (key) => key === "et-tcg-beta-data" ? existingRaw : null };
  const result = await planWorkspaceRestore(exported.json, { storage });
  assert.equal(result.plan.addedRecords, 1);
  assert.deepEqual(result.nextSources["legacy-core-business"].data.items.map((row) => row.id), ["existing", "cloud-version"]);
  assert.equal(storage.getItem("et-tcg-beta-data"), existingRaw);
});

// Scanner-only shape fixture: this is deliberately not presented as a
// cryptographically verified backup. Real preview integrity is tested above.
const cardLikeDigest = `${"a".repeat(16)}4111111111111111${"b".repeat(32)}`;
function digestShape() {
  const value = structuredClone(backup);
  value.manifest.manifestHash = cardLikeDigest;
  value.integrity.manifestHash = cardLikeDigest;
  for (let index = 0; index < value.sections.length; index++) {
    value.sections[index].sha256 = cardLikeDigest;
    value.manifest.sections[index].sha256 = cardLikeDigest;
  }
  return value;
}

await check("only the four derived digest locations can bypass card-substring detection", () => {
  const value = digestShape();
  const before = canonicalStringify(value);
  assert.equal(paths(value).length, 2 + 2 * value.sections.length);
  assert.deepEqual(paths(value, scannerOptions(value)), []);
  assert.equal(canonicalStringify(value), before, "inspection never rewrites the backup");
});

await check("general data and sanitization keep rejecting hash-shaped payment-like strings", () => {
  const value = { manifestHash: cardLikeDigest, sha256: cardLikeDigest, nested: { sha256: cardLikeDigest } };
  assert.equal(paths(value).length, 3);
  assert.equal(paths(value, { verifiedBackupManifestHash: cardLikeDigest }).length, 3);
  assert.equal(sanitizeBackupData(value).excludedPaths.length, 3);
});

await check("record fields and unknown metadata remain scanned even with a verified digest context", () => {
  const value = digestShape();
  value.sections[0].data.sha256 = cardLikeDigest;
  value.sections[0].data.manifest = { manifestHash: cardLikeDigest };
  value.manifest.sections[0].extraDigest = cardLikeDigest;
  value.integrity.extraDigest = cardLikeDigest;
  value["manifest.manifestHash"] = cardLikeDigest;
  value.manifest["sections[0].sha256"] = cardLikeDigest;
  const found = paths(value, scannerOptions(value));
  assert.ok(found.includes("$.sections[0].data.sha256"));
  assert.ok(found.includes("$.sections[0].data.manifest.manifestHash"));
  assert.ok(found.includes("$.manifest.sections[0].extraDigest"));
  assert.ok(found.includes("$.integrity.extraDigest"));
  assert.ok(found.includes("$.manifest.manifestHash"), "a dotted user key cannot inherit the actual manifest field exemption");
  assert.ok(found.includes("$.manifest.sections[0].sha256"), "a bracket-shaped user key cannot inherit the index field exemption");
});

await check("mismatched or malformed digest context never exempts payment-like strings", () => {
  for (const mutate of [
    (value) => { value.integrity.manifestHash = "c".repeat(64); },
    (value) => { value.integrity.algorithm = "not-sha256"; },
    (value) => { value.formatVersion = 2; },
    (value) => { value.manifest.sections[0].sourceId = "different-source"; },
    (value) => { value.manifest.sections[0].recordCount++; },
    (value) => { value.manifest.sections[0].sha256 = "c".repeat(64); },
  ]) {
    const value = digestShape(); mutate(value);
    assert.ok(paths(value, { verifiedBackupManifestHash: cardLikeDigest }).includes("$.manifest.manifestHash"));
  }
  assert.ok(paths(digestShape(), { verifiedBackupManifestHash: "c".repeat(64) }).length > 0);
});

await check("signed credentials and non-SHA values cannot hide in derived digest fields", () => {
  for (const sensitive of [
    "https://storage.invalid/proof.png?token=synthetic-signature",
    "4111111111111111",
    `${cardLikeDigest}?token=synthetic-signature`,
  ]) {
    const value = digestShape();
    value.manifest.manifestHash = sensitive;
    value.integrity.manifestHash = sensitive;
    assert.ok(paths(value, { verifiedBackupManifestHash: sensitive }).includes("$.manifest.manifestHash"));
  }
});

await check("failed cryptographic integrity cannot grant a digest exemption during preview", async () => {
  const value = digestShape();
  const preview = await previewBackupRestore(JSON.stringify(value));
  assert.equal(preview.result, "CORRUPTED");
  assert.ok(preview.prohibitedFields.includes("$.manifest.manifestHash"));
});

await check("valid resealed backups still reject payment values and signed credentials in user records", async () => {
  for (const sensitive of [cardLikeDigest, "https://storage.invalid/proof.png?token=synthetic-signature"]) {
    const value = structuredClone(backup);
    value.sections.find((section) => section.sourceId === "legacy-core-business").data.items[0].note = sensitive;
    const sealed = await sealBackupEnvelope(value);
    assert.equal((await verifyBackupEnvelope(sealed)).valid, true);
    const preview = await previewBackupRestore(JSON.stringify(sealed));
    assert.equal(preview.result, "BLOCKED");
    assert.ok(preview.prohibitedFields.some((path) => path.endsWith(".data.items[0].note")));
  }
});

console.log(`Backup digest security: ${checks} checks passed; synthetic in-memory only.`);
