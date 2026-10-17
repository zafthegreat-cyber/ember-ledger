const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const baseUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5203/");
const artifactDir = path.join(process.cwd(), "artifacts", "qa", "legacy-presentation");
const routes = [
  { name: "scout", path: "/scout", selector: ".scout-command-board-v5" },
  { name: "market", path: "/exchange/market", selector: ".market-command-board" },
  { name: "exchange", path: "/exchange", selector: ".exchange-command-board" },
  { name: "spark", path: "/kids-program", selector: ".spark-command-board" },
  { name: "vault", path: "/vault", selector: ".vault-v4-dashboard", inspectAllBodyControls: true, inspectNestedCaptions: true },
  { name: "vault-cards", path: "/vault/cards", selector: ".vault-v4-detail-board", inspectAllBodyControls: true, inspectNestedCaptions: true },
  { name: "forge", path: "/exchange/forge", selector: ".exchange-command-board", inspectAllBodyControls: true, inspectNestedCaptions: true },
];
const viewports = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 1024, height: 900 },
  { name: "desktop", width: 1440, height: 900 },
];
const expectedNavigation = [
  ["Open Code 3 TCG Home", "/"], ["Home", "/"], ["Find", "/find/deals"],
  ["Collection", "/collection"], ["Business", "/business"], ["Settings", "/settings"],
];
const controlSelector = [
  ".command-board-v4-hero :is(button, a)", ".command-board-v4-rail a",
  ".command-board-v4-mobile-bar :is(button, a)", ".command-board-v4-mobile-dock a",
  ".command-board-v4-route-strip :is(button, a)",
].join(", ");
const captionSelector = [
  "p", "small", "label", ".command-board-v4-hero-copy > span", ".command-board-v4-plan-heading > span",
  ".command-board-v4-status-strip span", ".command-metric-card > span", ".scout-command-heading > div > span",
  ".scout-command-side-rail header :is(span, b)",
  ".market-v4-lower-grid span", ".exchange-v4-signal-grid > article > span", ".exchange-v4-hub-card > span",
  ".spark-v4-category-rack > span", ".trust-badge",
].join(", ");

function scenarioUrl(route, theme) {
  const url = new URL(route.path, baseUrl);
  url.searchParams.set("betaLocalMode", "true");
  url.searchParams.set("themeInspect", theme);
  return url.toString();
}

