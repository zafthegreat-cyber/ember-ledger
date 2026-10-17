import { useState } from "react";
import {
  PrimaryButton,
  StatusBadge,
} from "../../components/operations/OperationsUI.jsx";
import { runLocalMigrationPreview } from "../persistence/index.js";

function statusTone(status) {
  if (status === "READY") return "success";
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

function FindingList({ title, findings = [] }) {
  if (!findings.length) return null;
  return <><h4>{title}</h4><ul>{findings.map((finding, index) => <li key={`${title}-${index}`}>{typeof finding === "string" ? finding : finding.message || finding.code || "Review required"}</li>)}</ul></>;
}

export default function MigrationReadinessPanel({ previewRunner = runLocalMigrationPreview, initialPreview = null, remoteAdapter }) {
  const [preview, setPreview] = useState(initialPreview);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function runPreview() {
    setBusy(true);
    setMessage("");
    try {
      const result = await previewRunner({
        localStorage: globalThis.localStorage,
        sessionStorage: globalThis.sessionStorage,
        remoteAdapter,
      });
      setPreview(result);
      setMessage("Migration preview finished. No records were written.");
    } catch {
      setPreview(null);
      setMessage("Migration preview was blocked safely. No records were written.");
    } finally {
      setBusy(false);
    }
  }

  const domainsWithWarnings = Array.isArray(preview?.domainsWithWarnings)
    ? preview.domainsWithWarnings.length
    : preview?.domainsWithWarnings;
  const resultStatus = preview?.status || "NOT_RUN";

  return (
    <section className="migration-readiness" aria-labelledby="migration-readiness-title">
      <header className="migration-readiness__header">
        <div>
          <h3 id="migration-readiness-title">Migration Readiness</h3>
          <p>Compare this browser's records with the canonical owner-scoped data model before any future migration.</p>
        </div>
        <StatusBadge tone={statusTone(resultStatus)}>{displayStatus(resultStatus)}</StatusBadge>
      </header>

      <PrimaryButton onClick={runPreview} disabled={busy}>{busy ? "Checking…" : "Run migration preview"}</PrimaryButton>
      <p className="backup-no-write"><strong>No records will be written during this preview.</strong> Local data remains unchanged and remote persistence stays inactive.</p>
      {message ? <p className="backup-message" role="status">{message}</p> : null}

      <div className="backup-result" aria-label="Migration readiness result">
        <div className="backup-status-row"><span>Persistence target</span><strong>{preview?.persistenceTarget || "Owner-authorized Code 3 API and PostgreSQL"}</strong></div>
        <div className="backup-status-row"><span>Local records</span><strong>{displayCount(preview?.localRecordCount)}</strong></div>
        <div className="backup-status-row"><span>Remote records</span><strong>{displayRemoteRecords(preview)}</strong></div>
        <div className="backup-status-row"><span>Domains ready</span><strong>{displayCount(preview?.domainsReady)}</strong></div>
        <div className="backup-status-row"><span>Domains with warnings</span><strong>{displayCount(domainsWithWarnings)}</strong></div>
        <div className="backup-status-row"><span>Blockers</span><strong>{displayCount(preview?.blockers?.length, "0")}</strong></div>
        <div className="backup-status-row"><span>Money values reviewed</span><strong>{displayCount(preview?.moneyConversions?.length, "0")}</strong></div>
        <div className="backup-status-row"><span>Money conversion issues</span><strong>{displayCount(preview?.moneyIssues?.length, "0")}</strong></div>
        <div className="backup-status-row"><span>Reference problems</span><strong>{displayCount(preview?.referenceProblems?.length, "0")}</strong></div>
        <div className="backup-status-row"><span>Conflicts</span><strong>{displayCount(preview?.conflicts?.length, "0")}</strong></div>
        <div className="backup-status-row"><span>Last preview</span><strong>{preview?.lastPreviewAt ? new Date(preview.lastPreviewAt).toLocaleString() : "Not run"}</strong></div>
        <div className="backup-status-row"><span>Preview hash</span><strong className="migration-readiness__hash">{preview?.previewHash || "Not generated"}</strong></div>
        {preview ? <details open={preview.status === "BLOCKED"}>
          <summary>Domain and validation details</summary>
          <div className="backup-details">
            <h4>Domains</h4>
            {preview.domains?.length ? <ul>{preview.domains.map((domain) => <li key={domain.domain}><strong>{domain.domain}</strong>: {domain.validRecords} valid, {domain.invalidRecords} invalid, {domain.proposedInserts} inserts, {domain.potentialUpdates} updates, {domain.existingMatches} matches, {domain.conflicts} conflicts, {domain.excluded} excluded</li>)}</ul> : <p>No canonical records were found in registered local sources.</p>}
            <FindingList title="Blockers" findings={preview.blockers} />
            <FindingList title="Warnings" findings={preview.warnings} />
            {preview.moneyConversions?.length ? <><h4>Proposed money conversions</h4><ul>{preview.moneyConversions.map((conversion, index) => <li key={`${conversion.path}-${index}`}><strong>{conversion.path}</strong>: {String(conversion.originalValue)} {conversion.currency || "currency missing"} → {conversion.proposedAmountMinor == null ? "owner review required" : `${conversion.proposedAmountMinor} minor units`} ({displayStatus(conversion.status)})</li>)}</ul></> : null}
            <FindingList title="Money conversion issues" findings={preview.moneyIssues} />
            <FindingList title="Reference problems" findings={preview.referenceProblems} />
            <FindingList title="Conflicts" findings={preview.conflicts} />
            <p>Plan hash: <span className="migration-readiness__hash">{preview.plan?.planHash || "Not generated"}</span></p>
            <p>Plan actions are limited to insert, update, skip, or owner decision. Delete is never proposed.</p>
          </div>
        </details> : null}
      </div>
    </section>
  );
}
