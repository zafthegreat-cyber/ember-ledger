// Guided tour (Zena, 2026-11-06: "A guided tour through the app would be useful").
//
// Six short steps that point at the real controls on screen. No library: a
// fixed overlay with a cut-out around the target element and a card next to
// it. Steps whose target is not on screen (desktop vs phone) fall back to a
// centered card, so the tour never breaks. Nothing here changes saved data;
// the only thing stored is "seen" in localStorage.
// The seen-flag helpers and step list live beside the tour so App.jsx and tests share one source.
/* eslint-disable react-refresh/only-export-components */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import "./app-tour.css";

export const APP_TOUR_STORAGE_KEY = "code3-app-tour-v1";

export function appTourSeen() {
  try { return window.localStorage.getItem(APP_TOUR_STORAGE_KEY) === "seen"; } catch { return true; }
}
export function markAppTourSeen() {
  try { window.localStorage.setItem(APP_TOUR_STORAGE_KEY, "seen"); } catch { /* storage unavailable: fine */ }
}

export const APP_TOUR_STEPS = [
  {
    key: "welcome",
    title: "Welcome to Code 3 TCG",
    body: "Here's a 60-second walk through where things are. You can leave any time and restart it from Settings → Take the tour.",
  },
  {
    key: "workspaces",
    selectors: [".code3-workspace-switcher", ".ops-desktop-sidebar .ops-brand"],
    title: "Pick what you're doing",
    body: "Collect is your collection, sets and wants. Find is deals, restocks and auctions. Sell is inventory and sales. Switch here whenever you change hats.",
  },
  {
    key: "navigation",
    selectors: [".ops-mobile-nav", ".ops-desktop-sidebar"],
    title: "The tabs for this workspace",
    body: "The bottom bar (or the side rail on a big screen) is everything in the workspace you picked. Home is always first.",
  },
  {
    key: "add",
    selectors: [".ops-mobile-nav .is-global-action", ".topbar-quick-add-button"],
    title: "Add anything with +",
    body: "Scan a barcode, type a card name, or paste a listing. You choose where it goes: collection, wants, or items for sale.",
  },
  {
    key: "search",
    selectors: [".app-search-toggle"],
    title: "Search everything",
    body: "Cards, sets, stores, your own records and settings, all from one box. Try a card number like 4/102.",
  },
  {
    key: "you",
    selectors: [".command-board-v4-profile-action", ".ops-desktop-sidebar [data-nav-key='settings']", ".ops-mobile-nav button:last-child"],
    title: "You, settings and sign out",
    body: "Your account, backups, theme and Sign out live under You / Settings. Backups are yours to download any time; nothing leaves this device without you.",
  },
];

function findTarget(selectors = []) {
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (node && node.getClientRects().length) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight) return node;
    }
  }
  return null;
}

export default function AppTour({ open = false, onClose, steps = APP_TOUR_STEPS }) {
  const [index, setIndex] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    // Restart from step one each time the tour opens (state derived from props, no effect).
    setWasOpen(open);
    if (open) setIndex(0);
  }
  const [rect, setRect] = useState(null);
  const cardRef = useRef(null);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  const measure = useCallback(() => {
    if (!open || !step) return;
    const target = findTarget(step.selectors);
    if (!target) { setRect(null); return; }
    const box = target.getBoundingClientRect();
    const pad = 8;
    setRect({ top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 });
  }, [open, step]);

  // Measuring the target element is a read from the DOM, which is what layout effects are for.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useLayoutEffect(() => { measure(); }, [measure]);
  useEffect(() => {
    if (!open) return undefined;
    const update = () => measure();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open, measure]);

  useEffect(() => { if (open) cardRef.current?.focus({ preventScroll: true }); }, [open, index]);

  const finish = useCallback(() => { markAppTourSeen(); onClose?.(); }, [onClose]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); finish(); }
      if (event.key === "ArrowRight" && !last) { event.preventDefault(); setIndex((current) => current + 1); }
      if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); setIndex((current) => current - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish, last, index]);

  const cardStyle = useMemo(() => {
    if (!rect) return {};
    const margin = 12;
    const width = Math.min(360, window.innerWidth - 32);
    const spaceBelow = window.innerHeight - (rect.top + rect.height);
    const top = spaceBelow > 220 ? rect.top + rect.height + margin : Math.max(16, rect.top - margin - 200);
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 16);
    return { position: "fixed", top, left, width };
  }, [rect]);

  if (!open || !step) return null;
  return (
    <div className="app-tour" role="presentation">
      <div className="app-tour__backdrop" onClick={finish} aria-hidden="true" />
      {rect ? <div className="app-tour__spotlight" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} aria-hidden="true" /> : null}
      <section
        ref={cardRef}
        tabIndex={-1}
        className={`app-tour__card${rect ? " app-tour__card--anchored" : ""}`}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-tour-title"
        aria-describedby="app-tour-body"
      >
        <span className="app-tour__progress">Step {index + 1} of {steps.length}</span>
        <h2 id="app-tour-title">{step.title}</h2>
        <p id="app-tour-body">{step.body}</p>
        {!rect && step.selectors ? <p className="app-tour__note">This control isn't on this screen right now; you'll see it on the main pages.</p> : null}
        <div className="app-tour__actions">
          <button type="button" className="app-tour__skip" onClick={finish}>{last ? "Close" : "Skip tour"}</button>
          <span className="app-tour__spacer" />
          {index > 0 ? <button type="button" className="app-tour__back" onClick={() => setIndex((current) => current - 1)}>Back</button> : null}
          <button type="button" className="app-tour__next" onClick={() => (last ? finish() : setIndex((current) => current + 1))}>{last ? "Done" : "Next"}</button>
        </div>
      </section>
    </div>
  );
}
