// Restock map on the Restocks page (Nov 17 2026). Other restock apps lead with
// a map; ours was three taps deep inside the reports board. This puts stores on
// a map first, with the latest community report for the one you tap.
// Safety: shows only the most recent public report per store, never a history
// or pattern, and no stock amounts (AGENTS.md safety rules).
// Nov 25 2026 (owner: "the map is terrible"): a real map you can drag and pinch
// (RestockSlippyMap), opened on where the stores are instead of the whole state,
// pins grouped when they would overlap, plain store names ("Target" and the
// street), a "near me" button, directions, and a short list of the closest stores.
import { useCallback, useMemo, useState } from "react";
import RestockSlippyMap from "./RestockSlippyMap.jsx";
import { PrimaryButton, SecondaryButton } from "../../components/operations/OperationsUI.jsx";
import { buildRestockMapRows, describeLatestReport } from "./restockMapRows.js";
import { focusPoints, milesBetween, storeMapLabel, zoomForRadius } from "./slippyMap.mjs";
import { resolveStoreCoordinates } from "../../utils/storeMapCoordinates.mjs";
import { useNearbyPreference } from "../../utils/nearbyPreference.mjs";
import "./restock-map-card.css";

const LIST_START = 4;

function directionsUrl(pin) {
  const store = pin.row.store || {};
  if (pin.row.exact) return `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([store.name || pin.row.name, store.address, store.city, store.state || store.stateCode].filter(Boolean).join(" "))}`;
}

