import { useState } from 'react';
import { conflictingObservations, reportId, useRestockPreferences, updateRestockPreferences } from '../utils/restockBrowseExtras.mjs';
import { restockReportObservedTimestamp, restockReportStockGroup } from '../utils/restockFeedPresentation.mjs';
const time = report => { const value = restockReportObservedTimestamp(report); return value === null ? 'Time not recorded' : new Date(value).toLocaleString(); };
const stock = report => ({stock:'Stock reported',low:'Low stock reported',empty:'No stock reported'})[restockReportStockGroup(report)] || 'Status not recorded';
export default function RestockObservationTools({ report, reports = [], getStore, scope = '', address = '' }) {
  const preferences = useRestockPreferences(scope);
  const [notice, setNotice] = useState('');
  const id = reportId(report), saved = preferences.bookmarks.includes(id);
  const conflicts = conflictingObservations(report, reports, getStore);
  return <div className="restock-observation-tools">
    {scope && id ? <button type="button" className="secondary-button" aria-pressed={saved} onClick={() => { const ok = updateRestockPreferences(scope, current => ({...current, bookmarks: saved ? current.bookmarks.filter(value => value !== id) : [...current.bookmarks, id].slice(-200)})); setNotice(ok ? saved ? 'Bookmark removed.' : 'Bookmarked privately on this device. Sighting time is unchanged.' : 'Bookmark could not be saved.'); }}>{saved ? 'Bookmarked' : 'Bookmark report'}</button> : null}
    {address ? <button type="button" className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(address); setNotice('Store address copied.'); } catch { setNotice('Could not copy. Select the address above to copy it.'); } }}>Copy store address</button> : null}
    {conflicts.length ? <details><summary>Different stock observations · {conflicts.length + 1}</summary><p>These reports describe the same product at this exact store within 24 hours of this observation. They do not establish current stock.</p><ul>{[report, ...conflicts].sort((a,b) => restockReportObservedTimestamp(a) - restockReportObservedTimestamp(b)).map((row,index) => <li key={`${reportId(row)}-${index}`}><strong>{stock(row)}</strong> · <time>{time(row)}</time></li>)}</ul></details> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </div>;
}
