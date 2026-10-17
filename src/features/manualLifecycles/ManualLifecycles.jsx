import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EmptyState, PrimaryButton, QuietButton, SectionHeader, StatusBadge } from "../../components/operations/OperationsUI.jsx";
import { DetailList, SelectField, TextField } from "../../components/operations/RecordExperience.jsx";
import { createFlipScoutRepository } from "../flipScout/storageRepository.js";
import { getSaleReportingProjection } from "../flipScout/selectors.js";
import { binderPreview, eventCalendar, lifecycleOptions, lifecycleRows, LIFECYCLE_TYPES, matchCollectionTarget, minorUnitsFromInput, setCoverage } from "./contracts.js";
import { createManualLifecycleService } from "./service.js";
import { OWNER_SESSION_STATES } from "../../services/ownerSession.js";
import SaleReturnSettlement from "./SaleReturnSettlement.jsx";
import "./manual-lifecycles.css";

const LABELS = {
  binder: "Binder", assignment: "Slot assignment", setPlan: "Set checklist", wish: "Wishlist target", grading: "Grading submission", event: "Auction event", auctionLink: "Event lot link", visit: "Sourcing visit", processing: "Processing & storage", listing: "Listing & reservation", shipment: "Manual shipment", saleReturn: "Inspected return",
  title: "Title", pages: "Pages", slotsPerPage: "Slots per page", itemId: "Owned item", unit: "Physical unit", binderId: "Binder", page: "Page", slot: "Slot", setName: "Set name", variants: "Collector number | variant targets", collectorNumber: "Collector number", variant: "Variant", status: "Status", company: "Grading company", submissionReference: "Submission reference", costMinor: "Total grading cost", grade: "Grade result", certificate: "Certification reference", notes: "Notes", source: "Source", terms: "Source terms", startsAt: "Starts", endsAt: "Ends", pickupBy: "Pickup deadline", location: "Location", auctionId: "Auction lot", eventId: "Auction event", lotNumber: "Source lot number", purchaseId: "Recorded purchase", pickupStatus: "Pickup status", storeReference: "Exact store or source reference", date: "Visit date", outcome: "Outcome", mileageId: "Recorded mileage trip", storageLocation: "Storage location", channel: "Sales channel / booth", quantity: "Quantity", priceMinor: "Listing price per unit", saleId: "Recorded sale", carrier: "Carrier or handoff method", tracking: "Tracking / handoff reference", shippedAt: "Shipped", disposition: "Inspected disposition", inspection: "Inspection findings", refundMinor: "Additional refund amount", refundReference: "Manual refund reference",
};
const DESCRIPTIONS = {
  binder: "Create a binder, then place existing physical units into its pages. No artwork is printed.",
  assignment: "Move the same physical unit between slots, or choose No binder to unassign it. Existing item identity and cost stay intact.",
  setPlan: "Enter a known checklist manually, one collector number | variant per line. Coverage counts distinct targets, not duplicate copies.",
  wish: "Track a target you want without creating owned Inventory. Matches use exact set, collector number and variant.",
  grading: "Track one physical unit from draft through submission, receipt and result. Cost and result changes remain in history.",
  event: "Record the source's terms, dates and pickup deadline. Download a calendar entry after saving.",
  auctionLink: "Give an existing auction lot its event identity and link its recorded purchase. No bid is placed.",
  visit: "Connect a manual visit to exact source references, a saved mileage trip and a recorded purchase.",
  processing: "Keep append-only processing and storage history linked to the existing Inventory item.",
  listing: "Drafts and active listings do not hold stock. Reserved quantity blocks other sales. To fulfill a reservation, link a matching sale draft before completing that sale in Sales, then mark the listing Sold.",
  shipment: "Record manual fulfillment against a completed sale. This does not purchase postage or contact a carrier.",
  saleReturn: "Receive and inspect first, then review the stock and manual refund effects. Saving inspection notes leaves stock unchanged; apply the reviewed return to close the record. A refund record does not send money.",
};
const NUMBER_FIELDS = new Set(["pages", "slotsPerPage", "unit", "page", "slot", "quantity"]);
const MONEY_FIELDS = new Set(["priceMinor", "costMinor", "refundMinor"]);
const DATE_FIELDS = new Set(["startsAt", "endsAt", "pickupBy", "shippedAt"]);
const PICKERS = { itemId: "inventory", binderId: "binder", auctionId: "auctions", eventId: "event", purchaseId: "purchases", mileageId: "mileage", saleId: "sales" };
const formatMoney = (minor) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(minor / 100);
const titleFor = (record) => record.title || record.name || record.purpose || record.description || record.id;
const download = (content, name, type) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const localTime = (value) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

