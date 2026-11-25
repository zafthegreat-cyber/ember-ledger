// A real, draggable map for the restock page (Nov 25 2026, owner: "the map is
// terrible"). The old picture-map could only shift about 50 px, could not be
// pinched, and piled every pin on one spot. This one drags anywhere, zooms with
// two fingers, the buttons, a double tap or Ctrl + wheel, and groups pins that
// would overlap into one numbered circle that zooms in when tapped.
// No map library: tiles are plain images from OpenStreetMap, maths in slippyMap.mjs.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clampZoom, clusterPins, fitView, MAX_ZOOM, MIN_ZOOM, onScreen, panBy, TILE, toScreen, visibleTiles, zoomAt } from "./slippyMap.mjs";

const TILE_BASE = "https://tile.openstreetmap.org";
const DRAG_START = 5; // pixels before a touch counts as a drag, not a tap
const START_VIEW = { center: { lat: 39.5, lng: -98.35 }, zoom: MIN_ZOOM };

// target: where the map should go. { key, center, zoom } or { key, fit: [points] }.
// A new key moves the map; the same key leaves it where the person put it.
export default function RestockSlippyMap({ pins = [], selectedId = "", onSelect, target = null, you = null, label = "Restock map", onViewChange, onLocate, locating = false }) {
  const boxRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState(START_VIEW);
  const [appliedKey, setAppliedKey] = useState("");
  const [failedTiles, setFailedTiles] = useState(0);
  const pointers = useRef(new Map());
  const gesture = useRef({ dragged: false, pinch: 0 });
  const sizeRef = useRef(size);
  useEffect(() => { sizeRef.current = size; }, [size]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const measure = () => {
      const rect = box.getBoundingClientRect();
      setSize((current) => (Math.abs(current.width - rect.width) < 1 && Math.abs(current.height - rect.height) < 1 ? current : { width: rect.width, height: rect.height }));
    };
    measure();
    if (typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Go where the page asks, once the map knows its own size.
  const ready = size.width > 0 && size.height > 0;
  if (ready && target && target.key !== appliedKey) {
    setAppliedKey(target.key);
    setView(target.fit ? fitView(target.fit, size) : { center: target.center, zoom: clampZoom(target.zoom ?? view.zoom) });
  }

  // Tell the page where the map is once it has stopped moving (the store list follows the map).
  useEffect(() => {
    if (!ready) return undefined;
    const timer = window.setTimeout(() => onViewChange?.(view, size), 160);
    return () => window.clearTimeout(timer);
  }, [view, size, ready, onViewChange]);

  // Ctrl (or pinch on a trackpad) + wheel zooms; a plain wheel keeps scrolling the page.
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    let last = 0;
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const now = Date.now();
      if (now - last < 140) return;
      last = now;
      const rect = box.getBoundingClientRect();
      setView((current) => zoomAt(current, event.deltaY < 0 ? 1 : -1, sizeRef.current, { x: event.clientX - rect.left, y: event.clientY - rect.top }));
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, []);

  const local = (event) => {
    const rect = boxRef.current.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  function handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest?.(".restock-slippy__controls")) return;
    if (!pointers.current.size) gesture.current = { dragged: false, pinch: 0 };
    pointers.current.set(event.pointerId, { ...local(event), startX: event.clientX, startY: event.clientY });
    if (pointers.current.size === 2) gesture.current.pinch = spread().distance;
  }

  function handlePointerMove(event) {
    const pointer = pointers.current.get(event.pointerId);
    if (!pointer) return;
    const next = local(event);
    if (!gesture.current.dragged && pointers.current.size === 1 && Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < DRAG_START) return;
    if (!gesture.current.dragged) {
      gesture.current.dragged = true;
      try { boxRef.current.setPointerCapture?.(event.pointerId); } catch { /* Dragging still works without capture. */ }
    }
    event.preventDefault();
    const dx = next.x - pointer.x, dy = next.y - pointer.y;
    pointers.current.set(event.pointerId, { ...pointer, ...next });
    if (pointers.current.size >= 2) {
      // Two fingers: the map follows their middle, and steps in or out as they spread or close.
      const { distance, middle } = spread();
      const base = gesture.current.pinch || distance;
      const step = distance > base * 1.45 ? 1 : distance < base * 0.69 ? -1 : 0;
      if (step) gesture.current.pinch = distance;
      setView((current) => {
        const moved = panBy(current, dx / 2, dy / 2);
        return step ? zoomAt(moved, step, sizeRef.current, middle) : moved;
      });
      return;
    }
    setView((current) => panBy(current, dx, dy));
  }

  function handlePointerEnd(event) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 1) gesture.current.pinch = 0;
    try { if (boxRef.current.hasPointerCapture?.(event.pointerId)) boxRef.current.releasePointerCapture(event.pointerId); } catch { /* Nothing to release. */ }
    // A drag that ends on a pin must not count as a tap on it.
    if (!pointers.current.size && gesture.current.dragged) window.setTimeout(() => { gesture.current.dragged = false; }, 0);
  }

  function handleKeyDown(event) {
    const step = event.shiftKey ? 120 : 60;
    const move = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[event.key];
    if (move) { event.preventDefault(); setView((current) => panBy(current, move[0], move[1])); return; }
    if (event.key === "+" || event.key === "=") { event.preventDefault(); setView((current) => zoomAt(current, 1, size)); }
    if (event.key === "-" || event.key === "_") { event.preventDefault(); setView((current) => zoomAt(current, -1, size)); }
  }

  const tiles = useMemo(() => (ready ? visibleTiles(view, size) : []), [ready, view, size]);
  const groups = useMemo(() => {
    if (!ready) return [];
    const placed = pins.map((pin) => ({ ...pin, ...toScreen(pin, view, size) })).filter((pin) => onScreen(pin, size, 28));
    return clusterPins(placed, { radius: 46, selectedId });
  }, [ready, pins, view, size, selectedId]);
  const youAt = ready && you ? toScreen(you, view, size) : null;
  const tap = useCallback((action) => (event) => {
    if (gesture.current.dragged) { event.preventDefault(); return; }
    action(event);
  }, []);

  return (
    <div className="restock-slippy" data-zoom={view.zoom} data-center={`${view.center.lat.toFixed(4)},${view.center.lng.toFixed(4)}`}>
      <div
        ref={boxRef}
        className="restock-slippy__canvas"
        role="region"
        aria-label={`${label}. Drag to move, pinch or use the buttons to zoom. Arrow keys also move the map.`}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={(event) => { if (!event.target.closest?.("button")) setView((current) => zoomAt(current, 1, size, local(event))); }}
        onKeyDown={handleKeyDown}
      >
        {tiles.map((tile) => (
          <img
            key={tile.key}
            className="restock-slippy__tile"
            alt=""
            aria-hidden="true"
            draggable="false"
            decoding="async"
            referrerPolicy="no-referrer"
            src={`${TILE_BASE}/${tile.z}/${tile.x}/${tile.y}.png`}
            style={{ left: tile.left, top: tile.top, width: TILE, height: TILE }}
            onError={() => setFailedTiles((count) => count + 1)}
            onLoad={() => setFailedTiles(0)}
          />
        ))}
        {failedTiles >= 4 ? <p className="restock-slippy__offline" role="status">The map picture didn't load. The stores below still work.</p> : null}
        {youAt && onScreen(youAt, size, 12) ? <span className="restock-slippy__you" style={{ left: youAt.x, top: youAt.y }} role="img" aria-label="You are here" /> : null}
        {groups.map((group) => {
          if (group.items.length > 1) {
            const seen = group.items.some((item) => item.tone === "confirmed" || item.tone === "reported");
            return (
              <button
                type="button"
                key={group.key}
                className={`restock-pin restock-pin--group${seen ? " has-report" : ""}`}
                style={{ left: group.x, top: group.y }}
                aria-label={`${group.items.length} stores here. Zoom in to see them.`}
                onClick={tap(() => {
                  if (view.zoom >= MAX_ZOOM) { onSelect?.(group.items[0].id); return; }
                  setView((current) => zoomAt(current, 2, size, { x: group.x, y: group.y }));
                })}
              >
                {group.items.length}
              </button>
            );
          }
          const pin = group.items[0];
          const selected = selectedId && String(pin.id) === String(selectedId);
          return (
            <button
              type="button"
              key={group.key}
              className={`restock-pin is-${pin.tone || "none"}${selected ? " is-selected" : ""}${pin.followed ? " is-followed" : ""}`}
              style={{ left: pin.x, top: pin.y }}
              aria-pressed={Boolean(selected)}
              aria-label={`${pin.title}${pin.place ? `, ${pin.place}` : ""}. ${pin.status || ""}`.trim()}
              onClick={tap(() => onSelect?.(pin.id))}
            >
              <span aria-hidden="true">{pin.initial}</span>
              {selected ? <b className={"restock-pin__tag" + (pin.x > size.width - 110 ? " is-right" : pin.x < 110 ? " is-left" : "")} aria-hidden="true">{pin.title}</b> : null}
            </button>
          );
        })}
        <div className="restock-slippy__controls" role="group" aria-label="Map controls">
          <button type="button" onClick={() => setView((current) => zoomAt(current, 1, size))} disabled={view.zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => setView((current) => zoomAt(current, -1, size))} disabled={view.zoom <= MIN_ZOOM} aria-label="Zoom out">−</button>
          {onLocate ? <button type="button" className="restock-slippy__locate" onClick={onLocate} disabled={locating} aria-label="Show stores near me"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="currentColor" /><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></button> : null}
        </div>
        <span className="restock-slippy__credit">© OpenStreetMap</span>
      </div>
    </div>
  );
}
