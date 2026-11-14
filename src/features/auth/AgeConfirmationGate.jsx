// One-time age confirmation (audit 2026-11-14).
//
// Email sign-up asks "I am 13 or older" in its required consent box. Google,
// Apple, Discord and Facebook sign-in skip that form, so any signed-in account
// without user_metadata.age_confirmed_at sees this card once. Confirming saves
// the timestamp to the account; "I'm under 13" signs out with a pointer to the
// parent-managed path. Nothing else in the app is shown until it is answered.
import { useState } from "react";
import "./age-confirmation.css";

export const AGE_CONFIRMATION_TEXT = "I am 13 or older and I agree to the Terms of Use and Privacy Policy.";

/** True when a signed-in account still needs to confirm its age. */
// eslint-disable-next-line react-refresh/only-export-components
export function needsAgeConfirmation(user) {
  if (!user?.id || user.id === "local-beta" || user.is_anonymous) return false;
  return !user.user_metadata?.age_confirmed_at;
}

export default function AgeConfirmationGate({ user, supabase, onConfirmed, onSignOut }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [under13, setUnder13] = useState(false);
  if (!needsAgeConfirmation(user)) return null;

  async function confirm() {
    if (!checked || busy || !supabase) return;
    setBusy(true);
    setError("");
    const now = new Date().toISOString();
    const { data, error: updateError } = await supabase.auth.updateUser({ data: { age_confirmed_at: now, age_confirmation_text: AGE_CONFIRMATION_TEXT } });
    setBusy(false);
    if (updateError) { setError("That didn't save. Check your connection and try again."); return; }
    onConfirmed?.(data?.user || null);
  }

  return (
    <div className="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-gate-title">
      <section className="age-gate__card">
        {under13 ? (
          <>
            <h2 id="age-gate-title">Ask a parent to set you up</h2>
            <p>Code 3 TCG accounts are for people 13 and older. A parent or guardian can add you as a kid profile from their own account, so you can still collect with them.</p>
            <div className="age-gate__actions">
              <button type="button" className="age-gate__primary" onClick={onSignOut}>Sign out</button>
              <button type="button" className="age-gate__secondary" onClick={() => setUnder13(false)}>Back</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="age-gate-title">One quick check</h2>
            <p>Before you start, please confirm your age. You only need to do this once.</p>
            <label className="age-gate__check">
              <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
              <span>{AGE_CONFIRMATION_TEXT}</span>
            </label>
            {error ? <p className="age-gate__error" role="alert">{error}</p> : null}
            <div className="age-gate__actions">
              <button type="button" className="age-gate__primary" disabled={!checked || busy} onClick={confirm}>{busy ? "Saving…" : "Continue"}</button>
              <button type="button" className="age-gate__secondary" onClick={() => setUnder13(true)}>I&apos;m under 13</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
