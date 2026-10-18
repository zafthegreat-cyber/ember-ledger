import PrivacyCenter from "../privacy/PrivacyCenter.jsx";

// Rendering is deferred; the owning App retains record state and action handlers.
export default function TrustContent({ scope }) {
  const {
    BRAND_LEGAL_NOTICE,
    CommandBoardSection,
    CommandBoardV4,
    CommandMetricGrid,
    POKEMON_AFFILIATION_NOTICE,
    TRUST_PAGE_CONTENT,
    UPLOAD_SAFETY_WARNING,
    adminToolsVisible,
    openFeedbackDialog,
    openUtilityPage,
    runTrustCopyAiAssist,
    setActiveTab,
  } = scope;

  function renderTrustPages() {
    const trustSafetyRows = [
      {
        title: "Child privacy",
        body: "Kid and family details stay private and parent-managed. The app does not publish child profiles or private family context.",
        status: "Protected",
      },
      {
        title: "Scout protections",
        body: "Scout shares current signals and proof context, not raw restock history, vendor schedules, employee names, or pattern windows.",
        status: "Anti-scalper",
      },
      {
        title: "Community moderation",
        body: "Tidepool and public surfaces are built around family-safe posts, proof labels, and reporting instead of unmoderated feeds.",
        status: "Moderated",
      },
      {
        title: "Role-scoped tools",
        body: "Seller, shop, and admin tools stay behind role-aware app controls. Normal users do not see admin controls.",
        status: "Scoped",
      },
    ];
    const lanternStats = [
      { label: "Safety paths", value: "6", helper: "care, trade, selling, Scout, meetup, links" },
      { label: "Kid context", value: "On", helper: "parent-guided and private" },
      { label: "Risk posture", value: "Review", helper: "slow down before action" },
    ];
    const lanternPathways = [
      {
        title: "Card care",
        body: "Sleeves, binders, storage, photos, and condition notes before value decisions.",
        status: "Learn",
      },
      {
        title: "Trade safety",
        body: "Compare exact variants, condition, proof, value range, and parent approval before trading.",
        status: "Review first",
      },
      {
        title: "Scam prevention",
        body: "Watch for pressure, off-platform payment, fake urgency, altered photos, and unclear identity.",
        status: "Slow down",
      },
      {
        title: "Selling safety",
        body: "Use proof photos, tracking, issue records, and clear condition notes before shipping.",
        status: "Proof needed",
      },
      {
        title: "Safe meetup",
        body: "Meet in public, bring a grown-up for kid contexts, and avoid private address sharing.",
        status: "Public place",
      },
      {
        title: "Scout privacy",
        body: "Use current store signals without exposing exact restock patterns, vendor schedules, or private location.",
        status: "Area only",
      },
    ];
    const lanternChecklist = [
      "Confirm exact item, variant, condition, and quantity.",
      "Check value range and confidence before deciding.",
      "Keep child details, private addresses, and exact schedules out.",
      "Use parent approval for kid or teen collecting decisions.",
      "Save photos, receipts, tracking, or proof when trust matters.",
    ];
    const lanternRiskRows = [
      { title: "External link", body: "Warn before opening off-app shops, social links, or payment pages.", status: "Gate" },
      { title: "Local meetup", body: "Suggest trusted public places and no private child location sharing.", status: "Checklist" },
      { title: "Suspicious seller", body: "Pause if pressure, no proof, odd payment asks, or mismatch appears.", status: "Report" },
      { title: "Kid action", body: "Buying, selling, sharing, and trading stay parent-reviewed.", status: "Approval" },
    ];
    const safeMeetupLocations = [
      { title: "Trusted shop table", body: "Best choice when a participating shop can host a public exchange area.", status: "Preferred" },
      { title: "Public exchange zone", body: "Use a well-lit public location with cameras or posted exchange guidance.", status: "Safe zone" },
      { title: "Card show or event", body: "Meet during a family-safe event, stay on-site, and keep details in the app record.", status: "Event" },
    ];
    const safeMeetupProofRows = [
      { label: "Place", value: "Public or trusted shop" },
      { label: "Family", value: "Parent-approved when needed" },
      { label: "Proof", value: "Photos and condition saved" },
      { label: "Exit", value: "Cancel if anything changes" },
    ];
    const lanternLessonRows = [
      { title: "Beginner collector", body: "Protect cards, sort by set, and learn condition words before value chasing.", status: "Kid safe" },
      { title: "Teen collector", body: "Practice fair comparisons, saved wishlists, and parent-reviewed trades.", status: "Lantern" },
      { title: "Parent guide", body: "Set permissions, review requests, and keep private family data out of public spaces.", status: "Nest" },
    ];
    const lanternRouteRows = [
      { title: "Open Nest", body: "Review parent approvals, permissions, and family activity.", action: "Parent Center", onClick: () => setActiveTab("parentCenter") },
      { title: "Open Exchange", body: "Compare Market, Harbor, and Forge decisions before trading or selling.", action: "Exchange", onClick: () => setActiveTab("exchange") },
      { title: "Open Scout", body: "Use current local signals without unsafe restock-pattern details.", action: "Scout", onClick: () => setActiveTab("scout") },
      { title: "Open Spark", body: "Review kid-pack, donation, and family participation requests.", action: "The Spark", onClick: () => setActiveTab("kidsProgram") },
    ];
    return (
      <div className="utility-page trust-command-only-route trust-v4-route">
        <PrivacyCenter onNavigate={setActiveTab} />
        <details className="code3-privacy-guidance"><summary>Collecting safety, community guidelines, and terms</summary>
        <CommandBoardV4
          accent="you"
          className="trust-v4-command-board"
          ariaLabel="Trust and Safety Command Center"
          label="Lantern"
          title="Trust & Safety Command Center"
          description="Family privacy, Scout fairness, safe meetups, trade/sell friction, report education, and legal foundations in one protected control surface."
          primaryAction={{ label: "Back to Hearth", icon: "home", onClick: () => setActiveTab("dashboard") }}
          secondaryActions={[
            adminToolsVisible ? { label: "Review clarity", icon: "help", onClick: () => void runTrustCopyAiAssist("legal") } : null,
            { label: "New Stuff", icon: "bell", onClick: () => setActiveTab("whatsNew") },
          ].filter(Boolean)}
          statusItems={[
            { key: "privacy", icon: "community", label: "Child privacy", value: "Protected", detail: "Private by default" },
            { key: "scout", icon: "scout", label: "Scout fairness", value: "Current", detail: "No raw patterns" },
            { key: "meetup", icon: "store", label: "Meetups", value: "Public", detail: "No private child location" },
            { key: "proof", icon: "data", label: "Proof", value: "Required", detail: "Photos, receipts, records" },
            { key: "links", icon: "help", label: "External links", value: "Gated", detail: "Warning first" },
          ]}
          plan={{
            label: "Safety Plan",
            title: "Slow down, check proof, keep families protected",
            items: [
              { key: "care", icon: "vault", label: "Card care", detail: "Condition and storage" },
              { key: "trade", icon: "market", label: "Trade safety", detail: "Fairness and proof" },
              { key: "meet", icon: "store", label: "Safe meetup", detail: "Public locations only" },
              { key: "kids", icon: "community", label: "Kid context", detail: "Parent approval" },
            ],
            actions: [
              { label: "Open Nest", icon: "community", onClick: () => setActiveTab("parentCenter") },
              { label: "Report Issue", icon: "help", onClick: () => openFeedbackDialog("safety") },
            ],
          }}
          routes={[
            { key: "nest", icon: "community", label: "Nest", title: "Family controls", detail: "Approvals and permissions", action: () => setActiveTab("parentCenter") },
            { key: "scout", icon: "scout", label: "Scout", title: "Local intel", detail: "Privacy-safe reports", action: () => setActiveTab("scout") },
            { key: "exchange", icon: "market", label: "Exchange", title: "Trade and sell", detail: "Safety decisions", action: () => setActiveTab("exchange") },
            { key: "spark", icon: "spark", label: "Spark", title: "Family support", detail: "Kid-pack review", action: () => setActiveTab("kidsProgram") },
            { key: "archive", icon: "data", label: "Archive", title: "Proof records", detail: "Receipts and history", action: () => openUtilityPage("dataBackup") },
            { key: "help", icon: "help", label: "Help", title: "Support", detail: "Report and learn", action: () => openUtilityPage("help") },
          ]}
        >
          <CommandBoardSection
            className="trust-v4-guardrails"
            kicker="Privacy and safety"
            title="Family-first guardrails before growth"
            detail="Code 3 TCG keeps collecting useful without exposing private child details, harmful Scout patterns, or admin-only moderation data."
            action={<span className="status-badge">Protected</span>}
          >
            <div className="trust-v4-guardrail-grid">
              {trustSafetyRows.map((row) => (
                <article className="trust-v4-guardrail-card" key={row.title}>
                  <span>{row.status}</span>
                  <strong>{row.title}</strong>
                  <p>{row.body}</p>
                </article>
              ))}
            </div>
          </CommandBoardSection>

          <CommandBoardSection
            className="trust-v4-lantern"
            kicker="Lantern Safety Center"
            title="Practical safety tools, not vague warnings"
            detail="Lantern turns safety into checklists for card care, trades, scam prevention, selling, safe meetups, Scout privacy, external links, and kid or teen collecting."
            action={<span className="status-badge">Role-aware</span>}
          >
            <CommandMetricGrid className="trust-v4-lantern-metrics" items={lanternStats.map((stat) => ({ key: stat.label, label: stat.label, value: stat.value, detail: stat.helper }))} />
            <div className="trust-v4-pathway-grid" aria-label="Lantern learning paths">
              {lanternPathways.map((pathway) => (
                <article className="trust-v4-pathway-card" key={pathway.title}>
                  <span>{pathway.status}</span>
                  <strong>{pathway.title}</strong>
                  <p>{pathway.body}</p>
                </article>
              ))}
            </div>
          </CommandBoardSection>

          <div className="trust-v4-split-grid">
            <CommandBoardSection
              className="trust-v4-checklist"
              kicker="Before action"
              title="Safety checklist"
              detail="Use before trades, meetups, selling, external links, or child-sensitive actions."
              action={<span className="status-badge">Required friction</span>}
            >
              <div className="trust-v4-checklist-list">
                {lanternChecklist.map((item, index) => (
                  <article className="trust-v4-check-row" key={item}>
                    <span aria-hidden="true">{index + 1}</span>
                    <p>{item}</p>
                  </article>
                ))}
              </div>
            </CommandBoardSection>

            <CommandBoardSection
              className="trust-v4-risks"
              kicker="Risk prompts"
              title="Moments that need friction"
              detail="The interface should slow down unsafe actions instead of hiding risk in fine print."
              action={<span className="status-badge">Confidence honest</span>}
            >
              <div className="trust-v4-risk-grid">
                {lanternRiskRows.map((row) => (
                  <article className="trust-v4-risk-card" key={row.title}>
                    <span>{row.status}</span>
                    <strong>{row.title}</strong>
                    <p>{row.body}</p>
                  </article>
                ))}
              </div>
            </CommandBoardSection>
          </div>

          <CommandBoardSection
            className="trust-v4-meetup"
            kicker="Safe Meetup Center"
            title="Public places, proof, and parent approval"
            detail="Plan local trades or pickup only around public places, documented proof, and family approval rules."
            action={<span className="status-badge">No private locations</span>}
          >
            <div className="trust-v4-meetup-layout">
              <article className="trust-v4-map-card" aria-label="Safe meetup location options">
                <div className="trust-v4-map-visual" aria-hidden="true">
                  <span className="trust-v4-map-road trust-v4-map-road-a" />
                  <span className="trust-v4-map-road trust-v4-map-road-b" />
                  <span className="trust-v4-map-ring" />
                  <span className="trust-v4-map-pin trust-v4-map-pin-shop">Trusted shop</span>
                  <span className="trust-v4-map-pin trust-v4-map-pin-zone">Safe zone</span>
                  <span className="trust-v4-map-pin trust-v4-map-pin-event">Event</span>
                </div>
                <div className="trust-v4-proof-grid">
                  {safeMeetupProofRows.map((row) => (
                    <div key={row.label}>
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </div>
                  ))}
                </div>
              </article>

              <div className="trust-v4-meetup-list">
                {safeMeetupLocations.map((location) => (
                  <article className="trust-v4-meetup-card" key={location.title}>
                    <span>{location.status}</span>
                    <strong>{location.title}</strong>
                    <p>{location.body}</p>
                  </article>
                ))}
                <article className="trust-v4-meetup-warning">
                  <strong>External link gate</strong>
                  <p>Opening maps, shop pages, or off-app listings should show a warning before leaving Code 3 TCG.</p>
                </article>
              </div>
            </div>
          </CommandBoardSection>

          <div className="trust-v4-split-grid">
            <CommandBoardSection
              className="trust-v4-lessons"
              kicker="Learning modes"
              title="Same rules, different language by role"
              detail="Kid, teen, parent, and adult collector contexts need different copy without weakening the guardrails."
            >
              <div className="trust-v4-lesson-list">
                {lanternLessonRows.map((lesson) => (
                  <article className="trust-v4-lesson-card" key={lesson.title}>
                    <span>{lesson.status}</span>
                    <strong>{lesson.title}</strong>
                    <p>{lesson.body}</p>
                  </article>
                ))}
              </div>
            </CommandBoardSection>

            <CommandBoardSection
              className="trust-v4-routes"
              kicker="Safe routes"
              title="Move to the right protected surface"
              detail="Trust should guide the user into Nest, Scout, Exchange, or Spark at the right moment."
              action={<span className="status-badge">Connected</span>}
            >
              <div className="trust-v4-route-list">
                {lanternRouteRows.map((row) => (
                  <article className="trust-v4-route-card" key={row.title}>
                    <strong>{row.title}</strong>
                    <p>{row.body}</p>
                    <button type="button" className="command-board-v4-secondary-action" onClick={row.onClick}>{row.action}</button>
                  </article>
                ))}
              </div>
            </CommandBoardSection>
          </div>

          <CommandBoardSection
            className="trust-v4-records"
            kicker="Policies and guidelines"
            title="Privacy, terms, and community rules"
            detail="Read how your information is handled and the rules for participating in Code 3 TCG."
          >
            <div className="trust-v4-record-grid">
              {TRUST_PAGE_CONTENT.map((entry) => (
                <article className="trust-v4-record-card" key={entry.key}>
                  <strong>{entry.title}</strong>
                  <p>{entry.body}</p>
                </article>
              ))}
              <article className="trust-v4-record-card">
                <strong>Upload Safety</strong>
                <p>{UPLOAD_SAFETY_WARNING}</p>
              </article>
            </div>
            <footer className="trust-v4-legal-footer">
              <p>{BRAND_LEGAL_NOTICE}</p>
              <p>{POKEMON_AFFILIATION_NOTICE}</p>
            </footer>
          </CommandBoardSection>
        </CommandBoardV4>
        </details>
      </div>
    );
  }

  return renderTrustPages();
}
