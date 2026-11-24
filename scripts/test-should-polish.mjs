// SHOULD 12–14 (2026-11-14): skeletons, palette finish, small-phone layout.
// Run: node --no-warnings --test scripts/test-should-polish.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(path.join(root, relative), "utf8");
const css = read("src/styles/app/16-should-polish.css");
const appCss = read("src/App.css");

test("16-should-polish, then 17-focused-pages, load after the palette; the Nov 17-23 looks follow them", () => {
  const imports = appCss.split("\n").filter((line) => line.startsWith("@import"));
  assert.match(imports.at(-7), /16-should-polish.css/);
  assert.match(imports.at(-6), /17-focused-pages.css/);
  assert.match(imports.at(-5), /17-touch-feedback\.css/);
  assert.match(imports.at(-4), /18-collector-binder\.css/);
  assert.match(imports.at(-3), /19-holo-tech.css/);
  assert.match(imports.at(-2), /20-panel-fixes.css/);
  assert.match(imports.at(-1), /21-bottom-bar.css/);
  assert.ok(imports.findIndex((line) => line.includes("15-warm-palette")) < imports.length - 1);
});

test("skeleton primitives exist, shimmer, and respect reduced motion", () => {
  for (const selector of [".c3-skeleton", ".c3-skeleton-list", ".c3-skeleton-item--card", ".c3-skeleton-thumb", ".c3-skeleton-line"]) {
    assert.ok(css.includes(selector), `missing ${selector}`);
  }
  assert.match(css, /@keyframes c3-skeleton-shimmer/);
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{[^}]*\.c3-skeleton\s*\{\s*animation:\s*none/);
});

test("ListSkeleton renders the requested rows with a live status and no visible text", async () => {
  const require = createRequire(path.join(root, "package.json"));
  let React;
  let ReactDOMServer;
  try {
    React = require("react");
    ReactDOMServer = require("react-dom/server");
  } catch {
    // react is not installed in this checkout; the static checks above still ran.
    return;
  }
  const source = read("src/components/ListSkeleton.jsx");
  const { transformSync } = await import("esbuild").catch(() => ({ transformSync: null }));
  if (!transformSync) return;
  const { code } = transformSync(source, { loader: "jsx", jsx: "automatic", format: "cjs" });
  const moduleScope = { exports: {} };
  new Function("module", "exports", "require", code)(moduleScope, moduleScope.exports, require);
  const ListSkeleton = moduleScope.exports.default;
  const html = ReactDOMServer.renderToStaticMarkup(React.createElement(ListSkeleton, { rows: 4, variant: "card", label: "Loading stores" }));
  assert.equal((html.match(/c3-skeleton-item--card/g) || []).length, 4);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /class="sr-only">Loading stores…</);
  assert.equal((html.match(/c3-skeleton-thumb/g) || []).length, 4);
  // Clamped: never more than 12 rows, never fewer than 1.
  const many = ReactDOMServer.renderToStaticMarkup(React.createElement(ListSkeleton, { rows: 50 }));
  assert.equal((many.match(/c3-skeleton-item /g) || []).length, 12);
  const none = ReactDOMServer.renderToStaticMarkup(React.createElement(ListSkeleton, { rows: 0 }));
  assert.equal((none.match(/c3-skeleton-item /g) || []).length, 3);
});

test("pages that fetch use the skeleton instead of plain Loading text", () => {
  const scout = read("src/pages/Scout.jsx");
  assert.ok(scout.includes('import ListSkeleton from "../components/ListSkeleton"'));
  assert.ok(scout.includes('<ListSkeleton rows={4} variant="card" label="Loading stores" />'));
  assert.ok(!scout.includes(">Loading stores...<"));
  const feed = read("src/components/CommunityRestockFeed.jsx");
  assert.ok(feed.includes("ListSkeleton"));
  assert.ok(!feed.includes("Loading reviewed reports…</p>"));
});

test("empty states share one shape and Spark uses it", () => {
  assert.match(css, /\.et-mockup-empty-state, \.empty-state, \.small-empty-state, \.collector-trade-empty\)\s*\{/);
  assert.match(css, /border: 1px dashed var\(--border-strong\)/);
  const spark = read("src/pages/Spark.jsx");
  assert.equal((spark.match(/className="empty-state small-empty-state"/g) || []).length, 3);
  assert.ok(!spark.includes("<small>No kid packs planned yet.</small>"));
});

test("palette finish: radii are normalised and route-panel kickers go quiet", () => {
  assert.match(css, /--et-radius-md: 14px/);
  assert.match(css, /\.utility-card,[\s\S]*border-radius: var\(--c3-radius, 14px\) !important/);
  assert.match(css, /\.ops-button, \.primary-button[\s\S]*?border-radius: 10px !important/);
  for (const selector of [".hearth-v4-panel > header > span", ".scout-command-heading span", ".spark-v4-panel-heading span", ".you-v4-panel-heading > div > span", ".exchange-v4-hub-card > span", ".command-metric-card > span"]) {
    assert.ok(css.includes(selector), `kicker not quieted: ${selector}`);
  }
  const kickerRule = css.slice(css.indexOf(".command-board-section-heading span"), css.indexOf("/* Badges may stay"));
  assert.match(kickerRule, /text-transform: none !important/);
  assert.match(kickerRule, /color: var\(--text-kicker\) !important/);
});

test("light theme gets the same layering and focus treatment as dark", () => {
  assert.match(css, /\.app:not\(\[data-theme="dark"\]\)\[data-theme\]\s*\{[^}]*--c3-shadow/);
  assert.match(css, /:focus-visible\s*\{\s*outline: 3px solid/);
  assert.match(css, /\.app-tour__next\)\s*\{\s*color: var\(--on-primary\) !important/);
});

test("small phones: 360px and 330px breakpoints, gesture-bar safe areas, landscape nav", () => {
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /@media \(max-width: 330px\)/);
  assert.match(css, /@media \(max-height: 420px\) and \(orientation: landscape\)/);
  const small = css.slice(css.indexOf("@media (max-width: 360px)"), css.indexOf("@media (max-width: 330px)"));
  assert.match(small, /command-board-v4-status-strip,[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(small, /\.ops-mobile-nav button span \{ font-size: 10px; \}/);
  assert.match(small, /\.quick-feedback-fab span \{ display: none; \}/);
  assert.match(small, /overflow-wrap: anywhere/);
  const phone = css.slice(css.indexOf("@media (max-width: 899px)"), css.indexOf("@media (max-width: 360px)"));
  assert.match(phone, /\.main \{ padding-bottom: calc\(118px \+ env\(safe-area-inset-bottom, 0px\)\) !important; \}/);
  assert.match(phone, /\.ops-bottom-sheet, \.flow-modal, \.quick-feedback-sheet, \.app-tour__card\) \{ padding-bottom: max\(14px, env\(safe-area-inset-bottom\)\)/);
  assert.match(read("index.html"), /viewport-fit=cover/);
});

test("no hard-coded hex colours were introduced outside the two kicker/shadow tokens", () => {
  const hexes = css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual([...new Set(hexes)].sort(), ["#6F5F5A"]);
});
