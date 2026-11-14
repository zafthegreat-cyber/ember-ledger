import { blockedNotificationHelp } from "../utils/notificationInboxPresentation.mjs";
import { ALERT_FILTERS, alertReason, alertSource, browseAlerts, notificationDeliveryStatus, pausedAlertIds } from "../utils/notificationBrowse.mjs";
import { useEffect, useRef, useState } from "react";
import { notificationBadgeClass, notificationCategoryLabel, notificationTrustLabel } from "../utils/notificationCenterUtils.js";
import { dateGroup, relativeUiTime } from "../utils/uiTime.mjs";
import "./ui-workflow-details.css";


export default function NotificationInbox({ notifications = [], unreadCount = 0, deviceState = {}, disclosure = "", onEnableDevice, onRead, onReadAll, onOpen, onArchive, onClose, closeRef, archiveDelay = 8000, now: suppliedNow, pauses = [], onPauseSource, onResumeSource }) {
  const [openedAt] = useState(() => Date.now());
  const now = suppliedNow ?? openedAt;
  const [filter, setFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [limit, setLimit] = useState(12);
  const [pending, setPending] = useState([]);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState('recent');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const [pauseTarget, setPauseTarget] = useState(null);
  const [pauseHours, setPauseHours] = useState('1');
  const [pauseError, setPauseError] = useState('');
  const [showPaused, setShowPaused] = useState(false);
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
  const pausedIds = pausedAlertIds(notifications, pauses, now, {activeOnly:true});
  const {matching, counts} = browseAlerts(notifications, {pendingIds: new Set([...pendingIds, ...(showPaused ? [] : pausedIds)]), unreadOnly, query, filter, order});
  const visible = matching.slice(0, limit);
  const groups = order === 'priority' ? [{label:'Priority first',rows:visible}] : ["Today", "Yesterday", "Earlier", "Date not recorded"].map(label => ({ label, rows: visible.filter(entry => dateGroup(entry.createdAt, now) === label) })).filter(group => group.rows.length);
  const selectedRows = notifications.filter(row => selected.includes(row.id) && !pendingIds.has(row.id));
  const delivery = notificationDeliveryStatus(deviceState);
  const clearFilters = () => { setQuery(''); setFilter('all'); setUnreadOnly(false); setLimit(12); };
  async function confirmPause() {
    try { await onPauseSource?.(pauseTarget, Number(pauseHours)); setPauseTarget(null); setPauseError(''); }
    catch (error) { setPauseError(error.message || 'The pause could not be saved.'); }
  }
  async function resumeSource(key) {
    try { await onResumeSource?.(key); setPauseError(''); }
    catch (error) { setPauseError(error.message || 'The source could not be resumed.'); }
  }
  return <section id="notification-center-panel" className="notification-center-panel panel" aria-label="Notification center" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose?.(); } }}>
    <div className="compact-card-header"><div><h3>Alerts</h3>{disclosure && <p>{disclosure}</p>}<p className="compact-subtitle">{deviceState.label}</p></div>
      <div className="quick-actions">{deviceState.supported && deviceState.permission === "default" && <button type="button" className="secondary-button" onClick={onEnableDevice}>Turn on device alerts</button>}{unreadCount > 0 && <button type="button" className="secondary-button" onClick={onReadAll}>Mark all read</button>}<button ref={closeRef} type="button" className="secondary-button" onClick={onClose}>Close</button></div>
    </div>
    <div className="notification-delivery" aria-label="Notification delivery status"><span>{delivery.permission}</span><span>{delivery.delivery}</span>{deviceState.registration === 'failed' && <button type="button" className="secondary-button" onClick={onEnableDevice}>Retry notification setup</button>}</div>
    {deviceState.permission === "denied" && <details className="notification-inbox-help"><summary>How to enable notifications</summary><p>{blockedNotificationHelp(typeof navigator === "undefined" ? "" : navigator.userAgent)}</p><p>In-app alerts remain available here.</p></details>}
    {pauseError && !pauseTarget && <p role="alert">{pauseError}</p>}
    <div className="notification-inbox-tools"><label>Alert type<select value={filter} onChange={event => { setFilter(event.target.value); setLimit(12); }}>{ALERT_FILTERS.map(([key,label]) => <option value={key} key={key}>{label} ({counts[key]})</option>)}</select></label><label>Search alerts<input type="search" value={query} onChange={event => {setQuery(event.target.value);setLimit(12);}} placeholder="Store, product or message" /></label><label>Sort alerts<select value={order} onChange={event => setOrder(event.target.value)}><option value="recent">Newest first</option><option value="priority">Priority first</option></select></label><button type="button" className="secondary-button" aria-pressed={unreadOnly} onClick={() => { setUnreadOnly(value => !value); setLimit(12); }}>Unread only</button><button type="button" className="secondary-button" aria-pressed={selectMode} onClick={() => {setSelectMode(value => !value);setSelected([]);}}>{selectMode ? 'Done selecting' : 'Select alerts'}</button></div>
    {selectMode && <div className="notification-bulk" aria-label="Selected alert actions"><strong>{selectedRows.length} selected</strong><button type="button" className="secondary-button" onClick={() => setSelected(visible.map(row => row.id))}>Select shown alerts</button><button type="button" className="secondary-button" disabled={!selectedRows.some(row => !row.readAt)} onClick={() => {selectedRows.filter(row => !row.readAt).forEach(row => onRead?.(row.id));setSelected([]);}}>Mark selected read</button><button type="button" className="secondary-button" disabled={!selectedRows.some(row => row.dismissible !== false)} onClick={() => {selectedRows.filter(row => row.dismissible !== false).forEach(archive);setSelected([]);}}>Archive selected</button>{selectedRows.some(row => row.dismissible === false) && <p>Protected notices stay in your inbox.</p>}</div>}
    {pauses.some(p => p.until > now) && <details className="notification-inbox-help"><summary>Paused sources ({pauses.filter(p => p.until > now).length})</summary><p>New alerts from these sources are paused on this browser. Saved stores and reports remain available.</p>{pauses.filter(p => p.until > now).map(p => <p key={p.key}>{p.label || p.key} · Until {new Date(p.until).toLocaleString()} <button className="secondary-button" type="button" onClick={() => resumeSource(p.key)}>Resume source</button></p>)}{pausedIds.size > 0 && <button type="button" className="secondary-button" onClick={() => setShowPaused(value => !value)}>{showPaused ? 'Hide paused alerts' : `Show ${pausedIds.size} paused alerts`}</button>}</details>}
    <p role="status">{visible.length} of {matching.length} alerts shown</p>
    <div className="notification-list">{groups.map(group => <section className="notification-inbox-group" key={group.label} aria-label={group.label}><h4>{group.label}</h4>{group.rows.map(entry => <article className={entry.readAt ? "notification-card" : "notification-card unread"} key={entry.id}>
      {selectMode && <label className="notification-select"><input type="checkbox" checked={selected.includes(entry.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids,entry.id] : ids.filter(id => id !== entry.id))} />Select {entry.title}</label>}
      <div className="notification-card-heading"><span className={notificationBadgeClass(entry)}>{notificationTrustLabel(entry)}</span>{(["urgent", "high"].includes(entry.priority) || notificationCategoryLabel(entry) !== notificationTrustLabel(entry)) && <small>{entry.priority === "urgent" ? "Urgent" : entry.priority === "high" ? "High priority" : notificationCategoryLabel(entry)}</small>}<span className="notification-read-state">{entry.readAt ? "Read" : "Unread"}</span></div>
      <strong>{entry.title}</strong><p>{entry.message}</p>
      {alertReason(entry) && <p className="notification-reason">{alertReason(entry)}</p>}
      <small className="notification-meta"><time dateTime={entry.createdAt || undefined} title={entry.createdAt ? new Date(entry.createdAt).toLocaleString() : undefined}>{relativeUiTime(entry.createdAt, now)}</time>{entry.source ? ` · ${entry.source === "in_app_alerts" ? "In-app" : entry.source}` : ""}</small>
      {order === 'priority' && Number.isFinite(Date.parse(entry.createdAt)) && <small>{new Date(entry.createdAt).toLocaleString()}</small>}
      <div className="drawer-inline-actions">{!entry.readAt && <button type="button" className="secondary-button" onClick={() => onRead?.(entry.id)}>Mark read</button>}{entry.route && <button type="button" className="secondary-button" onClick={() => onOpen?.(entry)}>{entry.actionLabel || "View details"}</button>}{entry.dismissible !== false ? <button type="button" className="ghost-button" onClick={() => archive(entry)}>Archive</button> : <small>Protected notice · kept available for your account.</small>}{onPauseSource && alertSource(entry) && <button type="button" className="ghost-button" onClick={() => {setPauseTarget(entry);setPauseError('');}}>Pause source…</button>}</div>
    </article>)}</section>)}</div>
    {!matching.length && <div className="notification-inbox-empty"><p>{notifications.length ? "No alerts match these filters." : "You're all caught up. New alerts will appear here."}</p>{(query || filter !== 'all' || unreadOnly) && <button type="button" className="secondary-button" onClick={clearFilters}>Clear alert filters</button>}</div>}
    {matching.length > limit && <button type="button" className="secondary-button" onClick={() => setLimit(matching.length)}>See all alerts ({matching.length - limit} more)</button>}
    {pauseTarget && <section className="notification-pause-review" aria-label="Review alert pause"><h4>Pause alerts from {alertSource(pauseTarget)?.label}?</h4><p>{pauseTarget.title}</p><p>Applies to new in-app and open-browser device alerts on this browser. Your saved stores, products and report history stay saved.</p><label>Pause for<select value={pauseHours} onChange={event => setPauseHours(event.target.value)}><option value="1">1 hour</option><option value="3">3 hours</option><option value="24">24 hours</option></select></label><p>Until {new Date(now + Number(pauseHours) * 3600000).toLocaleString()}</p>{pauseError && <p role="alert">{pauseError}</p>}<div className="drawer-inline-actions"><button type="button" className="secondary-button" onClick={() => setPauseTarget(null)}>Cancel</button><button type="button" className="primary-button" onClick={confirmPause}>Confirm pause</button></div></section>}
    {pending.length > 0 && <div className="notification-undo-stack" aria-label="Pending alert archives">{pending.map(entry => <div className="notification-undo" role="status" key={entry.id}><span>Archived: {entry.title}</span><button type="button" className="secondary-button" onClick={() => undo(entry.id)} aria-label={`Undo archive: ${entry.title}`}>Undo</button></div>)}</div>}
  </section>;
}
