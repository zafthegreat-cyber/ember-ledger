// UI measurements for the simulated UI beta (scripts/simulate-ui-beta.mjs).
//   APP_URL=http://127.0.0.1:5280 node scripts/measure-ui-beta.cjs [--out=artifacts/qa/ui-beta/measurements.json]
//
// Opens the real app (betaLocalMode, loopback only) in Chromium at the phone
// sizes, themes and text sizes real testers use, walks the main screens and
// records facts a person would trip over: tap targets under 44 px, text under
// 12 px, low-contrast text, sideways scrolling, cut-off labels, controls hidden
// under the bottom bar, and how long/crowded each screen is. No opinions here;
// the simulation turns these facts into "how many testers hit this".
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "true"]; }));
const appUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5280");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(appUrl.hostname), "UI measurements are loopback only");
const out = path.resolve(args.out || "artifacts/qa/ui-beta/measurements.json");
fs.mkdirSync(path.dirname(out), { recursive: true });

const ONLY_WIDTHS = args.widths ? String(args.widths).split(",").map(Number) : null;
const VIEWPORTS = [{ width: 320, height: 568 }, { width: 360, height: 740 }, { width: 390, height: 844 }, { width: 412, height: 915 }, { width: 768, height: 1024 }].filter((v) => !ONLY_WIDTHS || ONLY_WIDTHS.includes(v.width));
const THEMES = ["dark", "light"];
const TEXT_SCALES = [1, 1.3];
const SCREENS = [
  { key: "signin", path: "/", local: false },
  { key: "home", path: "/" },
  { key: "collection", path: "/collection" },
  { key: "sets", path: "/collection/sets" },
  { key: "wants", path: "/collection/wishlist" },
  { key: "market", path: "/market" },
  { key: "restocks", path: "/find/restocks" },
  { key: "deals", path: "/find/deals" },
  { key: "sell", path: "/sell/home" },
  { key: "settings", path: "/settings" },
  { key: "add", path: "/", tap: "Add" },
];

// Runs in the page. Returns plain data only.
function measure() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    // Closed <details> content keeps a layout box in Chromium; checkVisibility knows it is not shown.
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
    if (el.closest("[hidden], [aria-hidden='true'], [inert], details:not([open]) > :not(summary)")) return false;
    const r = el.getBoundingClientRect();
    // Screen-reader-only text (1px boxes, clipped, zero font size) is not something a sighted tester sees.
    if (r.width <= 2 || r.height <= 2 || parseFloat(s.fontSize) < 1) return false;
    if (s.position === "absolute" && (s.clip !== "auto" || /inset(50%)|inset(100%)/.test(s.clipPath))) return false;
    if (el.closest(".sr-only, .visually-hidden, [class*='sr-only'], [class*='visually-hidden']")) return false;
    return r.width > 0 && r.height > 0;
  };
  const label = (el) => (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).replace(/\s+/g, " ").trim().slice(0, 60);
  const where = (el) => { const c = el.closest("[class]"); return c ? String(c.className).split(/\s+/).filter(Boolean).slice(0, 2).join(".") : el.tagName.toLowerCase(); };
  const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  // Effective background: walk up; a gradient or image means "unknown" (skipped, not guessed).
  const background = (el) => {
    const layers = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== "none") return null;
      const c = parse(s.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    const root = parse(getComputedStyle(document.body).backgroundColor);
    if (root && root.a >= 1) base = root;
    for (let i = layers.length - 1; i >= 0; i -= 1) base = over(layers[i], base);
    return base;
  };

  const main = document.querySelector("main") || document.body;
  const scope = document.querySelector(".flow-modal, .ops-bottom-sheet, [role='dialog']") && [...document.querySelectorAll(".flow-modal, .ops-bottom-sheet, [role='dialog']")].find(visible) || document.body;
  const interactive = [...scope.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, summary, [role='button'], [role='tab']")].filter(visible).filter((el) => !el.disabled);
  const smallTargets = [];
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    const inlineLink = el.tagName === "A" && el.closest("p, li, small, label") && getComputedStyle(el).display.startsWith("inline");
    if (inlineLink) continue;
    if (r.height < 43.5 || r.width < 43.5) smallTargets.push({ label: label(el), w: Math.round(r.width), h: Math.round(r.height), where: where(el) });
  }

  const textEls = [...scope.querySelectorAll("*")].filter((el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1));
  const smallText = [], lowContrast = [], clipped = [];
  for (const el of textEls) {
    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize);
    const text = label(el);
    if (size < 11.9) smallText.push({ text, size: Math.round(size * 10) / 10, where: where(el) });
    const fg = parse(s.color), bg = background(el);
    if (fg && bg) {
      const color = fg.a < 1 ? over(fg, bg) : fg;
      const l1 = lum(color), l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
      const need = large ? 3 : 4.5;
      const disabled = el.closest(":disabled, [aria-disabled='true']");
      if (!disabled && ratio < need) lowContrast.push({ text, ratio: Math.round(ratio * 100) / 100, need, where: where(el) });
    }
    if ((s.overflow === "hidden" || s.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 1 && s.whiteSpace === "nowrap") clipped.push({ text, where: where(el) });
  }

  const doc = document.documentElement;
  const overflowX = Math.max(0, doc.scrollWidth - vw);
  const offscreen = overflowX > 1 ? [...scope.querySelectorAll("*")].filter(visible).filter((el) => el.getBoundingClientRect().right > vw + 2 && !el.closest("[class*='scroll'], [style*='overflow']")).slice(0, 5).map((el) => ({ where: where(el), right: Math.round(el.getBoundingClientRect().right) })) : [];

  const firstScreen = interactive.filter((el) => { const r = el.getBoundingClientRect(); return r.top < vh && r.bottom > 0; }).length;
  const headings = [...scope.querySelectorAll("h1, h2, h3")].filter(visible).length;
  return {
    smallTargets, smallText, lowContrast, clipped, overflowX, offscreen,
    interactiveCount: interactive.length, firstScreenControls: firstScreen, headings,
    screens: Math.round((Math.max(main.scrollHeight, doc.scrollHeight) / vh) * 10) / 10,
    words: (scope.innerText || "").split(/\s+/).filter(Boolean).length,
  };
}

