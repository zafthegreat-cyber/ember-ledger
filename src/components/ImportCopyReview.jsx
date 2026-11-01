import { importCopyContext, importRowIssues, importFieldId } from "../utils/importReviewSafety.mjs";
import "./import-copy-review.css";

export function ImportRowIssues({ row }) {
  const issues = importRowIssues(row);
  if (!issues.length) return null;
  return <div className="import-review-issues" role="alert"><strong>Source row {row.sourceLine || "—"}: corrections needed</strong><ul>{issues.map(issue => <li key={issue.field}><a href={`#${importFieldId(row, issue.field)}`}>{issue.message}</a></li>)}</ul></div>;
}

export function ImportCopyReview({ row, candidates = [] }) {
  if (!candidates.length) return null;
  const rows = [{ ...row, _incoming: true }, ...candidates.slice(0, 12)];
  return <details className="import-copy-review"><summary>Review {candidates.length} possible existing {candidates.length === 1 ? "copy" : "copies"}</summary>
    <p>Only copies with the same catalog identity, set, printing, language, condition and grade can have their quantity increased. Unknown attributes stay visible for review.</p>
    <div className="import-copy-review__scroll" role="region" aria-label="Incoming and existing copy comparison" tabIndex={0}><table><thead><tr>{["Copy", "Set / number", "Printing", "Language", "Condition / grade", "Quantity", "Storage / notes"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((item, index) => {
      const context = importCopyContext(item);
      return <tr key={item._incoming ? "incoming" : `${item.id}-${index}`}><th scope="row">{item._incoming ? "Incoming" : "Existing"}: {context.name}</th><td>{[context.set, context.number].filter(Boolean).join(" · ") || "Not recorded"}</td><td>{context.printing || "Not recorded"}</td><td>{context.language || "Not recorded"}</td><td>{[context.condition, context.gradingCompany, context.grade].filter(Boolean).join(" · ") || "Not recorded"}</td><td>{item.quantity ?? 1}</td><td>{[item.storageLocation || item.physicalLocation || item.location, item.collectorNotes || item.notes].filter(Boolean).join(" · ") || "Not recorded"}</td></tr>;
    })}</tbody></table></div>{candidates.length > 12 ? <p>Showing 12 existing copies. Review the collection before combining quantities.</p> : null}
  </details>;
}
