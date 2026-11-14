export function savedVersionPresentation(row, now = Date.now()) {
  const raw = row.updatedAt || row.createdAt;
  const timestamp = Date.parse(raw || '');
  const saved = new Date(timestamp), current = new Date(now);
  const calendarDay = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Number.isFinite(timestamp) ? Math.round((calendarDay(current) - calendarDay(saved)) / 86400000) : null;
  const age = days === null ? 'Save date unavailable' : days < 0 ? 'Future save date' : days === 0 ? 'Saved today' : days === 1 ? 'Saved yesterday' : `Saved ${days} days ago`;
  const scope = [];
  if (Number.isInteger(row.recordCount) && row.recordCount >= 0) scope.push(`${row.recordCount} records`);
  if (Number.isInteger(row.attachmentCount) && row.attachmentCount >= 0) scope.push(`${row.attachmentCount} attachments`);
  if (Array.isArray(row.sourceIds)) scope.push(`${row.sourceIds.length} record groups`);
  return { age, exact: Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : '', dateTime: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined, scope: scope.join(' · ') };
}
