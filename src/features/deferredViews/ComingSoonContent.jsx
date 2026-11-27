// Rendering is deferred; the owning App retains record state and action handlers.
export default function ComingSoonContent({ scope, args = [] }) {
  const {
    COMING_SOON_GROUPS,
    openFeedbackDialog,
    renderUtilityPageShell,
    showToast,
  } = scope;

  function renderComingSoonPage() {
    const totalPlannedFeatures = COMING_SOON_GROUPS
      .filter((group) => group.tone !== "guardrail")
      .reduce((sum, group) => sum + group.features.length, 0);
    const delayedCount = COMING_SOON_GROUPS.find((group) => group.key === "delayed")?.features.length || 0;
    const notPlannedCount = COMING_SOON_GROUPS.find((group) => group.key === "not-planned")?.features.length || 0;
    const noteInterest = (feature, group) => {
      showToast({
        type: "info",
        title: "Interest noted locally",
        message: `${feature.name} is ${String(feature.status || group.defaultStatus || "planned").toLowerCase()} and is not available yet. No notification, checkout, or waitlist was created.`,
      });
    };

    return renderUtilityPageShell({
      title: "Coming Soon",
      subtitle: "Code 3 TCG is growing carefully. These features are planned for future phases, but we are perfecting the core app first.",
      className: "coming-soon-page",
      actions: (
        <button
          type="button"
          className="secondary-button"
          onClick={() => openFeedbackDialog("feature", { whatHappened: "Coming Soon roadmap feedback: " })}
        >
          Share roadmap feedback
        </button>
      ),
      children: (
        <>
          <section className="panel coming-soon-hero" aria-label="Coming Soon focus">
            <div>
              <p className="section-kicker">Roadmap visibility</p>
              <h2>Core app first. Future systems later.</h2>
              <p>
                Coming Soon is a planning view only. Nothing on this page turns on Kid Mode, Spark Points, friends, marketplace selling,
                partner shops, Vault Play, payments, notifications, or backend workflows.
              </p>
            </div>
            <dl className="coming-soon-summary">
              <div><dt>Planned ideas</dt><dd>{totalPlannedFeatures}</dd></div>
              <div><dt>Delayed</dt><dd>{delayedCount}</dd></div>
              <div><dt>Not planned</dt><dd>{notPlannedCount}</dd></div>
            </dl>
          </section>

          <div className="coming-soon-group-stack">
            {COMING_SOON_GROUPS.map((group) => (
              <section className={`coming-soon-group coming-soon-group--${group.tone}`} key={group.key}>
                <div className="compact-card-header coming-soon-group-header">
                  <div>
                    <p className="section-kicker">{group.tone === "guardrail" ? "Safety guardrail" : group.tone === "delayed" ? "Delayed scope" : "Future phase"}</p>
                    <h2>{group.title}</h2>
                    <p>{group.description}</p>
                  </div>
                  <span className={`status-badge coming-soon-group-status coming-soon-status--${group.tone}`}>
                    {group.defaultStatus}
                  </span>
                </div>
                <div className="coming-soon-card-grid">
                  {group.features.map((feature) => {
                    const status = feature.status || group.defaultStatus;
                    const disabled = group.tone === "guardrail";
                    return (
                      <article className={`coming-soon-card coming-soon-card--${group.tone}`} key={`${group.key}-${feature.name}`}>
                        <div className="coming-soon-card-meta">
                          <span className={`status-badge coming-soon-status--${group.tone}`}>{status}</span>
                          {feature.userType ? <small>{feature.userType}</small> : null}
                        </div>
                        <h3>{feature.name}</h3>
                        <p>{feature.description}</p>
                        <small className="coming-soon-unavailable">
                          {disabled ? "Not planned." : group.tone === "delayed" ? "Delayed - not upcoming soon." : "Interest can be shared, but this is not live yet."}
                        </small>
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={disabled}
                          onClick={() => noteInterest(feature, group)}
                        >
                          {disabled ? "Not planned" : group.tone === "delayed" ? "Track interest" : "I'm interested"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      ),
    });
  }

  return renderComingSoonPage(...args);
}
