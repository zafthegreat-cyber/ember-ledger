import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const input = process.argv[2];
if (!input) throw Error("Pass the original simulated responses.json; this command changes no app configuration.");
const original = JSON.parse(readFileSync(input, "utf8")).items.filter(row => row.category === "improvements");
assert.equal(original.length, 250);
const batch = [15,11,13,7,222,224,231,166,168,167,1,4,5,27,28,30,29,31,216,219];
const acceptance = [
  "Recovery returns the same account-neutral response for registered, unregistered, and confirmed-email provider errors; upstream diagnostics never reach the UI.",
  "Confirmation help calls the real signup resend API with the existing platform callback, validates email, blocks duplicate requests, and explains the next step without staff approval.",
  "Recognized expired email links show fresh-link instructions; recovery and confirmation actions remain distinct. OAuth callbacks retain their separate verification boundary.",
  "All three signup renderers explain public usernames versus account name, email, and password before submission.",
  "The actual feedback form explains staff review, private versus community publication, local fallback, and when staff have not received a response.",
  "Feedback has a stable UUID receipt matching its cloud row, optional account-scoped tab drafts, draft restore/removal, and truthful local-fallback status after failure.",
  "Public support separates feature instructions, account access, bugs, safety, and shop requests; each produces an editable private email draft.",
  "Scout and public support display retailer coverage and explicitly label Best Buy paused for this release.",
  "Coverage explains that paused Best Buy performs no inventory checks and sends no automatic retailer alerts; backend pause and inactive cron are read-only verified.",
  "Coverage distinguishes time-stamped community observations, reviewed reports, and automatic retailer sources without claiming retailer guarantees.",
  "The visitor introduction leads with saving one owned item and seeing it in Vault rather than multiple competing outcomes.",
  "The signed-in introduction has separate collector, seller, and shop paths with suitable next actions; choosing one grants no authority.",
  "The default guide has one recommended collection action wired to the existing Vault add flow and states its visible result.",
  "The default first task asks for one item and allows optional photos, prices, and extra details to wait.",
  "Members can skip the new guide and reopen it from Home or Account without resetting existing onboarding or collection records.",
  "Only introduction path and dismissal are stored under a validated account UUID; another account cannot inherit them, and blocked storage has a usable fallback.",
  "Guide navigation explains optional area preferences, separate Online interests, and optional device location without imposing join eligibility.",
  "The guide pairs six themed destinations with plain functions, and each first-task action names its destination.",
  "Community links describe their distinct discussion, feedback, restock-submission, and alert purposes; external accounts remain optional.",
  "Community guidance separates group membership and Discord sign-in from game/area role opt-ins, app alerts, and device notifications.",
];
const next = [48,50,186,188,191,193,194,196,197,111,112,113,117,119,120,122,123,124,125,128,130,131,132,133,134,135,136,137,138,139,140,146,147,148,149,150,151,152,153,154,156,157,158,159,160,161,162,163,164,165,41,42,43,44,45,36,37,38,39,40,46,47,49,51,52,53,54,55];
const existing = new Set([6,8,9,16,18,19,21,22,23,24,203,204,205,217,223,225,239]);
const dependent = new Set([10,12,14,17,20,25,69,73,86,93,170,174,178,180,183,185,190,198,199,200,206,207,208,209,210,211,212,213,214,215,218,238,249]);
const rest = original.map(row => Number(row.id.slice(3))).filter(n => !batch.includes(n) && !next.includes(n));
// Remaining work is ordered by coherent workflow, with larger evidence/owner-dependent
// work and already-delivered safeguards after new member-facing gaps.
const topicOrder = ["Signup", "Search", "Vault", "Wishlist", "Import", "Price", "Report", "Feedback", "Support", "Navigation", "Community", "Privacy", "Account", "Membership", "Card"];
const topicScore = n => {
  const t = original.find(row => row.id === `IMP${String(n).padStart(3,"0")}`).topic;
  const i = topicOrder.findIndex(word => t.toLowerCase().includes(word.toLowerCase()));
  return i < 0 ? 30 : i;
};
rest.sort((a,b) => (existing.has(a) ? 2 : dependent.has(a) ? 1 : 0) - (existing.has(b) ? 2 : dependent.has(b) ? 1 : 0) || topicScore(a) - topicScore(b) || a-b);
const order = [...batch, ...next, ...rest];
assert.equal(new Set(order).size, 250); assert.equal(order.length,250);
const items = order.map((number,index) => {
  const id = `IMP${String(number).padStart(3,"0")}`, source = original.find(row => row.id === id);
  const rank=index+1;
  return { rank, id, topic: source.topic, originalSuggestion: source.text, syntheticOrigin: true,
    priority: rank<=20 ? "P0 · current batch" : rank<=70 ? "P1 · reliability and report trust" : existing.has(number) ? "Maintain existing safeguards" : dependent.has(number) ? "Assess dependencies first" : "P2 · workflow refinement",
    status: rank<=20 ? "Implemented and locally verified; release details in RELEASE-REVIEW.md" : existing.has(number) ? "Existing baseline; retain and expand acceptance checks, not counted as new work" : "Backlog; scope and baseline must be checked before implementation",
    rationale: rank<=20 ? "Closes an audited open-registration, first-task, feedback, or source-clarity gap with no new provider credentials, retailer polling, or database permissions."
      : existing.has(number) ? "The present build already supplies the core safeguard. Additional validation and discoverability can follow the current gaps."
      : dependent.has(number) ? "Needs real member/device evidence, external account configuration, owner policy, or a separately reviewed operational rollout before completion can be claimed."
      : rank<=70 ? "Protect saved data and make report routing, freshness, visibility, and notification choices dependable before expanding optional features."
      : "Refine a coherent collecting workflow after join reliability and core data/report trust; validate the hypothetical need with actual members.",
    effort: rank<=20 ? ([224,11,15,30].includes(number) ? "Medium" : "Small") : "Estimate during baseline assessment",
    dependency: number===170 ? "Best Buy remains locked paused. Resumption requires a new explicit owner instruction and validation."
      : rank<=20 ? "Existing auth, collection, support, feedback, and account boundaries; no new source activation."
      : existing.has(number) ? "Preserve existing verification, ownership and provider gates."
      : dependent.has(number) ? "Evidence or explicit operational scope required; not authorization to activate a provider or source."
      : "Baseline audit, scoped acceptance criteria, and ordinary-member validation.",
    acceptance: rank<=20 ? acceptance[index] : "Define a scoped implementation and meaningful acceptance checks before marking done.",
  };
});
const plan = { title:"Code 3 TCG — prioritized 250 improvements", prepared:"2026-10-30", basisCommit:"567b0908f687d77556aa19c98d672e397f3eaea7", bestBuy:"Paused; no inventory polling or alert activation authorized", disclaimer:"Original suggestions are synthetic planning prompts, not real member findings. Ranking is product judgment based on the current code audit, not a statistical score or a delivery-date promise.", method:"First: audited join/recovery, privacy, feedback and first-task gaps. Next: data resilience and report/notification trust. Then: workflow refinements. Existing baseline safeguards and work needing credentials, policy or real device/member evidence are retained with dependencies rather than counted as new work. Original IMP identifiers and wording remain unchanged.", items };
const out=resolve("docs/member-improvements");mkdirSync(out,{recursive:true});
writeFileSync(resolve(out,"priority-plan.json"),JSON.stringify(plan,null,2)+"\n");
writeFileSync(resolve(out,"prioritized-250.txt"),[plan.title,plan.disclaimer,plan.method,`Best Buy: ${plan.bestBuy}`,"",...items.flatMap(row=>[`${row.rank}. ${row.id} — ${row.originalSuggestion}`,`   ${row.priority} | ${row.status}`,`   Why: ${row.rationale}`,`   Dependency: ${row.dependency}`,`   Acceptance: ${row.acceptance}`,""])].join("\n"));
console.log(JSON.stringify({items:items.length,uniqueIds:new Set(items.map(row=>row.id)).size,first20:items.slice(0,20).map(row=>row.id),output:out}));