function initialValues(type, record) {
  return Object.fromEntries(LIFECYCLE_TYPES[type].map((key) => {
    const value = record?.[key];
    return [key, MONEY_FIELDS.has(key) ? value == null ? "0.00" : (value / 100).toFixed(2)
      : DATE_FIELDS.has(key) ? localTime(value)
        : value ?? (NUMBER_FIELDS.has(key) ? key === "pages" ? 10 : key === "slotsPerPage" ? 9 : 1 : key === "variant" ? "standard" : key === "date" ? new Date().toISOString().slice(0, 10) : lifecycleOptions(type, key)[0] || "")];
  }));
}

function WorkflowForm({ type, record, state, service, onSaved, onCancel }) {
  const [values, setValues] = useState(() => initialValues(type, record));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const set = (key) => (value) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault(); if (busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try {
      const input = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, MONEY_FIELDS.has(key) ? minorUnitsFromInput(value) : NUMBER_FIELDS.has(key) ? Number(value) : DATE_FIELDS.has(key) && value ? new Date(value).toISOString() : String(value).trim()]));
      const result = await service.save(type, input, { id: record?.id, expectedVersion: record?.recordVersion || 0 });
      if (mounted.current) onSaved(result);
    } catch (failure) { if (mounted.current) setError(failure.message || "The record could not be saved. Your draft is still here."); }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
  };
  return <form className="manual-lifecycle-form" onSubmit={submit}>
    <SectionHeader title={`${record ? "Update" : "Add"} ${LABELS[type]}`} description={DESCRIPTIONS[type]} />
    <fieldset disabled={saving}><legend className="sr-only">{LABELS[type]} details</legend><div className="manual-lifecycle-fields">{LIFECYCLE_TYPES[type].map((key) => {
      const options = lifecycleOptions(type, key);
      const source = PICKERS[key];
      const rows = source ? state[source] || lifecycleRows(state, source) : [];
      const referenceOptions = rows.map((row) => ({ value: row.id, label: `${titleFor(row)}${row.type ? "" : ` · ${row.id}`}` }));
      const shared = { label: LABELS[key], "aria-label": LABELS[key], value: values[key], onChange: set(key) };
      if (source || options.length) return <SelectField key={key} {...shared} options={source ? [{ value: "", label: key === "binderId" ? "No binder / unassigned" : "Choose a record (optional where applicable)" }, ...referenceOptions] : options} />;
      return <TextField key={key} {...shared} type={NUMBER_FIELDS.has(key) || MONEY_FIELDS.has(key) ? "number" : DATE_FIELDS.has(key) ? "datetime-local" : key === "date" ? "date" : "text"} min={NUMBER_FIELDS.has(key) ? "1" : MONEY_FIELDS.has(key) ? "0" : undefined} step={MONEY_FIELDS.has(key) ? "0.01" : NUMBER_FIELDS.has(key) ? "1" : undefined} multiline={["variants", "terms", "notes", "inspection"].includes(key)} helper={key === "variants" ? "Example: 001 | standard, then 001 | reverse on a new line." : key === "unit" ? "For a quantity greater than one, choose its stable unit number." : undefined} />;
    })}</div></fieldset>
    {error ? <p role="alert" className="manual-lifecycle-error">{error}</p> : null}
    <div className="manual-lifecycle-actions"><PrimaryButton type="submit" disabled={saving}>{saving ? "Saving…" : "Save record"}</PrimaryButton><QuietButton disabled={saving} onClick={() => { if (!busy.current && (JSON.stringify(values) === JSON.stringify(initialValues(type, record)) || window.confirm("Discard this unsaved draft?"))) onCancel(); }}>Cancel</QuietButton></div>
  </form>;
}

