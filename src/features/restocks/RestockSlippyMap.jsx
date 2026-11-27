// A real, draggable map for the restock page (Nov 25 2026, owner: "the map is
// terrible"). The old picture-map could only shift about 50 px, could not be
// pinched, and piled every pin on one spot. This one drags anywhere, zooms with
// two fingers, the buttons, a double tap or Ctrl + wheel, and groups pins that
// would overlap into one numbered circle that zooms in when tapped.
// No map library: tiles are plain images from OpenStreetMap, maths in slippyMap.mjs.
// Nov 27 2026 ("improve the map"): two fingers and a trackpad zoom smoothly instead
// of jumping a whole step, the buttons glide, a whole state's stores can be on the
// map (only the ones in view are drawn), pins placed by city only are dashed, and
// "Near me" says so in words.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clampZoom, clusterPins, fitView, groupLabel, MAX_ZOOM, MIN_ZOOM, onScreen, panBy, project, toScreen, visibleTiles, zoomTo } from "./slippyMap.mjs";

const TILE_BASE = "https://tile.openstreetmap.org";
const DRAG_START = 5; // pixels before a touch counts as a drag, not a tap
const START_VIEW = { center: { lat: 39.5, lng: -98.35 }, zoom: MIN_ZOOM };
const GLIDE_MS = 200;
const prefersLessMotion = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

