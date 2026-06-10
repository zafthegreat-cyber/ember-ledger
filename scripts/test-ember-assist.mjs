import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildEmberAssistContext,
  buildEmberAssistFallbackResponse,
  filterEmberAssistMessagesForUser,
  getEmberAssistStarterPrompts,
  makeEmberAssistAdminMessage,
  shouldShowEmberAssistEntry,
  shouldOfferAdminEscalation,
} from "../src/utils/emberAssist.js";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

assert.match(appSource, /Collector Guide/, "Ember Assist should include the Collector Guide section");
assert.match(appSource, /Quick Help for Ember & Tide/, "Collector Guide should frame quick help clearly");
assert.match(appSource, /Gentle Guidance/, "Collector Guide should use safe guidance language");
[
  "Add to Vault",
  "Log a Trade",
  "Check a Trade",
  "Save a Price",
  "Watch a Store",
  "Support The Spark",
  "Manage Family Collecting",
  "Understand Tiers",
  "Suggested Next Step",
  "Help Topic",
].forEach((label) => {
  assert.ok(appSource.includes(label), `Collector Guide should include ${label}`);
});
assert.match(appSource, /openAddTradeFlow\(\{ source: "ember-assist-collector-guide-log-trade" \}\)/, "Log a Trade should use the existing Trade Ledger flow");
assert.match(appSource, /openTradeCompassFlow\(\{ source: "ember-assist-collector-guide-trade-compass" \}\)/, "Check a Trade should use the existing Trade Compass flow");
assert.match(appSource, /openTradeCompassFlow\(\{ source: "ember-assist-quick-action-trade-fairness" \}\)/, "Trade fairness quick action should open the existing Trade Compass flow");
assert.match(appSource, /openMarketPriceMemoryFlow\(null, \{ source: "ember-assist-collector-guide-price-memory" \}\)/, "Save a Price should use the existing Price Memory flow");
assert.match(appSource, /Guided suggestions\. No live AI promises\./, "Ember Assist should keep no-live-AI framing visible");
assert.doesNotMatch(appSource, /fake AI backend|backend assistant exists/i, "Collector Guide must not claim a fake backend assistant");

const scoutPrompts = getEmberAssistStarterPrompts({ activeTab: "scout" });
assert.ok(scoutPrompts.includes("How do I add proof?"), "Scout should show Scout-aware starter prompts");
assert.ok(scoutPrompts.includes("Why can't I see full history?"), "Scout should explain protected history");

const forgePrompts = getEmberAssistStarterPrompts({ activeTab: "inventory" });
assert.ok(forgePrompts.includes("How do I add cost basis?"), "Forge should show seller-oriented starter prompts");
assert.ok(forgePrompts.includes("How do I message admin?"), "Starter prompts should keep admin fallback visible");

const hearthPrompts = getEmberAssistStarterPrompts({ activeTab: "dashboard" });
assert.ok(hearthPrompts.includes("How do Ember Points work?"), "Hearth should show Sparks and points prompts");

const adminPrompts = getEmberAssistStarterPrompts({ activeTab: "adminReview", isAdmin: true });
assert.ok(adminPrompts.includes("What reports were flagged?"), "Admins should see admin review prompts");
const nonAdminAdminPrompts = getEmberAssistStarterPrompts({ activeTab: "adminReview", isAdmin: false });
assert.equal(nonAdminAdminPrompts.includes("What reports were flagged?"), false, "Non-admins should not see admin prompts");

const quickAddAnswer = buildEmberAssistFallbackResponse("How do I add inventory?", buildEmberAssistContext({ activeTab: "dashboard" }));
assert.match(quickAddAnswer.answer, /center plus|Quick Add/i);
assert.ok(quickAddAnswer.actions.includes("Open Quick Add"));

const barcodeAnswer = buildEmberAssistFallbackResponse("How do I scan or enter a barcode?", buildEmberAssistContext({ activeTab: "dashboard" }));
assert.match(barcodeAnswer.answer, /Barcode \/ UPC/i);
assert.match(barcodeAnswer.answer, /type the UPC\/SKU manually/i);
assert.match(barcodeAnswer.answer, /code stays attached/i);

