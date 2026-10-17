import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from "../../components/operations/OperationsUI.jsx";
import { runLocalMigrationPreview } from "../persistence/index.js";
import { rehearseLocalMigration } from "../persistence/migrationRehearsal.js";
import { CURRENCY_MINOR_DIGITS } from "../persistence/moneyConversion.js";
import BackupReviewFindings from "./BackupReviewFindings.jsx";
import { createBackupReviewReport, downloadBackupReviewReport } from "./reviewPresentation.js";

function statusTone(status) {
  if (status === "READY" || status === "REHEARSED_IN_MEMORY") return "success";
  if (status === "BLOCKED") return "danger";
  if (status === "READY_WITH_WARNINGS") return "warning";
  return "info";
}

function displayCount(value, fallback = "Not counted") {
  return Number.isInteger(value) && value >= 0 ? value.toLocaleString() : fallback;
}

function displayStatus(value, fallback = "Not run") {
  return String(value || fallback).replaceAll("_", " ");
}

function displayRemoteRecords(preview) {
  if (!preview) return "Not queried";
  if (preview.remoteStatus && preview.remoteStatus !== "AVAILABLE") return displayStatus(preview.remoteStatus);
  return displayCount(preview.remoteRecordCount, "Not available");
}

function displayDate(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString() : "Not recorded";
}

function StatusRow({ label, children }) {
  return <div className="backup-status-row"><span>{label}</span><strong>{children}</strong></div>;
}

function exactInteger(value) {
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^-?\d+$/.test(value) && value.length <= 100) return BigInt(value);
  return null;
}

function displayMoney(value, currency, signed = false) {
  const minor = exactInteger(value);
  if (minor === null) return "Not available";
  const sign = minor < 0n ? "−" : signed && minor > 0n ? "+" : "";
  const absolute = minor < 0n ? -minor : minor;
  const digits = CURRENCY_MINOR_DIGITS[currency];
  if (!Number.isInteger(digits)) return `${sign}${absolute.toLocaleString("en-US")} ${currency} minor units`;
  const scale = 10n ** BigInt(digits);
  const fraction = digits ? `.${String(absolute % scale).padStart(digits, "0")}` : "";
  return `${sign}${(absolute / scale).toLocaleString("en-US")}${fraction} ${currency}`;
}

function RehearsalChanges({ rehearsal }) {
  if (!rehearsal.before || !rehearsal.after) return null;
  const beforeCounts = rehearsal.before.counts || {}, afterCounts = rehearsal.after.counts || {};
  const domains = [...new Set([...Object.keys(beforeCounts), ...Object.keys(afterCounts)])].sort();
  const populatedDomains = domains.filter((domain) => beforeCounts[domain] !== 0 || afterCounts[domain] !== 0);
  const emptyDomains = domains.filter((domain) => beforeCounts[domain] === 0 && afterCounts[domain] === 0);
  const beforeMoney = rehearsal.before.amountMinorByDomainAndCurrency || {}, afterMoney = rehearsal.after.amountMinorByDomainAndCurrency || {};
  const moneyKeys = [...new Set([...Object.keys(beforeMoney), ...Object.keys(afterMoney)])].sort();
  return <details><summary>Changes rehearsed in memory</summary><div className="backup-details">
    <p>These are simulated totals. Saved records are unchanged, and currencies are kept separate.</p>
    <h4>Record counts</h4>
    {populatedDomains.length ? <div className="backup-review-deltas">{populatedDomains.map((domain) => {
      const before = beforeCounts[domain], after = afterCounts[domain];
      const delta = Number.isSafeInteger(before) && Number.isSafeInteger(after) ? after - before : null;
      return <div key={domain}><strong>{displayStatus(domain)}</strong><p>{displayCount(before)} before → {displayCount(after)} after{delta === null ? "" : ` (${delta > 0 ? "+" : ""}${delta.toLocaleString()} records)`}</p></div>;
    })}</div> : <p>No populated mapped record types were returned.</p>}
    {emptyDomains.length ? <details><summary>Unchanged empty record types · {emptyDomains.length}</summary><ul>{emptyDomains.map((domain) => <li key={domain}>{displayStatus(domain)}: 0 before → 0 after</li>)}</ul></details> : null}
    <h4>Amounts by domain and currency</h4>
    {moneyKeys.length ? <div className="backup-review-deltas">{moneyKeys.map((key) => {
      const separator = key.lastIndexOf(":"), domain = key.slice(0, separator), currency = key.slice(separator + 1);
      const before = beforeMoney[key] ?? "0", after = afterMoney[key] ?? "0";
      const beforeMinor = exactInteger(before), afterMinor = exactInteger(after);
      const delta = beforeMinor === null || afterMinor === null ? null : String(afterMinor - beforeMinor);
      return <div key={key}><strong>{displayStatus(domain)} · {currency}</strong><p>{displayMoney(before, currency)} before → {displayMoney(after, currency)} after ({displayMoney(delta, currency, true)} change)</p></div>;
    })}</div> : <p>No mapped money amounts were returned.</p>}
  </div></details>;
}