export default function RestockMapCard({ stores = [], reports = [], isFollowed, onOpenStore, onReportAtStore, onFollowStore, onBrowseAll }) {
  // The nearby area chosen in Restocks (if any) decides which stores are on the map.
  const [location] = useNearbyPreference();
  const area = location.mode === "nearby" ? location.area : null;
  const radius = location.radius || 25;
  const areaLabel = area ? `within ${radius} miles of ${area.label || `${area.city}, ${area.state}`}` : "";
  const rows = useMemo(() => buildRestockMapRows({ stores, reports, isFollowed, area, radius, maxPins: 60 }), [stores, reports, isFollowed, area, radius]);
  const pins = useMemo(() => rows.map((row, index) => {
    const point = resolveStoreCoordinates(row, index);
    if (!point) return null;
    const label = storeMapLabel(row);
    const latest = describeLatestReport(row.report);
    return { id: row.id, lat: point.lat, lng: point.lng, title: label.title, place: label.place, initial: label.initial, tone: latest.tone, status: latest.headline, followed: row.followed, row };
  }).filter(Boolean), [rows]);
  const [selectedId, setSelectedId] = useState("");
  // Shown as followed straight away; the parent's store list catches up on its next render.
  const [justFollowed, setJustFollowed] = useState(() => new Set());
  const [moved, setMoved] = useState(null); // where a tap in the list or "near me" sent the map
  const [mapCenter, setMapCenter] = useState(null);
  const [you, setYou] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState("");
  const [showAll, setShowAll] = useState(false);
  const selectedPin = pins.find((pin) => pin.id === selectedId) || pins[0] || null;
  const selected = selectedPin ? selectedPin.row : null;
  const withReports = rows.filter((row) => row.report).length;

  // Opens on the chosen area, or on where the stores are (not a whole state).
  const areaKey = area ? `${area.id}:${radius}` : "everywhere";
  // The opening view is worked out once per area; new reports must not move the map.
  const openingKey = area ? `area:${areaKey}` : `stores:${pins.length ? "ready" : "none"}`;
  const [opening, setOpening] = useState(null);
  if (!opening || opening.key !== openingKey) {
    setOpening(area
      ? { key: openingKey, center: { lat: area.lat, lng: area.lng }, zoom: zoomForRadius(radius) }
      : { key: openingKey, fit: focusPoints(pins) });
  }
  const [moves, setMoves] = useState(0); // each tap in the list or on "near me" is a new place to go
  const target = moved && moved.areaKey === areaKey ? moved : opening;

  const onViewChange = useCallback((view) => setMapCenter((current) => (current && current.lat === view.center.lat && current.lng === view.center.lng && current.zoom === view.zoom ? current : { ...view.center, zoom: view.zoom })), []);
  const goTo = (pin) => {
    setSelectedId(pin.id);
    setMoves(moves + 1);
    setMoved({ areaKey, key: `store:${pin.id}:${moves + 1}`, center: { lat: pin.lat, lng: pin.lng }, zoom: Math.max(mapCenter?.zoom || 0, 13) });
  };
  const locate = () => {
    if (!navigator.geolocation) { setLocateNote("This device can't share its location. Drag the map to your area instead."); return; }
    setLocating(true);
    setLocateNote("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const here = { lat: position.coords.latitude, lng: position.coords.longitude };
        setYou(here);
        setMoves((count) => count + 1);
        setMoved({ areaKey, key: `you:${here.lat}:${here.lng}:${moves + 1}`, center: here, zoom: 12 });
        setLocating(false);
      },
      () => { setLocating(false); setLocateNote("Couldn't get your location. Allow location for Code 3 TCG, or drag the map to your area."); },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

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
  // The list: stores closest to the middle of the map, so it follows where you look.
  const middle = mapCenter || (selectedPin ? { lat: selectedPin.lat, lng: selectedPin.lng } : null);
  const listed = middle ? [...pins].sort((a, b) => milesBetween(middle, a) - milesBetween(middle, b)) : pins;
  const shown = showAll ? listed : listed.slice(0, LIST_START);
  const following = selected && (selected.followed || justFollowed.has(selected.id));
  return (
    <section className="restock-map-card" aria-labelledby="restock-map-title">
      <header className="restock-map-card__head">
        <div>
          <h3 id="restock-map-title">Restock map</h3>
          <p>{withReports ? `${withReports} store${withReports === 1 ? "" : "s"} with a report in the last 2 days${areaLabel ? ` · ${areaLabel}` : ""}.` : "No reports in the last 2 days yet. Tap a store to be the first."}</p>
        </div>
        {onBrowseAll ? <button type="button" className="restock-map-card__all" onClick={onBrowseAll}>All reports</button> : null}
      </header>
      <div className="restock-map-card__map">
        <RestockSlippyMap pins={pins} selectedId={selectedPin?.id || ""} onSelect={(id) => setSelectedId(String(id))} target={target} you={you} onViewChange={onViewChange} onLocate={locate} locating={locating} />
      </div>
      <ul className="restock-map-card__key" aria-label="What the pins mean">
        <li><i className="is-seen" aria-hidden="true" />Recent report</li>
        <li><i className="is-none" aria-hidden="true" />No report yet</li>
        <li><i className="is-group" aria-hidden="true">3</i>Tap to zoom in</li>
      </ul>
      {locateNote ? <p className="restock-map-card__note" role="status">{locateNote}</p> : null}
      {selected ? (
        <div className={`restock-map-card__store is-${latest.tone}`} aria-live="polite">
          <div className="restock-map-card__store-copy">
            <strong>{selectedPin.title}</strong>
            <span>{[selectedPin.place, selected.area].filter(Boolean).join(" · ")}{following ? " · Following" : ""}</span>
            <em>{latest.headline}</em>
            <small>{latest.detail}</small>
          </div>
          <div className="restock-map-card__actions">
            {onFollowStore ? (following
              ? <span className="restock-map-card__following" role="status">Following · you'll get alerts</span>
              : <PrimaryButton onClick={() => { onFollowStore(selected.store); setJustFollowed((current) => new Set(current).add(selected.id)); }}>Follow for free alerts</PrimaryButton>) : null}
            {onReportAtStore ? <SecondaryButton onClick={() => onReportAtStore(selected.store)}>Report here</SecondaryButton> : null}
            <a className="restock-map-card__link" href={directionsUrl(selectedPin)} target="_blank" rel="noreferrer">Directions</a>
            {onOpenStore ? <SecondaryButton onClick={() => onOpenStore(selected.store)}>Store reports</SecondaryButton> : null}
          </div>
        </div>
      ) : null}
      {rows.some((row) => !row.exact) ? <p className="restock-map-card__note">Some pins show the store's city, not its exact spot.</p> : null}
      <div className="restock-map-card__nearby">
        <h4 id="restock-map-list-title">Closest to the middle of the map</h4>
        <ul className="restock-map-card__list" aria-labelledby="restock-map-list-title">
          {shown.map((pin) => (
            <li key={pin.id}>
              <button type="button" aria-pressed={pin.id === selectedPin?.id} onClick={() => goTo(pin)}>
                <i className={`restock-map-card__dot is-${pin.tone}`} aria-hidden="true" />
                <span><strong>{pin.title}</strong><small>{pin.place || pin.row.area}</small></span>
                {pin.row.report ? <em>{pin.status}</em> : <em className="sr-only">No report yet</em>}
              </button>
            </li>
          ))}
        </ul>
        {listed.length > LIST_START ? <button type="button" className="restock-map-card__more" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? "Show fewer stores" : `Show all ${listed.length} stores`}</button> : null}
      </div>
    </section>
  );
}
