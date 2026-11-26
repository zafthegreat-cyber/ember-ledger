// Card camera picture quality, end to end with a stand-in camera (Nov 26 2026).
// The page's camera is replaced by a drawn card (a generic layout, no real card
// art) that the test can smear or dim, so the real camera screen runs:
// - an outline sits on the card the camera has found, solid once it is ready;
// - a picture taken while the view is smeared keeps the sharp frame that follows
//   (three are taken in a row and the sharpest is kept);
// - a card held at a slant is still found, outlined at its slant, photographed
//   upright and read;
// - a dark, soft view says it is too dark, and a view that stays blurry in good
//   light says what to try.
// Auto-scan is switched off here so the test decides when a picture is taken.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, expect } = require("@playwright/test");

const output = path.resolve(process.env.QA_OUTPUT_DIR || "artifacts/qa/scan-picture-quality");
fs.mkdirSync(output, { recursive: true });
const appUrl = new URL(process.env.APP_URL || "http://127.0.0.1:5242");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(appUrl.hostname), "Synthetic scan checks are loopback only");

// The drawn card, in the stand-in camera's own pixels (1080 x 1440).
const CAMERA = { width: 1080, height: 1440 };
const CARD = { height: 1010, width: Math.round(1010 * 63 / 88) };
CARD.x = (CAMERA.width - CARD.width) / 2;
CARD.y = (CAMERA.height - CARD.height) / 2;

