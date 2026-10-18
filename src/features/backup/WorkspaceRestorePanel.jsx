import { useEffect, useRef, useState } from "react";
import { BACKUP_PARSE_LIMITS } from "./canonicalJson.js";
import { planWorkspaceRestore } from "./workspaceRestorePlan.js";
import { inspectLegacyCloudBackup } from "./legacyCloudBackup.js";
import { DEVICE_TRANSFER_FORMAT, DEVICE_TRANSFER_MAX_BYTES, transferRecoveryParts } from "./deviceTransfer.js";

// Mounted by the workspace gate, after app writers have been unmounted. The
// host rechecks this exact plan, verifies the account, and commits under a lock.
export default function WorkspaceRestorePanel({ storage = globalThis.localStorage, onRestore, onRestoreCloud, userId, onCancel }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [transfer, setTransfer] = useState(null);
  const rawRef = useRef(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const abortRef = useRef(null);
  useEffect(() => () => { generation.current++; rawRef.current = null; abortRef.current?.abort(); }, []);

  async function inspect(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || pending.current) return;
    const request = ++generation.current;
    pending.current = true;
    setBusy(true); setMessage(""); setPlan(null); setPassword(""); rawRef.current = null;
    try {
      setTransfer(null);
      if (file.size > DEVICE_TRANSFER_MAX_BYTES) throw new Error("Choose a Code 3 backup or transfer smaller than 52 MB.");
      let raw = await file.text();
      if (request !== generation.current) return;
      if (JSON.parse(raw)?.format === DEVICE_TRANSFER_FORMAT) {
        const parts = await transferRecoveryParts(raw, { userId });
        if (request !== generation.current) return;
        setTransfer(parts);
        raw = parts.deviceRaw;
      } else if (file.size > 40 * 1024 * 1024) throw new Error("Cloud backups must be smaller than 40 MB.");
      const cloud = JSON.parse(raw)?.format === "code3-cloud-backup";
      if (cloud && (!userId || !onRestoreCloud)) throw new Error("Sign in to the original account to recover this cloud backup.");
      if (!cloud && new TextEncoder().encode(raw).byteLength > BACKUP_PARSE_LIMITS.maxBytes) throw new Error("Device backups must be smaller than 10 MB.");
      const result = cloud ? await inspectLegacyCloudBackup(raw, { userId }) : await planWorkspaceRestore(raw, { storage });
      if (request !== generation.current) return;
      rawRef.current = raw;
      setPlan(cloud ? { kind: "cloud", planHash: result.planDigest, recordCount: result.recordCount, attachmentCount: result.attachmentCount, coverage: result.coverage, exclusions: result.exclusions, missingFiles: result.missingFiles } : result.plan);
      setMessage("Backup checked. Your current records have not been changed.");
    } catch (error) { if (request === generation.current) setMessage(error?.message || "The backup could not be inspected."); }
    finally { pending.current = false; if (request === generation.current) setBusy(false); }
  }

  async function chooseTransferPart(kind) {
    if (pending.current || !transfer) return;
    const raw = kind === "cloud" ? transfer.cloudRaw : transfer.deviceRaw;
    if (!raw || kind === "cloud" && !onRestoreCloud) return;
    const request = ++generation.current;
    pending.current = true; setBusy(true); setMessage(""); setPlan(null); setPassword(""); rawRef.current = null;
    try {
      const checked = kind === "cloud" ? await inspectLegacyCloudBackup(raw, { userId }) : await planWorkspaceRestore(raw, { storage });
      if (request !== generation.current) return;
      rawRef.current = raw;
      setPlan(kind === "cloud" ? { kind, planHash: checked.planDigest, recordCount: checked.recordCount, attachmentCount: checked.attachmentCount, coverage: checked.coverage, exclusions: checked.exclusions, missingFiles: checked.missingFiles } : checked.plan);
      setMessage("Selected transfer records checked. Your current records have not been changed.");
    } catch (error) { if (request === generation.current) setMessage(error.message || "These transfer records could not be inspected."); }
    finally { pending.current = false; if (request === generation.current) setBusy(false); }
  }

  async function restore(event) {
    event.preventDefault();
    if (pending.current || !plan || !rawRef.current || !password || !onRestore) return;
    pending.current = true;
    const request = ++generation.current;
    const controller = new AbortController(); abortRef.current = controller;
    setBusy(true); setMessage("");
    const secret = password;
    setPassword("");
    try {
      const result = await (plan.kind === "cloud" ? onRestoreCloud : onRestore)({ raw: rawRef.current, plan, password: secret, signal: controller.signal });
      if (request !== generation.current) return;
      rawRef.current = null; setPlan(null);
      setMessage(result?.status === "APPLIED" ? `Recovered ${result.insertedRecords} missing cloud records. Kept ${result.keptExistingRecords} existing records and verified ${result.uploadedFiles + result.retainedExistingFiles} attachments. Return to saved records to load them.` : "Missing records recovered. Existing records were kept. A local recovery checkpoint was saved.");
    } catch (error) { if (request === generation.current) setMessage(error?.message || "Recovery did not complete. Your saved records have been preserved."); }
    finally { pending.current = false; if (request === generation.current) setBusy(false); }
  }

  return <section className="backup-result" aria-labelledby="workspace-recovery-title">
    <h2 id="workspace-recovery-title">Recover saved records</h2>
    <p>Add missing records from a verified Code 3 backup. Existing records and settings stay in place, including newer versions with the same ID.</p>
    <label>Select backup or transfer file<input type="file" accept="application/json,.json" disabled={busy} onChange={inspect} /></label>
    {message ? <p role="status">{message}</p> : null}
    {transfer ? <div><p>This transfer is linked to your signed-in account. Device records and cloud records are reviewed and recovered separately.</p><div className="backup-actions"><button type="button" disabled={busy} onClick={() => chooseTransferPart("device")}>Review device records</button>{transfer.cloudRaw ? <button type="button" disabled={busy || !onRestoreCloud} onClick={() => chooseTransferPart("cloud")}>Review cloud records and attachments</button> : null}</div>{transfer.warnings.length ? <details><summary>Transfer limitations</summary><ul>{transfer.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details> : null}</div> : null}
    {plan ? <form onSubmit={restore}>
      {plan.kind === "cloud" ? <><dl><div><dt>Cloud records checked</dt><dd>{plan.recordCount}</dd></div><div><dt>Attachments verified</dt><dd>{plan.attachmentCount}</dd></div></dl><p>Only missing records and files will be added. Existing records are kept; a different existing file stops recovery without overwriting it.</p>{plan.coverage !== "COMPLETE_FOR_LISTED_SCOPE" && <p>This backup has incomplete coverage. Keep the original records and files.</p>}<details><summary>Cloud backup exclusions</summary><ul>{plan.exclusions.map((text) => <li key={text}>{text}</li>)}{plan.missingFiles.map((file) => <li key={`${file.bucket}/${file.path}`}>Missing file: {file.path}</li>)}</ul></details></> : <dl><div><dt>Records to add</dt><dd>{plan.addedRecords}</dd></div><div><dt>Existing versions kept</dt><dd>{plan.preservedConflicts}</dd></div><div><dt>Sources inspected</dt><dd>{plan.sources.length}</dd></div></dl>}
      {plan.skippedSources?.length ? <p>Not restored here: {plan.skippedSources.join(", ")}. Keep this backup for those sources.</p> : null}
      {plan.fileReferencesNotIncluded ? <p>{plan.fileReferencesNotIncluded} attachment references need their original files. Record recovery does not recover missing file bytes.</p> : null}
      {plan.warnings?.length ? <details><summary>Review backup limitations</summary><ul>{plan.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details> : null}
      <label>Confirm your password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} required /></label>
      <p>Your password verifies this recovery with your account provider and is never saved in the backup.</p>
      <button type="submit" disabled={busy || !password || !onRestore}>{busy ? "Recovering…" : "Verify account and recover missing records"}</button>
    </form> : null}
    {onCancel ? <button type="button" disabled={busy} onClick={onCancel}>Back to saved records</button> : null}
  </section>;
}
