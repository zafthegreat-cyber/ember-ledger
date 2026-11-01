import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildCloudConflictDifferences, cloudSavingPresentation, conflictTime } from "../src/features/persistence/cloudReviewPresentation.mjs";
import { collectionCopyDetails } from "../src/utils/collectionCopyDetails.mjs";

const source = data => ({ schemaVersion: 1, data });
test("offline and pending statuses distinguish automatic retry from completed saving", () => {
  for (const status of ["OFFLINE", "PENDING", "REVISION_CONFLICT"]) {
    const presentation = cloudSavingPresentation({ status }, true);
    assert.equal(presentation.mode, "Automatic retry");
    assert.doesNotMatch(presentation.title, /Saved to your account/);
    assert.match(presentation.detail, /while it is open/);
  }
});
test("conflict, account, and validation failures require review", () => {
  for (const status of ["CONFLICT", "AUTH_REQUIRED", "ACCESS_REQUIRED", "CLOUD_VALIDATION_FAILED", "INVALID_ACKNOWLEDGEMENT", "CLOUD_NOT_CONFIGURED", "ERROR"]) {
    const presentation = cloudSavingPresentation({ status });
    assert.doesNotMatch(presentation.mode, /Automatic retry/);
    assert.match(presentation.detail, /preserved|remain|not been replaced|Existing/i);
  }
});
test("device storage failures never promise a verified local save", () => {
  for (const status of ["LOCAL_TRACKING_FAILED", "DEVICE_SAVE_FAILED", "PAYLOAD_WRITE_FAILED", "QuotaExceededError", "RECOVERY_REQUIRED"]) {
    const presentation = cloudSavingPresentation({ status });
    assert.equal(presentation.title, "Device saving needs attention");
    assert.match(presentation.detail, /has not been verified/);
  }
});
test("paused saving does not promise automatic retry", () => {
  const presentation = cloudSavingPresentation({ status: "OFFLINE" }, false);
  assert.equal(presentation.mode, "Resume to sync");
  assert.equal(cloudSavingPresentation({ status: "SYNCED" }).mode, "Last save confirmed");
});
test("field comparison pairs records by stable ID, including reordered arrays", () => {
  const before = source({ items: [{ id: "a", name: "First", quantity: 2 }, { id: "b", name: "Second", quantity: 1 }] });
  const after = source({ items: [{ id: "b", name: "Second", quantity: 1 }, { id: "a", name: "First", quantity: 4 }] });
  const differences = buildCloudConflictDifferences(before, after);
  const quantity = differences.rows.find(row => row.path.endsWith("quantity"));
  assert.match(quantity.path, /First \[a\]/); assert.equal(quantity.device, "2"); assert.equal(quantity.cloud, "4");
  assert.equal(differences.rows.some(row => row.path.endsWith("name")), false);
  assert.ok(differences.rows.some(row => row.path.endsWith("Record order")));
});
test("added records, nulls, blank fields and schema changes are explicit", () => {
  const differences = buildCloudConflictDifferences(source({ items: [], note: "", value: null }), { schemaVersion: 2, data: { items: [{ id: "new", name: "Added" }], note: "New note", value: 0 } });
  assert.ok(differences.rows.some(row => row.path === "Schema version"));
  assert.ok(differences.rows.some(row => row.device === "Not present" && /Added/.test(row.path)));
  assert.ok(differences.rows.some(row => row.device === "Blank" && row.cloud === "New note"));
  assert.ok(differences.rows.some(row => row.device === "Not recorded" && row.cloud === "0"));
});
test("sensitive field values are hidden and source objects stay unchanged", () => {
  const device = source({ apiKey: "synthetic-private-a", nested: { access_token: "synthetic-token-a" }, quantity: 2 });
  const cloud = source({ apiKey: "synthetic-private-b", nested: { access_token: "synthetic-token-b" }, quantity: 3 });
  const original = JSON.stringify(device);
  const result = JSON.stringify(buildCloudConflictDifferences(device, cloud));
  assert.doesNotMatch(result, /synthetic-private|synthetic-token/); assert.match(result, /Hidden sensitive field/); assert.equal(JSON.stringify(device), original);
});
test("large comparisons and long values use a clearly limited preview", () => {
  const left = source(Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`field${index}`, "x".repeat(800)])));
  const right = source(Object.fromEntries(Array.from({ length: 200 }, (_, index) => [`field${index}`, "changed"])));
  const result = buildCloudConflictDifferences(left, right, { maxRows: 10, maxVisited: 30 });
  assert.equal(result.rows.length, 10); assert.equal(result.limited, true); assert.equal(result.truncated, true); assert.ok(result.rows[0].device.length < 300);
});
test("record timestamps are compared without inventing missing or invalid times", () => {
  const result = buildCloudConflictDifferences(source([{ id: "a", updatedAt: "2026-10-25T14:00:00Z" }]), source([{ id: "a", updatedAt: "2026-10-25T16:00:00Z" }]));
  assert.equal(result.deviceUpdatedAt, "2026-10-25T14:00:00Z"); assert.equal(result.cloudUpdatedAt, "2026-10-25T16:00:00Z");
  assert.equal(conflictTime("invalid"), "Not recorded"); assert.notEqual(conflictTime(result.cloudUpdatedAt), "Not recorded");
});
test("duplicate IDs are compared positionally rather than silently losing a record", () => {
  const result = buildCloudConflictDifferences(source([{ id: "same", quantity: 1 }, { id: "same", quantity: 2 }]), source([{ id: "same", quantity: 1 }, { id: "same", quantity: 4 }]));
  assert.equal(result.rows.length, 1); assert.match(result.rows[0].path, /Entry 2/); assert.equal(result.rows[0].cloud, "4");
});
test("copy summaries preserve distinct notes, location, printing, language and grade", () => {
  const details = collectionCopyDetails({ printing: "Reverse holo", language: "Japanese", conditionName: "Played", grade: "8", gradingCompany: "Example grader", physicalLocation: "Trade box", collectorNotes: "Keep this gift copy" });
  assert.match(details.identity, /Reverse holo.*Japanese.*Played.*Example grader 8/); assert.equal(details.storage, "Trade box"); assert.equal(details.notes, "Keep this gift copy");
});

