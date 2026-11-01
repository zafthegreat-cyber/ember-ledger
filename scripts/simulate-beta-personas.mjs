// Persona walkthroughs for the simulated beta. Each persona walks the main beta
// flows and every step is decided by the app's real access, gating, safety and
// onboarding modules, so "stuck" means the code would actually stop or lock
// that user. Population weights come from the data-scale run when available.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { PERSONAS } from "./lib/beta-simulation-worker.mjs";
import {
  canUseFeature, getLockedFeatureDetails, FEATURE_GATES, FEATURE_LABELS, TIER_PRICING, PLAN_IDS,
} from "../src/services/featureGates.js";
import { betaAccessAllowedForProfile } from "../src/utils/betaAccessUtils.js";
import {
  betaAccessWaitlistMessage, buildOnboardingChecklist, isOpenAccessState, openAccessStatesLabel, ONBOARDING_CHECKLIST_ITEMS, onboardingChecklistForGoals, shouldShowFirstRunOnboarding, getEmptyStateGuidance,
} from "../src/utils/onboardingGuidance.js";
import { canUserCreateTidepoolPost, buildTidepoolPost, tidepoolStatusVisibility } from "../src/utils/tidepoolCommunity.js";
import { validateTidepoolPostDraft } from "../src/utils/communitySafety.js";
import { validateSparkApplication } from "../src/utils/kidsProgramSafety.js";
import { describeExport } from "../src/utils/exportDisclosure.mjs";

const OUT_DIR = resolve("artifacts/qa/beta-simulation-100k");
let population = null;
try { population = JSON.parse(await readFile(resolve(OUT_DIR, "results.json"), "utf8")).users.byPersona; } catch { population = null; }
const total = population ? Object.values(population).reduce((a, b) => a + b, 0) : 100000;
const share = (persona) => population ? (population[persona.key] || 0) / total : persona.weight / PERSONAS.reduce((a, b) => a + b.weight, 0);

const STATES = [["VA", 0.8], ["NC", 0.08], ["MD", 0.05], ["TX", 0.04], ["CA", 0.03]];

