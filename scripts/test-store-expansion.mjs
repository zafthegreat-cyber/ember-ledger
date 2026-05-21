import assert from "node:assert/strict";
import {
  getStoreFamilyFriendlyBadges,
  isStoreActiveForViewer,
  matchesStoreExpansionFilters,
  normalizeStoreExpansionFields,
  normalizeStoreLocationType,
} from "../src/utils/storeExpansionUtils.js";
import { parseDropRadarShorthand } from "../src/utils/dropRadarUtils.mjs";

const target = {
  id: "redmill-target",
  nickname: "Redmill Target",
  name: "Target Red Mill",
  chain: "Target",
  retailer: "Target",
  city: "Virginia Beach",
  state: "Virginia",
  active: true,
};

const localCardShop = normalizeStoreExpansionFields({
  id: "family-shop",
  name: "Family TCG Table",
  chain: "Family TCG Table",
  retailer: "Local Card Shops",
  storeGroup: "Local Card Shops",
  city: "Norfolk",
  state: "Virginia",
  region: "Hampton Roads / 757",
  store_type: "local card shop",
  active: true,
  familyFriendlyApproved: true,
  supportsKidsAccess: true,
  supportsMsrpOrReasonablePricing: true,
  agreedToCommunityMotto: true,
  offersKidEvents: true,
  offersTradeNights: true,
  featuredPartner: true,
  advertisingPartner: false,
  partnerNotes: "Runs kid-focused trade nights.",
});

assert.equal(normalizeStoreLocationType(target), "Big Box Retailer");
assert.equal(normalizeStoreLocationType(localCardShop), "Local Card Shop");
assert.equal(normalizeStoreLocationType({ chain: "Barnes & Noble", storeGroup: "Bookstores / Hobby" }), "Bookstore");
assert.equal(normalizeStoreLocationType({ chain: "Costco", storeGroup: "Warehouse Clubs" }), "Warehouse Club");
assert.equal(normalizeStoreLocationType({ chain: "Dollar General" }), "Dollar Store");
assert.equal(normalizeStoreLocationType({ name: "Friendly Game Store", type: "game store" }), "Game Store");

const badges = getStoreFamilyFriendlyBadges(localCardShop).map((badge) => badge.label);
assert.deepEqual(badges, [
  "Family-Friendly",
  "Kids Access",
  "Reasonable Pricing",
  "Kid Events",
  "Trade Nights",
  "Featured Partner",
]);

assert.deepEqual(getStoreFamilyFriendlyBadges(target), []);
assert.deepEqual(getStoreFamilyFriendlyBadges({ ...localCardShop, featuredPartner: false, advertisingPartner: true }).map((badge) => badge.label), [
  "Family-Friendly",
  "Kids Access",
  "Reasonable Pricing",
  "Kid Events",
  "Trade Nights",
  "Advertising Partner",
]);
assert.equal(matchesStoreExpansionFilters(localCardShop, { storeType: "Local Card Shop", familyStatus: "familyFriendly" }), true);
assert.equal(matchesStoreExpansionFilters(localCardShop, { familyStatus: "kidsAccess" }), true);
assert.equal(matchesStoreExpansionFilters(localCardShop, { familyStatus: "featured" }), true);
assert.equal(matchesStoreExpansionFilters(target, { familyStatus: "familyFriendly" }), false);

const inactiveShop = { ...localCardShop, id: "inactive-shop", active: false };
assert.equal(isStoreActiveForViewer(inactiveShop), false);
assert.equal(isStoreActiveForViewer(inactiveShop, { admin: true }), true);
assert.equal(matchesStoreExpansionFilters(inactiveShop, {}, { admin: false }), false);
assert.equal(matchesStoreExpansionFilters(inactiveShop, {}, { admin: true }), true);

const aliasStores = [
  target,
  { id: "pembroke-target", nickname: "Pembroke Target", name: "Target Pembroke", chain: "Target", retailer: "Target" },
  { id: "first-colonial", nickname: "First Colonial Target", name: "Target First Colonial", chain: "Target", retailer: "Target" },
  { id: "greenbrier-target", nickname: "Greenbrier Target", name: "Target Greenbrier", chain: "Target", retailer: "Target" },
  { id: "greenbrier-bn", nickname: "Greenbrier Barnes & Noble", name: "Barnes & Noble Greenbrier", chain: "Barnes & Noble", retailer: "Barnes & Noble" },
];

assert.equal(parseDropRadarShorthand("RM T 5/12 15:24 Pokemon restock", aliasStores, { year: 2026 }).storeName, "Redmill Target");
assert.equal(parseDropRadarShorthand("Pem T 5/12 15:24 Pokemon restock", aliasStores, { year: 2026 }).storeName, "Pembroke Target");
assert.equal(parseDropRadarShorthand("FC 5/12 15:24 Pokemon restock", aliasStores, { year: 2026 }).storeName, "First Colonial Target");
assert.equal(parseDropRadarShorthand("GB 5/12 15:24 Pokemon restock", aliasStores, { year: 2026 }).storeName, "Greenbrier Target");
assert.equal(parseDropRadarShorthand("GB B&N 5/12 15:24 stocked", aliasStores, { year: 2026 }).storeName, "Greenbrier Barnes & Noble");

console.log("Store expansion utility tests passed.");
