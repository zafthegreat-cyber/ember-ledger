import { EXCHANGE_SECTION_TABS, normalizeExchangeSection } from "../utils/appRouteState";

export default function ForgePage(props) {
  const {
    commandDeskSellerAccess,
    exchangeSection,
    openDealFinderModal,
    openExchangeSection,
    openProductAddFlow,
    openTradeCompassFlow,
    renderExchangeMarketCatalogSearchSection,
    renderForgeAccessState,
    renderForgeBusinessCommandPanel,
    renderForgeHeader,
    renderItemCompareTableSection,
    renderMarketHomeFoundation,
    renderMarketPriceMemorySection,
    renderMarketplaceSection,
    renderPageChrome,
    renderWishlistIsoPlanningSection,
    setActiveTab,
    setForgeSubTab,
  } = props;

  const activeExchangeSection = normalizeExchangeSection(exchangeSection);
  const exchangeSummary = {
    market: {
      kicker: "Manual research",
      title: "Market",
      body: "Search known products, save price memories, and compare values without checkout or stock promises.",
    },
    harbor: {
      kicker: "Listings and offers",
      title: "Harbor",
      body: "Review listing context, saved offers, and shop-facing surfaces without turning Ember & Tide into a cart.",
    },
    forge: {
      kicker: "Private ledger",
      title: "Forge",
      body: "Keep trades, inventory, receipts, mileage, and sales planning private and separate from Vault.",
    },
  }[activeExchangeSection];

  return (
    <div className={`exchange-page-final exchange-page-final--${activeExchangeSection}`}>
      {renderPageChrome({
        title: "Exchange",
        subtitle: "Market research, Harbor selling, and Forge trade decisions live together here.",
        tabs: EXCHANGE_SECTION_TABS,
        activeSubTab: activeExchangeSection,
        setActiveSubTab: openExchangeSection,
        quickActions: [
          { key: "exchange-search", title: "Search Market", subtitle: "Manual values", onClick: () => openExchangeSection("market") },
          { key: "exchange-harbor", title: "Harbor", subtitle: "Listings/offers", onClick: () => openExchangeSection("harbor") },
          { key: "exchange-forge", title: "Forge", subtitle: "Private ledger", onClick: () => openExchangeSection("forge") },
          { key: "exchange-deal", title: "Check Deal", subtitle: "Compare first", onClick: openDealFinderModal },
        ],
      })}

      <section className="panel exchange-command-strip" aria-label="Exchange safety and hierarchy">
        <div>
          <span className="section-kicker">{exchangeSummary.kicker}</span>
          <h2>{exchangeSummary.title}</h2>
          <p>{exchangeSummary.body}</p>
        </div>
        <div className="exchange-command-proof">
          <span className="trust-badge trust-badge--secure">No checkout</span>
          <span className="trust-badge trust-badge--fair">No fake live prices</span>
          <span className="trust-badge trust-badge--verified">Family-safe context</span>
        </div>
      </section>

      {activeExchangeSection === "market" ? (
        <div className="exchange-section-body exchange-section-body--market">
          {renderMarketHomeFoundation()}
          {renderExchangeMarketCatalogSearchSection()}
          {renderMarketPriceMemorySection()}
          {renderItemCompareTableSection()}
          {renderWishlistIsoPlanningSection({ surface: "market" })}
        </div>
      ) : null}

      {activeExchangeSection === "harbor" ? (
        <div className="exchange-section-body exchange-section-body--harbor">
          {renderMarketplaceSection()}
        </div>
      ) : null}

      {activeExchangeSection === "forge" ? (
        <div className="exchange-section-body exchange-section-body--forge">
          {commandDeskSellerAccess ? (
            <>
              {renderForgeHeader()}
              {renderForgeBusinessCommandPanel()}
              <section className="panel exchange-forge-shortcuts">
                <div className="compact-card-header">
                  <div>
                    <h2>Private Forge Shortcuts</h2>
                    <p>These open the existing Forge records. No checkout, posting, or tax filing behavior is added here.</p>
                  </div>
                </div>
                <div className="quick-actions forge-action-strip" aria-label="Exchange Forge shortcuts">
                  <button type="button" onClick={() => openProductAddFlow({ source: "exchange-forge", destinations: { forge: true } })}>Add Inventory</button>
                  <button type="button" className="secondary-button" onClick={() => openTradeCompassFlow({ source: "exchange-forge" })}>Trade Compass</button>
                  <button type="button" className="secondary-button" onClick={() => { setForgeSubTab("ledger"); setActiveTab("inventory"); }}>Business Ledger</button>
                  <button type="button" className="secondary-button" onClick={() => setActiveTab("reports")}>Reports</button>
                </div>
              </section>
            </>
          ) : (
            renderForgeAccessState()
          )}
        </div>
      ) : null}
    </div>
  );
}
