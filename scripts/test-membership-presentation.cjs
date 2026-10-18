const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { transformSync } = require("esbuild");

(async () => {
  const gates = await import("../src/services/featureGates.js");
  const { resolveExperiencePresentation } = await import("../src/utils/experiencePresentation.js");
  const compiled = transformSync(fs.readFileSync("src/features/deferredViews/MembershipContent.jsx", "utf8"), { loader: "jsx", format: "cjs", jsx: "transform" }).code;
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, exports: module.exports, React });
  const Membership = module.exports.default;
  const h = React.createElement;
  const renderItems = items => items.map(item => h("div", { key: item.key }, item.label, ": ", item.value, " ", item.detail));
  const scope = {
    ...gates,
    AppNavIcon: () => null,
    BETA_LOCAL_MODE: true,
    CommandBoardV4: ({ title, statusItems, children }) => h("main", null, h("h1", null, title), renderItems(statusItems), children),
    CommandBoardSection: ({ title, action, children }) => h("section", null, h("h2", null, title), action, children),
    CommandMetricGrid: ({ items }) => h("div", null, renderItems(items)),
    actualAdminUser: true,
    isTrialActive: () => true,
    currentUserProfile: { tier: "admin", isAdmin: true },
    getLockedFeatureDetails: key => ({ label: key, statusLabel: "Review access", benefit: "Existing feature", guardrail: "Existing permission applies" }),
    openUtilityPage: () => {}, requestLockedFeatureAccess: () => {}, setActiveTab: () => {},
  };
  const cases = [
    { name: "regular collector hides actual administrator status", tier: "free", adminViewingAsAdmin: false },
    { name: "administrator presentation retains administrator status", tier: "admin", adminViewingAsAdmin: true },
    { name: "Free preview shows one watched store and no real trial", tier: "free", preview: true },
    { name: "Seller preview reports its displayed tier", tier: "seller", preview: true },
    { name: "Shop preview reports its displayed tier", tier: "shop", preview: true },
  ];
  for (const testCase of cases) {
    const access = gates.getTierAccess({ tier: testCase.tier });
    const presentation = resolveExperiencePresentation({ adminVisible: true, canPreview: true, preview: { enabled: Boolean(testCase.preview), tier: testCase.tier } });
    const html = renderToStaticMarkup(h(Membership, { scope: { ...scope, currentTier: testCase.tier, currentTierLabel: access.tierLabel, tierAccess: access, adminViewingAsAdmin: Boolean(testCase.adminViewingAsAdmin), experiencePresentation: presentation } }));
    assert.ok(html.includes("proof review, and 1 watched store stay included."), "Free starter copy follows the current Free gate");
    assert.equal(html.includes("Visible for this session"), Boolean(testCase.adminViewingAsAdmin));
    assert.ok(html.includes(`${testCase.preview ? "Preview plan" : "Current plan"}: ${access.tierLabel}`));
    if (testCase.preview) {
      assert.ok(html.includes("Previewing"));
      assert.ok(html.includes("Preview only; your account is unchanged."));
      assert.ok(!html.includes("Trial is active."));
      assert.ok(html.includes(`${access.scoutStoreSlots} Scout watch store`));
      assert.ok(!html.includes("Current plan:"));
    }
    console.log(`PASS ${testCase.name}`);
  }
  console.log(`Membership presentation: ${cases.length}/${cases.length} rendered checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
