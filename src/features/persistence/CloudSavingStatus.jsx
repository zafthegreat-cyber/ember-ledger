import { cloudSavingPresentation, conflictTime } from "./cloudReviewPresentation.mjs";

export default function CloudSavingStatus({ status, enabled }) {
  const presentation = cloudSavingPresentation(status, enabled);
  return <div className="cloud-workspace-status" role="status"><strong>{presentation.title}</strong><p>{status.message}</p><p><strong>{presentation.mode}.</strong> {presentation.detail}</p>{status.updatedAt ? <small>Last confirmed save: {conflictTime(status.updatedAt)}</small> : null}</div>;
}
