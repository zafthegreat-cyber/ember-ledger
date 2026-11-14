import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createCatalogMotionController } from "../src/utils/catalogMotion.mjs";
const result = await build({ stdin: { contents: 'export { default } from "./src/components/PhoneMotionControl.jsx";', resolveDir: process.cwd(), loader: "jsx" }, bundle: true, platform: "node", format: "cjs", write: false, jsx: "automatic", loader: { ".css": "empty" }, external: ["react", "react/jsx-runtime"], logLevel: "silent" });
const module = { exports: {} }; new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const Control = module.exports.default;
async function environment(run, { permission, coarse = true, reduced = false } = {}) {
 const dom = new JSDOM('<main id="root"></main>', { url: "https://fixture.invalid", pretendToBeVisual: true }), prior = new Map();
 for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true })) { prior.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, writable: true, configurable: true }); }
 dom.window.DeviceOrientationEvent = function DeviceOrientationEvent() {};
 if (permission) dom.window.DeviceOrientationEvent.requestPermission = permission;
 dom.window.matchMedia = query => ({ matches: query.includes("coarse") ? coarse : reduced, addEventListener() {}, removeEventListener() {} });
 const controller = createCatalogMotionController({ window: dom.window }), root = createRoot(document.getElementById("root"));
 const render = props => act(async () => root.render(React.createElement(Control, { controller, ...props })));
 const click = label => [...document.querySelectorAll("button")].find(button => button.textContent === label)?.click();
 try { await run({ render, click, controller, dom }); }
 finally { await act(async () => root.unmount()); dom.window.close(); for (const [key, descriptor] of prior) if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
}
test("the real permission control asks only after its button is clicked and explains denied access", async () => {
 let calls = 0, result = "denied";
 await environment(async ({ render, click }) => {
  await render(); assert.equal(calls, 0); assert.ok(document.querySelector("button")); assert.match(document.body.textContent, /Use phone tilt/);
  await act(async () => click("Use phone tilt")); assert.equal(calls, 1); assert.match(document.querySelector('[role="status"]').textContent, /not allowed/);
  assert.match(document.body.textContent, /touch controls/);
  result = "granted"; await act(async () => click("Try phone tilt again"));
  assert.equal(document.querySelector('button[aria-pressed="true"]').textContent, "Phone tilt on"); assert.equal(calls, 2);
 }, { permission: async () => { calls++; return result; } });
});
test("on/off and recenter actions use the shared controller without changing records", async () => environment(async ({ render, click, controller }) => {
 const frozen = Object.freeze({ id: "original", quantity: 2, marketPrice: 81.05, cost: 34.99 }), before = JSON.stringify(frozen);
 await render(); assert.match(document.body.textContent, /Center tilt/);
 await act(async () => click("Center tilt")); assert.equal(controller.getState().status, "ready");
 await act(async () => click("Phone tilt on")); assert.equal(controller.getState().status, "off"); assert.equal(document.querySelector('[aria-pressed="false"]').textContent, "Use phone tilt");
 await act(async () => click("Use phone tilt")); assert.equal(controller.getState().enabled, true);
 assert.equal(JSON.stringify(frozen), before);
}));
test("unsupported and reduced-motion devices have a quiet default and optional clear explanation", async () => {
 for (const options of [{ coarse: false }, { reduced: true }]) await environment(async ({ render }) => {
  await render(); assert.equal(document.querySelector("button"), null); assert.equal(document.body.textContent, "");
  await render({ showUnavailable: true }); assert.match(document.body.textContent, /not available|reduced motion/); assert.equal(document.querySelector("button"), null);
 }, options);
});
