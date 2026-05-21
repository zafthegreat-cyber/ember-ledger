import assert from "node:assert/strict";

import {
  DILLON_ADMIN_EMAIL,
  OFFICIAL_ADMIN_USERNAMES,
  RESERVED_USERNAME_MESSAGE,
  formatPublicUsername,
  normalizePublicUsername,
  publicIdentityForProfile,
  publicUsernameFromProfile,
  publicUsernameLabel,
  validatePublicUsername,
} from "../src/utils/publicIdentity.js";

const regularProfile = {
  userId: "regular-user",
  email: "collector@example.com",
  firstName: "Regular",
  displayName: "Regular Collector",
  userRole: "user",
};

for (const blocked of [
  "ember",
  "tide",
  "Ember & Tide",
  "ember-and-tide",
  "ember_and_tide",
  "official",
  "admin",
  "official admin tide",
  "official-admin_tide",
  "official.admin.ember",
  "support",
  "staff",
  "moderator",
  "mod",
]) {
  assert.equal(
    validatePublicUsername(blocked, regularProfile, []),
    RESERVED_USERNAME_MESSAGE,
    `${blocked} should be reserved`
  );
}

const dillonProfile = {
  userId: "dillon-admin",
  email: DILLON_ADMIN_EMAIL,
  firstName: "Dillon",
  displayName: "Dillon",
  userRole: "admin",
  isAdmin: true,
};

assert.equal(publicUsernameFromProfile(dillonProfile), OFFICIAL_ADMIN_USERNAMES.tide);
assert.equal(publicUsernameLabel(dillonProfile), "@official admin tide");
assert.equal(validatePublicUsername("official admin tide", dillonProfile, []), "");
assert.equal(formatPublicUsername(OFFICIAL_ADMIN_USERNAMES.tide), "official admin tide");

const zenaAdminProfile = {
  userId: "zena-admin",
  email: "private@example.com",
  firstName: "Zena",
  displayName: "Zena",
  userRole: "admin",
  isAdmin: true,
};

assert.equal(publicUsernameFromProfile(zenaAdminProfile), OFFICIAL_ADMIN_USERNAMES.ember);
assert.equal(publicUsernameLabel(zenaAdminProfile), "@official admin ember");
assert.equal(validatePublicUsername("official admin ember", zenaAdminProfile, []), "");

assert.equal(normalizePublicUsername("@Smoke Trader!"), "smoke_trader");
assert.equal(validatePublicUsername("smoke_trader", regularProfile, ["smoke_trader"]), "@smoke_trader is already used in this local workspace.");
assert.equal(validatePublicUsername("safe_collector_757", regularProfile, []), "");

const identity = publicIdentityForProfile({
  email: "collector@example.com",
  publicUsername: "safe_collector",
  displayName: "Private Real Name",
});

assert.equal(identity.publicUsernameLabel, "@safe_collector");
assert.equal(identity.publicUsernameLabel.includes("collector@example.com"), false);
assert.equal(identity.publicUsernameLabel.includes("Private Real Name"), false);

console.log("Public identity tests passed.");
