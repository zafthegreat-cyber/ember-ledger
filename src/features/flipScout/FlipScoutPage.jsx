import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import DealsScreen from "./screens/DealsScreen.jsx";
import { allocateLotCost } from "./inventory.js";
import { findDealForProviderListing, mergeProviderListings, providerListingToDeal } from "./ebayDiscovery.js";
import { downloadTextFile } from "./csv.js";
import { createEmptyFlipScoutState } from "./constants.js";
import { createFlipScoutRepository } from "./storageRepository.js";
import { LoadingState, PageHeader } from "../../components/operations/OperationsUI.jsx";
import "./flipScout.css";

const DashboardScreen = lazy(() => import("./screens/DashboardScreen.jsx"));
const AppraiserScreen = lazy(() => import("./screens/AppraiserScreen.jsx"));
const AuctionsScreen = lazy(() => import("./screens/AuctionsScreen.jsx"));
const SearchRulesScreen = lazy(() => import("./screens/SearchRulesScreen.jsx"));
const RecordsScreen = lazy(() => import("./screens/RecordsScreen.jsx"));
const SourcesDataScreen = lazy(() => import("./screens/SourcesDataScreen.jsx"));
const EbayDiscoveryScreen = lazy(() => import("./screens/EbayDiscoveryScreen.jsx"));
const RestocksScreen = lazy(() => import("./screens/RestocksScreen.jsx"));

const PRIMARY_NAV_ITEMS = [
  ["deals", "Deals"],
  ["restocks", "Restocks"],
  ["auctions", "Auctions"],
];
const SCREEN_TITLES = {
  dashboard: "Overview",
  deals: "Deals",
  restocks: "Restocks",
  ebay: "eBay Search",
  rules: "Saved Searches",
  appraise: "Deal Analysis",
  auctions: "Auctions",
  records: "Business Records",
  sources: "Sources",
};
const VALID_SCREENS = new Set(Object.keys(SCREEN_TITLES));
const INTELLIGENCE_ANALYSIS_RECORD_TYPE = "CODE3_INTELLIGENCE_ANALYSIS";
const DESTINATION_KEY = "private-business-hub.flip-scout.destination";
const EMPTY_FEATURE_CONTROLS = Object.freeze({});

function readInitialDestination(fallback = {}) {
  if (typeof window === "undefined") return { screen: VALID_SCREENS.has(fallback.screen) ? fallback.screen : "deals", subview: fallback.subview || "" };
  let stored = null;
  try {
    stored = JSON.parse(window.sessionStorage?.getItem(DESTINATION_KEY) || "null");
    window.sessionStorage?.removeItem(DESTINATION_KEY);
  } catch {
    stored = null;
  }
  const segments = window.location.pathname.split("/").filter(Boolean);
  const routeView = segments[0] === "find" ? {
    "deal-feed": "deals", deals: "deals", ebay: "ebay", "ebay-search": "ebay",
    "saved-searches": "rules", rules: "rules", "deal-analysis": "appraise", analyze: "appraise",
    auctions: "auctions", restocks: "restocks", sources: "sources", integrations: "sources",
  }[segments[1]] : "";
  const queryView = new URLSearchParams(window.location.search).get("view") || "";
  const screen = stored?.screen || routeView || queryView || fallback.screen || "deals";
  return { screen: VALID_SCREENS.has(screen) ? screen : "deals", subview: stored?.subview || fallback.subview || "" };
}

function createActivity(title, detail) {
  return { id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title, detail, createdAt: new Date().toISOString() };
}