function walkPersona(persona) {
  const profile = { tier: persona.tier, betaStatus: "approved", appAccess: true };
  const kidBlocked = persona.role === "kid";
  const steps = [];
  const step = (flow, name, outcome, detail = "", severity = "info") => steps.push({ flow, name, outcome, detail, severity });

  // 1. Access and waitlist
  const outsideOpenStates = STATES.filter(([state]) => !isOpenAccessState(state)).reduce((sum, [, weight]) => sum + weight, 0);
  step("Access", `Sign up from outside the open states (${openAccessStatesLabel()})`, "waitlisted", `${Math.round(outsideOpenStates * 100)}% of sign-ups in the modelled mix are outside the open states and see: "${betaAccessWaitlistMessage("GA")}"`, outsideOpenStates > 0.5 ? "warning" : "info");
  const pending = betaAccessAllowedForProfile({ ...profile, appAccess: false, betaStatus: "pending" });
  step("Access", "Open the app while beta approval is pending", pending ? "allowed" : "blocked", pending ? "Pending users get in (unexpected)." : "Pending users are held at the approval screen until an admin approves them; a 10% pending share means roughly 1 in 10 testers wait on a human.", pending ? "high" : "warning");

  // 2. Onboarding
  const shown = shouldShowFirstRunOnboarding({ hasUser: true, appAccessAllowed: true, onboarding: {} });
  const personaGoals = persona.key.includes("seller") ? ["seller_forge"] : persona.key === "scout" ? ["scout_reports"] : persona.role === "kid" || persona.key.includes("family") ? ["parent_family"] : persona.key.includes("collector") ? ["collector_vault"] : [];
  const scopedChecklist = onboardingChecklistForGoals(personaGoals);
  step("Onboarding", "First-run onboarding appears", shown ? "ok" : "missing", shown ? `${scopedChecklist.length} of ${ONBOARDING_CHECKLIST_ITEMS.length} checklist items shown for this persona's goals (${personaGoals.join(", ") || "none chosen"}); seller and scout steps are hidden for everyone else.` : "New users would not see onboarding.", shown ? "info" : "high");
  const checklist = buildOnboardingChecklist({ vaultItems: persona.items[1] ? 1 : 0, hasPublicUsername: true }, { goals: personaGoals });
  step("Onboarding", "Checklist completion after first real action", `${checklist.filter((item) => item.completed).length}/${checklist.length}`, `${checklist.length} items shown, all relevant to the chosen goals.`, "info");

  // 3. Persona flows against real gates
  const want = {
    "family-parent": ["vault_basic", "portfolio_value", "set_completion", "kid_profiles", "kid_safe_vault", "family_vault", "collection_export", "spark_family_reminders", "scout_reports_basic"],
    "kid-with-parent": ["vault_basic", "wishlist_basic", "kid_wishlists", "set_completion"],
    "casual-collector": ["vault_basic", "portfolio_value", "set_completion", "price_history", "collection_export", "saved_market_searches", "scout_current_details"],
    "active-seller": ["forge_inventory", "sales_tracking", "expenses", "mileage", "profit_loss", "marketplace_exports", "business_reports", "collection_export"],
    "power-seller": ["forge_inventory", "sales_tracking", "expenses", "mileage", "profit_loss", "marketplace_exports", "business_reports", "deal_finder", "shop_profile_tools"],
    "scout": ["scout_reports_basic", "scout_current_details", "portfolio_value", "wishlist_alerts", "collection_export"],
    "new-lurker": ["vault_basic", "catalog_basic_search", "portfolio_value", "set_completion", "scout_reports_basic"],
  }[persona.key] || [];
  for (const feature of want) {
    const allowed = canUseFeature(profile, feature);
    if (allowed) step("Features", FEATURE_LABELS[feature] || feature, "available");
    else {
      const locked = getLockedFeatureDetails(feature);
      step("Features", FEATURE_LABELS[feature] || feature, "locked", `${locked.title || "Locked"}: ${locked.description} (needs ${locked.tierLabel}; this persona is on ${persona.tier}).`, ["forge_inventory", "sales_tracking", "kid_profiles"].includes(feature) ? "high" : "warning");
    }
  }

  // 4. Community and kids
  const canPost = canUserCreateTidepoolPost({ betaAccessAllowed: true, blocked: kidBlocked });
  if (persona.role === "kid") step("Tidepool", "Kid tries to post", canPost ? "allowed" : "blocked", canPost ? "Restricted kid profile could post (unsafe)." : "Restricted kid profiles cannot create Tidepool posts; they can read.", canPost ? "high" : "info");
  else {
    const draft = buildTidepoolPost({ title: "Shop update", body: "Found booster bundles at the shop today." }, {});
    step("Tidepool", "Post a safe update", validateTidepoolPostDraft({ title: "Shop update", body: "Found booster bundles today." }) ? "blocked" : "accepted", `New posts start as "${draft.status}" (${tidepoolStatusVisibility(draft.status)} visibility), so nothing is public until a moderator reviews it.`, "info");
    const unsafe = validateTidepoolPostDraft({ title: "Trade", body: "Text me at 757-555-0199, meet at 123 Main Street." });
    step("Tidepool", "Post with a phone number and address", unsafe ? "blocked" : "accepted", unsafe || "Private contact details were accepted (unsafe).", unsafe ? "info" : "high");
    const subtle = validateTidepoolPostDraft({ title: "Trade", body: "Message me on Insta, I give my number there and we can meet up after school by the bus loop." });
    step("Tidepool", "Post steering kids off-platform without a number", subtle ? "blocked" : "accepted", subtle ? subtle : "Off-platform steering with no digits or address passes the safety check and relies on moderation review before publishing.", subtle ? "info" : "warning");
  }
  if (persona.key === "family-parent") {
    const base = { parentName: "Parent", email: "parent@example.com", childAgeRange: "6_8", favoritePokemon: "Eevee", requestedAccess: ["packs"], agreesNoResale: true, consentContact: true };
    const missingRange = validateSparkApplication({ ...base, childAgeRange: "" });
    step("The Spark", "Apply without choosing an age range", missingRange ? "blocked" : "accepted", missingRange, missingRange ? "info" : "high");
    const leak = validateSparkApplication({ ...base, reason: "Born 05/14/2019" });
    step("The Spark", "Application text includes an exact birthdate", leak ? "blocked" : "accepted", leak || "Exact birthdate accepted.", leak ? "info" : "high");
  }

  // 5. Exports
  if (persona.key.includes("seller")) {
    const sentence = describeExport({ format: "csv/json", fields: ["date", "platform", "itemName", "grossSale", "costBasis", "buyerName", "notes"], recordCount: persona.sales[1] }).sentence;
    step("Forge", "Export sales records", "described first", sentence, "info");
  }
  if (["family-parent", "casual-collector"].includes(persona.key)) {
    step("Vault", "Export portfolio with values hidden", "described first", describeExport({ kind: "portfolio-csv", format: "csv", recordCount: persona.items[1], includeValues: false }).sentence, "info");
  }

  // 6. Empty states for the first visit
  for (const key of ["vault", "forge", "hearth"]) {
    const guidance = getEmptyStateGuidance(key);
    if (!guidance?.title && !guidance?.message && !guidance?.description) step("Empty states", `${key} empty state`, "missing", "", "warning");
  }

  const locked = steps.filter((entry) => entry.outcome === "locked").length;
  const blockers = steps.filter((entry) => entry.severity === "high").length;
  const frictionScore = Math.round((locked * 2 + blockers * 5 + steps.filter((entry) => entry.severity === "warning").length) * 10) / 10;
  return { persona: persona.key, tier: persona.tier, share: share(persona), simulatedUsers: population?.[persona.key] ?? null, frictionScore, steps };
}

