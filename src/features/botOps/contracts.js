import { BOT_OPS_COLLECTIONS, BOT_OPS_FORMAT, BOT_OPS_PERSISTENCE_CONTRACT } from "./constants.js";

export const BOT_OPS_CONTRACT_VERSION = BOT_OPS_FORMAT;

export const BOT_OPS_RELATION_CONTRACT = Object.freeze({
  retailerAccountLinks: Object.freeze({
    accountOpsStoreAccountId: "accountOps.storeAccounts",
    accountOpsProfileId: "accountOps.profiles",
  }),
  botProfiles: Object.freeze({ accountOpsProfileId: "accountOps.profiles" }),
  proxyGroups: Object.freeze({ installationId: "installations" }),
  taskGroups: Object.freeze({
    installationId: "installations",
    retailerAccountLinkId: "retailerAccountLinks",
    botProfileId: "botProfiles",
    proxyGroupId: "proxyGroups",
  }),
  tasks: Object.freeze({ taskGroupId: "taskGroups", productTargetId: "productTargets" }),
  attempts: Object.freeze({ taskId: "tasks", checkoutEvidenceId: "checkoutEvidence" }),
  checkoutEvidence: Object.freeze({ taskId: "tasks", attemptId: "attempts" }),
});

export const BOT_OPS_SAFETY_CONTRACT = Object.freeze({
  ...BOT_OPS_PERSISTENCE_CONTRACT,
  collectionCount: BOT_OPS_COLLECTIONS.length,
  retailerCredentialsStored: false,
  botCredentialsStored: false,
  proxyCredentialsStored: false,
  paymentCredentialsStored: false,
  rawProviderLogsStored: false,
  providerAdaptersLive: false,
  purchaseMutationAvailable: false,
  receivingMutationAvailable: false,
  inventoryMutationAvailable: false,
  futureHandoff: Object.freeze([
    "BOT_ATTEMPT",
    "CHECKOUT_EVIDENCE",
    "ORDER_CANDIDATE_RECONCILIATION",
    "OWNER_CONFIRMATION",
    "PURCHASE_FUTURE",
    "RECEIVING_FUTURE",
    "INVENTORY_FUTURE",
  ]),
});
