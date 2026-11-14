import { PrivateStorageImage } from "../components/PrivateReceipt.jsx";
import { useContext, useId, useRef, useState } from "react";
import { ExperiencePresentationContext } from "../utils/experiencePresentationContext";
import "./market-search-results.css";
import { buildManualMarketDraft, formatMarketQuoteValue, getMarketQuoteContext, getMarketResultMatchLabel } from "../utils/marketSearchPresentation.mjs";
import {
  CommandMetricGrid,
  CommandBoardV4,
} from "../components/command-system";

export default function MarketPage(props) {
  // MUST-11 (Nov 13): collectors see search, results and the watch list; the
  // decision rail, metric grid and feature-system cards stay for admins.
  const fullBoard = Boolean(useContext(ExperiencePresentationContext)?.showAdminTools);
  const {
    catalogImage,
    catalogSearch,
    catalogSearchHasRun,
    submittedCatalogSearch = catalogSearch,
    catalogTitle,
    destinationDefaults,
    getTideTradrMarketInfo,
    goToCatalogPage,
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
    applyCatalogProductToDeal,
    workspaceWatchlist,
  } = props;
  const searchInputRef = useRef(null);
  const searchStatusId = useId();
  const marketResultCount = Math.max(0, Number(supabaseCatalogStatus.totalCount ?? tideTradrCatalogResults.length) || 0);
  const submittedQuery = String(submittedCatalogSearch || "").trim();
  const currentPage = Math.max(1, Number(supabaseCatalogStatus.page) || 1);
  const resultKey = JSON.stringify([catalogSearchHasRun, submittedQuery, currentPage]);
  const [preview, setPreview] = useState({ key: "", count: 4 });
  const visibleResultCount = preview.key === resultKey ? preview.count : 4;
  const marketFocusSearch = () => {
    searchInputRef.current?.focus();
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
    { key: "forge", icon: "forge", label: "Business", title: "Trade decisions", detail: "Fairness and records", action: () => openExchangeSection?.("forge") },
    { key: "vault", icon: "vault", label: "Vault", title: "Save item", detail: "Track ownership", action: () => openProductAddFlow({ source: "market-route-vault", seed: { destinations: destinationDefaults({ vault: true }) } }) },
  ];
  const marketResultSource = catalogSearchHasRun ? tideTradrCatalogResults : workspaceWatchlist;
  const marketPreviewItems = marketResultSource.slice(0, visibleResultCount);
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
    return formatMarketQuoteValue(product, getTideTradrMarketInfo(product));
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
        title={fullBoard ? "Market Command Center" : "Market"}
        description={fullBoard ? "Search products, compare fair-value context, manage watch targets, and move researched items into Vault or Exchange without checkout, stock promises, or seller matching." : "Search a card or product, see its price range, and watch the ones you care about."}
        primaryAction={{ label: "Search Market", icon: "search", onClick: marketFocusSearch }}
        secondaryActions={[
          { label: "Check Deal", icon: "market", onClick: openDealFinderModal },
          { label: "Watch Center", icon: "bell", onClick: () => setTideTradrSubTab("watch") },
        ]}
        utilityActions={[
          { label: "Search the app", icon: "search", onClick: () => openCompassSearch?.("market_compass") },
          { label: "Notifications", icon: "bell", onClick: () => openBeaconCenter?.("market_beacon") },
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
                <p>Search the Pokémon catalog for cards, sealed products, sets, UPCs, or SKUs. Other games can be tracked manually in Collection; live catalog and price lookup for those games are not connected.</p>
              </div>
              <strong>{catalogSearchHasRun ? `${marketResultCount} results` : "Ready"}</strong>
            </div>

            <form
              className="market-v4-search-form"
              aria-label="Search the Market catalog"
              aria-busy={Boolean(supabaseCatalogStatus.loading)}
              onSubmit={(event) => {
                event.preventDefault();
                submitCatalogSearch();
              }}
            >
              <label>
                <span>Product, set, UPC, or SKU</span>
                <input
                  ref={searchInputRef}
                  value={catalogSearch}
                  onChange={(event) => setCatalogSearch(event.target.value)}
                  placeholder="Prismatic Evolutions Booster Bundle"
                  aria-label="Search Market"
                  aria-describedby={searchStatusId}
                  maxLength={140}
                  enterKeyHint="search"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </label>
              <button type="submit" disabled={Boolean(supabaseCatalogStatus.loading) || !String(catalogSearch || "").trim()}>{supabaseCatalogStatus.loading ? "Searching…" : "Search Market"}</button>
            </form>
            <p id={searchStatusId} role="status" aria-live="polite" aria-atomic="true">
              {supabaseCatalogStatus.loading ? "Searching the catalog…" : catalogSearchHasRun ? `${marketResultCount} catalog result${marketResultCount === 1 ? "" : "s"}${submittedQuery ? ` for “${submittedQuery}”` : ""}.` : "Search by card name and number, set, UPC or SKU."}
            </p>

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
              ) : supabaseCatalogStatus.error ? (
                <article className="market-v4-empty-state" role="alert">
                  <strong>Catalog search could not finish.</strong>
                  <p>Your search is preserved. Try again or edit the search before continuing.</p>
                  <button type="button" onClick={() => submitCatalogSearch()}>Retry search</button>
                </article>
              ) : marketPreviewItems.length ? (
                marketPreviewItems.map((product, index) => {
                  const context = getMarketQuoteContext(product, getTideTradrMarketInfo(product));
                  return (
                  <article className="market-v4-result-row" key={product.id || product.productId || product.name || `market-product-${index}`}>
                    <div className="market-v4-thumb">
                      {catalogImage(product) ? (
                        <PrivateStorageImage src={catalogImage(product)} alt="" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    <div>
                      <span>{catalogSearchHasRun ? getMarketResultMatchLabel(submittedQuery, product) : "Watched item"}</span>
                      <strong>{marketProductTitle(product)}</strong>
                      <small>{marketProductSubtitle(product)}</small>
                      {catalogSearchHasRun ? <small>Confirm the set, language, condition and printing before using a price.</small> : null}
                    </div>
                    <div className="market-v4-result-value">
                      <b>{formatMarketValue(product)}</b>
                      <small>{context.source}</small>
                      <small className={context.stale ? "market-v4-result-stale" : undefined}>{context.asOf ? context.stale ? `Old price — last checked ${new Date(context.asOf).toLocaleDateString()}${context.ageDays != null ? ` (${context.ageDays} days ago)` : ""}. May be out of date.` : `As of ${new Date(context.asOf).toLocaleString()}` : "Price date not supplied"}</small>
                      <small>{context.currency || "Currency not supplied"} · {context.condition} · {context.printing}</small>
                      {formatMarketValue(product) === "Value unknown" ? <small>Open Details to review sources or enter a manual value.</small> : null}
                    </div>
                    <div className="market-v4-result-actions">
                      <button type="button" onClick={() => openCatalogDetails(product.id || product.productId)}>Details</button>
                      <button type="button" onClick={() => applyCatalogProductToDeal(product.productId || product.id)}>Compare</button>
                      <button type="button" onClick={() => openMarketProductAddFlow(product, "market-result", { defaultDestination: "vault" })}>Add to Vault</button>
                    </div>
                  </article>
                  );
                })
              ) : catalogSearchHasRun ? (
                <article className="market-v4-empty-state">
                  <strong>{submittedQuery ? `No catalog matches for “${submittedQuery}”.` : "No items match these filters."}</strong>
                  <p>Try a card name and collector number, a set name, UPC or SKU. Fewer words may help. You can also start a manual item without creating a catalog match or price.</p>
                  <button type="button" onClick={marketFocusSearch}>Edit search</button>
                  <button type="button" onClick={() => openProductAddFlow({ source: "market-no-results", seed: { ...buildManualMarketDraft(catalogSearch), manualEntry: true, destinations: destinationDefaults({ vault: true }) } })}>Add item manually</button>
                </article>
              ) : (
                <article className="market-v4-empty-state">
                  <strong>Search for a card or product to start.</strong>
                  <p>Try a name, a set, or a card number like 4/102. Prices here are saved estimates, not offers.</p>
                  <button type="button" onClick={marketFocusSearch}>Focus Search</button>
                </article>
              )}
            </div>

            {!supabaseCatalogStatus.loading && !supabaseCatalogStatus.error && marketPreviewItems.length ? (
              <nav className="market-result-navigation" aria-label="Market result navigation">
                <p>Showing {marketPreviewItems.length} of {marketResultSource.length} loaded {catalogSearchHasRun ? "results" : "watched items"}{catalogSearchHasRun ? ` on page ${currentPage}` : ""}.</p>
                {marketResultSource.length > 4 ? <button type="button" onClick={() => setPreview({ key: resultKey, count: visibleResultCount >= marketResultSource.length ? 4 : Math.min(marketResultSource.length, visibleResultCount + 12) })}>{marketPreviewItems.length < marketResultSource.length ? "Show more results" : "Show fewer results"}</button> : null}
                {catalogSearchHasRun && goToCatalogPage && (currentPage > 1 || supabaseCatalogStatus.hasMore) ? <>
                  <button type="button" disabled={currentPage <= 1} onClick={() => goToCatalogPage(currentPage - 1)}>Previous result page</button>
                  <button type="button" disabled={!supabaseCatalogStatus.hasMore} onClick={() => goToCatalogPage(currentPage + 1)}>Next result page</button>
                </> : null}
              </nav>
            ) : null}

            {fullBoard ? <div className="market-v4-value-ribbon" aria-label="Value range ribbon">
              <span>Low: Unknown</span>
              <span>Market: Unknown</span>
              <span>High: Unknown</span>
              <strong>Choose a product to compare price sources.</strong>
            </div> : null}
          </section>

          {fullBoard ? <aside className="market-v4-side-rail" aria-label="Market decision rail">
            <article>
              <span>What should I do next?</span>
              <h3>Set a target before chasing the drop.</h3>
              <p>Watch the product, compare fair range, and save the decision to Vault if it matters to your collection.</p>
              <button type="button" className="command-board-v4-primary-action" onClick={() => setTideTradrSubTab("watch")}>Open Watch Center</button>
            </article>
            <article>
              <span>Liquidity</span>
              <h3>Demand unknown</h3>
              <p>Verified sales and sell-through data are needed to assess demand. Active asking prices do not show how quickly an item sells.</p>
            </article>
            <article>
              <span>Safety model</span>
              <div className="market-v4-rule-list">
                {marketSafetyRows.map((row) => <small key={row}>{row}</small>)}
              </div>
            </article>
          </aside> : null}

          {fullBoard ? <CommandMetricGrid items={marketMetricItems} className="market-v4-metrics" ariaLabel="Market intelligence metrics" /> : null}

          {fullBoard ? <section className="market-v4-lower-grid" aria-label="Market feature system">
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
          </section> : null}
        </div>
      </CommandBoardV4>
    </div>
  );

}
