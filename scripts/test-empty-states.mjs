import assert from "node:assert/strict";

import {
  CONTEXTUAL_HELP_CARDS,
  EMPTY_STATE_GUIDANCE,
  getContextualHelpCard,
  getEmptyStateGuidance,
} from "../src/utils/onboardingGuidance.js";

const vault = getEmptyStateGuidance("vault");
assert.match(vault.title, /Vault/i);
assert.match(vault.body, /Manual entry/i);
assert.equal(vault.actionTarget, "vault");

const forge = getEmptyStateGuidance("forge");
assert.match(forge.body, /year-end review/i);
assert.doesNotMatch(forge.body, /tax advice|guaranteed deduction|IRS-ready/i);

const dropRadar = getEmptyStateGuidance("drop radar");
assert.match(dropRadar.body, /confirmed restock history/i);
assert.doesNotMatch(dropRadar.body, /guaranteed/i);

const notifications = getEmptyStateGuidance("notifications");
assert.match(notifications.body, /Confirmed restocks/i);
assert.equal(notifications.actionTarget, "alerts");

const kids = getEmptyStateGuidance("kids");
assert.match(kids.body, /parent/i);
assert.match(kids.body, /does not guarantee/i);

assert.equal(getEmptyStateGuidance("unknown").title, EMPTY_STATE_GUIDANCE.vault.title);

const vaultForgeHelp = getContextualHelpCard("vault forge");
assert.equal(vaultForgeHelp.title, CONTEXTUAL_HELP_CARDS.vault_forge.title);
assert.match(vaultForgeHelp.body, /Vault is for collection/i);
assert.match(vaultForgeHelp.body, /Forge is for sellable/i);

const businessHelp = getContextualHelpCard("business_records");
assert.match(businessHelp.body, /review with your tax professional/i);
assert.match(businessHelp.body, /not tax advice/i);
assert.doesNotMatch(businessHelp.body, /guaranteed deduction|official tax report/i);

console.log("Empty-state guidance tests passed.");
