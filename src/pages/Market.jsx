import {
  CommandMetricGrid,
  CommandBoardV4,
} from "../components/command-system";

export default function MarketPage(props) {
  const {
    catalogImage,
    catalogSearch,
    catalogSearchHasRun,
    catalogTitle,
    destinationDefaults,
    getTideTradrMarketInfo,
    money,
    openBeaconCenter,
    openCatalogDetails,
    openCompassSearch,
    openDealFinderModal,
    openExchangeSection,
    openMarketProductAddFlow,
    openProductAddFlow,
    phase2RecentDeals,
    setCatalogSearch,
    setTideTradrSubTab,
    submitCatalogSearch,
    supabaseCatalogStatus,
    tideTradrCatalogResults,
    useCatalogProductInDeal,
    workspaceWatchlist,
  } = props;
  const marketResultCount = Number(supabaseCatalogStatus.totalCount ?? tideTradrCatalogResults.length ?? 0);
  const marketFocusSearch = () => {
    if (typeof document !== "undefined") {
      document.querySelector(".market-v4-search-form input, .market-smart-search input, .market-search-form input")?.focus?.();
    }
  };
  const marketCommandStatus = [
    {
      key: "watch",
      icon: "bell",
      label: "Watch Center",
      value: workspaceWatchlist.length,
      detail: "Price and product alerts",
      action: () => setTideTradrSubTab("watch"),
    },
    {
      key: "results",
      icon: "search",
      label: "Search",
      value: catalogSearchHasRun ? marketResultCount : "Ready",
      detail: catalogSearchHasRun ? "Catalog results" : "Cards, sets, UPCs",
      action: marketFocusSearch,
    },
    {
      key: "recent",
      icon: "data",
      label: "Recent",
      value: phase2RecentDeals.length || "Ready",
      detail: "Research checks",
      action: () => setTideTradrSubTab("recent"),
    },
    {
      key: "confidence",
      icon: "market",
      label: "Confidence",
      value: supabaseCatalogStatus.loading ? "Checking" : supabaseCatalogStatus.usedFallback ? "Fallback" : "Labeled",
      detail: "No guaranteed price",
    },
    {
      key: "commerce",
      icon: "help",
      label: "Checkout",
      value: "Off",
      detail: "Research only",
    },
  ];
  const marketCommandPlan = [
    { key: "search", icon: "search", label: "Search product", detail: "Card, set, sealed, UPC", action: marketFocusSearch },
    { key: "deal", icon: "market", label: "Check deal", detail: "Ask vs fair range", action: openDealFinderModal },
    { key: "watch", icon: "bell", label: "Watch target", detail: "Price and restock alert", action: () => setTideTradrSubTab("watch") },
    { key: "add", icon: "vault", label: "Add to Vault", detail: "Save for review", action: () => openProductAddFlow({ source: "market-command-board", seed: { destinations: destinationDefaults({ vault: true }) } }) },
  ];
  const marketCommandRoutes = [
    { key: "market", icon: "market", label: "Market", title: "Price research", detail: "Search and comps", active: true, action: () => setTideTradrSubTab("overview") },
    { key: "watch", icon: "bell", label: "Watch", title: "Watch Center", detail: `${workspaceWatchlist.length} targets`, action: () => setTideTradrSubTab("watch") },
    { key: "compare", icon: "data", label: "Compare", title: "Product Compare", detail: "Hold, buy, sell", action: openDealFinderModal },
    { key: "harbor", icon: "exchange", label: "Harbor", title: "Selling desk", detail: "Listings and proof", action: () => openExchangeSection?.("harbor") },
    { key: "forge", icon: "forge", label: "Forge", title: "Trade decisions", detail: "Fairness and records", action: () => openExchangeSection?.("forge") },
    { key: "vault", icon: "vault", label: "Vault", title: "Save item", detail: "Track ownership", action: () => openProductAddFlow({ source: "market-route-vault", seed: { destinations: destinationDefaults({ vault: true }) } }) },
  ];
  const marketResultSource = tideTradrCatalogResults.length ? tideTradrCatalogResults : workspaceWatchlist;
  const marketPreviewItems = marketResultSource.slice(0, 4);
  const marketMetricItems = [
    { key: "watch", label: "Watch targets", value: workspaceWatchlist.length || "Ready", detail: "Price and restock signals" },
    { key: "results", label: "Search results", value: catalogSearchHasRun ? marketResultCount : "Search first", detail: catalogSearchHasRun ? "Current catalog query" : "Cards, sets, sealed, UPC" },
    { key: "recent", label: "Recent comps", value: phase2RecentDeals.length || "None", detail: "Saved local checks" },
    { key: "confidence", label: "Data confidence", value: supabaseCatalogStatus.usedFallback ? "Fallback" : "Labeled", detail: "Source strength visible" },
  ];
  const marketDecisionCards = [
    {
      key: "compare",
      title: "Product Compare",
      detail: "Compare sealed, singles, raw vs graded, hold vs sell, and purchase options before acting.",
      status: "Decision support",
      action: "Open Compare",
      onClick: openDealFinderModal,
    },
    {
      key: "alerts",
      title: "Price Alerts",
      detail: "Watch target price, current value, alert history, and why Beacon fired.",
      status: `${workspaceWatchlist.length} watched`,
      action: "Watch Center",
      onClick: () => setTideTradrSubTab("watch"),
    },
    {
      key: "comps",
      title: "Recent Comps",
      detail: "Keep recent values, source notes, confidence, and manual price memory in one place.",
      status: phase2RecentDeals.length ? `${phase2RecentDeals.length} checks` : "Ready",
      action: "Review Comps",
      onClick: () => setTideTradrSubTab("recent"),
    },
    {
      key: "safety",
      title: "Buying Safety",
      detail: "No checkout, no seller matching, no guaranteed stock, and no investment advice in Market.",
      status: "Research only",
      action: "Add to Vault",
      onClick: () => openProductAddFlow({ source: "market-safety-vault", seed: { destinations: destinationDefaults({ vault: true }) } }),
    },
  ];
  const marketSafetyRows = [
    "Fair-value context, not a guaranteed live price",
    "No checkout or payment processing in this beta surface",
    "No automatic seller matching or off-platform pressure",
    "Weak or fallback data is labeled before decisions",
  ];
  const formatMarketValue = (product) => {
    const info = getTideTradrMarketInfo(product);
    const value = info?.currentMarketValue ?? product.marketValue ?? product.marketPrice ?? product.price ?? product.msrp;
    return Number(value) > 0 ? money(value) : "No value";
  };
  const marketProductTitle = (product) => {
    try {
      return catalogTitle(product);
    } catch {
      return product.name || product.productName || "Watched product";
    }
  };
  const marketProductSubtitle = (product) => [product.setName || product.expansion || "No set", product.productType || product.kind || "Product"].filter(Boolean).join(" | ");

  return (
    <div className="market-command-only-route" aria-label="Market price research command center">
      <CommandBoardV4
        accent="market"
        className="market-command-board"
        ariaLabel="Market Command Center"
        label="Market"
        title="Market Command Center"
        description="Search products, compare fair-value context, manage watch targets, and move researched items into Vault or Exchange without checkout, stock promises, or seller matching."
        primaryAction={{ label: "Search Market", icon: "search", onClick: marketFocusSearch }}
        secondaryActions={[
          { label: "Check Deal", icon: "market", onClick: openDealFinderModal },
          { label: "Watch Center", icon: "bell", onClick: () => setTideTradrSubTab("watch") },
        ]}
        utilityActions={[
          { label: "Compass", icon: "search", onClick: () => openCompassSearch?.("market_compass") },
          { label: "Beacon", icon: "bell", onClick: () => openBeaconCenter?.("market_beacon") },
        ]}
        statusItems={marketCommandStatus}
        plan={{
          label: "Market Plan",
          title: "Research before buying, selling, holding, or trading",
          items: marketCommandPlan,
          actions: [
            { label: "Search", icon: "search", onClick: marketFocusSearch },
            { label: "Review Deal", icon: "market", onClick: openDealFinderModal },
          ],
        }}
        routes={marketCommandRoutes}
      >
        <div className="market-v4-command-content">
          <section className="market-v4-search-panel" aria-label="Market product search">
            <div className="market-v4-panel-heading">
              <div>
                <span>Price discovery</span>
                <h2>Market Product Search</h2>
                <p>Search cards, sealed products, sets, UPCs, or SKUs. Results stay framed as research until the app has real checkout, disputes, and payment systems.</p>
              </div>
              <strong>{catalogSearchHasRun ? `${marketResultCount} results` : "Ready"}</strong>
            </div>

            <form
              className="market-v4-search-form"
              onSubmit={(event) => {
                event.preventDefault();
                submitCatalogSearch();
              }}
            >
              <label>
                <span>Product, set, UPC, or SKU</span>
                <input
                  value={catalogSearch}
                  onChange={(event) => setCatalogSearch(event.target.value)}
                  placeholder="Prismatic Evolutions Booster Bundle"
                  aria-label="Search Market"
                />
              </label>
              <button type="submit">Search Market</button>
            </form>

            <div className="market-v4-result-list" aria-label="Market result preview">
              {supabaseCatalogStatus.loading ? (
                <article className="market-v4-result-row">
                  <div className="market-v4-thumb is-loading" />
                  <div>
                    <span>Checking fair value</span>
                    <strong>Searching catalog and saved context</strong>
                    <small>Weak sources stay labeled before action.</small>
                  </div>
                  <b>Loading</b>
                </article>
              ) : marketPreviewItems.length ? (
                marketPreviewItems.map((product, index) => (
                  <article className="market-v4-result-row" key={product.id || product.productId || product.name || `market-product-${index}`}>
                    <div className="market-v4-thumb">
                      {catalogImage(product) ? (
                        <img src={catalogImage(product)} alt="" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    <div>
                      <span>{index === 0 ? "Top match" : "Research item"}</span>
                      <strong>{marketProductTitle(product)}</strong>
                      <small>{marketProductSubtitle(product)}</small>
                    </div>
                    <div className="market-v4-result-value">
                      <b>{formatMarketValue(product)}</b>
                      <small>{product.marketStatus || product.sourceName || "Confidence labeled"}</small>
                    </div>
                    <div className="market-v4-result-actions">
                      <button type="button" onClick={() => openCatalogDetails(product.id || product.productId)}>Details</button>
                      <button type="button" onClick={() => useCatalogProductInDeal(product.productId || product.id)}>Compare</button>
                      <button type="button" onClick={() => openMarketProductAddFlow(product, "market-result", { defaultDestination: "vault" })}>Add to Vault</button>
                    </div>
                  </article>
                ))
              ) : (
                <article className="market-v4-empty-state">
                  <strong>Search first, then decide.</strong>
                  <p>Market should feel like a collector research desk: range, liquidity, confidence, watch targets, and safe next steps before money moves.</p>
                  <button type="button" onClick={marketFocusSearch}>Focus Search</button>
                </article>
              )}
            </div>

            <div className="market-v4-value-ribbon" aria-label="Value range ribbon">
              <span>Low $42</span>
              <span>Fair $58</span>
              <span>High $75</span>
              <strong>Current context: $61</strong>
            </div>
          </section>

          <aside className="market-v4-side-rail" aria-label="Market decision rail">
            <article>
              <span>What should I do next?</span>
              <h3>Set a target before chasing the drop.</h3>
              <p>Watch the product, compare fair range, and save the decision to Vault if it matters to your collection.</p>
              <button type="button" className="command-board-v4-primary-action" onClick={() => setTideTradrSubTab("watch")}>Open Watch Center</button>
            </article>
            <article>
              <span>Liquidity</span>
              <h3>Medium demand</h3>
              <p>Good for collecting or watching; avoid treating weak data as a guaranteed sale price.</p>
              <div className="market-v4-liquidity-meter"><i style={{ width: "62%" }} /></div>
            </article>
            <article>
              <span>Safety model</span>
              <div className="market-v4-rule-list">
                {marketSafetyRows.map((row) => <small key={row}>{row}</small>)}
              </div>
            </article>
          </aside>

          <CommandMetricGrid items={marketMetricItems} className="market-v4-metrics" ariaLabel="Market intelligence metrics" />

          <section className="market-v4-lower-grid" aria-label="Market feature system">
            {marketDecisionCards.map((card) => (
              <article key={card.key}>
                <div className="market-v4-panel-heading compact">
                  <div>
                    <span>{card.status}</span>
                    <h3>{card.title}</h3>
                  </div>
                  <button type="button" onClick={card.onClick}>{card.action}</button>
                </div>
                <p>{card.detail}</p>
              </article>
            ))}
          </section>
        </div>
      </CommandBoardV4>
    </div>
  );

}
