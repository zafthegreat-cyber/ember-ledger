import { useMemo } from "react";
import {
  ConfidenceIndicator,
  DealCard,
  EmptyState,
  MetricCard,
  OfflineState,
  PageHeader,
  PrimaryButton,
  QuietButton,
  RiskIndicator,
  SectionHeader,
  SecondaryButton,
  StatusBadge,
} from "../components/operations/OperationsUI.jsx";
import { AppNavIcon } from "../components/command-system/AppNavIcon.jsx";
import { createFlipScoutRepository } from "../features/flipScout/storageRepository.js";
import { formatCurrency, getDashboardSummary, timingIndicator } from "../features/flipScout/selectors.js";

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

export default function OperationsHome({ currentUserProfile, profileForm, openAddActionSheet, openUtilityPage, setActiveTab, isOffline }) {
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
    { key: "deals", label: "Deals to review", count: summary.awaitingReview, detail: "Listings and provider results waiting for a decision", action: () => openFind("deals") },
    { key: "auctions", label: "Auctions ending soon", count: summary.endingSoon, detail: "Ending within the next 24 hours", action: () => openFind("auctions") },
    { key: "receive", label: "Purchases to receive", count: state.purchases.filter((row) => /purchased|in transit|awaiting/i.test(row.status || row.currentStatus || "")).length, detail: "Purchased records not marked received", action: () => openFind("records", "purchases") },
    { key: "process", label: "Inventory to process", count: state.inventory.filter((row) => /new|processing|needs/i.test(row.currentStatus || row.status || "")).length, detail: "Items needing allocation, condition, or storage details", action: () => openFind("records", "inventory") },
    { key: "ship", label: "Items to ship", count: state.sales.filter((row) => /paid|ready|ship/i.test(row.status || "") && !/shipped|complete/i.test(row.status || "")).length, detail: "Recorded sales not marked shipped", action: () => openFind("records", "sales") },
    { key: "receipts", label: "Missing expenses or receipts", count: state.expenses.filter((row) => !row.receiptReference).length, detail: "Expense records without a receipt reference", action: () => openFind("records", "expenses") },
    { key: "allocation", label: "Unallocated lot costs", count: unallocatedLots, detail: "Lots whose item allocations do not reconcile", action: () => openFind("records", "inventory") },
    { key: "stale", label: "Stale inventory", count: summary.agingCount, detail: "Unsold inventory at least 90 days old", action: () => openFind("records", "inventory") },
  ].filter((row) => row.count > 0);
  const strongDeals = state.deals.filter((deal) => /strong|exceptional/i.test(deal.status || deal.recommendation || "")).slice(0, 3);
  const upcoming = state.auctions.filter((auction) => auction.endDateTime || auction.pickupDeadline).sort((a, b) => new Date(a.endDateTime || a.pickupDeadline).getTime() - new Date(b.endDateTime || b.pickupDeadline).getTime()).slice(0, 4);
  const recent = [...(state.activity || [])].sort((a, b) => new Date(latestDate(b)).getTime() - new Date(latestDate(a)).getTime()).slice(0, 6);
  const sourcingBudget = Number(state.settings?.sourcingBudget || 0);

  return <div className="ops-home-page">
    <PageHeader eyebrow="Today" title={`${greetingForNow()}${displayName ? `, ${displayName}` : ""}.`} description="Your next sourcing, inventory, sales, and bookkeeping decisions are organized here." actions={<><QuietButton onClick={() => openUtilityPage("profile")}>Profile</QuietButton><PrimaryButton onClick={() => openAddActionSheet("home-global-add")}><AppNavIcon kind="plus" />Add</PrimaryButton></>} />
    {isOffline ? <OfflineState action={<SecondaryButton onClick={() => window.location.reload()}>Try again</SecondaryButton>} /> : null}

    <section className="ops-home-section ops-attention-panel">
      <SectionHeader eyebrow="Needs Attention" title="Review before it becomes a problem" />
      {attentionRows.length ? <div className="ops-attention-list">{attentionRows.map((row) => <button type="button" key={row.key} onClick={row.action}><span className="ops-attention-count">{row.count}</span><span><strong>{row.label}</strong><small>{row.detail}</small></span><span aria-hidden="true">›</span></button>)}</div> : <EmptyState title="Nothing needs attention">New reviews, deadlines, and record gaps will appear here when real data exists.</EmptyState>}
    </section>

    <section className="ops-home-section">
      <SectionHeader eyebrow="Best Opportunities" title="Deals worth a closer look" actions={<QuietButton onClick={() => openFind("deals")}>View Deals</QuietButton>} />
      {strongDeals.length ? <div className="ops-opportunity-list">{strongDeals.map((deal) => <DealCard key={deal.id} image={recordImage(deal)} imageAlt=""><div className="ops-home-deal-copy"><StatusBadge tone="success">{deal.status || deal.recommendation}</StatusBadge><h3>{deal.title}</h3><div className="ops-home-deal-money"><span>Asking <strong>{formatCurrency(deal.askingPrice)}</strong></span><span>Projected profit <strong>{deal.projectedProfit ? formatCurrency(deal.projectedProfit) : "Not set"}</strong></span></div><div className="ops-indicator-row"><ConfidenceIndicator value={deal.confidence || "Not set"} /><RiskIndicator value={deal.riskLevel || deal.risk || "Not set"} /></div><SecondaryButton onClick={() => openFind("deals")}>Review</SecondaryButton></div></DealCard>)}</div> : <EmptyState title="No strong opportunities yet">Listings appear only after a real record receives a strong status.</EmptyState>}
    </section>

    <section className="ops-home-section ops-today-panel">
      <SectionHeader eyebrow="Today" title="Budget, actions, and deadlines" description="Use the action that matches what actually happened." />
      <div className="ops-budget-panel" aria-label="Available sourcing budget"><div><span>Available sourcing budget</span><strong>{sourcingBudget > 0 ? formatCurrency(sourcingBudget) : "Not set"}</strong><small>{sourcingBudget > 0 ? "Planning limit saved in this workspace" : "No sourcing budget has been recorded."}</small></div><SecondaryButton onClick={() => openFind("appraise")}>Analyze Deal</SecondaryButton></div>
      <div className="ops-home-actions">{[["Analyze Deal", "find", () => openFind("appraise")], ["Add Auction", "calendar", () => openFind("auctions", "new")], ["Record Purchase", "clipboard", () => openFind("records", "purchases")], ["Record Sale", "sell", () => openFind("records", "sales")]].map(([label, icon, action]) => <button type="button" key={label} onClick={action}><AppNavIcon kind={icon} /><span>{label}</span></button>)}</div>
      {upcoming.length ? <div className="ops-deadline-list">{upcoming.map((auction) => { const timing = timingIndicator(auction.endDateTime || auction.pickupDeadline) || { tone: "neutral", label: "Date recorded" }; return <button type="button" key={auction.id} onClick={() => openFind("auctions")}><span><strong>{auction.title}</strong><small>{auction.location || auction.source || "Location not recorded"}</small></span><StatusBadge tone={timing.tone === "danger" ? "danger" : timing.tone === "neutral" ? "neutral" : "warning"}>{timing.label}</StatusBadge></button>; })}</div> : <EmptyState title="No upcoming deadlines">Add a real auction or pickup deadline to see it here.</EmptyState>}
    </section>

    <section className="ops-home-section ops-business-snapshot">
      <SectionHeader eyebrow="Business Snapshot" title="Recorded results" description="Only saved records are included. Projected values are planning assumptions, not market guarantees." actions={<QuietButton onClick={() => openFind("records", "results")}>Compare projected vs. actual</QuietButton>} />
      <div><MetricCard label="Inventory cost" value={state.inventory.length ? formatCurrency(summary.inventoryCost) : "—"} helper={state.inventory.length ? "Allocated cost basis" : "No inventory records"} /><MetricCard label="Projected inventory resale" value={state.inventory.length ? formatCurrency(summary.projectedInventoryValue) : "—"} helper={state.inventory.length ? "Saved midpoint assumptions" : "No projections recorded"} /><MetricCard label="Realized revenue" value={state.sales.length ? formatCurrency(summary.realizedSalesRevenue) : "—"} helper={state.sales.length ? "Completed sales" : "No sales recorded"} /><MetricCard label="Realized profit" value={state.sales.length ? formatCurrency(summary.realizedProfit) : "—"} helper={state.sales.length ? "After recorded costs" : "No realized results"} tone={summary.realizedProfit > 0 ? "success" : "neutral"} /></div>
    </section>

    <section className="ops-home-section">
      <SectionHeader eyebrow="Recent Activity" title="What changed" />
      {recent.length ? <div className="ops-home-activity">{recent.map((activity) => <article key={activity.id}><span aria-hidden="true" /><div><strong>{activity.title}</strong><p>{activity.detail}</p></div><time dateTime={activity.createdAt}>{new Date(activity.createdAt).toLocaleDateString()}</time></article>)}</div> : <EmptyState title="No recent activity">Your real sourcing and business record changes will appear here.</EmptyState>}
    </section>
  </div>;
}
