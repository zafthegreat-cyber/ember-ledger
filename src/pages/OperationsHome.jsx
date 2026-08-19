import { useMemo } from "react";
import { OfflineState, PageHeader, PrimaryButton, QuietButton, SectionHeader, SecondaryButton } from "../components/operations/OperationsUI.jsx";
import { AppNavIcon } from "../components/command-system/AppNavIcon.jsx";
import { createFlipScoutRepository } from "../features/flipScout/storageRepository.js";
import { formatCurrency, getDashboardSummary } from "../features/flipScout/selectors.js";

const FIND_DESTINATION_KEY = "private-business-hub.flip-scout.destination";

function greetingForNow() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function recordImage(record = {}) {
  const images = record.imageReferences || record.images || record.photos || [];
  const first = Array.isArray(images) ? images[0] : images;
  return typeof first === "string" ? first : first?.url || first?.src || "";
}

function latestDate(record = {}) {
  return record.updatedAt || record.createdAt || record.dateDiscovered || record.purchaseDate || record.saleDate || "";
}

export default function OperationsHome({ currentUserProfile, profileForm, openAddActionSheet, setActiveTab, isOffline }) {
  const repository = useMemo(() => createFlipScoutRepository(), []);
  const state = useMemo(() => repository.load(), [repository]);
  const summary = useMemo(() => getDashboardSummary(state), [state]);
  const displayName = String(profileForm?.displayName || currentUserProfile?.displayName || currentUserProfile?.name || "").trim();
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
  const recent = [...(state.activity || [])].sort((a, b) => new Date(latestDate(b)).getTime() - new Date(latestDate(a)).getTime()).slice(0, 5);
  const sourcingBudget = Number(state.settings?.sourcingBudget || 0);

  return <div className="ops-home-page">
    <PageHeader eyebrow="Home" title={`${greetingForNow()}${displayName ? `, ${displayName}` : ""}.`} actions={<PrimaryButton onClick={() => openAddActionSheet("home-global-add")}><AppNavIcon kind="plus" />Add</PrimaryButton>} />
    {isOffline ? <OfflineState action={<SecondaryButton onClick={() => window.location.reload()}>Try again</SecondaryButton>} /> : null}
    <section className="ops-home-section ops-attention-panel">
      <SectionHeader title="Needs Attention" />
      {attentionRows.length ? <div className="ops-attention-list">{attentionRows.map((row) => <button type="button" key={row.key} onClick={row.action} aria-label={`${row.label}: ${row.count}. ${row.detail}`}><span className="ops-attention-count">{row.count}</span><strong>{row.label}</strong><span aria-hidden="true">›</span></button>)}</div> : <p className="ops-compact-empty">Nothing needs attention.</p>}
    </section>
    <section className="ops-home-section">
      <SectionHeader title="Best Opportunity" actions={<QuietButton onClick={() => openFind("deals")}>Find</QuietButton>} />
      {bestDeal ? <article className="ops-home-best-opportunity">{recordImage(bestDeal) ? <img src={recordImage(bestDeal)} alt="" /> : null}<div><span>{bestDeal.marketplace || bestDeal.source || "Manual source"}</span><h3>{bestDeal.title}</h3><dl><div><dt>Price</dt><dd>{formatCurrency(bestDeal.askingPrice)}</dd></div><div><dt>Projected profit</dt><dd>{bestDeal.projectedProfit ? formatCurrency(bestDeal.projectedProfit) : "Needs analysis"}</dd></div></dl><p>{bestDeal.confidence || "Unrated"} confidence · {bestDeal.riskLevel || bestDeal.risk || "Unrated"} risk</p></div></article> : <p className="ops-compact-empty">No strong opportunity is recorded.</p>}
    </section>
    <section className="ops-home-section">
      <SectionHeader title="Recent Activity" />
      {recent.length ? <div className="ops-home-activity">{recent.map((activity) => <article key={activity.id} aria-label={`${activity.title}. ${activity.detail || ""}`}><span aria-hidden="true" /><strong>{activity.title}</strong><time dateTime={activity.createdAt}>{new Date(activity.createdAt).toLocaleDateString()}</time></article>)}</div> : <p className="ops-compact-empty">No recent activity.</p>}
    </section>
    <div className="ops-business-strip" aria-label="Business summary">
      <span><small>Buying budget</small><strong>{sourcingBudget > 0 ? formatCurrency(sourcingBudget) : "Not set"}</strong></span>
      <span><small>Inventory cost</small><strong>{state.inventory.length ? formatCurrency(summary.inventoryCost) : "—"}</strong></span>
      <span><small>Revenue</small><strong>{state.sales.length ? formatCurrency(summary.realizedSalesRevenue) : "—"}</strong></span>
      <span><small>Profit</small><strong>{state.sales.length ? formatCurrency(summary.realizedProfit) : "—"}</strong></span>
    </div>
  </div>;
}