function BinderPreview({ state, binder }) {
  const [page, setPage] = useState(1);
  return <section><SelectField label="Preview page" value={Math.min(page, binder.pages)} onChange={(value) => setPage(Number(value))} options={Array.from({ length: binder.pages }, (_, index) => ({ value: index + 1, label: `Page ${index + 1}` }))} /><ol className="manual-binder-preview">{binderPreview(state, binder, Math.min(page, binder.pages)).map(({ slot, assignment, item }) => <li key={slot}><small>Slot {slot}</small><strong>{item ? titleFor(item) : "Empty"}</strong>{assignment ? <span>Unit {assignment.unit} · {item.id}</span> : null}</li>)}</ol></section>;
}

function RecordReview({ record, state, service, isOwnerAuthorized, onApplied, onEdit, onBack }) {
  const relatedName = (field, value) => {
    const source = PICKERS[field];
    return source && value ? titleFor((state[source] || lifecycleRows(state, source)).find((row) => row.id === value) || { id: value }) : value;
  };
  const coverage = record.type === "setPlan" ? setCoverage(state.inventory, record, state.sales) : null;
  const matches = record.type === "wish" ? matchCollectionTarget(state.inventory, record, state.sales) : [];
  const returnApplied = record.type === "saleReturn" && state.sales.some((sale) => sale.returnApplications?.some((entry) => entry.returnId === record.id));
  return <article className="manual-lifecycle-review">
    <QuietButton onClick={onBack}>Back to {LABELS[record.type]} records</QuietButton>
    <SectionHeader title={record.title || LABELS[record.type]} description={`${record.id} · Revision ${record.recordVersion}`} actions={returnApplied ? null : <QuietButton onClick={onEdit}>Edit record</QuietButton>} />
    {returnApplied ? <p className="manual-lifecycle-note">Original inspection record. Review stock & refund below for current totals and correction history.</p> : null}
    <DetailList items={LIFECYCLE_TYPES[record.type].map((key) => ({ label: LABELS[key], value: MONEY_FIELDS.has(key) ? formatMoney(record[key]) : relatedName(key, record[key]) }))} />
    {record.type === "binder" ? <BinderPreview state={state} binder={record} /> : null}
    {coverage ? <section><h3>Set coverage · {coverage.owned} / {coverage.total}</h3><ul>{coverage.targets.map((target) => <li key={target.key}>{target.key} — {target.matches.length ? `Owned (${target.matches.length} records)` : "Missing"}</li>)}</ul></section> : null}
    {record.type === "wish" ? <section><h3>Matching owned records</h3>{matches.length ? <ul>{matches.map((item) => <li key={item.id}>{titleFor(item)} · {item.id}</li>)}</ul> : <p>No exact matching owned item. This target does not add to Inventory.</p>}</section> : null}
    {record.type === "event" ? <QuietButton onClick={() => download(eventCalendar(record), `code3-event-${record.id.replace(/[^a-zA-Z0-9-]/g, "")}.ics`, "text/calendar")}>Download calendar entry</QuietButton> : null}
    {record.type === "saleReturn" ? <SaleReturnSettlement key={`${record.id}-${record.recordVersion}`} record={record} service={service} isOwnerAuthorized={isOwnerAuthorized} onApplied={onApplied} /> : null}
    <details><summary>History ({record.history.length})</summary><ol className="manual-lifecycle-history">{record.history.slice().reverse().map((entry) => <li key={entry.version}><strong>Revision {entry.version} · {new Date(entry.at).toLocaleString()}</strong><DetailList items={Object.entries(entry.values).filter(([, value]) => value !== "").map(([key, value]) => ({ label: LABELS[key], value: MONEY_FIELDS.has(key) ? formatMoney(value) : relatedName(key, value) }))} /></li>)}</ol></details>
  </article>;
}

export default function ManualLifecycles(props) {
  const session = props.ownerSession;
  const lifetime = session?.status === OWNER_SESSION_STATES.AUTHORIZED
    ? JSON.stringify([session.provider || "", session.identityKey || session.userId || session.user?.id || session.displayIdentity || "owner"])
    : "restricted";
  return <ManualLifecyclesContent key={lifetime} {...props} />;
}

