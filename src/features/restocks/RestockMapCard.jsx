// Restock map on the Restocks page (Nov 17 2026). Other restock apps lead with
// a map; ours was three taps deep inside the reports board. This puts stores on
// a map first, with the latest community report for the one you tap.
// Safety: shows only the most recent public report per store, never a history
// or pattern, and no stock quantities (AGENTS.md safety rules).
import { useMemo, useState } from "react";
import ScoutTileMap from "../../components/ScoutTileMap.jsx";
import { PrimaryButton, SecondaryButton } from "../../components/operations/OperationsUI.jsx";
import { buildRestockMapRows, describeLatestReport } from "./restockMapRows.js";
import { useNearbyPreference } from "../../utils/nearbyPreference.mjs";
import "./restock-map-card.css";

export default function RestockMapCard({ stores = [], reports = [], isFollowed, onOpenStore, onReportAtStore, onFollowStore, onBrowseAll }) {
  // The nearby area chosen in Restocks (if any) decides which stores are on the map.
  const [location] = useNearbyPreference();
  const area = location.mode === "nearby" ? location.area : null;
  const radius = location.radius || 25;
  const areaLabel = area ? `within ${radius} miles of ${area.label || `${area.city}, ${area.state}`}` : "";
  const rows = useMemo(() => buildRestockMapRows({ stores, reports, isFollowed, area, radius }), [stores, reports, isFollowed, area, radius]);
  const [selectedId, setSelectedId] = useState("");
  // Shown as followed straight away; the parent's store list catches up on its next render.
  const [justFollowed, setJustFollowed] = useState(() => new Set());
  const selected = rows.find((row) => row.id === selectedId) || rows[0] || null;
  const withReports = rows.filter((row) => row.report).length;
  if (!rows.length) {
    if (!area) return null;
    // Nothing near the chosen area yet: say so instead of showing far-away stores.
    return (
      <section className="restock-map-card restock-map-card--empty" aria-labelledby="restock-map-title">
        <header className="restock-map-card__head">
          <div>
            <h3 id="restock-map-title">Restock map</h3>
            <p>No stores {areaLabel} on the map yet. Report a store you visit and it shows up here for collectors near you.</p>
          </div>
          {onBrowseAll ? <button type="button" className="restock-map-card__all" onClick={onBrowseAll}>All reports</button> : null}
        </header>
        {onReportAtStore ? <div className="restock-map-card__actions"><PrimaryButton onClick={() => onReportAtStore(null)}>Report the first restock near you</PrimaryButton></div> : null}
      </section>
    );
  }
  const latest = describeLatestReport(selected?.report);
  return (
    <section className="restock-map-card" aria-labelledby="restock-map-title">
      <header className="restock-map-card__head">
        <div>
          <h3 id="restock-map-title">Restock map</h3>
          <p>{withReports ? `${withReports} store${withReports === 1 ? "" : "s"} with a report in the last 2 days${areaLabel ? ` · ${areaLabel}` : ""}.` : "No reports in the last 2 days yet. Tap a store to be the first."}</p>
        </div>
        {onBrowseAll ? <button type="button" className="restock-map-card__all" onClick={onBrowseAll}>All reports</button> : null}
      </header>
      <ScoutTileMap
        className="scout-command-real-map scout-command-map restock-map-card__map"
        rows={rows}
        compact
        interactive
        label="Restock map"
        mapLabel="Stores with recent restock reports"
        emptyTitle="No stores on the map yet"
        emptyDetail="Follow a store or browse reports to add stores here."
        maxPins={12}
        selectedId={selected?.id || ""}
        onPinSelect={(pin) => setSelectedId(String(pin.id))}
        showFacts={false}
        showAttributionLink={false}
      />
      {selected ? (
        <div className={`restock-map-card__store is-${latest.tone}`} aria-live="polite">
          <div className="restock-map-card__store-copy">
            <strong>{selected.name}</strong>
            <span>{selected.area}{selected.followed ? " · Following" : ""}</span>
            <em>{latest.headline}</em>
            <small>{latest.detail}</small>
          </div>
          <div className="restock-map-card__actions">
            {onFollowStore ? (selected.followed || justFollowed.has(selected.id)
              ? <span className="restock-map-card__following" role="status">Following · you'll get alerts</span>
              : <PrimaryButton onClick={() => { onFollowStore(selected.store); setJustFollowed((current) => new Set(current).add(selected.id)); }}>Follow for free alerts</PrimaryButton>) : null}
            {onReportAtStore ? <SecondaryButton onClick={() => onReportAtStore(selected.store)}>Report here</SecondaryButton> : null}
            {onOpenStore ? <SecondaryButton onClick={() => onOpenStore(selected.store)}>Store reports</SecondaryButton> : null}
          </div>
        </div>
      ) : null}
      {rows.some((row) => !row.exact) ? <p className="restock-map-card__note">Some pins show the store's city, not its exact spot.</p> : null}
      <ul className="restock-map-card__legend" aria-label="Stores on the map">
        {rows.map((row, index) => (
          <li key={row.id}>
            <button type="button" aria-pressed={row.id === selected?.id} onClick={() => setSelectedId(row.id)}>
              <span aria-hidden="true">{index + 1}</span>{row.name}{row.report ? <i aria-label="has a recent report" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
