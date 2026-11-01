// Improvement #97: downloads and exports describe the private fields they will
// contain before the file is generated. Pure checks for the describer, a render
// check for the shared component, and a source audit that every export control
// in the app points at a disclosure.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { classifyExportFields, describeExport, EXPORT_KINDS, fieldsFromRows } from "../src/utils/exportDisclosure.mjs";
import { buildMileageExportRows, buildSalesExportRows, buildTaxRecordExportRows } from "../src/utils/businessTaxRecords.js";

test("field names are grouped into plain-language private categories", () => {
  const result = classifyExportFields(["id", "purchaser", "notes", "storageLocation", "purchasePrice", "listingUrl", "updatedAt", "certificationNumber", "email", "section", "Sale ID", "Original gross USD"]);
  const labels = Object.fromEntries(result.groups.map((group) => [group.label, group.fields]));
  assert.deepEqual(labels["record IDs"], ["id", "Sale ID"]);
  assert.deepEqual(labels["people's names"], ["purchaser"]);
  assert.deepEqual(labels["private notes"], ["notes"]);
  assert.deepEqual(labels["locations"], ["storageLocation"]);
  assert.deepEqual(labels["money amounts"], ["purchasePrice", "Original gross USD"]);
  assert.deepEqual(labels["links"], ["listingUrl"]);
  assert.deepEqual(labels["receipt and reference numbers"], ["certificationNumber"]);
  assert.deepEqual(labels["contact details"], ["email"]);
  assert.equal(result.otherFieldCount, 1, "section is not private");
  assert.equal(result.fieldCount, 12);
});

