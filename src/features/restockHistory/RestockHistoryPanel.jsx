import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PrimaryButton, SecondaryButton } from "../../components/operations/OperationsUI.jsx";
import { canonicalStringify, parseUntrustedJsonValue } from "../backup/canonicalJson.js";
import { applyWorkspaceSources, captureRecoverySources } from "../backup/workspaceRecovery.js";
import { useCloudWorkspace } from "../persistence/CloudWorkspaceContext.js";
import { captureWorkspaceSources, validateWorkspaceSources } from "../persistence/cloudWorkspaceSources.js";
import { readWorkspaceBinding } from "../persistence/workspaceOwnerBinding.js";
import { HISTORY_FIELD, prepareHistoricalRestockImport, readHistoricalRestockHistory } from "./historyArchive.mjs";
import "./restock-history.css";

const SOURCE = "legacy-restock-scout";
const STORAGE_KEY = "et-tcg-beta-scout";
const PAGE_SIZE = 20;
const MAX_IMPORT_BYTES = 6 * 1024 * 1024;
const EMPTY_FILTERS = { search: "", status: "", location: "", from: "", to: "" };
const EMPTY_ROWS = Object.freeze([]);

function readScout(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return {};
  const scout = parseUntrustedJsonValue(raw);
  if (!scout || typeof scout !== "object" || Array.isArray(scout)) throw new Error("Saved restock records need review. No records have been changed.");
  return scout;
}

function loadSaved(storage, ownerId) {
  if (!ownerId) return { archive: null, error: "", ownerId: null };
  try {
    if (readWorkspaceBinding(storage)?.ownerId !== ownerId) throw new Error("Confirm which account owns this device's records before opening history.");
    return { archive: readHistoricalRestockHistory(readScout(storage)), error: "", ownerId };
  } catch (error) {
    return { archive: null, error: error.message || "Saved history could not be read. Your existing records are preserved.", ownerId };
  }
}

function locationLabel(row) {
  return [row.store.retailer, row.store.branch].filter(Boolean).join(" · ");
}

function observedLabel(row) {
  const timestamp = Date.parse(row.observedAtUtc || row.observedAt);
  if (!Number.isFinite(timestamp)) return "Observation time unavailable";
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(timestamp);
}

function syncFailure(status, prefix) {
  return new Error(`${prefix} ${status?.message || "Review cloud saving before retrying."}`);
}

