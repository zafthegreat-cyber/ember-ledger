import { useEffect, useRef, useState } from "react";
import { accountLinkingEnabled, availableSocialProviders, socialAuth } from "./socialAuthClient.js";
import "./social-sign-in.css";

function useSocialProviders(load = availableSocialProviders) {
  const [providers, setProviders] = useState([]);
  const [state, setState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(result => { if (!controller.signal.aborted) { setProviders(result); setState(result.length ? 'ready' : 'unavailable'); } }).catch(() => { if (!controller.signal.aborted) { setProviders([]); setState('error'); } });
    return () => controller.abort();
  }, [load, attempt]);
  return { providers, state, retry: () => { setState('loading'); setAttempt(value => value + 1); } };
}

function ProviderIcon({ id }) {
  return <svg className="social-provider-icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">
    {id === 'google' ? <path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36ZM12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.58-4.12H3.08v2.59A10 10 0 0 0 12 22ZM6.42 13.92a6 6 0 0 1 0-3.84V7.49H3.08a10 10 0 0 0 0 9.02l3.34-2.59ZM12 5.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.92 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z" /> : id === 'apple' ? <path fill="currentColor" d="M17.1 12.4c0-2 1.6-3 1.7-3.1-1-1.4-2.6-1.6-3.1-1.6-1.3-.1-2.6.8-3.2.8-.7 0-1.7-.8-2.8-.7-1.5 0-2.9.9-3.7 2.2-1.6 2.7-.4 6.7 1.1 8.8.7 1 1.5 2.2 2.7 2.1 1.1 0 1.5-.7 2.9-.7s1.8.7 3 .7 2-1 2.7-2.1c.8-1.2 1.2-2.3 1.2-2.4-.1 0-2.5-1-2.5-4ZM15 6.3c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.2 1.8-1 2.8 1 .1 2-.5 2.7-1.2Z" /> : id === 'facebook' ? <path fill="#1877f2" d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.3.2 2.3.2v2.5h-1.3c-1.3 0-1.7.8-1.7 1.6V12h2.8l-.5 2.9h-2.3v7A10 10 0 0 0 22 12Z" /> : id === 'discord' ? <><path fill="#5865f2" d="m19.7 5.3-4-1.3-.5 1a15 15 0 0 0-6.4 0l-.5-1-4 1.3C1.8 9 1 12.6 1.4 16.2l4.9 2.5 1-1.6-1.5-.7.4-.3a14 14 0 0 0 11.6 0l.4.3-1.5.7 1 1.6 4.9-2.5c.5-4.2-.7-7.8-2.9-10.9Z" /><circle cx="8" cy="12" r="1.6" fill="white"/><circle cx="16" cy="12" r="1.6" fill="white"/></> : <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" />}
  </svg>;
}

function ProviderAvailability({ state, retry }) {
  return <div className="social-sign-in-availability"><p role={state === 'error' ? 'alert' : 'status'}>{state === 'loading' ? 'Checking available sign-in methods…' : state === 'error' ? 'Other sign-in methods could not load. You can still use email and password.' : 'Other sign-in methods are not available here. Use email and password.'}</p>{state === 'error' ? <button type="button" className="secondary-button" onClick={retry}>Retry sign-in methods</button> : null}</div>;
}

/** Kept separate so previews exercise the actual controls with explicit fixtures. */
export function SocialButtons({ providers, busy, onChoose, connecting = false }) {
  return <div className="social-sign-in-grid" aria-label={connecting ? "Connect a sign-in method" : "Other sign-in methods"}>
    {providers.map(provider => <button key={provider.id} type="button" className={`social-sign-in-button social-sign-in-button--${provider.id}`} disabled={Boolean(busy)} onClick={() => onChoose(provider.id)}>
      <ProviderIcon id={provider.id} /><span>{busy === provider.id ? "Opening secure sign-in…" : `${connecting ? "Connect" : "Continue with"} ${provider.name}`}</span>
    </button>)}
  </div>;
}

export default function SocialSignInButtons({ loadProviders = availableSocialProviders, service = socialAuth }) {
  const { providers, state, retry } = useSocialProviders(loadProviders);
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
  if (!providers.length) return <ProviderAvailability state={state} retry={retry} />;
  return <section className="social-sign-in" aria-label="Sign in with another account" aria-busy={Boolean(busy)}>
    <SocialButtons providers={providers} busy={busy} onChoose={choose} />
    {error && <p className="auth-status-message error" role="alert">{error}</p>}
    <p className="social-sign-in-note">New here? Continuing creates an account if needed. You agree to our <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</p>
    <details className="social-sign-in-note"><summary>Already have a collection?</summary><ol><li>Sign in the way you already use.</li><li>Open Settings → Account → Ways to sign in.</li><li>Connect another method there. Your existing account keeps its collection.</li></ol></details>
    <div className="social-sign-in-divider"><span>or use email</span></div>
  </section>;
}

export function ConnectedSignIns({ user, loadProviders = availableSocialProviders, service = socialAuth, linkingEnabled = accountLinkingEnabled }) {
  const { providers, state, retry } = useSocialProviders(loadProviders);
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
  if (!user?.id || !linkingEnabled) return null;
  if (!providers.length) return <ProviderAvailability state={state} retry={retry} />;
  const choices = providers.filter(provider => !identities.includes(provider.id));
  return <section className="social-sign-in connected-sign-ins" aria-label="Connected sign-in methods" aria-busy={Boolean(busy)}>
    <h3>Ways to sign in</h3>
    <p>Keep your collection with this account{user.email ? `: ${user.email}` : ''}.</p><ol><li>Choose an available method below.</li><li>Verify it with the provider.</li><li>Return here to confirm it is connected. Both sign-in methods then open this same collection.</li></ol>
    {providers.filter(provider => identities.includes(provider.id)).map(provider => <p className="social-sign-in-connected" key={provider.id}>{provider.name} · Connected</p>)}
    {verifiedId !== user.id && !error && <p role="status">Checking your sign-in methods…</p>}
    {choices.length > 0 && <SocialButtons providers={choices} busy={busy || verifiedId !== user.id && "checking"} onChoose={connect} connecting />}
    {error && <p role="alert" className="auth-status-message error">{error}</p>}
    <p className="social-sign-in-note">If you use Apple’s Hide My Email, connect Apple here before using it to sign in. Private records are never merged by an email typed into the app.</p>
    <p className="social-sign-in-note">Some account security actions require a Code 3 TCG password. Use the password email option in Account Security to set or reset yours.</p>
  </section>;
}
