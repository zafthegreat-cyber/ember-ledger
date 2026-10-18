import { PRIVACY_POLICY_UPDATED, PRIVACY_PUBLISHER, PRIVACY_SECTIONS } from "../../config/privacyPolicy.js";
import "./privacy.css";

export default function PrivacyCenter({ onNavigate, publisher = PRIVACY_PUBLISHER }) {
  return <section className="code3-privacy" aria-labelledby="code3-privacy-title">
    <header>
      <p className="code3-privacy-eyebrow">Code 3 TCG · Your information</p>
      <h2 id="code3-privacy-title">Privacy policy</h2>
      <p>What the app saves, how sharing works, and how to manage your records.</p>
      <p className="code3-privacy-meta">Updated {PRIVACY_POLICY_UPDATED}</p>
    </header>
    <div className="code3-privacy-actions">
      <a href="/delete-account" onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("deleteAccount"); } : undefined}>Delete account</a>
      <a href="/settings" onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("settings"); } : undefined}>Backups &amp; settings</a>
      <a href="/support" onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("help"); } : undefined}>Get help</a>
    </div>
    <article className="code3-privacy-card">
      <h3>Who operates Code 3 TCG</h3>
      <p>{publisher.legalName || "The publisher's legal name has not been configured."}</p>
      {publisher.supportEmail ? <p>Privacy and support: <a href={`mailto:${publisher.supportEmail}`}>{publisher.supportEmail}</a>.</p> : <p>Privacy contact information is currently unavailable.</p>}
    </article>
    {PRIVACY_SECTIONS.map((section) => <article className="code3-privacy-card" key={section.key} id={`privacy-${section.key}`}>
      <h3>{section.title}</h3><p>{section.body}</p>
    </article>)}
  </section>;
}

export function PublicSupportPage({ onNavigate, publisher = PRIVACY_PUBLISHER }) {
  return <section className="code3-privacy" aria-labelledby="code3-support-title">
    <header><p className="code3-privacy-eyebrow">Code 3 TCG · Support</p><h2 id="code3-support-title">How can we help?</h2><p>Account access, saved records, and privacy help are available without entering the app.</p></header>
    <article className="code3-privacy-card"><h3>Contact support</h3>
      {publisher.supportEmail ? <><p>Email <a href={`mailto:${publisher.supportEmail}`}>{publisher.supportEmail}</a>. Include the screen, device type, and what happened. Keep passwords, app passwords, payment details, and private backups out of your message.</p><p>For account access or deletion help, use the email associated with your account. Ownership must be verified before private information is disclosed or removed.</p></> : <p>A verified support email has not been configured yet.</p>}
    </article>
    <article className="code3-privacy-card"><h3>Protect your saved records</h3><p>If cloud saving shows a conflict or error, keep the app's storage. In Settings → Cloud saving &amp; recovery, review both versions and export backups before clearing or reinstalling the app.</p></article>
    <article className="code3-privacy-card"><h3>Delete an account</h3><p>Open the account deletion page to see what is removed and retained. Sign in, review the live deletion scope, and confirm your password before deletion. If you cannot sign in, contact support for account access and verified deletion help.</p></article>
    <div className="code3-privacy-actions">
      <a href="/delete-account" onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("deleteAccount"); } : undefined}>Delete account</a>
      <a href="/privacy" onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("trust"); } : undefined}>Privacy policy</a>
      <a href="/" onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("dashboard"); } : undefined}>Sign in / home</a>
    </div>
  </section>;
}
