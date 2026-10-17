const assert = require("node:assert/strict");
const { chromium } = require("@playwright/test");

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
    const base = process.env.APP_URL || "http://127.0.0.1:5217/";
    const url = (path) => new URL(path + "?betaLocalMode=true&themeInspect=light", base).href;
    for (const label of ["Find", "Purchases", "Inventory", "Sales"]) {
      await page.goto(url("/"));
      const shortcuts = page.getByRole("navigation", { name: "Workspace shortcuts" });
      await shortcuts.getByRole("button", { name: new RegExp("^" + label) }).click();
      await page.waitForTimeout(1200);
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
      return { border: s.borderTopWidth, background: s.backgroundColor, height: el.getBoundingClientRect().height };
    });
    assert.equal(style.border, "1px");
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
