import { EmptyState, MetricCard, PrimaryButton, SecondaryButton, SectionHeader, StatusBadge } from "../../components/operations/OperationsUI.jsx";
import { isArchived, manualStageLabel, providerLabel } from "./tracking.js";

function dateLabel(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function BotTrackingOverview({ tracking, onOpen, onTrack }) {
  const tasks = tracking.tasks.filter((row) => !isArchived(row.task));
  const plans = tasks.filter((row) => row.task.provider !== "MOCK");
  const openPlans = plans.filter((row) => row.task.runtimeStatus !== "STOPPED");
  return <section className="bot-tracking-overview">
    <SectionHeader eyebrow="Tracking desk" title="Overview" description="Your installations, plans, and recorded activity in one place." actions={<PrimaryButton onClick={() => onTrack({ create: true })}>Add manual plan</PrimaryButton>} />
    <div className="bot-ops-metrics" aria-label="Bot tracking summary">
      <MetricCard label="Your installations" value={tracking.installations.length} helper="Saved bot and device labels" />
      <MetricCard label="Open plans" value={openPlans.length} helper={`${plans.filter((row) => row.task.runtimeStatus === "READY").length} marked plan ready`} />
      <MetricCard label="Tasks needing attention" value={tracking.attentionCount} helper="Saved warnings or details to review" />
      <MetricCard label="Evidence to review" value={tracking.reviewCount} helper="Not a confirmed purchase" />
    </div>
    <div className="bot-tracking-shortcuts">
      <SecondaryButton onClick={() => onTrack({})}>View all tasks</SecondaryButton>
      {tracking.attentionCount > 0 ? <SecondaryButton onClick={() => onTrack({ attentionOnly: true })}>Review task attention</SecondaryButton> : null}
      {tracking.reviewCount > 0 ? <SecondaryButton onClick={() => onOpen("activity")}>Review local evidence</SecondaryButton> : null}
      <SecondaryButton onClick={() => onOpen("bots")}>Set up your bots</SecondaryButton>
    </div>
    <section aria-label="Tracking by bot">
      <SectionHeader title="Installations" description="Choose a bot to see its plans and history." />
      {tracking.installations.length ? <div className="bot-tracking-installations">{tracking.installations.map(({ installation, tasks: rows, reviewCount, lastUpdatedAt }) => <article key={installation.id} className="bot-tracking-installation" data-testid={`bot-tracking-installation-${installation.id}`}>
        <div className="bot-tracking-installation-identity"><span className="bot-tracking-provider-mark" aria-hidden="true">{providerLabel(installation.provider).slice(0, 2).toUpperCase()}</span><div><p className="ops-eyebrow">{providerLabel(installation.provider)}</p><h3>{installation.friendlyName}</h3><p>{installation.runtimeLabel || "Device label not added"}</p></div></div>
        <dl className="bot-tracking-totals"><div><dt>Saved tasks</dt><dd>{rows.length}</dd></div><div><dt>Need attention</dt><dd>{rows.filter((row) => row.attention.length).length}</dd></div><div><dt>Evidence to review</dt><dd>{reviewCount}</dd></div></dl>
        <div className="bot-tracking-installation-state"><StatusBadge tone="neutral">{installation.provider === "MOCK" ? "Synthetic" : "Manual tracking"}</StatusBadge><p className="bot-tracking-updated">Updated {dateLabel(lastUpdatedAt)}</p></div>
        <div className="bot-tracking-shortcuts"><SecondaryButton onClick={() => onTrack({ installationId: installation.id })} aria-label={`View tasks for ${installation.friendlyName}`}>View tasks</SecondaryButton>{installation.provider !== "MOCK" && installation.status !== "DISABLED" ? <SecondaryButton onClick={() => onTrack({ installationId: installation.id, create: true })} aria-label={`Add manual plan for ${installation.friendlyName}`}>Add plan</SecondaryButton> : null}</div>
      </article>)}</div> : <EmptyState title="Add your first bot">Save a bot installation, then add the products you want to track. Polar, Sniped, Swooper AIO, and the other supported labels are available in Bots.</EmptyState>}
    </section>
    {plans.length ? <section aria-label="Recent plans"><SectionHeader title="Recently updated" /><div className="bot-tracking-recent">{plans.slice(0, 4).map((row) => <button type="button" key={row.task.id} className="bot-tracking-recent-row" onClick={() => onTrack({ installationId: row.task.installationId, taskId: row.task.id })}><span><strong>{row.target?.title || "Product not available"}</strong><small>{row.installation?.friendlyName || "Installation not available"}</small></span><span>{manualStageLabel(row.task.runtimeStatus)}</span><span aria-hidden="true">↗</span></button>)}</div></section> : null}
    <p className="bot-tracking-boundary">Live connections and task controls are not available yet. Bot success and checkout evidence never create a Purchase or inventory item automatically.</p>
  </section>;
}
