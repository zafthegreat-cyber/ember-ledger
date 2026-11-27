// "Preview the app" on the sign-in screen opens the app without an account and shows a
// "Preview mode" bar with an "Exit preview" button above every page.
//
// On board-style pages (Restocks, Market, Collection, You, Plans) the bar used to land under
// the page: on a phone at the very bottom, behind the bottom bar. On wide screens its words
// were behind the sidebar on every page. Both were fixed on Nov 26 2026.
//
// The rest of the browser suite opens the app in local beta mode, where this bar never shows,
// so this is the only test that looks at it. It checks what a visitor needs: the bar is above
// the page, on the first screen, and nothing covers its words or its button.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const baseUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5217/");
const artifactRoot = path.join(process.cwd(), "artifacts", "qa", "guest-preview-bar");
// A whole page load of the dev app can take several seconds on a busy machine.
const pageLoad = { timeout: 30000 };

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1180, height: 800 }, // the narrowest width that shows the sidebar
  { name: "desktop", width: 1440, height: 900 },
];

// `shows` is something only that page has, so the check never runs against the page before.
// `board` says whether the page is built on a command board. Those pages lay the app out as
// a grid, which is what used to drop the bar under the page; the two ordinary pages are here
// so the bar is checked on both kinds.
const pages = [
  { name: "Home", path: "/", shows: ".ops-home-page", board: false },
  { name: "Restocks", path: "/scout", shows: ".scout-command-route-v5", board: true },
  { name: "Market", path: "/exchange/market", shows: ".market-command-only-route", board: true },
  { name: "Collection", path: "/vault/cards", shows: ".vault-command-only-route", board: true },
  { name: "You", path: "/settings/profile", shows: ".utility-page .utility-page-command-board", board: true },
  { name: "Plans", path: "/settings/plans", shows: ".membership-command-only-route", board: true },
  { name: "Settings", path: "/settings", shows: ".utility-page .settings-layout", board: false },
];

// Runs in the page. Returns what is wrong with the bar in plain words; an empty list is a pass.
function previewBarProblems(target) {
  const problems = [];
  const showing = (element) => Boolean(element) && getComputedStyle(element).display !== "none" && element.getBoundingClientRect().height > 0;
  // Names the part of the app an element belongs to (the sidebar, the bottom bar, the page).
  const describe = (element) => {
    const part = element?.closest(".app > *") || element;
    if (!part) return "nothing";
    const classes = typeof part.className === "string" ? part.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
    return `${part.tagName.toLowerCase()}${classes ? `.${classes}` : ""}`;
  };

  // Measured at the top of the page: that is the first screen a visitor sees.
  window.scrollTo(0, 0);

  if (!document.querySelector(`.app > .main ${target.shows}`)) return [`the ${target.name} page has not opened`];
  const onBoard = Boolean(document.querySelector(".app > .main .command-board-v4"));
  if (onBoard !== target.board) {
    problems.push(target.board
      ? `${target.name} is no longer built on a command board, so this no longer checks a board page`
      : `${target.name} is now built on a command board; mark it board: true`);
  }

  const bar = document.querySelector(".app > .guest-preview-banner");
  const page = document.querySelector(".app > .main");
  if (!showing(bar)) return [...problems, "the preview bar is not showing"];
  const barBox = bar.getBoundingClientRect();
  const pageBox = page.getBoundingClientRect();
  const span = `the bar is at ${Math.round(barBox.top)} to ${Math.round(barBox.bottom)}px`;

  if (barBox.bottom > pageBox.top + 1) problems.push(`the preview bar is not above the page (${span}, the page starts at ${Math.round(pageBox.top)}px)`);
  const pills = document.querySelector(".app > .ops-mobile-sections");
  if (showing(pills) && barBox.top < pills.getBoundingClientRect().bottom - 1) problems.push(`the preview bar overlaps the row of page pills (${span})`);
  if (document.documentElement.scrollWidth - window.innerWidth > 1) problems.push("the page scrolls sideways");

  if (barBox.top < 0 || barBox.bottom > window.innerHeight) {
    problems.push(`the preview bar is not on the first screen (${span}, the screen is ${window.innerHeight}px tall)`);
    return problems;
  }
  const exit = bar.querySelector("button");
  for (const [label, element] of [["the words \"Preview mode\" are", bar.querySelector("strong")], ["the Exit preview button is", exit]]) {
    if (!showing(element)) { problems.push(`${label} missing from the preview bar`); continue; }
    const box = element.getBoundingClientRect();
    const onTop = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    if (onTop !== element && !element.contains(onTop)) problems.push(`${label} covered by ${describe(onTop)}`);
  }
  if (showing(exit) && exit.getBoundingClientRect().height < 44) problems.push(`the Exit preview button is ${Math.round(exit.getBoundingClientRect().height)}px tall, under the 44px touch size`);
  return problems;
}

async function openPreview(page) {
  await page.goto(baseUrl.href, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Preview the app", exact: true }).click(pageLoad);
  await page.locator(".app > .guest-preview-banner").waitFor({ state: "visible", ...pageLoad });
}

// Preview mode does not survive a page load, so move between pages the way the app's own
// links do (same as test-code3-workspace-browser.cjs).
async function openInApp(page, nextPath) {
  await page.evaluate((to) => {
    history.pushState({ code3Qa: true }, "", to);
    dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  }, nextPath);
}

// Checks again until nothing is wrong, so a page that is still loading or settling gets time.
// A bar in the wrong place never passes; after 20 seconds the problems are returned.
async function settledProblems(page, target) {
  const deadline = Date.now() + 20000;
  for (;;) {
    const problems = await page.evaluate(previewBarProblems, target);
    if (!problems.length || Date.now() > deadline) return problems;
    await page.waitForTimeout(250);
  }
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
      await openPreview(page);

      for (const target of pages) {
        const where = `${viewport.name} ${viewport.width}px, ${target.name}`;
        await openInApp(page, target.path);
        const problems = await settledProblems(page, target);
        await page.screenshot({ path: path.join(artifactRoot, `${problems.length ? "FAILED-" : ""}${viewport.name}-${target.name.toLowerCase()}.png`) });
        if (problems.length) throw new Error(`Preview bar on ${where}: ${problems.join("; ")}`);
        if (pageErrors.length) throw new Error(`${where}: ${pageErrors.join(" | ")}`);
      }

      // The button has to work from a board page too: it ends the preview and returns to sign-in.
      await openInApp(page, "/scout");
      await page.locator(".app > .main .scout-command-route-v5").waitFor({ state: "visible", timeout: 20000 });
      await page.getByRole("button", { name: "Exit preview", exact: true }).click();
      await page.getByRole("button", { name: "Preview the app", exact: true }).waitFor({ state: "visible", timeout: 20000 });
      if (await page.locator(".guest-preview-banner").count()) throw new Error(`${viewport.name}: the preview bar is still showing after Exit preview`);
      if (pageErrors.length) throw new Error(`${viewport.name}, leaving preview: ${pageErrors.join(" | ")}`);

      completed.push(viewport.name);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`Guest preview bar passed on ${pages.length} pages at: ${completed.join(", ")}`);
  console.log(`Artifacts: ${artifactRoot}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
