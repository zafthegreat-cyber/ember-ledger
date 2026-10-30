import { PRIVACY_PUBLISHER } from "../../config/privacyPolicy.js";
import "./community-welcome.css";

export const COMMUNITY_LINKS = Object.freeze({
  discord: "https://discord.gg/WdSz3vFZCY",
  facebook: "https://www.facebook.com/groups/3844975102337752/",
});

export default function CommunityWelcome({ onFeedback, compact = false }) {
  return <section className={`community-welcome${compact ? " community-welcome--compact" : ""}`} aria-label="Help develop Code 3 TCG">
    <h3>Help shape Code 3 TCG</h3>
    <p>Join, explore, and tell us what would make collecting easier. Feedback and community groups are optional.</p>
    <div className="community-welcome-actions">
      {onFeedback ? <button type="button" className="secondary-button" onClick={onFeedback}>Share feedback</button>
        : <a href={`mailto:${PRIVACY_PUBLISHER.supportEmail}?subject=Code%203%20TCG%20feedback`}>Email feedback</a>}
      <a href={COMMUNITY_LINKS.discord} target="_blank" rel="noopener noreferrer">Join Discord<span className="community-link-context"> (opens a new tab)</span></a>
      <a href={COMMUNITY_LINKS.facebook} target="_blank" rel="noopener noreferrer">Facebook group<span className="community-link-context"> (opens a new tab)</span></a>
    </div>
  </section>;
}

export function MemberAccessNotice({ checking, restricted, onRetry, onSignOut }) {
  return <main className="social-callback-screen"><section className="social-callback-card" aria-labelledby="member-access-title">
    <h1 id="member-access-title">{checking ? "Opening your account" : restricted ? "Account access is restricted" : "We couldn’t open your account"}</h1>
    <p role="status">{checking ? "Checking your confirmed sign-in and saved profile…" : restricted
      ? "Contact support if you believe this account restriction is a mistake."
      : "Your account needs a confirmed sign-in and a saved profile. Confirm your email if needed, then retry. No beta access request is required."}</p>
    <div className="community-welcome-actions">
      <button type="button" className="secondary-button" disabled={checking} onClick={onRetry}>Retry account check</button>
      <button type="button" className="secondary-button" onClick={onSignOut}>Sign out</button>
      <a href={`mailto:${PRIVACY_PUBLISHER.supportEmail}`}>Contact support</a>
    </div>
  </section></main>;
}
