import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const { BRAND_CONFIG, formatBrowserTitle } = await import(pathToFileURL(resolve(root, "src/config/brand.js")));
const { default: viteConfig } = await import(pathToFileURL(resolve(root, "vite.config.js")));
let devManifest;
viteConfig.plugins.find(plugin => plugin.name === "business-hub-brand-metadata").configureServer({
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
const iconSizes = `${BRAND_CONFIG.iconSize}x${BRAND_CONFIG.iconSize}`;
assert.deepEqual(devManifest.icons, [{ src: BRAND_CONFIG.logoReference, sizes: iconSizes, type: "image/png", purpose: "any" }], "Declare the supplied PNG's real dimensions; no resized or maskable asset is claimed");

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
assert.match(read("index.html"), /rel="apple-touch-icon" sizes="__BRAND_ICON_SIZES__" href="__BRAND_APPLE_TOUCH_ICON__"/);
assert.match(read("index.html"), /rel="icon" href="__BRAND_FAVICON__" type="image\/png" sizes="__BRAND_ICON_SIZES__"/);
for (const [iconPath, size] of [
  [BRAND_CONFIG.appleTouchIconReference, BRAND_CONFIG.iconSize],
  [BRAND_CONFIG.pwaIcon192Reference, BRAND_CONFIG.iconSize],
  [BRAND_CONFIG.pwaIcon512Reference, BRAND_CONFIG.iconSize],
  [BRAND_CONFIG.pwaMaskableIconReference, BRAND_CONFIG.iconSize],
]) {
  const icon = readFileSync(resolve(root, `public${iconPath}`));
  assert.equal(icon.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${iconPath} must be a PNG`);
  assert.equal(icon.readUInt32BE(16), size, `${iconPath} width`);
  assert.equal(icon.readUInt32BE(20), size, `${iconPath} height`);
}
for (const [imagePath, width, height] of [[BRAND_CONFIG.wordmarkReference, 2172, 724], [BRAND_CONFIG.wordmarkOnDarkReference, 2172, 724], [BRAND_CONFIG.bannerReference, 2171, 724]]) {
  const image = readFileSync(resolve(root, `public${imagePath}`));
  assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(image.readUInt32BE(16), width);
  assert.equal(image.readUInt32BE(20), height);
}
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
assert.match(read("public/sw.js"), /ember-tide-pwa-v4/, "Historical cache namespace remains stable");

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
  assert.deepEqual(manifest.icons, devManifest.icons);
  for (const { src } of manifest.icons) {
    assert.ok(existsSync(resolve(root, `dist${src}`)), `${src} must be shipped`);
  }
  for (const src of [BRAND_CONFIG.wordmarkReference, BRAND_CONFIG.wordmarkOnDarkReference, BRAND_CONFIG.bannerReference]) assert.ok(existsSync(resolve(root, `dist${src}`)), `${src} must be shipped`);
  assert.ok(read("dist/index.html").includes(`rel="apple-touch-icon" sizes="${iconSizes}" href="${BRAND_CONFIG.appleTouchIconReference}"`));
  assert.ok(!read("dist/manifest.webmanifest").includes("__BRAND_"), "Install metadata must be resolved");
  assert.match(read("dist/index.html"), /<title>Code 3 TCG<\/title>/);
  assert.match(read("dist/screen-set.html"), /<title>Code 3 TCG Mobile Screen Set<\/title>/);
  assert.match(read("dist/offline.html"), /<title>Code 3 TCG — Offline<\/title>/);
  assert.match(read("dist/offline.html"), /alt="Code 3 TCG"/);
  assert.ok(read("dist/sw.js").includes(JSON.stringify(BRAND_CONFIG.logoReference)));
  assert.ok(!read("dist/offline.html").includes("__BRAND_"), "Offline build metadata must be resolved");
  assert.ok(!read("dist/sw.js").includes("__BRAND_"), "Service-worker brand metadata must be resolved");
}

console.log("Code 3 TCG centralized runtime branding checks passed.");