async function readPresentation(page, route) {
  return page.evaluate(({ boardSelector, controlSelector, captionSelector, nestedTextSelector, verifyForgeProofGrid }) => {
    const board = document.querySelector(boardSelector);
    const failures = [];
    const note = (code, detail) => failures.push({ code, detail });
    const label = e => (e.getAttribute("aria-label") || (e.labels?.length ? [...e.labels].map(node => node.textContent).join(" ") : e.textContent) || "").trim().replace(/\s+/g, " ").slice(0, 150);
    const location = e => [e, e.parentElement, e.parentElement?.parentElement].filter(Boolean)
      .map(node => `${node.tagName.toLowerCase()}${node.classList.length ? `.${[...node.classList].join(".")}` : ""}`).join(" in ");
    const visible = e => {
      if (!e.getClientRects().length || !e.textContent?.trim() && !e.matches("button, a, input, select, textarea")) return false;
      for (let parent = e; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) return false;
      }
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const documentBounds = { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight };
    if (documentBounds.scrollWidth > documentBounds.clientWidth + 1) note("horizontal-overflow", `${documentBounds.scrollWidth - documentBounds.clientWidth}px`);
    const bodyChildren = [...(board.querySelector(".command-board-v4-body")?.children || [])]
      .filter(visible)
      .filter(e => !["fixed", "absolute"].includes(getComputedStyle(e).position));
    const contentBottom = bodyChildren.length ? Math.max(...bodyChildren.map(e => rect(e).bottom + scrollY)) : null;
    const tailClearance = {
      pageScrolls: documentBounds.scrollHeight > innerHeight + 2,
      contentBottom, pixels: contentBottom === null ? null : documentBounds.scrollHeight - contentBottom,
      children: bodyChildren.map(e => ({ selector: location(e), bottom: rect(e).bottom + scrollY })),
    };
    // A scrolling page needs dock clearance once, not stacked padding from the
    // frame, stage and main. Short pages may naturally end above the viewport.
    if (tailClearance.pageScrolls && tailClearance.pixels > 144) note("excess-blank-tail", `${tailClearance.pixels.toFixed(1)}px after final normal-flow content; maximum dock clearance144px`);
    const main = document.querySelector(".main.app-shell-themed");
    const sidebar = document.querySelector(".ops-desktop-sidebar");
    if (sidebar && visible(sidebar) && main && rect(main).x < rect(sidebar).right - 1) note("sidebar-overlap", `main starts ${rect(main).x}px, sidebar ends ${rect(sidebar).right}px`);
    const app = document.querySelector(".app[data-theme]");
    const colorProbe = document.createElement("span");
    app.append(colorProbe);
    const resolveColor = token => { colorProbe.style.color = `var(${token})`; return getComputedStyle(colorProbe).color; };
    const canvasColor = resolveColor("--app-background");
    const neutralColors = [canvasColor, ...["--surface-primary", "--surface-secondary", "--surface-inset", "--surface-elevated"].map(resolveColor), "rgba(0, 0, 0, 0)"];
    colorProbe.remove();
    const surfaces = [app, main, board, board.querySelector(".command-board-v4-frame"), board.querySelector(".command-board-v4-stage")].filter(Boolean).map(e => {
      const style = getComputedStyle(e);
      if (!neutralColors.includes(style.backgroundColor)) note("nonsemantic-canvas", `${location(e)} uses ${style.backgroundColor}`);
      if (e === app && style.backgroundColor !== canvasColor) note("app-canvas-color", `${style.backgroundColor}, expected ${canvasColor}`);
      if (/gradient/i.test(style.backgroundImage)) note("canvas-gradient", location(e));
      for (const pseudo of ["::before", "::after"]) {
        const ps = getComputedStyle(e, pseudo);
        if (ps.content !== "none" && ps.content !== "normal" && ps.display !== "none" && /gradient/i.test(ps.backgroundImage)) note("canvas-gradient", `${location(e)}${pseudo}`);
      }
      return { selector: location(e), color: style.backgroundColor, image: style.backgroundImage };
    });
    const controls = [...board.querySelectorAll(controlSelector)].filter(visible).map(e => {
      const r = rect(e);
      if (r.width < 44 - 0.1 || r.height < 44 - 0.1) note("small-control", `${label(e)}: ${r.width.toFixed(1)}x${r.height.toFixed(1)} at ${location(e)}`);
      if (!label(e)) note("unnamed-control", location(e));
      return { label: label(e), ...r };
    });

    // Page scrolling and scrollable panels are valid. Text must not be cut off by
    // a non-scrollable clip box, including a fixed-height ancestor or line clamp.
    const textElements = [...board.querySelectorAll(`h1, h2, h3, h4, p, .scout-command-side-rail header span${nestedTextSelector}`)].filter(visible).filter(e => !e.closest("svg"));
    if (![...board.querySelectorAll("h1, h2")].some(visible)) note("primary-heading", "Expected a visible workspace or content heading");
    for (const e of textElements) {
      const range = document.createRange();
      range.selectNodeContents(e);
      const textRects = [...range.getClientRects()].filter(r => r.width && r.height);
      const own = getComputedStyle(e);
      if (own.display !== "inline" && ((/hidden|clip/.test(own.overflowY) && e.scrollHeight > e.clientHeight + 2) || (/hidden|clip/.test(own.overflowX) && e.scrollWidth > e.clientWidth + 2))) note("text-overflow", `${label(e)} at ${location(e)}`);
      let horizontalScrollAvailable = false;
      let verticalScrollAvailable = false;
      for (let parent = e; parent && parent !== document.body; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        // Unfocused text may sit beyond an intentional scroll panel's visible
        // window. Its focused control is checked against every ancestor below.
        const clipX = !horizontalScrollAvailable && /hidden|clip/.test(style.overflowX);
        const clipY = !verticalScrollAvailable && /hidden|clip/.test(style.overflowY);
        horizontalScrollAvailable ||= /auto|scroll/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth + 1;
        verticalScrollAvailable ||= /auto|scroll/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight + 1;
        if (!clipX && !clipY) continue;
        const r = parent.getBoundingClientRect();
        const left = r.left + parent.clientLeft, top = r.top + parent.clientTop;
        if (textRects.some(t => (clipX && (t.left < left - 2 || t.right > left + parent.clientWidth + 2)) || (clipY && (t.top < top - 2 || t.bottom > top + parent.clientHeight + 2)))) {
          note("clipped-text", `${label(e)} at ${location(e)} clipped by ${location(parent)}`);
          break;
        }
      }
    }
    const captions = [...new Set([...board.querySelectorAll(captionSelector)].flatMap(e => [e, ...e.querySelectorAll("*")]))]
      .filter(visible)
      .filter(e => !e.closest(".scout-tile-map-pin, svg") && [...e.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim()));
    for (const e of captions) {
      const fontSize = parseFloat(getComputedStyle(e).fontSize);
      if (fontSize < 12 - 0.01) note("small-caption", `${fontSize}px: ${label(e)} at ${location(e)}`);
    }
    const navigation = [...board.querySelectorAll(".command-board-v4-rail a")].map(e => ({
      name: e.getAttribute("aria-label") || e.textContent.trim(), href: e.getAttribute("href"), visible: visible(e), ...rect(e),
    }));
    let proofGrid = null;
    if (verifyForgeProofGrid && innerWidth > 700) {
      const matrix = board.querySelector(".forge-v4-command-matrix");
      if (!matrix || !visible(matrix)) note("missing-proof-grid", "Expected the visible Forge proof matrix above the mobile breakpoint");
      else {
        const columns = getComputedStyle(matrix).gridTemplateColumns.trim().split(/\s+/);
        proofGrid = { columnCount: columns.length, columns };
        if (columns.length !== 2) note("forge-proof-columns", `Expected two readable proof columns, got ${columns.length}: ${columns.join(" ")}`);
      }
    }
    return { failures, documentBounds, tailClearance, proofGrid, main: main ? rect(main) : null, sidebar: sidebar ? rect(sidebar) : null, surfaces, controls, navigation, textCount: textElements.length, captionCount: captions.length };
  }, {
    boardSelector: route.selector,
    controlSelector: route.inspectAllBodyControls ? `${controlSelector}, .command-board-v4-body :is(button, a, input, select, textarea)` : controlSelector,
    captionSelector: route.inspectNestedCaptions ? `${captionSelector}, span, b, time, dt` : captionSelector,
    nestedTextSelector: route.inspectNestedCaptions ? ", span, b, time, dt" : "",
    verifyForgeProofGrid: route.name === "forge",
  });
}

