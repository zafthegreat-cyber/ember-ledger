export function sessionLabelKey(ownerId) { return `code3.session-labels.v1:${encodeURIComponent(ownerId)}`; }
export function readSessionLabels(storage, ownerId) {
  try {
    const value = JSON.parse(storage.getItem(sessionLabelKey(ownerId)) || '{}');
    return Object.fromEntries(Object.entries(value).filter(([id,label]) => id.length < 200 && typeof label === 'string' && label.length <= 60).slice(0,200));
  } catch { return {}; }
}
export function saveSessionLabel(storage, ownerId, id, label) {
  if (!ownerId || !id || typeof label !== 'string' || !label.trim() || label.trim().length > 60) throw new Error('Enter a device name between 1 and 60 characters.');
  const next = { ...readSessionLabels(storage, ownerId), [id]: label.trim() };
  storage.setItem(sessionLabelKey(ownerId), JSON.stringify(next));
  return next;
}
export function filterAccountSessions(devices, filter) {
  return devices.filter(device => filter === 'all' || (filter === 'inactive') === Boolean(device.revokedAt || device.signedOut));
}
