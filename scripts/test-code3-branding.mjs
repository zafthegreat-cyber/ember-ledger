import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const { BRAND_CONFIG, formatBrowserTitle } = await import(pathToFileURL(resolve(root, "src/config/brand.js")));

assert.equal(BRAND_CONFIG.applicationDisplayName, "Code 3");
assert.equal(BRAND_CONFIG.shortName, "Code 3");
assert.equal(BRAND_CONFIG.pwaName, "Code 3");
assert.equal(BRAND_CONFIG.pwaShortName, "Code 3");
assert.equal(BRAND_CONFIG.accessibleLogoText, "Code 3");
assert.equal(BRAND_CONFIG.browserTitleTemplate, "Code 3 — {pageTitle}");
assert.equal(BRAND_CONFIG.tagline, "", "The unresolved tagline must remain blank");
assert.equal(BRAND_CONFIG.businessDisplayName, "", "The legal/public business name remains separately configurable");
assert.equal(BRAND_CONFIG.legalBusinessDisplayName, "", "No legal business name should be inferred from the app name");
assert.equal(formatBrowserTitle(), "Code 3");
assert.equal(formatBrowserTitle("Home"), "Code 3 — Home");
assert.equal(BRAND_CONFIG.logoReference, "/assets/brand/code-3-mark.svg");

const runtimeBrandSources = [
  "src/config/brand.js",
  "src/brand/emberTideBrand.js",
  "src/mobileScreenSet.jsx",
  "screen-set.html",
  "index.html",
  "public/manifest.webmanifest",
  "public/offline.html",
  "public/sw.js",
].map(read).join("\n");

assert.ok(!runtimeBrandSources.includes("Private Business Hub"), "Temporary development branding must not remain");
assert.ok(!runtimeBrandSources.includes("Ember & Tide"), "Retired visible branding must not remain in runtime brand surfaces");
assert.match(read("src/mobileScreenSet.jsx"), /BRAND_CONFIG\.applicationDisplayName/);
assert.match(read("src/brand/emberTideBrand.js"), /name:\s*BRAND_CONFIG\.applicationDisplayName/);
assert.match(read("public/manifest.webmanifest"), /"name": "__BRAND_PWA_NAME__"/);
assert.match(read("public/manifest.webmanifest"), /"short_name": "__BRAND_PWA_SHORT_NAME__"/);
assert.match(read("public/offline.html"), /alt="__BRAND_ACCESSIBLE_LOGO_TEXT__"/);
assert.match(read("public/sw.js"), /"__BRAND_LOGO__"/);
assert.match(read("src/config/plainLanguage.js"), /"alt"/, "Retired visible branding must also be rewritten in accessible image text");
assert.match(read("public/sw.js"), /ember-tide-pwa-v4/, "Historical cache namespace remains stable");
assert.match(read("public/assets/brand/code-3-mark.svg"), /<title id="code3-title">Code 3<\/title>/);

if (process.env.CODE3_VERIFY_DIST === "1") {
  for (const path of ["dist/index.html", "dist/screen-set.html", "dist/manifest.webmanifest", "dist/offline.html", "dist/sw.js"]) {
    assert.ok(existsSync(resolve(root, path)), `${path} must exist after the production build`);
  }
  const manifest = JSON.parse(read("dist/manifest.webmanifest"));
  assert.equal(manifest.name, "Code 3");
  assert.equal(manifest.short_name, "Code 3");
  assert.equal(manifest.description, "");
  assert.match(read("dist/index.html"), /<title>Code 3<\/title>/);
  assert.match(read("dist/screen-set.html"), /<title>Code 3 Mobile Screen Set<\/title>/);
  assert.match(read("dist/offline.html"), /<title>Code 3 — Offline<\/title>/);
  assert.match(read("dist/offline.html"), /alt="Code 3"/);
  assert.match(read("dist/sw.js"), /"\/assets\/brand\/code-3-mark\.svg"/);
  assert.ok(!read("dist/offline.html").includes("__BRAND_"), "Offline build metadata must be resolved");
  assert.ok(!read("dist/sw.js").includes("__BRAND_"), "Service-worker brand metadata must be resolved");
}

console.log("Code 3 centralized runtime branding checks passed.");