const directory = resolve("artifacts/qa/cloud-review-100");
await mkdir(directory, { recursive: true });
const output = resolve(directory, "components-test.mjs");
await build({ stdin: { resolveDir: resolve("."), contents: `export {default as Differences} from './src/features/persistence/CloudConflictDifferences.jsx'; export {PortfolioItemGrid} from './src/components/CollectionPortfolioViews.jsx';` }, bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic", loader: { ".css": "empty" }, outfile: output, plugins: [{ name: "unrelated-ui-placeholders", setup(builder) { builder.onLoad({ filter: /ItemPhoto\.jsx$/ }, () => ({ contents: "export default function ItemPhoto(){return null}", loader: "jsx" })); builder.onLoad({ filter: /OperationsUI\.jsx$/ }, () => ({ contents: "export const BottomSheet = () => null;", loader: "jsx" })); } }] });
const { Differences, PortfolioItemGrid } = await import(pathToFileURL(output).href);
test("actual conflict component renders semantic fields, timestamps and whole-group warning", () => {
  const html = renderToStaticMarkup(React.createElement(Differences, { item: { displayName: "Collection", device: source([{ id: "a", quantity: 2 }]), cloud: source([{ id: "a", quantity: 4 }]) }, revision: 8, cloudSavedAt: "2026-10-25T16:00:00Z" }));
  assert.match(html, /Cloud version 8/); assert.match(html, /scope="col">This device/); assert.match(html, /quantity/); assert.match(html, /applies the whole group/); assert.match(html, /tabindex="0"/);
});
test("actual compact collection rows expose separate copy descriptions with linked IDs", () => {
  const html = renderToStaticMarkup(React.createElement(PortfolioItemGrid, { mode: "list", items: [{ id: "a", name: "Same card", physicalLocation: "Blue binder", notes: "Gift copy", language: "English" }, { id: "b", name: "Same card", physicalLocation: "Trade box", notes: "Corner wear", language: "Japanese" }] }));
  assert.match(html, /data-mode="list"/); assert.match(html, /Storage: Blue binder/); assert.match(html, /Note: Gift copy/); assert.match(html, /Storage: Trade box/); assert.match(html, /Note: Corner wear/);
  const descriptions = [...html.matchAll(/aria-describedby="([^"]+)"/g)].map(match => match[1]); assert.equal(new Set(descriptions).size, 2);
  for (const id of descriptions) assert.ok(html.includes(`id="${id}"`));
});
