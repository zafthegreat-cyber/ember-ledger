// Rendering is deferred; the owning App retains record state and action handlers.
export default function MarketSourceControlsContent({ scope, args = [] }) {
  const {
    AI_PRICE_DISCLAIMER,
    ActionReport,
    Field,
    MARKET_SOURCES,
    adminToolsVisible,
    cachedMarketPriceCount,
    catalogMarketPriceCount,
    catalogProducts,
    catalogTitle,
    failedMarketMatches,
    lastMarketSync,
    manualMarketForm,
    marketSyncMessage,
    missingMarketPriceItems,
    missingMsrpItems,
    needsMarketCheckItems,
    refreshMarketCatalog,
    refreshMarketWatchlist,
    refreshPinnedMarketWatch,
    saveManualMarketPrice,
    setManualMarketForm,
    startEditingItem,
    supabaseCatalogStatus,
  } = scope;

  function renderMarketSourceControls() {
    if (!adminToolsVisible) return null;
    return (
      <section className="settings-subsection marketplace-admin-review">
        <div className="compact-card-header">
          <div>
            <h3>Market Source Controls</h3>
            <p>Admin-only source status, sync actions, manual values, and market to-do items.</p>
          </div>
          <span className="status-badge">Admin only</span>
        </div>
        <div className="small-empty-state admin-only-note">
          <strong>Admin only.</strong>
          <span>Source credentials stay server-side; review import status before publishing shared market data.</span>
        </div>
        <div className="cards mini-cards">
          <div className="card"><p>Catalog Products</p><h2>{supabaseCatalogStatus.totalCount ?? catalogProducts.length}</h2></div>
          <div className="card"><p>Found Market Values</p><h2>{catalogMarketPriceCount}</h2></div>
          <div className="card"><p>Missing Market Prices</p><h2>{missingMarketPriceItems.length}</h2></div>
          <div className="card"><p>Needs Market Check</p><h2>{needsMarketCheckItems.length}</h2></div>
          <div className="card"><p>Cached Price Records</p><h2>{cachedMarketPriceCount}</h2></div>
          <div className="card"><p>Failed Matches</p><h2>{failedMarketMatches.length}</h2></div>
          <div className="card"><p>Last Sync</p><h2>{lastMarketSync === "Not synced yet" ? "None" : new Date(lastMarketSync).toLocaleDateString()}</h2></div>
          <div className="card"><p>Live API</p><h2>Unavailable</h2></div>
        </div>
        <p className="compact-subtitle">Market values are labeled Live, Cached, Manual, Estimated, or Unknown. Beta sync uses local/import-ready data unless a backend source is connected.</p>
        {marketSyncMessage ? <p className="compact-subtitle">{marketSyncMessage}</p> : null}
        <div className="quick-actions">
          <button type="button" onClick={() => refreshMarketCatalog("card")}>Review saved card prices</button>
          <button type="button" className="secondary-button" onClick={() => refreshMarketCatalog("sealed")}>Review saved product prices</button>
          <button type="button" className="secondary-button" onClick={refreshMarketWatchlist}>Refresh Watchlist</button>
          <button type="button" className="secondary-button" onClick={refreshPinnedMarketWatch}>Refresh Pinned Market Watch</button>
        </div>
        <details className="scout-score-guidelines">
          <summary>Manual Price Entry</summary>
          <form className="form market-price-form" onSubmit={saveManualMarketPrice}>
            <Field label="Catalog Item">
              <select value={manualMarketForm.catalogItemId} onChange={(event) => setManualMarketForm((current) => ({ ...current, catalogItemId: event.target.value }))}>
                <option value="">Choose item</option>
                {catalogProducts.map((product) => (
                  <option key={product.id} value={product.id}>{catalogTitle(product)}</option>
                ))}
              </select>
            </Field>
            <Field label="Market Price">
              <input type="number" step="0.01" value={manualMarketForm.marketPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, marketPrice: event.target.value }))} placeholder="Manual market value" />
            </Field>
            <Field label="Low / Mid / High">
              <div className="inline-input-grid">
                <input type="number" step="0.01" value={manualMarketForm.lowPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, lowPrice: event.target.value }))} placeholder="Low" />
                <input type="number" step="0.01" value={manualMarketForm.midPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, midPrice: event.target.value }))} placeholder="Mid" />
                <input type="number" step="0.01" value={manualMarketForm.highPrice} onChange={(event) => setManualMarketForm((current) => ({ ...current, highPrice: event.target.value }))} placeholder="High" />
              </div>
            </Field>
            <button type="submit">Save Manual Price</button>
          </form>
        </details>
        <details className="scout-score-guidelines">
          <summary>Market To-Do</summary>
          {needsMarketCheckItems.length || missingMarketPriceItems.length || missingMsrpItems.length ? (
            <>
              <ActionReport title="Needs Market Check" items={needsMarketCheckItems} button="Update Market" action={startEditingItem} />
              <ActionReport title="Missing Market Price" items={missingMarketPriceItems} button="Add Market Price" action={startEditingItem} />
              <ActionReport title="Missing MSRP" items={missingMsrpItems} button="Add MSRP" action={startEditingItem} />
            </>
          ) : (
            <div className="empty-state">
              <h3>No items need review</h3>
              <p>Market to-do items will appear here when catalog prices or MSRP fields need attention.</p>
            </div>
          )}
        </details>
        <div className="market-source-list">
          {MARKET_SOURCES.map((source) => (
            <div className="market-source-row" key={source.key}>
              <strong>{source.label}</strong>
              <span>{source.status}</span>
              <p>{source.notes}</p>
            </div>
          ))}
        </div>
          <p className="compact-subtitle">{AI_PRICE_DISCLAIMER} Protected provider credentials are handled server-side. Some live source connectors may remain unavailable during private beta.</p>
      </section>
    );
  }

  return renderMarketSourceControls(...args);
}
