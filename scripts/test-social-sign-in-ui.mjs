import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { SOCIAL_PROVIDERS } from "../src/features/auth/socialAuth.mjs";

const hooks = registerHooks({ load(url, context, next) {
  if (url.endsWith("/features/auth/socialAuthClient.js")) return { format: "module", shortCircuit: true, source: "export const accountLinkingEnabled=false; export const availableSocialProviders=async()=>[]; export const socialAuth={};" };
  if (url.endsWith(".css")) return { format: "module", shortCircuit: true, source: "export default {};" };
  if (url.endsWith(".jsx") && url.includes("/features/auth/")) return { format: "module", shortCircuit: true, source: transformSync(readFileSync(new URL(url), "utf8"), { loader: "jsx", format: "esm", jsx: "automatic" }).code };
  return next(url, context);
} });
const { default: SocialSignIn, ConnectedSignIns } = await import("../src/features/auth/SocialSignIn.jsx");
const { default: SocialBoundary } = await import("../src/features/auth/SocialAuthBoundary.jsx");
let dom, root;
function environment(path = "/") {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "https://code3tcg.app" + path });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, location: dom.window.location, history: dom.window.history, PopStateEvent: dom.window.PopStateEvent, IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot(document.getElementById("root"));
}
afterEach(async () => { if (root) await act(() => root.unmount()); root = null; dom?.window.close(); });
const buttons = () => [...document.querySelectorAll("button")];
const click = button => button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

test("unconfigured providers render no buttons or misleading login promises", async () => {
  environment(); await act(async () => root.render(React.createElement(SocialSignIn, { loadProviders: async () => [] })));
  assert.equal(buttons().length, 0); assert.equal(document.getElementById("root").textContent, "");
});
test("configured provider labels are explicit and duplicate clicks start only once", async () => {
  environment(); let calls = 0, reject;
  const service = { start: () => { calls++; return new Promise((_, no) => { reject = no; }); } };
  await act(async () => root.render(React.createElement(SocialSignIn, { loadProviders: async () => SOCIAL_PROVIDERS, service })));
  assert.deepEqual(buttons().map(button => button.textContent), SOCIAL_PROVIDERS.map(provider => `Continue with ${provider.name}`));
  await act(async () => { click(buttons()[0]); click(buttons()[0]); });
  assert.equal(calls, 1); assert.ok(buttons().every(button => button.disabled));
  await act(async () => reject(new Error("private provider token must stay out of the UI")));
  assert.match(document.querySelector('[role="alert"]').textContent, /could not start/);
  assert.ok(!document.body.textContent.includes("private provider token"));
  assert.ok(buttons().every(button => !button.disabled));
});
test("account connections wait for verified identity and pass only its user ID", async () => {
  environment(); const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"; let resolveIdentity, chosen;
  const service = { verifiedUser: () => new Promise(resolve => { resolveIdentity = resolve; }), start: async (...args) => { chosen = args; } };
  await act(async () => root.render(React.createElement(ConnectedSignIns, { user: { id }, loadProviders: async () => SOCIAL_PROVIDERS, linkingEnabled: true, service })));
  assert.ok(buttons().every(button => button.disabled));
  await act(async () => resolveIdentity({ id, identities: [{ provider: "google" }] }));
  assert.ok(document.body.textContent.includes("Google · Connected"));
  assert.ok(!buttons().some(button => button.textContent === "Connect Google"));
  await act(async () => click(buttons().find(button => button.textContent === "Connect Apple")));
  assert.deepEqual(chosen, ["apple", { mode: "link", userId: id }]);
});
test("callback gate mounts no record writers before verification finishes", async () => {
  environment("/auth/callback?code=fixture_authorization_code_123456789");
  let resolve, writers = 0;
  const service = { finish: () => new Promise(done => { resolve = done; }) };
  function Writer() { useEffect(() => { writers++; }, []); return React.createElement("p", null, "Verified collection"); }
  await act(async () => root.render(React.createElement(SocialBoundary, { service }, React.createElement(Writer))));
  assert.equal(writers, 0); assert.match(document.body.textContent, /Checking your sign-in/);
  await act(async () => resolve({ path: "/find/home" }));
  assert.equal(writers, 1); assert.equal(location.pathname, "/find/home"); assert.equal(location.search, "");
});
test("failed callbacks leave records unmounted and remove all callback details", async () => {
  environment("/auth/callback?error=access_denied&error_description=private-detail");
  await act(async () => root.render(React.createElement(SocialBoundary, { service: { finish: async () => { throw Error("private-token"); } } }, React.createElement("p", null, "Private collection writer"))));
  assert.ok(!document.body.textContent.includes("Private collection writer"));
  assert.ok(!document.body.textContent.includes("private-token"));
  assert.equal(location.search, ""); assert.ok(document.querySelector('[role="alert"]'));
});
test("unexpected callback parameters never call the exchange service", async () => {
  environment("/auth/callback?code=fixture_authorization_code_123456789&next=https://evil.test"); let exchanges = 0;
  await act(async () => root.render(React.createElement(SocialBoundary, { service: { finish: async () => { exchanges++; } } }, React.createElement("p", null, "Private collection writer"))));
  assert.equal(exchanges, 0); assert.ok(document.querySelector('[role="alert"]')); assert.equal(location.search, "");
});
process.on("exit", () => hooks.deregister());
