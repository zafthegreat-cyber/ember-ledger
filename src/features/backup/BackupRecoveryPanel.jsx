import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import AccountOpsRecoveryPanel from "./AccountOpsRecoveryPanel.jsx";
import { createPrivateFileClient } from "../privateFiles/privateFileClient.js";
import BackupReviewFindings from "./BackupReviewFindings.jsx";
import { createBackupReviewReport, displayReviewValue, downloadBackupReviewReport, RESTORE_FINDING_GROUPS } from "./reviewPresentation.js";
import { exportFile, exportFileStatus, exportFileError } from "../../native/nativeFiles.js";
import { useCloudWorkspace } from "../persistence/CloudWorkspaceContext.js";

function statusTone(status) {
  if (status === BACKUP_COVERAGE.COMPLETE || status === "READY_FOR_FUTURE_RESTORE") return "success";
  if (status === BACKUP_COVERAGE.FAILED || status === "BLOCKED" || status === "CORRUPTED" || status === "UNSUPPORTED") return "danger";
  return "warning";
}

function downloadJson(fileName, json, assertCurrent) {
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  return exportFile({ blob, filename: fileName, assertCurrent });
}

function StatusRow({ label, value, children }) {
  return <div className="backup-status-row"><span>{label}</span><strong>{displayReviewValue(value, value === "" ? "" : "Not available")}</strong>{children}</div>;
}

