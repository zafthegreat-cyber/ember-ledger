import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  ErrorState,
  MetricCard,
  PageHeader,
  RecordCard,
  SectionHeader,
  StatusBadge,
} from "../../components/operations/OperationsUI.jsx";
import { formatMoneyForDisplay } from "../intelligence/money.js";
import { OWNER_SESSION_STATES } from "../../services/ownerSession.js";
import {
  BOT_EVIDENCE_REVIEW_STATES,
  BOT_PROVIDER_CONNECTION_STATUS,
  BOT_TASK_STATUSES,
  createBotOpsService,
  getBotProviderDiscovery,
  listBotProviders,
} from "./index.js";
import "./bot-operations.css";

const SECTIONS = Object.freeze([
  { key: "overview", label: "Overview" },
  { key: "bots", label: "Bots" },
  { key: "task-groups", label: "Task Groups" },
  { key: "tasks", label: "Tasks" },
  { key: "accounts", label: "Accounts" },
  { key: "profiles", label: "Profiles" },
  { key: "proxies", label: "Proxies" },
  { key: "targets", label: "Targets" },
  { key: "activity", label: "Activity" },
]);

const EMPTY_SNAPSHOT = Object.freeze({
  schemaVersion: 1,
  updatedAt: "",
  installations: [],
  retailerAccountLinks: [],
  botProfiles: [],
  proxyGroups: [],
  productTargets: [],
  taskGroups: [],
  tasks: [],
  attempts: [],
  checkoutEvidence: [],
  activity: [],
});

