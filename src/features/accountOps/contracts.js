import { ACCOUNT_OPS_COLLECTIONS, ACCOUNT_OPS_SCHEMA_VERSION, ACCOUNT_OPS_STORAGE_KEY } from "./constants.js";

export const ACCOUNT_OPS_CONTRACT_VERSION = "code3.account-ops.contract.v1";

export const ACCOUNT_OPS_PERSISTENCE_CONTRACT = Object.freeze({
  storageKey: ACCOUNT_OPS_STORAGE_KEY,
  schemaVersion: ACCOUNT_OPS_SCHEMA_VERSION,
  collections: ACCOUNT_OPS_COLLECTIONS,
  authoritativeMode: "LOCAL_ONLY",
  remoteActive: false,
  automaticSignup: false,
  automaticVerification: false,
  automaticPurchasing: false,
  plaintextCredentialStorage: false,
});

export const ACCOUNT_OPS_RELATION_CONTRACT = Object.freeze({
  profiles: Object.freeze({ profileGroupId: "profileGroups" }),
  emailAliases: Object.freeze({ domainId: "emailDomains", profileId: "profiles", retailerId: "retailers-or-preset" }),
  storeAccounts: Object.freeze({ profileId: "profiles", aliasId: "emailAliases", retailerId: "retailers-or-preset" }),
  tasks: Object.freeze({ profileId: "profiles", accountId: "storeAccounts", retailerId: "retailers-or-preset" }),
});
