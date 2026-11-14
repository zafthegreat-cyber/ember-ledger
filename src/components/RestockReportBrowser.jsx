import { useId, useMemo, useRef, useState } from "react";
import { AppNavIcon } from "./command-system/AppNavIcon.jsx";
import { PrimaryButton, SecondaryButton } from "./operations/OperationsUI.jsx";
import { RESTOCK_FEED_FILTERS, prepareRestockFeedEntries, restockFeedBrowseState, restockFeedLocationOptions, orderRestockEntries, restockEntryDistance } from "../utils/restockFeedPresentation.mjs";
import { US_STATES } from "../data/usStates.js";
import { COLLECTIBLE_GAMES } from "../utils/collectibleGames.mjs";
import NationwideLocationPicker from './NationwideLocationPicker.jsx';
import { useNearbyPreference } from '../utils/nearbyPreference.mjs';
import "./restock-report-browser.css";

const PAGE_SIZE = 20;
const EMPTY_FILTERS = { search: "", stock: "all", period: "all", retailer: "", city: "", state: "all", game: "all", knownTimeOnly: false };
const NO_STORES = [];

export default function RestockReportBrowser({ reports = [], getStore, renderReport, now, onReport, showLocation = true, initialStoreId = '', followedStoreIds = NO_STORES, initialFollowedOnly = false }) {
  const [location, setLocation] = useNearbyPreference();
  const id = useId();
  const searchRef = useRef(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [order, setOrder] = useState('newest');
  const scopeKey = `${initialStoreId}:${initialFollowedOnly}`;
  const [scopeOverride, setScopeOverride] = useState(null);
  const selectedStoreId = scopeOverride?.key === scopeKey ? scopeOverride.storeId : String(initialStoreId || '');
  const followedOnly = scopeOverride?.key === scopeKey ? scopeOverride.followedOnly : initialFollowedOnly;
  const scopedReports = useMemo(() => {
    const followed = new Set(followedStoreIds.map(String));
    return reports.filter(report => { const storeId = String(getStore?.(report)?.id || report.storeId || report.store_id || ''); return (!selectedStoreId || storeId === selectedStoreId) && (!followedOnly || followed.has(storeId)); });
  }, [reports, getStore, selectedStoreId, followedOnly, followedStoreIds]);
  const selectedStore = scopedReports[0] ? getStore?.(scopedReports[0]) : null;
  const selectedStoreName = selectedStoreId ? selectedStore?.name || selectedStore?.nickname || scopedReports[0]?.storeName || 'Selected store' : '';
  const entries = useMemo(() => prepareRestockFeedEntries(scopedReports, getStore), [scopedReports, getStore]);
  const locations = useMemo(() => restockFeedLocationOptions(entries), [entries]);
  const { matches, counts, recentCount, undatedCount } = useMemo(() => restockFeedBrowseState(entries, { ...filters, location }, now), [entries, filters, location, now]);
  const activeFilters = [
    filters.search.trim() ? { key: "search", label: `Search: ${filters.search.trim()}`, empty: "" } : null,
    filters.stock !== "all" ? { key: "stock", label: RESTOCK_FEED_FILTERS.find((filter) => filter.value === filters.stock)?.label, empty: "all" } : null,
    filters.period !== "all" ? { key: "period", label: filters.period === "24h" ? "Past 24 hours" : "Past 7 days", empty: "all" } : null,
    filters.state !== "all" ? { key: "state", label: US_STATES.find((state) => state.code === filters.state)?.name || "State not recorded", empty: "all" } : null,
    filters.game !== "all" ? { key: "game", label: COLLECTIBLE_GAMES.find((game) => game.id === filters.game)?.name || "Game not recorded", empty: "all" } : null,
    filters.retailer ? { key: "retailer", label: locations.retailers.find((option) => option.value === filters.retailer)?.label || "Selected retailer", empty: "" } : null,
    filters.city ? { key: "city", label: locations.cities.find((option) => option.value === filters.city)?.label || "Selected city", empty: "" } : null,
    filters.knownTimeOnly ? { key: 'knownTimeOnly', label: 'Known observation time', empty: false } : null,
  ].filter(Boolean);
  const hasFilters = activeFilters.length > 0 || Boolean(selectedStoreId) || followedOnly;
  const nearestAvailable = location.mode === 'nearby' && entries.some(entry => restockEntryDistance(entry, location.area) !== null);
  const currentOrder = nearestAvailable ? order : 'newest';
  const ordered = useMemo(() => orderRestockEntries(matches, currentOrder, location.area), [matches, currentOrder, location.area]);
  const visible = ordered.slice(0, limit);
  function changeFilter(patch) {
    setFilters((current) => ({ ...current, ...patch }));
    setLimit(PAGE_SIZE);
  }
  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setScopeOverride({ key: scopeKey, storeId: '', followedOnly: false });
    setLocation({ ...location, mode: 'all' });
    setLimit(PAGE_SIZE);
    searchRef.current?.focus();
  }

  return (
    <section className="scout-reports-landing" aria-labelledby={`${id}-title`}>
      <header className="scout-reports-landing__header">
        <div>
          <h2 id={`${id}-title`}>Restock reports</h2>
          <p>Local sightings from collectors. Check when stock was seen before making a trip.</p>
        </div>
        <PrimaryButton onClick={onReport}>Report a restock</PrimaryButton>
      </header>
      {showLocation ? <details className="restock-browser-location">
        <summary>
          <span>{location.mode === "online" ? "Online releases & restocks" : location.mode === "nearby" ? location.area ? `Within ${location.radius || 25} miles of ${location.area.label}` : "Nearby · Choose an area" : "Nationwide"}</span>
          <span>Change area</span>
        </summary>
        <NationwideLocationPicker />
      </details> : null}
      {reports.length ? (
        <>
          <div className="scout-report-filters" role="search" aria-label="Filter restock reports">
            <div className="scout-report-filters__fields">
              <label htmlFor={`${id}-search`}>
                <span>Search reports</span>
                <div className="scout-report-search">
                  <AppNavIcon kind="search" />
                  <input ref={searchRef} id={`${id}-search`} type="search" value={filters.search} onChange={(event) => changeFilter({ search: event.target.value })} placeholder="Product, store, or city" autoComplete="off" />
                </div>
              </label>

            </div>

            <div className="scout-report-filter-options" role="group" aria-label="Reported stock">
              <button type="button" className="secondary-button" aria-pressed={filters.period === '24h'} onClick={() => changeFilter({ period: filters.period === '24h' ? 'all' : '24h' })}>Past 24 hours</button>
              {RESTOCK_FEED_FILTERS.map((filter) => (
                <button key={filter.value} type="button" className="secondary-button" aria-pressed={filters.stock === filter.value} aria-label={`${filter.label}, ${counts[filter.value]} ${counts[filter.value] === 1 ? "report" : "reports"}`} onClick={() => changeFilter({ stock: filter.value })}>{filter.label}<span className="restock-browser-count" aria-hidden="true">{counts[filter.value]}</span></button>
              ))}
            </div>
              <details className="restock-browser-area">
                <summary>More filters<span>{filters.period !== "all" || filters.game !== "all" || filters.retailer || filters.city || filters.state !== "all" ? "Filters applied" : "Date, game & location"}</span></summary>
                <div className="restock-browser-area__fields">
              <label htmlFor={`${id}-period`}>
                <span id={`${id}-period-label`}>Observed</span>
                <select id={`${id}-period`} aria-labelledby={`${id}-period-label`} value={filters.period} onChange={(event) => changeFilter({ period: event.target.value })}>
                  <option value="all">Any time</option>
                  <option value="24h">Past 24 hours</option>
                  <option value="7d">Past 7 days</option>
                </select>
              </label>
              <label><input type="checkbox" checked={filters.knownTimeOnly} onChange={event => changeFilter({ knownTimeOnly: event.target.checked })} /> Only reports with an observation time</label>
              <label htmlFor={`${id}-game`}><span>Trading card game</span>
                <select id={`${id}-game`} value={filters.game} onChange={(event) => changeFilter({ game: event.target.value })}>
                  <option value="all">All games</option>
                  {COLLECTIBLE_GAMES.map((game) => <option key={game.id} value={game.id}>{game.name}</option>)}
                  <option value="unspecified">Game not recorded</option>
                </select>
              </label>

                  <label htmlFor={`${id}-state`}><span>State (optional)</span>
                    <select id={`${id}-state`} value={filters.state} onChange={(event) => changeFilter({ state: event.target.value, city: "" })}>
                      <option value="all">Nationwide · All states</option>
                      {US_STATES.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}
                      <option value="unspecified">State not recorded</option>
                    </select>
                  </label>
                  <label htmlFor={`${id}-retailer`}>
                    <span>Retailer</span>
                    <select id={`${id}-retailer`} value={filters.retailer} onChange={(event) => changeFilter({ retailer: event.target.value })}>
                      <option value="">All retailers</option>
                      {filters.retailer && !locations.retailers.some((option) => option.value === filters.retailer) ? <option value={filters.retailer}>Selected retailer · No reports</option> : null}
                      {locations.retailers.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label htmlFor={`${id}-city`}>
                    <span>City / region</span>
                    <select id={`${id}-city`} value={filters.city} onChange={(event) => changeFilter({ city: event.target.value })}>
                      <option value="">All cities</option>
                      {filters.city && !locations.cities.some((option) => option.value === filters.city) ? <option value={filters.city}>Selected city · No reports</option> : null}
                      {locations.cities.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                </div>
              </details>
            {hasFilters ? (
              <div className="restock-browser-active-filters" role="group" aria-label="Active filters">
                {selectedStoreId ? <button type="button" className="secondary-button" onClick={() => { setScopeOverride({ key: scopeKey, storeId: '', followedOnly }); setLimit(PAGE_SIZE); }}>Store: {selectedStoreName} · Clear</button> : null}
                {followedOnly ? <button type="button" className="secondary-button" onClick={() => { setScopeOverride({ key: scopeKey, storeId: selectedStoreId, followedOnly: false }); setLimit(PAGE_SIZE); }}>Followed stores · Clear</button> : null}
                {activeFilters.map((filter) => <button key={filter.key} type="button" className="secondary-button" aria-label={`Remove filter: ${filter.label}`} onClick={() => { changeFilter({ [filter.key]: filter.empty }); searchRef.current?.focus(); }}><span>{filter.label}</span><span aria-hidden="true">×</span></button>)}
              </div>
            ) : null}
          </div>
          <p className="restock-browser-freshness"><strong>{recentCount}</strong> of {matches.length} matching report{matches.length === 1 ? "" : "s"} observed in the past 24 hours.{undatedCount ? ` ${undatedCount} ${undatedCount === 1 ? "has" : "have"} no observation time.` : ""}</p>
          <div className="scout-report-results">
            <label>Order <select value={currentOrder} onChange={event => { setOrder(event.target.value); setLimit(PAGE_SIZE); }}><option value="newest">Newest observed</option>{nearestAvailable ? <option value="nearest">Nearest to selected area</option> : null}</select></label>
            {currentOrder === 'nearest' ? <small>Approximate distance from the selected area center. Reports without coordinates appear last.</small> : null}
            <p role="status" aria-live="polite" aria-atomic="true">{matches.length ? `${visible.length} of ${matches.length} report${matches.length === 1 ? "" : "s"}${hasFilters ? matches.length === 1 ? " matches your filters" : " match your filters" : " shown"}` : "No reports match your filters"}</p>
            {hasFilters ? <button type="button" className="secondary-button" onClick={clearFilters}>Clear filters</button> : null}
          </div>
          {matches.length ? (
            <div id={`${id}-feed`} className="scout-reports-landing__feed">{visible.map(({ report }) => renderReport(report, { compact: true, feed: true }))}</div>
          ) : (
            <div className="scout-reports-landing__empty">
              <AppNavIcon kind="find" />
              <h3>Try a wider search</h3>
              <p>Try another product, store, or city, or clear the filters to see every saved report.</p>
              <SecondaryButton onClick={clearFilters}>Show all reports</SecondaryButton>
            </div>
          )}
          {matches.length > PAGE_SIZE ? <SecondaryButton aria-controls={`${id}-feed`} onClick={() => setLimit((current) => current >= matches.length ? PAGE_SIZE : current + PAGE_SIZE)}>{limit >= matches.length ? "Show fewer reports" : `Show next ${Math.min(PAGE_SIZE, matches.length - limit)} · ${matches.length - limit} remaining`}</SecondaryButton> : null}
        </>
      ) : (
        <div className="scout-reports-landing__empty">
          <AppNavIcon kind="find" />
          <h3>No restock reports yet</h3>
          <p>Checked a store? Share stock, low stock, or an empty shelf to help the next collector. A photo is optional.</p>
        </div>
      )}
    </section>
  );
}
