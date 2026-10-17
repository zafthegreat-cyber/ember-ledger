import assert from "node:assert/strict";
import { canUseHostedAppSupplement, selectHostedAppSupplement } from "../src/features/persistence/hostedAppSupplement.js";
import { createLegacyAppStorageGuard } from "../src/features/persistence/legacyAppStorage.js";

const owner = "confirmed-account";
const ready = { localDevelopment: false, contextOwnerId: owner, sessionOwnerId: owner, guestPreview: false, profileReady: true, appAccess: true };
assert.equal(canUseHostedAppSupplement(ready), true);
for (const patch of [{ contextOwnerId: null }, { contextOwnerId: "other-account" }, { sessionOwnerId: null }, { guestPreview: true }, { profileReady: false }, { appAccess: false }, { localDevelopment: true }]) assert.equal(canUseHostedAppSupplement({ ...ready, ...patch }), false);

const existing = {
  items: [{ id: "local-original-item", quantity: 9, customProvenance: "keep" }],
  sales: [{ id: "local-original-sale", amount: 27 }], expenses: [{ id: "local-original-expense" }],
  workspaces: [{ id: "original-workspace" }], workspaceMembers: [{ id: "original-member" }],
  profile: { id: "original-profile", user_role: "admin" }, subscriptionProfile: { plan: "existing" },
  tradeRecords: [{ id: "trade-original", workspaceId: "cloud-workspace", extraEvidence: "keep" }],
  purchasers: [{ id: "person-original", name: "Collector", customField: "keep" }],
  collectorEventPlans: [{ id: "event-original", title: "Card show" }],
  dashboardCardStyle: "compact", appSetupPersonalization: { smartRecommendationsEnabled: false, pagePreferences: { vault: { visibleKeys: ["collection"] } } },
};
const values = new Map([["et-tcg-beta-data", JSON.stringify(existing)]]);
const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const guard = createLegacyAppStorageGuard();
const supplemental = selectHostedAppSupplement(guard.load(storage).data);
assert.equal(supplemental.tradeRecords[0].id, "trade-original");
assert.equal(supplemental.purchasers[0].customField, "keep");
for (const field of ["items", "sales", "expenses", "workspaces", "workspaceMembers", "profile", "subscriptionProfile"]) assert.equal(Object.hasOwn(supplemental, field), false);
const patch = selectHostedAppSupplement({ ...supplemental, items: [], sales: [], profile: { role: "wrong" }, tradeRecords: [...supplemental.tradeRecords, { id: "trade-new", workspaceId: "cloud-workspace" }] });
assert.equal(guard.save(storage, patch).ok, true);
const persisted = JSON.parse(storage.getItem("et-tcg-beta-data"));
for (const field of ["items", "sales", "expenses", "workspaces", "workspaceMembers", "profile", "subscriptionProfile"]) assert.deepEqual(persisted[field], existing[field], `${field} must retain its original authority and data`);
const nextMount = createLegacyAppStorageGuard();
const reloaded = selectHostedAppSupplement(nextMount.load(storage).data);
assert.deepEqual(reloaded.tradeRecords.map((record) => record.id), ["trade-original", "trade-new"]);
assert.equal(reloaded.tradeRecords[0].extraEvidence, "keep");
assert.equal(reloaded.collectorEventPlans[0].title, "Card show");
assert.equal(reloaded.dashboardCardStyle, "compact");
assert.deepEqual(reloaded.appSetupPersonalization, existing.appSetupPersonalization);
assert.equal(selectHostedAppSupplement({ trades: [{ id: "legacy-trade" }] }).tradeRecords[0].id, "legacy-trade");
assert.deepEqual(selectHostedAppSupplement({ trades: [{ id: "old" }], tradeRecords: [] }).tradeRecords, []);
const originalRaw = storage.getItem("et-tcg-beta-data");
storage.setItem("et-tcg-beta-data", JSON.stringify({ ...persisted, purchasers: [{ id: "other-tab-change" }] }));
assert.equal(nextMount.save(storage, reloaded).ok, false);
assert.notEqual(storage.getItem("et-tcg-beta-data"), originalRaw);
assert.equal(JSON.parse(storage.getItem("et-tcg-beta-data")).purchasers[0].id, "other-tab-change");
console.log("Hosted supplemental save/reload, authority isolation, identity gates, ID preservation, and stale-tab protection passed.");
