// The You page and the pages that share its header (Collections, Coming Soon, Account,
// Help & Support) are a short header followed by the page itself.
//
// On phones and tablets the header on You, Collections and Coming Soon used to be a full
// screen tall: the page opened on an empty panel and its first card was below the fold
// (fixed Nov 26 2026). Account and Help were already right and are here so they stay that way.
//
// Checked at phone and tablet widths only. At 1180px and wider the You page still opens on
// the tall header; when that is fixed, add a desktop width to `viewports`.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const baseUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
const artifactRoot = path.join(process.cwd(), "artifacts", "qa", "you-page-header");
// A whole page load of the dev app can take several seconds on a busy machine.
const pageLoad = { timeout: 30000 };

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "tablet-wide", width: 1024, height: 768 },
];

// `header` is the header's accessible name, so the check never runs against the page before.
const pages = [
  { name: "You", path: "/settings/profile", header: "You command center" },
  { name: "Collections", path: "/settings/workspaces", header: "Collections command center" },
  { name: "Coming Soon", path: "/settings/roadmap", header: "Coming Soon command center" },
  { name: "Account", path: "/settings/account", header: "Account command center" },
  { name: "Help & Support", path: "/settings/help", header: "Help & Support command center" },
];

// Runs in the page. Returns what is wrong in plain words; an empty list is a pass.
function headerProblems(target) {
  const problems = [];
  const showing = (element) => Boolean(element) && getComputedStyle(element).display !== "none" && element.getBoundingClientRect().height > 0;

  const header = document.querySelector(`.app > .main .utility-page-command-board[aria-label="${target.header}"]`);
  if (!showing(header)) return [`the ${target.name} page has not opened`];
  // Whatever follows the header: the page's first row of buttons or its first card.
  const pageStart = [...header.parentElement.children].filter((element) => element !== header).find(showing);
  if (!pageStart) return [`the ${target.name} page has nothing under its header`];

  // Measured at the top of the page: that is the first screen a person sees.
  window.scrollTo(0, 0);
  const headerHeight = Math.round(header.getBoundingClientRect().height);
  const pageTop = Math.round(pageStart.getBoundingClientRect().top);
  const bottomBar = document.querySelector(".app > .ops-mobile-nav");
  const screenEnd = Math.round(showing(bottomBar) ? bottomBar.getBoundingClientRect().top : window.innerHeight);

  if (headerHeight > window.innerHeight / 2) problems.push(`the header is ${headerHeight}px tall, more than half of the ${window.innerHeight}px screen`);
  // 44px, one touch target, of the page has to be in view above the bottom bar.
  if (pageTop + 44 > screenEnd) problems.push(`the page starts ${pageTop}px down, off the first screen (the bottom bar starts at ${screenEnd}px)`);
  if (document.documentElement.scrollWidth - window.innerWidth > 1) problems.push("the page scrolls sideways");
  return problems;
}

// Checks again until nothing is wrong, so a page that is still loading or settling gets time.
// A header that is too tall never passes; after 20 seconds the problems are returned.
async function settledProblems(page, target) {
  const deadline = Date.now() + 20000;
  for (;;) {
    const problems = await page.evaluate(headerProblems, target);
    if (!problems.length || Date.now() > deadline) return problems;
    await page.waitForTimeout(250);
  }
}

// Moves between pages the way the app's own links do (same as test-code3-workspace-browser.cjs),
// so each width needs only one full page load.
async function openInApp(page, nextPath) {
  await page.evaluate((to) => {
    history.pushState({ code3Qa: true }, "", `${to}${location.search}`);
    dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  }, nextPath);
}

async function main() {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const completed = [];
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const start = new URL(pages[0].path, baseUrl);
      start.searchParams.set("betaLocalMode", "true");
      await page.goto(start.href, { waitUntil: "domcontentloaded" });
      await page.locator(".app > .main .utility-page-command-board").waitFor({ state: "visible", ...pageLoad });

      for (const target of pages) {
        const where = `${viewport.name} ${viewport.width}px, ${target.name}`;
        await openInApp(page, target.path);
        const problems = await settledProblems(page, target);
        const shot = `${viewport.name}-${target.name.toLowerCase().replace(/[^a-z]+/g, "-")}.png`;
        await page.screenshot({ path: path.join(artifactRoot, `${problems.length ? "FAILED-" : ""}${shot}`) });
        if (problems.length) throw new Error(`${where}: ${problems.join("; ")}`);
        if (pageErrors.length) throw new Error(`${where}: ${pageErrors.join(" | ")}`);
      }

      completed.push(viewport.name);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`You page header passed on ${pages.length} pages at: ${completed.join(", ")}`);
  console.log(`Artifacts: ${artifactRoot}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