// target: where the map should go. { key, center, zoom } or { key, fit: [points], maxZoom }.
// A new key moves the map; the same key leaves it where the person put it.
// loading: the stores are still on their way; the map waits instead of showing a guess.
export default function RestockSlippyMap({ pins = [], selectedId = "", onSelect, target = null, you = null, label = "Restock map", onViewChange, onLocate, locating = false, loading = false }) {
  const boxRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState(START_VIEW);
  const [appliedKey, setAppliedKey] = useState("");
  const [failedTiles, setFailedTiles] = useState(0);
  const pointers = useRef(new Map());
  const gesture = useRef({ dragged: false, pinch: null });
  const glide = useRef(0);
  const glideGoal = useRef(null);
  const sizeRef = useRef(size);
  const viewRef = useRef(view);
  useEffect(() => { sizeRef.current = size; }, [size]);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => () => window.cancelAnimationFrame(glide.current), []);
  // Every move goes through here, so the latest view is known at once (lifting two fingers
  // settles from where the map really is, not from a view an effect has yet to catch up on).
  const moveView = useCallback((change) => setView((current) => {
    const next = change(current);
    viewRef.current = next;
    return next;
  }), []);

  // Zooms to a level, gliding there unless the device asks for less motion.
  const zoomSmoothly = useCallback((level, anchor = null) => {
    window.cancelAnimationFrame(glide.current);
    const goal = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, level));
    if (prefersLessMotion() || typeof window.requestAnimationFrame !== "function") {
      glideGoal.current = null;
      moveView((current) => zoomTo(current, goal, sizeRef.current, anchor));
      return;
    }
    glideGoal.current = goal;
    const from = viewRef.current.zoom;
    let started = 0;
    const frame = (now) => {
      if (!started) started = now;
      const progress = Math.min(1, (now - started) / GLIDE_MS);
      const level = progress >= 1 ? goal : from + (goal - from) * (1 - (1 - progress) ** 3);
      moveView((current) => zoomTo(current, level, sizeRef.current, anchor));
      if (progress < 1) glide.current = window.requestAnimationFrame(frame);
      else glideGoal.current = null;
    };
    glide.current = window.requestAnimationFrame(frame);
  }, [moveView]);
  // One level in or out. Steps from where a glide is heading, so two quick taps go two levels.
  const zoomStep = useCallback((delta, anchor = null) => {
    const base = glideGoal.current ?? Math.round(viewRef.current.zoom);
    zoomSmoothly(clampZoom(base + delta), anchor);
  }, [zoomSmoothly]);
  const stopGlide = () => { window.cancelAnimationFrame(glide.current); glideGoal.current = null; };

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
    setView(target.fit
      ? fitView(target.fit, size, target.maxZoom ? { maxZoom: target.maxZoom, lone: Math.min(13, target.maxZoom) } : undefined)
      : { center: target.center, zoom: clampZoom(target.zoom ?? view.zoom) });
  }
  // A jump to a new place ends any glide still under way.
  useEffect(() => { window.cancelAnimationFrame(glide.current); glideGoal.current = null; }, [appliedKey]);

  // Tell the page where the map is once it has stopped moving (the store list follows the map).
  useEffect(() => {
    if (!ready) return undefined;
    const timer = window.setTimeout(() => onViewChange?.(view, size), 160);
    return () => window.clearTimeout(timer);
  }, [view, size, ready, onViewChange]);

  // Ctrl (or pinch on a trackpad) + wheel zooms; a plain wheel keeps scrolling the page.
  // A trackpad pinch zooms smoothly with the fingers; a mouse wheel click is about one
  // level. Once the wheel stops, the map settles on the nearest whole level (sharpest pictures).
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    let settle = 0;
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      window.cancelAnimationFrame(glide.current);
      glideGoal.current = null;
      const rect = box.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const pixels = event.deltaY * (event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1);
      const change = Math.max(-1, Math.min(1, -pixels / 100));
      moveView((current) => zoomTo(current, current.zoom + change, sizeRef.current, anchor));
      window.clearTimeout(settle);
      settle = window.setTimeout(() => zoomSmoothly(Math.round(viewRef.current.zoom), anchor), 220);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => { window.clearTimeout(settle); box.removeEventListener("wheel", onWheel); };
  }, [moveView, zoomSmoothly]);

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
    if (event.target.closest?.(".restock-slippy__controls, .restock-slippy__near")) return;
    stopGlide();
    if (!pointers.current.size) gesture.current = { dragged: false, pinch: null };
    pointers.current.set(event.pointerId, { ...local(event), startX: event.clientX, startY: event.clientY });
    if (pointers.current.size === 2) gesture.current.pinch = { distance: spread().distance, zoom: viewRef.current.zoom, middle: spread().middle };
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
      // Two fingers: the map follows their middle and grows or shrinks with them, smoothly.
      const { distance, middle } = spread();
      const pinch = gesture.current.pinch || (gesture.current.pinch = { distance, zoom: viewRef.current.zoom, middle });
      const level = pinch.zoom + Math.log2(Math.max(1, distance) / Math.max(1, pinch.distance));
      pinch.middle = middle;
      moveView((current) => zoomTo(panBy(current, dx / 2, dy / 2), level, sizeRef.current, middle));
      return;
    }
    moveView((current) => panBy(current, dx, dy));
  }

  function handlePointerEnd(event) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 1 && gesture.current.pinch) {
      // Fingers lifted: settle on the nearest whole level, where the map pictures are sharpest.
      const { middle } = gesture.current.pinch;
      gesture.current.pinch = null;
      zoomSmoothly(Math.round(viewRef.current.zoom), middle);
    }
    try { if (boxRef.current.hasPointerCapture?.(event.pointerId)) boxRef.current.releasePointerCapture(event.pointerId); } catch { /* Nothing to release. */ }
    // A drag that ends on a pin must not count as a tap on it.
    if (!pointers.current.size && gesture.current.dragged) window.setTimeout(() => { gesture.current.dragged = false; }, 0);
  }

  function handleKeyDown(event) {
    const step = event.shiftKey ? 120 : 60;
    const move = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[event.key];
    if (move) { event.preventDefault(); moveView((current) => panBy(current, move[0], move[1])); return; }
    if (event.key === "+" || event.key === "=") { event.preventDefault(); zoomStep(1); }
    if (event.key === "-" || event.key === "_") { event.preventDefault(); zoomStep(-1); }
  }

  // No map pictures until the map knows where it is going (no wasted view of the whole country).
  const placed = ready && Boolean(appliedKey);
  const tiles = useMemo(() => (placed ? visibleTiles(view, size) : []), [placed, view, size]);
  // Each store's place on the world map is worked out once; moving the map only shifts and
  // scales it, so a whole state's stores stay quick while dragging. Only those in view are drawn.
  const worldPins = useMemo(() => pins.map((pin) => ({ pin, world: project(pin, 0) })), [pins]);
  const groups = useMemo(() => {
    if (!placed) return [];
    const scale = 2 ** view.zoom;
    const middle = project(view.center, view.zoom);
    const inView = [];
    for (const { pin, world } of worldPins) {
      const spot = { x: world.x * scale - middle.x + size.width / 2, y: world.y * scale - middle.y + size.height / 2 };
      if (onScreen(spot, size, 28)) inView.push({ ...pin, ...spot });
    }
    return clusterPins(inView, { radius: 46, selectedId });
  }, [placed, worldPins, view, size, selectedId]);
  const youAt = ready && you ? toScreen(you, view, size) : null;
  // The chosen store's name goes above its pin, or below when that covers fewer pins
  // (or the pin is near the top of the map).
  function tagBelow(pin) {
    if (pin.y < 64) return true;
    const reach = Math.min(110, 14 + String(pin.title || "").length * 4) + 23;
    const covered = (side) => groups.filter((group) => {
      if (group.items.includes(pin) || Math.abs(group.x - pin.x) >= reach) return false;
      const gap = side * (group.y - pin.y);
      return gap >= 8 && gap <= 80;
    }).length;
    const above = covered(-1), below = covered(1);
    return above > below && pin.y < size.height - 70;
  }

  // A drag or pinch that ends on a pin is not a tap on it.
  function tapGroup(event, group) {
    if (gesture.current.dragged) { event.preventDefault(); return; }
    if (view.zoom >= MAX_ZOOM) { onSelect?.(group.items[0].id); return; }
    zoomStep(2, { x: group.x, y: group.y });
  }
  function tapPin(event, id) {
    if (gesture.current.dragged) { event.preventDefault(); return; }
    onSelect?.(id);
  }

  return (
    <div className="restock-slippy" data-zoom={Math.round(view.zoom * 1000) / 1000} data-center={`${view.center.lat.toFixed(4)},${view.center.lng.toFixed(4)}`}>
      <div
        ref={boxRef}
        className="restock-slippy__canvas"
        role="region"
        aria-label={`${label}. Drag to move, pinch or use the buttons to zoom. Arrow keys also move the map.`}
        aria-busy={loading || undefined}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={(event) => { if (!event.target.closest?.("button")) zoomStep(1, local(event)); }}
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
            style={{ left: tile.left, top: tile.top, width: tile.size, height: tile.height }}
            onError={() => setFailedTiles((count) => count + 1)}
            onLoad={() => setFailedTiles(0)}
          />
        ))}
        {loading ? <p className="restock-slippy__loading" role="status">Loading stores…</p> : null}
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
                onClick={(event) => tapGroup(event, group)}
              >
                {groupLabel(group.items.length)}
              </button>
            );
          }
          const pin = group.items[0];
          const selected = selectedId && String(pin.id) === String(selectedId);
          return (
            <button
              type="button"
              key={group.key}
              className={`restock-pin is-${pin.tone || "none"}${selected ? " is-selected" : ""}${pin.followed ? " is-followed" : ""}${pin.estimated ? " is-estimated" : ""}`}
              style={{ left: pin.x, top: pin.y }}
              aria-pressed={Boolean(selected)}
              aria-label={`${pin.title}${pin.place ? `, ${pin.place}` : ""}. ${pin.status || ""}${pin.estimated ? " Placed by city, not the exact spot." : ""}`.trim()}
              onClick={(event) => tapPin(event, pin.id)}
            >
              <span aria-hidden="true">{pin.initial}</span>
              {selected ? <b className={"restock-pin__tag" + (pin.x > size.width - 110 ? " is-right" : pin.x < 110 ? " is-left" : "") + (tagBelow(pin) ? " is-below" : "")} aria-hidden="true">{pin.title}</b> : null}
            </button>
          );
        })}
        <div className="restock-slippy__controls" role="group" aria-label="Map controls">
          <button type="button" onClick={() => zoomStep(1)} disabled={view.zoom >= MAX_ZOOM} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => zoomStep(-1)} disabled={view.zoom <= MIN_ZOOM} aria-label="Zoom out">−</button>
        </div>
        {/* "Near me" in words: a crosshair alone was easy to miss (Nov 27 2026). */}
        {onLocate ? (
          <button type="button" className="restock-slippy__near" onClick={onLocate} disabled={locating} aria-label="Show stores near me">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="3.2" fill="currentColor" /><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <span aria-hidden="true">{locating ? "Finding you…" : "Near me"}</span>
          </button>
        ) : null}
        <span className="restock-slippy__credit">© OpenStreetMap</span>
      </div>
    </div>
  );
}
