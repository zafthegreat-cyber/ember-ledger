import { useEffect, useMemo, useState } from "react";
import {
  CurrencyInput,
  DealCard,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PageHeader,
  PercentageInput,
  PrimaryButton,
  SecondaryButton,
  ProviderStatus,
  QuietButton,
  RecordCard,
  SearchField,
  SectionHeader,
  SortControl,
  SourceBadge,
  StatusBadge,
} from "../../components/operations/OperationsUI.jsx";
import { DetailList, RecordDetailPage } from "../../components/operations/RecordExperience.jsx";
import { getEbayHealth } from "../flipScout/ebayClient.js";
import { createFlipScoutRepository } from "../flipScout/storageRepository.js";
import { createEmptyFlipScoutState } from "../flipScout/constants.js";
import { createOwnerCenterRepository } from "./ownerCenterRepository.js";
import { createEmptyOwnerCenterState } from "./ownerCenterRepository.js";
import { OWNER_SESSION_STATES } from "../../services/ownerSession.js";
import BackupRecoveryPanel from "../backup/BackupRecoveryPanel.jsx";
import {
  asNumber,
  buildOpportunityFeed,
  filterAndSortOpportunities,
  isEndingSoon,
  restockPatternSummary,
  searchRulePerformance,
  sourcePerformance,
  timestamp,
} from "./ownerCenterModel.js";
import "./owner-center.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const EMPTY_SNAPSHOT = Object.freeze({});
const EMPTY_LIST = Object.freeze([]);

const OWNER_SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "sourcing", label: "Sourcing" },
  { key: "restocks", label: "Restocks" },
  { key: "performance", label: "Performance" },
  { key: "controls", label: "Controls" },
];

function Tabs({ label, items, active, onChange }) {
  const primary = items.slice(0, 3);
  const overflow = items.slice(3);
  const choose = (key, event) => {
    const disclosure = event.currentTarget.closest(".owner-tabs")?.querySelector("details");
    if (disclosure) disclosure.open = false;
    onChange(key);
  };
  return <div className="owner-tabs" role="tablist" aria-label={label}>{primary.map((item) => <button key={item.key} type="button" role="tab" aria-selected={active === item.key} className={active === item.key ? "is-active" : ""} onClick={(event) => choose(item.key, event)}>{item.label}</button>)}{overflow.length ? <details className="owner-tabs-more"><summary>More</summary><div>{overflow.map((item) => <button key={item.key} type="button" role="tab" aria-selected={active === item.key} className={active === item.key ? "is-active" : ""} onClick={(event) => choose(item.key, event)}>{item.label}</button>)}</div></details> : null}</div>;
}

function displayMoney(value, empty = "Not enough data") {
  const number = asNumber(value);
  return number == null ? empty : money.format(number);
}

function displayPercent(value, empty = "Not enough data") {
  const number = asNumber(value);
  return number == null ? empty : percent.format(number);
}

function displayDate(value, empty = "Not recorded") {
  const time = timestamp(value);
  return time == null ? empty : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(time);
}

function OpportunityCard({ row, onReview }) {
  const timeLabel = row.endAt ? `Ends ${displayDate(row.endAt)}` : row.discoveredAt ? `Found ${displayDate(row.discoveredAt)}` : "Timing not supplied";
  return (
    <DealCard image={row.image} imageAlt="">
      <div className="owner-opportunity-card__body">
        <span className="owner-opportunity-source">{row.sourceLabel}</span>
        <h3>{row.title}</h3>
        <dl className="owner-financial-grid">
          <div><dt>Price / current bid</dt><dd>{displayMoney(row.price, "Not supplied")}</dd></div>
          <div><dt>Expected profit</dt><dd>{displayMoney(row.profit, "Not available")}</dd></div>
          <div><dt>Expected ROI</dt><dd>{displayPercent(row.roi, "Not available")}</dd></div>
          <div><dt>Timing</dt><dd>{timeLabel}</dd></div>
        </dl>
        <p className="owner-opportunity-signal">{row.confidence || "Unrated"} confidence · {row.risk || "Unrated"} risk</p>
        <PrimaryButton onClick={() => onReview?.(row)}>Review</PrimaryButton>
      </div>
    </DealCard>
  );
}

function EmptyMetric({ label, value, helper }) {
  return <MetricCard label={label} value={value ?? "Not enough data"} helper={helper} />;
}

function mergeByIdentity(first = [], second = []) {
  const result = [];
  const seen = new Set();
  [...first, ...second].forEach((record) => {
    const key = String(record.id || record.storeId || record.reportId || `${record.storeName || record.name}-${record.createdAt || record.date || ""}`);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(record);
  });
  return result;
}

function adaptRestockData(ownerState, scoutSnapshot, storeDirectory = []) {
  const stores = mergeByIdentity(scoutSnapshot?.stores || [], storeDirectory).map((store) => ({
    ...store,
    id: store.id || store.storeId,
    store: store.name || store.storeName,
    retailer: store.chain || store.retailer || "Not recorded",
    address: store.address || [store.city, store.state].filter(Boolean).join(", "),
    distance: store.distanceMiles ?? store.distance,
    usualWeekdayPattern: store.usualWeekdayPattern || store.restockDay || "",
    usualTimeRange: store.usualTimeRange || store.restockWindow || "",
  }));
  const reports = (scoutSnapshot?.reports || []).map((report) => ({
    ...report,
    id: report.id || report.reportId,
    store: report.storeName || report.store || "Unknown store",
    product: report.itemName || report.productName || report.product_type || "Product not recorded",
    eventTime: report.createdAt || report.created_at || report.reportTime,
    confirmationStatus: report.verified || /confirmed|purchase|in.stock/i.test(`${report.status || ""} ${report.stockStatus || ""} ${report.reportType || ""}`) ? "Confirmed" : "Unconfirmed",
    source: report.sourceType || report.source || "Local store report",
    reliability: report.confidence || (report.verified ? "High" : "Not rated"),
  }));
  const patterns = [...(scoutSnapshot?.restockPatterns || []), ...(scoutSnapshot?.predictions || [])].map((prediction) => ({
    ...prediction,
    id: prediction.id || `prediction-${prediction.storeId || prediction.storeName}-${prediction.predictedDate || prediction.day || "unknown"}`,
    store: prediction.storeName || prediction.store || "Unknown store",
    predictedDate: prediction.predictedDate || prediction.date || prediction.day,
    predictedTimeRange: prediction.predictedTimeRange || prediction.timeWindow || prediction.window,
    confidence: prediction.confidence || "Not enough data",
  }));
  return {
    profiles: mergeByIdentity(ownerState.restockStoreProfiles, stores),
    events: mergeByIdentity(ownerState.restockEvents, reports),
    predictions: mergeByIdentity(ownerState.restockPredictions, patterns),
    visits: ownerState.storeVisits || [],
    observations: ownerState.productObservations || [],
  };
}

