import { useEffect, useMemo, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton } from "../../components/operations/OperationsUI.jsx";
import { code3OwnerRequest } from "../../services/code3OwnerApi.js";
import "./owner-sessions.css";

function ownerSessionClient(request) {
  return async (path = "", body, signal) => {
    const response = await request(`/api/code3/owner-sessions${path}`, { method: body === undefined ? "GET" : "POST", cache: "no-store", signal,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    const value = await response.json().catch(() => null);
    if (!response.ok || value?.ok !== true) {
      const error = new Error(value?.error?.message || "Session management is unavailable. Existing sign-in settings have not changed.");
      error.code = value?.error?.code || "owner_sessions_unavailable";
      throw error;
    }
    return value;
  };
}

export default function OwnerSessionPanel({ session, request, getFreshProof }) {
  if (session?.status !== "authorized" || !session.identityKey) return <section className="owner-sessions"><h3>Devices and security history</h3><p>Sign in as the owner to view session controls.</p></section>;
  return <AuthorizedSessionPanel key={session.identityKey} session={session} request={request} getFreshProof={getFreshProof} />;
}

function AuthorizedSessionPanel({ session, request, getFreshProof }) {
  const localDevelopment = session.localDevelopment === true;
  const client = useMemo(() => ownerSessionClient(request || ((path, init) => code3OwnerRequest(path, init, { localDevelopment }))), [localDevelopment, request]);
  const [devices, setDevices] = useState([]);
  const [audit, setAudit] = useState(null);
  const [label, setLabel] = useState("This device");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [revision, setRevision] = useState(0);
  const [confirmId, setConfirmId] = useState("");
  const pending = useRef(false);
  const lifetime = useRef(null);
  const unavailable = ["owner_sessions_not_active", "owner_sessions_unavailable", "session_store_unreadable", "session_operation_pending"].includes(errorCode);

  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    return () => controller.abort();
  }, [client]);
  useEffect(() => {
    const controller = new AbortController();
    client("", undefined, controller.signal).then((value) => {
      if (!controller.signal.aborted) {
        if (!Array.isArray(value.sessions)) throw new Error("The session list could not be verified.");
        setDevices(value.sessions); setLoading(false);
      }
    }).catch((error) => { if (!controller.signal.aborted) { setMessage(error.message); setErrorCode(error.code || "owner_sessions_unavailable"); setLoading(false); } });
    return () => controller.abort();
  }, [client, revision]);

  async function run(operation, success, refresh = true) {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted || pending.current) return;
    pending.current = true; setBusy(true); setMessage(""); setErrorCode("");
    try {
      await operation(controller.signal);
      if (!controller.signal.aborted) { setMessage(success); setConfirmId(""); if (refresh) { setLoading(true); setRevision((value) => value + 1); } }
    } catch (error) { if (!controller.signal.aborted) { setMessage(error.message); setErrorCode(error.code || "owner_sessions_unavailable"); } }
    finally { pending.current = false; if (!controller.signal.aborted) setBusy(false); }
  }

  async function revoke(device, signal) {
    const bytes = new TextEncoder().encode(JSON.stringify({ action: "REVOKE_APP_SESSION", targetSessionId: device.id }));
    const planDigest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((value) => value.toString(16).padStart(2, "0")).join("");
    if (signal.aborted) return;
    const proof = await getFreshProof({ purpose: "SESSION_REVOKE", planDigest, device, signal });
    if (signal.aborted) return;
    if (!proof) throw new Error("Owner confirmation was cancelled. No session was changed.");
    const { confirmation } = await client("/confirmation", { purpose: "SESSION_REVOKE", planDigest, proof }, signal);
    if (signal.aborted) return;
    await client(`/${encodeURIComponent(device.id)}/revoke`, { grant: confirmation.grant }, signal);
  }

  return <section className="owner-sessions" aria-label="Devices and security history" aria-busy={loading || busy}>
    <header><div><h3>Devices and security history</h3><p>Review registered Code 3 TCG app sessions and recovery receipts.</p></div>
      <SecondaryButton disabled={busy || loading} onClick={() => { setMessage(""); setErrorCode(""); setLoading(true); setRevision((value) => value + 1); }}>Refresh</SecondaryButton></header>
    <p>Registered app sessions are listed here. Connected provider sign-ins are managed separately.</p>
    {message ? <p role={errorCode ? "alert" : "status"}>{message}</p> : null}
    {loading ? <p role="status">Loading registered devices…</p> : null}
    {errorCode === "owner_session_revoked" && !devices.length ? <div className="owner-sessions__register"><label>Device name<input value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} disabled={busy} /></label>
      <PrimaryButton disabled={busy || !label.trim()} onClick={() => void run((signal) => client("/register", { label }, signal), "This device is registered.")}>Register this device</PrimaryButton><p>A previously revoked session must sign in again before it can register.</p></div> : null}
    {!loading && !unavailable && devices.length ? <ul>{devices.map((device) => <li key={device.id}><div><strong>{device.label}{device.current ? " · This device" : ""}</strong><p>{device.revokedAt ? `Revoked ${new Date(device.revokedAt).toLocaleString()}` : `Last seen ${new Date(device.lastSeenAt).toLocaleString()}`}</p></div>
      {confirmId === device.id ? <div className="owner-sessions__confirmation"><p>Revoke {device.label}?{device.current ? " This will block the current app session." : ""}</p><div>
        <button className="owner-sessions__revoke ops-button ops-button--danger" disabled={busy} onClick={() => void run((signal) => revoke(device, signal), "The Code 3 TCG app session was revoked.")}>Confirm and verify owner</button>
        <SecondaryButton disabled={busy} onClick={() => setConfirmId("")}>Cancel</SecondaryButton></div></div> : <SecondaryButton className="ops-button--danger" disabled={busy || Boolean(device.revokedAt) || typeof getFreshProof !== "function"} onClick={() => setConfirmId(device.id)}>Revoke session</SecondaryButton>}
    </li>)}</ul> : null}
    {typeof getFreshProof !== "function" ? <p>Revocation becomes available when fresh owner confirmation is connected.</p> : null}
    <SecondaryButton disabled={busy || loading || unavailable || Boolean(errorCode)} onClick={() => void run(async (signal) => {
      const result = await client("/audit", undefined, signal);
      if (!signal.aborted) { if (!Array.isArray(result.entries)) throw new Error("Security history could not be verified."); setAudit(result.entries); }
    }, "Security history loaded.", false)}>View security history</SecondaryButton>
    {audit ? <div><h4>Security history</h4>{audit.length ? <ol>{audit.slice().reverse().map((entry) => <li key={entry.id}><strong>{entry.action.toLowerCase().replaceAll("_", " ")}</strong><p>{new Date(entry.at).toLocaleString()}{entry.count != null ? ` · ${entry.count} records` : ""}</p></li>)}</ol> : <p>No security events recorded.</p>}</div> : null}
  </section>;
}
