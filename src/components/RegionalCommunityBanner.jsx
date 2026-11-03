import { PrimaryButton } from "./operations/OperationsUI.jsx";
import ExternalWebLink from "./ExternalWebLink.jsx";
import "./regional-community-banner.css";

export default function RegionalCommunityBanner({ primaryLabel, onPrimary }) {
  return (
    <section className="regional-community-banner" aria-label="Help build your local restock community">
      <div className="regional-community-banner__copy">
        <span className="regional-community-banner__eyebrow">VA · NC · MD · DC</span>
        <h2>Help build your local restock community.</h2>
        <p>Collecting in Virginia, North Carolina, Maryland, or Washington, DC? Share a useful shelf observation—what, where, and when—or suggest a missing store for review. The store directory covers all four. Reports are community observations, and stock can change.</p>
      </div>
      <div className="regional-community-banner__actions">
        {typeof onPrimary === "function" ? <PrimaryButton onClick={onPrimary}>{primaryLabel}</PrimaryButton> : null}
        <ExternalWebLink className="ops-button ops-button--secondary" href="https://discord.gg/WdSz3vFZCY">Join Discord</ExternalWebLink>
      </div>
    </section>
  );
}
