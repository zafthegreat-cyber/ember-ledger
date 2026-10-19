import { useId, useMemo, useRef, useState } from "react";
import { AppNavIcon } from "./command-system/AppNavIcon.jsx";
import { PrimaryButton, SecondaryButton } from "./operations/OperationsUI.jsx";
import { RESTOCK_FEED_FILTERS, filterRestockFeed, restockReportObservedTimestamp, restockReportSearchText, restockReportStockGroup } from "../utils/restockFeedPresentation.mjs";

const PAGE_SIZE = 20;

export default function RestockReportBrowser({ reports, getStore, renderReport, now, onReport }) {
  const id = useId();
  const searchRef = useRef(null);
  const [filters, setFilters] = useState({ search: "", stock: "all", period: "all" });
  const [limit, setLimit] = useState(PAGE_SIZE);
  const entries = useMemo(() => reports.map((report) => ({
    report,
    stockGroup: restockReportStockGroup(report),
    observedAt: restockReportObservedTimestamp(report),
    searchText: restockReportSearchText(report, getStore(report)),
  })).sort((a, b) => (b.observedAt ?? -Infinity) - (a.observedAt ?? -Infinity)), [reports, getStore]);
  const matches = useMemo(() => filterRestockFeed(entries, filters, now), [entries, filters, now]);
  const hasFilters = Boolean(filters.search.trim() || filters.stock !== "all" || filters.period !== "all");
  const visible = matches.slice(0, limit);
  function changeFilter(patch) {
    setFilters((current) => ({ ...current, ...patch }));
    setLimit(PAGE_SIZE);
  }
  function clearFilters() {
    setFilters({ search: "", stock: "all", period: "all" });
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
                <button key={filter.value} type="button" className="secondary-button" aria-pressed={filters.stock === filter.value} onClick={() => changeFilter({ stock: filter.value })}>{filter.label}</button>
              ))}
            </div>
          </div>
          <div className="scout-report-results">
            <p role="status" aria-live="polite" aria-atomic="true">{matches.length ? `${visible.length} of ${matches.length} report${matches.length === 1 ? "" : "s"}${hasFilters ? " match your filters" : " shown"}` : "No reports match your filters"}</p>
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
