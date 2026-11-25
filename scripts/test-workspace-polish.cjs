const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

(async () => {
  const browser = await chromium.launch();
  try {
    // Home's resale shortcuts (Find deals, Inventory, Sales, Purchases) are only shown to
    // seller/store personas since "Prioritize restocks and personalize Home and Add" (783a4fc),
    // so seed a seller persona before the app loads.
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } }); await context.addInitScript(require("./lib/open-home-more.cjs"));
    await context.addInitScript(() => {
      if (localStorage.getItem("__qa_workspace_polish_seeded")) return;
      localStorage.setItem("__qa_workspace_polish_seeded", "true");
      localStorage.setItem("et-tcg-beta-data", JSON.stringify({ userType: "seller", dashboardPreset: "seller", appSetupPersonalization: { experiencePersona: "seller" } }));
    });
    const page = await context.newPage();
    const base = process.env.APP_URL || "http://127.0.0.1:5217/";
    const url = (path) => new URL(path + "?betaLocalMode=true&themeInspect=light", base).href;
    const shortcutButtons = {
      Find: { card: "marketWatch", name: "Explore Find" },
      Purchases: { card: "forgeSummary", name: "Purchases" },
      Inventory: { card: "forgeSummary", name: /inventory$/i },
      Sales: { card: "forgeSummary", name: "Sales" },
    };
    for (const label of ["Find", "Purchases", "Inventory", "Sales"]) {
      await page.goto(url("/"));
      const { card, name } = shortcutButtons[label];
      const shortcuts = page.getByLabel("Personalized shortcuts", { exact: true }).locator(`[data-home-card="${card}"]`);
      await shortcuts.getByRole("button", typeof name === "string" ? { name, exact: true } : { name }).click();
      if (label === "Find") await page.getByRole("heading", { name: "Deal Feed", exact: true }).waitFor();
      else await page.waitForURL(new RegExp("/business/" + label.toLowerCase()));
      console.log("Home shortcut opened:", label, page.url());
    }
    await page.goto(url("/collection"));
    await page.getByRole("heading", { name: "Collection", exact: true }).waitFor();
    const search = page.getByRole("searchbox", { name: "Search collection" });
    await search.fill("Synthetic search");
    const rect = await search.boundingBox();
    assert.ok(rect && rect.width >= 80 && rect.height >= 40, "Collection search must be usable");
    await page.goto(url("/business"));
    const destination = page.getByRole("navigation", { name: "Business destinations" }).getByRole("button").first();
    await destination.waitFor();
    const style = await destination.evaluate(el => {
      const s = getComputedStyle(el);
      return { border: s.borderBottomWidth, borderStyle: s.borderBottomStyle, accentTop: parseFloat(s.borderTopWidth), background: s.backgroundColor, height: el.getBoundingClientRect().height };
    });
    // Cards keep a 1px outline; brand refresh (1b8c0dd) adds a deliberate 3px colored top accent.
    assert.equal(style.border, "1px");
    assert.notEqual(style.borderStyle, "none");
    assert.ok(style.accentTop >= 1, "Destination card keeps a visible top edge");
    assert.ok(style.height >= 100);
    await destination.click();
    await page.getByRole("heading", { name: "Purchases & Receiving", exact: true }).waitFor();
    await page.goto(url("/settings"));
    await page.getByRole("heading", { name: "Settings", exact: true }).waitFor();
    const labels = await page.locator(".settings-layout__row-copy strong").evaluateAll(nodes => nodes.map(el => ({ text: el.textContent, client: el.clientHeight, scroll: el.scrollHeight, max: getComputedStyle(el).maxHeight, height: getComputedStyle(el).height })));
    assert.ok(labels.length > 0, "Settings destinations must remain visible");
    assert.ok(labels.every(el => el.scroll <= el.client + 1), "Mobile plan labels must not be clipped: " + JSON.stringify(labels));
    await page.screenshot({ path: "artifacts/qa/whole-app-mobile-settings.png", fullPage: true });
    console.log("Workspace polish navigation and mobile controls passed.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