function OwnerOverview({ flipState, restocks, ebayHealth, onOpenSection }) {
  const opportunities = buildOpportunityFeed(flipState);
  const importsAwaiting = (flipState.providerListings || []).filter((row) => !/imported|passed|expired/i.test(row.reviewStatus || row.status || "")).length;
  const auctionsEnding = opportunities.filter((row) => row.sourceType === "Auctions" && isEndingSoon(row)).length;
  const likelyRestocks = restocks.predictions.filter((row) => /high|moderate/i.test(row.confidence || "")).length;
  const failures = [
    ...(flipState.activity || []).filter((row) => /failed|error/i.test(`${row.status || ""} ${row.title || ""}`)),
    ...(flipState.searchRules || []).filter((row) => /failed|error/i.test(row.lastRunStatus || "")),
  ].length;
  const rows = [
    { label: "eBay Scanner", value: ebayHealth?.status || "Not configured", detail: "Connection details", action: () => onOpenSection("controls", "connections") },
    { label: "Imports Awaiting Review", value: integer.format(importsAwaiting), detail: importsAwaiting ? "Review required" : "Queue clear", action: () => onOpenSection("sourcing", "imports") },
    { label: "Auctions Ending Soon", value: integer.format(auctionsEnding), detail: auctionsEnding ? "Time-sensitive" : "None ending soon", action: () => onOpenSection("sourcing", "auctions") },
    { label: "Restock Activity", value: integer.format(likelyRestocks), detail: likelyRestocks ? "Probability-based windows" : "Not enough data", action: () => onOpenSection("restocks", "live") },
    { label: "Failures Requiring Action", value: integer.format(failures), detail: failures ? "Open system controls" : "No failures recorded", action: () => onOpenSection("controls", "system") },
  ];
  return <section className="owner-overview-compact" aria-label="Owner status overview"><div className="owner-status-list">{rows.map((row) => <button key={row.label} type="button" onClick={row.action}><span><strong>{row.label}</strong><small>{row.detail}</small></span><b>{row.value}</b><span aria-hidden="true">›</span></button>)}</div></section>;
}

function OpportunityFilters({ filters, setFilters, sort, setSort }) {
  return <details className="owner-filter-disclosure"><summary>Filters & sort</summary><div className="owner-filter-panel"><SearchField label="Source" value={filters.source} onChange={(value) => setFilters((current) => ({ ...current, source: value }))} placeholder="eBay, auction, local…" /><SearchField label="Product type" value={filters.productType} onChange={(value) => setFilters((current) => ({ ...current, productType: value }))} placeholder="Raw card, sealed…" /><CurrencyInput label="Maximum price" value={filters.maximumPrice} onChange={(value) => setFilters((current) => ({ ...current, maximumPrice: value }))} /><CurrencyInput label="Minimum projected profit" value={filters.minimumProfit} onChange={(value) => setFilters((current) => ({ ...current, minimumProfit: value }))} /><PercentageInput label="Minimum projected ROI" value={filters.minimumRoi} onChange={(value) => setFilters((current) => ({ ...current, minimumRoi: value }))} /><label className="owner-field"><span>Minimum confidence</span><select value={filters.confidence} onChange={(event) => setFilters((current) => ({ ...current, confidence: event.target.value }))}><option value="">Any</option><option>Low</option><option>Medium</option><option>High</option></select></label><label className="owner-check"><input type="checkbox" checked={filters.newlyListed} onChange={(event) => setFilters((current) => ({ ...current, newlyListed: event.target.checked }))} />Newly listed</label><label className="owner-check"><input type="checkbox" checked={filters.endingSoon} onChange={(event) => setFilters((current) => ({ ...current, endingSoon: event.target.checked }))} />Ending soon</label><label className="owner-field"><span>Reviewed status</span><select value={filters.reviewed} onChange={(event) => setFilters((current) => ({ ...current, reviewed: event.target.value }))}><option value="">Any</option><option value="unreviewed">Needs review</option><option value="reviewed">Reviewed</option></select></label><SortControl value={sort} onChange={setSort} options={[{ value: "best", label: "Best Opportunity" }, { value: "newest", label: "Newest" }, { value: "ending", label: "Ending Soon" }, { value: "profit", label: "Highest Profit" }, { value: "roi", label: "Highest ROI" }, { value: "closest", label: "Closest" }, { value: "risk", label: "Lowest Risk" }]} /></div></details>;
}

