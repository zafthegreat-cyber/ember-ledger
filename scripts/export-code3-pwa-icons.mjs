import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BRAND_CONFIG } from "../src/config/brand.js";

// Render the existing mark without changing its artwork. Run with --check to
// inspect the checked-in PNGs without rewriting them or starting an app server.
const root = fileURLToPath(new URL("../", import.meta.url));
const verifyOnly = process.argv.includes("--check");
const source = readFileSync(resolve(root, `public${BRAND_CONFIG.logoReference}`), "utf8");
const background = source.match(/<rect[^>]+fill="(#[0-9a-f]{6})"/i)?.[1];
assert.ok(background, "The source mark must provide its opaque background color");
const icons = [
  { path: BRAND_CONFIG.appleTouchIconReference, size: 180, scale: 1 },
  { path: BRAND_CONFIG.pwaIcon192Reference, size: 192, scale: 1 },
  { path: BRAND_CONFIG.pwaIcon512Reference, size: 512, scale: 1 },
  // A 56% square fits fully within the maskable icon's central 80% circle.
  { path: BRAND_CONFIG.pwaMaskableIconReference, size: 512, scale: 0.56 },
];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.route("**/*", route => route.abort());
  for (const icon of icons) {
    const file = resolve(root, `public${icon.path}`);
    const dataUrl = verifyOnly
      ? `data:image/png;base64,${readFileSync(file).toString("base64")}`
      : `data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}`;
    const result = await page.evaluate(async ({ dataUrl, background, icon, verifyOnly }) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = icon.size;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (verifyOnly) {
        if (image.naturalWidth !== icon.size || image.naturalHeight !== icon.size) throw new Error("PNG dimensions do not match");
        context.drawImage(image, 0, 0);
      } else {
        context.fillStyle = background;
        context.fillRect(0, 0, icon.size, icon.size);
        const renderedSize = icon.size * icon.scale;
        const inset = (icon.size - renderedSize) / 2;
        context.drawImage(image, inset, inset, renderedSize, renderedSize);
      }
      const pixels = context.getImageData(0, 0, icon.size, icon.size).data;
      const bg = background.slice(1).match(/../g).map(value => Number.parseInt(value, 16));
      let transparent = 0;
      let outsideSafeArea = 0;
      let artworkPixels = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] !== 255) transparent += 1;
        const different = bg.some((value, index) => Math.abs(pixels[offset + index] - value) > 2);
        if (!different) continue;
        artworkPixels += 1;
        const pixel = offset / 4;
        const x = pixel % icon.size + 0.5 - icon.size / 2;
        const y = Math.floor(pixel / icon.size) + 0.5 - icon.size / 2;
        if (Math.hypot(x, y) > icon.size * 0.4) outsideSafeArea += 1;
      }
      return { png: canvas.toDataURL("image/png").split(",")[1], transparent, outsideSafeArea, artworkPixels };
    }, { dataUrl, background, icon, verifyOnly });
    assert.equal(result.transparent, 0, `${icon.path} must be fully opaque`);
    assert.ok(result.artworkPixels > icon.size, `${icon.path} must contain visible artwork`);
    if (icon.scale < 1) assert.equal(result.outsideSafeArea, 0, "Maskable artwork must fit entirely in its safe area");
    if (!verifyOnly) writeFileSync(file, Buffer.from(result.png, "base64"));
    console.log(`${verifyOnly ? "Verified" : "Exported"} ${icon.path}: ${icon.size}x${icon.size}, opaque${icon.scale < 1 ? ", maskable safe area passed" : ""}`);
  }
} finally {
  await browser.close();
}
