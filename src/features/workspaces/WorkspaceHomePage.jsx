import { lazy, Suspense, useMemo } from "react";
import {
  EmptyState,
  PrimaryButton,
  SecondaryButton,
} from "../../components/operations/OperationsUI.jsx";
import { BRAND_CONFIG } from "../../config/brand.js";
import { createFlipScoutRepository } from "../flipScout/storageRepository.js";
import { OWNER_SESSION_STATES } from "../../services/ownerSession.js";
import { resolveExperiencePresentation } from "../../utils/experiencePresentation.js";
import "./workspace-shell.css";

// Audit 2026-11-14: the native (Play/App Store) build leaves the bot tooling out entirely;
// the static env check lets the bundler drop the import.
const BotOperationsPage = import.meta.env.VITE_NATIVE_BUILD === "true" ? null : lazy(() => import("../botOps/BotOperationsPage.jsx"));

const WORKSPACE_COPY = Object.freeze({
  COLLECT: {
    title: "Collect",
    purpose: "Your personal collection, sets, wants, and card decisions.",
    empty: "No cards in your collection yet.",
  },
  FIND: {
    title: "Find",
    purpose: "Restock reports from other collectors, and where to look next.",
    sellerPurpose: "Restocks, plus tools to check a listing or auction before you buy to resell.",
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

function WorkspaceHeader({ workspace, presentation }) {
  const copy = WORKSPACE_COPY[workspace];
  const showOperationalTools = presentation.showBusinessTools || presentation.showAdminTools;
  const title = workspace === "SELL"
    ? presentation.isStore ? "Store sales" : showOperationalTools ? "Sell" : "Sell or trade"
    : copy.title;
  const purpose = workspace === "FIND"
    ? showOperationalTools ? "Restocks, saved opportunities, and sourcing activity." : "Community restocks, fair prices, and your next find."
    : workspace === "SELL" && !showOperationalTools ? "Track items you want to sell and your completed sales." : copy.purpose;
  return (
    <header className="code3-workspace-home__header">
      <span>{BRAND_CONFIG.applicationShortName} workspace</span>
      <h1>{title}</h1>
      <p>{purpose}</p>
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
        <PrimaryButton onClick={onAdd}>Add to my collection</PrimaryButton>
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

function FindHome({ onNavigate, presentation }) {
  const repository = useMemo(() => createFlipScoutRepository(), []);
  const state = useMemo(() => repository.load(), [repository]);
  const watchedDeals = state.deals.filter((record) => /watch|offer|strong|review/i.test(record.status || record.recommendation || ""));
  const liveAuctions = state.auctions.filter((record) => !/expired|passed|lost|cancelled/i.test(record.status || record.outcome || ""));
  const attention = recentRecords([...watchedDeals, ...liveAuctions]);
  // Owner, Nov 17: "Auctions and deals? They don't make sense." They are resale
  // tools (is this listing worth buying to flip?), so only sellers and stores
  // see them, or anyone who already saved a deal or auction.
  const resaleTools = presentation.isSeller || presentation.isStore || presentation.showBusinessTools || presentation.showAdminTools || state.deals.length > 0 || state.auctions.length > 0;
  return (
    <>
      {resaleTools ? <SummaryStrip values={[
        { label: "Listings saved", value: watchedDeals.length },
        { label: "Auctions tracked", value: liveAuctions.length },
      ]} /> : null}
      <section className="code3-workspace-actions" aria-label="Find actions">
        <PrimaryButton onClick={() => onNavigate("/find/restocks")}>Browse restocks</PrimaryButton>
        {resaleTools ? <SecondaryButton onClick={() => onNavigate("/find/deals")}>Check a listing</SecondaryButton> : <SecondaryButton onClick={() => onNavigate("/market")}>Look up a price</SecondaryButton>}
        {resaleTools ? <SecondaryButton onClick={() => onNavigate("/find/auctions")}>Track an auction</SecondaryButton> : null}
        {resaleTools ? <SecondaryButton onClick={() => onNavigate("/find/buy-offer")}>Buy Offer</SecondaryButton> : null}
      </section>
      {resaleTools ? <RecentList
        title={presentation.showBusinessTools || presentation.showAdminTools ? "Sourcing activity" : "Saved finds"}
        records={attention}
        empty={WORKSPACE_COPY.FIND.empty}
        onOpen={(record) => onNavigate(state.auctions.includes(record) ? "/find/auctions" : "/find/deals")}
      /> : null}
    </>
  );
}

function SellHome({ items, sales, onNavigate, onAdd, presentation }) {
  const showOperationalTools = presentation.showBusinessTools || presentation.showAdminTools;
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
        <PrimaryButton onClick={onAdd}>{showOperationalTools ? "Add Resale Inventory" : "Add an item to sell"}</PrimaryButton>
        <SecondaryButton onClick={() => onNavigate("/business/inventory")}>{showOperationalTools ? "Open Inventory" : "Items for sale"}</SecondaryButton>
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

function BotHome({ session, onReturn, initialSection, onSectionChange }) {
  if (!BotOperationsPage) {
    return <EmptyState title="Not in the mobile app" action={<PrimaryButton onClick={onReturn}>Return Home</PrimaryButton>}>This page is only available on the website.</EmptyState>;
  }
  if (session?.status === OWNER_SESSION_STATES.LOADING) {
    return <EmptyState title="Checking owner access">Private tools stay unavailable until the owner session is verified.</EmptyState>;
  }
  if (session?.status === OWNER_SESSION_STATES.SIGN_IN_REQUIRED) {
    return <EmptyState title="Sign In Required" action={<PrimaryButton onClick={onReturn}>Return Home</PrimaryButton>}>Sign in with the configured Code 3 owner identity to continue.</EmptyState>;
  }
  if (session?.status !== OWNER_SESSION_STATES.AUTHORIZED) {
    return <EmptyState title="Owner Access Required" action={<PrimaryButton onClick={onReturn}>Return Home</PrimaryButton>}>This private workspace is available only to the verified owner.</EmptyState>;
  }
  return <Suspense fallback={<EmptyState title="Loading Bot Operations">Preparing the local-only owner workspace.</EmptyState>}><BotOperationsPage session={session} initialSection={initialSection} onSectionChange={onSectionChange} /></Suspense>;
}

export default function WorkspaceHomePage({
  workspace,
  items = [],
  sales = [],
  ownerSession,
  botOpsSection = "overview",
  onNavigate,
  onBotOpsSectionChange,
  onAddCollection,
  onAddResale,
  onReturnHome,
  experiencePresentation,
}) {
  const presentation = experiencePresentation || resolveExperiencePresentation();
  const copy = WORKSPACE_COPY[workspace];
  if (!copy) return <EmptyState title="Workspace unavailable">Choose another {BRAND_CONFIG.applicationShortName} workspace.</EmptyState>;
  const botDenied = workspace === "BOT" && ownerSession?.status !== OWNER_SESSION_STATES.AUTHORIZED;
  return (
    <section className={`code3-workspace-home code3-workspace-home--${botDenied ? "owner-gate" : workspace.toLowerCase()}`} data-testid={botDenied ? "owner-workspace-access-state" : `${workspace.toLowerCase()}-workspace-home`}>
      {!botDenied && workspace !== "BOT" ? <WorkspaceHeader workspace={workspace} presentation={presentation} /> : null}
      {workspace === "COLLECT" ? <CollectHome items={items} onNavigate={onNavigate} onAdd={onAddCollection} /> : null}
      {workspace === "FIND" ? <FindHome onNavigate={onNavigate} presentation={presentation} /> : null}
      {workspace === "SELL" ? <SellHome items={items} sales={sales} onNavigate={onNavigate} onAdd={onAddResale} presentation={presentation} /> : null}
      {workspace === "BOT" ? <BotHome session={ownerSession} onReturn={onReturnHome} initialSection={botOpsSection} onSectionChange={onBotOpsSectionChange} /> : null}
    </section>
  );
}
