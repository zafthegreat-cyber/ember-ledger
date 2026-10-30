import { useEffect, useState } from "react";
import { isNativePlatform } from "../../native/nativeRuntime.js";
import { parseSocialCallback } from "./socialAuth.mjs";
import { socialAuth } from "./socialAuthClient.js";
import "./social-sign-in.css";

/** Callback verification completes before account/record writers are mounted. */
export default function SocialAuthBoundary({ children, service = socialAuth }) {
  const [callback] = useState(() => !isNativePlatform() && location.pathname === "/auth/callback" ? location.href : "");
  const [status, setStatus] = useState(callback ? "checking" : "ready");
  useEffect(() => {
    if (!callback) return;
    let active = true;
    Promise.resolve().then(() => service.finish(parseSocialCallback(callback, location.origin))).then(result => {
      if (!active) return;
      history.replaceState({}, "", result.path);
      window.dispatchEvent(new PopStateEvent("popstate"));
      setStatus("ready");
    }).catch(() => {
      if (!active) return;
      history.replaceState({}, "", "/auth/callback");
      setStatus("error");
    });
    return () => { active = false; };
  }, [callback, service]);
  if (status === "ready") return children;
  return <main className="social-callback-screen"><section className="social-callback-card" aria-labelledby="social-callback-title">
    <p>Code 3 TCG</p>
    <h1 id="social-callback-title">{status === "checking" ? "Checking your sign-in" : "Sign-in wasn’t completed"}</h1>
    {status === "checking" ? <p role="status">Verifying your account before opening your collection…</p> : <>
      <p role="alert">The sign-in was cancelled, expired, or could not be verified. Your saved records have not been moved. Return to sign-in and try again.</p>
      <a href="/">Return to sign-in</a>
    </>}
  </section></main>;
}
