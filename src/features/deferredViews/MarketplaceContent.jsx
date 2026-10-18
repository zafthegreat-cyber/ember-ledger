import { PrivateStorageImage } from "../../components/PrivateReceipt.jsx";
// Rendering is deferred; the owning App retains record state and action handlers.
export default function MarketplaceContent({ scope }) {
  const {
    DetailItem,
    Field,
    MARKETPLACE_DEAL_FILTERS,
    MARKETPLACE_LISTING_TYPES,
    MARKETPLACE_STATUSES,
    TIDETRADR_MARKETPLACE_RULES,
    activeFlowModal,
    activeWorkspace,
    adaptiveSellerToolsVisible,
    adminToolsVisible,
    approveMarketplaceListing,
    buildMarketplaceListing,
    canReviewSharedData,
    currentUserProfile,
    editMarketplaceListing,
    exportCrossListingCSV,
    formatPriceDisplay,
    getListingMarketReference,
    getMarketplaceListingCatalogProduct,
    getMarketplaceListingFairAssessment,
    getMarketplaceListingQualityReport,
    getMarketplaceTrustBadges,
    hasKnownPriceValue,
    isMarketplaceClosedStatus,
    listingMatchesMarketplaceDealFilter,
    marketplaceDealFilter,
    marketplaceListings,
    marketplaceReports,
    marketplaceSavedIds,
    marketplaceSearch,
    marketplaceStatusFilter,
    marketplaceTypeFilter,
    marketplaceView,
    money,
    normalizeListingModerationStatus,
    normalizeListingStatus,
    openFeedbackDialog,
    openMarketplaceCreate,
    openMarketplaceReportFlow,
    openProductAddFlow,
    phase2MarketplaceDraftListings,
    publicUsernameLabelFromRecord,
    recordBelongsToWorkspace,
    rejectMarketplaceListing,
    renderCommunityProfileSummary,
    renderFairPriceBadge,
    renderMarketplaceListingCard,
    renderMarketplaceQualitySummary,
    renderTrustBadge,
    selectedListingId,
    setActiveTab,
    setMarketplaceDealFilter,
    setMarketplaceSearch,
    setMarketplaceStatusFilter,
    setMarketplaceTypeFilter,
    setMarketplaceView,
    setSelectedListingId,
    setVaultToast,
    toggleSavedListing,
    updateMarketplaceListingStatus,
    user,
  } = scope;

  function renderMarketplaceSection() {
    const normalizedSearch = marketplaceSearch.trim().toLowerCase();
    const currentSellerId = currentUserProfile.userId || user?.id;
    const marketplaceScopeListings = marketplaceListings.filter((listing) =>
      normalizeListingStatus(listing) === "Active" ||
      listing.sellerUserId === currentSellerId ||
      canReviewSharedData ||
      recordBelongsToWorkspace(listing, activeWorkspace?.id)
    );
    const publicListings = marketplaceScopeListings.filter((listing) => normalizeListingStatus(listing) === "Active");
    const myListings = marketplaceScopeListings.filter((listing) => listing.sellerUserId === currentSellerId);
    const phase2ChannelDrafts = phase2MarketplaceDraftListings.filter((listing) => listing.status.toLowerCase() === "draft");
    const visibleMyListings = myListings.length ? myListings : phase2MarketplaceDraftListings;
    const draftListings = myListings.length ? myListings.filter((listing) => normalizeListingStatus(listing) === "Draft") : phase2ChannelDrafts;
    const pendingReviewListings = marketplaceScopeListings.filter((listing) =>
      normalizeListingStatus(listing) === "Pending Review" && (listing.sellerUserId === currentSellerId || canReviewSharedData)
    );
    const visibleMarketplaceListings = marketplaceScopeListings.filter((listing) =>
      normalizeListingStatus(listing) === "Active" || listing.sellerUserId === currentSellerId || canReviewSharedData
    );
    const filteredListings = visibleMarketplaceListings.filter((listing) => {
      const matchesStatus =
        marketplaceStatusFilter === "All"
          ? true
          : marketplaceStatusFilter === "Active"
            ? normalizeListingStatus(listing) === "Active"
            : normalizeListingStatus(listing) === marketplaceStatusFilter;
      const matchesType = marketplaceTypeFilter === "All" || listing.listingType === marketplaceTypeFilter;
      const matchesSearch = !normalizedSearch || [listing.title, listing.description, listing.productType, listing.setName, listing.upc, listing.sku, listing.locationCity, publicUsernameLabelFromRecord(listing, "seller")]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
      const matchesDeal = listingMatchesMarketplaceDealFilter(listing, marketplaceDealFilter);
      return matchesStatus && matchesType && matchesSearch && matchesDeal;
    });
    const savedListings = visibleMarketplaceListings.filter((listing) => marketplaceSavedIds.includes(listing.id));
    const marketplacePanelTitle =
      marketplaceView === "my" ? "My Listings" :
      marketplaceView === "saved" ? "Saved Listings" :
      marketplaceView === "drafts" ? "Drafts" :
      marketplaceView === "pending" ? "Pending Review" :
      "Browse Listings";
    const marketplacePanelDescription =
      marketplaceView === "my" ? "Drafts, pending review, and active listings you created." :
      marketplaceView === "saved" ? "Listings you saved for later." :
      marketplaceView === "drafts" ? "Listing drafts that have not been submitted yet." :
      marketplaceView === "pending" ? "Listings waiting for admin review before becoming public." :
      "Approved community listings only. Pending listings stay private to seller/admin.";
    const panelListings =
      marketplaceView === "my" ? visibleMyListings :
      marketplaceView === "saved" ? savedListings :
      marketplaceView === "drafts" ? draftListings :
      marketplaceView === "pending" ? pendingReviewListings :
      filteredListings;
    const selectedListing = marketplaceScopeListings.find((listing) => listing.id === selectedListingId) || marketplaceListings.find((listing) => listing.id === selectedListingId);
    const reviewListing = buildMarketplaceListing("Pending Review");
    const selectedListingClosed = selectedListing ? isMarketplaceClosedStatus(normalizeListingStatus(selectedListing)) : false;
    const selectedListingQuality = selectedListing ? getMarketplaceListingQualityReport(selectedListing) : null;
    const selectedListingCatalogProduct = selectedListing ? getMarketplaceListingCatalogProduct(selectedListing) : null;
    const sellerMarketMode = Boolean(adaptiveSellerToolsVisible || adminToolsVisible);
    const marketplaceViews = [
      sellerMarketMode ? ["create", "Create"] : null,
      ["browse", "For You"],
      sellerMarketMode ? ["my", "My Listings"] : null,
      ["saved", "Watchlist"],
      sellerMarketMode ? ["drafts", "Drafts"] : null,
      canReviewSharedData ? ["pending", "Review"] : null,
    ].filter(Boolean);
    const openMarketplaceReportCount = marketplaceReports.filter((report) => String(report.status || "Open").toLowerCase() !== "closed").length;
    const issueCenterRows = [
      { title: "Item not received", body: "Save tracking, receipt, and timeline proof for admin review.", status: "Evidence" },
      { title: "Wrong or damaged item", body: "Compare listing photos, condition notes, and delivery photos.", status: "Photos" },
      { title: "Suspicious buyer or seller", body: "Report pressure, private info, unsafe meetup, fake product, or payment red flags.", status: "Safety" },
    ];
    const issueCenterTimeline = [
      { label: "Report opened", value: openMarketplaceReportCount ? `${openMarketplaceReportCount} open` : "Ready" },
      { label: "Evidence added", value: "Photos, receipt, tracking" },
      { label: "Admin review", value: "Queue status visible" },
      { label: "Outcome", value: "Record kept in Archive later" },
    ];
    const exchangeSafeMeetupRules = [
      "Choose a trusted shop, public exchange zone, or family-safe event.",
      "Keep child profiles, private addresses, and direct contact details out of the listing.",
      "Use proof photos and condition notes before any local handoff.",
    ];
    const healthSourceListings = (visibleMyListings.length ? visibleMyListings : visibleMarketplaceListings.length ? visibleMarketplaceListings : phase2MarketplaceDraftListings).slice(0, 6);
    const listingHealthRows = healthSourceListings.map((listing) => ({
      listing,
      quality: getMarketplaceListingQualityReport(listing, { requirePublicFields: normalizeListingStatus(listing) !== "Draft" }),
    }));
    const activeHealthRows = listingHealthRows.length ? listingHealthRows : [{ listing: reviewListing, quality: getMarketplaceListingQualityReport(reviewListing, { requirePublicFields: false }) }];
    const listingHealthScore = activeHealthRows.length
      ? Math.round(activeHealthRows.reduce((sum, row) => sum + Number(row.quality.score || 0), 0) / activeHealthRows.length)
      : 0;
    const listingMissingPhotoCount = activeHealthRows.filter((row) => !row.quality.photoAvailable).length;
    const listingMissingPriceCount = activeHealthRows.filter((row) => {
      const listing = row.listing || {};
      const type = String(listing.listingType || listing.listing_type || "").toLowerCase();
      const freeOrTrade = type.includes("free") || type.includes("donation") || type.includes("trade") || type.includes("looking");
      return !freeOrTrade && Number(listing.askingPrice || listing.asking_price || listing.price || 0) <= 0;
    }).length;
    const listingMissingConditionCount = activeHealthRows.filter((row) => {
      const condition = String(row.listing?.condition || "").trim().toLowerCase();
      return !condition || condition === "unknown";
    }).length;
    const listingNeedsReviewCount = activeHealthRows.filter((row) => row.quality.blockers?.length || row.quality.warnings?.length || row.quality.needsAdminReview).length;
    const listingHealthFixRows = [
      { label: "Missing photos", value: listingMissingPhotoCount, detail: "Add front/back or sealed box photos before public review." },
      { label: "Missing price", value: listingMissingPriceCount, detail: "Add asking price, trade value, or mark as donation/free." },
      { label: "Condition gaps", value: listingMissingConditionCount, detail: "Confirm condition so buyers can scan risk quickly." },
      { label: "Review flags", value: listingNeedsReviewCount, detail: "Safety, price, or admin-review warnings need attention." },
    ];
    const listingHealthSuggestionRows = activeHealthRows
      .flatMap((row) => [...(row.quality.blockers || []), ...(row.quality.warnings || [])].map((note) => ({ listing: row.listing, note, quality: row.quality })))
      .slice(0, 4);
    const proofTimelineListing = selectedListing || activeHealthRows[0]?.listing || reviewListing;
    const proofTimelineQuality = selectedListingQuality || activeHealthRows[0]?.quality || getMarketplaceListingQualityReport(proofTimelineListing, { requirePublicFields: false });
    const proofTimelinePhotos = [
      proofTimelineListing?.photoUrl,
      ...(Array.isArray(proofTimelineListing?.photos) ? proofTimelineListing.photos : []),
      proofTimelineListing?.imageUrl,
      proofTimelineListing?.catalogImage,
    ].filter(Boolean);
    const proofTimelineSteps = [
      {
        label: "Listing draft",
        value: proofTimelineListing?.title || proofTimelineListing?.productName ? "Started" : "Not started",
        state: proofTimelineListing?.title || proofTimelineListing?.productName ? "done" : "todo",
      },
      {
        label: "Photos saved",
        value: proofTimelinePhotos.length ? `${proofTimelinePhotos.length} photo${proofTimelinePhotos.length === 1 ? "" : "s"}` : "Needed",
        state: proofTimelinePhotos.length ? "done" : "warning",
      },
      {
        label: "Condition proof",
        value: proofTimelineListing?.condition && String(proofTimelineListing.condition).toLowerCase() !== "unknown" ? proofTimelineListing.condition : "Needed",
        state: proofTimelineListing?.condition && String(proofTimelineListing.condition).toLowerCase() !== "unknown" ? "done" : "warning",
      },
      {
        label: "Review status",
        value: normalizeListingModerationStatus(proofTimelineListing || {}),
        state: proofTimelineQuality?.blockers?.length ? "warning" : "done",
      },
    ];
    const proofEvidenceRows = [
      { label: "Photos", value: proofTimelinePhotos.length ? "Attached" : "Missing", state: proofTimelinePhotos.length ? "done" : "warning" },
      { label: "Receipt", value: proofTimelineListing?.receiptUrl || proofTimelineListing?.receiptImage ? "Saved" : "Optional", state: proofTimelineListing?.receiptUrl || proofTimelineListing?.receiptImage ? "done" : "todo" },
      { label: "Tracking", value: proofTimelineListing?.trackingNumber || proofTimelineListing?.tracking ? "Added" : "After sale", state: proofTimelineListing?.trackingNumber || proofTimelineListing?.tracking ? "done" : "todo" },
      { label: "Issue proof", value: openMarketplaceReportCount ? `${openMarketplaceReportCount} open` : "Clear", state: openMarketplaceReportCount ? "warning" : "done" },
    ];

    return (
      <div className="marketplace-section">
        <div className="marketplace-beta-note market-page-note">
          <strong>Community listings beta</strong>
          <span>Payments and shipping are not handled here. Verify items and use safe agreed payment methods.</span>
        </div>
        <details className="marketplace-safety-rules marketplace-safety-rules--page">
          <summary>Safety rules</summary>
          <div className="tidepool-guideline-list">
            {TIDETRADR_MARKETPLACE_RULES.map((rule) => <span key={rule}>{rule}</span>)}
          </div>
        </details>

        <section className="marketplace-trust-ops-grid" aria-label="Exchange safety operations">
          <article className="marketplace-safe-meetup-card">
            <div className="compact-card-header">
              <div>
                <p className="section-kicker">Safe Meetup</p>
                <h3>Public place first, proof before handoff.</h3>
              </div>
              <span className="status-badge">Parent-aware</span>
            </div>
            <div className="safe-meetup-check-grid">
              <div><span>Place</span><strong>Trusted shop or public zone</strong></div>
              <div><span>Location</span><strong>Area only until approved</strong></div>
              <div><span>Kids/teens</span><strong>Adult required</strong></div>
            </div>
            <div className="safe-meetup-rule-list">
              {exchangeSafeMeetupRules.map((rule) => <span key={rule}>{rule}</span>)}
            </div>
            <button type="button" className="secondary-button" onClick={() => setActiveTab("trust")}>Open Lantern</button>
          </article>

          <article className="marketplace-issue-center-card" aria-label="Dispute and Issue Center">
            <div className="compact-card-header">
              <div>
                <p className="section-kicker">Issue Center</p>
                <h3>Report problems with evidence and a clear review path.</h3>
              </div>
              <span className="status-badge">{openMarketplaceReportCount} open</span>
            </div>
            <div className="issue-center-stepper" aria-label="Issue center progress steps">
              {issueCenterTimeline.map((step, index) => (
                <div className="issue-center-step" key={step.label}>
                  <span>{index + 1}</span>
                  <strong>{step.label}</strong>
                  <small>{step.value}</small>
                </div>
              ))}
            </div>
            <div className="issue-center-evidence-grid">
              {issueCenterRows.map((row) => (
                <article className="issue-center-evidence-card" key={row.title}>
                  <strong>{row.title}</strong>
                  <p>{row.body}</p>
                  <small className="status-badge">{row.status}</small>
                </article>
              ))}
            </div>
            <div className="quick-actions">
              <button type="button" className="secondary-button" onClick={() => openFeedbackDialog("bug", { page: "Exchange Issue Center", topic: "Marketplace issue" })}>Start issue note</button>
              <button type="button" className="secondary-button" onClick={() => setMarketplaceView("browse")}>Find listing to report</button>
            </div>
          </article>
        </section>

        <section className="marketplace-listing-health-grid" aria-label="Harbor listing health and proof timeline">
          <article className="marketplace-listing-health-card">
            <div className="compact-card-header">
              <div>
                <p className="section-kicker">Listing Health</p>
                <h3>{listingHealthScore >= 82 ? "Harbor listings look ready for review." : "Harbor listings need cleanup before they move."}</h3>
                <p>Health checks photos, condition, price, safety wording, and review flags without publishing or charging anyone.</p>
              </div>
              <div className="marketplace-health-score" aria-label={`Listing health ${listingHealthScore}%`}>
                <strong>{listingHealthScore}%</strong>
                <span>Health</span>
              </div>
            </div>
            <div className="marketplace-health-meter" aria-hidden="true">
              <i style={{ width: `${Math.max(0, Math.min(100, listingHealthScore))}%` }} />
            </div>
            <div className="marketplace-health-stat-grid">
              {listingHealthFixRows.map((row) => (
                <article key={row.label} className={row.value ? "needs-attention" : ""}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                  <p>{row.detail}</p>
                </article>
              ))}
            </div>
            <div className="marketplace-health-fix-list" aria-label="Listing health suggested fixes">
              {listingHealthSuggestionRows.length ? listingHealthSuggestionRows.map((row) => (
                <article key={`${row.listing?.id || row.listing?.title || "draft"}-${row.note}`}>
                  <div>
                    <strong>{row.listing?.title || row.listing?.productName || "Draft listing"}</strong>
                    <p>{row.note}</p>
                  </div>
                  <span className="status-badge">{row.quality.blockers?.includes(row.note) ? "Blocker" : "Fix"}</span>
                </article>
              )) : (
                <article>
                  <div>
                    <strong>No urgent fixes found</strong>
                    <p>Current listing checks are clear. Keep proof photos and condition notes visible.</p>
                  </div>
                  <span className="status-badge">Ready</span>
                </article>
              )}
            </div>
            <div className="quick-actions">
              {sellerMarketMode ? <button type="button" className="secondary-button" onClick={() => setMarketplaceView("drafts")}>Review drafts</button> : null}
              <button type="button" className="secondary-button" onClick={() => setMarketplaceView("browse")}>Browse listings</button>
            </div>
          </article>

          <article className="marketplace-proof-timeline-card">
            <div className="compact-card-header">
              <div>
                <p className="section-kicker">Proof Timeline</p>
                <h3>{proofTimelineListing?.title || proofTimelineListing?.productName || "Start with listing proof."}</h3>
                <p>Proof makes Harbor safer: photos, condition, review status, receipts, tracking, and issue evidence stay connected.</p>
              </div>
              <span className="status-badge">{proofTimelineQuality?.photoAvailable ? "Proof started" : "Needs photos"}</span>
            </div>
            <div className="proof-timeline-stepper" aria-label="Harbor proof timeline steps">
              {proofTimelineSteps.map((step, index) => (
                <article className={`proof-timeline-step proof-timeline-step--${step.state}`} key={step.label}>
                  <span>{index + 1}</span>
                  <strong>{step.label}</strong>
                  <small>{step.value}</small>
                </article>
              ))}
            </div>
            <div className="proof-evidence-grid" aria-label="Proof evidence cards">
              {proofEvidenceRows.map((row) => (
                <article className={`proof-evidence-card proof-evidence-card--${row.state}`} key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </article>
              ))}
            </div>
            <div className="marketplace-proof-note">
              <strong>What happens next</strong>
              <span>Harbor keeps proof visible for listing review and future Archive records. It does not process payment, shipping labels, or disputes automatically.</span>
            </div>
          </article>
        </section>

        <div className="market-stats-grid market-stats-grid--compact">
          <div className="card"><p>Active</p><h2>{publicListings.length}</h2></div>
          <div className="card"><p>Saved</p><h2>{marketplaceSavedIds.length}</h2></div>
          {sellerMarketMode ? <div className="card"><p>My Listings</p><h2>{visibleMyListings.length}</h2></div> : null}
        </div>

        <div className="quick-actions marketplace-nav-actions">
          {marketplaceViews.map(([view, label]) => (
            <button
              key={view}
              type="button"
              className={(view === "create" ? activeFlowModal?.type === "createListing" : marketplaceView === view) ? "primary" : "secondary-button"}
              onClick={() => {
                if (view === "create") {
                  openMarketplaceCreate("manual", {});
                  return;
                }
                setMarketplaceView(view);
              }}
            >
              {label}
            </button>
          ))}
          {sellerMarketMode ? <button type="button" className="secondary-button" onClick={() => exportCrossListingCSV("all")}>Export</button> : null}
        </div>

        {marketplaceView === "landing" ? (
          <div className="empty-state">
            <h3>Choose a Marketplace tool</h3>
            <p>Create a listing, browse approved listings, review your listings, or open saved listings. Public listings go to review first.</p>
          </div>
        ) : null}


        {["browse", "my", "saved", "drafts", "pending"].includes(marketplaceView) ? (
        <div className="marketplace-browse-panel">
          <div className="compact-card-header">
            <div>
              <h3>{marketplacePanelTitle}</h3>
              <p>{marketplacePanelDescription}</p>
            </div>
          </div>
          {marketplaceView === "browse" ? (
          <div className="filter-grid">
            <Field label="Search">
              <input value={marketplaceSearch} onChange={(event) => setMarketplaceSearch(event.target.value)} placeholder="Search title, set, UPC, SKU, city..." />
            </Field>
            <Field label="Listing Type">
              <select value={marketplaceTypeFilter} onChange={(event) => setMarketplaceTypeFilter(event.target.value)}>
                <option>All</option>
                {MARKETPLACE_LISTING_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={marketplaceStatusFilter} onChange={(event) => setMarketplaceStatusFilter(event.target.value)}>
                <option>Active</option>
                <option>All</option>
                {MARKETPLACE_STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
            </Field>
          </div>
          ) : null}
          {marketplaceView === "browse" ? (
            <div className="market-filter-rail marketplace-deal-filters" aria-label="Marketplace fair deal filters">
              {MARKETPLACE_DEAL_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={marketplaceDealFilter === filter.value ? "primary" : "secondary-button"}
                  aria-pressed={marketplaceDealFilter === filter.value}
                  onClick={() => setMarketplaceDealFilter(filter.value)}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="inventory-list compact-inventory-list">
            {panelListings.length ? panelListings.map((listing) => renderMarketplaceListingCard(listing)) : (
              <div className="empty-state market-empty-state">
                <h3>{marketplaceView === "browse" ? "No matching deals yet." : "No marketplace listings yet"}</h3>
                <p>
                  {marketplaceView === "saved"
                    ? "Saved listings will appear here."
                    : marketplaceView === "my"
                      ? "Create a listing draft to see it here."
                      : marketplaceView === "drafts"
                        ? "Saved drafts will appear here."
                        : marketplaceView === "pending"
                          ? "Listings submitted for admin review will appear here."
                          : "Try a different search, remove a fair-price filter, or create a listing for the community."}
                </p>
                {marketplaceView === "browse" ? (
                  <div className="quick-actions">
                    <button type="button" onClick={() => setVaultToast("Market alert saved for beta. Watchlist alerts are coming next.")}>Save Watch</button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setMarketplaceSearch("");
                        setMarketplaceTypeFilter("All");
                        setMarketplaceStatusFilter("Active");
                        setMarketplaceDealFilter("all");
                      }}
                    >
                      Browse Market
                    </button>
                    {sellerMarketMode ? <button type="button" className="secondary-button" onClick={() => openMarketplaceCreate("manual", {})}>Add Listing</button> : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
        ) : null}


        {selectedListing ? (
          <div className="marketplace-detail-panel compact-card">
            <div className="compact-card-header">
              <div>
                <h3>{selectedListing.title}</h3>
                <p>{selectedListing.listingType} | {normalizeListingStatus(selectedListing)} | {normalizeListingModerationStatus(selectedListing)}</p>
              </div>
              <button type="button" className="secondary-button" onClick={() => setSelectedListingId("")}>Close</button>
            </div>
            {selectedListing.photos?.[0] ? <PrivateStorageImage className="catalog-detail-image" src={selectedListing.photos[0]} alt={selectedListing.title} /> : null}
            <div className="market-trust-badge-row market-detail-badges">
              {renderFairPriceBadge(getMarketplaceListingFairAssessment(selectedListing))}
              {getMarketplaceTrustBadges(selectedListing).map(renderTrustBadge)}
            </div>
            {renderCommunityProfileSummary(selectedListing, { compact: false, className: "marketplace-detail-profile-card" })}
            {selectedListingQuality ? renderMarketplaceQualitySummary(selectedListingQuality, { hideWhenClear: true, limit: 5 }) : null}
            <section className="marketplace-detail-proof-timeline-card" aria-label="Selected listing proof timeline">
              <div className="compact-card-header">
                <div>
                  <p className="section-kicker">Proof Timeline</p>
                  <h3>Review proof before contacting or reporting.</h3>
                </div>
                <span className="status-badge">{selectedListingQuality?.photoAvailable ? "Proof started" : "Needs photos"}</span>
              </div>
              <div className="proof-timeline-stepper" aria-label="Selected listing proof steps">
                {proofTimelineSteps.map((step, index) => (
                  <article className={`proof-timeline-step proof-timeline-step--${step.state}`} key={`selected-${step.label}`}>
                    <span>{index + 1}</span>
                    <strong>{step.label}</strong>
                    <small>{step.value}</small>
                  </article>
                ))}
              </div>
              <div className="proof-evidence-grid" aria-label="Selected listing evidence">
                {proofEvidenceRows.map((row) => (
                  <article className={`proof-evidence-card proof-evidence-card--${row.state}`} key={`selected-${row.label}`}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </article>
                ))}
              </div>
            </section>
            <div className="catalog-detail-grid">
              <DetailItem label="Asking Price" value={hasKnownPriceValue(selectedListing.askingPrice) ? money(selectedListing.askingPrice) : "Price data unavailable"} />
              <DetailItem label="Market Value" value={formatPriceDisplay(getListingMarketReference(selectedListing).currentMarketValue, { moneyFormatter: money, missingLabel: "Market value unknown" })} />
              <DetailItem label="MSRP" value={formatPriceDisplay(getListingMarketReference(selectedListing).msrp, { moneyFormatter: money, missingLabel: "MSRP unknown" })} />
              <DetailItem label="Condition" value={selectedListing.condition} />
              <DetailItem label="Quantity" value={selectedListing.quantity} />
              <DetailItem label="Location" value={`${selectedListing.locationCity || "Local"} ${selectedListing.locationState || ""}`} />
              <DetailItem label="Pickup / Shipping" value={`${selectedListing.pickupOnly ? "Pickup" : "Pickup optional"}${selectedListing.shippingAvailable ? " / Shipping available" : ""}`} />
              <DetailItem label="Seller Contact" value={selectedListing.contactPreference || "Request contact"} />
            </div>
            <p>{selectedListing.description || "No description yet."}</p>
            {selectedListingClosed ? (
              <p className="market-closed-note">This listing is {normalizeListingStatus(selectedListing)}. It is kept for history and review, not as an active public offer.</p>
            ) : null}
            <p className="compact-subtitle">Seller trust uses public username, Scout level, public badges, and contribution history. Private email and admin moderation notes are not shown publicly.</p>
            <p className="compact-subtitle">Code 3 TCG does not provide checkout/payment inside the app yet. Use safe, agreed payment methods and follow community rules.</p>
            <div className="quick-actions">
              <button type="button" disabled={selectedListingClosed} onClick={() => setVaultToast("Contact request saved for beta. Messaging is coming soon.")}>Contact Seller</button>
              <button type="button" className="secondary-button" onClick={() => toggleSavedListing(selectedListing.id)}>Save Listing</button>
              {!selectedListingClosed && selectedListingCatalogProduct ? (
                adaptiveSellerToolsVisible ? (
                  <button type="button" className="secondary-button" onClick={() => openProductAddFlow({ product: selectedListingCatalogProduct, source: "marketplace-detail-forge", destinations: { forge: true } })}>Add to Forge</button>
                ) : (
                  <button type="button" className="secondary-button" onClick={() => openProductAddFlow({ product: selectedListingCatalogProduct, source: "marketplace-detail-vault", destinations: { vault: true } })}>Add to Vault</button>
                )
              ) : null}
              <button type="button" className="secondary-button" disabled>Make Offer Later</button>
              <button type="button" className="secondary-button" onClick={() => openMarketplaceReportFlow(selectedListing)}>Report</button>
              {!selectedListingClosed && (selectedListing.sellerUserId === (currentUserProfile.userId || user?.id) || adminToolsVisible) ? (
              <button type="button" className="secondary-button" onClick={() => updateMarketplaceListingStatus(selectedListing.id, "Sold", "seller_marked_sold")}>Mark Sold</button>
              ) : null}
              {selectedListing.sellerUserId === (currentUserProfile.userId || user?.id) || adminToolsVisible ? (
                <>
                  <button type="button" className="secondary-button" onClick={() => editMarketplaceListing(selectedListing)}>Edit Listing</button>
                  <button type="button" className="secondary-button" onClick={() => updateMarketplaceListingStatus(selectedListing.id, "Archived", "seller_archived")}>Archive</button>
                </>
              ) : null}
              {adminToolsVisible ? (
                <>
                  <button type="button" className="secondary-button" onClick={() => approveMarketplaceListing(selectedListing.id)}>Approve</button>
                  <button type="button" className="secondary-button" onClick={() => rejectMarketplaceListing(selectedListing.id)}>Reject</button>
                  <button type="button" className="secondary-button" onClick={() => updateMarketplaceListingStatus(selectedListing.id, "Flagged", "admin_flagged")}>Flag</button>
                  <button type="button" className="secondary-button" onClick={() => updateMarketplaceListingStatus(selectedListing.id, "Request Edit", "admin_requested_edit")}>Request Edit</button>
                  <button type="button" className="secondary-button" onClick={() => updateMarketplaceListingStatus(selectedListing.id, "Paused", "admin_paused")}>Pause</button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

      </div>
    );
  }

  return renderMarketplaceSection();
}
