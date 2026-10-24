import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BRAND_CONFIG } from "../src/config/brand.js";

// Package the approved PNG without redrawing, recoloring or cropping its source.
// No app server, account, API, environment file or network request is needed.
// Run --check to compare checked-in exports with the approved artwork.
const root = fileURLToPath(new URL("../", import.meta.url));
const verifyOnly = process.argv.includes("--check");
const background = "#290811";
const source = readFileSync(resolve(root, `public${BRAND_CONFIG.logoReference}`));
assert.equal(createHash("sha256").update(source).digest("hex"), "aa7bf3b8401f5edad06053764e5ba0804bb0afe5b505aa8eb7cd8d431e4a74cf", "Use the unchanged approved emblem");
const icons = [
  { path: `public${BRAND_CONFIG.appleTouchIconReference}`, size: 180, aliases: ["public/apple-touch-icon.png"] },
  { path: `public${BRAND_CONFIG.pwaIcon192Reference}`, size: 192, aliases: ["public/icon-192.png"] },
  { path: `public${BRAND_CONFIG.pwaIcon512Reference}`, size: 512, aliases: ["public/icon-512.png"] },
  { path: `public${BRAND_CONFIG.pwaMaskableIconReference}`, size: 512, scale: 0.86, safeRadius: 0.4, aliases: ["public/icon-maskable-512.png"] },
  { path: "public/assets/brand-system/icons/v1/icon-maskable-192.png", size: 192, scale: 0.86, safeRadius: 0.4, aliases: ["public/icon-maskable-192.png"] },
  { path: `public${BRAND_CONFIG.faviconReference}`, size: 32, aliases: ["public/favicon-32x32.png"] },
  { path: "public/assets/brand-system/icons/v1/favicon-16.png", size: 16, aliases: ["public/favicon-16x16.png"] },
  { path: "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", size: 1024 },
];
for (const [density, size, foregroundSize] of [["mdpi", 48, 108], ["hdpi", 72, 162], ["xhdpi", 96, 216], ["xxhdpi", 144, 324], ["xxxhdpi", 192, 432]]) {
  const directory = `android/app/src/main/res/mipmap-${density}`;
  icons.push(
    { path: `${directory}/ic_launcher.png`, size },
    { path: `${directory}/ic_launcher_round.png`, size, round: true, scale: 0.86, safeRadius: 0.4 },
    // Android draws a 108dp layer behind a 72dp viewport. All three cards,
    // stars and the orbit stay inside its central 66dp safe circle. The outer
    // decorative square frame may be masked, as intended by platform shapes.
    { path: `${directory}/ic_launcher_foreground.png`, size: foregroundSize, scale: 0.66, transparent: true, safeRadius: 33 / 108 },
  );
}

const browser = await chromium.launch({ headless: true });
function save(path, bytes) {
  const file = resolve(root, path);
  if (verifyOnly && path.endsWith(".svg")) assert.equal(readFileSync(file, "utf8").replaceAll("\r\n", "\n"), bytes.toString("utf8"), `${path} must embed the approved favicon`);
  else if (verifyOnly) assert.deepEqual(readFileSync(file), bytes, `${path} must be an export of the approved emblem`);
  else { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes); }
}
try {
  const page = await browser.newPage();
  await page.route("**/*", route => route.abort());
  for (const icon of icons) {
    const scale = icon.scale ?? 1;
    // The central emblem fits this conservative source bounding box.
    // Complete cards, stars and orbit stay visible; decorative corners can clip.
    if (icon.safeRadius) {
      for (const x of [0.1, 0.9]) for (const y of [0.28, 0.72]) {
        assert.ok(Math.hypot((x - 0.5) * scale, (y - 0.5) * scale) < icon.safeRadius, `${icon.path}: emblem must remain in the safe circle`);
      }
    }
    const result = await page.evaluate(async ({ dataUrl, background, icon, scale }) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      if (image.naturalWidth !== 1254 || image.naturalHeight !== 1254) throw new Error("Unexpected source dimensions");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = icon.size;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (icon.round) {
        context.beginPath();
        context.arc(icon.size / 2, icon.size / 2, icon.size / 2, 0, Math.PI * 2);
        context.clip();
      }
      if (!icon.transparent) {
        context.fillStyle = background;
        context.fillRect(0, 0, icon.size, icon.size);
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      const renderedSize = icon.size * scale;
      const inset = (icon.size - renderedSize) / 2;
      context.drawImage(image, inset, inset, renderedSize, renderedSize);
      const pixels = context.getImageData(0, 0, icon.size, icon.size).data;
      let transparentPixels = 0;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] !== 255) transparentPixels++;
      return { png: canvas.toDataURL("image/png").split(",")[1], transparentPixels };
    }, { dataUrl: `data:image/png;base64,${source.toString("base64")}`, background, icon, scale });
    if (!icon.round && !icon.transparent) assert.equal(result.transparentPixels, 0, `${icon.path} must be opaque`);
    const bytes = Buffer.from(result.png, "base64");
    save(icon.path, bytes);
    for (const alias of icon.aliases ?? []) save(alias, bytes);
    console.log(`${verifyOnly ? "Verified" : "Exported"} ${icon.path}: ${icon.size}x${icon.size}`);
  }
  // Conventional fallback URLs also use this artwork. An ICO can embed PNGs.
  const favicon16 = readFileSync(resolve(root, "public/assets/brand-system/icons/v1/favicon-16.png"));
  const favicon32 = readFileSync(resolve(root, `public${BRAND_CONFIG.faviconReference}`));
  const header = Buffer.alloc(6 + 2 * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(2, 4);
  let offset = header.length;
  for (const [index, size, bytes] of [[0, 16, favicon16], [1, 32, favicon32]]) {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(bytes.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += bytes.length;
  }
  save("public/favicon.ico", Buffer.concat([header, favicon16, favicon32]));
  save("public/favicon.svg", Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><title>Code 3 TCG</title><image width="32" height="32" href="data:image/png;base64,${favicon32.toString("base64")}" /></svg>\n`));
} finally {
  await browser.close();
}
console.log(`Approved home-screen exports ${verifyOnly ? "verified" : "ready"}. Original artwork and app identity are unchanged.`);
