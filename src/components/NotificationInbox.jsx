import { notificationMatchesFilter, blockedNotificationHelp } from "../utils/notificationInboxPresentation.mjs";
import { useEffect, useRef, useState } from "react";
import { notificationBadgeClass, notificationCategoryLabel, notificationTrustLabel } from "../utils/notificationCenterUtils.js";
import { dateGroup, relativeUiTime } from "../utils/uiTime.mjs";
import "./ui-workflow-details.css";


export default function NotificationInbox({ notifications = [], unreadCount = 0, deviceState = {}, disclosure = "", onEnableDevice, onRead, onReadAll, onOpen, onArchive, onClose, closeRef, archiveDelay = 8000, now: suppliedNow }) {
  const [openedAt] = useState(() => Date.now());
  const now = suppliedNow ?? openedAt;
  const [filter, setFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [limit, setLimit] = useState(12);
  const [pending, setPending] = useState([]);
  const timers = useRef(new Map());
  const archiveRef = useRef(onArchive);
  useEffect(() => { archiveRef.current = onArchive; }, [onArchive]);
  useEffect(() => {
    const current = timers.current;
    return () => { for (const { timer, entry } of current.values()) { clearTimeout(timer); archiveRef.current?.(entry.id); } current.clear(); };
  }, []);
  function archive(entry) {
    if (entry.dismissible === false || timers.current.has(entry.id)) return;
    const timer = setTimeout(() => {
      timers.current.delete(entry.id);
      setPending(rows => rows.filter(row => row.id !== entry.id));
      archiveRef.current?.(entry.id);
    }, archiveDelay);
    timers.current.set(entry.id, { timer, entry });
    setPending(rows => [...rows, entry]);
  }
  function undo(id) {
    const staged = timers.current.get(id);
    if (!staged) return;
    clearTimeout(staged.timer); timers.current.delete(id);
    setPending(rows => rows.filter(row => row.id !== id));
  }
  const pendingIds = new Set(pending.map(entry => entry.id));
  const matching = notifications.filter(entry => !pendingIds.has(entry.id) && (!unreadOnly || !entry.readAt) && notificationMatchesFilter(entry, filter));
  const visible = matching.slice(0, limit);
  const groups = ["Today", "Yesterday", "Earlier", "Date not recorded"].map(label => ({ label, rows: visible.filter(entry => dateGroup(entry.createdAt, now) === label) })).filter(group => group.rows.length);
  return <section id="notification-center-panel" className="notification-center-panel panel" aria-label="Notification center" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose?.(); } }}>
    <div className="compact-card-header"><div><h3>Alerts</h3>{disclosure && <p>{disclosure}</p>}<p className="compact-subtitle">{deviceState.label}</p></div>
      <div className="quick-actions">{deviceState.supported && deviceState.permission === "default" && <button type="button" className="secondary-button" onClick={onEnableDevice}>Turn on device alerts</button>}{unreadCount > 0 && <button type="button" className="secondary-button" onClick={onReadAll}>Mark all read</button>}<button ref={closeRef} type="button" className="secondary-button" onClick={onClose}>Close</button></div>
    </div>
    {deviceState.permission === "denied" && <details className="notification-inbox-help"><summary>How to enable notifications</summary><p>{blockedNotificationHelp(typeof navigator === "undefined" ? "" : navigator.userAgent)}</p><p>In-app alerts remain available here.</p></details>}
    <div className="notification-inbox-tools"><label>Alert type<select value={filter} onChange={event => { setFilter(event.target.value); setLimit(12); }}><option value="all">All alerts</option><option value="restocks">Restocks</option><option value="stores">Watched stores</option><option value="account">Account updates</option></select></label><button type="button" className="secondary-button" aria-pressed={unreadOnly} onClick={() => { setUnreadOnly(value => !value); setLimit(12); }}>Unread only</button></div>
    <p role="status">{visible.length} of {matching.length} alerts shown</p>
    {pending.map(entry => <div className="notification-undo" role="status" key={entry.id}><span>Archived: {entry.title}</span><button type="button" className="secondary-button" onClick={() => undo(entry.id)} aria-label={`Undo archive: ${entry.title}`}>Undo</button></div>)}
    <div className="notification-list">{groups.map(group => <section className="notification-inbox-group" key={group.label} aria-label={group.label}><h4>{group.label}</h4>{group.rows.map(entry => <article className={entry.readAt ? "notification-card" : "notification-card unread"} key={entry.id}>
      <div className="notification-card-heading"><span className={notificationBadgeClass(entry)}>{notificationTrustLabel(entry)}</span>{(["urgent", "high"].includes(entry.priority) || notificationCategoryLabel(entry) !== notificationTrustLabel(entry)) && <small>{entry.priority === "urgent" ? "Urgent" : entry.priority === "high" ? "High priority" : notificationCategoryLabel(entry)}</small>}<span className="notification-read-state">{entry.readAt ? "Read" : "Unread"}</span></div>
      <strong>{entry.title}</strong><p>{entry.message}</p>
      <small className="notification-meta"><time dateTime={entry.createdAt || undefined} title={entry.createdAt ? new Date(entry.createdAt).toLocaleString() : undefined}>{relativeUiTime(entry.createdAt, now)}</time>{entry.source ? ` · ${entry.source === "in_app_alerts" ? "In-app" : entry.source}` : ""}</small>
      <div className="drawer-inline-actions">{!entry.readAt && <button type="button" className="secondary-button" onClick={() => onRead?.(entry.id)}>Mark read</button>}{entry.route && <button type="button" className="secondary-button" onClick={() => onOpen?.(entry)}>{entry.actionLabel || "View details"}</button>}{entry.dismissible !== false && <button type="button" className="ghost-button" onClick={() => archive(entry)}>Archive</button>}</div>
    </article>)}</section>)}</div>
    {!matching.length && <p className="notification-inbox-empty">{notifications.length ? "No alerts match these filters." : "You're all caught up. New alerts will appear here."}</p>}
    {matching.length > limit && <button type="button" className="secondary-button" onClick={() => setLimit(matching.length)}>See all alerts ({matching.length - limit} more)</button>}
  </section>;
}
