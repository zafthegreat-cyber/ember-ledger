import assert from "node:assert/strict";
import { buildBotTracking, filterBotTasks, isArchived, manualStageLabel, providerLabel, retailerLabel } from "../src/features/botOps/tracking.js";

const snapshot = {
  installations: [{ id: "a", provider: "POLAR", friendlyName: "Home Polar", runtimeLabel: "Desk", updatedAt: "2026-10-01" }, { id: "b", provider: "POLAR", friendlyName: "Travel Polar", updatedAt: "2026-10-02" }, { id: "c", provider: "SNIPED", friendlyName: "Archived bot", status: "ARCHIVED" }],
  productTargets: [{ id: "p1", retailerId: "retailer-preset:target", title: "Same product", sku: "SKU-A", notes: "Gift", reviewState: "NEW" }, { id: "p2", retailerId: "retailer-preset:walmart", title: "Same product", sku: "SKU-B" }],
  taskGroups: [{ id: "g", provider: "POLAR", installationId: "a", retailerId: "retailer-preset:target", name: "Weekend plans", retailerAccountLinkId: "account" }, { id: "g2", provider: "POLAR", installationId: "b", retailerId: "retailer-preset:walmart", name: "Weekend plans", retailerAccountLinkId: "account" }],
  retailerAccountLinks: [{ id: "account", accountLabel: "Household" }],
  botProfiles: [], proxyGroups: [],
  tasks: [
    { id: "t1", installationId: "a", productTargetId: "p1", taskGroupId: "g", retailerId: "retailer-preset:target", provider: "POLAR", runtimeStatus: "DRAFT", updatedAt: "2026-10-01" },
    { id: "t2", installationId: "b", productTargetId: "p2", taskGroupId: "g2", retailerId: "retailer-preset:walmart", provider: "POLAR", runtimeStatus: "READY", updatedAt: "2026-10-02" },
    { id: "t3", installationId: "a", productTargetId: "p1", taskGroupId: "g", retailerId: "retailer-preset:target", provider: "POLAR", runtimeStatus: "DRAFT", status: "ARCHIVED", updatedAt: "2026-10-05" },
    { id: "t4", installationId: "c", productTargetId: "missing", taskGroupId: "missing", retailerId: "custom-shop", provider: "SNIPED", runtimeStatus: "UNKNOWN", updatedAt: "2026-10-03" },
  ],
  attempts: [{ id: "at", taskId: "t1", occurredAt: "2026-10-01" }],
  checkoutEvidence: [
    { id: "e1", taskId: "t1", installationId: "a", reviewState: "RECONCILED", requiresOwnerReview: true },
    { id: "e2", taskId: "t1", installationId: "a", reviewState: "CONFIRMED", requiresOwnerReview: false },
    { id: "e3", taskId: "t2", installationId: "b", requiresOwnerReview: true, status: "ARCHIVED" },
    { id: "e4", taskId: "orphan", installationId: "b", requiresOwnerReview: true },
  ],
  activity: [{ id: "act1", taskId: "t1", installationId: "a", occurredAt: "2026-10-06" }, { id: "act2", taskId: "t1", installationId: "a", occurredAt: "2026-10-04" }],
};
const original = JSON.stringify(snapshot);
const view = buildBotTracking(snapshot);
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks += 1; };
const ids = (filters = {}) => filterBotTasks(view.tasks, filters).map((row) => row.task.id);
equal(ids(), ["t1", "t4", "t2"]);
equal(ids({ includeArchived: true }), ["t1", "t3", "t4", "t2"]);
equal(ids({ query: "same SKU-B" }), ["t2"]);
equal(ids({ query: "  HOME  gift " }), ["t1"]);
equal(ids({ query: "Household Weekend" }), ["t1", "t2"]);
equal(ids({ query: "no match" }), []);
equal(ids({ provider: "POLAR", installationId: "b" }), ["t2"]);
equal(ids({ provider: "SNIPED", installationId: "b" }), []);
equal(ids({ retailerId: "retailer-preset:target" }), ["t1"]);
equal(ids({ stage: "READY" }), ["t2"]);
equal(ids({ attentionOnly: true }), ["t1", "t4"]);
equal(view.reviewCount, 2);
equal(view.attentionCount, 2);
equal(view.installations.map((row) => row.installation.id), ["a", "b"]);
equal(view.installations[0].tasks.map((row) => row.task.id), ["t1"]);
equal(view.installations.map((row) => row.reviewCount), [1, 1]);
equal(view.installations[0].lastUpdatedAt, "2026-10-06");
equal(view.tasks[0].activity.map((row) => row.id), ["act1", "act2"]);
equal(view.tasks[0].evidence.length, 2);
equal(view.tasks[0].attention, ["Checkout evidence needs review"]);
equal(view.tasks.find((row) => row.task.id === "t4").attention, ["Bot installation is archived", "Product is missing", "Task group is missing", "Update the planning stage"]);
equal(view.tasks[0].account.accountLabel, "Household");
equal(view.tasks[0].attempts[0].id, "at");
equal(JSON.stringify(snapshot), original);
equal(buildBotTracking().reviewCount, 0);
equal(buildBotTracking().tasks, []);
equal(retailerLabel("retailer-preset:best-buy"), "Best Buy");
equal(retailerLabel("retailer-preset:sams-club"), "Sam's Club");
equal(retailerLabel("local_shop"), "local shop");
equal(providerLabel("SWOOPER"), "Swooper AIO");
equal(manualStageLabel("STOPPED"), "Closed");
equal(manualStageLabel("READY"), "Plan ready");
equal(isArchived({ archivedAt: "2026-10-01" }), true);
equal(isArchived({ status: "DISABLED" }), false);
const invalid = structuredClone(snapshot);
invalid.installations[0].status = "DISABLED";
invalid.taskGroups[0].retailerId = "mismatched";
invalid.taskGroups[0].installationId = "b";
const blocked = buildBotTracking(invalid).tasks.find((row) => row.task.id === "t1");
equal(blocked.attention.includes("Bot installation is disabled"), true);
equal(blocked.attention.includes("Bot and group references do not match"), true);
equal(blocked.attention.includes("Product and group retailers do not match"), true);
console.log(`Bot tracking selectors: ${checks} assertions passed.`);
