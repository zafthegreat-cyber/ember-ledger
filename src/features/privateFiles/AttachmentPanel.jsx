import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton } from "../../components/operations/OperationsUI.jsx";
import { code3OwnerRequest } from "../../services/code3OwnerApi.js";
import { createPrivateFileClient, PRIVATE_FILE_ACCEPT } from "./privateFileClient.js";
import "./private-files.css";

export default function AttachmentPanel({ authorized = false, identityKey = "", domain, recordId, localDevelopment = false, request }) {
  if (!authorized || !identityKey) return <section className="private-files"><h3>Attachments</h3><p>Sign in as the owner to view private attachments.</p></section>;
  return <AuthorizedAttachments key={`${identityKey}:${domain}:${recordId}`} domain={domain} recordId={recordId} localDevelopment={localDevelopment} request={request} />;
}

function AuthorizedAttachments({ domain, recordId, localDevelopment, request }) {
  const client = useMemo(() => createPrivateFileClient({ request: request || ((path, init) => code3OwnerRequest(path, init, { localDevelopment })) }), [request, localDevelopment]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [revision, setRevision] = useState(0);
  const [snapshotAt, setSnapshotAt] = useState(() => Date.now());
  const lifetime = useRef(null);
  const pending = useRef(false);
  const inputId = useId();

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => { controller.abort(); };
  }, [client]);
  useEffect(() => {
    const controller = new AbortController();
    client.list(domain, recordId, controller.signal).then((result) => {
      if (!controller.signal.aborted) { setFiles(result); setSnapshotAt(Date.now()); setLoading(false); }
    }).catch((error) => {
      if (!controller.signal.aborted) { setMessage(error.message); setFailed(true); setLoading(false); }
    });
    return () => controller.abort();
  }, [client, domain, recordId, revision]);

  async function run(operation, success) {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || pending.current) return;
    pending.current = true;
    setBusy(true); setMessage(""); setFailed(false);
    try {
      await operation(controller.signal);
      if (!controller.signal.aborted) { setMessage(success); setConfirmation(""); setLoading(true); setRevision((value) => value + 1); }
    } catch (error) {
      if (!controller.signal.aborted) { setMessage(error.message); setFailed(true); }
    } finally { pending.current = false; if (!controller.signal.aborted) setBusy(false); }
  }

  async function download(file, signal) {
    const blob = await client.download(file, signal);
    if (signal.aborted) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = file.originalName; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="private-files" aria-busy={loading || busy} aria-label="Private attachments">
    <div className="private-files__heading"><div><h3>Attachments</h3><p>Private evidence for this record. PNG, JPEG, WebP or PDF, up to 8 MB each.</p></div>
      <SecondaryButton disabled={busy || loading} onClick={() => { setLoading(true); setMessage(""); setFailed(false); setRevision((value) => value + 1); }}>Refresh</SecondaryButton></div>
    <label htmlFor={inputId}>Add an attachment</label>
    <input id={inputId} type="file" accept={PRIVATE_FILE_ACCEPT} disabled={loading || busy || failed} onChange={(event) => {
      const file = event.target.files?.[0]; event.target.value = "";
      if (file) void run((signal) => client.upload(domain, recordId, file, signal), "Attachment saved and verified.");
    }} />
    {message ? <p className={failed ? "private-files__error" : "private-files__message"} role={failed ? "alert" : "status"}>{message}</p> : null}
    {loading ? <p role="status">Loading attachments…</p> : files.length ? <ul className="private-files__list">{files.map((file) => <li key={file.id}>
      <div><strong>{file.originalName}</strong><p>{Math.max(1, Math.ceil(file.size / 1024))} KB · {file.mimeType.split("/")[1].toUpperCase()}</p>
        <p>{file.availability === "VERIFIED" ? "File verified" : file.issue}</p>
        <p>Retained until {new Date(file.retainUntil).toLocaleDateString()}</p></div>
      {confirmation === file.id ? <div className="private-files__confirmation"><p>Delete this attachment and its saved file bytes?</p><div className="private-files__actions">
        <button className="private-files__delete ops-button ops-button--danger" disabled={busy} onClick={() => void run((signal) => client.remove(file, signal), "Attachment deleted.")}>Delete attachment</button>
        <SecondaryButton disabled={busy} onClick={() => setConfirmation("")}>Cancel</SecondaryButton></div></div> : <div className="private-files__actions">
        <PrimaryButton disabled={busy || file.availability !== "VERIFIED"} onClick={() => void run((signal) => download(file, signal), "Attachment downloaded.")}>Download</PrimaryButton>
        <SecondaryButton className="ops-button--danger" disabled={busy || Date.parse(file.retainUntil) > snapshotAt} onClick={() => setConfirmation(file.id)}>Delete</SecondaryButton>
      </div>}
    </li>)}</ul> : failed ? null : <p>No attachments yet. Add a receipt, condition photo or supporting document.</p>}
  </section>;
}
