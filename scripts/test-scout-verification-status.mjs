import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { hasConfirmedScoutReportStatus, hasVerifiedScoutReportStatus } from "../src/utils/scoutReportVerification.mjs";
import { buildContributionSummary, scoutReportIsConfirmed } from "../src/utils/communityProfile.js";
import { buildStoreActivitySummary } from "../src/utils/storeProfileUtils.js";
import { restockReportTrustLabel } from "../src/utils/restockFeedPresentation.mjs";

const require = createRequire(import.meta.url);
const espree = require("espree");
const source = fs.readFileSync(new URL("../src/pages/Scout.jsx", import.meta.url), "utf8");
const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true }, range: true });
let scoreFunction;
let trustedShopPredicate;
function visit(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "FunctionDeclaration" && node.id?.name === "scoutSignalConfidencePercent") {
    assert.equal(scoreFunction, undefined, "Use the single actual Scout score function");
    scoreFunction = source.slice(...node.range);
  }
  if (node.type === "VariableDeclarator" && node.id?.name === "verifiedCount") {
    const call = node.init?.type === "MemberExpression" && node.init.property.name === "length" ? node.init.object : null;
    if (call?.type === "CallExpression" && call.callee?.property?.name === "filter") {
      assert.equal(trustedShopPredicate, undefined, "Use the single actual trusted-shop verification predicate");
      trustedShopPredicate = source.slice(...call.arguments[0].range);
    }
  }
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value?.type) visit(value);
}
visit(ast);
assert.ok(scoreFunction && trustedShopPredicate, "Extract actual UI behavior, not a mirrored implementation");
const ui = new Function("hasVerifiedScoutReportStatus", `${scoreFunction}\nreturn { score: scoutSignalConfidencePercent, trusted: ${trustedShopPredicate} };`)(hasVerifiedScoutReportStatus);

let checks = 0;
function equal(actual, expected, label) { assert.equal(actual, expected, label); checks++; }
const store = { id: "verification-store", name: "Verification Store", chain: "Target", city: "Review City", state: "VA" };
const report = (values = {}) => ({ storeId: store.id, storeName: store.name, userId: "verification-owner", reportDate: "2026-10-19", reportType: "restock", ...values });
const storeConfirmedCount = (row) => buildStoreActivitySummary(store, { reports: [row] }).confirmedReports.length;
const unconfirmed = ["unverified", "unconfirmed", "not_verified", "not_confirmed", "not verified", "not-verified", "pending", "needs_review", "UNVERIFIED", "verified pending"];

for (const status of unconfirmed) {
  equal(hasConfirmedScoutReportStatus(status), false, `${status} is not a confirmed status`);
  equal(hasVerifiedScoutReportStatus(status), false, `${status} is not a verified status`);
  for (const field of ["verificationStatus", "verification_status"]) {
    const row = report({ status, [field]: status });
    equal(ui.score(row), 48, `${field}=${status} must not inflate the fallback score`);
    equal(Boolean(ui.trusted(row)), false, `${field}=${status} must not count as a verified shop report`);
    equal(scoutReportIsConfirmed(row), false, `${field}=${status} must not raise contribution reputation`);
    equal(storeConfirmedCount(row), 0, `${field}=${status} must not create confirmed store history`);
    equal(restockReportTrustLabel(row), "Needs confirmation", `${field}=${status} stays visibly unconfirmed`);
  }
  for (const field of ["status", "confidence", "sourceType"]) {
    equal(storeConfirmedCount(report({ [field]: status })), 0, `${field}=${status} must not create confirmed store history`);
  }
}

for (const status of ["verified", "Verified", " verified ", "verified_user_report", "community verified", "admin-verified", "staff_verified", "shop_verified", "admin_verified_report"]) {
  const row = report({ verificationStatus: status });
  equal(ui.score(row), 88, `${status} retains its verified confidence`);
  equal(Boolean(ui.trusted(row)), true, `${status} retains its verified shop contribution`);
  equal(scoutReportIsConfirmed(row), true, `${status} retains its confirmed contribution`);
  equal(storeConfirmedCount(row), 1, `${status} retains confirmed store history`);
}

for (const status of ["confirmed", "Confirmed", "confirmed_restock", "community confirmed", "admin_confirmed", "staff-confirmed", "shop confirmed"]) {
  const row = report({ verificationStatus: status });
  equal(hasConfirmedScoutReportStatus(status), true, `${status} remains an explicit confirmed status`);
  equal(scoutReportIsConfirmed(row), true, `${status} retains confirmed contribution history`);
  equal(storeConfirmedCount(row), 1, `${status} retains confirmed store history`);
  equal(Boolean(ui.trusted(row)), false, `${status} does not expand Scout's verified-only counter`);
}

for (const legacy of ["stock_on_shelf", "Restock Happening Now", "admin_entered", "historical", "historical_import"]) {
  equal(storeConfirmedCount(report({ sourceType: legacy })), 1, `${legacy} retains explicit legacy store-history recognition`);
}
for (const status of ["rejected", "duplicate", "stale"]) {
  equal(storeConfirmedCount(report({ verified: true, status })), 0, `${status} remains excluded from store confirmed history`);
}
const explicit = report({ verified: true, verificationStatus: "unverified" });
equal(ui.score(explicit), 88, "Existing explicit verified flags retain their interpretation");
equal(Boolean(ui.trusted(explicit)), true, "Existing explicit verified flags retain their verified counter");
equal(ui.score(report({ verificationStatus: "unverified", confidenceScore: 26 })), 26, "Saved numeric confidence is unchanged");
equal(ui.score(report({ verificationStatus: "unverified", confidence: "possible" })), 58, "Other confidence tiers are unchanged");
const summary = buildContributionSummary({ userId: "verification-owner" }, {
  scoutReports: [report({ verificationStatus: "unverified" }), report({ verification_status: "not_verified" }), report({ status: "unconfirmed" }), report({ verificationStatus: "verified" })],
});
equal(summary.confirmedReports, 1, "Only the explicitly verified report raises confirmed contribution totals");
equal(summary.helpfulReports, 1, "Unverified saves do not inflate helpful-report reputation");

console.log(`Scout verification status: ${checks} checks passed.`);
