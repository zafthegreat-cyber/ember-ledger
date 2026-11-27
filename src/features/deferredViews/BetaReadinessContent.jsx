// Rendering is deferred; the owning App retains record state and action handlers.
export default function BetaReadinessContent({ scope, args = [] }) {
  const {
    AUTH_COPY_REVIEW,
    BETA_ACCESS_MODES,
    BETA_LAUNCH_STATES,
    BETA_MODE_COPY,
    BETA_READINESS_SECTIONS,
    BETA_REVIEW_SECTIONS,
    BRAND_ASSETS,
    PRODUCTION_CONFIG_AUDIT,
    PageHeader,
    adminToolsVisible,
    betaAccessAllowedForProfile,
    betaAccessMode,
    betaReadinessData,
    getHeaderCardClass,
    getSuggestionReviewSection,
    runBetaReadinessAiAssist,
    runMarketingAiAssist,
    runRoadmapChangelogAiAssist,
    scoutNeedsReviewReports,
    setActiveTab,
    setAdminReviewFilter,
    shorelineState,
    suggestions,
    updateBetaAccessMode,
    updateBetaReadinessData,
  } = scope;

  function renderBetaReadinessPanel() {
    if (!adminToolsVisible) return null;
    const blockers = betaReadinessData.readiness?.blockers || [];
    const pendingProfileUsers = (shorelineState.adminProfileUsers || []).filter((entry) =>
      !entry.isAdmin && !betaAccessAllowedForProfile(entry)
    ).length;
    const reviewCounts = {
      "Kids Program Applications": (shorelineState.adminLittleSparksApplications || []).filter((entry) => entry.status === "pending").length + (betaReadinessData.kidsApplications || []).filter((entry) => entry.status === "pending_review").length,
      "Data Requests": (betaReadinessData.dataRequests || []).filter((entry) => ["new", "reviewing"].includes(entry.status || "new")).length,
      "User Management": shorelineState.adminProfileUsersReady ? pendingProfileUsers : 1,
      "App Error Logs": (betaReadinessData.appErrorLogs || []).length,
      "Sponsor Interest": (betaReadinessData.sponsorInterest || []).filter((entry) => ["new", "pending"].includes(entry.status || "new")).length,
      "Beta Feedback": (betaReadinessData.betaFeedback || []).filter((entry) => ["new", "reviewing"].includes(entry.status || "new")).length,
      "Beta Access": (shorelineState.adminBetaRequests || []).filter((entry) => ["pending", "waitlist"].includes(entry.status)).length,
      "Store Reports": scoutNeedsReviewReports.length,
      "Catalog Corrections": suggestions.filter((entry) => getSuggestionReviewSection(entry) === "catalog").length,
    };
    return (
      <>
        <PageHeader
          className={getHeaderCardClass("panel admin-page-header")}
          title="Beta Readiness"
          subtitle="Launch control panel for auth, inventory, mobile UI, admin tools, feedback, blockers, safety, marketing, and roadmap."
          actions={(
            <>
              <button type="button" className="secondary-button" onClick={() => void runBetaReadinessAiAssist()}>Summarize beta status</button>
              <button type="button" className="secondary-button" onClick={() => void runRoadmapChangelogAiAssist()}>Draft roadmap summary</button>
              <button type="button" className="secondary-button" onClick={() => setActiveTab("adminReview")}>Admin Review</button>
            </>
          )}
        />
        <section className="panel beta-readiness-panel">
          <div className="compact-card-header">
            <div>
              <h2>Launch decision</h2>
              <p>{BETA_MODE_COPY}</p>
            </div>
            <select
              value={betaReadinessData.readiness?.launchState || "Not ready"}
              onChange={(event) => updateBetaReadinessData((current) => ({
                ...current,
                readiness: { ...(current.readiness || {}), launchState: event.target.value },
              }))}
            >
              {BETA_LAUNCH_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </div>
          <div className="settings-subsection">
            <h3>Beta access control</h3>
            <p className="compact-subtitle">Open beta is the default. Invite-only and waitlist modes gate protected app access while keeping guest preview available.</p>
            <select value={betaAccessMode()} onChange={(event) => updateBetaAccessMode(event.target.value)}>
              {BETA_ACCESS_MODES.map((mode) => <option key={mode} value={mode}>{mode.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div className="beta-foundation-grid">
            {BETA_READINESS_SECTIONS.map((section) => (
              <article className="beta-readiness-card" key={section}>
                <span>{section}</span>
                <strong>{section === "Known Blockers" ? blockers.length : section === "Launch Decision" ? betaReadinessData.readiness?.launchState || "Not ready" : "Foundation ready"}</strong>
              </article>
            ))}
          </div>
          <div className="settings-subsection">
            <h3>Auth / email copy review</h3>
            <div className="beta-foundation-grid">
              {AUTH_COPY_REVIEW.map((entry) => (
                <article className="beta-readiness-card" key={entry.key}>
                  <span>{entry.title}</span>
                  <strong>{entry.expected}</strong>
                </article>
              ))}
            </div>
          </div>
          <div className="settings-subsection">
            <h3>Production config audit</h3>
            <div className="beta-foundation-grid">
              {PRODUCTION_CONFIG_AUDIT.map((entry) => (
                <article className="beta-readiness-card" key={entry}>
                  <span>Audit item</span>
                  <strong>{entry}</strong>
                </article>
              ))}
            </div>
          </div>
          <div className="settings-subsection">
            <h3>Review queues</h3>
            <div className="beta-foundation-grid">
              {BETA_REVIEW_SECTIONS.map((section) => (
                <button type="button" className="beta-action-card" key={section} onClick={() => setAdminReviewFilter(section)}>
                  <span>{section}</span>
                  <strong>{reviewCounts[section] || 0}</strong>
                </button>
              ))}
            </div>
          </div>
          <div className="settings-subsection">
            <h3>Known blockers</h3>
            <div className="inventory-list compact-inventory-list">
              {blockers.map((blocker, index) => (
                <article className="inventory-card compact-card" key={`${blocker.title}-${index}`}>
                  <div className="compact-card-header">
                    <div>
                      <strong>{blocker.title}</strong>
                      <p>{blocker.notes}</p>
                    </div>
                    <span className={`status-badge severity-${blocker.severity}`}>{blocker.severity}</span>
                  </div>
                  <small>{blocker.owner} | {blocker.status}</small>
                </article>
              ))}
            </div>
          </div>
          <div className="settings-subsection">
            <h3>Beta launch materials</h3>
            <div className="quick-actions">
              <button type="button" className="secondary-button" onClick={() => void runMarketingAiAssist("parents")}>Draft parent post</button>
              <button type="button" className="secondary-button" onClick={() => void runMarketingAiAssist("card_shop")}>Draft card shop outreach</button>
            </div>
            <div className="brand-asset-reference">
              <img src={BRAND_ASSETS.mark} alt="" aria-hidden="true" />
              <div>
                <strong>Brand asset rules</strong>
                <p>App icon = flame/wave only. Splash = logo + Track. Trade. Thrive. Promo mockup = marketing hero/social/flyer only. Do not use official Pokemon logos or art.</p>
                <p>Approved colors: ember orange, tide blue, deep navy. Secondary tagline: Built for collectors. Powered by community.</p>
              </div>
            </div>
            <div className="beta-foundation-grid">
              {[
                "Final human-refined SVG logo created",
                "Trademark search completed",
                "Trademark filing considered",
                "Domains secured",
                "Social handles secured",
                "Source files archived",
              ].map((item) => (
                <article className="beta-readiness-card" key={item}>
                  <span>Brand checklist</span>
                  <strong>{item}</strong>
                </article>
              ))}
            </div>
            <div className="beta-foundation-grid">
              {(betaReadinessData.marketingMaterials || []).map((entry) => (
                <article className="beta-readiness-card" key={entry.title}>
                  <span>{entry.platform}</span>
                  <strong>{entry.title}</strong>
                  <small>{entry.status}</small>
                </article>
              ))}
            </div>
          </div>
          <div className="settings-subsection">
            <h3>Roadmap</h3>
            <div className="beta-foundation-grid">
              {(betaReadinessData.roadmapItems || []).map((entry) => (
                <article className="beta-readiness-card" key={`${entry.section}-${entry.title}`}>
                  <span>{entry.section}</span>
                  <strong>{entry.title}</strong>
                  <small>{entry.status}</small>
                </article>
              ))}
            </div>
          </div>
        </section>
      </>
    );
  }

  return renderBetaReadinessPanel(...args);
}
