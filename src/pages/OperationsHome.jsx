import { useMemo } from "react";
import { OfflineState, PrimaryButton, SectionHeader, SecondaryButton } from "../components/operations/OperationsUI.jsx";
import { createFlipScoutRepository } from "../features/flipScout/storageRepository.js";
import { formatCurrency, getDashboardSummary } from "../features/flipScout/selectors.js";

const FIND_DESTINATION_KEY = "private-business-hub.flip-scout.destination";

function recordImage(record = {}) {
  const images = record.imageReferences || record.images || record.photos || [];
  const first = Array.isArray(images) ? images[0] : images;
  return typeof first === "string" ? first : first?.url || first?.src || "";
}

function latestDate(record = {}) {
  return record.updatedAt || record.createdAt || record.dateDiscovered || record.purchaseDate || record.saleDate || "";
}

export default function OperationsHome({ setActiveTab, isOffline }) {
  const repository = useMemo(() => createFlipScoutRepository(), []);
  const state = useMemo(() => repository.load(), [repository]);
  const summary = useMemo(() => getDashboardSummary(state), [state]);
  const openFind = (screen = "deals", subview = "") => {
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
  const recent = [...(state.activity || [])].sort((a, b) => new Date(latestDate(b)).getTime() - new Date(latestDate(a)).getTime()).slice(0, 5);
  const sourcingBudget = Number(state.settings?.sourcingBudget || 0);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthSales = state.sales.filter((sale) => String(sale.saleDate || sale.createdAt || "").slice(0, 7) === currentMonth);
  const monthSalesWithRevenue = monthSales.filter((sale) => (sale.grossSalePrice !== "" && sale.grossSalePrice != null) || (sale.actualSalesProceeds !== "" && sale.actualSalesProceeds != null));
  const monthSalesWithProfit = monthSales.filter((sale) => (sale.realizedProfit !== "" && sale.realizedProfit != null) || (sale.actualProfit !== "" && sale.actualProfit != null));
  const inventoryWithCost = state.inventory.filter((item) => [item.allocatedItemCost, item.totalPurchaseCost, item.purchasePrice].some((value) => value !== "" && value != null && Number.isFinite(Number(value))));
  const monthRevenue = monthSalesWithRevenue.reduce((sum, sale) => sum + Number(sale.grossSalePrice ?? sale.actualSalesProceeds ?? 0), 0);
  const monthProfit = monthSalesWithProfit.reduce((sum, sale) => sum + Number(sale.realizedProfit ?? sale.actualProfit ?? 0), 0);
  const showBusinessSummary = sourcingBudget > 0 || inventoryWithCost.length > 0 || monthSalesWithRevenue.length > 0 || monthSalesWithProfit.length > 0;

  return <div className="ops-home-page">
    {isOffline ? <OfflineState action={<SecondaryButton onClick={() => window.location.reload()}>Try again</SecondaryButton>} /> : null}
    <section className="ops-home-section ops-attention-panel">
      <SectionHeader title="Needs Attention" />
      {attentionRows.length ? <div className="ops-attention-list">{attentionRows.map((row) => <button type="button" key={row.key} onClick={row.action} aria-label={`${row.label}: ${row.count}. ${row.detail}`}><span className="ops-attention-count">{row.count}</span><span><strong>{row.label}</strong><small>{row.detail}</small></span><span aria-hidden="true">›</span></button>)}</div> : <p className="ops-compact-success"><span aria-hidden="true">✓</span> Nothing needs attention.</p>}
    </section>
    {bestDeal ? <section className="ops-home-section">
      <SectionHeader title="Best Opportunity" />
      <article className="ops-home-best-opportunity">{recordImage(bestDeal) ? <img src={recordImage(bestDeal)} alt="" /> : <span className="ops-home-opportunity-placeholder" aria-hidden="true" />}<div><span>{bestDeal.marketplace || bestDeal.source || "Manual source"}</span><h3>{bestDeal.title}</h3><dl><div><dt>Price</dt><dd>{bestDealHasPrice ? formatCurrency(bestDealPrice) : "Not entered"}</dd></div><div><dt>Projected profit</dt><dd>{bestDealHasProfit ? formatCurrency(bestDealProfit) : "Needs analysis"}</dd></div></dl></div><PrimaryButton onClick={() => openFind("deals")}>Review</PrimaryButton></article>
    </section> : null}
    {recent.length ? <section className="ops-home-section">
      <SectionHeader title="Recent Activity" />
      <div className="ops-home-activity">{recent.map((activity) => <article key={activity.id} aria-label={`${activity.title}. ${activity.detail || ""}`}><span aria-hidden="true" /><strong>{activity.title}</strong><time dateTime={activity.createdAt}>{new Date(activity.createdAt).toLocaleDateString()}</time></article>)}</div>
    </section> : null}
    {showBusinessSummary ? <div className="ops-business-strip" aria-label="Business summary">
      <span><small>Buying Budget</small><strong>{sourcingBudget > 0 ? formatCurrency(sourcingBudget) : "Not set"}</strong></span>
      <span><small>Inventory at Cost</small><strong>{inventoryWithCost.length ? formatCurrency(summary.inventoryCost) : "—"}</strong></span>
      <span><small>Month Sales</small><strong>{monthSalesWithRevenue.length ? formatCurrency(monthRevenue) : "—"}</strong></span>
      <span><small>Month Profit</small><strong>{monthSalesWithProfit.length ? formatCurrency(monthProfit) : "—"}</strong></span>
    </div> : null}
  </div>;
}
