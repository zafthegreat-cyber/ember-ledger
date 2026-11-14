import { useEffect, useRef, useState } from "react";
import accountSessions from "../../services/accountSessionService.js";
import { supabase } from "../../supabaseClient.js";
import { PrimaryButton, SecondaryButton } from "../../components/operations/OperationsUI.jsx";
import "./owner-sessions.css";
import { filterAccountSessions, readSessionLabels, saveSessionLabel } from '../../utils/accountDisplayPreferences.mjs';
import PasswordInput from '../auth/PasswordInput.jsx';

export default function AccountSessionPanel({ user, service = accountSessions }) {
  if (!user?.id || user.id === "local-beta") return null;
  return <SignedInSessions key={user.id} user={user} service={service} />;
}

function SignedInSessions({ user, service }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [target, setTarget] = useState(null);
  const [password, setPassword] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState('active');
  const [labels, setLabels] = useState(() => readSessionLabels(globalThis.localStorage, user.id));
  const [renameTarget, setRenameTarget] = useState(null);
  const [deviceName, setDeviceName] = useState('');
  const lifetime = useRef(null);
  const pending = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      await service.currentUser(user.id, controller.signal);
      const label = /Android|iPhone|iPad/i.test(globalThis.navigator?.userAgent || "") ? "Phone or tablet" : "Computer browser";
      await service.register(label, { signal: controller.signal });
      const result = await service.list({ signal: controller.signal });
      if (!controller.signal.aborted) { setDevices(result); setLoading(false); }
    }
    load().catch((reason) => { if (!controller.signal.aborted) { setError(reason.message); setLoading(false); } });
    return () => controller.abort();
  }, [refresh, service, user.id]);

  async function revoke(event) {
    event.preventDefault();
    const signal = lifetime.current?.signal;
    if (!target || pending.current || !signal || signal.aborted) return;
    pending.current = true;
    setBusy(true); setMessage(""); setError("");
    const submittedPassword = password;
    setPassword("");
    try {
      const input = JSON.stringify({ action: "REVOKE_APP_SESSION", targetSessionId: target.id });
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
      const planDigest = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      const confirmation = await service.confirm({ purpose: "SESSION_REVOKE", planDigest, password: submittedPassword, userId: user.id, signal });
      await service.revoke(target.id, confirmation, { signal });
      if (signal.aborted) return;
      setMessage("App access for this device was revoked. Your saved records are unchanged.");
      if (target.current) await supabase.auth.signOut({ scope: "local" });
      else { setLoading(true); setRefresh((value) => value + 1); }
      setTarget(null);
    } catch (reason) { if (!signal.aborted) setError(reason.message || "The device could not be revoked."); }
    finally { pending.current = false; if (!signal.aborted) setBusy(false); }
  }

  function rename(event) {
    event.preventDefault();
    if (!renameTarget || !devices.some(device => device.id === renameTarget.id)) return;
    try { setLabels(saveSessionLabel(globalThis.localStorage, user.id, renameTarget.id, deviceName)); setRenameTarget(null); setMessage('Device name saved on this browser.'); setError(''); }
    catch (reason) { setError(reason.message || 'The name could not be saved on this browser.'); }
  }
  const displayName = device => labels[device.id] || device.label;
  const visibleDevices = filterAccountSessions(devices, filter);

  return <section className="owner-sessions" aria-label="Signed-in devices" aria-busy={loading || busy}>
    <header><div><h3>Signed-in devices</h3><p>Manage access to your synced workspace. Signing out or revoking access keeps your saved records.</p></div>
      <SecondaryButton disabled={loading || busy} onClick={() => { setError(""); setLoading(true); setRefresh((value) => value + 1); }}>Refresh devices</SecondaryButton></header>
    {error ? <p role="alert">{error}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {loading ? <p role="status">Checking your signed-in devices…</p> : null}
    <label className="owner-sessions__filter">Show devices<select value={filter} onChange={event => setFilter(event.target.value)}><option value="active">Active ({filterAccountSessions(devices,'active').length})</option><option value="inactive">Signed out / revoked ({filterAccountSessions(devices,'inactive').length})</option><option value="all">All devices ({devices.length})</option></select></label>
    <p>Device names are private labels saved on this browser.</p>
    {!loading && !visibleDevices.length && <p>No devices in this view.</p>}
    <ul>{visibleDevices.map((device) => <li key={device.id}>
      <div><strong>{displayName(device)}{device.current ? " · This device" : ""}</strong><p>{device.revokedAt ? "App access revoked" : device.signedOut ? "Signed out" : `Last used ${Number.isFinite(Date.parse(device.lastSeenAt)) ? new Date(device.lastSeenAt).toLocaleString() : 'Time not recorded'}`}</p>{labels[device.id] && <small>{device.label}</small>}</div>
      <SecondaryButton disabled={busy} onClick={() => {setRenameTarget(device);setDeviceName(displayName(device));setError('');}}>Name device</SecondaryButton>
      <SecondaryButton disabled={busy || Boolean(device.revokedAt) || device.signedOut} onClick={() => { setTarget(device); setPassword(""); setError(""); }}>Revoke app access</SecondaryButton>
    </li>)}</ul>
    {renameTarget && <form className="owner-sessions__register" onSubmit={rename}><h4>Name {renameTarget.current ? 'this device' : renameTarget.label}</h4><label>Device name<input value={deviceName} maxLength={60} required onChange={event => setDeviceName(event.target.value)} placeholder="My Pixel or Office laptop" /></label><div className="drawer-inline-actions"><SecondaryButton type="button" onClick={() => setRenameTarget(null)}>Cancel name change</SecondaryButton><PrimaryButton type="submit" disabled={!deviceName.trim()}>Save device name</PrimaryButton></div></form>}
    {target ? <form className="owner-sessions__register" onSubmit={revoke}>
      <h4>Revoke access for {displayName(target)}?</h4>
      <p>{target.current ? "This will sign you out on this device. " : ""}Your records and backups will remain saved. Confirm with your current password.</p>
      <PasswordInput label="Current password" autoComplete="current-password" required maxLength={1024} value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} />
      <div><PrimaryButton type="submit" disabled={busy || !password}>{busy ? "Confirming…" : "Confirm and revoke"}</PrimaryButton>{" "}
        <SecondaryButton type="button" disabled={busy} onClick={() => { setTarget(null); setPassword(""); }}>Cancel</SecondaryButton></div>
    </form> : null}
  </section>;
}
