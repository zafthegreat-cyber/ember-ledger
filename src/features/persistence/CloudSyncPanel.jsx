import { useEffect, useRef, useState } from "react";
import { useCloudWorkspace } from "./CloudWorkspaceContext.js";
import { createVerifiedWorkspaceSnapshotBackup } from "../backup/workspaceRestorePlan.js";
import WorkspaceBackupPanel from "../backup/WorkspaceBackupPanel.jsx";
import DeviceTransferPanel from "../backup/DeviceTransferPanel.jsx";
import AccountSessionPanel from "../security/AccountSessionPanel.jsx";
import { ConnectedSignIns } from "../auth/SocialSignIn.jsx";
import { exportFile, exportFileStatus, exportFileError } from "../../native/nativeFiles.js";
import CloudConflictDifferences from "./CloudConflictDifferences.jsx";
import CloudSavingStatus from "./CloudSavingStatus.jsx";

import CloudHistoryBrowser from './CloudHistoryBrowser.jsx';
import { WORKSPACE_SYNC_SOURCES } from './cloudWorkspaceSources.js';
import { BackupCompleteness } from '../backup/BackupNextTools.jsx';
import './sync-next.css';

function download(name, value, signal) {
  const json = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return exportFile({ blob: new Blob([json], { type: "application/json;charset=utf-8" }), filename: name, signal });
}

// F01: cloud controls remount per signed-in account. A conflict review, cloud
// history or device-copy list opened for account A is discarded (not left on
// screen) when the workspace switches to account B, and any operation still
// running for A is aborted and ignored.
export default function CloudSyncPanel({ includeAccountSecurity = true }) {
  const workspace = useCloudWorkspace();
  const accountKey = workspace?.user?.id || workspace?.user?.email || "signed-out";
  return <CloudSyncPanelControls key={accountKey} includeAccountSecurity={includeAccountSecurity} />;
}

