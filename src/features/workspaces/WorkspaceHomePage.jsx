import { useMemo } from "react";
import {
  EmptyState,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from "../../components/operations/OperationsUI.jsx";
import { BRAND_CONFIG } from "../../config/brand.js";
import { createFlipScoutRepository } from "../flipScout/storageRepository.js";
import { OWNER_SESSION_STATES } from "../../services/ownerSession.js";
import "./workspace-shell.css";

const WORKSPACE_COPY = Object.freeze({
  COLLECT: {
    title: "Collect",
    purpose: "Your personal collection, sets, wants, and card decisions.",
    empty: "No cards in your collection yet.",
  },
  FIND: {
    title: "Find",
    purpose: "Deals, auctions, restocks, and sourcing intelligence.",
    empty: "No watched opportunities yet.",
  },
  SELL: {
    title: "Sell",
    purpose: "Prepare resale inventory and record completed sales.",
    empty: "No items ready to sell.",
  },
  BOT: {
    title: "Bot",
    purpose: "Private operational foundations for future approved integrations.",
    empty: "No bot integrations are connected.",
  },
});

function recordTitle(record = {}) {
  return record.title || record.name || record.cardName || record.productName || "Untitled record";
}

function recordDate(record = {}) {
  return record.updatedAt || record.createdAt || record.saleDate || record.purchaseDate || "";
}

function recentRecords(records = [], limit = 4) {
  return [...records]
    .sort((left, right) => String(recordDate(right)).localeCompare(String(recordDate(left))))
    .slice(0, limit);
}

function purposeOf(record = {}) {
  return String(record.ownedItemPurpose || record.purpose || "").toUpperCase();
}

function WorkspaceHeader({ workspace }) {
  const copy = WORKSPACE_COPY[workspace];
  return (
    <header className="code3-workspace-home__header">
      <span>{BRAND_CONFIG.applicationShortName} workspace</span>
      <h1>{copy.title}</h1>
      <p>{copy.purpose}</p>
    </header>
  );
}

function SummaryStrip({ values }) {
  return (
    <dl className="code3-workspace-summary">
      {values.map((value) => (
        <div key={value.label}>
          <dt>{value.label}</dt>
          <dd>{value.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RecentList({ title, records, onOpen, empty, action }) {
  return (
    <section className="code3-workspace-section">
      <div className="code3-workspace-section__heading">
        <h2>{title}</h2>
        {action}
      </div>
      {records.length ? (
        <div className="code3-workspace-records">
          {records.map((record) => (
            <button key={record.id || `${recordTitle(record)}-${recordDate(record)}`} type="button" onClick={() => onOpen?.(record)}>
              <span>
                <strong>{recordTitle(record)}</strong>
                <small>{record.detail || record.status || record.marketplace || record.source || "Open record"}</small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="code3-workspace-empty">{empty}</p>
      )}
    </section>
  );
}

function CollectHome({ items, onNavigate, onAdd }) {
  const collectionItems = items.filter((item) => purposeOf(item) === "PERSONAL_COLLECTION" || /personal collection/i.test(item.status || ""));
  const gradingCandidates = collectionItems.filter((item) => /grading/i.test(item.status || item.notes || ""));
  return (
    <>
      <SummaryStrip values={[
        { label: "Items", value: collectionItems.length },
        { label: "Grading candidates", value: gradingCandidates.length },
      ]} />
      <section className="code3-workspace-actions" aria-label="Collect actions">
        <PrimaryButton onClick={onAdd}>Add Collection Item</PrimaryButton>
        <SecondaryButton onClick={() => onNavigate("/collection")}>Open Collection</SecondaryButton>
      </section>
      <RecentList
        title="Recent collection"
        records={recentRecords(collectionItems)}
        empty={WORKSPACE_COPY.COLLECT.empty}
        onOpen={() => onNavigate("/collection")}
        action={<button type="button" onClick={() => onNavigate("/collection/sets")}>Sets</button>}
      />
    </>
  );
}

function FindHome({ onNavigate }) {
  const repository = useMemo(() => createFlipScoutRepository(), []);
  const state = useMemo(() => repository.load(), [repository]);
  const watchedDeals = state.deals.filter((record) => /watch|offer|strong|review/i.test(record.status || record.recommendation || ""));
  const liveAuctions = state.auctions.filter((record) => !/expired|passed|lost|cancelled/i.test(record.status || record.outcome || ""));
  const attention = recentRecords([...watchedDeals, ...liveAuctions]);
  return (
    <>
      <SummaryStrip values={[
        { label: "Watched", value: watchedDeals.length },
        { label: "Active auctions", value: liveAuctions.length },
      ]} />
      <section className="code3-workspace-actions" aria-label="Find actions">
        <PrimaryButton onClick={() => onNavigate("/find/deals")}>Review Deals</PrimaryButton>
        <SecondaryButton onClick={() => onNavigate("/find/auctions")}>Auctions</SecondaryButton>
      </section>
      <RecentList
        title="Sourcing activity"
        records={attention}
        empty={WORKSPACE_COPY.FIND.empty}
        onOpen={(record) => onNavigate(state.auctions.includes(record) ? "/find/auctions" : "/find/deals")}
        action={<button type="button" onClick={() => onNavigate("/find/restocks")}>Restocks</button>}
      />
    </>
  );
}

function SellHome({ items, sales, onNavigate, onAdd }) {
  const resaleItems = items.filter((item) => purposeOf(item) === "FOR_RESALE" || /listed|resale|preparing|in stock/i.test(item.status || ""));
  const readyItems = resaleItems.filter((item) => /ready|preparing|in stock/i.test(item.status || ""));
  const activeListings = resaleItems.filter((item) => /listed/i.test(item.status || ""));
  const recentSales = recentRecords(sales);
  return (
    <>
      <SummaryStrip values={[
        { label: "Ready to list", value: readyItems.length },
        { label: "Listed", value: activeListings.length },
        { label: "Recorded sales", value: sales.length },
      ]} />
      <section className="code3-workspace-actions" aria-label="Sell actions">
        <PrimaryButton onClick={onAdd}>Add Resale Inventory</PrimaryButton>
        <SecondaryButton onClick={() => onNavigate("/business/inventory")}>Open Inventory</SecondaryButton>
      </section>
      <RecentList
        title="Recent sales"
        records={recentSales}
        empty={WORKSPACE_COPY.SELL.empty}
        onOpen={() => onNavigate("/business/sales")}
        action={<button type="button" onClick={() => onNavigate("/business/sales")}>Sales</button>}
      />
    </>
  );
}

function BotHome({ session, onReturn }) {
  if (session?.status === OWNER_SESSION_STATES.LOADING) {
    return <EmptyState title="Checking owner access">Private tools stay unavailable until the owner session is verified.</EmptyState>;
  }
  if (session?.status === OWNER_SESSION_STATES.SIGN_IN_REQUIRED) {
    return <EmptyState title="Sign In Required" action={<PrimaryButton onClick={onReturn}>Return Home</PrimaryButton>}>Sign in with the configured Code 3 owner identity to continue.</EmptyState>;
  }
  if (session?.status !== OWNER_SESSION_STATES.AUTHORIZED) {
    return <EmptyState title="Owner Access Required" action={<PrimaryButton onClick={onReturn}>Return Home</PrimaryButton>}>This private workspace is available only to the verified owner.</EmptyState>;
  }
  return (
    <>
      <section className="code3-workspace-status" aria-label="Bot workspace status">
        <StatusBadge tone="neutral">Owner only</StatusBadge>
        <div>
          <h2>No bot integrations are connected</h2>
          <p>This foundation does not create tasks, automate checkout, bypass retailer controls, or claim provider connectivity.</p>
        </div>
      </section>
      <section className="code3-workspace-section">
        <h2>Available foundation</h2>
        <ul className="code3-workspace-capabilities">
          <li>Private route and authorization boundary</li>
          <li>Capability metadata for future approved providers</li>
          <li>Honest empty and unavailable states</li>
        </ul>
      </section>
    </>
  );
}

export default function WorkspaceHomePage({
  workspace,
  items = [],
  sales = [],
  ownerSession,
  onNavigate,
  onAddCollection,
  onAddResale,
  onReturnHome,
}) {
  const copy = WORKSPACE_COPY[workspace];
  if (!copy) return <EmptyState title="Workspace unavailable">Choose another {BRAND_CONFIG.applicationShortName} workspace.</EmptyState>;
  const botDenied = workspace === "BOT" && ownerSession?.status !== OWNER_SESSION_STATES.AUTHORIZED;
  return (
    <section className={`code3-workspace-home code3-workspace-home--${botDenied ? "owner-gate" : workspace.toLowerCase()}`} data-testid={botDenied ? "owner-workspace-access-state" : `${workspace.toLowerCase()}-workspace-home`}>
      {!botDenied ? <WorkspaceHeader workspace={workspace} /> : null}
      {workspace === "COLLECT" ? <CollectHome items={items} onNavigate={onNavigate} onAdd={onAddCollection} /> : null}
      {workspace === "FIND" ? <FindHome onNavigate={onNavigate} /> : null}
      {workspace === "SELL" ? <SellHome items={items} sales={sales} onNavigate={onNavigate} onAdd={onAddResale} /> : null}
      {workspace === "BOT" ? <BotHome session={ownerSession} onReturn={onReturnHome} /> : null}
    </section>
  );
}