function words(value) {
  return String(value || "Unknown").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function dateLabel(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function statusTone(value) {
  const normalized = String(value || "").toUpperCase();
  if (/HEALTHY|SUCCESS|CONFIRMED|READY/.test(normalized)) return "success";
  if (/ERROR|FAILED|BLOCK|PAYMENT|PROXY|ACCOUNT|REJECTED/.test(normalized)) return "danger";
  if (/DEGRADED|WAITING|MONITORING|CARTED|ATTEMPT|REVIEW|LIMITED/.test(normalized)) return "warning";
  return "neutral";
}

function BotOpsTabs({ active, onChange }) {
  const primary = SECTIONS.slice(0, 3);
  const secondary = SECTIONS.slice(3);
  const choose = (key, event) => {
    const disclosure = event.currentTarget.closest(".bot-ops-tabs")?.querySelector("details");
    if (disclosure) disclosure.open = false;
    onChange(key);
  };
  return (
    <nav className="bot-ops-tabs" aria-label="Bot Operations sections">
      {primary.map((item) => (
        <button key={item.key} type="button" className={active === item.key ? "is-active" : ""} aria-current={active === item.key ? "page" : undefined} onClick={(event) => choose(item.key, event)}>{item.label}</button>
      ))}
      <details className="bot-ops-tabs-more">
        <summary>More</summary>
        <div>{secondary.map((item) => <button key={item.key} type="button" className={active === item.key ? "is-active" : ""} aria-current={active === item.key ? "page" : undefined} onClick={(event) => choose(item.key, event)}>{item.label}</button>)}</div>
      </details>
    </nav>
  );
}

function Facts({ rows }) {
  return <dl className="bot-ops-facts">{rows.filter((row) => row.value !== null && row.value !== undefined && row.value !== "").map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>;
}

function WarningList({ warnings = [] }) {
  return warnings.length ? <ul className="bot-ops-warnings">{warnings.map((warning) => <li key={warning}>{words(warning)}</li>)}</ul> : null;
}

function ProviderCard({ provider }) {
  const status = provider.connectionStatus || provider.status || BOT_PROVIDER_CONNECTION_STATUS.NOT_CONFIGURED;
  const capabilityEntries = Object.entries(provider.capabilities || {});
  const discovery = getBotProviderDiscovery(provider.key || provider.providerKey);
  return (
    <RecordCard className="bot-ops-record">
      <div className="bot-ops-card-heading"><div><p className="eyebrow">Provider metadata</p><h3>{provider.displayName}</h3></div><StatusBadge tone={statusTone(status)}>{words(status)}</StatusBadge></div>
      <p>{provider.description || "Provider-neutral metadata is available. No live adapter is connected."}</p>
      <Facts rows={[
        { label: "Runtime", value: "Disconnected / unavailable" },
        { label: "Integration modes", value: (provider.supportedIntegrationModes || provider.integrationModes || []).map(words).join(", ") || "Not configured" },
        { label: "Provider network", value: "Disabled" },
      ]} />
      {discovery ? (
        <details className="bot-ops-discovery">
          <summary>Integration discovery</summary>
          <p className="bot-ops-discovery-note">Research evidence only · Not provider access or approval</p>
          <Facts rows={[
            { label: "Official API", value: words(discovery.officialApiStatus) },
            { label: "Webhook", value: words(discovery.webhookStatus) },
            { label: "Export", value: words(discovery.exportStatus) },
            { label: "Local interface", value: words(discovery.localInterfaceStatus) },
            { label: "Pilot readiness", value: words(discovery.pilotReadiness) },
            { label: "Live capabilities", value: discovery.liveCapabilitiesEnabled ? "Enabled" : "Disabled" },
          ]} />
          <p>{discovery.provider === "STELLAR"
            ? "A sanitized, owner-selected task export is an offline review candidate only. It cannot report live status or control Stellar."
            : "No supported read/status pilot path was established from the reviewed public evidence."}</p>
        </details>
      ) : null}
      <details><summary>Capability truth</summary><ul className="bot-ops-capability-list">{capabilityEntries.length ? capabilityEntries.map(([key, enabled]) => <li key={key}><span>{words(key)}</span><strong>{enabled ? "Available" : "Unavailable"}</strong></li>) : <li><span>Live capabilities</span><strong>Unavailable</strong></li>}</ul></details>
    </RecordCard>
  );
}

function Overview({ snapshot, providers, onOpen }) {
  const running = snapshot.tasks.filter((task) => task.runtimeStatus === BOT_TASK_STATUSES.RUNNING).length;
  const successes = snapshot.attempts.filter((attempt) => attempt.runtimeStatus === BOT_TASK_STATUSES.SUCCESS || attempt.success === true).length;
  const failures = snapshot.attempts.filter((attempt) => attempt.success === false && attempt.failureCategory && attempt.failureCategory !== "NONE").length;
  const review = snapshot.checkoutEvidence.filter((evidence) => [BOT_EVIDENCE_REVIEW_STATES.NEW, BOT_EVIDENCE_REVIEW_STATES.NEEDS_REVIEW].includes(evidence.reviewState)).length;
  return (
    <>
      <section className="bot-ops-runtime-status" aria-label="Bot Operations safety state">
        <StatusBadge tone="neutral">Owner only</StatusBadge>
        <div><h2>No bot integrations are connected</h2><p>This local foundation cannot start tasks, automate checkout, bypass retailer controls, or create Purchases or inventory.</p></div>
      </section>
      <div className="bot-ops-metrics" aria-label="Bot Operations summary">
        <MetricCard label="Providers configured" value={providers.filter((provider) => (provider.connectionStatus || provider.status) !== BOT_PROVIDER_CONNECTION_STATUS.NOT_CONFIGURED).length} helper="Live providers remain unavailable" />
        <MetricCard label="Installation records" value={snapshot.installations.length} helper="Local metadata only" />
        <MetricCard label="Running tasks" value={running} helper="No task-control adapter exists" />
        <MetricCard label="Checkout evidence" value={snapshot.checkoutEvidence.length} helper={`${review} require owner review`} />
        <MetricCard label="Synthetic successes" value={successes} helper="Evidence is not a Purchase" />
        <MetricCard label="Recorded failures" value={failures} helper="Sanitized summaries only" />
      </div>
      <section className="bot-ops-overview-grid">
        <RecordCard><SectionHeader eyebrow="Provider truth" title="Hayha and Stellar" description="Both definitions remain not configured with every live capability disabled." /><button type="button" onClick={() => onOpen("bots")}>Review provider metadata</button></RecordCard>
        <RecordCard><SectionHeader eyebrow="Purchase boundary" title="Evidence requires review" description="Bot Success and Checkout Evidence never create a Purchase, receiving record, or inventory item." /><button type="button" onClick={() => onOpen("activity")}>Review local evidence</button></RecordCard>
      </section>
    </>
  );
}

function BotsSection({ providers, installations }) {
  return <section><SectionHeader eyebrow="Provider-neutral foundation" title="Bots" description="Definitions and public-source integration research only. No provider SDK, credentials, device connection, or network control is active." /><div className="bot-ops-grid">{providers.map((provider) => <ProviderCard key={provider.key || provider.providerKey} provider={provider} />)}</div><SectionHeader eyebrow="Local records" title="Installations" description="Installation records never contain device fingerprints or credentials." />{installations.length ? <div className="bot-ops-grid">{installations.map((row) => <RecordCard key={row.id} className="bot-ops-record"><div className="bot-ops-card-heading"><h3>{row.friendlyName}</h3><StatusBadge tone={statusTone(row.healthState)}>{words(row.healthState)}</StatusBadge></div><Facts rows={[{ label: "Provider", value: words(row.provider) }, { label: "Runtime label", value: row.runtimeLabel || "Not recorded" }, { label: "Connection", value: words(row.connectionMode) }, { label: "Last seen", value: dateLabel(row.lastSeenAt) }]} /><WarningList warnings={row.warnings} /></RecordCard>)}</div> : <EmptyState title="No installation records">Additions remain unavailable until a separately approved integration phase. Hayha and Stellar are not connected.</EmptyState>}</section>;
}

function TaskGroupsSection({ rows }) {
  return <section><SectionHeader eyebrow="Planning metadata" title="Task Groups" description="Groups are local plans only and cannot start a bot or submit a retailer action." />{rows.length ? <div className="bot-ops-grid">{rows.map((row) => <RecordCard key={row.id} className="bot-ops-record"><div className="bot-ops-card-heading"><h3>{row.name}</h3><StatusBadge tone={row.enabled ? "warning" : "neutral"}>{row.enabled ? "Locally enabled" : "Disabled"}</StatusBadge></div><Facts rows={[{ label: "Retailer", value: row.retailerId }, { label: "Provider", value: words(row.provider) }, { label: "Category", value: row.productCategory || "Not recorded" }, { label: "Mode", value: words(row.taskMode) }, { label: "Quantity limit", value: row.quantityLimit }, { label: "Max price", value: row.maxPrice ? formatMoneyForDisplay(row.maxPrice) : "Not set" }]} /><WarningList warnings={row.warnings} /></RecordCard>)}</div> : <EmptyState title="No task groups">No task groups have been saved. This phase does not create or start live bot tasks.</EmptyState>}</section>;
}

function TasksSection({ rows, targets }) {
  const targetById = new Map(targets.map((target) => [target.id, target]));
  return <section><SectionHeader eyebrow="Normalized status" title="Tasks" description="Statuses are local observations or synthetic QA evidence. No start, stop, restart, cart, or checkout action is connected." />{rows.length ? <div className="bot-ops-grid">{rows.map((row) => <RecordCard key={row.id} className="bot-ops-record"><div className="bot-ops-card-heading"><div><p className="eyebrow">{words(row.provider)}</p><h3>{targetById.get(row.productTargetId)?.title || row.productTargetId}</h3></div><StatusBadge tone={statusTone(row.runtimeStatus)}>{words(row.runtimeStatus)}</StatusBadge></div><Facts rows={[{ label: "Retailer", value: row.retailerId }, { label: "Quantity", value: row.quantityTarget }, { label: "Max price", value: row.maxPrice ? formatMoneyForDisplay(row.maxPrice) : "Not set" }, { label: "Last attempt", value: dateLabel(row.lastAttemptAt) }]} /><WarningList warnings={row.warnings} /></RecordCard>)}</div> : <EmptyState title="No tasks">No live or local task records exist. Provider task control is unavailable.</EmptyState>}</section>;
}

function AccountsSection({ rows }) {
  return <section><SectionHeader eyebrow="Account Ops references" title="Accounts" description="Bot assignments reference Account Ops stable IDs. Passwords, cookies, OTPs, aliases, and retailer sessions are never copied here." />{rows.length ? <div className="bot-ops-grid">{rows.map((row) => <RecordCard key={row.id} className="bot-ops-record"><div className="bot-ops-card-heading"><h3>{row.accountLabel}</h3><StatusBadge tone={statusTone(row.status)}>{words(row.status)}</StatusBadge></div><Facts rows={[{ label: "Retailer", value: row.retailerId }, { label: "Account Ops account", value: row.accountOpsStoreAccountId }, { label: "Account Ops profile", value: row.accountOpsProfileId || "Not linked" }, { label: "Last activity", value: dateLabel(row.lastActivityAt) }]} /><WarningList warnings={row.warnings} /></RecordCard>)}</div> : <EmptyState title="No account assignments">No retailer-account references are assigned. Account credentials remain outside Bot Operations.</EmptyState>}</section>;
}

function ProfilesSection({ rows }) {
  return <section><SectionHeader eyebrow="Non-secret references" title="Profiles" description="Checkout-profile metadata references Account Ops records and never stores payment-card data." />{rows.length ? <div className="bot-ops-grid">{rows.map((row) => <RecordCard key={row.id} className="bot-ops-record"><div className="bot-ops-card-heading"><h3>{row.displayName}</h3><StatusBadge tone={statusTone(row.status)}>{words(row.status)}</StatusBadge></div><Facts rows={[{ label: "Account Ops profile", value: row.accountOpsProfileId }, { label: "Retailer compatibility", value: row.retailerCompatibility?.join(", ") || "Not recorded" }, { label: "Installations", value: row.installationIds?.length || 0 }]} /></RecordCard>)}</div> : <EmptyState title="No bot profiles">No profile references exist. Raw billing or payment credentials are prohibited.</EmptyState>}</section>;
}

function ProxiesSection({ rows }) {
  return <section><SectionHeader eyebrow="Metadata only" title="Proxies" description="Only group-level health and assignment metadata is allowed. Proxy IPs, usernames, passwords, and authorization URLs are prohibited." />{rows.length ? <div className="bot-ops-grid">{rows.map((row) => <RecordCard key={row.id} className="bot-ops-record"><div className="bot-ops-card-heading"><h3>{row.displayName}</h3><StatusBadge tone={statusTone(row.healthState)}>{words(row.healthState)}</StatusBadge></div><Facts rows={[{ label: "Type", value: words(row.proxyType) }, { label: "Region", value: row.region || "Not recorded" }, { label: "Metadata count", value: row.proxyCount }, { label: "Last checked", value: dateLabel(row.lastCheckedAt) }]} /><WarningList warnings={row.warnings} /></RecordCard>)}</div> : <EmptyState title="No proxy metadata">No proxy groups are recorded, and no proxy provider is connected.</EmptyState>}</section>;
}

function TargetsSection({ rows }) {
  return <section><SectionHeader eyebrow="Shared product intent" title="Product Targets" description="Targets reuse retailer and product identifiers without duplicating catalog or Purchase records." />{rows.length ? <div className="bot-ops-grid">{rows.map((row) => <RecordCard key={row.id} className="bot-ops-record"><div className="bot-ops-card-heading"><div><p className="eyebrow">{row.retailerId}</p><h3>{row.title}</h3></div><StatusBadge tone={statusTone(row.reviewState)}>{words(row.reviewState)}</StatusBadge></div><Facts rows={[{ label: "SKU", value: row.sku || row.tcin || row.upc || row.canonicalProductId }, { label: "Max price", value: row.maxPrice ? formatMoneyForDisplay(row.maxPrice) : "Not set" }, { label: "Quantity limit", value: row.quantityLimit }, { label: "Availability", value: words(row.availabilityMode) }]} /></RecordCard>)}</div> : <EmptyState title="No product targets">No targets have been recorded. Existing retailer/catalog identifiers remain the future source of truth.</EmptyState>}</section>;
}

function ActivitySection({ snapshot }) {
  const rows = [...snapshot.attempts].sort((left, right) => String(right.occurredAt || right.createdAt).localeCompare(String(left.occurredAt || left.createdAt)));
  return <section><SectionHeader eyebrow="Append-only history" title="Activity" description="Only bounded normalized events are retained. Raw provider logs, request bodies, cookies, and tokens are prohibited." />{rows.length ? <div className="bot-ops-activity-list">{rows.map((row) => <RecordCard key={row.id} className="bot-ops-record"><div className="bot-ops-card-heading"><div><p className="eyebrow">{dateLabel(row.occurredAt)}</p><h3>{words(row.normalizedEvent)}</h3></div><StatusBadge tone={statusTone(row.runtimeStatus)}>{words(row.runtimeStatus)}</StatusBadge></div><p>{row.message || "No additional safe summary was retained."}</p><Facts rows={[{ label: "Provider", value: words(row.provider) }, { label: "Task", value: row.taskId }, { label: "Revision", value: row.eventRevision }]} /><WarningList warnings={row.warnings} /></RecordCard>)}</div> : <EmptyState title="No activity">No bot attempts have been observed. Normal runtime does not seed synthetic history.</EmptyState>}{snapshot.checkoutEvidence.length ? <div className="bot-ops-evidence"><SectionHeader eyebrow="Owner review required" title="Checkout Evidence" description="Evidence is not a Purchase and cannot mutate receiving or inventory." />{snapshot.checkoutEvidence.map((row) => <RecordCard key={row.id} className="bot-ops-record"><div className="bot-ops-card-heading"><h3>{row.externalOrderReference || "Checkout evidence"}</h3><StatusBadge tone={statusTone(row.reviewState)}>{words(row.reviewState)}</StatusBadge></div><Facts rows={[{ label: "Retailer", value: row.retailerId }, { label: "Quantity", value: row.quantity }, { label: "Expected amount", value: row.expectedAmount ? formatMoneyForDisplay(row.expectedAmount) : "Not supplied" }, { label: "Occurred", value: dateLabel(row.occurredAt) }]} /><p className="bot-ops-invariant">Owner review required · Purchase not created · Inventory not created</p><WarningList warnings={row.warnings} /></RecordCard>)}</div> : null}</section>;
}

export default function BotOperationsPage({
  session = { status: OWNER_SESSION_STATES.LOADING },
  initialSection = "overview",
  onSectionChange,
}) {
  const authorized = session.status === OWNER_SESSION_STATES.AUTHORIZED;
  const [service, setService] = useState(null);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [section, setSection] = useState(SECTIONS.some((item) => item.key === initialSection) ? initialSection : "overview");
  const [error, setError] = useState("");

  useEffect(() => {
    setSection(SECTIONS.some((item) => item.key === initialSection) ? initialSection : "overview");
  }, [initialSection]);

  useEffect(() => {
    if (!authorized) {
      setService(null);
      setSnapshot(EMPTY_SNAPSHOT);
      setError("");
      return undefined;
    }
    let cancelled = false;
    setService(null);
    setError("");
    const load = async () => {
      try {
        const nextService = createBotOpsService();
        const nextSnapshot = await nextService.loadSnapshot();
        if (cancelled) return;
        setService(nextService);
        setSnapshot(nextSnapshot);
      } catch (nextError) {
        if (cancelled) return;
        setService(null);
        setSnapshot(EMPTY_SNAPSHOT);
        setError(nextError?.message || "Bot Operations local metadata could not be loaded.");
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [authorized]);

  const providers = useMemo(() => listBotProviders(), []);
  const chooseSection = (nextSection) => {
    if (!SECTIONS.some((item) => item.key === nextSection)) return;
    setSection(nextSection);
    onSectionChange?.(nextSection);
  };

  if (!authorized || !service) return error ? <ErrorState title="Bot Operations unavailable">{error}</ErrorState> : <EmptyState title="Checking owner access">Bot Operations storage remains closed until the verified owner session is ready.</EmptyState>;

  return (
    <div className="bot-ops" data-testid="bot-operations" data-persistence-mode={service.mode}>
      <PageHeader eyebrow="Owner-only workspace" title="Bot Operations" description="Provider-neutral local planning, normalized evidence, and review boundaries. No live bot, proxy, retailer, or checkout connection is active." />
      <BotOpsTabs active={section} onChange={chooseSection} />
      {section === "overview" ? <Overview snapshot={snapshot} providers={providers} onOpen={chooseSection} /> : null}
      {section === "bots" ? <BotsSection providers={providers} installations={snapshot.installations} /> : null}
      {section === "task-groups" ? <TaskGroupsSection rows={snapshot.taskGroups} /> : null}
      {section === "tasks" ? <TasksSection rows={snapshot.tasks} targets={snapshot.productTargets} /> : null}
      {section === "accounts" ? <AccountsSection rows={snapshot.retailerAccountLinks} /> : null}
      {section === "profiles" ? <ProfilesSection rows={snapshot.botProfiles} /> : null}
      {section === "proxies" ? <ProxiesSection rows={snapshot.proxyGroups} /> : null}
      {section === "targets" ? <TargetsSection rows={snapshot.productTargets} /> : null}
      {section === "activity" ? <ActivitySection snapshot={snapshot} /> : null}
    </div>
  );
}