function OwnerSourcing({ flipState, setFlipState, repository, initialTab, onOpenFind, onReview }) {
  const [tab, setTab] = useState(initialTab || "all");
  const [auctionView, setAuctionView] = useState("best");
  const [filters, setFilters] = useState({ source: "", productType: "", maximumPrice: "", minimumProfit: "", minimumRoi: "", confidence: "", maximumDistance: "", newlyListed: false, endingSoon: false, reviewed: "" });
  const [sort, setSort] = useState("best");
  const opportunities = useMemo(() => buildOpportunityFeed(flipState), [flipState]);
  const visible = useMemo(() => filterAndSortOpportunities(opportunities, filters, sort), [opportunities, filters, sort]);
  const eBayListings = opportunities.filter((row) => /ebay/i.test(`${row.sourceType} ${row.sourceLabel}`));
  const eBayActivities = (flipState.activity || []).filter((row) => /ebay/i.test(`${row.title || ""} ${row.type || ""}`));
  const imported = (flipState.providerListings || []).filter((row) => /imported/i.test(row.importStatus || row.status || ""));
  const changed = (flipState.providerListings || []).filter((row) => /changed|updated/i.test(row.importStatus || row.status || ""));
  const duplicates = (flipState.activity || []).filter((row) => /duplicate/i.test(`${row.title || ""} ${row.detail || ""}`));
  const tabs = [{ key: "all", label: "All Opportunities" }, { key: "ebay", label: "eBay" }, { key: "auctions", label: "Auctions" }, { key: "imports", label: "Imports" }, { key: "rules", label: "Search Rules" }];
  const updateRule = (rule, patch) => { const result = repository.upsert("searchRules", { ...rule, ...patch }); setFlipState(result.state); };
  const duplicateRule = (rule) => { const result = repository.upsert("searchRules", { ...rule, id: "", ruleName: `${rule.ruleName || rule.name || "Search rule"} copy`, enabled: false, duplicatedFromId: rule.id }); setFlipState(result.state); };
  const auctionRows = opportunities.filter((row) => row.sourceType === "Auctions").filter((row) => auctionView === "ending" ? isEndingSoon(row) : auctionView === "near" ? asNumber(row.distance) != null : auctionView === "watching" ? /watch/i.test(row.status) : auctionView === "won" ? /won/i.test(row.outcome || row.wonLostStatus || "") : true);

  return <div className="owner-section-stack"><Tabs label="Sourcing sections" items={tabs} active={tab} onChange={setTab} />
    {tab === "all" ? <section><SectionHeader title="All Opportunities" description="One review queue across approved sources. Filters never create a market value." /><OpportunityFilters filters={filters} setFilters={setFilters} sort={sort} setSort={setSort} />{visible.length ? <div className="owner-opportunity-list">{visible.map((row) => <OpportunityCard key={row.opportunityId} row={row} onReview={onReview} />)}</div> : <EmptyState title="No matching opportunities">Change filters, run an authorized search, or add a listing manually.</EmptyState>}</section> : null}
    {tab === "ebay" ? <section><SectionHeader title="eBay" description="Browse results are active eBay listings—not sold comparable records or market values." actions={<PrimaryButton onClick={() => onOpenFind?.("ebay")}>Open eBay Search</PrimaryButton>} /><div className="owner-metric-strip"><MetricCard label="Searches run" value={eBayActivities.filter((row) => /search/i.test(row.title || row.type || "")).length} /><MetricCard label="New listings found" value={eBayListings.filter((row) => /new/i.test(row.status)).length} /><MetricCard label="Listings changed" value={changed.length} /><MetricCard label="Duplicates filtered" value={duplicates.length} /><MetricCard label="Listings reviewed" value={eBayListings.filter((row) => row.reviewed).length} /><MetricCard label="Listings imported" value={imported.length} /><EmptyMetric label="Purchases attributed to eBay" /><EmptyMetric label="Realized profit from eBay" /><EmptyMetric label="Average realized ROI" /><EmptyMetric label="Average days to sell" /></div><p className="owner-helper">Resale value must be entered manually or supported by separately configured comparable records. Every result passes through Import Review before entering the Deal Inbox.</p><SectionHeader title="Performance by Search Rule" />{(flipState.searchRules || []).length ? <div className="owner-record-list">{(flipState.searchRules || []).map((rule) => { const metrics = searchRulePerformance(rule, flipState); return <RecordCard key={rule.id}><h3>{rule.ruleName || rule.name}</h3><p>{metrics.resultsFound} found · {metrics.resultsReviewed} reviewed · {metrics.purchases} purchases</p><StatusBadge tone="neutral">{metrics.recommendation}</StatusBadge></RecordCard>; })}</div> : <EmptyState title="No saved search rules">Create a rule from Find after reviewing its scope.</EmptyState>}</section> : null}
    {tab === "auctions" ? <section><SectionHeader title="Auctions" description="Existing auction records and safe manual or authorized ingestion only." actions={<PrimaryButton onClick={() => onOpenFind?.("auctions")}>Add or Review Auctions</PrimaryButton>} /><Tabs label="Auction views" active={auctionView} onChange={setAuctionView} items={[{ key: "best", label: "Best Opportunities" }, { key: "ending", label: "Ending Soon" }, { key: "near", label: "Near Me" }, { key: "calendar", label: "Calendar" }, { key: "watching", label: "Watching" }, { key: "won", label: "Won" }]} /><div className="owner-capability-row">{["Connected", "Feed Available", "Manual Import", "Authorization Required", "Unsupported"].map((label) => <StatusBadge key={label} tone={label === "Connected" ? "success" : label === "Unsupported" ? "neutral" : "warning"}>{label}</StatusBadge>)}</div>{auctionRows.length ? <div className="owner-opportunity-list">{auctionRows.map((row) => <OpportunityCard key={row.opportunityId} row={row} onReview={onReview} />)}</div> : <EmptyState title="No auctions in this view">Auction sources remain manual unless their capability explicitly says Connected or Feed Available.</EmptyState>}</section> : null}
    {tab === "imports" ? <section><SectionHeader title="Imports" description="All external records remain in review until intentionally imported to the Deal Inbox." actions={<PrimaryButton onClick={() => onOpenFind?.("ebay")}>Open Import Review</PrimaryButton>} /><div className="owner-import-grid">{[{ label: "eBay review results", count: eBayListings.filter((row) => !row.reviewed).length, state: "Review required" }, { label: "Shared URLs", count: (flipState.deals || []).filter((row) => row.listingUrl && /manual/i.test(row.dataSource || row.source || "manual")).length, state: "Manual Import" }, { label: "Screenshots", count: 0, state: "Manual Import" }, { label: "CSV / JSON imports", count: 0, state: "Manual Import" }, { label: "Auction imports", count: (flipState.auctions || []).length, state: "Manual Import" }, { label: "Authorized email alerts", count: 0, state: "Authorization Required" }].map((row) => <RecordCard key={row.label}><StatusBadge tone={row.state === "Review required" ? "warning" : "neutral"}>{row.state}</StatusBadge><h3>{row.label}</h3><strong>{row.count}</strong></RecordCard>)}</div></section> : null}
    {tab === "rules" ? <section><SectionHeader title="Search Rules" description="Create, edit, pause, duplicate, test, and review usefulness without enabling unsupported connectors." actions={<PrimaryButton onClick={() => onOpenFind?.("rules")}>Create Search Rule</PrimaryButton>} />{(flipState.searchRules || []).length ? <div className="owner-record-list">{(flipState.searchRules || []).map((rule) => { const metrics = searchRulePerformance(rule, flipState); return <RecordCard key={rule.id}><div className="owner-card-badges"><StatusBadge tone={rule.enabled ? "success" : "neutral"}>{rule.enabled ? "Enabled" : "Paused"}</StatusBadge><SourceBadge>{rule.marketplace || rule.source || "Any approved source"}</SourceBadge></div><h3>{rule.ruleName || rule.name}</h3><p>{metrics.resultsFound} found · {metrics.resultsReviewed} reviewed · {metrics.purchases} purchased</p><p>Usefulness: {metrics.minimumSampleMet ? metrics.recommendation : "Not Enough Data"}</p><div className="owner-button-row"><QuietButton onClick={() => onOpenFind?.("rules", rule.id)}>Edit</QuietButton><QuietButton onClick={() => updateRule(rule, { enabled: !rule.enabled })}>{rule.enabled ? "Pause" : "Enable"}</QuietButton><QuietButton onClick={() => duplicateRule(rule)}>Duplicate</QuietButton><QuietButton onClick={() => onOpenFind?.("ebay", rule.id)}>Test</QuietButton><QuietButton onClick={() => onOpenFind?.("rules", rule.id)}>Review history</QuietButton></div></RecordCard>; })}</div> : <EmptyState title="No search rules saved" action={<PrimaryButton onClick={() => onOpenFind?.("rules")}>Create Search Rule</PrimaryButton>}>Optional Pokémon templates remain disabled until intentionally saved and enabled.</EmptyState>}</section> : null}
  </div>;
}