// Pricing copy vs. gates: promises in the Free card that the gate table locks.
function pricingConsistency() {
  const findings = [];
  // Lines that start with "Not included" list what Free does NOT get; they are not promises.
  const freeFeatures = TIER_PRICING[PLAN_IDS.FREE].features.filter((line) => !/^not included/i.test(line)).join(" ").toLowerCase();
  const claims = [["collection value", "portfolio_value"], ["set progress", "set_completion"], ["forge ledger", "forge_inventory"], ["card search", "catalog_basic_search"], ["wishlist", "wishlist_basic"]];
  for (const [phrase, feature] of claims) {
    if (!freeFeatures.includes(phrase)) continue;
    const free = canUseFeature(PLAN_IDS.FREE, feature);
    if (!free) findings.push({ phrase, feature, gate: FEATURE_GATES[feature], note: `Free plan copy promises "${phrase}" but ${feature} is gated to ${FEATURE_GATES[feature].join("/")}. Either the copy means a lighter sub-feature or the gate is wrong; confirm in the Vault UI.` });
  }
  return findings;
}

const walkthroughs = PERSONAS.map(walkPersona);
const pricing = pricingConsistency();
const weightedFriction = walkthroughs.reduce((sum, entry) => sum + entry.frictionScore * entry.share, 0);
const blockedByFlow = {};
for (const entry of walkthroughs) for (const step of entry.steps) if (["locked", "blocked", "waitlisted", "missing"].includes(step.outcome) && step.severity !== "info") blockedByFlow[step.flow] = (blockedByFlow[step.flow] || 0) + Math.round(entry.share * total);
const results = { generatedAt: new Date().toISOString(), population: population || "weights", total, weightedFriction, blockedByFlow, pricing, walkthroughs };
await mkdir(OUT_DIR, { recursive: true });
await writeFile(resolve(OUT_DIR, "personas.json"), JSON.stringify(results, null, 2));
for (const entry of walkthroughs) {
  console.log(`\n== ${entry.persona} (${entry.tier}) · ${(entry.share * 100).toFixed(1)}% of users · friction ${entry.frictionScore}`);
  for (const step of entry.steps.filter((s) => s.severity !== "info" || s.outcome === "locked")) console.log(`  [${step.severity}] ${step.flow} / ${step.name}: ${step.outcome}${step.detail ? ` — ${step.detail.slice(0, 160)}` : ""}`);
}
console.log("\nPricing copy vs gates:", pricing.length ? pricing.map((f) => f.note).join("\n") : "consistent");
console.log("Weighted friction:", weightedFriction.toFixed(2), "| blocked users by flow:", JSON.stringify(blockedByFlow));
