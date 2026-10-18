import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  RecordCard,
  SectionHeader,
  StatusBadge,
} from "../../components/operations/OperationsUI.jsx";
import { OperationsWorkspace } from "../../components/operations/OperationsWorkspace.jsx";
import { formatMoneyForDisplay } from "../intelligence/money.js";
import { OWNER_SESSION_STATES } from "../../services/ownerSession.js";
import {
  BOT_INTEGRATION_MODES,
  createBotOpsService,
  listBotProviders,
} from "./index.js";
import StellarTaskExportPreview from "./importPreview/StellarTaskExportPreview.jsx";
import BotProviderSetup from "./BotProviderSetup.jsx";
import BotTaskTracker from "./BotTaskTracker.jsx";
import BotTrackingOverview from "./BotTrackingOverview.jsx";
import BotTrackingActivity from "./BotTrackingActivity.jsx";
import { buildBotTracking, isArchived, providerLabel, retailerLabel } from "./tracking.js";
import "./bot-operations.css";

const SECTIONS = Object.freeze([
  { key: "overview", label: "Overview" },
  { key: "tasks", label: "Tasks" },
  { key: "bots", label: "Bots" },
  { key: "task-groups", label: "Task Groups" },
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

function Facts({ rows }) {
  return <dl className="bot-ops-facts">{rows.filter((row) => row.value !== null && row.value !== undefined && row.value !== "").map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>;
}

function WarningList({ warnings = [] }) {
  return warnings.length ? <ul className="bot-ops-warnings">{warnings.map((warning) => <li key={warning}>{words(warning)}</li>)}</ul> : null;
}

function TaskGroupsSection({ rows, installations }) {
  const installationById = new Map(installations.map((row) => [row.id, row]));
  return <section><SectionHeader eyebrow="Planning metadata" title="Task Groups" description="Groups are local plans only and cannot start a bot or submit a retailer action." />{rows.length ? <div className="bot-ops-grid">{rows.map((row) => <RecordCard key={row.id} className="bot-ops-record"><div className="bot-ops-card-heading"><h3>{row.name}</h3><StatusBadge tone={row.enabled ? "warning" : "neutral"}>{row.enabled ? "Locally enabled" : "Disabled"}</StatusBadge></div><Facts rows={[{ label: "Retailer", value: retailerLabel(row.retailerId) }, { label: "Provider", value: providerLabel(row.provider) }, { label: "Installation", value: installationById.get(row.installationId)?.friendlyName || "Not available" }, { label: "Category", value: row.productCategory || "Not recorded" }, { label: "Mode", value: words(row.taskMode) }, { label: "Quantity limit", value: row.quantityLimit }, { label: "Max price", value: row.maxPrice ? formatMoneyForDisplay(row.maxPrice) : "Not set" }]} /><WarningList warnings={row.warnings} /></RecordCard>)}</div> : <EmptyState title="No task groups">Add a manual plan in Tasks to organize a product and bot. Live task controls are unavailable.</EmptyState>}</section>;
}

function AccountsSection({ rows }) {
  return <section><SectionHeader eyebrow="Account Ops references" title="Accounts" description="Bot assignments reference Account Ops stable IDs. Passwords, cookies, OTPs, aliases, and retailer sessions are never copied here." />{rows.length ? <div className="bot-ops-grid">{rows.map((row) => <RecordCard key={row.id} className="bot-ops-record"><div className="bot-ops-card-heading"><h3>{row.accountLabel}</h3><StatusBadge tone={statusTone(row.status)}>{words(row.status)}</StatusBadge></div><Facts rows={[{ label: "Retailer", value: retailerLabel(row.retailerId) }, { label: "Account Ops account", value: row.accountOpsStoreAccountId }, { label: "Account Ops profile", value: row.accountOpsProfileId || "Not linked" }, { label: "Last activity", value: dateLabel(row.lastActivityAt) }]} /><WarningList warnings={row.warnings} /></RecordCard>)}</div> : <EmptyState title="No account assignments">No retailer-account references are assigned. Account credentials remain outside Bot Operations.</EmptyState>}</section>;
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

export default function BotOperationsPage(props) {
  const session = props.session;
  const lifetime = session?.status === OWNER_SESSION_STATES.AUTHORIZED
    ? JSON.stringify([session.provider || "", session.identityKey || session.userId || session.user?.id || session.displayIdentity || "owner"])
    : "restricted";
  return <BotOperationsPageContent key={lifetime} {...props} />;
}

function BotOperationsPageContent({
  session = { status: OWNER_SESSION_STATES.LOADING },
  initialSection = "overview",
  onSectionChange,
}) {
  const authorized = session.status === OWNER_SESSION_STATES.AUTHORIZED;
  const [service, setService] = useState(null);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [section, setSection] = useState(SECTIONS.some((item) => item.key === initialSection) ? initialSection : "overview");
  const [error, setError] = useState("");
  const operationLifetime = useRef(false);
  const [trackingRequest, setTrackingRequest] = useState({ nonce: 0 });
  const tracking = useMemo(() => buildBotTracking(snapshot), [snapshot]);

  useLayoutEffect(() => {
    operationLifetime.current = true;
    return () => { operationLifetime.current = false; };
  }, []);

  const [previousSection, setPreviousSection] = useState(initialSection);
  if (previousSection !== initialSection) {
    setPreviousSection(initialSection);
    setSection(SECTIONS.some((item) => item.key === initialSection) ? initialSection : "overview");
  }

  useEffect(() => {
    if (!authorized) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const nextService = createBotOpsService({ isOperationActive: () => !cancelled && operationLifetime.current });
        const nextSnapshot = await nextService.loadSnapshot();
        if (cancelled) return;
        setService(nextService);
        setSnapshot(nextSnapshot);
        setError("");
      } catch (nextError) {
        if (cancelled) return;
        setService(null);
        setSnapshot(EMPTY_SNAPSHOT);
        setError(nextError?.message || "Bot Operations local metadata could not be loaded.");
      }
    };
    load();
    const refreshFromOtherTab = (event) => {
      if (event.key !== "code3.bot-ops.v1") return;
      load();
    };
    window.addEventListener("storage", refreshFromOtherTab);
    return () => {
      window.removeEventListener("storage", refreshFromOtherTab);
      cancelled = true;
    };
  }, [authorized]);

  const providers = useMemo(() => listBotProviders(), []);
  const chooseSection = (nextSection) => {
    if (!SECTIONS.some((item) => item.key === nextSection)) return;
    setSection(nextSection);
    onSectionChange?.(nextSection);
  };

  const openTracker = (request = {}) => {
    setTrackingRequest((current) => ({ ...request, nonce: current.nonce + 1 }));
    chooseSection("tasks");
  };

  const savePlan = async (input, existing) => {
    if (!authorized || !service) throw new Error("Verified owner access is required to save bot plans.");
    const saved = existing
      ? await service.updateManualPlan(existing.id, input, existing.recordVersion)
      : await service.createManualPlan(input);
    if (!operationLifetime.current) return saved;
    try {
      setSnapshot(await service.loadSnapshot());
    } catch {
      const refreshError = new Error("The plan was saved, but the list could not refresh. Reload this page before editing it again.");
      refreshError.savedRecord = saved.task || saved;
      throw refreshError;
    }
    return saved;
  };

  const saveInstallation = async (input, existing) => {
    if (!authorized || !service) throw new Error("Verified owner access is required to save bot installations.");
    const fields = { friendlyName: input.friendlyName, runtimeLabel: input.runtimeLabel, version: input.version };
    const saved = existing
      ? await service.updateRecord("installations", existing.id, fields, existing.recordVersion)
      : await service.createInstallation({ ...fields, provider: input.provider, connectionMode: BOT_INTEGRATION_MODES.MANUAL_RECORD, enabled: false, healthState: "DISCONNECTED" });
    if (!operationLifetime.current) return saved;
    try {
      setSnapshot(await service.loadSnapshot());
    } catch {
      const refreshError = new Error("The installation was saved, but the list could not refresh. Reload this page to see the saved record.");
      refreshError.savedRecord = saved;
      throw refreshError;
    }
    return saved;
  };

  if (!authorized || !service) return error ? <ErrorState title="Bot Operations unavailable">{error}</ErrorState> : <EmptyState title="Checking owner access">Bot Operations storage remains closed until the verified owner session is ready.</EmptyState>;
  const counts = { tasks: tracking.tasks.filter((row) => !isArchived(row.task)).length, bots: tracking.installations.length, "task-groups": snapshot.taskGroups.filter((row) => !isArchived(row)).length, accounts: snapshot.retailerAccountLinks.length, profiles: snapshot.botProfiles.length, proxies: snapshot.proxyGroups.length, targets: snapshot.productTargets.length };

  return (
    <div className="bot-ops" data-testid="bot-operations" data-persistence-mode={service.mode}>
      <PageHeader eyebrow="Owner-only workspace" title="Bot Operations" description="Track products, plans, and progress across your bots. Live integrations are not connected." />
      <OperationsWorkspace label="Bot Operations" navigation={SECTIONS.map((item) => ({ ...item, count: counts[item.key] }))} activeKey={section} onNavigate={chooseSection} className="bot-ops-workspace" sidebarFooter={<p className="bot-ops-rail-note">Local tracking<br />No live bot connection</p>}>
      {section === "overview" ? <BotTrackingOverview tracking={tracking} onOpen={chooseSection} onTrack={openTracker} /> : null}
      {section === "bots" ? <BotProviderSetup providers={providers} installations={snapshot.installations} onSave={saveInstallation} onTrack={openTracker} /> : null}
      {section === "task-groups" ? <TaskGroupsSection rows={snapshot.taskGroups.filter((row) => !isArchived(row))} installations={snapshot.installations} /> : null}
      {section === "tasks" ? <><BotTaskTracker key={trackingRequest.nonce} snapshot={snapshot} initialInstallationId={trackingRequest.installationId || ""} initialGroupId={trackingRequest.groupId || ""} initialTaskId={trackingRequest.taskId || ""} initialCreate={Boolean(trackingRequest.create)} initialAttentionOnly={Boolean(trackingRequest.attentionOnly)} onSavePlan={savePlan} onOpenBots={() => chooseSection("bots")} /><details className="bot-ops-import-preview"><summary>Preview a Stellar task export</summary><StellarTaskExportPreview /></details></> : null}
      {section === "accounts" ? <AccountsSection rows={snapshot.retailerAccountLinks} /> : null}
      {section === "profiles" ? <ProfilesSection rows={snapshot.botProfiles} /> : null}
      {section === "proxies" ? <ProxiesSection rows={snapshot.proxyGroups} /> : null}
      {section === "targets" ? <TargetsSection rows={snapshot.productTargets} /> : null}
      {section === "activity" ? <BotTrackingActivity snapshot={snapshot} tracking={tracking} /> : null}
      </OperationsWorkspace>
    </div>
  );
}