function BackupRecoveryContent({ localDevelopment }) {
  const inputRef = useRef(null);
  const lifetime = useRef(0);
  const pending = useRef(false);
  const previewTriggerRef = useRef(null);
  const previewHeadingRef = useRef(null);
  const focusPreview = useRef(false);
  useEffect(() => () => { lifetime.current++; }, []);
  const [busy, setBusy] = useState("");
  const [exportResult, setExportResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewInfo, setPreviewInfo] = useState(null);
  const [message, setMessage] = useState("");
  const [activity, setActivity] = useState([]);
  const remoteAdapter = useMemo(() => createRemoteBackupExportAdapter({
    request: (path, init) => code3OwnerRequest(path, init, { localDevelopment }),
  }), [localDevelopment]);

  const recordActivity = (entry) => setActivity((current) => [entry, ...current].slice(0, 10));
  const assertExportCurrent = (request) => { if (request !== lifetime.current) throw new DOMException("Export cancelled.", "AbortError"); };
  useLayoutEffect(() => {
    if (preview && focusPreview.current) { previewHeadingRef.current?.focus(); focusPreview.current = false; }
  }, [preview]);

  async function exportFiles() {
    if (pending.current) return;
    pending.current = true;
    const request = ++lifetime.current;
    setBusy("files"); setMessage("");
    try {
      const client = createPrivateFileClient({ request: (path, init) => code3OwnerRequest(path, init, { localDevelopment }) });
      const backup = await client.exportBackup();
      if (request !== lifetime.current) return;
      const saved = await downloadJson("code-3-private-files.json", JSON.stringify(backup, null, 2), () => assertExportCurrent(request));
      if (request !== lifetime.current) return;
      setMessage(`${exportFileStatus(saved)} Keep this separate private file backup with the record backup; this file does not include the rest of the app.`);
    } catch (error) { if (request === lifetime.current) setMessage(exportFileError(error)); }
    finally { pending.current = false; if (request === lifetime.current) setBusy(""); }
  }

  async function exportBackup() {
    if (pending.current) return;
    pending.current = true;
    const request = ++lifetime.current;
    setBusy("export");
    setMessage("");
    try {
      const remoteExportResult = await remoteAdapter.inspect();
      if (request !== lifetime.current) return;
      const result = await createVerifiedBackup({
        localStorage: globalThis.localStorage,
        sessionStorage: globalThis.sessionStorage,
        applicationVersion: typeof __EMBER_TIDE_APP_VERSION__ === "undefined" ? "unknown" : __EMBER_TIDE_APP_VERSION__,
        sourceCommit: "not supplied to browser build",
        configuredSourceIds: isSupabaseConfigured ? ["supabase-owner-data"] : [],
        remoteExportResult,
      });
      if (request !== lifetime.current) return;
      setExportResult(result);
      recordActivity(result.activity);
      if (!result.verified) {
        setMessage(result.integrityVerified
          ? "Backup coverage failed. No verified backup download was produced."
          : "Backup verification failed. No success claim or download was produced.");
        return;
      }
      const saved = await downloadJson(result.fileName, result.json, () => assertExportCurrent(request));
      if (request !== lifetime.current) return;
      setMessage(`${exportFileStatus(saved)} ${result.coverageStatus === BACKUP_COVERAGE.COMPLETE
        ? "Backup verified."
        : "Partial backup verified with the listed exclusions."}`);
    } catch (error) {
      if (request !== lifetime.current) return;
      setExportResult(null);
      setMessage(exportFileError(error));
    } finally {
      pending.current = false;
      if (request === lifetime.current) setBusy("");
    }
  }

  async function exportReview() {
    if (pending.current || !preview) return;
    pending.current = true;
    const request = ++lifetime.current;
    setBusy("report"); setMessage("");
    try {
      const saved = await downloadBackupReviewReport(createBackupReviewReport({ kind: "restore-preview", result: { ...preview, sourceFileName: previewInfo?.sourceFileName }, reviewedAt: previewInfo?.reviewedAt }), { assertCurrent: () => assertExportCurrent(request) });
      if (request === lifetime.current) setMessage(`${exportFileStatus(saved)} This report contains findings, not a restorable backup.`);
    } catch (error) { if (request === lifetime.current) setMessage(exportFileError(error)); }
    finally { pending.current = false; if (request === lifetime.current) setBusy(""); }
  }

  async function previewFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || pending.current) return;
    pending.current = true;
    const request = ++lifetime.current;
    setBusy("preview");
    setMessage("");
    setPreview(null); setPreviewInfo(null);
    const publish = (result) => {
      if (request !== lifetime.current) return;
      focusPreview.current = document.activeElement === previewTriggerRef.current || document.activeElement === inputRef.current || document.activeElement === document.body;
      setPreviewInfo({ reviewedAt: new Date().toISOString(), sourceFileName: file.name });
      setPreview(result);
    };
    try {
      if (file.size > BACKUP_PARSE_LIMITS.maxBytes) {
        throw new Error(`The selected JSON file exceeds the ${Math.floor(BACKUP_PARSE_LIMITS.maxBytes / 1024 / 1024)} MB preview limit.`);
      }
      const raw = await file.text();
      if (request !== lifetime.current) return;
      const currentSnapshot = readCurrentBackupSources({
        localStorage: globalThis.localStorage,
        sessionStorage: globalThis.sessionStorage,
      });
      const result = await previewBackupRestore(raw, { currentSources: currentSnapshot.sources });
      if (request !== lifetime.current) return;
      if (currentSnapshot.warnings.length) {
        result.warnings = [...(result.warnings || []), ...currentSnapshot.warnings.map((warning) => warning.message)];
        if (result.result === "READY_FOR_FUTURE_RESTORE") result.result = "READY_WITH_WARNINGS";
      }
      publish(result);
      recordActivity(result.activity);
      setMessage("Restore preview finished. No data was changed.");
    } catch (error) {
      if (request !== lifetime.current) return;
      const result = {
        result: "BLOCKED",
        warnings: [],
        errors: [error?.message || "The backup file could not be inspected."],
        includedSources: [],
        excludedSources: [],
        recordCounts: {},
        writesPerformed: 0,
      };
      publish(result);
      setMessage("Restore preview was blocked. No data was changed.");
    } finally {
      pending.current = false;
      if (request === lifetime.current) setBusy("");
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
        <SecondaryButton ref={previewTriggerRef} onClick={() => inputRef.current?.click()} disabled={Boolean(busy)}>{busy === "preview" ? "Inspecting…" : "Preview restore"}</SecondaryButton>
        <input ref={inputRef} hidden tabIndex={-1} type="file" accept="application/json,.json" onChange={previewFile} aria-label="Select a Code 3 JSON backup for restore preview" disabled={Boolean(busy)} />
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

      {preview ? <div className="backup-result" role="region" aria-label="Restore preview result">
        <h3 ref={previewHeadingRef} tabIndex={-1} className="backup-review-focus">Restore preview</h3>
        <p className="backup-review-report-note">{previewInfo?.sourceFileName} · Reviewed {previewInfo?.reviewedAt ? new Date(previewInfo.reviewedAt).toLocaleString() : "just now"}. This result describes the file and saved records at the time of review.</p>
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
          <details><summary>Source coverage</summary><div className="backup-details">
          {Array.isArray(preview.includedSources) && preview.includedSources.length ? <ul>{preview.includedSources.map((source, index) => <li key={index}><strong>{displayReviewValue(source?.displayName, displayReviewValue(source?.sourceId))}</strong>: {displayReviewValue((typeof source?.sourceId === "string" ? preview.recordCounts?.[source.sourceId] : undefined) ?? source?.recordCount ?? 0)} records</li>)}</ul> : <p>No registered sources were included.</p>}
          <BackupReviewFindings title="Excluded sources" findings={preview.excludedSources} />
          </div></details>
          <h3>Structured findings</h3>
          {RESTORE_FINDING_GROUPS.map(([title, field]) => <BackupReviewFindings key={field} title={title} findings={preview[field]} />)}
          {!RESTORE_FINDING_GROUPS.some(([, field]) => preview[field]?.length) ? <p>No structured record findings were returned. Review the validation messages below.</p> : null}
          <BackupReviewFindings title="Errors" findings={preview.errors} open />
          <BackupReviewFindings title="Warnings" findings={preview.warnings} />
          {!preview.errors?.length && !preview.warnings?.length ? <p>No validation errors or warnings were found.</p> : null}
        </div></details>
        <div className="backup-actions"><SecondaryButton disabled={Boolean(busy)} onClick={exportReview}>Download review report</SecondaryButton></div>
        <p className="backup-review-report-note">The report contains bounded findings and record references, not recoverable records or file bytes. Keep your original backup. Review reports can contain private IDs and paths.</p>
      </div> : null}

      {activity.length ? <details className="backup-activity"><summary>Session activity</summary><ul>{activity.map((entry, index) => <li key={`${entry?.type}-${index}`}>{entry?.type === "BACKUP_EXPORT_COMPLETED" ? "Export completed" : "Restore preview completed"}: {entry?.coverageStatus || entry?.result || "Recorded"}</li>)}</ul><p>Activity is kept in memory only so preview remains zero-write.</p></details> : null}
      <MigrationReadinessPanel remoteAdapter={remoteAdapter} />
      <AccountOpsRecoveryPanel />
      <section className="backup-result" aria-label="Private file backup"><h3>Private files</h3><p>Export verified attachment bytes separately from the record backup. Missing or damaged files prevent a successful file backup.</p><SecondaryButton disabled={Boolean(busy)} onClick={exportFiles}>{busy === "files" ? "Verifying files…" : "Export private files"}</SecondaryButton></section>
    </section>
  );
}

export default function BackupRecoveryPanel({ localDevelopment = false }) {
  const ownerId = useCloudWorkspace()?.user?.id || "unbound";
  return <BackupRecoveryContent key={`${ownerId}:${localDevelopment ? "local" : "connected"}`} localDevelopment={localDevelopment} />;
}
