import { useEffect, useRef, useState } from "react";
import { useCloudWorkspace } from "./CloudWorkspaceContext.js";
import { createVerifiedWorkspaceSnapshotBackup } from "../backup/workspaceRestorePlan.js";
import WorkspaceBackupPanel from "../backup/WorkspaceBackupPanel.jsx";
import AccountSessionPanel from "../security/AccountSessionPanel.jsx";

function download(name, value) {
  const json = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function CloudSyncPanel() {
  const workspace = useCloudWorkspace();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const [deviceCopies, setDeviceCopies] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [review, setReview] = useState(null);
  const [choices, setChoices] = useState({});
  const generation = useRef(0);
  const pending = useRef(false);
  const request = useRef(null);
  useEffect(() => () => { generation.current++; request.current?.abort(); }, [workspace?.user?.id]);
  if (!workspace) return null;

  function isCurrent(ticket) { return ticket === generation.current && !request.current?.signal.aborted; }
  async function run(task) {
    if (pending.current) return;
    pending.current = true;
    const ticket = ++generation.current;
    const abort = new AbortController(); request.current = abort;
    setBusy(true); setMessage("");
    try { await task(ticket, abort.signal); }
    catch (error) { if (isCurrent(ticket)) setMessage(error.message || "The operation did not complete. Your records are unchanged."); }
    finally {
      if (request.current === abort) { pending.current = false; request.current = null; }
      if (ticket === generation.current) setBusy(false);
    }
  }
  async function downloadVersion(ticket, read) {
    const snapshot = await read();
    if (!isCurrent(ticket)) return;
    const result = await createVerifiedWorkspaceSnapshotBackup(snapshot.sources);
    if (!isCurrent(ticket)) return;
    download(result.fileName, result.json);
    setMessage("Verified saved version downloaded. Use Recover from backup to review missing records before adding them. Cloud inventory, sales and separate attachment files are not included in this workspace version.");
  }
  async function exportCloud(ticket, signal) {
    const result = await workspace.exportCloudBackup(signal);
    if (!isCurrent(ticket)) return;
    if (!result?.verified) throw new Error("Cloud backup verification did not finish. Your records were not changed.");
    download(result.fileName, result.json);
    const { backup } = result;
    setCoverage({ recordCount: backup.records.recordCount, attachmentCount: backup.attachments.length,
      exclusions: backup.records.exclusions || [], missingTables: backup.records.missingTables || [],
      missingFiles: backup.fileErrors || [], externalFileReferences: backup.externalFileReferences || 0,
    });
    setMessage(backup.coverage === "COMPLETE_FOR_LISTED_SCOPE"
      ? "Cloud backup verified and downloaded for the listed records and attachments. Keep your device backup alongside it."
      : "Cloud backup verified and downloaded with exclusions. Review the coverage below and keep the missing files separately.");
  }
  const { status } = workspace;
  return <section className="drawer-info-card utility-card cloud-workspace-panel" aria-labelledby="cloud-saving-title" aria-busy={busy}>
    <h3 id="cloud-saving-title">Cloud saving</h3>
    <p>Keep the same saved records on your phone and computer. Your existing cloud collection and sales continue using their original storage.</p>
    <div className="cloud-workspace-status" role="status"><strong>{status.status === "SYNCED" ? "Saved to your account" : status.status === "CONFLICT" ? "Review conflicting changes" : workspace.enabled ? "Cloud saving enabled" : "Cloud saving paused"}</strong><p>{status.message}</p>{status.updatedAt && <small>Last confirmed save: {new Date(status.updatedAt).toLocaleString()}</small>}</div>
    <div><button type="button" disabled={busy || !workspace.enabled} onClick={() => run(() => workspace.syncNow())}>Sync now</button><button type="button" className="cloud-secondary" disabled={busy} onClick={() => workspace.setEnabled(!workspace.enabled)}>{workspace.enabled ? "Pause cloud saving" : "Resume cloud saving"}</button></div>
    {status.status === "REMOTE_AVAILABLE" && <button type="button" disabled={busy} onClick={() => run(() => workspace.loadNewer())}>Load changes from another device</button>}
    {status.status === "CONFLICT" && <button type="button" disabled={busy} onClick={() => run(async (ticket) => { const next = await workspace.reviewConflicts(); if (isCurrent(ticket)) { setReview(next); setChoices({}); } })}>Review both saved versions</button>}
    {review && <div><p>Choose which version to use for each group. Both originals remain in recovery history. Finish other edits before applying.</p>{review.conflicts.map((item) => <fieldset key={item.sourceId} disabled={busy}><legend>{item.displayName}</legend><label><input type="radio" name={item.sourceId} checked={choices[item.sourceId] === "DEVICE"} onChange={() => setChoices((value) => ({ ...value, [item.sourceId]: "DEVICE" }))} /> This device ({item.deviceRecordCount} records)</label><label><input type="radio" name={item.sourceId} checked={choices[item.sourceId] === "CLOUD"} onChange={() => setChoices((value) => ({ ...value, [item.sourceId]: "CLOUD" }))} /> Cloud ({item.cloudRecordCount} records)</label><button type="button" className="cloud-secondary" onClick={() => download(`code3-conflict-${item.sourceId}.json`, { device: item.device, cloud: item.cloud })}>Download both versions for comparison</button></fieldset>)}<button type="button" disabled={busy || !review.conflicts.length || Object.keys(choices).length !== review.conflicts.length} onClick={() => run(() => workspace.resolveConflicts(review.reviewId, choices))}>Preserve originals and apply choices</button></div>}
    <details><summary>Saved cloud versions</summary><p>Each cloud save keeps a previous version. Download a verified backup to review or recover missing records.</p><button type="button" className="cloud-secondary" disabled={busy} onClick={() => run(async (ticket) => { const rows = await workspace.history(); if (isCurrent(ticket)) setHistory(rows); })}>Load version history</button>{history && (history.length ? <ul>{history.map((row) => <li key={row.revision}>Version {row.revision} · {new Date(row.updatedAt).toLocaleString()} <button type="button" className="cloud-secondary" disabled={busy} onClick={() => run((ticket) => downloadVersion(ticket, () => workspace.readRevision(row.revision)))}>Download version {row.revision}</button></li>)}</ul> : <p>No cloud versions have been saved yet.</p>)}</details>
    <details><summary>Preserved device versions</summary><p>Before resolving a conflict, this browser keeps a verified copy of its original records. Download these copies before clearing browser data.</p><button type="button" className="cloud-secondary" disabled={busy} onClick={() => run(async (ticket) => { const rows = await workspace.listDeviceRecoveryCopies(); if (isCurrent(ticket)) setDeviceCopies(rows); })}>Load device recovery copies</button>{deviceCopies && (deviceCopies.length ? <ul>{deviceCopies.map((row) => <li key={row.copyId}>{new Date(row.createdAt).toLocaleString()} · before cloud version {row.cloudRevision} <button type="button" className="cloud-secondary" disabled={busy} onClick={() => run((ticket) => downloadVersion(ticket, () => workspace.readDeviceRecoveryCopy(row.copyId)))}>Download preserved copy</button></li>)}</ul> : <p>No conflict recovery copies are stored on this device.</p>)}</details>
    {message && <p role="status">{message}</p>}
    {coverage && <div><p>{coverage.recordCount} cloud records and {coverage.attachmentCount} attachments included.</p>{coverage.exclusions.length > 0 && <ul>{coverage.exclusions.map((item, index) => <li key={index}>{item}</li>)}</ul>}{coverage.missingTables.length > 0 && <p>{coverage.missingTables.length} record groups were unavailable and are listed in the downloaded backup.</p>}{coverage.missingFiles.length > 0 && <p>{coverage.missingFiles.length} attachments could not be downloaded. Their references remain in the backup; keep the original files separately.</p>}{coverage.externalFileReferences > 0 && <p>{coverage.externalFileReferences} external file references require separate file copies.</p>}</div>}
    <WorkspaceBackupPanel externalBusy={busy} onRecover={() => run(() => workspace.openRecovery())} onExportCloud={workspace.exportCloudBackup ? () => run(exportCloud) : null} />
    <AccountSessionPanel user={workspace.user} />
  </section>;
}
