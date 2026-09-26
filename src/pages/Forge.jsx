import { EXCHANGE_SECTION_TABS, normalizeExchangeSection } from "../utils/appRouteState";
import { AppNavIcon, CommandBoardV4 } from "../components/command-system";

export default function ForgePage(props) {
  const {
    commandDeskSellerAccess,
    editMarketplaceListing,
    exchangeSection,
    forgeInventoryItems = [],
    marketPriceMemories = [],
    missingSalePriceItems = [],
    money,
    needsMarketCheckItems = [],
    openBeaconCenter,
    openCompassSearch,
    openDealFinderModal,
    openExchangeSection,
    openMarketplaceCreate,
    openProductAddFlow,
    openTradeCompassFlow,
    renderExchangeMarketCatalogSearchSection,
    renderForgeAccessState,
    renderForgeHeader,
    renderItemCompareTableSection,
    renderMarketHomeFoundation,
    renderMarketIntelligencePanel,
    renderMarketPriceMemorySection,
    renderMarketplaceSection,
    renderPageChrome,
    renderWishlistIsoPlanningSection,
    setActiveTab,
    setForgeSubTab,
    updateMarketplaceListingStatus,
    workspaceMarketplaceListings = [],
    workspaceSales = [],
    workspaceTradeRecords = [],
    workspaceWatchlist = [],
  } = props;

  const activeExchangeSection = normalizeExchangeSection(exchangeSection);
  const isHarborSection = activeExchangeSection === "harbor";
  const isForgeSection = activeExchangeSection === "forge";
  const formatExchangeMoney = typeof money === "function" ? money : (value) => `$${Number(value || 0).toFixed(2)}`;
  const activeListings = workspaceMarketplaceListings.filter((listing) => !/sold|closed|archived|cancel/i.test(String(listing.status || listing.listingStatus || "")));
  const openOffers = workspaceMarketplaceListings.filter((listing) => /offer|pending/i.test(String(listing.status || listing.listingStatus || listing.offerStatus || "")));
  const draftListings = workspaceMarketplaceListings.filter((listing) => /draft|needs photos|needs price/i.test(String(listing.status || listing.listingStatus || "Draft")));
  const publishedListings = workspaceMarketplaceListings.filter((listing) => /active|published|approved/i.test(String(listing.status || listing.listingStatus || "")));
  const shippingListings = workspaceMarketplaceListings.filter((listing) => /sold|packed|ship|tracking/i.test(String(listing.status || listing.listingStatus || listing.shippingStatus || "")));
  const listingsWithPhotos = workspaceMarketplaceListings.filter((listing) => Boolean(listing.photoUrl || listing.imageUrl || listing.photos?.length));
  const listingsWithCondition = workspaceMarketplaceListings.filter((listing) => {
    const condition = String(listing.condition || "").trim().toLowerCase();
    return condition && condition !== "unknown";
  });
  const listingsWithPrice = workspaceMarketplaceListings.filter((listing) => Number(listing.askingPrice || listing.price || listing.tradeValue || 0) > 0);
  const harborProofScore = workspaceMarketplaceListings.length
    ? Math.round(((listingsWithPhotos.length + listingsWithCondition.length + listingsWithPrice.length) / (workspaceMarketplaceListings.length * 3)) * 100)
    : 0;
  const forgeMarketValue = forgeInventoryItems.reduce((sum, item) => sum + Number(item.marketPrice || item.marketValue || item.salePrice || 0) * Math.max(1, Number(item.quantity || 1)), 0);
  const forgeCostBasis = forgeInventoryItems.reduce((sum, item) => sum + Number(item.unitCost || item.costBasis || item.purchasePrice || 0) * Math.max(1, Number(item.quantity || 1)), 0);
  const soldRevenue = workspaceSales.reduce((sum, sale) => sum + Number(sale.total || sale.saleTotal || sale.finalSalePrice || sale.price || 0), 0);
  const exchangeReviewCount = needsMarketCheckItems.length + missingSalePriceItems.length + openOffers.length;
  const exchangeConfidenceScore = Math.min(100, Math.round(
    (marketPriceMemories.length ? 26 : 8) +
    (workspaceWatchlist.length ? 22 : 6) +
    (forgeInventoryItems.length ? 24 : 8) +
    (workspaceTradeRecords.length ? 16 : 4) +
    (activeListings.length ? 12 : 4),
  ));
  const exchangeSummaryCards = [
    {
      key: "market",
      title: "Market",
      label: "Price discovery",
      value: workspaceWatchlist.length + marketPriceMemories.length,
      detail: `${workspaceWatchlist.length} watched | ${marketPriceMemories.length} saved price ${marketPriceMemories.length === 1 ? "memory" : "memories"}`,
      meta: needsMarketCheckItems.length ? `${needsMarketCheckItems.length} need market review` : "Manual values only",
      action: () => openExchangeSection("market"),
    },
    {
      key: "harbor",
      title: "Harbor",
      label: "Selling prep",
      value: activeListings.length,
      detail: `${openOffers.length} offer ${openOffers.length === 1 ? "needs" : "signals need"} attention`,
      meta: "No checkout or payouts connected",
      action: () => openExchangeSection("harbor"),
    },
    {
      key: "forge",
      title: "Forge",
      label: "Trade and value decisions",
      value: forgeInventoryItems.length,
      detail: `${workspaceTradeRecords.length} trade ${workspaceTradeRecords.length === 1 ? "memory" : "memories"} | ${formatExchangeMoney(forgeMarketValue)} tracked`,
      meta: missingSalePriceItems.length ? `${missingSalePriceItems.length} need sale price` : "Private records",
      action: () => openExchangeSection("forge"),
    },
  ];
  const exchangeDecisionRows = [
    {
      key: "compare",
      label: "Compare first",
      value: marketPriceMemories.length ? `${marketPriceMemories.length} saved` : "Start",
      detail: "Product Compare, Price Memory, and Watch Center before buying, selling, or trading.",
      percent: Math.min(100, Math.max(12, marketPriceMemories.length * 18)),
    },
    {
      key: "proof",
      label: "Proof check",
      value: activeListings.length ? `${activeListings.length} listing${activeListings.length === 1 ? "" : "s"}` : "Draft",
      detail: "Photos, condition, receipts, tracking, and issue proof stay visible before action.",
      percent: Math.min(100, Math.max(14, activeListings.length * 20)),
    },
    {
      key: "fairness",
      label: "Fairness review",
      value: workspaceTradeRecords.length ? `${workspaceTradeRecords.length} trades` : "Compass",
      detail: "Forge answers whether a trade is fair, risky, or worth saving.",
      percent: Math.min(100, Math.max(16, workspaceTradeRecords.length * 22)),
    },
  ];
  const exchangeNextAction = exchangeReviewCount
    ? {
      label: "Review Needed",
      title: `${exchangeReviewCount} Exchange item${exchangeReviewCount === 1 ? "" : "s"} need attention.`,
      detail: "Start with stale prices, missing sale prices, or open offer context before moving anything forward.",
      cta: needsMarketCheckItems.length ? "Open Market" : "Open Forge",
      action: () => needsMarketCheckItems.length ? openExchangeSection("market") : openExchangeSection("forge"),
    }
    : forgeInventoryItems.length
      ? {
        label: "Recommendation: Compare",
        title: "Check value before the next move.",
        detail: "Your Forge records have saved local context. Use Product Compare or Trade Compass before listing or trading.",
        cta: "Trade Compass",
        action: () => openTradeCompassFlow({ source: "exchange-command-center" }),
      }
      : {
        label: "Recommendation: Start",
        title: "Search, compare, then decide.",
        detail: "No fake commerce: begin with Market Intelligence or add one Forge item. Exchange stays review-first and payment-free.",
        cta: "Search Market",
        action: () => openExchangeSection("market"),
      };
  const forgeNextAction = missingSalePriceItems.length
    ? {
      label: "Record Health",
      title: `${missingSalePriceItems.length} Forge item${missingSalePriceItems.length === 1 ? "" : "s"} need sale price context.`,
      detail: "Add market, cost, and planned sale details before trusting listing or profit decisions.",
      cta: "Review Prices",
      action: () => openExchangeSection("forge"),
    }
    : forgeInventoryItems.length
      ? {
        label: "Recommendation: Verify",
        title: "Proof before selling or trading.",
        detail: "Review inventory proof, cost basis, condition, and trade fairness before moving any item forward.",
        cta: "Trade Compass",
        action: () => openTradeCompassFlow({ source: "forge-command-center" }),
      }
      : {
        label: "Recommendation: Start",
        title: "Start a private ledger.",
        detail: "Add inventory, cost basis, receipt proof, and sale or trade records.",
        cta: "Add Inventory",
        action: () => openProductAddFlow({ source: "forge-next-action", destinations: { forge: true } }),
      };
  const harborNextAction = openOffers.length
    ? {
      label: "Offer review",
      title: `${openOffers.length} offer signal${openOffers.length === 1 ? "" : "s"} need a decision.`,
      detail: "Compare offer value, condition proof, and safe handoff terms before responding.",
      cta: "Review Offers",
      action: () => editMarketplaceListing?.(openOffers[0]),
    }
    : draftListings.length
      ? {
        label: "Listing health",
        title: `${draftListings.length} draft${draftListings.length === 1 ? " is" : "s are"} ready for review.`,
        detail: "Complete photos, condition, price, and delivery terms before publishing.",
        cta: "Review Draft",
        action: () => editMarketplaceListing?.(draftListings[0]),
      }
      : {
        label: "Seller readiness",
        title: "Build the listing from Vault proof.",
        detail: "Start with the item record, then add photos, condition, price, and safe delivery terms.",
        cta: "Create Listing",
        action: () => openMarketplaceCreate?.("manual", {}),
      };
  const pageNextAction = isForgeSection ? forgeNextAction : isHarborSection ? harborNextAction : exchangeNextAction;
  const exchangeSummary = {
    overview: {
      kicker: "Decision center",
      title: "Exchange",
      body: "Research value, prepare proof-backed listings, and compare trades from one review-first hub.",
    },
    market: {
      kicker: "Manual research",
      title: "Market",
        body: "Search products, save price memories, compare decisions, and watch value without checkout.",
    },
    harbor: {
      kicker: "Listings and offers",
      title: "Harbor",
        body: "Prepare listings, review offers, and manage proof without checkout.",
    },
    forge: {
      kicker: "Private ledger",
      title: "Forge",
        body: "Keep inventory, trades, receipts, and sales planning private and separate from Vault.",
    },
  }[activeExchangeSection];
  const exchangeCommandStatus = [
    {
      key: "confidence",
      icon: "data",
      label: "Decision confidence",
      value: `${exchangeConfidenceScore}%`,
      detail: exchangeReviewCount ? `${exchangeReviewCount} review flags` : "Ready",
    },
    {
      key: "market",
      icon: "market",
      label: "Market",
      value: workspaceWatchlist.length + marketPriceMemories.length,
      detail: "Watch and price memory",
      action: () => openExchangeSection("market"),
    },
    {
      key: "harbor",
      icon: "forge",
      label: "Harbor",
      value: activeListings.length,
      detail: `${openOffers.length} offer signals`,
      action: () => openExchangeSection("harbor"),
    },
    {
      key: "forge",
      icon: "forge",
      label: "Forge",
      value: forgeInventoryItems.length,
      detail: `${workspaceTradeRecords.length} trade records`,
      action: () => openExchangeSection("forge"),
    },
    {
      key: "checkout",
      icon: "help",
      label: "Checkout",
      value: "Off",
      detail: "Review-first only",
    },
  ];
  const harborCommandStatus = [
    { key: "health", icon: "data", label: "Listing health", value: `${harborProofScore}%`, detail: workspaceMarketplaceListings.length ? "Proof coverage" : "Start with proof" },
    { key: "drafts", icon: "clipboard", label: "Drafts", value: draftListings.length, detail: "Ready to complete", action: () => draftListings[0] && editMarketplaceListing?.(draftListings[0]) },
    { key: "active", icon: "market", label: "Active", value: publishedListings.length, detail: "Published listings" },
    { key: "offers", icon: "exchange", label: "Offers", value: openOffers.length, detail: "Need review", action: () => openOffers[0] && editMarketplaceListing?.(openOffers[0]) },
    { key: "shipping", icon: "workspace", label: "Ship now", value: shippingListings.length, detail: "Proof and tracking", action: () => setActiveTab("sales") },
  ];
  const exchangeCommandPlan = [
    {
      key: "compare",
      icon: "market",
      label: "Compare first",
      detail: "Product value context",
      action: () => openExchangeSection("market"),
    },
    {
      key: "listing",
      icon: "clipboard",
      label: "Prep listing",
      detail: "Photos and proof",
      action: () => openExchangeSection("harbor"),
    },
    {
      key: "trade",
      icon: "forge",
      label: "Check trade",
      detail: "Fairness and risk",
      action: () => openTradeCompassFlow({ source: "exchange-command-board" }),
    },
    {
      key: "review",
      icon: "bell",
      label: "Review flags",
      detail: exchangeReviewCount ? `${exchangeReviewCount} waiting` : "No flags",
      action: pageNextAction.action,
    },
  ];
  const harborCommandPlan = [
    { key: "item", icon: "vault", label: "Choose item", detail: "Start from Vault proof", action: () => openMarketplaceCreate?.("vault", {}) },
    { key: "photos", icon: "data", label: "Add proof", detail: "Photos and condition", action: pageNextAction.action },
    { key: "price", icon: "market", label: "Set terms", detail: "Price and delivery", action: pageNextAction.action },
    { key: "review", icon: "clipboard", label: "Review listing", detail: "Safety before publish", action: pageNextAction.action },
  ];
  const exchangeCommandRoutes = exchangeSummaryCards.map((card) => ({
    key: card.key,
    icon: card.key === "market" ? "market" : "forge",
    label: card.title,
    title: card.label,
    detail: card.meta,
    ariaLabel: card.title,
    active: card.key === activeExchangeSection,
    action: card.action,
  }));
  const exchangeHubCards = exchangeSummaryCards.map((card) => ({
    ...card,
    icon: card.key === "market" ? "market" : card.key === "harbor" ? "trade" : "forge",
    cta: card.key === "market" ? "Open Market" : card.key === "harbor" ? "Open Harbor" : "Open Forge",
  }));
  const forgeHubCards = [
    {
      key: "inventory",
      title: "Inventory",
      label: "Private stock ledger",
      value: forgeInventoryItems.length,
      detail: `${formatExchangeMoney(forgeCostBasis)} cost | ${formatExchangeMoney(forgeMarketValue)} market`,
      meta: missingSalePriceItems.length ? `${missingSalePriceItems.length} need sale price` : "Cost and value review",
      icon: "forge",
      action: () => openProductAddFlow({ source: "forge-hub-inventory", destinations: { forge: true } }),
    },
    {
      key: "sales",
      title: "Sales",
      label: "Proof-backed records",
      value: workspaceSales.length,
      detail: `${formatExchangeMoney(soldRevenue)} recorded revenue`,
      meta: "Fees, shipping, cost basis, references",
      icon: "market",
      action: () => setActiveTab("sales"),
    },
    {
      key: "listings",
      title: "Listings",
      label: "Harbor prep",
      value: activeListings.length,
      detail: `${openOffers.length} offer signal${openOffers.length === 1 ? "" : "s"}`,
      meta: "No checkout or payouts connected",
      icon: "clipboard",
      action: () => openExchangeSection("harbor"),
    },
    {
      key: "trades",
      title: "Trades",
      label: "Fairness ledger",
      value: workspaceTradeRecords.length,
      detail: "Trade Compass before action",
      meta: "Inventory stays unchanged unless reviewed",
      icon: "exchange",
      action: () => openTradeCompassFlow({ source: "forge-hub-trades" }),
    },
  ];
  const harborHubCards = [
    {
      key: "drafts",
      title: "Drafts",
      label: "Listing builder",
      value: draftListings.length,
      detail: draftListings.length ? `${draftListings.length} listing draft${draftListings.length === 1 ? "" : "s"} waiting` : "Create from a Vault item or manual record",
      meta: "Photos, condition, price, delivery",
      icon: "clipboard",
      action: () => draftListings[0] ? editMarketplaceListing?.(draftListings[0]) : openMarketplaceCreate?.("manual", {}),
    },
    {
      key: "active",
      title: "Active",
      label: "Published listings",
      value: publishedListings.length,
      detail: publishedListings.length ? `${publishedListings.length} listing${publishedListings.length === 1 ? "" : "s"} visible` : "Nothing published yet",
      meta: "Review status stays visible",
      icon: "market",
      action: () => publishedListings[0] && editMarketplaceListing?.(publishedListings[0]),
    },
    {
      key: "offers",
      title: "Offers",
      label: "Decision inbox",
      value: openOffers.length,
      detail: openOffers.length ? `${openOffers.length} offer signal${openOffers.length === 1 ? "" : "s"} waiting` : "No offers waiting",
      meta: "Compare value before reply",
      icon: "exchange",
      action: () => openOffers[0] && editMarketplaceListing?.(openOffers[0]),
    },
    {
      key: "shipping",
      title: "Shipping",
      label: "Proof queue",
      value: shippingListings.length,
      detail: shippingListings.length ? `${shippingListings.length} sale${shippingListings.length === 1 ? "" : "s"} need fulfillment proof` : "No shipments waiting",
      meta: "Packed, tracking, delivered",
      icon: "workspace",
      action: () => setActiveTab("sales"),
    },
  ];
  const displayedHubCards = isForgeSection ? forgeHubCards : isHarborSection ? harborHubCards : exchangeHubCards;
  const exchangeSignalCards = [
    {
      key: "watch",
      label: "Watch Center",
      value: workspaceWatchlist.length || 0,
      title: "Price, product, and restock alerts",
      detail: workspaceWatchlist.length ? `${workspaceWatchlist.length} watched target${workspaceWatchlist.length === 1 ? "" : "s"} active` : "Add targets before buying or trading.",
      icon: "bell",
      action: () => openExchangeSection("market"),
    },
    {
      key: "compare",
      label: "Product Compare",
      value: marketPriceMemories.length || 0,
      title: "Raw, graded, sealed, hold, sell",
      detail: marketPriceMemories.length ? "Saved prices can feed compare decisions." : "Compare before a purchase or listing.",
      icon: "data",
      action: openDealFinderModal,
    },
    {
      key: "listing",
      label: "Listing Health",
      value: activeListings.length || 0,
      title: "Photos, price, proof, shipping",
      detail: openOffers.length ? `${openOffers.length} offer signal${openOffers.length === 1 ? "" : "s"} need review.` : "Keep selling prep honest and proof-backed.",
      icon: "clipboard",
      action: () => openExchangeSection("harbor"),
    },
    {
      key: "trade",
      label: "Trade Fairness",
      value: workspaceTradeRecords.length || 0,
      title: "Fair, caution, risky, not enough data",
      detail: "Forge should answer whether the trade is worth saving.",
      icon: "forge",
      action: () => openTradeCompassFlow({ source: "exchange-v4-fairness" }),
    },
  ];
  const forgeSignalCards = [
    {
      key: "health",
      label: "Record Health",
      value: `${exchangeConfidenceScore}%`,
      title: "Cost, proof, sale price, and trade context",
      detail: exchangeReviewCount ? `${exchangeReviewCount} record flag${exchangeReviewCount === 1 ? "" : "s"} need review.` : "Business records are ready for review.",
      icon: "data",
      action: () => openExchangeSection("forge"),
    },
    {
      key: "ledger",
      label: "Business Ledger",
      value: workspaceSales.length + forgeInventoryItems.length,
      title: "Sales, receipts, mileage, exports",
      detail: "Open the deeper planning surface for business recordkeeping.",
      icon: "clipboard",
      action: () => setForgeSubTab("ledger"),
    },
    {
      key: "payout",
      label: "Payout Assist",
      value: "Review",
      title: "Partner splits and reimbursements",
      detail: "Planning only. Not payroll, tax, or legal advice.",
      icon: "account",
      action: () => setForgeSubTab("ledger"),
    },
    {
      key: "trade",
      label: "Trade Fairness",
      value: workspaceTradeRecords.length || 0,
      title: "Fair, caution, risky, not enough data",
      detail: "Forge should answer whether the trade is worth saving.",
      icon: "forge",
      action: () => openTradeCompassFlow({ source: "forge-v4-fairness" }),
    },
  ];
  const harborSignalCards = [
    {
      key: "health",
      label: "Listing Health",
      value: `${harborProofScore}%`,
      title: "Photos, condition, price, delivery",
      detail: workspaceMarketplaceListings.length ? `${workspaceMarketplaceListings.length} listing record${workspaceMarketplaceListings.length === 1 ? "" : "s"} checked.` : "Create a listing to begin the health check.",
      icon: "data",
      action: pageNextAction.action,
    },
    {
      key: "proof",
      label: "Proof Coverage",
      value: listingsWithPhotos.length,
      title: "Evidence before publish",
      detail: `${listingsWithPhotos.length} of ${workspaceMarketplaceListings.length} listings include photo proof.`,
      icon: "vault",
      action: pageNextAction.action,
    },
    {
      key: "sales",
      label: "Sold Records",
      value: workspaceSales.length,
      title: "Sale and shipping archive",
      detail: `${formatExchangeMoney(soldRevenue)} recorded with private business context.`,
      icon: "clipboard",
      action: () => setActiveTab("sales"),
    },
    {
      key: "issues",
      label: "Issue Center",
      value: "Ready",
      title: "Report with evidence",
      detail: "Keep photos, condition, tracking, and timeline proof together.",
      icon: "help",
      action: () => setActiveTab("trust"),
    },
  ];
  const displayedSignalCards = isForgeSection ? forgeSignalCards : isHarborSection ? harborSignalCards : exchangeSignalCards;
  const forgeNetPosition = forgeMarketValue - forgeCostBasis;
  const forgeOperationsStrip = [
    {
      key: "position",
      label: "Net position",
      value: forgeInventoryItems.length ? formatExchangeMoney(forgeNetPosition) : "Not started",
      detail: `${formatExchangeMoney(forgeMarketValue)} market - ${formatExchangeMoney(forgeCostBasis)} cost`,
      tone: forgeNetPosition >= 0 ? "positive" : "caution",
    },
    {
      key: "proof",
      label: "Proof status",
      value: exchangeReviewCount ? `${exchangeReviewCount} flags` : "Clean",
      detail: "Sale prices, listings, offers, and market checks",
      tone: exchangeReviewCount ? "caution" : "positive",
    },
    {
      key: "selling",
      label: "Selling queue",
      value: `${activeListings.length} active`,
      detail: `${openOffers.length} offer signal${openOffers.length === 1 ? "" : "s"} waiting`,
      tone: openOffers.length ? "caution" : "neutral",
    },
    {
      key: "records",
      label: "Record depth",
      value: workspaceSales.length + workspaceTradeRecords.length,
      detail: `${workspaceSales.length} sales | ${workspaceTradeRecords.length} trades`,
      tone: workspaceSales.length || workspaceTradeRecords.length ? "positive" : "neutral",
    },
  ];
  const forgeLeadInventory = forgeInventoryItems[0] || null;
  const forgeLeadInventoryName = forgeLeadInventory
    ? forgeLeadInventory.productName || forgeLeadInventory.name || forgeLeadInventory.itemName || forgeLeadInventory.title || "Forge inventory record"
    : "";
  const forgePriorityQueue = [
    ...(forgeLeadInventory ? [{
      key: `inventory-${forgeLeadInventory.id || forgeLeadInventoryName}`,
      label: "Active inventory record",
      title: forgeLeadInventoryName,
      detail: `${formatExchangeMoney(forgeLeadInventory.unitCost || forgeLeadInventory.costBasis || forgeLeadInventory.purchasePrice || 0)} cost | ${formatExchangeMoney(forgeLeadInventory.marketPrice || forgeLeadInventory.marketValue || forgeLeadInventory.salePrice || 0)} market`,
      status: missingSalePriceItems.some((item) => String(item.id) === String(forgeLeadInventory.id)) ? "Review" : "Tracked",
      tone: missingSalePriceItems.some((item) => String(item.id) === String(forgeLeadInventory.id)) ? "caution" : "positive",
      action: () => setForgeSubTab("inventory"),
      cta: "Open Record",
    }] : []),
    {
      key: "market-check",
      label: "Market check",
      title: needsMarketCheckItems.length ? `${needsMarketCheckItems.length} items need fresh comps` : "Market references current",
      detail: "Refresh value before listing, trading, or logging a sale.",
      status: needsMarketCheckItems.length ? "Needs review" : "Ready",
      tone: needsMarketCheckItems.length ? "caution" : "positive",
      action: () => openExchangeSection("market"),
      cta: "Open Market",
    },
    {
      key: "sale-proof",
      label: "Sale proof",
      title: missingSalePriceItems.length ? `${missingSalePriceItems.length} missing sale price` : "Sale prices covered",
      detail: "Keep sale amount, fees, shipping, reference, and cost basis together.",
      status: missingSalePriceItems.length ? "Incomplete" : "Covered",
      tone: missingSalePriceItems.length ? "caution" : "positive",
      action: () => setActiveTab("sales"),
      cta: "Open Sales",
    },
    {
      key: "offers",
      label: "Offer review",
      title: openOffers.length ? `${openOffers.length} offer signals waiting` : "No offers waiting",
      detail: "Compare offer value against cost, demand, and proof before responding.",
      status: openOffers.length ? "Review" : "Clear",
      tone: openOffers.length ? "caution" : "neutral",
      action: () => openExchangeSection("harbor"),
      cta: "Open Harbor",
    },
    {
      key: "trade",
      label: "Trade decision",
      title: workspaceTradeRecords.length ? `${workspaceTradeRecords.length} saved trade records` : "Run Trade Compass first",
      detail: "Check value balance, condition risk, liquidity, and family safety.",
      status: workspaceTradeRecords.length ? "Tracked" : "Start",
      tone: workspaceTradeRecords.length ? "positive" : "neutral",
      action: () => openTradeCompassFlow({ source: "forge-priority-queue" }),
      cta: "Trade Compass",
    },
  ];
  const forgeDecisionMetrics = [
    {
      label: "Cost basis",
      value: formatExchangeMoney(forgeCostBasis),
      detail: forgeCostBasis ? "Known inventory cost" : "Add costs before trusting profit",
      percent: forgeMarketValue ? Math.min(100, Math.round((forgeCostBasis / Math.max(forgeMarketValue, 1)) * 100)) : 0,
    },
    {
      label: "Market value",
      value: formatExchangeMoney(forgeMarketValue),
      detail: `${forgeInventoryItems.length} private inventory record${forgeInventoryItems.length === 1 ? "" : "s"}`,
      percent: forgeMarketValue ? 100 : 0,
    },
    {
      label: "Sales revenue",
      value: formatExchangeMoney(soldRevenue),
      detail: `${workspaceSales.length} sale record${workspaceSales.length === 1 ? "" : "s"}`,
      percent: forgeMarketValue ? Math.min(100, Math.round((soldRevenue / Math.max(forgeMarketValue, 1)) * 100)) : 0,
    },
    {
      label: "Liquidity",
      value: activeListings.length || openOffers.length ? "Active" : "Unlisted",
      detail: activeListings.length ? `${activeListings.length} listing${activeListings.length === 1 ? "" : "s"} prepared` : "Move through Harbor when ready",
      percent: activeListings.length ? 72 : 28,
    },
  ];
  const forgeProofChecklist = [
    {
      label: "Inventory proof",
      value: forgeInventoryItems.length ? "Attached" : "Needed",
      state: forgeInventoryItems.length ? "complete" : "empty",
    },
    {
      label: "Cost basis",
      value: forgeCostBasis ? "Known" : "Missing",
      state: forgeCostBasis ? "complete" : "warning",
    },
    {
      label: "Sale reference",
      value: workspaceSales.length ? "Saved" : "Not started",
      state: workspaceSales.length ? "complete" : "empty",
    },
    {
      label: "Trade memory",
      value: workspaceTradeRecords.length ? "Logged" : "Optional",
      state: workspaceTradeRecords.length ? "complete" : "empty",
    },
  ];
  const forgeSellerGuardrails = [
    "Private ledger only",
    "No checkout or payouts",
    "No public seller messaging",
    "Vault proof before action",
  ];
  const exchangeSafetyRules = [
    "No checkout until payments, issues, and proof systems are real.",
    "Kids and teen exchanges require parent approval.",
    "Every sell or trade path starts from Vault proof.",
  ];
  const commandBoardCopy = isForgeSection
    ? {
      label: "Forge",
      title: "Forge Business Command Center",
      description: "Private seller records, proof, trade decisions, and business exports.",
      primaryAction: { label: "Add Inventory", icon: "forge", onClick: () => openProductAddFlow({ source: "forge-command-board", destinations: { forge: true } }) },
      secondaryActions: [
        { label: "Trade Compass", icon: "forge", onClick: () => openTradeCompassFlow({ source: "forge-command-board" }) },
        { label: "Business Ledger", icon: "clipboard", onClick: () => setForgeSubTab("ledger") },
      ],
    }
    : isHarborSection
      ? {
        label: "Harbor",
        title: "Harbor Seller Command Center",
        description: "Prepare listings, review offers, track fulfillment proof, and keep every seller action review-first.",
        primaryAction: { label: "Create Listing", icon: "plus", onClick: () => openMarketplaceCreate?.("manual", {}) },
        secondaryActions: [
          { label: "Sell from Vault", icon: "vault", onClick: () => openMarketplaceCreate?.("vault", {}) },
          { label: "Open Forge", icon: "forge", onClick: () => openExchangeSection("forge") },
        ],
      }
      : {
      label: "Exchange",
      title: "Exchange Command Center",
      description: "Market research, selling prep, and trade decisions without checkout.",
      primaryAction: { label: "Search Market", icon: "market", onClick: () => openExchangeSection("market") },
      secondaryActions: [
        { label: "Trade Compass", icon: "forge", onClick: () => openTradeCompassFlow({ source: "exchange-command-board" }) },
        { label: "Review Deal", icon: "search", onClick: openDealFinderModal },
      ],
    };
  return (
    <div className={`exchange-page-final exchange-command-only-route exchange-page-final--${activeExchangeSection}${isForgeSection ? " forge-page-command-route" : ""}`}>
      <CommandBoardV4
        accent="exchange"
        className="exchange-command-board"
        ariaLabel={commandBoardCopy.title}
        label={commandBoardCopy.label}
        title={commandBoardCopy.title}
        description={commandBoardCopy.description}
        primaryAction={commandBoardCopy.primaryAction}
        secondaryActions={commandBoardCopy.secondaryActions}
        utilityActions={[
          { label: "Compass", icon: "search", onClick: () => openCompassSearch?.("exchange_compass") },
          { label: "Beacon", icon: "bell", onClick: () => openBeaconCenter?.("exchange_beacon") },
        ]}
        statusItems={isHarborSection ? harborCommandStatus : exchangeCommandStatus}
        plan={{
          label: isForgeSection ? "Forge Plan" : isHarborSection ? "Harbor Plan" : "Exchange Plan",
          title: isForgeSection ? "Record, prove, decide, then act" : isHarborSection ? "Build, prove, review, then publish" : "Decide with value, proof, and safety",
          items: isHarborSection ? harborCommandPlan : exchangeCommandPlan,
          actions: [
            isForgeSection
              ? { label: "Add Inventory", icon: "forge", onClick: () => openProductAddFlow({ source: "forge-plan", destinations: { forge: true } }) }
              : isHarborSection
                ? { label: "Create Listing", icon: "plus", onClick: () => openMarketplaceCreate?.("manual", {}) }
                : { label: activeExchangeSection === "market" ? "Search Market" : "Open Market", icon: "market", onClick: () => activeExchangeSection === "market" ? setActiveTab("market") : openExchangeSection("market") },
            isForgeSection
              ? { label: "Business Ledger", icon: "clipboard", onClick: () => setForgeSubTab("ledger") }
              : isHarborSection
                ? { label: "Open Market", icon: "market", onClick: () => openExchangeSection("market") }
                : { label: "Open Forge", icon: "forge", onClick: () => openExchangeSection("forge") },
          ],
        }}
        routes={exchangeCommandRoutes}
      >
        <div className="exchange-v4-command-content">
          <section className="exchange-v4-decision-panel" aria-label="Exchange hub">
            <div className="exchange-v4-panel-heading">
              <div>
                <span>{exchangeSummary.kicker}</span>
                <h2>{exchangeSummary.title} decision desk</h2>
                <p>{exchangeSummary.body}</p>
              </div>
              <small className="trust-badge trust-badge--secure">{isHarborSection ? "Proof before publish" : "No fake commerce"}</small>
            </div>
            <div className="exchange-v4-hub-grid">
              {displayedHubCards.map((card) => (
                <button
                  type="button"
                  className={`exchange-v4-hub-card${activeExchangeSection === card.key || (isForgeSection && card.key === "inventory") ? " is-active" : ""}`}
                  key={card.key}
                  onClick={card.action}
                >
                  <span><AppNavIcon kind={card.icon} />{card.title}</span>
                  <strong>{card.label}</strong>
                  <p>{card.detail}</p>
                  <small>{card.meta}</small>
                  <b>{card.value}</b>
                </button>
              ))}
            </div>
          </section>

          <aside className="exchange-v4-side-rail" aria-label="Exchange next action">
            <article>
              <span className="trust-badge trust-badge--verified">{pageNextAction.label}</span>
              <h3>{pageNextAction.title}</h3>
              <p>{pageNextAction.detail}</p>
              {isHarborSection ? (
                <div className="exchange-value-ribbon" aria-label="Harbor listing summary">
                  <span>Drafts {draftListings.length}</span>
                  <span>Active {publishedListings.length}</span>
                  <span>Offers {openOffers.length}</span>
                  <b>{shippingListings.length ? `${shippingListings.length} ship` : "Ready"}</b>
                </div>
              ) : (
                <div className="exchange-value-ribbon" aria-label="Exchange value summary">
                  <span>Cost {formatExchangeMoney(forgeCostBasis)}</span>
                  <span>Market {formatExchangeMoney(forgeMarketValue)}</span>
                  <span>Sold {formatExchangeMoney(soldRevenue)}</span>
                  <b>{exchangeReviewCount ? `${exchangeReviewCount} flags` : "Ready"}</b>
                </div>
              )}
              <button type="button" className="command-board-v4-primary-action" onClick={pageNextAction.action}>{pageNextAction.cta}</button>
            </article>
            <article>
              <span className="trust-badge trust-badge--fair">Safety rules</span>
              <h3>No fake commerce.</h3>
              <div className="exchange-v4-rule-list">
                {(isHarborSection ? [
                  "Use Vault photos and condition proof before publishing.",
                  "Keep payment, shipping, and meetup claims honest and review-first.",
                  "Child accounts cannot publish, sell, or share private location.",
                ] : exchangeSafetyRules).map((rule) => <span key={rule}>{rule}</span>)}
              </div>
            </article>
          </aside>
        </div>

        {isForgeSection ? (
          <div className="forge-v4-operations-strip" aria-label="Forge operations summary">
            {forgeOperationsStrip.map((item) => (
              <article className={`is-${item.tone}`} key={item.key}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.detail}</small>
              </article>
            ))}
          </div>
        ) : null}

        {isForgeSection ? (
          <div className="forge-v4-command-matrix" aria-label="Forge command matrix">
            <section className="forge-v4-priority-panel" aria-label="Forge priority queue">
              <div className="forge-v4-matrix-heading">
                <span>Priority Queue</span>
                <h3>What needs attention first.</h3>
              </div>
              <div className="forge-v4-priority-list">
                {forgePriorityQueue.map((item) => (
                  <button type="button" className={`is-${item.tone}`} key={item.key} onClick={item.action}>
                    <span>{item.label}<b>{item.status}</b></span>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                    <em>{item.cta}</em>
                  </button>
                ))}
              </div>
            </section>

            <section className="forge-v4-decision-cockpit" aria-label="Forge decision cockpit">
              <div className="forge-v4-matrix-heading">
                <span>Decision Cockpit</span>
                <h3>Value, liquidity, and proof.</h3>
              </div>
              <div className="forge-v4-decision-meter-list">
                {forgeDecisionMetrics.map((metric) => (
                  <article key={metric.label}>
                    <div>
                      <span>{metric.label}</span>
                      <strong>{metric.value}</strong>
                    </div>
                    <small>{metric.detail}</small>
                    <i><b style={{ width: `${metric.percent}%` }} /></i>
                  </article>
                ))}
              </div>
            </section>

            <section className="forge-v4-proof-panel" aria-label="Forge proof checklist">
              <div className="forge-v4-matrix-heading">
                <span>Proof Checklist</span>
                <h3>Records before action.</h3>
              </div>
              <div className="forge-v4-proof-grid">
                {forgeProofChecklist.map((proof) => (
                  <article className={`is-${proof.state}`} key={proof.label}>
                    <span>{proof.label}</span>
                    <strong>{proof.value}</strong>
                  </article>
                ))}
              </div>
              <div className="forge-v4-range-ribbon" aria-label="Forge value range">
                <span>Cost {formatExchangeMoney(forgeCostBasis)}</span>
                <b>Market {formatExchangeMoney(forgeMarketValue)}</b>
                <span>Sold {formatExchangeMoney(soldRevenue)}</span>
              </div>
            </section>

            <section className="forge-v4-guardrail-panel" aria-label="Forge seller guardrails">
              <div className="forge-v4-matrix-heading">
                <span>Seller Guardrails</span>
                <h3>Private, proof-first selling.</h3>
              </div>
              <div className="forge-v4-guardrail-list">
                {forgeSellerGuardrails.map((rule) => <span key={rule}>{rule}</span>)}
              </div>
              <button type="button" className="command-board-v4-secondary-action" onClick={() => setForgeSubTab("ledger")}>Open Ledger</button>
            </section>
          </div>
        ) : null}

        {!isForgeSection ? <div className="exchange-v4-signal-grid" aria-label="Exchange feature surfaces">
          {displayedSignalCards.map((card) => (
            <article key={card.key}>
              <div>
                <span><AppNavIcon kind={card.icon} />{card.label}</span>
                <strong>{card.value}</strong>
              </div>
              <h3>{card.title}</h3>
              <p>{card.detail}</p>
              <button type="button" className="command-board-v4-secondary-action" onClick={card.action}>Open</button>
            </article>
          ))}
        </div> : null}

        {!isForgeSection ? <div className="exchange-v4-lower-grid">
          <article className="exchange-decision-system-card">
            <span className="trust-badge trust-badge--secure">Decision system</span>
            <h3>{isForgeSection ? "Seller records need proof." : "Hold / sell / trade needs proof."}</h3>
            <div className="exchange-decision-row-list">
              {exchangeDecisionRows.map((row) => (
                <div className="exchange-decision-row" key={row.key}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                  <small>{row.detail}</small>
                  <i><b style={{ width: `${row.percent}%` }} /></i>
                </div>
              ))}
            </div>
          </article>

          <article className="exchange-proof-timeline-card">
            <span className="trust-badge trust-badge--fair">Proof timeline</span>
            <h3>Trust is built step by step.</h3>
            <div className="exchange-proof-timeline">
              {isForgeSection ? (
                <>
                  <span><b>1</b>Inventory proof</span>
                  <span><b>2</b>Cost basis</span>
                  <span><b>3</b>Sale or trade</span>
                  <span><b>4</b>Export review</span>
                </>
              ) : (
                <>
                  <span><b>1</b>Price memory</span>
                  <span><b>2</b>Condition proof</span>
                  <span><b>3</b>Offer review</span>
                  <span><b>4</b>Trade decision</span>
                </>
              )}
            </div>
          </article>
        </div> : null}

      </CommandBoardV4>
    </div>
  );
}