function standInCamera() {
  try { localStorage.setItem("code3.scanner.autoCapture.v1", "off"); } catch { /* The test then fails on the toggle text. */ }
  window.__look = { blur: 0, dim: false, tilt: 0, name: "Pikachu", number: "025/165" };
  window.__pictures = [];
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1440;
  const context = canvas.getContext("2d");
  const draw = () => {
    const look = window.__look;
    context.filter = "none";
    context.fillStyle = "#39403b"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.filter = look.blur ? `blur(${look.blur}px)` : "none";
    // tilt: the card turned about the middle of the view, as a hand holds it.
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(((look.tilt || 0) * Math.PI) / 180);
    context.translate(-canvas.width / 2, -canvas.height / 2);
    const height = 1010, width = Math.round(height * 63 / 88), x = (canvas.width - width) / 2, y = (canvas.height - height) / 2;
    context.fillStyle = "#e3cf4a"; context.beginPath(); context.roundRect(x, y, width, height, 34); context.fill();
    context.fillStyle = "#f3f0e4"; context.fillRect(x + 30, y + 30, width - 60, height - 60);
    const art = context.createLinearGradient(x, y + 150, x + width, y + 150 + height * 0.4);
    art.addColorStop(0, "hsl(48 70% 55%)"); art.addColorStop(1, "hsl(88 60% 35%)");
    context.fillStyle = art; context.fillRect(x + 56, y + 150, width - 112, height * 0.4);
    context.fillStyle = "#101010"; context.textBaseline = "top";
    context.font = "bold 62px Arial"; context.fillText(look.name || "Pikachu", x + 58, y + 56);
    context.font = "28px Arial";
    context.fillText("Quick strike 20", x + 62, y + height * 0.6);
    context.fillText("Flip a coin. If heads, draw a card.", x + 62, y + height * 0.66);
    context.font = "bold 34px Arial"; context.fillText(look.number || "025/165", x + 62, y + height - 96);
    context.restore();
    context.filter = "none";
    if (look.dim) { context.fillStyle = "rgba(0, 0, 0, 0.8)"; context.fillRect(0, 0, canvas.width, canvas.height); }
  };
  draw();
  setInterval(draw, 16);
  const devices = navigator.mediaDevices || {};
  devices.getUserMedia = async () => canvas.captureStream(30);
  if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: devices });
  // Every card picture the camera hands on is measured here: how crisp its name strip is.
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function measured(callback, type, ...rest) {
    try {
      const shape = this.width / this.height;
      if (type === "image/jpeg" && this.width > 200 && shape > 0.6 && shape < 0.85) {
        const rows = Math.round(this.height * 0.16);
        const pixels = this.getContext("2d").getImageData(0, 0, this.width, rows).data;
        let sum = 0, count = 0;
        for (let row = 0; row < rows; row += 2) {
          for (let column = 1; column < this.width; column += 1) {
            const index = (row * this.width + column) * 4;
            sum += Math.abs(pixels[index + 1] - pixels[index - 3]);
            count += 1;
          }
        }
        // slant: how far the card's left edge leans between a third and two thirds of the way down, as a share of the width.
        const edgeAt = (row) => {
          const line = this.getContext("2d").getImageData(0, row, this.width, 1).data;
          for (let column = 0; column < this.width; column += 1) if ((line[column * 4] * 3 + line[column * 4 + 1] * 6 + line[column * 4 + 2]) / 10 >= 150) return column;
          return -1;
        };
        const upper = edgeAt(Math.round(this.height * 0.3)), lower = edgeAt(Math.round(this.height * 0.7));
        window.__pictures.push({ width: this.width, height: this.height, crisp: sum / count, slant: upper < 0 || lower < 0 ? null : (lower - upper) / this.width });
      }
    } catch { /* Measuring must never stop the picture. */ }
    return toBlob.call(this, callback, type, ...rest);
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  const page = await context.newPage();
  await page.addInitScript(standInCamera);
  let step = "open";
  try {
    await page.goto(`${appUrl.origin}/?betaLocalMode=true`, { waitUntil: "domcontentloaded" });
    step = "Home: Scan cards opens the camera with auto-scan off";
    await page.locator(".home-choice--scan").click({ timeout: 60000 });
    const scan = page.locator(".add-anything-card-page-review");
    await expect(scan).toBeVisible({ timeout: 60000 });
    const camera = scan.locator(".card-camera-frame");
    await expect(camera.locator("video")).toBeVisible({ timeout: 60000 });
    await expect(camera.getByRole("button", { name: "Auto-scan: off", exact: true })).toBeEnabled({ timeout: 60000 });
    const status = camera.locator(".card-camera-frame__auto-status");
    const found = camera.locator(".card-camera-frame__found");
    const shutter = camera.locator(".card-camera-frame__shutter");
    await camera.evaluate((element) => element.scrollIntoView({ block: "start" }));

    step = "An outline sits on the card the camera found, solid once it is ready";
    await expect(found).toHaveClass(/is-ready/, { timeout: 30000 });
    await expect(status).toHaveText("Hold still…");
    const view = await camera.locator(".card-camera-frame__view").boundingBox();
    const outline = await found.boundingBox();
    const scale = view.width / CAMERA.width;
    assert.ok(Math.abs(view.height / view.width - 4 / 3) < 0.01, "The camera view is 3 by 4, like the stand-in camera");
    const expected = { x: view.x + CARD.x * scale, y: view.y + CARD.y * scale, width: CARD.width * scale, height: CARD.height * scale };
    const slack = view.width * 0.035;
    for (const [edge, got, want] of [["left", outline.x, expected.x], ["top", outline.y, expected.y], ["right", outline.x + outline.width, expected.x + expected.width], ["bottom", outline.y + outline.height, expected.y + expected.height]]) {
      assert.ok(Math.abs(got - want) <= slack, `The outline's ${edge} edge is on the card (${got.toFixed(1)} vs ${want.toFixed(1)}, slack ${slack.toFixed(1)})`);
    }
    await page.screenshot({ path: path.join(output, "outline-ready.png") });

    const pictures = () => page.evaluate(() => window.__pictures.length);
    // Takes one picture; smearedUntilTaken: the view is smeared until just after the button is pressed.
    const takePicture = async ({ smearedUntilTaken = false } = {}) => {
      await expect(shutter).toBeEnabled({ timeout: 30000 });
      const before = await pictures();
      await page.evaluate((clear) => {
        document.querySelector(".card-camera-frame__shutter").click();
        if (clear) setTimeout(() => { window.__look.blur = 0; }, 15);
      }, smearedUntilTaken);
      await expect.poll(pictures, { timeout: 30000 }).toBe(before + 1);
      return page.evaluate(() => window.__pictures[window.__pictures.length - 1]);
    };

    step = "A picture of a still, sharp card is crisp";
    const sharp = await takePicture();
    assert.ok(sharp.width > 250 && Math.abs(sharp.width / sharp.height - 63 / 88) < 0.06, `The picture is cut to the card (${sharp.width}x${sharp.height})`);

    step = "A picture taken while the view stays smeared is not crisp (the measure tells them apart)";
    await page.evaluate(() => { window.__look.blur = 9; });
    await page.waitForTimeout(500);
    const smeared = await takePicture();
    assert.ok(smeared.crisp < sharp.crisp * 0.6, `Smeared ${smeared.crisp.toFixed(2)} is well under sharp ${sharp.crisp.toFixed(2)}`);

    step = "A picture taken mid-wobble keeps the sharp frame that follows";
    let crisp = 0;
    const tries = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await page.evaluate(() => { window.__look.blur = 9; });
      await page.waitForTimeout(500);
      const picture = await takePicture({ smearedUntilTaken: true });
      tries.push(picture.crisp.toFixed(2));
      if (picture.crisp >= sharp.crisp * 0.8) crisp += 1;
    }
    assert.ok(crisp >= 3, `At least 3 of 4 pictures taken mid-wobble are as crisp as a still one (${tries.join(", ")} against ${sharp.crisp.toFixed(2)})`);

    step = "A card held at a slant is found, outlined at its slant, photographed upright and read";
    assert.ok(Math.abs(sharp.slant) < 0.012, `A straight card's picture is straight (${sharp.slant})`);
    const outlineTurn = async () => Number(((await found.getAttribute("style").catch(() => "")) || "").match(/rotate\((-?[\d.]+)deg\)/)?.[1] ?? 0);
    const slanted = [];
    for (const [tilt, name, number] of [[6, "Charizard ex", "125/197"], [-8, "Charizard ex", "125/197"]]) {
      await page.evaluate((look) => { window.__look = { blur: 0, dim: false, ...look }; }, { tilt, name, number });
      await expect.poll(async () => Math.abs((await outlineTurn()) - tilt), { timeout: 20000, message: `The outline turns with a card held at ${tilt} degrees` }).toBeLessThanOrEqual(1);
      const turn = await outlineTurn();
      assert.ok(Math.sign(turn) === Math.sign(tilt) && Math.abs(turn - tilt) <= 1, `The outline is turned ${turn} degrees for a card at ${tilt}`);
      await expect(found).toHaveClass(/is-ready/, { timeout: 20000 });
      const picture = await takePicture();
      slanted.push(`${tilt} degrees: slant ${picture.slant?.toFixed(3)}`);
      assert.ok(picture.slant !== null && Math.abs(picture.slant) < 0.012, `The picture of a card held at ${tilt} degrees is upright (left edge leans ${picture.slant} of the width; unturned it would lean about ${(Math.tan((Math.abs(tilt) * Math.PI) / 180) * 0.4 * 88 / 63).toFixed(3)})`);
      assert.ok(picture.crisp >= sharp.crisp * 0.6, `and still crisp (${picture.crisp.toFixed(2)} against ${sharp.crisp.toFixed(2)})`);
    }
    await expect(scan.locator(".multi-card-scanner__last")).toContainText("Charizard", { timeout: 180000 });
    await page.evaluate(() => { window.__look = { blur: 0, dim: false, tilt: 0 }; });
    await expect.poll(outlineTurn, { timeout: 20000 }).toBe(0);

    step = "A dark, soft view says it is too dark";
    await page.evaluate(() => { window.__look = { blur: 30, dim: true }; });
    await expect(status).toHaveText("It's too dark to read the card. Move to better light.", { timeout: 20000 });
    await expect(found).not.toHaveClass(/is-ready/);
    await page.screenshot({ path: path.join(output, "too-dark.png") });

    step = "A view that goes blurry in good light gets the short tip first, then what to try";
    // Sharp first: the count of blurry looks starts again from a ready view.
    await page.evaluate(() => { window.__look = { blur: 0, dim: false }; });
    await expect(status).toHaveText("Hold still…", { timeout: 20000 });
    await page.evaluate(() => { window.__look = { blur: 30, dim: false }; });
    await expect(status).toHaveText("Hold steady while it focuses.", { timeout: 20000 });
    await expect(status).toHaveText("Still blurry. Try brighter light.", { timeout: 20000 });
    await expect(found).not.toHaveClass(/is-ready/);

    step = "A sharp view is ready again";
    await page.evaluate(() => { window.__look = { blur: 0, dim: false }; });
    await expect(status).toHaveText("Hold still…", { timeout: 20000 });
    await expect(found).toHaveClass(/is-ready/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "No sideways scroll");
    console.log(`PASS scan picture quality: outline on the found card, sharpest of three kept (${tries.join(", ")} against ${sharp.crisp.toFixed(2)} sharp and ${smeared.crisp.toFixed(2)} smeared), a slanted card photographed upright (${slanted.join("; ")}) and read, too-dark and still-blurry tips`);
  } catch (error) {
    await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
    const text = await page.locator(".add-anything-card-page-review").innerText().catch(() => "");
    console.error(`FAILED at: ${step}\n${text.slice(0, 1200)}`);
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
