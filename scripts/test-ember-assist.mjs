import assert from "node:assert/strict";

import {
  buildEmberAssistContext,
  buildEmberAssistFallbackResponse,
  filterEmberAssistMessagesForUser,
  getEmberAssistStarterPrompts,
  makeEmberAssistAdminMessage,
  shouldOfferAdminEscalation,
} from "../src/utils/emberAssist.js";

const scoutPrompts = getEmberAssistStarterPrompts({ activeTab: "scout" });
assert.ok(scoutPrompts.includes("How do Scout reports work?"), "Scout should show Scout-aware starter prompts");

const forgePrompts = getEmberAssistStarterPrompts({ activeTab: "inventory" });
assert.ok(forgePrompts.includes("Help me set a planned sale price"), "Forge should show seller-oriented starter prompts");

const dropContext = buildEmberAssistContext({ activeTab: "scout", scoutView: "alerts" });
const dropAnswer = buildEmberAssistFallbackResponse("What is Drop Radar?", dropContext);
assert.match(dropAnswer.answer, /educated guesses, not promises/i);
assert.match(dropAnswer.answer, /Confirmed Scout reports matter more/i);

const vaultForgeAnswer = buildEmberAssistFallbackResponse("What should I do with this item?", buildEmberAssistContext({ activeTab: "vault" }));
assert.match(vaultForgeAnswer.answer, /personal collection/i);
assert.match(vaultForgeAnswer.answer, /plan to sell/i);

const sparkAnswer = buildEmberAssistFallbackResponse("Can I get Pokemon for my kid?", buildEmberAssistContext({ activeTab: "kidsProgram" }));
assert.match(sparkAnswer.answer, /cannot promise inventory/i);
assert.match(sparkAnswer.answer, /parent-approved/i);

const taxAnswer = buildEmberAssistFallbackResponse("Are these tax numbers final?", buildEmberAssistContext({ activeTab: "expenses" }));
assert.match(taxAnswer.answer, /not tax advice/i);
assert.match(taxAnswer.answer, /tax professional/i);

const bugAnswer = buildEmberAssistFallbackResponse("My Scout report saved to the wrong store", buildEmberAssistContext({ activeTab: "scout" }));
assert.equal(bugAnswer.shouldEscalate, true);
assert.equal(shouldOfferAdminEscalation("wrong store", bugAnswer), true);
assert.equal(bugAnswer.category, "Wrong Scout report/store");

const adminMessage = makeEmberAssistAdminMessage({
  question: "Product missing",
  details: "I cannot find a Mini Portfolio.",
  category: "Missing product/catalog issue",
  context: buildEmberAssistContext({ activeTab: "market", routeLabel: "Market", publicUsername: "safe_collector" }),
  profile: {
    userId: "user-1",
    publicUsername: "safe_collector",
    displayName: "Safe Collector",
    email: "private@example.com",
    adminNote: "private admin-only note",
  },
  lastResponse: "I do not want to guess.",
});

assert.equal(adminMessage.suggestionType, "ember_assist_admin_message");
assert.equal(adminMessage.targetTable, "ember_assist_messages");
assert.equal(adminMessage.submittedData.publicUsername, "safe_collector");
assert.equal(adminMessage.submittedData.profileReference, "user-1");
assert.equal(JSON.stringify(adminMessage).includes("private@example.com"), false, "Admin message should not include raw email");
assert.equal(JSON.stringify(adminMessage).includes("private admin-only note"), false, "Admin message should not include private admin notes");

const messages = [
  adminMessage,
  makeEmberAssistAdminMessage({
    question: "Other user question",
    context: buildEmberAssistContext({ activeTab: "vault" }),
    profile: { userId: "user-2", publicUsername: "other_user" },
  }),
];
assert.equal(filterEmberAssistMessagesForUser(messages, { userId: "user-1", publicUsername: "safe_collector" }, false).length, 1);
assert.equal(filterEmberAssistMessagesForUser(messages, { userId: "admin" }, true).length, 2);

console.log("Ember Assist tests passed.");
