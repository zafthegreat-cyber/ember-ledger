import { PrimaryButton } from "./operations/OperationsUI.jsx";
import ExternalWebLink from "./ExternalWebLink.jsx";
import "./regional-community-banner.css";

export default function RegionalCommunityBanner({ primaryLabel, onPrimary }) {
  return (
    <section className="regional-community-banner" aria-label="Help build your local restock community">
      <div className="regional-community-banner__copy">
        <span className="regional-community-banner__eyebrow">VA · NC · MD · DC</span>
        <h2>Share restocks. Help your local collecting community.</h2>
        <p>Browse stores across Virginia, North Carolina, Maryland, and Washington, DC. Share what you observed, where, and when—or suggest a missing store for review. Join Facebook or Discord to share feedback. Reports are community observations, and stock can change.</p>
      </div>
      <div className="regional-community-banner__actions">
        {typeof onPrimary === "function" ? <PrimaryButton onClick={onPrimary}>{primaryLabel}</PrimaryButton> : null}
        <ExternalWebLink className="ops-button ops-button--secondary" href="https://www.facebook.com/groups/3844975102337752/">Facebook feedback</ExternalWebLink>
        <ExternalWebLink className="ops-button ops-button--secondary" href="https://discord.gg/WdSz3vFZCY">Discord feedback</ExternalWebLink>
      </div>
    </section>
  );
}
