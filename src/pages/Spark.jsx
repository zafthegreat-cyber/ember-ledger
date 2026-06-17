import { BRAND_ASSETS } from "../brand/emberTideBrand";
import {
  EtMockupActionCard,
  EtMockupButton,
  EtMockupEmptyState,
  EtMockupHero,
  EtMockupPageShell,
  EtMockupPill,
  EtMockupRightRail,
  EtMockupSectionCard,
  EtMockupStatCard,
  FlowNextActionCard,
} from "../components/command-system";
export default function SparkPage(props) {
  const {
    DetailItem,
    Field,
    KIDS_PROGRAM_ACCESS_OPTIONS,
    SPARK_GIVING_DONATION_TYPES,
    SPARK_KID_PACK_TYPES,
    accountEmail,
    adminToolsVisible,
    betaReadinessData,
    donationTypeLabel,
    guestPreviewActive,
    kidsProgramForm,
    kidsProgramRequestStep,
    money,
    normalizeSparkEventSupportDraft,
    normalizeSparkKidPackDraft,
    openPokemonWatchCalendar,
    openPublicBetaFeedback,
    openSparkEventSupportFlow,
    openSparkGiftFlow,
    openSparkKidPackFlow,
    phase2KidProjectItemCounts,
    phase2RecentKidProjects,
    renderCollectorEventPlannerSection,
    renderUpgradeValuePreview,
    runKidsProgramAiAssist,
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
    toggleArrayValue,
    updateKidsProgramField,
    user,
  } = props;

    const email = accountEmail();
    const activeApplication = (betaReadinessData.kidsApplications || []).find((entry) => {
      const entryUser = String(entry.userId || entry.user_id || "");
      const entryEmail = String(entry.email || "").toLowerCase();
      return (user?.id && entryUser === String(user.id)) || (email && entryEmail === email.toLowerCase());
    });
    const safeKidProgramProjects = phase2RecentKidProjects
      .filter((project) => adminToolsVisible || String(project.status || "planning").toLowerCase() !== "archived")
      .slice(0, 4);
    const kidProgramProjectCount = safeKidProgramProjects.length;
    const kidProgramTargetPacks = safeKidProgramProjects.reduce((sum, project) => sum + Number(project.targetPackCount || 0), 0);
    const kidProgramEventCards = safeKidProgramProjects.filter((project) => project.eventDate).slice(0, 3);
    const kidProgramScheduledEvents = kidProgramEventCards.length;
    const sparkSafetyRules = [
      "Parent-approved access only.",
      "No private child messaging.",
      "Parent-approved trades only.",
      "No scalper pricing.",
      "Retail-first access when inventory allows.",
    ];
    const sparkProgramCards = [
      { key: "packs", icon: "✦", title: "Kids Packs", detail: "Fair starter packs." },
      { key: "giveaways", icon: "★", title: "Giveaways", detail: "Family-friendly chances." },
      { key: "events", icon: "◌", title: "Events", detail: "General-area events." },
      { key: "learn", icon: "◇", title: "Learn & Grow", detail: "Kind collecting tips." },
    ];
    const sparkLearningCards = [
      "Card care basics",
      "Trading kindly",
      "Set collecting",
      "How to spot fair prices",
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
      { key: "giveaways", icon: "Give", title: "Giveaways", detail: "Family-friendly guardrails." },
      { key: "events", icon: "Meet", title: "Events", detail: "General-area family days." },
      { key: "learn", icon: "Learn", title: "Learning", detail: "Card care and fair trades." },
      { key: "donations", icon: "Track", title: "Donation tracking", detail: "Products, supplies, time, and support." },
      { key: "trusted-friends", icon: "Trust", title: "Trusted family friends", detail: "Approved helpers only." },
      { key: "shops", icon: "Shop", title: "Shop and seller support", detail: "Drop sites, events, and fair access." },
    ];
    const sparkDonationGroups = [
      { title: "Cards and products", items: ["Cards", "Sealed products", "Packs"] },
      { title: "Collecting supplies", items: ["Binders", "Sleeves", "Deck boxes", "Storage", "Playmats"] },
      { title: "Event support", items: ["Toys/prizes", "Gift cards", "Food/snacks", "Event support"] },
      { title: "Mission support", items: ["Money/sponsorship pledges", "Services", "Volunteer time", "Shipping help", "Other family collecting support"] },
    ];
    const sparkParticipationCards = [
      {
        title: "Families",
        detail: "Request access, share collecting needs, and participate through parent-managed reviews.",
        badge: activeApplication ? sparkProgramStatusLabel(activeApplication.status || "interest_submitted") : "Parent managed",
      },
      {
        title: "Trusted family friends",
        detail: "Approved helpers can support safe packs, learning, events, and donation prep without private child messaging.",
        badge: "Trusted helpers",
      },
      {
        title: "Shops and sellers",
        detail: "Partners can help with drop-off sites, Learn to Play days, fair access, sponsorships, or reviewed support records.",
        badge: "Partner-ready",
      },
    ];
    const sparkSections = [
      {
        key: "parent-requests",
        title: "Request status",
        value: activeApplication ? sparkProgramStatusLabel(activeApplication.status || "interest_submitted") : "Not requested",
        detail: activeApplication ? "Your family request is private and waiting for review." : "A parent or guardian can start when ready.",
      },
      { key: "packs", title: "Kids packs", value: kidProgramTargetPacks ? `${kidProgramTargetPacks} planned` : "Warming up", detail: "Inventory-limited and reviewed for fair access." },
      { key: "events", title: "Events", value: kidProgramScheduledEvents ? `${kidProgramScheduledEvents} scheduled` : "Coming soon", detail: "General area only. No private addresses." },
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
    const sparkImpactMilestones = [
      { title: "Build safe starter packs", detail: "Cards, sleeves, and deck boxes are reviewed before they count toward impact." },
      { title: "Support local family days", detail: "Event help stays general-area only and avoids private child or home details." },
      { title: "Thank helpers clearly", detail: "Sponsors and shops can express interest, then wait for review before anything goes public." },
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
    const renderSparkHero = () => (
      <div className="spark-mockup-header">
        <EtMockupHero
          brand="The Spark"
          mark={BRAND_ASSETS.mark}
          title="Igniting the spark within kids and families."
          detail="Parent-managed support for kids packs, learning, safe events, and fair collecting help. No private child messaging."
          points={{ value: "Preview", label: "Public Beta" }}
          pills={[
            { label: "Parent managed", tone: "collector" },
            { label: "Admin reviewed", tone: "beta" },
            { label: "No payment processed", tone: "gold" },
          ]}
          todayAction={{
            label: sparkFlowView === "home" ? "Mission" : "Support preview",
            title: sparkFlowView === "home" ? "Help a kid collect safely." : "Nothing is charged, posted, or processed here.",
            cta: sparkFlowView === "home" ? "Help The Spark" : "Back to The Spark",
            onClick: sparkFlowView === "home"
              ? () => openPublicBetaFeedback({ page: "The Spark", role: "Sponsor / Donor", mainReason: "Sponsor / donate to The Spark", interests: ["The Spark kids program"] })
              : openSparkHome,
          }}
          adminAction={sparkFlowView === "home" ? (
            <EtMockupButton onClick={openSparkDonate}>Donate / support preview</EtMockupButton>
          ) : (
            <EtMockupButton variant="secondary" onClick={openSparkHome}>Back to The Spark</EtMockupButton>
          )}
          ariaLabel="The Spark mission"
        />
        <div className="spark-header-mission-line spark-mockup-mission-note">
          Helping families keep collecting fun, fair, and kid-friendly. Parent-safe requests. No private child messaging.
        </div>
      </div>
    );
    const renderSparkDonatePage = () => (
      <EtMockupPageShell
        accent="spark"
        className="spark-mockup-rebuild spark-mockup-donate"
        ariaLabel="The Spark support preview"
      >
        <div className="et-mockup-main-column spark-mockup-main">
          {renderSparkHero()}
          <EtMockupSectionCard
            title="Donate to The Spark."
            detail="This is a public beta support preview. No payment is processed, no checkout opens, and no donation backend is connected here."
            className="spark-donate-panel spark-mockup-support-panel"
            action={<EtMockupPill tone="beta">Preview only</EtMockupPill>}
          >
            <div className="spark-impact-meter" aria-label="The Spark impact progress">
              <span><b>68%</b> toward this month&apos;s preview kid-pack goal</span>
              <i><em style={{ width: "68%" }} /></i>
            </div>
            <div className="spark-donate-category-grid" aria-label="Donation categories">
              {sparkDonationCategories.map((category) => <span key={category} className="spark-donate-category">{category}</span>)}
            </div>
            <div className="spark-sponsor-card">
              <strong>Shop / sponsor support</strong>
              <p>Trusted shops, sponsors, and volunteers can help with drop-off days, supplies, learning tables, shipping help, or service support after review.</p>
              <EtMockupButton variant="secondary" onClick={() => openPublicBetaFeedback({ page: "The Spark Donate", role: "Sponsor / Donor", mainReason: "Sponsor / donate to The Spark", interests: ["The Spark kids program", "Shop partnership"] })}>Share sponsor interest</EtMockupButton>
            </div>
            <div className="spark-flow-actions">
              <EtMockupButton onClick={openSparkThanks}>Preview support review</EtMockupButton>
              <EtMockupButton variant="secondary" onClick={openSparkHome}>Back to The Spark</EtMockupButton>
            </div>
          </EtMockupSectionCard>
        </div>
        <EtMockupRightRail
          title="Parent-safe support"
          detail="Support interest is reviewed before anything becomes public or counts toward impact."
          className="spark-mockup-rail"
        >
          <div className="et-mockup-action-stack">
            {sparkImpactMilestones.map((milestone) => (
              <EtMockupActionCard
                key={milestone.title}
                title={milestone.title}
                detail={milestone.detail}
                icon="spark"
                tone="gold"
              />
            ))}
          </div>
          <EtMockupEmptyState
            title="No payment processed."
            detail="The Spark support flow is preview-only until reviewed backend support exists."
            action={<EtMockupButton variant="secondary" onClick={openSparkHome}>Return to mission</EtMockupButton>}
          />
        </EtMockupRightRail>
      </EtMockupPageShell>
    );
    const renderSparkThankYouPage = () => (
      <EtMockupPageShell
        accent="spark"
        className="spark-mockup-rebuild spark-mockup-thanks"
        ariaLabel="The Spark thank you preview"
      >
        <div className="et-mockup-main-column spark-mockup-main">
          {renderSparkHero()}
          <EtMockupSectionCard
            title="Thank you - support interest queued for preview review."
            detail="Your support preview is queued for review before it would count toward The Spark impact. Nothing is charged, posted, or processed here."
            className="spark-thank-you-panel"
            action={<EtMockupPill tone="beta">Queued for review</EtMockupPill>}
          >
            <div className="spark-thank-you-orb" aria-hidden="true"><span /></div>
            <div className="spark-impact-story-grid" aria-label="Spark impact story">
              {sparkImpactStories.map((story) => (
                <article className="spark-impact-story-card" key={story.title}>
                  <strong>{story.title}</strong>
                  <p>{story.body}</p>
                </article>
              ))}
            </div>
            <div className="spark-flow-actions">
              <EtMockupButton onClick={openSparkHome}>View impact</EtMockupButton>
              <EtMockupButton variant="secondary" onClick={openSparkDonate}>Add another support preview</EtMockupButton>
            </div>
          </EtMockupSectionCard>
        </div>
        <EtMockupRightRail
          title="What stays safe"
          detail="The Spark remains parent-managed, admin-reviewed, and preview-only."
          className="spark-mockup-rail"
        >
          <div className="et-mockup-action-stack">
            {["No payment processed", "No private child messaging", "Admin-reviewed requests"].map((point) => (
              <EtMockupActionCard key={point} title={point} detail="Guardrail stays visible in public beta." icon="spark" tone="gold" />
            ))}
          </div>
        </EtMockupRightRail>
      </EtMockupPageShell>
    );
    if (sparkFlowView === "donate") return renderSparkDonatePage();
    if (sparkFlowView === "thank-you") return renderSparkThankYouPage();
    return (
      <EtMockupPageShell
        accent="spark"
        className="spark-mockup-rebuild"
        ariaLabel="The Spark family support page"
      >
        <div className="et-mockup-main-column spark-mockup-main">
        {renderSparkHero()}

        <EtMockupSectionCard
          title="Collecting support for kids and families."
          detail="Igniting the spark within them through kids packs, giveaways, family-friendly events, learning, donations, and trusted community help that stays safe, fair, and parent-managed."
          className="spark-mission-card spark-mockup-mission-card"
          action={<EtMockupPill tone="collector">Mission centered</EtMockupPill>}
        >
          <div className="spark-mission-orb" aria-hidden="true">
            <span />
          </div>
          <div className="spark-mission-copy">
            <p className="section-kicker">The Spark mission</p>
            <h2>Collecting support for kids and families.</h2>
            <p>Igniting the spark within them through kids packs, giveaways, family-friendly events, learning, donations, and trusted community help that stays safe, fair, and parent-managed.</p>
            <div className="spark-mission-facts" aria-label="The Spark guardrails">
              <span>Parent-managed</span>
              <span>Admin-reviewed</span>
              <span>Mission-centered</span>
            </div>
          </div>
          <button
            type="button"
            className="hearth-primary-cta spark-primary-cta"
            onClick={activeApplication ? scrollToSparkDetails : scrollToSparkRequest}
          >
            {activeApplication ? "View status" : "Request access"}
          </button>
          <button type="button" className="secondary-button spark-secondary-cta" onClick={openSparkDonate}>Donate / support</button>
        </EtMockupSectionCard>

        <EtMockupSectionCard
          title="Spark Family Program Summary"
          detail="Local-only planning signals for Kid Packs, Giving Ledger support, supplies, event notes, and family impact preview. Nothing here processes payment, fulfillment, shipping, or tax receipts."
          className="spark-impact-dashboard spark-mockup-impact-card"
          ariaLabel="The Spark impact preview"
          action={<EtMockupPill tone="gold">Local beta only</EtMockupPill>}
        >
          <div className="et-mockup-stat-grid spark-impact-stat-grid" aria-label="The Spark impact stats">
            {sparkDashboardSummaryCards.map((stat) => (
              <EtMockupStatCard key={stat.label} label={stat.label} value={stat.value} detail={stat.detail} tone={stat.tone} />
            ))}
          </div>
          <div className="spark-gift-type-cloud spark-program-support-cloud" aria-label="The Spark support categories">
            {sparkSupportExamples.map((category) => <span key={category}>{category}</span>)}
          </div>
          <div className="spark-impact-milestone-grid">
            {sparkImpactMilestones.map((milestone) => (
              <article className="spark-impact-milestone-card" key={milestone.title}>
                <strong>{milestone.title}</strong>
                <p>{milestone.detail}</p>
              </article>
            ))}
          </div>
        </EtMockupSectionCard>

        <FlowNextActionCard
          eyebrow="Next Spark action"
          title="Pick one safe family-support step."
          detail="The Spark stays local beta here: planning, notes, and support memories only. No payment, fulfillment, shipping, or private child messaging is connected."
          tone="spark"
          actions={[
            { label: "Build a Kid Pack", onClick: () => openSparkKidPackFlow({ source: "spark-next-action" }) },
            { label: "Log a Gift", onClick: () => openSparkGiftFlow({ source: "spark-next-action" }) },
            { label: "Plan Event Support", onClick: () => openSparkEventSupportFlow({ source: "spark-next-action" }) },
          ]}
        />

        <EtMockupSectionCard
          title="Kid Packs"
          detail="Plan simple, family-safe packs for new collectors, birthdays, events, thank-yous, or families who need support."
          className="spark-kid-packs-card"
          ariaLabel="The Spark Kid Packs"
          action={<EtMockupButton onClick={() => openSparkKidPackFlow({ source: "spark-kid-packs" })}>Build a Kid Pack</EtMockupButton>}
        >
          <div className="spark-kid-pack-helper-card">
            <strong>Pack Builder</strong>
            <span>Plan what goes inside, who it may help, and when it is ready to gift.</span>
            <small>Keep child details private. Use initials, group names, or simple notes when needed.</small>
          </div>
          <div className="spark-kid-pack-meaning-card">
            <strong>The Spark is about helping kids feel welcomed, included, and excited to collect.</strong>
            <span>Kid Packs are local planning records. They do not deplete Vault inventory, Giving Ledger gifts, or any backend supply.</span>
          </div>
          <div className="et-mockup-stat-grid spark-kid-pack-impact-grid" aria-label="Kid Packs status">
            <EtMockupStatCard label="Kid Packs" value={sparkKidPackSummary.totalPacks} detail="packs planned locally" tone="gold" />
            <EtMockupStatCard label="Ready to Gift" value={sparkKidPackSummary.readyToGift} detail="packs ready for review or gifting" tone="pink" />
            <EtMockupStatCard label="Gifted" value={sparkKidPackSummary.gifted} detail="packs marked gifted locally" tone="gold" />
          </div>
          <div className="spark-gift-type-cloud spark-kid-pack-type-cloud" aria-label="Pack Type options">
            {SPARK_KID_PACK_TYPES.map((option) => <span key={option}>{option}</span>)}
          </div>
          {sparkGifts.length ? (
            <div className="spark-kid-pack-ledger-link">
              <strong>Giving Ledger connection</strong>
              <span>{sparkGivingImpact.totalGifts} gift{sparkGivingImpact.totalGifts === 1 ? "" : "s"} logged locally. Review Giving Ledger support separately before building packs.</span>
            </div>
          ) : null}
          {recentSparkKidPacks.length ? (
            <div className="spark-kid-pack-list" aria-label="Kid Packs saved packs">
              {recentSparkKidPacks.map(renderSparkKidPackRow)}
            </div>
          ) : (
            <EtMockupEmptyState
              title="No Kid Packs built yet."
              detail="Plan a starter pack, event pack, birthday pack, or family support pack. Family/Spark upgrades can expand pack and event planning when enabled."
              action={<EtMockupButton variant="secondary" onClick={() => openSparkKidPackFlow({ source: "spark-kid-packs-empty" })}>Build a Kid Pack</EtMockupButton>}
            />
          )}
        </EtMockupSectionCard>

        <EtMockupSectionCard
          title="Event Support Planner"
          detail="Plan family collecting days, learning tables, kid-pack prep, volunteer help, sponsor/shop notes, and supplies needed. Local beta planning only."
          className="spark-event-support-card"
          ariaLabel="The Spark Event Support Planner"
          action={<EtMockupButton onClick={() => openSparkEventSupportFlow({ source: "spark-event-support" })}>Plan Event Support</EtMockupButton>}
        >
          <div className="spark-event-support-helper-card">
            <strong>Local beta planning tool</strong>
            <span>Use this for event support notes, supplies, volunteers, and sponsor/shop ideas. It is not payment processing, fulfillment, shipping, or a tax receipt.</span>
            <small>Keep child and family details private. Use general areas, group names, or internal notes only.</small>
          </div>
          <div className="et-mockup-stat-grid spark-event-support-impact-grid" aria-label="Event Support Planner status">
            <EtMockupStatCard label="Event support notes" value={sparkEventSupportSummary.totalEvents} detail="local event plans" tone="gold" />
            <EtMockupStatCard label="Collecting" value={sparkEventSupportSummary.collecting} detail="supplies or support being gathered" tone="pink" />
            <EtMockupStatCard label="Packed / complete" value={sparkEventSupportSummary.packed + sparkEventSupportSummary.complete} detail="marked packed or complete locally" tone="gold" />
          </div>
          {recentSparkEventPlans.length ? (
            <div className="spark-event-support-list" aria-label="Event Support saved plans">
              {recentSparkEventPlans.map(renderSparkEventSupportRow)}
            </div>
          ) : (
            <EtMockupEmptyState
              title="No Event Support plans yet."
              detail="Plan supplies, volunteers, sponsors, shops, snacks, shipping help, and family-safe support before a Spark event. Nothing is processed or fulfilled from this preview."
              action={<EtMockupButton variant="secondary" onClick={() => openSparkEventSupportFlow({ source: "spark-event-support-empty" })}>Plan Event Support</EtMockupButton>}
            />
          )}
        </EtMockupSectionCard>

        {renderCollectorEventPlannerSection({ surface: "spark" })}

        <EtMockupSectionCard
          title="Giving Ledger"
          detail="Track cards, packs, supplies, event help, snacks, sponsorships, or other support for kids and families."
          className="spark-giving-ledger-card"
          ariaLabel="The Spark Giving Ledger"
          action={<EtMockupButton onClick={() => openSparkGiftFlow({ source: "spark-giving-ledger" })}>Log a Gift</EtMockupButton>}
        >
          <div className="spark-giving-helper-card">
            <strong>Donation helper</strong>
            <span>Track what was given, who it may help, and the story behind the support.</span>
            <small>Giving Ledger is for program tracking only. It is not a tax receipt.</small>
          </div>
          <div className="et-mockup-stat-grid spark-giving-impact-grid" aria-label="Spark Impact">
            <EtMockupStatCard label="Spark Impact" value={sparkGivingImpact.totalGifts} detail="total gifts logged locally" tone="gold" />
            <EtMockupStatCard label="Estimated Value" value={sparkGivingImpact.totalValueLabel} detail={sparkGivingImpact.valueCount ? `${sparkGivingImpact.valueCount} gift${sparkGivingImpact.valueCount === 1 ? "" : "s"} with values` : "Add values when applicable"} tone="pink" />
            <EtMockupStatCard label="Recent support" value={sparkGivingImpact.recentSupportLabel} detail="Latest local Giving Ledger entry" tone="gold" />
          </div>
          <div className="spark-gift-type-cloud" aria-label="Donation Type options">
            {SPARK_GIVING_DONATION_TYPES.map((option) => <span key={option.value}>{option.label}</span>)}
          </div>
          {recentSparkGifts.length ? (
            <div className="spark-gift-ledger-list" aria-label="Giving Ledger saved gifts">
              {recentSparkGifts.map(renderSparkGiftRow)}
            </div>
          ) : (
            <EtMockupEmptyState
              title="No Spark Gifts logged yet."
              detail="Log cards, packs, supplies, event help, snacks, sponsorships, or other support when it happens. Upgraded plans can expand family and event support history when enabled."
              action={<EtMockupButton variant="secondary" onClick={() => openSparkGiftFlow({ source: "spark-giving-ledger-empty" })}>Log a Gift</EtMockupButton>}
            />
          )}
        </EtMockupSectionCard>

        {renderUpgradeValuePreview("spark")}

        {adminToolsVisible ? (
          <section className="panel spark-admin-shortcut">
            <span className="status-badge trust-badge--kid">Admin</span>
            <div>
              <strong>Kids Program review stays in Admin Command Center.</strong>
              <p>Application summaries are review-only. Admins make final decisions.</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => void runKidsProgramAiAssist(activeApplication)}>
              Summarize
            </button>
          </section>
        ) : null}

        <section className="panel kids-program-layout spark-program-layout spark-mockup-program-layout">
          <section id="spark-program-sections" className="spark-section-block" aria-label="Kids Program sections">
            <div className="compact-card-header">
              <div>
                <h3>What The Spark supports</h3>
                <p>Mission areas for family collecting support, learning, donations, and trusted helpers.</p>
              </div>
            </div>
            <div className="spark-section-grid">
              {sparkMissionCards.map((section) => (
                <article className="spark-section-card" key={section.key}>
                  <span className="spark-section-icon" aria-hidden="true">{section.icon}</span>
                  <strong>{section.title}</strong>
                  <p>{section.detail}</p>
                </article>
              ))}
            </div>
            <div className="spark-support-examples" aria-label="The Spark support examples">
              {sparkSupportExamples.map((item) => <span key={item}>{item}</span>)}
            </div>
          </section>

          <section className="spark-donation-tracking-panel" aria-label="Donation tracking categories">
            <div className="compact-card-header">
              <div>
                <h3>Donation tracking</h3>
                <p>Track more than cards. The Spark can organize the support families actually use.</p>
              </div>
              <span className="trust-badge trust-badge--kid">Broad support</span>
            </div>
            <div className="spark-donation-group-grid">
              {sparkDonationGroups.map((group) => (
                <article className="spark-donation-group-card" key={group.title}>
                  <strong>{group.title}</strong>
                  <div>
                    {group.items.map((item) => <span key={item}>{item}</span>)}
                  </div>
                </article>
              ))}
            </div>
            <button type="button" className="secondary-button spark-donation-route-button" onClick={openSparkDonate}>Open Donate preview</button>
          </section>

          <section className="spark-participation-panel" aria-label="Spark participation paths">
            <div className="compact-card-header">
              <div>
                <h3>Who can help</h3>
                <p>Participation stays parent-safe, admin-reviewed, and focused on fair family access.</p>
              </div>
            </div>
            <div className="spark-participation-grid">
              {sparkParticipationCards.map((card) => (
                <article className="spark-participation-card" key={card.title}>
                  <span>{card.badge}</span>
                  <strong>{card.title}</strong>
                  <p>{card.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="spark-status-strip" aria-label="The Spark status">
            {sparkSections.map((section) => (
              <article className="spark-status-card" key={section.key}>
                <span>{section.title}</span>
                <strong>{section.value}</strong>
                <p>{section.detail}</p>
              </article>
            ))}
          </section>

          <div className="spark-parent-safe-panel">
            <div>
              <h3>Parent-safe by design</h3>
              <p>Ember & Tide is built with families in mind. The Spark is community-based and inventory-limited. Participation is managed by a parent or guardian.</p>
            </div>
            <ul className="clean-bullet-list">
              {["No private child messaging.", "Admin-reviewed requests.", "Family-friendly community standards.", "Details stay private unless a parent chooses to share."].map((point) => <li key={point}>{point}</li>)}
            </ul>
          </div>

          <section id="spark-safety-rules" className="spark-safety-rules-panel" aria-label="Kids Program safety rules">
            <div className="compact-card-header">
              <div>
                <h3>Safety Rules</h3>
                <p>These rules apply before any request, mission, giveaway, event, reward, or trade can move forward.</p>
              </div>
              <span className="trust-badge trust-badge--kid">Parent-safe</span>
            </div>
            <div className="spark-rule-grid">
              {sparkSafetyRules.map((rule) => (
                <div className="spark-rule-card" key={rule}>
                  <span>Rule</span>
                  <strong>{rule}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="spark-learning-panel" aria-label="Learn and grow topics">
            <div className="compact-card-header">
              <div>
                <h3>Learn & Grow</h3>
                <p>Simple collecting habits for families and new collectors.</p>
              </div>
            </div>
            <div className="spark-learning-grid">
              {sparkLearningCards.map((item) => <span key={item}>{item}</span>)}
            </div>
          </section>

          {kidProgramEventCards.length ? (
            <section className="spark-events-panel" aria-label="Family-friendly events">
              <div className="compact-card-header">
                <div>
                  <h3>Events & giveaways</h3>
                  <p>General area only. Exact private locations are not shown here.</p>
                </div>
                <span className="trust-badge trust-badge--kid">Family-friendly</span>
              </div>
              <div className="spark-event-list">
                {kidProgramEventCards.map((project) => (
                  <article className="spark-event-card" key={project.id}>
                    <div>
                      <strong>{project.name || "Kids Program event"}</strong>
                      <p>{project.eventDate ? "Date set" : "Date coming soon"} · General area shared when confirmed</p>
                    </div>
                    <button type="button" className="secondary-button" onClick={openPokemonWatchCalendar}>View details</button>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <div className="empty-state spark-empty-state spark-event-empty-state">
              <h3>The Spark is opening carefully.</h3>
              <p>Join the mission with kids packs, giveaways, donation support, learning help, or family-friendly events when local opportunities are ready.</p>
              <button type="button" onClick={scrollToSparkDetails}>Learn about The Spark</button>
            </div>
          )}

          {!activeApplication ? (
            <div className="empty-state spark-empty-state spark-request-empty-state">
              <h3>No Kids Program request yet.</h3>
              <p>Start with a parent-approved interest request or review the mission areas above. We cannot promise inventory, but The Spark helps Ember & Tide understand how local families want to participate.</p>
              <div className="quick-actions">
                <button type="button" onClick={scrollToSparkRequest}>Request access</button>
                <button type="button" className="secondary-button" onClick={scrollToSparkRules}>View Rules</button>
              </div>
            </div>
          ) : (
            <div className="spark-private-request-card">
              <div>
                <span>Request status</span>
                <h3>Your request is private</h3>
                <p>Status: {sparkProgramStatusLabel(activeApplication.status || "interest_submitted")}. Child/family request details are not public.</p>
              </div>
              <span className="status-badge">{sparkProgramStatusLabel(activeApplication.status || "interest_submitted")}</span>
            </div>
          )}

          {safeKidProgramProjects.length ? (
            <section className="spark-private-request-card spark-program-projects-card" aria-label="Private Kids Program project activity">
              <div>
                <span>Private activity</span>
                <h3>Private family-safe plans</h3>
                <p>Pack plans, events, and giveaway prep are shown only in your signed-in view. Child/family details and admin notes are not public.</p>
              </div>
              <div className="home-list compact-home-list">
                {safeKidProgramProjects.map((project) => {
                  const itemCount = phase2KidProjectItemCounts[project.id] || 0;
                  const statusLabel = String(project.status || "planning").replace(/_/g, " ");
                  return (
                    <div className="home-list-row" key={project.id}>
                      <span>
                        <strong>{project.name || "Kids Program plan"}</strong>
                        <small>
                          {project.targetPackCount || 0} planned pack{Number(project.targetPackCount || 0) === 1 ? "" : "s"}
                          {" | "}
                          {itemCount} item{itemCount === 1 ? "" : "s"}
                          {project.eventDate ? ` | Event date set` : ""}
                        </small>
                      </span>
                      <b>{statusLabel}</b>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <form id="spark-request-flow" className="form beta-form-card spark-request-flow" onSubmit={submitKidsProgramApplication} noValidate>
            <div className="spark-request-heading">
              <div>
                <h3>Request The Spark access</h3>
                <p>Step {kidsProgramRequestStep} of 5: {requestSteps[kidsProgramRequestStep - 1]}</p>
              </div>
              <span className="status-badge">Parent managed</span>
            </div>
            <div className="spark-stepper" aria-label="Kids request steps">
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

            {kidsProgramRequestStep === 1 ? (
              <div className="spark-flow-panel">
                <h4>Child/family request</h4>
                <p className="compact-subtitle">Use a first name or nickname only. We do not ask for exact birthdates, IDs, or public child profiles.</p>
                <Field label="Parent/guardian name">
                  <input value={kidsProgramForm.parentName} onChange={(event) => updateKidsProgramField("parentName", event.target.value)} placeholder="Parent or guardian" />
                </Field>
                <div className="inline-input-grid">
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
                <Field label="Child first name or nickname optional">
                  <input value={kidsProgramForm.childFirstName} onChange={(event) => updateKidsProgramField("childFirstName", event.target.value)} placeholder="First name or nickname only" />
                </Field>
              </div>
            ) : null}

            {kidsProgramRequestStep === 2 ? (
              <div className="spark-flow-panel">
                <h4>Product wanted</h4>
                <p className="compact-subtitle">Tell us interests, not guarantees. The Spark can only help when safe inventory, giveaways, or family opportunities are available.</p>
                <Field label="Favorite Pokemon or product">
                  <input value={kidsProgramForm.favoritePokemon} onChange={(event) => updateKidsProgramField("favoritePokemon", event.target.value)} placeholder="Pikachu, ETB, binder, starter deck..." />
                </Field>
                <Field label="What are they collecting right now?">
                  <textarea value={kidsProgramForm.collectingInterest} onChange={(event) => updateKidsProgramField("collectingInterest", event.target.value)} placeholder="Tell us what would help them collect safely." />
                </Field>
                <Field label="What are you hoping to access?">
                  <div className="checkbox-grid">
                    {KIDS_PROGRAM_ACCESS_OPTIONS.map((option) => (
                      <label key={option}>
                        <input
                          type="checkbox"
                          checked={kidsProgramForm.requestedAccess.includes(option)}
                          onChange={() => updateKidsProgramField("requestedAccess", toggleArrayValue(kidsProgramForm.requestedAccess, option))}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </Field>
              </div>
            ) : null}

            {kidsProgramRequestStep === 3 ? (
              <div className="spark-flow-panel">
                <h4>Parent contact/settings</h4>
                <Field label="Parent email">
                  <input type="email" value={kidsProgramForm.email || email} onChange={(event) => updateKidsProgramField("email", event.target.value)} placeholder="you@example.com" />
                </Field>
                <Field label="Parent note optional">
                  <textarea value={kidsProgramForm.reason} onChange={(event) => updateKidsProgramField("reason", event.target.value)} placeholder="Anything we should know before review?" />
                </Field>
                <p className="compact-subtitle">We do not expose child/family request details publicly. Admin notes stay internal.</p>
              </div>
            ) : null}

            {kidsProgramRequestStep === 4 ? (
              <div className="spark-flow-panel">
                <h4>Review rules</h4>
                <div className="spark-rule-grid compact">
                  {sparkSafetyRules.map((rule) => <div className="spark-rule-card" key={rule}><strong>{rule}</strong></div>)}
                </div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={kidsProgramForm.agreesNoResale} onChange={(event) => updateKidsProgramField("agreesNoResale", event.target.checked)} />
                  <span>I understand Kids Program items are intended for children and families, not resale.</span>
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={kidsProgramForm.consentContact} onChange={(event) => updateKidsProgramField("consentContact", event.target.checked)} />
                  <span>I agree Ember & Tide may contact me about Kids Program opportunities.</span>
                </label>
              </div>
            ) : null}

            {kidsProgramRequestStep === 5 ? (
              <div className="spark-flow-panel spark-review-panel">
                <h4>Review and submit</h4>
                <div className="catalog-detail-grid">
                  <DetailItem label="Parent" value={kidsProgramForm.parentName || "Missing"} />
                  <DetailItem label="Contact" value={kidsProgramForm.email || email || "Missing"} />
                  <DetailItem label="Age range" value={kidsProgramForm.childAgeRange || "Not selected"} />
                  <DetailItem label="Product wanted" value={kidsProgramForm.favoritePokemon || "Not provided"} />
                  <DetailItem label="Request type" value={requestAccessSummary} />
                  <DetailItem label="Rules" value={kidsProgramForm.agreesNoResale && kidsProgramForm.consentContact ? "Accepted" : "Needs review"} />
                </div>
                <p className="compact-subtitle">Submit sends a private parent/family interest request. Fulfillment is not guaranteed and depends on inventory, fairness review, and program availability.</p>
              </div>
            ) : null}

            <div className="spark-flow-actions">
              {kidsProgramRequestStep > 1 ? (
                <button type="button" className="secondary-button" onClick={() => setKidsProgramRequestStep((current) => Math.max(1, current - 1))}>Back</button>
              ) : null}
              {kidsProgramRequestStep < 5 ? (
                <button type="button" onClick={() => setKidsProgramRequestStep((current) => Math.min(5, current + 1))}>Next</button>
              ) : (
                <button type="submit">{guestPreviewActive ? "Create account to apply" : "Submit request"}</button>
              )}
            </div>
          </form>
        </section>
        </div>

        <EtMockupRightRail
          title="Parent-safe support"
          detail="Ways families, shops, and sponsors can help without private child messaging or payment processing."
          className="spark-mockup-rail"
        >
          <EtMockupSectionCard
            title="Help The Spark"
            detail="Public beta interest only. Requests are reviewed before anything becomes public."
            className="spark-mockup-rail-card"
            action={<EtMockupPill tone="beta">Preview only</EtMockupPill>}
          >
            <div className="et-mockup-action-stack">
              <EtMockupActionCard title="Donate / support preview" detail="Cards, sealed products, packs, supplies, events, time, or services." icon="spark" tone="gold" onClick={openSparkDonate} />
              <EtMockupActionCard title="Plan event support" detail="Local-only support notes for supplies, volunteers, sponsors, and shops." icon="spark" tone="gold" onClick={() => openSparkEventSupportFlow({ source: "spark-rail-event-support" })} />
              <EtMockupActionCard title="Sponsor or shop interest" detail="Share interest for drop-off days, learning tables, or fair access support." icon="market" tone="gold" onClick={() => openPublicBetaFeedback({ page: "The Spark", role: "Sponsor / Donor", mainReason: "Sponsor / donate to The Spark", interests: ["The Spark kids program", "Shop partnership"] })} />
              <EtMockupActionCard title="Request family access" detail="Parent-managed and admin-reviewed. No private child messaging." icon="spark" tone="pink" onClick={activeApplication ? scrollToSparkDetails : scrollToSparkRequest} />
            </div>
          </EtMockupSectionCard>

          <EtMockupSectionCard
            title="Spark guardrails"
            detail="The Spark is a safe support preview, not a public child directory or payment flow."
            className="spark-mockup-rail-card"
          >
            <div className="spark-rule-grid compact">
              {["No private child messaging.", "Parent-safe requests.", "No payment processed.", "Admin-reviewed requests."].map((rule) => (
                <div className="spark-rule-card" key={rule}>
                  <strong>{rule}</strong>
                </div>
              ))}
            </div>
          </EtMockupSectionCard>

          <div className="spark-status-strip spark-mockup-status-rail" aria-label="The Spark status">
            {sparkSections.map((section) => (
              <article className="spark-status-card" key={section.key}>
                <span>{section.title}</span>
                <strong>{section.value}</strong>
                <p>{section.detail}</p>
              </article>
            ))}
          </div>
        </EtMockupRightRail>
      </EtMockupPageShell>
    );
  }
