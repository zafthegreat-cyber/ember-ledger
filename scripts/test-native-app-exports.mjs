import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const start = app.indexOf("  async function downloadRecordFile(");
const end = app.indexOf("  function createBetaBackup(", start);
assert.ok(start > 0 && end > start);
const source = app.slice(start, end);
const savedRecords = { items: [{ id: "existing", quantity: 4 }], settings: { theme: "dark" } };
const original = JSON.stringify(savedRecords);
const downloads = [], notices = [];
let native = false, reject = false, abortDuringExport = false;
const scope = { current: new AbortController() };
const context = vm.createContext({
  Blob, Date, JSON, String, Object, Error,
  fileExportScopeRef: scope,
  isNativePlatform: () => native,
  exportFile: async (request) => {
    if (reject) throw new Error("Synthetic canceled share");
    downloads.push({ name: request.filename, body: await request.blob.text(), signal: request.signal });
    if (abortDuringExport) scope.current.abort();
    return { shared: native };
  },
  setVaultToast: message => notices.push(message),
  showAppMessage: message => notices.push(message),
  setBackupImportMessage: message => notices.push(message),
  createBetaBackup: () => savedRecords,
  yearEndTaxSummary: { year: "2026", expenses: { count: 1 }, mileage: { tripCount: 0 }, inventory: { itemCount: 0 }, sales: { count: 0 } },
  groupedMileageVehicles: [{ id: "car", miles: 5 }],
  workspaceSales: [{ id: "sale", quantity: 1 }], salesSummary: { count: 1 },
  activeForgeWorkspace: { name: "Synthetic" }, activeWorkspace: null,
  buildTaxRecordExportRows: () => [{ id: "tax", amount: 5 }],
  buildMileageExportRows: () => [{ id: "car", miles: 5 }],
  buildSalesExportRows: () => [{ id: "sale", quantity: 1 }],
});
vm.runInContext(source, context);

await context.downloadBackup();
assert.deepEqual(JSON.parse(downloads.at(-1).body), savedRecords);
assert.match(downloads.at(-1).name, /^code3tcg-beta-backup-.*\.json$/);
await context.downloadCSV("test.csv", [{ name: 'A "quoted" item', count: 2 }]);
assert.equal(downloads.at(-1).body, 'name,count\n"A ""quoted"" item","2"');
for (const method of ["downloadYearEndTaxSummary", "downloadMileageRecords", "downloadSalesRecords"]) {
  for (const format of ["json", "csv"]) {
    const before = downloads.length;
    await context[method](format);
    assert.equal(downloads.length, before + 1);
    assert.ok(downloads.at(-1).name.endsWith(`.${format}`));
  }
}
native = true;
notices.length = 0;
await context.downloadBackup();
assert.ok(notices.every(message => !/exported|complete/i.test(message)), "Native share cannot prove the chosen target saved the file");
reject = true; notices.length = 0;
await context.downloadSalesRecords("csv");
assert.equal(notices.length, 1);
assert.match(notices[0], /not completed/);
reject = false; abortDuringExport = true; notices.length = 0;
await context.downloadBackup();
assert.equal(notices.length, 0, "Late export completion cannot update a changed account");
const before = downloads.length;
await context.downloadBackup();
assert.equal(downloads.length, before, "Aborted account cannot export again");
assert.equal(JSON.stringify(savedRecords), original);
console.log("PASS legacy native exports: original backup/CSV content, six business export paths, share wording, failure, and account-change cancellation; source data unchanged.");