function StoreProfile({ store, events, visits, onBack }) {
  const storeEvents = events.filter((event) => (event.storeId && event.storeId === store.id) || String(event.store || event.storeName).toLowerCase() === String(store.store || store.name).toLowerCase());
  const storeVisits = visits.filter((visit) => (visit.storeId && visit.storeId === store.id) || String(visit.store || visit.storeName).toLowerCase() === String(store.store || store.name).toLowerCase());
  const pattern = restockPatternSummary({ events: storeEvents, visits: storeVisits });
  const last = [...storeEvents].sort((a, b) => (timestamp(b.eventTime) || 0) - (timestamp(a.eventTime) || 0))[0];
  return <div data-testid="restock-store-profile"><RecordDetailPage eyebrow={store.retailer || "Store"} title={store.store || store.name || "Store profile"} status={pattern.patternStability} statusTone={/high/i.test(pattern.patternStability) ? "success" : /moderate/i.test(pattern.patternStability) ? "info" : "neutral"} identity={store.address || "Address not recorded"} summary={[{ label: "Last confirmation", value: last ? displayDate(last.eventTime) : "Not enough data" }, { label: "Common weekday", value: pattern.mostCommonWeekday || "Not enough data" }, { label: "Common time", value: pattern.mostCommonTimeWindow || "Not enough data" }, { label: "Supporting reports", value: pattern.supportingReportCount }]} sections={[{ title: "Pattern evidence", description: "Calculated only from stored reports.", children: <DetailList items={[{ label: "Average days between confirmations", value: pattern.averageIntervalDays == null ? "Not enough data" : `${pattern.averageIntervalDays.toFixed(1)} days` }, { label: "Typical products", value: store.typicalProducts || store.products }, { label: "Typical sellout speed", value: store.typicalSelloutTime }, { label: "Successful visits", value: storeVisits.filter((visit) => visit.successful).length }, { label: "Unsuccessful visits", value: storeVisits.filter((visit) => visit.successful === false).length }]} /> }, { title: "Store details", description: "Saved profile information.", children: <DetailList items={[{ label: "Distance", value: asNumber(store.distance) == null ? "Not recorded" : `${store.distance} miles` }, { label: "Stocking model", value: store.stockingModel || (store.vendorStocked ? "Vendor-stocked" : store.storeStocked ? "Store-stocked" : "Not recorded") }, { label: "Usual weekday pattern", value: store.usualWeekdayPattern || pattern.mostCommonWeekday || "Not enough data" }, { label: "Usual time range", value: store.usualTimeRange || pattern.mostCommonTimeWindow || "Not enough data" }, { label: "Notes", value: store.notes || "No notes" }]} /> }]} timeline={storeEvents.slice(0, 12).map((event) => ({ id: event.id, title: event.product || "Restock report", date: displayDate(event.eventTime), detail: event.confirmationStatus || "Confirmation not recorded" }))} onBack={onBack} /></div>;
}

