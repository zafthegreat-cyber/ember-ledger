import { useState } from "react";
import { QuietButton, SearchField, StatusBadge } from "../../components/operations/OperationsUI.jsx";
import { OperationsRecordBrowser } from "../../components/operations/OperationsWorkspace.jsx";
import { filterOrderRows, orderBrowserRows, orderFilterOptions } from "./orderBrowser.js";

function dateLabel(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Date not recorded";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function totalLabel(amount) {
  if (!amount || !Number.isSafeInteger(amount.minorUnits)) return "Total not recorded";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: amount.currency }).format(amount.minorUnits / 100); }
  catch { return "Total needs review"; }
}

function tone(status) {
  if (/FULLY|CONFIRMED|READY|SAVED/.test(status)) return "success";
  if (/REJECTED|CANCELLED|DAMAGED/.test(status)) return "danger";
  return /REVIEW|PARTIALLY|UNRESOLVED/.test(status) ? "warning" : "neutral";
}

export default function PurchaseOrderBrowser({ records, kind, label, selectedId, onSelect, renderDetail, empty, disabled = false }) {
  const [filters, setFilters] = useState({ query: "", retailer: "", status: "" });
  const rows = orderBrowserRows(records, kind);
  const options = orderFilterOptions(rows);
  const visible = filterOrderRows(rows, filters);
  const change = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const clear = () => setFilters({ query: "", retailer: "", status: "" });
  const activeFilters = Number(Boolean(filters.retailer)) + Number(Boolean(filters.status));
  const toolbar = <div className="purchase-order-toolbar">
    <SearchField label={`Search ${label.toLowerCase()}`} value={filters.query} onChange={(value) => change("query", value)} placeholder="Order, retailer, or item name" maxLength={160} disabled={disabled} />
    <details className="purchase-order-filters"><summary>Filter{activeFilters ? ` (${activeFilters})` : ""}</summary><div>
      <label><span>Retailer</span><select aria-label={`${label} retailer`} value={filters.retailer} onChange={(event) => change("retailer", event.target.value)} disabled={disabled}><option value="">All retailers</option>{options.retailers.map((option) => <option key={option.value} value={option.value}>{option.label} ({option.count})</option>)}</select></label>
      <label><span>Status</span><select aria-label={`${label} status`} value={filters.status} onChange={(event) => change("status", event.target.value)} disabled={disabled}><option value="">All statuses</option>{options.statuses.map((option) => <option key={option.value} value={option.value}>{option.label} ({option.count})</option>)}</select></label>
    </div></details>
    <div className="purchase-order-count"><span role="status">{visible.length} of {rows.length} {label.toLowerCase()}</span>{filters.query || activeFilters ? <QuietButton onClick={clear} disabled={disabled}>Clear filters</QuietButton> : null}</div>
  </div>;

  return <OperationsRecordBrowser
    label={label}
    disabled={disabled}
    records={visible}
    selectedId={selectedId}
    onSelect={(id) => { if (!disabled) onSelect(id); }}
    onBack={() => { if (!disabled) onSelect(""); }}
    toolbar={toolbar}
    emptyState={rows.length ? <div className="purchase-order-empty"><h3>No matching {label.toLowerCase()}</h3><p>Try a different search or clear your filters.</p><QuietButton onClick={clear} disabled={disabled}>Clear filters</QuietButton></div> : empty}
    renderRow={(row) => <span className="purchase-order-row"><span className="purchase-order-row-main"><strong>{row.title}</strong><span>{row.subtitle}</span><small>{dateLabel(row.date)}{row.itemCount ? ` · ${row.itemCount} ${row.itemCount === 1 ? "item" : "items"}` : ""}</small></span><span className="purchase-order-row-side"><StatusBadge tone={tone(row.status)}>{row.statusLabel}</StatusBadge>{kind !== "inventory" ? <strong>{totalLabel(row.amount)}</strong> : null}</span></span>}
    renderDetail={(row) => renderDetail(row.record)}
    detailEmpty={<div className="purchase-order-empty"><h3>Choose {kind === "inventory" ? "an item" : "an order"}</h3><p>Select a row to review its details and next steps.</p></div>}
    backLabel={`Back to ${label.toLowerCase()}`}
  />;
}
