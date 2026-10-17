import { LiveEmberTrustNote } from "../components/ember-ui";
import { BRAND_ASSETS } from "../brand/emberTideBrand";
import {
  AppNavIcon,
  EtMockupActionCard,
  EtMockupButton,
  EtMockupEmptyState,
  EtMockupHero,
  EtMockupIcon,
  EtMockupPageShell,
  EtMockupPill,
  EtMockupRightRail,
  EtMockupSectionCard,
  EtMockupStatCard,
  FlowNextActionCard,
} from "../components/command-system";

export default function HearthPage(props) {
  const {
    BETA_LOCAL_MODE,
    GRADE_ASSIST_LOCAL_STORAGE_KEY,
    HEARTH_FOUNDATION_SCREEN,
    HEARTH_FOUNDATION_TRUST_MESSAGE,
    PUBLIC_APP_VERSION_LABEL,
    REVIEW_SECTION_LABELS,
    accountEmail,
    activeVaultItems,
    adaptiveSellerToolsVisible,
    adaptiveUiState,
    adminEditModeActive,
    adminToolsVisible,
    adminViewingAsAdmin,
    appUpdate,
    bestMarketMover,
    bestScoutStore,
    betaAccessAllowed,
    betaReadinessData,
    buildAdminCommandCenterSummary,
    buildStoreMapRows,
    canShowAnnouncement,
    catalogImportStatus,
    collectorEventPlans,
    createQuickAddWizardState,
    currentUserProfile,
    dailyTideToday,
    featureAllowed,
    forgeInventoryItems,
    forgeReceiptRecords,
    forgeReceiptsNeedingReviewCount,
    getLocalDateKey,
    getPersistedNotificationRows,
    getScoutReportStore,
    getSuggestionReviewSection,
    guestPreviewActive,
    hearthDetailsExpanded,
    homeRecentActivity,
    isEmberAssistSuggestion,
    isOffline,
    isWatchedEmberStore,
    items,
    latestVaultActivityItem,
    marketPriceCache,
    marketPriceMemories,
    missingSalePriceItems,
    missingSetCardCount,
    money,
    monthlyProfitLoss,
    needsMarketCheckItems,
    normalizeDailyTideState,
    normalizeVaultStatus,
    openAddActionSheet,
    openCollectorEventPlannerFlow,
    openCollectorEventPlannerSurface,
    openEmberAssistPanel,
    openFlowModal,
    openMarketPriceMemoryFlow,
    openPublicBetaFeedback,
    openQuickAddAction,
    openSparkKidPackFlow,
    openTradeCompassFlow,
    openTradeValueFlow,
    openUtilityPage,
    openVaultDisplayCaseSurface,
    openWishlistIsoSurface,
    profileForm,
    recentVaultItems,
    renderOnboardingPanel,
    renderUpgradeValuePreview,
    requestConfirmation,
    requestLockedFeatureAccess,
    resolveHearthSmartNextAction,
    safeReadBrowserJson,
    scoutGuessRows,
    scoutNeedsReviewReports,
    scoutReportObservedAt,
    scoutReportPhotoUrls,
    scoutReportRows,
    scoutReportStatusLabel,
    scoutReportSubmittedAt,
    scoutSnapshot,
    setActiveTab,
    setAdminReviewFilter,
    setDailyTide,
    setHearthDetailsExpanded,
    setQuickAddWizard,
    setTideTradrSubTab,
    setVaultSubTab,
    shopReviewBadges,
    shorelineState,
    shortDate,
    shouldRenderFirstRunOnboarding,
    showInfoToast,
    smartSetupPreferences,
    sparkGifts,
    sparkKidPacks,
    statusLabel,
    storeLooksLikeCommunityShop,
    subscriptionProfile,
    suggestions,
    summarizeCollectorEventPlans,
    supabaseImportStatus,
    tidepoolPosts,
    tidepoolTrustedCircle,
    totalBusinessMiles,
    totalSalesRevenue,
    tradeRecords,
    user,
    vaultCollectionSets,
    vaultItemDisplayImage,
    vaultStatusLabel,
    vaultValue,
    visibleReceiptRecords,
    visibleVaultDisplayCase,
    wishlistIsoHighPriority,
    wishlistIsoPlannerItems,
    workspaceExpenses,
    workspaceMarketplaceListings,
    workspaceMileageTrips,
    workspaceSales,
    workspaceTradeRecords,
    workspaceWatchlist,
  } = props;

  function renderHearthHomeCommandView() {
      const sellerAccessVisible = adaptiveSellerToolsVisible;
      const hearthMode = adminToolsVisible ? "admin" : adaptiveUiState.hearthMode;
      const hearthAdaptiveState = adminToolsVisible
        ? { ...adaptiveUiState, showAdminTools: true, showModeratorTools: true, showSellerTools: false }
        : adaptiveUiState;
      const hearthModeLabel = adminToolsVisible ? "Admin command view" : adaptiveUiState.modeLabel;
      const activeAnnouncements = getPersistedNotificationRows().filter(canShowAnnouncement).slice(0, 3);
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
        Boolean(report.verified || report.confidence === "verified" || /verified|confirmed/i.test(`${report.status || ""} ${report.confidence || ""} ${report.verificationStatus || report.verification_status || ""}`));
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
      const forgeReviewCount = receiptsNeedingReviewCount + needsMarketCheckItems.length + missingSalePriceItems.length;
      const kidsApplication = userKidsApplicationRows[0] || null;
      const hearthFreshReports = scoutReportRows.filter((report) => {
        const observedAt = new Date(scoutReportObservedAt(report)).getTime();
        return Number.isFinite(observedAt) && (Date.now() - observedAt) < 2 * 60 * 60 * 1000;
      }).length;
      const hearthSmartGuidance = resolveHearthSmartNextAction(hearthAdaptiveState, {
        vaultItems: activeVaultItems.length,
        scoutReports: scoutReportRows.length,
        freshScoutReports: hearthFreshReports,
        hasTrustedScoutSignal: Boolean(latestScoutReport && isConfirmedScoutSignal(latestScoutReport)),
        pendingAdminCount: pendingBetaRequests + pendingKidsRequests + scoutNeedsReviewReports.length + pendingFeedbackCount + pendingSuggestionCount + marketReviewCount,
        kidsProgramFocus: Boolean(adaptiveUiState.familyMode && !kidsApplication),
      });
      const hearthHasVaultItems = activeVaultItems.length > 0;
      const renderSmartGuidanceAction = () => {
        if (!hearthSmartGuidance) return null;
        if (hearthSmartGuidance.key === "admin_review") return {
          ...hearthSmartGuidance,
          onPrimary: () => setActiveTab("adminReview"),
          onSecondary: () => setActiveTab("dashboard"),
        };
        if (hearthSmartGuidance.key === "seller_progress") return {
          ...hearthSmartGuidance,
          onPrimary: () => setActiveTab("inventory"),
          onSecondary: () => openAddActionSheet("hearth-seller"),
        };
        if (hearthSmartGuidance.key === "spark_focus") return {
          ...hearthSmartGuidance,
          onPrimary: () => setActiveTab("kidsProgram"),
          onSecondary: () => openQuickAddAction("vaultItem"),
        };
        if (hearthSmartGuidance.key === "first_scout_report") return {
          ...hearthSmartGuidance,
          onPrimary: () => openQuickAddAction("storeReport"),
          onSecondary: () => setActiveTab("scout"),
        };
        if (hearthSmartGuidance.key === "fresh_scout_signals") return {
          ...hearthSmartGuidance,
          onPrimary: () => setActiveTab("scout"),
          onSecondary: () => openQuickAddAction("storeReport"),
        };
        if (hearthSmartGuidance.key === "start_collection" && hearthHasVaultItems) return {
          ...hearthSmartGuidance,
          title: "Review recent Vault additions",
          reason: "Your protected collection is already started. Add one card or sealed product, then review before saving.",
          primaryLabel: "Open Vault",
          onPrimary: () => setActiveTab("vault"),
          onSecondary: () => openQuickAddAction("vaultItem"),
        };
        return {
          ...hearthSmartGuidance,
          onPrimary: () => openQuickAddAction("vaultItem"),
          onSecondary: () => setActiveTab(hearthSmartGuidance.key === "start_collection" ? "market" : "scout"),
        };
      };
      const catalogFreshnessSource = supabaseImportStatus.lastPriceChecked || catalogImportStatus.lastImportedAt || marketPriceCache.lastSync || "";
      const catalogFreshnessLabel = catalogFreshnessSource ? shortDate(catalogFreshnessSource) : "";
      const getStartedCards = [
        {
          key: "start-collection",
          eyebrow: "Vault",
          title: "Start your collection",
          detail: "Add your first card or sealed product so the app can track what you own.",
          cta: "Add to Vault",
          onClick: () => openQuickAddAction("vaultItem"),
          accent: "vault",
        },
        {
          key: "follow-stores",
          eyebrow: "Scout",
          title: "Follow stores near you",
          detail: "Scout gets smarter when your nearby stores and reports are in one place.",
          cta: "Open Scout",
          onClick: () => setActiveTab("scout"),
          accent: "scout",
        },
        {
          key: "market-alert",
          eyebrow: "Market Watch",
          title: "Try one Market search",
          detail: "Research a card or sealed product without checkout, live-stock, or guaranteed-price pressure.",
          cta: "Open Market",
          onClick: () => {
            setActiveTab("market");
            setTideTradrSubTab("overview");
          },
          accent: "market",
        },
        {
          key: "kids-access",
          eyebrow: "Spark",
          title: "Request Kids Program access",
          detail: "Parent-safe requests and kid-focused collecting stay separate from selling tools.",
          cta: "Open Kids Program",
          onClick: () => setActiveTab("kidsProgram"),
          accent: "spark",
        },
        {
          key: "first-receipt",
          eyebrow: "Forge",
          title: "Add your first receipt",
          detail: "Receipts keep profit, inventory cost, and seller reporting accurate.",
          cta: "Add Receipt",
          onClick: () => openQuickAddAction("receipt"),
          accent: "forge",
          sellerOnly: true,
        },
      ].filter((card) => !card.sellerOnly || sellerAccessVisible);
      const bestAction = (() => {
        if (hearthMode === "admin") {
          if (pendingBetaRequests) return {
            badge: "Admin",
            title: `${pendingBetaRequests} beta access request${pendingBetaRequests === 1 ? "" : "s"} need review`,
            reason: "Approvals should be handled before regular app tasks.",
            primaryLabel: "Open Admin Review",
            onPrimary: () => {
              setAdminReviewFilter("Beta Access");
              setActiveTab("adminReview");
            },
            secondaryLabel: "Go Home",
            onSecondary: () => setActiveTab("dashboard"),
          };
          if (pendingKidsRequests) return {
            badge: "Kids Program",
            title: `${pendingKidsRequests} Kids Program request${pendingKidsRequests === 1 ? "" : "s"} need review`,
            reason: "Family-safe access requests are waiting for an admin decision.",
            primaryLabel: "Review Requests",
            onPrimary: () => {
              setAdminReviewFilter("Kids Program Applications");
              setActiveTab("adminReview");
            },
            secondaryLabel: "Open Spark",
            onSecondary: () => setActiveTab("kidsProgram"),
          };
          if (scoutNeedsReviewReports.length) return {
            badge: "Scout",
            title: `${scoutNeedsReviewReports.length} Scout report${scoutNeedsReviewReports.length === 1 ? "" : "s"} need moderation`,
            reason: "Verified reports protect store history and restock predictions.",
            primaryLabel: "Review Scout",
            onPrimary: () => {
              setAdminReviewFilter("Scout Report Review");
              setActiveTab("adminReview");
            },
            secondaryLabel: "Open Scout",
            onSecondary: () => setActiveTab("scout"),
          };
        }
        if (hearthMode === "seller") {
          if (receiptsNeedingReviewCount) return {
            badge: "Forge",
            title: `${receiptsNeedingReviewCount} receipt${receiptsNeedingReviewCount === 1 ? "" : "s"} need review`,
            reason: "Profit and inventory cost stay accurate when receipts are reviewed.",
            primaryLabel: "Review Receipts",
            onPrimary: () => setActiveTab("expenses"),
            secondaryLabel: "Open Forge",
            onSecondary: () => setActiveTab("inventory"),
          };
          if (needsMarketCheckItems.length || missingSalePriceItems.length) return {
            badge: "Forge",
            title: `${needsMarketCheckItems.length + missingSalePriceItems.length} inventory item${needsMarketCheckItems.length + missingSalePriceItems.length === 1 ? "" : "s"} need pricing`,
            reason: "Market value and planned sale prices keep seller decisions current.",
            primaryLabel: "Open Forge",
            onPrimary: () => setActiveTab("inventory"),
            secondaryLabel: "Check Market",
            onSecondary: () => setActiveTab("market"),
          };
          const sellerGuidance = renderSmartGuidanceAction();
          if (sellerGuidance?.key === "seller_progress") return sellerGuidance;
        }
        if (hearthMode === "simple") {
          if (!activeVaultItems.length) return {
            badge: "Vault",
            title: "Add your first item to Vault",
            reason: "Start by adding a card, sealed product, or binder item so Hearth can guide your next step.",
            primaryLabel: "Add Item to Vault",
            onPrimary: () => openQuickAddAction("vaultItem"),
            secondaryLabel: "Search Market",
            onSecondary: () => setActiveTab("market"),
          };
          const simpleGuidance = renderSmartGuidanceAction();
          if (["spark_focus", "start_collection", "first_scout_report", "fresh_scout_signals", "default_collection"].includes(simpleGuidance?.key)) return simpleGuidance;
          if (latestScoutReport) return {
            badge: latestScoutReport.verified ? "Verified" : "Scout",
            title: `${latestScoutStoreName} has a recent Scout signal`,
            reason: `${latestScoutItem}${latestScoutTime ? ` was reported ${latestScoutTime}` : " was reported recently"}.`,
            primaryLabel: "Open Scout",
            onPrimary: () => setActiveTab("scout"),
            secondaryLabel: "Submit Report",
            onSecondary: () => openQuickAddAction("storeReport"),
          };
          if (!kidsApplication) return {
            badge: "Spark",
            title: "Request Kids Program access",
            reason: "Keep kid-focused requests and safety rules in one parent-friendly place.",
            primaryLabel: "Open Kids Program",
            onPrimary: () => setActiveTab("kidsProgram"),
            secondaryLabel: "Add to Vault",
            onSecondary: () => openQuickAddAction("vaultItem"),
          };
        }
        if (hearthMode === "collector") {
          const collectorGuidance = renderSmartGuidanceAction();
          if (["start_collection", "first_scout_report", "fresh_scout_signals", "default_collection"].includes(collectorGuidance?.key)) return collectorGuidance;
          if (bestMarketMover) return {
            badge: "Market Watch",
            title: `${bestMarketMover.name || bestMarketMover.productName || bestMarketMover.cardName || "A watched item"} needs a price check`,
            reason: "Open Market Watch to compare fair value before buying, selling, or trading.",
            primaryLabel: "Open Market",
            onPrimary: () => setActiveTab("market"),
            secondaryLabel: "Add to Vault",
            onSecondary: () => openQuickAddAction("vaultItem"),
          };
          if (latestScoutReport) return {
            badge: latestScoutReport.verified ? "Verified" : "Scout",
            title: `${latestScoutStoreName} has a recent Scout signal`,
            reason: `${latestScoutItem}${latestScoutTime ? ` was reported ${latestScoutTime}` : " was reported recently"}.`,
            primaryLabel: "Open Scout",
            onPrimary: () => setActiveTab("scout"),
            secondaryLabel: "Add Item",
            onSecondary: () => openAddActionSheet("hearth-best-action"),
          };
          if (!activeVaultItems.length) return {
            badge: "Vault",
            title: "Add your first item to Vault",
            reason: "Start by adding a card, sealed product, or binder item so Hearth can guide your next step.",
            primaryLabel: "Add Item to Vault",
            onPrimary: () => openQuickAddAction("vaultItem"),
            secondaryLabel: "Search Market",
            onSecondary: () => setActiveTab("market"),
          };
        }
        if (activeAnnouncements.length) return {
          badge: "New Stuff",
          title: activeAnnouncements[0].title || "New Ember & Tide update",
          reason: activeAnnouncements[0].body || activeAnnouncements[0].message || "There is a new app update or announcement to review.",
          primaryLabel: "View Details",
          onPrimary: () => setActiveTab("whatsNew"),
          secondaryLabel: "Quick Add",
          onSecondary: () => openAddActionSheet("hearth-announcement"),
        };
        return {
          badge: "Calm Tide",
          title: "No urgent actions today",
          reason: "Check Scout Signals or add the next item to your Vault when you are ready.",
          primaryLabel: "Open Scout",
          onPrimary: () => setActiveTab("scout"),
          secondaryLabel: "Quick Add",
          onSecondary: () => openAddActionSheet("hearth-calm"),
        };
      })();
      const openQuickAddPathFromHearth = (path, patch = {}, source = "hearth-sparks") => {
        setQuickAddWizard(createQuickAddWizardState({
          screen: path,
          path,
          ...patch,
        }));
        openFlowModal("addActionSheet", { size: "medium", source });
      };
      const quickActionByKey = {
        scanProduct: { key: "scan-product", label: "Scan Product/Card", helper: "Review before saving.", icon: "scan", onClick: () => openQuickAddAction("scanProduct") },
        quickAdd: { key: "quick-add", label: "Quick Add", helper: "Add anything.", icon: "plus", onClick: () => openAddActionSheet("hearth") },
        scoutReport: { key: "scout-report", label: "Add Scout Report", helper: "Share a current find.", icon: "scout", onClick: () => openQuickAddAction("storeReport") },
        vault: { key: "vault", label: "View Vault", helper: "Review your collection.", icon: "vault", onClick: () => setActiveTab("vault") },
        market: { key: "market", label: "Search Market", helper: "Check fair prices.", icon: "market", onClick: () => setActiveTab("market") },
        spark: { key: "spark", label: "The Spark", helper: "Family support.", icon: "spark", onClick: () => setActiveTab("kidsProgram") },
        emberAssist: { key: "ember-assist", label: "Ask Ember", helper: "Get a guided next step.", icon: "spark", onClick: () => openEmberAssistPanel("hearth_quick_action") },
        betaFeedback: { key: "beta-feedback", label: "Join / Feedback", helper: "Request a state or share beta feedback.", icon: "bell", onClick: () => openPublicBetaFeedback({ page: "Hearth" }) },
        forge: { key: "forge", label: "Open Forge", helper: "My business.", icon: "forge", onClick: () => setActiveTab("inventory") },
        addSale: { key: "add-sale", label: "Add Sale", helper: "Record revenue.", icon: "forge", onClick: () => openQuickAddAction("sale") },
        addReceipt: { key: "add-receipt", label: "Add Receipt", helper: "Track cost.", icon: "receipt", onClick: () => openQuickAddAction("receipt") },
        admin: { key: "admin", label: "Admin", helper: "Review queue.", icon: "settings", onClick: () => setActiveTab("adminReview") },
      };
      const modePriorityCards = {
        admin: [
          { key: "beta", eyebrow: "Beta Access", title: "Access requests", value: pendingBetaRequests, detail: "Pending or paused beta access rows.", cta: "Review", onClick: () => { setAdminReviewFilter("Beta Access"); setActiveTab("adminReview"); }, accent: "admin" },
          { key: "kids", eyebrow: "Kids Program", title: "Family requests", value: pendingKidsRequests, detail: "Little Sparks and family access review.", cta: "Review", onClick: () => { setAdminReviewFilter("Kids Program Applications"); setActiveTab("adminReview"); }, accent: "spark" },
          { key: "scout-review", eyebrow: "Scout", title: "Reports needing moderation", value: scoutNeedsReviewReports.length, detail: "Review unusual, conflicting, flagged, or hidden reports.", cta: "Open Queue", onClick: () => { setAdminReviewFilter("Scout Report Review"); setActiveTab("adminReview"); }, accent: "scout" },
          { key: "market-flags", eyebrow: "Market Watch", title: "Market review", value: marketReviewCount, detail: "Flagged, stale, or pending market data review.", cta: "Open Market", onClick: () => setActiveTab("market"), accent: "market" },
          { key: "feedback", eyebrow: "Support", title: "Feedback and bugs", value: pendingFeedbackCount + pendingSuggestionCount, detail: "Feedback, app errors, and shared data suggestions.", cta: "Open Admin", onClick: () => setActiveTab("adminReview"), accent: "tide" },
          catalogFreshnessLabel ? { key: "catalog-freshness", eyebrow: "Catalog", title: "Pricing freshness", value: catalogFreshnessLabel, detail: "Latest loaded catalog or market-price status available to admin tools.", cta: "Open Admin", onClick: () => setActiveTab("adminReview"), accent: "gold" } : null,
        ],
        seller: [
          { key: "forge", eyebrow: "Forge Workshop", title: "Inventory health", value: `${forgeInventoryItems.length} items`, detail: `${forgeReviewCount} item${forgeReviewCount === 1 ? "" : "s"} need receipt, price, or listing review.`, cta: "Open Forge", onClick: () => setActiveTab("inventory"), accent: "forge" },
          { key: "receipts", eyebrow: "Receipts", title: "Receipt review", value: receiptsNeedingReviewCount, detail: "Review receipts to keep cost basis accurate.", cta: "Add Receipt", onClick: () => openQuickAddAction("receipt"), accent: "forge" },
          { key: "mileage", eyebrow: "Mileage", title: "Business miles", value: totalBusinessMiles.toFixed(1), detail: `${workspaceMileageTrips.length} trip${workspaceMileageTrips.length === 1 ? "" : "s"} logged.`, cta: "Open Mileage", onClick: () => setActiveTab("mileage"), accent: "tide" },
          { key: "sales", eyebrow: "Sales", title: "Profit snapshot", value: money(monthlyProfitLoss), detail: `${workspaceSales.length} sale${workspaceSales.length === 1 ? "" : "s"} and ${workspaceExpenses.length} expense${workspaceExpenses.length === 1 ? "" : "s"} in this workspace.`, cta: "Open Reports", onClick: () => setActiveTab("reports"), accent: "gold" },
        ],
        simple: [
          { key: "scout", eyebrow: "Scout Signals", title: latestScoutStoreName || "Nearby signals", value: followedStores.length ? `${followedStores.length} followed` : scoutReportRows.length || 0, detail: latestScoutReport ? `${latestScoutItem}${latestScoutTime ? ` reported ${latestScoutTime}` : " reported recently"}.` : "No verified signals nearby yet.", cta: "Open Scout", onClick: () => setActiveTab("scout"), accent: "scout" },
          { key: "spark", eyebrow: "Kids Program", title: "The Spark", value: kidsApplication?.status || "Ready", detail: kidsApplication ? "Your Kids Program request is tracked here." : "Parent-approved access, requests, and safety rules.", cta: "Open Spark", onClick: () => setActiveTab("kidsProgram"), accent: "spark" },
          { key: "vault", eyebrow: "Vault", title: "Collection basics", value: `${activeVaultItems.length} items`, detail: activeVaultItems.length ? "Keep owned items organized for fair trades and family planning." : "Start with one saved card or sealed product.", cta: "Add Item", onClick: () => openQuickAddAction("vaultItem"), accent: "vault" },
        ],
        collector: [
          { key: "vault", eyebrow: "Vault", title: "Collection summary", value: money(vaultValue), detail: `${activeVaultItems.length} active item${activeVaultItems.length === 1 ? "" : "s"} tracked.`, cta: activeVaultItems.length ? "Open Vault" : "Add Item", onClick: () => activeVaultItems.length ? setActiveTab("vault") : openQuickAddAction("vaultItem"), accent: "vault" },
          { key: "recent", eyebrow: "Recent Additions", title: latestVaultActivityItem?.name || "No additions yet", value: latestVaultActivityItem ? `Qty ${latestVaultActivityItem.quantity || 1}` : "0", detail: latestVaultActivityItem ? `${vaultStatusLabel(normalizeVaultStatus(latestVaultActivityItem))} in your Vault.` : "Add items to build your collection history.", cta: "Open Vault", onClick: () => setActiveTab("vault"), accent: "vault" },
          { key: "sets", eyebrow: "Sets", title: "Missing set cards", value: missingSetCardCount, detail: missingSetCardCount ? "Open Vault Sets to continue completion tracking." : "Set completion will appear as your collection grows.", cta: "Open Sets", onClick: () => { setActiveTab("vault"); setVaultSubTab("sets"); }, accent: "tide" },
          { key: "market", eyebrow: "Market Watch", title: bestMarketMover?.name || bestMarketMover?.productName || "No watched deals yet", value: bestMarketMover ? money(bestMarketMover.marketPrice || bestMarketMover.marketValue || 0) : workspaceWatchlist.length, detail: bestMarketMover ? "Compare current market value before buying or trading." : "Create a watchlist to track fair prices.", cta: "Open Market", onClick: () => setActiveTab("market"), accent: "market" },
        ],
      };
      const priorityCards = (modePriorityCards[hearthMode] || modePriorityCards.collector).filter(Boolean);
      const visiblePriorityCards = hearthDetailsExpanded ? priorityCards : priorityCards.slice(0, 3);
      const hiddenPriorityCount = Math.max(0, priorityCards.length - visiblePriorityCards.length);
      const fallbackCards = getStartedCards.filter((card) => {
        if (card.key === "start-collection") return !hearthHasVaultItems;
        if (card.key === "follow-stores") return !(scoutSnapshot.reports || []).length;
        if (card.key === "market-alert") return !workspaceWatchlist.length;
        if (card.key === "kids-access") return hearthMode === "simple" && !kidsApplication;
        if (card.key === "first-receipt") return sellerAccessVisible && !workspaceExpenses.length && !forgeReceiptRecords.length;
        return false;
      });
      const recentRows = homeRecentActivity.length ? homeRecentActivity.slice(0, 3) : [];
      const rawHearthName = String(
        currentUserProfile?.firstName ||
        currentUserProfile?.first_name ||
        currentUserProfile?.displayName ||
        currentUserProfile?.display_name ||
        ""
      ).trim();
      const rawHearthFirstName = rawHearthName && !/@/.test(rawHearthName) ? rawHearthName.split(/\s+/)[0] : "";
      const unsafeHearthName = /^(local|localhost|beta|guest|user|friend|collector)$/i.test(rawHearthFirstName);
      const hearthGreetingName = rawHearthFirstName && !unsafeHearthName ? rawHearthFirstName : "";
      const hearthHour = new Date().getHours();
      const hearthGreeting = hearthHour < 12 ? "Good morning" : hearthHour < 18 ? "Good afternoon" : "Good evening";
      const hearthAvatarInitial = (hearthGreetingName || "E").slice(0, 1).toUpperCase();
      const hearthScoutTrustScore = Number.isFinite(Number(scoutSnapshot.scoutProfile?.trustScore)) ? Number(scoutSnapshot.scoutProfile.trustScore) : 0;
      const hearthHeroStats = [
        { key: "fresh", label: "Fresh reports", value: hearthFreshReports || scoutReportRows.length || 0, tone: "tide" },
        { key: "trust", label: "Trusted Scout", value: hearthScoutTrustScore ? `Level ${Math.max(1, Math.ceil(hearthScoutTrustScore / 20))}` : "Needs data", tone: "verified" },
      ];
      const hearthSnapshotLabel = hearthMode === "seller"
        ? `${forgeInventoryItems.length} Forge items`
        : hearthMode === "admin"
          ? `${pendingBetaRequests + pendingKidsRequests + scoutNeedsReviewReports.length} review items`
          : `${activeVaultItems.length} Vault items`;
      const hearthVaultValueLabel = vaultValue > 0 ? `${money(vaultValue)} estimated value` : "Value unavailable";
      const hearthModeChipLabel = hearthMode === "admin"
        ? "Admin"
        : hearthMode === "seller"
          ? "Seller"
          : hearthMode === "simple"
            ? "Family"
            : "Collector";
      const hearthHomeTitle = hearthGreetingName
        ? `${hearthGreeting}, ${hearthGreetingName}`
        : `${hearthGreeting}, ${hearthModeChipLabel}`;
      const hearthTodayMessage = bestAction?.badge ? `${bestAction.badge}: ${bestAction.title}` : bestAction.title;
      const hearthIsNewUser = !activeVaultItems.length && !scoutReportRows.length && !workspaceWatchlist.length && !recentRows.length;
      const hearthOnboardingPanel = shouldRenderFirstRunOnboarding() ? renderOnboardingPanel() : null;
      const hearthSupportRows = [
        { label: "Beta", value: betaAccessAllowed() ? "Approved" : "Limited", helper: "Features may change during beta." },
        { label: "App", value: PUBLIC_APP_VERSION_LABEL, helper: appUpdate.available ? "Update available." : "Current build loaded." },
        { label: "Support", value: "Feedback ready", helper: "Bug, missing item, wrong store, bad report, or feature request." },
      ];
      const hearthKnownIssues = [
        "Catalog and photos are still being expanded.",
        "Forecasts are limited during beta.",
        "Some stores and regions are still being added.",
      ];
      const hearthTodayKey = getLocalDateKey();
      const isTodayRecord = (value) => {
        if (!value) return false;
        const parsed = new Date(value);
        return !Number.isNaN(parsed.getTime()) && getLocalDateKey(parsed) === hearthTodayKey;
      };
      const recordDateForToday = (record = {}, fallback = "") =>
        record.createdAt || record.created_at || record.submittedAt || record.submitted_at ||
        record.updatedAt || record.updated_at || record.date || record.reportDate || record.report_date ||
        fallback;
      const reportHasProof = (report = {}) => Boolean(
        scoutReportPhotoUrls(report).length ||
        String(report.proofUrl || report.proof_url || report.sourceText || report.source_text || "").trim() ||
        ["stock_photo", "receipt", "screenshot", "photo"].includes(String(report.proofType || report.proof_type || report.sourceType || report.source_type || "").toLowerCase())
      );
      const userScoutReportsToday = scoutReportRows.filter((report) =>
        isCurrentUserRecord(report) && isTodayRecord(recordDateForToday(report, scoutReportSubmittedAt(report) || scoutReportObservedAt(report)))
      );
      const userScoutProofReportsToday = userScoutReportsToday.filter(reportHasProof);
      const userVaultItemsToday = activeVaultItems.filter((item) =>
        isCurrentUserRecord(item) && isTodayRecord(recordDateForToday(item, item.purchaseDate || item.purchase_date))
      );
      const vaultMissingPhotoCount = activeVaultItems.filter((item) => !vaultItemDisplayImage(item)).length;
      const vaultPhotoUpdatesToday = activeVaultItems.filter((item) =>
        isCurrentUserRecord(item) &&
        Boolean(vaultItemDisplayImage(item)) &&
        isTodayRecord(item.updatedAt || item.updated_at || item.createdAt || item.created_at)
      );
      const receiptUploadsToday = visibleReceiptRecords.filter((receipt) =>
        isCurrentUserRecord(receipt) && isTodayRecord(receipt.receiptDate || receipt.receipt_date || receipt.purchaseDate || receipt.purchase_date || receipt.createdAt || receipt.created_at)
      );
      const salesToday = workspaceSales.filter((sale) =>
        isCurrentUserRecord(sale) && isTodayRecord(sale.saleDate || sale.sale_date || sale.createdAt || sale.created_at)
      );
      const sparkDonationItemsToday = activeVaultItems.filter((item) => {
        const status = normalizeVaultStatus(item);
        const text = `${status} ${item.vaultCategory || item.vault_category || ""} ${item.notes || ""}`.toLowerCase();
        return isCurrentUserRecord(item) && isTodayRecord(recordDateForToday(item)) && (status === "gift_donation" || /donation|gift|spark|kids pack|kid pack/.test(text));
      });
      const hearthCanUseScout = featureAllowed("scout_submit_reports") || BETA_LOCAL_MODE || scoutReportRows.length > 0;
      const hearthCanUseVault = featureAllowed("vault_basic") || featureAllowed("collection_basic") || BETA_LOCAL_MODE || activeVaultItems.length > 0;
      const hearthSparkRelevant = Boolean(hearthMode === "simple" || adaptiveUiState.familyMode || kidsApplication || pendingKidsRequests || adminToolsVisible);
      const hearthSellerRelevant = Boolean(sellerAccessVisible || forgeInventoryItems.length || workspaceSales.length || workspaceExpenses.length || visibleReceiptRecords.length);
      const quickActions = [
        hearthCanUseVault ? "scanProduct" : null,
        hearthCanUseScout ? "scoutReport" : null,
        hearthCanUseVault ? "vault" : null,
        "market",
        hearthSparkRelevant ? "spark" : null,
        "betaFeedback",
        "emberAssist",
      ]
        .map((key) => quickActionByKey[key])
        .filter(Boolean)
        .slice(0, 4);
      const openSparkManualSeed = (kind) => {
        const donation = kind === "donation";
        openQuickAddPathFromHearth("manual", {
          manualItemName: donation ? "Spark donation" : "Kids pack",
          manualCategory: "The Spark",
          manualItemKind: donation ? "supply" : "accessory",
          manualDestination: "vault",
          manualNote: donation
            ? "Donation or support item for The Spark."
            : "Build or prepare a kid pack for The Spark.",
        }, `hearth-spark-${kind}`);
      };
      const foundationJourneyItems = (HEARTH_FOUNDATION_SCREEN.sections || []).find((section) => section.title === "Today's Journey")?.items || [];
      const foundationQuickActionItems = (HEARTH_FOUNDATION_SCREEN.sections || []).find((section) => section.title === "Quick Actions")?.items || [];
      const foundationTradeSourceItem = activeVaultItems.find((item) => item?.id);
      const hearthFoundationJourneyCards = [
        {
          key: "foundation-restock",
          title: foundationJourneyItems[0]?.title || "Scout current signals",
          detail: foundationJourneyItems[0]?.detail || "Proof-first store notes, not raw patterns.",
          meta: foundationJourneyItems[0]?.status || "Worth checking",
          icon: "scout",
          tone: "scout",
          onClick: () => setActiveTab("scout"),
        },
        {
          key: "foundation-forge",
          title: foundationJourneyItems[1]?.title || "Review a pending trade",
          detail: foundationJourneyItems[1]?.detail || "Compare exact copies before anyone commits.",
          meta: foundationJourneyItems[1]?.meta || "+50 pts",
          icon: "forge",
          tone: "forge",
          onClick: () => foundationTradeSourceItem ? openTradeValueFlow(foundationTradeSourceItem, { source: "hearth-foundation" }) : setActiveTab("vault"),
        },
        {
          key: "foundation-event",
          title: foundationJourneyItems[2]?.title || "Kids Trade Night",
          detail: foundationJourneyItems[2]?.detail || "Parent-managed Spark planning.",
          meta: foundationJourneyItems[2]?.status || "Family friendly",
          icon: "calendar",
          tone: "spark",
          onClick: () => setActiveTab("kidsProgram"),
        },
        {
          key: "foundation-vault-reminder",
          title: "Sleeve one Vault item",
          detail: "Add a card, slab, binder page, or sealed product after review.",
          meta: "Protected",
          icon: "vault",
          tone: "vault",
          onClick: () => openQuickAddAction("vaultItem"),
        },
      ];
      const hearthFoundationQuickActions = [
        {
          key: "foundation-scan-card",
          title: foundationQuickActionItems[0]?.title || "Scan card",
          detail: foundationQuickActionItems[0]?.detail || "Card identity + variant reviewed before saving.",
          icon: "scan",
          tone: "vault",
          onClick: () => openQuickAddAction("scanProduct"),
        },
        {
          key: "foundation-scan-restock",
          title: foundationQuickActionItems[1]?.title || "Scan restock screenshot",
          detail: foundationQuickActionItems[1]?.detail || "Turn proof into a current report, not a pattern feed.",
          icon: "scout",
          tone: "scout",
          onClick: () => openQuickAddPathFromHearth("scoutScreenshotReview", {}, "hearth-foundation-screenshot"),
        },
        {
          key: "foundation-add-vault",
          title: "Add to Vault",
          detail: "Save only after review.",
          icon: "plus",
          tone: "vault",
          onClick: () => openQuickAddAction("vaultItem"),
        },
        {
          key: "foundation-check-trade",
          title: foundationQuickActionItems[2]?.title || "Check trade",
          detail: foundationQuickActionItems[2]?.detail || "Compare values and safety",
          icon: "forge",
          tone: "forge",
          onClick: () => foundationTradeSourceItem ? openTradeValueFlow(foundationTradeSourceItem, { source: "hearth-foundation-trade" }) : setActiveTab("vault"),
        },
        {
          key: "foundation-donate-spark",
          title: "Donate to The Spark",
          detail: "Preview kid-safe family support. No payment processed.",
          icon: "spark",
          tone: "spark",
          onClick: () => openSparkManualSeed("donation"),
        },
        {
          key: "foundation-beta-feedback",
          title: "Join beta / send feedback",
          detail: "Request a state, report a bug, or tell us what to build next.",
          icon: "bell",
          tone: "gold",
          onClick: () => openPublicBetaFeedback({ page: "Hearth", mainReason: "General feedback" }),
        },
      ];
      const routeToAdminReportReview = () => {
        setAdminReviewFilter("Scout Report Review");
        setActiveTab("adminReview");
      };
      const hearthSparkQuickActions = [
        hearthCanUseScout ? { key: "add-scout-report", title: "Add Scout Report", helper: "Share a store signal.", icon: "scout", tone: "scout", onClick: () => openQuickAddAction("storeReport") } : null,
        hearthCanUseScout ? { key: "scan-screenshot", title: "Scan Screenshot", helper: "Review before saving.", icon: "scan", tone: "vault", onClick: () => openQuickAddPathFromHearth("scoutScreenshotReview", {}, "hearth-scan-screenshot") } : null,
        hearthCanUseVault ? { key: "scan-cards", title: "Scan Cards", helper: "Manual card-page review.", icon: "scan", tone: "vault", onClick: () => openQuickAddPathFromHearth("cardPageReview", {}, "hearth-scan-cards") } : null,
        hearthCanUseVault ? { key: "add-vault-item", title: "Add Vault Item", helper: "Save one item.", icon: "vault", tone: "vault", onClick: () => openQuickAddAction("vaultItem") } : null,
        hearthSellerRelevant ? { key: "upload-receipt", title: "Upload Receipt", helper: "Track seller proof.", icon: "clipboard", tone: "forge", onClick: () => openQuickAddPathFromHearth("receipt", {}, "hearth-upload-receipt") } : null,
        hearthSparkRelevant ? { key: "build-kids-pack", title: "Build Kids Pack", helper: "Prepare family support.", icon: "spark", tone: "spark", onClick: () => openSparkManualSeed("pack") } : null,
        hearthSparkRelevant ? { key: "add-donation", title: "Add Donation", helper: "Track Spark support.", icon: "spark", tone: "spark", onClick: () => openSparkManualSeed("donation") } : null,
        adminToolsVisible ? { key: "review-reports", title: "Review Reports", helper: "Admin moderation.", icon: "settings", tone: "admin", onClick: routeToAdminReportReview } : null,
      ].filter(Boolean).slice(0, 6);
      const sparkHash = (key = "") => {
        const text = `${hearthTodayKey}:${key}`;
        let hash = 0;
        for (let index = 0; index < text.length; index += 1) {
          hash = ((hash << 5) - hash) + text.charCodeAt(index);
          hash |= 0;
        }
        return Math.abs(hash);
      };
      const sparkMissionCandidates = [
        hearthCanUseScout ? {
          key: "add-scout-report",
          title: "Add one Scout report",
          purpose: "Share a current store signal.",
          icon: "scout",
          tone: "scout",
          reward: 10,
          current: Math.min(1, userScoutReportsToday.length),
          target: 1,
          onAction: () => openQuickAddAction("storeReport"),
        } : null,
        hearthCanUseScout ? {
          key: "add-scout-proof",
          title: "Add proof to one Scout report",
          purpose: "Boost trust with proof.",
          icon: "scan",
          tone: "scout",
          reward: 12,
          current: Math.min(1, userScoutProofReportsToday.length),
          target: 1,
          onAction: () => openQuickAddPathFromHearth("scoutScreenshotReview", {}, "hearth-spark-proof"),
        } : null,
        hearthCanUseVault ? {
          key: "add-vault-item",
          title: "Add one Vault item",
          purpose: "Add a clean collection record.",
          icon: "vault",
          tone: "vault",
          reward: 10,
          current: Math.min(1, userVaultItemsToday.length),
          target: 1,
          onAction: () => openQuickAddAction("vaultItem"),
        } : null,
        hearthCanUseVault && activeVaultItems.length ? {
          key: "add-vault-photos",
          title: "Add photos to 3 Vault items",
          purpose: "Improve your Vault with photos.",
          icon: "scan",
          tone: "vault",
          reward: 15,
          current: Math.min(3, vaultPhotoUpdatesToday.length),
          target: 3,
          onAction: () => setActiveTab("vault"),
        } : null,
        hearthSellerRelevant ? {
          key: "upload-receipt",
          title: "Upload one receipt",
          purpose: "Protect cost and profit.",
          icon: "clipboard",
          tone: "forge",
          reward: 15,
          current: Math.min(1, receiptUploadsToday.length),
          target: 1,
          onAction: () => openQuickAddPathFromHearth("receipt", {}, "hearth-spark-receipt"),
        } : null,
        sellerAccessVisible ? {
          key: "record-sale",
          title: "Record one sale",
          purpose: "Keep profit history current.",
          icon: "forge",
          tone: "forge",
          reward: 15,
          current: Math.min(1, salesToday.length),
          target: 1,
          onAction: () => openQuickAddAction("sale"),
        } : null,
        hearthSparkRelevant ? {
          key: "add-spark-donation",
          title: "Add one Spark donation item",
          purpose: "Support kid packs and events.",
          icon: "spark",
          tone: "spark",
          reward: 15,
          current: Math.min(1, sparkDonationItemsToday.length),
          target: 1,
          onAction: () => openSparkManualSeed("donation"),
        } : null,
      ].filter(Boolean)
        .sort((a, b) => sparkHash(a.key) - sparkHash(b.key) || a.key.localeCompare(b.key))
        .slice(0, 5);
      const dismissedSparkKeys = new Set(dailyTideToday.dismissedSparks || []);
      const visibleSparkMissions = sparkMissionCandidates.filter((mission) => !dismissedSparkKeys.has(mission.key));
      const visibleSparkPreview = hearthDetailsExpanded ? visibleSparkMissions : visibleSparkMissions.slice(0, 1);
      const hiddenSparkCount = Math.max(0, visibleSparkMissions.length - visibleSparkPreview.length);
      const allSparksDismissed = sparkMissionCandidates.length > 0 && visibleSparkMissions.length === 0;
      const allSparksComplete = visibleSparkMissions.length > 0 && visibleSparkMissions.every((mission) => mission.current >= mission.target);
      const todaySparkEarnedPoints = visibleSparkMissions
        .filter((mission) => mission.current >= mission.target)
        .reduce((sum, mission) => sum + Number(mission.reward || 0), 0);
      const realHearthPoints = Number(scoutSnapshot.scoutProfile?.rewardPoints || scoutSnapshot.scoutProfile?.emberPoints || dailyTideToday.tidePoints || 0) + todaySparkEarnedPoints;
      const hearthEmberPoints = realHearthPoints > 0 ? realHearthPoints : 0;
      const dismissTodaySpark = async (sparkKey) => {
        const confirmed = await requestConfirmation({
          title: "Dismiss Spark?",
          message: "You won't earn Ember Points for this Spark today.",
          confirmLabel: "Dismiss",
          cancelLabel: "Keep Spark",
          destructive: true,
        });
        if (!confirmed) return;
        setDailyTide((current) => {
          const base = normalizeDailyTideState(current);
          return {
            ...base,
            date: hearthTodayKey,
            dismissedSparks: [...new Set([...(base.dismissedSparks || []), sparkKey])],
          };
        });
      };
      const restoreTodaySparks = () => {
        setDailyTide((current) => ({
          ...normalizeDailyTideState(current),
          date: hearthTodayKey,
          dismissedSparks: [],
        }));
        showInfoToast("Today's Sparks restored.", { message: "Sparks still need real actions before they earn Ember Points." });
      };
      const renderSparkQuickActions = () => (
        <div className="hearth-spark-quick-actions" aria-label="Quick Actions">
          <h3>Quick Actions</h3>
          <div className="hearth-spark-quick-grid">
            {hearthSparkQuickActions.map((action) => (
              <button type="button" className={`hearth-spark-quick-action hearth-accent-${action.tone}`} key={action.key} onClick={action.onClick}>
                <span aria-hidden="true"><AppNavIcon kind={action.icon} /></span>
                <span>
                  <strong>{action.title}</strong>
                  <small>{action.helper}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      );
      const renderTodaySparksPanel = () => (
        <section className={`panel hearth-today-sparks-panel ${allSparksComplete ? "is-complete" : allSparksDismissed ? "is-dismissed" : ""}`} aria-label="Today's Sparks">
          {allSparksComplete ? (
            <>
              <div className="hearth-sparks-state-header">
                <span className="hearth-sparks-state-icon" aria-hidden="true"><AppNavIcon kind="plan" /></span>
                <div>
                  <h2>Today&apos;s Sparks Complete</h2>
                  <p>Great job! You earned {todaySparkEarnedPoints} Ember Points today.</p>
                </div>
              </div>
              {renderSparkQuickActions()}
            </>
          ) : allSparksDismissed ? (
            <>
              <div className="hearth-sparks-state-header">
                <span className="hearth-sparks-state-icon" aria-hidden="true"><AppNavIcon kind="help" /></span>
                <div>
                  <h2>No Sparks today</h2>
                  <p>You dismissed today&apos;s Sparks. You can check back tomorrow for new ones.</p>
                </div>
              </div>
              {renderSparkQuickActions()}
              <button type="button" className="hearth-sparks-restore-button" onClick={restoreTodaySparks}>Restore Sparks</button>
            </>
          ) : (
            <>
              <div className="hearth-sparks-heading">
                <div>
                  <h2>Today&apos;s Sparks</h2>
                  <p>Complete helpful actions to earn Ember Points.</p>
                </div>
              </div>
              <div className="hearth-spark-mission-list">
                {visibleSparkPreview.map((mission) => {
                  const complete = mission.current >= mission.target;
                  const started = mission.current > 0 && !complete;
                  return (
                    <article className={`hearth-spark-mission-card hearth-accent-${mission.tone} ${complete ? "is-complete" : ""}`} key={mission.key}>
                      <span className="hearth-spark-mission-icon" aria-hidden="true"><AppNavIcon kind={mission.icon} /></span>
                      <div className="hearth-spark-mission-copy">
                        <h3>{mission.title}</h3>
                        <small>{mission.purpose}</small>
                        <p>
                          <span>{mission.current}/{mission.target} complete</span>
                          <strong className="hearth-spark-reward">+{mission.reward} Ember Points</strong>
                        </p>
                      </div>
                      <div className="hearth-spark-mission-actions">
                        <button type="button" className="hearth-spark-action-button" onClick={mission.onAction} disabled={complete}>
                          {complete ? "Done" : started ? "Continue" : "Start"}
                        </button>
                        <button
                          type="button"
                          className="hearth-spark-dismiss"
                          aria-label={`Dismiss ${mission.title}`}
                          onClick={() => dismissTodaySpark(mission.key)}
                          disabled={complete}
                        >
                          x
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="hearth-sparks-footer-row">
                <p className="hearth-sparks-footnote">Sparks refresh tomorrow. Points are awarded only when the action is completed in the app.</p>
                {hiddenSparkCount || (hearthDetailsExpanded && visibleSparkMissions.length > 3) ? (
                  <button
                    type="button"
                    className="hearth-sparks-view-all"
                    onClick={() => setHearthDetailsExpanded((current) => !current)}
                  >
                    {hearthDetailsExpanded ? "Show fewer" : `View all Sparks (${visibleSparkMissions.length})`}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </section>
      );
      const latestVaultSetName = latestVaultActivityItem?.setName || latestVaultActivityItem?.set_name || latestVaultActivityItem?.expansion || "";
      const scoutSignalLabel = latestScoutReport
        ? `${scoutReportStatusLabel(latestScoutReport)}${isConfirmedScoutSignal(latestScoutReport) ? " | confirmed" : " | needs context"}`
        : "Start Scout";
      const hearthFeatureCards = [
        {
          key: "scout",
          title: "Scout",
          value: latestScoutReport ? `${latestScoutStoreName}` : "Start Scout",
          detail: latestScoutReport ? `${latestScoutItem}${latestScoutTime ? ` | ${latestScoutTime}` : ""}` : "Choose your first watched store or share a report.",
          meta: scoutSignalLabel,
          icon: "scout",
          onClick: () => setActiveTab("scout"),
          accent: "scout",
          visible: hearthCanUseScout,
        },
        {
          key: "vault",
          title: "Vault",
          value: activeVaultItems.length
            ? `${activeVaultItems.length} item${activeVaultItems.length === 1 ? "" : "s"} tracked`
            : "Start Vault",
          detail: activeVaultItems.length
            ? `${vaultMissingPhotoCount} missing photo${vaultMissingPhotoCount === 1 ? "" : "s"}${latestVaultSetName ? ` | Newest: ${latestVaultSetName}` : ""}`
            : "Start your collection by scanning your first item.",
          meta: hearthVaultValueLabel,
          icon: "vault",
          onClick: () => hearthHasVaultItems ? setActiveTab("vault") : openQuickAddAction("vaultItem"),
          accent: "vault",
          visible: hearthCanUseVault,
        },
        {
          key: "spark",
          title: "Family & The Spark",
          value: kidsApplication ? "Kids Program tracked" : hearthSparkRelevant ? "Build family support" : "Add The Spark",
          detail: kidsApplication ? statusLabel(kidsApplication.status || "pending") : pendingKidsRequests ? `${pendingKidsRequests} request${pendingKidsRequests === 1 ? "" : "s"} need review` : "Kid packs, donations, and parent-safe requests.",
          meta: "Next: Build a kids pack",
          icon: "spark",
          onClick: () => setActiveTab("kidsProgram"),
          accent: "spark",
          visible: hearthSparkRelevant,
        },
        {
          key: "forge",
          title: "Forge Snapshot",
          value: workspaceSales.length || workspaceExpenses.length ? `${money(totalSalesRevenue)} revenue` : "Start Forge",
          detail: workspaceSales.length || workspaceExpenses.length
            ? `${money(monthlyProfitLoss)} profit | ${receiptsNeedingReviewCount} receipt${receiptsNeedingReviewCount === 1 ? "" : "s"} missing`
            : "Add Forge to your Hearth when seller tools are part of your workflow.",
          meta: forgeInventoryItems.length ? `${forgeInventoryItems.length} inventory item${forgeInventoryItems.length === 1 ? "" : "s"}` : "Seller tools",
          icon: "forge",
          onClick: () => sellerAccessVisible ? setActiveTab("inventory") : requestLockedFeatureAccess("seller_tools"),
          accent: "forge",
          visible: hearthSellerRelevant,
        },
      ].filter((card) => card.visible);
      const hearthDailyNextStep = activeVaultItems.length < 2
        ? {
          label: "Next Best Step",
          title: "Add your first item to Vault",
          detail: "Start by adding a card, sealed product, or binder item to begin tracking your collection value and activity.",
          actionLabel: "Add Item to Vault",
          onClick: () => openQuickAddAction("vaultItem"),
          secondaryActionLabel: "Search Market",
          onSecondary: () => setActiveTab("market"),
          tone: "vault",
        }
        : {
          label: "Next Best Step",
          title: bestAction.title || "Keep building your collection.",
          detail: bestAction.reason || "Open the next useful Ember & Tide area when you are ready.",
          actionLabel: "Open Next",
          onClick: bestAction.onPrimary || (() => setActiveTab("vault")),
          secondaryActionLabel: bestAction.secondaryLabel || "Ask Ember",
          onSecondary: bestAction.onSecondary || (() => openEmberAssistPanel("hearth_next_step")),
          tone: "hearth",
        };
      const collectorEventSummaryForHearth = summarizeCollectorEventPlans(collectorEventPlans);
      const nextCollectorEventForHearth = collectorEventSummaryForHearth.upcomingPlans?.[0] || collectorEventSummaryForHearth.latestPlan || null;
      const hearthDailyCommandCards = [
        {
          key: "collection-pulse",
          label: "Collection Pulse",
          reminder: "Vault Reminder",
          title: activeVaultItems.length ? `${activeVaultItems.length} Vault item${activeVaultItems.length === 1 ? "" : "s"}` : "Start your Vault",
          detail: activeVaultItems.length
            ? `Review what you own, what matters, and what may be ready for Forge. ${hearthVaultValueLabel}.`
            : "Add one card, sealed product, slab, or supply so Vault can become your collection home.",
          icon: "vault",
          tone: "vault",
          actionLabel: "Open Vault",
          onClick: () => setActiveTab("vault"),
        },
        {
          key: "display-case",
          label: "Display Case",
          reminder: visibleVaultDisplayCase.length ? `${visibleVaultDisplayCase.length} featured` : "Local display only",
          title: visibleVaultDisplayCase.length ? "Featured in your Display Case" : "Choose a favorite for Display Case",
          detail: visibleVaultDisplayCase.length
            ? `${visibleVaultDisplayCase[0].displayTitle || "A favorite item"} is featured locally. Display Case is not public sharing, a listing, or a sale.`
            : "Feature one favorite card or sealed product locally without creating a public post, listing, checkout, or sale.",
          icon: "vault",
          tone: "vault",
          actionLabel: "Open Display Case",
          onClick: openVaultDisplayCaseSurface,
        },
        {
          key: "scout-watch",
          label: "Scout Watch",
          reminder: "Current reports only",
          title: latestScoutReport ? latestScoutStoreName : followedStores.length ? `${followedStores.length} watched store${followedStores.length === 1 ? "" : "s"}` : "Choose a watched store",
          detail: latestScoutReport
            ? `Check ${latestScoutItem}${latestScoutTime ? ` from ${latestScoutTime}` : ""} without exposing full patterns.`
            : "Check watched stores and Scout signals without exposing full patterns.",
          icon: "scout",
          tone: "scout",
          actionLabel: "Open Scout",
          onClick: () => setActiveTab("scout"),
        },
        {
          key: "forge-reminder",
          label: "Forge Reminder",
          reminder: tradeRecords.length ? `${tradeRecords.length} Trade Ledger record${tradeRecords.length === 1 ? "" : "s"}` : "Trade value workspace",
          title: forgeReviewCount ? `${forgeReviewCount} Forge review item${forgeReviewCount === 1 ? "" : "s"}` : "Compare before you trade",
          detail: "Compare trades, save trade memories, and protect your collection value.",
          icon: "forge",
          tone: "forge",
          actionLabel: "Open Forge",
          onClick: () => setActiveTab("inventory"),
        },
        {
          key: "market-reminder",
          label: "Market Reminder",
          reminder: marketPriceMemories.length ? `${marketPriceMemories.length} Price Memory snapshot${marketPriceMemories.length === 1 ? "" : "s"}` : "Manual estimates",
          title: bestMarketMover?.name || bestMarketMover?.productName || "Check before buying",
          detail: "Search, save price memories, and check again before buying or trading.",
          icon: "market",
          tone: "market",
          actionLabel: "Open Market",
          onClick: () => setActiveTab("market"),
        },
        {
          key: "wishlist-iso-reminder",
          label: "Wishlist / ISO",
          reminder: wishlistIsoHighPriority.length ? `${wishlistIsoHighPriority.length} high-priority want${wishlistIsoHighPriority.length === 1 ? "" : "s"}` : "Local planning only",
          title: wishlistIsoPlannerItems.length ? "Review your wanted list" : "Plan what you are hunting for",
          detail: "Track wanted cards, sealed products, supplies, set goals, and Kid Pack items with no automatic matching or live seller offers.",
          icon: "vault",
          tone: "gold",
          actionLabel: "Open Wishlist",
          onClick: openWishlistIsoSurface,
        },
        {
          key: "event-planner-reminder",
          label: "Event Planner",
          reminder: nextCollectorEventForHearth ? `${nextCollectorEventForHearth.status} collector event` : "Local planner only",
          title: nextCollectorEventForHearth ? nextCollectorEventForHearth.eventName : "Plan a collector event",
          detail: nextCollectorEventForHearth
            ? `${nextCollectorEventForHearth.eventType} | ${nextCollectorEventForHearth.dateTimeText || "date/time TBD"} | no RSVP or public listing.`
            : "Plan trade nights, shop visits, kid pack events, release days, giveaways, and family collecting without RSVP, ticketing, payment, or public listings.",
          icon: "spark",
          tone: "gold",
          actionLabel: nextCollectorEventForHearth ? "Open Events" : "Plan Event",
          onClick: nextCollectorEventForHearth ? openCollectorEventPlannerSurface : () => openCollectorEventPlannerFlow({ source: "hearth-event-reminder" }),
        },
        {
          key: "spark-moment",
          label: "Spark Moment",
          reminder: sparkGifts.length ? `${sparkGifts.length} Giving Ledger gift${sparkGifts.length === 1 ? "" : "s"}` : "Family support",
          title: kidsApplication ? "Spark request tracked" : "Family side of collecting",
          detail: "Track gifts, kid packs, support, and the family side of collecting.",
          icon: "spark",
          tone: "spark",
          actionLabel: "Open The Spark",
          onClick: () => setActiveTab("kidsProgram"),
        },
      ];
      const hearthPrimaryDailyCommandKeys = new Set(visibleVaultDisplayCase.length
        ? ["display-case", "collection-pulse", "scout-watch"]
        : ["collection-pulse", "scout-watch", "market-reminder"]);
      const hearthDashboardPulseCards = hearthDailyCommandCards.filter((card) => hearthPrimaryDailyCommandKeys.has(card.key));
      const hearthDashboardMoreCards = hearthDailyCommandCards.filter((card) => !hearthPrimaryDailyCommandKeys.has(card.key));
      const vaultItemsMissingEstimate = activeVaultItems.filter((item) => {
        const estimate = Number(item.estimatedValue || item.marketValue || item.marketPrice || item.currentValue || item.unitCost || 0);
        return !Number.isFinite(estimate) || estimate <= 0;
      });
      const activeSparkKidPack = [...sparkKidPacks]
        .sort((a, b) => String(b.dateCreated || b.createdAt || "").localeCompare(String(a.dateCreated || a.createdAt || "")))
        .find((pack) => !/gifted/i.test(String(pack.packStatus || pack.status || ""))) || null;
      const latestTradeForHearth = [...workspaceTradeRecords]
        .sort((a, b) => String(b.tradeDate || b.createdAt || "").localeCompare(String(a.tradeDate || a.createdAt || "")))[0] || null;
      const latestMarketMemoryForHearth = [...marketPriceMemories]
        .sort((a, b) => String(b.dateSeen || b.createdAt || "").localeCompare(String(a.dateSeen || a.createdAt || "")))[0] || null;
      const hearthGradeAssistChecklistCount = (() => {
        if (typeof localStorage === "undefined") return 0;
        const saved = safeReadBrowserJson(localStorage, GRADE_ASSIST_LOCAL_STORAGE_KEY, {});
        return Object.values(saved || {}).filter((entry) => {
          if (!entry || typeof entry !== "object") return false;
          const checks = entry.checks || {};
          const hasCheck = Object.values(checks).some((value) => value && value !== "not_checked");
          return hasCheck || Boolean(String(entry.notes || "").trim());
        }).length;
      })();
      const trustedCircleCount = tidepoolTrustedCircle.length;
      const hasHearthLocalSignals = Boolean(
        activeVaultItems.length ||
        visibleVaultDisplayCase.length ||
        hearthGradeAssistChecklistCount ||
        workspaceTradeRecords.length ||
        marketPriceMemories.length ||
        sparkKidPacks.length ||
        sparkGifts.length ||
        collectorEventPlans.length ||
        followedStores.length ||
        scoutReportRows.length ||
        trustedCircleCount
      );
      const hearthSmartDailyCards = [
        {
          key: "collection-attention",
          eyebrow: "Vault Reminder",
          title: activeVaultItems.length ? "Collection needs attention" : "Finish setting up your collector space",
          detail: activeVaultItems.length
            ? vaultItemsMissingEstimate.length
              ? `${vaultItemsMissingEstimate.length} Vault item${vaultItemsMissingEstimate.length === 1 ? "" : "s"} could use an estimate, note, or next action.`
              : "Your Vault is started. Organize one item or create a Collection Set when you are ready."
            : "Add one card, sealed product, slab, or accessory so Hearth can guide your next step.",
          meta: activeVaultItems.length ? "Local Vault data" : "Safe starter step",
          actionLabel: activeVaultItems.length ? "Open Vault" : "Add to Vault",
          onClick: () => activeVaultItems.length ? setActiveTab("vault") : openQuickAddAction("vaultItem"),
          icon: "vault",
          tone: "vault",
          visible: !activeVaultItems.length || vaultItemsMissingEstimate.length > 0 || !vaultCollectionSets.length,
        },
        {
          key: "trade-review",
          eyebrow: "Forge Reminder",
          title: latestTradeForHearth ? "Trade to review" : "Try one trade check",
          detail: latestTradeForHearth
            ? `Last Trade Ledger memory: ${latestTradeForHearth.sourceItemName || latestTradeForHearth.itemGiven || "what you gave"} for ${latestTradeForHearth.receivedItemName || latestTradeForHearth.itemReceived || "what you got"}.`
            : "Use Trade Compass before a real trade so the values, condition, and meaning are easier to compare.",
          meta: latestTradeForHearth ? "Saved locally" : "Planning only",
          actionLabel: latestTradeForHearth ? "Open Forge" : "Trade Compass",
          onClick: () => latestTradeForHearth ? setActiveTab("inventory") : openTradeCompassFlow({ source: "hearth-smart-trade-check" }),
          icon: "forge",
          tone: "forge",
          visible: Boolean(latestTradeForHearth || activeVaultItems.length > 0),
        },
        {
          key: "scout-watch-reminder",
          eyebrow: "Scout Watch",
          title: followedStores.length ? "Scout watch reminder" : "Choose your first watch store",
          detail: latestScoutReport
            ? `Check the latest current report near ${latestScoutStoreName}. Scout keeps raw patterns protected.`
            : "Free Scout keeps one watched store and nearby public signals without exposing full restock history.",
          meta: followedStores.length ? `${followedStores.length} watched` : "Free Watch",
          actionLabel: "Open Scout",
          onClick: () => setActiveTab("scout"),
          icon: "scout",
          tone: "scout",
          visible: hearthCanUseScout && (!followedStores.length || Boolean(latestScoutReport) || scoutReportRows.length > 0),
        },
        {
          key: "grade-assist-follow-up",
          eyebrow: "Vault Reminder",
          title: "Grade Assist checklist saved",
          detail: `${hearthGradeAssistChecklistCount} manual Grade Assist checklist${hearthGradeAssistChecklistCount === 1 ? "" : "s"} saved locally. Review value, condition notes, or Forge only when you are ready.`,
          meta: "Not a professional grade",
          actionLabel: "Open Vault",
          onClick: () => setActiveTab("vault"),
          icon: "vault",
          tone: "vault",
          visible: hearthGradeAssistChecklistCount > 0,
        },
        {
          key: "market-memory",
          eyebrow: "Market Reminder",
          title: latestMarketMemoryForHearth ? "Check saved Price Memory" : "Save a price to remember",
          detail: latestMarketMemoryForHearth
            ? `${latestMarketMemoryForHearth.itemName || "Saved Price"} is a manual snapshot. Check again before buying, selling, or trading.`
            : "Save one manual Price Memory when you see a card or sealed product worth remembering.",
          meta: latestMarketMemoryForHearth ? "Manual snapshot" : "Not live pricing",
          actionLabel: latestMarketMemoryForHearth ? "Open Market" : "Save Price",
          onClick: () => latestMarketMemoryForHearth ? setActiveTab("market") : openMarketPriceMemoryFlow(null, { source: "hearth-smart-price-memory" }),
          icon: "market",
          tone: "market",
          visible: !marketPriceMemories.length || needsMarketCheckItems.length > 0 || workspaceWatchlist.length > 0 || Boolean(latestMarketMemoryForHearth),
        },
        {
          key: "display-case",
          eyebrow: "Vault Reminder",
          title: visibleVaultDisplayCase.length ? "Featured in your Display Case" : "Choose a favorite for Display Case",
          detail: visibleVaultDisplayCase.length
            ? `${visibleVaultDisplayCase[0].displayTitle || "A favorite item"} is featured locally. Display Case is not public sharing, a listing, or a sale.`
            : "Open an Item Profile and feature a favorite card or sealed product in a local display-only case.",
          meta: visibleVaultDisplayCase.length ? `${visibleVaultDisplayCase.length} featured` : "Local display only",
          actionLabel: "Open Display Case",
          onClick: openVaultDisplayCaseSurface,
          icon: "vault",
          tone: "vault",
          visible: Boolean(visibleVaultDisplayCase.length || activeVaultItems.length),
        },
        {
          key: "spark-pack",
          eyebrow: "Spark Moment",
          title: activeSparkKidPack ? "Spark pack in progress" : "Help one kid or family",
          detail: activeSparkKidPack
            ? `${activeSparkKidPack.packName || "Kid Pack"} is ${activeSparkKidPack.packStatus || "in planning"}. Keep child details private and review before gifting.`
            : "Build a Kid Pack or log a family support gift when there is a real Spark action to remember.",
          meta: activeSparkKidPack ? "Local Kid Pack" : "Parent-safe",
          actionLabel: activeSparkKidPack ? "Open The Spark" : "Build Kid Pack",
          onClick: () => activeSparkKidPack ? setActiveTab("kidsProgram") : openSparkKidPackFlow({ source: "hearth-smart-spark-pack" }),
          icon: "spark",
          tone: "spark",
          visible: hearthSparkRelevant || sparkKidPacks.length > 0 || sparkGifts.length > 0,
        },
        {
          key: "trusted-circle",
          eyebrow: "Tidepool",
          title: trustedCircleCount ? "Trusted Circle reminder" : "Remember safe helpers",
          detail: trustedCircleCount
            ? `${trustedCircleCount} private Trusted Circle note${trustedCircleCount === 1 ? "" : "s"} saved. This does not verify people or send invites.`
            : "Use Tidepool to keep private notes about trusted shops, helpers, and family-safe contacts.",
          meta: trustedCircleCount ? "Private notes" : "No verification claims",
          actionLabel: "Open Tidepool",
          onClick: () => setActiveTab("tidepool"),
          icon: "pool",
          tone: "tidepool",
          visible: Boolean(trustedCircleCount || adaptiveUiState.familyMode),
        },
        {
          key: "upgrade-next",
          eyebrow: "Upgrade Preview",
          title: "Explore one upgrade preview",
          detail: "See how upgraded plans can expand tracking capacity later without connecting billing in this beta.",
          meta: "No payment flow",
          actionLabel: "Compare Plans",
          onClick: () => setActiveTab("membership"),
          icon: "plan",
          tone: "gold",
          visible: !hasHearthLocalSignals || Boolean(subscriptionProfile?.plan === "free" || subscriptionProfile?.tier === "free" || !subscriptionProfile?.plan),
        },
      ].filter((card) => card.visible).sort((a, b) => {
        const activeDisplayCasePriority = (card) => card.key === "display-case" && visibleVaultDisplayCase.length ? 1 : 0;
        return activeDisplayCasePriority(b) - activeDisplayCasePriority(a);
      }).slice(0, 5);
      const hearthSmartDailyFallback = {
        key: "try-one-next-step",
        eyebrow: "Next Best Step",
        title: "Try one next step",
        detail: "Start by adding something to Vault, then Hearth can personalize the day with local collection signals.",
        meta: "Local beta",
        actionLabel: "Add to Vault",
        onClick: () => openQuickAddAction("vaultItem"),
        icon: "hearth",
        tone: "hearth",
      };
      const visibleHearthSmartDailyCards = hearthSmartDailyCards.length ? hearthSmartDailyCards : [hearthSmartDailyFallback];
      const profileDisplayNameValue = String(
        currentUserProfile?.displayName ||
        currentUserProfile?.display_name ||
        profileForm.displayName ||
        currentUserProfile?.firstName ||
        currentUserProfile?.first_name ||
        ""
      ).trim();
      const explicitPublicUsername = String(
        currentUserProfile?.publicUsername ||
        currentUserProfile?.public_username ||
        currentUserProfile?.username ||
        profileForm.publicUsername ||
        ""
      ).trim();
      const smartSetupAlreadyHandled = Boolean(
        smartSetupPreferences.completedAt ||
        smartSetupPreferences.setupCompletedAt ||
        smartSetupPreferences.dismissedAt ||
        betaReadinessData.onboarding?.firstLoginSeen
      );
      const profileSetupIncomplete = Boolean(!profileDisplayNameValue || !explicitPublicUsername || !smartSetupAlreadyHandled);
      const latestRecentActivity = recentRows[0] || null;
      const exchangeReviewCount = workspaceTradeRecords.length + (sellerAccessVisible ? forgeReviewCount : 0);
      const hearthSmartSparkCards = [
        adminToolsVisible && (pendingBetaRequests || pendingKidsRequests || scoutNeedsReviewReports.length) ? {
          key: "admin-review",
          eyebrow: "Admin",
          title: "Review protected queues",
          detail: `${pendingBetaRequests + pendingKidsRequests + scoutNeedsReviewReports.length} item${pendingBetaRequests + pendingKidsRequests + scoutNeedsReviewReports.length === 1 ? "" : "s"} need beta, family, or Scout review.`,
          meta: "Admin only",
          actionLabel: "Open Admin",
          onClick: () => setActiveTab("adminReview"),
          icon: "settings",
          tone: "admin",
        } : null,
        sellerAccessVisible && forgeReviewCount > 0 ? {
          key: "forge-review",
          eyebrow: "Forge",
          title: "Review seller records",
          detail: `${forgeReviewCount} local Forge item${forgeReviewCount === 1 ? "" : "s"} need receipt, price, or listing attention.`,
          meta: "Private ledger",
          actionLabel: "Open Forge",
          onClick: () => setActiveTab("inventory"),
          icon: "forge",
          tone: "forge",
        } : null,
        profileSetupIncomplete ? {
          key: "finish-setup",
          eyebrow: "Setup",
          title: "Finish your app setup",
          detail: "Review your profile name, public handle, and setup choices so shared reports stay clear and safe.",
          meta: "Local profile",
          actionLabel: "Open Profile",
          onClick: () => openUtilityPage("profile"),
          icon: "settings",
          tone: "gold",
        } : null,
        !activeVaultItems.length ? {
          key: "first-vault-item",
          eyebrow: "Vault",
          title: "Add your first Vault item",
          detail: "Save one card, sealed product, slab, or supply so Hearth can personalize future actions.",
          meta: "First step",
          actionLabel: "Add to Vault",
          onClick: () => openQuickAddAction("vaultItem"),
          icon: "vault",
          tone: "vault",
        } : null,
        activeVaultItems.length && (latestVaultActivityItem || vaultItemsMissingEstimate.length || recentVaultItems.length) ? {
          key: "review-vault",
          eyebrow: "Vault",
          title: latestVaultActivityItem ? "Review recent Vault activity" : "Review your Vault",
          detail: latestVaultActivityItem
            ? `${latestVaultActivityItem.name || latestVaultActivityItem.displayName || "Recent item"} is your latest saved item. Check notes, photos, or value when ready.`
            : `${vaultItemsMissingEstimate.length} item${vaultItemsMissingEstimate.length === 1 ? "" : "s"} could use an estimate, note, or photo.`,
          meta: `${activeVaultItems.length} item${activeVaultItems.length === 1 ? "" : "s"}`,
          actionLabel: "Open Vault",
          onClick: () => setActiveTab("vault"),
          icon: "vault",
          tone: "vault",
        } : null,
        hearthCanUseScout && scoutReportRows.length > 0 ? {
          key: "check-scout",
          eyebrow: "Scout",
          title: latestScoutReport ? "Check current Scout reports" : "Review Scout reports",
          detail: latestScoutReport
            ? `${latestScoutItem} was reported near ${latestScoutStoreName}. Review freshness before making a trip.`
            : `${scoutReportRows.length} local report${scoutReportRows.length === 1 ? "" : "s"} available for review.`,
          meta: hearthFreshReports ? `${hearthFreshReports} fresh` : "Current reports",
          actionLabel: "Open Scout",
          onClick: () => setActiveTab("scout"),
          icon: "scout",
          tone: "scout",
        } : null,
        hearthCanUseScout && !scoutReportRows.length && !followedStores.length ? {
          key: "choose-store",
          eyebrow: "Scout",
          title: "Choose your first watched store",
          detail: "Scout works best after you choose one store or region to watch. No raw stocking patterns are exposed.",
          meta: "Free watch",
          actionLabel: "Open Scout",
          onClick: () => setActiveTab("scout"),
          icon: "scout",
          tone: "scout",
        } : null,
        exchangeReviewCount > 0 ? {
          key: "exchange-review",
          eyebrow: "Exchange",
          title: latestTradeForHearth ? "Review your latest trade memory" : "Review Exchange actions",
          detail: latestTradeForHearth
            ? `${latestTradeForHearth.sourceItemName || latestTradeForHearth.itemGiven || "Your side"} for ${latestTradeForHearth.receivedItemName || latestTradeForHearth.itemReceived || "their side"} is saved locally.`
            : "Open Forge to review local trades, receipts, prices, or listing prep.",
          meta: `${exchangeReviewCount} local signal${exchangeReviewCount === 1 ? "" : "s"}`,
          actionLabel: "Open Forge",
          onClick: () => setActiveTab("inventory"),
          icon: "forge",
          tone: "forge",
        } : null,
        (marketPriceMemories.length || workspaceWatchlist.length || needsMarketCheckItems.length) ? {
          key: "market-review",
          eyebrow: "Market",
          title: latestMarketMemoryForHearth ? "Review saved Price Memory" : "Review Market watchlist",
          detail: latestMarketMemoryForHearth
            ? `${latestMarketMemoryForHearth.itemName || "Saved Price"} is a manual snapshot. Check again before buying, selling, or trading.`
            : `${workspaceWatchlist.length || needsMarketCheckItems.length} watched item${(workspaceWatchlist.length || needsMarketCheckItems.length) === 1 ? "" : "s"} can be checked before a decision.`,
          meta: "Manual research",
          actionLabel: "Open Market",
          onClick: () => setActiveTab("market"),
          icon: "market",
          tone: "market",
        } : null,
        hearthSparkRelevant && (kidsApplication || sparkKidPacks.length || sparkGifts.length || hearthMode === "simple") ? {
          key: "spark-review",
          eyebrow: "Spark",
          title: kidsApplication ? "Review Kids Program status" : "Plan a family-safe Spark action",
          detail: kidsApplication
            ? `Your Kids Program request is ${statusLabel(kidsApplication.status || "pending")}.`
            : "Open The Spark for parent-managed kid packs, gifts, and family-safe support notes.",
          meta: "Parent-safe",
          actionLabel: "Open The Spark",
          onClick: () => setActiveTab("kidsProgram"),
          icon: "spark",
          tone: "spark",
        } : null,
        latestRecentActivity ? {
          key: "recent-activity",
          eyebrow: "Recent",
          title: "Return to recent activity",
          detail: `${latestRecentActivity.title} | ${latestRecentActivity.detail}`,
          meta: latestRecentActivity.label || "Recent",
          actionLabel: "Open",
          onClick: latestRecentActivity.action,
          icon: "hearth",
          tone: "gold",
        } : null,
      ].filter(Boolean).slice(0, 4);
      const visibleHearthSmartSparkCards = hearthSmartSparkCards.length ? hearthSmartSparkCards : [{
        key: "smart-sparks-empty",
        eyebrow: "Start",
        title: "Add one thing to Vault",
        detail: "Hearth will get smarter after you add one real collection item or Scout report.",
        meta: "Local beta",
        actionLabel: "Add to Vault",
        onClick: () => openQuickAddAction("vaultItem"),
        icon: "vault",
        tone: "vault",
      }];
      const renderHearthSmartSparksPanel = () => (
        <section className="hearth-smart-sparks-panel" aria-label="Smart Sparks">
          <div className="compact-card-header hearth-smart-sparks-header">
            <div>
              <h3>Smart Sparks</h3>
              <p>Adaptive next actions from your local Vault, Scout, Market, Forge, and setup data.</p>
            </div>
            <EtMockupPill tone={hearthIsNewUser ? "gold" : "collector"}>{hearthIsNewUser ? "First steps" : "Adaptive"}</EtMockupPill>
          </div>
          <div className="hearth-smart-sparks-list">
            {visibleHearthSmartSparkCards.map((card) => (
              <article className={`hearth-smart-spark-card et-mockup-tone-${card.tone}`} key={card.key}>
                <EtMockupIcon icon={card.icon} tone={card.tone} />
                <div className="hearth-smart-spark-copy">
                  <div className="hearth-smart-spark-meta">
                    <span>{card.eyebrow}</span>
                    <small>{card.meta}</small>
                  </div>
                  <h3>{card.title}</h3>
                  <p>{card.detail}</p>
                </div>
                <EtMockupButton variant="secondary" onClick={card.onClick}>{card.actionLabel}</EtMockupButton>
              </article>
            ))}
          </div>
        </section>
      );
      const hearthCollectorPathSteps = [
        {
          key: "organize-item",
          title: "Organize one item",
          detail: activeVaultItems.length ? "Review a Vault item, condition note, Grade Assist checklist, or Collection Set." : "Add one card, sealed product, slab, or accessory to Vault.",
          status: hearthGradeAssistChecklistCount ? "Checklist saved" : activeVaultItems.length ? "Ready" : "Start",
          actionLabel: activeVaultItems.length ? "Open Vault" : "Add Item",
          onClick: () => activeVaultItems.length ? setActiveTab("vault") : openQuickAddAction("vaultItem"),
          tone: "vault",
        },
        {
          key: "market-memory",
          title: "Check one Market Memory",
          detail: marketPriceMemories.length ? "Review a manual snapshot before buying, selling, or trading." : "Save a manual price snapshot when you see one worth remembering.",
          status: marketPriceMemories.length ? `${marketPriceMemories.length} saved` : "Manual",
          actionLabel: "Open Market",
          onClick: () => setActiveTab("market"),
          tone: "market",
        },
        {
          key: "review-trade",
          title: "Review one trade",
          detail: workspaceTradeRecords.length ? "Look back at your latest Trade Ledger memory." : "Use Trade Compass before a real trade.",
          status: workspaceTradeRecords.length ? `${workspaceTradeRecords.length} logged` : "Guide",
          actionLabel: workspaceTradeRecords.length ? "Open Forge" : "Trade Compass",
          onClick: () => workspaceTradeRecords.length ? setActiveTab("inventory") : openTradeCompassFlow({ source: "hearth-collector-path" }),
          tone: "forge",
        },
        {
          key: "spark-action",
          title: "Help one kid/family Spark action",
          detail: sparkKidPacks.length || sparkGifts.length ? "Review Kid Packs or Giving Ledger support." : "Plan one Kid Pack or family support note.",
          status: sparkKidPacks.length ? `${sparkKidPacks.length} pack${sparkKidPacks.length === 1 ? "" : "s"}` : "Parent-safe",
          actionLabel: "Open The Spark",
          onClick: () => setActiveTab("kidsProgram"),
          tone: "spark",
        },
        {
          key: "upgrade-preview",
          title: "Explore one upgrade preview",
          detail: "Compare local beta plan value without starting checkout or billing.",
          status: "Preview",
          actionLabel: "Compare Plans",
          onClick: () => setActiveTab("membership"),
          tone: "gold",
        },
      ];
      const hearthSnapshotCards = [
        {
          key: "snapshot-vault",
          label: "Vault",
          value: activeVaultItems.length
            ? `${activeVaultItems.length} item${activeVaultItems.length === 1 ? "" : "s"}`
            : "Start Vault",
          detail: vaultValue > 0
            ? hearthVaultValueLabel
            : "Add your first item",
          accent: "vault",
          onClick: () => hearthHasVaultItems ? setActiveTab("vault") : openQuickAddAction("vaultItem"),
        },
        hearthCanUseScout ? {
          key: "snapshot-scout",
          label: "Scout",
          value: latestScoutReport ? "Signal ready" : `${followedStores.length || 0} watched`,
          detail: latestScoutReport ? latestScoutStoreName : "Current reports only",
          accent: "scout",
          onClick: () => setActiveTab("scout"),
        } : null,
        {
          key: "snapshot-market",
          label: "Market",
          value: workspaceWatchlist.length ? `${workspaceWatchlist.length} watched` : "Fair value",
          detail: bestMarketMover ? (bestMarketMover.name || bestMarketMover.productName || "Check watchlist") : "Search before buying",
          accent: "market",
          onClick: () => setActiveTab("market"),
        },
        hearthSparkRelevant ? {
          key: "snapshot-spark",
          label: "Spark",
          value: kidsApplication ? statusLabel(kidsApplication.status || "pending") : "Family support",
          detail: kidsApplication ? "Request tracked" : "Kid-safe collecting",
          accent: "spark",
          onClick: () => setActiveTab("kidsProgram"),
        } : null,
      ].filter(Boolean);
      const hearthAdminShortcutVisible = Boolean(adminViewingAsAdmin || adminEditModeActive);
      const commandAssistMessages = adminToolsVisible ? suggestions.filter(isEmberAssistSuggestion) : [];
      const commandShopRows = adminToolsVisible
        ? buildStoreMapRows().filter((row) => storeLooksLikeCommunityShop(row) || shopReviewBadges(row.store).length)
        : [];
      const commandSummary = adminToolsVisible
        ? buildAdminCommandCenterSummary({
            scoutReports: scoutReportRows,
            communityGuesses: scoutGuessRows,
            assistMessages: commandAssistMessages,
            stores: commandShopRows.map((row) => row.store),
            tidepoolPosts,
            feedback: betaReadinessData.betaFeedback || [],
            errors: betaReadinessData.appErrorLogs || [],
          })
        : null;
      const commandCatalogIssueCount = adminToolsVisible
        ? suggestions.filter((suggestion) => ["Catalog Suggestions", "SKU / UPC Suggestions", "Store Suggestions"].includes(REVIEW_SECTION_LABELS[getSuggestionReviewSection(suggestion)])).length
        : 0;
      const openCommandQueue = (filter = "Trust Command Center") => {
        setAdminReviewFilter(filter);
        setActiveTab("adminReview");
      };
      const commandPriorityCards = [
        {
          key: "scout-reports",
          title: "Scout Reports",
          count: scoutNeedsReviewReports.length,
          empty: "No urgent review items",
          detail: "Reports that need moderation before they influence trust signals.",
          filter: "Scout Report Review",
          icon: "scout",
          tone: "scout",
        },
        {
          key: "spark-requests",
          title: "Spark Requests",
          count: pendingKidsRequests,
          empty: "No pending requests",
          detail: "Family and Spark requests waiting for safe review.",
          filter: "Kids Program Applications",
          icon: "spark",
          tone: "spark",
        },
        {
          key: "catalog-issues",
          title: "Catalog Issues",
          count: commandCatalogIssueCount,
          empty: "All clear for now",
          detail: "Missing products, UPC/SKU fixes, and store corrections.",
          filter: "Catalog Suggestions",
          icon: "search",
          tone: "vault",
        },
        {
          key: "shop-approvals",
          title: "Shop Approvals",
          count: commandSummary?.shopsNeedingReview || 0,
          empty: "All clear for now",
          detail: "Family-friendly shop badges and community-safe partner metadata.",
          filter: "Family-Friendly Shop Review",
          icon: "settings",
          tone: "admin",
        },
      ];
      const commandQueueRows = [...commandPriorityCards].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
      const commandQuickActions = [
        { key: "admin-dashboard", label: "Admin Dashboard", helper: "Open the protected command center.", icon: "settings", filter: "Trust Command Center" },
        { key: "scout-queue", label: "Scout Reports", helper: "Review current report safety.", icon: "scout", filter: "Scout Report Review" },
        { key: "spark-queue", label: "Spark Requests", helper: "Review family requests.", icon: "spark", filter: "Kids Program Applications" },
        { key: "catalog-queue", label: "Catalog Issues", helper: "Review products and UPC/SKU fixes.", icon: "search", filter: "Catalog Suggestions" },
      ];
      if (adminToolsVisible) {
        const openItems = commandPriorityCards.reduce((sum, card) => sum + Number(card.count || 0), 0);
        return (
          <div className="dashboard-layout home-clean-layout hearth-command-layout hearth-command-view command-hearth">
            <section className="panel command-hearth-header" aria-label="Command Hearth status">
              <div className="command-hearth-title-block">
                <span className="hearth-logo-mark command-hearth-mark" aria-hidden="true">
                  <img src={BRAND_ASSETS.mark} alt="" />
                </span>
                <div>
                  <p className="section-kicker">Hearth</p>
                  <h1>Command Hearth</h1>
                  <strong>Good afternoon, Ember</strong>
                  <p>Here&apos;s what needs your attention today.</p>
                </div>
              </div>
              <div className="command-hearth-status-stack" aria-label="Command summary">
                <span className={openItems ? "status-badge warning" : "status-badge success"}>
                  {openItems ? `${openItems} open` : "All clear for now"}
                </span>
                <button type="button" className="secondary-button" onClick={() => openCommandQueue("Trust Command Center")}>Open Admin</button>
              </div>
            </section>

            <section className="command-hearth-main-grid" aria-label="Command Hearth overview">
              <div className="command-hearth-primary-column">
                <section className="panel command-hearth-priority-panel" aria-label="Priority cards">
                  <div className="compact-card-header">
                    <div>
                      <h2>Priority Cards</h2>
                      <p>Protected admin queues only. Normal users never see this view.</p>
                    </div>
                  </div>
                  <div className="command-hearth-priority-grid">
                    {commandPriorityCards.map((card) => (
                      <button
                        type="button"
                        className={`command-hearth-card hearth-accent-${card.tone} ${card.count ? "needs-review" : "is-clear"}`}
                        key={card.key}
                        onClick={() => openCommandQueue(card.filter)}
                      >
                        <span className="command-hearth-card-icon" aria-hidden="true"><AppNavIcon kind={card.icon} /></span>
                        <span>
                          <small>{card.title}</small>
                          <strong>{card.count ? card.count : "Clear"}</strong>
                          <em>{card.count ? card.detail : card.empty}</em>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="panel command-hearth-queue-panel" aria-label="Priority Queue">
                  <div className="compact-card-header">
                    <div>
                      <h2>Priority Queue</h2>
                      <p>Start with items that affect trust, family safety, or catalog quality.</p>
                    </div>
                  </div>
                  <div className="command-hearth-queue-list">
                    {commandQueueRows.map((row) => (
                      <button type="button" className="command-hearth-queue-row" key={row.key} onClick={() => openCommandQueue(row.filter)}>
                        <span>
                          <strong>{row.title}</strong>
                          <small>{row.count ? row.detail : row.empty}</small>
                        </span>
                        <b>{row.count ? row.count : "Clear"}</b>
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <aside className="command-hearth-side-column" aria-label="Command Hearth actions">
                <section className="panel command-hearth-actions-panel">
                  <div className="compact-card-header">
                    <div>
                      <h2>Admin Quick Actions</h2>
                      <p>Protected tools for owner/admin review.</p>
                    </div>
                  </div>
                  <div className="command-hearth-action-grid">
                    {commandQuickActions.map((action) => (
                      <button type="button" className="command-hearth-action" key={action.key} onClick={() => openCommandQueue(action.filter)}>
                        <span aria-hidden="true"><AppNavIcon kind={action.icon} /></span>
                        <span>
                          <strong>{action.label}</strong>
                          <small>{action.helper}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="panel command-hearth-recent-panel" aria-label="Recent Activity">
                  <div className="compact-card-header">
                    <div>
                      <h2>Recent Activity</h2>
                      <p>Latest app movement across protected queues.</p>
                    </div>
                  </div>
                  <div className="home-list compact-home-list hearth-recent-list">
                    {recentRows.length ? recentRows.map((activity) => (
                      <button type="button" className="home-list-row hearth-recent-row" key={activity.id} onClick={activity.action}>
                        <span>
                          <strong>{activity.title}</strong>
                          <small>{activity.label} | {activity.detail}</small>
                        </span>
                        <b>Open</b>
                      </button>
                    )) : (
                      <div className="small-empty-state hearth-empty-state">
                        <strong>No recent activity yet.</strong>
                        <p>No urgent review items are moving right now.</p>
                      </div>
                    )}
                  </div>
                </section>
              </aside>
            </section>
          </div>
        );
      }
      return (
        <EtMockupPageShell
          accent="hearth"
          className={`home-clean-layout hearth-mockup-rebuild hearth-dashboard-final hearth-mode-${hearthMode}`}
          ariaLabel="Hearth daily command center"
        >
          <div className="et-mockup-main-column hearth-mockup-main">
            <EtMockupHero
              title={hearthHomeTitle}
              detail="Here's your collection at a glance."
              points={{ value: hearthEmberPoints, label: "Ember Points" }}
              pills={[
                { label: "Public Beta", tone: "beta" },
                { label: hearthModeChipLabel, tone: "collector" },
              ]}
              todayAction={{
                label: "Today",
                title: hearthTodayMessage,
                cta: bestAction.primaryLabel,
                onClick: bestAction.onPrimary,
              }}
              adminAction={hearthAdminShortcutVisible ? (
                <EtMockupButton variant="ghost" className="hearth-mockup-admin-button" onClick={() => setActiveTab("adminReview")}>Admin</EtMockupButton>
              ) : null}
            />

            <EtMockupSectionCard
              title="Daily Command Center"
              detail="One useful collector step, then a quick pulse."
              className="hearth-daily-command-center"
            >
              <article className={`hearth-next-best-step et-mockup-tone-${hearthDailyNextStep.tone}`}>
                <div>
                  <span>{hearthDailyNextStep.label}</span>
                  <h3>{hearthDailyNextStep.title}</h3>
                  <p>{hearthDailyNextStep.detail}</p>
                </div>
                <div className="hearth-next-step-actions">
                  <EtMockupButton onClick={hearthDailyNextStep.onClick}>{hearthDailyNextStep.actionLabel}</EtMockupButton>
                  <EtMockupButton variant="secondary" onClick={hearthDailyNextStep.onSecondary}>{hearthDailyNextStep.secondaryActionLabel}</EtMockupButton>
                </div>
              </article>

              {renderHearthSmartSparksPanel()}

              <div className="hearth-dashboard-pulse-grid" aria-label="Hearth pulse">
                {hearthSnapshotCards.map((stat) => (
                  <EtMockupStatCard
                    key={stat.key}
                    label={stat.label}
                    value={stat.value}
                    detail={stat.detail}
                    tone={stat.accent}
                    onClick={stat.onClick}
                  />
                ))}
              </div>

              <div className="hearth-daily-command-grid hearth-dashboard-command-grid" aria-label="Core Hearth paths">
                {hearthDashboardPulseCards.map((card) => (
                  <article className={`hearth-daily-command-card et-mockup-tone-${card.tone}`} key={card.key}>
                    <EtMockupIcon icon={card.icon} tone={card.tone} />
                    <div>
                      <span>{card.label}</span>
                      <h3>{card.title}</h3>
                      <p>{card.detail}</p>
                      <small>{card.reminder}</small>
                    </div>
                    <button type="button" className="secondary-button" onClick={card.onClick}>{card.actionLabel}</button>
                  </article>
                ))}
              </div>
            </EtMockupSectionCard>

            <EtMockupSectionCard
              title="Recent Activity"
              detail="Latest meaningful movement across Scout, Vault, Market, and Forge."
              className="hearth-mockup-recent hearth-dashboard-recent"
            >
              <div className="hearth-mockup-recent-list">
                {recentRows.length ? recentRows.map((activity) => (
                  <EtMockupActionCard
                    key={activity.id}
                    title={activity.title}
                    detail={`${activity.label} | ${activity.detail}`}
                    meta="Open"
                    icon="hearth"
                    tone="gold"
                    onClick={activity.action}
                  />
                )) : (
                  <EtMockupEmptyState
                    title="No collector trail yet."
                    detail="Add a Vault item, Scout proof note, Market watch, or Spark support preview to start a reviewable activity trail."
                    action={<EtMockupButton variant="secondary" onClick={() => openAddActionSheet("hearth-empty")}>Quick Add</EtMockupButton>}
                  />
                )}
              </div>
            </EtMockupSectionCard>

            {hearthOnboardingPanel && hearthIsNewUser ? (
              <div className="hearth-onboarding-slot hearth-onboarding-slot-primary">{hearthOnboardingPanel}</div>
            ) : null}

            <details className="hearth-dashboard-more-tools">
              <summary>
                <span>
                  <strong>More Hearth tools</strong>
                  <small>Open secondary paths when you need them.</small>
                </span>
              </summary>
              <div className="hearth-dashboard-more-body">
                <section className="hearth-dashboard-focus-compact" aria-label="Today's Focus">
                  <div className="compact-card-header">
                    <div>
                      <h3>Today&apos;s Focus</h3>
                      <p>Manual local-beta prompts; no real-time alerts or live pricing.</p>
                    </div>
                    <EtMockupPill tone="collector">Local beta</EtMockupPill>
                  </div>
                  <div className="hearth-smart-card-grid" aria-label="Smart daily cards">
                    {visibleHearthSmartDailyCards.slice(0, 3).map((card) => (
                      <article className={`hearth-smart-card et-mockup-tone-${card.tone}`} key={card.key}>
                        <EtMockupIcon icon={card.icon} tone={card.tone} />
                        <div className="hearth-smart-card-main">
                          <div className="hearth-smart-card-heading">
                            <span>{card.eyebrow}</span>
                            <small>{card.meta}</small>
                          </div>
                          <h3>{card.title}</h3>
                          <p>{card.detail}</p>
                          <EtMockupButton variant="secondary" onClick={card.onClick}>{card.actionLabel}</EtMockupButton>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                {hearthDashboardMoreCards.length ? (
                  <div className="hearth-daily-command-grid hearth-daily-command-grid-secondary" aria-label="More Hearth paths">
                    {hearthDashboardMoreCards.map((card) => (
                      <article className={`hearth-daily-command-card et-mockup-tone-${card.tone}`} key={card.key}>
                        <EtMockupIcon icon={card.icon} tone={card.tone} />
                        <div>
                          <span>{card.label}</span>
                          <h3>{card.title}</h3>
                          <p>{card.detail}</p>
                          <small>{card.reminder}</small>
                        </div>
                        <button type="button" className="secondary-button" onClick={card.onClick}>{card.actionLabel}</button>
                      </article>
                    ))}
                  </div>
                ) : null}

                <div className="hearth-collector-path-list hearth-dashboard-path-list" aria-label="Today's Collector Path">
                  {hearthCollectorPathSteps.map((step, index) => (
                    <button
                      type="button"
                      className={`hearth-collector-path-step et-mockup-tone-${step.tone}`}
                      key={step.key}
                      onClick={step.onClick}
                    >
                      <span className="hearth-collector-path-index">{index + 1}</span>
                      <span className="hearth-collector-path-copy">
                        <strong>{step.title}</strong>
                        <small>{step.detail}</small>
                      </span>
                      <span className="hearth-collector-path-status">
                        <em>{step.status}</em>
                        <b>{step.actionLabel}</b>
                      </span>
                    </button>
                  ))}
                </div>

                {renderUpgradeValuePreview("hearth")}
                {renderTodaySparksPanel()}
              </div>
            </details>

            {isOffline ? (
              <section className="hearth-state-card hearth-state-card--offline" role="status">
                <div>
                  <strong>You&apos;re offline</strong>
                  <span>Some features may be limited. Local actions stay visible and can sync later where supported.</span>
                </div>
                <button type="button" className="secondary-button" onClick={() => window.location.reload()}>Try again</button>
              </section>
            ) : null}

            <LiveEmberTrustNote message={HEARTH_FOUNDATION_TRUST_MESSAGE} />

            {hearthOnboardingPanel && !hearthIsNewUser ? (
              <div className="hearth-onboarding-slot hearth-onboarding-slot-secondary">{hearthOnboardingPanel}</div>
            ) : null}
          </div>

          <EtMockupRightRail
            title="Quick Actions"
            detail="Review-first tools kept close without crowding the dashboard."
          >
            <EtMockupSectionCard
              title="Common paths"
              detail="Start, search, report, or ask for guidance."
              className="hearth-mockup-quick-actions"
            >
              <div className="hearth-mockup-quick-grid">
                {hearthFoundationQuickActions.slice(0, 4).map((action) => (
                  <EtMockupActionCard
                    key={action.key}
                    title={action.title}
                    detail={action.detail}
                    icon={action.icon}
                    tone={action.tone}
                    onClick={action.onClick}
                  />
                ))}
              </div>
            </EtMockupSectionCard>

            <div className="et-mockup-action-stack hearth-mockup-feature-stack hearth-feature-list" aria-label="Hearth feature status">
              {hearthFeatureCards.slice(0, 3).map((card) => (
                <EtMockupActionCard
                  key={card.key}
                  title={card.title}
                  detail={`${card.value}${card.detail ? ` | ${card.detail}` : ""}`}
                  meta={card.meta}
                  icon={card.icon}
                  tone={card.accent}
                  onClick={card.onClick}
                  className={`hearth-feature-card hearth-accent-${card.accent}`}
                />
              ))}
            </div>
          </EtMockupRightRail>
        </EtMockupPageShell>
      );
    }

  return renderHearthHomeCommandView();
}