function OwnerRestocks({ data, purchases, initialTab }) {
  const [tab, setTab] = useState(initialTab || "live");
  const [selectedStore, setSelectedStore] = useState(null);
  const tabs = [{ key: "live", label: "Live" }, { key: "stores", label: "Stores" }, { key: "products", label: "Products" }, { key: "patterns", label: "Patterns" }];
  const pattern = restockPatternSummary({ events: data.events, visits: data.visits, predictions: data.predictions, purchases });
  const confirmed = data.events.filter((event) => /confirmed/i.test(event.confirmationStatus || event.status || ""));
  const observations = data.observations.length ? data.observations : data.events.filter((event) => event.product).map((event) => ({ id: `observation-${event.id}`, product: event.product, store: event.store, retailer: event.retailer, dateSeen: event.eventTime, quantity: event.quantity, selloutStatus: event.selloutTime ? "Sold out" : "Not recorded" }));
  if (tab === "stores" && selectedStore) return <div className="owner-section-stack"><Tabs label="Restock sections" items={tabs} active={tab} onChange={(next) => { setTab(next); if (next !== "stores") setSelectedStore(null); }} /><StoreProfile store={selectedStore} events={data.events} visits={data.visits} onBack={() => setSelectedStore(null)} /></div>;
  return <div className="owner-section-stack"><Tabs label="Restock sections" items={tabs} active={tab} onChange={setTab} />
    {tab === "live" ? <section><SectionHeader title="Restock Intelligence" description="Patterns use stored reports and probability language. No store is guaranteed to restock." /><div className="owner-metric-strip"><MetricCard label="Confirmed today" value={confirmed.filter((event) => timestamp(event.eventTime) && Date.now() - timestamp(event.eventTime) < 86_400_000).length} /><MetricCard label="Likely windows" value={data.predictions.filter((row) => /high|moderate/i.test(row.confidence || "")).length} /><MetricCard label="Stale reports" value={data.events.filter((event) => timestamp(event.eventTime) && Date.now() - timestamp(event.eventTime) > 7 * 86_400_000).length} /><EmptyMetric label="Last confirmation" value={confirmed.length ? displayDate([...confirmed].sort((a, b) => timestamp(b.eventTime) - timestamp(a.eventTime))[0]?.eventTime) : null} /></div>{data.events.length ? <div className="owner-record-list">{data.events.slice(0, 12).map((event) => <RecordCard key={event.id}><div className="owner-card-badges"><StatusBadge tone={/confirmed/i.test(event.confirmationStatus || "") ? "success" : "warning"}>{event.confirmationStatus || "Unconfirmed"}</StatusBadge><StatusBadge tone="neutral">{event.reliability || "Reliability not rated"}</StatusBadge></div><h3>{event.product || "Product not recorded"}</h3><p>{event.store || "Store not recorded"} · {displayDate(event.eventTime)}</p><p>{event.notes || "No notes"}</p></RecordCard>)}</div> : <EmptyState title="No restock reports">Use existing local store reports or add a confirmed observation before calculating a pattern.</EmptyState>}</section> : null}
    {tab === "stores" ? <section><SectionHeader title="Stores" description="Profiles combine saved store details with real report history." />{data.profiles.length ? <div className="owner-record-list">{data.profiles.map((store) => { const storeEvents = data.events.filter((event) => (event.storeId && event.storeId === store.id) || String(event.store || "").toLowerCase() === String(store.store || store.name || "").toLowerCase()); const storePattern = restockPatternSummary({ events: storeEvents }); return <RecordCard key={store.id || store.store}><h3>{store.store || store.name}</h3><p>{store.retailer} · {store.address || "Address not recorded"}</p><div className="owner-card-badges"><StatusBadge tone="neutral">{storePattern.patternStability}</StatusBadge><StatusBadge tone="info">{storePattern.supportingReportCount} reports</StatusBadge></div><QuietButton onClick={() => setSelectedStore(store)}>View Store Profile</QuietButton></RecordCard>; })}</div> : <EmptyState title="No store profiles">Saved local stores will appear here. A store directory alone does not count as a confirmed restock.</EmptyState>}</section> : null}
    {tab === "products" ? <section><SectionHeader title="Products" description="Observed product details only—no assumed stock or resale value." />{observations.length ? <div className="owner-record-list">{observations.map((row) => <RecordCard key={row.id}><h3>{row.product || "Product not recorded"}</h3><dl className="owner-definition-list"><div><dt>UPC / SKU</dt><dd>{row.upc || row.sku || "Not recorded"}</dd></div><div><dt>MSRP</dt><dd>{displayMoney(row.msrp, "Not recorded")}</dd></div><div><dt>Store</dt><dd>{row.store || row.retailer || "Not recorded"}</dd></div><div><dt>Last seen</dt><dd>{displayDate(row.dateSeen)}</dd></div><div><dt>Quantity</dt><dd>{row.quantity ?? "Not recorded"}</dd></div><div><dt>Sellout status</dt><dd>{row.selloutStatus || "Not recorded"}</dd></div><div><dt>Target quantity</dt><dd>{row.targetQuantity ?? "Not recorded"}</dd></div></dl></RecordCard>)}</div> : <EmptyState title="No product observations">Products appear only after a real store report or observation includes them.</EmptyState>}</section> : null}
    {tab === "patterns" ? <section data-testid="restock-patterns"><SectionHeader title="Patterns" description="Calculated only from stored confirmations, predictions, visits, and attributed profit records." /><div className="owner-metric-strip"><EmptyMetric label="Most common restock weekday" value={pattern.mostCommonWeekday} /><EmptyMetric label="Most common time window" value={pattern.mostCommonTimeWindow} /><EmptyMetric label="Average interval" value={pattern.averageIntervalDays == null ? null : `${pattern.averageIntervalDays.toFixed(1)} days`} /><MetricCard label="Pattern stability" value={pattern.patternStability} /><EmptyMetric label="Average sellout time" /><EmptyMetric label="Best historical arrival time" /><EmptyMetric label="Prediction accuracy" value={pattern.predictionAccuracy == null ? null : displayPercent(pattern.predictionAccuracy)} /><EmptyMetric label="Average timing error" value={pattern.averageTimingErrorHours == null ? null : `${pattern.averageTimingErrorHours.toFixed(1)} hours`} /><EmptyMetric label="Successful trip rate" value={pattern.successfulTripRate == null ? null : displayPercent(pattern.successfulTripRate)} /><EmptyMetric label="Profit per trip" value={pattern.profitPerTrip == null ? null : displayMoney(pattern.profitPerTrip)} /><EmptyMetric label="Profit per mile" value={pattern.profitPerMile == null ? null : displayMoney(pattern.profitPerMile)} /><EmptyMetric label="Profit per hour" value={pattern.profitPerHour == null ? null : displayMoney(pattern.profitPerHour)} /></div>{pattern.missingProfitRequirements.length ? <div className="compatibility-note"><strong>Missing requirements:</strong> {pattern.missingProfitRequirements.join(", ")}. Profit efficiency will not display as zero.</div> : null}</section> : null}
  </div>;
}

