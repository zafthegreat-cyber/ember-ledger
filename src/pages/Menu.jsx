import { AppNavIcon, CommandBoardV4 } from "../components/command-system";

export default function MenuPage(props) {
  const {
    activeWorkspaceName = "",
    adaptiveUiState = {},
    applyHomeViewPreset,
    betaReadinessData = {},
    betaAccessAllowed,
    commandDeskSellerAccess = false,
    dashboardPreset,
    dashboardPresetLabel,
    guestPreviewActive = false,
    normalizeDashboardPreset,
    normalizeUserType,
    notificationUnreadCount = 0,
    openBeaconCenter,
    openCompassSearch,
    openMainRoute = () => {},
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
    scoutGuessPoints = 0,
    settingsFamilyStatusLabel = "Protected",
    settingsSectionRows,
    signedInWithSupabase,
    signOut,
    userType,
  } = props;

  function renderYouControlCenter() {
    const setupLabel = dashboardPresetLabel(dashboardPreset);
    const kidApplicationCount = Array.isArray(betaReadinessData.kidsApplications)
      ? betaReadinessData.kidsApplications.length
      : 0;
    const accessLabel = betaAccessAllowed() ? "Beta approved" : "Limited preview";
    const accountLabel = signedInWithSupabase ? "Cloud account" : guestPreviewActive ? "Guest preview" : "Local beta";
    const familyModeLabel = adaptiveUiState.modeLabel || setupLabel || "Collector operations";
    const familyProtectionLabel = /no kids program request/i.test(String(settingsFamilyStatusLabel || ""))
      ? "Parent guard ready"
      : settingsFamilyStatusLabel || "Protected";
    const openBeacon = typeof openBeaconCenter === "function" ? openBeaconCenter : () => openUtilityPage("settings");
    const controlCards = [
      {
        key: "profile",
        icon: "account",
        label: "Account",
        title: "Identity and security",
        body: "Public label, private account details, authentication status, and sensitive account actions stay separated.",
        status: signedInWithSupabase ? "Cloud profile" : "Preview profile",
        action: "Open Profile",
        onClick: () => openUtilityPage("profile"),
      },
      {
        key: "beacon",
        icon: "bell",
        label: "Beacon",
        title: "Notification operations",
        body: "Scout alerts, price watches, wishlist reminders, release drops, approvals, and safety notices in one queue.",
        status: notificationUnreadCount ? `${notificationUnreadCount} unread` : "All quiet",
        action: "Open Beacon",
        onClick: openBeacon,
      },
      {
        key: "nest",
        icon: "community",
        label: "Family",
        title: "Family permissions",
        body: kidApplicationCount
          ? `${kidApplicationCount} Spark request${kidApplicationCount === 1 ? "" : "s"} ready for parent review.`
          : "Child profiles, permissions, approvals, and parent-first privacy live behind governed controls.",
        status: "Parent review",
        action: "Open Nest",
        onClick: () => openUtilityPage("parentCenter"),
      },
      {
        key: "lantern",
        icon: "help",
        label: "Lantern",
        title: "Lantern Safety Center",
        body: "Card care, trade safety, Scout privacy, local meetup rules, and scam prevention guidance.",
        status: familyProtectionLabel,
        action: "Open Lantern",
        onClick: () => openUtilityPage("trust"),
      },
      {
        key: "spark",
        icon: "spark",
        label: "Access",
        title: "Spark access and giving",
        body: "Donation pledges, kid-pack requests, volunteer interest, sponsor interest, and reduced-cost access review.",
        status: kidApplicationCount ? `${kidApplicationCount} request${kidApplicationCount === 1 ? "" : "s"}` : "Review first",
        action: "Open The Spark",
        onClick: () => openUtilityPage("kidsProgram"),
      },
      {
        key: "archive",
        icon: "data",
        label: "Archive",
        title: "Proof and records",
        body: "Receipts, exports, profile proof, privacy settings, and support records stay tied to the account.",
        status: commandDeskSellerAccess ? "Seller records" : "Private records",
        action: "Open Archive",
        onClick: () => openUtilityPage("dataBackup"),
      },
      {
        key: "help",
        icon: "help",
        label: "Help",
        title: "Help and app status",
        body: "Known issues, feedback, app status, safety questions, accessibility help, and beta support stay easy to reach.",
        status: "Support hub",
        action: "Open Help",
        onClick: () => openUtilityPage("help"),
      },
      {
        key: "membership",
        icon: "plan",
        label: "Plans",
        title: "Plans and billing",
        body: "Free-version limits, family pricing, access review status, beta gates, and billing readiness without fake checkout.",
        status: "No checkout",
        action: "Open Plans",
        onClick: () => openUtilityPage("membership"),
      },
      {
        key: "settings",
        icon: "settings",
        label: "Settings",
        title: "Privacy and preferences",
        body: "Notifications, appearance, accessibility, security, data controls, legal links, and app status.",
        status: "Private",
        action: "Open Settings",
        onClick: () => openUtilityPage("settings"),
      },
      {
        key: "tidepool",
        icon: "pool",
        label: "Tidepool",
        title: "Community access",
        body: "Events, trusted shops, donation drives, and family-safe community routes stay moderated.",
        status: "Guarded",
        action: "Open Tidepool",
        onClick: () => openUtilityPage("tidepool"),
      },
    ];
    const statusRows = [
      { label: "Operating view", value: familyModeLabel, helper: `Setup: ${setupLabel}` },
      { label: "Account", value: accountLabel, helper: accessLabel },
      { label: "Workspace", value: activeWorkspaceName || "Personal", helper: "Collection and household scope" },
      { label: "Scout trust", value: `${scoutGuessPoints} pts`, helper: "Report history and proof signals" },
    ];
    const safetyRows = [
      { label: "Parent approval", detail: "Protects kid-sensitive actions" },
      { label: "Area-only location", detail: "No private address sharing" },
      { label: "Private child profiles", detail: "No open child messaging" },
      { label: "Review-first exchange", detail: "Buying, selling, and trades stay gated" },
    ];
    const nextActions = [
      { label: "Verify account privacy", helper: "Confirm what is public, private, and household-only.", onClick: () => openUtilityPage("profile") },
      { label: "Set location rules", helper: "Review Scout privacy before watching stores or reports.", onClick: () => openUtilityPage("trust") },
      { label: "Review access status", helper: "Keep family pricing or support review separate from public profile data.", onClick: () => openUtilityPage("membership") },
    ];
    const accessReviewSteps = [
      { label: "Request", value: "Family plan or access support", helper: "Start in Plans or Support." },
      { label: "Proof", value: "Private evidence review", helper: "No public child or medical labels." },
      { label: "Decision", value: "Admin-reviewed status", helper: "Discounts never auto-apply." },
      { label: "Renewal", value: "Gentle recheck", helper: "Avoid repeated sensitive proof." },
    ];
    const routeRows = [
      { label: "Profile", helper: "Identity, account status, private data", icon: "account", onClick: () => openUtilityPage("profile") },
      { label: "Plans", helper: "Limits, family pricing, access review", icon: "plan", onClick: () => openUtilityPage("membership") },
      { label: "Nest", helper: "Permissions, approvals, child privacy", icon: "community", onClick: () => openUtilityPage("parentCenter") },
      { label: "Lantern", helper: "Safety tools, meetups, scam prevention", icon: "help", onClick: () => openUtilityPage("trust") },
      { label: "Spark", helper: "Access review, donations, giving", icon: "spark", onClick: () => openUtilityPage("kidsProgram") },
      { label: "Tidepool", helper: "Events, trusted shops, guarded community", icon: "pool", onClick: () => openUtilityPage("tidepool") },
      { label: "Archive", helper: "Receipts, proof, exports, records", icon: "data", onClick: () => openUtilityPage("dataBackup") },
      { label: "Settings", helper: "Privacy, security, legal, app status", icon: "settings", onClick: () => openUtilityPage("settings") },
      { label: "Help", helper: "Support, status, account help", icon: "help", onClick: () => openUtilityPage("help") },
    ];
    const youCommandStatus = [
      { key: "view", icon: "account", label: "Operating view", value: familyModeLabel, detail: `Setup: ${setupLabel}` },
      { key: "account", icon: "workspace", label: "Account", value: accountLabel, detail: accessLabel },
      { key: "workspace", icon: "data", label: "Workspace", value: activeWorkspaceName || "Personal", detail: "Collection and household scope" },
      { key: "family", icon: "community", label: "Family safety", value: familyProtectionLabel, detail: "Parent-first controls" },
      { key: "trust", icon: "scout", label: "Scout trust", value: `${scoutGuessPoints} pts`, detail: "Report proof signals" },
    ];
    const youCommandPlan = nextActions.map((action, index) => ({
      key: action.label,
      icon: index === 0 ? "account" : index === 1 ? "scout" : "plan",
      label: action.label,
      detail: action.helper,
      action: action.onClick,
    }));
    const youCommandRoutes = routeRows.slice(0, 8).map((route) => ({
      key: route.label,
      icon: route.icon,
      label: route.label,
      title: route.helper.split(",")[0],
      detail: route.helper,
      active: route.label === "Settings",
      action: route.onClick,
    }));

    return (
      <CommandBoardV4
        accent="you"
        className="you-command-center-card you-command-board-v4"
        ariaLabel="You Command Center"
        label="Account Operations"
        title="You Command Center"
        description="Profile, family controls, records, access, and support in one private command center."
        primaryAction={{ label: "Open Nest", icon: "community", onClick: () => openUtilityPage("parentCenter") }}
        secondaryActions={[
          { label: "Profile", icon: "account", onClick: () => openUtilityPage("profile") },
          { label: "Plans", icon: "plan", onClick: () => openUtilityPage("membership") },
        ]}
        utilityActions={[
          { label: "Compass", icon: "search", onClick: () => openCompassSearch?.("you_compass") },
          { label: "Beacon", icon: "bell", onClick: () => openBeacon("you_beacon") },
        ]}
        statusItems={youCommandStatus}
        plan={{
          label: "Settings Plan",
          title: "Set privacy, location, and access before growth",
          items: youCommandPlan,
          actions: [
            { label: "Open Nest", icon: "community", onClick: () => openUtilityPage("parentCenter") },
            { label: "Open Lantern", icon: "help", onClick: () => openUtilityPage("trust") },
          ],
        }}
        routes={youCommandRoutes}
      >
        <div className="you-v4-command-content" aria-label="Account command overview">
          <section className="you-v4-profile-panel" aria-label="Profile and plan summary">
            <div className="you-v4-profile-identity">
              <span className="you-v4-profile-mark" aria-hidden="true"><AppNavIcon kind="account" /></span>
              <div>
                <span className="section-kicker">Current workspace</span>
                <h2>{activeWorkspaceName || "My Personal Space"}</h2>
                <p>{familyModeLabel} with private account and household boundaries.</p>
              </div>
              <span className="trust-badge trust-badge--verified">{accessLabel}</span>
            </div>

            <div className="you-v4-profile-metrics" aria-label="Account status">
              {statusRows.map((row) => (
                <article key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                  <small>{row.helper}</small>
                </article>
              ))}
            </div>

            <div className="you-v4-profile-actions">
              <button type="button" className="command-board-v4-primary-action" onClick={() => openUtilityPage("profile")}><AppNavIcon kind="account" />Open Profile</button>
              <button type="button" className="command-board-v4-secondary-action" onClick={() => openUtilityPage("membership")}><AppNavIcon kind="plan" />View Plan</button>
            </div>
          </section>

          <aside className="you-v4-control-rail" aria-label="Family and account safeguards">
            <article>
              <span className="trust-badge trust-badge--secure">Family protection</span>
              <h3>{familyProtectionLabel}</h3>
              <div className="you-v4-safety-list">
                {safetyRows.map((row) => (
                  <span key={row.label}>
                    <AppNavIcon kind="secure" />
                    <b>{row.label}</b>
                    <small>{row.detail}</small>
                  </span>
                ))}
              </div>
              <button type="button" className="command-board-v4-secondary-action" onClick={() => openUtilityPage("parentCenter")}>Open Nest</button>
            </article>
            <article>
              <span className="trust-badge trust-badge--fair">Access status</span>
              <h3>{accountLabel}</h3>
              <p>Free core access stays useful. Family pricing and special-needs support use a private, human-reviewed path.</p>
              <button type="button" className="command-board-v4-secondary-action" onClick={() => openUtilityPage("membership")}>Review Access</button>
            </article>
          </aside>
        </div>

        <section className="you-v4-operations-panel" aria-label="Account tools">
          <div className="you-v4-panel-heading">
            <div>
              <span>Account operations</span>
              <h2>Everything important, one level away.</h2>
              <p>Identity, family controls, safety, support, records, and plan access remain distinct workflows.</p>
            </div>
          </div>
          <div className="you-v4-quick-links">
            {controlCards.slice(0, 8).map((card) => (
              <button type="button" key={card.key} onClick={card.onClick}>
                <span><AppNavIcon kind={card.icon} />{card.label}</span>
                <strong>{card.title}</strong>
                <small>{card.status}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="you-v4-access-panel" aria-label="Family access review system">
          <div className="you-v4-access-copy">
            <span className="trust-badge trust-badge--verified">Family access</span>
            <h2>Affordable access without public labels.</h2>
            <p>Family pricing and special-needs support use a private, human-reviewed path. Only the minimum evidence needed for a decision is requested.</p>
            <button type="button" className="command-board-v4-secondary-action" onClick={() => openUtilityPage("membership")}>Review Access</button>
          </div>
          <div className="you-v4-access-steps">
            {accessReviewSteps.map((step, index) => (
              <article key={step.label}>
                <span>{index + 1}</span>
                <div>
                  <small>{step.label}</small>
                  <strong>{step.value}</strong>
                  <p>{step.helper}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </CommandBoardV4>
    );
  }

  function renderSettingsPage() {
      return renderUtilityPageShell({
        title: "You",
        subtitle: "Profile, Nest, Lantern, Spark, Archive, help, privacy, and settings.",
        className: "settings-utility-page",
        hideCommandHeader: true,
        children: (
          <>
            {renderYouControlCenter()}
          </>
        ),
      });
    }

  return renderSettingsPage();
}
