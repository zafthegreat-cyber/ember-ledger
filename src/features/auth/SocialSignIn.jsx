import { useEffect, useRef, useState } from "react";
import { accountLinkingEnabled, availableSocialProviders, socialAuth } from "./socialAuthClient.js";
import "./social-sign-in.css";

function useSocialProviders(load = availableSocialProviders) {
  const [providers, setProviders] = useState([]);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(result => { if (!controller.signal.aborted) setProviders(result); }).catch(() => {});
    return () => controller.abort();
  }, [load]);
  return providers;
}

/** Kept separate so previews exercise the actual controls with explicit fixtures. */
export function SocialButtons({ providers, busy, onChoose, connecting = false }) {
  return <div className="social-sign-in-grid" aria-label={connecting ? "Connect a sign-in method" : "Other sign-in methods"}>
    {providers.map(provider => <button key={provider.id} type="button" className={`social-sign-in-button social-sign-in-button--${provider.id}`} disabled={Boolean(busy)} onClick={() => onChoose(provider.id)}>
      {busy === provider.id ? "Opening secure sign-in…" : `${connecting ? "Connect" : "Continue with"} ${provider.name}`}
    </button>)}
  </div>;
}

export default function SocialSignInButtons({ loadProviders = availableSocialProviders, service = socialAuth }) {
  const providers = useSocialProviders(loadProviders);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const request = useRef(false);
  async function choose(provider) {
    if (request.current) return;
    request.current = true; setBusy(provider); setError("");
    try { await service.start(provider); }
    catch { setError("Sign-in could not start. Try again, or use email and password."); }
    finally { request.current = false; setBusy(""); }
  }
  if (!providers.length) return null;
  return <section className="social-sign-in" aria-label="Sign in with another account" aria-busy={Boolean(busy)}>
    <SocialButtons providers={providers} busy={busy} onChoose={choose} />
    {error && <p className="auth-status-message error" role="alert">{error}</p>}
    <p className="social-sign-in-note">New here? Continuing creates an account if needed. You agree to our <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</p>
    <p className="social-sign-in-note">Already have a collection? Use your existing sign-in first, then open Account → Ways to sign in to connect another method. This keeps your saved records with the same account.</p>
    <div className="social-sign-in-divider"><span>or use email</span></div>
  </section>;
}

export function ConnectedSignIns({ user, loadProviders = availableSocialProviders, service = socialAuth, linkingEnabled = accountLinkingEnabled }) {
  const providers = useSocialProviders(loadProviders);
  const [identities, setIdentities] = useState([]);
  const [verifiedId, setVerifiedId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const request = useRef(false);
  useEffect(() => {
    if (!user?.id || !providers.length || !linkingEnabled) return;
    let active = true;
    service.verifiedUser(user.id).then(current => {
      if (active) { setIdentities((current.identities || []).map(identity => identity.provider)); setVerifiedId(current.id); }
    }).catch(() => { if (active) setError("Sign in again before connecting another method."); });
    return () => { active = false; };
  }, [user?.id, providers, service, linkingEnabled]);
  async function connect(provider) {
    if (request.current) return;
    request.current = true; setBusy(provider); setError("");
    try { await service.start(provider, { mode: "link", userId: user.id }); }
    catch { setError("The sign-in method could not be connected. Your existing account and saved records are unchanged."); }
    finally { request.current = false; setBusy(""); }
  }
  if (!user?.id || !providers.length || !linkingEnabled) return null;
  const choices = providers.filter(provider => !identities.includes(provider.id));
  return <section className="social-sign-in connected-sign-ins" aria-label="Connected sign-in methods" aria-busy={Boolean(busy)}>
    <h3>Ways to sign in</h3>
    <p>Connect another method to this account. You will verify it with the provider. Your collection stays with your current account.</p>
    {providers.filter(provider => identities.includes(provider.id)).map(provider => <p className="social-sign-in-connected" key={provider.id}>{provider.name} · Connected</p>)}
    {verifiedId !== user.id && !error && <p role="status">Checking your sign-in methods…</p>}
    {choices.length > 0 && <SocialButtons providers={choices} busy={busy || verifiedId !== user.id && "checking"} onChoose={connect} connecting />}
    {error && <p role="alert" className="auth-status-message error">{error}</p>}
    <p className="social-sign-in-note">If you use Apple’s Hide My Email, connect Apple here before using it to sign in. Private records are never merged by an email typed into the app.</p>
    <p className="social-sign-in-note">Some account security actions require a Code 3 TCG password. Use the password email option in Account Security to set or reset yours.</p>
  </section>;
}