/** Isolated account history. This never supplies observations to live Scout feeds. */
export default function RestockHistoryPanel({ storage = globalThis.localStorage, projectUrl, onBack }) {
  const workspace = useCloudWorkspace();
  const ownerId = workspace?.user?.id;
  const id = useId();
  const [saved] = useState(() => loadSaved(storage, ownerId));
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [review, setReview] = useState(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const fileGeneration = useRef(0);
  const currentOwner = useRef(ownerId);
  useEffect(() => { currentOwner.current = ownerId; fileGeneration.current++; }, [ownerId]);
  useEffect(() => () => { fileGeneration.current++; }, []);
  const archive = saved.ownerId === ownerId ? saved.archive : null;
  const rows = archive?.observations || EMPTY_ROWS;
  const claims = archive?.snapshotOnlyClaims || EMPTY_ROWS;
  const summary = archive?.summary;
  const statuses = useMemo(() => [...new Set(rows.map(row => row.reportedStatus))].sort(), [rows]);
  const locations = useMemo(() => [...new Map(rows.map(row => [row.store.identityKey, { value: row.store.identityKey, label: `${locationLabel(row)} — ${row.store.city}, ${row.store.state}` }])).values()].sort((a, b) => a.label.localeCompare(b.label)), [rows]);
  const matches = useMemo(() => {
    const terms = filters.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(row => {
      if (filters.status && row.reportedStatus !== filters.status) return false;
      if (filters.location && row.store.identityKey !== filters.location) return false;
      const day = String(row.observedAt || "").slice(0, 10);
      if (filters.from && day < filters.from || filters.to && day > filters.to) return false;
      const searchable = [locationLabel(row), row.store.city, row.store.state, row.originalNote].join(" ").toLocaleLowerCase();
      return terms.every(term => searchable.includes(term));
    }).sort((a, b) => String(b.observedAtUtc).localeCompare(String(a.observedAtUtc)) || a.id.localeCompare(b.id));
  }, [rows, filters]);
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const shownPage = Math.min(page, pageCount);
  const visible = matches.slice((shownPage - 1) * PAGE_SIZE, shownPage * PAGE_SIZE);
  const canImport = Boolean(ownerId && workspace?.runExclusive && !saved.error);

  function updateFilters(patch) {
    setFilters(current => ({ ...current, ...patch }));
    setPage(1);
  }

  async function reviewFile(event) {
    const file = event.target.files?.[0];
    const ticket = ++fileGeneration.current;
    const fileOwner = ownerId;
    setReview(null); setError("");
    if (!file) { setReading(false); return; }
    setReading(true);
    try {
      if (!canImport) throw new Error("Sign in to the account that owns these records before importing history.");
      if (file.size > MAX_IMPORT_BYTES) throw new Error("This history file is too large to review safely. Use a file smaller than 6 MB; existing records are unchanged.");
      const raw = await file.text();
      if (ticket !== fileGeneration.current || currentOwner.current !== fileOwner) return;
      const input = parseUntrustedJsonValue(raw, { maxBytes: MAX_IMPORT_BYTES });
      const prepared = await prepareHistoricalRestockImport(readScout(storage), input);
      if (ticket !== fileGeneration.current || currentOwner.current !== fileOwner) return;
      setReview({ input, name: file.name, ...prepared });
    } catch (failure) {
      if (ticket === fileGeneration.current) setError(failure.message || "This file could not be reviewed. No records were changed.");
    } finally {
      if (ticket === fileGeneration.current) setReading(false);
    }
  }

  function importReviewed() {
    if (!canImport || !review || reading) return;
    const input = review.input;
    const reviewedOwner = ownerId;
    workspace.runExclusive(async ({ user, sync, assertCurrent }) => {
      const assertOwner = () => {
        assertCurrent();
        if (user.id !== reviewedOwner || readWorkspaceBinding(storage)?.ownerId !== reviewedOwner) throw new Error("The account changed. History import stopped and your existing records are preserved.");
      };
      assertOwner();
      const checked = await sync.sync({ allowApply: true });
      assertOwner();
      if (checked.status !== "SYNCED") throw syncFailure(checked, "History has not been imported.");

      // Rebuild against the freshly synchronized source, not the review's older
      // snapshot. The recovery adapter compares exact source bytes under its lock.
      const sources = captureWorkspaceSources(storage, { projectUrl });
      const before = captureRecoverySources(storage, { projectUrl });
      const currentScout = sources[SOURCE]?.data || {};
      if (canonicalStringify(currentScout) !== canonicalStringify(before[SOURCE]?.data || {})) throw new Error("Restock records changed while history was being prepared. Review the latest version before importing.");
      const prepared = await prepareHistoricalRestockImport(currentScout, input);
      assertOwner();
      const nextSource = { schemaVersion: 0, data: prepared.nextScout };
      validateWorkspaceSources({ ...sources, [SOURCE]: nextSource }, { projectUrl });
      if (prepared.changed) {
        await applyWorkspaceSources({ storage, expectedSources: { [SOURCE]: before[SOURCE] }, nextSources: { [SOURCE]: nextSource }, ownerId: user.id, assertCurrent: assertOwner, projectUrl });
      }
      assertOwner();
      const result = await sync.sync({ allowApply: false });
      assertOwner();
      if (result.status !== "SYNCED") throw syncFailure(result, "History is saved on this device. Account saving still needs attention.");
      const remote = await sync.readRevision();
      assertOwner();
      if (canonicalStringify(remote.sources[SOURCE]) !== canonicalStringify(nextSource)) throw new Error("The history save could not be independently confirmed. Your device copy is retained; review cloud saving before retrying.");
      const confirmed = readHistoricalRestockHistory(remote.sources[SOURCE].data);
      if (!confirmed || !Object.hasOwn(remote.sources[SOURCE].data, HISTORY_FIELD)) throw new Error("The account response did not contain the saved history. Your device copy is retained.");
      // CloudWorkspaceBoundary reloads only after this verified operation ends.
    });
  }

  return (
    <section className="restock-history" aria-labelledby={`${id}-title`}>
      <header className="restock-history__heading">
        <div><span className="restock-history__eyebrow">Your account · Historical observations</span><h2 id={`${id}-title`}>Saved restock history</h2><p>Review past stock and no-stock reports. These observations do not show current stock.</p></div>
        {onBack ? <SecondaryButton onClick={onBack}>Back to reports</SecondaryButton> : null}
      </header>
      <p className="restock-history__notice">Private history stays separate from live reports, map availability, alerts and automatic predictions. Source wording is unverified and may need context.</p>
      {!ownerId ? <p role="status">Sign in to open history saved to your account.</p> : null}
      {saved.error || error ? <p className="restock-history__error" role="alert">{error || saved.error}</p> : null}
      {ownerId ? <p className="restock-history__save-state" role="status">{workspace?.status?.message || "Saved on this device. Check cloud saving to confirm account sync."}</p> : null}
      {archive ? <>
        <p className="restock-history__summary"><strong>{rows.length.toLocaleString()} full reports</strong> · {summary?.distinctStoreLocations ?? locations.length} reported locations · {summary?.earliestLocalDate}–{summary?.latestLocalDate}</p>
        <div className="restock-history__filters" role="search" aria-label="Filter saved historical reports">
          <label htmlFor={`${id}-search`}>Search history<input id={`${id}-search`} type="search" value={filters.search} onChange={event => updateFilters({ search: event.target.value })} placeholder="Product, store or city" autoComplete="off" /></label>
          <label htmlFor={`${id}-status`}>Source status<select id={`${id}-status`} value={filters.status} onChange={event => updateFilters({ status: event.target.value })}><option value="">All source statuses</option>{statuses.map(status => <option key={status}>{status}</option>)}</select></label>
          <label htmlFor={`${id}-location`}>Reported location<select id={`${id}-location`} value={filters.location} onChange={event => updateFilters({ location: event.target.value })}><option value="">All reported locations</option>{locations.map(location => <option key={location.value} value={location.value}>{location.label}</option>)}</select></label>
          <label htmlFor={`${id}-from`}>From date<input id={`${id}-from`} type="date" value={filters.from} onChange={event => updateFilters({ from: event.target.value })} /></label>
          <label htmlFor={`${id}-to`}>Through date<input id={`${id}-to`} type="date" value={filters.to} onChange={event => updateFilters({ to: event.target.value })} /></label>
          <SecondaryButton onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>Clear filters</SecondaryButton>
        </div>
        <p role="status" className="restock-history__results">{matches.length.toLocaleString()} matching historical reports · Page {shownPage} of {pageCount}</p>
        <div className="restock-history__reports">
          {visible.map(row => <article key={row.id} className="restock-history__report">
            <div className="restock-history__report-head"><h3>{locationLabel(row)}</h3><span className="restock-history__badge">Historical · Unverified</span></div>
            <p>{row.store.city}, {row.store.state}</p><p><time dateTime={row.observedAtUtc || row.observedAt}>{observedLabel(row)}</time></p>
            <p className="restock-history__status">Source status: {row.reportedStatus}</p><blockquote>{row.originalNote}</blockquote>
            <details><summary>Original report details</summary><dl><div><dt>Reported quantity</dt><dd>{row.reportedQuantityText ?? "Not supplied"}</dd></div><div><dt>Reported line</dt><dd>{row.reportedQueueText ?? "Not supplied"}</dd></div></dl>
              {row.reviewFlags?.length ? <p>Context needs review. Original source claims and conflicting details are preserved.</p> : null}
              {row.photoReferences?.length ? <p>{row.photoReferences.length} photo caption(s) were copied. The image files were not supplied.</p> : null}
              {row.historySnapshots?.length ? <p>{row.historySnapshots.length} linked history update(s), retained without counting them as new full reports.</p> : null}
            </details>
          </article>)}
          {!visible.length ? <p>No saved historical reports match these filters. Try another store, status or date.</p> : null}
        </div>
        {pageCount > 1 ? <nav className="restock-history__pagination" aria-label="Historical report pages"><SecondaryButton disabled={shownPage === 1} onClick={() => setPage(shownPage - 1)}>Previous</SecondaryButton><span>Page {shownPage} of {pageCount}</span><SecondaryButton disabled={shownPage === pageCount} onClick={() => setPage(shownPage + 1)}>Next</SecondaryButton></nav> : null}
        {claims.length ? <details className="restock-history__incomplete"><summary>{claims.length} incomplete history-only updates</summary><p>These copied references do not include the full report. They stay separate from the full-report count.</p>{claims.map(row => <article key={row.id}><h3>{locationLabel(row)} — {row.store.city}</h3><p><time dateTime={row.observedAtUtc || row.observedAt}>{observedLabel(row)}</time> · {row.reportedStatus}</p><blockquote>{row.originalNote}</blockquote><p>Quantity, line and original report link were not supplied.</p></article>)}</details> : null}
      </> : ownerId && !saved.error ? <div className="restock-history__empty"><h3>No saved history yet</h3><p>Import a reviewed history archive to retain both stock and no-stock observations in your account.</p></div> : null}
      <details className="restock-history__import">
        <summary>Import historical reports</summary><p>Choose a saved history JSON archive. Review the counts before saving. Matching reports are counted once; existing records and prices are preserved.</p>
        <label htmlFor={`${id}-file`}>History archive JSON<input id={`${id}-file`} type="file" accept=".json,application/json" disabled={!canImport || reading} onChange={reviewFile} /></label>
        {reading ? <p role="status">Checking history and duplicate reports…</p> : null}
        {review ? <div className="restock-history__review"><h3>Review {review.name}</h3><p><strong>{review.added.toLocaleString()} new full reports</strong> · {review.existing.toLocaleString()} matching full reports already saved</p><p>{review.summary?.earliestLocalDate}–{review.summary?.latestLocalDate} · {review.summary?.distinctSnapshotOnlyClaims ?? 0} incomplete history-only updates</p><p>Every imported observation stays historical and unverified. No current-stock alerts or predictions will be created.</p>{workspace?.enabled === false ? <p>Automatic cloud saving is paused. This import makes one manual account save and leaves automatic syncing paused.</p> : null}<PrimaryButton disabled={!canImport || reading} onClick={importReviewed}>Import and save to account</PrimaryButton><SecondaryButton onClick={() => { fileGeneration.current++; setReview(null); }}>Cancel review</SecondaryButton></div> : null}
      </details>
    </section>
  );
}
