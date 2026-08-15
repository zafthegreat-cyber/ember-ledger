const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const baseUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5203/");
const inspectTheme = process.env.THEME_INSPECT === "dark" ? "dark" : "light";
const artifactDir = path.join(process.cwd(), "artifacts", "qa", inspectTheme === "light" ? "viewport-guard" : `viewport-guard-${inspectTheme}`);

const viewports = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
];

const routes = [
  { name: "login", path: "/", beta: false, expect: /welcome back|create your account|log in|private business hub/i },
  { name: "home", path: "/", beta: true, expect: /good morning|good afternoon|good evening|business snapshot/i },
  { name: "find", path: "/find", beta: true, expect: /find|deal feed|opportunity workspace/i },
  { name: "collection", path: "/collection", beta: true, expect: /collection|my collection|owned items/i },
  { name: "business", path: "/business", beta: true, expect: /business|purchases|business records/i },
  { name: "owner-center", path: "/owner-center/overview", beta: true, expect: /owner center|owner only|scanner health/i },
  { name: "owner-restocks", path: "/owner-center/restocks/live", beta: true, expect: /restock intelligence|likely windows|reports becoming stale/i },
  { name: "scout", path: "/scout", beta: true, expect: /scout|report|store/i },
  { name: "vault", path: "/vault", beta: true, expect: /vault|collection|card/i },
  { name: "vault-collection", path: "/vault/cards", beta: true, expect: /vault|collection|card/i },
  { name: "exchange", path: "/exchange", beta: true, expect: /exchange|market|harbor|forge/i },
  { name: "forge", path: "/exchange/forge", beta: true, expect: /forge|trade|ledger/i },
  { name: "market", path: "/exchange/market", beta: true, expect: /market|price|research/i },
  { name: "spark", path: "/kids-program", beta: true, expect: /spark|kids|family/i },
  { name: "menu", path: "/settings", beta: true, expect: /settings|menu|data safety|profile/i },
];

function routeUrl(route, viewportName) {
  const url = new URL(route.path, baseUrl);
  url.searchParams.set("themeInspect", inspectTheme);
  url.searchParams.set("viewportGuard", viewportName);
  if (route.beta) url.searchParams.set("betaLocalMode", "true");
  return url.toString();
}

function sanitizeFilePart(value) {
  return String(value || "screen").replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

async function visibleCount(page, selector) {
  return page.locator(selector).evaluateAll((nodes) => nodes.filter((node) => {
    const rect = node.getBoundingClientRect();
    const styles = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && styles.visibility !== "hidden" && styles.display !== "none";
  }).length).catch(() => 0);
}

async function assertHealthyPage(page, route, viewport) {
  await page.goto(routeUrl(route, viewport.name), { waitUntil: "domcontentloaded" });
  await page.locator("body").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForFunction(
    ({ source, flags }) => new RegExp(source, flags).test(document.body?.innerText || ""),
    { source: route.expect.source, flags: route.expect.flags },
    { timeout: 15000 }
  ).catch(() => {});
  const bodyText = await page.locator("body").innerText({ timeout: 10000 });
  if (!bodyText.trim()) throw new Error(`${route.name} rendered a blank page at ${viewport.name}`);
  if (/could not load this screen|had trouble loading|fatal browser errors|uncaught error/i.test(bodyText)) {
    throw new Error(`${route.name} rendered an app fallback at ${viewport.name}`);
  }
  if (!route.expect.test(bodyText)) {
    throw new Error(`${route.name} did not expose expected route text at ${viewport.name}`);
  }

  await page.waitForTimeout(350);

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (horizontalOverflow > 1) {
    throw new Error(`${route.name} overflows horizontally by ${horizontalOverflow}px at ${viewport.name}`);
  }

  if (route.name === "home" && viewport.name === "mobile") {
    const hearthTail = await page.evaluate(() => {
      const surface = document.querySelector(".ops-home-page, .hearth-command-board .command-board-v4-stage, .hearth-final-phone");
      if (!surface) return null;
      const visibleFlowChildren = [...surface.children].filter((element) => {
        const styles = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return styles.display !== "none" && styles.position !== "fixed" && styles.position !== "absolute" && rect.height > 0;
      });
      const lastContentBottom = Math.max(0, ...visibleFlowChildren.map((element) => element.getBoundingClientRect().bottom + window.scrollY));
      return {
        blankTail: document.documentElement.scrollHeight - lastContentBottom,
        scrollHeight: document.documentElement.scrollHeight,
      };
    });
    if (!hearthTail || hearthTail.blankTail > 132) {
      throw new Error(`home reserves excessive blank mobile scroll space: ${JSON.stringify(hearthTail)}`);
    }
  }

  const screenshotPath = path.join(artifactDir, `${sanitizeFilePart(viewport.name)}-${sanitizeFilePart(route.name)}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

async function assertMobileDockAndQuickAdd(page) {
  await page.goto(routeUrl({ path: "/", beta: true }, "mobile"), { waitUntil: "domcontentloaded" });
  await page.locator("body").waitFor({ state: "visible", timeout: 15000 });
  await page.locator(".ops-mobile-nav").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});

  const dockCount = await visibleCount(page, ".ops-mobile-nav, .command-board-v4-mobile-dock, .mobile-bottom-nav, .ets-bottom-nav, .hearth-v4-phone-dock, .hearth-final-phone-dock");
  if (!dockCount) throw new Error("Mobile bottom navigation is not visible at 360x800");

  const quickAdd = page.locator("button[aria-label='Open global Add menu']:visible, .mobile-dock-add:visible, .mobile-quick-add-fab:visible, .hearth-v4-nav-primary:visible, button[aria-label*='Quick Add']:visible, button:has-text('Quick Add'):visible").first();
  if (!(await quickAdd.isVisible().catch(() => false))) {
    throw new Error("Global Add control is not visible at 360x800");
  }
  await quickAdd.click();
  const bodyText = await page.locator("body").innerText({ timeout: 10000 });
  if (!/scan listing|analyze deal|record purchase|add collection item|add resale inventory|record sale|add expense/i.test(bodyText)) {
    throw new Error("Global Add did not open an actionable surface at 360x800");
  }
  await page.screenshot({ path: path.join(artifactDir, "mobile-quick-add-open.png"), fullPage: true });
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  const browserErrors = [];

  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.setDefaultNavigationTimeout(45000);

      page.on("console", (message) => {
        const sourceUrl = message.location()?.url || "";
        const expectedFrontendOnlyHealthCheck = /\/api\/ebay\/health(?:\?|$)/i.test(sourceUrl);
        if (message.type() === "error" && !expectedFrontendOnlyHealthCheck && !/ResizeObserver loop|favicon/i.test(message.text())) {
          browserErrors.push(`${viewport.name} console: ${message.text()}${sourceUrl ? ` (${sourceUrl})` : ""}`);
        }
      });
      page.on("pageerror", (error) => {
        browserErrors.push(`${viewport.name} pageerror: ${error.message}`);
      });

      for (const route of routes) {
        await assertHealthyPage(page, route, viewport);
        results.push(`${viewport.name}:${route.name}`);
      }

      if (viewport.name === "mobile") {
        await assertMobileDockAndQuickAdd(page);
        results.push("mobile:quick-add");
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  if (browserErrors.length) {
    throw new Error(`Viewport guard saw browser errors:\n${browserErrors.join("\n")}`);
  }

  console.log(`Viewport guard passed: ${results.join(", ")}`);
  console.log(`Screenshots: ${artifactDir}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
