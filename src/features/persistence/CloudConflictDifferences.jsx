import { useMemo } from "react";
import { buildCloudConflictDifferences, conflictTime } from "./cloudReviewPresentation.mjs";

export default function CloudConflictDifferences({ item, cloudSavedAt, revision }) {
  const differences = useMemo(() => buildCloudConflictDifferences(item.device, item.cloud), [item.device, item.cloud]);
  return <div className="cloud-conflict-comparison">
    <p>Cloud version {revision} saved: <strong>{conflictTime(cloudSavedAt)}</strong>. Latest recorded edit in this preview — device: {conflictTime(differences.deviceUpdatedAt)}; cloud: {conflictTime(differences.cloudUpdatedAt)}. Missing timestamps do not establish which copy is newer.</p>
    <p>These are private saved fields. Choosing a version applies the whole group; this table does not merge individual fields.</p>
    {differences.rows.length ? <div className="cloud-conflict-comparison__scroll" role="region" aria-label={`${item.displayName} field differences`} tabIndex={0}><table><caption>{differences.limited ? "Partial comparison" : `${differences.total} changed fields or records`}</caption><thead><tr><th scope="col">Record / field</th><th scope="col">This device</th><th scope="col">Cloud</th></tr></thead><tbody>{differences.rows.map((row, index) => <tr key={`${row.path}-${index}`}><th scope="row">{row.path}</th><td>{row.device}</td><td>{row.cloud}</td></tr>)}</tbody></table></div> : <p>No field differences found within the preview limit. Download both versions before choosing if the conflict remains.</p>}
    {differences.truncated ? <p>Showing a bounded preview. Download both versions to inspect all records and full-length values before applying a choice.</p> : <p>Long values are shortened in this preview. The comparison download preserves the full saved values.</p>}
  </div>;
}
