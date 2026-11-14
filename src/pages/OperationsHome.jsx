import HomeShortcutEditor from "../components/HomeShortcutEditor.jsx";
import { dateGroup, relativeUiTime } from "../utils/uiTime.mjs";
import { groupCollectionCopies } from "../utils/collectionCopyGroups.mjs";
import { PrivateStorageImage } from "../components/PrivateReceipt.jsx";
import { useMemo, useState } from "react";
import { OfflineState, PageHeader, PrimaryButton, SectionHeader, SecondaryButton } from "../components/operations/OperationsUI.jsx";
import { AppNavIcon } from "../components/command-system/AppNavIcon.jsx";
import { BrandIdentity } from "../components/brand/BrandIdentity.jsx";
import ItemPhoto from "../components/ItemPhoto.jsx";
import { getItemImageUrl } from "../utils/productDisplayUtils.js";
import { inferOwnedItemPurpose, OWNED_ITEM_PURPOSES } from "../features/ownedItems/ownedItemPurpose.js";
import { createFlipScoutRepository } from "../features/flipScout/storageRepository.js";
import { formatCurrency, getDashboardSummary } from "../features/flipScout/selectors.js";
import { rankAdaptivePageItems } from "../utils/adaptivePageItems.js";
import { resolveExperiencePresentation } from "../utils/experiencePresentation.js";
import "./home-layout.css";
import RegionalCommunityBanner from "../components/RegionalCommunityBanner.jsx";

const FIND_DESTINATION_KEY = "private-business-hub.flip-scout.destination";

function recordImage(record = {}) {
  const images = record.imageReferences || record.images || record.photos || [];
  const first = Array.isArray(images) ? images[0] : images;
  return typeof first === "string" ? first : first?.url || first?.src || "";
}

function latestDate(record = {}) {
  return record.createdAt || record.created_at || record.submittedAt || record.submitted_at || record.dateDiscovered || record.purchaseDate || record.saleDate || record.updatedAt || "";
}

function SavedItemPreview({ items = [], onOpen }) {
  if (!items.length) return null;
  return <div className="home-collection-peek" aria-label="Items from your saved records">{items.slice(0, 3).map((item) => <figure key={item.id}><button type="button" onClick={() => onOpen?.(item)} aria-label={`Open ${item.name || item.productName || item.title || "saved item"}`}><ItemPhoto src={getItemImageUrl(item)} alt="" fallbackClassName="home-collection-peek__placeholder" /></button><figcaption>{item.name || item.productName || item.title || "Saved item"}</figcaption></figure>)}</div>;
}