const receiptAnswer = buildEmberAssistFallbackResponse("How do I add from a receipt?", buildEmberAssistContext({ activeTab: "expenses" }));
assert.match(receiptAnswer.answer, /structured/i);
assert.match(receiptAnswer.answer, /supplies, mileage\/gas/i);

const bulkAnswer = buildEmberAssistFallbackResponse("How do I add multiple items?", buildEmberAssistContext({ activeTab: "inventory" }));
assert.match(bulkAnswer.answer, /Bulk Add/i);
assert.match(bulkAnswer.answer, /destination, purchaser, cost/i);

const groupedAnswer = buildEmberAssistFallbackResponse("Why did my item group with another item?", buildEmberAssistContext({ activeTab: "vault" }));
assert.match(groupedAnswer.answer, /same product/i);
assert.match(groupedAnswer.answer, /purchaser tallies/i);

const costBasisAnswer = buildEmberAssistFallbackResponse("What is cost basis?", buildEmberAssistContext({ activeTab: "inventory" }));
assert.match(costBasisAnswer.answer, /item cost/i);
assert.match(costBasisAnswer.answer, /tax professional/i);

const missingMarketAnswer = buildEmberAssistFallbackResponse("Why is market value missing?", buildEmberAssistContext({ activeTab: "vault" }));
assert.match(missingMarketAnswer.answer, /known value/i);
assert.match(missingMarketAnswer.answer, /instead of making up a number/i);

const plannedPriceAnswer = buildEmberAssistFallbackResponse("How do I add planned sale price?", buildEmberAssistContext({ activeTab: "inventory" }));
assert.match(plannedPriceAnswer.answer, /Update Planned Price/i);
assert.match(plannedPriceAnswer.answer, /original purchase record/i);

const purchaserBreakdownAnswer = buildEmberAssistFallbackResponse("How do I see what Zena and Dillon purchased?", buildEmberAssistContext({ activeTab: "inventory" }));
assert.match(purchaserBreakdownAnswer.answer, /Zena - 4 and Dillon - 3/i);
assert.doesNotMatch(purchaserBreakdownAnswer.answer, /payout/i);

const scoutPointsAnswer = buildEmberAssistFallbackResponse("How do Scout points work?", buildEmberAssistContext({ activeTab: "scout" }));
assert.match(scoutPointsAnswer.answer, /confirmed reports|clear store/i);

const adminHelpAnswer = buildEmberAssistFallbackResponse("How do I message admin?", buildEmberAssistContext({ activeTab: "settings" }));
assert.match(adminHelpAnswer.answer, /admin inbox/i);
assert.ok(adminHelpAnswer.actions.includes("Send Message to Admin"));

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

const emberPointsAnswer = buildEmberAssistFallbackResponse("How do Ember Points work?", buildEmberAssistContext({ activeTab: "dashboard" }));
assert.match(emberPointsAnswer.answer, /real completed Sparks/i);
assert.match(emberPointsAnswer.answer, /Dismissing a Spark earns zero/i);

const protectedScoutAnswer = buildEmberAssistFallbackResponse("Why can't I see full history?", buildEmberAssistContext({ activeTab: "scout" }));
assert.match(protectedScoutAnswer.answer, /protects raw history/i);
assert.match(protectedScoutAnswer.answer, /current selected-store reports/i);

const marketUpcAnswer = buildEmberAssistFallbackResponse("How do I scan a UPC?", buildEmberAssistContext({ activeTab: "market" }));
assert.match(marketUpcAnswer.answer, /Scan UPC/i);
assert.match(marketUpcAnswer.answer, /weak match/i);

const adminFlagAnswer = buildEmberAssistFallbackResponse("What reports were flagged?", buildEmberAssistContext({ activeTab: "adminReview", isAdmin: true }));
assert.match(adminFlagAnswer.answer, /flagged Scout reports/i);

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
assert.match(unknownAnswer.answer, /not fully sure/i);

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
