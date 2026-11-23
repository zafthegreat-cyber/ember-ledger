import { useEffect, useRef, useState } from "react";
import { ACCOUNT_DELETION_CONFIRMATION, fetchAccountDeletionStatus, deleteOwnAccount } from "../../services/accountDeletionApi.js";
import { PRIVACY_PUBLISHER } from "../../config/privacyPolicy.js";
import PrivacySupportContact from "./PrivacySupportContact.jsx";
import { deletionHelpState } from "./privacySupport.js";
import { SOCIAL_PROVIDERS } from "../auth/socialAuth.mjs";
import "./privacy.css";

const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Matches the server window (SOCIAL_REAUTH_WINDOW_SECONDS). The server decides; this only guides the buttons.
const SOCIAL_CONFIRM_SECONDS = 300;

/** The sign-in provider a social-only account confirms with (first one it uses). */
function socialProviderFor(user) {
  const used = [...(Array.isArray(user?.identities) ? user.identities.map((item) => item?.provider) : []), ...(Array.isArray(user?.app_metadata?.providers) ? user.app_metadata.providers : [])];
  return SOCIAL_PROVIDERS.find((provider) => used.includes(provider.id)) || null;
}

/** When the current session last signed in with a provider (seconds), read from this device's own session; display only. */
async function readSocialConfirmedAt() {
  try {
    const { supabase } = await import("../../supabaseClient.js");
    const { data } = await supabase.auth.getSession();
    const claims = JSON.parse(atob((data?.session?.access_token || "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return Math.max(0, ...claims.amr.filter((entry) => entry?.method === "oauth").map((entry) => Number(entry.timestamp) || 0));
  } catch { return 0; }
}

async function startSocialConfirmation(provider, userId) {
  const { socialAuth } = await import("../auth/socialAuthClient.js");
  await socialAuth.start(provider, { mode: "reauth", userId });
}
export default function AccountDeletionPage(props) {
  // Changing accounts unmounts the previous confirmation and cancels its work.
  // No busy state, password, confirmation, or success message crosses accounts.
  return <AccountDeletionForm key={props.user?.id || "signed-out"} {...props} />;
}

function AccountDeletionForm({ user, onNavigate, onDeleted, completed = false, statusLoader = fetchAccountDeletionStatus, deleteAccount = deleteOwnAccount,
  socialConfirmedAt = readSocialConfirmedAt, startSocialConfirm = startSocialConfirmation, now = () => Date.now() }) {
  const [storedReview, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState(0);
  const operation = useRef(null);
  const generation = useRef(0);
  const accountId = ACCOUNT_ID.test(user?.id || "") ? user.id : "";
  const review = storedReview?.ownerId === accountId ? storedReview : null;
  const finished = completed || deleted;
  const help = deletionHelpState(review, errorCode);
  const social = review?.confirmWith === "social";
  const provider = social ? socialProviderFor(user) : null;
  const socialFresh = social && confirmedAt > 0 && now() / 1000 - confirmedAt <= SOCIAL_CONFIRM_SECONDS;
  const credentialReady = social ? socialFresh : Boolean(password);
  useEffect(() => () => { generation.current++; operation.current?.abort(); }, [accountId]);

  async function loadReview() {
    if (operation.current || !accountId) return;
    const controller = new AbortController(); operation.current = controller;
    const ticket = ++generation.current;
    setBusy(true); setError(""); setErrorCode(""); setReview(null); setPassword(""); setConfirmation(""); setAcknowledged(false);
    try {
      const next = await statusLoader({ expectedUserId: accountId, signal: controller.signal });
      if (ticket === generation.current) {
        if (next.confirmWith === "social") setConfirmedAt(await socialConfirmedAt());
        if (ticket === generation.current) setReview({ ...next, ownerId: accountId });
      }
    } catch (failure) { if (ticket === generation.current && failure?.name !== "AbortError") { setError(failure.message || "The deletion review could not be loaded."); setErrorCode(failure.code || "account_deletion_unavailable"); } }
    finally { if (operation.current === controller) operation.current = null; if (ticket === generation.current) setBusy(false); }
  }

  async function submit(event) {
    event.preventDefault();
    if (operation.current || !review?.available || review.blockers.length || !acknowledged || confirmation !== ACCOUNT_DELETION_CONFIRMATION || !credentialReady || !accountId) return;
    const controller = new AbortController(); operation.current = controller;
    const ticket = ++generation.current;
    const currentPassword = password;
    setPassword(""); setBusy(true); setError(""); setErrorCode("");
    try {
      await deleteAccount(social ? { confirmation } : { password: currentPassword, confirmation }, { expectedUserId: accountId, signal: controller.signal });
      if (ticket !== generation.current) return;
      setDeleted(true); setReview(null); setConfirmation(""); setAcknowledged(false);
      try { await onDeleted?.(); } catch { setError("Cloud deletion succeeded. Close the app and sign out of any remaining device sessions. Your separate device copies still need review."); }
    } catch (failure) {
      if (ticket === generation.current && failure?.name !== "AbortError") {
        setError(failure.message || "Deletion is not confirmed. Check status before trying again.");
        setErrorCode(failure.code || "outcome_unknown");
        if (failure.code === "account_social_reauthentication_required") setConfirmedAt(0);
        if (!["account_reauthentication_failed", "account_social_reauthentication_required", "invalid_confirmation"].includes(failure.code)) setReview(null);
      }
    } finally { if (operation.current === controller) operation.current = null; if (ticket === generation.current) setBusy(false); }
  }

  async function confirmWithProvider() {
    if (operation.current || !provider || !accountId) return;
    setBusy(true); setError(""); setErrorCode("");
    // On the phone the provider opens in a browser over the app; if it is closed, this page must stay usable.
    try { await startSocialConfirm(provider.id, accountId); }
    catch (failure) { setError(failure?.message || `${provider.name} sign-in could not start. Try again.`); }
    finally { setBusy(false); }
  }

  return <section className="code3-privacy" aria-labelledby="code3-delete-title" aria-busy={busy}>
    <header><p className="code3-privacy-eyebrow">Code 3 TCG · Account &amp; privacy</p><h2 id="code3-delete-title">{finished ? "Account deleted" : "Delete your account"}</h2>
      <p>{finished ? "The service confirmed that account deletion finished." : "Review the scope and save anything you want to keep before you permanently delete your account."}</p></header>
    {finished ? <div className="code3-privacy-status" role="status"><p>Your cloud account was deleted. Device-only copies and downloaded backups are separate and have not been erased. Copies on this device remain linked to the original account; they are not automatically given to a new account.</p><p>Review other signed-in devices and remove saved copies only after deciding what you want to retain. Do not restore an old backup if you want those records to stay deleted.</p></div> : <>
      <article className="code3-privacy-card"><h3>Before you begin</h3><ul>
        <li>Download and verify any device and cloud backups you want to keep in Settings → Cloud saving &amp; recovery.</li>
        <li>Account deletion is permanent. It is different from signing out or uninstalling the app.</li>
        <li>The service checks ownership before deletion. Shared workspace owners and the protected service owner must transfer ownership first.</li>
        <li>Downloaded backups, records stored only on devices, and copies held by other people are not erased by deleting your cloud account.</li>
      </ul></article>
      {!accountId ? <div className="code3-privacy-status"><h3>Sign in to verify your account</h3><p>You can read this page without an account. Sign in below or return to the sign-in page, then reopen Delete account. Deletion requires verified access to your account.</p><p>If you signed up with Google, Apple, Discord or Facebook, sign in with it in the app, then open Delete account again. If you cannot sign in, use password reset or contact <a href={`mailto:${PRIVACY_PUBLISHER.supportEmail}`}>{PRIVACY_PUBLISHER.supportEmail}</a> for verified account deletion help. Never email your password.</p></div> : <>
        {!review && <button type="button" className="code3-primary" disabled={busy} onClick={() => void loadReview()}>{busy ? "Checking account…" : "Review account deletion"}</button>}
        {review && <>
          <article className="code3-privacy-card"><h3>Account to delete</h3><p>{review.accountEmail}</p>
            <h3>Cloud data included</h3><ul>{review.deletionScope.map((item) => <li key={item}>{item}</li>)}</ul>
            <h3>Data that may remain</h3><ul>{review.retainedScope.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
          {review.state === "pending" && <div className="code3-privacy-status code3-privacy-error" role="alert">Deletion started earlier but has not finished. Some cloud files may already be removed. Confirm again to finish the deletion.</div>}
          {review.blockers.length > 0 && <div className="code3-privacy-status" role="status"><h3>Resolve before deleting</h3><ul>{review.blockers.map((item) => <li key={item.code}>{item.message}</li>)}</ul></div>}
          {!review.available && review.blockers.length === 0 && <p role="status">The deletion service is unavailable. Try again later or contact support.</p>}
          {review.available && review.blockers.length === 0 && <form onSubmit={(event) => void submit(event)}>
            <label className="code3-privacy-checkbox"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={(event) => setAcknowledged(event.target.checked)} /><span>I reviewed what will be deleted and retained. I saved any backups I need and understand this cannot be undone.</span></label>
            {social ? <div className="code3-privacy-social-confirm" role="group" aria-label="Confirm it's you">
              {!provider ? <p role="status">This account has no password and no sign-in option this page can use. Contact support to delete it.</p>
                : socialFresh ? <p role="status">Confirmed with {provider.name}. Delete within 5 minutes, or confirm again.</p>
                : <p>Your account uses {provider.name} to sign in, so there is no password. Confirm with {provider.name}; you’ll come back here to finish.</p>}
              {provider && <button type="button" onClick={() => void confirmWithProvider()} disabled={busy}>{socialFresh ? `Confirm with ${provider.name} again` : `Confirm with ${provider.name}`}</button>}
            </div>
              : <label>Confirm your account password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} maxLength={1024} required /></label>}
            <label>Type {ACCOUNT_DELETION_CONFIRMATION}<input type="text" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} autoComplete="off" autoCapitalize="characters" spellCheck={false} required /></label>
            <div className="code3-privacy-actions"><button type="submit" className="code3-danger" disabled={busy || !acknowledged || confirmation !== ACCOUNT_DELETION_CONFIRMATION || !credentialReady}>{busy ? "Deleting account…" : "Permanently delete my account"}</button><button type="button" disabled={busy} onClick={() => { setReview(null); setPassword(""); setConfirmation(""); setAcknowledged(false); setError(""); setErrorCode(""); }}>Cancel</button></div>
          </form>}
          {(!review.available || review.blockers.length > 0) && <button type="button" disabled={busy} onClick={() => void loadReview()}>Check again</button>}
        </>}
      </>}
    </>}
    {error && <div className="code3-privacy-status code3-privacy-error" role="alert">{error}</div>}
    {!finished && help && !busy && <article className="code3-privacy-card">
      <h3>{help.title}</h3><p>{help.explanation}</p><ol>{help.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      <PrivacySupportContact key={help.topic} topic={help.topic} />
    </article>}
    <div className="code3-privacy-actions">
      <button type="button" disabled={busy} onClick={() => onNavigate?.(accountId ? "settings" : "dashboard")}>{accountId ? "Back to settings" : "Sign in / home"}</button>
      <a href="/privacy" onClick={onNavigate && !busy ? (event) => { event.preventDefault(); onNavigate("trust"); } : busy ? (event) => event.preventDefault() : undefined}>Privacy policy</a>
      <a href={`mailto:${PRIVACY_PUBLISHER.supportEmail}`}>Contact support</a>
    </div>
  </section>;
}