function ManualLifecyclesContent({ types, title = "Linked records", itemId = "", saleId = "", ownerSession }) {
  const authorized = ownerSession?.status === OWNER_SESSION_STATES.AUTHORIZED;
  const [authorizationLifetime] = useState(() => {
    let active = authorized;
    return { isAuthorized: () => active, update: (value) => { active = value; } };
  });
  useLayoutEffect(() => {
    authorizationLifetime.update(authorized);
    return () => authorizationLifetime.update(false);
  }, [authorizationLifetime, authorized]);
  const [repository] = useState(() => createFlipScoutRepository());
  const [service] = useState(() => createManualLifecycleService(repository, { isOwnerAuthorized: authorizationLifetime.isAuthorized }));
  const [state, setState] = useState(() => repository.load());
  const [error, setError] = useState(() => repository.getLastError());
  const [type, setType] = useState(types[0]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const refresh = () => { const next = repository.load(); setState(next); setError(repository.getLastError()); };
    window.addEventListener("storage", refresh); window.addEventListener("private-business-hub:flip-scout-data", refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("private-business-hub:flip-scout-data", refresh); };
  }, [repository]);
  const records = lifecycleRows(state, type).filter((row) => (!itemId || row.itemId === itemId) && (!saleId || row.saleId === saleId));
  const selected = lifecycleRows(state).find((row) => row.id === selectedId);
  if (error) return <section className="manual-lifecycles"><p role="alert">{error}</p><QuietButton onClick={() => { const next = repository.load(); setState(next); setError(repository.getLastError()); }}>Reload saved records</QuietButton></section>;
  return <section className="manual-lifecycles" aria-label={title}>
    {draft ? <WorkflowForm key={`${draft.type}-${draft.record?.id || "new"}`} type={draft.type} record={draft.record} state={state} service={service} onSaved={({ record, state: next }) => { setState(next); setSelectedId(record.id); setDraft(null); setMessage("Record saved on this device."); }} onCancel={() => setDraft(null)} /> : selected ? <RecordReview record={selected} state={state} service={service} isOwnerAuthorized={authorizationLifetime.isAuthorized} onApplied={({ state: next, correctionApplied }) => { setState(next); setMessage(correctionApplied ? "Return correction saved on this device. Stock and refund reporting are updated together; original records are retained." : "Return applied on this device. Stock and refund reporting are updated together."); }} onEdit={() => setDraft({ type: selected.type, record: selected })} onBack={() => { setSelectedId(""); setMessage(""); }} /> : <>
      <SectionHeader title={title} description="Linked to existing records on this device. Saved history stays available after reload." actions={<PrimaryButton onClick={() => setDraft({ type, record: itemId ? { itemId } : saleId ? { saleId } : null })}>Add {LABELS[type]}</PrimaryButton>} />
      {types.length > 1 ? <nav className="manual-lifecycle-tabs" aria-label={`${title} workflows`}>{types.map((key) => <QuietButton key={key} aria-current={type === key ? "page" : undefined} onClick={() => setType(key)}>{LABELS[key]}</QuietButton>)}</nav> : null}
      <p className="manual-lifecycle-note">{DESCRIPTIONS[type]}</p>
      {records.length ? <div className="manual-lifecycle-list">{records.map((row) => <button type="button" key={row.id} className="manual-lifecycle-card" onClick={() => setSelectedId(row.id)}><span><strong>{row.title || (row.itemId ? titleFor(state.inventory.find((item) => item.id === row.itemId) || row) : LABELS[row.type])}</strong><small>{row.id}</small></span><StatusBadge>{row.status || row.pickupStatus || row.outcome || `Revision ${row.recordVersion}`}</StatusBadge></button>)}</div> : <EmptyState title={`No ${LABELS[type].toLowerCase()} records`}>Add a record when you have its source details. Existing owned items and transactions remain linked by their original IDs.</EmptyState>}
    </>}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}

