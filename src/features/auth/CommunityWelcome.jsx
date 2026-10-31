import { PRIVACY_PUBLISHER } from "../../config/privacyPolicy.js";
import "./community-welcome.css";

export const COMMUNITY_LINKS = Object.freeze({
  discord: "https://discord.gg/WdSz3vFZCY",
  facebook: "https://www.facebook.com/groups/3844975102337752/",
});

export default function CommunityWelcome({ onFeedback, compact = false }) {
  return <section className={`community-welcome${compact ? " community-welcome--compact" : ""}`} aria-label="Help develop Code 3 TCG">
    <h3>Help shape Code 3 TCG</h3>
    <p>Feedback and community groups are optional. Your app account works without joining a social network.</p>
    <div className="community-welcome-actions">
      {onFeedback ? <button type="button" className="secondary-button" onClick={onFeedback}>Share feedback</button>
        : <a href={`mailto:${PRIVACY_PUBLISHER.supportEmail}?subject=Code%203%20TCG%20feedback`}>Email feedback</a>}
      <a href={COMMUNITY_LINKS.discord} target="_blank" rel="noopener noreferrer">Discord · discussion &amp; opt-in alerts<span className="community-link-context"> (opens a new tab)</span></a>
      <a href={COMMUNITY_LINKS.facebook} target="_blank" rel="noopener noreferrer">Facebook · collecting &amp; development feedback<span className="community-link-context"> (opens a new tab)</span></a>
    </div>
    <details><summary>Community accounts and notifications</summary><p>Discord is for community discussion, restock submissions, and optional game and area/Online alert roles. Facebook is for group discussion and development feedback. Each network has its own account and privacy settings.</p><p>Joining a group or signing in with Discord does not subscribe you to alerts. In Discord, use #choose-roles to choose your game and area/Online interests separately. App and device notification settings are separate from Discord role pings.</p></details>
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
