// Rendering is deferred; the owning App retains record state and action handlers.
export default function ParentCenterContent({ scope, args = [] }) {
  const {
    activeWorkspace,
    betaReadinessData,
    openUtilityPage,
    renderUtilityPageShell,
    setActiveTab,
    statusLabel,
  } = scope;

  function renderParentCenterPage() {
    const parentCenterKidsApplication = (betaReadinessData.kidsApplications || [])[0] || null;
    const mockKidProfiles = [
      { name: "Young collector", age: "8-10", visibility: "Private to family workspace", status: "Parent managed", focus: "Binder goals and safe trades" },
      { name: "Teen collector", age: "11-13", visibility: "Wishlist hidden from public spaces", status: "Setup preview", focus: "Deck lists and missing cards" },
    ];
    const safetyRows = [
      { title: "Child privacy default", body: "Kid profiles begin private. Names, ages, notes, and wishlists are not shown in public surfaces.", status: "Private" },
      { title: "Trade approval", body: "Kid trades are treated as parent-review decisions before anything changes hands.", status: "Approval first" },
      { title: "Community restrictions", body: "Community remains adult-guided and moderated. No unmoderated kid messaging is connected.", status: "Restricted" },
      { title: "Purchase reminders", body: "Market and Restocks guide fair value and planning, not rush buying, checkout, or guaranteed stock.", status: "Fair pace" },
    ];
    const approvalRows = [
      { title: "Trade review", body: "Check exact variants, condition, value range, and who receives each card.", status: "Parent approval" },
      { title: "Restocks trip decision", body: "Use Worth the Trip and proof confidence without exposing harmful restock patterns.", status: "Current signals" },
      { title: "Spark participation", body: parentCenterKidsApplication ? `Latest request: ${statusLabel(parentCenterKidsApplication.status || "pending")}.` : "Requests are reviewed before a child-sensitive program action is counted.", status: "Review queue" },
      { title: "Purchase pause", body: "Add a reminder to compare budget, fair range, and family rules before buying.", status: "Reminder" },
    ];
    const participationRows = [
      { title: "The Spark", body: parentCenterKidsApplication ? `Request status: ${statusLabel(parentCenterKidsApplication.status || "pending")}. No child details are shared publicly.` : "Parent-approved Spark requests can start from The Spark without public child details.", action: "Open The Spark", onClick: () => setActiveTab("kidsProgram") },
      { title: "Trusted adults", body: "Trusted adult helpers are a placeholder for a future approval model. Nothing grants access yet.", action: "Review Privacy", onClick: () => setActiveTab("trust") },
      { title: "Family workspace", body: activeWorkspace?.name ? `${activeWorkspace.name} keeps collection access scoped.` : "Use workspace settings to keep family collection access scoped.", action: "Open Settings", onClick: () => openUtilityPage("settings") },
    ];
    return renderUtilityPageShell({
      title: "Parent Center",
      subtitle: "Kids can collect safely with parent-guided tools.",
      className: "parent-center-page",
      actions: (
        <>
          <button type="button" className="secondary-button" onClick={() => setActiveTab("kidsProgram")}>Open The Spark</button>
          <button type="button" className="secondary-button" onClick={() => setActiveTab("trust")}>Privacy &amp; Safety</button>
        </>
      ),
      children: (
        <>
          <section className="drawer-info-card parent-center-hero-card utility-card utility-card-wide">
            <div>
              <p className="section-kicker">Family safety</p>
              <h3>Parent-guided collecting, private by default.</h3>
              <p className="compact-subtitle">Parent Center is a mock-only safety shell for child privacy defaults, trade approvals, community restrictions, purchase reminders, and Spark participation. No child account backend, messaging, or auth change is connected.</p>
            </div>
            <div className="settings-section-grid compact">
              {safetyRows.map((row) => (
                <article className="settings-section-card" key={row.title}>
                  <strong>{row.title}</strong>
                  <span>{row.body}</span>
                  <small className="status-badge">{row.status}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="drawer-info-card parent-center-profile-card utility-card">
            <div className="compact-card-header">
              <div>
                <strong>Kid profile previews</strong>
                <p className="compact-subtitle">Mock-only age-band examples. No public child profiles, legal names, photos, or child account records are created.</p>
              </div>
              <span className="status-badge">Private</span>
            </div>
            <div className="parent-center-profile-list">
              {mockKidProfiles.map((profile) => (
                <article className="parent-center-profile-row" key={profile.name}>
                  <div>
                    <strong>{profile.name}</strong>
                    <span>{profile.age}</span>
                  </div>
                  <p>{profile.visibility}</p>
                  <p>{profile.focus}</p>
                  <small className="status-badge">{profile.status}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="drawer-info-card parent-center-approval-card utility-card">
            <div className="compact-card-header">
              <div>
                <strong>Approval checklist</strong>
                <p className="compact-subtitle">A parent-first review layer for trades, trips, purchases, and Spark participation.</p>
              </div>
              <span className="status-badge">Preview</span>
            </div>
            <div className="parent-center-approval-list">
              {approvalRows.map((row) => (
                <article className="parent-center-approval-row" key={row.title}>
                  <div>
                    <strong>{row.title}</strong>
                    <span>{row.body}</span>
                  </div>
                  <small className="status-badge">{row.status}</small>
                </article>
              ))}
            </div>
          </section>

          <section className="drawer-info-card parent-center-support-card utility-card">
            <div className="compact-card-header">
              <div>
                <strong>Family support paths</strong>
                <p className="compact-subtitle">Safe shortcuts for Spark requests, trusted adult planning, and workspace privacy review.</p>
              </div>
              <span className="status-badge">Mock controls</span>
            </div>
            <div className="settings-section-grid compact">
              {participationRows.map((row) => (
                <article className="settings-section-card parent-center-action-card" key={row.title}>
                  <strong>{row.title}</strong>
                  <span>{row.body}</span>
                  <button type="button" className="secondary-button" onClick={row.onClick}>{row.action}</button>
                </article>
              ))}
            </div>
          </section>

          <section className="drawer-info-card parent-center-summary-card utility-card utility-card-wide">
            <strong>Safety summary</strong>
            <p className="compact-subtitle">No live messaging, no child account backend, no payment flow, no public child identity, and no unsafe restock pattern access were added. Parent Center stays a UI shell until the safety system is explicitly approved.</p>
            <div className="settings-section-grid compact">
              {["No unmoderated kid messaging", "Parent-reviewed trade guidance", "Private child/family details", "Spark participation is reviewed"].map((item) => (
                <article className="settings-section-card" key={item}>
                  <strong>{item}</strong>
                  <span>Enabled as safety copy and mock UI only.</span>
                </article>
              ))}
            </div>
          </section>
        </>
      ),
    });
  }

  return renderParentCenterPage(...args);
}
