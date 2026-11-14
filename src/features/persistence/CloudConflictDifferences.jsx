import { useMemo, useState } from "react";
import { buildCloudConflictDifferences, conflictTime } from "./cloudReviewPresentation.mjs";

export default function CloudConflictDifferences({ item, cloudSavedAt, revision }) {
  const differences = useMemo(() => buildCloudConflictDifferences(item.device, item.cloud), [item.device, item.cloud]);
  const [query,setQuery]=useState('');
  const matching=differences.rows.filter(row=>[row.path,row.deviceFull||row.device,row.cloudFull||row.cloud].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const cell=(short,full)=>full?<details><summary>{short}</summary><pre className="cloud-conflict-full-value">{full}</pre></details>:short;
  return <div className="cloud-conflict-comparison">
    <p>Cloud version {revision} saved: <strong>{conflictTime(cloudSavedAt)}</strong>. Latest recorded edit in this preview — device: {conflictTime(differences.deviceUpdatedAt)}; cloud: {conflictTime(differences.cloudUpdatedAt)}. Missing timestamps do not establish which copy is newer.</p>
    <p>These are private saved fields. Choosing a version applies the whole group; this table does not merge individual fields.</p>
    <label>Search this comparison<input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Record name, field or value" /></label><p role="status">{matching.length} matching preview rows · {differences.total}{differences.limited?' or more':''} changed fields or records counted{differences.truncated?' · bounded comparison':''}.</p>
    {differences.rows.length ? <div className="cloud-conflict-comparison__scroll" role="region" aria-label={`${item.displayName} field differences`} tabIndex={0}><table><caption>{differences.limited ? "Partial comparison" : `${differences.total} changed fields or records`}</caption><thead><tr><th scope="col">Record / field</th><th scope="col">This device</th><th scope="col">Cloud</th></tr></thead><tbody>{!matching.length ? <tr><td colSpan={3}>No differences match this search. <button type="button" onClick={()=>setQuery('')}>Clear comparison search</button></td></tr> : null}{matching.map((row, index) => <tr key={`${row.path}-${index}`}><th scope="row">{row.path}</th><td>{cell(row.device,row.deviceFull)}</td><td>{cell(row.cloud,row.cloudFull)}</td></tr>)}</tbody></table></div> : <p>No field differences found within the preview limit. Download both versions before choosing if the conflict remains.</p>}
    {differences.truncated ? <p>Showing a bounded preview. Download both versions to inspect all records and full-length values before applying a choice.</p> : <p>Expand long values privately here. Very long values remain bounded; the comparison download preserves the full saved values.</p>}
  </div>;
}