export function InventoryLabelPreview({ item, state }) {
  const processing = lifecycleRows(state, "processing").filter((row) => row.itemId === item.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const location = processing?.storageLocation || item.storageLocation || "Unassigned";
  const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240" viewBox="0 0 600 240"><rect width="600" height="240" fill="white"/><g fill="black" font-family="sans-serif"><text x="24" y="40" font-size="18">Code 3 TCG · Inventory</text><text x="24" y="85" font-size="24">${escape(titleFor(item).slice(0, 40))}</text><text x="24" y="130" font-size="16">ID: ${escape(String(item.id).slice(0, 64))}</text><text x="24" y="175" font-size="18">Storage: ${escape(location.slice(0, 50))}</text><text x="24" y="215" font-size="14">Text label · No collectible artwork</text></g></svg>`;
  return <section className="manual-label"><SectionHeader title="Inventory label preview" description="Preview or download this same text label again without changing stock or its history." /><strong>{titleFor(item)}</strong><span>{item.id}</span><span>Storage: {location}</span><QuietButton onClick={() => download(svg, `code3-inventory-label-${String(item.id).replace(/[^a-zA-Z0-9-]/g, "")}.svg`, "image/svg+xml")}>Download label for printing</QuietButton></section>;
}

export function BoothStatement({ state }) {
  const [channel, setChannel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const channels = [...new Set(state.sales.map((sale) => sale.salesChannel).filter(Boolean))];
  const invalidRange = Boolean(from && to && from > to);
  const rows = channel && !invalidRange ? state.sales.filter((sale) => sale.salesChannel === channel && !["draft", "cancelled"].includes(String(sale.status).toLowerCase()) && /^\d{4}-\d{2}-\d{2}$/.test(sale.saleDate || "") && (!from || sale.saleDate >= from) && (!to || sale.saleDate <= to)) : [];
  const sums = rows.reduce((result, sale) => { const projection = getSaleReportingProjection(sale, state); return { gross: result.gross + Math.round(Number(sale.grossSalePrice || 0) * 100), profit: result.profit + Math.round(Number(projection.effectiveProfit || 0) * 100), returns: result.returns + Math.round(Number(projection.additionalRefund || 0) * 100), restoredCost: result.restoredCost + Math.round(Number(projection.restoredCogs || 0) * 100) }; }, { gross: 0, profit: 0, returns: 0, restoredCost: 0 });
  const exportCsv = () => {
    const cell = (value) => `"${String(value).replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    download([["Sale ID", "Channel", "Date", "Original quantity sold", "Original gross USD", "Adjusted profit USD", "Applied return refund USD", "Cost restored to Inventory USD"], ...rows.map((sale) => { const projection = getSaleReportingProjection(sale, state); return [sale.id, sale.salesChannel, sale.saleDate, sale.quantitySold, Number(sale.grossSalePrice || 0).toFixed(2), Number(projection.effectiveProfit || 0).toFixed(2), Number(projection.additionalRefund || 0).toFixed(2), Number(projection.restoredCogs || 0).toFixed(2)]; })].map((row) => row.map(cell).join(",")).join("\r\n"), "code3-booth-statement.csv", "text/csv");
  };
  return <section className="manual-lifecycles"><SectionHeader title="Booth & channel statement" description="Completed local sales attributed to a channel and original sale-date range, including applied return adjustments. This is a current view of those sales, not a period cash-flow or tax statement." /><div className="manual-lifecycle-fields"><SelectField label="Channel / booth" value={channel} onChange={setChannel} options={[{ value: "", label: "Choose a recorded channel" }, ...channels]} /><TextField label="From sale date" type="date" value={from} onChange={setFrom} /><TextField label="Through sale date" type="date" value={to} onChange={setTo} /></div>{invalidRange ? <p role="alert">The end date must be on or after the start date.</p> : null}<DetailList items={[{ label: "Attributed sales", value: rows.length }, { label: "Original gross sales", value: formatMoney(sums.gross) }, { label: "Applied return refunds", value: formatMoney(sums.returns) }, { label: "Cost restored to Inventory", value: formatMoney(sums.restoredCost) }, { label: "Adjusted profit", value: formatMoney(sums.profit) }]} /><QuietButton disabled={!rows.length} onClick={exportCsv}>Download statement CSV</QuietButton></section>;
}