async function checkKeyboardTarget(locator) {
  await locator.focus();
  return locator.evaluate(e => {
    const r = e.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const style = getComputedStyle(e);
    const identify = node => node ? `${node.tagName.toLowerCase()}.${[...node.classList].join(".")}` : null;
    const ancestors = [];
    let insideClipBounds = true;
    for (let parent = e.parentElement; parent; parent = parent.parentElement) {
      const ps = getComputedStyle(parent), pr = parent.getBoundingClientRect();
      if (parent !== document.body && parent !== document.documentElement) {
        const left = pr.left + parent.clientLeft, top = pr.top + parent.clientTop;
        if (/hidden|clip|auto|scroll/.test(ps.overflowX) && (r.left < left - 1 || r.right > left + parent.clientWidth + 1)) insideClipBounds = false;
        if (/hidden|clip|auto|scroll/.test(ps.overflowY) && (r.top < top - 1 || r.bottom > top + parent.clientHeight + 1)) insideClipBounds = false;
      }
      if (parent.scrollHeight > parent.clientHeight + 1 || /hidden|clip|auto|scroll/.test(`${ps.overflowX} ${ps.overflowY}`)) ancestors.push({
        element: identify(parent), overflowX: ps.overflowX, overflowY: ps.overflowY, height: ps.height, maxHeight: ps.maxHeight,
        clientHeight: parent.clientHeight, scrollHeight: parent.scrollHeight, scrollTop: parent.scrollTop,
        top: pr.top, bottom: pr.bottom,
      });
    }
    return {
      label: (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " "),
      target: identify(e), parent: identify(e.parentElement), hitTarget: identify(hit),
      hitParent: identify(hit?.parentElement), hitInBottomNavigation: Boolean(hit?.closest(".ops-mobile-nav, .command-board-v4-mobile-dock")),
      focused: document.activeElement === e, inTabOrder: e.tabIndex >= 0,
      hit: e === hit || e.contains(hit), width: r.width, height: r.height,
      x: r.x, y: r.y, right: r.right, bottom: r.bottom,
      insideViewport: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1,
      insideClipBounds,
      outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
      pageScrollY: scrollY, pageScrollHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight, ancestors,
    };
  });
}

