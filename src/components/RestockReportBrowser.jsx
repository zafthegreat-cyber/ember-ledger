import { useId, useMemo, useRef, useState } from "react";
import { AppNavIcon } from "./command-system/AppNavIcon.jsx";
import { PrimaryButton, SecondaryButton } from "./operations/OperationsUI.jsx";
import { RESTOCK_FEED_FILTERS, prepareRestockFeedEntries, restockFeedBrowseState, restockFeedLocationOptions } from "../utils/restockFeedPresentation.mjs";
import "./restock-report-browser.css";

const PAGE_SIZE = 20;
const EMPTY_FILTERS = { search: "", stock: "all", period: "all", retailer: "", city: "" };

export default function RestockReportBrowser({ reports = [], getStore, renderReport, now, onReport }) {
  const id = useId();
  const searchRef = useRef(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const entries = useMemo(() => prepareRestockFeedEntries(reports, getStore), [reports, getStore]);
  const locations = useMemo(() => restockFeedLocationOptions(entries), [entries]);
  const { matches, counts, recentCount, undatedCount } = useMemo(() => restockFeedBrowseState(entries, filters, now), [entries, filters, now]);
  const activeFilters = [
    filters.search.trim() ? { key: "search", label: `Search: ${filters.search.trim()}`, empty: "" } : null,
    filters.stock !== "all" ? { key: "stock", label: RESTOCK_FEED_FILTERS.find((filter) => filter.value === filters.stock)?.label, empty: "all" } : null,
    filters.period !== "all" ? { key: "period", label: filters.period === "24h" ? "Past 24 hours" : "Past 7 days", empty: "all" } : null,
    filters.retailer ? { key: "retailer", label: locations.retailers.find((option) => option.value === filters.retailer)?.label || "Selected retailer", empty: "" } : null,
    filters.city ? { key: "city", label: locations.cities.find((option) => option.value === filters.city)?.label || "Selected city", empty: "" } : null,
  ].filter(Boolean);
  const hasFilters = activeFilters.length > 0;
  const visible = matches.slice(0, limit);
  function changeFilter(patch) {
    setFilters((current) => ({ ...current, ...patch }));
    setLimit(PAGE_SIZE);
  }
  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setLimit(PAGE_SIZE);
    searchRef.current?.focus();
  }

  return (
    <section className="scout-reports-landing" aria-labelledby={`${id}-title`}>
      <header className="scout-reports-landing__header">
        <div>
          <span>Community observations</span>
          <h2 id={`${id}-title`}>Recent restock reports</h2>
          <p>See what collectors found. Check the observed time before making a trip; stock can change.</p>
        </div>
        <PrimaryButton onClick={onReport}>Report a restock</PrimaryButton>
      </header>
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
              <label htmlFor={`${id}-period`}>
                <span id={`${id}-period-label`}>Observed</span>
                <select id={`${id}-period`} aria-labelledby={`${id}-period-label`} value={filters.period} onChange={(event) => changeFilter({ period: event.target.value })}>
                  <option value="all">Any time</option>
                  <option value="24h">Past 24 hours</option>
                  <option value="7d">Past 7 days</option>
                </select>
              </label>
            </div>
            <div className="scout-report-filter-options" role="group" aria-label="Reported stock">
              {RESTOCK_FEED_FILTERS.map((filter) => (
                <button key={filter.value} type="button" className="secondary-button" aria-pressed={filters.stock === filter.value} aria-label={`${filter.label}, ${counts[filter.value]} ${counts[filter.value] === 1 ? "report" : "reports"}`} onClick={() => changeFilter({ stock: filter.value })}>{filter.label}<span className="restock-browser-count" aria-hidden="true">{counts[filter.value]}</span></button>
              ))}
            </div>
            {locations.retailers.length || locations.cities.length ? (
              <details className="restock-browser-area">
                <summary>Retailer &amp; area{filters.retailer || filters.city ? " · Filtered" : ""}</summary>
                <div className="restock-browser-area__fields">
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
            ) : null}
            {hasFilters ? (
              <div className="restock-browser-active-filters" role="group" aria-label="Active filters">
                {activeFilters.map((filter) => <button key={filter.key} type="button" className="secondary-button" aria-label={`Remove filter: ${filter.label}`} onClick={() => { changeFilter({ [filter.key]: filter.empty }); searchRef.current?.focus(); }}><span>{filter.label}</span><span aria-hidden="true">×</span></button>)}
              </div>
            ) : null}
          </div>
          <p className="restock-browser-freshness"><strong>{recentCount}</strong> of {matches.length} matching report{matches.length === 1 ? "" : "s"} observed in the past 24 hours.{undatedCount ? ` ${undatedCount} ${undatedCount === 1 ? "has" : "have"} no observation time.` : ""} <span>Reports are observations, not a stock guarantee.</span></p>
          <div className="scout-report-results">
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
          {matches.length > PAGE_SIZE ? <SecondaryButton aria-controls={`${id}-feed`} onClick={() => setLimit((current) => current >= matches.length ? PAGE_SIZE : current + PAGE_SIZE)}>{limit >= matches.length ? "Show fewer reports" : "Show more reports"}</SecondaryButton> : null}
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