// Controls that sit under the fixed bottom bar or the feedback bubble when the page is scrolled to its end.
function measureObscured() {
  window.scrollTo(0, document.documentElement.scrollHeight);
  const covers = [...document.querySelectorAll(".ops-mobile-nav, .quick-feedback-fab")].filter((el) => el.getClientRects().length);
  const hidden = [];
  for (const el of document.querySelectorAll("main button, main a[href], main input, main select, main summary")) {
    if (!el.getClientRects().length || el.closest(".ops-mobile-nav, .quick-feedback-fab")) continue;
    if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight || r.width === 0) continue;
    const x = Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = r.top + r.height / 2;
    if (y < 0 || y >= window.innerHeight) continue;
    const top = document.elementFromPoint(x, y);
    const cover = top && covers.find((c) => c.contains(top));
    if (cover) hidden.push({ label: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 50), by: cover.className.split(" ")[0] });
  }
  window.scrollTo(0, 0);
  return hidden;
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  const started = Date.now();
  // Saved after every phone setup, so a long run that is cut short still leaves data.
  const save = () => fs.writeFileSync(out, JSON.stringify({ measuredAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), configs: VIEWPORTS.length * THEMES.length * TEXT_SCALES.length, screens: SCREENS.map((s) => s.key), results }, null, 1));
  for (const viewport of VIEWPORTS) for (const theme of THEMES) for (const textScale of TEXT_SCALES) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: viewport.width < 700, hasTouch: true, colorScheme: theme, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message.slice(0, 160)));
    for (const screen of SCREENS) {
      const url = new URL(screen.path, appUrl.origin);
      if (screen.local !== false) url.searchParams.set("betaLocalMode", "true");
      url.searchParams.set("themeInspect", theme);
      const entry = { screen: screen.key, width: viewport.width, height: viewport.height, theme, textScale };
      try {
        await page.goto(url.href, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(screen.local === false ? ".app-signed-out" : ".ops-page-header, .ops-home-page, main h1", { timeout: 30000 });
        await page.waitForTimeout(900);
        if (screen.tap) {
          const nav = page.locator(".ops-mobile-nav button, .ops-desktop-sidebar nav button").filter({ hasText: new RegExp(`^\\s*${screen.tap}\\s*$`) }).first();
          if (!(await nav.count())) { entry.skipped = "no control"; results.push(entry); continue; }
          await nav.click();
          await page.waitForTimeout(screen.tap === "Add" ? 2500 : 1200);
        }
        if (textScale !== 1) {
          await page.evaluate((scale) => {
            const nodes = [...document.querySelectorAll("body *")].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName));
            const sizes = nodes.map((el) => parseFloat(getComputedStyle(el).fontSize));
            nodes.forEach((el, i) => { el.style.fontSize = `${sizes[i] * scale}px`; });
          }, textScale);
          await page.waitForTimeout(250);
        }
        Object.assign(entry, await page.evaluate(measure));
        entry.obscured = screen.tap === "Add" || screen.local === false ? [] : await page.evaluate(measureObscured);
        entry.errors = errors.splice(0);
        if (args.shots && textScale === 1 && [320, 390].includes(viewport.width)) await page.screenshot({ path: path.join(path.dirname(out), `${screen.key}-${viewport.width}-${theme}.png`) });
      } catch (error) { entry.failed = String(error.message || error).split("\n")[0].slice(0, 200); }
      results.push(entry);
    }
    await context.close();
    save();
    process.stdout.write(`measured ${viewport.width}px ${theme} x${textScale}\n`);
  }
  await browser.close();
  save();
  const failed = results.filter((r) => r.failed);
  console.log(`${results.length} screen measurements -> ${out}${failed.length ? `; ${failed.length} failed to load` : ""}`);
  if (failed.length) console.log(failed.slice(0, 5).map((f) => `${f.screen} ${f.width} ${f.theme}: ${f.failed}`).join("\n"));
})().catch((error) => { console.error(error); process.exit(1); });
