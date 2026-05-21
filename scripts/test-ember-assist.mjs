import assert from "node:assert/strict";

import {
  buildEmberAssistContext,
  buildEmberAssistFallbackResponse,
  filterEmberAssistMessagesForUser,
  getEmberAssistStarterPrompts,
  makeEmberAssistAdminMessage,
  shouldShowEmberAssistEntry,
  shouldOfferAdminEscalation,
} from "../src/utils/emberAssist.js";

const scoutPrompts = getEmberAssistStarterPrompts({ activeTab: "scout" });
assert.ok(scoutPrompts.includes("How do Scout reports work?"), "Scout should show Scout-aware starter prompts");
assert.ok(scoutPrompts.includes("What should I do first?"), "Starter prompts should include onboarding help");

const forgePrompts = getEmberAssistStarterPrompts({ activeTab: "inventory" });
assert.ok(forgePrompts.includes("Help me set a planned sale price"), "Forge should show seller-oriented starter prompts");
assert.ok(forgePrompts.includes("How do I message admin?"), "Starter prompts should keep admin fallback visible");

const quickAddAnswer = buildEmberAssistFallbackResponse("How do I add inventory?", buildEmberAssistContext({ activeTab: "dashboard" }));
assert.match(quickAddAnswer.answer, /center plus|Quick Add/i);
assert.ok(quickAddAnswer.actions.includes("Open Quick Add"));

const scoutPointsAnswer = buildEmberAssistFallbackResponse("How do Scout points work?", buildEmberAssistContext({ activeTab: "scout" }));
assert.match(scoutPointsAnswer.answer, /confirmed reports|clear store/i);

const adminHelpAnswer = buildEmberAssistFallbackResponse("How do I message admin?", buildEmberAssistContext({ activeTab: "settings" }));
assert.match(adminHelpAnswer.answer, /admin inbox/i);
assert.ok(adminHelpAnswer.actions.includes("Send to Admin"));

const alertsAnswer = buildEmberAssistFallbackResponse("How do alerts work?", buildEmberAssistContext({ activeTab: "dashboard" }));
assert.match(alertsAnswer.answer, /in-app only/i);
assert.match(alertsAnswer.answer, /Confirmed restocks/i);
assert.doesNotMatch(alertsAnswer.answer, /push notifications enabled|email delivery is active|guaranteed/i);

const tidepoolAnswer = buildEmberAssistFallbackResponse("What is Tidepool?", buildEmberAssistContext({ activeTab: "tidepool" }));
assert.match(tidepoolAnswer.answer, /community board/i);
assert.match(tidepoolAnswer.answer, /review first/i);

const tidepoolReportAnswer = buildEmberAssistFallbackResponse("How do I report a post?", buildEmberAssistContext({ activeTab: "tidepool" }));
assert.match(tidepoolReportAnswer.answer, /moderation signal/i);
assert.match(tidepoolReportAnswer.answer, /without publicly showing who reported/i);

const firstStepAnswer = buildEmberAssistFallbackResponse("What should I do first?", buildEmberAssistContext({ activeTab: "dashboard" }));
assert.equal(firstStepAnswer.shouldEscalate, false);
assert.match(firstStepAnswer.answer, /Start with the piece that matches why you came in/i);
assert.match(firstStepAnswer.answer, /Vault is for collection/i);

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

const unknownAnswer = buildEmberAssistFallbackResponse("Can the moon folder sort my cereal?", buildEmberAssistContext({ activeTab: "dashboard" }));
assert.equal(unknownAnswer.shouldEscalate, true);
assert.equal(unknownAnswer.confidence, "low");
assert.match(unknownAnswer.answer, /not sure yet/i);

const adminMessage = makeEmberAssistAdminMessage({
  question: "Product missing",
  details: "I cannot find a Mini Portfolio.",
  category: "Missing product/catalog issue",
  context: buildEmberAssistContext({ activeTab: "market", route: "/market", routeLabel: "Market", publicUsername: "safe_collector" }),
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
assert.equal(adminMessage.submittedData.route, "/market");
assert.equal(adminMessage.submittedData.question, "Product missing");
assert.ok(adminMessage.submittedData.timestamp);
assert.equal(adminMessage.submittedData.deliveryMode, "local_admin_inbox");
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

assert.equal(shouldShowEmberAssistEntry({ hasUser: true, appAccessAllowed: true }), true);
assert.equal(shouldShowEmberAssistEntry({ hasUser: true, appAccessAllowed: false }), false);
assert.equal(shouldShowEmberAssistEntry({ hasUser: true, appAccessAllowed: true, activeTabLocked: true }), false);
assert.equal(shouldShowEmberAssistEntry({ hasUser: false, betaLocalMode: false, guestPreviewActive: true, appAccessAllowed: true }), false);
assert.equal(shouldShowEmberAssistEntry({ betaLocalMode: true, appAccessAllowed: true }), true);

console.log("Ember Assist tests passed.");
