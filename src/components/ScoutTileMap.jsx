import { PrivateStorageImage } from "./PrivateReceipt.jsx";
import { useMemo, useRef, useState } from "react";
import { getRowCoordinates, inferAreaCoordinates, toFiniteNumber } from "../utils/storeMapCoordinates.mjs";
// Tiles and credit follow OpenStreetMap's tile policy (Nov 27 2026): see src/config/mapTiles.js.
import { MAP_TILE_CREDIT, MAP_TILE_CREDIT_URL, mapTileUrl } from "../config/mapTiles.js";

const TILE_SIZE = 256;
const PAN_DRAG_THRESHOLD = 4;
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
  for (let zoom = 15; zoom >= 2; zoom -= 1) {
    const worlds = coordinateRows.map((row) => latLngToWorld(row.coordinates, zoom));
    const xValues = worlds.map((world) => world.x);
    const yValues = worlds.map((world) => world.y);
    const xSpan = Math.max(...xValues) - Math.min(...xValues);
    const ySpan = Math.max(...yValues) - Math.min(...yValues);
    if (xSpan <= columns * TILE_SIZE * 0.7 && ySpan <= rowsCount * TILE_SIZE * 0.62) {
      return zoom;
    }
  }

  return 2;
}

function normalizeRows(rows = []) {
  return rows.map((row, index) => {
    const coordinates = getRowCoordinates(row) || inferAreaCoordinates(row, index);
    const store = row.store || row.profile?.store || {};
    const name = row.name || row.profile?.name || store.nickname || store.name || store.storeName || "Watched store";
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
  label = "Local restock map",
  mapLabel = "Local map",
  emptyTitle = "No mapped watched stores yet",
  emptyDetail = "Add store coordinates to plot real map pins.",
  maxPins = 12,
  interactive = false,
  onPinSelect,
  selectedId = "",
  focusFirstPin = false,
  tileBaseUrl = "",
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
          url: tileBaseUrl ? `${tileBaseUrl}/${zoom}/${tileX}/${tileY}.png` : mapTileUrl(zoom, tileX, tileY),
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

  const [panOrigin, setPanOrigin] = useState({ selectedId, zoomAdjustment });
  if (panOrigin.selectedId !== selectedId || panOrigin.zoomAdjustment !== zoomAdjustment) {
    setPanOrigin({ selectedId, zoomAdjustment });
    setPanOffset({ x: 0, y: 0 });
  }

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
            <PrivateStorageImage
              alt=""
              aria-hidden="true"
              className="scout-tile-map-tile"
              decoding="async"
              draggable="false"
              key={tile.key}
              loading="eager"
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
            <a href={MAP_TILE_CREDIT_URL} target="_blank" rel="noreferrer">{MAP_TILE_CREDIT}</a>
          ) : (
            <span>{MAP_TILE_CREDIT}</span>
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
