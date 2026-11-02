import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { createSocialAuthService, SOCIAL_PROVIDERS, SOCIAL_INTENT_KEY, releasedProviders, webSocialRedirect,
  parseSocialCallback, checkedProviderUrl, loadSocialAvailability } from "../src/features/auth/socialAuth.mjs";

const project = "https://gxsfququorfczvhrkudl.supabase.co";
const origin = "https://code3tcg.app";
const userId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const otherId = "11111111-2222-3333-4444-555555555555";
const code = "fixture_authorization_code_123456789";
const now = Date.now();
function fixture({ signedIn = false, valid = true, returnedId = userId, identity = "google", linkingEnabled = true, native = false } = {}) {
  const memory = new Map(), calls = [];
  const user = id => ({ id, identities: [{ provider: identity }] });
  let primary = signedIn ? { user: user(userId), access_token: "original_fixture_token", refresh_token: "original_fixture_refresh" } : null;
  let temporary = null;
  const rpc = () => ({ async setHeader(name, value) { calls.push(["rpc", name, value]); return { data: valid, error: null }; } });
  const client = { rpc, auth: {
    async getSession() { return { data: { session: primary } }; },
    async getUser(token) { assert.equal(token, primary?.access_token); return { data: { user: primary?.user } }; },
    async setSession(value) { calls.push(["adopt"]); primary = { ...value, user: user(returnedId) }; return { data: { session: primary } }; },
    async signOut() { calls.push(["signOut"]); primary = null; return {}; },
  } };
  const oauthClient = { rpc, auth: {
    async getSession() { return { data: { session: temporary } }; },
    async getUser(token) { assert.equal(token, temporary?.access_token); return { data: { user: temporary?.user } }; },
    async setSession(value) { temporary = { ...value, user: user(userId) }; return { data: { session: temporary } }; },
    async signInWithOAuth(request) { calls.push(["oauth", request]); return { data: { url: project + "/auth/v1/authorize?provider=" + request.provider } }; },
    async linkIdentity(request) { calls.push(["link", request]); return { data: { url: project + "/auth/v1/user/identities/authorize?provider=" + request.provider } }; },
    async exchangeCodeForSession(value) { assert.equal(value, code); calls.push(["exchange"]); temporary = { user: user(returnedId), access_token: "new_fixture_token", refresh_token: "new_fixture_refresh" }; return { data: { user: temporary.user, session: temporary } }; },
  } };
  const service = createSocialAuthService({ client, oauthClient, projectUrl: project, origin, native, now: () => now,
    linkingEnabled, loadAvailability: async () => SOCIAL_PROVIDERS,
    store: { async getItem(key) { return memory.get(key); }, async setItem(key, value) { memory.set(key, value); }, async removeItem(key) { memory.delete(key); } },
    clearOAuthStorage: async () => { calls.push(["clearTemporary"]); temporary = null; },
    launch: async url => { calls.push(["launch", url]); },
  });
  return { service, client, oauthClient, memory, calls, primary: () => primary };
}

