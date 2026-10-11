const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const baseUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5203/");
const themeInspect = process.env.THEME_INSPECT === "light" ? "light" : "dark";
const artifactDir = path.join(process.cwd(), "artifacts", "qa", "exchange-v4-layout", themeInspect);
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 1024, height: 900 },
  { name: "desktop", width: 1440, height: 1000 },
];

function pageUrl(viewportName) {
  const url = new URL("exchange/harbor", baseUrl);
  url.searchParams.set("betaLocalMode", "true");
  url.searchParams.set("exchangeLayout", viewportName);
  url.searchParams.set("themeInspect", themeInspect);
  return url.toString();
}

async function readLayout(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return {
        top: Math.round(bounds.top),
        right: Math.round(bounds.right),
        bottom: Math.round(bounds.bottom),
        left: Math.round(bounds.left),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        display: styles.display,
        overflowY: styles.overflowY,
        gridTemplateRows: styles.gridTemplateRows,
      };
    };
    const bodyChildren = Array.from(document.querySelectorAll(".exchange-command-only-route:not(.forge-page-command-route) .command-board-v4-body > *"))
      .filter((element) => getComputedStyle(element).display !== "none")
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return { className: element.className, top: Math.round(bounds.top), bottom: Math.round(bounds.bottom) };
      });
    const internalScrollers = Array.from(document.querySelectorAll(".exchange-command-only-route:not(.forge-page-command-route) *"))
      .filter((element) => {
        const overflowY = getComputedStyle(element).overflowY;
        return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 2;
      })
      .slice(0, 10)
      .map((element) => ({ className: element.className, clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
    const clippedHeadings = Array.from(document.querySelectorAll(".exchange-command-only-route:not(.forge-page-command-route) h1, .exchange-command-only-route:not(.forge-page-command-route) h2, .exchange-command-only-route:not(.forge-page-command-route) h3"))
      .filter((element) => getComputedStyle(element).display !== "none" && element.scrollHeight > element.clientHeight + 2)
      .map((element) => element.textContent.trim());
    const matchingRules = (selector, property) => {
      const target = document.querySelector(selector);
      if (!target) return [];
      const matches = [];
      const visit = (rules) => {
        for (const rule of Array.from(rules || [])) {
          if (rule instanceof CSSMediaRule) {
            if (matchMedia(rule.conditionText).matches) visit(rule.cssRules);
            continue;
          }
          if (!(rule instanceof CSSStyleRule) || !rule.style.getPropertyValue(property)) continue;
          try {
            if (target.matches(rule.selectorText)) matches.push({
              selector: rule.selectorText,
              value: rule.style.getPropertyValue(property),
              priority: rule.style.getPropertyPriority(property),
            });
          } catch {}
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try { visit(sheet.cssRules); } catch {}
      }
      return matches.slice(-12);
    };

    return {
      url: location.href,
      bodyClass: document.body.className,
      appClass: document.querySelector(".app-command-shell")?.className || "",
      viewport: { width: innerWidth, height: innerHeight },
      document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
      board: rect(".exchange-command-only-route:not(.forge-page-command-route) .command-board-v4"),
      body: rect(".exchange-command-only-route:not(.forge-page-command-route) .command-board-v4-body"),
      hero: rect(".exchange-command-only-route:not(.forge-page-command-route) .command-board-v4-hero"),
      statusStrip: rect(".exchange-command-only-route:not(.forge-page-command-route) .command-board-v4-status-strip"),
      statusLast: rect(".exchange-command-only-route:not(.forge-page-command-route) .command-board-v4-status-strip > :last-child"),
      decisionHeading: rect(".exchange-v4-panel-heading h2"),
      commandContent: rect(".exchange-v4-command-content"),
      signals: rect(".exchange-v4-signal-grid"),
      lower: rect(".exchange-v4-lower-grid"),
      mobileDock: rect(".command-board-v4-mobile-dock, .mobile-bottom-nav, .ets-bottom-nav"),
      bodyChildren,
      internalScrollers,
      clippedHeadings,
      bodyGridRules: matchingRules(".exchange-command-only-route:not(.forge-page-command-route) .command-board-v4-body", "grid-template-rows"),
      lowerDisplayRules: matchingRules(".exchange-v4-lower-grid", "display"),
    };
  });
}

function validateLayout(layout, viewport) {
  const failures = [];
  if (!layout.board || !layout.body || !layout.commandContent || !layout.signals) failures.push("missing core Exchange surfaces");
  if (layout.document.scrollWidth > layout.document.clientWidth + 2) failures.push(`horizontal overflow ${layout.document.scrollWidth - layout.document.clientWidth}px`);
  if (layout.internalScrollers.length) failures.push(`nested vertical scrollers: ${layout.internalScrollers.map((item) => item.className).join(", ")}`);
  if (layout.clippedHeadings.length) failures.push(`clipped headings: ${layout.clippedHeadings.join(" | ")}`);
  if (layout.hero && layout.hero.scrollHeight > layout.hero.clientHeight + 2) failures.push("hero content is clipped");
  if (layout.statusStrip && layout.statusStrip.scrollHeight > layout.statusStrip.clientHeight + 2) failures.push("status strip content is clipped");
  if (layout.statusLast && layout.body && layout.statusLast.bottom + 5 > layout.body.top) failures.push("status strip overlaps Exchange content");

  if (viewport.name === "desktop") {
    if (!layout.lower || layout.lower.display === "none") failures.push("desktop lower decision band is hidden");
    if (layout.board && layout.lower && layout.board.bottom - layout.lower.bottom > 34) failures.push(`desktop dead zone ${layout.board.bottom - layout.lower.bottom}px`);
    if (layout.document.scrollHeight > viewport.height + 2) failures.push("desktop page scrolls");
  }

  if (viewport.name === "tablet") {
    const lastVisibleChild = layout.bodyChildren.at(-1);
    if (layout.board && lastVisibleChild && layout.board.bottom - lastVisibleChild.bottom > 34) failures.push(`tablet dead zone ${layout.board.bottom - lastVisibleChild.bottom}px`);
    if (layout.document.scrollHeight > viewport.height + 2) failures.push("tablet page scrolls");
  }

  if (viewport.name === "mobile") {
    const gaps = layout.bodyChildren.slice(1).map((item, index) => item.top - layout.bodyChildren[index].bottom);
    if (gaps.some((gap) => gap > 32)) failures.push(`mobile body gap ${Math.max(...gaps)}px`);
    if (!layout.mobileDock || layout.mobileDock.display === "none") failures.push("mobile dock is hidden");
  }

  if (failures.length) {
    const geometry = {
      board: layout.board,
      body: layout.body,
      commandContent: layout.commandContent,
      signals: layout.signals,
      lower: layout.lower,
      document: layout.document,
    };
    throw new Error(`${viewport.name}: ${failures.join("; ")}\n${JSON.stringify(geometry, null, 2)}`);
  }
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const browserErrors = [];
      page.on("console", (message) => {
        if (message.type() === "error" && !/favicon|ResizeObserver loop/i.test(message.text())) browserErrors.push(message.text());
      });
      page.on("pageerror", (error) => browserErrors.push(error.message));

      await page.goto(pageUrl(viewport.name), { waitUntil: "networkidle" });
      await page.locator(".exchange-command-only-route:not(.forge-page-command-route) .command-board-v4").waitFor({ state: "visible", timeout: 20000 });
      await page.waitForTimeout(250);
      const layout = await readLayout(page);
      fs.writeFileSync(path.join(artifactDir, `${viewport.name}-metrics.json`), `${JSON.stringify(layout, null, 2)}\n`);
      await page.screenshot({ path: path.join(artifactDir, `${viewport.name}.png`) });
      if (viewport.name === "mobile") {
        await page.screenshot({ path: path.join(artifactDir, "mobile-full.png"), fullPage: true });
      }
      validateLayout(layout, viewport);
      if (browserErrors.length) throw new Error(`${viewport.name}: ${browserErrors.join(" | ")}`);

      results.push(viewport.name);
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`Exchange layout passed: ${results.join(", ")}`);
  console.log(`Artifacts: ${artifactDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
