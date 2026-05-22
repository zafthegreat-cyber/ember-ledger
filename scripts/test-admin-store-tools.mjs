import assert from "node:assert/strict";

import {
  ADMIN_STORE_PERSISTENCE_NOTE,
  STORE_PARTNER_NO_GUARANTEE_COPY,
  adminStoreDraftToApprovedStore,
  applyAdminStoreDraftToStores,
  canShowAdminStoreControls,
  filterStoresForScoutPicker,
  getAdminStoreManagementSummary,
  normalizeAdminStoreDraft,
  publicStorePartnerBadges,
  validateAdminStoreDraft,
} from "../src/utils/adminStoreTools.js";
import {
  buildRegionalStoreBuckets,
} from "../src/utils/regionalBrowsingUtils.js";
import {
  buildStoreProfileSummary,
} from "../src/utils/storeProfileUtils.js";

assert.match(ADMIN_STORE_PERSISTENCE_NOTE, /existing local Scout\/shared store data/i);
assert.match(ADMIN_STORE_PERSISTENCE_NOTE, /shared stores table/i);
assert.match(STORE_PARTNER_NO_GUARANTEE_COPY, /not a guarantee/i);
assert.match(STORE_PARTNER_NO_GUARANTEE_COPY, /MSRP/i);
assert.match(STORE_PARTNER_NO_GUARANTEE_COPY, /inventory/i);

assert.equal(canShowAdminStoreControls({ isAdmin: false }), false);
assert.equal(canShowAdminStoreControls({ isAdmin: true }), true);

const draft = normalizeAdminStoreDraft({
  displayName: "Family Table TCG",
  chain: "Family Table TCG",
  storeType: "Local Card Shop",
  nickname: "Family Table",
  city: "Norfolk",
  state: "VA",
  region: "Hampton Roads",
  active: true,
  reportable: true,
  familyFriendlyApproved: true,
  supportsKidsAccess: true,
  supportsMsrpOrReasonablePricing: true,
  featuredPartner: true,
  publicNotes: "Kid-friendly trade nights.",
});

assert.equal(draft.displayName, "Family Table TCG");
assert.equal(draft.storeType, "Local Card Shop");
assert.equal(draft.city, "Norfolk");
assert.equal(draft.state, "Virginia");
assert.equal(draft.region, "Hampton Roads / 757");
assert.equal(draft.active, true);
assert.equal(draft.reportable, true);

assert.deepEqual(validateAdminStoreDraft({ displayName: "", chain: "", city: "", state: "" }).errors, [
  "Store display name is required.",
  "Chain or shop name is required.",
  "City is required.",
  "State is required.",
]);
assert.equal(validateAdminStoreDraft(draft).ok, true);

const approvedStore = adminStoreDraftToApprovedStore({
  ...draft,
  reviewStatus: "Approved",
}, { now: "2026-05-22T12:00:00.000Z", reviewer: "official admin ember" });
assert.equal(approvedStore.reviewStatus, "Approved");
assert.equal(approvedStore.adminReviewedBy, "official admin ember");
assert.deepEqual(publicStorePartnerBadges(approvedStore).map((badge) => badge.label), [
  "Family-Friendly",
  "Kids Access",
  "Reasonable Pricing",
  "Featured Partner",
]);

const pendingStore = normalizeAdminStoreDraft({
  ...draft,
  reviewStatus: "Needs Review",
  supportsKidsAccess: true,
  featuredPartner: true,
});
assert.deepEqual(publicStorePartnerBadges(pendingStore), [], "pending shop labels should not publish as badges");

const inactiveStore = adminStoreDraftToApprovedStore({
  ...draft,
  id: "inactive-family-table",
  active: false,
  reportable: false,
  reviewStatus: "Inactive",
}, { now: "2026-05-22T12:00:00.000Z" });

assert.deepEqual(filterStoresForScoutPicker([approvedStore, inactiveStore], { admin: false }).map((store) => store.id), [approvedStore.id]);
assert.deepEqual(filterStoresForScoutPicker([approvedStore, inactiveStore], { admin: true }).map((store) => store.id), [approvedStore.id, inactiveStore.id]);

const deniedApply = applyAdminStoreDraftToStores([], draft, { admin: false });
assert.equal(deniedApply.ok, false);
assert.equal(deniedApply.reason, "admin_required");

const created = applyAdminStoreDraftToStores([], draft, {
  admin: true,
  now: "2026-05-22T12:00:00.000Z",
  reviewer: "official admin tide",
});
assert.equal(created.ok, true);
assert.equal(created.mode, "created");
assert.equal(created.stores.length, 1);

const updated = applyAdminStoreDraftToStores(created.stores, {
  ...draft,
  publicNotes: "Updated public note.",
}, {
  admin: true,
  now: "2026-05-22T13:00:00.000Z",
});
assert.equal(updated.mode, "updated");
assert.equal(updated.stores.length, 1);
assert.equal(updated.stores[0].publicNotes, "Updated public note.");

const publicProfiles = [approvedStore, inactiveStore].map((store) => buildStoreProfileSummary(store, { admin: false }));
const profiles = [approvedStore, inactiveStore].map((store) => buildStoreProfileSummary(store, { admin: true }));
const normalBuckets = buildRegionalStoreBuckets(publicProfiles.filter((profile) => profile.activeForViewer), { admin: false });
assert.equal(normalBuckets[0].storeCount, 1);
const adminBuckets = buildRegionalStoreBuckets(profiles, { admin: true });
assert.equal(adminBuckets[0].storeCount, 2);

const summary = getAdminStoreManagementSummary([approvedStore, inactiveStore], [
  { id: "suggestion-1", targetTable: "stores", status: "Submitted" },
  { id: "suggestion-2", targetTable: "stores", status: "Approved" },
]);
assert.equal(summary.totalStores, 2);
assert.equal(summary.activeStores, 1);
assert.equal(summary.inactiveStores, 1);
assert.equal(summary.familyFriendlyStores, 1);
assert.equal(summary.featuredPartners, 1);
assert.equal(summary.openStoreSuggestions, 1);

console.log("Admin store tools tests passed.");