export default function FlipScoutPage({ onExit, onOpenRestocks, initialScreen = "deals", initialSubview = "", onViewChange, featureControls = EMPTY_FEATURE_CONTROLS }) {
  const repositoryRef = useRef(null);
  const moreMenuRef = useRef(null);
  if (!repositoryRef.current) repositoryRef.current = createFlipScoutRepository();
  const repository = repositoryRef.current;
  const [state, setState] = useState(() => repository.load());
  const initialDestinationRef = useRef(null);
  if (!initialDestinationRef.current) initialDestinationRef.current = readInitialDestination({ screen: initialScreen, subview: initialSubview });
  const [activeScreen, setActiveScreen] = useState(initialDestinationRef.current.screen);
  const [subview, setSubview] = useState(initialDestinationRef.current.subview);
  const [appraisalSeed, setAppraisalSeed] = useState(null);
  const [storageMessage, setStorageMessage] = useState(repository.getLastError());
  const activeTitle = useMemo(() => SCREEN_TITLES[activeScreen] || "Find", [activeScreen]);
  const visiblePrimaryNavItems = PRIMARY_NAV_ITEMS.filter(([key]) => key !== "restocks" || featureControls.restocks !== false).filter(([key]) => key !== "auctions" || featureControls.auctions !== false);
  const intelligenceAnalyses = useMemo(() => (state.appraisals || [])
    .filter((record) => record.recordType === INTELLIGENCE_ANALYSIS_RECORD_TYPE)
    .sort((left, right) => String(right.analyzedAt || "").localeCompare(String(left.analyzedAt || ""))), [state.appraisals]);

  useEffect(() => {
    const handleNavigation = (event) => {
      const screen = event.detail?.screen;
      if (!VALID_SCREENS.has(screen)) return;
      if (moreMenuRef.current) moreMenuRef.current.open = false;
      setActiveScreen(screen);
      setSubview(event.detail?.subview || "");
    };
    window.addEventListener("private-business-hub:flip-scout-navigate", handleNavigation);
    return () => window.removeEventListener("private-business-hub:flip-scout-navigate", handleNavigation);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const destination = readInitialDestination({ screen: "deals" });
      if (moreMenuRef.current) moreMenuRef.current.open = false;
      setActiveScreen(destination.screen);
      setSubview(destination.subview);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const applySave = useCallback((nextState, error = "") => {
    setState(nextState);
    setStorageMessage(error);
  }, []);

  const saveRecord = useCallback((collection, record, activity) => {
    const result = repository.upsert(collection, record);
    let nextState = result.state;
    if (activity?.title) {
      const activityResult = repository.save({ ...nextState, activity: [createActivity(activity.title, activity.detail || "Sourcing record changed."), ...nextState.activity].slice(0, 150) });
      nextState = activityResult.state;
      result.error ||= activityResult.error;
    }
    applySave(nextState, result.error);
    return result.record;
  }, [applySave, repository]);

  const deleteRecord = useCallback((collection, id, label = "this record") => {
    if (!window.confirm(`Delete ${label}? This removes it from the private sourcing workspace on this device.`)) return false;
    const result = repository.remove(collection, id);
    const activityResult = repository.save({ ...result.state, activity: [createActivity("Record deleted", `${label} removed from ${collection}.`), ...result.state.activity].slice(0, 150) });
    applySave(activityResult.state, result.error || activityResult.error);
    return true;
  }, [applySave, repository]);

  const analysisStored = useCallback(() => {
    applySave(repository.load(), repository.getLastError());
  }, [applySave, repository]);

  const navigate = useCallback((screen, nextSubview = "") => {
    if (moreMenuRef.current) moreMenuRef.current.open = false;
    setActiveScreen(screen);
    setSubview(nextSubview || "");
    onViewChange?.(screen, nextSubview || "");
    window.scrollTo?.({ top: 0, behavior: "auto" });
  }, [onViewChange]);

  const analyzeDeal = useCallback((seed) => {
    setAppraisalSeed(seed);
    navigate("appraise");
  }, [navigate]);

  const allocateLot = useCallback((lotId, method) => {
    const lot = state.lots.find((row) => row.id === lotId);
    if (!lot) return;
    const lotItems = state.inventory.filter((item) => item.lotId === lotId);
    const allocated = allocateLotCost({ totalCost: lot.totalLotCost, items: lotItems, method });
    const allocatedById = new Map(allocated.map((item) => [item.id, item]));
    const result = repository.save({
      ...state,
      inventory: state.inventory.map((item) => allocatedById.get(item.id) || item),
      activity: [createActivity("Lot cost allocated", `${lot.title} used ${method.replace(/_/g, " ")} allocation.`), ...state.activity].slice(0, 150),
    });
    applySave(result.state, result.error);
  }, [applySave, repository, state]);

  const mergeDiscoveries = useCallback((listings, checkedAt) => {
    const merge = mergeProviderListings(state.providerListings, listings, checkedAt);
    const result = repository.save({
      ...state,
      providerListings: merge.listings,
      activity: [createActivity("eBay search checked", `${merge.added} new · ${merge.updated} updated · ${merge.expired} expired.`), ...state.activity].slice(0, 150),
    });
    applySave(result.state, result.error);
    return merge;
  }, [applySave, repository, state]);

  const importDiscovery = useCallback((listing) => {
    const existingDeal = findDealForProviderListing(state.deals, listing);
    const deal = providerListingToDeal(listing, existingDeal);
    const dealResult = repository.upsert("deals", deal);
    const reviewedListings = dealResult.state.providerListings.map((record) => record.id === listing.id
      ? { ...record, reviewStatus: "Imported", importedDealId: dealResult.record.id, reviewedAt: new Date().toISOString() }
      : record);
    const result = repository.save({
      ...dealResult.state,
      providerListings: reviewedListings,
      activity: [createActivity(existingDeal ? "eBay deal refreshed" : "eBay deal imported", listing.title), ...dealResult.state.activity].slice(0, 150),
    });
    applySave(result.state, dealResult.error || result.error);
    return { record: dealResult.record, updated: Boolean(existingDeal) };
  }, [applySave, repository, state]);

  const exportJson = useCallback(() => downloadTextFile("private-business-hub-sourcing-backup.json", repository.exportJson(), "application/json;charset=utf-8"), [repository]);
  const importJson = useCallback((raw) => {
    const result = repository.importJson(raw);
    applySave(result.state, result.error);
    return result;
  }, [applySave, repository]);
  const reset = useCallback(() => {
    const result = repository.replace(createEmptyFlipScoutState());
    applySave(result.state, result.error);
  }, [applySave, repository]);

  const findNavigation = <div className="flip-find-navigation">
    <nav className="flip-main-nav ops-find-nav" aria-label="Find navigation" style={{ "--flip-primary-count": visiblePrimaryNavItems.length }}>{visiblePrimaryNavItems.map(([key, label]) => <button type="button" key={key} className={activeScreen === key ? "active" : ""} aria-current={activeScreen === key ? "page" : undefined} onClick={() => navigate(key)}><span>{label}</span></button>)}</nav>
    <details ref={moreMenuRef} className="flip-more-menu">
      <summary>More</summary>
      <div>
        <button type="button" onClick={() => navigate("rules")}>Saved</button>
        <button type="button" onClick={() => navigate("appraise")}>Deal Analysis</button>
        {featureControls.ebaySearch !== false ? <button type="button" onClick={() => navigate("ebay")}>eBay Search</button> : null}
        {featureControls.ebaySearch !== false ? <button type="button" onClick={() => navigate("ebay")}>Import Review</button> : null}
        <button type="button" onClick={() => navigate("sources")}>Sources</button>
        <button type="button" onClick={() => navigate("rules")}>Search Rule Editor</button>
      </div>
    </details>
  </div>;

  return (
    <div className="flip-scout-page">
      <PageHeader
        eyebrow="Sourcing"
        title="Find"
      />
      {activeScreen !== "deals" && PRIMARY_NAV_ITEMS.some(([key]) => key === activeScreen) ? findNavigation : null}
      {!PRIMARY_NAV_ITEMS.some(([key]) => key === activeScreen) ? <div className="flip-context-bar"><button type="button" onClick={() => navigate("deals")}>Back to Deals</button><strong>{activeTitle}</strong></div> : null}
      {storageMessage ? <div className="flip-storage-warning" role="alert"><strong>Local save warning</strong><span>{storageMessage}</span></div> : null}
      <main className="flip-scout-main" aria-label={activeTitle} tabIndex={-1}>
        <Suspense fallback={<LoadingState title={`Loading ${activeTitle}`} description="Preparing this workspace." />}>
        {activeScreen === "dashboard" ? <DashboardScreen state={state} onNavigate={navigate} /> : null}
        {activeScreen === "deals" ? <DealsScreen deals={state.deals} initialMode={subview} navigation={findNavigation} onSave={saveRecord} onDelete={deleteRecord} onAnalyze={analyzeDeal} /> : null}
        {activeScreen === "restocks" ? <RestocksScreen onOpenRestocks={onOpenRestocks} /> : null}
        {activeScreen === "appraise" ? <AppraiserScreen seed={appraisalSeed} onSave={saveRecord} repository={repository} analysisRecords={intelligenceAnalyses} onAnalysisStored={analysisStored} /> : null}
        {activeScreen === "auctions" ? <AuctionsScreen auctions={state.auctions} initialMode={subview} onSave={saveRecord} onDelete={deleteRecord} /> : null}
        {activeScreen === "rules" ? <SearchRulesScreen rules={state.searchRules} onSave={saveRecord} onDelete={deleteRecord} onOpenEbay={(ruleId) => navigate("ebay", ruleId)} /> : null}
        {activeScreen === "ebay" ? <EbayDiscoveryScreen state={state} initialRuleId={subview} onMerge={mergeDiscoveries} onImport={importDiscovery} onUpdate={saveRecord} onNavigate={navigate} /> : null}
        {activeScreen === "records" ? <RecordsScreen state={state} initialSubview={subview} onSave={saveRecord} onDelete={deleteRecord} onAllocateLot={allocateLot} /> : null}
        {activeScreen === "sources" ? <SourcesDataScreen state={state} onExportJson={exportJson} onImportJson={importJson} onReset={reset} /> : null}
        </Suspense>
      </main>
    </div>
  );
}
