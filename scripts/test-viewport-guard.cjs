const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const baseUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5203/");
const artifactDir = path.join(process.cwd(), "artifacts", "qa", "viewport-guard");

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

const routes = [
  { name: "login", path: "/", beta: false, expect: /welcome back|create your account|log in|ember\s*&\s*tide/i },
  { name: "hearth", path: "/", beta: true, expect: /hearth|welcome|collection|smart sparks/i },
  { name: "scout", path: "/scout", beta: true, expect: /scout|report|store/i },
  { name: "vault", path: "/vault/cards", beta: true, expect: /vault|collection|card/i },
  { name: "forge", path: "/exchange/forge", beta: true, expect: /forge|trade|ledger/i },
  { name: "market", path: "/exchange/market", beta: true, expect: /market|price|research/i },
  { name: "spark", path: "/kids-program", beta: true, expect: /spark|kids|family/i },
  { name: "menu", path: "/settings", beta: true, expect: /settings|menu|data safety|profile/i },
];

function routeUrl(route, viewportName) {
  const url = new URL(route.path, baseUrl);
  url.searchParams.set("themeInspect", "light");
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
  await page.goto(routeUrl(route, viewport.name), { waitUntil: "networkidle" });
  await page.locator("body").waitFor({ state: "visible", timeout: 15000 });
  const bodyText = await page.locator("body").innerText({ timeout: 10000 });
  if (!bodyText.trim()) throw new Error(`${route.name} rendered a blank page at ${viewport.name}`);
  if (/could not load this screen|had trouble loading|fatal browser errors|uncaught error/i.test(bodyText)) {
    throw new Error(`${route.name} rendered an app fallback at ${viewport.name}`);
  }
  if (!route.expect.test(bodyText)) {
    throw new Error(`${route.name} did not expose expected route text at ${viewport.name}`);
  }

  const screenshotPath = path.join(artifactDir, `${sanitizeFilePart(viewport.name)}-${sanitizeFilePart(route.name)}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

async function assertMobileDockAndQuickAdd(page) {
  await page.goto(routeUrl({ path: "/", beta: true }, "mobile"), { waitUntil: "networkidle" });
  await page.locator("body").waitFor({ state: "visible", timeout: 15000 });

  const dockCount = await visibleCount(page, ".mobile-bottom-nav, .ets-bottom-nav");
  if (!dockCount) throw new Error("Mobile bottom dock is not visible at 390x844");

  const quickAdd = page.locator(".mobile-dock-add, .mobile-quick-add-fab, button[aria-label*='Quick Add'], button:has-text('Quick Add')").first();
  if (!(await quickAdd.isVisible().catch(() => false))) {
    throw new Error("Quick Add control is not visible at 390x844");
  }
  await quickAdd.click();
  const bodyText = await page.locator("body").innerText({ timeout: 10000 });
  if (!/quick add|what would you like|add item|scan card/i.test(bodyText)) {
    throw new Error("Quick Add did not open an actionable surface at 390x844");
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
        if (message.type() === "error" && !/ResizeObserver loop|favicon/i.test(message.text())) {
          browserErrors.push(`${viewport.name} console: ${message.text()}`);
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