export default function OperationsHome({
  setActiveTab, isOffline, onOpenBusiness, onOpenFind, onReportRestock, onOpenRestockReports,
  adaptiveActivity = {}, personalizationPreferences = {}, experiencePresentation,
  onOpenSellTrade, onOpenExperienceSettings, activeVaultItems = [], workspaceWatchlist = [],
  scoutSnapshot = {}, isWatchedEmberStore = () => false,
  onOpenCollectionItem, onOpenInventoryItem, onOpenReport, onOpenStoreReports, onOpenFollowedReports, onSaveHomeShortcuts,
}) {
  const [allAttention, setAllAttention] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const collectionGroups = useMemo(() => groupCollectionCopies(activeVaultItems), [activeVaultItems]);
  const collectionQuantity = collectionGroups.reduce((sum, group) => sum + group.quantity, 0);
  const openCollectionItem = item => onOpenCollectionItem ? onOpenCollectionItem(item) : setActiveTab("collectionWorkspace");
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
    { key: "stale", label: "Stale inventory", count: summary.agingCount, detail: summary.agingBuckets ? `90+ days: ${summary.agingBuckets.days90} · 180+ days: ${summary.agingBuckets.days180}${summary.agingBuckets.undated ? ` · ${summary.agingBuckets.undated} without a purchase date (not counted)` : ""}` : "Unsold for at least 90 days", action: () => openFind("records", "inventory") },
  ].filter((row) => row.count > 0);
  const bestDeal = state.deals.find((deal) => /strong|exceptional/i.test(deal.status || deal.recommendation || ""));
  const bestDealPrice = bestDeal?.currentBid ?? bestDeal?.askingPrice;
  const bestDealProfit = bestDeal?.projectedProfit ?? bestDeal?.expectedProfit;
  const bestDealHasPrice = bestDealPrice !== "" && bestDealPrice != null && Number.isFinite(Number(bestDealPrice));
  const bestDealHasProfit = bestDealProfit !== "" && bestDealProfit != null && Number.isFinite(Number(bestDealProfit));
  const recent = [
    ...(sellerVisible ? state.activity || [] : []),
    ...(adaptiveActivity.reports || []).map((report) => ({ id: `report-${report.id || report.reportId}`, title: `Restock report · ${report.storeName || report.store_name || "Store visit"}`, detail: report.productName || report.itemName || "Your saved observation", createdAt: latestDate(report), open: () => onOpenReport ? onOpenReport(report) : onOpenRestockReports?.() })),
    ...activeVaultItems.map((item) => ({ id: `collection-${item.id}`, title: `Collection · ${item.name || item.productName || "Saved item"}`, detail: "Added to your collection", createdAt: latestDate(item), open: () => openCollectionItem(item) })),
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
    { key: "scoutSignals", title: "Your restock watch", detail: followedStores.length ? `${followedStores.length} followed store${followedStores.length === 1 ? "" : "s"}` : "Follow the stores you visit to keep their reports close.", label: followedStores.length ? "View followed stores’ reports" : "Browse all restocks", icon: "find", activityKeys: ["reports"], action: followedStores.length ? onOpenFollowedReports || onOpenRestockReports : onOpenRestockReports },
    { key: "vaultSnapshot", title: "Your collection", detail: activeVaultItems.length ? `${collectionGroups.length} product${collectionGroups.length === 1 ? "" : "s"} · ${collectionQuantity} total quantity · ${activeVaultItems.length} purchase record${activeVaultItems.length === 1 ? "" : "s"}` : "Add your first card or sealed product.", label: "Open collection", icon: "inventory", activityKeys: ["collection"], action: () => setActiveTab("collectionWorkspace") },
    { key: "marketWatch", title: presentation.isCollector ? "Prices & wants" : "Find & compare", detail: workspaceWatchlist.length ? `${workspaceWatchlist.length} watched item${workspaceWatchlist.length === 1 ? "" : "s"}` : presentation.isCollector ? "Look up a card or product. Save it to your wants." : "Review saved deals and upcoming auctions.", label: presentation.isCollector ? "Search cards & products" : "Explore Find", icon: "search", activityKeys: ["watchlist", "deals", "auctions"], action: () => presentation.isCollector ? setActiveTab("market") : openFind("deals") },
    ...(sellerVisible ? [{ key: "forgeSummary", title: presentation.copy.recordsTitle, detail: presentation.copy.recordsDetail, label: "Open inventory", icon: "business", activityKeys: ["sales", "purchases", "inventory", "expenses"], action: () => onOpenBusiness("inventory") }] : []),
  ].filter((card) => card.key === "forgeSummary" && !manualHome ? true : isVisible(card.key)), {
    activity: { ...state, ...adaptiveActivity,
      sales: [...state.sales, ...(adaptiveActivity.sales || [])],
      inventory: [...state.inventory, ...(adaptiveActivity.inventory || [])],
      expenses: [...state.expenses, ...(adaptiveActivity.expenses || [])],
    }, enabled: adaptiveEnabled,
    manualOrder: manualHome, preferredKeys: homePreference?.visibleKeys || [],
  });

  return <div className="ops-home-page home-layout home-layout--refined home-layout--lounge">
    <PageHeader eyebrow={<><span className="home-desktop-context">Home</span><span className="home-mobile-identity"><BrandIdentity /></span></>} title={activeVaultItems.length || recent.length || workspaceWatchlist.length ? "Welcome back." : "Make yourself at home."} description={activeVaultItems.length || recent.length || workspaceWatchlist.length ? "Your collection, local reports, and saved finds." : "Start with your first item or explore restock reports near you."} />
    {isOffline ? <OfflineState action={<SecondaryButton onClick={() => window.location.reload()}>Try again</SecondaryButton>} /> : null}
    <section className="ops-home-section home-restock-hero" aria-labelledby="home-restock-title">
      <div className="home-restock-copy">
        <h2 id="home-restock-title">Restock reports</h2>
        <p>Share stocked or empty shelves in your area.</p>
        <div className="home-restock-actions"><PrimaryButton onClick={onReportRestock}>Report a restock</PrimaryButton><SecondaryButton onClick={onOpenRestockReports}>Browse all restocks</SecondaryButton></div>
      </div>
    </section>
    {sellerVisible && (isVisible("forgeSummary") || !manualHome) && attentionRows.length ? <section className="ops-home-section ops-attention-panel home-attention-pending">
      <SectionHeader title="Needs attention" />
      <div className="ops-attention-list">{(allAttention ? attentionRows : attentionRows.slice(0, 5)).map((row) => <button type="button" key={row.key} onClick={row.action} aria-label={`${row.label}: ${row.count}. ${row.detail}`}><span className="ops-attention-count">{row.count}</span><span><strong>{row.label}</strong><small>{row.detail}</small></span><span aria-hidden="true">›</span></button>)}</div>{attentionRows.length > 5 && <SecondaryButton aria-expanded={allAttention} onClick={() => setAllAttention(value => !value)}>{allAttention ? "Show fewer" : `See all ${attentionRows.length} categories`}</SecondaryButton>}
    </section> : null}
    <section className="ops-home-section home-workspaces">
      <div className="home-personal-heading"><SectionHeader title="Your shortcuts" /><SecondaryButton onClick={() => onSaveHomeShortcuts ? setCustomizing(true) : (onOpenExperienceSettings || (() => setActiveTab("settings")))()} aria-label="Customize your Home shortcuts">Customize</SecondaryButton></div>
      {customizing && <HomeShortcutEditor visibleKeys={homePreference?.visibleKeys} business={sellerVisible} onApply={onSaveHomeShortcuts} onCancel={() => setCustomizing(false)} />}
      <div className="home-personal-grid" aria-label="Personalized shortcuts">
        {pageCards.map((card) => <article className="home-personal-card" key={card.key} data-home-card={card.key}>
          <div className="home-card-heading"><span className="home-shortcut-icon" aria-hidden="true"><AppNavIcon kind={card.icon} /></span><h3>{card.title}</h3></div>
          <p>{card.detail}</p>
          {card.key === "scoutSignals" && followedStores.length ? <ul className="home-followed-stores" aria-label="Followed stores">{followedStores.slice(0, 3).map((store, index) => <li key={store.id || `${store.name}-${index}`}><button type="button" onClick={() => onOpenStoreReports ? onOpenStoreReports(store) : onOpenRestockReports?.()}><span><strong>{store.name || store.storeName || "Followed store"}</strong>{store.city && <small>{store.city}</small>}</span>{(() => { const latest = [...(scoutSnapshot.reports || [])].filter(report => String(report.storeId || report.store_id) === String(store.id)).filter(report => Number.isFinite(Date.parse(report.observedAt || report.observed_at || ""))).sort((a,b) => Date.parse(b.observedAt || b.observed_at) - Date.parse(a.observedAt || a.observed_at))[0]; return latest ? <small>Last observed {relativeUiTime(latest.observedAt || latest.observed_at)}</small> : <small>View reports</small>; })()}</button></li>)}{followedStores.length > 3 ? <li className="home-followed-stores__more">And {followedStores.length - 3} more</li> : null}</ul> : null}
          {card.key === "vaultSnapshot" ? <SavedItemPreview items={activeVaultItems} onOpen={openCollectionItem} /> : card.key === "forgeSummary" && sellerVisible ? <SavedItemPreview items={(adaptiveActivity.inventory || []).filter((item) => inferOwnedItemPurpose(item) === OWNED_ITEM_PURPOSES.FOR_RESALE)} onOpen={item => onOpenInventoryItem ? onOpenInventoryItem(item) : onOpenBusiness("inventory")} /> : null}
          {card.key === "forgeSummary" ? <div className="home-business-links">{["inventory", "sales", "purchases"].map((view) => <SecondaryButton key={view} onClick={() => onOpenBusiness(view)}>{view === "inventory" ? presentation.copy.inventoryLabel : view[0].toUpperCase() + view.slice(1)}</SecondaryButton>)}</div> : card.key === "marketWatch" && presentation.isCollector ? <div className="home-business-links"><SecondaryButton onClick={card.action}>{card.label}</SecondaryButton>{onOpenSellTrade ? <SecondaryButton onClick={onOpenSellTrade}>Sell or trade</SecondaryButton> : null}</div> : <SecondaryButton onClick={card.action}>{card.label}</SecondaryButton>}
        </article>)}
      </div>
    </section>
    {bestDeal && isVisible("marketWatch") ? <section className="ops-home-section">
      <SectionHeader title="A saved find" />
      <article className="ops-home-best-opportunity">{recordImage(bestDeal) ? <PrivateStorageImage src={recordImage(bestDeal)} alt="" /> : <span className="ops-home-opportunity-placeholder" aria-hidden="true" />}<div><span>{bestDeal.marketplace || bestDeal.source || "Manual source"}</span><h3>{bestDeal.title}</h3><dl><div><dt>Price</dt><dd>{bestDealHasPrice ? formatCurrency(bestDealPrice) : "Not entered"}</dd></div>{sellerVisible ? <div><dt>Projected profit</dt><dd>{bestDealHasProfit ? formatCurrency(bestDealProfit) : "Needs analysis"}</dd></div> : null}</dl></div><PrimaryButton onClick={() => openFind("deals")}>Review</PrimaryButton></article>
    </section> : null}
    {recent.length && isVisible("todayActivity") ? <section className="ops-home-section">
      <SectionHeader title="Recently saved" />
      <div className="home-recent-list">{recent.map((activity) => <article key={activity.id}>{activity.open ? <button type="button" onClick={activity.open}><strong>{activity.title}</strong>{activity.detail && <span>{activity.detail}</span>}<span aria-hidden="true">›</span></button> : <div><strong>{activity.title}</strong>{activity.detail && <p>{activity.detail}</p>}</div>}<time dateTime={latestDate(activity)} title={new Date(latestDate(activity)).toLocaleString()}>{["Today", "Yesterday"].includes(dateGroup(latestDate(activity))) ? dateGroup(latestDate(activity)) : relativeUiTime(latestDate(activity))}</time></article>)}</div>
    </section> : null}
    {showBusinessSummary && sellerVisible && (isVisible("forgeSummary") || !manualHome) ? <div className="ops-business-strip" aria-label={presentation.isStore ? "Store summary" : "Selling summary"}>
      <span><small>Buying Budget</small><strong>{sourcingBudget > 0 ? formatCurrency(sourcingBudget) : "Not set"}</strong></span>
      <span><small>Inventory at Cost</small><strong>{inventoryWithCost.length ? formatCurrency(summary.inventoryCost) : "—"}</strong></span>
      <span><small>Month Sales</small><strong>{monthSalesWithRevenue.length ? formatCurrency(monthRevenue) : "—"}</strong></span>
      <span><small>Month Profit</small><strong>{monthSalesWithProfit.length ? formatCurrency(monthProfit) : "—"}</strong></span>
    </div> : null}
    <details className="home-community-details"><summary>Community & feedback<span aria-hidden="true">+</span></summary><RegionalCommunityBanner /></details>
  </div>;
}
