import { BACKUP_SOURCE_REGISTRY } from "../backup/backupSourceRegistry.js";
import { createVerifiedBackup, readCurrentBackupSources } from "../backup/backupFormat.js";
import { canonicalStringify, hashCanonicalJson } from "../backup/canonicalJson.js";
import { createMigrationPreview, toCanonicalDryRunRequest } from "./migrationPreview.js";

function totals(domains) {
  const money = {}; const counts = {};
  for (const [domain, records] of Object.entries(domains)) {
    counts[domain] = records.length;
    for (const row of records) {
      if (row.amountMinor == null) continue;
      if (!Number.isSafeInteger(row.amountMinor) || !/^[A-Z]{3}$/.test(row.currency || "")) throw new Error("Migration rehearsal encountered invalid money.");
      const key = `${domain}:${row.currency}`;
      money[key] = (BigInt(money[key] || "0") + BigInt(row.amountMinor)).toString();
    }
  }
  return { counts, amountMinorByDomainAndCurrency: money };
}

export async function rehearseLocalMigration({ localStorage, sessionStorage, remoteAdapter, now = () => new Date().toISOString() } = {}) {
  const registry = BACKUP_SOURCE_REGISTRY.filter((source) => source.includedInPhase1AExport);
  const capture = () => readCurrentBackupSources({ localStorage, sessionStorage, sourceRegistry: registry });
  const before = capture();
  const backup = await createVerifiedBackup({ localStorage, sessionStorage, sourceRegistry: registry, createdAt: now() });
  if (!backup.verified) throw new Error("A verified local backup is required before migration rehearsal.");
  const localSources = Object.fromEntries(backup.backup.sections.map((section) => [section.sourceId, section.data]));
  // Bind the actual exported input, not just two surrounding reads. Otherwise
  // A -> B (during export) -> A could rehearse B while claiming A stayed current.
  if (canonicalStringify(localSources) !== canonicalStringify(before.sources)) {
    throw new Error("A source changed while the backup was created. Run rehearsal again with a fresh backup.");
  }
  const assertSourcesUnchanged = () => {
    if (canonicalStringify(capture()) !== canonicalStringify(before)) throw new Error("A source changed during rehearsal. Run it again with a fresh backup.");
  };
  const finish = (result) => {
    // This final synchronous check follows all awaited hashes; no stale success
    // can escape if a source changed while the candidate/rollback was hashed.
    assertSourcesUnchanged();
    return result;
  };
  assertSourcesUnchanged();
  const remote = await remoteAdapter?.inspect() || { status: "UNAVAILABLE", domains: {}, recordCount: 0, reason: "Canonical records have not been inspected." };
  const backupHash = await hashCanonicalJson(backup.json);
  const preview = await createMigrationPreview({ localSources, remoteSnapshot: remote, sourceBackupHash: backupHash });
  assertSourcesUnchanged();
  const base = {
    format: "code3.migration-rehearsal", version: 1, createdAt: now(), writesPerformed: 0,
    backupHash, planHash: preview.plan.planHash,
    sourceCounts: Object.fromEntries(backup.backup.sections.map((section) => [section.sourceId, section.recordCount])),
    sourceSchemas: Object.fromEntries(backup.backup.sections.map((section) => [section.sourceId, section.schemaVersion])),
    canonicalStatus: remote.status, legacyCloudStatus: "NOT_INSPECTED_SEPARATELY",
    blockers: preview.blockers, conflicts: preview.conflicts, warnings: preview.warnings,
    exclusions: preview.plan.actions.filter((action) => !["INSERT", "UPDATE"].includes(action.action)).map((action) => ({ domain: action.domain, recordId: action.recordId, action: action.action })),
    activationAllowed: false,
  };
  if (remote.status !== "AVAILABLE" || remote.coverageStatus !== "COMPLETE" || preview.blockers.length || preview.conflicts.length
    || preview.plan.actions.some((action) => action.action === "REQUIRES_DECISION")) {
    return finish({ ...base, status: "BLOCKED", rollbackVerified: false });
  }
  const request = toCanonicalDryRunRequest(preview.plan);
  const original = JSON.parse(JSON.stringify(remote.domains));
  const candidate = JSON.parse(JSON.stringify(original));
  const undo = [];
  for (const action of request.actions) {
    if (action.action === "SKIP") continue;
    if (!["INSERT", "UPDATE"].includes(action.action)) throw new Error("Resolve every migration decision before rehearsing writes.");
    const rows = candidate[action.domain];
    if (!Array.isArray(rows)) throw new Error("Canonical source coverage is incomplete.");
    const index = rows.findIndex((row) => row.id === action.recordId);
    if (action.action === "INSERT") {
      if (index >= 0) throw new Error("A migration insert would reuse an existing record ID.");
      undo.push({ domain: action.domain, id: action.recordId, before: null });
      rows.push({ ...action.input, id: action.recordId, domain: action.domain, recordVersion: 1 });
    } else {
      if (index < 0 || rows[index].recordVersion !== action.input.expectedVersion) throw new Error("A migration update has a stale or missing destination.");
      undo.push({ domain: action.domain, id: action.recordId, before: rows[index] });
      const { expectedVersion, ...fields } = action.input;
      rows[index] = { ...rows[index], ...fields, recordVersion: expectedVersion + 1 };
    }
  }
  const afterTotals = totals(candidate);
  const afterHash = await hashCanonicalJson(candidate);
  for (const change of undo.reverse()) {
    const rows = candidate[change.domain];
    const index = rows.findIndex((row) => row.id === change.id);
    if (change.before) rows[index] = change.before; else rows.splice(index, 1);
  }
  const beforeHash = await hashCanonicalJson(original);
  const rollbackHash = await hashCanonicalJson(candidate);
  if (rollbackHash !== beforeHash) throw new Error("Migration rollback rehearsal did not reproduce the original records.");
  return finish({ ...base, status: "REHEARSED_IN_MEMORY", appliedActions: undo.length, beforeHash, afterHash, rollbackHash, before: totals(original), after: afterTotals, rollbackVerified: true });
}
