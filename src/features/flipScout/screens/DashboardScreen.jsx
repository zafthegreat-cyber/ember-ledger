import { getDashboardSummary, formatCurrency } from "../selectors.js";
import { EmptyState, SectionHeading } from "../components/Fields.jsx";
import { MetricCard, SourceBadge, StatusBadge } from "../../../components/operations/OperationsUI.jsx";
import { AppNavIcon } from "../../../components/command-system/AppNavIcon.jsx";

const QUICK_ACTIONS = [
  ["Paste Listing", "deals", "url"],
  ["Analyze Deal", "appraise"],
  ["Add Auction", "auctions", "new"],
  ["Record Purchase", "records", "purchases"],
  ["Add Inventory", "records", "inventory"],
  ["Record Sale", "records", "sales"],
  ["Add Expense", "records", "expenses"],
  ["Add Mileage", "records", "mileage"],
  ["View Deal Feed", "deals"],
];

export default function DashboardScreen({ state, onNavigate }) {
  const summary = getDashboardSummary(state);
  const recent = (state.activity || []).slice(0, 8);
  const pendingEbay = state.providerListings.filter((row) => row.providerId === "ebay" && ["Pending Review", "Needs Re-review"].includes(row.reviewStatus)).length;
  const enabledRules = state.searchRules.filter((rule) => rule.enabled).length;

  return (
    <div className="flip-screen flip-dashboard-screen">
      <section className="flip-hero-panel flip-find-overview-hero">
        <div>
          <span className="flip-eyebrow">Opportunity workspace</span>
          <h1>Review the opportunity before the commitment.</h1>
          <p>Search configured sources, capture local listings, pressure-test assumptions, and keep every import behind a review step.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => onNavigate("deals", "url")}>Paste a listing</button>
      </section>

      <section className="flip-section flip-find-work-queue">
        <SectionHeading eyebrow="Work queue" title="What needs a decision" detail="Counts reflect saved records only. No background monitoring is implied." />
        <div className="flip-find-queue-grid">
          <button type="button" onClick={() => onNavigate("deals")}><span><AppNavIcon kind="find" /></span><strong>Deal Feed</strong><b>{summary.awaitingReview || "—"}</b><small>{summary.awaitingReview ? "Listings waiting for review" : "No listings waiting"}</small></button>
          <button type="button" onClick={() => onNavigate("ebay")}><span><AppNavIcon kind="data" /></span><strong>eBay Search</strong><b>{pendingEbay || "—"}</b><small>{pendingEbay ? "Results awaiting import review" : "Manual search and review"}</small></button>
          <button type="button" onClick={() => onNavigate("auctions")}><span><AppNavIcon kind="calendar" /></span><strong>Auctions</strong><b>{summary.endingSoon || summary.activeAuctions || "—"}</b><small>{summary.endingSoon ? "Ending within one day" : summary.activeAuctions ? "Active records" : "No active auctions"}</small></button>
          <button type="button" onClick={() => onNavigate("rules")}><span><AppNavIcon kind="filter" /></span><strong>Saved Searches</strong><b>{enabledRules || "—"}</b><small>{state.searchRules.length ? "Enabled rules" : "No saved rules"}</small></button>
        </div>
      </section>

      <section className="flip-section">
        <SectionHeading eyebrow="Quick actions" title="Start with the real event" detail="Every action opens a manual, reviewable workflow." />
        <div className="flip-quick-grid">
          {QUICK_ACTIONS.map(([label, screen, subview]) => <button type="button" key={label} onClick={() => onNavigate(screen, subview)}><span aria-hidden="true">+</span><strong>{label}</strong></button>)}
        </div>
      </section>

      <section className="flip-section flip-find-snapshot">
        <SectionHeading eyebrow="Recorded position" title="Sourcing and resale snapshot" detail="Projected resale uses your saved assumptions. It is not a live market value." />
        <div>
          <MetricCard label="Strong opportunities" value={summary.strongDeals || "—"} helper={summary.strongDeals ? "Based on saved deal status" : "No strong statuses saved"} />
          <MetricCard label="Inventory cost" value={state.inventory.length ? formatCurrency(summary.inventoryCost) : "—"} helper={state.inventory.length ? "Allocated cost basis" : "No inventory records"} />
          <MetricCard label="Realized revenue" value={state.sales.length ? formatCurrency(summary.realizedSalesRevenue) : "—"} helper={state.sales.length ? "Completed sales" : "No completed sales"} />
          <MetricCard label="Realized profit" value={state.sales.length ? formatCurrency(summary.realizedProfit) : "—"} helper={state.sales.length ? summary.realizedCogsAdjustment ? `Includes ${formatCurrency(summary.realizedCogsAdjustment)} append-only COGS adjustment` : "After recorded costs" : "No realized profit"} />
        </div>
        <p className="flip-data-truth"><SourceBadge>Saved records</SourceBadge><StatusBadge tone="neutral">No automatic purchasing or bidding</StatusBadge></p>
      </section>

      <section className="flip-section">
        <SectionHeading eyebrow="History" title="Recent activity" detail="Changes saved on this device appear here." />
        {recent.length ? (
          <div className="flip-activity-list">
            {recent.map((activity) => (
              <article key={activity.id}><span className="flip-activity-mark" aria-hidden="true" /><div><strong>{activity.title}</strong><p>{activity.detail}</p></div><time dateTime={activity.createdAt}>{new Date(activity.createdAt).toLocaleString()}</time></article>
            ))}
          </div>
        ) : <EmptyState title="No sourcing activity yet">Paste a listing or record a purchase to begin your private sourcing history.</EmptyState>}
      </section>
    </div>
  );
}
