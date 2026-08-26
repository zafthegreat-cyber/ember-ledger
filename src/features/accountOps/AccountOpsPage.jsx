import { useEffect, useMemo, useState } from "react";
import {
  DesktopDataTable,
  Dialog,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  PrimaryButton,
  QuietButton,
  SearchField,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from "../../components/operations/OperationsUI.jsx";
import { OWNER_SESSION_STATES } from "../../services/ownerSession.js";
import {
  ACCOUNT_HEALTH_STATES,
  ACCOUNT_SETUP_STAGES,
  ACCOUNT_TASK_PRIORITIES,
  ACCOUNT_TASK_STATUSES,
  ACCOUNT_TASK_TYPES,
  ALIAS_PROVISIONING_STATES,
  CREDENTIAL_REFERENCE_PROVIDERS,
  EMAIL_ALIAS_STATUSES,
  EMAIL_DOMAIN_MODES,
  EMAIL_DOMAIN_STATUSES,
  STORE_ACCOUNT_STATUSES,
  VERIFICATION_STATES,
  createAccountOpsService,
  deriveAccountHealth,
} from "./index.js";
import "./account-ops.css";

const SECTIONS = Object.freeze([
  { key: "overview", label: "Overview" },
  { key: "profiles", label: "Profiles" },
  { key: "emails", label: "Emails" },
  { key: "accounts", label: "Store Accounts" },
  { key: "tasks", label: "Tasks" },
]);

const EMPTY_SNAPSHOT = Object.freeze({
  schemaVersion: 1,
  updatedAt: "",
  profileGroups: [],
  profiles: [],
  emailDomains: [],
  emailAliases: [],
  retailers: [],
  storeAccounts: [],
  tasks: [],
  activity: [],
});

const EMPTY_FILTERS = Object.freeze({
  recordScope: "active",
  profileGroupId: "",
  aliasStatus: "",
  retailerId: "",
  profileId: "",
  accountStatus: "",
  health: "",
  verification: "",
  taskStatus: "OPEN",
});

function words(value) {
  return String(value || "Not recorded").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function dateLabel(value, empty = "Not recorded") {
  if (!value || !Number.isFinite(Date.parse(value))) return empty;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

function statusTone(value) {
  const normalized = String(value || "").toUpperCase();
  if (/HEALTHY|READY|ACTIVE|VERIFIED|DONE|RECEIVING_CONFIRMED|PROVIDER_PROVISIONED/.test(normalized)) return "success";
  if (/PROBLEM|LOCKED|ERROR|FAILED|DISABLED/.test(normalized)) return "danger";
  if (/NEEDS|PENDING|UNKNOWN|SETUP|PREPARED|INSUFFICIENT/.test(normalized)) return "warning";
  return "neutral";
}

function byId(rows, id) {
  return (rows || []).find((row) => row.id === id) || null;
}

function AccountOpsTabs({ active, onChange }) {
  const primary = SECTIONS.slice(0, 3);
  const overflow = SECTIONS.slice(3);
  const choose = (key, event) => {
    const disclosure = event.currentTarget.closest(".account-ops-tabs")?.querySelector("details");
    if (disclosure) disclosure.open = false;
    onChange(key);
  };
  return (
    <nav className="account-ops-tabs" aria-label="Account Ops sections">
      {primary.map((item) => (
        <button key={item.key} type="button" className={active === item.key ? "is-active" : ""} aria-current={active === item.key ? "page" : undefined} onClick={(event) => choose(item.key, event)}>{item.label}</button>
      ))}
      <details className="account-ops-tabs-more">
        <summary>More</summary>
        <div>{overflow.map((item) => <button key={item.key} type="button" className={active === item.key ? "is-active" : ""} aria-current={active === item.key ? "page" : undefined} onClick={(event) => choose(item.key, event)}>{item.label}</button>)}</div>
      </details>
    </nav>
  );
}

function Field({ label, helper = "", wide = false, children, ...inputProps }) {
  return (
    <label className={`account-ops-field${wide ? " account-ops-form-wide" : ""}`}>
      <span>{label}</span>
      {children || <input {...inputProps} />}
      {helper ? <small>{helper}</small> : null}
    </label>
  );
}

function SelectField({ label, value, onChange, options, helper = "", wide = false }) {
  return <Field label={label} helper={helper} wide={wide}><select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>{options.map((option) => { const item = typeof option === "string" ? { value: option, label: words(option) } : option; return <option key={item.value} value={item.value} disabled={item.disabled}>{item.label}</option>; })}</select></Field>;
}

function Facts({ rows }) {
  return <dl className="account-ops-facts">{rows.filter((row) => row.value !== undefined && row.value !== null && row.value !== "").map((row) => <div key={row.label}><dt>{row.label}</dt><dd className={row.mono ? "account-ops-alias" : ""}>{row.value}</dd></div>)}</dl>;
}

function copyText(value, onMessage) {
  if (!value) return;
  navigator.clipboard?.writeText(String(value)).then(() => onMessage("Copied to clipboard.")).catch(() => onMessage("Copy was unavailable on this device.", "warning"));
}

function profileDraft(record = {}) {
  return {
    displayName: record.displayName || "",
    aliasLabel: record.aliasLabel || "",
    profileGroupId: record.profileGroupId || "",
    fullName: record.fullName || "",
    businessName: record.businessName || "",
    emailPreference: record.emailPreference || "",
    phone: record.phone || "",
    shippingAddress: { line1: "", line2: "", city: "", region: "", postalCode: "", country: "US", ...(record.shippingAddress || {}) },
    billingAddress: { line1: "", line2: "", city: "", region: "", postalCode: "", country: "US", ...(record.billingAddress || {}) },
    notes: record.notes || "",
    status: record.status || "ACTIVE",
  };
}

function domainDraft(record = {}) {
  return { domain: record.domain || "", mode: record.mode || EMAIL_DOMAIN_MODES.LOCAL_METADATA_ONLY, providerId: record.providerId || "", status: record.status || EMAIL_DOMAIN_STATUSES.NOT_CONFIGURED, notes: record.notes || "" };
}

function aliasGeneratorDraft() {
  return { profileId: "", retailerId: "", domainId: "", template: "{store}-{profile}-{random}", purpose: "Retailer account" };
}

function accountDraft(record = {}) {
  return {
    retailerId: record.retailerId || "",
    profileId: record.profileId || "",
    aliasId: record.aliasId || "",
    username: record.username || "",
    accountDisplayName: record.accountDisplayName || "",
    status: record.status || STORE_ACCOUNT_STATUSES.SETUP,
    phoneVerificationRequired: record.phoneVerificationRequired === true,
    emailVerificationStatus: record.emailVerificationStatus || VERIFICATION_STATES.PENDING,
    phoneVerificationStatus: record.phoneVerificationStatus || VERIFICATION_STATES.UNKNOWN,
    securityStatus: record.securityStatus || "UNKNOWN",
    setupStage: record.setupStage || ACCOUNT_SETUP_STAGES.PREPARED,
    credentialReference: record.credentialReference || { provider: CREDENTIAL_REFERENCE_PROVIDERS.UNAVAILABLE, referenceId: "", label: "", lastUpdatedAt: null },
    notes: record.notes || "",
  };
}

function taskDraft(record = {}, related = {}) {
  return {
    type: record.type || related.type || ACCOUNT_TASK_TYPES.CUSTOM,
    title: record.title || related.title || "",
    status: record.status || ACCOUNT_TASK_STATUSES.OPEN,
    priority: record.priority || ACCOUNT_TASK_PRIORITIES.NORMAL,
    dueAt: record.dueAt ? String(record.dueAt).slice(0, 16) : "",
    profileId: record.profileId || related.profileId || "",
    accountId: record.accountId || related.accountId || "",
    retailerId: record.retailerId || related.retailerId || "",
    source: record.source || "OWNER",
    notes: record.notes || "",
  };
}

function retailerDraft(record = {}) {
  return { displayName: record.displayName || "", website: record.website || "", signupUrl: record.signupUrl || "", accountUrl: record.accountUrl || "", orderHistoryUrl: record.orderHistoryUrl || "", notes: record.notes || "", iconMetadata: {}, capabilities: ["MANUAL_OWNER_ASSISTED_SETUP"], accountRulesMetadata: {}, automatedProvisioningSupported: false, custom: true, status: record.status || "ACTIVE" };
}

export default function AccountOpsPage({
  session = { status: OWNER_SESSION_STATES.LOADING },
  initialSection = "overview",
  onSectionChange,
  onSignIn,
  onSignOut,
  onReturnHome,
}) {
  const authorized = session.status === OWNER_SESSION_STATES.AUTHORIZED;
  const [service, setService] = useState(null);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [section, setSection] = useState(SECTIONS.some((item) => item.key === initialSection) ? initialSection : "overview");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [dialog, setDialog] = useState("");
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState({});
  const [aliasDraft, setAliasDraft] = useState(null);
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState(() => new Set());
  const [message, setMessage] = useState({ text: "", tone: "info" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSection(SECTIONS.some((item) => item.key === initialSection) ? initialSection : "overview");
  }, [initialSection]);

  useEffect(() => {
    if (!authorized) {
      setService(null);
      setSnapshot(EMPTY_SNAPSHOT);
      setSelectedAccountIds(new Set());
      setGeneratedPassword("");
      return;
    }
    const nextService = createAccountOpsService();
    setService(nextService);
    setSnapshot(nextService.loadSnapshot());
    return () => setGeneratedPassword("");
  }, [authorized]);

  const retailers = useMemo(() => service?.listRetailers?.() || [], [service, snapshot.retailers]);
  const archiveFilter = filters.recordScope === "archived" ? true : filters.recordScope === "all" ? undefined : false;
  const searchResults = useMemo(() => {
    if (!service) return { profiles: [], aliases: [], accounts: [], tasks: [] };
    return service.search(query, {
      archived: archiveFilter,
      profileGroupId: filters.profileGroupId || undefined,
      aliasStatus: filters.aliasStatus || undefined,
      retailerId: filters.retailerId || undefined,
      profileId: filters.profileId || undefined,
      accountStatus: filters.accountStatus || undefined,
      health: filters.health || undefined,
      verification: filters.verification || undefined,
      taskStatus: filters.taskStatus || undefined,
    });
  }, [service, snapshot, query, filters, archiveFilter, retailers]);

  const healthByAccount = useMemo(() => new Map((snapshot.storeAccounts || []).map((account) => [account.id, deriveAccountHealth(account, { ...snapshot, retailers })])), [snapshot, retailers]);
  const summary = useMemo(() => service?.summary?.() || { storeAccounts: 0, ready: 0, needsAttention: 0, problem: 0, emailAliases: 0, tasks: 0 }, [service, snapshot]);
  const profileMap = useMemo(() => new Map((snapshot.profiles || []).map((row) => [row.id, row])), [snapshot.profiles]);
  const aliasMap = useMemo(() => new Map((snapshot.emailAliases || []).map((row) => [row.id, row])), [snapshot.emailAliases]);
  const retailerMap = useMemo(() => new Map(retailers.map((row) => [row.id, row])), [retailers]);

  function showMessage(text, tone = "info") { setMessage({ text, tone }); }
  function chooseSection(next, nextFilters = null) { setSection(next); setQuery(""); setFilters(nextFilters ? { ...EMPTY_FILTERS, ...nextFilters } : { ...EMPTY_FILTERS }); onSectionChange?.(next); }
  function closeDialog() { setDialog(""); setEditingId(""); setForm({}); setAliasDraft(null); setGeneratedPassword(""); }
  function changeForm(field, value) { setForm((current) => ({ ...current, [field]: value })); }
  function changeAddress(kind, field, value) { setForm((current) => ({ ...current, [kind]: { ...(current[kind] || {}), [field]: value } })); }

  async function run(action, successMessage) {
    if (!service || busy) return null;
    setBusy(true);
    try {
      const result = await action();
      setSnapshot(result?.snapshot || service.loadSnapshot());
      if (successMessage) showMessage(successMessage, "success");
      return result;
    } catch (error) {
      showMessage(error?.message || "Account Ops could not complete that action.", "error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function openProfile(record = null) { setEditingId(record?.id || ""); setForm(profileDraft(record || {})); setDialog("profile"); }
  function openDomain(record = null) { setEditingId(record?.id || ""); setForm(domainDraft(record || {})); setDialog("domain"); }
  function openAliasGenerator() { setEditingId(""); setForm(aliasGeneratorDraft()); setAliasDraft(null); setDialog("alias-generator"); }
  function openAliasEditor(record) { setEditingId(record.id); setForm({ profileId: record.profileId || "", retailerId: record.retailerId || "", purpose: record.purpose || "", notes: record.notes || "" }); setDialog("alias-edit"); }
  function openAccount(record = null) { setEditingId(record?.id || ""); setForm(accountDraft(record || {})); setGeneratedPassword(""); setDialog("account"); }
  function openSetup(record) { setEditingId(record.id); setForm({ credentialProvider: record.credentialReference?.provider || CREDENTIAL_REFERENCE_PROVIDERS.UNAVAILABLE, credentialReferenceId: record.credentialReference?.referenceId || "", credentialLabel: record.credentialReference?.label || "" }); setGeneratedPassword(""); setDialog("setup"); }
  function openTask(record = null, related = {}) { setEditingId(record?.id || ""); setForm(taskDraft(record || {}, related)); setDialog("task"); }
  function openRetailer(record = null) { setEditingId(record?.id || ""); setForm(retailerDraft(record || {})); setDialog("retailer"); }

  async function archive(kind, record) {
    if (!window.confirm(`Archive ${record.displayName || record.aliasAddress || record.accountDisplayName || record.title || "this record"}?`)) return;
    const method = { profile: "archiveProfile", alias: "archiveEmailAlias", account: "archiveStoreAccount", task: "archiveTask", retailer: "archiveRetailer" }[kind];
    if (!method || typeof service?.[method] !== "function") return;
    await run(() => service[method](record.id), "Record archived.");
  }

  if (session.status === OWNER_SESSION_STATES.LOADING) return <main className="account-ops account-ops--denied"><LoadingState title="Checking owner access">Verifying the application session.</LoadingState></main>;
  if (session.status === OWNER_SESSION_STATES.SIGN_IN_REQUIRED) return <main className="account-ops account-ops--denied"><ErrorState title="Sign In Required" action={<PrimaryButton onClick={onSignIn}>Sign In</PrimaryButton>}>Sign in with the approved owner account to open Account Ops.</ErrorState></main>;
  if (session.status === OWNER_SESSION_STATES.OWNER_ACCESS_REQUIRED) return <main className="account-ops account-ops--denied"><ErrorState title="Owner Access Required" action={<div className="account-ops-inline-actions"><PrimaryButton onClick={onReturnHome}>Return Home</PrimaryButton><SecondaryButton onClick={onSignOut}>Sign Out</SecondaryButton></div>}>This signed-in account is not authorized for Account Ops.</ErrorState></main>;
  if (!authorized) return <main className="account-ops account-ops--denied"><ErrorState title="Owner access unavailable" action={<PrimaryButton onClick={onReturnHome}>Return Home</PrimaryButton>}>Owner authorization could not be verified. No Account Ops records were loaded.</ErrorState></main>;

  const renderToolbar = () => (
    <div className="account-ops-toolbar">
      <SearchField label={`Search ${SECTIONS.find((item) => item.key === section)?.label || "Account Ops"}`} value={query} onChange={setQuery} placeholder="Search records" />
      <details>
        <summary className="account-ops-filter-summary">Filter</summary>
        <div className="account-ops-filter-row">
          <SelectField label="Records" value={filters.recordScope} onChange={(value) => setFilters((current) => ({ ...current, recordScope: value }))} options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }, { value: "all", label: "All" }]} />
          {section === "profiles" ? <SelectField label="Group" value={filters.profileGroupId} onChange={(value) => setFilters((current) => ({ ...current, profileGroupId: value }))} options={[{ value: "", label: "All groups" }, ...(snapshot.profileGroups || []).map((row) => ({ value: row.id, label: row.displayName }))]} /> : null}
          {section === "emails" ? <><SelectField label="Alias status" value={filters.aliasStatus} onChange={(value) => setFilters((current) => ({ ...current, aliasStatus: value }))} options={[{ value: "", label: "All statuses" }, ...Object.values(EMAIL_ALIAS_STATUSES)]} /><SelectField label="Profile" value={filters.profileId} onChange={(value) => setFilters((current) => ({ ...current, profileId: value }))} options={[{ value: "", label: "All profiles" }, ...(snapshot.profiles || []).map((row) => ({ value: row.id, label: row.displayName }))]} /><SelectField label="Retailer" value={filters.retailerId} onChange={(value) => setFilters((current) => ({ ...current, retailerId: value }))} options={[{ value: "", label: "All retailers" }, ...retailers.map((row) => ({ value: row.id, label: row.displayName }))]} /></> : null}
          {section === "accounts" ? <><SelectField label="Retailer" value={filters.retailerId} onChange={(value) => setFilters((current) => ({ ...current, retailerId: value }))} options={[{ value: "", label: "All retailers" }, ...retailers.map((row) => ({ value: row.id, label: row.displayName }))]} /><SelectField label="Profile" value={filters.profileId} onChange={(value) => setFilters((current) => ({ ...current, profileId: value }))} options={[{ value: "", label: "All profiles" }, ...(snapshot.profiles || []).map((row) => ({ value: row.id, label: row.displayName }))]} /><SelectField label="Status" value={filters.accountStatus} onChange={(value) => setFilters((current) => ({ ...current, accountStatus: value }))} options={[{ value: "", label: "All statuses" }, ...Object.values(STORE_ACCOUNT_STATUSES)]} /><SelectField label="Health" value={filters.health} onChange={(value) => setFilters((current) => ({ ...current, health: value }))} options={[{ value: "", label: "All health states" }, ...Object.values(ACCOUNT_HEALTH_STATES)]} /><SelectField label="Verification" value={filters.verification} onChange={(value) => setFilters((current) => ({ ...current, verification: value }))} options={[{ value: "", label: "Any verification" }, ...Object.values(VERIFICATION_STATES)]} /></> : null}
          {section === "tasks" ? <><SelectField label="Task status" value={filters.taskStatus} onChange={(value) => setFilters((current) => ({ ...current, taskStatus: value }))} options={[{ value: "", label: "All statuses" }, ...Object.values(ACCOUNT_TASK_STATUSES)]} /><SelectField label="Profile" value={filters.profileId} onChange={(value) => setFilters((current) => ({ ...current, profileId: value }))} options={[{ value: "", label: "All profiles" }, ...(snapshot.profiles || []).map((row) => ({ value: row.id, label: row.displayName }))]} /><SelectField label="Retailer" value={filters.retailerId} onChange={(value) => setFilters((current) => ({ ...current, retailerId: value }))} options={[{ value: "", label: "All retailers" }, ...retailers.map((row) => ({ value: row.id, label: row.displayName }))]} /></> : null}
        </div>
      </details>
    </div>
  );

  return (
    <main className="account-ops" data-testid="account-ops">
      <PageHeader eyebrow="Owner workspace" title="Account Ops" description="Manage legitimate profiles, aliases, retailer accounts, and follow-up tasks." actions={<StatusBadge tone="warning">Owner Only</StatusBadge>} />
      {session.localDevelopment ? <div className="account-ops-local-development" role="status">Local development identity</div> : null}
      <AccountOpsTabs active={section} onChange={chooseSection} />
      {message.text ? <p className={`account-ops-message${message.tone === "error" ? " is-error" : message.tone === "warning" ? " is-warning" : ""}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</p> : null}

      {section === "overview" ? renderOverview() : null}
      {section === "profiles" ? renderProfiles() : null}
      {section === "emails" ? renderEmails() : null}
      {section === "accounts" ? renderAccounts() : null}
      {section === "tasks" ? renderTasks() : null}

      {renderDialogs()}
    </main>
  );

  function renderOverview() {
    const attentionAccounts = (snapshot.storeAccounts || []).filter((row) => row.status !== STORE_ACCOUNT_STATUSES.ARCHIVED && healthByAccount.get(row.id)?.health !== ACCOUNT_HEALTH_STATES.HEALTHY);
    const openTasks = (snapshot.tasks || []).filter((row) => row.status === ACCOUNT_TASK_STATUSES.OPEN);
    const attention = [
      ...attentionAccounts.map((account) => ({ id: `account-${account.id}`, title: retailerMap.get(account.retailerId)?.displayName || account.accountDisplayName || "Store account", detail: healthByAccount.get(account.id)?.reasons?.[0]?.message || "Owner review required", section: "accounts" })),
      ...openTasks.map((task) => ({ id: `task-${task.id}`, title: task.title, detail: task.dueAt ? `Due ${dateLabel(task.dueAt)}` : "Open task", section: "tasks" })),
    ].slice(0, 5);
    return (
      <section className="account-ops-overview" aria-label="Account Ops overview">
        <div className="account-ops-metrics" aria-label="Account Ops summary">
          {[['Store Accounts', summary.storeAccounts], ['Ready', summary.ready], ['Needs Attention', summary.needsAttention], ['Problem', summary.problem], ['Email Aliases', summary.emailAliases], ['Tasks', summary.tasks]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>
        <section><SectionHeader title="Needs Attention" />{attention.length ? <div className="account-ops-attention">{attention.map((row) => <button className="account-ops-row" type="button" key={row.id} onClick={() => chooseSection(row.section)}><span><strong>{row.title}</strong><small>{row.detail}</small></span><span aria-hidden="true">›</span></button>)}</div> : <p className="account-ops-empty-line">No account issues need attention.</p>}</section>
        {(snapshot.activity || []).length ? <section><SectionHeader title="Recent Activity" /><div className="account-ops-activity">{snapshot.activity.slice(0, 5).map((row) => <div key={row.id}><span><strong>{row.title}</strong><small>{row.summary || words(row.type)}</small></span><time>{dateLabel(row.occurredAt || row.createdAt)}</time></div>)}</div></section> : null}
      </section>
    );
  }

  function renderProfiles() {
    const profiles = filters.profileId ? searchResults.profiles.filter((profile) => profile.id === filters.profileId) : searchResults.profiles;
    return (
      <section className="account-ops-section">
        <SectionHeader title="Profiles" description="Reusable owner-managed identity records. Profiles never authorize Code 3." actions={<div className="account-ops-inline-actions"><SecondaryButton onClick={() => { setEditingId(""); setForm({ displayName: "", description: "", status: "ACTIVE" }); setDialog("group"); }}>New Group</SecondaryButton><PrimaryButton onClick={() => openProfile()}>Create Profile</PrimaryButton></div>} />
        {renderToolbar()}
        {(snapshot.profileGroups || []).length ? <details className="account-ops-management"><summary>Manage profile groups</summary><div>{(snapshot.profileGroups || []).map((group) => <div className="account-ops-management-row" key={group.id}><span><strong>{group.displayName}</strong>{group.description ? ` — ${group.description}` : ""}</span><div className="account-ops-inline-actions"><SecondaryButton onClick={() => { setEditingId(group.id); setForm({ displayName: group.displayName, description: group.description || "", status: group.status }); setDialog("group"); }}>Edit</SecondaryButton>{group.status !== "ARCHIVED" ? <QuietButton onClick={() => { if (window.confirm(`Archive ${group.displayName}?`)) run(() => service.archiveProfileGroup(group.id), "Profile group archived."); }}>Archive</QuietButton> : null}</div></div>)}</div></details> : null}
        {profiles.length ? <div className="account-ops-list account-ops-list--cards">{profiles.map((profile) => {
          const aliases = (snapshot.emailAliases || []).filter((row) => row.profileId === profile.id && row.status !== EMAIL_ALIAS_STATUSES.ARCHIVED).length;
          const accounts = (snapshot.storeAccounts || []).filter((row) => row.profileId === profile.id && row.status !== STORE_ACCOUNT_STATUSES.ARCHIVED).length;
          const tasks = (snapshot.tasks || []).filter((row) => row.profileId === profile.id && row.status === ACCOUNT_TASK_STATUSES.OPEN).length;
          return <article className="account-ops-card" key={profile.id}><header><div><h3>{profile.displayName}</h3><p>{byId(snapshot.profileGroups, profile.profileGroupId)?.displayName || "No group"}</p></div><StatusBadge tone={statusTone(profile.status)}>{words(profile.status)}</StatusBadge></header><Facts rows={[{ label: "Retailer Accounts", value: accounts }, { label: "Aliases", value: aliases }, { label: "Needs Attention", value: tasks }, { label: "Business", value: profile.businessName }]} /><div className="account-ops-card-actions"><PrimaryButton onClick={() => openProfile(profile)}>Open</PrimaryButton><SecondaryButton onClick={() => copyText([profile.fullName, profile.businessName, profile.phone].filter(Boolean).join("\n"), showMessage)}>Copy Info</SecondaryButton><QuietButton onClick={() => chooseSection("emails", { profileId: profile.id })}>Aliases</QuietButton><QuietButton onClick={() => chooseSection("accounts", { profileId: profile.id })}>Accounts</QuietButton><QuietButton onClick={() => chooseSection("tasks", { profileId: profile.id, taskStatus: "" })}>Tasks</QuietButton>{profile.status !== "ARCHIVED" ? <QuietButton onClick={() => archive("profile", profile)}>Archive</QuietButton> : null}</div></article>;
        })}</div> : <EmptyState title="No profiles found" action={<PrimaryButton onClick={() => openProfile()}>Create Profile</PrimaryButton>}>Create a reusable personal, business, store-specific, or custom-group profile.</EmptyState>}
      </section>
    );
  }

  function renderEmails() {
    const domains = (snapshot.emailDomains || []).filter((row) => {
      if (filters.recordScope === "active" && row.status === EMAIL_DOMAIN_STATUSES.ARCHIVED) return false;
      if (filters.recordScope === "archived" && row.status !== EMAIL_DOMAIN_STATUSES.ARCHIVED) return false;
      return !query || `${row.domain} ${row.mode} ${row.notes || ""}`.toLowerCase().includes(query.toLowerCase());
    });
    return (
      <section className="account-ops-section">
        <SectionHeader title="Emails" description="Generate local alias metadata and track whether mail delivery was actually confirmed." actions={<div className="account-ops-inline-actions"><SecondaryButton onClick={() => openDomain()}>Add Domain</SecondaryButton><PrimaryButton onClick={openAliasGenerator}>Generate Alias</PrimaryButton></div>} />
        {renderToolbar()}
        {domains.length ? <section><SectionHeader title="Domains" /><div className="account-ops-list">{domains.map((domain) => <article className="account-ops-card" key={domain.id}><header><div><h3 className="account-ops-alias">{domain.domain}</h3><p>{words(domain.mode)}</p></div><StatusBadge tone={statusTone(domain.status)}>{words(domain.status)}</StatusBadge></header><p>{domain.mode === EMAIL_DOMAIN_MODES.CATCH_ALL ? "Catch-all metadata. Receiving mail is not assumed until the owner confirms a real delivery test." : "Local metadata only. Code 3 does not provision or receive mail for this domain."}</p><div className="account-ops-card-actions"><SecondaryButton onClick={() => openDomain(domain)}>Edit</SecondaryButton>{domain.mode === EMAIL_DOMAIN_MODES.CATCH_ALL && !domain.catchAllOwnerConfirmedAt ? <PrimaryButton onClick={() => run(() => service.confirmCatchAllDomain(domain.id), "Catch-all delivery confirmed by the owner.")}>Confirm Delivery Test</PrimaryButton> : null}{domain.status !== EMAIL_DOMAIN_STATUSES.ARCHIVED ? <QuietButton onClick={() => { if (window.confirm(`Archive ${domain.domain}?`)) run(() => service.archiveEmailDomain(domain.id), "Domain archived."); }}>Archive</QuietButton> : null}</div></article>)}</div></section> : null}
        <section>
          <SectionHeader title="Email Aliases" />
          {searchResults.aliases.length ? <div className="account-ops-list account-ops-list--cards">{searchResults.aliases.map((alias) => {
            const deliveryConfirmed = alias.provisioningState === ALIAS_PROVISIONING_STATES.RECEIVING_CONFIRMED || alias.provisioningState === ALIAS_PROVISIONING_STATES.PROVIDER_PROVISIONED;
            const domain = byId(snapshot.emailDomains, alias.domainId);
            return <article className="account-ops-card" key={alias.id}><header><div><h3 className="account-ops-alias">{alias.aliasAddress}</h3><p>{alias.purpose || "No purpose recorded"}</p></div><StatusBadge tone={deliveryConfirmed ? "success" : statusTone(alias.status)}>{deliveryConfirmed ? "Receiving Confirmed" : "Generated Only"}</StatusBadge></header><p>{deliveryConfirmed ? "The owner recorded valid receiving or provider evidence." : "Generated locally. This address is not claimed to be provisioned or receiving mail."}</p><Facts rows={[{ label: "Profile", value: profileMap.get(alias.profileId)?.displayName || "None" }, { label: "Retailer", value: retailerMap.get(alias.retailerId)?.displayName || "None" }, { label: "Status", value: words(alias.status) }, { label: "Verification", value: words(alias.verificationState) }]} /><div className="account-ops-card-actions"><PrimaryButton onClick={() => copyText(alias.aliasAddress, showMessage)}>Copy</PrimaryButton><SecondaryButton onClick={() => openAliasEditor(alias)}>Edit</SecondaryButton>{!deliveryConfirmed && domain?.mode === EMAIL_DOMAIN_MODES.CATCH_ALL && domain.catchAllOwnerConfirmedAt ? <SecondaryButton onClick={() => run(() => service.confirmCatchAllReceiving(alias.id), "Alias receiving confirmed by the owner.")}>Confirm Receiving</SecondaryButton> : null}{![EMAIL_ALIAS_STATUSES.DISABLED, EMAIL_ALIAS_STATUSES.ARCHIVED].includes(alias.status) ? <QuietButton onClick={() => run(() => service.disableEmailAlias(alias.id), "Alias disabled.")}>Disable</QuietButton> : null}{alias.status !== EMAIL_ALIAS_STATUSES.ARCHIVED ? <QuietButton onClick={() => archive("alias", alias)}>Archive</QuietButton> : null}</div></article>;
          })}</div> : <EmptyState title="No email aliases found" action={<PrimaryButton onClick={openAliasGenerator}>Generate Alias</PrimaryButton>}>Generated aliases remain local metadata until receiving is explicitly confirmed.</EmptyState>}
        </section>
      </section>
    );
  }

  function renderAccounts() {
    const visibleIds = new Set(searchResults.accounts.map((row) => row.id));
    const selectedVisible = [...selectedAccountIds].filter((id) => visibleIds.has(id));
    const toggleSelected = (id) => setSelectedAccountIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    const bulkTasks = async () => {
      const targets = selectedVisible.map((id) => {
        const account = byId(snapshot.storeAccounts, id);
        return { accountId: id, profileId: account?.profileId || null, retailerId: account?.retailerId || null };
      });
      const result = await run(() => service.bulkCreateTasks({ targets, task: { type: ACCOUNT_TASK_TYPES.CUSTOM, title: "Review selected store account", priority: ACCOUNT_TASK_PRIORITIES.NORMAL, source: "OWNER_BULK", notes: "Created from the Account Ops selection." } }), "Review tasks created.");
      if (result) setSelectedAccountIds(new Set());
    };
    const bulkArchive = async () => {
      if (!window.confirm(`Archive ${selectedVisible.length} selected store account${selectedVisible.length === 1 ? "" : "s"}?`)) return;
      const result = await run(() => service.bulkArchive("storeAccounts", selectedVisible), "Selected accounts archived.");
      if (result) setSelectedAccountIds(new Set());
    };
    const groups = retailers.map((retailer) => ({ retailer, accounts: searchResults.accounts.filter((account) => account.retailerId === retailer.id) })).filter((group) => group.accounts.length);
    const AccountActions = ({ account }) => {
      const aliasAddress = aliasMap.get(account.aliasId)?.aliasAddress;
      return <div className="account-ops-card-actions"><PrimaryButton onClick={() => openSetup(account)}>Setup</PrimaryButton><SecondaryButton onClick={() => openAccount(account)}>Edit</SecondaryButton>{aliasAddress ? <QuietButton onClick={() => copyText(aliasAddress, showMessage)}>Copy Email</QuietButton> : null}{account.username && account.username !== aliasAddress ? <QuietButton onClick={() => copyText(account.username, showMessage)}>Copy Username</QuietButton> : null}<QuietButton onClick={() => chooseSection("profiles", { profileId: account.profileId })}>View Profile</QuietButton><QuietButton onClick={() => openTask(null, { accountId: account.id, profileId: account.profileId, retailerId: account.retailerId, type: ACCOUNT_TASK_TYPES.CUSTOM, title: `Review ${retailerMap.get(account.retailerId)?.displayName || "store"} account` })}>Task</QuietButton>{account.status !== STORE_ACCOUNT_STATUSES.ARCHIVED ? <QuietButton onClick={() => archive("account", account)}>Archive</QuietButton> : null}</div>;
    };
    return (
      <section className="account-ops-section">
        <SectionHeader title="Store Accounts" description="Track legitimate retailer accounts, owner-confirmed setup, verification, and health." actions={<div className="account-ops-inline-actions"><SecondaryButton onClick={() => openRetailer()}>Add Retailer</SecondaryButton><PrimaryButton onClick={() => openAccount()}>Create Account</PrimaryButton></div>} />
        {renderToolbar()}
        <details className="account-ops-management"><summary>Retailer directory</summary><div>{retailers.map((retailer) => <div className="account-ops-management-row" key={retailer.id}><span><strong>{retailer.displayName}</strong> — {retailer.custom ? "Custom" : "Code 3 preset"}</span>{retailer.custom ? <div className="account-ops-inline-actions"><SecondaryButton onClick={() => openRetailer(retailer)}>Edit</SecondaryButton><QuietButton onClick={() => archive("retailer", retailer)}>Archive</QuietButton></div> : null}</div>)}</div></details>
        {selectedVisible.length ? <div className="account-ops-bulk" role="region" aria-label="Selected account actions"><strong>{selectedVisible.length} selected</strong><SecondaryButton onClick={bulkTasks} disabled={busy}>Create Review Tasks</SecondaryButton><QuietButton onClick={bulkArchive} disabled={busy}>Archive</QuietButton><QuietButton onClick={() => setSelectedAccountIds(new Set())}>Clear</QuietButton></div> : null}
        {searchResults.accounts.length ? <>
          <div className="account-ops-mobile-list account-ops-account-groups">{groups.map(({ retailer, accounts }) => {
            const ready = accounts.filter((row) => row.status === STORE_ACCOUNT_STATUSES.READY).length;
            const attention = accounts.length - accounts.filter((row) => healthByAccount.get(row.id)?.health === ACCOUNT_HEALTH_STATES.HEALTHY).length;
            return <section className="account-ops-retailer-group" key={retailer.id}><header><div><h3>{retailer.displayName}</h3><p>{accounts.length} account{accounts.length === 1 ? "" : "s"} · {ready} Ready · {attention} Needs Attention</p></div></header><div className="account-ops-list">{accounts.map((account) => {
              const health = healthByAccount.get(account.id) || { health: ACCOUNT_HEALTH_STATES.UNKNOWN, reasons: [] };
              const profile = profileMap.get(account.profileId);
              const alias = aliasMap.get(account.aliasId);
              return <article className="account-ops-card" key={account.id}><header><label className="account-ops-select"><input type="checkbox" checked={selectedAccountIds.has(account.id)} onChange={() => toggleSelected(account.id)} aria-label={`Select ${account.accountDisplayName || profile?.displayName || retailer.displayName}`} /><span><h3>{account.accountDisplayName || profile?.displayName || "Store account"}</h3><p>{profile?.displayName || "Missing profile"}</p></span></label><StatusBadge tone={statusTone(health.health)}>{words(health.health)}</StatusBadge></header><Facts rows={[{ label: "Alias", value: alias?.aliasAddress || account.username || "Not recorded", mono: true }, { label: "Status", value: words(account.status) }, { label: "Email verification", value: words(account.emailVerificationStatus) }, { label: "Phone", value: account.phoneVerificationRequired ? words(account.phoneVerificationStatus) : "Not required" }, { label: "Last verified", value: dateLabel(account.lastVerifiedAt) }]} />{health.reasons.length ? <ul className="account-ops-reasons">{health.reasons.slice(0, 3).map((reason) => <li key={reason.code}>{reason.message}</li>)}</ul> : null}<AccountActions account={account} /></article>;
            })}</div></section>;
          })}</div>
          <div className="account-ops-desktop-table"><DesktopDataTable caption="Store accounts" rows={searchResults.accounts} columns={[
            { key: "select", label: "Select", render: (account) => <input type="checkbox" checked={selectedAccountIds.has(account.id)} onChange={() => toggleSelected(account.id)} aria-label={`Select ${account.accountDisplayName || "store account"}`} /> },
            { key: "account", label: "Account", render: (account) => <><strong>{account.accountDisplayName || "Store account"}</strong><small>{retailerMap.get(account.retailerId)?.displayName || "Missing retailer"}</small></> },
            { key: "profile", label: "Profile", render: (account) => profileMap.get(account.profileId)?.displayName || "Missing" },
            { key: "email", label: "Email", render: (account) => <span className="account-ops-alias">{aliasMap.get(account.aliasId)?.aliasAddress || account.username || "Not recorded"}</span> },
            { key: "status", label: "Status", render: (account) => <StatusBadge tone={statusTone(account.status)}>{words(account.status)}</StatusBadge> },
            { key: "health", label: "Health", render: (account) => <StatusBadge tone={statusTone(healthByAccount.get(account.id)?.health)}>{words(healthByAccount.get(account.id)?.health)}</StatusBadge> },
            { key: "actions", label: "Actions", render: (account) => <AccountActions account={account} /> },
          ]} /></div>
        </> : <EmptyState title="No store accounts found" action={<PrimaryButton onClick={() => openAccount()}>Create Account</PrimaryButton>}>Prepare one legitimate retailer account and keep verification human-controlled.</EmptyState>}
      </section>
    );
  }

  function renderTasks() {
    const tasks = searchResults.tasks.filter((task) => (!filters.profileId || task.profileId === filters.profileId) && (!filters.retailerId || task.retailerId === filters.retailerId));
    const TaskActions = ({ task }) => <div className="account-ops-card-actions">{task.status === ACCOUNT_TASK_STATUSES.OPEN ? <><PrimaryButton onClick={() => run(() => service.completeTask(task.id), "Task completed.")}>Complete</PrimaryButton><SecondaryButton onClick={() => openTask(task)}>Edit</SecondaryButton><QuietButton onClick={() => run(() => service.dismissTask(task.id), "Task dismissed.")}>Dismiss</QuietButton></> : null}{task.status !== ACCOUNT_TASK_STATUSES.ARCHIVED ? <QuietButton onClick={() => archive("task", task)}>Archive</QuietButton> : null}</div>;
    return (
      <section className="account-ops-section">
        <SectionHeader title="Tasks" description="Manual and account-health follow-up. No background inbox or order automation is active." actions={<PrimaryButton onClick={() => openTask()}>Create Task</PrimaryButton>} />
        {renderToolbar()}
        {tasks.length ? <><div className="account-ops-mobile-list account-ops-list">{tasks.map((task) => <article className="account-ops-card" key={task.id}><header><div><h3>{task.title}</h3><p>{words(task.type)}</p></div><StatusBadge tone={statusTone(task.priority === ACCOUNT_TASK_PRIORITIES.URGENT ? "PROBLEM" : task.status)}>{words(task.priority)}</StatusBadge></header><Facts rows={[{ label: "Status", value: words(task.status) }, { label: "Due", value: dateLabel(task.dueAt) }, { label: "Profile", value: profileMap.get(task.profileId)?.displayName }, { label: "Retailer", value: retailerMap.get(task.retailerId)?.displayName }]} />{task.notes ? <p>{task.notes}</p> : null}<TaskActions task={task} /></article>)}</div><div className="account-ops-desktop-table"><DesktopDataTable caption="Account Ops tasks" rows={tasks} columns={[{ key: "title", label: "Task" }, { key: "type", label: "Type", render: (task) => words(task.type) }, { key: "priority", label: "Priority", render: (task) => <StatusBadge tone={task.priority === ACCOUNT_TASK_PRIORITIES.URGENT ? "danger" : "neutral"}>{words(task.priority)}</StatusBadge> }, { key: "dueAt", label: "Due", render: (task) => dateLabel(task.dueAt) }, { key: "status", label: "Status", render: (task) => words(task.status) }, { key: "actions", label: "Actions", render: (task) => <TaskActions task={task} /> }]} /></div></> : <EmptyState title="No tasks found" action={<PrimaryButton onClick={() => openTask()}>Create Task</PrimaryButton>}>Add a follow-up for setup, verification, security review, or another owner task.</EmptyState>}
      </section>
    );
  }

  function renderDialogs() {
    const activeProfiles = (snapshot.profiles || []).filter((row) => row.status !== "ARCHIVED");
    const activeDomains = (snapshot.emailDomains || []).filter((row) => row.status !== EMAIL_DOMAIN_STATUSES.ARCHIVED);
    const activeAliases = (snapshot.emailAliases || []).filter((row) => row.status !== EMAIL_ALIAS_STATUSES.ARCHIVED);
    const currentAccount = byId(snapshot.storeAccounts, editingId);
    const submitGroup = async () => {
      const payload = { displayName: form.displayName || "", description: form.description || "", status: "ACTIVE" };
      const result = await run(() => editingId ? service.updateProfileGroup(editingId, payload) : service.createProfileGroup(payload), editingId ? "Profile group updated." : "Profile group created.");
      if (result) closeDialog();
    };
    const submitProfile = async () => {
      const payload = { ...form, profileGroupId: form.profileGroupId || null, status: form.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE" };
      const result = await run(() => editingId ? service.updateProfile(editingId, payload) : service.createProfile(payload), editingId ? "Profile updated." : "Profile created.");
      if (result) closeDialog();
    };
    const submitDomain = async () => {
      const payload = { domain: form.domain || "", mode: form.mode || EMAIL_DOMAIN_MODES.LOCAL_METADATA_ONLY, providerId: form.providerId || "", notes: form.notes || "" };
      const result = await run(() => editingId ? service.updateEmailDomain(editingId, payload) : service.createEmailDomain(payload), editingId ? "Email domain updated." : "Email domain added.");
      if (result) closeDialog();
    };
    const makeAliasDraft = () => {
      try {
        setAliasDraft(service.generateAliasDraft({ ...form, profileId: form.profileId || null, retailerId: form.retailerId || null }));
        showMessage("Alias draft generated locally. It has not been saved or provisioned.");
      } catch (error) { showMessage(error?.message || "Alias could not be generated.", "error"); }
    };
    const saveAlias = async () => {
      if (!aliasDraft) return showMessage("Generate an alias before saving.", "warning");
      const result = await run(() => service.createEmailAlias(aliasDraft), "Alias metadata saved. Receiving mail is not yet confirmed.");
      if (result) closeDialog();
    };
    const submitAliasEdit = async () => {
      const result = await run(() => service.updateEmailAlias(editingId, { profileId: form.profileId || null, retailerId: form.retailerId || null, purpose: form.purpose || "", notes: form.notes || "" }), "Alias metadata updated.");
      if (result) closeDialog();
    };
    const submitRetailer = async () => {
      const payload = retailerDraft(form);
      const result = await run(() => editingId ? service.updateRetailer(editingId, payload) : service.createRetailer(payload), editingId ? "Retailer updated." : "Custom retailer added.");
      if (result) closeDialog();
    };
    const submitAccount = async () => {
      const existing = editingId ? byId(snapshot.storeAccounts, editingId) : null;
      const payload = { retailerId: form.retailerId || "", profileId: form.profileId || "", aliasId: form.aliasId || null, username: form.username || "", accountDisplayName: form.accountDisplayName || "", notes: form.notes || "", ...(editingId && form.status && form.status !== existing?.status ? { status: form.status } : {}) };
      const action = editingId
        ? () => service.updateStoreAccount(editingId, payload)
        : () => service.createStoreAccount({ ...payload, phoneVerificationRequired: form.phoneVerificationRequired === true, credentialReference: { provider: CREDENTIAL_REFERENCE_PROVIDERS.UNAVAILABLE, referenceId: null, label: "", lastUpdatedAt: null } });
      const result = await run(action, editingId ? "Store account updated." : "Store account prepared. Verification remains owner-controlled.");
      if (result) { closeDialog(); openSetup(result.record); }
    };
    const submitTask = async () => {
      const payload = { type: form.type || ACCOUNT_TASK_TYPES.CUSTOM, title: form.title || "", priority: form.priority || ACCOUNT_TASK_PRIORITIES.NORMAL, dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null, profileId: form.profileId || null, accountId: form.accountId || null, retailerId: form.retailerId || null, source: form.source || "OWNER", notes: form.notes || "" };
      const result = await run(() => editingId ? service.updateTask(editingId, payload) : service.createTask(payload), editingId ? "Task updated." : "Task created.");
      if (result) closeDialog();
    };
    const generatePassword = () => {
      try { setGeneratedPassword(service.generatePassword({ length: 20 })); showMessage("Password generated for this session only. It was not saved."); }
      catch (error) { showMessage(error?.message || "Password could not be generated.", "error"); }
    };
    const setupAction = async (method, messageText) => {
      const result = await run(() => service[method](editingId), messageText);
      if (result) setEditingId(result.record.id);
      return result;
    };
    const openSignup = async () => {
      const result = await setupAction("openStoreAccountSignup", "Signup page prepared. Code 3 did not submit a form.");
      if (result?.setupUrl) window.open(result.setupUrl, "_blank", "noopener,noreferrer");
    };
    const recordCredential = async () => {
      const credentialReference = { provider: form.credentialProvider, referenceId: form.credentialReferenceId || null, label: form.credentialLabel || "", lastUpdatedAt: new Date().toISOString() };
      await run(() => service.confirmCredentialStored(editingId, credentialReference), "Secure credential reference recorded. No password was stored.");
    };

    return <>
      <Dialog open={dialog === "group"} title={editingId ? "Edit profile group" : "Create profile group"} description="Groups are owner-defined labels, not authentication identities." onClose={closeDialog} actions={<><SecondaryButton onClick={closeDialog}>Cancel</SecondaryButton><PrimaryButton onClick={submitGroup} disabled={busy}>Save Group</PrimaryButton></>}><div className="account-ops-form"><Field label="Group name" value={form.displayName || ""} onChange={(event) => changeForm("displayName", event.target.value)} autoComplete="off" /><Field label="Description" wide><textarea value={form.description || ""} onChange={(event) => changeForm("description", event.target.value)} /></Field></div></Dialog>

      <Dialog open={dialog === "profile"} title={editingId ? "Edit profile" : "Create profile"} description="Reusable owner-managed metadata. This record never authorizes Code 3." onClose={closeDialog} actions={<><SecondaryButton onClick={closeDialog}>Cancel</SecondaryButton><PrimaryButton onClick={submitProfile} disabled={busy}>Save Profile</PrimaryButton></>}><div className="account-ops-form"><Field label="Display name" value={form.displayName || ""} onChange={(event) => changeForm("displayName", event.target.value)} /><Field label="Alias label" helper="Non-sensitive label used in alias templates." value={form.aliasLabel || ""} onChange={(event) => changeForm("aliasLabel", event.target.value)} /><SelectField label="Group" value={form.profileGroupId || ""} onChange={(value) => changeForm("profileGroupId", value)} options={[{ value: "", label: "No group" }, ...(snapshot.profileGroups || []).filter((row) => row.status !== "ARCHIVED").map((row) => ({ value: row.id, label: row.displayName }))]} /><Field label="Full name" value={form.fullName || ""} onChange={(event) => changeForm("fullName", event.target.value)} autoComplete="name" /><Field label="Business name" value={form.businessName || ""} onChange={(event) => changeForm("businessName", event.target.value)} /><Field label="Preferred email" value={form.emailPreference || ""} onChange={(event) => changeForm("emailPreference", event.target.value)} inputMode="email" /><Field label="Phone" value={form.phone || ""} onChange={(event) => changeForm("phone", event.target.value)} inputMode="tel" /><Field label="Shipping address" value={form.shippingAddress?.line1 || ""} onChange={(event) => changeAddress("shippingAddress", "line1", event.target.value)} autoComplete="shipping street-address" /><Field label="Shipping city" value={form.shippingAddress?.city || ""} onChange={(event) => changeAddress("shippingAddress", "city", event.target.value)} /><Field label="Shipping region" value={form.shippingAddress?.region || ""} onChange={(event) => changeAddress("shippingAddress", "region", event.target.value)} /><Field label="Shipping postal code" value={form.shippingAddress?.postalCode || ""} onChange={(event) => changeAddress("shippingAddress", "postalCode", event.target.value)} /><details className="account-ops-management account-ops-form-wide"><summary>Billing address</summary><div className="account-ops-form"><Field label="Billing address" value={form.billingAddress?.line1 || ""} onChange={(event) => changeAddress("billingAddress", "line1", event.target.value)} autoComplete="billing street-address" /><Field label="Billing city" value={form.billingAddress?.city || ""} onChange={(event) => changeAddress("billingAddress", "city", event.target.value)} /><Field label="Billing region" value={form.billingAddress?.region || ""} onChange={(event) => changeAddress("billingAddress", "region", event.target.value)} /><Field label="Billing postal code" value={form.billingAddress?.postalCode || ""} onChange={(event) => changeAddress("billingAddress", "postalCode", event.target.value)} /></div></details><Field label="Notes" wide><textarea value={form.notes || ""} onChange={(event) => changeForm("notes", event.target.value)} /></Field></div></Dialog>

      <Dialog open={dialog === "domain"} title={editingId ? "Edit email domain" : "Add email domain"} description="Register metadata only. Code 3 does not provision a domain or inbox in Phase 2A." onClose={closeDialog} actions={<><SecondaryButton onClick={closeDialog}>Cancel</SecondaryButton><PrimaryButton onClick={submitDomain} disabled={busy}>Save Domain</PrimaryButton></>}><div className="account-ops-form"><Field label="Domain" helper="Example: examplebusiness.com" value={form.domain || ""} onChange={(event) => changeForm("domain", event.target.value)} autoCapitalize="none" spellCheck="false" /><SelectField label="Mode" value={form.mode || EMAIL_DOMAIN_MODES.LOCAL_METADATA_ONLY} onChange={(value) => changeForm("mode", value)} options={[EMAIL_DOMAIN_MODES.LOCAL_METADATA_ONLY, EMAIL_DOMAIN_MODES.CATCH_ALL]} helper="Provider-managed provisioning is not configured." /><Field label="Provider label" value={form.providerId || ""} onChange={(event) => changeForm("providerId", event.target.value)} /><Field label="Notes" wide><textarea value={form.notes || ""} onChange={(event) => changeForm("notes", event.target.value)} /></Field></div></Dialog>

      <Dialog open={dialog === "alias-generator"} title="Generate email alias" description="Generation creates local metadata only. It does not provision an address or prove that mail is received." onClose={closeDialog} actions={<><SecondaryButton onClick={closeDialog}>Cancel</SecondaryButton>{aliasDraft ? <PrimaryButton onClick={saveAlias} disabled={busy}>Save Alias</PrimaryButton> : <PrimaryButton onClick={makeAliasDraft}>Generate</PrimaryButton>}</>}><div className="account-ops-form"><SelectField label="Profile" value={form.profileId || ""} onChange={(value) => { changeForm("profileId", value); setAliasDraft(null); }} options={[{ value: "", label: "No profile" }, ...activeProfiles.map((row) => ({ value: row.id, label: row.displayName }))]} /><SelectField label="Retailer" value={form.retailerId || ""} onChange={(value) => { changeForm("retailerId", value); setAliasDraft(null); }} options={[{ value: "", label: "No retailer" }, ...retailers.map((row) => ({ value: row.id, label: row.displayName }))]} /><SelectField label="Domain" value={form.domainId || ""} onChange={(value) => { changeForm("domainId", value); setAliasDraft(null); }} options={[{ value: "", label: "Choose domain" }, ...activeDomains.map((row) => ({ value: row.id, label: row.domain }))]} /><Field label="Template" helper="Supported: {store}, {profile}, {random}, {sequence}" value={form.template || ""} onChange={(event) => { changeForm("template", event.target.value); setAliasDraft(null); }} autoCapitalize="none" spellCheck="false" /><Field label="Purpose" wide value={form.purpose || ""} onChange={(event) => changeForm("purpose", event.target.value)} />{aliasDraft ? <div className="account-ops-generated"><strong className="account-ops-alias">{aliasDraft.aliasAddress}</strong><p>Generated locally — not provisioned and not yet confirmed to receive mail.</p><div className="account-ops-inline-actions"><SecondaryButton onClick={() => copyText(aliasDraft.aliasAddress, showMessage)}>Copy</SecondaryButton><QuietButton onClick={makeAliasDraft}>Regenerate</QuietButton></div></div> : null}</div></Dialog>

      <Dialog open={dialog === "alias-edit"} title="Edit alias metadata" description="The address and delivery state change only through explicit alias actions." onClose={closeDialog} actions={<><SecondaryButton onClick={closeDialog}>Cancel</SecondaryButton><PrimaryButton onClick={submitAliasEdit} disabled={busy}>Save Changes</PrimaryButton></>}><div className="account-ops-form"><SelectField label="Profile" value={form.profileId || ""} onChange={(value) => changeForm("profileId", value)} options={[{ value: "", label: "No profile" }, ...activeProfiles.map((row) => ({ value: row.id, label: row.displayName }))]} /><SelectField label="Retailer" value={form.retailerId || ""} onChange={(value) => changeForm("retailerId", value)} options={[{ value: "", label: "No retailer" }, ...retailers.map((row) => ({ value: row.id, label: row.displayName }))]} /><Field label="Purpose" value={form.purpose || ""} onChange={(event) => changeForm("purpose", event.target.value)} /><Field label="Notes" wide><textarea value={form.notes || ""} onChange={(event) => changeForm("notes", event.target.value)} /></Field></div></Dialog>

      <Dialog open={dialog === "retailer"} title={editingId ? "Edit retailer" : "Add custom retailer"} description="Retailer links support visible owner-assisted setup only. Automated provisioning is unavailable." onClose={closeDialog} actions={<><SecondaryButton onClick={closeDialog}>Cancel</SecondaryButton><PrimaryButton onClick={submitRetailer} disabled={busy}>Save Retailer</PrimaryButton></>}><div className="account-ops-form"><Field label="Display name" value={form.displayName || ""} onChange={(event) => changeForm("displayName", event.target.value)} /><Field label="Website" value={form.website || ""} onChange={(event) => changeForm("website", event.target.value)} inputMode="url" /><Field label="Signup URL" value={form.signupUrl || ""} onChange={(event) => changeForm("signupUrl", event.target.value)} inputMode="url" /><Field label="Account URL" value={form.accountUrl || ""} onChange={(event) => changeForm("accountUrl", event.target.value)} inputMode="url" /><Field label="Order history URL" value={form.orderHistoryUrl || ""} onChange={(event) => changeForm("orderHistoryUrl", event.target.value)} inputMode="url" /><Field label="Notes" wide><textarea value={form.notes || ""} onChange={(event) => changeForm("notes", event.target.value)} /></Field></div></Dialog>

      <Dialog open={dialog === "account"} title={editingId ? "Edit store account" : "Create store account"} description="Prepare one legitimate retailer account. Verification, CAPTCHA, OTP, and submission remain owner-controlled." onClose={closeDialog} actions={<><SecondaryButton onClick={closeDialog}>Cancel</SecondaryButton><PrimaryButton onClick={submitAccount} disabled={busy}>Save and Review Setup</PrimaryButton></>}><div className="account-ops-form"><SelectField label="Retailer" value={form.retailerId || ""} onChange={(value) => { changeForm("retailerId", value); if (form.aliasId && aliasMap.get(form.aliasId)?.retailerId && aliasMap.get(form.aliasId)?.retailerId !== value) changeForm("aliasId", ""); }} options={[{ value: "", label: "Choose retailer" }, ...retailers.map((row) => ({ value: row.id, label: row.displayName }))]} /><SelectField label="Profile" value={form.profileId || ""} onChange={(value) => { changeForm("profileId", value); if (form.aliasId && aliasMap.get(form.aliasId)?.profileId && aliasMap.get(form.aliasId)?.profileId !== value) changeForm("aliasId", ""); }} options={[{ value: "", label: "Choose profile" }, ...activeProfiles.map((row) => ({ value: row.id, label: row.displayName }))]} /><SelectField label="Email alias" value={form.aliasId || ""} onChange={(value) => changeForm("aliasId", value)} options={[{ value: "", label: "No alias" }, ...activeAliases.filter((row) => (!row.profileId || !form.profileId || row.profileId === form.profileId) && (!row.retailerId || !form.retailerId || row.retailerId === form.retailerId)).map((row) => ({ value: row.id, label: row.aliasAddress }))]} /><Field label="Username when different" value={form.username || ""} onChange={(event) => changeForm("username", event.target.value)} autoCapitalize="none" /><Field label="Account display name" value={form.accountDisplayName || ""} onChange={(event) => changeForm("accountDisplayName", event.target.value)} />{editingId ? <SelectField label="Account status" value={form.status || STORE_ACCOUNT_STATUSES.SETUP} onChange={(value) => changeForm("status", value)} options={[STORE_ACCOUNT_STATUSES.SETUP, STORE_ACCOUNT_STATUSES.NEEDS_VERIFICATION, STORE_ACCOUNT_STATUSES.NEEDS_ATTENTION, STORE_ACCOUNT_STATUSES.LOCKED, STORE_ACCOUNT_STATUSES.DISABLED, { value: STORE_ACCOUNT_STATUSES.READY, label: "Ready (use setup checklist)", disabled: form.status !== STORE_ACCOUNT_STATUSES.READY }]} helper="Ready and Archived require their explicit owner actions." /> : <Field label="Phone verification"><select value={form.phoneVerificationRequired ? "required" : "not-required"} onChange={(event) => changeForm("phoneVerificationRequired", event.target.value === "required")}><option value="not-required">Not known to be required</option><option value="required">Required</option></select></Field>}<Field label="Notes" wide><textarea value={form.notes || ""} onChange={(event) => changeForm("notes", event.target.value)} /></Field><div className="account-ops-generated"><strong>Optional ephemeral password</strong><p>Code 3 never saves generated passwords. Copy it to a secure password manager before closing this dialog.</p>{generatedPassword ? <><output className="account-ops-password" aria-label="Generated password">{generatedPassword}</output><div className="account-ops-inline-actions"><SecondaryButton onClick={() => copyText(generatedPassword, showMessage)}>Copy Password</SecondaryButton><QuietButton onClick={generatePassword}>Regenerate</QuietButton></div></> : <SecondaryButton onClick={generatePassword}>Generate Password</SecondaryButton>}</div></div></Dialog>

      <Dialog open={dialog === "task"} title={editingId ? "Edit task" : "Create task"} description="Account Ops tasks are manual local records in Phase 2A." onClose={closeDialog} actions={<><SecondaryButton onClick={closeDialog}>Cancel</SecondaryButton><PrimaryButton onClick={submitTask} disabled={busy}>Save Task</PrimaryButton></>}><div className="account-ops-form"><SelectField label="Type" value={form.type || ACCOUNT_TASK_TYPES.CUSTOM} onChange={(value) => changeForm("type", value)} options={Object.values(ACCOUNT_TASK_TYPES)} /><Field label="Title" value={form.title || ""} onChange={(event) => changeForm("title", event.target.value)} /><SelectField label="Priority" value={form.priority || ACCOUNT_TASK_PRIORITIES.NORMAL} onChange={(value) => changeForm("priority", value)} options={Object.values(ACCOUNT_TASK_PRIORITIES)} /><Field label="Due date" type="datetime-local" value={form.dueAt || ""} onChange={(event) => changeForm("dueAt", event.target.value)} /><SelectField label="Profile" value={form.profileId || ""} onChange={(value) => changeForm("profileId", value)} options={[{ value: "", label: "No profile" }, ...activeProfiles.map((row) => ({ value: row.id, label: row.displayName }))]} /><SelectField label="Store account" value={form.accountId || ""} onChange={(value) => { const account = byId(snapshot.storeAccounts, value); setForm((current) => ({ ...current, accountId: value, profileId: account?.profileId || current.profileId, retailerId: account?.retailerId || current.retailerId })); }} options={[{ value: "", label: "No account" }, ...(snapshot.storeAccounts || []).filter((row) => row.status !== STORE_ACCOUNT_STATUSES.ARCHIVED).map((row) => ({ value: row.id, label: `${retailerMap.get(row.retailerId)?.displayName || "Retailer"} — ${row.accountDisplayName || profileMap.get(row.profileId)?.displayName || "Account"}` }))]} /><Field label="Notes" wide><textarea value={form.notes || ""} onChange={(event) => changeForm("notes", event.target.value)} /></Field></div></Dialog>

      <Dialog open={dialog === "setup" && Boolean(currentAccount)} title="Assisted account setup" description="Code 3 prepares and tracks the checklist. You complete signup and every verification step." onClose={closeDialog} actions={<><SecondaryButton onClick={closeDialog}>Close</SecondaryButton>{currentAccount?.status !== STORE_ACCOUNT_STATUSES.READY ? <PrimaryButton onClick={() => setupAction("confirmStoreAccountReady", "Account marked Ready by the owner.")} disabled={busy}>Mark Ready</PrimaryButton> : null}</>}>
        {currentAccount ? <div className="account-ops-form-stack"><div className="account-ops-status-line"><StatusBadge tone={statusTone(currentAccount.status)}>{words(currentAccount.status)}</StatusBadge><span>{retailerMap.get(currentAccount.retailerId)?.displayName || "Retailer"} · {profileMap.get(currentAccount.profileId)?.displayName || "Profile"}</span></div><p className="account-ops-boundary">Code 3 never submits signup forms, bypasses CAPTCHA or OTP, or manufactures verification.</p><div className="account-ops-checklist"><label><input type="checkbox" checked={Boolean(currentAccount.aliasId)} readOnly />Email alias prepared</label><label><input type="checkbox" checked={currentAccount.setupStage !== ACCOUNT_SETUP_STAGES.PREPARED} onChange={() => { if (currentAccount.setupStage === ACCOUNT_SETUP_STAGES.PREPARED) openSignup(); }} />Retailer signup opened by owner</label><label><input type="checkbox" checked={currentAccount.emailVerificationStatus === VERIFICATION_STATES.VERIFIED} onChange={() => { if (currentAccount.emailVerificationStatus !== VERIFICATION_STATES.VERIFIED) setupAction("confirmAccountEmailVerified", "Email verification confirmed by the owner."); }} />Email verified by owner</label><label><input type="checkbox" checked={!currentAccount.phoneVerificationRequired || currentAccount.phoneVerificationStatus === VERIFICATION_STATES.VERIFIED} disabled={!currentAccount.phoneVerificationRequired} onChange={() => { if (currentAccount.phoneVerificationRequired && currentAccount.phoneVerificationStatus !== VERIFICATION_STATES.VERIFIED) setupAction("confirmAccountPhoneVerified", "Phone verification confirmed by the owner."); }} />Phone verified {currentAccount.phoneVerificationRequired ? "" : "(not required)"}</label><label><input type="checkbox" checked={Boolean(currentAccount.credentialReference?.provider && currentAccount.credentialReference.provider !== CREDENTIAL_REFERENCE_PROVIDERS.UNAVAILABLE)} readOnly />Credential stored in a secure provider</label><label><input type="checkbox" checked={currentAccount.securityStatus === "HEALTHY"} onChange={() => { if (currentAccount.securityStatus !== "HEALTHY") setupAction("confirmStoreAccountTested", "Account test confirmed by the owner."); }} />Account tested by owner</label><label><input type="checkbox" checked={currentAccount.status === STORE_ACCOUNT_STATUSES.READY} readOnly />Owner marked account Ready</label></div><div className="account-ops-inline-actions"><PrimaryButton onClick={openSignup}>Open Legitimate Signup Page</PrimaryButton><SecondaryButton onClick={() => run(() => service.generateAccountHealthTasks(currentAccount.id), "Missing follow-up tasks created.")}>Create Health Tasks</SecondaryButton></div><div className="account-ops-form"><SelectField label="Secure credential provider" value={form.credentialProvider || CREDENTIAL_REFERENCE_PROVIDERS.UNAVAILABLE} onChange={(value) => changeForm("credentialProvider", value)} options={Object.values(CREDENTIAL_REFERENCE_PROVIDERS)} /><Field label="Credential reference ID" helper="Reference metadata only — never the password." value={form.credentialReferenceId || ""} onChange={(event) => changeForm("credentialReferenceId", event.target.value)} /><Field label="Reference label" value={form.credentialLabel || ""} onChange={(event) => changeForm("credentialLabel", event.target.value)} /><div className="account-ops-form-actions"><SecondaryButton onClick={recordCredential} disabled={form.credentialProvider === CREDENTIAL_REFERENCE_PROVIDERS.UNAVAILABLE || !form.credentialReferenceId}>Record Secure Reference</SecondaryButton></div></div><div className="account-ops-generated"><strong>Ephemeral password helper</strong><p>Generated passwords are never persisted, logged, or included in backups. Save it directly in your secure password manager.</p>{generatedPassword ? <><output className="account-ops-password" aria-label="Generated password">{generatedPassword}</output><div className="account-ops-inline-actions"><SecondaryButton onClick={() => copyText(generatedPassword, showMessage)}>Copy Password</SecondaryButton><QuietButton onClick={generatePassword}>Regenerate</QuietButton></div></> : <SecondaryButton onClick={generatePassword}>Generate Password</SecondaryButton>}</div></div> : null}
      </Dialog>
    </>;
  }
}
