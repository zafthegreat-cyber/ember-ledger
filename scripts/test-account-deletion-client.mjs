import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { ACCOUNT_DELETION_CONFIRMATION, accountDeletionError, deleteOwnAccount, fetchAccountDeletionStatus, resolveAccountDeletionUrl } from "../src/services/accountDeletionApi.js";
import { privacyPublisherFromEnv, publicPrivacyRoute } from "../src/config/privacyPolicy.js";
import { routeStateFromPath, pathFromActiveTab } from "../src/utils/appRouteState.js";
const require = createRequire(import.meta.url);
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const owner = "11111111-1111-4111-8111-111111111111";
const body = { password: "synthetic-password", confirmation: ACCOUNT_DELETION_CONFIRMATION };
const status = { ok: true, available: true, state: "ready", accountEmail: "qa@example.invalid", blockers: [], deletionScope: ["Synthetic personal records"], retainedScope: ["Unrelated users and prices"] };
const response = (payload, code = 200) => new Response(JSON.stringify(payload), { status: code, headers: { "content-type": "application/json" } });
const options = { expectedUserId: owner, pageUrl: "https://code3tcg.app/delete-account", apiBase: "", getHeaders: async () => ({ Authorization: "Bearer synthetic" }) };
let cases = 0;
const check = (run) => { run(); cases++; };
const checkAsync = async (run) => { await run(); cases++; };

check(() => assert.equal(publicPrivacyRoute("/delete-account"), "delete"));
check(() => assert.equal(publicPrivacyRoute("/settings/delete-account/"), "delete"));
check(() => assert.equal(publicPrivacyRoute("/privacy"), "privacy"));
check(() => assert.equal(publicPrivacyRoute("/support"), "help"));
for (const path of ["/business", "/bot", "/settings", "/delete-account/anything"]) check(() => assert.equal(publicPrivacyRoute(path), ""));
check(() => assert.equal(routeStateFromPath("/delete-account").activeTab, "deleteAccount"));
check(() => assert.equal(routeStateFromPath("/settings/delete-account").activeTab, "deleteAccount"));
check(() => assert.equal(pathFromActiveTab("deleteAccount"), "/delete-account"));
check(() => assert.equal(privacyPublisherFromEnv().supportEmail, "support@code3tcg.com"));
check(() => assert.equal(privacyPublisherFromEnv().legalName, "Anchor & Wing LLC DBA Code 3 TCG"));
check(() => assert.equal(privacyPublisherFromEnv({ VITE_CODE3_SUPPORT_EMAIL: "support@example.invalid" }).ready, false));

for (const [pageUrl, apiBase, nativeOrigin, valid] of [
  ["https://code3tcg.app", "", () => false, true],
  ["http://127.0.0.1:5252", "", () => false, true],
  ["http://public.example", "", () => false, false],
  ["https://code3tcg.app", "http://public.example", () => false, false],
  ["https://code3tcg.app", "https://user:secret@host.example", () => false, false],
  ["capacitor://localhost", "https://code3tcg.app", () => true, true],
  ["capacitor://localhost", "", () => true, false],
  ["capacitor://localhost", "https://code3tcg.app", () => false, false],
  ["capacitor://localhost", "http://localhost", () => true, false],
]) check(() => valid ? assert.match(resolveAccountDeletionUrl("status", { pageUrl, apiBase, nativeOrigin }), /\/api\/account\/deletion\/status$/) : assert.throws(() => resolveAccountDeletionUrl("delete", { pageUrl, apiBase, nativeOrigin }), { code: "secure_transport_required" }));

