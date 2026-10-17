// Rendering is deferred; the owning App retains record state and action handlers.
export default function ProfileContent({ scope }) {
  const {
    AppNavIcon,
    CommandBoardV4,
    TIER_LABELS,
    betaAccessAllowed,
    currentTier,
    openUtilityPage,
    publicProfileLabel,
    renderUtilityPageShell,
    scoutGuessPoints,
    settingsFamilyStatusLabel,
    signedInWithSupabase,
    smartSetupRecommendation,
    vaultItems,
    workspaceWatchlist,
  } = scope;

  function renderProfilePage() {
    const profileCommandCards = [
      {
        key: "profile",
        icon: "account",
        eyebrow: "Account",
        title: "Identity and security",
        body: "Public label, private account details, beta status, and security actions stay separated.",
        status: betaAccessAllowed() ? "Approved beta" : "Limited",
        action: "Edit profile",
        onClick: () => openUtilityPage("profile"),
      },
      {
        key: "nest",
        icon: "community",
        eyebrow: "Family",
        title: "Family permissions",
        body: "Child profiles, approvals, location protection, wishlist requests, and household rules remain governed.",
        status: "Parent guarded",
        action: "Open Nest",
        onClick: () => openUtilityPage("parentCenter"),
      },
      {
        key: "lantern",
        icon: "help",
        eyebrow: "Safety",
        title: "Lantern Safety Center",
        body: "Trade safety, card care, local meetup rules, scam prevention, and child-safe collecting guidance.",
        status: settingsFamilyStatusLabel,
        action: "Open Lantern",
        onClick: () => openUtilityPage("trust"),
      },
      {
        key: "spark",
        icon: "spark",
        eyebrow: "Access",
        title: "Spark access and giving",
        body: "Kid packs, donation pledges, volunteer interest, sponsor paths, and reduced-cost access review.",
        status: "Review first",
        action: "Open Spark",
        onClick: () => openUtilityPage("kidsProgram"),
      },
      {
        key: "archive",
        icon: "data",
        eyebrow: "Archive",
        title: "Proof and records",
        body: "Receipts, donation proof, shipping proof, condition photos, exports, and account history.",
        status: "Private records",
        action: "Open Archive",
        onClick: () => openUtilityPage("dataBackup"),
      },
      {
        key: "help",
        icon: "help",
        eyebrow: "Support",
        title: "Help and app status",
        body: "Support, known issues, beta feedback, legal/status, accessibility questions, and safe account help.",
        status: "Support hub",
        action: "Get help",
        onClick: () => openUtilityPage("help"),
      },
      {
        key: "settings",
        icon: "settings",
        eyebrow: "Settings",
        title: "Privacy and preferences",
        body: "Notifications, appearance, accessibility, data controls, account security, and legal links.",
        status: "Private",
        action: "Open Settings",
        onClick: () => openUtilityPage("settings"),
      },
      {
        key: "tidepool",
        icon: "pool",
        eyebrow: "Community",
        title: "Tidepool access",
        body: "Events, trusted shops, donation drives, and family-safe community routes stay moderated.",
        status: "Guarded",
        action: "Open Tidepool",
        onClick: () => openUtilityPage("tidepool"),
      },
    ];
    const profileNorthStarStats = [
      { label: "Beta access", value: betaAccessAllowed() ? "Approved" : "Limited", helper: "Current gate" },
      { label: "Safety guard", value: settingsFamilyStatusLabel, helper: "Default protection" },
      { label: "Scout trust", value: `${scoutGuessPoints} pts`, helper: "Report history" },
      { label: "Setup", value: smartSetupRecommendation.label, helper: "Active app mode" },
    ];
    const profileAccessReviewSteps = [
      {
        label: "1. Request",
        title: "Family or access help",
        body: "Parents, guardians, adults with special needs, or families supporting special-needs children can request review.",
        status: "Private start",
      },
      {
        label: "2. Proof",
        title: "Minimum needed only",
        body: "Use a careful proof path before discounting. Do not expose diagnosis, child details, exact location, or private documents publicly.",
        status: "Privacy first",
      },
      {
        label: "3. Review",
        title: "Admin decision",
        body: "Discount or free access should be approved, logged, and reversible before any future billing connection.",
        status: "No auto-billing",
      },
      {
        label: "4. Renewal",
        title: "Gentle recheck",
        body: "Keep families from repeatedly proving sensitive details. Use lightweight renewal and support notes when possible.",
        status: "Dignity rule",
      },
    ];
    const profileProofRows = [
      { label: "Identity", value: signedInWithSupabase ? "Cloud account" : "Local preview", helper: "Private account data" },
      { label: "Public card", value: publicProfileLabel(), helper: "Shown instead of private email" },
      { label: "Family privacy", value: "No public child profile", helper: "Parent-managed by default" },
      { label: "Access proof", value: "Future review flow", helper: "No fake verification yet" },
    ];
    const profileRouteRows = [
      { label: "Plans", body: "Family pricing, free access review, limits, and upgrade previews.", icon: "plan", onClick: () => openUtilityPage("membership") },
      { label: "Nest", body: "Child profiles, permissions, approvals, and location controls.", icon: "community", onClick: () => openUtilityPage("parentCenter") },
      { label: "Lantern", body: "Safety lessons, meetup rules, scams, and parent guides.", icon: "help", onClick: () => openUtilityPage("trust") },
      { label: "Spark", body: "Access review, donations, volunteer interest, and impact previews.", icon: "spark", onClick: () => openUtilityPage("kidsProgram") },
      { label: "Archive", body: "Receipts, proof, exports, and private records.", icon: "data", onClick: () => openUtilityPage("dataBackup") },
      { label: "Settings", body: "Privacy, security, notifications, legal, and app status.", icon: "settings", onClick: () => openUtilityPage("settings") },
    ];
    const profileUsageRows = [
      { label: "Vault items", value: vaultItems.length, helper: "Collection records", icon: "vault" },
      { label: "Watched targets", value: workspaceWatchlist.length, helper: "Prices and restocks", icon: "bell" },
      { label: "Scout trust", value: `${scoutGuessPoints} pts`, helper: "Report history", icon: "scout" },
      { label: "Plan", value: TIER_LABELS[currentTier] || "Free", helper: "Safety basics included", icon: "plan" },
      { label: "Family", value: "Protected", helper: "Parent controls ready", icon: "community" },
      { label: "Records", value: "Private", helper: "Archive and proof", icon: "data" },
      { label: "Settings", value: "Private", helper: "Security and preferences", icon: "settings" },
      { label: "Tidepool", value: "Guarded", helper: "Events and trusted community", icon: "pool" },
    ];
    const profileOperationsRows = [
      { label: "Profile", title: "Identity", body: "Public label, avatar, account status, and private account data stay separated.", icon: "account", action: () => openUtilityPage("account") },
      { label: "Privacy", title: "Family data", body: "Child details, exact location, access proof, and admin notes are not public profile content.", icon: "community", action: () => openUtilityPage("settings") },
      { label: "Security", title: "Account safety", body: "Re-auth, sessions, password, and future 2FA belong in protected account settings.", icon: "settings", action: () => openUtilityPage("account") },
      { label: "Support", title: "Help center", body: "Known issues, support, status, legal, and beta feedback stay one tap away.", icon: "help", action: () => openUtilityPage("help") },
    ];

    return renderUtilityPageShell({
      title: "You",
      subtitle: "Profile, privacy, safety, access, records, support, and account controls.",
      className: "profile-utility-page you-command-only-route",
      hideCommandHeader: true,
      children: (
        <>
          <CommandBoardV4
            accent="you"
            className="you-profile-command-card utility-card utility-card-wide"
            ariaLabel="You account command center"
            label="Account Operations"
            title="You Command Center"
            description="Profile, family controls, privacy, safety, access, records, plans, and support in one private command center."
            primaryAction={{ label: "Account Setup", icon: "account", onClick: () => openUtilityPage("account") }}
            secondaryActions={[
              { label: "Plans", icon: "plan", onClick: () => openUtilityPage("membership") },
              { label: "Help", icon: "help", onClick: () => openUtilityPage("help") },
            ]}
            statusItems={profileNorthStarStats.map((stat, index) => ({
              key: stat.label,
              icon: index === 0 ? "account" : index === 1 ? "community" : index === 2 ? "scout" : "settings",
              label: stat.label,
              value: stat.value,
              detail: stat.helper,
            }))}
            plan={{
              label: "Profile Plan",
              title: "Keep public identity, proof, safety, and access separate",
              items: [
                { key: "profile", icon: "account", label: "Public label", detail: publicProfileLabel(), action: () => openUtilityPage("account") },
                { key: "privacy", icon: "community", label: "Family privacy", detail: "No public child profile", action: () => openUtilityPage("parentCenter") },
                { key: "access", icon: "plan", label: "Access review", detail: "Private proof path", action: () => openUtilityPage("membership") },
                { key: "records", icon: "data", label: "Records", detail: "Proof and archive", action: () => openUtilityPage("dataBackup") },
              ],
              actions: [
                { label: "Open Plans", icon: "plan", onClick: () => openUtilityPage("membership") },
                { label: "Open Lantern", icon: "help", onClick: () => openUtilityPage("trust") },
              ],
            }}
            routes={profileRouteRows.map((route) => ({
              key: route.label,
              icon: route.icon,
              label: route.label,
              title: route.label,
              detail: route.body,
              action: route.onClick,
            }))}
          >
            <div className="you-v4-command-content">
              <section className="you-v4-usage-panel" aria-label="Account usage and limits">
                <div className="you-v4-panel-heading">
                  <div>
                    <span>Plan and limits</span>
                    <h2>Know what is active before you manage it.</h2>
                    <p>Families, collectors, shops, sponsors, and admins need one clear control center with limits, permissions, records, and safety status visible at a glance.</p>
                  </div>
                  <small className="trust-badge trust-badge--verified">{betaAccessAllowed() ? "Approved beta" : "Limited beta"}</small>
                </div>
                <div className="you-v4-usage-grid">
                  {profileUsageRows.map((row) => (
                    <article key={row.label}>
                      <span><AppNavIcon kind={row.icon} />{row.label}</span>
                      <strong>{row.value}</strong>
                      <small>{row.helper}</small>
                    </article>
                  ))}
                </div>
              </section>

              <aside className="you-v4-side-rail" aria-label="Family access and privacy">
                <article>
                  <span className="trust-badge trust-badge--secure">Family mode</span>
                  <h3>Safety basics stay free.</h3>
                  <p>Parent approval, child privacy, and location protection should never be treated as premium-only trust features.</p>
                  <div className="you-v4-mini-list">
                    <span>Parent approval on</span>
                    <span>Location protected</span>
                    <span>No public child profile</span>
                  </div>
                </article>
                <article>
                  <span className="trust-badge trust-badge--fair">Access review</span>
                  <h3>Discounts need a private proof path.</h3>
                  <p>Free or reduced access for families and adults with special needs should be generous, reviewed, and dignity-first.</p>
                  <button type="button" className="command-board-v4-primary-action" onClick={() => openUtilityPage("membership")}>Review Plans</button>
                </article>
              </aside>
            </div>

            <div className="you-v4-operations-grid" aria-label="You control center routes">
              {profileCommandCards.map((card) => (
                <article className={`you-profile-command-tile you-profile-command-tile--${card.key}`} key={card.key}>
                  <div>
                    <span className="you-profile-command-label"><AppNavIcon kind={card.icon} />{card.eyebrow}</span>
                    <small className="status-badge">{card.status}</small>
                  </div>
                  <strong>{card.title}</strong>
                  <p>{card.body}</p>
                  <button type="button" className="secondary-button" onClick={card.onClick}>{card.action}</button>
                </article>
              ))}
            </div>

            <div className="you-v4-lower-grid">
              <section className="you-profile-access-system" aria-label="Family access review path">
                <div className="you-profile-access-copy">
                  <span className="section-kicker">Access Review</span>
                  <h3>Make help generous without turning proof into a public label.</h3>
                  <p>Families and adults requesting support should understand what is free, what is discounted, what requires review, and what data Ember & Tide will never make public.</p>
                </div>
                <div className="you-profile-step-grid">
                  {profileAccessReviewSteps.map((step) => (
                    <article key={step.label}>
                      <span>{step.label}</span>
                      <strong>{step.title}</strong>
                      <p>{step.body}</p>
                      <small className="status-badge">{step.status}</small>
                    </article>
                  ))}
                </div>
              </section>
              <section className="you-profile-route-card" aria-label="Account operations">
                <div>
                  <span className="section-kicker">Operations</span>
                  <strong>Every control goes somewhere useful.</strong>
                </div>
                <div className="you-v4-operation-list">
                  {profileOperationsRows.map((row) => (
                    <button type="button" key={row.label} onClick={row.action}>
                      <span><AppNavIcon kind={row.icon} />{row.label}</span>
                      <strong>{row.title}</strong>
                      <small>{row.body}</small>
                    </button>
                  ))}
                </div>
              </section>
              <section className="you-profile-proof-card" aria-label="Profile proof model">
                <div>
                  <span className="section-kicker">Proof model</span>
                  <strong>Show trust without leaking sensitive details.</strong>
                </div>
                <div className="you-profile-proof-list">
                  {profileProofRows.map((row) => (
                    <article key={row.label}>
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                      <small>{row.helper}</small>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </CommandBoardV4>
        </>
      ),
    });
  }

  return renderProfilePage();
}