function OwnerPerformance({ flipState, restocks, initialTab }) {
  const [tab, setTab] = useState(initialTab || "overview");
  const tabs = [{ key: "overview", label: "Overview" }, { key: "sources", label: "Sources" }, { key: "rules", label: "Search Rules" }, { key: "restocks", label: "Restocks" }, { key: "deals", label: "Deals" }];
  const opportunities = buildOpportunityFeed(flipState);
  const sourceRows = sourcePerformance(flipState);
  const funnel = [
    ["Opportunities Found", opportunities.length],
    ["Reviewed", opportunities.filter((row) => row.reviewed).length],
    ["Watched", opportunities.filter((row) => /watch/i.test(row.status)).length],
    ["Purchased", (flipState.purchases || []).length],
    ["Listed", (flipState.inventory || []).filter((row) => /listed/i.test(row.currentStatus || row.status || "")).length],
    ["Sold", (flipState.sales || []).filter((row) => !/draft|cancel/i.test(row.status || "Completed")).length],
    ["Profitable", (flipState.sales || []).filter((row) => asNumber(row.realizedProfit) > 0).length],
  ];
  const restockSummary = restockPatternSummary({ events: restocks.events, visits: restocks.visits, predictions: restocks.predictions, purchases: flipState.purchases || [] });
  return <div className="owner-section-stack"><Tabs label="Performance sections" items={tabs} active={tab} onChange={setTab} />
    {tab === "overview" ? <section><SectionHeader title="Sourcing Funnel" description="Counts follow real record states from discovery through realized profit." /><div className="owner-funnel" aria-label="Sourcing funnel">{funnel.map(([label, value], index) => <div key={label}><span>{label}</span><strong>{value}</strong>{index < funnel.length - 1 ? <i aria-hidden="true">→</i> : null}</div>)}</div></section> : null}
    {tab === "sources" ? <section><SectionHeader title="Source Performance" description="Missing financial attribution remains Not enough data." />{sourceRows.length ? <div className="owner-record-list">{sourceRows.map((row) => <RecordCard key={row.source}><SourceBadge>{row.source}</SourceBadge><dl className="owner-definition-list"><div><dt>Opportunities</dt><dd>{row.opportunities}</dd></div><div><dt>Purchases</dt><dd>{row.purchases}</dd></div><div><dt>Conversion rate</dt><dd>{displayPercent(row.conversionRate)}</dd></div><div><dt>Capital invested</dt><dd>{displayMoney(row.capitalInvested)}</dd></div><div><dt>Revenue</dt><dd>{displayMoney(row.revenue)}</dd></div><div><dt>Realized profit</dt><dd>{displayMoney(row.realizedProfit)}</dd></div><div><dt>Realized ROI</dt><dd>{displayPercent(row.realizedRoi)}</dd></div><div><dt>Average days to sell</dt><dd>Not enough data</dd></div><div><dt>Loss rate</dt><dd>{displayPercent(row.lossRate)}</dd></div><div><dt>Projected vs. actual variance</dt><dd>Not enough data</dd></div></dl></RecordCard>)}</div> : <EmptyState title="No source records">Source performance begins after opportunities and purchases share a recorded source.</EmptyState>}</section> : null}
    {tab === "rules" ? <section><SectionHeader title="Search Rule Performance" description="Keep, Refine, or Pause appears only after at least ten reviewed results." />{(flipState.searchRules || []).length ? <div className="owner-record-list">{(flipState.searchRules || []).map((rule) => { const row = searchRulePerformance(rule, flipState); return <RecordCard key={rule.id}><h3>{rule.ruleName || rule.name}</h3><dl className="owner-definition-list"><div><dt>Results found</dt><dd>{row.resultsFound}</dd></div><div><dt>Results reviewed</dt><dd>{row.resultsReviewed}</dd></div><div><dt>Purchases</dt><dd>{row.purchases}</dd></div><div><dt>Realized profit</dt><dd>{displayMoney(row.realizedProfit)}</dd></div><div><dt>Average ROI</dt><dd>Not enough data</dd></div><div><dt>False-positive rate</dt><dd>{displayPercent(row.falsePositiveRate)}</dd></div><div><dt>Average review time</dt><dd>Not enough data</dd></div></dl><StatusBadge tone={row.minimumSampleMet ? "info" : "neutral"}>{row.recommendation}</StatusBadge></RecordCard>; })}</div> : <EmptyState title="No rule history">Search rule usefulness requires saved rules and reviewed results.</EmptyState>}</section> : null}
    {tab === "restocks" ? <section><SectionHeader title="Restock Performance" description="Predictions, trips, mileage, products, and attributed realized profit." /><div className="owner-metric-strip"><MetricCard label="Predicted vs. confirmed" value={restockSummary.predictionAccuracy == null ? "Not enough data" : displayPercent(restockSummary.predictionAccuracy)} /><MetricCard label="Store reliability" value={restockSummary.patternStability} /><MetricCard label="Trip success" value={restockSummary.successfulTripRate == null ? "Not enough data" : displayPercent(restockSummary.successfulTripRate)} /><MetricCard label="Miles recorded" value={restocks.visits.some((row) => asNumber(row.miles) != null) ? restocks.visits.reduce((sum, row) => sum + (asNumber(row.miles) || 0), 0).toFixed(1) : "Not enough data"} /><MetricCard label="Products acquired" value={restocks.visits.some((row) => row.productsAcquired) ? restocks.visits.reduce((sum, row) => sum + (asNumber(row.productsAcquired) || 0), 0) : "Not enough data"} /><MetricCard label="Profit per trip" value={displayMoney(restockSummary.profitPerTrip)} /><MetricCard label="Profit per mile" value={displayMoney(restockSummary.profitPerMile)} /><MetricCard label="Profit per hour" value={displayMoney(restockSummary.profitPerHour)} /></div></section> : null}
    {tab === "deals" ? <section><SectionHeader title="Deal Accuracy" description="Original projections are retained and compared with actual outcomes only when both exist." />{(flipState.sales || []).length ? <div className="owner-record-list">{(flipState.sales || []).map((sale) => <RecordCard key={sale.id}><h3>{sale.title || sale.inventoryItemName || "Sale"}</h3><dl className="owner-definition-list"><div><dt>Projected resale</dt><dd>{displayMoney(sale.originalProjectedResaleMid)}</dd></div><div><dt>Actual resale</dt><dd>{displayMoney(sale.grossSalePrice)}</dd></div><div><dt>Projected profit</dt><dd>{displayMoney(sale.originalProjectedProfit)}</dd></div><div><dt>Actual profit</dt><dd>{displayMoney(sale.realizedProfit)}</dd></div><div><dt>Projected ROI</dt><dd>{displayPercent(sale.originalProjectedRoi)}</dd></div><div><dt>Actual ROI</dt><dd>{displayPercent(sale.realizedRoi)}</dd></div><div><dt>Expected days to sell</dt><dd>{sale.expectedDaysToSell ?? "Not recorded"}</dd></div><div><dt>Actual days to sell</dt><dd>{sale.daysToSell ?? "Not recorded"}</dd></div></dl></RecordCard>)}</div> : <EmptyState title="No completed deal comparisons">Complete a real sale with retained projection fields to compare predicted and actual results.</EmptyState>}</section> : null}
  </div>;
}

