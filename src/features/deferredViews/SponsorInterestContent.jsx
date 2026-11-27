// Rendering is deferred; the owning App retains record state and action handlers.
export default function SponsorInterestContent({ scope, args = [] }) {
  const {
    BRAND_LEGAL_NOTICE,
    DetailItem,
    Field,
    POKEMON_AFFILIATION_NOTICE,
    PageHeader,
    SPONSOR_PARTNERSHIP_TYPES,
    getHeaderCardClass,
    openPublicBetaFeedback,
    setActiveTab,
    sponsorForm,
    submitSponsorInterest,
    toggleArrayValue,
    updateSponsorForm,
  } = scope;

  function renderSponsorInterestPage() {
    const shopPortalTrustCards = [
      { title: "Trusted Family Friend badge", body: "Approved shops can show family-safe event support, fair update language, and Spark participation status after review.", status: "Review required" },
      { title: "Helpful updates", body: "Use broad status context without exact quantities, vendor schedules, employee details, or rush-feed language.", status: "No rush feed" },
      { title: "Spark support", body: "Coordinate packs, supplies, volunteer support, event help, or sponsorship interest after admin review.", status: "Preview only" },
    ];
    const shopPortalStatuses = ["In stock", "Limited", "Sold out", "Call first", "Family hold", "Event only"];
    const shopPortalTools = [
      { title: "Shop profile", body: "Preview family-friendly description, public contact boundaries, and review status." },
      { title: "Drop/event composer", body: "Draft a Learn to Play Day, trade night, or Spark drop-off event for review." },
      { title: "Restock status composer", body: "Use safe broad labels instead of exact quantities, vendor timing, or employee details." },
      { title: "Spark sponsor tools", body: "Share support categories without payments, checkout, or donation processing." },
      { title: "Admin review status", body: "Updates stay pending until Code 3 TCG review approves safe public wording." },
    ];
    const shopPortalReviewSteps = [
      { title: "Profile review", body: "Shop identity, region, and family-friendly contact details are reviewed before any badge appears.", status: "Pending" },
      { title: "Update review", body: "Restock and event drafts stay broad, current, and non-exploitable.", status: "Manual review" },
      { title: "Spark support review", body: "Donation or sponsor interest is counted only after a safe admin review.", status: "Review first" },
      { title: "No live posting", body: "This preview does not publish posts, sync inventory, send alerts, or process payments.", status: "Preview-safe" },
    ];
    return (
      <>
        <PageHeader
          className={getHeaderCardClass("panel page-summary-card shop-portal-header")}
          title="Shop Portal"
          subtitle="Post helpful updates without creating a rush feed."
          actions={(
            <>
              <button type="button" className="secondary-button" onClick={() => openPublicBetaFeedback({ page: "Shop Portal", role: "Shop", mainReason: "Shop partnership", interests: ["Shop partnership", "Restocks restock alerts", "The Spark kids program"] })}>I&apos;m a shop or sponsor</button>
              <button type="button" className="secondary-button" onClick={() => setActiveTab("trust")}>Review safety rules</button>
              <button type="button" className="secondary-button" onClick={() => setActiveTab("dashboard")}>Back to Home</button>
            </>
          )}
        />
        <section className="panel sponsor-interest-panel">
          <div className="shop-portal-grid" aria-label="Shop Portal trust controls">
            <article className="shop-portal-profile-card">
              <span className="section-kicker">Family-friendly shop profile</span>
              <h2>Trusted local support, never a scalper feed.</h2>
              <p>Shop Portal is a mock-only review surface for future trusted family friends, stores, sellers, and sponsors. Nothing posts publicly, syncs inventory, charges money, or sends alerts from this page.</p>
              <div className="summary-pill-row">
                <span className="trust-badge trust-badge--secure">Trusted Family Friend badge pending</span>
                <span className="status-badge">Admin review required</span>
                <span className="status-badge">Preview-safe</span>
              </div>
            </article>
            {shopPortalTrustCards.map((card) => (
              <article className="shop-portal-trust-card" key={card.title}>
                <strong>{card.title}</strong>
                <span>{card.body}</span>
                <small>{card.status}</small>
              </article>
            ))}
          </div>

          <div className="shop-portal-composer-grid" aria-label="Shop Portal mock composer">
            <article className="shop-portal-composer-card">
              <div className="compact-card-header">
                <div>
                  <h3>Restock status composer</h3>
                  <p>Choose broad, family-safe labels. Exact quantities stay hidden unless a trusted shop chooses to share them later through an approved path.</p>
                </div>
              </div>
              <div className="shop-portal-status-row">
                {shopPortalStatuses.map((status) => <span className="status-badge" key={status}>{status}</span>)}
              </div>
              <div className="shop-portal-preview-post">
                <strong>Preview update</strong>
                <span>Helpful status: Call first. Family note: good for patient local planning, not rush buying.</span>
              </div>
              <p className="compact-subtitle">Mock composer only. No live posting, inventory sync, checkout, payment, upload, or notification blast is connected.</p>
            </article>
            <article className="shop-portal-composer-card">
              <div className="compact-card-header">
                <div>
                  <h3>Drop or event draft</h3>
                  <p>Preview a family-safe event update before admin review.</p>
                </div>
                <span className="status-badge">Draft only</span>
              </div>
              <div className="catalog-detail-grid">
                <DetailItem label="Event type" value="Learn to Play afternoon" />
                <DetailItem label="Audience" value="Families and new collectors" />
                <DetailItem label="Safety" value="No vendor schedule or rush window" />
                <DetailItem label="Review" value="Pending admin approval" />
              </div>
            </article>
          </div>

          <div className="shop-portal-review-grid" aria-label="Shop Portal review status">
            {shopPortalReviewSteps.map((step) => (
              <article className="shop-portal-review-card" key={step.title}>
                <strong>{step.title}</strong>
                <span>{step.body}</span>
                <small className="status-badge">{step.status}</small>
              </article>
            ))}
          </div>

          <div className="shop-portal-tools-grid" aria-label="Shop Portal support tools">
            {shopPortalTools.map((tool) => (
              <article className="shop-portal-tool-card" key={tool.title}>
                <strong>{tool.title}</strong>
                <span>{tool.body}</span>
              </article>
            ))}
          </div>

          <form className="form beta-form-card" onSubmit={submitSponsorInterest} noValidate>
            <div className="compact-card-header">
              <div>
                <h3>Partner interest</h3>
                <p>Tell Code 3 TCG about your shop or support idea. This queues a local beta interest record only and does not publish anything publicly.</p>
              </div>
              <span className="status-badge">Mock review intake</span>
            </div>
            <p className="compact-subtitle">Please do not include payment details, private child information, passwords, vendor schedules, or exact inventory quantities in this preview form.</p>
            <Field label="Name">
              <input value={sponsorForm.name} onChange={(event) => updateSponsorForm("name", event.target.value)} />
            </Field>
            <Field label="Business/shop name optional">
              <input value={sponsorForm.businessName} onChange={(event) => updateSponsorForm("businessName", event.target.value)} />
            </Field>
            <div className="inline-input-grid">
              <Field label="Email (required)">
                <input type="email" value={sponsorForm.email} onChange={(event) => updateSponsorForm("email", event.target.value)} />
              </Field>
              <Field label="Phone optional">
                <input value={sponsorForm.phone} onChange={(event) => updateSponsorForm("phone", event.target.value)} />
              </Field>
            </div>
            <Field label="Website/social optional">
              <input value={sponsorForm.websiteUrl} onChange={(event) => updateSponsorForm("websiteUrl", event.target.value)} />
            </Field>
            <Field label="Location/city">
              <input value={sponsorForm.city} onChange={(event) => updateSponsorForm("city", event.target.value)} />
            </Field>
            <Field label="Partnership types">
              <div className="checkbox-grid">
                {SPONSOR_PARTNERSHIP_TYPES.map((option) => (
                  <label key={option}>
                    <input
                      type="checkbox"
                      checked={sponsorForm.partnershipTypes.includes(option)}
                      onChange={() => updateSponsorForm("partnershipTypes", toggleArrayValue(sponsorForm.partnershipTypes, option))}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Message">
              <textarea value={sponsorForm.message} onChange={(event) => updateSponsorForm("message", event.target.value)} />
            </Field>
            <label className="checkbox-row">
              <input type="checkbox" checked={sponsorForm.consent} onChange={(event) => updateSponsorForm("consent", event.target.checked)} />
              <span>I agree Code 3 TCG may contact me about partnership opportunities.</span>
            </label>
            <button type="submit">Send sponsor interest</button>
            <button type="button" className="secondary-button" onClick={() => openPublicBetaFeedback({ page: "Shop Portal", role: "Shop", mainReason: "Shop partnership", interests: ["Shop partnership"] })}>Request shop review</button>
          </form>
          <footer className="brand-legal-footer">
            <p>{BRAND_LEGAL_NOTICE}</p>
            <p>{POKEMON_AFFILIATION_NOTICE}</p>
          </footer>
        </section>
      </>
    );
  }

  return renderSponsorInterestPage(...args);
}