async function runScenario(browser, route, viewport, theme) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const result = { route: route.name, theme, viewport: viewport.name, width: viewport.width, url: scenarioUrl(route, theme), failures: [], keyboard: [] };
  try {
    await page.goto(result.url, { waitUntil: "domcontentloaded" });
    await page.locator(route.selector).waitFor({ state: "visible", timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    result.presentation = await readPresentation(page, route);
    result.failures.push(...result.presentation.failures);
    if (viewport.name === "desktop") {
      const nav = result.presentation.navigation;
      if (nav.length !== expectedNavigation.length) result.failures.push({ code: "navigation-count", detail: `Expected six anchors, got ${nav.length}` });
      for (const [index, [name, pathname]] of expectedNavigation.entries()) {
        const actual = nav[index];
        if (!actual) continue;
        const url = new URL(actual.href, result.url);
        if (actual.name !== name || url.origin !== baseUrl.origin || url.pathname !== pathname || url.searchParams.get("betaLocalMode") !== "true" || url.searchParams.get("themeInspect") !== theme || [...url.searchParams].length !== 2) {
          result.failures.push({ code: "navigation-destination", detail: `${index}: expected ${name} → ${pathname}; got ${actual.name} → ${actual.href}` });
        }
        if (!actual.visible) result.failures.push({ code: "hidden-navigation", detail: name });
      }
    }
    const targets = page.locator(route.selector).locator(`${controlSelector}, .command-board-v4-body button, .command-board-v4-body a, .command-board-v4-body input, .command-board-v4-body select, .command-board-v4-body textarea`);
    for (let index = 0; index < await targets.count(); index++) {
      const target = targets.nth(index);
      if (!(await target.isVisible()) || !(await target.isEnabled()) || await target.evaluate(e => Boolean(e.closest(".scout-tile-map")))) continue;
      const check = await checkKeyboardTarget(target);
      result.keyboard.push(check);
      if (!check.focused || !check.inTabOrder || !check.hit || !check.insideViewport || !check.insideClipBounds) result.failures.push({ code: "unreachable-action", detail: JSON.stringify(check) });
    }
    if (route.name === "scout") {
      // First fixture pin is stable; overlapping geographic pins and pan/zoom are
      // exercised by test-scout-map-interactions.cjs rather than rearranged here.
      const pin = page.locator(`${route.selector} .scout-tile-map-pin`).first();
      if (!await pin.count()) result.failures.push({ code: "missing-map-pin", detail: "No local fixture store pin" });
      else {
        result.mapPin = await checkKeyboardTarget(pin);
        if (!result.mapPin.focused || !result.mapPin.hit || !result.mapPin.insideViewport || !result.mapPin.insideClipBounds || result.mapPin.width < 44 - 0.1 || result.mapPin.height < 44 - 0.1) result.failures.push({ code: "map-pin-hit", detail: JSON.stringify(result.mapPin) });
      }
    }
    await page.evaluate(() => {
      document.activeElement?.blur();
      for (const panel of document.querySelectorAll(".scout-command-side-rail, .command-board-v4-route-strip")) panel.scrollTo(0, 0);
      window.scrollTo(0, 0);
    });
    const screenshot = `${theme}-${viewport.name}-${route.name}.png`;
    await page.screenshot({ path: path.join(artifactDir, screenshot), fullPage: true });
    result.screenshot = screenshot;
  } catch (error) {
    result.failures.push({ code: "scenario-error", detail: error.message });
  } finally {
    result.failures.push(...errors.map(detail => ({ code: "page-error", detail })));
    await context.close();
  }
  return result;
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const routeFilter = process.env.LEGACY_PRESENTATION_ROUTES?.split(",").filter(Boolean);
  const selectedRoutes = routeFilter ? routes.filter(route => routeFilter.includes(route.name)) : routes;
  if (!selectedRoutes.length || routeFilter?.some(name => !routes.some(route => route.name === name))) throw new Error("LEGACY_PRESENTATION_ROUTES contains an unknown route");
  const resultsFilename = routeFilter ? `results-${selectedRoutes.map(route => route.name).join("-")}.json` : "results.json";
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const theme of ["light", "dark"]) for (const viewport of viewports) for (const route of selectedRoutes) {
      const result = await runScenario(browser, route, viewport, theme);
      results.push(result);
      console.log(`${theme}/${viewport.name}/${route.name}: ${result.failures.length ? `FAIL (${result.failures.length}) ${result.failures.slice(0, 4).map(f => `${f.code}: ${f.detail.slice(0, 240)}`).join("; ")}` : "PASS"}`);
      fs.writeFileSync(path.join(artifactDir, resultsFilename), `${JSON.stringify({ results }, null, 2)}\n`);
    }
  } finally { await browser.close(); }
  const passed = results.filter(result => !result.failures.length).length;
  console.log(`Legacy presentation: ${passed}/${results.length} passed. Normal vertical page scrolling is allowed.`);
  console.log(`Artifacts: ${artifactDir}`);
  process.exitCode = passed === results.length ? 0 : 1;
}

module.exports = { readPresentation, checkKeyboardTarget, runScenario, routes, viewports };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
