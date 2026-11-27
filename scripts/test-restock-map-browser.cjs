// The restock map, in a real browser (Nov 25 2026, owner: "the map is terrible").
// Checks what was wrong with the old one: it opens close in on the stores, pins do
// not sit on top of each other, it drags any distance, zooms, groups open when
// tapped, a tapped store shows its card, the list follows the map, and "near me" works.
// Nov 27 2026: the state's store directory is on the map (not five hand-typed stores),
// two fingers and Ctrl + wheel zoom smoothly and settle on a whole level, and the pins
// follow the map to wherever "near me" takes it.
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
      // Pins near the edge are drawn half outside the map; a tap goes to one whose middle is well inside.
      const insideMap = async (selector) => {
        const frame = await canvas.boundingBox();
        const pins = card.locator(selector);
        for (let index = 0; index < await pins.count(); index += 1) {
          const pin = await pins.nth(index).boundingBox();
          if (!pin) continue;
          const x = pin.x + pin.width / 2, y = pin.y + pin.height / 2;
          if (x > frame.x + 30 && x < frame.x + frame.width - 70 && y > frame.y + 30 && y < frame.y + frame.height - 60) return pins.nth(index);
        }
        return null;
      };
      // Every store on screen, counting the ones inside group circles.
      const storesInView = () => card.locator(".restock-pin").evaluateAll((pins) => pins.reduce((sum, pin) => sum + (pin.classList.contains("restock-pin--group") ? Number(/^(\d+)/.exec(pin.getAttribute("aria-label"))?.[1] || 0) : 1), 0));

      step = `${prefix}: big enough, and opened on the stores`;
      const box = await canvas.boundingBox();
      assert.ok(box.height >= 300, `The map is tall enough to use (${box.height}px)`);
      assert.ok(box.width >= item.width - 70, `The map uses the width of the screen (${box.width}px of ${item.width})`);
      const openingZoom = await zoom();
      assert.ok(openingZoom >= 9, `Opens on the stores' own area, not on a whole state (zoom ${openingZoom})`);
      assert.ok(tileRequests > 0, "Map pictures are requested");
      // Nov 27 2026: Find > Restocks loads the state's store directory. Before, a fresh visit
      // showed only the five hand-typed Virginia Beach stores, at guessed spots.
      const opened = await storesInView();
      assert.ok(opened >= 20, `The map shows the state's stores, not a handful (${opened} in view)`);

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

      step = `${prefix}: a trackpad pinch (Ctrl + wheel) zooms smoothly, then settles on a whole level`;
      // Read inside the page two frames after the wheel, before the map settles (220 ms later).
      const wheel = (deltaY) => canvas.evaluate(async (element, delta) => {
        const box = element.getBoundingClientRect();
        element.dispatchEvent(new WheelEvent("wheel", { deltaY: delta, ctrlKey: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, bubbles: true, cancelable: true }));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return Number(element.closest(".restock-slippy").getAttribute("data-zoom"));
      }, deltaY);
      const between = await wheel(-30);
      assert.ok(between > openingZoom && between < openingZoom + 1, `Zooms part of a level with the fingers (zoom ${between})`);
      await expect.poll(zoom, { timeout: 3000 }).toBe(openingZoom);
      await wheel(-80);
      await expect.poll(zoom, { timeout: 3000 }).toBe(openingZoom + 1);
      await card.getByRole("button", { name: "Zoom out", exact: true }).click();
      assert.equal(await zoom(), openingZoom);

      step = `${prefix}: two fingers zoom smoothly with the fingers, then settle on a whole level`;
      const pinchedTo = await canvas.evaluate(async (element) => {
        const box = element.getBoundingClientRect();
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        const fire = (type, id, at) => element.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", isPrimary: id === 1, button: 0, clientX: at, clientY: y, bubbles: true, cancelable: true }));
        const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        fire("pointerdown", 1, x - 30); fire("pointerdown", 2, x + 30);
        for (let spread = 1; spread <= 3; spread += 1) { fire("pointermove", 1, x - 30 - spread * 5); fire("pointermove", 2, x + 30 + spread * 5); }
        await frames();
        const during = Number(element.closest(".restock-slippy").getAttribute("data-zoom"));
        fire("pointerup", 1, x - 45); fire("pointerup", 2, x + 45);
        return during;
      });
      // Fingers 60 px apart spread to 90 px: half again as big, a little over half a level.
      assert.ok(Math.abs(pinchedTo - (openingZoom + Math.log2(1.5))) < 0.05, `The map grows with the fingers (zoom ${pinchedTo})`);
      await expect.poll(zoom, { timeout: 3000 }).toBe(openingZoom + 1);
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
      const single = await insideMap(".restock-pin:not(.restock-pin--group):not(.is-selected)");
      if (single) {
        const label = await single.getAttribute("aria-label");
        await single.click();
        await expect(card.locator(".restock-pin.is-selected")).toHaveAttribute("aria-label", label);
      }

      step = `${prefix}: a group of stores opens when tapped`;
      for (let out = 0; out < 6 && !(await insideMap(".restock-pin--group")); out += 1) await card.getByRole("button", { name: "Zoom out", exact: true }).click();
      const group = await insideMap(".restock-pin--group");
      if (group) {
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
      // The pins follow the map: wherever it goes, that town's stores are there (not a fixed 60).
      await expect.poll(storesInView, { timeout: 5000 }).toBeGreaterThan(3);

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
