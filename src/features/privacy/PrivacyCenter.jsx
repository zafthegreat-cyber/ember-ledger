import { PRIVACY_POLICY_UPDATED, PRIVACY_PUBLISHER, PRIVACY_SECTIONS } from "../../config/privacyPolicy.js";
import PrivacySupportContact from "./PrivacySupportContact.jsx";
import SourceCoverage from "../auth/SourceCoverage.jsx";
import "./privacy.css";

export default function PrivacyCenter({ onNavigate, publisher = PRIVACY_PUBLISHER }) {
  return <section className="code3-privacy" aria-labelledby="code3-privacy-title">
    <header>
      <p className="code3-privacy-eyebrow">Code 3 TCG · Your information</p>
      <h2 id="code3-privacy-title">Privacy policy</h2>
      <p>What the Code 3 TCG app and Code 3 TCG Community Discord companion access, save, and share, and how to manage your information.</p>
      <p className="code3-privacy-meta">Updated {PRIVACY_POLICY_UPDATED}</p>
    </header>
    <div className="code3-privacy-actions">
      <a href="#privacy-discord-data">Discord companion privacy</a>
      <a href="/terms">Terms of Service</a>
      <a href="/delete-account" onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("deleteAccount"); } : undefined}>Delete account</a>
      <a href="/settings" onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("settings"); } : undefined}>Backups &amp; settings</a>
      <a href="/support" onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("help"); } : undefined}>Get help</a>
    </div>
    <article className="code3-privacy-card">
      <h3>Who operates Code 3 TCG</h3>
      <p>{publisher.legalName || "Publisher information is currently unavailable."}</p>
      {publisher.supportEmail ? <p>Privacy and support: <a href={`mailto:${publisher.supportEmail}`}>{publisher.supportEmail}</a>.</p> : <p>Privacy contact information is currently unavailable.</p>}
    </article>
    {PRIVACY_SECTIONS.map((section) => <article className="code3-privacy-card" key={section.key} id={`privacy-${section.key}`}>
      <h3>{section.title}</h3><p>{section.body}</p>
    </article>)}
    <article className="code3-privacy-card">
      <h3>Discord's own privacy policy</h3>
      <p>For information held by Discord, review <a href="https://discord.com/privacy">Discord's Privacy Policy</a> and its account privacy controls. Our <a href="/support">support page</a> can help with information held by Code 3 TCG.</p>
    </article>
  </section>;
}

export function PublicSupportPage({ onNavigate, publisher = PRIVACY_PUBLISHER }) {
  const requestedTopic = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("topic") : "general";
  return <section className="code3-privacy" aria-labelledby="code3-support-title">
    <header><p className="code3-privacy-eyebrow">Code 3 TCG · Support</p><h2 id="code3-support-title">How can we help?</h2><p>Account access, saved records, and privacy help are available without entering the app.</p></header>
    <article className="code3-privacy-card"><PrivacySupportContact publisher={publisher} topic={requestedTopic || "general"} allowTopicChoice /></article>
    <article className="code3-privacy-card"><h3>Choose the right kind of help</h3><p>Choose feature help for instructions, account access for a private sign-in problem, bug for something that failed, or safety for harassment or unsafe content. Keep account and safety details out of public groups.</p><p>Include your goal, the screen, what happened, and what you expected. Support email is not monitored as an emergency service, and no response time is promised.</p></article>
    <SourceCoverage />
    <article className="code3-privacy-card"><h3>Protect your saved records</h3><p>If cloud saving shows a conflict or error, keep the app's storage. In Settings → Cloud saving &amp; recovery, review both versions and export backups before clearing or reinstalling the app.</p></article>
    <article className="code3-privacy-card"><h3>Delete an account</h3><p>Open the account deletion page to see what is removed and retained. When the service is available, sign in, review the live deletion scope, and confirm your password before deletion. If you cannot sign in or deletion is blocked, use the support message above. A support email is not confirmation that the account has been deleted.</p></article>
    <div className="code3-privacy-actions">
      <a href="/delete-account" onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("deleteAccount"); } : undefined}>Delete account</a>
      <a href="/privacy" onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("trust"); } : undefined}>Privacy policy</a>
      <a href="/" onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate("dashboard"); } : undefined}>Sign in / home</a>
    </div>
  </section>;
}
