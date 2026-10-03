import { useMemo, useState } from "react";
import {
  EmptyState,
  MetricCard,
  PageHeader,
  PrimaryButton,
  QuietButton,
  RecordCard,
  SectionHeader,
  StatusBadge,
} from "../../components/operations/OperationsUI.jsx";
import { SelectField, TextField } from "../../components/operations/RecordExperience.jsx";
import {
  DEADLINE_CADENCES,
  DEADLINE_CATEGORIES,
  DOCUMENT_TYPES,
  SETUP_STATUSES,
  completeDeadline,
  deadlineHealth,
  newDeadline,
  newDocument,
  sortDeadlines,
  summarizeBusinessCompliance,
  todayIso,
} from "./businessComplianceModel.js";
import { loadBusinessCompliance, saveBusinessCompliance } from "./businessComplianceStorage.js";
import "./business-compliance.css";

function dateLabel(value) {
  if (!value) return "Not set";
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function setupTone(status) {
  if (status === "complete") return "success";
  if (status === "in_progress") return "warning";
  return "neutral";
}

function deadlineTone(key) {
  if (key === "overdue") return "danger";
  if (["due_today", "due_soon", "needs_date"].includes(key)) return "warning";
  if (key === "complete") return "success";
  return "neutral";
}

function SetupCard({ item, onChange }) {
  return <RecordCard>
    <div className="compliance-card-heading">
      <div><span>{item.category}</span><h3>{item.title}</h3></div>
      <StatusBadge tone={setupTone(item.status)}>{SETUP_STATUSES.find((status) => status.value === item.status)?.label || item.status}</StatusBadge>
    </div>
    <p>{item.notes}</p>
    <div className="compliance-inline-fields">
      <SelectField label="Status" value={item.status} onChange={(value) => onChange({ ...item, status: value, completedDate: value === "complete" ? item.completedDate || todayIso() : item.completedDate })} options={SETUP_STATUSES} />
      <TextField label="Agency / source" value={item.agency || ""} onChange={(value) => onChange({ ...item, agency: value })} />
      <TextField label="Safe reference" value={item.reference || ""} onChange={(value) => onChange({ ...item, reference: value })} />
      <TextField label="Completed" type="date" value={item.completedDate || ""} onChange={(value) => onChange({ ...item, completedDate: value })} />
    </div>
  </RecordCard>;
}

function DeadlineCard({ item, onChange, onComplete }) {
  const health = deadlineHealth(item);
  return <RecordCard>
    <div className="compliance-card-heading">
      <div><span>{item.category}</span><h3>{item.title}</h3></div>
      <StatusBadge tone={deadlineTone(health.key)}>{health.label}</StatusBadge>
    </div>
    <p>{item.notes}</p>
    <div className="compliance-inline-fields">
      <TextField label="Due date" type="date" value={item.dueDate || ""} onChange={(value) => onChange({ ...item, dueDate: value })} />
      <SelectField label="Cadence" value={item.cadence} onChange={(value) => onChange({ ...item, cadence: value })} options={DEADLINE_CADENCES} />
      <TextField label="Agency" value={item.agency || ""} onChange={(value) => onChange({ ...item, agency: value })} />
      <TextField label="Last completed" type="date" value={item.lastCompletedDate || ""} onChange={(value) => onChange({ ...item, lastCompletedDate: value })} />
    </div>
    <div className="compliance-card-actions"><PrimaryButton onClick={() => onComplete(item)}>Mark Complete</PrimaryButton></div>
  </RecordCard>;
}

function DocumentCard({ item, onChange, onDelete }) {
  return <RecordCard>
    <div className="compliance-card-heading"><div><span>{item.type}</span><h3>{item.title || "Untitled document"}</h3></div>{item.expirationDate ? <StatusBadge tone={deadlineTone(deadlineHealth({ dueDate: item.expirationDate, status: "active" }).key)}>Expires {dateLabel(item.expirationDate)}</StatusBadge> : null}</div>
    <div className="compliance-inline-fields">
      <TextField label="Title" value={item.title} onChange={(value) => onChange({ ...item, title: value })} />
      <SelectField label="Type" value={item.type} onChange={(value) => onChange({ ...item, type: value })} options={DOCUMENT_TYPES.map((value) => ({ value, label: value }))} />
      <TextField label="Location / folder" value={item.location || ""} onChange={(value) => onChange({ ...item, location: value })} />
      <TextField label="Expiration" type="date" value={item.expirationDate || ""} onChange={(value) => onChange({ ...item, expirationDate: value })} />
    </div>
    <TextField className="is-wide" label="Notes" multiline value={item.notes || ""} onChange={(value) => onChange({ ...item, notes: value })} />
    <div className="compliance-card-actions"><QuietButton onClick={() => onDelete(item)}>Remove</QuietButton></div>
  </RecordCard>;
}

export default function BusinessCompliancePage({ onBack }) {
  const [state, setState] = useState(() => loadBusinessCompliance());
  const [tab, setTab] = useState("overview");
  const [deadlineDraft, setDeadlineDraft] = useState(null);
  const [documentDraft, setDocumentDraft] = useState(null);
  const summary = useMemo(() => summarizeBusinessCompliance(state), [state]);
  const deadlines = useMemo(() => sortDeadlines(state.deadlines), [state.deadlines]);

  const persist = (next) => setState(saveBusinessCompliance(next));
  const updateSetup = (item) => persist({ ...state, setup: state.setup.map((row) => row.id === item.id ? item : row) });
  const updateDeadline = (item) => persist({ ...state, deadlines: state.deadlines.map((row) => row.id === item.id ? item : row) });
  const updateDocument = (item) => persist({ ...state, documents: state.documents.map((row) => row.id === item.id ? item : row) });
  const updateProfile = (key, value) => persist({ ...state, profile: { ...state.profile, [key]: value } });
  const complete = (item) => updateDeadline(completeDeadline(item));

  const addDeadline = () => {
    if (!deadlineDraft?.title?.trim()) return;
    persist({ ...state, deadlines: [...state.deadlines, deadlineDraft] });
    setDeadlineDraft(null);
  };
  const addDocument = () => {
    if (!documentDraft?.title?.trim()) return;
    persist({ ...state, documents: [...state.documents, documentDraft] });
    setDocumentDraft(null);
  };

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "setup", label: "Setup" },
    { key: "deadlines", label: "Deadlines" },
    { key: "documents", label: "Documents" },
    { key: "profile", label: "Profile" },
  ];

  return <main className="business-compliance-page" data-testid="business-compliance-page">
    <PageHeader eyebrow="Business admin" title="Compliance" />
    {onBack ? <button type="button" className="everyday-back-button" onClick={onBack}>Back to Business</button> : null}
    <p className="compliance-privacy-note">Track status, dates, agencies, document locations, and safe references here. Do not save passwords, full EINs, bank account numbers, card numbers, or other secrets in this tracker.</p>
    <div className="compliance-tabs" role="tablist" aria-label="Compliance sections">{tabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? "is-active" : ""} onClick={() => setTab(item.key)}>{item.label}</button>)}</div>

    {tab === "overview" ? <>
      <div className="compliance-metrics">
        <MetricCard label="Setup complete" value={`${summary.setupComplete}/${summary.setupTotal}`} />
        <MetricCard label="Overdue" value={summary.overdue} tone={summary.overdue ? "warning" : "neutral"} />
        <MetricCard label="Due in 30 days" value={summary.dueSoon} tone={summary.dueSoon ? "warning" : "neutral"} />
        <MetricCard label="Needs a date" value={summary.needsDate} tone={summary.needsDate ? "warning" : "neutral"} />
      </div>
      <section><SectionHeader title="Next deadlines" description="Dates stay editable because filing requirements depend on your actual registration, locality, and assigned filing frequency." />
        {deadlines.length ? <div className="compliance-list">{deadlines.slice(0, 6).map((item) => <DeadlineCard key={item.id} item={item} onChange={updateDeadline} onComplete={complete} />)}</div> : <EmptyState title="No deadlines yet">Add deadlines as registrations and policies are established.</EmptyState>}
      </section>
      <section><SectionHeader title="Setup progress" />
        <div className="compliance-compact-list">{state.setup.filter((item) => item.status !== "complete" && item.status !== "not_applicable").slice(0, 6).map((item) => <button type="button" key={item.id} onClick={() => setTab("setup")}><span>{item.title}</span><StatusBadge tone={setupTone(item.status)}>{SETUP_STATUSES.find((status) => status.value === item.status)?.label}</StatusBadge></button>)}</div>
      </section>
    </> : null}

    {tab === "setup" ? <section><SectionHeader title="Business setup" description="Use this to work through registration and operating basics without losing track of what is finished." /><div className="compliance-list">{state.setup.map((item) => <SetupCard key={item.id} item={item} onChange={updateSetup} />)}</div></section> : null}

    {tab === "deadlines" ? <section><SectionHeader title="Filing and renewal calendar" description="Recurring items advance to their next period when marked complete." actions={<PrimaryButton onClick={() => setDeadlineDraft(newDeadline())}>Add Deadline</PrimaryButton>} />
      {deadlineDraft ? <RecordCard><div className="compliance-form-grid"><TextField label="Deadline name" required value={deadlineDraft.title} onChange={(value) => setDeadlineDraft({ ...deadlineDraft, title: value })} /><SelectField label="Category" value={deadlineDraft.category} onChange={(value) => setDeadlineDraft({ ...deadlineDraft, category: value })} options={DEADLINE_CATEGORIES.map((value) => ({ value, label: value }))} /><TextField label="Agency" value={deadlineDraft.agency} onChange={(value) => setDeadlineDraft({ ...deadlineDraft, agency: value })} /><TextField label="Due date" type="date" value={deadlineDraft.dueDate} onChange={(value) => setDeadlineDraft({ ...deadlineDraft, dueDate: value })} /><SelectField label="Cadence" value={deadlineDraft.cadence} onChange={(value) => setDeadlineDraft({ ...deadlineDraft, cadence: value })} options={DEADLINE_CADENCES} /><TextField className="is-wide" label="Notes" multiline value={deadlineDraft.notes} onChange={(value) => setDeadlineDraft({ ...deadlineDraft, notes: value })} /></div><div className="compliance-card-actions"><QuietButton onClick={() => setDeadlineDraft(null)}>Cancel</QuietButton><PrimaryButton onClick={addDeadline}>Save Deadline</PrimaryButton></div></RecordCard> : null}
      <div className="compliance-list">{deadlines.map((item) => <DeadlineCard key={item.id} item={item} onChange={updateDeadline} onComplete={complete} />)}</div>
    </section> : null}

    {tab === "documents" ? <section><SectionHeader title="Document index" description="This indexes where records are stored; it does not store secret credentials." actions={<PrimaryButton onClick={() => setDocumentDraft(newDocument())}>Add Document</PrimaryButton>} />
      {documentDraft ? <RecordCard><div className="compliance-form-grid"><TextField label="Document title" required value={documentDraft.title} onChange={(value) => setDocumentDraft({ ...documentDraft, title: value })} /><SelectField label="Type" value={documentDraft.type} onChange={(value) => setDocumentDraft({ ...documentDraft, type: value })} options={DOCUMENT_TYPES.map((value) => ({ value, label: value }))} /><TextField label="Location / folder" value={documentDraft.location} onChange={(value) => setDocumentDraft({ ...documentDraft, location: value })} /><TextField label="Expiration" type="date" value={documentDraft.expirationDate} onChange={(value) => setDocumentDraft({ ...documentDraft, expirationDate: value })} /><TextField className="is-wide" label="Notes" multiline value={documentDraft.notes} onChange={(value) => setDocumentDraft({ ...documentDraft, notes: value })} /></div><div className="compliance-card-actions"><QuietButton onClick={() => setDocumentDraft(null)}>Cancel</QuietButton><PrimaryButton onClick={addDocument}>Save Document</PrimaryButton></div></RecordCard> : null}
      {state.documents.length ? <div className="compliance-list">{state.documents.map((item) => <DocumentCard key={item.id} item={item} onChange={updateDocument} onDelete={(document) => persist({ ...state, documents: state.documents.filter((row) => row.id !== document.id) })} />)}</div> : <EmptyState title="No documents indexed">Add formation, tax, license, insurance, banking, or contract records as you create them.</EmptyState>}
    </section> : null}

    {tab === "profile" ? <section><SectionHeader title="Business profile" description="Keep safe administrative details together. Sensitive numbers should remain in their secure source systems." /><RecordCard><div className="compliance-form-grid">
      <TextField label="Legal business name" value={state.profile.legalName} onChange={(value) => updateProfile("legalName", value)} />
      <TextField label="DBA / brand" value={state.profile.dba} onChange={(value) => updateProfile("dba", value)} />
      <TextField label="Entity type" value={state.profile.entityType} onChange={(value) => updateProfile("entityType", value)} />
      <TextField label="State" value={state.profile.state} onChange={(value) => updateProfile("state", value)} />
      <TextField label="Locality" value={state.profile.locality} onChange={(value) => updateProfile("locality", value)} />
      <TextField label="Formation date" type="date" value={state.profile.formationDate} onChange={(value) => updateProfile("formationDate", value)} />
      <TextField label="State entity reference" value={state.profile.stateEntityReference} onChange={(value) => updateProfile("stateEntityReference", value)} />
      <TextField label="EIN last four only" inputMode="numeric" maxLength="4" value={state.profile.einLastFour} onChange={(value) => updateProfile("einLastFour", value.replace(/\D/g, "").slice(0, 4))} />
      <TextField label="Sales tax filing frequency" value={state.profile.salesTaxFrequency} onChange={(value) => updateProfile("salesTaxFrequency", value)} />
      <TextField label="Bookkeeping method / system" value={state.profile.bookkeepingMethod} onChange={(value) => updateProfile("bookkeepingMethod", value)} />
      <TextField className="is-wide" label="Notes" multiline value={state.profile.notes} onChange={(value) => updateProfile("notes", value)} />
    </div></RecordCard></section> : null}
  </main>;
}
