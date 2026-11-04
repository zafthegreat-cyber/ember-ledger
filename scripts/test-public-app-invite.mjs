import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_APP_INVITE_URL, sharePublicApp } from "../src/features/auth/publicInvite.mjs";

test("native share sends only a public app invitation, never an account or workspace invitation", async () => {
  let payload, copies = 0;
  assert.equal(await sharePublicApp({ share: async value => { payload = value; }, clipboard: { writeText: async () => copies++ } }), "shared");
  assert.deepEqual(Object.keys(payload).sort(), ["text", "title", "url"]);
  const url = new URL(payload.url);
  assert.equal(url.origin, "https://code3tcg.app");assert.equal(url.pathname, "/scout/reports");
  assert.deepEqual([...url.searchParams.keys()], ["utm_source", "utm_medium", "utm_campaign"]);
  assert.equal(url.searchParams.get("utm_source"), "app");assert.equal(copies, 0);
});
test("cancelling the share sheet does not copy or send anything", async () => {
  let copies = 0;
  assert.equal(await sharePublicApp({ share: async () => { throw { name: "AbortError" }; }, clipboard: { writeText: async () => copies++ } }), "cancelled");
  assert.equal(copies, 0);
});
test("an unavailable or failed share sheet falls back to copying the same public URL", async () => {
  for (const share of [undefined, async () => { throw Error("unavailable"); }]) {
    let copied;
    assert.equal(await sharePublicApp({ share, clipboard: { writeText: async value => { copied = value; } } }), "copied");
    assert.equal(copied, PUBLIC_APP_INVITE_URL);
  }
});
test("blocked or absent clipboard access returns a manual-copy state without exposing errors", async () => {
  assert.equal(await sharePublicApp({}), "manual");
  assert.equal(await sharePublicApp({ clipboard: { writeText: async () => { throw Error("private browser details"); } } }), "manual");
});
