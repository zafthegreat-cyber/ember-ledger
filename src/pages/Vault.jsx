import { CommandBoardV4 } from "../components/command-system";

export default function VaultPage(props) {
  const {
    children,
    renderHeader,
    showDashboard,
    activeWorkspaceName,
    activeVaultCardItems,
    activeVaultItems,
    activeVaultSealedItems,
    CollectorShowcaseCard,
    EtMockupActionCard,
    EtMockupButton,
    EtMockupEmptyState,
    EtMockupPill,
    EtMockupRightRail,
    EtMockupSectionCard,
    EtMockupStatCard,
    FlowNextActionCard,
    hasValue,
    MASTER_CARD_GROUPING_PREVIEW_CARDS,
    MasterCardGroupPreview,
    normalizeVaultStatus,
    openBeaconCenter,
    openCompassSearch,
    openCollectionManager,
    openMarketWatchForVaultItem,
    openProductAddFlow,
    openTradeCompassFlow,
    openVaultCollectionSetFlow,
    openVaultImportCollectionFlow,
    openVaultQuickAddFlow,
    openVaultScanFlow,
    recentVaultItems,
    removeVaultDisplayCaseEntry,
    renderUpgradeValuePreview,
    setActiveTab,
    setSelectedVaultDetailId,
    setVaultFilter,
    setVaultLocationFilter,
    setVaultOwnerFilter,
    setVaultSearch,
    setVaultSetFilter,
    setVaultSubTab,
    setVaultToast,
    setVaultTypeFilter,
    setVaultValueFilter,
    shortDate,
    vaultCollectionSetSummary,
    vaultDisplayCaseCategoryLabel,
    vaultFilter,
    vaultItemDisplayImage,
    vaultItemSetLabel,
    vaultItemTotalMarketValue,
    vaultMarketValueDisplay,
    vaultSearch,
    vaultSetCompletionRows,
    vaultStatusLabel,
    vaultSubTab,
    vaultTypeFilter,
    visibleVaultCollectionSets,
    visibleVaultDisplayCase,
    visibleVaultMasterCards,
    wishlistItems,
  } = props;

  const openVaultItems = (filter = "all", refinements = {}) => {
    setVaultSubTab("collection");
    setVaultFilter(filter);
    setVaultTypeFilter(refinements.type || "all");
    setVaultSetFilter(refinements.set || "all");
    setVaultLocationFilter(refinements.location || "all");
    setVaultOwnerFilter(refinements.owner || "all");
    setVaultValueFilter(refinements.value || "all");
    setVaultSearch(refinements.search || "");
    setActiveTab("vault");
    window.setTimeout(() => document.getElementById("vault-items-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const vaultDetailConditionLabel = (item = {}) => String(
    item.conditionName || item.condition || item.grade || item.sealedCondition || item.sealed_condition || ""
  ).trim();
  const vaultDetailLocationLabel = (item = {}) => String(
    item.storageLocation || item.storage_location || item.locationSummary || item.physicalLocation || item.physical_location || item.location || ""
  ).trim();
  const vaultDetailEstimatedValue = vaultMarketValueDisplay === "Price data unavailable" ? "Value pending" : vaultMarketValueDisplay;
  const vaultDetailMissingPhotosCount = activeVaultItems.filter((item) => !hasValue(vaultItemDisplayImage(item))).length;
  const vaultDetailMissingStorageCount = activeVaultItems.filter((item) => !hasValue(vaultDetailLocationLabel(item))).length;
  const vaultDetailMissingConditionCount = activeVaultItems.filter((item) => !hasValue(vaultDetailConditionLabel(item))).length;

  function renderVaultHomeDashboard() {
      // TODO: Replace folder health and binder reminders with a reviewed read-only Vault summary contract when available.
      const cardQuantity = activeVaultCardItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const sealedQuantity = activeVaultSealedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const topSet = vaultSetCompletionRows.find((row) => row.ownedCount > 0 && (row.totalCards > 0 || row.catalogCards.length));
      const knownValueCount = activeVaultItems.filter((item) => Number(vaultItemTotalMarketValue(item) || item.marketPrice || item.marketValue || 0) > 0).length;
      const vaultItemHasNotes = (item) => [
        item.collectorNotes,
        item.collector_notes,
        item.notes,
        item.note,
        item.memoryStory,
        item.memory_story,
        item.story,
        item.actionNotes,
        item.action_notes,
      ].some(hasValue);
      const vaultItemHasProfileDetails = (item) => {
        const value = Number(vaultItemTotalMarketValue(item) || item.marketPrice || item.marketValue || item.currentValue || 0);
        return Boolean(
          vaultItemHasNotes(item) &&
          (item.conditionName || item.condition || item.grade) &&
          (value > 0) &&
          (vaultItemSetLabel(item) || item.productType || item.category)
        );
      };
      const getVaultItemValue = (item = {}) => {
        const savedTotal = Number(vaultItemTotalMarketValue(item) || 0);
        if (savedTotal > 0) return savedTotal;
        const unitValue = Number(item.marketPrice || item.marketValue || item.currentValue || item.estimatedValue || item.manualValue || item.targetPrice || 0);
        const quantity = Math.max(1, Number(item.quantity || item.ownedQuantity || item.quantityOwned || 1));
        return unitValue > 0 ? unitValue * quantity : 0;
      };
      const formatDashboardMoney = (value) => {
        const number = Number(value || 0);
        if (!number) return "$0";
        if (number >= 1000) return `$${Math.round(number).toLocaleString()}`;
        return `$${number.toFixed(number >= 100 ? 0 : 2)}`;
      };
      const pluralizeItems = (count) => `${count} item${count === 1 ? "" : "s"}`;
      const vaultItemConditionLabel = (item = {}) => String(
        item.conditionName || item.condition || item.grade || item.sealedCondition || item.sealed_condition || ""
      ).trim();
      const vaultItemLocationLabel = (item = {}) => String(
        item.storageLocation || item.storage_location || item.locationSummary || item.physicalLocation || item.physical_location || item.location || ""
      ).trim();
      const itemsWithNotesCount = activeVaultItems.filter(vaultItemHasNotes).length;
      const itemsWithPhotosCount = activeVaultItems.filter((item) => hasValue(vaultItemDisplayImage(item))).length;
      const itemsWithConditionCount = activeVaultItems.filter((item) => hasValue(vaultItemConditionLabel(item))).length;
      const itemsWithStorageCount = activeVaultItems.filter((item) => hasValue(vaultItemLocationLabel(item))).length;
      const itemsMissingPhotosCount = activeVaultItems.length - itemsWithPhotosCount;
      const itemsMissingConditionCount = activeVaultItems.length - itemsWithConditionCount;
      const itemsMissingStorageCount = activeVaultItems.length - itemsWithStorageCount;
      const itemsWithoutValueCount = activeVaultItems.filter((item) => getVaultItemValue(item) <= 0).length;
      const needsProfileDetailsCount = activeVaultItems.filter((item) => !vaultItemHasProfileDetails(item)).length;
      const percentOfVault = (count) => activeVaultItems.length ? Math.round((count / activeVaultItems.length) * 100) : 0;
      const valueHealthPercent = percentOfVault(knownValueCount);
      const vaultHealthScore = activeVaultItems.length
        ? Math.round((valueHealthPercent + percentOfVault(itemsWithPhotosCount) + percentOfVault(itemsWithConditionCount) + percentOfVault(itemsWithStorageCount) + percentOfVault(itemsWithNotesCount)) / 5)
        : 0;
      const collectionHealthPercent = vaultHealthScore;
      const estimatedValue = vaultMarketValueDisplay === "Price data unavailable" ? "Value pending" : vaultMarketValueDisplay;
      const portfolioTotalValue = activeVaultItems.reduce((sum, item) => sum + getVaultItemValue(item), 0);
      const portfolioCardValue = activeVaultCardItems.reduce((sum, item) => sum + getVaultItemValue(item), 0);
      const portfolioSealedValue = activeVaultSealedItems.reduce((sum, item) => sum + getVaultItemValue(item), 0);
      const portfolioWishlistValue = wishlistItems.reduce((sum, item) => sum + getVaultItemValue(item), 0);
      const portfolioBasisTotal = portfolioTotalValue > 0
        ? Math.max(1, portfolioTotalValue + portfolioWishlistValue)
        : Math.max(1, activeVaultCardItems.length + activeVaultSealedItems.length + wishlistItems.length + Math.max(0, activeVaultItems.length - activeVaultCardItems.length - activeVaultSealedItems.length));
      const portfolioCardBasis = portfolioTotalValue > 0 ? portfolioCardValue : activeVaultCardItems.length;
      const portfolioSealedBasis = portfolioTotalValue > 0 ? portfolioSealedValue : activeVaultSealedItems.length;
      const portfolioWishlistBasis = portfolioTotalValue > 0 ? portfolioWishlistValue : wishlistItems.length;
      const portfolioCardShare = Math.round((portfolioCardBasis / portfolioBasisTotal) * 100);
      const portfolioSealedShare = Math.round((portfolioSealedBasis / portfolioBasisTotal) * 100);
      const portfolioWishlistShare = Math.round((portfolioWishlistBasis / portfolioBasisTotal) * 100);
      const portfolioSealedStop = Math.min(100, portfolioCardShare + portfolioSealedShare);
      const portfolioWishlistStop = Math.min(100, portfolioSealedStop + portfolioWishlistShare);
      const portfolioValueLabel = (value, count) => value > 0 ? formatDashboardMoney(value) : pluralizeItems(count);
      const slabCount = activeVaultItems.filter((item) => /slab|graded/i.test(`${item.productType || ""} ${item.category || ""} ${item.grade || ""} ${item.gradingCompany || ""}`)).length;
      const tradeReadyCount = activeVaultItems.filter((item) => ["trade_pile", "ready_for_forge", "listed"].includes(normalizeVaultStatus(item))).length;
      const kidsCollectionCount = activeVaultItems.filter((item) => /kid|child|family/i.test(`${item.location || ""} ${item.owner || ""} ${item.purchaser || ""} ${item.purchaserName || ""}`)).length;
      const portfolioBreakdownCards = [
        { key: "cards", label: "Cards", value: portfolioValueLabel(portfolioCardValue, activeVaultCardItems.length), detail: `${activeVaultCardItems.length} records`, share: portfolioCardShare, tone: "vault" },
        { key: "sealed", label: "Sealed", value: portfolioValueLabel(portfolioSealedValue, activeVaultSealedItems.length), detail: `${activeVaultSealedItems.length} products`, share: portfolioSealedShare, tone: "gold" },
        { key: "slabs", label: "Slabs", value: slabCount, detail: "Graded or slabbed", share: percentOfVault(slabCount), tone: "collector" },
        { key: "wishlist", label: "Wishlist", value: wishlistItems.length, detail: "Wanted, not owned", share: portfolioWishlistShare, tone: "vault" },
      ];
      const storageLocationCards = [
        { key: "binder", label: "Binders", count: activeVaultItems.filter((item) => /binder|page|toploader/i.test(vaultItemLocationLabel(item))).length, detail: "Pages, binders, top loaders" },
        { key: "shelf", label: "Shelf / display", count: activeVaultItems.filter((item) => /shelf|display|case/i.test(vaultItemLocationLabel(item))).length, detail: "Shelf, case, display case" },
        { key: "box", label: "Box / tote", count: activeVaultItems.filter((item) => /box|tote|etb|closet|bin/i.test(vaultItemLocationLabel(item))).length, detail: "Boxes, ETBs, storage bins" },
        { key: "missing", label: "Missing location", count: itemsMissingStorageCount, detail: "Needs a physical spot" },
      ];
      const conditionCenterRows = [
        { key: "photos", label: "Photo proof", count: itemsWithPhotosCount, missing: itemsMissingPhotosCount, detail: "Front/reference image saved" },
        { key: "condition", label: "Condition", count: itemsWithConditionCount, missing: itemsMissingConditionCount, detail: "Manual condition recorded" },
        { key: "value", label: "Value", count: knownValueCount, missing: itemsWithoutValueCount, detail: "Saved estimate present" },
        { key: "storage", label: "Location", count: itemsWithStorageCount, missing: itemsMissingStorageCount, detail: "Binder, shelf, box, or case" },
      ].map((row) => ({ ...row, percent: percentOfVault(row.count) }));
      const confidenceLabel = activeVaultItems.length === 0
        ? "Not enough data"
        : valueHealthPercent >= 75 && itemsMissingConditionCount === 0
          ? "Strong"
          : valueHealthPercent >= 45
            ? "Moderate"
            : "Low";
      const firstItemNeedingValue = activeVaultItems.find((item) => getVaultItemValue(item) <= 0);
      const firstItemNeedingPhoto = activeVaultItems.find((item) => !hasValue(vaultItemDisplayImage(item)));
      const firstItemNeedingCondition = activeVaultItems.find((item) => !hasValue(vaultItemConditionLabel(item)));
      const firstItemNeedingStorage = activeVaultItems.find((item) => !hasValue(vaultItemLocationLabel(item)));
      const highestValueItem = [...activeVaultItems].sort((a, b) => getVaultItemValue(b) - getVaultItemValue(a))[0];
      const recommendationTarget = firstItemNeedingPhoto || firstItemNeedingStorage || firstItemNeedingCondition || firstItemNeedingValue || highestValueItem;
      const recommendationValue = recommendationTarget ? getVaultItemValue(recommendationTarget) : 0;
      const valueRangeLow = recommendationValue ? formatDashboardMoney(recommendationValue * 0.84) : "--";
      const valueRangeFair = recommendationValue ? formatDashboardMoney(recommendationValue) : "--";
      const valueRangeHigh = recommendationValue ? formatDashboardMoney(recommendationValue * 1.18) : "--";
      const vaultSmartRecommendation = !activeVaultItems.length
        ? {
          label: "Recommendation: Add",
          title: "Start with one reviewed item.",
          detail: "Add a card or sealed product, then Vault can show health, value, condition, storage, and trade signals.",
          cta: "Add to Vault",
          action: () => openVaultQuickAddFlow(),
        }
        : firstItemNeedingPhoto
          ? {
            label: "Recommendation: Add proof",
            title: firstItemNeedingPhoto.name || "Add item photos",
            detail: `${itemsMissingPhotosCount} ${itemsMissingPhotosCount === 1 ? "item needs" : "items need"} a reference photo before selling, trading, or donating.`,
            cta: "Open profile",
            action: () => setSelectedVaultDetailId(firstItemNeedingPhoto.id),
          }
          : firstItemNeedingStorage
            ? {
              label: "Recommendation: Organize",
              title: firstItemNeedingStorage.name || "Add storage locations",
              detail: `${itemsMissingStorageCount} ${itemsMissingStorageCount === 1 ? "item has" : "items have"} no binder, shelf, box, or case location.`,
              cta: "Open profile",
              action: () => setSelectedVaultDetailId(firstItemNeedingStorage.id),
            }
            : firstItemNeedingCondition
              ? {
                label: "Recommendation: Review",
                title: firstItemNeedingCondition.name || "Add condition notes",
                detail: `${itemsMissingConditionCount} ${itemsMissingConditionCount === 1 ? "item needs" : "items need"} manual condition context before a fair trade or sale decision.`,
                cta: "Open profile",
                action: () => setSelectedVaultDetailId(firstItemNeedingCondition.id),
              }
              : firstItemNeedingValue
                ? {
                  label: "Recommendation: Price check",
                  title: firstItemNeedingValue.name || "Add value data",
                  detail: `${itemsWithoutValueCount} ${itemsWithoutValueCount === 1 ? "item needs" : "items need"} a saved estimate before Vault can compare hold, sell, or trade paths.`,
                  cta: "Check Market",
                  action: () => setActiveTab("market"),
                }
                : {
                  label: "Recommendation: Hold",
                  title: highestValueItem?.name || "Review your top item",
                  detail: "Value, condition, and storage are present. Watch demand before listing or moving it into a trade.",
                  cta: "Open profile",
                  action: () => highestValueItem?.id ? setSelectedVaultDetailId(highestValueItem.id) : openVaultItems("all"),
                };
      const folderCards = [
        { key: "main", title: "Main Binder", count: cardQuantity || activeVaultCardItems.length, detail: "Master cards + variants", action: () => openVaultItems("all", { type: "Card" }) },
        { key: "sealed", title: "Sealed", count: sealedQuantity || activeVaultSealedItems.length, detail: "Products kept separate", action: () => setVaultSubTab("sealed") },
        { key: "favorites", title: "Favorites", count: activeVaultItems.filter((item) => item.favorite || item.pinned || item.featured).length, detail: "Pinned collection picks", action: () => openVaultItems("all") },
        { key: "kids", title: "Family Collection", count: activeVaultItems.filter((item) => /kid|child|family/i.test(`${item.location || ""} ${item.owner || ""} ${item.purchaser || ""}`)).length, detail: "Household-labeled folders", action: () => openVaultItems("all") },
        { key: "wishlist", title: "Wish List", count: wishlistItems.length, detail: "Wanted, not owned", action: () => setVaultSubTab("wishlist") },
      ];
      const recentRows = recentVaultItems.slice(0, 3);
      const quickActions = [
        { key: "scan-card", title: "Scan card", detail: "Find identity + variant", onClick: () => openVaultScanFlow() },
        { key: "scan-binder", title: "Scan binder page", detail: "Group copies before saving", onClick: () => openProductAddFlow({ source: "vault-home-binder-page", destinations: { vault: true } }) },
        { key: "manual", title: "Add manually", detail: "Cards, graded, sealed", onClick: () => openVaultQuickAddFlow() },
        { key: "import", title: "Import list", detail: "Review duplicate groups", onClick: () => openVaultImportCollectionFlow() },
      ];
      const masterPreviewCards = visibleVaultMasterCards.length
        ? visibleVaultMasterCards.slice(0, 2)
        : MASTER_CARD_GROUPING_PREVIEW_CARDS.slice(0, 2);
      const groupedVariantCount = visibleVaultMasterCards.reduce((sum, card) => sum + Number(card.variantCount || card.variants?.length || 0), 0);
      const vaultCollectionSummaryCards = [
        { key: "total-items", label: "Total items", value: activeVaultItems.length, detail: activeVaultItems.length ? "Owned Vault records" : "Add one item to begin", tone: "vault" },
        { key: "wishlist-count", label: "Wishlist count", value: wishlistItems.length, detail: wishlistItems.length ? "Wanted, not owned" : "No wishlist wants yet", tone: "collector" },
        { key: "items-with-notes", label: "Items with notes", value: itemsWithNotesCount, detail: itemsWithNotesCount ? "Collector context saved" : "Add stories or notes", tone: "gold" },
        { key: "items-without-value", label: "Items without value", value: itemsWithoutValueCount, detail: itemsWithoutValueCount ? "No saved estimate yet" : "Known values only", tone: "vault" },
        { key: "sets-created", label: "Sets created", value: vaultCollectionSetSummary.total, detail: vaultCollectionSetSummary.total ? "Local Set Shelf groups" : "Create a Set Shelf", tone: "collector" },
        { key: "recently-added", label: "Recently added", value: recentRows.length, detail: recentRows.length ? recentRows[0]?.name || "Recent Vault item" : "No recent movement", tone: "gold" },
        { key: "needs-profile-details", label: "Needs profile details", value: needsProfileDetailsCount, detail: needsProfileDetailsCount ? "Notes, condition, or value missing" : "Profiles look filled in", tone: "vault" },
      ];
      const vaultStatusStrip = [
        { key: "value", label: "Vault value", value: estimatedValue, detail: "Known values only", action: () => openVaultItems("all") },
        { key: "health", label: "Collection health", value: vaultHealthScore ? `${vaultHealthScore}%` : "Ready", detail: "Value, proof, condition, storage", action: () => openVaultItems("all") },
        { key: "storage", label: "Storage gaps", value: itemsMissingStorageCount, detail: "Binder, shelf, box, or case", action: () => openVaultItems("all") },
        { key: "condition", label: "Condition gaps", value: itemsMissingConditionCount, detail: "Review before trade or sale", action: () => {
          if (firstItemNeedingCondition?.id) setSelectedVaultDetailId(firstItemNeedingCondition.id);
          else openVaultItems("all");
        } },
        { key: "wishlist", label: "Wishlist", value: wishlistItems.length, detail: "Wanted items and target prices", action: () => setVaultSubTab("wishlist") },
      ];
      const vaultCommandSteps = [
        { key: "add", label: "Add item", detail: "Scan or manual entry", action: () => openVaultQuickAddFlow() },
        { key: "proof", label: "Add proof", detail: `${itemsMissingPhotosCount} photo gaps`, action: () => {
          if (firstItemNeedingPhoto?.id) setSelectedVaultDetailId(firstItemNeedingPhoto.id);
          else openVaultScanFlow();
        } },
        { key: "storage", label: "Place item", detail: `${itemsMissingStorageCount} location gaps`, action: () => {
          if (firstItemNeedingStorage?.id) setSelectedVaultDetailId(firstItemNeedingStorage.id);
          else openVaultItems("all");
        } },
        { key: "exchange", label: "Decide next", detail: "Hold, sell, trade, watch", action: () => openTradeCompassFlow({ source: "vault-command-center" }) },
      ];
      const vaultRouteCards = [
        { key: "collection", icon: "vault", label: "Collection", title: "Cards, slabs, sealed", detail: `${activeVaultItems.length} owned records`, active: true, action: () => openVaultItems("all") },
        { key: "portfolio", icon: "data", label: "Portfolio", title: "Value and mix", detail: `${confidenceLabel} confidence`, action: () => openVaultItems("all") },
        { key: "storage", icon: "workspace", label: "Storage", title: "Find every item", detail: itemsMissingStorageCount ? `${itemsMissingStorageCount} need a place` : "Locations ready", action: () => openVaultItems("all") },
        { key: "condition", icon: "admin", label: "Condition", title: "Grade readiness", detail: itemsMissingConditionCount ? `${itemsMissingConditionCount} need review` : "Ready for decisions", action: () => {
          if (firstItemNeedingCondition?.id) setSelectedVaultDetailId(firstItemNeedingCondition.id);
          else openVaultItems("all");
        } },
        { key: "wishlist", icon: "bell", label: "Wishlist", title: "Wants and targets", detail: `${wishlistItems.length} watched wants`, action: () => setVaultSubTab("wishlist") },
        { key: "exchange", icon: "exchange", label: "Exchange", title: "Sell or trade safely", detail: `${tradeReadyCount} ready signals`, action: () => openTradeCompassFlow({ source: "vault-route-strip" }) },
      ];

      return (
        <CommandBoardV4
          accent="vault"
          className="vault-live-home-dashboard vault-v4-dashboard"
          ariaLabel="Vault intelligence dashboard"
          label={activeWorkspaceName ? `Vault / ${activeWorkspaceName}` : "Vault"}
          title="Vault Command Center"
          description="Collection value, storage, condition, proof, and next collector actions."
          primaryAction={{ label: "Quick Add", icon: "plus", onClick: () => openVaultQuickAddFlow() }}
          secondaryActions={[
            { label: "Scan Item", icon: "scan", onClick: () => openVaultScanFlow() },
            { label: "Collection Settings", icon: "settings", onClick: () => openCollectionManager?.() },
          ]}
          utilityActions={[
            { label: "Compass", icon: "search", onClick: () => openCompassSearch?.("vault_compass") },
            { label: "Beacon", icon: "bell", onClick: () => openBeaconCenter?.("vault_beacon") },
          ]}
          statusItems={vaultStatusStrip}
          plan={{
            label: "Vault Plan",
            title: "Your next best collector actions",
            items: vaultCommandSteps,
            actions: [
              { label: "Add to Vault", icon: "plus", onClick: () => openVaultQuickAddFlow() },
              { label: "Collection Settings", icon: "settings", onClick: () => openCollectionManager?.() },
            ],
          }}
          routes={vaultRouteCards}
        >

          <EtMockupSectionCard
            className="vault-command-overview-card vault-collection-intelligence-card"
            title="Portfolio & Collection Health"
            detail="Value, mix, condition, storage, proof, and the next action for every part of your collection."
            action={(
              <span className="vault-command-heading-pills">
                <EtMockupPill tone="vault">Collection intelligence</EtMockupPill>
                <EtMockupPill tone="vault">Condition Center</EtMockupPill>
              </span>
            )}
          >
            <div className="vault-command-board-grid" aria-label="Vault command overview">
              <article className="vault-command-portfolio-card">
                <div className="compact-card-header">
                  <div>
                    <span className="trust-badge trust-badge--verified">Portfolio Breakdown</span>
                    <h3>{portfolioTotalValue ? formatDashboardMoney(portfolioTotalValue) : pluralizeItems(activeVaultItems.length)}</h3>
                    <p>Cards, sealed, slabs, wishlist, and trade-ready collection mix.</p>
                  </div>
                  <div
                    className="vault-portfolio-donut"
                    style={{
                      "--vault-card-share": `${portfolioCardShare}%`,
                      "--vault-sealed-share": `${portfolioSealedStop}%`,
                      "--vault-wishlist-share": `${portfolioWishlistStop}%`,
                    }}
                    aria-label="Vault portfolio mix"
                  >
                    <b>{activeVaultItems.length}</b>
                    <small>items</small>
                  </div>
                </div>
                <div className="vault-portfolio-breakdown-list">
                  {portfolioBreakdownCards.map((card) => (
                    <div className={`vault-portfolio-breakdown-row vault-portfolio-breakdown-row--${card.tone}`} key={card.key}>
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                      <small>{card.detail}</small>
                      <i aria-hidden="true"><b style={{ width: `${Math.max(5, card.share)}%` }} /></i>
                    </div>
                  ))}
                </div>
                <div className="vault-status-chip-row" aria-label="Vault status chips">
                  <span>{tradeReadyCount} trade/sell ready</span>
                  <span>{kidsCollectionCount} family-labeled</span>
                  <span>{confidenceLabel} data confidence</span>
                </div>
              </article>

              <article className="vault-command-health-card">
                <div className="vault-command-score-row">
                  <div
                    className="vault-command-health-ring"
                    style={{ "--vault-health-score": `${Math.max(8, vaultHealthScore)}%` }}
                    aria-label={`Vault health score ${vaultHealthScore || 0}%`}
                  >
                    <b>{vaultHealthScore || "Ready"}{vaultHealthScore ? "%" : ""}</b>
                  </div>
                  <div>
                    <span className="trust-badge trust-badge--secure">Collection Health</span>
                    <h3>{activeVaultItems.length ? "Fix the gaps before moving items." : "Health starts with the first item."}</h3>
                    <p>{activeVaultItems.length ? `${needsProfileDetailsCount} profile ${needsProfileDetailsCount === 1 ? "needs" : "need"} cleanup across value, condition, notes, or set context.` : "Add one item to start health scoring."}</p>
                  </div>
                </div>
                <div className="vault-health-checklist">
                  {[
                    ["Value", knownValueCount, itemsWithoutValueCount],
                    ["Photos", itemsWithPhotosCount, itemsMissingPhotosCount],
                    ["Condition", itemsWithConditionCount, itemsMissingConditionCount],
                    ["Storage", itemsWithStorageCount, itemsMissingStorageCount],
                  ].map(([label, complete, missing]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{complete}/{activeVaultItems.length || 0}</strong>
                      <small>{missing ? `${missing} missing` : "Complete"}</small>
                    </div>
                  ))}
                </div>
              </article>

              <article className="vault-command-storage-card">
                <div className="compact-card-header">
                  <div>
                    <span className="trust-badge trust-badge--secure">Storage / Location</span>
                    <h3>{itemsMissingStorageCount ? `${itemsMissingStorageCount} missing locations` : "Every saved item has a place."}</h3>
                    <p>Binder, shelf, box, display case, and trade binder signals for finding items fast.</p>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => openVaultItems("all")}>Open Vault</button>
                </div>
                <div className="vault-storage-location-grid">
                  {storageLocationCards.map((card) => (
                    <button type="button" className={`vault-storage-location-card${card.key === "missing" && card.count ? " is-warning" : ""}`} key={card.key} onClick={() => openVaultItems("all")}>
                      <span>{card.label}</span>
                      <strong>{card.count}</strong>
                      <small>{card.detail}</small>
                    </button>
                  ))}
                </div>
              </article>

              <article className="vault-command-recommendation-card">
                <div className="compact-card-header">
                  <div>
                    <span className="trust-badge trust-badge--verified">{vaultSmartRecommendation.label}</span>
                    <h3>{vaultSmartRecommendation.title}</h3>
                    <p>{vaultSmartRecommendation.detail}</p>
                  </div>
                </div>
                <div className="vault-value-range-ribbon" aria-label="Value range ribbon">
                  <span>Low {valueRangeLow}</span>
                  <span>Fair {valueRangeFair}</span>
                  <span>High {valueRangeHigh}</span>
                  <b>{recommendationValue ? `Current ${formatDashboardMoney(recommendationValue)}` : "Current --"}</b>
                </div>
                <div className="vault-recommendation-reasons">
                  <span>{confidenceLabel} confidence</span>
                  <span>{itemsMissingStorageCount ? "Location gaps" : "Locations ready"}</span>
                  <span>{itemsWithoutValueCount ? "Value gaps" : "Values saved"}</span>
                </div>
                <button type="button" onClick={vaultSmartRecommendation.action}>{vaultSmartRecommendation.cta}</button>
              </article>
            </div>

            <div className="vault-condition-center-strip" aria-label="Condition Center">
              <div className="vault-condition-center-heading">
                <span className="trust-badge trust-badge--secure">Condition Center</span>
                <strong>Photo, condition, value, and location readiness</strong>
                <small>Manual collector data only. Not grading, authentication, live pricing, checkout, or financial advice.</small>
              </div>
              <div className="vault-condition-center-grid">
                {conditionCenterRows.map((row) => (
                  <div className="vault-condition-center-row" key={row.key}>
                    <span>{row.label}</span>
                    <strong>{row.percent}%</strong>
                    <small>{row.missing ? `${row.missing} missing` : row.detail}</small>
                    <i aria-hidden="true"><b style={{ width: `${Math.max(5, row.percent)}%` }} /></i>
                  </div>
                ))}
              </div>
            </div>
          </EtMockupSectionCard>

          <EtMockupSectionCard
            className="vault-collection-intelligence-card"
            title="Collection intelligence"
            detail="Local collection signals for organization, notes, values, sets, storage, proof, and profile cleanup."
            action={<EtMockupPill tone="vault">Vault local data</EtMockupPill>}
          >
            <div className="et-mockup-stat-grid vault-collection-intelligence-grid" aria-label="Vault collection intelligence summary">
              {vaultCollectionSummaryCards.map((card) => (
                <EtMockupStatCard
                  key={card.key}
                  label={card.label}
                  value={card.value}
                  detail={card.detail}
                  tone={card.tone}
                />
              ))}
            </div>
          </EtMockupSectionCard>

          <FlowNextActionCard
            eyebrow="Vault next action"
            title={activeVaultItems.length ? "Clean up one item profile." : "Start with one reviewed Vault item."}
            detail={activeVaultItems.length
              ? "Add a condition note, save a manual value, attach proof, or check a trade before moving anything through Exchange."
              : "Add one card, sealed product, slab, supply, or wishlist want. Nothing saves until you review it."}
            tone="vault"
            actions={[
              { label: activeVaultItems.length ? "Open first profile" : "Add to Vault", onClick: () => {
                if (activeVaultItems[0]?.id) setSelectedVaultDetailId(activeVaultItems[0].id);
                else openVaultQuickAddFlow();
              } },
              { label: "Check Market", onClick: () => setActiveTab("market") },
              { label: "Trade Compass", onClick: () => openTradeCompassFlow({ source: "vault-next-action" }) },
            ]}
          />

          <EtMockupSectionCard
            id="vault-display-case-section"
            className="vault-display-case-panel"
            title="Display Case"
            detail="Feature favorite cards and sealed products in a private showcase. Local display only; not public sharing, not a listing, and not a sale."
            action={<EtMockupButton variant="secondary" onClick={() => {
              if (activeVaultItems[0]?.id) setSelectedVaultDetailId(activeVaultItems[0].id);
              else openVaultQuickAddFlow();
            }}>{activeVaultItems.length ? "Open Item Profile" : "Add to Vault"}</EtMockupButton>}
            ariaLabel="Vault Display Case"
          >
            <div className="vault-display-case-safety" aria-label="Display Case safety">
              <strong>Local display only</strong>
              <span>Display Case is private to this browser. It does not create public sharing, listings, marketplace posts, checkout, or sales.</span>
            </div>
            {visibleVaultDisplayCase.length ? (
              <div className="vault-display-case-grid" aria-label="Featured Display Case items">
                {visibleVaultDisplayCase.slice(0, 8).map((entry) => (
                  <article className={`vault-display-case-card vault-display-case-${entry.displayCategory}`} key={entry.id || entry.itemId}>
                    <CollectorShowcaseCard
                      title={entry.displayTitle}
                      subtitle={entry.displaySubtitle}
                      image={entry.displayImage}
                      kind={entry.displayKind}
                      mode="display"
                      rarity={entry.displayRarity}
                      valueLabel={entry.displayValue}
                      meta={[vaultDisplayCaseCategoryLabel(entry.displayCategory), entry.displayOrder ? `Position ${entry.displayOrder}` : "Display Case"]}
                      helper={entry.displayNote || "Featured locally in your Display Case."}
                    />
                    <div className="vault-display-case-card-actions">
                      <button
                        type="button"
                        onClick={() => {
                          if (entry.item?.id) setSelectedVaultDetailId(entry.item.id);
                          else setVaultToast("This Display Case memory is local, but the original Vault item was not found.");
                        }}
                      >
                        Open Profile
                      </button>
                      <button type="button" className="secondary-button" onClick={() => removeVaultDisplayCaseEntry(entry.id)}>
                        Remove from Display Case
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EtMockupEmptyState
                title="Your Display Case is waiting."
                detail="Open a Vault Item Profile and choose Add to Display Case to feature a favorite, grail, sealed product, trade candidate, or household favorite. Items stay in Vault."
                action={<EtMockupButton variant="secondary" onClick={() => {
                  if (activeVaultItems[0]?.id) setSelectedVaultDetailId(activeVaultItems[0].id);
                  else openVaultQuickAddFlow();
                }}>{activeVaultItems.length ? "Choose first item" : "Add first Vault item"}</EtMockupButton>}
              />
            )}
          </EtMockupSectionCard>

          <EtMockupSectionCard
            className="vault-live-controls-card vault-mockup-search-card"
            title="Find anything in Vault"
            detail="Search locally, filter by collection type, or jump into a review-first collection flow."
            action={<EtMockupButton variant="secondary" onClick={() => document.getElementById("vault-items-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Open collection</EtMockupButton>}
          >
            <div className="vault-live-search-row">
              <label className="vault-filter-field vault-search-field">
                <span>Search Vault</span>
                <input className="vault-search-input" value={vaultSearch} onChange={(event) => setVaultSearch(event.target.value)} placeholder="Search cards, sealed, sets, notes" />
              </label>
              <div className="vault-live-filter-row" role="group" aria-label="Vault quick filters">
                {[
                  ["all", "All"],
                  ["card", "Cards"],
                  ["sealed", "Sealed"],
                  ["wishlist", "Wishlist"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={(value === "wishlist" ? vaultSubTab === "wishlist" : value === "card" ? vaultTypeFilter === "Card" : vaultFilter === value || (value === "all" && vaultFilter === "all" && vaultTypeFilter === "all")) ? "active" : ""}
                    onClick={() => {
                      if (value === "wishlist") {
                        setVaultSubTab("wishlist");
                        return;
                      }
                      setVaultSubTab("collection");
                      if (value === "card") {
                        setVaultFilter("all");
                        setVaultTypeFilter("Card");
                        return;
                      }
                      setVaultFilter(value);
                      setVaultTypeFilter("all");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </EtMockupSectionCard>

          <EtMockupSectionCard
            className="vault-live-master-card vault-mockup-master-card"
            title="One card identity, all exact copies."
            detail="Vault groups cards by normalized name, set, and card number first. Normal, reverse holo, graded, promo, duplicates, and wishlist wants stay inside the same master card."
            action={<span className="trust-badge trust-badge--secure">Master-card view</span>}
          >
            <div className="et-mockup-stat-grid vault-live-master-stats" aria-label="Master card grouping summary">
              <EtMockupStatCard label="Identities" value={visibleVaultMasterCards.length || "Preview"} detail="Same card, set, number" tone="vault" />
              <EtMockupStatCard label="Variants" value={groupedVariantCount || masterPreviewCards.reduce((sum, card) => sum + Number(card.variantCount || card.variants?.length || 0), 0)} detail="Copies live below identity" tone="gold" />
              <EtMockupStatCard label="Wishlist" value={wishlistItems.length} detail="Wanted copies stay separate" tone="collector" />
            </div>
            {masterPreviewCards.length ? (
              <div className="vault-live-master-preview-grid">
                {masterPreviewCards.map((masterCard) => (
                  <MasterCardGroupPreview
                    key={masterCard.id}
                    masterCard={masterCard}
                    compact
                    onOpenRecord={visibleVaultMasterCards.length ? (record) => setSelectedVaultDetailId(record.id) : null}
                    onOpenMarket={visibleVaultMasterCards.length ? openMarketWatchForVaultItem : null}
                  />
                ))}
              </div>
            ) : null}
          </EtMockupSectionCard>

          <div className="vault-live-main-grid">
            <EtMockupSectionCard
              className="vault-live-folder-card"
              title="Folders"
              detail="Collection folders keep cards, sealed products, favorites, family items, wishlist wants, and trade candidates separated."
              action={<span className="status-badge">{folderCards.length} folders</span>}
            >
              <div className="vault-live-folder-grid">
                {folderCards.map((folder) => (
                  <button type="button" className="vault-live-folder-tile" key={folder.key} onClick={folder.action}>
                    <span>{folder.title}</span>
                    <strong>{folder.count}</strong>
                    <small>{folder.detail}</small>
                  </button>
                ))}
              </div>
            </EtMockupSectionCard>

            <EtMockupSectionCard
              className="vault-live-recent-card"
              title="Recent additions"
              detail="Recent items stay reviewable before trades, sales, or set completion."
              action={<EtMockupButton variant="secondary" onClick={() => openVaultItems("all")}>See all</EtMockupButton>}
            >
              <div className="vault-live-recent-list">
                {recentRows.length ? recentRows.map((item) => (
                  <button type="button" className="vault-live-recent-row" key={item.id} onClick={() => setSelectedVaultDetailId(item.id)}>
                    <span className="vault-live-item-thumb" aria-hidden="true">{vaultItemDisplayImage(item) ? <img src={vaultItemDisplayImage(item)} alt="" /> : "Card"}</span>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{[vaultItemSetLabel(item), `Qty ${item.quantity || 1}`, vaultStatusLabel(normalizeVaultStatus(item))].filter(Boolean).join(" | ")}</small>
                    </span>
                  </button>
                )) : (
                  <div className="empty-state small-empty-state">
                    <h3>No recent Vault movement yet.</h3>
                    <p>Add a card, sealed product, slab, binder page, or wishlist want to start a protected collection trail.</p>
                  </div>
                )}
              </div>
            </EtMockupSectionCard>

            <EtMockupRightRail
              className="vault-live-health-card"
              title="Collection Health"
              detail={activeVaultItems.length ? `${knownValueCount} of ${activeVaultItems.length} grouped items have known value context.` : "Start with one reviewed item to build health signals."}
            >
              <h2>{collectionHealthPercent || "Ready"}{collectionHealthPercent ? "%" : ""}</h2>
              <div className="vault-progress-track" aria-label="Vault collection health">
                <i style={{ width: `${collectionHealthPercent || 8}%` }} />
              </div>
              <div className="scout-safety-strip">
                <span>Review before saving</span>
                <span>Variants grouped</span>
                <span>Sealed separate</span>
                <span>Wishlist separate</span>
              </div>
            </EtMockupRightRail>
          </div>

          <EtMockupSectionCard
            className="vault-live-actions-card"
            title="Quick actions"
            detail="Every add path stays review-first. Nothing becomes exchange-ready until identity, condition, storage, and proof are reviewed."
          >
            <div className="et-mockup-action-grid vault-live-action-grid">
              {quickActions.map((action) => (
                <EtMockupActionCard
                  key={action.key}
                  title={action.title}
                  detail={action.detail}
                  icon={action.key.includes("scan") ? "search" : "vault"}
                  tone={action.key === "manual" ? "vault" : action.key === "import" ? "collector" : "gold"}
                  className="vault-live-action-tile"
                  onClick={action.onClick}
                />
              ))}
            </div>
          </EtMockupSectionCard>

          <EtMockupSectionCard
            className="vault-collection-sets-card"
            title="Collection Sets"
            detail="Set Shelf keeps favorites, household collections, sealed product, slabs, trade binders, and collection goals together without changing your Vault items yet."
            action={<EtMockupButton onClick={() => openVaultCollectionSetFlow({ source: "vault-set-shelf" })}>Create Set</EtMockupButton>}
          >
            <div className="et-mockup-stat-grid vault-collection-set-summary-grid" aria-label="Collection Sets summary">
              <EtMockupStatCard label="Set Shelf" value={vaultCollectionSetSummary.total} detail="Local collection groups" tone="vault" />
              <EtMockupStatCard label="Family Set" value={vaultCollectionSetSummary.kids} detail="Household and family labels" tone="collector" />
              <EtMockupStatCard label="Sealed Set" value={vaultCollectionSetSummary.sealed} detail="Sealed product shelves" tone="gold" />
              <EtMockupStatCard label="Trade Binder" value={vaultCollectionSetSummary.tradeBinders} detail="Trade review groups" tone="vault" />
            </div>

            {visibleVaultCollectionSets.length ? (
              <div className="vault-collection-set-grid" aria-label="Saved Collection Sets">
                {visibleVaultCollectionSets.slice(0, 6).map((set) => {
                  const setType = set.setType || "Collection Set";
                  const setProgressLabel = "0 items assigned";
                  const setProgressCopy = "Add items later. Vault items are not assigned automatically in this local beta.";
                  return (
                    <article className="vault-collection-set-card" key={set.id || `${set.setName}-${set.createdAt}`}>
                      <div className="compact-card-header">
                        <div>
                          <span className="trust-badge trust-badge--secure">{setType}</span>
                          <h3>{set.setName || "Untitled set"}</h3>
                          <p>{set.familyKidLabel || set.setGoal || "Personal Set Shelf group"}</p>
                        </div>
                        <span className="status-badge">{set.dateCreated ? shortDate(set.dateCreated) : "Local"}</span>
                      </div>
                      <div className="vault-collection-set-progress" aria-label={`${set.setName || "Collection Set"} progress`}>
                        <div>
                          <span>Set progress</span>
                          <strong>{setProgressLabel}</strong>
                          <small>{setProgressCopy}</small>
                        </div>
                        <div className="vault-progress-track"><i style={{ width: "8%" }} /></div>
                      </div>
                      <p>{set.setNotes || "No Set Notes yet. Add why this set matters, what belongs here, or who it helps."}</p>
                      {set.setGoal ? <small>Goal: {set.setGoal}</small> : <small>Goal: Add a collecting goal when this set is ready.</small>}
                      <div className="compact-actions vault-collection-set-actions">
                        <button type="button" className="secondary-button" onClick={() => setVaultToast("Set Shelf details are saved locally. Add items later is still coming soon.")}>View Set</button>
                        <button type="button" className="secondary-button" disabled title="Item assignment is coming soon.">Add to Set</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <EtMockupEmptyState
                title="Your Set Shelf is waiting."
                detail="Your Set Shelf is waiting. Create a set for favorites, sealed product, slabs, household collections, trade binders, or master set goals. Upgraded plans can expand deeper organization tools when enabled."
                action={<EtMockupButton variant="secondary" onClick={() => openVaultCollectionSetFlow({ source: "vault-set-shelf-empty" })}>Create Set</EtMockupButton>}
              />
            )}

            <div className="vault-collection-set-coming-soon" aria-label="Collection Sets item assignment status">
              <strong>Add to Set</strong>
              <span>Soon you{"\u2019"}ll be able to tuck Vault items directly into this set.</span>
            </div>
          </EtMockupSectionCard>

          {renderUpgradeValuePreview("vault")}
        </CommandBoardV4>
      );
    }

  if (showDashboard) {
    return (
      <div className="vault-command-only-route" aria-label="Vault collection intelligence">
        {renderVaultHomeDashboard()}
      </div>
    );
  }

  return (
    <div className="vault-command-only-route vault-v4-major-route" aria-label="Vault collection intelligence">
      <CommandBoardV4
        accent="vault"
        className="vault-v4-detail-board"
        ariaLabel="Vault collection workspace"
        label={activeWorkspaceName ? `Vault / ${activeWorkspaceName}` : "Vault"}
        title="Vault Collection"
        description="Browse owned items, folders, sets, storage, condition, and proof inside the same protected collection workspace."
        primaryAction={{ label: "Quick Add", icon: "plus", onClick: () => openVaultQuickAddFlow() }}
        secondaryActions={[
          { label: "Scan Item", icon: "scan", onClick: () => openVaultScanFlow() },
          { label: "Vault Overview", icon: "vault", onClick: () => setVaultSubTab("overview") },
        ]}
        utilityActions={[
          { label: "Compass", icon: "search", onClick: () => openCompassSearch?.("vault_collection_compass") },
          { label: "Beacon", icon: "bell", onClick: () => openBeaconCenter?.("vault_collection_beacon") },
        ]}
        statusItems={[
          { key: "items", icon: "vault", label: "Owned items", value: activeVaultItems.length, detail: "Cards, sealed, and slabs" },
          { key: "value", icon: "data", label: "Known value", value: vaultDetailEstimatedValue, detail: "Confirmed values only" },
          { key: "photos", icon: "scan", label: "Photo gaps", value: vaultDetailMissingPhotosCount, detail: "Front and back proof" },
          { key: "storage", icon: "workspace", label: "Storage gaps", value: vaultDetailMissingStorageCount, detail: "Binder, box, shelf, case" },
          { key: "condition", icon: "admin", label: "Condition gaps", value: vaultDetailMissingConditionCount, detail: "Review before Exchange" },
        ]}
        plan={{
          label: "Collection Plan",
          title: "Organize, verify, then decide",
          items: [
            { key: "browse", icon: "vault", label: "Browse items", detail: `${activeVaultItems.length} owned`, action: () => openVaultItems("all") },
            { key: "scan", icon: "scan", label: "Scan product", detail: "Review before save", action: () => openVaultScanFlow() },
            { key: "storage", icon: "workspace", label: "Place items", detail: `${vaultDetailMissingStorageCount} gaps`, action: () => openVaultItems("all") },
            { key: "wishlist", icon: "bell", label: "Review wants", detail: `${wishlistItems.length} targets`, action: () => setVaultSubTab("wishlist") },
          ],
          actions: [
            { label: "Add to Vault", icon: "plus", onClick: () => openVaultQuickAddFlow() },
            { label: "Overview", icon: "vault", onClick: () => setVaultSubTab("overview") },
          ],
        }}
        routes={[
          { key: "overview", icon: "data", label: "Overview", title: "Collection health", detail: "Value and next actions", active: vaultSubTab === "overview", action: () => setVaultSubTab("overview") },
          { key: "collection", icon: "vault", label: "Collection", title: "Owned items", detail: "Cards, sealed, slabs", active: vaultSubTab === "collection", action: () => setVaultSubTab("collection") },
          { key: "wishlist", icon: "bell", label: "Wishlist", title: "Wants and targets", detail: "Price and restock watch", active: vaultSubTab === "wishlist", action: () => setVaultSubTab("wishlist") },
          { key: "sets", icon: "workspace", label: "Sets", title: "Folders and binders", detail: "Completion goals", active: vaultSubTab === "sets", action: () => setVaultSubTab("sets") },
          { key: "sealed", icon: "market", label: "Sealed", title: "Sealed shelf", detail: "Products and storage", active: vaultSubTab === "sealed", action: () => setVaultSubTab("sealed") },
          { key: "activity", icon: "clipboard", label: "Activity", title: "Proof history", detail: "Changes and records", active: vaultSubTab === "activity", action: () => setVaultSubTab("activity") },
        ]}
      >
        <section className="vault-v4-detail-surface" aria-label="Vault collection content">
          {children}
        </section>
      </CommandBoardV4>
    </div>
  );
}