function CloudSyncPanelControls({ includeAccountSecurity }) {
  const workspace = useCloudWorkspace();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState('');
  const [failure, setFailure] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const retry = useRef(null);
  const groupRefs = useRef(new Map());
  const [history, setHistory] = useState(null);
  const [deviceCopies, setDeviceCopies] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [review, setReview] = useState(null);
  const [choices, setChoices] = useState({});
  const [finalReview,setFinalReview]=useState(false);
  const [lastFile,setLastFile]=useState(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const request = useRef(null);
  useEffect(() => () => { generation.current++; request.current?.abort(); }, [workspace?.user?.id]);
  if (!workspace) return null;

  function isCurrent(ticket) { return ticket === generation.current && !request.current?.signal.aborted; }
  async function run(task, label = 'Checking saved changes…', retryable = true) {
    if (pending.current) return;
    pending.current = true;
    const ticket = ++generation.current;
    const abort = new AbortController(); request.current = abort;
    setBusy(true); setActivity(label); setMessage(''); setFailure(''); setCanRetry(false); retry.current = null;
    try { await task(ticket, abort.signal); }
    catch (error) { if (isCurrent(ticket)) { setFailure(error.message || 'The operation did not complete. Your records are unchanged.'); setCanRetry(retryable); if (retryable) retry.current = () => run(task, label, retryable); } }
    finally {
      if (request.current === abort) { pending.current = false; request.current = null; }
      if (ticket === generation.current) setBusy(false);
    }
  }
  async function downloadVersion(ticket, read, signal) {
    const snapshot = await read();
    if (!isCurrent(ticket)) return;
    const result = await createVerifiedWorkspaceSnapshotBackup(snapshot.sources);
    if (!isCurrent(ticket)) return;
    let saved;
    try { saved = await download(result.fileName, result.json, signal); }
    catch (error) { throw new Error(exportFileError(error)); }
    if (!isCurrent(ticket)) return;
    setLastFile({name:result.fileName,status:exportFileStatus(saved)});
    setMessage(`${exportFileStatus(saved)} Use Recover from backup to review missing records before adding them. Cloud inventory, sales and separate attachment files are not included in this workspace version.`);
  }
  async function exportCloud(ticket, signal) {
    const result = await workspace.exportCloudBackup(signal);
    if (!isCurrent(ticket)) return;
    if (!result?.verified) throw new Error("Cloud backup verification did not finish. Your records were not changed.");
    let saved;
    try { saved = await download(result.fileName, result.json, signal); }
    catch (error) { throw new Error(exportFileError(error)); }
    if (!isCurrent(ticket)) return;
    setLastFile({name:result.fileName,status:exportFileStatus(saved)});
    const { backup } = result;
    setCoverage({ recordCount: backup.records.recordCount, attachmentCount: backup.attachments.length,
      exclusions: backup.records.exclusions || [], missingTables: backup.records.missingTables || [],
      missingFiles: backup.fileErrors || [], externalFileReferences: backup.externalFileReferences || 0,
    });
    setMessage(backup.coverage === "COMPLETE_FOR_LISTED_SCOPE"
      ? `${exportFileStatus(saved)} Cloud backup verified for the listed records and attachments. Keep your device backup alongside it.`
      : `${exportFileStatus(saved)} Cloud backup verified with exclusions. Review the coverage below and keep the missing files separately.`);
  }
  async function downloadConflict(ticket, signal, item) {
    try { const saved = await download(`code3-conflict-${item.sourceId}.json`, { device: item.device, cloud: item.cloud }, signal); if (isCurrent(ticket)) setMessage(exportFileStatus(saved)); }
    catch (error) { throw new Error(exportFileError(error)); }
  }
  const { status } = workspace;
  const reviewedCount = review?.conflicts.filter(item => choices[item.sourceId]).length || 0;
  const nextUndecided = review?.conflicts.find(item => !choices[item.sourceId]);
  async function checkSync() {
    const result = await workspace.syncNow();
    if (result?.status && !['SYNCED', 'PENDING', 'IDLE', 'REMOTE_AVAILABLE', 'CONFLICT', 'REVISION_CONFLICT'].includes(result.status)) throw new Error(result.message || 'Cloud saving did not complete. Check your connection and try again.');
  }
  return <section className="drawer-info-card utility-card cloud-workspace-panel" aria-labelledby="cloud-saving-title" aria-busy={busy}>
    <h3 id="cloud-saving-title">Cloud saving</h3>
    <p>Keep the same saved records on your phone and computer. Your existing cloud collection and sales continue using their original storage.</p>
    <CloudSavingStatus status={status} enabled={workspace.enabled} />
    {Array.isArray(status.pendingSourceIds) ? <div className="cloud-pending-groups"><strong>{status.pendingSourceIds.length ? 'Local groups awaiting acknowledgement' : 'No local workspace groups were pending at the last check'}</strong>{status.pendingSourceIds.length?<ul>{status.pendingSourceIds.map(id=><li key={id}>{WORKSPACE_SYNC_SOURCES.find(source=>source.sourceId===id)?.displayName||id}</li>)}</ul>:null}<p>Compared with the last verified sync receipt. Separate collection and sales saves keep their own status. A new edit may still be waiting for the next check.</p></div> : <p>Pending local groups have not been checked yet.</p>}
    {busy ? <p role="status">{activity}</p> : null}
    {failure ? <div role="alert" className="auth-status-message error"><strong>Action did not finish</strong><p>{failure}</p>{canRetry ? <button type="button" disabled={busy} onClick={() => retry.current?.()}>Retry</button> : <p>Review the current saved versions before trying again.</p>}</div> : null}
    <div><button type="button" disabled={busy || !workspace.enabled} onClick={() => run(checkSync)}>Sync now</button><button type="button" className="cloud-secondary" disabled={busy} onClick={() => workspace.setEnabled(!workspace.enabled)}>{workspace.enabled ? "Pause cloud saving" : "Resume cloud saving"}</button></div>
    {status.status === "REMOTE_AVAILABLE" && <button type="button" disabled={busy} onClick={() => run(() => workspace.loadNewer(), 'Checking and loading saved changes…', false)}>Load changes from another device</button>}
    {status.status === "CONFLICT" && <button type="button" disabled={busy} onClick={() => run(async (ticket) => { const next = await workspace.reviewConflicts(); if (isCurrent(ticket)) { setReview(next); setChoices({}); setFinalReview(false); } }, 'Comparing saved versions…')}>Review both saved versions</button>}
    {review && <div>
      <p>Choose which version to use for each group. Both originals remain in recovery history. Finish other edits before applying.</p>
      <p role="status">{reviewedCount} of {review.conflicts.length} groups reviewed</p>
      {nextUndecided ? <button type="button" disabled={busy} onClick={() => groupRefs.current.get(nextUndecided.sourceId)?.querySelector('input[type=radio]')?.focus()}>Review next undecided group</button> : null}
      {review.conflicts.map(item => <fieldset ref={node => { if (node) groupRefs.current.set(item.sourceId, node); else groupRefs.current.delete(item.sourceId); }} key={item.sourceId} disabled={busy}>
        <legend>{item.displayName}</legend>
        <CloudConflictDifferences item={item} cloudSavedAt={review.cloudSavedAt} revision={review.revision} />
        <label><input type="radio" name={item.sourceId} checked={choices[item.sourceId] === "DEVICE"} onChange={() => {setFinalReview(false);setChoices(value => ({ ...value, [item.sourceId]: "DEVICE" }));}} /> This device ({item.deviceRecordCount} {item.deviceRecordCount === 1 ? 'record' : 'records'})</label>
        <label><input type="radio" name={item.sourceId} checked={choices[item.sourceId] === "CLOUD"} onChange={() => {setFinalReview(false);setChoices(value => ({ ...value, [item.sourceId]: "CLOUD" }));}} /> Cloud ({item.cloudRecordCount} {item.cloudRecordCount === 1 ? 'record' : 'records'})</label>
        <p>The comparison download contains both groups, including private names, notes, locations and record details present in either copy. Keep it private.</p>
        <button type="button" className="cloud-secondary" onClick={() => run((ticket, signal) => downloadConflict(ticket, signal, item), 'Preparing comparison download…')}>Download both versions for comparison</button>
      </fieldset>)}
      <button type="button" disabled={busy || !review.conflicts.length || reviewedCount !== review.conflicts.length} onClick={()=>setFinalReview(true)}>Review final choices</button>
      {finalReview?<section className="cloud-final-review"><h4>Confirm all group choices</h4><p>Each selection replaces the whole listed group. Both originals remain in recovery history.</p><ul>{review.conflicts.map(item=><li key={item.sourceId}><strong>{item.displayName}</strong>: {choices[item.sourceId]==='DEVICE'?'This device':'Cloud'} <button type="button" onClick={()=>{setFinalReview(false);groupRefs.current.get(item.sourceId)?.querySelector('input[type=radio]')?.focus();}}>Change choice</button></li>)}</ul><button type="button" disabled={busy} onClick={()=>run(async()=>{await workspace.resolveConflicts(review.reviewId,choices);setReview(null);setFinalReview(false);},'Preserving originals and applying reviewed choices…',false)}>Preserve originals and apply choices</button></section>:null}
    </div>}
    <details><summary>Saved cloud versions</summary><p>Each cloud save keeps a previous version. Download a verified backup to review or recover missing records. These workspace versions exclude separately stored cloud inventory, sales, and attachment files.</p><button type="button" className="cloud-secondary" disabled={busy} onClick={() => run(async (ticket) => { const rows = await workspace.history(); if (isCurrent(ticket)) setHistory(rows); }, 'Loading version history…')}>Load version history</button>{history && (history.length ? <CloudHistoryBrowser rows={history} busy={busy} onDownload={row=>run((ticket,signal)=>downloadVersion(ticket,()=>workspace.readRevision(row.revision),signal),`Downloading version ${row.revision}…`)} /> : <p>No cloud versions have been saved yet.</p>)}</details>
    <details><summary>Preserved device versions</summary><p>Before resolving a conflict, this browser keeps a verified copy of its original records. Download these copies before clearing browser data.</p><button type="button" className="cloud-secondary" disabled={busy} onClick={() => run(async (ticket) => { const rows = await workspace.listDeviceRecoveryCopies(); if (isCurrent(ticket)) setDeviceCopies(rows); }, 'Loading device recovery copies…')}>Load device recovery copies</button>{deviceCopies && (deviceCopies.length ? <CloudHistoryBrowser rows={deviceCopies} busy={busy} device onDownload={row=>run((ticket,signal)=>downloadVersion(ticket,()=>workspace.readDeviceRecoveryCopy(row.copyId),signal),"Downloading preserved copy…")} /> : <p>No conflict recovery copies are stored on this device.</p>)}</details>
    {lastFile?<p className="backup-last-file"><strong>{lastFile.name}</strong> · {lastFile.status} Verified bytes were prepared; check your Downloads or the chosen destination to confirm you kept the file.</p>:null}
    {coverage?<BackupCompleteness scope="Cloud" records={coverage.recordCount} embedded={coverage.attachmentCount} references={coverage.externalFileReferences} unavailable={coverage.missingFiles.length} excluded={coverage.missingTables.length+coverage.exclusions.length} privateFilesChecked />:null}
    {message && <p role="status">{message}</p>}
    {coverage && <div><p>{coverage.recordCount} cloud records and {coverage.attachmentCount} attachments included.</p>{coverage.exclusions.length > 0 && <ul>{coverage.exclusions.map((item, index) => <li key={index}>{item}</li>)}</ul>}{coverage.missingTables.length > 0 && <p>{coverage.missingTables.length} record groups were unavailable and are listed in the downloaded backup.</p>}{coverage.missingFiles.length > 0 && <p>{coverage.missingFiles.length} attachments could not be downloaded. Their references remain in the backup; keep the original files separately.</p>}{coverage.externalFileReferences > 0 && <p>{coverage.externalFileReferences} external file references require separate file copies.</p>}</div>}
    <WorkspaceBackupPanel key={workspace.user?.id || "unbound"} externalBusy={busy} onRecover={() => run(() => workspace.openRecovery(), 'Opening recovery review…', false)} onExportCloud={workspace.exportCloudBackup ? () => run(exportCloud, 'Verifying and downloading cloud backup…') : null} />
    <DeviceTransferPanel />
    {includeAccountSecurity ? <><ConnectedSignIns user={workspace.user} /><AccountSessionPanel user={workspace.user} /></> : null}
  </section>;
}
