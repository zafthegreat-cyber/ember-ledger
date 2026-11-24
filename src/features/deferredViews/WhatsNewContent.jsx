// Rendering is deferred; the owning App retains record state and action handlers.
export default function WhatsNewContent({ scope, args = [] }) {
  const {
    DetailItem,
    PageHeader,
    RELEASE_NOTES,
    adminToolsVisible,
    announcementWindowState,
    canShowAnnouncement,
    dismissNotification,
    getHeaderCardClass,
    getPersistedNotificationRows,
    runRoadmapChangelogAiAssist,
    setActiveTab,
    setVaultToast,
    shortDate,
    statusClass,
  } = scope;

  function renderWhatsNewPage() {
    const openAnnouncementsDetail = () => {
      if (typeof document === "undefined") return;
      document.getElementById("announcements-detail-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    const routeAnnouncementCta = (entry = {}) => {
      const destination = String(entry.ctaDestination || entry.actionUrl || "").toLowerCase();
      if (destination.includes("daily") || destination.includes("control")) setActiveTab("dailyTide");
      else if (destination.includes("home") || destination === "/") setActiveTab("dashboard");
      else if (destination.includes("kid")) setActiveTab("kidsProgram");
      else if (destination.includes("scout")) setActiveTab("scout");
      else if (destination.includes("market")) setActiveTab("market");
      else if (destination.includes("forge")) setActiveTab("inventory");
      else if (destination.includes("vault")) setActiveTab("vault");
      else setVaultToast("Announcement details are shown below.");
    };
    const staticUpdates = [
      {
        title: "Kids Program Updates",
        body: "Easier requests, family-safe wording, and a warmer Spark home for collectors.",
        type: "Kids Program update",
        priority: "highlight",
      },
      {
        title: "Restocks Improvements",
        body: "Better signals, report flow polish, and stronger store/restock card treatment.",
        type: "Restocks update",
        priority: "normal",
      },
      {
        title: "Daily Refresh",
        body: "A tighter overview with the Restocks, Vault, Market, and Business daily loop.",
        type: "New feature",
        priority: "normal",
      },
      {
        title: "Bug Fixes & Performance",
        body: "Smoother beta flows, safer inventory saves, and cleaner mobile navigation.",
        type: "App update",
        priority: "normal",
      },
    ];
    const activeAnnouncements = getPersistedNotificationRows().filter(canShowAnnouncement);
    // COULD 31: real release notes lead the list; the generic static blurbs follow.
    const releaseUpdates = RELEASE_NOTES.map((note) => ({ title: note.title, body: note.body, type: note.type, priority: note.priority, publishedAt: note.date, ctaLabel: note.ctaLabel, ctaDestination: note.ctaDestination === "tour" || note.ctaDestination === "feedback" ? "" : note.ctaDestination }));
    const recentAnnouncements = activeAnnouncements.length ? [...releaseUpdates, ...activeAnnouncements] : [...releaseUpdates, ...staticUpdates];
    const heroAnnouncement = recentAnnouncements[0];
    const heroType = heroAnnouncement?.type || "New feature";
    const heroPriority = heroAnnouncement?.priority || "normal";
    return (
      <>
        <PageHeader
          className={getHeaderCardClass("panel page-summary-card announcements-new-stuff-header")}
          title={heroAnnouncement?.title || "Announcements"}
          subtitle={heroAnnouncement?.message || heroAnnouncement?.body || "Important Code 3 TCG updates appear here before the daily command view."}
          actions={(
            <>
              {adminToolsVisible ? <button type="button" className="secondary-button" onClick={() => void runRoadmapChangelogAiAssist()}>Draft changelog</button> : null}
              <button type="button" onClick={() => setActiveTab("dailyTide")}>Open Control Panel</button>
              <button type="button" className="secondary-button" onClick={() => setActiveTab("dashboard")}>Go Home</button>
              <button type="button" className="ghost-button" onClick={openAnnouncementsDetail}>View details</button>
              {heroAnnouncement?.id && heroAnnouncement.dismissible !== false ? <button type="button" className="ghost-button" onClick={() => dismissNotification(heroAnnouncement.id)}>Dismiss</button> : null}
            </>
          )}
          summary={(
            <div className="announcement-hero-summary">
              <span className={`announcement-type-badge ${statusClass(heroType)}`}>{heroType}</span>
              <span className={`announcement-priority-badge priority-${String(heroPriority).toLowerCase()}`}>Priority: {heroPriority}</span>
              <span>{heroAnnouncement?.createdAt ? shortDate(heroAnnouncement.createdAt) : "Current beta update"}</span>
            </div>
          )}
        />
        <section className="panel announcements-command-panel" id="announcements-detail-list">
          <div className="compact-card-header">
            <div>
              <h2>Announcement details</h2>
              <p>Active announcements appear before Today&apos;s Tide. Dismissible updates stay hidden after dismissal; required updates remain visible until resolved.</p>
            </div>
            <span className="status-badge">{activeAnnouncements.length ? `${activeAnnouncements.length} active` : "No active blockers"}</span>
          </div>
          <div className="beta-foundation-grid announcements-update-grid">
            {recentAnnouncements.map((entry) => {
              const entryType = entry.type || "New feature";
              const entryPriority = entry.priority || "normal";
              const entryDate = entry.createdAt || entry.startDate || "";
              return (
              <article className="beta-readiness-card announcement-detail-card" key={entry.id || entry.title}>
                <div className="announcement-card-topline">
                  <span className={`announcement-type-badge ${statusClass(entryType)}`}>{entryType}</span>
                  <span className={`announcement-priority-badge priority-${String(entryPriority).toLowerCase()}`}>{entryPriority}</span>
                </div>
                <strong>{entry.title}</strong>
                <p>{entry.message || entry.body}</p>
                <div className="catalog-detail-grid announcement-detail-grid">
                  <DetailItem label="Date" value={entryDate ? shortDate(entryDate) : "Current"} />
                  <DetailItem label="Audience" value={entry.audience || "All users"} />
                  <DetailItem label="Window" value={announcementWindowState(entry)} />
                  <DetailItem label="Dismissible" value={entry.dismissible === false ? "Required" : "Yes"} />
                </div>
                <div className="quick-actions">
                  {(entry.ctaLabel || entry.ctaDestination || entry.actionUrl) ? <button type="button" onClick={() => routeAnnouncementCta(entry)}>{entry.ctaLabel || "Open"}</button> : null}
                  {entry.id && entry.dismissible !== false ? <button type="button" className="secondary-button" onClick={() => dismissNotification(entry.id)}>Dismiss</button> : null}
                </div>
              </article>
              );
            })}
          </div>
          {adminToolsVisible ? (
            <div className="announcement-admin-structure">
              <strong>Admin structure ready</strong>
              <span>Title</span>
              <span>Message</span>
              <span>Audience</span>
              <span>Priority</span>
              <span>Start date</span>
              <span>End date</span>
              <span>Dismissible</span>
              <span>CTA label</span>
              <span>CTA destination</span>
            </div>
          ) : null}
        </section>
      </>
    );
  }

  return renderWhatsNewPage(...args);
}
