import {
  getLockedFeatureDetails,
} from "../services/featureGates";

export default function LockedFeatureNotice({
  featureKey,
  onClose,
  onRequestAccess,
  compact = false,
}) {
  const lock = getLockedFeatureDetails(featureKey);

  return (
    <section className={compact ? "locked-feature-card" : "panel upgrade-panel locked-feature-notice"} data-lock-tier={lock.requiredTier}>
      <p className="locked-feature-eyebrow">{lock.statusLabel}</p>
      <h2>{lock.title}</h2>
      <strong>{lock.label}</strong>
      <p>{lock.description}</p>
      <div className="locked-feature-detail-grid">
        <span><b>Benefit</b>{lock.benefit}</span>
        <span><b>Next step</b>{lock.action}</span>
      </div>
      <p className="locked-feature-guardrail">{lock.guardrail}</p>
      <p className="compact-subtitle">Beta launch pricing is a preview. No payment processing or live checkout is connected in this beta build.</p>
      <div className="quick-actions locked-feature-actions">
        <button type="button" className="secondary-button" onClick={onRequestAccess}>
          {lock.cta}
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
