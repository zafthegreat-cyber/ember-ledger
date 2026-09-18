import { useMemo, useRef, useState } from "react";
import {
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from "../../components/operations/OperationsUI.jsx";
import { isSupabaseConfigured } from "../../supabaseClient.js";
import { code3OwnerRequest } from "../../services/code3OwnerApi.js";
import { createRemoteBackupExportAdapter } from "../persistence/index.js";
import {
  BACKUP_COVERAGE,
  BACKUP_PARSE_LIMITS,
  createVerifiedBackup,
  previewBackupRestore,
  readCurrentBackupSources,
} from "./index.js";
import MigrationReadinessPanel from "./MigrationReadinessPanel.jsx";

function statusTone(status) {
  if (status === BACKUP_COVERAGE.COMPLETE || status === "READY_FOR_FUTURE_RESTORE") return "success";
  if (status === BACKUP_COVERAGE.FAILED || status === "BLOCKED" || status === "CORRUPTED" || status === "UNSUPPORTED") return "danger";
  return "warning";
}

function downloadJson(fileName, json) {
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function StatusRow({ label, value, children }) {
  return <div className="backup-status-row"><span>{label}</span><strong>{value}</strong>{children}</div>;
}

export default function BackupRecoveryPanel({ localDevelopment = false }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState("");
  const [exportResult, setExportResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState("");
  const [activity, setActivity] = useState([]);
  const remoteAdapter = useMemo(() => createRemoteBackupExportAdapter({
    request: (path, init) => code3OwnerRequest(path, init, { localDevelopment }),
  }), [localDevelopment]);

  const recordActivity = (entry) => setActivity((current) => [entry, ...current].slice(0, 10));

  async function exportBackup() {
    setBusy("export");
    setMessage("");
    try {
      const remoteExportResult = await remoteAdapter.inspect();
      const result = await createVerifiedBackup({
        localStorage: globalThis.localStorage,
        sessionStorage: globalThis.sessionStorage,
        applicationVersion: typeof __EMBER_TIDE_APP_VERSION__ === "undefined" ? "unknown" : __EMBER_TIDE_APP_VERSION__,
        sourceCommit: "not supplied to browser build",
        configuredSourceIds: isSupabaseConfigured ? ["supabase-owner-data"] : [],
        remoteExportResult,
      });
      setExportResult(result);
      recordActivity(result.activity);
      if (!result.verified) {
        setMessage(result.integrityVerified
          ? "Backup coverage failed. No verified backup download was produced."
          : "Backup verification failed. No success claim or download was produced.");
        return;
      }
      downloadJson(result.fileName, result.json);
      setMessage(result.coverageStatus === BACKUP_COVERAGE.COMPLETE
        ? "Backup verified and downloaded."
        : "Partial backup verified and downloaded with the listed exclusions.");
    } catch {
      setExportResult(null);
      setMessage("Backup export failed safely. No records were changed.");
    } finally {
      setBusy("");
    }
  }

  async function previewFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("preview");
    setMessage("");
    try {
      if (file.size > BACKUP_PARSE_LIMITS.maxBytes) {
        throw new Error(`The selected JSON file exceeds the ${Math.floor(BACKUP_PARSE_LIMITS.maxBytes / 1024 / 1024)} MB preview limit.`);
      }
      const raw = await file.text();
      const currentSnapshot = readCurrentBackupSources({
        localStorage: globalThis.localStorage,
        sessionStorage: globalThis.sessionStorage,
      });
      const result = await previewBackupRestore(raw, { currentSources: currentSnapshot.sources });
      if (currentSnapshot.warnings.length) {
        result.warnings = [...(result.warnings || []), ...currentSnapshot.warnings.map((warning) => warning.message)];
        if (result.result === "READY_FOR_FUTURE_RESTORE") result.result = "READY_WITH_WARNINGS";
      }
      setPreview(result);
      recordActivity(result.activity);
      setMessage("Restore preview finished. No data was changed.");
    } catch (error) {
      const result = {
        result: "BLOCKED",
        warnings: [],
        errors: [error?.message || "The backup file could not be inspected."],
        includedSources: [],
        excludedSources: [],
        recordCounts: {},
        writesPerformed: 0,
      };
      setPreview(result);
      setMessage("Restore preview was blocked. No data was changed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="backup-recovery" aria-labelledby="backup-recovery-title">
      <header className="backup-recovery__header">
        <div><h2 id="backup-recovery-title">Data &amp; Backup</h2><p>Create an integrity-checked JSON backup or inspect a backup without writing any records.</p></div>
        <StatusBadge tone="warning">Owner Only</StatusBadge>
      </header>
      <div className="backup-actions">
        <PrimaryButton onClick={exportBackup} disabled={Boolean(busy)}>{busy === "export" ? "Verifying…" : "Export verified backup"}</PrimaryButton>
        <SecondaryButton onClick={() => inputRef.current?.click()} disabled={Boolean(busy)}>{busy === "preview" ? "Inspecting…" : "Preview restore"}</SecondaryButton>
        <input ref={inputRef} className="sr-only" type="file" accept="application/json,.json" onChange={previewFile} aria-label="Select a Code 3 JSON backup for restore preview" />
      </div>
      <p className="backup-no-write"><strong>No data will be changed during restore preview.</strong> JSON files stay in this browser and are not uploaded.</p>
      {message ? <p className="backup-message" role="status">{message}</p> : null}

      {exportResult ? <div className="backup-result" aria-label="Backup export result">
        <StatusRow label="Created" value={new Date(exportResult.backup.createdAt).toLocaleString()} />
        <StatusRow label="Coverage" value=""><StatusBadge tone={statusTone(exportResult.coverageStatus)}>{exportResult.coverageStatus}</StatusBadge></StatusRow>
        <StatusRow label="Included sources" value={exportResult.backup.manifest.includedSources.length} />
        <StatusRow label="Excluded sources" value={exportResult.backup.manifest.excludedSources.length} />
        <StatusRow label="Records" value={exportResult.backup.coverageSummary.recordCount} />
        <StatusRow label="Integrity" value={exportResult.integrityVerified ? "Verified" : "Failed"} />
        <StatusRow label="File references not embedded" value={Math.max(0, exportResult.backup.coverageSummary.fileReferences.total - exportResult.backup.coverageSummary.fileReferences.embedded)} />
        <StatusRow label="Server data included" value={exportResult.backup.coverageSummary.serverDataIncluded ? "Yes" : "No"} />
        <details><summary>Coverage and validation details</summary><div className="backup-details"><h3>Excluded sources</h3>{exportResult.backup.manifest.excludedSources.length ? <ul>{exportResult.backup.manifest.excludedSources.map((source) => <li key={source.sourceId}><strong>{source.displayName}</strong>: {source.reason}</li>)}</ul> : <p>None.</p>}<h3>Known limitations</h3><ul>{exportResult.backup.manifest.knownLimitations.map((warning) => <li key={warning}>{warning}</li>)}</ul></div></details>
      </div> : null}

      {preview ? <div className="backup-result" aria-label="Restore preview result">
        <StatusRow label="Preview result" value=""><StatusBadge tone={statusTone(preview.result)}>{String(preview.result || "BLOCKED").replaceAll("_", " ")}</StatusBadge></StatusRow>
        <StatusRow label="Format recognized" value={preview.formatRecognized ? "Yes" : "No"} />
        <StatusRow label="Format version" value={preview.formatVersion ?? "Not recognized"} />
        <StatusRow label="Manifest integrity" value={preview.manifestIntegrity || "Not checked"} />
        <StatusRow label="Section integrity" value={preview.sectionIntegrity || "Not checked"} />
        <StatusRow label="Schema compatibility" value={preview.schemaCompatibility || "Not checked"} />
        <StatusRow label="Sources included" value={preview.includedSources?.length ?? 0} />
        <StatusRow label="Sources excluded" value={preview.excludedSources?.length ?? 0} />
        <StatusRow label="New records" value={preview.newRecords ?? 0} />
        <StatusRow label="Matching records" value={preview.matchingRecords ?? 0} />
        <StatusRow label="Potential updates" value={preview.potentialUpdates ?? 0} />
        <StatusRow label="Writes performed" value={preview.writesPerformed ?? 0} />
        <details open={(preview.errors || []).length > 0}><summary>Validation details</summary><div className="backup-details">
          <h3>Source coverage</h3>
          {preview.includedSources?.length ? <ul>{preview.includedSources.map((source) => <li key={source.sourceId}><strong>{source.displayName || source.sourceId}</strong>: {preview.recordCounts?.[source.sourceId] ?? source.recordCount ?? 0} records</li>)}</ul> : <p>No registered sources were included.</p>}
          {preview.excludedSources?.length ? <><h3>Excluded sources</h3><ul>{preview.excludedSources.map((source) => <li key={source.sourceId}><strong>{source.displayName || source.sourceId}</strong>: {source.reason || "Not included"}</li>)}</ul></> : null}
          <h3>Structured findings</h3>
          <ul className="backup-finding-counts">
            {[
              ["Duplicate IDs", preview.duplicateIds], ["ID collisions", preview.idCollisions], ["Duplicate provider listings", preview.duplicateProviderListings], ["Duplicate certifications", preview.duplicateCertifications],
              ["Broken references", preview.brokenReferences], ["Unknown sources", preview.unknownSources], ["Unsupported schemas", preview.unsupportedSchemas], ["Invalid money", preview.invalidMoney],
              ["Unsupported precision", preview.unsupportedPrecision], ["Missing fields", preview.missingFields], ["Missing currency", preview.missingCurrency], ["Currency mismatches", preview.currencyMismatches], ["Prohibited fields", preview.prohibitedFields],
            ].map(([label, findings]) => <li key={label}><span>{label}</span><strong>{findings?.length ?? 0}</strong></li>)}
          </ul>
          {preview.errors?.length ? <><h3>Errors</h3><ul>{preview.errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul></> : null}
          {preview.warnings?.length ? <><h3>Warnings</h3><ul>{preview.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}</ul></> : null}
          {!preview.errors?.length && !preview.warnings?.length ? <p>No validation errors or warnings were found.</p> : null}
        </div></details>
      </div> : null}

      {activity.length ? <details className="backup-activity"><summary>Session activity</summary><ul>{activity.map((entry, index) => <li key={`${entry?.type}-${index}`}>{entry?.type === "BACKUP_EXPORT_COMPLETED" ? "Export completed" : "Restore preview completed"}: {entry?.coverageStatus || entry?.result || "Recorded"}</li>)}</ul><p>Activity is kept in memory only so preview remains zero-write.</p></details> : null}
      <MigrationReadinessPanel remoteAdapter={remoteAdapter} />
    </section>
  );
}
