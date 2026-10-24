import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inflateSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

function inspectPng(path, width, height = width, { opaque = false } = {}) {
  const image = readFileSync(resolve(root, path));
  assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${path} must be a PNG`);
  assert.equal(image.readUInt32BE(16), width, `${path} width`);
  assert.equal(image.readUInt32BE(20), height, `${path} height`);
  if (!opaque) return image;

  // Inspect actual decoded alpha, rather than assuming an RGBA PNG is opaque.
  assert.equal(image[24], 8, `${path} must use supported 8-bit pixels`);
  assert.ok([2, 6].includes(image[25]), `${path} must use RGB or RGBA pixels`);
  assert.equal(image[28], 0, `${path} must be noninterlaced`);
  const chunks = [];
  for (let offset = 8; offset < image.length;) {
    const length = image.readUInt32BE(offset);
    const type = image.toString("ascii", offset + 4, offset + 8);
    assert.ok(offset + length + 12 <= image.length, `${path} has a truncated chunk`);
    assert.notEqual(type, "tRNS", `${path} must not declare transparent pixels`);
    if (type === "IDAT") chunks.push(image.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const channels = image[25] === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(chunks));
  assert.equal(raw.length, height * (stride + 1), `${path} decoded pixel size`);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    const filter = raw[start];
    assert.ok(filter <= 4, `${path} has an unsupported PNG filter`);
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x];
      const upperLeft = x >= channels ? previous[x - channels] : 0;
      let prediction = 0;
      if (filter === 1) prediction = left;
      if (filter === 2) prediction = up;
      if (filter === 3) prediction = Math.floor((left + up) / 2);
      if (filter === 4) {
        const p = left + up - upperLeft;
        const a = Math.abs(p - left);
        const b = Math.abs(p - up);
        const c = Math.abs(p - upperLeft);
        prediction = a <= b && a <= c ? left : b <= c ? up : upperLeft;
      }
      row[x] = (raw[start + 1 + x] + prediction) & 255;
    }
    if (channels === 4) {
      for (let x = 3; x < stride; x += 4) assert.equal(row[x], 255, `${path} must be opaque at row ${y}, pixel ${(x - 3) / 4}`);
    }
    previous = row;
  }
  return image;
}

const { BRAND_CONFIG, formatBrowserTitle } = await import(pathToFileURL(resolve(root, "src/config/brand.js")));
const { default: viteConfig } = await import(pathToFileURL(resolve(root, "vite.config.js")));
const metadataPlugin = viteConfig.plugins.find(plugin => plugin.name === "business-hub-brand-metadata");
assert.equal(metadataPlugin.transformIndexHtml.order, "pre", "Brand placeholders must resolve before Vite rewrites HTML asset URLs");
const brandedHtml = metadataPlugin.transformIndexHtml.handler(read("index.html"));
assert.ok(brandedHtml.includes(`src="${BRAND_CONFIG.logoReference}"`));
assert.ok(!brandedHtml.includes("__BRAND_") && !/\b(?:src|href)="\/\/assets\//.test(brandedHtml), "Brand artwork must stay on the app origin");
let devManifest;
metadataPlugin.configureServer({
  middlewares: {
    use(route, handler) {
      assert.equal(route, "/manifest.webmanifest");
      handler({}, {
        setHeader(name, value) {
          assert.equal(name, "Content-Type");
          assert.match(value, /^application\/manifest\+json/);
        },
        end(source) { devManifest = JSON.parse(source); },
      });
    },
  },
});
assert.equal(devManifest.name, BRAND_CONFIG.pwaName);
assert.deepEqual(devManifest.icons, [
  { src: BRAND_CONFIG.pwaIcon192Reference, sizes: "192x192", type: "image/png", purpose: "any" },
  { src: BRAND_CONFIG.pwaIcon512Reference, sizes: "512x512", type: "image/png", purpose: "any" },
  { src: BRAND_CONFIG.pwaMaskableIconReference, sizes: "512x512", type: "image/png", purpose: "maskable" },
], "Install icons must advertise their actual dimensions and masking behavior");
for (const field of ["id", "start_url", "scope"]) assert.equal(devManifest[field], "/", `The existing installed app's ${field} must remain unchanged`);

assert.equal(BRAND_CONFIG.applicationDisplayName, "Code 3 TCG");
assert.equal(BRAND_CONFIG.shortName, "Code 3 TCG");
assert.equal(BRAND_CONFIG.pwaName, "Code 3 TCG");
assert.equal(BRAND_CONFIG.pwaShortName, "Code 3 TCG");
assert.equal(BRAND_CONFIG.accessibleLogoText, "Code 3 TCG");
assert.equal(BRAND_CONFIG.browserTitleTemplate, "Code 3 TCG — {pageTitle}");
assert.equal(BRAND_CONFIG.tagline, "", "The unresolved tagline must remain blank");
assert.equal(BRAND_CONFIG.businessDisplayName, "", "The legal/public business name remains separately configurable");
assert.equal(BRAND_CONFIG.legalBusinessDisplayName, "", "No legal business name should be inferred from the app name");
assert.equal(formatBrowserTitle(), "Code 3 TCG");
assert.equal(formatBrowserTitle("Home"), "Code 3 TCG — Home");
assert.equal(BRAND_CONFIG.monogram, "", "The retired C3 monogram must not replace the supplied emblem");
assert.equal(BRAND_CONFIG.logoReference, "/assets/brand-system/artwork/code3-emblem-icon.png");
assert.equal(BRAND_CONFIG.wordmarkReference, "/assets/brand-system/artwork/code3-wordmark.png");
assert.equal(BRAND_CONFIG.wordmarkOnDarkReference, "/assets/brand-system/artwork/code3-wordmark-on-dark.png");
assert.equal(BRAND_CONFIG.bannerReference, "/assets/brand-system/artwork/code3-banner.png");
assert.equal(BRAND_CONFIG.iconSize, 1254);
const originalEmblem = inspectPng(`public${BRAND_CONFIG.logoReference}`, 1254);
assert.equal(createHash("sha256").update(originalEmblem).digest("hex"), "aa7bf3b8401f5edad06053764e5ba0804bb0afe5b505aa8eb7cd8d431e4a74cf", "The approved source artwork must remain byte-for-byte unchanged");
assert.equal(BRAND_CONFIG.faviconReference, "/assets/brand-system/icons/v1/favicon-32.png");
assert.equal(BRAND_CONFIG.appleTouchIconReference, "/assets/brand-system/icons/v1/apple-touch-icon.png");
assert.equal(BRAND_CONFIG.pwaIcon192Reference, "/assets/brand-system/icons/v1/icon-192.png");
assert.equal(BRAND_CONFIG.pwaIcon512Reference, "/assets/brand-system/icons/v1/icon-512.png");
assert.equal(BRAND_CONFIG.pwaMaskableIconReference, "/assets/brand-system/icons/v1/icon-maskable-512.png");
assert.match(read("index.html"), /rel="apple-touch-icon" sizes="180x180" href="__BRAND_APPLE_TOUCH_ICON__"/);
assert.match(read("index.html"), /rel="icon" href="__BRAND_FAVICON__" type="image\/png" sizes="32x32"/);
for (const [iconPath, size] of [
  [BRAND_CONFIG.faviconReference, 32],
  [BRAND_CONFIG.appleTouchIconReference, 180],
  [BRAND_CONFIG.pwaIcon192Reference, 192],
  [BRAND_CONFIG.pwaIcon512Reference, 512],
  [BRAND_CONFIG.pwaMaskableIconReference, 512],
]) {
  inspectPng(`public${iconPath}`, size, size, { opaque: true });
}
for (const [fallback, versioned] of [
  ["apple-touch-icon.png", BRAND_CONFIG.appleTouchIconReference],
  ["icon-192.png", BRAND_CONFIG.pwaIcon192Reference],
  ["icon-512.png", BRAND_CONFIG.pwaIcon512Reference],
  ["icon-maskable-512.png", BRAND_CONFIG.pwaMaskableIconReference],
  ["favicon-32x32.png", BRAND_CONFIG.faviconReference],
]) {
  const digest = path => createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
  assert.equal(digest(`public/${fallback}`), digest(`public${versioned}`), `${fallback} must match the new install artwork for older cached links`);
}
inspectPng("public/favicon-16x16.png", 16);
inspectPng("public/icon-maskable-192.png", 192, 192, { opaque: true });
for (const [imagePath, width, height] of [[BRAND_CONFIG.wordmarkReference, 2172, 724], [BRAND_CONFIG.wordmarkOnDarkReference, 2172, 724], [BRAND_CONFIG.bannerReference, 2171, 724]]) {
  inspectPng(`public${imagePath}`, width, height);
}
const nativeConfig = JSON.parse(read("capacitor.config.json"));
assert.equal(nativeConfig.appId, "app.code3tcg.mobile", "Updating icons must preserve the native app identity");
assert.equal(nativeConfig.appName, "Code 3 TCG");
const iosIcons = JSON.parse(read("ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json"));
assert.deepEqual(iosIcons.images, [{ filename: "AppIcon-512@2x.png", idiom: "universal", platform: "ios", size: "1024x1024" }]);
inspectPng("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", 1024, 1024, { opaque: true });
for (const [density, size, foregroundSize] of [["mdpi", 48, 108], ["hdpi", 72, 162], ["xhdpi", 96, 216], ["xxhdpi", 144, 324], ["xxxhdpi", 192, 432]]) {
  for (const name of ["ic_launcher", "ic_launcher_round"]) inspectPng(`android/app/src/main/res/mipmap-${density}/${name}.png`, size);
  inspectPng(`android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`, foregroundSize);
}
assert.match(read("android/app/src/main/AndroidManifest.xml"), /android:icon="@mipmap\/ic_launcher"/);
assert.match(read("android/app/src/main/AndroidManifest.xml"), /android:roundIcon="@mipmap\/ic_launcher_round"/);
const { BRAND_ASSETS } = await import(pathToFileURL(resolve(root, "src/brand/code3TcgBrand.js")));
assert.equal(BRAND_ASSETS.mark, BRAND_CONFIG.logoReference);
assert.equal(BRAND_ASSETS.logo, BRAND_CONFIG.wordmarkReference);
assert.equal(BRAND_ASSETS.promoHero, BRAND_CONFIG.bannerReference);
assert.equal(BRAND_ASSETS.linkBioHeader, BRAND_CONFIG.bannerReference);
assert.match(read("src/components/operations/OperationsUI.jsx"), /<BrandIdentity variant="wordmark" onDark\s*\/>/);
assert.match(read("src/components/brand/BrandIdentity.jsx"), /src=\{onDark \? BRAND_CONFIG\.wordmarkOnDarkReference : BRAND_CONFIG\.wordmarkReference\}/);
assert.match(read("src/components/AppLoadFallback.jsx"), /<img src=\{BRAND_CONFIG\.logoReference\}/);
assert.match(read("src/mobileScreenSetApp.jsx"), /<img src=\{BRAND_CONFIG\.logoReference\} alt=\{BRAND_CONFIG\.accessibleLogoText\}/);

const runtimeBrandSources = [
  "src/config/brand.js",
  "src/brand/code3TcgBrand.js",
  "src/mobileScreenSet.jsx",
  "src/mobileScreenSetApp.jsx",
  "screen-set.html",
  "index.html",
  "public/manifest.webmanifest",
  "public/offline.html",
  "public/sw.js",
].map(read).join("\n");

assert.ok(!runtimeBrandSources.includes("Private Business Hub"), "Temporary development branding must not remain");
assert.ok(!runtimeBrandSources.includes("Ember & Tide"), "Retired visible branding must not remain in runtime brand surfaces");
assert.match(read("src/mobileScreenSetApp.jsx"), /BRAND_CONFIG\.applicationDisplayName/);
assert.match(read("src/brand/code3TcgBrand.js"), /name:\s*BRAND_CONFIG\.applicationDisplayName/);
assert.match(read("public/manifest.webmanifest"), /"name": "__BRAND_PWA_NAME__"/);
assert.match(read("public/manifest.webmanifest"), /"short_name": "__BRAND_PWA_SHORT_NAME__"/);
assert.match(read("public/offline.html"), /alt="__BRAND_ACCESSIBLE_LOGO_TEXT__"/);
assert.match(read("public/sw.js"), /"__BRAND_LOGO__"/);
assert.match(read("src/config/plainLanguage.js"), /"alt"/, "Retired visible branding must also be rewritten in accessible image text");
assert.match(read("public/sw.js"), /ember-tide-pwa-v5/, "The icon release must invalidate the previous app-shell cache");
assert.match(read("public/sw.js"), /key\.startsWith\("ember-tide-"\)/, "Old application caches must remain eligible for cleanup");

if (process.env.CODE3_VERIFY_DIST === "1") {
  for (const path of ["dist/index.html", "dist/screen-set.html", "dist/manifest.webmanifest", "dist/offline.html", "dist/sw.js"]) {
    assert.ok(existsSync(resolve(root, path)), `${path} must exist after the production build`);
  }
  const manifest = JSON.parse(read("dist/manifest.webmanifest"));
  assert.deepEqual(manifest, devManifest, "Development and built install metadata must match");
  assert.equal(manifest.name, "Code 3 TCG");
  assert.equal(manifest.short_name, "Code 3 TCG");
  assert.equal(manifest.description, "");
  assert.equal(manifest.background_color, BRAND_CONFIG.pwaBackgroundColor);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.deepEqual(manifest.icons, devManifest.icons);
  for (const { src } of manifest.icons) {
    assert.ok(existsSync(resolve(root, `dist${src}`)), `${src} must be shipped`);
    assert.deepEqual(readFileSync(resolve(root, `dist${src}`)), readFileSync(resolve(root, `public${src}`)), `${src} must be shipped without changing its pixels`);
  }
  for (const src of [BRAND_CONFIG.wordmarkReference, BRAND_CONFIG.wordmarkOnDarkReference, BRAND_CONFIG.bannerReference]) assert.ok(existsSync(resolve(root, `dist${src}`)), `${src} must be shipped`);
  assert.ok(read("dist/index.html").includes(`rel="apple-touch-icon" sizes="180x180" href="${BRAND_CONFIG.appleTouchIconReference}"`));
  assert.ok(read("dist/index.html").includes(`rel="icon" href="${BRAND_CONFIG.faviconReference}" type="image/png" sizes="32x32"`));
  assert.ok(!read("dist/manifest.webmanifest").includes("__BRAND_"), "Install metadata must be resolved");
  assert.match(read("dist/index.html"), /<title>Code 3 TCG<\/title>/);
  assert.match(read("dist/screen-set.html"), /<title>Code 3 TCG Mobile Screen Set<\/title>/);
  assert.match(read("dist/offline.html"), /<title>Code 3 TCG — Offline<\/title>/);
  assert.match(read("dist/offline.html"), /alt="Code 3 TCG"/);
  assert.ok(read("dist/sw.js").includes(JSON.stringify(BRAND_CONFIG.logoReference)));
  for (const { src } of manifest.icons) assert.ok(read("dist/sw.js").includes(JSON.stringify(src)), `${src} must be present in the updated offline shell`);
  assert.ok(!read("dist/offline.html").includes("__BRAND_"), "Offline build metadata must be resolved");
  assert.ok(!read("dist/sw.js").includes("__BRAND_"), "Service-worker brand metadata must be resolved");
}

console.log("Code 3 TCG centralized runtime branding checks passed.");
