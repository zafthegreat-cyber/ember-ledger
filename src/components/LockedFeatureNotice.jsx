import {
  FEATURE_DESCRIPTIONS,
  FEATURE_LABELS,
  FEATURE_MIN_TIER_LABELS,
} from "../services/featureGates";

export default function LockedFeatureNotice({
  featureKey,
  onClose,
  onRequestAccess,
  compact = false,
}) {
  const featureName = FEATURE_LABELS[featureKey] || "Locked feature";
  const tierName = FEATURE_MIN_TIER_LABELS[featureKey] || "paid";
  const description = FEATURE_DESCRIPTIONS[featureKey] || "This feature is part of a paid tier.";

  return (
    <section className={compact ? "locked-feature-card" : "panel upgrade-panel locked-feature-notice"}>
      <p>{tierName}</p>
      <h2>{featureName}</h2>
      <p>{description}</p>
      <p className="compact-subtitle">Billing coming soon. No payment processing is connected in this beta build.</p>
      <div className="quick-actions">
        <button type="button" className="secondary-button" onClick={onRequestAccess}>
          Request beta access
        </button>
        {onClose ? (
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
    </section>
  );
}
