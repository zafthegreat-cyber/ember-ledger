const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5217");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "This regression uses disposable local browser contexts.");
const output = path.resolve(__dirname, "../artifacts/qa/next-ten/release-quality/deferred-browser");
const routes = [
  { path: "/settings/profile", module: "ProfileContent", content: "Identity and security" },
  { path: "/settings/plans", module: "MembershipContent", content: "Current plan and Scout limits" },
  { path: "/settings/trust", module: "TrustContent", content: "Child privacy" },
  { path: "/kids-community/community", module: "CommunityContent", content: "Tidepool" },
  { path: "/admin", module: "AdminReviewContent", content: "Permission Denied" },
];

function url(pathname, theme) {
  const result = new URL(pathname, base);
  result.searchParams.set("betaLocalMode", "true");
  result.searchParams.set("themeInspect", theme);
  return result.href;
}

async function recordSnapshot(page) {
  return page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("et-tcg-beta-data") || "{}");
    return JSON.stringify(Object.fromEntries(["items", "sales", "expenses", "mileageTrips", "tradeRecords"].map((key) => [key, data[key] || []])));
  });
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const theme of ["light", "dark"]) for (const width of [360, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.route("**/*", (route) => {
        const request = route.request(), requestUrl = new URL(request.url());
        return requestUrl.origin === base.origin && request.method() === "GET" ? route.continue() : route.abort();
      });
      const page = await context.newPage();
      const errors = [], requested = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => requested.push(new URL(request.url()).pathname));
      try {
        await page.goto(url("/", theme));
        await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible({ timeout: 30000 });
        await page.waitForTimeout(250);
        assert.deepEqual(requested.filter((entry) => entry.includes("/features/deferredViews/")), [], "Home does not download the deferred account, community, marketplace, import, or admin views.");
        results.push({ theme, width, name: "Home defers inactive views", passed: true });
        const before = await recordSnapshot(page);
        for (const route of routes) {
          await page.goto(url(route.path, theme));
          await expect(page.locator("body")).toContainText(route.content, { timeout: 30000 });
          await expect(page.locator(".app[data-theme]")).toHaveAttribute("data-theme", theme);
          assert.ok(requested.some((entry) => entry.endsWith(`/${route.module}.jsx`)), `${route.module} loads for its active route`);
          assert.equal(await recordSnapshot(page), before, "Viewing a deferred page preserves saved record arrays.");
          assert.equal(await page.locator("vite-error-overlay").count(), 0);
          assert.deepEqual(errors, []);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          assert.ok(overflow <= 1, `${route.path} fits ${width}px`);
          await page.screenshot({ path: path.join(output, `${route.module}-${theme}-${width}.png`) });
          await page.goBack();
          await expect(page.getByRole("heading", { name: "Welcome back.", exact: true })).toBeVisible({ timeout: 30000 });
          results.push({ theme, width, name: `${route.module} loads, preserves records and supports Back`, passed: true });
        }
        assert.ok(!requested.some((entry) => /\/(AdminOperationsContent|BetaReviewContent|BetaUsersContent)\.jsx$/.test(entry)), "An unprivileged admin visit does not load authorized admin subviews.");
        console.log(`PASS deferred loading, five routes, record preservation, Back and layout: ${theme} ${width}`);
      } finally { await context.close(); }
    }
  } catch (error) {
    results.push({ passed: false, error: error.message });
    throw error;
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
  }
  console.log(`${results.length}/${results.length} deferred-view cases passed.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
