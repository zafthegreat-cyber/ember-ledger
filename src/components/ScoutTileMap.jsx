import { useEffect, useMemo, useRef, useState } from "react";

const TILE_SIZE = 256;
const PAN_DRAG_THRESHOLD = 4;
const DEFAULT_TILE_BASE_URL = "https://tile.openstreetmap.org";
const AREA_COORDINATE_FALLBACKS = [
  { keys: ["virginia beach", "lynn haven", "lynnhaven", "pembroke", "princess anne"], lat: 36.8529, lng: -75.978 },
  { keys: ["chesapeake", "greenbrier", "battlefield", "great bridge"], lat: 36.7682, lng: -76.2875 },
  { keys: ["norfolk", "ghent", "military circle"], lat: 36.8508, lng: -76.2859 },
  { keys: ["portsmouth"], lat: 36.8354, lng: -76.2983 },
  { keys: ["newport news"], lat: 37.0871, lng: -76.473 },
  { keys: ["hampton"], lat: 37.0299, lng: -76.3452 },
  { keys: ["suffolk"], lat: 36.7282, lng: -76.5836 },
  { keys: ["williamsburg"], lat: 37.2707, lng: -76.7075 },
  { keys: ["richmond", "short pump", "chesterfield", "henrico"], lat: 37.5407, lng: -77.436 },
  { keys: ["alexandria", "arlington", "fairfax", "tysons", "northern virginia", "nova"], lat: 38.8462, lng: -77.3064 },
  { keys: ["fredericksburg", "spotsylvania"], lat: 38.3032, lng: -77.4605 },
  { keys: ["charlottesville", "albemarle"], lat: 38.0293, lng: -78.4767 },
  { keys: ["roanoke"], lat: 37.271, lng: -79.9414 },
  { keys: ["lynchburg"], lat: 37.4138, lng: -79.1422 },
  { keys: ["shenandoah", "winchester", "harrisonburg"], lat: 38.4496, lng: -78.8689 },
  { keys: ["eastern shore", "accomack", "onancock"], lat: 37.708, lng: -75.7497 },
  { keys: ["southside", "danville", "martinsville"], lat: 36.5859, lng: -79.395 },
  { keys: ["southwest", "bristol", "abingdon", "wytheville"], lat: 36.7098, lng: -81.9773 },
  { keys: ["hampton roads", "757", "virginia"], lat: 36.8529, lng: -76.1474 },
];

