import { useMemo, useState } from "react";
import {
  EmptyState,
  MetricCard,
  PrimaryButton,
  QuietButton,
  RecordCard,
  SearchField,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from "../../../components/operations/OperationsUI.jsx";
import {
  VERIFICATION_ACTION_KINDS,
  createAccountOpsOperationsViewModel,
} from "./index.js";
import "./account-ops-operations.css";
import OrderExample from "./OrderExample.jsx";
import { accountOpsStatusTone as tone } from "./presentation.js";

function words(value) {
  return String(value || "Not recorded").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function dateLabel(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

function moneyLabel(value, currency = "USD") {
  if (!Number.isSafeInteger(value)) return "Not estimated";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value / 100);
}

function Facts({ rows }) {
  return <dl className="account-ops-operations-facts">{rows.filter((row) => row.value !== null && row.value !== undefined && row.value !== "").map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>;
}

function Boundary({ children }) {
  return <details className="account-ops-help"><summary>How this workspace works</summary><p className="account-ops-operations-boundary">{children}</p></details>;
}

function RecordList({ children, label }) {
  return <section className="account-ops-operations-list" aria-label={label}>{children}</section>;
}

function AttentionList({ rows, onNavigate }) {
  if (!rows.length) return <EmptyState title="Nothing needs attention">The local metadata currently has no derived action items.</EmptyState>;
  return <RecordList label="Account Ops attention items">{rows.map((row) => <button type="button" className="account-ops-operations-attention" key={row.id} onClick={() => onNavigate?.(row.area)}><span><strong>{row.title}</strong><small>{row.detail}</small></span><StatusBadge tone={tone(row.priority)}>{words(row.priority)}</StatusBadge></button>)}</RecordList>;
}

function recordName(rows, id, fallback = "Not assigned") {
  if (!id) return fallback;
  const record = (rows || []).find((item) => item.id === id);
  return record?.displayName || record?.aliasAddress || record?.accountDisplayName || record?.label || "Unavailable reference";
}

function retailerName(view, id) { return recordName(view.retailers, id, "No retailer assigned"); }

function Overview({ view, onNavigate }) {
  return <div className="account-ops-operations-stack">
    <SectionHeader eyebrow="YOUR WORKSPACE" title="Operations overview" description="Your accounts, open actions, and order activity at a glance." actions={<StatusBadge tone="warning">No Live Connections</StatusBadge>} />
    <div className="account-ops-operations-metrics">
      <MetricCard label="Accounts" value={view.summary.accounts} helper={`${view.summary.healthyAccounts} healthy`} />
      <MetricCard label="Needs attention" value={view.summary.attentionItems} helper="Owner review queue" tone={view.summary.attentionItems ? "warning" : "success"} />
      <MetricCard label="Verification" value={view.summary.verificationActions} helper="Human actions only" />
      <MetricCard label="Orders" value={view.summary.orderRelationships} helper="Linked orders" />
    </div>
    <Boundary>Account Ops organizes safe metadata. It does not create retailer accounts, solve verification challenges, connect providers, send exports, provision servers, or authorize purchases.</Boundary>
    <section className="account-ops-operations-stack"><SectionHeader title="What needs me?" description="Review these items when you are ready." /><AttentionList rows={view.attention.slice(0, 8)} onNavigate={onNavigate} /></section>
    <section className="account-ops-operations-stack" aria-label="Account Ops operating map">
      <SectionHeader title="Your workspace" description="Everything you need, organized by task." />
      <div className="account-ops-operations-map">{view.areas.filter((item) => ["accounts", "identity", "verification", "orders"].includes(item.key)).map((item) => <button type="button" key={item.key} onClick={() => onNavigate?.(item.key)}><strong>{item.label}<span aria-hidden="true" className="account-ops-card-arrow">↗</span></strong><span>{item.description}</span></button>)}</div>
    </section>
  </div>;
}

function Accounts({ view, onRequestAccountDraft, onShowAccounts }) {
  return <div className="account-ops-operations-stack">
    <SectionHeader eyebrow="Accounts" title="Account Creation Assistant" description="Prepare a legitimate local account plan; the owner completes signup, terms, CAPTCHA, MFA, email, and SMS steps." actions={<PrimaryButton onClick={onRequestAccountDraft}>Create Account Draft</PrimaryButton>} />
    <Boundary>A draft is organizational metadata only. No signup form is submitted and no retailer account is created by Code 3.</Boundary>
    {view.accountCreationPlans.length ? <RecordList label="Account creation plans">{view.accountCreationPlans.map((plan) => <RecordCard key={plan.id} className="account-ops-operations-card"><header><div><h3>{plan.accountLabel}</h3><p>{retailerName(view, plan.retailerId)}</p></div><StatusBadge tone={tone(plan.creationState)}>{words(plan.creationState)}</StatusBadge></header><Facts rows={[{ label: "Email reference", value: recordName(view.accountOps.emailAliases, plan.emailReference) }, { label: "Phone reference", value: recordName(view.operations.phoneResources, plan.phoneReference) }, { label: "Shipping profile", value: recordName(view.accountOps.profiles, plan.shippingProfileId) }, { label: "Verification", value: plan.verificationRequirements.length ? plan.verificationRequirements.map(words).join(", ") : "No pending requirement recorded" }]} /></RecordCard>)}</RecordList> : <EmptyState title="No account drafts">Create a local metadata draft when you are ready to organize an owner-led signup.</EmptyState>}
    <SectionHeader title="Account Health Center" description="Owner-recorded status only. Code 3 does not contact retailers to check account health." actions={<SecondaryButton onClick={() => { if (onShowAccounts) { onShowAccounts(); return; } const list = document.getElementById("account-ops-store-accounts"); list?.focus({ preventScroll: true }); list?.scrollIntoView({ block: "start", behavior: "instant" }); }}>All Accounts</SecondaryButton>} />
    {view.accountHealth.length ? <RecordList label="Account health records">{view.accountHealth.map((health) => <RecordCard key={health.id} className="account-ops-operations-card"><header><div><h3>{health.accountLabel}</h3><p>{health.profileLabel}</p></div><StatusBadge tone={tone(health.state)}>{words(health.state)}</StatusBadge></header><Facts rows={[{ label: "Email", value: words(health.emailState) }, { label: "Phone", value: words(health.phoneState) }, { label: "Last owner check", value: dateLabel(health.lastSuccessfulCheckAt) }]} />{health.warnings.length ? <ul className="account-ops-operations-warnings">{health.warnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}</RecordCard>)}</RecordList> : <EmptyState title="No account health records">Account health appears after safe retailer account metadata exists.</EmptyState>}
    <SectionHeader title="Duplicate protection" description="Warnings prevent accidental duplicate organization; they never help evade retailer account limits." />
    {view.duplicateWarnings.length ? <ul className="account-ops-operations-warnings">{view.duplicateWarnings.map((warning) => <li key={warning.id}>{warning.message} ({warning.accountIds.length} records)</li>)}</ul> : <p className="account-ops-operations-quiet">No duplicate metadata conflicts detected.</p>}
  </div>;
}

function Identity({ view, onNavigate }) {
  const { profiles = [], emailAliases = [] } = view.accountOps;
  const phones = view.operations.phoneResources;
  return <div className="account-ops-operations-stack">
    <SectionHeader eyebrow="Identity" title="Profiles, aliases, and phone resources" description="Reusable owner-controlled references for legitimate retailer workflows." />
    <div className="account-ops-operations-metrics"><MetricCard label="Profiles" value={profiles.length} helper="Shipping and billing references" /><MetricCard label="Email aliases" value={emailAliases.length} helper="No mailbox connection" /><MetricCard label="Phone resources" value={phones.length} helper="No phone numbers or codes" /></div>
    <div className="account-ops-operations-actions"><SecondaryButton onClick={() => onNavigate?.("profiles")}>Manage Profiles</SecondaryButton><SecondaryButton onClick={() => onNavigate?.("emails")}>Manage Emails & Aliases</SecondaryButton></div>
    <SectionHeader title="Profile Builder compatibility" description="Review the stores and services associated with each profile." />
    {view.profileCompatibility.length ? <RecordList label="Profile compatibility reviews">{view.profileCompatibility.map((profile) => <RecordCard key={profile.id} className="account-ops-operations-card"><header><div><h3>{profile.profileLabel}</h3><p>{profile.retailerRelationships.length ? profile.retailerRelationships.map((id) => retailerName(view, id)).join(", ") : "No retailer relationship"}</p></div><StatusBadge tone="warning">{words(profile.retailerCompatibilityState)}</StatusBadge></header><Facts rows={[{ label: "Enabled", value: profile.enabled ? "Yes" : "No" }, { label: "Provider reviews", value: profile.botProviderCompatibility.map((item) => `${words(item.provider)}: ${words(item.readinessState)}`).join(" · ") }, { label: "Verified compatibility", value: "No" }]} /></RecordCard>)}</RecordList> : <EmptyState title="No profile compatibility reviews">Create a local Profile before reviewing retailer and bot-provider relationships.</EmptyState>}
    <Boundary>Phone/SMS records contain labels and assignment state only. Verification codes and real fixture phone numbers are prohibited.</Boundary>
    {phones.length ? <RecordList label="Phone and SMS resources">{phones.map((phone) => <RecordCard key={phone.id} className="account-ops-operations-card"><header><div><h3>{phone.label}</h3><p>{phone.providerLabel || "Provider not configured"}</p></div><StatusBadge tone={tone(phone.availability)}>{words(phone.availability)}</StatusBadge></header><Facts rows={[{ label: "Region", value: phone.region || "Not recorded" }, { label: "Verification", value: words(phone.verificationState) }, { label: "Expires", value: dateLabel(phone.expiresAt) }, { label: "Assignments", value: phone.accountIds.length }]} /></RecordCard>)}</RecordList> : <EmptyState title="No phone/SMS metadata">No live SMS provider is connected. Future resources will use opaque references, never stored codes.</EmptyState>}
  </div>;
}

function Payment({ view }) {
  const cards = view.operations.paymentCards;
  return <div className="account-ops-operations-stack"><SectionHeader eyebrow="Payment Metadata" title="Virtual Cards & Billing Profiles" description="Nonsecret assignment metadata for future secure integrations." actions={<StatusBadge tone="warning">References Only</StatusBadge>} /><Boundary>Full card numbers, security codes, PINs, bank logins, and payment tokens are never permitted in Account Ops.</Boundary>{cards.length ? <RecordList label="Virtual card metadata">{cards.map((card) => <RecordCard key={card.id} className="account-ops-operations-card"><header><div><h3>{card.cardAlias}</h3><p>{card.providerLabel || "Provider not configured"}</p></div><StatusBadge tone={tone(card.status)}>{words(card.status)}</StatusBadge></header><Facts rows={[{ label: "Reference", value: card.last4 ? `Ending in ${card.last4}` : "No digits stored" }, { label: "Profile", value: recordName(view.accountOps.profiles, card.profileId) }, { label: "Retailer", value: retailerName(view, card.retailerId) }, { label: "Spending limit", value: moneyLabel(card.spendingLimitMinor, card.currency) }]} /></RecordCard>)}</RecordList> : <EmptyState title="No virtual-card metadata">Secure card providers are not connected. This area cannot collect payment credentials.</EmptyState>}</div>;
}

function Network({ view }) {
  const proxies = view.operations.proxyGroupViews;
  return <div className="account-ops-operations-stack"><SectionHeader eyebrow="Network" title="Proxy Groups" description="Read-only readiness projections from credential-free Bot Operations metadata." actions={<StatusBadge tone="warning">No Live Endpoints</StatusBadge>} /><Boundary>Proxy usernames, passwords, authenticated URLs, and live endpoints are excluded. Account Ops does not test or connect proxies.</Boundary>{proxies.length ? <RecordList label="Proxy group metadata">{proxies.map((proxy) => <RecordCard key={proxy.id} className="account-ops-operations-card"><header><div><h3>{proxy.groupLabel}</h3><p>{proxy.providerLabel || "Provider label unavailable"}</p></div><StatusBadge tone={tone(proxy.health)}>{words(proxy.health)}</StatusBadge></header><Facts rows={[{ label: "Type", value: proxy.proxyType || "Not recorded" }, { label: "Region", value: proxy.region || "Not recorded" }, { label: "Count", value: proxy.count }, { label: "Latency", value: proxy.latencyMs == null ? "Not checked" : `${proxy.latencyMs} ms (recorded metadata)` }]} /></RecordCard>)}</RecordList> : <EmptyState title="No proxy-group projection">No credential-free proxy metadata was supplied to this local view.</EmptyState>}</div>;
}

function Verification({ view }) {
  const actions = view.verificationInbox;
  const captcha = actions.filter((item) => item.kind === VERIFICATION_ACTION_KINDS.CAPTCHA);
  return <div className="account-ops-operations-stack"><SectionHeader eyebrow="Verification" title="Verification Inbox" description="One human-controlled queue for CAPTCHA, MFA, email, SMS, terms, security prompts, and password resets." actions={<StatusBadge tone="warning">Human Action Only</StatusBadge>} /><Boundary>Code 3 may pause and explain a required step. It does not solve challenges, intercept codes, reuse tokens, accept terms, or bypass account security.</Boundary>{actions.length ? <RecordList label="Verification actions">{actions.map((action) => <RecordCard key={action.id} className="account-ops-operations-card"><header><div><h3>{action.workflowLabel}</h3><p>{words(action.kind)}</p></div><StatusBadge tone={tone(action.state)}>{words(action.state)}</StatusBadge></header><p>{action.safeInstruction}</p><Facts rows={[{ label: "Created", value: dateLabel(action.createdAt) }, { label: "Expires", value: dateLabel(action.expiresAt) }, { label: "Challenge", value: action.kind === VERIFICATION_ACTION_KINDS.CAPTCHA ? words(action.challengeState) : "Not applicable" }]} />{action.resumeAllowed ? <SecondaryButton disabled>Resume After Verification</SecondaryButton> : null}</RecordCard>)}</RecordList> : <EmptyState title="No verification actions">No human-required action is recorded in local metadata.</EmptyState>}<SectionHeader title="CAPTCHA Center" description="Challenges remain visible, paused, and human-controlled." />{captcha.length ? <p className="account-ops-operations-quiet">{captcha.length} CAPTCHA challenge{captcha.length === 1 ? "" : "s"} require owner review.</p> : <p className="account-ops-operations-quiet">No CAPTCHA challenge is recorded.</p>}</div>;
}

function Automation({ view }) {
  const webhooks = view.operations.webhookIntegrations;
  return <div className="account-ops-operations-stack"><SectionHeader eyebrow="Automation" title="Bot Export Center" description="Review provider readiness before preparing an export." actions={<StatusBadge tone="warning">Not connected</StatusBadge>} /><Boundary>Code 3 cannot connect a bot, create a task, send an export, configure a webhook endpoint, or store a bot license in this phase.</Boundary><RecordList label="Bot export readiness">{view.exportReadiness.map((provider) => <RecordCard key={provider.id} className="account-ops-operations-card"><header><div><h3>{words(provider.provider)}</h3><p>{provider.compatibilityNote}</p></div><StatusBadge tone={tone(provider.readinessState)}>{words(provider.readinessState)}</StatusBadge></header><Facts rows={[{ label: "Schema", value: words(provider.schemaState) }, { label: "Profiles ready", value: provider.profilesReady }, { label: "Accounts ready", value: provider.accountsReady }, { label: "Proxy groups ready", value: provider.proxiesReady }]} /><p className="account-ops-operations-quiet">Provider capability verified: No · Live connection: No</p></RecordCard>)}</RecordList><SectionHeader title="Webhook Hub" description="Provider-neutral event metadata with no endpoint or secret configuration." />{webhooks.length ? <RecordList label="Webhook integration metadata">{webhooks.map((item) => <RecordCard key={item.id} className="account-ops-operations-card"><header><div><h3>{item.providerLabel}</h3><p>{words(item.direction)}</p></div><StatusBadge tone={tone(item.health)}>{words(item.health)}</StatusBadge></header><Facts rows={[{ label: "Enabled", value: "No" }, { label: "Event types", value: item.eventTypes.join(", ") || "None" }, { label: "Last event", value: dateLabel(item.lastEventAt) }]} /></RecordCard>)}</RecordList> : <EmptyState title="No webhook integrations">No live webhook endpoint is configured.</EmptyState>}</div>;
}

function Orders({ view }) {
  const orders = view.operations.orderViews;
  return <div className="account-ops-operations-stack"><SectionHeader eyebrow="Orders" title="Unified Order Tracker" description="Follow orders from confirmation to delivery and receiving." actions={<StatusBadge tone="neutral">Read only</StatusBadge>} /><div className="account-ops-operations-flow" aria-label="Order relationship boundary"><span>Retailer Account</span><span>Order Candidate</span><span>Purchase</span><span>Shipment</span><span>Receiving</span><span>Inventory</span></div><Boundary>Order Candidate is not Purchase. Delivery is not Receiving. No upstream evidence creates Purchase or Inventory from this view.</Boundary>{orders.length ? <RecordList label="Unified order relationships">{orders.map((order) => <RecordCard key={order.id} className="account-ops-operations-card"><header><div><h3>{order.externalOrderReference || "Order relationship"}</h3><p>{retailerName(view, order.retailerId)}</p></div><StatusBadge tone={tone(order.status)}>{words(order.status)}</StatusBadge></header><Facts rows={[{ label: "Account", value: recordName(view.accountOps.storeAccounts, order.accountId, "Unlinked") }, { label: "Order Candidate", value: order.orderCandidateId || "None" }, { label: "Purchase", value: order.purchaseId || "Not created" }, { label: "Receiving", value: words(order.receivingStatus) }, { label: "Inventory", value: words(order.inventoryStatus) }]} /></RecordCard>)}</RecordList> : <div><EmptyState title="No unified order relationships">Your linked orders will appear here. Start with a sample to explore the layout.</EmptyState><OrderExample /></div>}</div>;
}

function Infrastructure({ view }) {
  const operations = view.operations;
  return <div className="account-ops-operations-stack"><SectionHeader eyebrow="Infrastructure" title="Servers & Remote Workspaces" description="Local metadata for future owner-managed infrastructure, without provisioning or connection controls." actions={<StatusBadge tone="warning">No Live Control</StatusBadge>} /><Boundary>Code 3 does not create cloud instances, start or stop machines, open remote access, harvest browser state, or randomize fingerprints.</Boundary><SectionHeader title="Server Manager" />{operations.serverRecords.length ? <RecordList label="Server metadata">{operations.serverRecords.map((server) => <RecordCard key={server.id} className="account-ops-operations-card"><header><div><h3>{server.friendlyName}</h3><p>{server.providerLabel || "Provider not selected"} · {server.region || "Region not selected"}</p></div><StatusBadge tone={tone(server.status)}>{words(server.status)}</StatusBadge></header><Facts rows={[{ label: "Purpose", value: server.purpose }, { label: "Operating system", value: server.osLabel || "Not recorded" }, { label: "Last seen", value: dateLabel(server.lastSeenAt) }, { label: "Estimated cost", value: moneyLabel(server.estimatedCostMinor, server.currency) }]} /></RecordCard>)}</RecordList> : <EmptyState title="No servers">No server is connected or controlled.</EmptyState>}<SectionHeader title="Cloud Instance Templates" description="Planning metadata only; pricing and capacity remain unverified until a future provider review." /><RecordList label="Cloud templates">{operations.cloudTemplates.map((template) => <RecordCard key={template.id} className="account-ops-operations-card"><header><div><h3>{template.templateLabel}</h3><p>{template.purpose}</p></div><StatusBadge tone="neutral">Template Only</StatusBadge></header><Facts rows={[{ label: "Provider", value: template.providerLabel }, { label: "Region", value: template.region }, { label: "Size", value: words(template.sizeClass) }, { label: "Provisioning", value: "Disabled" }]} /></RecordCard>)}</RecordList><SectionHeader title="Remote Sessions" />{operations.remoteAccessRecords.length ? <RecordList label="Remote access metadata">{operations.remoteAccessRecords.map((item) => <RecordCard key={item.id} className="account-ops-operations-card"><header><div><h3>{words(item.accessType)}</h3><p>{item.serverId}</p></div><StatusBadge tone={tone(item.state)}>{words(item.state)}</StatusBadge></header><Facts rows={[{ label: "Last connected", value: dateLabel(item.lastConnectedAt) }, { label: "Operator", value: item.operatorLabel || "Not recorded" }, { label: "Connection", value: "Disabled" }]} /></RecordCard>)}</RecordList> : <EmptyState title="No remote sessions">Use an established remote-access tool in a future approved phase. Code 3 does not implement a remote-desktop protocol.</EmptyState>}<SectionHeader title="Browser Sessions" />{operations.browserWorkspaces.length ? <RecordList label="Browser workspace metadata">{operations.browserWorkspaces.map((item) => <RecordCard key={item.id} className="account-ops-operations-card"><header><div><h3>{item.profileId}</h3><p>{item.retailerId || "No retailer assignment"}</p></div><StatusBadge tone={tone(item.state)}>{words(item.state)}</StatusBadge></header><Facts rows={[{ label: "Tabs", value: item.tabCount }, { label: "Last active", value: dateLabel(item.lastActiveAt) }, { label: "Autofill profile", value: item.autofillProfileId || "Not assigned" }, { label: "Detection evasion", value: "Disabled" }]} /></RecordCard>)}</RecordList> : <EmptyState title="No browser sessions">No browser cookies, retailer sessions, or fingerprint profiles are collected.</EmptyState>}</div>;
}

function Activity({ view, onNavigate }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    try { return view.search(query); } catch { return []; }
  }, [query, view]);
  return <div className="account-ops-operations-stack"><SectionHeader eyebrow="Activity" title="Attention Center" description="A clear view of what needs your attention, all in one place." /><AttentionList rows={view.attention} onNavigate={onNavigate} /><SectionHeader title="Notification foundation" description="Preferences are local planning metadata. No push, email, or webhook is sent." />{view.operations.notificationPreferences.length ? <RecordList label="Notification preferences">{view.operations.notificationPreferences.map((item) => <RecordCard key={item.id} className="account-ops-operations-card"><header><div><h3>{words(item.category)}</h3><p>No live delivery</p></div><StatusBadge tone="neutral">Foundation Only</StatusBadge></header><Facts rows={Object.entries(item.channelPreferences).map(([channel, enabled]) => ({ label: words(channel), value: enabled ? "Preferred when available" : "Off" }))} /></RecordCard>)}</RecordList> : <EmptyState title="No notification preferences">No live notification channel is configured.</EmptyState>}<SectionHeader title="Private search & command center" description="Search safe labels and references inside this owner-only view. Results navigate; they never execute destructive commands." /><SearchField label="Search Account Ops" value={query} onChange={setQuery} placeholder="Accounts, tasks, purchases, inventory, servers…" maxLength={120} />{query && !results.length ? <p className="account-ops-operations-quiet">No safe local metadata matched.</p> : null}{results.length ? <RecordList label="Account Ops search results">{results.map((result) => <button type="button" className="account-ops-operations-search-result" key={result.id} onClick={() => onNavigate?.(result.area)}><span><strong>{result.label}</strong><small>{words(result.type)} · {result.detail}</small></span><span>Review</span></button>)}</RecordList> : null}<div className="account-ops-operations-actions"><QuietButton onClick={() => onNavigate?.("tasks")}>Open Audit & Tasks</QuietButton></div></div>;
}

export default function AccountOpsOperationsPanel({ area = "overview", accountOpsSnapshot = {}, operationsSnapshot, retailers = [], onNavigate, onRequestAccountDraft, onShowAccounts }) {
  const view = useMemo(() => ({ ...createAccountOpsOperationsViewModel({ accountOpsSnapshot, operationsSnapshot, retailers }), retailers }), [accountOpsSnapshot, operationsSnapshot, retailers]);
  if (area === "accounts") return <Accounts view={view} onNavigate={onNavigate} onRequestAccountDraft={onRequestAccountDraft} onShowAccounts={onShowAccounts} />;
  if (area === "identity") return <Identity view={view} onNavigate={onNavigate} />;
  if (area === "payment") return <Payment view={view} />;
  if (area === "network") return <Network view={view} />;
  if (area === "verification") return <Verification view={view} />;
  if (area === "automation") return <Automation view={view} />;
  if (area === "orders") return <Orders view={view} />;
  if (area === "infrastructure") return <Infrastructure view={view} />;
  if (area === "activity") return <Activity view={view} onNavigate={onNavigate} />;
  return <Overview view={view} onNavigate={onNavigate} />;
}
