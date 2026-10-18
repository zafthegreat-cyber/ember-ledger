import { useMemo } from "react";
import { OfflineState, PageHeader, PrimaryButton, SectionHeader, SecondaryButton } from "../components/operations/OperationsUI.jsx";
import { AppNavIcon } from "../components/command-system/AppNavIcon.jsx";
import { createFlipScoutRepository } from "../features/flipScout/storageRepository.js";
import { formatCurrency, getDashboardSummary } from "../features/flipScout/selectors.js";
import { rankAdaptivePageItems } from "../utils/adaptivePageItems.js";
import { resolveExperiencePresentation } from "../utils/experiencePresentation.js";
import "./home-layout.css";

const FIND_DESTINATION_KEY = "private-business-hub.flip-scout.destination";

function recordImage(record = {}) {
  const images = record.imageReferences || record.images || record.photos || [];
  const first = Array.isArray(images) ? images[0] : images;
  return typeof first === "string" ? first : first?.url || first?.src || "";
}

function latestDate(record = {}) {
  return record.createdAt || record.created_at || record.submittedAt || record.submitted_at || record.dateDiscovered || record.purchaseDate || record.saleDate || record.updatedAt || "";
}

function CollectibleMotif() {
  return <svg className="home-collectible-motif" viewBox="0 0 224 208" fill="none" aria-hidden="true" focusable="false">
    <path className="home-motif-guides" d="M12 104h200M112 8v192M15 36V20h16m162 0h16v16M15 172v16h16m162 0h16v-16" />
    <rect className="home-motif-back" x="42" y="40" width="106" height="150" rx="10" transform="rotate(-14 95 115)" />
    <rect className="home-motif-middle" x="80" y="31" width="106" height="150" rx="10" transform="rotate(11 133 106)" />
    <rect className="home-motif-front" x="68" y="22" width="112" height="164" rx="11" />
    <rect className="home-motif-window" x="79" y="34" width="90" height="110" rx="5" />
    <path className="home-motif-crystal" d="m124 50 28 39-28 39-28-39 28-39Zm0 0v78M96 89h56m-42-20 14 10 14-10m-28 40 14-10 14 10" />
    <path className="home-motif-detail" d="M80 155h48m-48 8h35m43-8h10v10h-10z" />
    <path className="home-motif-accent" d="M82 22h24M180 38v18" />
  </svg>;
}

