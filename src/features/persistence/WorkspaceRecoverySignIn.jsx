import { useEffect, useRef, useState } from "react";

/** Provider sign-in only. The boundary verifies the resulting session before recovery. */
export default function WorkspaceRecoverySignIn({ client }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const passwordInput = useRef(null);
  const request = useRef(null);

  useEffect(() => {
    const field = passwordInput.current;
    return () => {
      if (field) field.value = "";
      if (request.current) {
        request.current.active = false;
        clearTimeout(request.current.timer);
      }
    };
  }, []);

  async function signIn(event) {
    event.preventDefault();
    if (request.current || !passwordInput.current?.value) return;
    const credentials = { email: email.trim(), password: passwordInput.current.value };
    passwordInput.current.value = "";
    const pending = { active: true, timedOut: false, timer: null };
    request.current = pending;
    setStatus("pending");
    setMessage("Signing in securely. Your saved records stay protected.");
    pending.timer = setTimeout(() => {
      if (!pending.active) return;
      pending.timedOut = true;
      setStatus("timeout");
      setMessage("Sign-in is taking longer than expected. Reload to check your account and try again when your connection returns. Keep this app’s stored data.");
    }, 30000);
    try {
      const result = await client.auth.signInWithPassword(credentials);
      if (!pending.active) return;
      if (result.error || !result.data?.session?.user) {
        clearTimeout(pending.timer);
        request.current = null;
        setStatus("error");
        setMessage(result.error?.status === 429
          ? "Too many sign-in attempts. Wait a moment, then try again. Your saved records are unchanged."
          : "Sign-in could not be completed. Check your email, password, and connection, then try again. Your saved records are unchanged.");
        return;
      }
      // Supabase owns this request and cannot abort it. Do not start overlapping
      // sign-ins after a timeout or sign out a late result: the boundary verifies
      // every auth event and the saved owner before any record writers mount.
      if (!pending.timedOut) setStatus("verifying");
      setMessage("Signed in. Checking your account before recovering saved records…");
    } catch {
      if (!pending.active) return;
      clearTimeout(pending.timer);
      request.current = null;
      setStatus("error");
      setMessage("The account service could not be reached. Check your connection and try again. Your saved records are unchanged.");
    } finally {
      credentials.password = "";
    }
  }

  const busy = ["pending", "verifying", "timeout"].includes(status);
  return <>
    <p>An interrupted save needs recovery. Sign in to the account that saved these records so we can safely reopen them.</p>
    <p>Keep this app’s stored data. Your records stay protected while you sign in.</p>
    <form onSubmit={signIn} aria-label="Recovery sign-in">
      <label>Email<input type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} required /></label>
      <label>Password<input ref={passwordInput} type="password" autoComplete="current-password" disabled={busy} required /></label>
      {message && <p role={status === "error" || status === "timeout" ? "alert" : "status"}>{message}</p>}
      <button type="submit" disabled={busy}>{busy ? "Checking sign-in…" : "Sign in to recover"}</button>
      <button type="button" className="cloud-secondary" onClick={() => window.location.reload()}>Reload sign-in</button>
    </form>
  </>;
}
