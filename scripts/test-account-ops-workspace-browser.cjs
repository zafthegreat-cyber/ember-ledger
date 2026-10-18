const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("@playwright/test");

const base = new URL(process.env.APP_URL || "http://127.0.0.1:5243/");
if (!["127.0.0.1", "localhost"].includes(base.hostname) || ["5239", "5240"].includes(base.port)) throw new Error("Use a disposable loopback QA server, never the user session ports.");
const key = "code3.account-ops.v1";
const output = path.join(process.cwd(), "artifacts/qa/account-ops-workspace");
fs.mkdirSync(output, { recursive: true });
let assertions = 0;
const check = (value, message) => { assertions += 1; assert.ok(value, message); };
const same = (value, expected, message) => { assertions += 1; assert.deepEqual(value, expected, message); };
const url = (section, theme) => `${base.origin}/account-ops/${section}?betaLocalMode=true&themeInspect=${theme}`;
async function inspect(page, label) {
  const result = await page.getByTestId("account-ops").evaluate((root) => {
    const controls = [...root.querySelectorAll("button,select,input,summary,a[href]")].filter((el) => el.checkVisibility());
    const invalid = controls.filter((el) => {
      const label = el.matches("input[type=checkbox]") ? el.closest("label") || el : el;
      const box = label.getBoundingClientRect();
      return box.width < 43.5 || box.height < 43.5 || !(el.textContent?.trim() || el.getAttribute("aria-label") || el.labels?.length);
    }).map((el) => el.outerHTML.slice(0, 200));
    return { invalid, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  same(result.invalid, [], `${label}: labeled 44px controls`);
  check(result.overflow <= 1, `${label}: no horizontal overflow`);
}

async function main() {
  const { getPhase2aQaFixture } = await import(pathToFileURL(path.join(process.cwd(), "src/features/accountOps/fixtures/phase2aQaFixtures.js")).href);
  const fixture = getPhase2aQaFixture("retailer-many-profiles").state;
  const raw = JSON.stringify(fixture);
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    for (const width of [360, 768, 1440]) for (const theme of ["light", "dark"]) {
      const label = `${width}-${theme}`;
      const context = await browser.newContext({ viewport: { width, height: 960 }, colorScheme: theme, reducedMotion: "reduce" });
      await context.addInitScript(({ key, raw }) => { if (!sessionStorage.getItem("workspace-fixture-seeded")) { localStorage.setItem(key, raw); sessionStorage.setItem("workspace-fixture-seeded", "1"); } }, { key, raw });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url("profiles", theme));
      await page.getByTestId("account-ops").waitFor();
      same(await page.locator("html").getAttribute("data-theme"), theme, `${label}: theme retained`);
      same(await page.locator(".ops-record-browser__row").count(), 12, `${label}: all profiles listed`);
      await inspect(page, `${label} profiles`);
      await page.getByRole("combobox", { name: "Profile group", exact: true }).selectOption("profile-group-preset:personal");
      await page.getByRole("heading", { name: "No profiles found" }).waitFor();
      same(await page.locator(".ops-record-browser__row").count(), 0, `${label}: group filter applied`);
      await page.getByRole("combobox", { name: "Profile group", exact: true }).selectOption("profile-group-preset:business");
      const row = page.locator(".ops-record-browser__row").first();
      await row.focus(); await page.keyboard.press("Enter");
      await page.getByRole("button", { name: "Open profile", exact: true }).waitFor();
      await inspect(page, `${label} profile detail`);
      await page.screenshot({ path: path.join(output, `${label}-profile-detail.png`), fullPage: true });
      await page.getByRole("button", { name: "Open profile", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Edit profile", exact: true });
      await editor.waitFor();
      same(await editor.getByRole("combobox", { name: "Group", exact: true }).inputValue(), "profile-group-preset:business", `${label}: full editor keeps group`);
      check(await editor.getByLabel("Shipping address", { exact: true }).isVisible(), `${label}: full address editor preserved`);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Back to list", exact: true }).click();
      check(await row.evaluate((el) => document.activeElement === el), `${label}: Back returns focus to selected row`);
      await page.goto(url("accounts", theme));
      await page.getByRole("heading", { name: "Store Accounts", exact: true }).waitFor();
      await page.getByRole("checkbox", { name: "Select all filtered accounts", exact: true }).check();
      check(await page.getByRole("button", { name: "Create Review Tasks", exact: true }).isVisible(), `${label}: bulk actions retained`);
      await page.getByRole("button", { name: "Clear", exact: true }).click();
      await page.locator(".ops-record-browser__row").first().click();
      await inspect(page, `${label} account detail`);
      await page.screenshot({ path: path.join(output, `${label}-account-detail.png`), fullPage: true });
      for (const name of ["Setup", "Edit", "View Profile", "Task", "Archive"]) check(await page.getByRole("button", { name, exact: true }).isVisible(), `${label}: ${name} action retained`);
      await page.getByRole("button", { name: "Setup & health", exact: true }).click();
      await page.getByRole("heading", { name: "Account Health Center", exact: true }).waitFor();
      await page.getByRole("button", { name: "All Accounts", exact: true }).click();
      await page.getByRole("heading", { name: "Store Accounts", exact: true }).waitFor();
      await page.goto(url("inbox", theme));
      await page.getByRole("button", { name: "Open purchase email import", exact: true }).click();
      await page.waitForURL(/\/business\/purchases/);
      check(await page.locator("body").innerText().then((text) => /Purchases/.test(text)), `${label}: working Purchases destination`);
      await page.goBack();
      await page.getByRole("heading", { name: "Inbox", exact: true }).waitFor();
      same(await page.evaluate((key) => localStorage.getItem(key), key), raw, `${label}: navigation, filters, selection, and canceled editor preserve exact saved data`);
      await context.close();
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await context.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), { key, raw });
    const page = await context.newPage();
    await page.goto(url("profiles", "light"));
    await page.getByRole("button", { name: "New Group", exact: true }).click();
    const groupEditor = page.getByRole("dialog", { name: "Create profile group", exact: true });
    await groupEditor.getByLabel("Group name", { exact: true }).fill("Weekend collection");
    await groupEditor.getByRole("button", { name: "Save Group", exact: true }).click();
    await groupEditor.waitFor({ state: "detached" });
    const withGroup = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
    const newGroup = withGroup.profileGroups.find((group) => group.displayName === "Weekend collection");
    check(newGroup, "Existing service creates a real owner-defined profile group");
    same(withGroup.profiles, fixture.profiles, "Creating a group preserves all existing profiles");
    await page.locator(".ops-record-browser__row").first().click();
    await page.getByRole("button", { name: "Open profile", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit profile", exact: true });
    await editor.getByRole("combobox", { name: "Group", exact: true }).selectOption(newGroup.id);
    await editor.getByRole("button", { name: "Save Profile", exact: true }).click();
    await editor.waitFor({ state: "detached" });
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), key);
    same(saved.profiles[0].profileGroupId, newGroup.id, "Existing profile service saves the selected group");
    same(saved.profiles.slice(1), fixture.profiles.slice(1), "Group assignment leaves other profiles unchanged");
    for (const collection of ["emailDomains", "emailAliases", "retailers", "storeAccounts", "tasks"]) same(saved[collection], fixture[collection], `${collection} unchanged after group creation and profile assignment`);
    await context.close();
    same(errors, [], "No browser errors across responsive matrix");
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, "manifest.json"), JSON.stringify({
    status: "passed", generatedAt: new Date().toISOString(), appUrl: base.origin, assertions,
    viewports: [360, 768, 1440], themes: ["light", "dark"],
    checks: ["Group filtering", "Profile editor and keyboard Back", "Account actions and bulk selection", "Setup and health navigation", "Purchase import link and browser Back", "Exact stored data preservation during review", "Group creation and profile assignment without collateral changes", "Labeled touch targets and horizontal overflow"],
    screenshots: [360, 768, 1440].flatMap((width) => ["light", "dark"].flatMap((theme) => [`${width}-${theme}-profile-detail.png`, `${width}-${theme}-account-detail.png`])),
  }, null, 2));
  console.log(`Account Ops workspace browser: ${assertions} assertions passed; 6 viewport/theme combinations, 12 screenshots.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
