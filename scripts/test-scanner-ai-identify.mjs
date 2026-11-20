import assert from "node:assert/strict";
import { test } from "node:test";
import { AI_SCAN_SCHEMA, aiScanAccess, aiScanUserText, createAiScanHandler, normalizeAiScanResult, parseAiScanRequest } from "../supabase/functions/scanner-ai-identify/core.mjs";
import { aiScanSuggestions, describeAiScan } from "../src/utils/aiScanText.mjs";

const PHOTO = { mediaType: "image/jpeg", data: Buffer.from("fake jpeg bytes").toString("base64") };
const GOOD = JSON.stringify({ found: true, itemType: "card", game: "Pokemon", name: "Charizard ex", setName: "Scarlet & Violet 151", setCode: "MEW", cardNumber: "199/165", variant: "Special Illustration Rare", language: "English", gradingCompany: "", grade: "", certNumber: "", searchQuery: "Charizard ex 199/165", confidence: "high", notes: "" });

function harness({ profile = { tier: "collector" }, used = 0, limit = 3, identify = async () => GOOD } = {}) {
  const state = { used, returned: 0, calls: 0 };
  const handler = createAiScanHandler({
    limit,
    getUser: async (token) => (token === "good" ? { id: "u1" } : null),
    getProfile: async () => profile,
    takeScan: async (_id, max) => (state.used >= max ? -1 : max - ++state.used),
    returnScan: async () => { state.returned += 1; state.used -= 1; },
    identify: async (input) => { state.calls += 1; return identify(input); },
  });
  const call = (body = { kind: "card", image: PHOTO }, token = "good") => handler(new Request("https://x/scan", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
  return { state, call };
}

test("only paid plans and staff get AI scans; kids' accounts never do", () => {
  assert.equal(aiScanAccess({ tier: "free" }).allowed, false);
  assert.equal(aiScanAccess({ tier: "collector" }).allowed, true);
  assert.equal(aiScanAccess({ tier: "free", plan_tier: "Seller-Pro" }).allowed, true);
  assert.equal(aiScanAccess({ tier: "free", app_role: "owner" }).allowed, true);
  assert.equal(aiScanAccess({ tier: "family", is_minor: true }).reason, "minor");
  assert.equal(aiScanAccess(null).allowed, false);
});

test("requests are checked before anything is charged or sent", async () => {
  assert.match(parseAiScanRequest({ image: { mediaType: "image/gif", data: "AAAA" } }).error, /JPEG/);
  assert.match(parseAiScanRequest({ image: { mediaType: "image/jpeg", data: "not base64!" } }).error, /could not be read/);
  assert.match(parseAiScanRequest({ image: { mediaType: "image/jpeg", data: "A".repeat(3_500_000) } }).error, /too large/);
  assert.equal(parseAiScanRequest({ kind: "weird", image: PHOTO }).kind, "card");
  assert.equal(parseAiScanRequest({ image: PHOTO, hint: "a\u0000b".padEnd(400, "x") }).hint.length, 200);

  const signedOut = harness();
  assert.equal((await signedOut.call(undefined, "bad")).status, 401);
  const free = harness({ profile: { tier: "free" } });
  const freeReply = await free.call();
  assert.equal(freeReply.status, 403);
  assert.equal((await freeReply.json()).code, "upgrade");
  assert.equal(free.state.calls, 0);
  const notReady = createAiScanHandler({ getUser: async () => ({ id: "u1" }), getProfile: async () => ({ tier: "seller" }), takeScan: async () => { throw new Error("should not charge"); }, returnScan: async () => {}, identify: async () => GOOD, isReady: () => false });
  assert.equal((await notReady(new Request("https://x", { method: "POST", headers: { authorization: "Bearer t" }, body: "{}" }))).status, 503);
  const badPhoto = harness();
  assert.equal((await badPhoto.call({ image: { mediaType: "image/gif", data: "AAAA" } })).status, 400);
  assert.equal(badPhoto.state.used, 0);
});

test("daily limit is enforced and failed AI calls are given back", async () => {
  const run = harness({ limit: 2 });
  const first = await run.call();
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.result.searchQuery, "Charizard ex 199/165");
  assert.equal(body.remaining, 1);
  assert.equal((await run.call()).status, 200);
  const limited = await run.call();
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).code, "limit");
  assert.equal(run.state.calls, 2);

  const broken = harness({ identify: async () => { throw new Error("refusal"); } });
  const failed = await broken.call();
  assert.equal(failed.status, 502);
  assert.equal(broken.state.returned, 1);
  assert.equal(broken.state.used, 0);
  const junk = harness({ identify: async () => "not json" });
  assert.equal((await junk.call()).status, 502);
  assert.equal(junk.state.used, 0);
});

test("model output is cleaned and never trusted blindly", () => {
  const result = normalizeAiScanResult({ found: true, itemType: "hack", name: "Pikachu\u0007 ".padEnd(300, "x"), cardNumber: "025/165", certNumber: "12 34<script>", confidence: "certain", searchQuery: "" });
  assert.equal(result.itemType, "other");
  assert.equal(result.confidence, "low");
  assert.equal(result.name.length, 120);
  assert.equal(result.certNumber, "1234script");
  assert.match(result.searchQuery, /^Pikachu/);
  assert.equal(normalizeAiScanResult({ found: true, name: "", searchQuery: "" }).found, false);
  assert.equal(normalizeAiScanResult("{bad"), null);
  assert.equal(normalizeAiScanResult(GOOD).setCode, "MEW");
});

test("schema and prompt follow structured-output rules", () => {
  assert.equal(AI_SCAN_SCHEMA.additionalProperties, false);
  assert.deepEqual([...AI_SCAN_SCHEMA.required].sort(), Object.keys(AI_SCAN_SCHEMA.properties).sort());
  assert.match(aiScanUserText("slab", "PSA 10"), /graded card.*PSA 10/);
  assert.equal(describeAiScan(JSON.parse(GOOD)), "Charizard ex · 199/165 · Scarlet & Violet 151 · Special Illustration Rare");
  assert.deepEqual(aiScanSuggestions(JSON.parse(GOOD)).map((row) => row.value), ["Charizard ex 199/165", "Charizard ex Scarlet & Violet 151", "Charizard ex"]);
  assert.equal(describeAiScan({ name: "Umbreon", gradingCompany: "PSA", grade: "10", language: "Japanese" }), "Umbreon · PSA 10 · Japanese");
});
