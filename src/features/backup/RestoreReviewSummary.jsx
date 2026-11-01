import {
  APPLICATION_VERSION_RELATION,
  COMPATIBILITY_STATUS,
  FORMAT_COMPATIBILITY,
  SOURCE_COMPATIBILITY,
  describeApplicationVersion,
  describeVersionList,
} from "./restoreCompatibility.js";
import "./restore-review.css";

// Improvement #80: schema/version compatibility and a dry-run summary, shown
// before any backup is accepted. Pure presentation; the data comes from
// summarizeBackupCompatibility / summarizeRestoreDryRun.

// Same markup and classes as OperationsUI's StatusBadge. Rendered locally so the
// pre-app recovery gate does not pull the receipt/Supabase/native modules that
// OperationsUI imports through PrivateReceipt.
function StatusBadge({ children, tone = "neutral" }) {
  return <span className={`ops-badge ops-badge--${tone}`}><span>{children}</span></span>;
}

const STATUS_LABELS = Object.freeze({
  [COMPATIBILITY_STATUS.COMPATIBLE]: ["Compatible", "success"],
  [COMPATIBILITY_STATUS.COMPATIBLE_WITH_NOTES]: ["Compatible with notes", "warning"],
  [COMPATIBILITY_STATUS.UNSUPPORTED]: ["Unsupported", "danger"],
  [COMPATIBILITY_STATUS.UNRECOGNIZED]: ["Not a Code 3 backup", "danger"],
});

const SOURCE_LABELS = Object.freeze({
  [SOURCE_COMPATIBILITY.COMPATIBLE]: ["Readable", "success"],
  [SOURCE_COMPATIBILITY.NEWER_THAN_SUPPORTED]: ["Newer than this app", "danger"],
  [SOURCE_COMPATIBILITY.OLDER_UNSUPPORTED]: ["Too old to read", "danger"],
  [SOURCE_COMPATIBILITY.INVALID_VERSION]: ["Version missing", "danger"],
  [SOURCE_COMPATIBILITY.UNKNOWN_SOURCE]: ["Unknown source", "warning"],
});

function formatLine(format) {
  if (!format) return "Not checked";
  if (format.status === FORMAT_COMPATIBILITY.UNRECOGNIZED) return "Not recognized";
  const version = format.formatVersion ?? "unknown";
  if (format.status === FORMAT_COMPATIBILITY.COMPATIBLE) return `Version ${version} (supported)`;
  return `Version ${version}; this app reads version ${format.supportedFormatVersion}`;
}

function sourceBadge(row) {
  if (row.status === SOURCE_COMPATIBILITY.COMPATIBLE && row.restorable === false) return ["Not restored here", "info"];
  return SOURCE_LABELS[row.status] || ["Review", "warning"];
}

function number(value) { return Number.isFinite(value) ? value.toLocaleString() : "0"; }

export default function RestoreReviewSummary({ compatibility, dryRun = null, headingLevel = "h4", idPrefix = "restore-review" }) {
  if (!compatibility) return null;
  const Heading = headingLevel;
  const [statusLabel, statusTone] = STATUS_LABELS[compatibility.status] || ["Review", "warning"];
  const appTone = compatibility.application?.relation === APPLICATION_VERSION_RELATION.BACKUP_NEWER ? "warning" : "neutral";
  const dryRunRows = Array.isArray(dryRun?.sources) ? dryRun.sources : [];
  const totals = dryRun?.totals;

  return <div className="restore-review" data-status={compatibility.status}>
    <section aria-labelledby={`${idPrefix}-compat`}>
      <Heading id={`${idPrefix}-compat`} className="restore-review__heading">Compatibility check <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge></Heading>
      <dl className="restore-review__facts">
        <div><dt>Backup format</dt><dd>{formatLine(compatibility.format)}</dd></div>
        <div><dt>Saved by app version</dt><dd>{compatibility.application?.backupVersion || "unknown"}{compatibility.application?.createdAt ? ` · ${new Date(compatibility.application.createdAt).toLocaleString()}` : ""}</dd></div>
        <div><dt>This app version</dt><dd><span className={appTone === "warning" ? "restore-review__note" : ""}>{compatibility.application?.currentVersion || "unknown"}</span></dd></div>
      </dl>
      {compatibility.application?.relation === APPLICATION_VERSION_RELATION.BACKUP_NEWER ? <p className="restore-review__note">{describeApplicationVersion(compatibility.application)}</p> : null}
      {compatibility.sources.length ? <ul className="restore-review__sources" aria-label="Schema compatibility by source">
        {compatibility.sources.map((row) => {
          const [label, tone] = sourceBadge(row);
          return <li key={row.sourceId} data-status={row.status}>
            <div className="restore-review__source-head"><strong>{row.displayName}</strong><StatusBadge tone={tone}>{label}</StatusBadge></div>
            <p className="restore-review__versions">Backup schema {row.schemaVersion ?? "missing"} · this app reads {describeVersionList(row.supportedSchemaVersions)}{row.currentSchemaVersion != null ? ` (current ${row.currentSchemaVersion})` : ""}</p>
            {row.status !== SOURCE_COMPATIBILITY.COMPATIBLE || row.restorable === false ? <p className="restore-review__message">{row.message}</p> : null}
          </li>;
        })}
      </ul> : <p>This file lists no sources to check.</p>}
    </section>

    {dryRun ? <section aria-labelledby={`${idPrefix}-dry-run`}>
      <Heading id={`${idPrefix}-dry-run`} className="restore-review__heading">What a restore would do</Heading>
      <p className="restore-review__lede">Counts compare the backup with the records saved on this device right now. Nothing has been changed.</p>
      {dryRunRows.length ? <div className="restore-review__table-wrap" role="region" aria-label="Dry-run summary by source" tabIndex={0}>
        <table className="restore-review__table">
          <thead><tr><th scope="col">Source</th><th scope="col">In backup</th><th scope="col">Already saved</th><th scope="col">Would be added</th><th scope="col">Existing version kept</th><th scope="col">After restore</th></tr></thead>
          <tbody>{dryRunRows.map((row) => <tr key={row.sourceId}>
            <th scope="row">{row.displayName}</th>
            <td data-label="In backup">{number(row.backupRecords)}</td>
            <td data-label="Already saved">{number(row.matchingRecords)}</td>
            <td data-label="Would be added"><strong>{number(row.newRecords)}</strong></td>
            <td data-label="Existing version kept">{number(row.existingVersionsKept)}</td>
            <td data-label="After restore">{number(row.recordsAfter)}</td>
          </tr>)}</tbody>
          {totals ? <tfoot><tr><th scope="row">All sources</th><td data-label="In backup">{number(totals.backupRecords)}</td><td data-label="Already saved">{number(totals.matchingRecords)}</td><td data-label="Would be added"><strong>{number(totals.newRecords)}</strong></td><td data-label="Existing version kept">{number(totals.existingVersionsKept)}</td><td data-label="After restore">{number(totals.recordsAfter)}</td></tr></tfoot> : null}
        </table>
      </div> : <p>No restorable sources were found in this file, so a restore would add nothing.</p>}
      {totals?.existingVersionsKept ? <p className="restore-review__note">{number(totals.existingVersionsKept)} record(s) in the backup differ from a saved record with the same ID. The saved version is kept; the backup version is not applied.</p> : null}
    </section> : null}
  </div>;
}
