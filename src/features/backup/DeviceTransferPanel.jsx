import { useEffect, useRef, useState } from "react";
import { useCloudWorkspace } from "../persistence/CloudWorkspaceContext.js";
import { compareDeviceTransfer, createDeviceTransfer, DEVICE_TRANSFER_MAX_BYTES } from "./deviceTransfer.js";
import { exportFile, exportFileStatus } from "../../native/nativeFiles.js";
import "./device-transfer.css";

function Totals({ title, result }) {
  if (!result) return <p>{title}: not checked. Include cloud records in the comparison.</p>;
  return <div><h4>{title}</h4><dl className="device-transfer__totals">
    <div><dt>Matching</dt><dd>{result.matched}</dd></div>
    <div><dt>Missing here</dt><dd>{result.missing}</dd></div>
    <div><dt>Different versions</dt><dd>{result.different}</dd></div>
    <div><dt>Additional here</dt><dd>{result.additional}</dd></div>
  </dl></div>;
}

export default function DeviceTransferPanel() {
  const workspace = useCloudWorkspace();
  const ownerId = workspace?.user?.id;
  const [includeCloud, setIncludeCloud] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState(null);
  const active = useRef(null);
  const pending = useRef(null);
  useEffect(() => {
    const identity = { ownerId }; active.current = identity;
    return () => { if (active.current === identity) active.current = null; pending.current?.abort(); pending.current = null; };
  }, [ownerId]);

  async function run(kind, file) {
    if (!ownerId || pending.current) return;
    const identity = active.current;
    const controller = new AbortController(); pending.current = controller;
    const assertCurrent = () => { if (!identity || active.current !== identity || controller.signal.aborted) throw new Error("The account changed. Reopen transfer checks for the signed-in account."); };
    setBusy(true); setNotice(""); setResult(null);
    try {
      assertCurrent();
      const options = { storage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage, userId: ownerId, assertCurrent,
        readCloudBackup: includeCloud ? () => workspace.exportCloudBackup(controller.signal) : null,
        applicationVersion: typeof __EMBER_TIDE_APP_VERSION__ === "undefined" ? "unknown" : __EMBER_TIDE_APP_VERSION__,
      };
      if (kind === "export") {
        const exported = await createDeviceTransfer(options); assertCurrent();
        const saved = await exportFile({ blob: new Blob([exported.json], { type: "application/json" }), filename: exported.fileName, signal: controller.signal, assertCurrent }); assertCurrent();
        setResult({ kind, ...exported, transfer: undefined, json: undefined, cloud: undefined, ownerId });
        setNotice(`${exportFileStatus(saved)} Keep the original app and its stored data.`);
      } else {
        if (file.size > DEVICE_TRANSFER_MAX_BYTES) throw new Error("Choose a Code 3 transfer file smaller than 52 MB.");
        const raw = await file.text(); assertCurrent();
        const compared = await compareDeviceTransfer(raw, options); assertCurrent();
        setResult({ kind, ...compared, ownerId }); setNotice(compared.message);
      }
    } catch (error) { if (active.current === identity) setNotice(error.message || "The transfer check could not finish. Original records are unchanged."); }
    finally { if (pending.current === controller) { pending.current = null; setBusy(false); } }
  }

  const visible = result?.ownerId === ownerId ? result : null;
  return <section className="device-transfer" aria-labelledby="device-transfer-title">
    <h3 id="device-transfer-title">Move to a new device</h3>
    <p>Your installed app has separate device storage. Sign in to the same account, then compare a transfer file from your original browser or phone.</p>
    <ol><li>On your original device, save a transfer file with your device records, cloud records, and supported attachments.</li><li>On the new device, sign in and allow cloud saving to load. Open this section and compare that file.</li><li>Review missing or different records before using recovery. Keep the original app until your records and photos are checked.</li></ol>
    {!ownerId ? <p>Sign in to an approved account to prepare or compare your records.</p> : <>
      <label className="device-transfer__checkbox"><input type="checkbox" checked={includeCloud} disabled={busy} onChange={(event) => setIncludeCloud(event.target.checked)} />Include cloud records and attachment verification</label>
      {!includeCloud ? <p>Device-only mode works offline. It cannot confirm that cloud records or photos have transferred.</p> : null}
      <div className="device-transfer__actions"><button type="button" disabled={busy} onClick={() => run("export")}>{busy ? "Checking records…" : "Save transfer file"}</button>
        <label className="device-transfer__file">Compare a transfer file<input type="file" accept="application/json,.json" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void run("compare", file); }} /></label></div>
      {notice ? <p role="status">{notice}</p> : null}
      {visible?.kind === "export" ? <p>Included: {visible.deviceRecordCount} device records, {visible.cloudRecordCount ?? "unchecked"} cloud records, and {visible.attachmentCount ?? "unchecked"} cloud attachments.</p> : null}
      {visible?.kind === "compare" ? <><Totals title="Device records" result={visible.device} /><Totals title="Cloud records" result={visible.cloud} /><Totals title="Cloud attachment bytes" result={visible.attachments} />
        {visible.settingsDiffer ? <p>{visible.settingsDiffer} source(s) have different settings or metadata. Current device settings stay in place.</p> : null}
        <details><summary>Review record groups</summary><ul>{visible.sections.map((section) => <li key={section.sourceId}><strong>{section.name}</strong>: {section.matched} matching, {section.missing} missing, {section.different} different, {section.additional} additional.</li>)}</ul></details>
        <button type="button" className="device-transfer__secondary" disabled={busy} onClick={() => workspace.openRecovery()}>Review recovery options</button><p>Choose the same transfer file in recovery. Missing records can be added after account verification; existing versions are kept.</p>
      </> : null}
      {visible?.warnings?.length ? <details open><summary>What still needs checking</summary><ul>{visible.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details> : null}
    </>}
  </section>;
}
