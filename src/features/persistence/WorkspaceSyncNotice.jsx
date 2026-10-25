import { useState } from "react";

/** Dismisses only the message; sync status and conflict review remain in Settings. */
export default function WorkspaceSyncNotice({ status, ownerId, onLoadNewer, onReviewChanges }) {
  const [dismissedKey, setDismissedKey] = useState(null);
  const kind = status.status;
  const noticeKey = JSON.stringify([ownerId, kind, status.revision, [...(status.conflicts || [])].sort()]);
  if (!["REMOTE_AVAILABLE", "CONFLICT"].includes(kind) || dismissedKey === noticeKey) return null;
  const conflict = kind === "CONFLICT";
  return <aside className="cloud-workspace-notice" aria-label="Cloud saving notice">
    <div className="cloud-workspace-notice__content" role="status">
      <strong>{conflict ? "Saved changes need review" : "New changes from another device"}</strong>
      <p>{conflict ? "Both versions are preserved. Review the saved copies before choosing what to keep." : "Review the cloud saving status, or finish any open edits before loading the newer copy."}</p>
    </div>
    <button type="button" className="cloud-workspace-notice__dismiss" aria-label="Dismiss sync notice" onClick={() => setDismissedKey(noticeKey)}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
    </button>
    <div className="cloud-workspace-notice__actions">
      {onReviewChanges && <button type="button" onClick={() => { if (onReviewChanges() === true) setDismissedKey(noticeKey); }}>Review changes</button>}
      {!conflict && <button type="button" className="cloud-secondary" onClick={onLoadNewer}>Load saved changes</button>}
    </div>
  </aside>;
}
