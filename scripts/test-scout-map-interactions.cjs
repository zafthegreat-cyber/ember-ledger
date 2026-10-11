const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("@playwright/test");

const appUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5203/");
const artifactDir = path.join(process.cwd(), "artifacts", "qa", "scout-map-interactions");
const mapSelector = ".scout-command-real-map";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function selectFirstStore(page, pins) {
  const selectedStore = page.locator(".scout-command-selected");
  await pins.nth(0).click();
  await page.waitForTimeout(150);
  if (await selectedStore.count() === 0) {
    await pins.nth(0).click();
    await page.waitForTimeout(150);
  }
  const selectedCount = await selectedStore.count();
  if (!selectedCount) {
    const pinState = await pins.nth(0).evaluate((element) => ({
      ariaLabel: element.getAttribute("aria-label"),
      className: element.className,
      panX: element.closest(".scout-tile-map-canvas")?.dataset.panX,
      panY: element.closest(".scout-tile-map-canvas")?.dataset.panY,
    }));
    throw new Error(`Scout pin did not select a store after reset: ${JSON.stringify(pinState)}`);
  }
  const selectedVisible = await selectedStore.isVisible();
  if (!selectedVisible) {
    const selectedState = await selectedStore.evaluate((element) => ({
      rect: element.getBoundingClientRect().toJSON(),
      display: getComputedStyle(element).display,
      visibility: getComputedStyle(element).visibility,
      text: element.textContent.trim(),
    }));
    throw new Error(`Scout selected-store actions are not visible: ${JSON.stringify(selectedState)}`);
  }
  return selectedStore;
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const browserErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon|ResizeObserver loop/i.test(message.text())) {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  try {
    const url = new URL("/scout", appUrl);
    url.searchParams.set("betaLocalMode", "true");
    url.searchParams.set("themeInspect", "light");
    await page.goto(url.toString(), { waitUntil: "networkidle" });
    await page.locator(mapSelector).waitFor({ state: "visible", timeout: 15000 });

    const tiles = page.locator(`${mapSelector} .scout-tile-map-tile`);
    const pins = page.locator(`${mapSelector} .scout-tile-map-pin`);
    assert(await tiles.count() > 0, "Scout map did not render OpenStreetMap tiles.");
    assert(await pins.count() > 0, "Scout map did not render store pins.");

    const selectedStore = await selectFirstStore(page, pins);
    assert(await selectedStore.getByRole("button", { name: "Open Store" }).isVisible(), "Selected store did not expose Open Store.");
    assert(await selectedStore.getByRole("button", { name: "Add Report" }).isVisible(), "Selected store did not expose Add Report.");
    await page.screenshot({ path: path.join(artifactDir, "desktop-selected-store.png"), fullPage: false });

    const zoomIn = page.getByRole("button", { name: "Zoom map in" });
    const resetZoom = page.getByRole("button", { name: "Reset map zoom" });
    assert(await zoomIn.isVisible(), "Scout zoom-in control is not visible.");
    await zoomIn.click();
    assert(await resetZoom.isEnabled(), "Scout zoom reset did not activate after zooming.");
    await resetZoom.click();

    const mapCanvas = page.locator(`${mapSelector} .scout-tile-map-canvas`);
    await mapCanvas.focus();
    await page.keyboard.press("ArrowLeft");
    assert(Number(await mapCanvas.getAttribute("data-pan-x")) > 0, "Scout map did not respond to keyboard panning.");
    await page.keyboard.press("Home");
    assert(await mapCanvas.getAttribute("data-pan-x") === "0", "Scout map Home key did not reset its position.");
    const mapBounds = await mapCanvas.boundingBox();
    assert(mapBounds, "Scout map canvas bounds are unavailable.");
    const pinBeforeDrag = await pins.nth(0).boundingBox();
    await page.mouse.move(mapBounds.x + mapBounds.width * 0.46, mapBounds.y + mapBounds.height * 0.54);
    await page.mouse.down();
    await page.mouse.move(mapBounds.x + mapBounds.width * 0.57, mapBounds.y + mapBounds.height * 0.65, { steps: 8 });
    await page.mouse.up();
    const draggedPan = await mapCanvas.evaluate((element) => ({
      x: Number(element.dataset.panX || 0),
      y: Number(element.dataset.panY || 0),
    }));
    assert(Math.abs(draggedPan.x) > 8 || Math.abs(draggedPan.y) > 8, "Scout map did not retain pointer-drag pan state.");
    const pinAfterDrag = await pins.nth(0).boundingBox();
    assert(
      pinBeforeDrag && pinAfterDrag && (Math.abs(pinAfterDrag.x - pinBeforeDrag.x) > 8 || Math.abs(pinAfterDrag.y - pinBeforeDrag.y) > 8),
      "Scout store pins did not move with the dragged map layer."
    );
    assert(await resetZoom.isEnabled(), "Scout map reset did not activate after panning.");
    await page.screenshot({ path: path.join(artifactDir, "desktop-dragged-map.png"), fullPage: false });
    await resetZoom.click();
    assert(await mapCanvas.getAttribute("data-pan-x") === "0" && await mapCanvas.getAttribute("data-pan-y") === "0", "Scout map reset did not clear pan state.");
    await page.waitForTimeout(200);

    const storeList = page.getByRole("button", { name: "Store list" });
    await storeList.click();
    await page.locator(".scout-command-map-list").waitFor({ state: "visible" });
    assert(await page.locator(".scout-command-map-list > button").count() > 0, "Store list view did not render mapped stores.");
    await page.screenshot({ path: path.join(artifactDir, "desktop-store-list.png"), fullPage: false });

    const mapButton = page.getByRole("button", { name: "Map", exact: true });
    await mapButton.click();
    await page.locator(mapSelector).waitFor({ state: "visible" });

    await page.getByRole("button", { name: "Open Store", exact: true }).click();
    await page.waitForTimeout(250);
    const storeDetailText = await page.locator("body").innerText();
    if (!/Scout > Stores >/i.test(storeDetailText)) {
      await page.screenshot({ path: path.join(artifactDir, "desktop-store-open-failure.png"), fullPage: true });
    }
    assert(/Scout > Stores >/i.test(storeDetailText), `Open Store did not navigate to a store detail surface. Visible route text: ${storeDetailText.slice(-500)}`);
    await page.screenshot({ path: path.join(artifactDir, "desktop-store-detail.png"), fullPage: false });
    const desktopLayout = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert(desktopLayout.scrollWidth <= desktopLayout.width + 2, "Scout store detail overflows horizontally on desktop.");

    assert(browserErrors.length === 0, `Scout map emitted browser errors:\n${browserErrors.join("\n")}`);

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(url.toString(), { waitUntil: "networkidle" });
    await mobilePage.locator(mapSelector).waitFor({ state: "visible", timeout: 15000 });
    const mobilePins = mobilePage.locator(`${mapSelector} .scout-tile-map-pin`);
    assert(await mobilePins.count() > 0, "Scout map did not render mobile store pins.");
    await selectFirstStore(mobilePage, mobilePins);
    const mobileCanvas = mobilePage.locator(`${mapSelector} .scout-tile-map-canvas`);
    const mobileMapBounds = await mobileCanvas.boundingBox();
    assert(mobileMapBounds, "Mobile Scout map canvas bounds are unavailable.");
    await mobilePage.mouse.move(mobileMapBounds.x + mobileMapBounds.width * 0.46, mobileMapBounds.y + mobileMapBounds.height * 0.5);
    await mobilePage.mouse.down();
    await mobilePage.mouse.move(mobileMapBounds.x + mobileMapBounds.width * 0.57, mobileMapBounds.y + mobileMapBounds.height * 0.42, { steps: 6 });
    await mobilePage.mouse.up();
    const mobilePan = await mobileCanvas.evaluate((element) => Number(element.dataset.panX || 0));
    assert(Math.abs(mobilePan) > 8, "Scout map did not support pointer-drag panning at mobile width.");
    await mobilePage.screenshot({ path: path.join(artifactDir, "mobile-dragged-map.png"), fullPage: false });
    const mobileReset = mobilePage.getByRole("button", { name: "Reset map zoom" });
    assert(await mobileReset.isVisible(), "Mobile Scout map reset is not visible after panning.");
    await mobileReset.click();
    await mobilePage.getByRole("button", { name: "Open Store", exact: true }).click();
    await mobilePage.waitForTimeout(250);
    assert(/Scout > Stores >/i.test(await mobilePage.locator("body").innerText()), "Open Store did not reach mobile store detail.");
    const mobileLayout = await mobilePage.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert(mobileLayout.scrollWidth <= mobileLayout.width + 2, "Scout store detail overflows horizontally on mobile.");
    await mobilePage.screenshot({ path: path.join(artifactDir, "mobile-store-detail.png"), fullPage: false });
    await mobileContext.close();

    console.log("Scout map interaction test passed: tiles, pointer drag, keyboard-ready pan, pins, zoom, selection, actions, list, and map restore.");
    console.log(`Screenshots: ${artifactDir}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
