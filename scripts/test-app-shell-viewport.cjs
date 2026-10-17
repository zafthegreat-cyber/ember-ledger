const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

// Requires the existing Vite dev server. The fixture imports only AppShell and
// React; it never mounts App, reads owner storage, or contacts a provider.
const baseUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["http:", "https:"].includes(baseUrl.protocol) && ["127.0.0.1", "localhost", "[::1]"].includes(baseUrl.hostname), "Disposable viewport regression is local-only");
const output = path.join(__dirname, "..", "artifacts", "qa", "app-shell-viewport");

(async () => {
  const browser = await chromium.launch();
  const results = [];
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const width of [360, 1440]) for (const strict of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      try {
        await page.route("**/__qa/app-shell-viewport", route => route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><html><head><title>Isolated AppShell viewport check</title></head><body><div id="fixture"></div></body></html>',
        }));
        await page.goto(new URL("/__qa/app-shell-viewport", baseUrl).href);
        const result = await page.evaluate(async ({ strict }) => {
          const mainSource = await (await fetch("/src/main.jsx")).text();
          const imports = [...mainSource.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]);
          const dependency = filename => {
            const url = imports.find(value => new URL(value, location.href).pathname.endsWith(`/${filename}`));
            if (!url) throw new Error(`Vite React dependency ${filename} was not found.`);
            return url;
          };
          const refresh = await import("/@react-refresh");
          refresh.default.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {};
          window.$RefreshSig$ = () => type => type;
          window.__vite_plugin_react_preamble_installed__ = true;
          window.IS_REACT_ACT_ENVIRONMENT = true;
          const reactModule = await import(dependency("react.js"));
          const React = reactModule.default || reactModule;
          const domModule = await import(dependency("react-dom_client.js"));
          const { createRoot } = domModule.default || domModule;
          const { AppShell } = await import("/src/components/operations/OperationsUI.jsx");
          const viewport = new EventTarget();
          viewport.height = innerHeight;
          viewport.offsetTop = 0;
          const listeners = new Map();
          const add = viewport.addEventListener.bind(viewport);
          const remove = viewport.removeEventListener.bind(viewport);
          viewport.addEventListener = (type, callback, options) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(callback);
            add(type, callback, options);
          };
          viewport.removeEventListener = (type, callback, options) => {
            listeners.get(type)?.delete(callback);
            remove(type, callback, options);
          };
          Object.defineProperty(window, "visualViewport", { configurable: true, value: viewport });
          const root = createRoot(document.getElementById("fixture"));
          const child = React.createElement(AppShell, null, React.createElement("input", { "aria-label": "Synthetic input" }));
          await React.act(async () => root.render(strict ? React.createElement(React.StrictMode, null, child) : child));
          const shell = document.querySelector(".ops-app-shell");
          const snapshot = () => ({
            height: shell.style.getPropertyValue("--ops-visual-viewport-height"),
            offset: shell.style.getPropertyValue("--ops-keyboard-offset"),
            keyboard: shell.getAttribute("data-keyboard-open"),
          });
          const initial = snapshot();
          const listenerCounts = Object.fromEntries([...listeners].map(([key, value]) => [key, value.size]));
          viewport.height = 480;
          viewport.dispatchEvent(new Event("resize"));
          const keyboardOpen = snapshot();
          viewport.offsetTop = 24;
          viewport.dispatchEvent(new Event("scroll"));
          const scrolled = snapshot();
          viewport.height = 790;
          viewport.offsetTop = 30;
          viewport.dispatchEvent(new Event("resize"));
          const clamped = snapshot();
          viewport.height = 480;
          viewport.offsetTop = 0;
          viewport.dispatchEvent(new Event("resize"));
          const beforeUnmount = snapshot();
          await React.act(async () => root.unmount());
          const cleaned = { ...snapshot(), connected: shell.isConnected };
          const remainingListeners = [...listeners.values()].reduce((sum, callbacks) => sum + callbacks.size, 0);
          viewport.height = 700;
          viewport.dispatchEvent(new Event("resize"));
          viewport.dispatchEvent(new Event("scroll"));
          const afterLateEvents = snapshot();

          // Browsers without VisualViewport retain the existing safe fallback.
          Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined });
          const fallbackRoot = createRoot(document.getElementById("fixture"));
          await React.act(async () => fallbackRoot.render(React.createElement(AppShell, null, "Fallback")));
          const fallback = document.querySelector(".ops-app-shell");
          const fallbackResult = { mounted: Boolean(fallback), keyboard: fallback.getAttribute("data-keyboard-open") };
          await React.act(async () => fallbackRoot.unmount());
          return { initial, listenerCounts, keyboardOpen, scrolled, clamped, beforeUnmount, cleaned, remainingListeners, afterLateEvents, fallbackResult };
        }, { strict });
        assert.deepEqual(result.initial, { height: "800px", offset: "0px", keyboard: "false" });
        assert.deepEqual(result.listenerCounts, { resize: 1, scroll: 1 });
        assert.deepEqual(result.keyboardOpen, { height: "480px", offset: "320px", keyboard: "true" });
        assert.deepEqual(result.scrolled, { height: "480px", offset: "296px", keyboard: "true" });
        assert.deepEqual(result.clamped, { height: "790px", offset: "0px", keyboard: "false" });
        assert.equal(result.beforeUnmount.keyboard, "true");
        assert.equal(result.cleaned.keyboard, null, "cleanup must clear the mounted element even after React detaches its ref");
        assert.equal(result.cleaned.connected, false);
        assert.equal(result.remainingListeners, 0);
        assert.deepEqual(result.afterLateEvents, { height: result.cleaned.height, offset: result.cleaned.offset, keyboard: null });
        assert.deepEqual(result.fallbackResult, { mounted: true, keyboard: null });
        assert.deepEqual(errors, []);
        results.push({ width, strict, passed: true, ...result });
        console.log(`PASS AppShell ${width}px ${strict ? "StrictMode" : "normal mount"}`);
      } catch (error) {
        results.push({ width, strict, passed: false, error: error.message, pageErrors: errors });
        throw error;
      } finally {
        await page.close();
      }
    }
  } finally {
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
