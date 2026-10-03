import { useRef, useState } from "react";
import { FLIP_SCOUT_PROVIDERS } from "../connectors.js";
import { CSV_COLUMNS, downloadTextFile, recordsToCsv } from "../csv.js";
import { EmptyState, SectionHeading, StatusPill } from "../components/Fields.jsx";
import EbayConnectionPanel from "../components/EbayConnectionPanel.jsx";

const CSV_EXPORTS = [
  ["deals", "Deals"],
  ["auctions", "Auctions"],
  ["purchases", "Purchases"],
  ["inventory", "Inventory"],
  ["sales", "Sales"],
  ["expenses", "Expenses"],
  ["mileage", "Mileage"],
];

function providerTone(status) {
  if (status === "Available") return "good";
  if (status === "Manual Import Only") return "warning";
  if (status === "Authorization Required") return "danger";
  return "muted";
}

export default function SourcesDataScreen({ state, onExportJson, onImportJson, onReset }) {
  const fileRef = useRef(null);
  const [message, setMessage] = useState("");
  const exportCsv = (collection, label) => {
    const csv = recordsToCsv(state[collection], CSV_COLUMNS[collection]);
    if (!csv) return setMessage(`No ${label.toLowerCase()} columns are available to export.`);
    downloadTextFile(`private-business-hub-sourcing-${collection}.csv`, csv, "text/csv;charset=utf-8");
    setMessage(`${label} CSV prepared with ${state[collection].length} record${state[collection].length === 1 ? "" : "s"}.`);
  };
  const importFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!window.confirm("Replace the current sourcing records with this JSON backup? Export the current data first if you may need it.")) {
      event.target.value = "";
      setMessage("Import cancelled; current sourcing data was not changed.");
      return;
    }
    const result = await onImportJson(await file.text());
    setMessage(result.error ? `Import failed: ${result.error}` : "Sourcing JSON imported successfully.");
    event.target.value = "";
  };

  return <div className="flip-screen">
    <section className="flip-section">
      <SectionHeading eyebrow="Connector truth" title="Marketplace sources" detail="eBay search is available only when the server health check succeeds. Other sources remain manual or unavailable. There is no scraping, browser automation, automatic buying, offers, or bidding." />
      <EbayConnectionPanel />
      <div className="flip-provider-grid">{FLIP_SCOUT_PROVIDERS.filter((provider) => provider.providerId !== "ebay").map((provider) => <article key={provider.providerId}><div><span>{provider.providerId}</span><h3>{provider.displayName}</h3></div><StatusPill tone={providerTone(provider.capabilityStatus)}>{provider.capabilityStatus}</StatusPill><p>{provider.detail}</p></article>)}</div>
    </section>
    <section className="flip-section">
      <SectionHeading eyebrow="Device-local data" title="Backup and transfer" detail="Find uses its own versioned browser-storage key. Export JSON before clearing browser data or moving to another device." />
      <div className="flip-data-actions">
        <article><h3>Full JSON backup</h3><p>Includes every sourcing record and schema version.</p><button type="button" className="primary-button" onClick={() => { onExportJson(); setMessage("Sourcing JSON backup prepared."); }}>Export JSON</button><button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}>Import JSON</button><input ref={fileRef} className="flip-visually-hidden" type="file" accept="application/json,.json" onChange={importFile} /></article>
        <article><h3>CSV exports</h3><p>Exports flat bookkeeping and sourcing records. Empty collections produce a header-only file.</p><div className="flip-export-grid">{CSV_EXPORTS.map(([collection, label]) => <button type="button" className="secondary-button" key={collection} onClick={() => exportCsv(collection, label)}>{label} CSV <span>{state[collection].length}</span></button>)}</div></article>
        <article className="flip-danger-zone"><h3>Clear sourcing data</h3><p>Removes only the namespaced sourcing repository on this device. Other application storage keys are untouched.</p><button type="button" className="ghost-button flip-delete-button" onClick={async () => { if (window.confirm("Clear all sourcing data on this device? Export a backup first if you may need it.")) { const result = await onReset(); setMessage(result?.error ? `Clear failed: ${result.error}` : "Sourcing data cleared. This cannot be recovered unless you exported a JSON backup."); } }}>Clear all sourcing data</button></article>
      </div>
      {message ? <p className="flip-form-message" role="status">{message}</p> : null}
      {!state.deals.length && !state.providerListings.length && !state.auctions.length && !state.inventory.length && !state.sales.length ? <EmptyState title="No exportable records yet">JSON export still creates a valid empty backup with the current schema version.</EmptyState> : null}
    </section>
  </div>;
}
