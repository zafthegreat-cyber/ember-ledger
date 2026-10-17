import assert from "node:assert/strict";
import fs from "node:fs";
import { createBackupReviewReport, displayReviewValue, presentReviewFinding, RESTORE_FINDING_GROUPS } from "../src/features/backup/reviewPresentation.js";
import { backupReviewFixtures } from "./helpers/backup-review-fixtures.mjs";

const results = [];
async function test(name, run) { await run(); results.push({ name, passed: true }); }
await test("real restore findings retain locators, references and reasons without changing validation", async () => {
  const { preview } = await backupReviewFixtures();
  assert.equal(preview.result, "BLOCKED"); assert.equal(preview.writesPerformed, 0);
  assert.ok(preview.duplicateIds.length); assert.ok(preview.brokenReferences.length); assert.ok(preview.invalidMoney.length);
  const before = JSON.stringify(preview);
  const report = createBackupReviewReport({ kind: "restore-preview", result: preview });
  assert.equal(JSON.stringify(preview), before); assert.equal(report.activationAllowed, false);
  assert.match(JSON.stringify(report.findings), /synthetic-duplicate-item/);
  assert.match(JSON.stringify(report.findings), /synthetic-missing-item/);
  assert.match(JSON.stringify(report.findings), /Money value is not finite numeric data/);
  assert.equal(report.metadata.result, "BLOCKED");
});
await test("report does not copy records, raw plans, credentials, cookies or unknown nested payloads", () => {
  const result = { status: "BLOCKED", records: [{ name: "RAW_PRIVATE_RECORD" }], plan: { actions: [{ input: { name: "RAW_PLAN_RECORD" } }] }, accessToken: "RAW_CREDENTIAL", warnings: [{ code: "NEEDS_MAPPING", message: "Mapping missing", sourceId: "source", secret: "HIDDEN_CREDENTIAL", record: { name: "RAW_NESTED_RECORD" } }] };
  const output = JSON.stringify(createBackupReviewReport({ kind: "migration-preview", result }));
  for (const value of ["RAW_PRIVATE_RECORD", "RAW_PLAN_RECORD", "RAW_CREDENTIAL", "HIDDEN_CREDENTIAL", "RAW_NESTED_RECORD"]) assert.ok(!output.includes(value));
  assert.match(output, /Mapping missing/);
});
await test("large finding groups and text are explicitly bounded without hiding total counts", () => {
  const report = createBackupReviewReport({ kind: "restore-preview", result: { errors: Array.from({ length: 107 }, () => "x".repeat(5000)) } });
  const group = report.findings[0]; assert.equal(group.total, 107); assert.equal(group.shown, 100); assert.equal(group.omitted, 7); assert.equal(group.findings.length, 100); assert.match(group.findings[0].message, /shortened/); assert.ok(group.findings[0].message.length < 1250);
});
await test("unsupported object values are not stringified into findings", () => {
  const result = presentReviewFinding({ path: { secret: "hidden" }, reason: { payload: "hidden" }, reference: ["safe", { secret: "hidden" }], message: "Review required" });
  assert.equal(JSON.stringify(result).includes("hidden"), false); assert.equal(JSON.stringify(result).includes("[object Object]"), false);
});
await test("source unavailable is distinguishable from a zero-blocker successful rehearsal", () => {
  const report = createBackupReviewReport({ kind: "migration-rehearsal", result: { status: "BLOCKED", canonicalStatus: "UNAVAILABLE", rollbackVerified: false, blockers: [], warnings: [{ code: "REMOTE_UNAVAILABLE", message: "Canonical records have not been inspected." }] } });
  assert.equal(report.metadata.canonicalStatus, "UNAVAILABLE"); assert.equal(report.metadata.rollbackVerified, false); assert.equal(report.findings[0].total, 1); assert.match(report.purpose, /not a backup/);
});
await test("rehearsal totals preserve exact signed amounts beyond floating integer range", () => {
  const report = createBackupReviewReport({ kind: "migration-rehearsal", result: { before: { counts: { EXPENSE: 1 }, amountMinorByDomainAndCurrency: { "EXPENSE:USD": "9007199254740993" } }, after: { counts: { EXPENSE: 2 }, amountMinorByDomainAndCurrency: { "EXPENSE:USD": "-9007199254740993" } } } });
  assert.equal(report.before.amountMinorByDomainAndCurrency[0].amountMinor, "9007199254740993"); assert.equal(report.after.amountMinorByDomainAndCurrency[0].amountMinor, "-9007199254740993");
});
await test("all known restore finding classes including duplicate aliases are presented", () => {
  assert.equal(new Set(RESTORE_FINDING_GROUPS.map(([, key]) => key)).size, 14); assert.ok(RESTORE_FINDING_GROUPS.some(([, key]) => key === "duplicateAliases"));
  const report = createBackupReviewReport({ kind: "restore-preview", result: { duplicateAliases: [{ aliasAddress: "private@example.invalid", firstId: "alias-a", secondId: "alias-b" }] } });
  assert.match(JSON.stringify(report), /alias-a/); assert.match(JSON.stringify(report), /alias-b/); assert.ok(!JSON.stringify(report).includes("private@example.invalid"));
});
await test("unknown review kinds and absent results cannot create reports", () => {
  assert.throws(() => createBackupReviewReport({ kind: "restore-apply", result: {} })); assert.throws(() => createBackupReviewReport({ kind: "restore-preview" }));
});
await test("migration preview report copies only the actual nested plan hash binding", () => {
  const planHash = "a".repeat(64); const report = createBackupReviewReport({ kind: "migration-preview", result: { plan: { planHash, actions: [{ input: "PRIVATE_PLAN_RECORD" }] } } });
  assert.equal(report.metadata.planHash, planHash); assert.ok(!JSON.stringify(report).includes("PRIVATE_PLAN_RECORD"));
});
await test("untrusted manifest display fields and format versions cannot become object children", () => {
  assert.equal(displayReviewValue({ unexpected: "record" }), "Not available"); assert.equal(displayReviewValue(["nested"]), "Not available"); assert.equal(displayReviewValue(0), "0");
});
const output = "artifacts/qa/backup-review-accessibility/presentation"; fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/results.json`, JSON.stringify({ passed: results.length, results }, null, 2));
console.log(`Backup review presentation: ${results.length}/${results.length} passed.`);
