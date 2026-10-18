import { useEffect, useId, useMemo, useRef, useState } from "react";
import { EmptyState, PrimaryButton, RecordCard, SecondaryButton, SectionHeader, StatusBadge } from "../../components/operations/OperationsUI.jsx";
import { OperationsRecordBrowser } from "../../components/operations/OperationsWorkspace.jsx";
import { ACCOUNT_OPS_RETAILER_PRESETS } from "../accountOps/retailerDirectory.js";
import { formatMoneyForDisplay, minorUnitsToMajorString, parseMajorMoney } from "../intelligence/money.js";
import { listBotProviders } from "./providerRegistry.js";
import { buildBotTracking, filterBotTasks, isArchived, manualStageLabel, providerLabel, retailerLabel } from "./tracking.js";
import "./bot-tracking.css";

const MANUAL_STAGES = ["DRAFT", "READY", "PAUSED", "STOPPED", "UNKNOWN"];
const IDENTIFIERS = [{ value: "sku", label: "SKU / product code" }, { value: "tcin", label: "Target TCIN" }, { value: "upc", label: "UPC / barcode" }, { value: "canonicalProductId", label: "Catalog product ID" }];
const EMPTY_FILTERS = Object.freeze({ query: "", provider: "", installationId: "", groupId: "", retailerId: "", stage: "", attentionOnly: false, includeArchived: false });
const PROVIDER_KEYS = listBotProviders().map((provider) => provider.providerKey);
const words = (value) => String(value || "Unknown").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
const attentionLabel = (entry) => typeof entry === "string" ? entry : entry?.label || entry?.message || "Needs review";