function OwnerControls({ state, onSave, onOpenFind, ebayHealth, initialSection = "", onSectionChange }) {
  const sectionKeys = ["connections", "search-rules", "schedules", "scoring", "notifications", "imports", "data-backup", "system"];
  const [section, setSection] = useState(sectionKeys.includes(initialSection) ? initialSection : "connections");
  const [scoring, setScoring] = useState(state.controls.scoring);
  const [features, setFeatures] = useState(state.controls.features);
  useEffect(() => {
    if (sectionKeys.includes(initialSection)) setSection(initialSection);
  }, [initialSection]);
  const sections = ["Connections", "Search Rules", "Schedules", "Scoring", "Notifications", "Imports", "Data & Backup", "System"];
  const save = (next = {}) => onSave({ ...state, controls: { scoring, features, ...next } });
  const chooseSection = (key) => { setSection(key); onSectionChange?.(key); };
  return <div className="owner-section-stack"><div className="owner-control-nav" aria-label="Control sections">{sections.map((label) => { const key = label.toLowerCase().replaceAll(" ", "-").replace("&-", ""); return <button key={key} type="button" className={section === key ? "is-active" : ""} onClick={() => chooseSection(key)}>{label}</button>; })}</div>
    {section === "connections" ? <section><SectionHeader title="Connections" description="A capability is active only when its status confirms it." /><ProviderStatus name="eBay Browse API" status={ebayHealth?.status || "Not Configured"} detail={ebayHealth?.message || "Credentials are checked by the server route."} checkedAt={ebayHealth?.checkedAt ? displayDate(ebayHealth.checkedAt) : ""} /><div className="owner-record-list">{["Auction sources", "Screenshot / manual entry", "Email imports"].map((name) => <RecordCard key={name}><h3>{name}</h3><StatusBadge tone="neutral">{name === "Screenshot / manual entry" ? "Manual Import" : name === "Email imports" ? "Authorization Required" : "Manual Import"}</StatusBadge></RecordCard>)}</div></section> : null}
    {section === "search-rules" ? <section><SectionHeader title="Search Rules" description="Manage query rules without silently running a connector." actions={<PrimaryButton onClick={() => onOpenFind?.("rules")}>Open Search Rules</PrimaryButton>} /></section> : null}
    {section === "schedules" ? <section><SectionHeader title="Schedules" description="No background schedule is active in this phase." /><EmptyState title="No schedules configured">Searches and refreshes run only when the owner starts them.</EmptyState></section> : null}
    {section === "scoring" ? <section><SectionHeader title="Scoring Settings" description="Defaults apply to new analyses. Saved deal assumptions are not overwritten unless recalculation is explicitly requested." /><div className="owner-settings-form"><CurrencyInput label="Minimum expected profit" value={scoring.minimumExpectedProfit} onChange={(value) => setScoring((current) => ({ ...current, minimumExpectedProfit: value }))} /><PercentageInput label="Minimum ROI" value={scoring.minimumRoi} onChange={(value) => setScoring((current) => ({ ...current, minimumRoi: value }))} /><CurrencyInput label="Maximum purchase amount" value={scoring.maximumPurchaseAmount} onChange={(value) => setScoring((current) => ({ ...current, maximumPurchaseAmount: value }))} /><label className="owner-field"><span>Maximum risk</span><select value={scoring.maximumRisk} onChange={(event) => setScoring((current) => ({ ...current, maximumRisk: event.target.value }))}><option value="">Not set</option><option>Low</option><option>Medium</option><option>High</option></select></label><label className="owner-field"><span>Minimum confidence</span><select value={scoring.minimumConfidence} onChange={(event) => setScoring((current) => ({ ...current, minimumConfidence: event.target.value }))}><option value="">Not set</option><option>Low</option><option>Medium</option><option>High</option></select></label><label className="owner-field"><span>Maximum distance (miles)</span><input type="number" min="0" inputMode="decimal" value={scoring.maximumDistance} onChange={(event) => setScoring((current) => ({ ...current, maximumDistance: event.target.value }))} /></label><PercentageInput label="Raw-card condition reserve" value={scoring.rawCardConditionReserve} onChange={(value) => setScoring((current) => ({ ...current, rawCardConditionReserve: value }))} /><PercentageInput label="Binder uncertainty reserve" value={scoring.binderUncertaintyReserve} onChange={(value) => setScoring((current) => ({ ...current, binderUncertaintyReserve: value }))} /><CurrencyInput label="Auction disposal reserve" value={scoring.auctionDisposalReserve} onChange={(value) => setScoring((current) => ({ ...current, auctionDisposalReserve: value }))} /></div><PrimaryButton onClick={() => save()}>Save Scoring Defaults</PrimaryButton></section> : null}
    {section === "notifications" ? <section><SectionHeader title="Notifications" description="Background notifications are not configured." /><EmptyState title="No notification service">Unavailable functionality remains visibly inactive.</EmptyState></section> : null}
    {section === "imports" ? <section><SectionHeader title="Imports" description="Review gates remain required for eBay and manual source imports." /><PrimaryButton onClick={() => onOpenFind?.("ebay")}>Open Import Review</PrimaryButton></section> : null}
    {section === "data-backup" ? <BackupRecoveryPanel /> : null}
    {section === "system" ? <section><SectionHeader title="Feature Controls" description="Hide unfinished modules from everyday navigation without claiming they are active." /><div className="owner-feature-list">{Object.entries({ ebaySearch: "eBay Search", auctions: "Auctions", restocks: "Restocks", collection: "Collection", grading: "Grading", kidsCommunity: "Kids & Community", businessAssistant: "Business Assistant", aiImageAnalysis: "AI Image Analysis", emailImports: "Email Imports" }).map(([key, label]) => <label key={key}><span><strong>{label}</strong><small>{features[key] ? "Visible when supported" : "Hidden from everyday navigation"}</small></span><input type="checkbox" checked={Boolean(features[key])} onChange={(event) => setFeatures((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}</div><PrimaryButton onClick={() => save()}>Save Feature Controls</PrimaryButton></section> : null}
  </div>;
}

export default function OwnerCenterPage({
  session = { status: OWNER_SESSION_STATES.LOADING },
  initialSection = "overview",
  initialSubsection = "",
  scoutSnapshot = EMPTY_SNAPSHOT,
  storeDirectory = EMPTY_LIST,
  onOpenFind,
  onReviewOpportunity,
  onSignIn,
  onSignOut,
  onReturnHome,
  onSectionChange,
  onSubsectionChange,
}) {
  const flipRepository = useMemo(() => createFlipScoutRepository(), []);
  const ownerRepository = useMemo(() => createOwnerCenterRepository(), []);
  const authorized = session.status === OWNER_SESSION_STATES.AUTHORIZED;
  const [flipState, setFlipState] = useState(() => createEmptyFlipScoutState());
  const [ownerState, setOwnerState] = useState(() => createEmptyOwnerCenterState());
  const [section, setSection] = useState(OWNER_SECTIONS.some((item) => item.key === initialSection) ? initialSection : "overview");
  const [subsection, setSubsection] = useState(initialSubsection);
  const [ebayHealth, setEbayHealth] = useState(null);
  const [healthError, setHealthError] = useState("");
  const restocks = useMemo(() => adaptRestockData(ownerState, scoutSnapshot, storeDirectory), [ownerState, scoutSnapshot, storeDirectory]);

  useEffect(() => {
    setSection(OWNER_SECTIONS.some((item) => item.key === initialSection) ? initialSection : "overview");
    setSubsection(initialSubsection || "");
  }, [initialSection, initialSubsection]);

  useEffect(() => {
    if (!authorized) {
      setFlipState(createEmptyFlipScoutState());
      setOwnerState(createEmptyOwnerCenterState());
      setEbayHealth(null);
      setHealthError("");
      return undefined;
    }
    setFlipState(flipRepository.load());
    setOwnerState(ownerRepository.load());
    let active = true;
    getEbayHealth().then((result) => { if (active) setEbayHealth(result); }).catch((error) => {
      if (!active) return;
      if (error?.status === 401 || error?.status === 403) {
        setEbayHealth({ status: "Authorization Required", message: error.status === 401 ? "Sign in is required." : "Owner access is required." });
        setHealthError(error.status === 401 ? "The application session must be renewed." : "This account is not authorized for owner sourcing tools.");
        return;
      }
      setEbayHealth({ status: "Not Configured", message: "The server-side eBay connector health route is unavailable in this local frontend session." });
      setHealthError("");
    });
    return () => { active = false; };
  }, [authorized]);

  if (session.status === OWNER_SESSION_STATES.LOADING) {
    return <main className="owner-center owner-center--denied"><LoadingState title="Checking owner access">Verifying the application session.</LoadingState></main>;
  }

  if (session.status === OWNER_SESSION_STATES.SIGN_IN_REQUIRED) {
    return <main className="owner-center owner-center--denied"><ErrorState title="Sign In Required" action={<PrimaryButton onClick={onSignIn}>Sign In</PrimaryButton>}>Sign in with the approved owner account to open this workspace.</ErrorState></main>;
  }

  if (session.status === OWNER_SESSION_STATES.OWNER_ACCESS_REQUIRED) {
    return <main className="owner-center owner-center--denied"><ErrorState title="Owner Access Required" action={<div className="owner-access-actions"><PrimaryButton onClick={onReturnHome}>Return Home</PrimaryButton><SecondaryButton onClick={onSignOut}>Sign Out</SecondaryButton></div>}>This signed-in account is not authorized for Owner Center.</ErrorState></main>;
  }

  if (!authorized) {
    return <main className="owner-center owner-center--denied"><ErrorState title="Owner access unavailable" action={<PrimaryButton onClick={onReturnHome}>Return Home</PrimaryButton>}>Owner authorization could not be verified. No private sourcing data was loaded.</ErrorState></main>;
  }

  const openSection = (nextSection, nextSubsection = "") => {
    setSection(nextSection);
    setSubsection(nextSubsection);
    onSectionChange?.(nextSection, nextSubsection);
  };
  const saveOwnerState = (next) => {
    const result = ownerRepository.save(next);
    setOwnerState(result.state);
    window.dispatchEvent?.(new CustomEvent("private-business-hub:owner-controls", { detail: result.state.controls }));
  };
  const review = (row) => onReviewOpportunity?.(row);

  return (
    <main className="owner-center" data-testid="owner-center">
      <PageHeader eyebrow="Private controls" title="Owner Center" actions={<StatusBadge tone="warning">Owner Only</StatusBadge>} />
      {session.localDevelopment ? <div className="owner-local-development" role="status">Local development identity</div> : null}
      <Tabs label="Owner Center sections" items={OWNER_SECTIONS} active={section} onChange={(next) => openSection(next)} />
      {healthError ? <div className="owner-inline-warning" role="status">eBay health status is temporarily unavailable: {healthError}</div> : null}
      {section === "overview" ? <OwnerOverview flipState={flipState} restocks={restocks} ebayHealth={ebayHealth} onOpenSection={openSection} onReview={review} /> : null}
      {section === "sourcing" ? <OwnerSourcing flipState={flipState} setFlipState={setFlipState} repository={flipRepository} initialTab={subsection} onOpenFind={onOpenFind} onReview={review} /> : null}
      {section === "restocks" ? <OwnerRestocks data={restocks} purchases={flipState.purchases || []} initialTab={subsection} /> : null}
      {section === "performance" ? <OwnerPerformance flipState={flipState} restocks={restocks} initialTab={subsection} /> : null}
      {section === "controls" ? <OwnerControls state={ownerState} onSave={saveOwnerState} onOpenFind={onOpenFind} ebayHealth={ebayHealth} initialSection={subsection} onSectionChange={(next) => { setSubsection(next); onSubsectionChange?.(next); }} /> : null}
    </main>
  );
}
