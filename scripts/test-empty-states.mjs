import assert from "node:assert/strict";

import {
  CONTEXTUAL_HELP_CARDS,
  EMPTY_STATE_GUIDANCE,
  getContextualHelpCard,
  getEmptyStateGuidance,
} from "../src/utils/onboardingGuidance.js";

const vault = getEmptyStateGuidance("vault");
assert.equal(vault.title, "Your Vault is ready.");
assert.match(vault.body, /Manual entry/i);
assert.equal(vault.actionTarget, "vault");
assert.deepEqual(vault.actions.map((action) => action.label), ["Add to Vault", "Scan Card", "Add Sealed Product", "Manual Add"]);

const forge = getEmptyStateGuidance("forge");
assert.equal(forge.title, "Your workshop is ready.");
assert.match(forge.body, /planned sales/i);
assert.deepEqual(forge.actions.map((action) => action.label), ["Add Receipt", "Add Product", "Add Mileage"]);
assert.doesNotMatch(forge.body, /tax advice|guaranteed deduction|IRS-ready/i);

const dropRadar = getEmptyStateGuidance("drop radar");
assert.match(dropRadar.body, /confirmed restock history/i);
assert.doesNotMatch(dropRadar.body, /guaranteed/i);

const market = getEmptyStateGuidance("market");
assert.equal(market.title, "Market research is ready.");
assert.deepEqual(market.actions.map((action) => action.label), ["Search Market"]);
assert.match(market.body, /research only/i);
assert.doesNotMatch(market.body, /guaranteed|checkout is active|automatic payment/i);

const notifications = getEmptyStateGuidance("notifications");
assert.match(notifications.body, /Confirmed restocks/i);
assert.equal(notifications.actionTarget, "alerts");

const tidepool = getEmptyStateGuidance("tidepool");
assert.equal(tidepool.title, "The Community is quiet right now.");
assert.deepEqual(tidepool.actions.map((action) => action.label), ["Start a Post"], "no Follow Local Collectors until it exists");
assert.match(tidepool.body, /reviewed before they appear publicly/i);
assert.match(tidepool.body, /save on your device/i);

const kids = getEmptyStateGuidance("kids");
assert.equal(kids.title, "No open requests yet.");
assert.match(kids.body, /parent/i);
assert.match(kids.body, /does not guarantee/i);
assert.deepEqual(kids.actions.map((action) => action.label), ["Request Kid Access", "View Rules"]);

const scout = getEmptyStateGuidance("scout");
assert.equal(scout.title, "Restocks is ready for your first store.");
assert.match(scout.body, /does not guarantee stock/i);

const hearth = getEmptyStateGuidance("hearth");
assert.match(hearth.body, /one Vault item first/i);

const quickAdd = getEmptyStateGuidance("quick add");
assert.match(quickAdd.body, /Choose Vault/i);

const settings = getEmptyStateGuidance("settings");
assert.match(settings.body, /local-only/i);

assert.equal(getEmptyStateGuidance("unknown").title, EMPTY_STATE_GUIDANCE.vault.title);

const vaultForgeHelp = getContextualHelpCard("vault forge");
assert.equal(vaultForgeHelp.title, CONTEXTUAL_HELP_CARDS.vault_forge.title);
assert.match(vaultForgeHelp.body, /Vault is for collection/i);
assert.match(vaultForgeHelp.body, /Business is for sellable/i);

const businessHelp = getContextualHelpCard("business_records");
assert.match(businessHelp.body, /review with your tax professional/i);
assert.match(businessHelp.body, /not tax advice/i);
assert.doesNotMatch(businessHelp.body, /guaranteed deduction|official tax report/i);

console.log("Empty-state guidance tests passed.");
