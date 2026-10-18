import { useEffect, useRef, useState } from "react";
import { createVerifiedBackup } from "./backupFormat.js";
import { exportFile, exportFileStatus, exportFileError } from "../../native/nativeFiles.js";
import { useCloudWorkspace } from "../persistence/CloudWorkspaceContext.js";

export default function WorkspaceBackupPanel({ onRecover, configuredSourceIds = ["supabase-owner-data"], onExportCloud = null, externalBusy = false }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [coverage, setCoverage] = useState(null);
  const pending = useRef(false);
  const exportRequest = useRef(null);
  const ownerId = useCloudWorkspace()?.user?.id;
  const lifetime = useRef(0);
  useEffect(() => () => { lifetime.current++; exportRequest.current?.abort(); }, [ownerId]);

  async function exportBackup() {
    if (pending.current || externalBusy) return;
    pending.current = true;
    const request = ++lifetime.current;
    const controller = new AbortController(); exportRequest.current = controller;
    setBusy(true); setMessage("");
    try {
      const result = await createVerifiedBackup({ localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, configuredSourceIds,
        applicationVersion: typeof __EMBER_TIDE_APP_VERSION__ === "undefined" ? "unknown" : __EMBER_TIDE_APP_VERSION__,
      });
      if (request !== lifetime.current) return;
      if (!result.verified) throw new Error("Some records could not be exported safely. No backup was marked complete and your saved records were not changed.");
      let saved;
      try { saved = await exportFile({ blob: new Blob([result.json], { type: "application/json;charset=utf-8" }), filename: result.fileName, signal: controller.signal }); }
      catch (error) { throw new Error(exportFileError(error)); }
      if (request !== lifetime.current) return;
      setCoverage({ recordCount: result.backup.coverageSummary.recordCount, excludedSources: result.backup.manifest.excludedSources.filter((source) => source.affectsCoverage), fileReferences: result.backup.coverageSummary.fileReferences });
      setMessage(`${exportFileStatus(saved)} ${result.coverageStatus === "COMPLETE" ? "Device record backup verified." : "Device record backup verified. Review the exclusions below and keep any separate cloud or file backups with it."}`);
    } catch (error) { if (request === lifetime.current) setMessage(error?.message || "Backup could not be downloaded. Your records were not changed."); }
    finally { pending.current = false; if (exportRequest.current === controller) exportRequest.current = null; if (request === lifetime.current) setBusy(false); }
  }

  return <section className="backup-result" aria-labelledby="workspace-backup-title">
    <h3 id="workspace-backup-title">Backup &amp; recovery</h3>
    <p>Download verified device records before a change or keep an independent copy. Cloud synchronization does not replace a separate backup.</p>
    <div className="backup-actions">
      <button type="button" onClick={exportBackup} disabled={busy || externalBusy}>{busy ? "Verifying backup…" : "Download device backup"}</button>
      {onExportCloud ? <button type="button" onClick={onExportCloud} disabled={busy || externalBusy}>Download cloud backup</button> : null}
      <button type="button" onClick={onRecover} disabled={busy || externalBusy || !onRecover}>Recover from backup</button>
    </div>
    {message ? <p role="status">{message}</p> : null}
    {coverage ? <div>
      <p>{coverage.recordCount} records included. Authentication and account permissions are excluded.</p>
      {coverage.excludedSources.length ? <ul>{coverage.excludedSources.map((source) => <li key={source.sourceId}>{source.displayName}: {source.reason}</li>)}</ul> : null}
      {coverage.fileReferences.total > coverage.fileReferences.embedded ? <p>Some attachments are references only. Keep original files or a separate attachment backup.</p> : null}
    </div> : null}
  </section>;
}
