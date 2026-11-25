// Continuous card scanning, end to end with a stand-in camera (Nov 25 2026).
// The page's camera is replaced by a drawn card (a generic layout, no real card art),
// so the real camera frame, auto-scan, on-device reader and list all run:
// card 1 is read, card 2 is read without waiting, card 1 again becomes x2, Undo takes
// it back, and a card with no text adds nothing.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/continuous-scan");
fs.mkdirSync(output, { recursive: true });
const appUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5242");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(appUrl.hostname), "Synthetic scan checks are loopback only");
const READ_TIMEOUT = 120000; // the first read loads the reader

function standInCamera() {
  window.__card = { name: "Pikachu", number: "025/165", hue: 48, blank: false };
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1440;
  const context = canvas.getContext("2d");
  const draw = () => {
    const card = window.__card;
    context.fillStyle = "#39403b"; context.fillRect(0, 0, canvas.width, canvas.height);
    if (card.hidden) return; // an empty table: the card was taken away
    const height = 1010, width = Math.round(height * 63 / 88), x = (canvas.width - width) / 2 + (card.dx || 0), y = (canvas.height - height) / 2;
    context.fillStyle = "#e3cf4a"; context.beginPath(); context.roundRect(x, y, width, height, 34); context.fill();
    context.fillStyle = "#f3f0e4"; context.fillRect(x + 30, y + 30, width - 60, height - 60);
    const art = context.createLinearGradient(x, y + 150, x + width, y + 150 + height * 0.4);
    art.addColorStop(0, `hsl(${card.hue} 70% 55%)`); art.addColorStop(1, `hsl(${(card.hue + 40) % 360} 60% 35%)`);
    context.fillStyle = art; context.fillRect(x + 56, y + 150, width - 112, height * 0.4);
    if (card.blank) return;
    context.fillStyle = "#101010"; context.textBaseline = "top";
    context.font = "bold 62px Arial"; context.fillText(card.name, x + 58, y + 56);
    context.font = "28px Arial";
    context.fillText("Quick strike 20", x + 62, y + height * 0.6);
    context.fillText("Flip a coin. If heads, draw a card.", x + 62, y + height * 0.66);
    context.font = "bold 34px Arial"; context.fillText(card.number, x + 62, y + height - 96);
  };
  draw();
  setInterval(draw, 100);
  const stream = () => canvas.captureStream(15);
  const devices = navigator.mediaDevices || {};
  devices.getUserMedia = async () => stream();
  if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: devices });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  const page = await context.newPage();
  await page.addInitScript(standInCamera);
  let step = "open";
  try {
    await page.goto(`${appUrl.origin}/?betaLocalMode=true`, { waitUntil: "domcontentloaded" });
    step = "Home opens on a few big choices, with the rest under More";
    await expect(page.locator(".home-choices .home-choice")).toHaveCount(5, { timeout: 60000 });
    await expect(page.locator("details.home-more")).not.toHaveAttribute("open", "");
    step = "Home: Scan cards opens the camera";
    await page.locator(".home-choice--scan").click({ timeout: 60000 });
    const scan = page.locator(".add-anything-card-page-review");
    await expect(scan).toBeVisible({ timeout: 30000 });
    await expect(scan.locator(".card-camera-frame video")).toBeVisible({ timeout: 30000 });
    const last = scan.locator(".multi-card-scanner__last");
    const rows = scan.locator(".quick-add-card-scan-row");
    const cameraStatus = scan.locator(".card-camera-frame__auto-status");

    step = "Card 1 is taken by itself and read";
    await expect(last).toContainText("Pikachu", { timeout: READ_TIMEOUT });
    await expect(last).toContainText("025/165");
    await expect(rows).toHaveCount(1);
    await expect(cameraStatus).toHaveText("Got it. Show the next card.");
    await expect(scan.locator(".card-camera-frame__got")).toBeVisible();
    // The camera is free while cards are read: the button never sits on "Reading…".
    await expect(scan.locator(".card-camera-frame__shutter")).toHaveText("Scan this card");
    // The last card is right under the camera picture, above the buttons, on screen without scrolling.
    await scan.locator(".card-camera-frame").evaluate((element) => element.scrollIntoView({ block: "start" }));
    const viewBox = await scan.locator(".card-camera-frame__view").boundingBox();
    const lastBox = await last.boundingBox();
    const shutterBox = await scan.locator(".card-camera-frame__shutter").boundingBox();
    assert.ok(lastBox.y >= viewBox.y + viewBox.height - 1 && lastBox.y + lastBox.height <= shutterBox.y + 1, "The last card sits between the camera picture and the buttons");
    await expect(scan.getByRole("button", { name: "Close camera", exact: true })).toHaveCount(0);
    for (const name of [/^One more copy of/, "Undo"]) {
      const box = await last.getByRole("button", { name }).boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, "Touch target is at least 44px");
    }
    await page.screenshot({ path: path.join(output, "card-1.png") });

    step = "Card 2 is read after card 1 without closing the camera";
    await page.evaluate(() => { window.__card = { name: "Charizard ex", number: "125/197", hue: 12, blank: false }; });
    await expect(last).toContainText("Charizard", { timeout: READ_TIMEOUT });
    await expect(rows).toHaveCount(2);

    step = "Card 1 again is one more copy, not a new line";
    await page.evaluate(() => { window.__card = { name: "Pikachu", number: "025/165", hue: 48, blank: false }; });
    await expect(last).toContainText("you now have 2", { timeout: READ_TIMEOUT });
    await expect(rows).toHaveCount(2);
    await expect(rows.first().locator("strong").first()).toContainText("×2");
    await expect(scan.getByRole("button", { name: /^Save 3 cards$/ })).toBeVisible();
    await scan.locator(".card-camera-frame").evaluate((element) => element.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: path.join(output, "same-card-again.png") });

    step = "Undo takes the extra copy back";
    await last.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(last).not.toContainText("×2");
    await expect(rows).toHaveCount(2);
    await expect(rows.first().locator("strong").first()).not.toContainText("×2");
    await expect(scan.getByRole("button", { name: /^Save 2 cards$/ })).toBeVisible();

    step = "The same card drifting in the hand is not taken again";
    await page.evaluate(() => { window.__card = { name: "Pikachu", number: "025/165", hue: 48, blank: false, dx: 46 }; });
    await page.waitForTimeout(8000);
    await expect(cameraStatus).toHaveText("Got it. Show the next card.");
    await expect(rows).toHaveCount(2);
    await expect(rows.first().locator("strong").first()).not.toContainText("×2");
    await expect(scan.locator(".multi-card-scanner__count")).toContainText("2 cards scanned");

    step = "One more adds a copy without showing the card again";
    await last.getByRole("button", { name: /^One more copy of Pikachu$/ }).click();
    await expect(rows.first().locator("strong").first()).toContainText("×2");
    await last.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(rows.first().locator("strong").first()).not.toContainText("×2");

    step = "A second copy shown after the first is taken away is counted";
    await page.evaluate(() => { window.__card = { hidden: true }; });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.__card = { name: "Pikachu", number: "025/165", hue: 48, blank: false }; });
    await expect(last).toContainText("you now have 2", { timeout: READ_TIMEOUT });
    await expect(rows).toHaveCount(2);
    await last.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(rows.first().locator("strong").first()).not.toContainText("×2");

    step = "A card that cannot be read adds nothing";
    await page.evaluate(() => { window.__card = { name: "", number: "", hue: 200, blank: true }; });
    await expect(scan.locator(".multi-card-scanner__status")).toContainText(/couldn't read/i, { timeout: READ_TIMEOUT });
    await expect(rows).toHaveCount(2);
    await expect(scan.locator(".multi-card-scanner__status")).toContainText("Still couldn't read that card", { timeout: READ_TIMEOUT });
    await expect(rows).toHaveCount(2);

    step = "Done scanning closes the camera and keeps the list";
    await scan.getByRole("button", { name: "Done scanning", exact: true }).click();
    await expect(scan.locator(".card-camera-frame")).toHaveCount(0);
    await expect(rows).toHaveCount(2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "No sideways scroll");
    console.log("PASS continuous scan: auto-take, background reads, same card x2, Undo, drift ignored, One more, second copy, unreadable card adds nothing");
  } catch (error) {
    await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
    const text = await page.locator(".add-anything-card-page-review").innerText().catch(() => "");
    console.error(`FAILED at: ${step}\n${text.slice(0, 1500)}`);
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
