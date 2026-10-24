import { useEffect, useRef, useState } from "react";
import PrivacyCenter, { PublicSupportPage } from "./PrivacyCenter.jsx";
import AccountDeletionPage from "./AccountDeletionPage.jsx";
import { pathFromActiveTab } from "../../utils/appRouteState.js";
import { getNativeAuthRedirect, isNativePlatform } from "../../native/nativeRuntime.js";

function themeChoice() {
  const inspection = new URLSearchParams(globalThis.location?.search || "").get("themeInspect");
  if (["light", "dark"].includes(inspection)) return inspection;
  try { return localStorage.getItem("et-tcg-app-theme") === "dark" ? "dark" : "light"; } catch { return "light"; }
}

function DeletionSignIn({ client }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const password = useRef(null);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; const field = password.current; return () => { alive.current = false; if (field) field.value = ""; }; }, []);
  async function run(event, reset = false) {
    event?.preventDefault();
    if (pending.current || !email.trim() || (!reset && !password.current?.value)) return;
    pending.current = true; setBusy(true); setMessage("");
    const credentials = { email: email.trim(), password: password.current?.value || "" };
    if (password.current) password.current.value = "";
    try {
      const result = reset
        ? await client.auth.resetPasswordForEmail(credentials.email, { redirectTo: isNativePlatform() ? getNativeAuthRedirect("recovery") : `${location.origin}/reset-password` })
        : await client.auth.signInWithPassword(credentials);
      if (!alive.current) return;
      if (result.error) setMessage(reset ? "The reset request could not be sent. Check your connection or contact support." : "Sign-in did not finish. Check your email, password, and connection.");
      else setMessage(reset ? "If the account can receive a reset email, check your inbox and spam folder." : "Signed in. You can now review account deletion.");
    } catch { if (alive.current) setMessage("The account service could not be reached. Try again or contact support."); }
    finally { credentials.password = ""; pending.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="code3-privacy" aria-label="Account deletion sign-in"><div className="code3-privacy-card"><h3>Sign in to delete your account</h3>
    <p>This sign-in opens account deletion only. It does not open or sync your saved workspace records.</p>
    <form onSubmit={(event) => void run(event)}>
      <label>Account email<input type="email" autoComplete="username" inputMode="email" autoCapitalize="none" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} /></label>
      <label>Account password<input ref={password} type="password" autoComplete="current-password" required disabled={busy} /></label>
      <div className="code3-privacy-actions"><button type="submit" disabled={busy}>{busy ? "Checking account…" : "Sign in"}</button><button type="button" disabled={busy || !email.trim()} onClick={() => void run(null, true)}>Send password reset email</button></div>
      {message && <p role="status">{message}</p>}
    </form>
  </div></section>;
}

// These public pages intentionally mount no App or cloud record writers. A
// pending deletion or broken device recovery must not hide deletion/help.
export default function PublicPrivacyRoute({ route, client }) {
  const [user, setUser] = useState(null);
  const [completedAccountId, setCompletedAccountId] = useState("");
  const [authError, setAuthError] = useState("");
  const [theme] = useState(themeChoice);
  const [accountGeneration, setAccountGeneration] = useState(0);
  const accountIdentity = useRef({ accountId: "", generation: 0 });
  const completed = Boolean(completedAccountId && (!user?.id || user.id === completedAccountId));
  useEffect(() => {
    if (route !== "delete" || !client) return undefined;
    let active = true; let received = false;
    const receiveUser = (nextUser) => {
      const accountId = nextUser?.id || "";
      if (accountIdentity.current.accountId !== accountId) {
        accountIdentity.current = { accountId, generation: accountIdentity.current.generation + 1 };
        setAccountGeneration(accountIdentity.current.generation);
      }
      setUser(nextUser);
      if (nextUser?.id) setCompletedAccountId((previous) => previous === nextUser.id ? previous : "");
    };
    const { data } = client.auth.onAuthStateChange((_event, session) => { received = true; if (active) receiveUser(session?.user || null); });
    client.auth.getSession().then(({ data: sessionData, error }) => { if (active && !received) { if (error) setAuthError("Sign in below to verify the account you want to delete."); else receiveUser(sessionData?.session?.user || null); } }).catch(() => { if (active) setAuthError("The account service could not be reached. You can contact support for help."); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [client, route]);
  const navigate = (tab) => window.location.assign(({ trust: "/privacy", help: "/support", deleteAccount: "/delete-account" })[tab] || pathFromActiveTab(tab));
  return <main className="app code3-public-privacy" data-theme={theme}>
    {route === "privacy" ? <PrivacyCenter onNavigate={navigate} /> : route === "help" ? <PublicSupportPage onNavigate={navigate} /> : <>
      <AccountDeletionPage key={`${user?.id || "signed-out"}:${accountGeneration}`} user={user} completed={completed} onNavigate={navigate} onDeleted={async () => {
        const deletedAccountId = user?.id;
        // Auth callbacks run before React can unmount the previous account's
        // form. Never let that form complete or sign out a newer auth epoch.
        if (!deletedAccountId || accountIdentity.current.accountId !== deletedAccountId || accountIdentity.current.generation !== accountGeneration) return;
        setCompletedAccountId(deletedAccountId || "");
        const result = await client.auth.signOut({ scope: "local" });
        if (accountIdentity.current.accountId === deletedAccountId && accountIdentity.current.generation === accountGeneration) {
          accountIdentity.current = { accountId: "", generation: accountGeneration + 1 };
          setAccountGeneration(accountIdentity.current.generation);
          setUser(null);
        }
        if (result.error) throw result.error;
      }} />
      {authError && <p className="code3-privacy" role="status">{authError}</p>}
      {!user && !completed && client && <DeletionSignIn client={client} />}
      {!client && <p className="code3-privacy" role="status">Account sign-in is unavailable here right now. You can still read the privacy policy and contact support using the links above.</p>}
    </>}
  </main>;
}