function dateLabel(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function recordTitle(row) {
  return row.target?.title || "Product reference unavailable";
}

function editableTask(row) {
  return row.task.taskMode === "MANUAL_DRAFT" && PROVIDER_KEYS.includes(row.task.provider) && [row.task, row.installation, row.group, row.target].every((record) => record?.status === "ACTIVE" && !isArchived(record));
}

function errorLabel(error) {
  if (/CREDENTIAL|SECRET|AUTHORITY|RAW_PROVIDER/.test(error?.code || "")) return "Use product details and simple notes only. Passwords, payment details, and connection secrets cannot be saved here.";
  if (/VERSION|CONFLICT/.test(error?.code || "")) return "This plan changed since you opened it. Reload the page to review the latest version before editing again.";
  return error?.message || "The plan could not be saved. Review the fields and try again.";
}

function ManualPlanForm({ installations, initialInstallationId, initialTask = null, initialTitle = "", onSave, onCancel, onSaved }) {
  const id = useId();
  const headingRef = useRef(null);
  const savingRef = useRef(false);
  const [existing, setExisting] = useState(initialTask);
  const [draft, setDraft] = useState(() => ({
    installationId: initialTask?.installationId || initialInstallationId || installations[0]?.id || "",
    retailerId: "retailer-preset:target", customRetailerId: "", title: "", identifierType: "sku", identifierValue: "",
    quantityTarget: String(initialTask?.quantityTarget || 1),
    maxPrice: initialTask?.maxPrice ? minorUnitsToMajorString(initialTask.maxPrice.minorUnits) : "",
    currency: initialTask?.maxPrice?.currency || "USD", runtimeStatus: initialTask?.runtimeStatus || "DRAFT", notes: "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { headingRef.current?.focus(); }, []);
  const change = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    if (savingRef.current) return;
    setError("");
    const quantityTarget = Number(draft.quantityTarget);
    if (!Number.isInteger(quantityTarget) || quantityTarget < 1 || quantityTarget > 1000) {
      setError("Quantity must be a whole number between 1 and 1,000.");
      return;
    }
    let maxPrice;
    try {
      maxPrice = draft.maxPrice.trim() ? parseMajorMoney(draft.maxPrice.trim(), { currency: draft.currency, field: "Max price per item" }) : null;
    } catch (moneyError) {
      setError(errorLabel(moneyError));
      return;
    }
    const input = existing ? { quantityTarget, maxPrice, ...(MANUAL_STAGES.includes(draft.runtimeStatus) ? { runtimeStatus: draft.runtimeStatus } : {}) } : {
      installationId: draft.installationId,
      retailerId: draft.retailerId === "other" ? draft.customRetailerId.trim() : draft.retailerId,
      title: draft.title.trim(), identifierType: draft.identifierType, identifierValue: draft.identifierValue.trim(), quantityTarget, maxPrice, notes: draft.notes.trim(),
    };
    if (!existing && (!input.installationId || !input.retailerId || !input.title || !input.identifierValue)) {
      setError("Choose an installation and retailer, then add a product name and identifier.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await onSave(input, existing);
      onSaved(result?.task || result);
    } catch (saveError) {
      if (saveError?.savedRecord) {
        const saved = saveError.savedRecord.task || saveError.savedRecord;
        setExisting(saved);
        setDraft((current) => ({ ...current, quantityTarget: String(saved.quantityTarget), maxPrice: saved.maxPrice ? minorUnitsToMajorString(saved.maxPrice.minorUnits) : "", currency: saved.maxPrice?.currency || current.currency, runtimeStatus: saved.runtimeStatus }));
      }
      setError(errorLabel(saveError));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <RecordCard className="bot-plan-composer" data-testid="bot-manual-plan-form">
    <form onSubmit={submit} aria-label={existing ? "Edit manual plan" : "Add manual plan"} aria-busy={saving}>
      <div className="bot-tracking-heading"><div><h3 ref={headingRef} tabIndex={-1}>{existing ? "Edit manual plan" : "Add manual plan"}</h3><p>{existing ? `${initialTitle || draft.title || "Saved product"} · Change the quantity, price limit, or your planning stage.` : "Keep a product plan with an installation. This saves a local record; it does not create or run a task in the bot."}</p></div></div>
      {!existing ? <div className="bot-plan-fields">
        <label className="bot-tracking-field" htmlFor={`${id}-installation`}><span>Installation</span><select aria-label="Installation" id={`${id}-installation`} value={draft.installationId} onChange={change("installationId")} required disabled={saving}><option value="">Choose an installation</option>{installations.map((installation) => <option key={installation.id} value={installation.id}>{installation.friendlyName} · {providerLabel(installation.provider)}</option>)}</select></label>
        <label className="bot-tracking-field" htmlFor={`${id}-retailer`}><span>Retailer</span><select aria-label="Retailer" id={`${id}-retailer`} value={draft.retailerId} onChange={change("retailerId")} disabled={saving}>{ACCOUNT_OPS_RETAILER_PRESETS.map((retailer) => <option key={retailer.id} value={retailer.id}>{retailer.displayName}</option>)}<option value="other">Other retailer</option></select></label>
        {draft.retailerId === "other" ? <label className="bot-tracking-field" htmlFor={`${id}-custom-retailer`}><span>Other retailer ID</span><input id={`${id}-custom-retailer`} value={draft.customRetailerId} onChange={change("customRetailerId")} placeholder="my-card-store" maxLength={200} required disabled={saving} /></label> : null}
        <label className="bot-tracking-field bot-plan-field-wide" htmlFor={`${id}-title`}><span>Product name</span><input id={`${id}-title`} value={draft.title} onChange={change("title")} placeholder="Product you want to track" required maxLength={500} disabled={saving} autoComplete="off" /></label>
        <label className="bot-tracking-field" htmlFor={`${id}-identifier-type`}><span>Identifier type</span><select aria-label="Identifier type" id={`${id}-identifier-type`} value={draft.identifierType} onChange={change("identifierType")} disabled={saving}>{IDENTIFIERS.map((identifier) => <option key={identifier.value} value={identifier.value}>{identifier.label}</option>)}</select></label>
        <label className="bot-tracking-field" htmlFor={`${id}-identifier`}><span>Product identifier</span><input id={`${id}-identifier`} value={draft.identifierValue} onChange={change("identifierValue")} placeholder="SKU, TCIN, UPC, or catalog ID" required maxLength={draft.identifierType === "tcin" || draft.identifierType === "upc" ? 100 : 200} disabled={saving} autoComplete="off" /></label>
      </div> : null}
      <div className="bot-plan-fields">
        <label className="bot-tracking-field" htmlFor={`${id}-quantity`}><span>Quantity</span><input id={`${id}-quantity`} type="number" inputMode="numeric" min={1} max={1000} step={1} value={draft.quantityTarget} onChange={change("quantityTarget")} required disabled={saving} /></label>
        {existing ? <label className="bot-tracking-field" htmlFor={`${id}-stage`}><span>Plan stage</span><select aria-label="Plan stage" id={`${id}-stage`} value={draft.runtimeStatus} onChange={change("runtimeStatus")} disabled={saving}>{!MANUAL_STAGES.includes(draft.runtimeStatus) ? <option value={draft.runtimeStatus} disabled>Recorded: {manualStageLabel(draft.runtimeStatus)}</option> : null}{MANUAL_STAGES.map((stage) => <option key={stage} value={stage}>{manualStageLabel(stage)}</option>)}</select></label> : null}
        <label className="bot-tracking-field" htmlFor={`${id}-price`}><span>Max price per item (optional)</span><input id={`${id}-price`} type="text" inputMode="decimal" value={draft.maxPrice} onChange={change("maxPrice")} placeholder="No price limit recorded" maxLength={20} disabled={saving} /></label>
        <label className="bot-tracking-field" htmlFor={`${id}-currency`}><span>Currency</span><select aria-label="Currency" id={`${id}-currency`} value={draft.currency} onChange={change("currency")} disabled={saving}>{[...new Set(["USD", "CAD", "GBP", "EUR", "AUD", draft.currency])].map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
      </div>
      {!existing ? <label className="bot-tracking-field" htmlFor={`${id}-notes`}><span>Notes (optional)</span><textarea id={`${id}-notes`} value={draft.notes} onChange={change("notes")} maxLength={16000} rows={3} disabled={saving} placeholder="Product or planning notes. Keep credentials in the provider app." /></label> : null}
      <p className="bot-plan-local-note">Planning only · No order, purchase, or inventory will be created.</p>
      {error ? <p className="bot-tracking-error" role="alert">{error}</p> : null}
      <div className="bot-tracking-actions"><PrimaryButton type="submit" disabled={saving}>{saving ? "Saving…" : existing ? "Save changes" : "Save manual plan"}</PrimaryButton><SecondaryButton onClick={onCancel} disabled={saving}>Cancel</SecondaryButton></div>
    </form>
  </RecordCard>;
}

function TaskCard({ row, onEdit, editingDisabled }) {
  const { task, installation, target, group, account, profile, proxy } = row;
  const archived = [task, installation, target, group].some((record) => record && isArchived(record));
  const attention = row.attention || [];
  const attempts = row.attempts || [];
  const attemptIds = new Set(attempts.map((entry) => entry.id));
  const activity = (row.activity || []).filter((entry) => !(entry.type === "PROVIDER_EVENT_NORMALIZED" && attemptIds.has(entry.attemptId)));
  const history = [...activity, ...attempts].sort((a, b) => String(b.occurredAt || b.updatedAt || b.createdAt || "").localeCompare(String(a.occurredAt || a.updatedAt || a.createdAt || "")));
  return <RecordCard className="bot-tracking-card" data-testid="bot-task-detail" data-task-id={task.id}>
    <div className="bot-tracking-heading"><div><p className="ops-eyebrow">{providerLabel(task.provider)} · {retailerLabel(task.retailerId)}</p><h3>{recordTitle(row)}</h3><p>{installation?.friendlyName || "Installation unavailable"}</p></div><div className="bot-tracking-badges">{task.provider === "MOCK" ? <StatusBadge tone="neutral">Synthetic record</StatusBadge> : null}<StatusBadge tone="neutral">{task.provider === "MOCK" ? `Recorded: ${manualStageLabel(task.runtimeStatus)}` : manualStageLabel(task.runtimeStatus)}</StatusBadge>{archived ? <StatusBadge tone="neutral">Archived</StatusBadge> : null}{attention.length ? <StatusBadge tone="warning">Needs attention</StatusBadge> : null}</div></div>
    <dl className="bot-tracking-summary"><div><dt>Quantity planned</dt><dd>{task.quantityTarget}</dd></div><div><dt>Max / item</dt><dd>{task.maxPrice ? formatMoneyForDisplay(task.maxPrice) : "Not set"}</dd></div><div><dt>Last updated</dt><dd>{dateLabel(row.updatedAt || task.updatedAt)}</dd></div></dl>
    {attention.length ? <ul className="bot-tracking-attention">{attention.map((entry, index) => <li key={`${attentionLabel(entry)}-${index}`}>{attentionLabel(entry)}</li>)}</ul> : null}
    <details className="bot-tracking-details" open><summary>Plan details</summary>
      <dl className="bot-tracking-summary bot-tracking-references"><div><dt>Group</dt><dd>{group?.name || "Not available"}</dd></div><div><dt>Product identifier</dt><dd>{target?.tcin || target?.upc || target?.sku || target?.canonicalProductId || "Not available"}</dd></div><div><dt>Account reference</dt><dd>{account?.accountLabel || "Not assigned"}</dd></div><div><dt>Profile reference</dt><dd>{profile?.displayName || "Not assigned"}</dd></div><div><dt>Proxy group</dt><dd>{proxy?.displayName || "Not assigned"}</dd></div></dl>
      {target?.notes ? <div className="bot-tracking-notes"><h4>Notes</h4><p>{target.notes}</p></div> : null}
      <div className="bot-tracking-history"><h4>Local activity</h4>{history.length ? <ul>{history.slice(0, 8).map((entry, index) => <li key={`${entry.id || "event"}-${index}`}><span>{entry.summary || entry.message || words(entry.type || entry.normalizedEvent)}</span><small>{dateLabel(entry.occurredAt || entry.updatedAt || entry.createdAt)}</small></li>)}</ul> : <p>No activity has been recorded for this plan.</p>}{history.length > 8 ? <p>Showing the latest 8 entries. Full local history is in Activity.</p> : null}</div>
      <div className="bot-tracking-history"><h4>Checkout evidence</h4>{row.evidence?.length ? <><p>Review these records in Activity before adding a purchase. Evidence is not an order confirmation.</p><ul>{row.evidence.map((entry) => <li key={entry.id}><span>{entry.externalOrderReference || "Checkout evidence"} · {words(entry.reviewState)}</span><small>{dateLabel(entry.occurredAt || entry.createdAt)}</small></li>)}</ul></> : <p>No checkout evidence is linked.</p>}</div>
    </details>
    <div className="bot-tracking-card-footer"><span>Local record · Not live bot status</span>{editableTask(row) ? <SecondaryButton aria-label={`Edit plan ${recordTitle(row)}`} disabled={editingDisabled} onClick={() => onEdit(row)}>Edit plan</SecondaryButton> : null}</div>
  </RecordCard>;
}

export default function BotTaskTracker({ snapshot, initialInstallationId = "", initialGroupId = "", initialTaskId = "", initialCreate = false, initialAttentionOnly = false, onSavePlan, onOpenBots }) {
  const id = useId();
  const addButtonRef = useRef(null);
  const restoreFocusRef = useRef(false);
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, installationId: initialInstallationId, groupId: initialGroupId, attentionOnly: initialAttentionOnly }));
  const [selectedId, setSelectedId] = useState(initialTaskId);
  const [composer, setComposer] = useState(initialCreate ? { key: "new", task: null } : null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!composer && restoreFocusRef.current) {
      addButtonRef.current?.focus();
      restoreFocusRef.current = false;
    }
  }, [composer]);
  const tracking = useMemo(() => buildBotTracking(snapshot), [snapshot]);
  const rows = filterBotTasks(tracking.tasks, filters).filter((row) => !filters.groupId || row.task.taskGroupId === filters.groupId);
  const installations = (snapshot.installations || []).filter((installation) => installation.status === "ACTIVE" && !isArchived(installation) && PROVIDER_KEYS.includes(installation.provider));
  const providerKeys = [...new Set([...PROVIDER_KEYS, ...tracking.tasks.map((row) => row.task.provider)])];
  const retailerIds = [...new Set(tracking.tasks.map((row) => row.task.retailerId))].sort((a, b) => retailerLabel(a).localeCompare(retailerLabel(b)));
  const stages = [...new Set([...MANUAL_STAGES, ...tracking.tasks.map((row) => row.task.runtimeStatus)])];
  const hasFilters = Object.keys(EMPTY_FILTERS).some((key) => filters[key] !== EMPTY_FILTERS[key]);
  const setFilter = (key, value) => { setSelectedId(""); setFilters((current) => ({ ...current, [key]: value })); };
  const filter = (key) => (event) => setFilter(key, event.target.type === "checkbox" ? event.target.checked : event.target.value);
  const activeRows = filterBotTasks(tracking.tasks, EMPTY_FILTERS);
  const countedRows = filterBotTasks(tracking.tasks, { includeArchived: filters.includeArchived });
  const groups = (snapshot.taskGroups || []).filter((group) => filters.includeArchived || !isArchived(group));
  const clearFilters = () => { setSelectedId(""); setFilters({ ...EMPTY_FILTERS }); };
  const records = rows.map((row) => ({ id: row.task.id, title: recordTitle(row), subtitle: `${row.installation?.friendlyName || "Installation unavailable"} · ${retailerLabel(row.task.retailerId)}`, status: manualStageLabel(row.task.runtimeStatus), statusTone: row.attention.length ? "warning" : "neutral", row }));

  function closeComposer() {
    restoreFocusRef.current = true;
    setComposer(null);
  }

  function saved(task) {
    restoreFocusRef.current = false;
    if (!composer?.task) setFilters({ ...EMPTY_FILTERS });
    setSelectedId(task?.id || "");
    setComposer(null);
    setMessage("Manual plan saved on this device. No bot task was started.");
  }

  return <section className="bot-tracking" data-testid="bot-task-tracker">
    <SectionHeader eyebrow="Plans & recorded activity" title="Task tracker" description="Find a plan, review its details, and keep its next step up to date." actions={<PrimaryButton ref={addButtonRef} onClick={() => { setComposer({ key: `new-${Date.now()}`, task: null }); setMessage(""); }} disabled={!installations.length || Boolean(composer)}>Add manual plan</PrimaryButton>} />
    <div className="bot-tracking-counts" aria-label="Task summary"><span><strong>{activeRows.length}</strong> active records</span><span><strong>{activeRows.filter((row) => row.attention.length).length}</strong> need attention</span><span><strong>{installations.length}</strong> installations</span></div>
    {message ? <p className="bot-tracking-success" role="status">{message}</p> : null}
    {composer && (composer.task || installations.length) ? <ManualPlanForm key={composer.key} installations={installations} initialInstallationId={initialInstallationId || filters.installationId} initialTask={composer.task} initialTitle={composer.title} onSave={onSavePlan} onSaved={saved} onCancel={closeComposer} /> : null}
    {!installations.length ? <EmptyState title="Add an installation first" action={<SecondaryButton onClick={onOpenBots}>Open bot setup</SecondaryButton>}>Save a bot installation to organize a manual plan. Existing task records remain available below.</EmptyState> : null}
    <OperationsRecordBrowser label="Bot task records" records={records} selectedId={selectedId} onSelect={setSelectedId} onBack={() => setSelectedId("")} backLabel="Back to tasks" className="bot-tracking-browser"
    toolbar={<div className="bot-tracking-toolbar">
      <label className="bot-tracking-field bot-tracking-search" htmlFor={`${id}-search`}><span>Search tasks</span><input id={`${id}-search`} type="search" value={filters.query} onChange={filter("query")} placeholder="Product, identifier, or installation" /></label>
      {hasFilters ? <SecondaryButton onClick={clearFilters}>Clear filters</SecondaryButton> : null}
      <p className="bot-tracking-result-count" role="status">{rows.length} {rows.length === 1 ? "task" : "tasks"} shown{filters.includeArchived ? " · Includes archived records" : " · Archived records hidden"}</p>
    </div>}
    filters={<div className="bot-tracking-filter-panel">
      <div className="bot-tracking-groups" role="group" aria-label="Task group filters"><span className="ops-eyebrow">Groups</span><button type="button" className="bot-tracking-group" aria-pressed={!filters.groupId} onClick={() => setFilter("groupId", "")}><span>All groups</span><span>{countedRows.length}</span></button>{groups.map((group) => <button type="button" className="bot-tracking-group" key={group.id} aria-pressed={filters.groupId === group.id} onClick={() => setFilter("groupId", group.id)}><span>{group.name}</span><span>{countedRows.filter((row) => row.task.taskGroupId === group.id).length}</span></button>)}</div>
      <div className="bot-tracking-filter-grid">
        <label className="bot-tracking-field" htmlFor={`${id}-provider`}><span>Provider filter</span><select aria-label="Provider filter" id={`${id}-provider`} value={filters.provider} onChange={filter("provider")}><option value="">All bots ({countedRows.length})</option>{providerKeys.map((key) => <option key={key} value={key}>{providerLabel(key)} ({countedRows.filter((row) => row.task.provider === key).length})</option>)}</select></label>
        <label className="bot-tracking-field" htmlFor={`${id}-installation`}><span>Installation filter</span><select aria-label="Installation filter" id={`${id}-installation`} value={filters.installationId} onChange={filter("installationId")}><option value="">All installations ({countedRows.length})</option>{(snapshot.installations || []).filter((installation) => filters.includeArchived || !isArchived(installation)).map((installation) => <option key={installation.id} value={installation.id}>{installation.friendlyName}{isArchived(installation) ? " (archived)" : ""} ({countedRows.filter((row) => row.task.installationId === installation.id).length})</option>)}</select></label>
        <label className="bot-tracking-field" htmlFor={`${id}-retailer`}><span>Retailer filter</span><select aria-label="Retailer filter" id={`${id}-retailer`} value={filters.retailerId} onChange={filter("retailerId")}><option value="">All retailers ({countedRows.length})</option>{retailerIds.map((retailerId) => <option key={retailerId} value={retailerId}>{retailerLabel(retailerId)} ({countedRows.filter((row) => row.task.retailerId === retailerId).length})</option>)}</select></label>
        <label className="bot-tracking-field" htmlFor={`${id}-stage`}><span>Plan stage filter</span><select aria-label="Plan stage filter" id={`${id}-stage`} value={filters.stage} onChange={filter("stage")}><option value="">All stages ({countedRows.length})</option>{stages.map((stage) => <option key={stage} value={stage}>{manualStageLabel(stage)} ({countedRows.filter((row) => row.task.runtimeStatus === stage).length})</option>)}</select></label>
      </div>
      <div className="bot-tracking-filter-options"><label><input type="checkbox" checked={filters.attentionOnly} onChange={filter("attentionOnly")} />Needs attention only</label><label><input type="checkbox" checked={filters.includeArchived} onChange={filter("includeArchived")} />Include archived</label></div>
    </div>}
    renderRow={({ row, title, subtitle }) => <span className="bot-task-row" data-testid={`bot-task-${row.task.id}`}><span className="bot-task-row__main"><strong>{title}</strong><small>{subtitle}</small><small>{providerLabel(row.task.provider)} · {row.group?.name || "Group unavailable"}</small></span><span className="bot-task-row__status"><StatusBadge tone={row.attention.length ? "warning" : "neutral"}>{row.task.provider === "MOCK" ? `Recorded: ${manualStageLabel(row.task.runtimeStatus)}` : manualStageLabel(row.task.runtimeStatus)}</StatusBadge><small>Qty {row.task.quantityTarget} · {row.task.maxPrice ? formatMoneyForDisplay(row.task.maxPrice) : "No price limit"}</small>{row.attention.length ? <small className="bot-task-row__attention">{row.attention.length} to review</small> : null}{isArchived(row.task) ? <small>Archived</small> : null}{row.task.provider === "MOCK" ? <small>Synthetic record</small> : null}</span></span>}
    renderDetail={({ row }) => <TaskCard row={row} editingDisabled={Boolean(composer)} onEdit={(selected) => { setComposer({ key: selected.task.id, task: selected.task, title: recordTitle(selected) }); setMessage(""); }} />}
    detailEmpty={<EmptyState title="Choose a task">Select a plan to see its product, group, references, and recorded history.</EmptyState>}
    emptyState={<EmptyState title={hasFilters ? "No plans match these filters" : "No manual plans yet"}>{hasFilters ? "Try a different search or clear the filters to see your saved plans." : "Add a product plan above to keep its installation, retailer, and price limit together."}</EmptyState>} />
    <p className="bot-plan-local-note">Local plans and recorded observations · Live bot controls are unavailable.</p>
  </section>;
}
