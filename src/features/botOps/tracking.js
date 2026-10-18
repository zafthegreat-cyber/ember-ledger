import { BOT_PROVIDER_CATALOG } from "./providerCatalog.js";
import { ACCOUNT_OPS_RETAILER_PRESETS } from "../accountOps/retailerDirectory.js";

const STAGES = Object.freeze({ DRAFT: "Planning", READY: "Plan ready", PAUSED: "On hold", STOPPED: "Closed", UNKNOWN: "Needs an update" });
const RETAILERS = Object.freeze({ target: "Target", walmart: "Walmart", bestbuy: "Best Buy", "best-buy": "Best Buy", gamestop: "GameStop", amazon: "Amazon", "pokemon-center": "Pokémon Center", pokemoncenter: "Pokémon Center" });

export function isArchived(record) {
  return Boolean(record?.status === "ARCHIVED" || record?.archivedAt);
}

export function manualStageLabel(status) {
  return STAGES[status] || String(status || "Unknown").replaceAll("_", " ").toLowerCase();
}

export function retailerLabel(id) {
  return ACCOUNT_OPS_RETAILER_PRESETS.find((retailer) => retailer.id === id)?.displayName || RETAILERS[id] || String(id || "Retailer not recorded").replaceAll("_", " ");
}

export function providerLabel(key) {
  return BOT_PROVIDER_CATALOG[key]?.displayName || (key === "MOCK" ? "Synthetic test bot" : key || "Bot not recorded");
}

const indexById = (rows = []) => new Map(rows.map((row) => [row.id, row]));
const timestamp = (record) => record.updatedAt || record.occurredAt || record.createdAt || "";
const newestFirst = (left, right) => timestamp(right).localeCompare(timestamp(left));

function groupBy(rows = [], key) {
  const groups = new Map();
  for (const row of rows) {
    if (isArchived(row)) continue;
    const values = groups.get(row[key]) || [];
    values.push(row);
    groups.set(row[key], values);
  }
  for (const values of groups.values()) values.sort(newestFirst);
  return groups;
}

// Read-only joins over the existing snapshot. No synthetic records, provider
// observations, or persistence changes are created by the tracking view.
export function buildBotTracking(snapshot = {}) {
  const installations = indexById(snapshot.installations);
  const targets = indexById(snapshot.productTargets);
  const groups = indexById(snapshot.taskGroups);
  const accounts = indexById(snapshot.retailerAccountLinks);
  const profiles = indexById(snapshot.botProfiles);
  const proxies = indexById(snapshot.proxyGroups);
  const attemptsByTask = groupBy(snapshot.attempts, "taskId");
  const evidenceByTask = groupBy(snapshot.checkoutEvidence, "taskId");
  const activityByTask = groupBy(snapshot.activity, "taskId");
  const tasks = (snapshot.tasks || []).map((task) => {
    const installation = installations.get(task.installationId);
    const target = targets.get(task.productTargetId);
    const group = groups.get(task.taskGroupId);
    const account = accounts.get(task.retailerAccountLinkId || group?.retailerAccountLinkId);
    const profile = profiles.get(task.botProfileId || group?.botProfileId);
    const proxy = proxies.get(task.proxyGroupId || group?.proxyGroupId);
    const attempts = attemptsByTask.get(task.id) || [];
    const evidence = evidenceByTask.get(task.id) || [];
    const activity = activityByTask.get(task.id) || [];
    const attention = [];
    for (const [label, record] of [["Bot installation", installation], ["Product", target], ["Task group", group]]) {
      if (!record || isArchived(record)) attention.push(`${label} is ${record ? "archived" : "missing"}`);
      else if (record.status === "DISABLED") attention.push(`${label} is disabled`);
    }
    if (task.status === "DISABLED") attention.push("Task record is disabled");
    if ((installation && installation.provider !== task.provider) || (group && (group.provider !== task.provider || group.installationId !== task.installationId))) attention.push("Bot and group references do not match");
    if ((target && target.retailerId !== task.retailerId) || (group && group.retailerId !== task.retailerId)) attention.push("Product and group retailers do not match");
    if (task.runtimeStatus === "UNKNOWN") attention.push("Update the planning stage");
    if (evidence.some((item) => item.requiresOwnerReview)) attention.push("Checkout evidence needs review");
    if (target?.reviewState === "NEEDS_REVIEW") attention.push("Product details need review");
    for (const [label, id, record] of [["Account", task.retailerAccountLinkId || group?.retailerAccountLinkId, account], ["Profile", task.botProfileId || group?.botProfileId, profile], ["Proxy group", task.proxyGroupId || group?.proxyGroupId, proxy]]) {
      if (id && (!record || isArchived(record))) attention.push(`${label} reference needs review`);
    }
    if (task.warnings?.length || group?.warnings?.length) attention.push("Saved warnings need review");
    const updatedAt = [task, ...activity].map(timestamp).sort().at(-1) || "";
    const searchText = [target?.title, target?.sku, target?.tcin, target?.upc, target?.canonicalProductId, target?.notes, installation?.friendlyName, installation?.runtimeLabel, providerLabel(task.provider), group?.name, retailerLabel(task.retailerId), account?.accountLabel, profile?.displayName, proxy?.displayName].filter(Boolean).join(" ").toLowerCase();
    return { task, installation, target, group, account, profile, proxy, attempts, evidence, activity, attention, searchText, updatedAt };
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.task.id.localeCompare(right.task.id));
  const activeTasks = tasks.filter((row) => !isArchived(row.task));
  const tasksByInstallation = groupBy(activeTasks.map((row) => ({ ...row, installationId: row.task.installationId })), "installationId");
  const evidenceByInstallation = groupBy(snapshot.checkoutEvidence, "installationId");
  const activityByInstallation = groupBy(snapshot.activity, "installationId");
  const installationRows = [...installations.values()].filter((installation) => !isArchived(installation)).map((installation) => {
    const rows = tasksByInstallation.get(installation.id) || [];
    const reviewCount = (evidenceByInstallation.get(installation.id) || []).filter((item) => item.requiresOwnerReview).length;
    const lastUpdatedAt = [timestamp(installation), ...rows.map((row) => row.updatedAt), ...(activityByInstallation.get(installation.id) || []).map(timestamp)].sort().at(-1) || "";
    return { installation, tasks: rows, reviewCount, lastUpdatedAt };
  }).sort((left, right) => right.lastUpdatedAt.localeCompare(left.lastUpdatedAt) || left.installation.friendlyName.localeCompare(right.installation.friendlyName));
  return {
    tasks,
    installations: installationRows,
    reviewCount: (snapshot.checkoutEvidence || []).filter((row) => !isArchived(row) && row.requiresOwnerReview).length,
    attentionCount: activeTasks.filter((row) => row.attention.length).length,
  };
}

export function filterBotTasks(rows, filters = {}) {
  const terms = String(filters.query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => (
    (filters.includeArchived || !isArchived(row.task))
    && (!filters.provider || row.task.provider === filters.provider)
    && (!filters.installationId || row.task.installationId === filters.installationId)
    && (!filters.retailerId || row.task.retailerId === filters.retailerId)
    && (!filters.stage || row.task.runtimeStatus === filters.stage)
    && (!filters.attentionOnly || row.attention.length > 0)
    && terms.every((term) => row.searchText.includes(term))
  ));
}
