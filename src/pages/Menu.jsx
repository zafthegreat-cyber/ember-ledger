export default function MenuPage(props) {
  const {
    applyHomeViewPreset,
    betaAccessAllowed,
    dashboardPreset,
    dashboardPresetLabel,
    normalizeDashboardPreset,
    normalizeUserType,
    openUtilityPage,
    PUBLIC_APP_VERSION_LABEL,
    renderAccountSetupOverviewCard,
    renderAppBuildDetails,
    renderAppSetupPersonalizationCard,
    renderOnboardingSettingsCard,
    renderSettingsPreferencesCard,
    renderSettingsPrivacySafetyCard,
    renderSettingsProfileSummaryCard,
    renderSettingsWorkspaceCard,
    renderUtilityPageShell,
    settingsSectionRows,
    signedInWithSupabase,
    signOut,
    userType,
  } = props;

  function renderSettingsPage() {
      return renderUtilityPageShell({
        title: "Settings",
        subtitle: "Profile, tools, workspace, preferences, privacy, and beta support.",
        className: "settings-utility-page",
        children: (
          <>
            {renderAppSetupPersonalizationCard()}
            {renderAccountSetupOverviewCard({ compact: true })}
            {renderSettingsProfileSummaryCard({ compact: true })}
            {renderSettingsWorkspaceCard()}
            <div className="drawer-info-card settings-command-overview utility-card">
              <strong>Settings map</strong>
              <p className="compact-subtitle">A quick overview of profile, setup, support, and privacy areas.</p>
              <div className="settings-section-grid settings-map-grid">
                {settingsSectionRows.slice(0, 8).map((row) => (
                  <article className="settings-section-card" key={row.title}>
                    <strong>{row.title}</strong>
                    <span>{row.body}</span>
                    <small className="status-badge">{row.status}</small>
                  </article>
                ))}
              </div>
            </div>
            <div className="drawer-info-card beta-support-card settings-beta-status-card utility-card">
              <strong>Private beta</strong>
              <p className="compact-subtitle">Features, labels, and signals may change during beta. Help keeps known issues, release notes, and feedback together.</p>
              <dl className="drawer-status-list settings-compact-status-list">
                <div><dt>Access</dt><dd>{betaAccessAllowed() ? "Approved beta" : "Pending or limited"}</dd></div>
                <div><dt>Build</dt><dd>{PUBLIC_APP_VERSION_LABEL}</dd></div>
                <div><dt>Support</dt><dd>Known Issues and Feedback live in Help.</dd></div>
              </dl>
              {renderAppBuildDetails()}
              <button type="button" className="secondary-button" onClick={() => openUtilityPage("help")}>Open Help</button>
            </div>
            <div className="drawer-info-card experience-mode-settings-card utility-card utility-card-wide">
              <div className="compact-card-header">
                <div>
                  <strong>Experience mode</strong>
                  <p className="compact-subtitle">This changes what Hearth and Today&apos;s Tide prioritize. It does not change saved records.</p>
                </div>
                <span className="status-badge">{dashboardPresetLabel(dashboardPreset)}</span>
              </div>
              <div className="settings-mode-grid">
                {[
                  { key: "budget", title: "Simple", helper: "Parents, families, and new collectors.", active: normalizeUserType(userType) === "budget" || normalizeDashboardPreset(dashboardPreset) === "budget_parent" },
                  { key: "collector", title: "Collector", helper: "Vault, Scout, Market, and Tidepool.", active: normalizeUserType(userType) === "collector" && normalizeDashboardPreset(dashboardPreset) !== "seller" },
                  { key: "seller", title: "Seller", helper: "Forge, receipts, mileage, inventory, and sales.", active: normalizeUserType(userType) === "seller" || normalizeDashboardPreset(dashboardPreset) === "seller" },
                ].map((mode) => (
                  <button key={mode.key} type="button" className={mode.active ? "settings-mode-card active" : "settings-mode-card"} aria-pressed={mode.active} onClick={() => applyHomeViewPreset(mode.key)}>
                    <strong>{mode.title}</strong>
                    <span>{mode.helper}</span>
                  </button>
                ))}
              </div>
            </div>
            {renderSettingsPreferencesCard()}
            {renderSettingsPrivacySafetyCard()}
            {renderOnboardingSettingsCard()}
            <div className="drawer-info-card settings-account-actions-card utility-card">
              <strong>Account actions</strong>
              <p className="compact-subtitle">Session and account controls stay separated from destructive data actions.</p>
              <div className="drawer-inline-actions settings-action-row">
                <button type="button" className="drawer-link" onClick={() => openUtilityPage("account")}>Open account</button>
                <button type="button" className="secondary-button" onClick={() => openUtilityPage("profile")}>Edit profile</button>
                {signedInWithSupabase ? <button type="button" className="secondary-button logout-link" onClick={signOut}>Sign out</button> : null}
              </div>
            </div>
          </>
        ),
      });
    }

  return renderSettingsPage();
}
