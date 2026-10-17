import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { LEGACY_BACKUP_MAX_BYTES, parseLegacyBetaBackup } from "../src/features/backup/legacyBackupValidation.js";

let assertions = 0;
const valid = { appName: "Ember & Tide", backupType: "local-beta", backupVersion: 2, data: { items: [{ id: "preserved-item", name: "Synthetic card" }], expenses: [], settings: {} } };
for (const payload of [valid, { ...valid, backupVersion: 1 }, { items: [] }, { data: { items: [] } }]) {
  assert.deepEqual(parseLegacyBetaBackup(JSON.stringify(payload)), payload); assertions += 1;
}
const rejected = [
  {}, { random: "not a backup" }, { data: {} }, { data: null }, { items: "invalid" }, { items: [null] },
  { items: [], sales: {} }, { items: [], scout: [] }, { items: [], scout: { stores: ["invalid"] } },
  { items: [], tidepoolCommunity: { comments: {} } }, { items: [], settings: [] },
  { items: [], backupVersion: 999 }, { items: [], backupType: "other" },
  { format: "code-3-backup", formatVersion: 1, sections: [], data: { items: [] } },
  { format: "other", items: [] }, { sections: [], items: [] }, [], null,
];
for (const payload of rejected) { assert.throws(() => parseLegacyBetaBackup(JSON.stringify(payload))); assertions += 1; }
for (const raw of ['{"items":', '{"items":[],"__proto__":{}}', `{"items":[],"padding":"${"x".repeat(LEGACY_BACKUP_MAX_BYTES)}"}`]) {
  assert.throws(() => parseLegacyBetaBackup(raw)); assertions += 1;
}

// Exercise the actual App upload handler with an asynchronous FileReader and no storage surface.
const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const start = app.indexOf("  function handleBackupFileUpload(event) {");
const end = app.indexOf("  function mergeById(", start);
assert.ok(start > 0 && end > start);
const readers = [];
let preview = { stale: true };
let message = "";
let summarized = 0;
const ownerData = { items: [{ id: "existing-record", cost: 500 }], auth: "untouched-sentinel" };
const before = JSON.stringify(ownerData);
const context = vm.createContext({
  parseLegacyBetaBackup, LEGACY_BACKUP_MAX_BYTES, backupImportReadRef: { current: 0 },
  setBackupImportPreview: value => { preview = value; },
  setBackupImportMessage: value => { message = value; },
  summarizeBackup: () => { summarized += 1; return []; },
  FileReader: class { constructor() { readers.push(this); } readAsText(file) { this.file = file; } },
  Error,
});
vm.runInContext(`${app.slice(start, end)}; this.upload = handleBackupFileUpload;`, context);
const upload = (raw, size = Buffer.byteLength(raw)) => {
  const event = { target: { files: [{ name: "synthetic.json", size }], value: "selected" } };
  context.upload(event);
  assert.equal(event.target.value, ""); assertions += 1;
  return readers.at(-1);
};
const oldRead = upload(JSON.stringify(valid));
assert.equal(preview, null); assertions += 1;
const rejectedRead = upload(JSON.stringify({ format: "code-3-backup", formatVersion: 1, sections: [] }));
rejectedRead.result = '{"format":"code-3-backup","formatVersion":1,"sections":[]}'; rejectedRead.onload();
assert.equal(preview, null); assert.match(message, /Preview restore/); assert.equal(summarized, 0); assertions += 3;
oldRead.result = JSON.stringify(valid); oldRead.onload();
assert.equal(preview, null, "A stale valid read cannot reinstate Replace after a rejected selection."); assertions += 1;
const goodRead = upload(JSON.stringify(valid)); goodRead.result = JSON.stringify(valid); goodRead.onload();
assert.deepEqual(preview.payload, valid); assert.equal(summarized, 1); assertions += 2;
upload("{}", LEGACY_BACKUP_MAX_BYTES + 1);
assert.equal(preview, null); assert.match(message, /10 MB/); assertions += 2;
const failedRead = upload("{}"); failedRead.onerror();
assert.equal(preview, null); assert.match(message, /could not be read/); assertions += 2;
assert.equal(JSON.stringify(ownerData), before); assertions += 1;
console.log(`Legacy backup validation passed (${assertions} assertions; incompatible/stale/error paths cannot produce an apply preview).`);
