import { useEffect, useState } from "react";
import "./restock-shortcuts.css";

export function RecentRestockStores({ rows, onSelect }) {
  if (!rows.length) return null;
  return <section className="restock-recent-stores" aria-label="Your recent report stores">
    <strong>Your recent stores</strong>
    <p>Choose a location you reported before. Check the store and time for this visit.</p>
    <div>{rows.map(row => <button type="button" className="secondary-button" key={row.id} onClick={() => onSelect(row.store)}>
      <strong>{row.name}</strong><span>{[row.city, row.address].filter(Boolean).join(" · ") || row.retailer}</span>
    </button>)}</div>
  </section>;
}

export function RestockOfflineNotice() {
  const [offline, setOffline] = useState(() => globalThis.navigator?.onLine === false);
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return offline ? <aside className="restock-save-notice" role="status">
    <strong>You’re offline</strong>
    <p>Keep this report open. Account saving and photo uploads need a connection. Nothing is posted until you review and save.</p>
  </aside> : null;
}

export function RestockLocalSaveNotice({ onCheckSaving }) {
  return <aside className="restock-save-notice" aria-label="Device-only report save">
    <strong>This device has your copy</strong>
    <p>Account saving was not confirmed. Check “Cloud saving &amp; recovery” in Settings before relying on another device. Keep this app’s stored data.</p>
    <button type="button" className="secondary-button" onClick={onCheckSaving}>Check cloud saving</button>
  </aside>;
}