test("release gating accepts only the four explicitly verified provider IDs", () => {
  assert.deepEqual(releasedProviders("google,discord,google,administrator,Apple"), ["google", "discord"]);
  assert.deepEqual(releasedProviders(), []);
});
test("unreleased options never fetch provider settings", async () => {
  assert.deepEqual(await loadSocialAvailability({ released: [], fetchImpl: () => assert.fail("No settings request") }), []);
});
test("buttons require both release verification and a live enabled provider", async () => {
  const result = await loadSocialAvailability({ projectUrl: project, publicKey: "public-fixture", released: ["google", "discord"], fetchImpl: async (url, options) => {
    assert.equal(url, project + "/auth/v1/settings"); assert.equal(options.redirect, "error");
    return Response.json({ external: { google: true, apple: true, discord: false, facebook: true } });
  } });
  assert.deepEqual(result.map(provider => provider.id), ["google"]);
});
test("availability errors fail closed without leaking upstream details", async () => {
  await assert.rejects(loadSocialAvailability({ projectUrl: project, publicKey: "public-fixture", released: ["google"], fetchImpl: async () => new Response("private upstream detail", { status: 502 }) }), error => !error.message.includes("private"));
});
test("web redirects are fixed to Code 3 or an explicit local development origin", () => {
  assert.equal(webSocialRedirect(origin), origin + "/auth/callback");
  assert.equal(webSocialRedirect("http://127.0.0.1:5267", true), "http://127.0.0.1:5267/auth/callback");
  for (const value of ["https://evil.test", "https://code3tcg.app.evil.test", "http://code3tcg.app", "https://code3tcg.app/path", "https://code3tcg.app/?next=evil", "http://localhost:5267"]) assert.throws(() => webSocialRedirect(value));
});
test("callbacks reject foreign origins, tokens, duplicate fields and open redirects", () => {
  assert.deepEqual(parseSocialCallback(origin + "/auth/callback?code=" + code, origin), { code, error: false });
  for (const suffix of ["?code=" + code + "&next=//evil.test", "?code=" + code + "&code=other", "#access_token=secret", "?access_token=secret", "?code=short"]) assert.throws(() => parseSocialCallback(origin + "/auth/callback" + suffix, origin));
  assert.throws(() => parseSocialCallback("https://evil.test/auth/callback?code=" + code, origin));
});
test("provider navigation cannot send OAuth data to arbitrary URLs", () => {
  assert.ok(checkedProviderUrl("https://accounts.google.com/o/oauth2/v2/auth?client_id=public", "google", project));
  for (const value of ["https://accounts.google.com.evil.test/o/oauth2/v2/auth", "javascript:alert(1)", "https://user:pass@accounts.google.com/o/oauth2/v2/auth", "https://discord.com/oauth2/authorize"]) assert.throws(() => checkedProviderUrl(value, "google", project));
});
test("Supabase Discord authorization accepts the documented API path without permitting other API routes", () => {
  for (const path of ["/oauth2/authorize", "/api/oauth2/authorize"]) assert.ok(checkedProviderUrl(`https://discord.com${path}?client_id=1563636539370639420`, "discord", project));
  for (const path of ["/api/users/@me", "/api/oauth2/token", "/api/oauth2/authorize/extra"]) assert.throws(() => checkedProviderUrl(`https://discord.com${path}`, "discord", project));
});
test("all four options start with fixed callbacks and no application/bot permissions", async () => {
  for (const provider of SOCIAL_PROVIDERS) {
    const f = fixture(); await f.service.start(provider.id);
    const request = f.calls.find(call => call[0] === "oauth")[1];
    assert.equal(request.options.redirectTo, origin + "/auth/callback");
    assert.equal(request.options.skipBrowserRedirect, true);
    assert.ok(!JSON.stringify(request).includes("bot"));
    if (provider.id === "discord") assert.equal(request.options.scopes, "identify email");
    assert.ok(!JSON.stringify([...f.memory.values()]).includes("token"));
  }
});
test("native sign-in uses the app deep link", async () => {
  const f = fixture({ native: true }); await f.service.start("google");
  assert.equal(f.calls.find(call => call[0] === "oauth")[1].options.redirectTo, "code3tcg://auth/callback?flow=oauth");
});
test("an enabled setting cannot bypass the release/provider availability check", async () => {
  const f = fixture(); await assert.rejects(f.service.start("administrator")); assert.equal(f.calls.length, 0);
});
test("signed-in users must connect a method instead of silently replacing accounts", async () => {
  const f = fixture({ signedIn: true }); await assert.rejects(f.service.start("google"), /already signed in/);
  assert.equal(f.calls.filter(call => call[0] === "oauth").length, 0);
});
test("a successful callback is verified server-side before primary session adoption", async () => {
  const f = fixture(); await f.service.start("google");
  const result = await f.service.finish({ code });
  assert.equal(result.path, "/find/home"); assert.equal(f.primary().user.id, userId);
  assert.ok(f.calls.findIndex(call => call[0] === "rpc") < f.calls.findIndex(call => call[0] === "adopt"));
  assert.equal(f.memory.has(SOCIAL_INTENT_KEY), false);
});
test("React remounts share one authorization-code exchange", async () => {
  const f = fixture(); await f.service.start("google");
  await Promise.all([f.service.finish({ code }), f.service.finish({ code })]);
  assert.equal(f.calls.filter(call => call[0] === "exchange").length, 1);
  assert.equal(f.calls.filter(call => call[0] === "adopt").length, 1);
});
test("a completed callback cannot be reused after signing out", async () => {
  const f = fixture(); await f.service.start("google"); await f.service.finish({ code });
  await f.client.auth.signOut(); await assert.rejects(f.service.finish({ code }));
  assert.equal(f.calls.filter(call => call[0] === "exchange").length, 1);
});
test("missing or expired intent never exchanges a code", async () => {
  for (const expiry of [false, true]) {
    const f = fixture(); if (expiry) { await f.service.start("google"); const intent = JSON.parse(f.memory.get(SOCIAL_INTENT_KEY)); intent.issuedAt -= 16 * 60_000; f.memory.set(SOCIAL_INTENT_KEY, JSON.stringify(intent)); }
    await assert.rejects(f.service.finish({ code }));
    assert.equal(f.calls.filter(call => call[0] === "exchange").length, 0);
  }
});
test("cancelled provider consent preserves the primary account", async () => {
  const f = fixture({ signedIn: true }); await f.service.start("google", { mode: "link", userId });
  await assert.rejects(f.service.finish({ error: true }));
  assert.equal(f.primary().access_token, "original_fixture_token");
  assert.equal(f.calls.filter(call => call[0] === "exchange").length, 0);
});
test("a revoked server session never reaches the primary client", async () => {
  const f = fixture({ valid: false }); await f.service.start("google");
  await assert.rejects(f.service.finish({ code })); assert.equal(f.primary(), null);
  assert.equal(f.calls.filter(call => call[0] === "adopt").length, 0);
});
test("a callback must include the intended verified provider identity", async () => {
  const f = fixture({ identity: "facebook" }); await f.service.start("google");
  await assert.rejects(f.service.finish({ code })); assert.equal(f.primary(), null);
});
test("manual linking is disabled until explicitly configured and verified", async () => {
  const f = fixture({ signedIn: true, linkingEnabled: false });
  await assert.rejects(f.service.start("google", { mode: "link", userId }));
  assert.equal(f.calls.filter(call => call[0] === "link").length, 0);
});
test("manual linking retains the exact server user ID", async () => {
  const f = fixture({ signedIn: true }); await f.service.start("google", { mode: "link", userId });
  const result = await f.service.finish({ code }); assert.equal(result.path, "/settings"); assert.equal(result.userId, userId);
});
test("linking to a different account cannot adopt its session or merge records", async () => {
  const f = fixture({ signedIn: true, returnedId: otherId }); await f.service.start("google", { mode: "link", userId });
  await assert.rejects(f.service.finish({ code }));
  assert.equal(f.primary().access_token, "original_fixture_token");
  assert.equal(f.calls.filter(call => call[0] === "adopt").length, 0);
});
test("the real Supabase SDK emits an S256 PKCE challenge with a separate storage key", async () => {
  const memory = new Map();
  const client = createClient(project, "public-fixture", { auth: { flowType: "pkce", persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "code3-oauth-fixture", storage: { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) } } });
  const result = await client.auth.signInWithOAuth({ provider: "google", options: { skipBrowserRedirect: true, redirectTo: origin + "/auth/callback" } });
  assert.equal(result.error, null); const url = new URL(result.data.url);
  assert.equal(url.searchParams.get("code_challenge_method"), "s256");
  assert.ok(url.searchParams.get("code_challenge"));
  assert.ok(memory.has("code3-oauth-fixture-code-verifier"));
  assert.equal(memory.has("sb-gxsfququorfczvhrkudl-auth-token"), false);
});
