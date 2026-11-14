import { notificationMatchesFilter } from './notificationInboxPresentation.mjs';

export const ALERT_FILTERS = [['all', 'All alerts'], ['restocks', 'Restocks'], ['stores', 'Watched stores'], ['account', 'Account updates']];
const rank = { urgent: 0, high: 1, normal: 2, medium: 2, low: 3 };
export function alertSource(entry = {}) {
  if (entry.category === 'saved_product_alert' && entry.relatedProductId) return { key: `product:${entry.relatedProductId}`, label: 'this saved product' };
  if (['favorite_store_alert', 'confirmed_restock', 'family_friendly_shop_update'].includes(entry.category) && entry.relatedStoreId) return { key: `store:${entry.relatedStoreId}`, label: 'this store' };
  return null;
}
export function alertReason(entry = {}) {
  if (entry.category === 'favorite_store_alert' && entry.relatedStoreId) return 'You follow this store.';
  if (entry.category === 'saved_product_alert' && entry.relatedProductId) return 'A confirmed report matched your saved product.';
  return '';
}
export function browseAlerts(rows, { pendingIds = new Set(), unreadOnly = false, query = '', filter = 'all', order = 'recent' } = {}) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const scoped = rows.filter(row => !pendingIds.has(row.id) && (!unreadOnly || !row.readAt) && terms.every(term => [row.title, row.message, row.storeName, row.productName].some(value => String(value || '').toLocaleLowerCase().includes(term))));
  const counts = Object.fromEntries(ALERT_FILTERS.map(([key]) => [key, scoped.filter(row => notificationMatchesFilter(row, key)).length]));
  const matching = scoped.filter(row => notificationMatchesFilter(row, filter)).sort((a,b) => (order === 'priority' ? (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2) : 0) || (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || String(a.id).localeCompare(String(b.id)));
  return { counts, matching };
}
export function notificationDeliveryStatus(state = {}) {
  return {
    permission: state.permission === 'granted' ? 'Device permission: allowed' : state.permission === 'denied' ? 'Device permission: blocked' : state.supported ? 'Device permission: not enabled' : 'Device notifications are unavailable in this browser',
    delivery: state.registration === 'registered' ? 'This device is registered for push alerts.' : state.registration === 'failed' ? 'Push registration failed. Try setup again.' : 'Background push registration is not confirmed. In-app alerts are available.',
  };
}
export function normalizeAlertPauses(value) {
  return (Array.isArray(value) ? value : []).filter(p => /^(store|product):.{1,200}$/.test(p?.key || '') && Number.isFinite(p.startedAt) && Number.isFinite(p.until) && p.until > p.startedAt && p.until - p.startedAt <= 24 * 3600000).slice(-100);
}
export function alertFallsWithinPause(entry, pauses = []) {
  const source = alertSource(entry); const createdAt = Date.parse(entry.createdAt || '');
  return Boolean(source && Number.isFinite(createdAt) && pauses.some(p => p.key === source.key && createdAt >= p.startedAt && createdAt < p.until));
}
export function pausedAlertIds(rows, pauses, now, { activeOnly = false, suppressActiveSource = false } = {}) {
  const matching = normalizeAlertPauses(pauses).filter(p => !activeOnly || p.until > now);
  return new Set(rows.filter(row => {
    const source = alertSource(row);
    const sourcePaused = suppressActiveSource && source && matching.some(p => p.key === source.key && p.startedAt <= now && p.until > now);
    return sourcePaused || alertFallsWithinPause(row, matching);
  }).map(row => row.id));
}
