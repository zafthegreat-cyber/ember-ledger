import { useId, useMemo, useState } from "react";
import { EmptyState, RecordCard, SecondaryButton, SectionHeader, StatusBadge } from "../../components/operations/OperationsUI.jsx";
import { formatMoneyForDisplay } from "../intelligence/money.js";
import { isArchived, providerLabel, retailerLabel } from "./tracking.js";

const words = (value) => String(value || "Unknown").replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

function dateLabel(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function BotTrackingActivity({ snapshot, tracking }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [installationId, setInstallationId] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const taskById = useMemo(() => new Map(tracking.tasks.map((row) => [row.task.id, row])), [tracking]);
  const installationById = useMemo(() => new Map(snapshot.installations.map((row) => [row.id, row])), [snapshot.installations]);
  const targetById = useMemo(() => new Map(snapshot.productTargets.map((row) => [row.id, row])), [snapshot.productTargets]);
  const context = (row) => {
    const task = taskById.get(row.taskId);
    const installation = installationById.get(row.installationId);
    const target = row.productTargetId ? targetById.get(row.productTargetId) : task?.target;
    return { product: target?.title || "Product not recorded", bot: installation?.friendlyName || "Installation not recorded", provider: providerLabel(installation?.provider || row.provider) };
  };
  const matches = (row) => {
    if (isArchived(row) || (installationId && row.installationId !== installationId)) return false;
    const labels = context(row);
    const text = [labels.product, labels.bot, labels.provider, row.summary, row.message, row.externalOrderReference, retailerLabel(row.retailerId)].join(" ").toLowerCase();
    return query.trim().toLowerCase().split(/\s+/).every((term) => text.includes(term));
  };
  // Attempts already have a corresponding activity event. Show each observation
  // once while retaining review/reconciliation and manual edits in the timeline.
  const attempts = snapshot.attempts.filter(matches).map((row) => ({ ...row, source: "attempt", summary: row.message || "Synthetic observation recorded." }));
  const attemptIds = new Set(snapshot.attempts.map((row) => row.id));
  const activity = snapshot.activity.filter((row) => !(row.type === "PROVIDER_EVENT_NORMALIZED" && attemptIds.has(row.attemptId))).filter(matches);
  const history = [...attempts, ...activity].sort((left, right) => String(right.occurredAt || right.createdAt).localeCompare(String(left.occurredAt || left.createdAt)));
  const evidence = snapshot.checkoutEvidence.filter(matches).filter((row) => !reviewOnly || row.requiresOwnerReview);
  return <section className="bot-tracking-history">
    <SectionHeader eyebrow="Recorded history" title="Activity" description="Follow manual plan updates and saved evidence by product and bot. Live provider activity is not connected." />
    <div className="bot-tracking-history-filters"><label htmlFor={`${id}-search`}>Search history<input id={`${id}-search`} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Product, bot, or order reference" /></label><label htmlFor={`${id}-bot`}>Installation<select id={`${id}-bot`} value={installationId} onChange={(event) => setInstallationId(event.target.value)}><option value="">All installations</option>{snapshot.installations.map((row) => <option value={row.id} key={row.id}>{row.friendlyName}{isArchived(row) ? " (archived)" : ""}</option>)}</select></label>{query || installationId || reviewOnly ? <SecondaryButton onClick={() => { setQuery(""); setInstallationId(""); setReviewOnly(false); }}>Clear filters</SecondaryButton> : null}</div>
    <p role="status">{history.length} recorded update{history.length === 1 ? "" : "s"} · {evidence.length} evidence record{evidence.length === 1 ? "" : "s"}</p>
    {history.length ? <div className="bot-ops-activity-list">{history.map((row) => {
      const labels = context(row);
      return <RecordCard key={`${row.source || "activity"}-${row.id}`} className="bot-ops-record"><div className="bot-ops-card-heading"><div><p className="ops-eyebrow">{dateLabel(row.occurredAt)}</p><h3>{labels.product}</h3></div><StatusBadge tone="neutral">{row.type?.startsWith("MANUAL_PLAN_") ? "Manual update" : row.source === "attempt" ? "Synthetic observation" : "Recorded review"}</StatusBadge></div>{row.source === "attempt" ? <p><strong>{words(row.normalizedEvent)}</strong> · Recorded status: {words(row.runtimeStatus)}</p> : null}<p>{row.summary}</p><p>{labels.bot} · {labels.provider}</p>{row.warnings?.length ? <ul className="bot-ops-warnings">{row.warnings.map((warning) => <li key={warning}>{warning.replaceAll("_", " ")}</li>)}</ul> : null}</RecordCard>;
    })}</div> : <EmptyState title={query || installationId ? "No matching activity" : "No activity yet"}>{query || installationId ? "Try a different product or installation." : "Add a manual plan to start a local history. No synthetic activity is added during normal use."}</EmptyState>}
    <section className="bot-ops-evidence"><SectionHeader eyebrow="Recorded evidence" title="Checkout Evidence" description="Evidence is not a Purchase. Review it against your retailer confirmation before recording an order." /><label className="bot-tracking-check"><input type="checkbox" checked={reviewOnly} onChange={(event) => setReviewOnly(event.target.checked)} />Only evidence needing review</label>
      {evidence.length ? evidence.map((row) => {
        const labels = context(row);
        return <RecordCard key={row.id} className="bot-ops-record"><div className="bot-ops-card-heading"><div><h3>{labels.product}</h3><p>{labels.bot} · {retailerLabel(row.retailerId)}</p></div><StatusBadge tone={row.requiresOwnerReview ? "warning" : "neutral"}>{row.requiresOwnerReview ? "Needs review" : row.reviewState.toLowerCase().replaceAll("_", " ")}</StatusBadge></div><dl className="bot-ops-facts"><div><dt>Review status</dt><dd>{words(row.reviewState)}</dd></div><div><dt>Order reference</dt><dd>{row.externalOrderReference || "Not supplied"}</dd></div><div><dt>Quantity</dt><dd>{row.quantity}</dd></div><div><dt>Expected amount</dt><dd>{row.expectedAmount ? formatMoneyForDisplay(row.expectedAmount) : "Not supplied"}</dd></div><div><dt>Recorded</dt><dd>{dateLabel(row.occurredAt)}</dd></div></dl><p>Purchase not created · Inventory not created</p></RecordCard>;
      }) : <EmptyState title="No matching checkout evidence">No evidence matches these filters. Manual plans do not create checkout or purchase records.</EmptyState>}
    </section>
  </section>;
}