export default function OperationsHome({
  setActiveTab, isOffline, onOpenBusiness, onOpenFind, onReportRestock, onOpenRestockReports,
  adaptiveActivity = {}, personalizationPreferences = {}, experiencePresentation,
  onOpenSellTrade, onOpenExperienceSettings, activeVaultItems = [], workspaceWatchlist = [],
  scoutSnapshot = {}, isWatchedEmberStore = () => false,
}) {
  const repository = useMemo(() => createFlipScoutRepository(), []);
  const state = useMemo(() => repository.load(), [repository]);
  const summary = useMemo(() => getDashboardSummary(state), [state]);
  const presentation = experiencePresentation || resolveExperiencePresentation();
  const sellerVisible = presentation.isSeller || presentation.isStore;
  const openFind = (screen = "deals", subview = "") => {
    if (onOpenFind) return onOpenFind(screen, subview);
    window.sessionStorage?.setItem(FIND_DESTINATION_KEY, JSON.stringify({ screen, subview }));
    setActiveTab("flipScout");
  };
  const unallocatedLots = state.lots.filter((lot) => {
    const allocated = state.inventory.filter((item) => item.lotId === lot.id).reduce((sum, item) => sum + Number(item.allocatedCost || 0), 0);
    return Math.abs(Number(lot.totalLotCost || 0) - allocated) > 0.01;
  }).length;
  const attentionRows = [
    { key: "deals", label: "Deals to review", count: summary.awaitingReview, detail: "Listings waiting for a decision", action: () => openFind("deals") },
    { key: "auctions", label: "Auctions ending soon", count: summary.endingSoon, detail: "Ending within 24 hours", action: () => openFind("auctions") },
    { key: "receive", label: "Purchases to receive", count: state.purchases.filter((row) => /purchased|in transit|awaiting/i.test(row.status || row.currentStatus || "")).length, detail: "Purchased records not marked received", action: () => openFind("records", "purchases") },
    { key: "process", label: "Inventory to process", count: state.inventory.filter((row) => /new|processing|needs/i.test(row.currentStatus || row.status || "")).length, detail: "Items needing record work", action: () => openFind("records", "inventory") },
    { key: "ship", label: "Items to ship", count: state.sales.filter((row) => /paid|ready|ship/i.test(row.status || "") && !/shipped|complete/i.test(row.status || "")).length, detail: "Sales not marked shipped", action: () => openFind("records", "sales") },
    { key: "receipts", label: "Missing receipts", count: state.expenses.filter((row) => !row.receiptReference).length, detail: "Expenses without receipt references", action: () => openFind("records", "expenses") },
    { key: "allocation", label: "Unallocated lot costs", count: unallocatedLots, detail: "Lot allocations do not reconcile", action: () => openFind("records", "inventory") },
    { key: "stale", label: "Stale inventory", count: summary.agingCount, detail: "Unsold for at least 90 days", action: () => openFind("records", "inventory") },
  ].filter((row) => row.count > 0).slice(0, 5);
  const bestDeal = state.deals.find((deal) => /strong|exceptional/i.test(deal.status || deal.recommendation || ""));
  const bestDealPrice = bestDeal?.currentBid ?? bestDeal?.askingPrice;
  const bestDealProfit = bestDeal?.projectedProfit ?? bestDeal?.expectedProfit;
  const bestDealHasPrice = bestDealPrice !== "" && bestDealPrice != null && Number.isFinite(Number(bestDealPrice));
  const bestDealHasProfit = bestDealProfit !== "" && bestDealProfit != null && Number.isFinite(Number(bestDealProfit));
  const recent = [
    ...(sellerVisible ? state.activity || [] : []),
    ...(adaptiveActivity.reports || []).map((report) => ({ id: `report-${report.id || report.reportId}`, title: `Restock report · ${report.storeName || report.store_name || "Store visit"}`, detail: report.productName || report.itemName || "Your saved observation", createdAt: latestDate(report) })),
    ...activeVaultItems.map((item) => ({ id: `collection-${item.id}`, title: `Collection · ${item.name || item.productName || "Saved item"}`, detail: "Added to your collection", createdAt: latestDate(item) })),
  ].filter((entry) => Number.isFinite(Date.parse(latestDate(entry))))
    .sort((a, b) => new Date(latestDate(b)).getTime() - new Date(latestDate(a)).getTime()).slice(0, 5);
  const sourcingBudget = Number(state.settings?.sourcingBudget || 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthSales = state.sales.filter((sale) => String(sale.saleDate || sale.createdAt || "").slice(0, 7) === currentMonth);
  const monthSalesWithRevenue = monthSales.filter((sale) => (sale.grossSalePrice !== "" && sale.grossSalePrice != null) || (sale.actualSalesProceeds !== "" && sale.actualSalesProceeds != null));
  const monthSalesWithProfit = monthSales.filter((sale) => (sale.realizedProfit !== "" && sale.realizedProfit != null) || (sale.actualProfit !== "" && sale.actualProfit != null));
  const inventoryWithCost = state.inventory.filter((item) => [item.allocatedItemCost, item.totalPurchaseCost, item.purchasePrice].some((value) => value !== "" && value != null && Number.isFinite(Number(value))));
  const monthRevenue = monthSalesWithRevenue.reduce((sum, sale) => sum + Number(sale.grossSalePrice ?? sale.actualSalesProceeds ?? 0), 0);
  const monthProfit = monthSalesWithProfit.reduce((sum, sale) => sum + Number(sale.realizedProfit ?? sale.actualProfit ?? 0), 0);
  const showBusinessSummary = sourcingBudget > 0 || inventoryWithCost.length > 0 || monthSalesWithRevenue.length > 0 || monthSalesWithProfit.length > 0;
  const homePreference = personalizationPreferences.pagePreferences?.hearth;
  const isVisible = (key) => !homePreference?.visibleKeys || homePreference.visibleKeys.includes(key);
  const followedStores = (scoutSnapshot.stores || []).filter(isWatchedEmberStore);
  const adaptiveEnabled = personalizationPreferences.smartRecommendationsEnabled !== false;
  const manualHome = Boolean(homePreference?.updatedAt);
  const pageCards = rankAdaptivePageItems([
    { key: "scoutSignals", title: "Your restock watch", detail: followedStores.length ? `${followedStores.length} followed store${followedStores.length === 1 ? "" : "s"}. Check the latest community reports.` : "Find stores, check recent reports, and follow the places you visit.", label: "Browse reports", icon: "find", activityKeys: ["reports"], action: onOpenRestockReports },
    { key: "vaultSnapshot", title: "Your collection", detail: activeVaultItems.length ? `${activeVaultItems.length} saved item${activeVaultItems.length === 1 ? "" : "s"}. Pick up where you left off.` : "Keep your cards, sets, and wants together.", label: "Open collection", icon: "inventory", activityKeys: ["collection"], action: () => setActiveTab("collectionWorkspace") },
    { key: "marketWatch", title: presentation.isCollector ? "Prices & wants" : "Find & compare", detail: workspaceWatchlist.length ? `${workspaceWatchlist.length} watched item${workspaceWatchlist.length === 1 ? "" : "s"}. Compare prices before your next purchase.` : presentation.isCollector ? "Look up cards and products, then save the ones you want." : "Compare deals, plan an offer, and follow upcoming auctions.", label: presentation.isCollector ? "Search cards & products" : "Explore Find", icon: "search", activityKeys: ["watchlist", "deals", "auctions"], action: () => presentation.isCollector ? setActiveTab("market") : openFind("deals") },
    ...(sellerVisible ? [{ key: "forgeSummary", title: presentation.copy.recordsTitle, detail: presentation.copy.recordsDetail, label: "Open inventory", icon: "business", activityKeys: ["sales", "purchases", "inventory", "expenses"], action: () => onOpenBusiness("inventory") }] : []),
  ].filter((card) => card.key === "forgeSummary" && !manualHome ? true : isVisible(card.key)), {
    activity: { ...state, ...adaptiveActivity,
      sales: [...state.sales, ...(adaptiveActivity.sales || [])],
      inventory: [...state.inventory, ...(adaptiveActivity.inventory || [])],
      expenses: [...state.expenses, ...(adaptiveActivity.expenses || [])],
    }, enabled: adaptiveEnabled,
    manualOrder: manualHome, preferredKeys: homePreference?.visibleKeys || [],
  });

  return <div className="ops-home-page home-layout">
    <PageHeader eyebrow="Code 3 TCG · Home" title="Welcome back." description="Find restocks. Share what you see. Help the next collector." />
    {isOffline ? <OfflineState action={<SecondaryButton onClick={() => window.location.reload()}>Try again</SecondaryButton>} /> : null}
    <section className="ops-home-section home-restock-hero" aria-labelledby="home-restock-title">
      <div className="home-restock-copy">
        <span className="home-group-label">Built around restocks</span>
        <h2 id="home-restock-title">Spotted stock?<br />Share an update.</h2>
        <p>Pick a store and tell us what you saw. Review, then share. Photos are optional.</p>
        <div className="home-restock-actions"><PrimaryButton onClick={onReportRestock}>Report a restock</PrimaryButton><SecondaryButton onClick={onOpenRestockReports}>Browse restocks</SecondaryButton></div>
        <small>Stock changes quickly. Check when a report was observed.</small>
      </div>
      <div className="home-restock-art"><CollectibleMotif /></div>
    </section>
    {sellerVisible && (isVisible("forgeSummary") || !manualHome) && attentionRows.length ? <section className="ops-home-section ops-attention-panel home-attention-pending">
      <SectionHeader title="Needs Attention" />
      {attentionRows.length ? <div className="ops-attention-list">{attentionRows.map((row) => <button type="button" key={row.key} onClick={row.action} aria-label={`${row.label}: ${row.count}. ${row.detail}`}><span className="ops-attention-count">{row.count}</span><span><strong>{row.label}</strong><small>{row.detail}</small></span><span aria-hidden="true">›</span></button>)}</div> : <p className="ops-compact-success"><span className="home-status-check" aria-hidden="true">✓</span><span>Nothing needs attention.</span></p>}
    </section> : null}
    <section className="ops-home-section home-workspaces">
      <div className="home-personal-heading"><SectionHeader title="For you" description={manualHome ? "Your chosen Home layout." : adaptiveEnabled ? "Shortcuts adapt to your saved activity. Your navigation stays in place." : "Your shortcuts, in a consistent order."} /><SecondaryButton onClick={onOpenExperienceSettings || (() => setActiveTab("settings"))}>Customize</SecondaryButton></div>
      <div className="home-personal-grid" aria-label="Personalized shortcuts">
        {pageCards.map((card) => <article className="home-personal-card" key={card.key} data-home-card={card.key}>
          <span className="home-shortcut-icon" aria-hidden="true"><AppNavIcon kind={card.icon} /></span>
          <h3>{card.title}</h3><p>{card.detail}</p>
          {card.key === "forgeSummary" ? <div className="home-business-links">{["inventory", "sales", "purchases"].map((view) => <SecondaryButton key={view} onClick={() => onOpenBusiness(view)}>{view === "inventory" ? presentation.copy.inventoryLabel : view[0].toUpperCase() + view.slice(1)}</SecondaryButton>)}</div> : card.key === "marketWatch" && presentation.isCollector ? <div className="home-business-links"><SecondaryButton onClick={card.action}>{card.label}</SecondaryButton>{onOpenSellTrade ? <SecondaryButton onClick={onOpenSellTrade}>Sell or trade</SecondaryButton> : null}</div> : <SecondaryButton onClick={card.action}>{card.label}</SecondaryButton>}
        </article>)}
      </div>
    </section>
    {bestDeal && isVisible("marketWatch") ? <section className="ops-home-section">
      <SectionHeader title={presentation.isCollector ? "A saved find" : "Best Opportunity"} />
      <article className="ops-home-best-opportunity">{recordImage(bestDeal) ? <img src={recordImage(bestDeal)} alt="" /> : <span className="ops-home-opportunity-placeholder" aria-hidden="true" />}<div><span>{bestDeal.marketplace || bestDeal.source || "Manual source"}</span><h3>{bestDeal.title}</h3><dl><div><dt>Price</dt><dd>{bestDealHasPrice ? formatCurrency(bestDealPrice) : "Not entered"}</dd></div>{sellerVisible ? <div><dt>Projected profit</dt><dd>{bestDealHasProfit ? formatCurrency(bestDealProfit) : "Needs analysis"}</dd></div> : null}</dl></div><PrimaryButton onClick={() => openFind("deals")}>Review</PrimaryButton></article>
    </section> : null}
    {recent.length && isVisible("todayActivity") ? <section className="ops-home-section">
      <SectionHeader title="Recent Activity" />
      <div className="ops-home-activity">{recent.map((activity) => <article key={activity.id} aria-label={`${activity.title}. ${activity.detail || ""}`}><span aria-hidden="true" /><strong>{activity.title}</strong><time dateTime={activity.createdAt}>{new Date(activity.createdAt).toLocaleDateString()}</time></article>)}</div>
    </section> : null}
    {showBusinessSummary && sellerVisible && (isVisible("forgeSummary") || !manualHome) ? <div className="ops-business-strip" aria-label={presentation.isStore ? "Store summary" : "Selling summary"}>
      <span><small>Buying Budget</small><strong>{sourcingBudget > 0 ? formatCurrency(sourcingBudget) : "Not set"}</strong></span>
      <span><small>Inventory at Cost</small><strong>{inventoryWithCost.length ? formatCurrency(summary.inventoryCost) : "—"}</strong></span>
      <span><small>Month Sales</small><strong>{monthSalesWithRevenue.length ? formatCurrency(monthRevenue) : "—"}</strong></span>
      <span><small>Month Profit</small><strong>{monthSalesWithProfit.length ? formatCurrency(monthProfit) : "—"}</strong></span>
    </div> : null}
  </div>;
}
