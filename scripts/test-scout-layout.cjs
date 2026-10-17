const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const baseUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5203/");
const artifactRoot = path.join(process.cwd(), "artifacts", "qa", "scout-v5-layout");
const themes = ["dark", "light"];
const viewports = [
  { name: "mobile", width: 390, height: 844, minMapHeight: 240 },
  { name: "tablet", width: 1024, height: 900, minMapHeight: 175 },
  { name: "desktop", width: 1440, height: 1000, minMapHeight: 250 },
];

function pageUrl(theme) {
  const url = new URL("scout", baseUrl);
  url.searchParams.set("betaLocalMode", "true");
  url.searchParams.set("themeInspect", theme);
  url.searchParams.set("scoutRework", "1");
  return url.toString();
}

function colorBrightness(color) {
  const channels = String(color).match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) || [];
  if (channels.length !== 3) return null;
  return (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) / 1000;
}

async function readLayout(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        top: Math.round(bounds.top),
        right: Math.round(bounds.right),
        bottom: Math.round(bounds.bottom),
        left: Math.round(bounds.left),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      };
    };
    const visible = (element) => {
      const styles = getComputedStyle(element);
      return styles.display !== "none" && styles.visibility !== "hidden" && element.getBoundingClientRect().height > 0;
    };
    const board = document.querySelector(".scout-command-board-v5");
    const map = document.querySelector(".scout-tile-map-canvas");
    const headings = Array.from(document.querySelectorAll(".scout-command-board-v5 h1, .scout-command-board-v5 h2, .scout-command-board-v5 h3"));
    const shellChildren = Array.from(document.querySelectorAll(".scout-route-shell > *"))
      .filter(visible)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        height: Math.round(element.getBoundingClientRect().height),
      }));

    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      },
      boardCount: document.querySelectorAll(".scout-command-board-v5").length,
      board: rect(".scout-command-board-v5"),
      hero: rect(".scout-command-board-v5 .command-board-v4-hero"),
      radar: rect(".scout-command-radar"),
      mapStage: rect(".scout-command-map-stage"),
      mapCanvas: rect(".scout-tile-map-canvas"),
      sideRail: rect(".scout-command-side-rail"),
      metrics: rect(".scout-command-metrics"),
      lower: rect(".scout-command-lower"),
      mobileDock: rect(".mobile-bottom-nav, .ets-bottom-nav, .command-board-v4-mobile-dock"),
      shellChildren,
      tileCount: document.querySelectorAll(".scout-tile-map-tile").length,
      pinCount: document.querySelectorAll(".scout-tile-map-pin").length,
      mapIsPannable: Boolean(map?.classList.contains("is-pannable")),
      oldOverviewVisible: Array.from(document.querySelectorAll(".scout-overview-intelligence-board")).some(visible),
      oldDailyReportVisible: Array.from(document.querySelectorAll("h1, h2, h3")).some((element) => visible(element) && element.textContent.trim() === "Daily Scout Report"),
      clippedHeadings: headings
        .filter((element) => visible(element) && (element.scrollHeight > element.clientHeight + 4 || element.scrollWidth > element.clientWidth + 2))
        .map((element) => element.textContent.trim()),
      boardBackground: board ? getComputedStyle(board).backgroundColor : "",
      mapBackground: document.querySelector(".scout-command-map-stage") ? getComputedStyle(document.querySelector(".scout-command-map-stage")).backgroundColor : "",
    };
  });
}

function validateLayout(layout, viewport, theme) {
  const failures = [];
  if (layout.boardCount !== 1) failures.push(`expected one command board, found ${layout.boardCount}`);
  if (!layout.board || !layout.hero || !layout.radar || !layout.mapStage || !layout.mapCanvas || !layout.sideRail) failures.push("missing core Scout surfaces");
  if (layout.shellChildren.length !== 1) failures.push(`expected one visible Scout shell child, found ${layout.shellChildren.length}`);
  if (layout.oldOverviewVisible || layout.oldDailyReportVisible) failures.push("legacy Scout overview is visible");
  if (layout.document.scrollWidth > layout.document.clientWidth + 2) failures.push(`horizontal overflow ${layout.document.scrollWidth - layout.document.clientWidth}px`);
  if (layout.clippedHeadings.length) failures.push(`clipped headings: ${layout.clippedHeadings.join(" | ")}`);
  if (layout.mapStage && layout.mapStage.height < viewport.minMapHeight) failures.push(`map is only ${layout.mapStage.height}px high`);
  if (!layout.mapIsPannable) failures.push("map canvas is not pannable");
  if (layout.tileCount < 4) failures.push(`expected map tiles, found ${layout.tileCount}`);
  if (layout.pinCount < 1) failures.push("expected at least one mapped store pin");

  const boardBrightness = colorBrightness(layout.boardBackground);
  if (theme === "light" && boardBrightness !== null && boardBrightness < 170) failures.push(`light board is too dark (${layout.boardBackground})`);
  if (theme === "dark" && boardBrightness !== null && boardBrightness > 90) failures.push(`dark board is too light (${layout.boardBackground})`);

  if (viewport.name === "mobile") {
    if (layout.document.scrollHeight > 1500) failures.push(`mobile page is too long (${layout.document.scrollHeight}px)`);
    if (!layout.mobileDock) failures.push("mobile dock is missing");
  } else {
    if (layout.document.scrollHeight > viewport.height + 2) failures.push(`${viewport.name} page scrolls (${layout.document.scrollHeight}px)`);
    if (!layout.metrics || !layout.lower) failures.push(`${viewport.name} supporting intelligence is missing`);
  }

  if (failures.length) throw new Error(`${theme}/${viewport.name}: ${failures.join("; ")}`);
}

async function main() {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const completed = [];

  try {
    for (const theme of themes) {
      const artifactDir = path.join(artifactRoot, theme);
      fs.mkdirSync(artifactDir, { recursive: true });

      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport });
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message));

        await page.goto(pageUrl(theme), { waitUntil: "domcontentloaded" });
        await page.locator(".scout-command-board-v5").waitFor({ state: "visible", timeout: 20000 });
        await page.locator(".scout-tile-map-canvas.is-pannable").waitFor({ state: "visible", timeout: 20000 });
        await page.waitForTimeout(350);

        const layout = await readLayout(page);
        fs.writeFileSync(path.join(artifactDir, `${viewport.name}-metrics.json`), `${JSON.stringify(layout, null, 2)}\n`);
        await page.screenshot({ path: path.join(artifactDir, `${viewport.name}.png`) });
        if (viewport.name === "mobile") await page.screenshot({ path: path.join(artifactDir, "mobile-full.png"), fullPage: true });

        validateLayout(layout, viewport, theme);
        if (pageErrors.length) throw new Error(`${theme}/${viewport.name}: ${pageErrors.join(" | ")}`);

        completed.push(`${theme}/${viewport.name}`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`Scout layout passed: ${completed.join(", ")}`);
  console.log(`Artifacts: ${artifactRoot}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
