import {
  EtMockupEmptyState,
  EtMockupPageShell,
  EtMockupSectionCard,
} from "../components/command-system";

export default function MarketPage(props) {
  const {
    CATALOG_PAGE_SIZE_OPTIONS,
    CATALOG_SORT_OPTIONS,
    Field,
    LONG_LIST_PAGE_SIZE,
    MARKET_CATALOG_DEAL_FILTERS,
    MARKET_STATUS_LABELS,
    PaginationControls,
    SUGGESTION_TYPES,
    activeCatalogFilterChips,
    adminEditModeActive,
    catalogAlternateKindLabels,
    catalogDataFilter,
    catalogEmptyTerm,
    catalogImage,
    catalogKindFilter,
    catalogPageSize,
    catalogResultsRef,
    catalogRarityFilter,
    catalogRarityOptions,
    catalogSearch,
    catalogSearchHasRun,
    catalogSetFilter,
    catalogSetOptions,
    catalogSort,
    catalogTitle,
    catalogTypeFilter,
    catalogTypeOptions,
    catalogViewMode,
    clearCatalogSearch,
    destinationDefaults,
    getCatalogKindLabel,
    getTideTradrMarketInfo,
    goToCatalogPage,
    hiddenCatalogFilterChipCount,
    isFeatureSectionOpen,
    marketCatalogDealFilter,
    marketSetSearchResults,
    money,
    openCatalogDetails,
    openDealFinderModal,
    openProductAddFlow,
    openVaultSetSummary,
    openWatchlistProductDetails,
    openWhatDidISee,
    pagedMarketWatchItems,
    phase2RecentDeals,
    refreshMarketWatchlist,
    refreshPinnedMarketWatch,
    removeTideTradrWatchlistItem,
    renderHeader,
    renderItemCompareTableSection,
    renderMarketHomeFoundation,
    renderMarketPriceMemorySection,
    renderMarketplaceSection,
    renderProductImageFallback,
    renderTideTradrCatalogResultCard,
    renderWishlistIsoPlanningSection,
    scrollToResultsTop,
    setActiveTab,
    setCatalogDataFilter,
    setCatalogRarityFilter,
    setCatalogSearch,
    setCatalogSearchHasRun,
    setCatalogSetFilter,
    setCatalogSort,
    setCatalogTypeFilter,
    setCatalogViewMode,
    setEmberAssistOpen,
    setFeatureSectionsOpen,
    setMarketCatalogDealFilter,
    setMarketWatchPage,
    setSupabaseCatalogStatus,
    setTideTradrSubTab,
    setVaultSubTab,
    shortDate,
    submitCatalogSearch,
    submitUniversalSuggestion,
    suggestMissingCatalogProductFromSearch,
    supabaseCatalogStatus,
    switchCatalogKindFilter,
    tideTradrCatalogPageCount,
    tideTradrCatalogResultGroups,
    tideTradrCatalogResults,
    tideTradrLookupProduct,
    tideTradrSubTab,
    updateCatalogPageSize,
    useCatalogProductInDeal,
    visibleCatalogFilterChips,
    workspaceWatchlist,
  } = props;

  return (
    <EtMockupPageShell
      accent="market"
      className="market-mockup-rebuild"
      ariaLabel="Market Watch fair price discovery"
    >
      <div className="et-mockup-main-column market-mockup-main">
        {renderHeader()}
            {tideTradrSubTab === "deal" ? (
              <section className="panel">
                <div className="empty-state">
                  <h3>Deal Finder opens in a focused sheet.</h3>
                  <p>Use the Market Watch header action to check product, quantity, asking price, and recommendation without changing the page.</p>
                  <button type="button" onClick={() => openDealFinderModal()}>Open Deal Finder</button>
                </div>
              </section>
            ) : tideTradrSubTab === "watch" ? (
              <>
                <section className="panel tidetradr-watch-panel">
                  <div className="compact-card-header">
                    <div>
                      <h2>Market Watch</h2>
                      <p>{workspaceWatchlist.length} watched item{workspaceWatchlist.length === 1 ? "" : "s"}.</p>
                    </div>
                    <span className="status-badge">{workspaceWatchlist.filter((item) => item.pinned || item.isPinned).length} pinned</span>
                  </div>
                  <div className="quick-actions tidetradr-watch-actions">
                    <button type="button" onClick={refreshPinnedMarketWatch}>Refresh Values</button>
                    <button type="button" className="secondary-button" onClick={refreshMarketWatchlist}>Refresh Watchlist</button>
                    <button type="button" className="secondary-button" onClick={() => setTideTradrSubTab("overview")}>Search Catalog</button>
                  </div>
                  {workspaceWatchlist.length === 0 ? (
                    <div className="empty-state market-empty-state">
                      <h3>Your watchlist is ready.</h3>
                      <p>Save items to track fair prices and restocks.</p>
                      <button type="button" onClick={() => setTideTradrSubTab("overview")}>Browse Market</button>
                    </div>
                  ) : (
                    <div className="inventory-list tidetradr-watch-list">
                      {pagedMarketWatchItems.items.map((item) => (
                        <div className="inventory-card compact-card tidetradr-watch-card" key={item.id}>
                          <div className="compact-card-header">
                            <div>
                              <h3>{item.name}</h3>
                              <p>{item.setName || "No set"} | {item.productType || "No type"}</p>
                            </div>
                            <span className="status-badge">{item.pinned ? "Pinned" : MARKET_STATUS_LABELS[item.marketStatus] || "Watchlist"}</span>
                          </div>
                          <p>Market: {money(item.marketValue)} | MSRP: {money(item.msrp)}</p>
                          <p className="compact-subtitle">Source: {item.sourceName || "Unknown"} | Last updated: {item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString() : "Unknown"}</p>
                          <div className="quick-actions tidetradr-watch-actions">
                            <button type="button" onClick={() => useCatalogProductInDeal(item.productId)}>Check Deal</button>
                            <button type="button" className="secondary-button" onClick={() => openWatchlistProductDetails(item)}>View Details</button>
                            <button type="button" className="secondary-button" onClick={() => removeTideTradrWatchlistItem(item.id)}>Remove</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <PaginationControls
                    label="Watched Products"
                    page={pagedMarketWatchItems.page}
                    pageCount={pagedMarketWatchItems.pageCount}
                    totalCount={pagedMarketWatchItems.total}
                    pageSize={LONG_LIST_PAGE_SIZE}
                    onPageChange={(page) => {
                      setMarketWatchPage(page);
                      scrollToResultsTop();
                    }}
                    compact
                  />
                </section>
              </>
            ) : tideTradrSubTab === "recent" ? (
              <section className="panel tidetradr-results-panel">
                <div className="compact-card-header">
                  <div>
                    <h2>Recent Checks</h2>
                    <p>Recently viewed products and Market Watch value checks.</p>
                  </div>
                  <span className="status-badge">{phase2RecentDeals.length ? `${phase2RecentDeals.length} deal checks` : (tideTradrLookupProduct ? "1 recent" : "No recent checks")}</span>
                </div>
                {phase2RecentDeals.length ? (
                  <div className="home-list compact-home-list">
                    {phase2RecentDeals.slice(0, 5).map((session) => (
                      <div className="home-list-row" key={session.id}>
                        <span>
                          <strong>{session.title || "Saved deal check"}</strong>
                          <small>{session.recommendation || "saved"} | score {Math.round(Number(session.dealScore || 0))}/100</small>
                        </span>
                        <b>{money(session.askingPrice)}</b>
                      </div>
                    ))}
                  </div>
                ) : null}
                {tideTradrLookupProduct ? (
                  <div className="catalog-results-list">
                    <div className="catalog-result-card">
                      <button type="button" className="catalog-result-main" onClick={() => openCatalogDetails(tideTradrLookupProduct.id)}>
                        <div className="catalog-thumb">
                          {catalogImage(tideTradrLookupProduct) ? (
                            <>
                              <img
                                src={catalogImage(tideTradrLookupProduct)}
                                alt=""
                                onError={(event) => {
                                  event.currentTarget.style.display = "none";
                                  event.currentTarget.nextElementSibling?.removeAttribute("hidden");
                                }}
                              />
                              {renderProductImageFallback(tideTradrLookupProduct, { hidden: true })}
                            </>
                          ) : (
                            renderProductImageFallback(tideTradrLookupProduct)
                          )}
                        </div>
                        <div>
                          <span className="catalog-pill">{getCatalogKindLabel(tideTradrLookupProduct)}</span>
                          <h3>{catalogTitle(tideTradrLookupProduct)}</h3>
                          <p>{tideTradrLookupProduct.productType || "Product"} | {tideTradrLookupProduct.setName || tideTradrLookupProduct.expansion || "No set"}</p>
                          <p>Market: {money(getTideTradrMarketInfo(tideTradrLookupProduct).currentMarketValue)}</p>
                        </div>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="empty-state">
                    <h3>No recent checks yet</h3>
                    <p>Search Market Watch and open a product to start building recent checks.</p>
                  </div>
                )}
              </section>
            ) : tideTradrSubTab === "listings" ? (
              <>
                {renderMarketplaceSection()}
              </>
            ) : (
              <>
                {renderMarketHomeFoundation()}



                <EtMockupSectionCard
                  sectionRef={catalogResultsRef}
                  className={`tidetradr-results-panel market-results-panel market-mockup-results ${!catalogSearchHasRun && !supabaseCatalogStatus.loading ? "tidetradr-results-panel--prompt" : ""}`}
                  title={catalogSearchHasRun ? "Market Watch Results" : "Search Market Watch"}
                  detail={catalogSearchHasRun
                    ? `Page ${supabaseCatalogStatus.page || 1} of ${tideTradrCatalogPageCount || (supabaseCatalogStatus.hasMore ? (supabaseCatalogStatus.page || 1) + 1 : 1)}`
                    : "Compare catalog values, retail context, and saved watches."}
                  action={<span className="status-badge">{supabaseCatalogStatus.loading && tideTradrCatalogResults.length === 0 && marketSetSearchResults.length === 0 ? "Searching..." : catalogSearchHasRun ? `${supabaseCatalogStatus.totalCount ?? tideTradrCatalogResults.length} results` : "Search first"}</span>}
                  ariaLabel="Market Watch Results"
                >

                  {catalogSearchHasRun ? (
                    <p className="market-results-safety-note">Fair price discovery only. No checkout or stock guarantee.</p>
                  ) : null}

                  {catalogSearchHasRun ? (
                  <div className="catalog-results-toolbar market-results-toolbar">
                    <Field label="Sort">
                      <select value={catalogSort} onChange={(e) => setCatalogSort(e.target.value)}>
                        {CATALOG_SORT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </Field>
                    <button type="button" className="secondary-button market-filter-button" onClick={() => setFeatureSectionsOpen((current) => ({ ...current, market_filters: !current.market_filters }))}>
                      {isFeatureSectionOpen("market_filters") ? "Hide Filters" : "Filters"}
                    </button>
                  </div>
                  ) : null}

                  {catalogSearchHasRun && activeCatalogFilterChips.length ? (
                    <div className="active-filter-chips" aria-label="Active catalog filters">
                      <span>Active filters:</span>
                      {visibleCatalogFilterChips.map((filter) => (
                        <span className="status-badge" key={filter}>{filter}</span>
                      ))}
                      {hiddenCatalogFilterChipCount ? <span className="status-badge">+{hiddenCatalogFilterChipCount} more</span> : null}
                      <button type="button" className="ghost-button compact-action" onClick={clearCatalogSearch}>Clear</button>
                    </div>
                  ) : null}

                  {catalogSearchHasRun && isFeatureSectionOpen("market_filters") ? (
                    <div className="filter-grid market-filter-drawer">
                      <div className="market-filter-drawer-actions">
                        <div className="catalog-view-toggle" role="group" aria-label="Catalog result view">
                          <button
                            type="button"
                            className={catalogViewMode === "grid" ? "active" : ""}
                            aria-pressed={catalogViewMode === "grid"}
                            onClick={() => setCatalogViewMode("grid")}
                          >
                            Grid
                          </button>
                          <button
                            type="button"
                            className={catalogViewMode === "list" ? "active" : ""}
                            aria-pressed={catalogViewMode === "list"}
                            onClick={() => setCatalogViewMode("list")}
                          >
                            List
                          </button>
                        </div>
                        <button type="button" className="secondary-button" onClick={() => setTideTradrSubTab("recent")}>Recent</button>
                        <button type="button" className="secondary-button" onClick={() => setTideTradrSubTab("listings")}>Following</button>
                        <button type="button" className="secondary-button" onClick={() => openDealFinderModal()}>Check Deal</button>
                        <button type="button" className="secondary-button" onClick={openWhatDidISee}>Add Scout Sighting</button>
                        <button type="button" className="secondary-button" onClick={clearCatalogSearch}>Clear</button>
                      </div>
                      <Field label="Product Group">
                        <select value={catalogKindFilter} onChange={(event) => switchCatalogKindFilter(event.target.value)}>
                          <option value="All">All</option>
                          <option value="card">Cards</option>
                          <option value="sealed">Sealed</option>
                          <option value="other">Other</option>
                        </select>
                      </Field>
                    <Field label="Fair Price Badge">
                        <select value={marketCatalogDealFilter} onChange={(event) => setMarketCatalogDealFilter(event.target.value)}>
                          {MARKET_CATALOG_DEAL_FILTERS.map((filter) => (
                            <option key={filter.value} value={filter.value}>{filter.label}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Set / Expansion">
                        <select value={catalogSetFilter} onChange={(e) => setCatalogSetFilter(e.target.value)}>
                          {catalogSetOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </Field>
                      <Field label="Product Type">
                        <select value={catalogTypeFilter} onChange={(e) => setCatalogTypeFilter(e.target.value)}>
                          {catalogTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </Field>
                      <Field label="Rarity">
                        <select value={catalogRarityFilter} onChange={(e) => setCatalogRarityFilter(e.target.value)}>
                          {catalogRarityOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </Field>
                      <Field label="Image / Price">
                        <select value={catalogDataFilter} onChange={(e) => setCatalogDataFilter(e.target.value)}>
                          <option>All</option>
                          <option>Has market price</option>
                          <option>Has image</option>
                            {adminEditModeActive ? <option>Missing price</option> : null}
                        </select>
                      </Field>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          if (adminEditModeActive) {
                            setActiveTab("catalog");
                            setFeatureSectionsOpen((current) => ({ ...current, catalog_manual: true }));
                            return;
                          }
                          submitUniversalSuggestion({
                            suggestionType: SUGGESTION_TYPES.ADD_MISSING_CATALOG_PRODUCT,
                            targetTable: "catalog_items",
                            submittedData: { searchTerm: catalogSearch, productType: catalogTypeFilter, setName: catalogSetFilter },
                            notes: "User suggested a missing catalog product from Market Watch search.",
                            source: "tidetradr-search",
                          });
                        }}
                      >
                        {adminEditModeActive ? "Add Catalog Item" : "Request Missing Item"}
                      </button>
                    </div>
                  ) : null}

                  {(catalogSearchHasRun || supabaseCatalogStatus.loading) ? (
                    <details className="market-search-source-note">
                      <summary>Search source</summary>
                      <p>Search runs against Supabase with pagination. It does not load the full 52,000+ product catalog into the browser.</p>
                    </details>
                  ) : null}
                  {supabaseCatalogStatus.message ? <p className="compact-subtitle market-status-message">{supabaseCatalogStatus.message}</p> : null}
                  {supabaseCatalogStatus.error ? (
                    <div className="market-state-card market-state-card--error" role="status">
                      <span className="trust-badge trust-badge--secure">Data check</span>
                      <h3>Market data check failed.</h3>
                      <p>{supabaseCatalogStatus.error}</p>
                      <p>Try the search again, add the item to Vault for review, or ask Ember for help interpreting weak data.</p>
                      <div className="quick-actions market-empty-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setSupabaseCatalogStatus((current) => ({ ...current, error: "", message: "" }));
                            submitCatalogSearch();
                          }}
                        >
                          Try Search Again
                        </button>
                        <button type="button" className="secondary-button" onClick={() => openProductAddFlow({
                          source: "market-error-vault",
                          seed: {
                            initialStep: "item",
                            itemName: catalogEmptyTerm || catalogSearch,
                            catalogSearchQuery: catalogEmptyTerm || catalogSearch,
                            destinations: destinationDefaults({ vault: true }),
                            notes: "Vault fallback from Market error state.",
                          },
                        })}>Add to Vault review</button>
                        <button type="button" className="secondary-button" onClick={() => setEmberAssistOpen(true)}>Ask Ember</button>
                      </div>
                    </div>
                  ) : null}
                  {!supabaseCatalogStatus.error && supabaseCatalogStatus.usedFallback ? (
                    <div className="market-state-card market-state-card--error" role="status">
                      <span className="trust-badge trust-badge--secure">Fallback mode</span>
                      <h3>Market search is using fallback data.</h3>
                      <p>{supabaseCatalogStatus.message || "Live catalog data was not available, so Market is showing safer fallback results."}</p>
                      <p>Freshness and source strength may be limited. No checkout or stock guarantee is implied.</p>
                      <div className="quick-actions market-empty-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setSupabaseCatalogStatus((current) => ({ ...current, message: "", usedFallback: false }));
                            submitCatalogSearch();
                          }}
                        >
                          Try Search Again
                        </button>
                        <button type="button" className="secondary-button" onClick={() => openProductAddFlow({
                          source: "market-fallback-vault",
                          seed: {
                            initialStep: "item",
                            itemName: catalogEmptyTerm || catalogSearch,
                            catalogSearchQuery: catalogEmptyTerm || catalogSearch,
                            destinations: destinationDefaults({ vault: true }),
                            notes: "Vault fallback from Market fallback state.",
                          },
                        })}>Add to Vault review</button>
                        <button type="button" className="secondary-button" onClick={() => setEmberAssistOpen(true)}>Ask Ember</button>
                      </div>
                    </div>
                  ) : null}
                  {supabaseCatalogStatus.exactBarcodeMiss ? <p className="compact-subtitle">No match yet. You can add this product to the catalog or try a name search.</p> : null}
                  {catalogSearchHasRun && !supabaseCatalogStatus.loading && supabaseCatalogStatus.coverageWarning ? (
                    <div className="catalog-coverage-warning">
                      <div>
                        <strong>
                          {supabaseCatalogStatus.coverageWarning.sealedCount > 0
                            ? `Only ${supabaseCatalogStatus.coverageWarning.sealedCount} sealed product${supabaseCatalogStatus.coverageWarning.sealedCount === 1 ? "" : "s"} found for ${supabaseCatalogStatus.coverageWarning.setName}.`
                            : `No sealed products from ${supabaseCatalogStatus.coverageWarning.setName} are in the catalog yet.`}
                        </strong>
                        <p>
                          {supabaseCatalogStatus.coverageWarning.sealedCount > 0
                            ? "More sealed products may be missing from the catalog."
                            : "Cards may exist for this set, but sealed product coverage still needs review."}
                        </p>
                        {supabaseCatalogStatus.coverageWarning.missingLikelyCategories?.length ? (
                          <p>May be missing: {supabaseCatalogStatus.coverageWarning.missingLikelyCategories.join(", ")}.</p>
                        ) : null}
                      </div>
                      <div className="quick-actions">
                        <button type="button" onClick={() => switchCatalogKindFilter("All")}>Search All</button>
                        <button type="button" className="secondary-button" onClick={() => switchCatalogKindFilter("card")}>View Cards</button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => suggestMissingCatalogProductFromSearch({
                            setName: supabaseCatalogStatus.coverageWarning.setName,
                            searchTerm: catalogEmptyTerm || catalogSearch,
                            missingLikelyCategories: supabaseCatalogStatus.coverageWarning.missingLikelyCategories,
                            notes: "Suggested from coverage warning.",
                            source: "tidetradr-sealed-coverage-warning",
                          })}
                        >
                          {adminEditModeActive ? "Add Catalog Item" : "Request Missing Item"}
                        </button>
                      </div>
                      {adminEditModeActive ? (
                        <details className="catalog-coverage-diagnostics">
                          <summary>Coverage diagnostics</summary>
                          <p>Searched aliases: {supabaseCatalogStatus.coverageWarning.searchedAliases.join(", ") || "none"}</p>
                          <p>Fetched rows: {supabaseCatalogStatus.coverageWarning.rawFetchedCount}; sealed results: {supabaseCatalogStatus.coverageWarning.resultCount}; estimated total: {supabaseCatalogStatus.coverageWarning.rawTotalCount ?? "unknown"}</p>
                          <p>Found categories: {supabaseCatalogStatus.coverageWarning.foundCategories.join(", ") || "none"}</p>
                          <p>Expected categories checked: {supabaseCatalogStatus.coverageWarning.expectedCategories.join(", ")}</p>
                          <p>Sealed-specific fetch: {supabaseCatalogStatus.coverageWarning.sealedFetchRan ? "yes" : "no"}</p>
                          <p>Active filters: {supabaseCatalogStatus.coverageWarning.activeFilters.join(", ") || "none"}</p>
                        </details>
                      ) : null}
                    </div>
                  ) : null}

                  {!catalogSearchHasRun && !supabaseCatalogStatus.loading ? (
                    <div className="small-empty-state tidetradr-search-prompt market-empty-state">
                      <EtMockupEmptyState
                        title="Search a card, set, sealed product, UPC, or SKU."
                        detail="Market Watch shows fair-value context and labels weak data honestly. No checkout or stock guarantee is connected."
                      />
                      <div className="market-empty-examples" aria-label="Market search examples">
                        <span>Card names</span>
                        <span>Set names</span>
                        <span>Sealed products</span>
                        <span>UPC / SKU</span>
                      </div>
                    </div>
                  ) : null}

                  {supabaseCatalogStatus.loading && tideTradrCatalogResults.length === 0 && marketSetSearchResults.length === 0 ? (
                    <div className="catalog-results-loading" aria-label="Loading catalog results">
                      <div className="market-state-card market-state-card--loading" role="status">
                        <span className="trust-badge trust-badge--secure">Checking fair value</span>
                        <h3>Checking fair value</h3>
                        <p>Market searches known catalog data and labels weak sources. It is not an auto-buy dashboard.</p>
                      </div>
                      <div className="catalog-results-list catalog-results-grid">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <div className="catalog-result-card catalog-result-skeleton" key={`catalog-loading-${index}`}>
                            <div className="catalog-thumb" />
                            <span />
                            <strong />
                            <em />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {catalogSearchHasRun && !supabaseCatalogStatus.loading && tideTradrCatalogResults.length === 0 && marketSetSearchResults.length === 0 ? (
                    <div className="empty-state market-empty-state">
                      <h3>No matches found{catalogEmptyTerm ? ` for "${catalogEmptyTerm}"` : ""}.</h3>
                      <p>
                        {supabaseCatalogStatus.exactBarcodeMiss
                          ? "No match yet. You can add this product to the catalog or try a name search."
                          : catalogAlternateKindLabels.length
                          ? `Matches exist in ${catalogAlternateKindLabels.join(" / ")}. Switch modes or clear active filters to see them.`
                          : "No matches yet. Try an exact card name, set name, sealed product, UPC, SKU, or simpler collector term."}
                      </p>
                      <div className="quick-actions market-empty-actions">
                        <button type="button" className="secondary-button" onClick={() => {
                          setCatalogSearch(catalogEmptyTerm || catalogSearch);
                          setCatalogSearchHasRun(false);
                          setSupabaseCatalogStatus((current) => ({ ...current, error: "", message: "" }));
                        }}>
                          Search Again
                        </button>
                        <button type="button" onClick={() => openProductAddFlow({
                          source: "market-result",
                          seed: {
                            initialStep: "item",
                            itemName: catalogEmptyTerm || catalogSearch,
                            catalogSearchQuery: catalogEmptyTerm || catalogSearch,
                            destinations: destinationDefaults({ vault: true }),
                            notes: "Manual entry from Market Watch no-results fallback.",
                          },
                        })}>
                          Manual Entry
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (adminEditModeActive) {
                              setActiveTab("catalog");
                              setFeatureSectionsOpen((current) => ({ ...current, catalog_manual: true }));
                              return;
                            }
                            submitUniversalSuggestion({
                              suggestionType: SUGGESTION_TYPES.ADD_MISSING_CATALOG_PRODUCT,
                              targetTable: "catalog_items",
                              submittedData: { searchTerm: catalogEmptyTerm || catalogSearch, productType: catalogTypeFilter, setName: catalogSetFilter },
                              notes: "User suggested a missing catalog product from Market Watch empty search.",
                              source: "tidetradr-empty-search",
                            });
                          }}
                        >
                          {adminEditModeActive ? "Add Catalog Item" : "Request Missing Item"}
                        </button>
                        <button type="button" className="secondary-button" onClick={clearCatalogSearch}>Clear search</button>
                        {catalogKindFilter !== "All" && catalogAlternateKindLabels.length ? (
                          <button type="button" className="secondary-button" onClick={() => switchCatalogKindFilter("All")}>Search All</button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {catalogSearchHasRun && !supabaseCatalogStatus.loading && marketSetSearchResults.length ? (
                    <section className="market-set-results" aria-label="Set matches">
                      <div className="catalog-result-group-header">
                        <h3>Set matches</h3>
                        <span className="status-badge">{marketSetSearchResults.length}</span>
                      </div>
                      <div className="market-set-result-grid">
                        {marketSetSearchResults.map((set) => (
                          <article className="market-set-card" key={`market-set-${set.key || set.id}`}>
                            <div>
                              <span>{set.series || "Pokemon set"}</span>
                              <h3>{set.name}</h3>
                              <p>
                                {[
                                  set.releaseDate ? `Released ${shortDate(set.releaseDate)}` : "",
                                  set.checklistAvailable ? `${set.totalCards || set.catalogCards.length} checklist cards` : "Full checklist not available yet",
                                  set.trackedSealedCount || set.sealedProducts.length ? `${set.trackedSealedCount || set.sealedProducts.length} sealed tracked` : "",
                                ].filter(Boolean).join(" - ")}
                              </p>
                            </div>
                            <div className="market-set-card-progress">
                              <div className="vault-progress-track" aria-label={`${set.name} completion`}>
                                <i style={{ width: `${set.percent ?? 0}%` }} />
                              </div>
                              <span>{set.checklistAvailable ? set.completionLabel : `${set.ownedCount || 0} owned - ${set.checklistStatus}`}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab("vault");
                                setVaultSubTab("sets");
                                openVaultSetSummary(set);
                              }}
                            >
                              View Set
                            </button>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}

                    {catalogSearchHasRun && tideTradrCatalogResults.length > 0 ? (
                      <div className="catalog-result-groups">
                        {tideTradrCatalogResultGroups.map((group, groupIndex) => (
                          <section className="catalog-result-group" key={group.key}>
                            {catalogKindFilter === "All" ? (
                              <div className="catalog-result-group-header">
                                <h3>{group.title}</h3>
                                <span className="status-badge">{group.items.length}</span>
                              </div>
                            ) : null}
                            <div className={`catalog-results-list catalog-results-${catalogViewMode}`}>
                              {group.items.map((product, productIndex) => renderTideTradrCatalogResultCard(product, { topResult: groupIndex === 0 && productIndex === 0 }))}
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : null}

                  {catalogSearchHasRun && tideTradrCatalogResults.length > 0 ? (
                    <PaginationControls
                      label="Results"
                      page={supabaseCatalogStatus.page || 1}
                      pageCount={tideTradrCatalogPageCount || (supabaseCatalogStatus.hasMore ? (supabaseCatalogStatus.page || 1) + 1 : 1)}
                      totalCount={supabaseCatalogStatus.totalCount ?? tideTradrCatalogResults.length}
                      pageSize={supabaseCatalogStatus.pageSize || catalogPageSize}
                      pageSizeOptions={CATALOG_PAGE_SIZE_OPTIONS}
                      onPageChange={goToCatalogPage}
                      onPageSizeChange={updateCatalogPageSize}
                      disabled={supabaseCatalogStatus.loading}
                      compact
                    />
                  ) : null}
                </EtMockupSectionCard>

                {renderMarketPriceMemorySection()}
                {renderItemCompareTableSection()}
                {renderWishlistIsoPlanningSection({ surface: "market", compact: true })}

                <section className="feature-dropdown-stack">


                </section>
              </>
            )}
      </div>
    </EtMockupPageShell>
  );
}
