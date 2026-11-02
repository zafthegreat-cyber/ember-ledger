import { useCallback, useEffect, useEffectEvent, useState } from "react";

export const CLOUD_SYNC_REVIEW_EVENT = "code3:review-cloud-changes";

/** Presentation only: this never loads or chooses a saved version. */
export function requestCloudSyncReview() {
  // A handler acknowledges an accepted route by preventing the default
  // (keeping the floating notice). A declined leave guard keeps it visible.
  return !window.dispatchEvent(new Event(CLOUD_SYNC_REVIEW_EVENT, { cancelable: true }));
}

export function useCloudSyncReviewNavigation(openUtilityPage, ownerId) {
  const [requestedForOwner, setRequestedForOwner] = useState(null);
  const onCloudSyncReviewShown = useCallback(() => setRequestedForOwner(null), []);
  const reviewCloudChanges = useEffectEvent(() => {
    if (!ownerId || openUtilityPage("settings") === false) return false;
    setRequestedForOwner(ownerId);
    return true;
  });

  useEffect(() => {
    const handleReview = event => { if (reviewCloudChanges()) event.preventDefault(); };
    window.addEventListener(CLOUD_SYNC_REVIEW_EVENT, handleReview);
    return () => window.removeEventListener(CLOUD_SYNC_REVIEW_EVENT, handleReview);
  }, []);

  return {
    cloudSyncReviewRequested: Boolean(ownerId && requestedForOwner === ownerId),
    onCloudSyncReviewShown,
  };
}