function stableOffset(seed, scale = 0.028) {
  const text = String(seed || "scout-store");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  const x = (((hash & 0xff) / 255) - 0.5) * scale;
  const y = ((((hash >> 8) & 0xff) / 255) - 0.5) * scale;
  return { lat: y, lng: x };
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getRowCoordinates(row = {}) {
  const coordinates = row.coordinates || row.location || {};
  const store = row.store || row.profile?.store || {};
  const lat = toFiniteNumber(
    coordinates.lat ??
    coordinates.latitude ??
    row.lat ??
    row.latitude ??
    store.lat ??
    store.latitude ??
    store.locationLat ??
    store.location_lat
  );
  const lng = toFiniteNumber(
    coordinates.lng ??
    coordinates.lon ??
    coordinates.longitude ??
    row.lng ??
    row.lon ??
    row.longitude ??
    store.lng ??
    store.lon ??
    store.longitude ??
    store.locationLng ??
    store.location_lng
  );
  if (lat === null || lng === null) return null;
  if (lat === 0 && lng === 0) return null;
  if (Math.abs(lat) > 85.05112878 || Math.abs(lng) > 180) return null;
  return { lat, lng, source: "coordinate" };
}

function inferAreaCoordinates(row = {}, index = 0) {
  const store = row.store || row.profile?.store || {};
  const haystack = [
    row.area,
    row.city,
    row.region,
    row.retailer,
    row.name,
    row.storeName,
    row.store_name,
    row.profile?.area,
    row.profile?.areaLabel,
    row.profile?.name,
    store.city,
    store.region,
    store.address,
    store.area,
    store.name,
    store.storeName,
    store.nickname,
    store.retailer,
  ].filter(Boolean).join(" ").toLowerCase();
  const fallback = AREA_COORDINATE_FALLBACKS.find((entry) => entry.keys.some((key) => haystack.includes(key)));
  if (!fallback) return null;
  const offset = stableOffset(`${haystack}-${index}`);
  return {
    lat: fallback.lat + offset.lat,
    lng: fallback.lng + offset.lng,
    source: "area",
  };
}

function latLngToWorld({ lat, lng }, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sinLat = Math.sin((safeLat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function estimateZoom(coordinateRows, columns, rowsCount) {
  if (coordinateRows.length <= 1) return 13;

  // Pick the closest zoom that still keeps the full store set inside the map.
  // This avoids turning nearby stores into a single cluster on wide boards.
  for (let zoom = 15; zoom >= 6; zoom -= 1) {
    const worlds = coordinateRows.map((row) => latLngToWorld(row.coordinates, zoom));
    const xValues = worlds.map((world) => world.x);
    const yValues = worlds.map((world) => world.y);
    const xSpan = Math.max(...xValues) - Math.min(...xValues);
    const ySpan = Math.max(...yValues) - Math.min(...yValues);
    if (xSpan <= columns * TILE_SIZE * 0.7 && ySpan <= rowsCount * TILE_SIZE * 0.62) {
      return zoom;
    }
  }

  return 6;
}

function normalizeRows(rows = []) {
  return rows.map((row, index) => {
    const coordinates = getRowCoordinates(row) || inferAreaCoordinates(row, index);
    const store = row.store || row.profile?.store || {};
    const name = row.name || row.profile?.name || store.nickname || store.name || store.storeName || "Scout store";
    const retailer = row.retailer || store.retailer || store.chain || row.profile?.retailer || "Store";
    return {
      ...row,
      id: String(row.id || store.id || store.storeId || `${retailer}-${name}-${index}`),
      name,
      retailer,
      area: row.area || row.profile?.areaLabel || row.profile?.area || store.city || row.city || "Area protected",
      coordinates,
      coordinateSource: coordinates?.source || "missing",
      watchlisted: Boolean(row.watchlisted || row.watched || store.favorite || store.watched),
    };
  });
}

export default function ScoutTileMap({
  rows = [],
  className = "",
  compact = false,
  label = "Local Scout map",
  mapLabel = "Local map",
  emptyTitle = "No mapped Scout stores yet",
  emptyDetail = "Add store coordinates to plot real map pins.",
  maxPins = 12,
  interactive = false,
  onPinSelect,
  selectedId = "",
  focusFirstPin = false,
  tileBaseUrl = DEFAULT_TILE_BASE_URL,
  tileColumnCount,
  tileRowCount,
  showFacts = true,
  showAttributionLink = true,
}) {
  const [zoomAdjustment, setZoomAdjustment] = useState(0);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [tileErrorKeys, setTileErrorKeys] = useState(() => new Set());
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const suppressPinClickRef = useRef(false);
  const map = useMemo(() => {
    const normalizedRows = normalizeRows(rows);
    const coordinateRows = normalizedRows.filter((row) => row.coordinates).slice(0, maxPins);
    const coordinateBackedCount = coordinateRows.filter((row) => row.coordinateSource === "coordinate").length;
    const areaEstimatedCount = coordinateRows.filter((row) => row.coordinateSource === "area").length;
    const unmappedCount = Math.max(0, normalizedRows.length - coordinateRows.length);
    if (!coordinateRows.length) {
      return {
        normalizedRows,
        coordinateRows,
        pins: [],
        tiles: [],
        zoom: 0,
        mappedCount: 0,
        coordinateBackedCount,
        areaEstimatedCount,
        unmappedCount,
      };
    }

    const columns = toFiniteNumber(tileColumnCount) || (compact ? 5 : 8);
    const rowsCount = toFiniteNumber(tileRowCount) || 3;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const zoom = clamp(estimateZoom(coordinateRows, columns, rowsCount) + zoomAdjustment, 6, 17);
    const coordinateWorlds = coordinateRows.map((row) => latLngToWorld(row.coordinates, zoom));
    const worldXValues = coordinateWorlds.map((world) => world.x);
    const worldYValues = coordinateWorlds.map((world) => world.y);
    const selectedCoordinateIndex = coordinateRows.findIndex((row) => selectedId && String(row.id) === String(selectedId));
    const zoomFocusIndex = selectedCoordinateIndex >= 0
      ? selectedCoordinateIndex
      : zoomAdjustment > 0
        ? Math.max(0, coordinateRows.findIndex((row) => row.watchlisted))
        : -1;
    const centerWorld = zoomFocusIndex >= 0
      ? coordinateWorlds[zoomFocusIndex]
      : {
        x: (Math.min(...worldXValues) + Math.max(...worldXValues)) / 2,
        y: (Math.min(...worldYValues) + Math.max(...worldYValues)) / 2,
      };
    const centerTileX = Math.floor(centerWorld.x / TILE_SIZE);
    const centerTileY = Math.floor(centerWorld.y / TILE_SIZE);
    const startX = centerTileX - Math.floor(columns / 2);
    const startY = centerTileY - Math.floor(rowsCount / 2);
    const tileWorldX = startX * TILE_SIZE;
    const tileWorldY = startY * TILE_SIZE;
    const tileWorldWidth = columns * TILE_SIZE;
    const tileWorldHeight = rowsCount * TILE_SIZE;
    const tileLimit = 2 ** zoom;
    const tileRows = [];

    for (let y = 0; y < rowsCount; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const rawTileX = startX + x;
        const tileX = ((rawTileX % tileLimit) + tileLimit) % tileLimit;
        const tileY = clamp(startY + y, 0, tileLimit - 1);
        tileRows.push({
          key: `${zoom}-${tileX}-${tileY}-${x}-${y}`,
          url: `${tileBaseUrl}/${zoom}/${tileX}/${tileY}.png`,
          left: `${(x / columns) * 100}%`,
          top: `${(y / rowsCount) * 100}%`,
          width: `${100 / columns}%`,
          height: `${100 / rowsCount}%`,
        });
      }
    }

    const pinInset = interactive ? 12 : (compact ? 5 : 3);
    const pins = coordinateRows.map((row, index, rowsForPins) => {
      const world = coordinateWorlds[index];
      const baseX = ((world.x - tileWorldX) / tileWorldWidth) * 100;
      const baseY = ((world.y - tileWorldY) / tileWorldHeight) * 100;
      const earlierOverlaps = rowsForPins.slice(0, index).filter((candidate, candidateIndex) => {
        const candidateWorld = coordinateWorlds[candidateIndex];
        const candidateX = ((candidateWorld.x - tileWorldX) / tileWorldWidth) * 100;
        const candidateY = ((candidateWorld.y - tileWorldY) / tileWorldHeight) * 100;
        return Math.abs(candidateX - baseX) < 2.8 && Math.abs(candidateY - baseY) < 4;
      }).length;
      const collisionAngle = ((earlierOverlaps * 137.5) - 65) * (Math.PI / 180);
      const collisionSpread = earlierOverlaps ? Math.min(4.5, 2.25 + earlierOverlaps * 0.65) : 0;
      const x = baseX + Math.cos(collisionAngle) * collisionSpread;
      const y = baseY + Math.sin(collisionAngle) * collisionSpread;
      return {
        ...row,
        index,
        x: clamp(x, pinInset, 100 - pinInset),
        y: clamp(y, pinInset, 100 - pinInset),
        visible: x >= -3 && x <= 103 && y >= -5 && y <= 105,
      };
    });

    return {
      normalizedRows,
      coordinateRows,
      pins: pins.filter((pin) => pin.visible),
      tiles: tileRows,
      zoom,
      mappedCount: coordinateRows.length,
      coordinateBackedCount,
      areaEstimatedCount,
      unmappedCount,
      columns,
      rowsCount,
    };
  }, [compact, interactive, maxPins, rows, selectedId, tileBaseUrl, tileColumnCount, tileRowCount, zoomAdjustment]);

  const hasPins = map.pins.length > 0;
  const mapStatus = hasPins
    ? map.areaEstimatedCount && !map.coordinateBackedCount
      ? "Area-estimated"
      : map.areaEstimatedCount
        ? "Mixed map"
        : "Coordinate-backed"
    : "Needs coordinates";
  const mappedSummary = hasPins
    ? map.areaEstimatedCount
      ? `${map.mappedCount}/${map.normalizedRows.length || map.mappedCount} mapped with privacy-safe area estimates`
      : `${map.mappedCount}/${map.normalizedRows.length || map.mappedCount} coordinate-backed`
    : "No coordinate-backed stores";
  const rootClass = [
    "scout-tile-map",
    hasPins ? "has-tiles" : "is-empty",
    compact ? "is-compact" : "",
    className,
  ].filter(Boolean).join(" ");
  const focusPin = map.pins.find((pin) => selectedId && String(pin.id) === String(selectedId)) ||
    map.pins.find((pin) => pin.watchlisted) ||
    (focusFirstPin ? map.pins[0] : null) ||
    null;
  const currentTileErrorCount = map.tiles.reduce((count, tile) => count + (tileErrorKeys.has(tile.key) ? 1 : 0), 0);
  const mapUnavailable = Boolean(map.tiles.length && currentTileErrorCount >= Math.min(4, map.tiles.length));
  const pannable = Boolean(interactive && hasPins);

  useEffect(() => {
    setPanOffset({ x: 0, y: 0 });
  }, [selectedId, zoomAdjustment]);

  function clampPan(nextPan) {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return nextPan;
    const maxX = Math.min(52, Math.max(28, bounds.width * 0.06));
    const maxY = Math.min(44, Math.max(24, bounds.height * 0.08));
    return {
      x: Math.max(-maxX, Math.min(maxX, nextPan.x)),
      y: Math.max(-maxY, Math.min(maxY, nextPan.y)),
    };
  }

  function resetMapView() {
    suppressPinClickRef.current = false;
    setZoomAdjustment(0);
    setPanOffset({ x: 0, y: 0 });
  }

  function changeZoom(delta) {
    suppressPinClickRef.current = false;
    setPanOffset({ x: 0, y: 0 });
    setZoomAdjustment((value) => Math.max(-2, Math.min(3, value + delta)));
  }

  function handlePointerDown(event) {
    if (!pannable || (event.button !== undefined && event.button !== 0)) return;
    if (event.target.closest(".scout-tile-map-controls, .scout-tile-map-attribution, a")) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: panOffset.x,
      originY: panOffset.y,
      moved: false,
    };
    suppressPinClickRef.current = false;
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < PAN_DRAG_THRESHOLD) return;
    drag.moved = true;
    suppressPinClickRef.current = true;
    setIsPanning(true);
    canvasRef.current?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    setPanOffset(clampPan({ x: drag.originX + deltaX, y: drag.originY + deltaY }));
  }

  function finishPointerDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved = drag.moved;
    dragRef.current = null;
    setIsPanning(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (moved) {
      window.setTimeout(() => {
        suppressPinClickRef.current = false;
      }, 0);
    }
  }

  function handleMapKeyDown(event) {
    if (!pannable) return;
    const step = event.shiftKey ? 48 : 24;
    const movement = {
      ArrowLeft: { x: step, y: 0 },
      ArrowRight: { x: -step, y: 0 },
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
    }[event.key];
    if (movement) {
      event.preventDefault();
      setPanOffset((current) => clampPan({ x: current.x + movement.x, y: current.y + movement.y }));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      resetMapView();
    }
  }

  return (
    <div className={rootClass} aria-label={label}>
      <div
        aria-label={pannable ? `${label}. Drag or use arrow keys to pan.` : undefined}
        className={`scout-tile-map-canvas${pannable ? " is-pannable" : ""}${isPanning ? " is-panning" : ""}`}
        data-dragging={isPanning ? "true" : "false"}
        data-pan-x={Math.round(panOffset.x)}
        data-pan-y={Math.round(panOffset.y)}
        onKeyDown={handleMapKeyDown}
        onPointerCancel={finishPointerDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        ref={canvasRef}
        role={pannable ? "region" : undefined}
        tabIndex={pannable ? 0 : undefined}
      >
        <span
          className="scout-tile-map-viewport"
          style={{
            "--map-aspect": map.columns && map.rowsCount ? map.columns / map.rowsCount : 1.66,
            "--map-pan-x": `${panOffset.x}px`,
            "--map-pan-y": `${panOffset.y}px`,
          }}
        >
          {map.tiles.map((tile) => (
            <img
              alt=""
              aria-hidden="true"
              className="scout-tile-map-tile"
              decoding="async"
              draggable="false"
              key={tile.key}
              loading="eager"
              referrerPolicy="no-referrer"
              src={tile.url}
              style={{ left: tile.left, top: tile.top, width: tile.width, height: tile.height }}
              onError={() => setTileErrorKeys((current) => {
                const next = new Set(current);
                next.add(tile.key);
                return next;
              })}
            />
          ))}
          <span className="scout-tile-map-scrim" aria-hidden="true" />
          <span className="scout-tile-map-range scout-tile-map-range-one" aria-hidden="true" />
          <span className="scout-tile-map-range scout-tile-map-range-two" aria-hidden="true" />
          {!hasPins ? (
            <span className="scout-tile-map-empty">
              <b>{emptyTitle}</b>
              <small>{emptyDetail}</small>
              <span className="scout-tile-map-empty-actions" aria-hidden="true">
                <em>Choose watched stores</em>
                <em>Area fallback ready</em>
                <em>Area protected</em>
              </span>
            </span>
          ) : null}
          {mapUnavailable ? (
            <span className="scout-tile-map-offline" role="status">
              <b>Map tiles are unavailable</b>
              <small>Store pins and the directory still work. Check the connection and retry.</small>
            </span>
          ) : null}
          {map.pins.map((pin) => {
            const selected = selectedId && String(pin.id) === String(selectedId);
            const className = `scout-tile-map-pin${pin.watchlisted ? " is-watched" : ""}${selected ? " is-selected" : ""}`;
            const content = (
              <>
                <span>{pin.retailer.slice(0, 2).toUpperCase()}</span>
                <b>{pin.index + 1}</b>
              </>
            );
            return onPinSelect ? (
              <button
                type="button"
                aria-label={`Open ${pin.name}, ${pin.area}`}
                className={className}
                key={pin.id}
                style={{ "--pin-x": `${pin.x}%`, "--pin-y": `${pin.y}%` }}
                title={`${pin.name} - ${pin.area}`}
                onClick={(event) => {
                  if (suppressPinClickRef.current) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                  }
                  onPinSelect(pin);
                }}
              >
                {content}
              </button>
            ) : (
              <span
                className={className}
                key={pin.id}
                style={{ "--pin-x": `${pin.x}%`, "--pin-y": `${pin.y}%` }}
                title={`${pin.name} - ${pin.area}`}
              >
                {content}
              </span>
            );
          })}
        </span>
        {focusPin ? (
          <span className="scout-tile-map-labels">
            <span>
              <b>{focusPin.index + 1}. {focusPin.name}</b>
              <small>{focusPin.area}</small>
            </span>
          </span>
        ) : null}
        <span className="scout-tile-map-toolbar">
          <b>{mapLabel}</b>
          <i>{mapStatus}</i>
        </span>
        {interactive && hasPins ? (
          <span className="scout-tile-map-controls" role="group" aria-label="Map zoom controls">
            <button type="button" onClick={() => changeZoom(1)} disabled={zoomAdjustment >= 3} aria-label="Zoom map in">+</button>
            <button type="button" onClick={resetMapView} disabled={zoomAdjustment === 0 && panOffset.x === 0 && panOffset.y === 0} aria-label="Reset map zoom">Reset</button>
            <button type="button" onClick={() => changeZoom(-1)} disabled={zoomAdjustment <= -2} aria-label="Zoom map out">-</button>
          </span>
        ) : null}
        <span className="scout-tile-map-attribution">
          {showAttributionLink ? (
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Map data OpenStreetMap</a>
          ) : (
            <span>Map data OpenStreetMap</span>
          )}
        </span>
      </div>
      {showFacts ? (
        <div className="scout-tile-map-facts">
          <span><b>{map.mappedCount}</b><small>Mapped stores</small></span>
          <span><b>{map.areaEstimatedCount}</b><small>Area estimated</small></span>
          <span><b>{map.zoom || "Safe"}</b><small>{map.zoom ? "Tile zoom" : "Map setup"}</small></span>
        </div>
      ) : null}
      <p className="scout-tile-map-rule">{mappedSummary}. Area-level only. No inventory guarantee.</p>
    </div>
  );
}
