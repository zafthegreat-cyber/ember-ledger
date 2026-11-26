// The restock map, in a real browser (Nov 25 2026, owner: "the map is terrible").
// Checks what was wrong with the old one: it opens close in on the stores, pins do
// not sit on top of each other, it drags any distance, zooms, groups open when
// tapped, a tapped store shows its card, the list follows the map, and "near me" works.
// Map pictures are answered locally so the test never calls the map server.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/restock-map");
fs.mkdirSync(output, { recursive: true });
const appUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5242");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(appUrl.hostname), "Synthetic map checks are loopback only");
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const cases = [{ width: 390, height: 844, theme: "dark" }, { width: 320, height: 568, theme: "light" }];

(async () => {
  const browser = await chromium.launch({ headless: true });
  let step = "start"; let page;
  try {
    for (const item of cases) {
      const prefix = `${item.width}-${item.theme}`;
      const context = await browser.newContext({ viewport: { width: item.width, height: item.height }, colorScheme: item.theme, reducedMotion: "reduce", serviceWorkers: "block", hasTouch: false, geolocation: { latitude: 38.3032, longitude: -77.4605 }, permissions: ["geolocation"] });
      let tileRequests = 0;
      await context.route("https://tile.openstreetmap.org/**", (route) => { tileRequests += 1; route.fulfill({ status: 200, contentType: "image/png", body: PIXEL }); });
      page = await context.newPage();
      step = `${prefix}: open the restock map`;
      await page.goto(`${appUrl.origin}/find/restocks?betaLocalMode=true`, { waitUntil: "domcontentloaded" });
      const card = page.locator(".restock-map-card");
      await expect(card).toBeVisible({ timeout: 60000 });
      const map = card.locator(".restock-slippy");
      const canvas = card.locator(".restock-slippy__canvas");
      await expect(canvas).toBeVisible();
      await canvas.evaluate((element) => element.scrollIntoView({ block: "center" }));
      await expect(card.locator(".restock-pin").first()).toBeVisible({ timeout: 30000 });
      const zoom = async () => Number(await map.getAttribute("data-zoom"));
      const center = async () => (await map.getAttribute("data-center")).split(",").map(Number);

      step = `${prefix}: big enough, and opened on the stores`;
      const box = await canvas.boundingBox();
      assert.ok(box.height >= 300, `The map is tall enough to use (${box.height}px)`);
      assert.ok(box.width >= item.width - 70, `The map uses the width of the screen (${box.width}px of ${item.width})`);
      const openingZoom = await zoom();
      assert.ok(openingZoom >= 9, `Opens on the stores' own area, not on a whole state (zoom ${openingZoom})`);
      assert.ok(tileRequests > 0, "Map pictures are requested");

      step = `${prefix}: pins do not sit on top of each other`;
      const pinBoxes = await card.locator(".restock-pin").evaluateAll((pins) => pins.map((pin) => { const rect = pin.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height }; }));
      assert.ok(pinBoxes.length >= 1, "There are pins on the map");
      for (let a = 0; a < pinBoxes.length; a += 1) for (let b = a + 1; b < pinBoxes.length; b += 1) {
        assert.ok(Math.hypot(pinBoxes[a].x - pinBoxes[b].x, pinBoxes[a].y - pinBoxes[b].y) >= 40, "Two pins are never stacked");
      }
      await page.screenshot({ path: path.join(output, `${prefix}-open.png`) });

      step = `${prefix}: zoom buttons`;
      for (const name of ["Zoom in", "Zoom out", "Show stores near me"]) {
        const control = await card.getByRole("button", { name, exact: true }).boundingBox();
        assert.ok(control.width >= 44 && control.height >= 44, `${name} is a 44px touch target`);
      }
      await card.getByRole("button", { name: "Zoom in", exact: true }).click();
      assert.equal(await zoom(), openingZoom + 1);
      await card.getByRole("button", { name: "Zoom out", exact: true }).click();
      assert.equal(await zoom(), openingZoom);

      step = `${prefix}: drags any distance`;
      const before = await center();
      const requestsBefore = tileRequests;
      const from = { x: box.x + box.width / 2, y: (await canvas.boundingBox()).y + box.height / 2 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (let moved = 0; moved < 5; moved += 1) await page.mouse.move(from.x - 60 * (moved + 1), from.y - 40 * (moved + 1), { steps: 4 });
      await page.mouse.up();
      const after = await center();
      assert.ok(after[1] > before[1] && after[0] < before[0], "Dragging up and left shows what is to the south-east");
      await card.getByRole("button", { name: "Zoom in", exact: true }).click();
      await card.getByRole("button", { name: "Zoom in", exact: true }).click();
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(from.x + 260, from.y + 180, { steps: 8 });
      await page.mouse.up();
      assert.ok(tileRequests > requestsBefore, "Moving the map loads new map pictures (the old map could only shift about 50 px)");
      step = `${prefix}: keyboard`;
      const beforeKeys = await center();
      await canvas.focus();
      await page.keyboard.press("ArrowRight");
      assert.notDeepEqual(await center(), beforeKeys, "Arrow keys move the map");
      await page.keyboard.press("-");
      await page.keyboard.press("-");
      assert.equal(await zoom(), openingZoom);

      step = `${prefix}: the list brings a store to the middle and shows its card`;
      const list = card.locator(".restock-map-card__list button");
      await expect(list).toHaveCount(4);
      const more = card.locator(".restock-map-card__more");
      if (await more.count()) {
        await more.click();
        assert.ok(await list.count() > 4, "Show all lists every store");
        await more.click();
        await expect(list).toHaveCount(4);
      }
      // The list follows the map a moment after it stops moving; wait for it to settle, then pick by name.
      await page.waitForTimeout(500);
      const rowTitle = await list.nth(1).locator("strong").innerText();
      await card.locator(".restock-map-card__list button").filter({ has: page.locator("strong", { hasText: rowTitle }) }).first().click();
      await expect(card.locator(".restock-map-card__store-copy strong")).toHaveText(rowTitle);
      await expect(card.locator(".restock-pin.is-selected")).toBeVisible();
      assert.ok(await zoom() >= 13, "A store picked from the list is shown close up");
      const selectedBox = await card.locator(".restock-pin.is-selected").boundingBox();
      const canvasNow = await canvas.boundingBox();
      assert.ok(Math.abs(selectedBox.x + selectedBox.width / 2 - (canvasNow.x + canvasNow.width / 2)) < 6, "The picked store is in the middle of the map");
      await expect(card.locator(".restock-pin__tag")).toHaveText(rowTitle);

      step = `${prefix}: store card actions`;
      const store = card.locator(".restock-map-card__store");
      await expect(store.getByRole("link", { name: "Directions", exact: true })).toHaveAttribute("href", /^https:\/\/www\.google\.com\/maps\//);
      for (const control of [store.getByRole("button", { name: "Report here", exact: true }), store.getByRole("link", { name: "Directions", exact: true })]) {
        const controlBox = await control.boundingBox();
        assert.ok(controlBox.height >= 44, "Store actions are 44px touch targets");
      }
      assert.doesNotMatch(await store.innerText(), /^\d+ - /m, "Store names are not shown as directory codes");

      step = `${prefix}: tapping a pin picks that store`;
      const single = card.locator(".restock-pin:not(.restock-pin--group):not(.is-selected)").first();
      if (await single.count()) {
        const label = await single.getAttribute("aria-label");
        await single.click();
        await expect(card.locator(".restock-pin.is-selected")).toHaveAttribute("aria-label", label);
      }

      step = `${prefix}: a group of stores opens when tapped`;
      for (let out = 0; out < 6 && !(await card.locator(".restock-pin--group").count()); out += 1) await card.getByRole("button", { name: "Zoom out", exact: true }).click();
      const group = card.locator(".restock-pin--group").first();
      if (await group.count()) {
        const groupZoom = await zoom();
        await expect(group).toHaveAttribute("aria-label", /^\d+ stores here\. Zoom in to see them\.$/);
        await group.click();
        assert.equal(await zoom(), Math.min(17, groupZoom + 2), "Tapping a group zooms in on it");
      }

      step = `${prefix}: near me`;
      await card.getByRole("button", { name: "Show stores near me", exact: true }).click();
      await expect(card.locator(".restock-slippy__you")).toBeVisible({ timeout: 15000 });
      const here = await center();
      assert.ok(Math.abs(here[0] - 38.3032) < 0.01 && Math.abs(here[1] + 77.4605) < 0.01, "The map moves to where you are");
      assert.equal(await zoom(), 12);

      step = `${prefix}: fits the screen`;
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "No sideways scroll");
      await canvas.evaluate((element) => element.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: path.join(output, `${prefix}-near-me.png`) });
      await context.close();
      console.log(`PASS restock map ${prefix}`);
    }
  } catch (error) {
    await page?.screenshot({ path: path.join(output, "failure.png") }).catch(() => {});
    console.error(`FAILED at: ${step}`);
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