await checkAsync(async () => assert.deepEqual(await fetchAccountDeletionStatus({ ...options, fetchImpl: async (_url, init) => { assert.equal(init.method, "GET"); assert.equal(init.cache, "no-store"); assert.equal(init.credentials, "omit"); return response(status); } }), { available: true, state: "ready", accountEmail: status.accountEmail, blockers: [], deletionScope: status.deletionScope, retainedScope: status.retainedScope }));
for (const mutation of [{ state: "deleted" }, { available: "yes" }, { blockers: ["bad"] }, { deletionScope: null }, { retainedScope: [null] }]) await checkAsync(async () => assert.rejects(fetchAccountDeletionStatus({ ...options, fetchImpl: async () => response({ ...status, ...mutation }) }), { code: "invalid_response" }));
await checkAsync(async () => assert.rejects(fetchAccountDeletionStatus({ ...options, fetchImpl: async () => new Response("<html>SPA</html>", { headers: { "content-type": "text/html" } }) }), { code: "invalid_response" }));
await checkAsync(async () => assert.rejects(fetchAccountDeletionStatus({ ...options, expectedUserId: "local-beta", fetchImpl: () => { throw new Error("must not request"); } }), { code: "account_sign_in_required" }));
await checkAsync(async () => assert.rejects(fetchAccountDeletionStatus({ ...options, getHeaders: async () => ({ "X-Code3-Local-Dev": "1" }), fetchImpl: () => { throw new Error("must not request"); } }), { code: "account_sign_in_required" }));
await checkAsync(async () => assert.deepEqual(await deleteOwnAccount(body, { ...options, fetchImpl: async (_url, init) => { assert.equal(init.method, "POST"); assert.deepEqual(JSON.parse(init.body), body); assert.equal(init.redirect, "error"); return response({ ok: true, state: "deleted", localCleanupRequired: true }); } }), { state: "deleted", localCleanupRequired: true }));
for (const mutation of [{ confirmation: "delete" }, { password: "" }, { userId: owner }, { password: "x".repeat(1025) }]) await checkAsync(async () => assert.rejects(deleteOwnAccount({ ...body, ...mutation }, { ...options, fetchImpl: () => { throw new Error("must not request"); } }), { code: "invalid_confirmation" }));
for (const code of ["account_reauthentication_failed", "account_deletion_pending", "account_deletion_busy", "account_protected_owner", "account_storage_review_required", "account_data_review_required"]) await checkAsync(async () => assert.rejects(deleteOwnAccount(body, { ...options, fetchImpl: async () => response({ ok: false, error: { code, message: "Untrusted internal database details" } }, 409) }), { code, message: accountDeletionError(code).message }));
await checkAsync(async () => assert.rejects(deleteOwnAccount(body, { ...options, fetchImpl: async () => { throw new Error("network unavailable"); } }), { code: "outcome_unknown" }));
await checkAsync(async () => assert.rejects(deleteOwnAccount(body, { ...options, fetchImpl: async () => response({ ok: true, state: "queued", localCleanupRequired: true }) }), { code: "invalid_response" }));
await checkAsync(async () => assert.rejects(deleteOwnAccount(body, { ...options, signal: AbortSignal.abort(), fetchImpl: () => { throw new Error("must not request"); } }), { name: "AbortError" }));
await checkAsync(async () => assert.rejects(deleteOwnAccount(body, { ...options, requestTimeoutMs: 10, fetchImpl: async () => new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "application/json" } }) }), { code: "outcome_unknown" }));
await checkAsync(async () => assert.rejects(fetchAccountDeletionStatus({ ...options, requestTimeoutMs: 10, fetchImpl: async () => new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "application/json" } }) }), { code: "account_deletion_unavailable" }));
await checkAsync(async () => assert.rejects(fetchAccountDeletionStatus({ ...options, fetchImpl: async () => response({ ...status, accountEmail: "x".repeat(40_000) }) }), { code: "invalid_response" }));
await checkAsync(async () => {
  const controller = new AbortController();
  const pending = deleteOwnAccount(body, { ...options, signal: controller.signal, fetchImpl: async () => { setTimeout(() => controller.abort(), 5); return new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "application/json" } }); } });
  await assert.rejects(pending, { name: "AbortError" });
});

// Exercise the actual merge code and order at the online search call site.
const source = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const ast = parser.parse(source, { sourceType: "module", plugins: ["jsx"] });
const functions = []; let searchArgs;
traverse(ast, {
  FunctionDeclaration(path) { if (["catalogProductMergeKey", "mergeCatalogProductLists"].includes(path.node.id?.name)) functions.push(source.slice(path.node.start, path.node.end)); },
  VariableDeclarator(path) { if (path.node.id.name === "combinedProducts" && path.node.init?.callee?.name === "mergeCatalogProductLists") searchArgs = path.node.init.arguments.map(arg => arg.name); },
});
check(() => assert.deepEqual(searchArgs, ["importedProducts", "localSeedMatches"]));
check(() => {
  const merge = vm.runInNewContext(`${functions.join("\n")}\nmergeCatalogProductLists`);
  const fresh = { id: "same-product", name: "Synthetic card", marketValue: 42, priceUpdatedAt: "2026-10-18" };
  const seed = { id: "same-product", name: "Synthetic card", marketValue: 10, priceUpdatedAt: "2026-01-01" };
  const fallback = { id: "seed-only", marketValue: 7 };
  assert.equal(merge([fresh], [seed, fallback])[0], fresh);
  assert.equal(merge([fresh], [seed, fallback])[1], fallback);
});
console.log(`PASS ${cases} account deletion, public route, publisher, transport, failure, and latest-price client checks; synthetic only.`);
