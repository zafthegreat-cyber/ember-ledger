import { PrivateStorageImage } from "../../components/PrivateReceipt.jsx";
// App owns state, authority and handlers; only this existing renderer is deferred.
export default function VaultWorkspaceContent({ scope }) {
  const {
    CollectorFlipDetailCard,
    CompactInventoryCard,
    EtMockupButton,
    EtMockupEmptyState,
    INVENTORY_VALUATION_COPY,
    LONG_LIST_PAGE_SIZE,
    LazyToolBoundary,
    MasterCardGroupPreview,
    OverflowMenu,
    PaginationControls,
    SealedProductShelfCard,
    VAULT_FILTER_OPTIONS,
    VAULT_VALUE_FILTER_OPTIONS,
    VaultEditForm,
    VaultGroupedCardDetail,
    VaultItemDetail,
    VaultPage,
    VaultSetCardRow,
    activeVaultCardItems,
    activeVaultItems,
    activeVaultSealedItems,
    activeWorkspace,
    adaptiveSellerToolsVisible,
    addPurchaserName,
    applyCatalogProduct,
    beginScanProduct,
    buildWishlistAddSeed,
    cancelVaultEdit,
    catalogProducts,
    catalogTitle,
    clearVaultFilters,
    collectorShowcaseInitials,
    collectorVisualTypeLabel,
    deleteItem,
    detectCollectorItemVisualType,
    editingItemId,
    featureAllowed,
    filteredVaultGalleryItems,
    findMasterCardForInventoryItem,
    findSetSummaryForItem,
    formatPriceDisplay,
    getCatalogImage,
    handleImageUpload,
    isInventorySealedProduct,
    isWishlistLikeVaultItem,
    itemForm,
    itemPurchaserName,
    markWishlistItemOwned,
    money,
    normalizeItemCompareType,
    normalizeVaultStatus,
    openItemComparisonFlow,
    openLockedFeatureNotice,
    openMarketPriceMemoryFlow,
    openMarketWatchForVaultItem,
    openProductAddFlow,
    openPurchaserManager,
    openReceiptForItem,
    openTradeValueFlow,
    openVaultCatalogSearchFlow,
    openVaultDisplayCaseFlow,
    openVaultDuplicateItem,
    openVaultForgeTransfer,
    openVaultMarketplaceDecision,
    openVaultQuickAddFlow,
    openVaultScanFlow,
    openVaultSetForItem,
    openVaultSetSummary,
    openWishlistIsoFlow,
    pagedVaultItems,
    prepareRestock,
    purchaserOptions,
    quickUpdateMarketValue,
    quickUpdatePlannedSalePrice,
    rawVaultItems,
    recentVaultItems,
    refreshVaultMarket,
    renderVaultHeader,
    renderWishlistIsoPlanningSection,
    saveEditedItem,
    scrollToResultsTop,
    selectedVaultCardGroup,
    selectedVaultDetailId,
    selectedVaultDetailItem,
    selectedVaultDetailMasterCard,
    selectedVaultDetailSetSummary,
    selectedVaultSet,
    selectedVaultSetView,
    setHomeSubTab,
    setSelectedVaultCardGroupKey,
    setSelectedVaultDetailId,
    setSelectedVaultSetId,
    setVaultDisplayMode,
    setVaultFilter,
    setVaultGalleryFilter,
    setVaultLocationFilter,
    setVaultOwnerFilter,
    setVaultPage,
    setVaultSearch,
    setVaultSetDetailFilter,
    setVaultSetFilter,
    setVaultSetMasteryTab,
    setVaultSetSearchQuery,
    setVaultSetSort,
    setVaultSetVariantFilter,
    setVaultSetViewMode,
    setVaultSort,
    setVaultSubTab,
    setVaultTypeFilter,
    setVaultValueFilter,
    shortDate,
    startEditingVaultItem,
    statusClass,
    topVaultSetProgress,
    updateItemForm,
    updateItemStatus,
    vaultActiveFilterCount,
    vaultDashboardProps,
    vaultDisplayMode,
    vaultFilter,
    vaultGalleryFilter,
    vaultInsightCards,
    vaultItemDisplayImage,
    vaultItemLastUpdatedLabel,
    vaultItemSetLabel,
    vaultItemTotalMarketValue,
    vaultItemTypeLabel,
    vaultItems,
    vaultLocationFilter,
    vaultLocationOptions,
    vaultMarketValueDisplay,
    vaultMasterCardByItemId,
    vaultOwnerFilter,
    vaultOwnerOptions,
    vaultPortfolioStats,
    vaultPriceReliabilityCards,
    vaultSearch,
    vaultSetCompletionRows,
    vaultSetDetailFilter,
    vaultSetFilter,
    vaultSetMasteryRows,
    vaultSetMasteryTab,
    vaultSetOptions,
    vaultSetSearchQuery,
    vaultSetSort,
    vaultSetVariantFilter,
    vaultSetViewMode,
    vaultSort,
    vaultStatusLabel,
    vaultSubTab,
    vaultTypeFilter,
    vaultTypeOptions,
    vaultValuationPrompts,
    vaultValuationSummary,
    vaultValueFilter,
    vaultVariantLabel,
    visibleVaultCollectionSets,
    visibleVaultItems,
    visibleVaultMasterCards,
    wishlistItems,
    wishlistMasterCards,
    workspaceTradeRecords,
  } = scope;

  function renderDeferredVaultWorkspace() {
    return (<LazyToolBoundary label="Loading Vault...">
            <VaultPage renderHeader={renderVaultHeader} showDashboard={vaultSubTab === "overview"} {...vaultDashboardProps}>
            {(vaultSubTab === "overview" || vaultSubTab === "collection") ? (
            <>
            <section id="vault-items-section" className="panel vault-collection-panel">
              <div className="compact-card-header vault-collection-heading">
                <div>
                  <p className="eyebrow">Vault Collection</p>
                  <h2>Your protected collection</h2>
                  <p>{vaultItems.length ? "Search, filter, and open grouped items." : "Add your first item or scan a product when ready."}</p>
                </div>
                <div className="vault-heading-actions">
                  <div className="vault-showcase-toggle" role="group" aria-label="Vault display mode">
                    {[
                      ["standard", "Standard"],
                      ["showcase", "Showcase"],
                      ["shelf", "Shelf"],
                      ["gallery", "Gallery"],
                    ].map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        className={vaultDisplayMode === mode ? "active" : ""}
                        aria-pressed={vaultDisplayMode === mode}
                        onClick={() => setVaultDisplayMode(mode)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={openVaultQuickAddFlow}>Add to Vault</button>
                  <button type="button" className="secondary-button" onClick={() => beginScanProduct("vault")}>Scan</button>
                </div>
              </div>

              {vaultItems.length ? (
              <div className="vault-collection-summary" aria-label="Vault owned item summary">
                <div>
                  <span>Collection value</span>
                  <strong>{vaultMarketValueDisplay === "Price data unavailable" ? "No value yet" : vaultMarketValueDisplay}</strong>
                  <small>Known market values only</small>
                </div>
                <div>
                  <span>Total quantity</span>
                  <strong>{vaultValuationSummary.totalQuantity}</strong>
                  <small>Grouped by product</small>
                </div>
                <div>
                  <span>Sealed</span>
                  <strong>{activeVaultSealedItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</strong>
                  <small>Products and sealed holdings</small>
                </div>
                <div>
                  <span>Singles</span>
                  <strong>{activeVaultCardItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</strong>
                  <small>Cards, promos, and slabs</small>
                </div>
              </div>
              ) : null}

              {vaultItems.length ? (
                <div className="vault-home-preview-grid" aria-label="Vault 2.0 collection previews">
                  <button type="button" className="vault-home-preview-card vault-home-preview-card--sets" onClick={() => {
                    if (!featureAllowed("set_completion")) return openLockedFeatureNotice("set_completion");
                    if (topVaultSetProgress) setSelectedVaultSetId(topVaultSetProgress.id);
                    setVaultSubTab("sets");
                  }}>
                    <span>Set Mastery</span>
                    <strong>{topVaultSetProgress ? topVaultSetProgress.completionLabel : "Ready"}</strong>
                    <small>{topVaultSetProgress ? `${topVaultSetProgress.name} - ${topVaultSetProgress.checklistAvailable ? topVaultSetProgress.progressCopy : topVaultSetProgress.checklistStatus}` : "Add set/card details to start completion tracking."}</small>
                  </button>
                  <button type="button" className="vault-home-preview-card" onClick={() => setVaultSubTab("wishlist")}>
                    <span>Wishlist</span>
                    <strong>{wishlistItems.length}</strong>
                    <small>{wishlistItems.length ? "Missing cards and products to watch." : "No wanted items yet."}</small>
                  </button>
                  <button type="button" className="vault-home-preview-card" onClick={() => {
                    setVaultSubTab("collection");
                    setVaultFilter("sealed");
                    setTimeout(() => document.getElementById("vault-items-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
                  }}>
                    <span>Sealed Products</span>
                    <strong>{activeVaultSealedItems.length}</strong>
                    <small>Unopened products stay separate from card completion.</small>
                  </button>
                  <button type="button" className="vault-home-preview-card" onClick={() => {
                    setVaultSubTab("collection");
                    setVaultFilter("all");
                    setTimeout(() => document.getElementById("vault-items-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
                  }}>
                    <span>Recent Additions</span>
                    <strong>{recentVaultItems.length ? recentVaultItems[0].name : "None"}</strong>
                    <small>{recentVaultItems.length ? `Qty ${recentVaultItems[0].quantity || 1} - ${vaultStatusLabel(normalizeVaultStatus(recentVaultItems[0]))}` : "New items will appear here."}</small>
                  </button>
                </div>
              ) : null}

              {vaultItems.length ? (
              <details className="mobile-ux-disclosure vault-detail-disclosure">
                <summary>View collection insights</summary>
                <div className="inventory-insight-panel vault-insight-panel" aria-label="Vault collection valuation insights">
                  <div className="inventory-insight-heading">
                    <div>
                      <h3>Collection insights</h3>
                      <p>{INVENTORY_VALUATION_COPY.vaultDisclaimer}</p>
                    </div>
                    <span className="trust-badge trust-badge--secure">Estimated</span>
                  </div>
                  <div className="inventory-insight-grid">
                    {vaultInsightCards.map((card) => (
                      <div className="inventory-insight-card" key={card.key}>
                        <span>{card.label}</span>
                        <strong>{card.value}</strong>
                        <small>{card.helper}</small>
                      </div>
                    ))}
                  </div>
                  <div className="price-reliability-summary" aria-label="Vault valuation reliability">
                    <div>
                      <h4>Valuation reliability</h4>
                      <p>Valuation is estimated from items with known values. Items with missing or manual prices may need review.</p>
                    </div>
                    <div className="price-reliability-card-row">
                      {vaultPriceReliabilityCards.slice(0, 5).map((card) => (
                        <span className="price-reliability-card" key={card.key}>
                          <b>{card.value}</b>
                          <small>{card.label}</small>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="inventory-insight-split">
                    <div>
                      <h4>Purchaser breakdown</h4>
                      <div className="inventory-mini-list">
                        {vaultValuationSummary.purchaserBreakdown.slice(0, 4).map((row) => (
                          <p key={row.key || row.name}>
                            <span>{row.name}</span>
                            <strong>{row.quantity} item{row.quantity === 1 ? "" : "s"}</strong>
                            <small>{money(row.totalCostBasis)} tracked cost</small>
                          </p>
                        ))}
                        {!vaultValuationSummary.purchaserBreakdown.length ? <small>No purchaser records yet.</small> : null}
                      </div>
                    </div>
                    <div>
                      <h4>Missing data prompts</h4>
                      <div className="inventory-prompt-row">
                        {vaultValuationPrompts.length ? vaultValuationPrompts.slice(0, 5).map((prompt) => (
                          <span className={`inventory-data-prompt ${prompt.tone}`} key={prompt.key}>
                            {prompt.label}{prompt.count ? ` (${prompt.count})` : ""}
                          </span>
                        )) : <span className="inventory-data-prompt success">Core details look filled in</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </details>
              ) : null}

              {!vaultItems.length ? (
                <article className="vault-empty-action-card" aria-label="Empty Vault first actions">
                  <span className="trust-badge trust-badge--secure">Empty Vault</span>
                  <h3>Start with one reviewed item.</h3>
                  <p>Add a card, sealed product, binder page, or import list. Vault keeps wishlist wants, sealed products, and owned cards separate.</p>
                  <div className="quick-actions">
                    <button type="button" onClick={openVaultQuickAddFlow}>Add first item</button>
                    <button type="button" className="secondary-button" onClick={openVaultScanFlow}>Scan card</button>
                    <button type="button" className="secondary-button" onClick={() => openProductAddFlow({ source: "vault-empty-sealed", destinations: { vault: true }, seed: { productType: "Sealed Product" } })}>Add sealed</button>
                  </div>
                </article>
              ) : null}

              {vaultItems.length ? (
                <div className="vault-primary-controls" aria-label="Vault search and active filters">
                  <label className="vault-filter-field vault-search-field">
                    <span>Search collection</span>
                    <input className="vault-search-input" value={vaultSearch} onChange={(event) => setVaultSearch(event.target.value)} placeholder="Search Vault" />
                  </label>
                  {vaultActiveFilterCount ? (
                    <div className="vault-active-filter-chips" aria-label="Active Vault filters">
                      {vaultSearch ? <span>Search: {vaultSearch}</span> : null}
                      {vaultFilter !== "all" ? <span>Status: {VAULT_FILTER_OPTIONS.find((option) => option.value === vaultFilter)?.label || vaultFilter}</span> : null}
                      {vaultTypeFilter !== "all" ? <span>Type: {vaultTypeFilter}</span> : null}
                      {vaultSetFilter !== "all" ? <span>Set: {vaultSetFilter}</span> : null}
                      {vaultLocationFilter !== "all" ? <span>Location: {vaultLocationFilter}</span> : null}
                      {vaultOwnerFilter !== "all" ? <span>Owner: {vaultOwnerFilter}</span> : null}
                      {vaultValueFilter !== "all" ? <span>Value: {VAULT_VALUE_FILTER_OPTIONS.find((option) => option.value === vaultValueFilter)?.label || vaultValueFilter}</span> : null}
                      {vaultSort !== "newest" ? <span>Sort: {vaultSort}</span> : null}
                      <button type="button" className="inline-text-button" onClick={clearVaultFilters}>Clear filters</button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {vaultItems.length ? (
              <details className="vault-mobile-filter-drawer" open={vaultActiveFilterCount > 0 && !vaultSearch ? true : undefined}>
                <summary>Filters{vaultActiveFilterCount ? ` (${vaultActiveFilterCount})` : ""}</summary>
              <div className="vault-toolbar vault-filter-panel">
                <label className="vault-filter-field">
                  <span>Status</span>
                  <select className="vault-filter-select" value={vaultFilter} onChange={(event) => setVaultFilter(event.target.value)}>
                    {VAULT_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="vault-filter-field">
                  <span>Category / type</span>
                  <select className="vault-filter-select" value={vaultTypeFilter} onChange={(event) => setVaultTypeFilter(event.target.value)}>
                    <option value="all">All types</option>
                    {vaultTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="vault-filter-field">
                  <span>Set</span>
                  <select className="vault-filter-select" value={vaultSetFilter} onChange={(event) => setVaultSetFilter(event.target.value)}>
                    <option value="all">All sets</option>
                    {vaultSetOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="vault-filter-field">
                  <span>Location</span>
                  <select className="vault-filter-select" value={vaultLocationFilter} onChange={(event) => setVaultLocationFilter(event.target.value)}>
                    <option value="all">All locations</option>
                    {vaultLocationOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="vault-filter-field">
                  <span>Owner / purchaser</span>
                  <select className="vault-filter-select" value={vaultOwnerFilter} onChange={(event) => setVaultOwnerFilter(event.target.value)}>
                    <option value="all">All purchasers</option>
                    {vaultOwnerOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="vault-filter-field">
                  <span>Value range</span>
                  <select className="vault-filter-select" value={vaultValueFilter} onChange={(event) => setVaultValueFilter(event.target.value)}>
                    {VAULT_VALUE_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="vault-filter-field">
                  <span>Sort</span>
                  <select className="vault-filter-select" value={vaultSort} onChange={(event) => setVaultSort(event.target.value)}>
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="name">Name A-Z</option>
                    <option value="highestMarket">Highest Market Value</option>
                    <option value="lowestMarket">Lowest Market Value</option>
                    <option value="highestRoi">Highest ROI</option>
                    <option value="quantity">Quantity</option>
                  </select>
                </label>
                {vaultActiveFilterCount ? (
                  <button type="button" className="secondary-button vault-clear-filters" onClick={clearVaultFilters}>
                    Clear {vaultActiveFilterCount} filter{vaultActiveFilterCount === 1 ? "" : "s"}
                  </button>
                ) : null}
              </div>
              </details>
              ) : null}

              <div className="vault-view-strip" aria-label="Vault view choices">
                {[
                  { label: "Collection", tab: "collection" },
                  { label: "Set Mastery", tab: "sets", feature: "set_completion" },
                  { label: "Wishlist", tab: "wishlist" },
                  { label: "Sealed", tab: "sealed" },
                  { label: "Activity", tab: "activity", feature: "portfolio_value" },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    aria-label={`Vault section ${item.label}`}
                    className={vaultSubTab === item.tab || (item.tab === "collection" && vaultSubTab === "overview") ? "active" : ""}
                    onClick={() => {
                      if (item.feature && !featureAllowed(item.feature)) return openLockedFeatureNotice(item.feature);
                      setVaultSubTab(item.tab);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {vaultItems.length > 0 && vaultDisplayMode === "showcase" ? (
                <section className="vault-showcase-panel" aria-label="Vault 3D Collector Showcase">
                  <div className="compact-card-header">
                    <div>
                      <span className="trust-badge trust-badge--secure">3D Collector Showcase</span>
                      <h3>Collection pieces with depth</h3>
                      <p>Preview cards, sealed products, slabs, and supplies without replacing the standard Vault list. Images and values are local records or saved estimates.</p>
                    </div>
                    <button type="button" className="secondary-button" onClick={() => setVaultDisplayMode("standard")}>Standard view</button>
                  </div>
                  <div className="collector-showcase-grid vault-showcase-grid">
                    {visibleVaultItems.slice(0, 8).map((item) => {
                      const totalValue = vaultItemTotalMarketValue(item);
                      const itemKind = detectCollectorItemVisualType(item);
                      const statusLabel = vaultStatusLabel(normalizeVaultStatus(item));
                      const conditionLabel = item.conditionName || item.condition || (isInventorySealedProduct(item) ? "Sealed status to check" : "Condition pending");
                      const notesLabel = item.collectorNotes || item.notes || item.actionNotes || "No collector notes yet.";
                      const valueLabel = totalValue ? `${money(totalValue)} saved estimate` : "No value saved yet";
                      return (
                        <CollectorFlipDetailCard
                          key={item.id}
                          title={item.name}
                          subtitle={vaultItemSetLabel(item) || vaultItemTypeLabel(item) || "Vault item"}
                          image={vaultItemDisplayImage(item)}
                          kind={itemKind}
                          mode="display"
                          valueLabel={valueLabel}
                          rarity={item.rarity || item.variantLabel || item.variant || item.finish || ""}
                          meta={[statusLabel, `Qty ${item.quantity || 1}`]}
                          helper="Visual display only. Images may be representative. Check condition, sealed status, and saved values manually."
                          noteRows={[
                            ["Collector notes", notesLabel],
                            ["Source / value", valueLabel],
                            ["Condition / status", `${conditionLabel} | ${statusLabel}`],
                          ]}
                          actions={[
                            { label: "Open Profile", variant: "primary", onClick: () => setSelectedVaultDetailId(item.id) },
                            !isWishlistLikeVaultItem(item) ? { label: "Add to Trade Binder", onClick: () => openTradeValueFlow(item, { source: "vault-showcase-flip", sourceKind: "vault" }) } : null,
                            { label: "Save Price", onClick: () => openMarketPriceMemoryFlow(item, { source: "vault-showcase-save-price", seed: { itemName: item.name, price: totalValue || "", condition: conditionLabel } }) },
                            { label: "Add to Set", disabled: true, title: "Add to Set is coming soon." },
                          ]}
                        />
                      );
                    })}
                  </div>
                  {visibleVaultItems.length > 8 ? (
                    <p className="compact-subtitle collector-showcase-note">Showing the first 8 items for this filter. Use search or filters to focus the showcase.</p>
                  ) : null}
                  {!visibleVaultItems.length ? (
                    <EtMockupEmptyState
                      title="No showcase items for this filter."
                      detail="Reset filters or add another card, sealed product, slab, or supply to see it here."
                      action={<EtMockupButton variant="secondary" onClick={clearVaultFilters}>Reset Filters</EtMockupButton>}
                    />
                  ) : null}
                </section>
              ) : null}
              {vaultItems.length > 0 && vaultDisplayMode === "shelf" ? (
                <section className="vault-showcase-panel sealed-product-shelf-panel" aria-label="Vault Sealed Product Shelf">
                  <div className="compact-card-header">
                    <div>
                      <span className="trust-badge trust-badge--secure">Sealed Product Shelf</span>
                      <h3>Sealed products on display</h3>
                      <p>Visual display only. Images may be representative. Check condition and sealed status manually before buying, selling, trading, or gifting.</p>
                    </div>
                    <button type="button" className="secondary-button" onClick={() => setVaultDisplayMode("standard")}>Standard view</button>
                  </div>
                  {visibleVaultItems.filter(isInventorySealedProduct).length ? (
                    <div className="sealed-product-shelf-grid">
                      {visibleVaultItems.filter(isInventorySealedProduct).slice(0, 8).map((item) => {
                        const totalValue = vaultItemTotalMarketValue(item);
                        const conditionLabel = item.conditionName || item.condition || "Sealed status to check";
                        return (
                          <SealedProductShelfCard
                            key={item.id}
                            title={item.name}
                            subtitle={vaultItemSetLabel(item) || vaultItemTypeLabel(item) || "Sealed Product"}
                            image={vaultItemDisplayImage(item)}
                            valueLabel={totalValue ? `${money(totalValue)} saved estimate` : "No value saved yet"}
                            meta={[vaultItemTypeLabel(item), `Qty ${item.quantity || 1}`, conditionLabel]}
                            actions={[
                              { label: "Open Profile", variant: "primary", onClick: () => setSelectedVaultDetailId(item.id) },
                              { label: "Save Price", onClick: () => openMarketPriceMemoryFlow(item, { source: "vault-sealed-shelf-save-price", seed: { itemName: item.name, price: totalValue || "", condition: conditionLabel } }) },
                              !isWishlistLikeVaultItem(item) ? { label: "Add to Forge", onClick: () => openTradeValueFlow(item, { source: "vault-sealed-shelf", sourceKind: "vault" }) } : null,
                            ]}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <EtMockupEmptyState
                      title="No sealed products on this shelf yet."
                      detail="Add ETBs, booster boxes, bundles, packs, tins, or other sealed items to see them in Shelf Mode. Card items still stay available in Standard and Showcase views."
                      action={<EtMockupButton variant="secondary" onClick={openVaultQuickAddFlow}>Add sealed item</EtMockupButton>}
                    />
                  )}
                </section>
              ) : null}
              {(vaultItems.length > 0 || wishlistItems.length > 0 || visibleVaultCollectionSets.length > 0) && vaultDisplayMode === "gallery" ? (
                <section className="vault-gallery-panel" aria-label="Vault Collection Gallery">
                  <div className="compact-card-header">
                    <div>
                      <span className="trust-badge trust-badge--secure">Collection Gallery</span>
                      <h3>Collector wall</h3>
                      <p>Browse cards, sealed products, wishlist wants, fallback items, and Set Shelf groups as a visual gallery. Standard Vault remains the source of truth.</p>
                    </div>
                    <button type="button" className="secondary-button" onClick={() => setVaultDisplayMode("standard")}>Standard view</button>
                  </div>
                  <div className="vault-gallery-filter-row" role="group" aria-label="Vault Gallery filters">
                    {[
                      ["all", "All"],
                      ["card", "Cards"],
                      ["sealed product", "Sealed"],
                      ["booster box", "Boxes"],
                      ["pack", "Packs"],
                      ["supply", "Supplies"],
                      ["wishlist", "Wishlist"],
                      ["set", "Sets"],
                      ["unknown", "Unknown"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={vaultGalleryFilter === value ? "active" : ""}
                        aria-pressed={vaultGalleryFilter === value}
                        onClick={() => setVaultGalleryFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {filteredVaultGalleryItems.length ? (
                    <div className="vault-gallery-grid">
                      {filteredVaultGalleryItems.slice(0, 18).map((entry) => {
                        const kindLabel = collectorVisualTypeLabel(entry.kind);
                        const kindClass = normalizeItemCompareType(entry.kind).replace(/\s+/g, "-");
                        const openEntry = () => {
                          if (entry.item?.id) {
                            setSelectedVaultDetailId(entry.item.id);
                            return;
                          }
                          if (entry.set) openVaultSetSummary(entry.set);
                        };
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            className={`vault-gallery-tile vault-gallery-${kindClass}`}
                            onClick={openEntry}
                            aria-label={`Open ${entry.title} from Collection Gallery`}
                          >
                            <span className="vault-gallery-media" aria-hidden="true">
                              {entry.image ? <PrivateStorageImage src={entry.image} alt="" loading="lazy" /> : <b>{collectorShowcaseInitials(entry.title)}</b>}
                            </span>
                            <span className="vault-gallery-copy">
                              <b>{entry.title}</b>
                              <small>{entry.subtitle}</small>
                              <span>{kindLabel} | {entry.status}</span>
                              <em>{entry.valueLabel}</em>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <EtMockupEmptyState
                      title="Add items to build your collection gallery."
                      detail="This filter has no gallery items yet. Add cards, sealed products, wishlist wants, or Set Shelf groups to fill the wall."
                      action={<EtMockupButton variant="secondary" onClick={() => setVaultGalleryFilter("all")}>Show all gallery items</EtMockupButton>}
                    />
                  )}
                </section>
              ) : null}
              {editingItemId && rawVaultItems.some((item) => item.id === editingItemId) && (
                <VaultEditForm
                  form={itemForm}
                  setForm={updateItemForm}
                  item={rawVaultItems.find((item) => item.id === editingItemId)}
                  catalogProducts={catalogProducts}
                  purchasers={purchaserOptions}
                  onCreatePurchaser={(name, note, type) => addPurchaserName(name, { note, type, workspaceId: activeWorkspace?.id })}
                  onManagePurchasers={() => openPurchaserManager(activeWorkspace?.id)}
                  applyCatalogProduct={applyCatalogProduct}
                  handleImageUpload={handleImageUpload}
                  onSubmit={saveEditedItem}
                  onCancel={() => cancelVaultEdit()}
                  onMoveToForge={(item) => openVaultForgeTransfer(item, "move")}
                />
              )}
              {visibleVaultMasterCards.length ? (
                <section className="master-card-section vault-master-card-section" aria-label="Master card groups">
                  <div className="compact-card-header">
                    <div>
                      <span className="trust-badge trust-badge--secure">Master cards</span>
                      <h3>Card identities first</h3>
                      <p>Variants, duplicates, graded copies, and wishlist wants stay grouped under the same card.</p>
                    </div>
                    <strong>{visibleVaultMasterCards.length} group{visibleVaultMasterCards.length === 1 ? "" : "s"}</strong>
                  </div>
                  <div className="master-card-grid">
                    {visibleVaultMasterCards.slice(0, 6).map((masterCard) => (
                      <MasterCardGroupPreview
                        key={masterCard.id}
                        masterCard={masterCard}
                        onOpenRecord={(record) => setSelectedVaultDetailId(record.id)}
                        onOpenMarket={openMarketWatchForVaultItem}
                      />
                    ))}
                  </div>
                  {visibleVaultMasterCards.length > 6 ? (
                    <p className="compact-subtitle master-card-section-note">Showing the first 6 card identities for this filter. Narrow search or open Set Mastery for deeper checklist views.</p>
                  ) : null}
                </section>
              ) : null}
              {selectedVaultDetailId ? (
                <VaultItemDetail
                  item={selectedVaultDetailItem}
                  masterCard={selectedVaultDetailMasterCard}
                  setSummary={selectedVaultDetailSetSummary}
                  linkedTrades={workspaceTradeRecords.filter((record) => {
                    const itemId = String(selectedVaultDetailItem?.id || "");
                    if (!itemId) return false;
                    return [
                      record.vaultLinkedSourceItemId,
                      record.sourceItemId,
                      record.originalVaultItemId,
                      record.receivedVaultItemId,
                      record.givenVaultItemId,
                    ].some((value) => String(value || "") === itemId) ||
                      String(record.sourceItemName || "").trim().toLowerCase() === String(selectedVaultDetailItem?.name || "").trim().toLowerCase() ||
                      String(record.receivedName || record.receivedItemName || "").trim().toLowerCase() === String(selectedVaultDetailItem?.name || "").trim().toLowerCase();
                  })}
                  collectionSets={visibleVaultCollectionSets}
                  onClose={() => setSelectedVaultDetailId("")}
                  onEdit={startEditingVaultItem}
                  onDelete={async (item) => { const deleted = await deleteItem(item.id); if (deleted) setSelectedVaultDetailId(""); }}
                  onViewSet={openVaultSetSummary}
                  onMarkOwned={markWishlistItemOwned}
                  onMoveToForge={(item) => openVaultForgeTransfer(item, "move")}
                  onCopyToForge={(item) => openVaultForgeTransfer(item, "copy")}
                  onCreateListing={openVaultMarketplaceDecision}
                  onDuplicate={openVaultDuplicateItem}
                  onAttachReceipt={(item) => openReceiptForItem(item, "vault-item")}
                  onCheckMarket={openMarketWatchForVaultItem}
                  onSavePriceMemory={(item) => openMarketPriceMemoryFlow(item, { source: "vault-profile-save-price", seed: { itemName: item.name, price: vaultItemTotalMarketValue(item) || "", condition: item.conditionName || item.condition || "" } })}
                  onAddToDisplayCase={(item) => openVaultDisplayCaseFlow(item, { source: "vault-item-profile" })}
                  onAddToCompare={(item) => openItemComparisonFlow(item, {
                    source: "vault-item-profile-compare",
                    seed: {
                      itemName: item.name,
                      rememberedPrice: vaultItemTotalMarketValue(item) || "",
                      conditionText: item.conditionName || item.condition || "",
                      itemType: vaultItemTypeLabel(item),
                      setOrProduct: vaultItemSetLabel(item),
                      status: normalizeVaultStatus(item),
                      notes: "Added from Vault Item Profile for local comparison.",
                    },
                  })}
                  onRefreshMarket={refreshVaultMarket}
                  onQuickUpdateMarketValue={quickUpdateMarketValue}
                  onQuickUpdateSalePrice={quickUpdatePlannedSalePrice}
                  onStartTrade={(item) => openTradeValueFlow(item, { source: "vault-detail", sourceKind: "vault" })}
                  showSellerTools={adaptiveSellerToolsVisible}
                />
              ) : null}
              {vaultItems.length ? (
              <div className="inventory-list compact-inventory-list">
                {pagedVaultItems.items.map((item) => {
                  const itemMasterCard = findMasterCardForInventoryItem(item, vaultMasterCardByItemId);
                  return (
                    <CompactInventoryCard
                      key={item.id}
                      item={item}
                      masterCard={itemMasterCard}
                      variant="vault"
                      onRestock={prepareRestock}
                      onViewDetails={(vaultItem) => setSelectedVaultDetailId(vaultItem.id)}
                      onEdit={startEditingVaultItem}
                      onDelete={deleteItem}
                      onStatusChange={updateItemStatus}
                      onMoveToForge={(vaultItem) => openVaultForgeTransfer(vaultItem, "move")}
                      onCopyToForge={(vaultItem) => openVaultForgeTransfer(vaultItem, "copy")}
                      onCreateListing={openVaultMarketplaceDecision}
                      onDuplicate={openVaultDuplicateItem}
                      onQuickUpdateMarketValue={quickUpdateMarketValue}
                      onQuickUpdateSalePrice={quickUpdatePlannedSalePrice}
                      onStartTrade={(vaultItem) => openTradeValueFlow(vaultItem, { source: "vault-card", sourceKind: "vault" })}
                      showSellerTools={adaptiveSellerToolsVisible}
                    />
                  );
                })}
                {visibleVaultItems.length === 0 ? (
                  <div className="empty-state">
                    <h3>No matching Vault items.</h3>
                    <p>Filters are hiding items, or this search term is not in your collection yet.</p>
                    <div className="quick-actions">
                      <button type="button" className="secondary-button" onClick={clearVaultFilters}>Reset Filters</button>
                      <button type="button" onClick={openVaultQuickAddFlow}>Manual Add</button>
                    </div>
                  </div>
                ) : null}
              </div>
              ) : null}
              {vaultItems.length ? (
              <PaginationControls
                label="Vault Items"
                page={pagedVaultItems.page}
                pageCount={pagedVaultItems.pageCount}
                totalCount={pagedVaultItems.total}
                pageSize={LONG_LIST_PAGE_SIZE}
                onPageChange={(page) => {
                  setVaultPage(page);
                  scrollToResultsTop();
                }}
                compact
              />
              ) : null}
            </section>
            </>
            ) : null}

            {vaultSubTab === "wishlist" ? (
              <section id="wishlist-items-section" className="panel">
                <div className="compact-card-header">
                  <div>
                    <h2>Wishlist / ISO</h2>
                    <p>Wanted items stay separate from owned Vault records and Forge business inventory. This is local planning only with no automatic matching or live seller offers.</p>
                  </div>
                  <div className="quick-actions">
                    <button
                      type="button"
                      onClick={() => openWishlistIsoFlow({}, { source: "vault-wishlist-header" })}
                    >
                      Add Wishlist / ISO
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => openProductAddFlow({ source: "vault-wishlist", destinations: { wishlist: true } })}
                    >
                      Add Wishlist Item
                    </button>
                  </div>
                </div>
                {renderWishlistIsoPlanningSection({ surface: "vault" })}
                {wishlistMasterCards.length ? (
                  <section className="master-card-section vault-master-card-section vault-wishlist-master-section" aria-label="Wishlist master card groups">
                    <div className="compact-card-header">
                      <div>
                        <span className="trust-badge trust-badge--verified">Wishlist groups</span>
                        <h3>Wanted card identities</h3>
                        <p>Wishlist variants stay attached to the same master card so missing copies do not feel scattered.</p>
                      </div>
                      <strong>{wishlistMasterCards.length} group{wishlistMasterCards.length === 1 ? "" : "s"}</strong>
                    </div>
                    <div className="master-card-grid">
                      {wishlistMasterCards.slice(0, 4).map((masterCard) => (
                        <MasterCardGroupPreview
                          key={masterCard.id}
                          masterCard={masterCard}
                          compact
                          onOpenRecord={(record) => setSelectedVaultDetailId(record.id)}
                          onOpenMarket={openMarketWatchForVaultItem}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}
                <div className="inventory-list compact-inventory-list vault-wishlist-list">
                  {wishlistItems.length === 0 ? (
                    <div className="empty-state vault-empty-state">
                      <h3>No wishlist or ISO items yet.</h3>
                      <p>Add wants here without counting them as owned collection or sellable inventory. No automatic matching or live seller offers are connected.</p>
                      <div className="quick-actions">
                        <button type="button" onClick={() => openWishlistIsoFlow({}, { source: "vault-wishlist-empty" })}>Add Wishlist / ISO</button>
                        <button type="button" className="secondary-button" onClick={() => setVaultSubTab("sets")}>Browse Set Mastery</button>
                      </div>
                    </div>
                  ) : (
                    wishlistItems.map((item) => {
                      const setSummary = findSetSummaryForItem(item, vaultSetCompletionRows);
                      const wantedQuantity = item.quantityWanted || item.wantedQuantity || item.quantity || 1;
                      const setDisplay = setSummary?.name || vaultItemSetLabel(item) || "Set unknown";
                      const targetDisplay = formatPriceDisplay(item.targetPrice || item.marketPrice, { moneyFormatter: money, missingLabel: "Price data unavailable" });
                      const wishlistSeed = buildWishlistAddSeed(item);
                      return (
                      <article className="inventory-card compact-card vault-item-card vault-wishlist-card" key={item.id}>
                        <div className="compact-card-header">
                          <div className="compact-title-block">
                            <h3>{item.name}</h3>
                            <p className="compact-subtitle">{setDisplay} - Tracked wishlist item</p>
                          </div>
                          <span className={statusClass("Wishlist")}>Wishlist</span>
                        </div>
                        {vaultItemDisplayImage(item) ? (
                          <div className="compact-image-wrap vault-image-wrap">
                            <PrivateStorageImage src={vaultItemDisplayImage(item)} alt={item.name} />
                          </div>
                        ) : null}
                        <div className="vault-card-facts">
                          <p><span>Wanted</span><strong>{wantedQuantity}</strong></p>
                          <p><span>Target</span><strong>{targetDisplay}</strong></p>
                          <p><span>Set</span><strong>{setDisplay}</strong></p>
                          <p><span>Variant</span><strong>{vaultVariantLabel(item)}</strong></p>
                        </div>
                        <p className="compact-subtitle">{item.wishlistNotes || item.actionNotes || item.notes || "No wishlist notes yet."}</p>
                        <div className="compact-actions vault-card-actions">
                          <button type="button" onClick={() => markWishlistItemOwned(item)}>Mark owned</button>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => openProductAddFlow({
                              source: "wishlist-owned-copy",
                              destinations: { vault: true },
                              seed: wishlistSeed,
                            })}
                          >
                            Add duplicate
                          </button>
                          <OverflowMenu
                            buttonLabel="More"
                            actions={[
                              { label: "Item Profile", onClick: () => setSelectedVaultDetailId(item.id) },
                              { label: "View Set", onClick: () => setSummary ? openVaultSetSummary(setSummary) : openVaultSetForItem(item) },
                              { label: "Open Market Watch", onClick: () => openMarketWatchForVaultItem(item) },
                            ]}
                            onDelete={() => deleteItem(item.id)}
                            deleteLabel="Remove from Wishlist"
                          />
                        </div>
                      </article>
                    );})
                  )}
                </div>
              </section>
            ) : null}

            {vaultSubTab === "sets" ? (
              <section className="panel vault-sets-panel">
                <div className="compact-card-header vault-set-page-heading">
                  <div>
                    <span className="trust-badge trust-badge--secure">Protected checklist</span>
                    <h2>{selectedVaultSet ? selectedVaultSet.name : "Set Mastery"}</h2>
                    <p>{selectedVaultSet ? "Card completion, missing cards, wishlist gaps, and sealed products stay clearly separated." : "Track owned cards, missing checklist gaps, and sealed products without mixing them."}</p>
                  </div>
                  <div className="summary-pill-row">
                    {selectedVaultSet ? <button type="button" className="secondary-button" onClick={() => setSelectedVaultSetId("")}>All Sets</button> : null}
                    <button type="button" className="secondary-button" onClick={() => openVaultCatalogSearchFlow({ source: "vault-sets" })}>Search Set</button>
                  </div>
                </div>
                {!selectedVaultSet ? (
                  <div className="vault-set-master-toolbar">
                    <label className="vault-filter-field vault-search-field">
                      <span>Search sets</span>
                      <input
                        value={vaultSetSearchQuery}
                        onInput={(event) => setVaultSetSearchQuery(event.target.value)}
                        onChange={(event) => setVaultSetSearchQuery(event.target.value)}
                        placeholder="Search sets"
                      />
                    </label>
                    <div className="vault-set-chip-row vault-set-master-tabs" role="group" aria-label="Set Mastery views">
                      {[
                        ["my", "My Sets"],
                        ["all", "All Sets"],
                        ["wishlist", "Wishlist Sets"],
                        ["recent", "Recent Sets"],
                      ].map(([value, label]) => (
                        <button key={value} type="button" className={vaultSetMasteryTab === value ? "active" : ""} onClick={() => setVaultSetMasteryTab(value)}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {selectedVaultSet ? (
                    <div className="vault-set-detail">
                      <div className="vault-set-detail-hero">
                      {selectedVaultSet.logoUrl || selectedVaultSet.symbolUrl ? (
                        <div className="vault-set-detail-logo">
                          <PrivateStorageImage src={selectedVaultSet.logoUrl || selectedVaultSet.symbolUrl} alt="" />
                        </div>
                      ) : null}
                      <div className="vault-set-detail-hero-copy">
                        <span>{selectedVaultSet.series || "Pokemon set"}</span>
                        <h3>{selectedVaultSet.completionLabel}</h3>
                        <p>{selectedVaultSet.progressCopy}{selectedVaultSet.releaseDate ? ` Released ${shortDate(selectedVaultSet.releaseDate)}.` : ""}</p>
                        <div className="vault-set-separation-note" aria-label="Set completion scope">
                          <span>Card completion counts cards only.</span>
                          <span>Sealed products stay separate.</span>
                        </div>
                      </div>
                      <div className="vault-progress-track" aria-label={`${selectedVaultSet.name} completion`}>
                        <i style={{ width: `${selectedVaultSet.percent ?? 0}%` }} />
                      </div>
                    </div>
                    <div className="vault-set-detail-grid">
                      <div className="stat-tile vault-set-stat--cards"><span>{selectedVaultSet.checklistAvailable ? "Checklist cards" : "Tracked items"}</span><strong>{selectedVaultSet.checklistAvailable ? selectedVaultSet.totalCards || selectedVaultSet.catalogCards.length : selectedVaultSet.trackedItemCount}</strong></div>
                      <div className="stat-tile vault-set-stat--owned"><span>Owned variants</span><strong>{selectedVaultSet.ownedQuantity}</strong></div>
                      <div className="stat-tile vault-set-stat--missing"><span>{selectedVaultSet.missingSupported ? "Missing cards" : "Checklist status"}</span><strong>{selectedVaultSet.missingSupported ? selectedVaultSet.missingCount : "Unavailable"}</strong></div>
                      <div className="stat-tile vault-set-stat--sealed"><span>Sealed products</span><strong>{selectedVaultSet.trackedSealedCount || selectedVaultSet.sealedProducts.length}</strong><small>Separate from card completion</small></div>
                    </div>
                    {!selectedVaultSet.checklistAvailable ? (
                      <div className="vault-set-trust-note">
                        <strong>{selectedVaultSet.checklistStatus}</strong>
                        <span>Missing count needs checklist data. Add catalog checklist rows before treating this as full set completion.</span>
                      </div>
                    ) : null}
                    <div className="vault-set-controls" aria-label="Set Mastery controls">
                      <div className="vault-set-chip-row" role="group" aria-label="Set view filter">
                        {[
                          ["all", "All"],
                          ["owned", "Owned"],
                          ["missing", "Missing"],
                          ["wishlist", "Wishlist"],
                          ["variants", "Variants"],
                          ["sealed", "Sealed"],
                        ].map(([value, label]) => (
                          <button key={value} type="button" className={vaultSetDetailFilter === value ? "active" : ""} onClick={() => setVaultSetDetailFilter(value)}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <label>
                        <span>Variant</span>
                        <select value={vaultSetVariantFilter} onChange={(event) => setVaultSetVariantFilter(event.target.value)}>
                          <option value="all">All variants</option>
                          <option value="normal">Normal</option>
                          <option value="holo">Holo</option>
                          <option value="reverse_holo">Reverse holo</option>
                          <option value="promo">Promo</option>
                          <option value="unknown">Variant unknown</option>
                        </select>
                      </label>
                      <label>
                        <span>Sort</span>
                        <select value={vaultSetSort} onChange={(event) => setVaultSetSort(event.target.value)}>
                          <option value="cardNumber">Card number</option>
                          <option value="name">Name</option>
                          <option value="rarity">Rarity</option>
                        </select>
                      </label>
                      <div className="vault-set-chip-row" role="group" aria-label="Set layout">
                        {[
                          ["grid", "Grid"],
                          ["list", "List"],
                        ].map(([value, label]) => (
                          <button key={value} type="button" className={vaultSetViewMode === value ? "active" : ""} onClick={() => setVaultSetViewMode(value)}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {selectedVaultCardGroup ? (
                      <VaultGroupedCardDetail
                        cardGroup={selectedVaultCardGroup}
                        setSummary={selectedVaultSet}
                        onClose={() => setSelectedVaultCardGroupKey("")}
                        onViewSet={openVaultSetSummary}
                        onAddVariant={(cardGroup) => openProductAddFlow({ product: cardGroup.primaryRecord, source: "vault-set-card-add-variant", destinations: { vault: true }, seed: buildWishlistAddSeed({ ...cardGroup.primaryRecord, name: cardGroup.title, setName: selectedVaultSet.name, cardNumber: cardGroup.cardNumber }) })}
                        onAddWishlist={(cardGroup) => openProductAddFlow({ product: cardGroup.primaryRecord, source: "vault-set-card-add-wishlist", destinations: { wishlist: true }, seed: buildWishlistAddSeed({ ...cardGroup.primaryRecord, name: cardGroup.title, setName: selectedVaultSet.name, cardNumber: cardGroup.cardNumber }) })}
                        onMarkOwned={markWishlistItemOwned}
                        onOpenMarket={openMarketWatchForVaultItem}
                        onOpenRecord={(record) => setSelectedVaultDetailId(record.id)}
                        showSellerTools={adaptiveSellerToolsVisible}
                      />
                    ) : null}

                    {selectedVaultSetView?.showAllCards ? (
                    <div className="vault-set-subsection">
                      <div className="compact-card-header">
                        <div>
                          <h3>Set checklist</h3>
                          <p>{selectedVaultSet.checklistAvailable ? "Known catalog cards from this set, grouped by canonical card identity." : "Tracked catalog cards only. Full checklist not available yet."}</p>
                        </div>
                        <span className="status-badge">{selectedVaultSetView.cardRows.length} card{selectedVaultSetView.cardRows.length === 1 ? "" : "s"}</span>
                      </div>
                      <div className={`vault-set-product-grid vault-set-card-row-grid${vaultSetViewMode === "list" ? " vault-set-product-grid--list" : ""}`}>
                        {selectedVaultSetView.cardRows.length ? selectedVaultSetView.cardRows.slice(0, 36).map((row) => (
                          <VaultSetCardRow
                            key={`set-card-${row.key}`}
                            row={row}
                            onOpen={() => setSelectedVaultCardGroupKey(row.key)}
                            onAddOwned={() => openProductAddFlow({ product: row.primaryRecord, source: "vault-set-card-add-owned", destinations: { vault: true }, seed: buildWishlistAddSeed({ ...row.primaryRecord, name: row.title, setName: selectedVaultSet.name, cardNumber: row.cardNumber }) })}
                            onAddWishlist={() => openProductAddFlow({ product: row.primaryRecord, source: "vault-set-card-add-wishlist", destinations: { wishlist: true }, seed: buildWishlistAddSeed({ ...row.primaryRecord, name: row.title, setName: selectedVaultSet.name, cardNumber: row.cardNumber }) })}
                            onOpenMarket={() => openMarketWatchForVaultItem(row.primaryRecord)}
                          />
                        )) : (
                          <div className="small-empty-state">
                            <strong>No catalog cards connected yet.</strong>
                            <span>Search Market Watch by set name or add cards with set details to start this checklist.</span>
                          </div>
                        )}
                      </div>
                    </div>
                    ) : null}

                    {selectedVaultSetView?.showOwned ? (
                    <div className="vault-set-subsection">
                      <div className="compact-card-header">
                        <div>
                          <h3>Owned from this set</h3>
                          <p>Canonical cards you own. Variants stay visible inside card detail.</p>
                        </div>
                      </div>
                      <div className={`vault-set-product-grid vault-set-card-row-grid${vaultSetViewMode === "list" ? " vault-set-product-grid--list" : ""}`}>
                        {selectedVaultSetView.ownedCardRows.length ? selectedVaultSetView.ownedCardRows.slice(0, 24).map((row) => (
                          <VaultSetCardRow
                            key={`set-owned-${row.key}`}
                            row={row}
                            onOpen={() => setSelectedVaultCardGroupKey(row.key)}
                            onAddOwned={() => openProductAddFlow({ product: row.primaryRecord, source: "vault-set-owned-variant", destinations: { vault: true }, seed: buildWishlistAddSeed({ ...row.primaryRecord, name: row.title, setName: selectedVaultSet.name, cardNumber: row.cardNumber }) })}
                            onAddWishlist={() => openProductAddFlow({ product: row.primaryRecord, source: "vault-set-owned-wishlist", destinations: { wishlist: true }, seed: buildWishlistAddSeed({ ...row.primaryRecord, name: row.title, setName: selectedVaultSet.name, cardNumber: row.cardNumber }) })}
                            onOpenMarket={() => openMarketWatchForVaultItem(row.primaryRecord)}
                          />
                        )) : (
                          <div className="small-empty-state">
                            <strong>No owned items from this set yet.</strong>
                            <span>Add a card or sealed product and keep the set selected in details.</span>
                            <button type="button" onClick={() => openProductAddFlow({ source: "vault-set-owned-empty", seed: { setName: selectedVaultSet.name }, destinations: { vault: true } })}>Add Item</button>
                          </div>
                        )}
                      </div>
                    </div>
                    ) : null}

                    {selectedVaultSetView?.showMissing ? (
                    <div className="vault-set-subsection">
                      <div className="compact-card-header">
                        <div>
                          <h3>Missing cards</h3>
                          <p>{selectedVaultSet.missingSupported ? "Catalog cards not yet matched to your Vault." : "Missing count needs checklist data before this set can show true missing cards."}</p>
                        </div>
                      </div>
                      <div className={`vault-set-product-grid vault-set-card-row-grid${vaultSetViewMode === "list" ? " vault-set-product-grid--list" : ""}`}>
                        {selectedVaultSet.missingSupported && selectedVaultSetView.missingCardRows.length ? selectedVaultSetView.missingCardRows.slice(0, 24).map((row) => (
                          <VaultSetCardRow
                            key={`set-missing-${row.key}`}
                            row={row}
                            onOpen={() => setSelectedVaultCardGroupKey(row.key)}
                            onAddOwned={() => openProductAddFlow({ product: row.primaryRecord, source: "vault-set-missing", destinations: { vault: true }, seed: buildWishlistAddSeed({ ...row.primaryRecord, name: row.title, setName: selectedVaultSet.name, cardNumber: row.cardNumber }) })}
                            onAddWishlist={() => openProductAddFlow({ product: row.primaryRecord, source: "vault-set-missing-wishlist", destinations: { wishlist: true }, seed: buildWishlistAddSeed({ ...row.primaryRecord, name: row.title, setName: selectedVaultSet.name, cardNumber: row.cardNumber }) })}
                            onOpenMarket={() => openMarketWatchForVaultItem(row.primaryRecord)}
                          />
                        )) : (
                          <div className="small-empty-state">
                            <strong>{selectedVaultSet.missingSupported ? "No missing catalog cards found." : "Missing count needs checklist data."}</strong>
                            <span>{selectedVaultSet.missingSupported ? "This set may need more catalog data, or your collection is complete for known cards." : "Full checklist not available yet. Vault will show tracked items and wishlist cards without inventing missing cards."}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    ) : null}

                    {selectedVaultSetView?.showWishlist ? (
                    <div className="vault-set-subsection">
                      <div className="compact-card-header">
                        <div>
                          <h3>Wishlist gaps</h3>
                          <p>Wanted items tied to this set stay separate from owned Vault records.</p>
                        </div>
                      </div>
                      <div className={`vault-set-product-grid vault-set-card-row-grid${vaultSetViewMode === "list" ? " vault-set-product-grid--list" : ""}`}>
                        {selectedVaultSetView.wishlistCardRows.length ? selectedVaultSetView.wishlistCardRows.slice(0, 16).map((row) => (
                          <VaultSetCardRow
                            key={`set-wishlist-${row.key}`}
                            row={row}
                            onOpen={() => setSelectedVaultCardGroupKey(row.key)}
                            onAddOwned={() => {
                              const wishlistRecord = row.wishlistRecords?.[0];
                              if (wishlistRecord?.id) markWishlistItemOwned(wishlistRecord);
                              else openProductAddFlow({ product: row.primaryRecord, source: "vault-set-wishlist-owned", destinations: { vault: true }, seed: buildWishlistAddSeed({ ...row.primaryRecord, name: row.title, setName: selectedVaultSet.name, cardNumber: row.cardNumber }) });
                            }}
                            onAddWishlist={() => openProductAddFlow({ product: row.primaryRecord, source: "vault-set-wishlist-duplicate", destinations: { wishlist: true }, seed: buildWishlistAddSeed({ ...row.primaryRecord, name: row.title, setName: selectedVaultSet.name, cardNumber: row.cardNumber }) })}
                            onOpenMarket={() => openMarketWatchForVaultItem(row.primaryRecord)}
                          />
                        )) : (
                          <div className="small-empty-state">
                            <strong>No wishlist cards for this set.</strong>
                            <span>Add a missing or wanted card to track it without counting it as owned.</span>
                          </div>
                        )}
                      </div>
                    </div>
                    ) : null}

                    {selectedVaultSetView?.showVariants ? (
                    <div className="vault-set-subsection">
                      <div className="compact-card-header">
                        <div>
                          <h3>Variants</h3>
                          <p>Known owned and wishlist variants grouped under one canonical card identity. Variant checklist unavailable.</p>
                        </div>
                      </div>
                      <div className={`vault-set-product-grid vault-set-card-row-grid${vaultSetViewMode === "list" ? " vault-set-product-grid--list" : ""}`}>
                        {selectedVaultSetView.variantCardRows.length ? selectedVaultSetView.variantCardRows.slice(0, 24).map((row) => (
                          <VaultSetCardRow
                            key={`set-variant-${row.key}`}
                            row={row}
                            onOpen={() => setSelectedVaultCardGroupKey(row.key)}
                            onAddOwned={() => openProductAddFlow({ product: row.primaryRecord, source: "vault-set-variant", destinations: { vault: true }, seed: buildWishlistAddSeed({ ...row.primaryRecord, name: row.title, setName: selectedVaultSet.name, cardNumber: row.cardNumber }) })}
                            onAddWishlist={() => openProductAddFlow({ product: row.primaryRecord, source: "vault-set-variant-wishlist", destinations: { wishlist: true }, seed: buildWishlistAddSeed({ ...row.primaryRecord, name: row.title, setName: selectedVaultSet.name, cardNumber: row.cardNumber }) })}
                            onOpenMarket={() => openMarketWatchForVaultItem(row.primaryRecord)}
                          />
                        )) : (
                          <div className="small-empty-state">
                            <strong>No variant records yet.</strong>
                            <span>Add another finish or condition to see variant detail here. Missing variant count needs checklist data.</span>
                          </div>
                        )}
                      </div>
                    </div>
                    ) : null}

                    {selectedVaultSetView?.showSealed ? (
                    <div className="vault-set-subsection vault-set-subsection--sealed">
                      <div className="compact-card-header">
                        <div>
                          <h3>Sealed products</h3>
                          <p>ETBs, tins, boxes, bundles, and other sealed products tied to this set stay separate from card completion.</p>
                        </div>
                      </div>
                      <div className={`vault-set-product-grid${vaultSetViewMode === "list" ? " vault-set-product-grid--list" : ""}`}>
                        {selectedVaultSetView.sealedProducts.length ? selectedVaultSetView.sealedProducts.slice(0, 16).map((product) => (
                          <article className="vault-set-mini-card" key={`set-sealed-${product.id || catalogTitle(product)}`}>
                            {(product.__vaultOwnedSealed ? vaultItemDisplayImage(product) : getCatalogImage(product)) ? <PrivateStorageImage src={product.__vaultOwnedSealed ? vaultItemDisplayImage(product) : getCatalogImage(product)} alt="" /> : <span className="vault-set-mini-thumb">Box</span>}
                            <strong>{product.name || product.itemName || catalogTitle(product)}</strong>
                            <span>{product.productType || product.product_type || "Sealed Product"}</span>
                            <span>{product.__vaultOwnedSealed ? [itemPurchaserName(product), `Qty ${product.quantity || 1}`, vaultItemTotalMarketValue(product) ? money(vaultItemTotalMarketValue(product)) : "Value unavailable"].filter(Boolean).join(" - ") : "Catalog sealed product"}</span>
                            {product.__vaultOwnedSealed ? (
                              <button type="button" className="secondary-button" onClick={() => setSelectedVaultDetailId(product.id)}>Item Profile</button>
                            ) : (
                              <button type="button" className="secondary-button" onClick={() => openProductAddFlow({ product, source: "vault-set-sealed", destinations: { vault: true } })}>Add Item</button>
                            )}
                          </article>
                        )) : (
                          <div className="small-empty-state">
                            <strong>No sealed products connected yet.</strong>
                            <span>Sealed catalog rows will appear here when available.</span>
                          </div>
                        )}
                      </div>
                    </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="vault-set-grid">
                    {vaultSetMasteryRows.length ? vaultSetMasteryRows.map((set) => (
                      <button type="button" className={`vault-set-card vault-set-card-button${set.percent === 100 ? " is-complete" : set.ownedCount > 0 ? " has-progress" : " is-empty"}`} key={set.key || `${set.id}-${set.name}`} onClick={() => setSelectedVaultSetId(set.id)}>
                        <div className="vault-set-card-shell">
                          {set.logoUrl || set.symbolUrl ? (
                            <span className="vault-set-card-logo-wrap"><PrivateStorageImage className="vault-set-card-logo" src={set.logoUrl || set.symbolUrl} alt="" /></span>
                          ) : (
                            <span className="vault-set-card-logo-wrap vault-set-card-logo-wrap--placeholder">Set</span>
                          )}
                          <div className="vault-set-card-main">
                            <div className="vault-set-card-kicker">
                              <span>{set.series || "Pokemon set"}</span>
                              {set.releaseDate ? <span>Released {shortDate(set.releaseDate)}</span> : null}
                            </div>
                            <h3>{set.name}</h3>
                            <div className="vault-progress-track" aria-label={`${set.name} completion`}>
                              <i style={{ width: `${set.percent ?? 0}%` }} />
                            </div>
                            <p>{set.checklistAvailable ? set.progressCopy : `${set.trackedItemCount} tracked item${set.trackedItemCount === 1 ? "" : "s"} - ${set.checklistStatus}`}</p>
                            <dl className="vault-set-card-metrics">
                              <div><dt>Owned</dt><dd>{set.ownedCount || 0}</dd></div>
                              <div><dt>Total</dt><dd>{set.totalCards || set.catalogCards?.length || "Needs data"}</dd></div>
                              <div><dt>Missing</dt><dd>{set.missingSupported ? set.missingCount : "Needs data"}</dd></div>
                              <div><dt>Sealed</dt><dd>{set.trackedSealedCount || set.sealedProducts?.length || 0}</dd></div>
                            </dl>
                            <strong>{set.completionLabel}</strong>
                          </div>
                        </div>
                      </button>
                    )) : (
                      <div className="empty-state small-empty-state">
                        <h3>No sets found yet.</h3>
                        <p>Start this set by adding your first card. Sealed products can be tracked separately when catalog data is available.</p>
                        <button type="button" onClick={openVaultQuickAddFlow}>Add Item</button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            ) : null}

            {vaultSubTab === "sealed" ? (
              <section className="panel vault-sealed-panel">
                <div className="compact-card-header">
                  <div>
                    <h2>Sealed Products</h2>
                    <p>Sealed items stay organized by safe set matches. Uncertain products remain honest as Set unknown.</p>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => openProductAddFlow({ source: "vault-sealed-tab", destinations: { vault: true }, seed: { productType: "Sealed Product" } })}>Add sealed</button>
                </div>
                {activeVaultSealedItems.length ? (
                  <div className="inventory-list compact-inventory-list vault-sealed-list">
                    {activeVaultSealedItems.map((item) => {
                      const setSummary = findSetSummaryForItem(item, vaultSetCompletionRows);
                      return (
                        <article className="inventory-card compact-card vault-item-card vault-sealed-card" key={item.id}>
                          <div className="compact-card-header">
                            <div>
                              <h3>{item.name}</h3>
                              <p className="compact-subtitle">{setSummary?.unknownSet ? "Set unknown" : setSummary?.name || vaultItemSetLabel(item) || "Set unknown"}</p>
                            </div>
                            <span className={statusClass(vaultStatusLabel(normalizeVaultStatus(item)))}>{vaultStatusLabel(normalizeVaultStatus(item))}</span>
                          </div>
                          <div className="vault-card-facts">
                            <p><span>Qty</span><strong>{item.quantity || 1}</strong></p>
                            <p><span>Value</span><strong>{vaultItemTotalMarketValue(item) ? money(vaultItemTotalMarketValue(item)) : "Value unavailable"}</strong></p>
                            <p><span>Owner</span><strong>{itemPurchaserName(item)}</strong></p>
                          </div>
                          <div className="compact-actions vault-card-actions">
                            <button type="button" className="secondary-button" onClick={() => setSelectedVaultDetailId(item.id)}>Item Profile</button>
                            {setSummary && !setSummary.unknownSet ? <button type="button" className="secondary-button" onClick={() => openVaultSetSummary(setSummary)}>View Set</button> : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state small-empty-state">
                    <h3>No sealed products yet.</h3>
                    <p>Add sealed products with a known set when possible. If the set is uncertain, Vault will keep it as Set unknown.</p>
                    <button type="button" onClick={() => openProductAddFlow({ source: "vault-sealed-empty", destinations: { vault: true }, seed: { productType: "Sealed Product" } })}>Add sealed product</button>
                  </div>
                )}
              </section>
            ) : null}

            {vaultSubTab === "activity" || vaultSubTab === "portfolio" ? (
              <section className="panel vault-portfolio-panel">
                <div className="compact-card-header">
                  <div>
                    <h2>Activity</h2>
                    <p>Recent collection changes, value context, and missing details stay calm and reviewable.</p>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => setHomeSubTab("activity")}>Home Metrics</button>
                </div>
                <div className="vault-portfolio-grid">
                  {vaultPortfolioStats.map((stat) => (
                    <div className="card" key={stat.key}>
                      <p>{stat.label}</p>
                      <h2>{stat.value}</h2>
                    </div>
                  ))}
                </div>
                <div className="vault-portfolio-breakdown">
                  <span>{activeVaultCardItems.length} raw cards</span>
                  <span>{activeVaultSealedItems.length} sealed products</span>
                  <span>{activeVaultItems.filter((item) => item.graded || item.grade || item.gradingCompany).length} graded/slab records</span>
                  <span>{wishlistItems.length} wishlist items</span>
                </div>
                <div className="home-list compact-home-list">
                  {recentVaultItems.length ? recentVaultItems.map((item) => (
                    <button type="button" className="home-list-row" key={item.id} onClick={() => setSelectedVaultDetailId(item.id)}>
                      <span>
                        <strong>{item.name}</strong>
                        <small>{[vaultItemSetLabel(item), vaultStatusLabel(normalizeVaultStatus(item)), `Qty ${item.quantity || 1}`].filter(Boolean).join(" | ")}</small>
                      </span>
                      <b>{vaultItemLastUpdatedLabel(item)}</b>
                    </button>
                  )) : (
                    <div className="empty-state small-empty-state">
                      <h3>No Vault activity yet.</h3>
                      <p>Newly added cards, sealed products, wishlist updates, and value reviews will appear here.</p>
                    </div>
                  )}
                </div>
              </section>
            ) : null}
            </VaultPage>
          </LazyToolBoundary>);
  }

  return renderDeferredVaultWorkspace();
}
