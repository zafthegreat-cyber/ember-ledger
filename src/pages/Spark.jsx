import { CommandBoardV4, FlowNextActionCard } from "../components/command-system";
export default function SparkPage(props) {
  const {
    Field,
    accountEmail,
    betaReadinessData,
    donationTypeLabel,
    guestPreviewActive,
    kidsProgramForm,
    kidsProgramRequestStep,
    money,
    normalizeSparkEventSupportDraft,
    normalizeSparkKidPackDraft,
    openPublicBetaFeedback,
    openSparkEventSupportFlow,
    openSparkGiftFlow,
    openSparkKidPackFlow,
    setKidsProgramRequestStep,
    setSparkFlowView,
    shortDate,
    sparkEventPlans,
    sparkFlowView,
    sparkGifts,
    sparkKidPacks,
    sparkProgramStatusLabel,
    submitKidsProgramApplication,
    summarizeSparkEventSupportPlans,
    summarizeSparkGivingLedger,
    summarizeSparkKidPacks,
    updateKidsProgramField,
    user,
  } = props;

    const email = accountEmail();
    const activeApplication = (betaReadinessData.kidsApplications || []).find((entry) => {
      const entryUser = String(entry.userId || entry.user_id || "");
      const entryEmail = String(entry.email || "").toLowerCase();
      return (user?.id && entryUser === String(user.id)) || (email && entryEmail === email.toLowerCase());
    });
    const sparkSafetyRules = [
      "Parent-approved access only.",
      "No direct child messaging.",
      "Parent-approved trades only.",
      "No scalper pricing.",
      "Retail-first access when inventory allows.",
    ];
    const sparkSupportExamples = [
      "Cards",
      "Sealed products",
      "Packs",
      "Supplies",
      "Binders",
      "Sleeves",
      "Deck boxes",
      "Storage",
      "Playmats",
      "Toys/prizes",
      "Gift cards",
      "Event support",
      "Money/sponsorship pledges",
      "Services",
      "Volunteer time",
      "Food/snacks",
      "Shipping help",
      "Other family collecting support",
    ];
    const sparkMissionCards = [
      { key: "packs", icon: "Pack", title: "Kids packs", detail: "Reviewed starter packs." },
      { key: "access", icon: "Access", title: "Access support", detail: "Reviewed guardrails." },
      { key: "events", icon: "Meet", title: "Events", detail: "General-area family days." },
      { key: "learn", icon: "Learn", title: "Learning", detail: "Card care and fair trades." },
      { key: "donations", icon: "Track", title: "Donation tracking", detail: "Products, supplies, time, and support." },
      { key: "trusted-friends", icon: "Trust", title: "Trusted family friends", detail: "Approved helpers only." },
      { key: "shops", icon: "Shop", title: "Shop and seller support", detail: "Drop sites, events, and fair access." },
    ];
    const requestSteps = [
      "Child/family request",
      "Product wanted",
      "Parent contact",
      "Review rules",
      "Submit",
    ];
    const requestAccessSummary = kidsProgramForm.requestedAccess.length ? kidsProgramForm.requestedAccess.join(", ") : "Not selected yet";
    const scrollToSparkRequest = () => document.getElementById("spark-request-flow")?.scrollIntoView({ behavior: "smooth", block: "start" });
    const scrollToSparkRules = () => document.getElementById("spark-safety-rules")?.scrollIntoView({ behavior: "smooth", block: "start" });
    const scrollToSparkDetails = () => document.getElementById("spark-program-sections")?.scrollIntoView({ behavior: "smooth", block: "start" });
    const openSparkDonate = () => setSparkFlowView("donate");
    const openSparkThanks = () => setSparkFlowView("thank-you");
    const openSparkRequest = () => setSparkFlowView("request");
    const openSparkHome = () => setSparkFlowView("home");
    const sparkSupplyDonationTypes = new Set(["supplies", "binders", "sleeves", "deck_boxes", "storage", "playmats", "food_snacks", "shipping_help"]);
    const sparkImpactStories = [
      { title: "Starter packs for new collectors", body: "Preview story: kid-safe packs help families start without rush alerts, pressure, or resale-first energy." },
      { title: "Learning table support", body: "Sleeves, deck boxes, snacks, and volunteers can make family events calmer and easier to join." },
      { title: "Trusted shop help", body: "Shops and sellers can support drop-off days without creating a public rush feed or exact stock signal." },
    ];
    const sparkDonationCategories = [
      "Cards",
      "Sealed products",
      "Packs",
      "Binders",
      "Sleeves",
      "Deck boxes",
      "Playmats",
      "Toys/prizes",
      "Gift cards",
      "Money/sponsorship pledges",
      "Event support",
      "Food/snacks",
      "Shipping help",
      "Volunteer time",
      "Services",
      "Other family collecting support",
    ];
    const sparkGivingImpact = summarizeSparkGivingLedger(sparkGifts, { moneyFormatter: money });
    const recentSparkGifts = [...sparkGifts]
      .sort((a, b) => String(b.giftDate || b.createdAt || "").localeCompare(String(a.giftDate || a.createdAt || "")))
      .slice(0, 4);
    const sparkKidPackSummary = summarizeSparkKidPacks(sparkKidPacks, { moneyFormatter: money });
    const recentSparkKidPacks = [...sparkKidPacks]
      .sort((a, b) => String(b.dateCreated || b.giftedDate || b.createdAt || "").localeCompare(String(a.dateCreated || a.giftedDate || a.createdAt || "")))
      .slice(0, 4);
    const sparkEventSupportSummary = summarizeSparkEventSupportPlans(sparkEventPlans);
    const recentSparkEventPlans = [...sparkEventPlans]
      .map((plan) => ({ ...plan, ...normalizeSparkEventSupportDraft(plan) }))
      .sort((a, b) => String(b.eventDateText || b.createdAt || "").localeCompare(String(a.eventDateText || a.createdAt || "")))
      .slice(0, 4);
    const sparkSuppliesTracked = sparkGifts.filter((gift) => sparkSupplyDonationTypes.has(gift.donationType)).length;
    const sparkNeedsDetailsCount = [
      ...sparkKidPacks.filter((pack) => !String(pack.itemsPlanned || pack.packContents || "").trim()),
      ...sparkEventPlans.filter((plan) => !String(plan.suppliesNeeded || "").trim()),
    ].length;
    const sparkLocalActivityTotal = sparkKidPackSummary.totalPacks + sparkGivingImpact.totalGifts + sparkEventSupportSummary.totalEvents;
    const sparkDashboardSummaryCards = [
      { label: "Kid packs planned", value: sparkKidPackSummary.totalPacks, detail: sparkKidPackSummary.totalPacks ? "Local Kid Pack plans" : "Build a pack when ready", tone: "gold" },
      { label: "Gifts/support logged", value: sparkGivingImpact.totalGifts, detail: "Giving Ledger local entries", tone: "pink" },
      { label: "Supplies tracked", value: sparkSuppliesTracked, detail: "Sleeves, binders, storage, snacks, shipping help", tone: "gold" },
      { label: "Event support notes", value: sparkEventSupportSummary.totalEvents, detail: "Local beta event plans", tone: "pink" },
      { label: "Family impact preview", value: sparkLocalActivityTotal || "Ready", detail: sparkLocalActivityTotal ? "Local planning records only" : "No support fulfilled yet", tone: "gold" },
      { label: "Items still needed", value: sparkNeedsDetailsCount, detail: sparkNeedsDetailsCount ? "Add supplies or pack details" : "Planning details look filled in", tone: "pink" },
    ];
    const sparkDonationReviewSteps = [
      { label: "Details", title: "Support details", detail: "Type, quantity, value, and who it may help.", status: "Draft" },
      { label: "Proof", title: "Evidence saved", detail: "Photos, notes, receipts, or source context.", status: "Needed" },
      { label: "Review", title: "Parent/admin review", detail: "Safety, privacy, fairness, and suitability check.", status: "Protected" },
      { label: "Confirm", title: "Confirmation", detail: "Record impact only after review is complete.", status: "Queued" },
    ];
    const sparkProofCards = [
      {
        title: "Photos",
        detail: "Attach product, supply, condition, or drop-off photos before review.",
        status: recentSparkGifts.length ? "Add proof" : "Needed",
      },
      {
        title: "Receipt/source",
        detail: "Keep source notes for sealed product, gift cards, shipping help, or service support.",
        status: "Optional",
      },
      {
        title: "Impact note",
        detail: "Describe the family-safe purpose without naming or locating a child publicly.",
        status: sparkLocalActivityTotal ? "Active" : "Ready",
      },
      {
        title: "Review status",
        detail: "Nothing counts as fulfilled, tax-receipted, shipped, or public until reviewed.",
        status: "Admin first",
      },
    ];
    const sparkSupportRouteCards = [
      {
        title: "Item donation",
        detail: "Cards, packs, sealed product, binders, sleeves, storage, or prizes.",
        action: "Log a Gift",
        onClick: () => openSparkGiftFlow({ source: "spark-review-center" }),
      },
      {
        title: "Build kid packs",
        detail: "Turn reviewed support into starter, birthday, event, or family support packs.",
        action: "Build Pack",
        onClick: () => openSparkKidPackFlow({ source: "spark-review-center" }),
      },
      {
        title: "Event support",
        detail: "Plan snacks, volunteers, shop help, learning tables, and supplies.",
        action: "Add Event Support",
        onClick: () => openSparkEventSupportFlow({ source: "spark-review-center" }),
      },
    ];
    const sparkReviewStatusRows = [
      { label: "Payment", value: "Off", detail: "No checkout or in-app cash donation flow." },
      { label: "Privacy", value: "On", detail: "No public child profile, private address, or private messaging." },
      { label: "Receipt", value: "Later", detail: "Tax receipts need approved legal/payment structure first." },
    ];
    const renderSparkGiftRow = (gift) => (
      <article className="spark-gift-ledger-row" key={gift.id || `${gift.giftName}-${gift.createdAt}`}>
        <div>
          <span className="section-kicker">Spark Gift</span>
          <strong>{gift.giftName || "Spark Gift"}</strong>
          <small>{[donationTypeLabel(gift.donationType), gift.quantityAmount, gift.whoItHelps].filter(Boolean).join(" | ")}</small>
        </div>
        <div>
          <span>{gift.giftDate ? shortDate(gift.giftDate) : "Date saved"}</span>
          <strong>{Number(gift.estimatedValue || 0) > 0 ? money(gift.estimatedValue) : "No value saved"}</strong>
          <small>{gift.donorSponsorName || "Supporter optional"}</small>
        </div>
      </article>
    );
    const renderSparkKidPackRow = (pack) => {
      const normalizedPack = normalizeSparkKidPackDraft(pack);
      return (
        <article className={`spark-kid-pack-row status-${normalizedPack.packStatus.toLowerCase().replace(/\s+/g, "-")}`} key={pack.id || `${normalizedPack.packName}-${pack.createdAt}`}>
          <div>
            <span className="section-kicker">Kid Packs</span>
            <strong>{normalizedPack.packName || "Kid Pack"}</strong>
            <small>{[normalizedPack.packType, normalizedPack.packTheme, normalizedPack.childAgeRange, normalizedPack.themeInterests, normalizedPack.intendedRecipientGroup].filter(Boolean).join(" | ")}</small>
            {normalizedPack.itemsPlanned ? <small>Items planned: {normalizedPack.itemsPlanned}</small> : <small>Items planned can be added later.</small>}
          </div>
          <div>
            <span>{normalizedPack.giftedDate ? `Gifted ${shortDate(normalizedPack.giftedDate)}` : normalizedPack.dateCreated ? shortDate(normalizedPack.dateCreated) : "Date saved"}</span>
            <strong>{normalizedPack.packStatus}</strong>
            <small>{Number(normalizedPack.estimatedValue || 0) > 0 ? money(normalizedPack.estimatedValue) : "No value saved"}</small>
          </div>
        </article>
      );
    };
    const renderSparkEventSupportRow = (plan) => {
      const normalizedPlan = normalizeSparkEventSupportDraft(plan);
      return (
        <article className={`spark-event-support-row status-${normalizedPlan.eventStatus.toLowerCase()}`} key={plan.id || `${normalizedPlan.eventName}-${plan.createdAt}`}>
          <div>
            <span className="section-kicker">Event Support Planner</span>
            <strong>{normalizedPlan.eventName || "Spark event plan"}</strong>
            <small>{[normalizedPlan.eventDateText, normalizedPlan.expectedKidsFamilies].filter(Boolean).join(" | ") || "Date and group can be added later"}</small>
            <small>{normalizedPlan.suppliesNeeded ? `Supplies: ${normalizedPlan.suppliesNeeded}` : "Supplies needed can be added later."}</small>
          </div>
          <div>
            <span>Local beta</span>
            <strong>{normalizedPlan.eventStatus}</strong>
            <small>No payment, fulfillment, shipping, or tax receipt</small>
          </div>
        </article>
      );
    };
    const renderSparkV4Board = ({ mode = "home", title = "Spark Impact Center", description, children } = {}) => (
      <div className={`spark-command-only-route spark-command-only-route-${mode}`} aria-label="The Spark impact command center">
        <CommandBoardV4
          accent="spark"
          className="spark-command-board"
          ariaLabel="Spark Impact Center"
          label="The Spark"
          title={title}
          description={description || "Parent-managed access support, kid-pack planning, donations, proof, and family-safe event help. No direct child messaging, public child profiles, or payment processing."}
          primaryAction={{
            label: activeApplication ? "View Status" : "Request Access",
            icon: "spark",
            onClick: openSparkRequest,
          }}
          secondaryActions={[
            { label: "Support Review", icon: "plan", onClick: openSparkDonate },
            { label: "Safety Rules", icon: "help", onClick: openSparkRequest },
          ]}
          statusItems={[
            {
              key: "access",
              icon: "community",
              label: "Access review",
              value: activeApplication ? sparkProgramStatusLabel(activeApplication.status || "interest_submitted") : "Private",
              detail: "Parent-managed",
            },
            {
              key: "packs",
              icon: "spark",
              label: "Kid packs",
              value: sparkKidPackSummary.totalPacks || "Ready",
              detail: "Reviewed plans",
            },
            {
              key: "support",
              icon: "data",
              label: "Support logged",
              value: sparkGivingImpact.totalGifts,
              detail: "Local beta records",
            },
            {
              key: "events",
              icon: "calendar",
              label: "Event support",
              value: sparkEventSupportSummary.totalEvents,
              detail: "General area only",
            },
            {
              key: "payments",
              icon: "help",
              label: "Payments",
              value: "Off",
              detail: "No checkout",
            },
          ]}
          plan={{
            label: "Spark Plan",
            title: "Support families with privacy, review, and proof first",
            items: [
              { key: "request", icon: "community", label: "Request access", detail: "Parent or guardian", action: openSparkRequest },
              { key: "donate", icon: "spark", label: "Support review", detail: "No payment processed", action: openSparkDonate },
              { key: "packs", icon: "vault", label: "Kid packs", detail: "Inventory reviewed", action: scrollToSparkDetails },
              { key: "rules", icon: "help", label: "Safety rules", detail: "No child exposure", action: openSparkRequest },
            ],
            actions: [
              { label: mode === "home" ? "Open Review" : "Back to Spark", icon: "spark", onClick: mode === "home" ? openSparkDonate : openSparkHome },
              { label: "Sponsor Interest", icon: "plan", onClick: () => openPublicBetaFeedback({ page: "The Spark", role: "Sponsor / Donor", mainReason: "Sponsor / donate to The Spark", interests: ["The Spark kids program"] }) },
            ],
          }}
          routes={[
            { key: "spark", icon: "spark", label: "Spark", title: "Impact", detail: "Access and support", action: scrollToSparkDetails },
            { key: "donation", icon: "plus", label: "Donation", title: "Review flow", detail: "Items and time", action: openSparkDonate },
            { key: "packs", icon: "vault", label: "Packs", title: "Pack Builder", detail: "Kid-pack plans", action: scrollToSparkDetails },
            { key: "events", icon: "calendar", label: "Events", title: "Family days", detail: "General area", action: scrollToSparkDetails },
            { key: "lantern", icon: "help", label: "Lantern", title: "Safety rules", detail: "Child-safe support", action: scrollToSparkRules },
            { key: "feedback", icon: "bell", label: "Interest", title: "Sponsor queue", detail: "Admin reviewed", action: () => openPublicBetaFeedback({ page: "The Spark", role: "Sponsor / Donor", mainReason: "Sponsor / donate to The Spark", interests: ["The Spark kids program"] }) },
          ]}
        >
          {children}
        </CommandBoardV4>
      </div>
    );

    const sparkV4SupportTiles = [
      { label: "Log a Gift", value: sparkGivingImpact.totalGifts || "Ready", detail: "Cards, packs, binders, supplies", action: () => openSparkGiftFlow({ source: "spark-v4-support" }) },
      { label: "Kid packs", value: sparkKidPackSummary.totalPacks || "Ready", detail: "Starter, event, birthday, support", action: () => openSparkKidPackFlow({ source: "spark-v4-pack" }) },
      { label: "Plan Event Support", value: sparkEventSupportSummary.totalEvents || "Ready", detail: "Volunteers, shops, supplies", action: () => openSparkEventSupportFlow({ source: "spark-v4-event" }) },
      { label: "Sponsor interest", value: "Review", detail: "Admin-reviewed support queue", action: () => openPublicBetaFeedback({ page: "The Spark", role: "Sponsor / Donor", mainReason: "Sponsor / donate to The Spark", interests: ["The Spark kids program", "Shop partnership"] }) },
    ];

    const renderSparkV4ImpactPanel = () => (
      <section className="spark-v4-impact-panel" aria-label="Spark Impact Summary">
        <div className="spark-v4-panel-heading">
          <div>
            <span>Impact command</span>
            <h2>Spark Impact Summary</h2>
            <p>Track support intent, review status, evidence, and family-safe next steps without turning Spark into a public child directory or payment flow.</p>
          </div>
          <strong>{sparkLocalActivityTotal || "Ready"}</strong>
        </div>
        <div className="spark-v4-impact-grid" aria-label="The Spark impact stats">
          {sparkDashboardSummaryCards.slice(0, 6).map((stat) => (
            <article key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.detail}</small>
            </article>
          ))}
        </div>
        <div className="spark-v4-category-rack" aria-label="The Spark support categories">
          {sparkSupportExamples.slice(0, 12).map((category) => <span key={category}>{category}</span>)}
        </div>
      </section>
    );

    const renderSparkV4ReviewPanel = () => (
      <section className="spark-v4-review-panel" aria-label="Spark Support Review Center">
        <div className="spark-v4-panel-heading compact">
          <div>
            <span>Review first</span>
            <h3>Spark Support Review Center</h3>
            <p>Details, proof, review, and confirmation stay visible before any support is counted as impact.</p>
          </div>
          <button type="button" onClick={openSparkDonate}>Open Review</button>
        </div>
        <div className="spark-v4-stepper" aria-label="Spark donation review steps">
          {sparkDonationReviewSteps.map((step, index) => (
            <article key={step.label}>
              <span>{index + 1}</span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.title}</small>
              </div>
              <em>{step.status}</em>
            </article>
          ))}
        </div>
        <div className="spark-v4-proof-grid" aria-label="Spark proof and evidence">
          {sparkProofCards.map((card) => (
            <article key={card.title}>
              <strong>{card.title}</strong>
              <p>{card.detail}</p>
              <small>{card.status}</small>
            </article>
          ))}
        </div>
      </section>
    );

    const renderSparkV4SideRail = () => (
      <aside className="spark-v4-side-rail" aria-label="Spark safety and support rail">
        <FlowNextActionCard
          eyebrow="Next Spark action"
          title="Pick one reviewed support step."
          detail="Build a kid pack, log a gift, or plan event support. Spark records intent and evidence only until review is complete. No payment, fulfillment, shipping, or private child messaging is connected."
          tone="spark"
          actions={[
            { label: "Build a Kid Pack", onClick: () => openSparkKidPackFlow({ source: "spark-v4-next-action" }) },
            { label: "Log a Gift", onClick: () => openSparkGiftFlow({ source: "spark-v4-next-action" }) },
          ]}
        />
        <article>
          <span>Family access</span>
          <h3>{activeApplication ? "Request is private" : "No request yet"}</h3>
          <p>{activeApplication ? `Status: ${sparkProgramStatusLabel(activeApplication.status || "interest_submitted")}.` : "A parent or guardian can start an access request when ready."}</p>
              <button type="button" onClick={openSparkRequest}>{activeApplication ? "View Status" : "Request Access"}</button>
        </article>
        <article>
          <span>Guardrails</span>
          <div className="spark-v4-rule-list">
            {sparkSafetyRules.slice(0, 5).map((rule) => <small key={rule}>{rule}</small>)}
          </div>
        </article>
      </aside>
    );

    const renderSparkV4HomePage = (mode = "home") => renderSparkV4Board({
      mode,
      title: mode === "request" ? "Spark Family Access" : "Spark Impact Center",
      description: mode === "request"
        ? "A private parent-managed request with clear safety rules, minimum necessary information, and human review before access changes."
        : undefined,
      children: (
        <div className="spark-v4-command-content">
          <div className="spark-v4-main-stack">
            {renderSparkV4ImpactPanel()}
            {renderSparkV4ReviewPanel()}
          </div>
          {renderSparkV4SideRail()}
          <section className="spark-v4-support-grid" aria-label="Spark support routes">
            {sparkV4SupportTiles.map((tile) => (
              <button type="button" key={tile.label} onClick={tile.action}>
                <span>{tile.label}</span>
                <strong>{tile.value}</strong>
                <small>{tile.detail}</small>
              </button>
            ))}
          </section>
          <section className="spark-v4-activity-panel" aria-label="Spark activity ledger">
            <div className="spark-v4-panel-heading compact">
              <div>
                <span>Records and proof</span>
                <h3>Spark Activity Ledger</h3>
                <p>Recent kid packs, support gifts, and event support plans stay visible as review records after they are saved locally.</p>
              </div>
            </div>
            <div className="spark-v4-activity-grid">
              <article>
                <strong>Kid Packs</strong>
                <div className="spark-v4-record-list">
                  {recentSparkKidPacks.length ? recentSparkKidPacks.map(renderSparkKidPackRow) : <small>No kid packs planned yet.</small>}
                </div>
              </article>
              <article>
                <strong>Giving Ledger</strong>
                <div className="spark-v4-record-list">
                  {recentSparkGifts.length ? recentSparkGifts.map(renderSparkGiftRow) : <small>No Spark Gifts logged yet.</small>}
                </div>
              </article>
              <article>
                <strong>Event Support Planner</strong>
                <div className="spark-v4-record-list">
                  {recentSparkEventPlans.length ? recentSparkEventPlans.map(renderSparkEventSupportRow) : <small>No Event Support plans yet.</small>}
                </div>
              </article>
            </div>
          </section>
          <section id="spark-program-sections" className="spark-v4-program-panel" aria-label="What Spark Impact supports">
            <div className="spark-v4-panel-heading compact">
              <div>
                <span>Mission areas</span>
                <h3>What Spark Impact supports</h3>
                <p>Kid packs, access support, learning, trusted helpers, events, and donation tracking stay parent-safe and review-led.</p>
              </div>
            </div>
            <div className="spark-v4-mission-grid">
              {sparkMissionCards.slice(0, 6).map((section) => (
                <article key={section.key}>
                  <strong>{section.title}</strong>
                  <p>{section.detail}</p>
                </article>
              ))}
            </div>
          </section>
          <section id="spark-safety-rules" className="spark-v4-safety-panel" aria-label="Kids Program safety rules">
            <div className="spark-v4-panel-heading compact">
              <div>
                <span>Safety rules</span>
                <h3>Parent-safe by design</h3>
                <p>These rules apply before any request, support record, event, reward, or trade can move forward.</p>
              </div>
              <button type="button" onClick={openSparkDonate}>Support Review</button>
            </div>
            <div className="spark-v4-rule-grid">
              {sparkSafetyRules.map((rule) => <article key={rule}><strong>{rule}</strong></article>)}
            </div>
          </section>
          <form id="spark-request-flow" className="spark-v4-request-panel" onSubmit={submitKidsProgramApplication} noValidate>
            <div className="spark-v4-panel-heading compact">
              <div>
                <span>Parent request</span>
                <h3>Request The Spark access</h3>
                <p>Step {kidsProgramRequestStep} of 5: {requestSteps[kidsProgramRequestStep - 1]}</p>
              </div>
              <strong>{requestAccessSummary}</strong>
            </div>
            <div className="spark-v4-stepper compact" aria-label="Kids request steps">
              {requestSteps.map((step, index) => {
                const stepNumber = index + 1;
                return (
                  <button
                    key={step}
                    type="button"
                    className={kidsProgramRequestStep === stepNumber ? "active" : ""}
                    aria-pressed={kidsProgramRequestStep === stepNumber}
                    onClick={() => setKidsProgramRequestStep(stepNumber)}
                  >
                    <span>{stepNumber}</span>
                    <strong>{step}</strong>
                  </button>
                );
              })}
            </div>
            <div className="spark-v4-form-grid">
              <Field label="Parent/guardian name">
                <input value={kidsProgramForm.parentName} onChange={(event) => updateKidsProgramField("parentName", event.target.value)} placeholder="Parent or guardian" />
              </Field>
              <Field label="Parent email">
                <input type="email" value={kidsProgramForm.email || email} onChange={(event) => updateKidsProgramField("email", event.target.value)} placeholder="you@example.com" />
              </Field>
              <Field label="Home ZIP private">
                <input value={kidsProgramForm.zipCode} onChange={(event) => updateKidsProgramField("zipCode", event.target.value)} inputMode="numeric" />
              </Field>
              <Field label="Child age range">
                <select value={kidsProgramForm.childAgeRange} onChange={(event) => updateKidsProgramField("childAgeRange", event.target.value)}>
                  <option value="">Choose range</option>
                  <option value="under_6">Under 6</option>
                  <option value="6_8">6-8</option>
                  <option value="9_12">9-12</option>
                  <option value="13_17">13-17</option>
                </select>
              </Field>
            </div>
            <Field label="What would help them collect safely?">
              <textarea value={kidsProgramForm.collectingInterest} onChange={(event) => updateKidsProgramField("collectingInterest", event.target.value)} placeholder="Cards, binder, starter deck, learning event, safe trading help..." />
            </Field>
            <div className="spark-v4-request-actions">
              <label>
                <input type="checkbox" checked={kidsProgramForm.agreesNoResale} onChange={(event) => updateKidsProgramField("agreesNoResale", event.target.checked)} />
                <span>Items are intended for children and families, not resale.</span>
              </label>
              <label>
                <input type="checkbox" checked={kidsProgramForm.consentContact} onChange={(event) => updateKidsProgramField("consentContact", event.target.checked)} />
                <span>Parent/guardian agrees to be contacted for review.</span>
              </label>
              <button type="submit">{guestPreviewActive ? "Create account to apply" : "Submit request"}</button>
            </div>
          </form>
        </div>
      ),
    });

    const renderSparkV4DonatePage = () => renderSparkV4Board({
      mode: "donate",
      title: "Spark Support Review",
      description: "A reviewed support-intent flow for item donations, volunteer help, sponsor interest, proof, and safe family impact. No payment or receipt backend is connected here.",
      children: (
        <div className="spark-v4-command-content spark-v4-command-content-donate">
          <div className="spark-v4-main-stack">
            {renderSparkV4ReviewPanel()}
            <section className="spark-v4-donation-panel" aria-label="Donation categories">
              <div className="spark-v4-panel-heading compact">
                <div>
                  <span>Support categories</span>
                  <h3>What can be reviewed</h3>
                  <p>Cards, sealed product, supplies, prizes, gift cards, event support, volunteer time, services, and shipping help can be logged as reviewed support interest.</p>
                </div>
                <button type="button" onClick={openSparkThanks}>Preview Submit</button>
              </div>
              <div className="spark-v4-category-rack large">
                {sparkDonationCategories.map((category) => <span key={category}>{category}</span>)}
              </div>
            </section>
          </div>
          {renderSparkV4SideRail()}
        </div>
      ),
    });

    const renderSparkV4ThankYouPage = () => renderSparkV4Board({
      mode: "thank-you",
      title: "Support Interest Queued",
      description: "Your Spark support preview is queued for review before it counts toward impact. Nothing is charged, posted, shipped, or fulfilled from this screen.",
      children: (
        <div className="spark-v4-command-content spark-v4-command-content-thanks">
          <section className="spark-v4-confirmation-panel" aria-label="Spark support confirmation">
            <div className="spark-v4-panel-heading">
              <div>
                <span>Queued for review</span>
                <h2>Support interest queued for review.</h2>
                <p>Review protects families, children, helpers, shops, and sponsors before support becomes part of Spark Impact.</p>
              </div>
              <strong>Queued</strong>
            </div>
            <div className="spark-v4-confirmation-grid">
              {sparkImpactStories.map((story) => (
                <article key={story.title}>
                  <strong>{story.title}</strong>
                  <p>{story.body}</p>
                </article>
              ))}
            </div>
            <div className="spark-v4-stepper">
              {sparkDonationReviewSteps.map((step, index) => (
                <article className={index === 0 ? "active" : ""} key={step.label}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{index === 0 ? "Queued" : step.label}</strong>
                    <small>{step.detail}</small>
                  </div>
                  <em>{index === 0 ? "Active" : step.status}</em>
                </article>
              ))}
            </div>
            <div className="spark-v4-request-actions">
              <button type="button" onClick={openSparkHome}>View Impact</button>
              <button type="button" onClick={openSparkDonate}>Add Another Support Preview</button>
            </div>
          </section>
          {renderSparkV4SideRail()}
        </div>
      ),
    });

    if (sparkFlowView === "donate") return renderSparkV4DonatePage();
    if (sparkFlowView === "thank-you") return renderSparkV4ThankYouPage();
    if (sparkFlowView === "request") return renderSparkV4HomePage("request");
    return renderSparkV4HomePage();
  }