export default function MigrationReadinessPanel({ previewRunner = runLocalMigrationPreview, rehearsalRunner = rehearseLocalMigration, initialPreview = null, remoteAdapter }) {
  const lifetime = useMemo(() => ({ previewRunner, rehearsalRunner, remoteAdapter }), [previewRunner, rehearsalRunner, remoteAdapter]);
  const activeOperation = useRef(null);
  const [previewState, setPreview] = useState(() => ({ lifetime, result: initialPreview }));
  const [rehearsalState, setRehearsal] = useState(null);
  const [operation, setOperation] = useState(null);
  const [notice, setNotice] = useState(null);
  useLayoutEffect(() => {
    activeOperation.current = { lifetime, controller: null };
    return () => {
      if (activeOperation.current?.lifetime === lifetime) {
        activeOperation.current.controller?.abort();
        activeOperation.current = null;
      }
    };
  }, [lifetime]);
  const preview = previewState?.lifetime === lifetime ? previewState.result : null;
  const rehearsal = rehearsalState?.lifetime === lifetime ? rehearsalState.result : null;
  const busy = operation?.lifetime === lifetime ? operation.kind : "";
  const message = notice?.lifetime === lifetime ? notice.message : "";

  async function run(kind) {
    if (activeOperation.current?.lifetime !== lifetime || activeOperation.current.controller) return;
    const controller = new AbortController();
    activeOperation.current.controller = controller;
    const current = () => activeOperation.current?.lifetime === lifetime && activeOperation.current.controller === controller;
    setOperation({ lifetime, kind });
    setNotice(null);
    if (kind === "preview") setPreview(null); else setRehearsal(null);
    try {
      const result = await (kind === "preview" ? previewRunner : rehearsalRunner)({
        localStorage: globalThis.localStorage,
        sessionStorage: globalThis.sessionStorage,
        remoteAdapter,
        signal: controller.signal,
      });
      if (!current()) return;
      if (kind === "preview") {
        setPreview({ lifetime, result });
        setNotice({ lifetime, message: "Migration preview finished. No records were written." });
      } else {
        setRehearsal({ lifetime, result });
        setNotice({ lifetime, message: result.rollbackVerified ? "Mapped changes and rollback were rehearsed in memory. Saved records are unchanged." : "Migration rehearsal is blocked. Review the server status and findings below. No records were written." });
      }
    } catch {
      if (current()) setNotice({ lifetime, message: `${kind === "preview" ? "Migration preview" : "Migration rehearsal"} could not finish safely. Run it again to review current records. No records were written.` });
    } finally {
      if (current()) { activeOperation.current.controller = null; setOperation(null); }
    }
  }

  function downloadReview(kind, result) {
    if (activeOperation.current?.lifetime !== lifetime || activeOperation.current.controller) return;
    try {
      downloadBackupReviewReport(createBackupReviewReport({ kind, result, reviewedAt: result.lastPreviewAt || result.createdAt }));
      setNotice({ lifetime, message: "Review report downloaded. It contains findings, not a restorable backup." });
    } catch {
      setNotice({ lifetime, message: "The review report could not be downloaded. The findings remain available on this page." });
    }
  }

  const domainsWithWarnings = Array.isArray(preview?.domainsWithWarnings)
    ? preview.domainsWithWarnings.length
    : preview?.domainsWithWarnings;
  const countFinding = (findings) => displayCount(findings?.length, preview ? "Not counted" : "Not run");

  return (
    <section className="migration-readiness" aria-labelledby="migration-readiness-title">
      <header className="migration-readiness__header">
        <div>
          <h3 id="migration-readiness-title">Migration Readiness</h3>
          <p>Compare this browser's records with the canonical owner-scoped data model before any future migration.</p>
        </div>
      </header>

      <div className="backup-actions">
        <PrimaryButton onClick={() => run("preview")} disabled={Boolean(busy)}>{busy === "preview" ? "Checking migration preview…" : "Run migration preview"}</PrimaryButton>
        <SecondaryButton onClick={() => run("rehearsal")} disabled={Boolean(busy)}>{busy === "rehearsal" ? "Rehearsing in memory…" : "Rehearse mapped changes and rollback"}</SecondaryButton>
      </div>
      <p className="backup-no-write"><strong>No records will be written during this preview.</strong> Local data remains unchanged and remote persistence stays inactive.</p>
      <p className="backup-message" role="status" aria-atomic="true">{busy === "preview" ? "Checking migration preview. No records will be written." : busy === "rehearsal" ? "Rehearsing changes in memory. Saved records will stay unchanged." : message}</p>

      <section className="backup-result" aria-label="Migration readiness result" aria-busy={busy === "preview"}>
        <h4>Migration preview</h4>
        <StatusRow label="Preview result"><StatusBadge tone={statusTone(preview?.status)}>{busy === "preview" ? "Checking" : displayStatus(preview?.status)}</StatusBadge></StatusRow>
        <StatusRow label="Last preview">{preview ? displayDate(preview.lastPreviewAt) : "Not run"}</StatusRow>
        <StatusRow label="Local records">{displayCount(preview?.localRecordCount, preview ? "Not counted" : "Not run")}</StatusRow>
        <StatusRow label="Remote records">{displayRemoteRecords(preview)}</StatusRow>
        <StatusRow label="Blockers">{countFinding(preview?.blockers)}</StatusRow>
        {!preview ? <p>Run a preview to see coverage, record comparisons and issues that need review. A result is a snapshot from that check.</p> : <>
        <StatusRow label="Persistence target">{preview.persistenceTarget || "Owner-authorized Code 3 API and PostgreSQL"}</StatusRow>
        <StatusRow label="Domains ready">{displayCount(preview.domainsReady)}</StatusRow>
        <StatusRow label="Domains with warnings">{displayCount(domainsWithWarnings)}</StatusRow>
        <StatusRow label="Money values reviewed">{countFinding(preview.moneyConversions)}</StatusRow>
        <StatusRow label="Money conversion issues">{countFinding(preview.moneyIssues)}</StatusRow>
        <StatusRow label="Reference problems">{countFinding(preview.referenceProblems)}</StatusRow>
        <StatusRow label="Conflicts">{countFinding(preview.conflicts)}</StatusRow>
        <SecondaryButton disabled={Boolean(busy)} onClick={() => downloadReview("migration-preview", preview)}>Download migration preview report</SecondaryButton>
        <details open={preview.status === "BLOCKED"}>
          <summary>Domain and validation details</summary>
          <div className="backup-details">
            <h4>Domains</h4>
            {preview.domains?.length ? <ul>{preview.domains.map((domain) => <li key={domain.domain}><strong>{domain.domain}</strong>: {domain.validRecords} valid, {domain.invalidRecords} invalid, {domain.proposedInserts} inserts, {domain.potentialUpdates} updates, {domain.existingMatches} matches, {domain.conflicts} conflicts, {domain.excluded} excluded</li>)}</ul> : <p>No canonical records were found in registered local sources.</p>}
            <BackupReviewFindings title="Blockers" findings={preview.blockers} open={preview.status === "BLOCKED"} />
            <BackupReviewFindings title="Warnings" findings={preview.warnings} />
            {preview.moneyConversions?.length ? <><h4>Proposed money conversions</h4><ul>{preview.moneyConversions.map((conversion, index) => <li key={`${conversion.path}-${index}`}><strong>{conversion.path}</strong>: {String(conversion.originalValue)} {conversion.currency || "currency missing"} → {conversion.proposedAmountMinor == null ? "owner review required" : `${conversion.proposedAmountMinor} minor units`} ({displayStatus(conversion.status)})</li>)}</ul></> : null}
            <BackupReviewFindings title="Money conversion issues" findings={preview.moneyIssues} />
            <BackupReviewFindings title="Reference problems" findings={preview.referenceProblems} />
            <BackupReviewFindings title="Conflicts" findings={preview.conflicts} />
            <p>Preview hash: <span className="migration-readiness__hash">{preview.previewHash || "Not generated"}</span></p>
            <p>Plan hash: <span className="migration-readiness__hash">{preview.plan?.planHash || "Not generated"}</span></p>
            <p>Plan actions are limited to insert, update, skip, or owner decision. Delete is never proposed.</p>
          </div>
        </details></>}
      </section>

      <section className="backup-result" aria-label="Migration rehearsal result" aria-busy={busy === "rehearsal"}>
        <h4>Migration rehearsal</h4>
        <StatusRow label="Rehearsal result"><StatusBadge tone={statusTone(rehearsal?.status)}>{busy === "rehearsal" ? "Rehearsing in memory" : displayStatus(rehearsal?.status)}</StatusBadge></StatusRow>
        <StatusRow label="Last rehearsal">{rehearsal ? displayDate(rehearsal.createdAt) : "Not run"}</StatusRow>
        {!rehearsal ? <p>A rehearsal checks mapped changes and exact rollback in memory. It does not activate migration or verify recovery of the whole app.</p> : <>
          <StatusRow label="Canonical server inspection">{displayStatus(rehearsal.canonicalStatus, "Not inspected")}</StatusRow>
          <StatusRow label="Saved-data writes">{displayCount(rehearsal.writesPerformed)}</StatusRow>
          <StatusRow label="Rollback">{rehearsal.rollbackVerified ? "Exact original snapshot reproduced in memory" : "Not verified"}</StatusRow>
          <p>Legacy cloud data still requires separate inspection. This rehearsal does not activate migration.</p>
          {rehearsal.status === "BLOCKED" && rehearsal.canonicalStatus !== "AVAILABLE" ? <p>The canonical server could not be fully inspected. Its records cannot be assumed empty. Keep this rehearsal blocked until inspection is available.</p> : null}
          <BackupReviewFindings title="Rehearsal blockers" findings={rehearsal.blockers} open />
          <BackupReviewFindings title="Rehearsal warnings" findings={rehearsal.warnings} open={rehearsal.status === "BLOCKED"} />
          <BackupReviewFindings title="Rehearsal conflicts" findings={rehearsal.conflicts} open />
          <BackupReviewFindings title="Skipped or unresolved actions" findings={rehearsal.exclusions} />
          <RehearsalChanges rehearsal={rehearsal} />
          <SecondaryButton disabled={Boolean(busy)} onClick={() => downloadReview("migration-rehearsal", rehearsal)}>Download migration rehearsal report</SecondaryButton>
          <details><summary>Source counts and bindings</summary><div className="backup-details"><ul>{Object.entries(rehearsal.sourceCounts || {}).map(([source, count]) => <li key={source}>{source}: {displayCount(count)} records{rehearsal.sourceSchemas?.[source] == null ? "" : ` · schema ${rehearsal.sourceSchemas[source]}`}</li>)}</ul>
            <p>Backup: <span className="migration-readiness__hash">{rehearsal.backupHash || "Not generated"}</span></p>
            <p>Plan: <span className="migration-readiness__hash">{rehearsal.planHash || "Not generated"}</span></p>
            {rehearsal.rollbackVerified ? <><p>Before: <span className="migration-readiness__hash">{rehearsal.beforeHash}</span></p><p>After: <span className="migration-readiness__hash">{rehearsal.afterHash}</span></p><p>Rollback: <span className="migration-readiness__hash">{rehearsal.rollbackHash}</span></p></> : null}
          </div></details>
        </>}
      </section>
    </section>
  );
}
