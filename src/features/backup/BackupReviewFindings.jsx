import { presentReviewFinding } from "./reviewPresentation.js";
import "./backup-review.css";

export default function BackupReviewFindings({ title, findings = [], emptyMessage = "", limit = 20, open = false }) {
  const rows = Array.isArray(findings) ? findings : [];
  if (!rows.length) return emptyMessage ? <p className="backup-review-empty">{emptyMessage}</p> : null;
  const shown = rows.slice(0, Math.max(1, Math.min(100, limit)));
  return <details className="backup-review-findings" open={open}>
    <summary>{title} · {rows.length.toLocaleString()}</summary>
    <ol>{shown.map((finding, index) => {
      const { message, details } = presentReviewFinding(finding);
      return <li key={index}><p>{message}</p>{details.length ? <dl>{details.map(({ label, value }, detailIndex) => <div key={`${label}-${detailIndex}`}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}</li>;
    })}</ol>
    {shown.length < rows.length ? <p>Showing {shown.length} of {rows.length.toLocaleString()} findings. Review the affected source data before running the check again.</p> : null}
  </details>;
}
