// App owns state, authority and handlers; only this existing renderer is deferred.
export default function DailyOverviewContent({ scope }) {
  const {
    BETA_LOCAL_MODE,
    PageHeader,
    accountEmail,
    activeVaultItems,
    adminToolsVisible,
    bestMarketMover,
    bestScoutStore,
    betaReadinessData,
    canShowAnnouncement,
    catalogImportStatus,
    commandDeskSellerAccess,
    completeDailyAction,
    currentUserProfile,
    dailyTideToday,
    dashboardPreset,
    filteredTidepoolPosts,
    forgeInventoryItems,
    forgeReceiptRecords,
    forgeReceiptsNeedingReviewCount,
    getHeaderCardClass,
    getPersistedNotificationRows,
    getScoutReportStore,
    guestPreviewActive,
    isWatchedEmberStore,
    marketPriceCache,
    missingSalePriceItems,
    missingSetCardCount,
    money,
    needsMarketCheckItems,
    normalizeDashboardPreset,
    normalizeUserType,
    openAddActionSheet,
    openQuickAddAction,
    scoutNeedsReviewReports,
    scoutReportObservedAt,
    scoutReportRows,
    scoutSnapshot,
    setActiveTab,
    setAdminReviewFilter,
    setScoutSubTabTarget,
    setScoutView,
    setTideTradrSubTab,
    shorelineState,
    shortDate,
    suggestions,
    supabaseImportStatus,
    user,
    userType,
    vaultValue,
    workspaceExpenses,
    workspaceMarketplaceListings,
    workspaceMileageTrips,
    workspaceSales,
    workspaceWatchlist,
  } = scope;

  function renderTodaysTideCommandCenter() {
    const normalizedMode = normalizeUserType(userType);
    const normalizedPreset = normalizeDashboardPreset(dashboardPreset);
    const simpleModeRequested =
      ["budget", "parent"].includes(normalizedMode) ||
      ["simple", "budget_parent"].includes(normalizedPreset);
    const sellerAccessVisible = commandDeskSellerAccess;
    const tideMode = adminToolsVisible
      ? "admin"
      : sellerAccessVisible
        ? "seller"
        : simpleModeRequested
          ? "simple"
          : "collector";
    const activeAnnouncements = getPersistedNotificationRows().filter(canShowAnnouncement).slice(0, 4);
    const currentScopedUserId = String(currentUserProfile?.userId || currentUserProfile?.id || user?.id || "local-beta");
    const currentScopedEmail = String(accountEmail() || "").trim().toLowerCase();
    const isCurrentUserRecord = (entry = {}) => {
      const entryUserId = String(entry.userId || entry.user_id || entry.ownerId || entry.owner_id || "").trim();
      const entryEmail = String(entry.email || entry.guestEmail || entry.guest_email || "").trim().toLowerCase();
      if (entryUserId && entryUserId === currentScopedUserId) return true;
      if (entryEmail && currentScopedEmail && entryEmail === currentScopedEmail) return true;
      return !entryUserId && !entryEmail && (BETA_LOCAL_MODE || guestPreviewActive);
    };
    const adminBetaAccessRows = adminToolsVisible
      ? [
          ...(shorelineState.adminBetaRequests || []),
          ...(betaReadinessData.betaAccessUsers || []),
        ]
      : [];
    const adminKidsApplicationRows = adminToolsVisible
      ? [
          ...(shorelineState.adminLittleSparksApplications || []),
          ...(betaReadinessData.kidsApplications || []),
        ]
      : [];
    const userKidsApplicationRows = [
      shorelineState.littleSparksApplication,
      ...(betaReadinessData.kidsApplications || []).filter(isCurrentUserRecord),
    ].filter(Boolean);
    const pendingBetaRequests = adminBetaAccessRows
      .filter((entry) => ["pending", "paused", "requested"].includes(entry.status || "pending")).length;
    const pendingKidsRequests = adminKidsApplicationRows
      .filter((entry) => ["pending", "pending_review"].includes(entry.status || "pending")).length;
    const pendingFeedbackCount = adminToolsVisible ? (betaReadinessData.betaFeedback || [])
      .filter((entry) => ["new", "reviewing", "pending"].includes(entry.status || "new")).length +
      (betaReadinessData.appErrorLogs || []).length : 0;
    const pendingSuggestionCount = adminToolsVisible ? suggestions.filter((entry) =>
      ["Submitted", "Under Review", "Needs More Info"].includes(entry.status)
    ).length : 0;
    const marketReviewCount = adminToolsVisible ? workspaceMarketplaceListings.filter((listing) =>
      listing.flagged ||
      /pending|review|flag|reported/i.test(`${listing.status || ""} ${listing.moderationStatus || ""} ${listing.reviewStatus || ""}`)
    ).length : 0;
    const followedStores = (scoutSnapshot.stores || []).filter(isWatchedEmberStore);
    const followedStoreIds = new Set(followedStores.map((store) => String(store.id || store.storeId || store.store_id || "")).filter(Boolean));
    const scoutReportMatchesFollowedStore = (report = {}) => {
      const store = getScoutReportStore(report);
      const reportStoreId = String(report.storeId || report.store_id || store.id || "").trim();
      return Boolean(
        report.favoriteStore ||
        report.favorite_store ||
        (reportStoreId && followedStoreIds.has(reportStoreId)) ||
        isWatchedEmberStore(store)
      );
    };
    const isConfirmedScoutSignal = (report = {}) =>
      Boolean(report.verified || /verified|confirmed/i.test(`${report.status || ""} ${report.confidence || ""} ${report.verificationStatus || report.verification_status || ""}`));
    const latestScoutReport = scoutReportRows.find((report) => scoutReportMatchesFollowedStore(report) && isConfirmedScoutSignal(report)) ||
      scoutReportRows.find(isConfirmedScoutSignal) ||
      scoutReportRows.find(scoutReportMatchesFollowedStore) ||
      scoutReportRows[0];
    const latestScoutStore = latestScoutReport ? getScoutReportStore(latestScoutReport) : bestScoutStore;
    const latestScoutStoreName = latestScoutStore?.name || latestScoutReport?.storeName || latestScoutReport?.store_name || bestScoutStore?.name || (followedStores.length ? "your followed stores" : "nearby stores");
    const latestScoutItem = latestScoutReport?.itemName || latestScoutReport?.item_name || latestScoutReport?.productName || latestScoutReport?.product_name || "Pokemon stock";
    const latestScoutTime = latestScoutReport
      ? shortDate(scoutReportObservedAt(latestScoutReport))
      : "";
    const receiptsNeedingReviewCount = forgeReceiptsNeedingReviewCount;
    const forgePricingTaskCount = needsMarketCheckItems.length + missingSalePriceItems.length;
    const kidsApplications = adminToolsVisible ? adminKidsApplicationRows : userKidsApplicationRows;
    const catalogFreshnessSource = supabaseImportStatus.lastPriceChecked || catalogImportStatus.lastImportedAt || marketPriceCache.lastSync || "";
    const catalogFreshnessLabel = catalogFreshnessSource ? shortDate(catalogFreshnessSource) : "";
    const openScoutToday = () => {
      setActiveTab("scout");
      setScoutView("overview");
      setScoutSubTabTarget({ tab: "overview", id: Date.now() });
    };
    const checklistItems = [
      adminToolsVisible && pendingBetaRequests ? {
        key: "admin_beta_requests",
        priority: "urgent",
        area: "Admin",
        title: "Review beta access requests",
        reason: `${pendingBetaRequests} request${pendingBetaRequests === 1 ? "" : "s"} need an admin decision.`,
        actionLabel: "Open Queue",
        onAction: () => {
          setAdminReviewFilter("Beta Access");
          setActiveTab("adminReview");
        },
        badge: "scout_verified",
      } : null,
      adminToolsVisible && pendingKidsRequests ? {
        key: "admin_kids_requests",
        priority: "urgent",
        area: "Kids",
        title: "Review Kids Program requests",
        reason: `${pendingKidsRequests} family request${pendingKidsRequests === 1 ? "" : "s"} need review.`,
        actionLabel: "Review Requests",
        onAction: () => {
          setAdminReviewFilter("Kids Program Applications");
          setActiveTab("adminReview");
        },
        badge: "budget_boss",
      } : null,
      adminToolsVisible && scoutNeedsReviewReports.length ? {
        key: "admin_scout_review",
        priority: "urgent",
        area: "Scout",
        title: "Verify Scout reports",
        reason: `${scoutNeedsReviewReports.length} report${scoutNeedsReviewReports.length === 1 ? "" : "s"} need moderation before they shape trust signals.`,
        actionLabel: "Open Scout Review",
        onAction: () => {
          setAdminReviewFilter("Scout Report Review");
          setActiveTab("adminReview");
        },
        badge: "scout_verified",
      } : null,
      sellerAccessVisible && receiptsNeedingReviewCount ? {
        key: "forge_receipts",
        priority: "urgent",
        area: "Forge",
        title: "Review receipts",
        reason: `${receiptsNeedingReviewCount} receipt${receiptsNeedingReviewCount === 1 ? "" : "s"} need review before profit reports are accurate.`,
        actionLabel: "Review Receipts",
        onAction: () => setActiveTab("expenses"),
        badge: "forge_starter",
      } : null,
      latestScoutReport ? {
        key: "scout",
        priority: tideMode === "seller" ? "optional" : "today",
        area: "Scout",
        title: `${latestScoutStoreName} has a Scout signal`,
        reason: `${latestScoutItem}${latestScoutTime ? ` reported ${latestScoutTime}` : " reported recently"}.`,
        actionLabel: "Open Scout",
        onAction: openScoutToday,
        badge: "restock_reporter",
      } : {
        key: "scout",
        priority: "today",
        area: "Scout",
        title: "Follow stores to improve Scout Signals",
        reason: "Store history gets more useful after you follow stores or submit a report.",
        actionLabel: "Open Scout",
        onAction: openScoutToday,
        badge: "restock_reporter",
      },
      !activeVaultItems.length ? {
        key: "vault",
        priority: tideMode === "simple" ? "today" : "optional",
        area: "Vault",
        title: "Add items to Vault",
        reason: "Vault changes and collection tasks appear after your first saved item.",
        actionLabel: "Add to Vault",
        onAction: () => openQuickAddAction("vaultItem"),
        badge: "vault_builder",
      } : {
        key: "vault",
        priority: "today",
        area: "Vault",
        title: "Review Vault changes",
        reason: `${activeVaultItems.length} item${activeVaultItems.length === 1 ? "" : "s"} tracked. Collection value is ${money(vaultValue)}.`,
        actionLabel: "Open Vault",
        onAction: () => setActiveTab("vault"),
        badge: "vault_builder",
      },
      bestMarketMover ? {
        key: "market",
        priority: "today",
        area: "Market",
        title: "Check watched market value",
        reason: `${bestMarketMover.name || bestMarketMover.productName || bestMarketMover.cardName || "A watched item"} is ready for a fair-price check.`,
        actionLabel: "Open Market",
        onAction: () => setActiveTab("market"),
        badge: "market_watcher",
      } : {
        key: "market",
        priority: "optional",
        area: "Market",
        title: "Create a market alert",
        reason: "Watch fair deals, price drops, and near-retail opportunities.",
        actionLabel: "Open Market",
        onAction: () => {
          setActiveTab("market");
          setTideTradrSubTab("watch");
        },
        badge: "market_watcher",
      },
      sellerAccessVisible && forgePricingTaskCount ? {
        key: "forge_pricing",
        priority: "today",
        area: "Forge",
        title: "Update Forge pricing",
        reason: `${forgePricingTaskCount} item${forgePricingTaskCount === 1 ? "" : "s"} need market or planned sale values.`,
        actionLabel: "Open Forge",
        onAction: () => setActiveTab("inventory"),
        badge: "forge_starter",
      } : null,
      sellerAccessVisible && !workspaceExpenses.length && !forgeReceiptRecords.length ? {
        key: "forge_receipt_start",
        priority: "optional",
        area: "Forge",
        title: "Add a receipt to start Forge tracking",
        reason: "Receipts keep cost basis and profit reports honest.",
        actionLabel: "Add Receipt",
        onAction: () => openQuickAddAction("receipt"),
        badge: "forge_starter",
      } : null,
      sellerAccessVisible && !workspaceMileageTrips.length ? {
        key: "forge_mileage",
        priority: "optional",
        area: "Forge",
        title: "Log mileage if you made a store trip",
        reason: "Mileage reminders keep seller records complete without crowding collection tools.",
        actionLabel: "Open Mileage",
        onAction: () => setActiveTab("mileage"),
        badge: "forge_starter",
      } : null,
      (tideMode === "simple" || kidsApplications.length) ? {
        key: "kids",
        priority: pendingKidsRequests && adminToolsVisible ? "urgent" : "optional",
        area: "Kids",
        title: kidsApplications.length ? "Check Kids Program updates" : "Request Kids Program access",
        reason: kidsApplications.length ? `${kidsApplications.length} Kids Program record${kidsApplications.length === 1 ? "" : "s"} available.` : "Parent-approved requests and safety rules live in The Spark.",
        actionLabel: "Open Spark",
        onAction: () => setActiveTab("kidsProgram"),
        badge: "budget_boss",
      } : null,
      filteredTidepoolPosts[0] ? {
        key: "tidepool",
        priority: "optional",
        area: "Tidepool",
        title: "Community highlight",
        reason: filteredTidepoolPosts[0].title || filteredTidepoolPosts[0].body || "A Tidepool post is ready to review.",
        actionLabel: "Open Tidepool",
        onAction: () => setActiveTab("tidepool"),
        badge: "tidepool_helper",
      } : null,
      activeAnnouncements[0] ? {
        key: "announcement",
        priority: "today",
        area: "Announcement",
        title: activeAnnouncements[0].title || "New Code 3 TCG update",
        reason: activeAnnouncements[0].body || activeAnnouncements[0].message || "Review the latest app update.",
        actionLabel: "View Details",
        onAction: () => setActiveTab("whatsNew"),
        badge: "first_scan",
      } : null,
      adminToolsVisible && (marketReviewCount || pendingFeedbackCount || pendingSuggestionCount) ? {
        key: "admin_feedback",
        priority: "optional",
        area: "Admin",
        title: "Review feedback and moderation",
        reason: `${marketReviewCount + pendingFeedbackCount + pendingSuggestionCount} feedback, listing, or suggestion row${marketReviewCount + pendingFeedbackCount + pendingSuggestionCount === 1 ? "" : "s"} available.`,
        actionLabel: "Open Admin",
        onAction: () => setActiveTab("adminReview"),
        badge: "scout_verified",
      } : null,
      adminToolsVisible && catalogFreshnessLabel ? {
        key: "catalog_freshness",
        priority: "optional",
        area: "Catalog",
        title: "Check catalog and pricing freshness",
        reason: `Latest loaded catalog or pricing update: ${catalogFreshnessLabel}.`,
        actionLabel: "Open Admin",
        onAction: () => setActiveTab("adminReview"),
        badge: "first_scan",
      } : null,
    ].filter(Boolean);
    const priorityOrder = { urgent: 0, today: 1, optional: 2 };
    const sortedChecklistItems = checklistItems.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    const incompleteChecklistItems = sortedChecklistItems.filter((item) => !dailyTideToday.completedActions?.[item.key]);
    const completedChecklistItems = sortedChecklistItems.filter((item) => dailyTideToday.completedActions?.[item.key]);
    const bestActionItem = incompleteChecklistItems[0] || {
      key: "calm",
      area: "Scout",
      title: "No urgent actions today",
      reason: "Check Scout Signals or add the next useful item when you have time.",
      actionLabel: "Check Scout Signals",
      onAction: openScoutToday,
      badge: "market_watcher",
    };
    const groupedChecklist = ["urgent", "today", "optional"].map((priority) => ({
      key: priority,
      label: priority === "urgent" ? "Urgent" : priority === "today" ? "Today" : "Optional",
      items: incompleteChecklistItems.filter((item) => item.priority === priority),
    })).filter((group) => group.items.length);
    const tideSummaryCards = [
      {
        key: "scout",
        area: "Scout Signals",
        title: latestScoutReport ? latestScoutStoreName : "No verified signals nearby yet",
        value: followedStores.length ? `${followedStores.length} followed` : scoutReportRows.length || 0,
        detail: latestScoutReport ? `${latestScoutItem}${latestScoutTime ? ` | ${latestScoutTime}` : ""}` : "Follow stores or submit the first signal.",
        actionLabel: "Open Scout",
        onClick: openScoutToday,
        accent: "scout",
      },
      {
        key: "vault",
        area: "Vault Changes",
        title: activeVaultItems.length ? `${activeVaultItems.length} items tracked` : "Collection starts here",
        value: money(vaultValue),
        detail: activeVaultItems.length ? `${missingSetCardCount} missing set card${missingSetCardCount === 1 ? "" : "s"} visible from Vault Sets.` : "Add items to track collection value and changes.",
        actionLabel: activeVaultItems.length ? "Open Vault" : "Add Item",
        onClick: () => activeVaultItems.length ? setActiveTab("vault") : openQuickAddAction("vaultItem"),
        accent: "vault",
      },
      {
        key: "market",
        area: "Market Watch / Offers",
        title: bestMarketMover?.name || bestMarketMover?.productName || "No watched deals yet",
        value: bestMarketMover ? money(bestMarketMover.marketPrice || bestMarketMover.marketValue || 0) : workspaceWatchlist.length,
        detail: bestMarketMover ? "Compare fair price before buying, selling, or trading." : "Create a watchlist for fair deals and price drops.",
        actionLabel: "Open Market",
        onClick: () => setActiveTab("market"),
        accent: "market",
      },
      sellerAccessVisible ? {
        key: "forge",
        area: "Forge Tasks",
        title: forgePricingTaskCount || receiptsNeedingReviewCount ? "Seller tasks need attention" : "Forge is steady",
        value: forgePricingTaskCount + receiptsNeedingReviewCount,
        detail: `${forgeInventoryItems.length} inventory item${forgeInventoryItems.length === 1 ? "" : "s"}, ${workspaceSales.length} sale${workspaceSales.length === 1 ? "" : "s"}, ${workspaceExpenses.length} expense${workspaceExpenses.length === 1 ? "" : "s"}.`,
        actionLabel: "Open Forge",
        onClick: () => setActiveTab("inventory"),
        accent: "forge",
      } : null,
      (tideMode === "simple" || kidsApplications.length || adminToolsVisible) ? {
        key: "kids",
        area: "Kids Program",
        title: kidsApplications.length ? "Kids Program updates available" : "Parent-safe access",
        value: kidsApplications.length,
        detail: kidsApplications.length ? "Review family requests or updates." : "Requests, rules, and family safety live in The Spark.",
        actionLabel: "Open Spark",
        onClick: () => setActiveTab("kidsProgram"),
        accent: "spark",
      } : null,
      filteredTidepoolPosts[0] ? {
        key: "tidepool",
        area: "Tidepool",
        title: filteredTidepoolPosts[0].title || "Community activity",
        value: filteredTidepoolPosts.length,
        detail: filteredTidepoolPosts[0].body || "Open community highlights.",
        actionLabel: "Open Tidepool",
        onClick: () => setActiveTab("tidepool"),
        accent: "tide",
      } : null,
      activeAnnouncements[0] ? {
        key: "announcements",
        area: "Announcements",
        title: activeAnnouncements[0].title || "New update",
        value: activeAnnouncements.length,
        detail: activeAnnouncements[0].body || activeAnnouncements[0].message || "Review the latest update.",
        actionLabel: "View Details",
        onClick: () => setActiveTab("whatsNew"),
        accent: "gold",
      } : null,
      adminToolsVisible && catalogFreshnessLabel ? {
        key: "catalog",
        area: "Catalog Freshness",
        title: "Catalog and pricing status",
        value: catalogFreshnessLabel,
        detail: "Shown only when catalog or market-price status has already loaded.",
        actionLabel: "Open Admin",
        onClick: () => setActiveTab("adminReview"),
        accent: "gold",
      } : null,
    ].filter(Boolean);

    function markTideChecklistItemComplete(item) {
      completeDailyAction(item.key, { badge: item.badge || "market_watcher", points: item.priority === "urgent" ? 12 : 8 });
    }

    return (
      <div className={`dashboard-layout todays-tide-command-view tide-mode-${tideMode}`}>
        <PageHeader
          className={getHeaderCardClass("panel page-summary-card todays-tide-header")}
          title="Today's Tide"
          subtitle="What needs my attention today?"
          actions={(
            <>
              <button type="button" onClick={() => openAddActionSheet("todays-tide")}>Quick Add</button>
              <button type="button" className="secondary-button" onClick={() => setActiveTab("dashboard")}>Go Home</button>
            </>
          )}
        />

        <section className={`panel todays-tide-best-action todays-tide-best-${tideMode}`} aria-label="Today's best action">
          <div className="todays-tide-best-copy">
            <div className="hearth-card-kicker-row">
              <p className="section-kicker">Today&apos;s Best Action</p>
              <span className="hearth-mode-badge">{tideMode === "admin" ? "Admin" : tideMode === "seller" ? "Seller" : tideMode === "simple" ? "Simple" : "Collector"}</span>
            </div>
            <span className="hearth-trust-badge">{bestActionItem.area}</span>
            <h2>{bestActionItem.title}</h2>
            <p>{bestActionItem.reason}</p>
            <div className="todays-tide-best-actions">
              <button type="button" onClick={bestActionItem.onAction}>{bestActionItem.actionLabel}</button>
              {bestActionItem.key !== "calm" ? <button type="button" className="secondary-button" onClick={() => markTideChecklistItemComplete(bestActionItem)}>Mark Complete</button> : null}
            </div>
          </div>
          <div className="todays-tide-art" aria-hidden="true">
            <span className="todays-tide-art-flame" />
            <span className="todays-tide-art-wave" />
            <span className="todays-tide-art-check one" />
            <span className="todays-tide-art-check two" />
          </div>
        </section>

        <section className="panel todays-tide-checklist-panel" aria-label="Today's checklist">
          <div className="compact-card-header">
            <div>
              <h2>Today&apos;s Checklist</h2>
              <p>Short, useful tasks grouped by priority. Complete what matters and leave the rest.</p>
            </div>
            <span className="status-badge">{completedChecklistItems.length}/{sortedChecklistItems.length || 1} done</span>
          </div>
          {groupedChecklist.length ? groupedChecklist.map((group) => (
            <div className="todays-tide-checklist-group" key={group.key}>
              <h3>{group.label}</h3>
              <div className="todays-tide-task-list">
                {group.items.map((item) => (
                  <article className={`todays-tide-task-card todays-tide-priority-${item.priority}`} key={item.key}>
                    <span className={`todays-tide-source-badge source-${String(item.area).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{item.area}</span>
                    <div>
                      <h4>{item.title}</h4>
                      <p>{item.reason}</p>
                    </div>
                    <div className="todays-tide-task-actions">
                      <button type="button" className="secondary-button" onClick={item.onAction}>{item.actionLabel}</button>
                      <button type="button" className="ghost-button" onClick={() => markTideChecklistItemComplete(item)}>Mark complete</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )) : (
            <div className="small-empty-state todays-tide-empty-state">
              <strong>No urgent actions today.</strong>
              <p>Check Scout Signals, add to your Vault, or make a market alert when you are ready.</p>
              <button type="button" className="secondary-button" onClick={openScoutToday}>Check Scout Signals</button>
            </div>
          )}
        </section>

        <section className="todays-tide-summary-grid" aria-label="Daily report sections">
          {tideSummaryCards.map((card) => (
            <article className={`panel todays-tide-summary-card hearth-accent-${card.accent}`} key={card.key}>
              <p className="section-kicker">{card.area}</p>
              <h3>{card.title}</h3>
              <strong>{card.value}</strong>
              <p>{card.detail}</p>
              <button type="button" className="secondary-button" onClick={card.onClick}>{card.actionLabel}</button>
            </article>
          ))}
        </section>

        <details className="panel todays-tide-completed-section">
          <summary>
            <span>Completed Today</span>
            <b>{completedChecklistItems.length}</b>
          </summary>
          {completedChecklistItems.length ? (
            <div className="todays-tide-completed-list">
              {completedChecklistItems.map((item) => (
                <span key={item.key}>
                  <strong>{item.area}</strong>
                  {item.title}
                </span>
              ))}
            </div>
          ) : (
            <p>No checklist items completed yet today.</p>
          )}
        </details>
      </div>
    );
  }

  return renderTodaysTideCommandCenter();
}