test("the sentence names the format, record count, every private group and what is left out", () => {
  const summary = describeExport({ format: "csv", rows: [{ id: "1", purchaser: "A", amount: 3, date: "2026-01-01" }, { id: "2", purchaser: "B", amount: 4, date: "2026-01-02" }], redactions: ["receipt images"] });
  assert.equal(summary.format, "CSV");
  assert.equal(summary.recordCount, 2);
  assert.equal(summary.containsPrivateData, true);
  assert.match(summary.sentence, /^This CSV will include 2 records with people's names, money amounts, dates and times, and record IDs\./);
  assert.match(summary.sentence, /It does not include receipt images\./);
  assert.match(summary.sentence, /Nothing is uploaded; keep the file private\.$/);
  const calm = describeExport({ format: "csv", fields: ["date", "quantity", "status"], recordCount: 1 });
  assert.equal(calm.containsPrivateData, false);
  assert.match(calm.sentence, /1 record with dates and times and quantities and status\. Nothing is uploaded\.$/);
  assert.match(describeExport({ format: "csv/json", fields: ["notes"] }).sentence, /^This CSV or JSON file will include private notes/);
});

test("known export kinds describe fixed contents, honour hidden values and list exclusions", () => {
  for (const [kind, definition] of Object.entries(EXPORT_KINDS)) {
    const summary = describeExport({ kind, format: "json" });
    assert.ok(summary.sentence.includes(definition.noun), kind);
    for (const item of definition.includes) assert.ok(summary.sentence.includes(item), `${kind} includes ${item}`);
    for (const item of definition.excludes || []) assert.ok(summary.sentence.includes(item), `${kind} excludes ${item}`);
  }
  const shown = describeExport({ kind: "portfolio-csv", format: "csv", recordCount: 12, includeValues: true });
  const hidden = describeExport({ kind: "portfolio-csv", format: "csv", recordCount: 12, includeValues: false });
  assert.match(shown.sentence, /money amounts, and estimate sources/);
  assert.doesNotMatch(hidden.sentence, /money amounts/);
  assert.match(hidden.sentence, /does not include storage locations, private notes, or purchase prices/);
});

test("real business export rows disclose notes, money and driver names without overstating locations", () => {
  const sales = describeExport({ format: "csv", rows: buildSalesExportRows([{ id: "s1", saleDate: "2026-03-01", platform: "eBay", itemName: "Card", quantitySold: 1, grossSale: 10, notes: "n" }]) });
  assert.match(sales.sentence, /money amounts/);
  assert.match(sales.sentence, /private notes/);
  assert.match(sales.sentence, /where you bought or sold/);
  const mileage = describeExport({ format: "csv", fields: [...fieldsFromRows(buildMileageExportRows([{ vehicleName: "Van", tripCount: 1, trips: [{ purpose: "Show", miles: 12, driver: "Z" }] }])), "driver"] });
  assert.match(mileage.sentence, /people's names/);
  assert.doesNotMatch(mileage.sentence, /locations/, "mileage trips do not store locations");
  const tax = describeExport({ format: "csv/json", fields: fieldsFromRows(buildTaxRecordExportRows({ year: 2026, expenses: { total: 1, count: 1, vendorGroups: [] }, mileage: { vehicleGroups: [] }, inventory: {}, sales: {} })) });
  assert.match(tax.sentence, /private notes/);
  assert.match(tax.sentence, /money amounts/);
});

test("inputs are bounded and malformed fields never throw", () => {
  const huge = describeExport({ format: "csv", fields: Array.from({ length: 5000 }, (_, index) => `price${index}`) });
  assert.equal(huge.fieldCount, 200);
  assert.doesNotThrow(() => describeExport({ format: "csv", rows: [null, 4, "x", { "": 1, [Symbol.iterator]: 2 }] }));
  assert.doesNotThrow(() => describeExport({ kind: "not-a-kind", format: 12, fields: [null, undefined, {}, 3] }));
  assert.equal(describeExport({ format: "csv", fields: [] }).sentence, "This CSV will include the records shown here. Nothing is uploaded.");
});

const directory = resolve("artifacts/qa/export-disclosure-100");
await mkdir(directory, { recursive: true });
const output = resolve(directory, "export-disclosure-test.mjs");
await build({ stdin: { resolveDir: resolve("."), contents: `export {default as ExportDisclosure} from './src/components/ExportDisclosure.jsx';` }, bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic", loader: { ".css": "empty" }, outfile: output });
const { ExportDisclosure } = await import(pathToFileURL(output).href);

test("the component renders an id-addressable, private-flagged disclosure", () => {
  const html = renderToStaticMarkup(React.createElement(ExportDisclosure, { id: "x-export", kind: "beta-backup", format: "json" }));
  assert.match(html, /<p id="x-export" class="export-disclosure" data-private="true">/);
  assert.match(html, /Private file/);
  assert.match(html, /every record saved on this device/);
  const calm = renderToStaticMarkup(React.createElement(ExportDisclosure, { id: "y", format: "csv", fields: ["date", "status"] }));
  assert.match(calm, /data-private="false"/);
  assert.match(calm, /What(&#x27;|')s in this file/);
});

test("every export control in the app is described before the file is generated", async () => {
  const sources = [
    ["src/App.jsx", ['downloadSalesRecords("csv")', 'downloadSalesRecords("json")', 'downloadMileageRecords("csv")', 'downloadMileageRecords("json")']],
    ["src/features/deferredViews/LegacyReportsContent.jsx", ['downloadYearEndTaxSummary("csv")', 'downloadYearEndTaxSummary("json")', 'downloadSalesRecords("csv")', 'downloadMileageRecords("csv")']],
    ["src/features/deferredViews/MarketplaceContent.jsx", ['exportCrossListingCSV("all")']],
    ["src/components/CollectionPortfolio.jsx", ["onClick={exportPortfolio}"]],
    ["src/components/WhatDidISee.jsx", ["onClick={exportJson}"]],
    ["src/components/BackupExportImport.jsx", ["onClick={onExport}"]],
    ["src/features/flipScout/screens/SourcesDataScreen.jsx", ["onExportJson();", "exportCsv(collection, label)"]],
    ["src/features/manualLifecycles/ManualLifecycles.jsx", ["onClick={exportCsv}", "Download calendar entry"]],
    ["src/features/backup/BackupRecoveryPanel.jsx", ["onClick={exportBackup}", "onClick={exportFiles}"]],
  ];
  for (const [file, controls] of sources) {
    const text = await readFile(resolve(file), "utf8");
    assert.match(text, /ExportDisclosure/, `${file} renders a disclosure`);
    for (const control of controls) {
      const index = text.indexOf(control);
      assert.ok(index >= 0, `${file} still has ${control}`);
      const tag = text.slice(text.lastIndexOf("<", index), text.indexOf(">", index) + 1);
      assert.match(tag, /aria-describedby="[a-z-]+-disclosure"/, `${file}: ${control} is described by a disclosure`);
      const id = tag.match(/aria-describedby="([a-z-]+-disclosure)"/)[1];
      assert.ok(text.includes(`id="${id}"`), `${file}: disclosure ${id} exists`);
    }
  }
  // Pre-existing disclosures keep their wording.
  assert.match(await readFile(resolve("src/features/deferredViews/InventoryImportContent.jsx"), "utf8"), /correction CSV lists only the rows that need fixing[^]*original source row/);
  assert.match(await readFile(resolve("src/features/backup/WorkspaceBackupPanel.jsx"), "utf8"), /Backups can include private collection details, costs, notes, storage locations/);
  assert.match(await readFile(resolve("src/features/persistence/CloudSyncPanel.jsx"), "utf8"), /comparison download contains both groups, including private names, notes, locations/);
});
