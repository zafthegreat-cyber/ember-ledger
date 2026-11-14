import { useState } from 'react';
import { savedVersionPresentation } from './syncUiPresentation.mjs';
function filterSavedHistory(rows,from='',to=''){return rows.filter(row=>{if(!from&&!to)return true;const date=new Date(row.updatedAt||row.createdAt||'');if(!Number.isFinite(date.getTime()))return false;const day=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;return (!from||day>=from)&&(!to||day<=to);});}
function HistoryRow({ row, busy, onDownload, device }) {
  const [expanded, setExpanded] = useState(false);
  const version = savedVersionPresentation(row);
  return <li><details onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>{version.exact || version.age} · {device ? 'Preserved device copy' : 'Cloud version'} {device ? row.cloudRevision : row.revision}</summary>
    {expanded ? <><p>{version.scope || 'Workspace record groups; separate cloud inventory, sales and file bytes are excluded.'}</p><button type="button" disabled={busy} onClick={() => onDownload(row)}>{device ? 'Download preserved copy' : `Download version ${row.revision}`}</button></> : null}
  </details></li>;
}

export default function CloudHistoryBrowser({ rows, busy, onDownload, device = false }) {
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [limit, setLimit] = useState(10);
  const invalidRange = Boolean(from && to && from > to);
  const matching = invalidRange ? [] : filterSavedHistory(rows, from, to);
  return <div>
    <label>Saved on or after<input type="date" value={from} onChange={event => { setFrom(event.target.value); setLimit(10); }} /></label>
    <label>Saved on or before<input type="date" value={to} onChange={event => { setTo(event.target.value); setLimit(10); }} /></label>
    {invalidRange ? <p role="alert">The start date is after the end date. Change either date or clear the date filters.</p> : null}
    {from || to ? <button type="button" onClick={()=>{setFrom('');setTo('');setLimit(10);}}>Clear date filters</button> : null}
    <p role="status">{matching.length} of {rows.length} saved versions · dates use this device's time zone.</p>
    <ul>{matching.slice(0, limit).map(row => <HistoryRow key={row.copyId || row.revision} row={row} busy={busy} onDownload={onDownload} device={device} />)}</ul>
    {matching.length > limit ? <button type="button" onClick={() => setLimit(value => value + 10)}>Show next {Math.min(10, matching.length - limit)} versions</button> : null}
    {!matching.length && !invalidRange ? <p>No saved versions match these dates. Your saved versions are still available; clear the date filters to see them.</p> : null}
  </div>;
}
