import { useId, useRef, useState } from "react";
import "./member-start.css";

export default function EmailConfirmationHelp({ email, onEmailChange, onRequest, available = true, expired = false }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const inFlight = useRef(false);
  async function request() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    try { setNotice(await onRequest(email)); }
    catch { setNotice({ ok: false, message: "Email help is unavailable right now. Try again later or contact support." }); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <details className="member-help" open={expired || undefined}>
    <summary>Email confirmation help</summary>
    {expired && <p role="alert">This email link has expired or is no longer valid. Request a fresh confirmation link below. For a password reset, choose Forgot password and request a new reset link.</p>}
    <p>After creating an email account, open the confirmation email from Code 3 TCG, then return to Log In. Staff approval is not needed. Check spam and use the newest link.</p>
    <label htmlFor={`${id}-email`}>Email used to create your account</label>
    <input id={`${id}-email`} type="email" autoComplete="email" value={email} onChange={event => onEmailChange(event.target.value)} aria-describedby={`${id}-note`} />
    <p id={`${id}-note`}>Request only for your own email. Wait at least one minute between requests. Discord and other social sign-ins use their own provider flow.</p>
    <button type="button" className="secondary-button" disabled={busy || !available} onClick={() => void request()}>{busy ? "Requesting confirmation…" : "Resend confirmation email"}</button>
    {notice && <p role={notice.ok ? "status" : "alert"}>{notice.message}</p>}
    <p><a href="/support">Get private sign-in help</a></p>
  </details>;
}

export function SignupFieldPrivacy() {
  return <aside className="member-field-privacy" aria-label="Signup field visibility">
    <strong>What other members see</strong>
    <p>Your public username appears with community activity. Your account name and email are for account records and support. Keep personal details out of your username. Your password is never public.</p>
    <a href="/privacy">Read how account information is handled</a>
  </aside>;
}
