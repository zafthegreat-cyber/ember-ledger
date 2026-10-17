// Rendering is deferred; the owning App retains record state and action handlers.
export default function AdminReviewContent({ scope }) {
  const {
    ADMIN_COMMAND_CENTER_FILTERS,
    AI_FEATURE_AREAS,
    BETA_REVIEW_SECTIONS,
    CommandBoardV4,
    LONG_LIST_PAGE_SIZE,
    PageHeader,
    PaginationControls,
    REVIEW_SECTION_LABELS,
    actualAdminRole,
    adminEditModeActive,
    adminReviewFilter,
    adminReviewIdentityDetail,
    adminReviewIdentityLabel,
    adminReviewPage,
    adminToolsVisible,
    aiEventCountFor,
    betaAccessAllowedForProfile,
    betaAdminVisible,
    betaReadinessData,
    buildStoreMapRows,
    cachedMarketPriceCount,
    currentUserProfile,
    getHeaderCardClass,
    getMarketplaceListingQualityContext,
    getPagedItems,
    getSuggestionReviewSection,
    isEmberAssistSuggestion,
    listingNeedsMarketplaceReview,
    loadSupabaseImportStatus,
    marketplaceReviewPage,
    moderatorToolsVisible,
    normalizeCommunityGuessModerationStatus,
    normalizeEmberAssistMessageStatus,
    normalizeShopReviewStatus,
    openMenuDrawer,
    phase2RecentAiAssistEvents,
    renderAdminCommunityGuessQueue,
    renderAdminOperationsDashboard,
    renderAdminScoutReportQueue,
    renderAdminTidepoolModerationQueue,
    renderBetaAdminReviewQueues,
    renderEmberAssistAdminInbox,
    renderMarketSourceControls,
    renderMarketplaceListingCard,
    renderSuggestionCard,
    roleManagementVisible,
    runAdminReviewAiSummary,
    scoutGuessRows,
    scoutNeedsReviewReports,
    scrollToResultsTop,
    setActiveTab,
    setAdminReviewFilter,
    setAdminReviewPage,
    setMarketplaceReviewPage,
    shorelineState,
    storeLooksLikeCommunityShop,
    suggestions,
    supabaseImportStatus,
    tidepoolPostNeedsModeration,
    tidepoolPosts,
    workspaceMarketplaceListings,
  } = scope;

  function renderAdminReviewPage() {
    if (!adminToolsVisible) {
      return (
        <>
          <PageHeader
            className={getHeaderCardClass("panel admin-page-header")}
            title="Permission Denied"
            subtitle="This area is not available for your account."
            actions={<button type="button" className="secondary-button" onClick={() => setActiveTab("dashboard")}>Go to Hearth</button>}
          />
          <section className="panel admin-permission-denied">
            <h2>Admin role required</h2>
            <p>If you think this is a mistake, contact Ember & Tide support. Local beta users can submit suggestions, but cannot approve shared data, moderate reports, or access admin queues.</p>
            <div className="quick-actions">
              <button type="button" onClick={() => setActiveTab("dashboard")}>Go to Hearth</button>
              <button type="button" className="secondary-button" onClick={() => openMenuDrawer("feedback")}>Open Help & Support</button>
            </div>
          </section>
        </>
      );
    }
    if (moderatorToolsVisible && !betaAdminVisible) {
      const moderatorSections = ["All", "Reports & Moderation", "Scout Report Moderation", "Community Guess Review", REVIEW_SECTION_LABELS.assist || "Ember Assist Inbox"];
      return (
        <>
          <PageHeader
            className={getHeaderCardClass("panel admin-page-header")}
            title="Moderator Command Center"
            subtitle="Limited moderation tools for Scout reports, community guesses, flagged content, and support messages."
            actions={<span className="status-badge">Moderator</span>}
            tabs={moderatorSections.map((section) => ({ key: section, label: section }))}
            activeTab={moderatorSections.includes(adminReviewFilter) ? adminReviewFilter : "All"}
            onTabChange={setAdminReviewFilter}
          />
          <section className="panel approval-page">
            <div className="drawer-info-card">
              <strong>Limited moderator access</strong>
              <p className="compact-subtitle">Moderators can review reports and support messages. Beta approvals, invites, role management, seller data, and admin-only queues stay hidden.</p>
            </div>
            {renderAdminScoutReportQueue()}
            {renderAdminCommunityGuessQueue()}
            {renderAdminTidepoolModerationQueue()}
            {renderEmberAssistAdminInbox()}
          </section>
        </>
      );
    }
    const sections = [...new Set([
      "All",
      ...ADMIN_COMMAND_CENTER_FILTERS.filter((section) => section !== "All"),
      "Reports & Moderation",
      "Scout Report Review",
      "Store Management",
      "Announcements / New Stuff",
      "Family / Kid Accounts",
      "Memberships / Billing",
      "Shops / Seller Verification",
      "Beta Users",
      "Beta Access",
      "Role Management",
      "App Content / Admin Edit",
      "System Health / Logs",
      ...Object.values(REVIEW_SECTION_LABELS),
      ...BETA_REVIEW_SECTIONS,
      "Marketplace Listings",
      "Market Source Controls",
    ])];
    const visibleSuggestions = suggestions.filter((suggestion) => {
      if (adminReviewFilter === "All") return !isEmberAssistSuggestion(suggestion);
      return REVIEW_SECTION_LABELS[getSuggestionReviewSection(suggestion)] === adminReviewFilter;
    });
    const openCount = suggestions.filter((suggestion) => ["Submitted", "Under Review", "Needs More Info"].includes(suggestion.status)).length;
    const listingReviewItems = workspaceMarketplaceListings.filter((listing) => listingNeedsMarketplaceReview(listing, getMarketplaceListingQualityContext(listing)));
    const trustOpenCount =
      scoutNeedsReviewReports.length +
      scoutGuessRows.filter((guess) => normalizeCommunityGuessModerationStatus(guess) === "Pending").length +
      suggestions.filter((suggestion) => isEmberAssistSuggestion(suggestion) && ["New", "In Progress"].includes(normalizeEmberAssistMessageStatus(suggestion))).length +
      buildStoreMapRows().filter((row) => storeLooksLikeCommunityShop(row) && normalizeShopReviewStatus(row.store) === "Needs Review").length +
      tidepoolPosts.filter(tidepoolPostNeedsModeration).length;
    const totalOpenCount = openCount + listingReviewItems.length + trustOpenCount;
    const pagedVisibleSuggestions = getPagedItems(visibleSuggestions, adminReviewPage, LONG_LIST_PAGE_SIZE);
    const pagedListingReviewItems = getPagedItems(listingReviewItems, marketplaceReviewPage, LONG_LIST_PAGE_SIZE);
    const dedicatedAdminFilters = new Set(["Trust Command Center", "Scout Report Moderation", "Scout Report Review", "Community Guess Review", "Family-Friendly Shop Review", "Store Management", "Beta Users", "Role Management"]);
    const openAdminQueue = (filter) => setAdminReviewFilter(filter);
    const adminCommandStatus = [
      { key: "role", icon: "admin", label: "Access", value: actualAdminRole, detail: adminEditModeActive ? "Admin Edit On" : "View mode" },
      { key: "open", icon: "bell", label: "Open queue", value: totalOpenCount, detail: "Needs review" },
      { key: "trust", icon: "scout", label: "Trust queue", value: trustOpenCount, detail: "Scout, shops, posts" },
      { key: "market", icon: "market", label: "Marketplace", value: listingReviewItems.length, detail: "Pricing/listing flags" },
      { key: "identity", icon: "account", label: "Identity", value: adminReviewIdentityLabel, detail: currentUserProfile?.source || "admin" },
    ];
    const adminCommandPlan = [
      { key: "trust", icon: "admin", label: "Trust center", detail: "Highest-risk queue", action: () => openAdminQueue("Trust Command Center") },
      { key: "scout", icon: "scout", label: "Scout review", detail: "Reports and guesses", action: () => openAdminQueue("Scout Report Review") },
      { key: "beta", icon: "account", label: "Beta access", detail: "Users and invites", action: () => openAdminQueue("Beta Access") },
      { key: "kids", icon: "spark", label: "Spark requests", detail: "Family privacy", action: () => openAdminQueue("Kids Program Applications") },
    ];
    const approvedBetaUserCount = (shorelineState.adminProfileUsers || []).filter((entry) => !entry.isAdmin && betaAccessAllowedForProfile(entry)).length;
    const auditLogs = betaReadinessData.auditLogs || [];
    const adminCommandRoutes = [
      { key: "moderation", icon: "admin", label: "Moderation", title: "Reports", detail: `${trustOpenCount} open`, action: () => openAdminQueue("Reports & Moderation") },
      { key: "stores", icon: "scout", label: "Stores", title: "Store management", detail: "Profiles and imports", action: () => openAdminQueue("Store Management") },
      { key: "people", icon: "account", label: "People", title: "Beta users", detail: `${approvedBetaUserCount} approved`, action: () => openAdminQueue("Beta Users") },
      { key: "roles", icon: "admin", label: "Roles", title: "Role controls", detail: roleManagementVisible ? "Protected" : "Locked", action: () => openAdminQueue("Role Management") },
      { key: "market", icon: "market", label: "Market", title: "Source controls", detail: "Catalog and pricing", action: () => openAdminQueue("Market Source Controls") },
      { key: "health", icon: "data", label: "Health", title: "System logs", detail: `${(betaReadinessData.appErrorLogs || []).length + auditLogs.length} notes`, action: () => openAdminQueue("System Health / Logs") },
    ];
    return (
      <>
      <PageHeader
        className={getHeaderCardClass("panel admin-page-header")}
        title="Admin Command Center"
        subtitle="Review, approve, and protect the Ember & Tide community."
        actions={(
          <div className="summary-pill-row">
            <span className="status-badge">{actualAdminRole}</span>
            <span className="status-badge">{totalOpenCount} open</span>
            <button type="button" className="secondary-button" onClick={() => void runAdminReviewAiSummary()}>Summarize review queue</button>
          </div>
        )}
        summary={(
          <div className="settings-header-summary">
            <span>{adminReviewIdentityLabel}</span>
            <span>{currentUserProfile?.source || "admin"}</span>
          </div>
        )}
        tabs={sections.map((section) => ({ key: section, label: section }))}
        activeTab={adminReviewFilter}
        onTabChange={setAdminReviewFilter}
      />
      <CommandBoardV4
        accent="admin"
        className="admin-command-board"
        ariaLabel="Admin Operations Command Center"
        label="Admin"
        title="Admin Operations Center"
        description="Protected review queues for beta access, Scout trust, Tidepool moderation, Marketplace safety, Spark family requests, shop approvals, catalog corrections, and system health."
        primaryAction={{ label: "Summarize Queue", icon: "admin", onClick: () => void runAdminReviewAiSummary() }}
        secondaryActions={[
          { label: "Trust Center", icon: "admin", onClick: () => openAdminQueue("Trust Command Center") },
          { label: "System Health", icon: "data", onClick: () => openAdminQueue("System Health / Logs") },
        ]}
        statusItems={adminCommandStatus}
        plan={{
          label: "Review Plan",
          title: "Triage protected queues before public-facing changes",
          items: adminCommandPlan,
          actions: [
            { label: "Open Beta", icon: "account", onClick: () => openAdminQueue("Beta Access") },
            { label: "Open Moderation", icon: "admin", onClick: () => openAdminQueue("Reports & Moderation") },
          ],
        }}
        routes={adminCommandRoutes}
      />
      {adminReviewFilter !== "All" ? (
        <section className="admin-selected-queue-panel admin-selected-queue-panel--top" role="status">
          <span className="status-badge">Selected queue</span>
          <div>
            <strong>{adminReviewFilter}</strong>
            <p>Review context is focused below. Actions remain permission-protected and empty queues stay visible.</p>
          </div>
        </section>
      ) : null}
      <section className="panel approval-page">
        <div className="drawer-info-card admin-identity-card">
          <strong>{adminReviewIdentityLabel}</strong>
          <p className="compact-subtitle">{adminReviewIdentityDetail}</p>
          {currentUserProfile?.source ? <span className="status-badge">{currentUserProfile.source}</span> : null}
        </div>
        {renderAdminOperationsDashboard()}
        {adminReviewFilter === "Market Source Controls" ? (
        <section className="settings-subsection marketplace-admin-review">
          <div className="compact-card-header">
            <div>
              <h3>Pokemon Import Dashboard</h3>
              <p>Supabase-backed catalog, market price, image, and Virginia retailer ingestion status.</p>
            </div>
            <button type="button" className="secondary-button" onClick={loadSupabaseImportStatus}>
              {supabaseImportStatus.loading ? "Refreshing..." : "Refresh Status"}
            </button>
          </div>
          <div className="admin-command-grid">
            <article className="admin-command-card">
              <span>Review Queue</span>
              <strong>{openCount} shared suggestions</strong>
              <p>{listingReviewItems.length} marketplace listing{listingReviewItems.length === 1 ? "" : "s"} need review.</p>
            </article>
            <article className="admin-command-card">
              <span>Catalog Health</span>
              <strong>{supabaseImportStatus.totalPokemonProducts ?? "N/A"} products</strong>
              <p>{supabaseImportStatus.productsMissingImages ?? "N/A"} missing images, {supabaseImportStatus.productsMissingMarketPrices ?? "N/A"} missing market prices.</p>
            </article>
            <article className="admin-command-card">
              <span>Store Health</span>
              <strong>{supabaseImportStatus.vaStores ?? "N/A"} VA stores</strong>
              <p>Store corrections and restock-pattern suggestions route through review.</p>
            </article>
            <article className="admin-command-card">
              <span>Data Import</span>
              <strong>{supabaseImportStatus.loading ? "Refreshing" : "Ready"}</strong>
              <p>Protected import and provider credentials stay server-side.</p>
            </article>
            <article className="admin-command-card">
              <span>AI Review Log</span>
              <strong>{phase2RecentAiAssistEvents.length} events</strong>
              <p>{aiEventCountFor(AI_FEATURE_AREAS.ADMIN_REVIEW)} admin summary event{aiEventCountFor(AI_FEATURE_AREAS.ADMIN_REVIEW) === 1 ? "" : "s"} logged locally/cloud when available.</p>
            </article>
          </div>
          <details className="admin-detail-panel">
            <summary>Detailed import metrics</summary>
          <div className="cards mini-cards">
            <div className="card"><p>Total Pokemon Products</p><h2>{supabaseImportStatus.totalPokemonProducts ?? "N/A"}</h2></div>
            <div className="card"><p>Sealed Products</p><h2>{supabaseImportStatus.sealedProducts ?? "N/A"}</h2></div>
            <div className="card"><p>Card Products</p><h2>{supabaseImportStatus.cards ?? "N/A"}</h2></div>
            <div className="card"><p>VA Stores</p><h2>{supabaseImportStatus.vaStores ?? "N/A"}</h2></div>
            <div className="card"><p>Market Price Rows</p><h2>{supabaseImportStatus.marketPriceRows ?? "N/A"}</h2></div>
            <div className="card"><p>Price History Rows</p><h2>{supabaseImportStatus.priceHistoryRows ?? "N/A"}</h2></div>
            <div className="card"><p>Products With History</p><h2>{supabaseImportStatus.productsWithHistory ?? "N/A"}</h2></div>
            <div className="card"><p>Latest History Snapshot</p><h2>{supabaseImportStatus.latestHistorySnapshot ? new Date(supabaseImportStatus.latestHistorySnapshot).toLocaleString() : "N/A"}</h2></div>
            <div className="card"><p>Current Price No History</p><h2>{supabaseImportStatus.currentPriceWithoutHistory ?? "N/A"}</h2></div>
            <div className="card"><p>Latest Last Price Checked</p><h2>{supabaseImportStatus.lastPriceChecked ? new Date(supabaseImportStatus.lastPriceChecked).toLocaleString() : "N/A"}</h2></div>
            <div className="card"><p>Products Missing Images</p><h2>{supabaseImportStatus.productsMissingImages ?? "N/A"}</h2></div>
            <div className="card"><p>Products Missing Market Price</p><h2>{supabaseImportStatus.productsMissingMarketPrices ?? "N/A"}</h2></div>
          </div>
          </details>
          <p className="compact-subtitle">Market history import status is shown when the admin status table is available.</p>
          {supabaseImportStatus.errors.length ? (
            <div className="empty-state">
              <h3>Import status notes</h3>
              {supabaseImportStatus.errors.map((error) => {
                const safeError = /schema cache|could not find the table|service role/i.test(String(error || ""))
                  ? "Market history import status unavailable."
                  : error;
                return <p key={error}>{safeError}</p>;
              })}
            </div>
          ) : supabaseImportStatus.totalPokemonProducts === 0 && Number(supabaseImportStatus.marketPriceRows || 0) > 0 ? (
            <div className="empty-state">
              <h3>Catalog rows may be hidden by RLS</h3>
              <p>Market prices and stores are visible, but shared catalog rows are unavailable to the current client role. Check admin database access before expanding beta traffic.</p>
            </div>
          ) : (
            <p className="compact-subtitle">No import status errors reported by the current client. Protected imports remain server-side.</p>
          )}
        </section>
        ) : null}
        {adminReviewFilter !== "All" ? (
        <div className="cards mini-cards">
          {Object.entries(REVIEW_SECTION_LABELS).map(([key, label]) => (
            <button type="button" className="card suggestion-section-card" key={key} onClick={() => setAdminReviewFilter(label)}>
              <p>{label}</p>
              <h2>{suggestions.filter((suggestion) => getSuggestionReviewSection(suggestion) === key).length}</h2>
            </button>
          ))}
          <button type="button" className="card suggestion-section-card" onClick={() => setAdminReviewFilter("Marketplace Listings")}>
            <p>Marketplace Listings</p>
            <h2>{listingReviewItems.length}</h2>
          </button>
          {adminToolsVisible ? (
            <button type="button" className="card suggestion-section-card" onClick={() => setAdminReviewFilter("Market Source Controls")}>
              <p>Market Source Controls</p>
              <h2>{cachedMarketPriceCount}</h2>
            </button>
          ) : null}
        </div>
        ) : null}
        {renderBetaAdminReviewQueues()}
        {adminReviewFilter !== "All" ? renderEmberAssistAdminInbox() : null}
        {adminReviewFilter !== "All" && adminReviewFilter !== "Marketplace Listings" && adminReviewFilter !== "Market Source Controls" && adminReviewFilter !== (REVIEW_SECTION_LABELS.assist || "Ember Assist Inbox") && !dedicatedAdminFilters.has(adminReviewFilter) && !BETA_REVIEW_SECTIONS.includes(adminReviewFilter) ? (
        <div className="inventory-list compact-inventory-list">
          {visibleSuggestions.length ? pagedVisibleSuggestions.items.map((suggestion) => renderSuggestionCard(suggestion, true)) : (
            <div className="empty-state">
              <h3>No review items</h3>
              <p>No suggestions here yet. Suggestions from stores, catalog items, UPC/SKU, market values, and corrections will appear here.</p>
            </div>
          )}
          <PaginationControls
            label="Review Items"
            page={pagedVisibleSuggestions.page}
            pageCount={pagedVisibleSuggestions.pageCount}
            totalCount={pagedVisibleSuggestions.total}
            pageSize={LONG_LIST_PAGE_SIZE}
            onPageChange={(page) => {
              setAdminReviewPage(page);
              scrollToResultsTop();
            }}
            compact
          />
        </div>
        ) : null}
        {adminReviewFilter === "Marketplace Listings" ? (
          <section className="settings-subsection marketplace-admin-review">
            <div className="compact-card-header">
              <div>
                <h3>Marketplace Listing Review</h3>
                <p>Approve, reject, request edits, pause, archive, or feature listings without hard-deleting seller history.</p>
              </div>
              <span className="status-badge">{listingReviewItems.length} listings</span>
            </div>
            <div className="inventory-list compact-inventory-list">
              {listingReviewItems.length ? pagedListingReviewItems.items.map((listing) => renderMarketplaceListingCard(listing, true)) : (
                <div className="empty-state">
                  <h3>No marketplace listings need review</h3>
                  <p>Submitted or flagged listings will appear here.</p>
                </div>
              )}
              <PaginationControls
                label="Listings"
                page={pagedListingReviewItems.page}
                pageCount={pagedListingReviewItems.pageCount}
                totalCount={pagedListingReviewItems.total}
                pageSize={LONG_LIST_PAGE_SIZE}
                onPageChange={(page) => {
                  setMarketplaceReviewPage(page);
                  scrollToResultsTop();
                }}
                compact
              />
            </div>
          </section>
        ) : null}
        {adminReviewFilter === "Market Source Controls" ? renderMarketSourceControls() : null}
      </section>
      </>
    );
  }

  return renderAdminReviewPage();
}
