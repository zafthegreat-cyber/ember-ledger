import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  getAppLoadFallbackCopy,
  isLikelyChunkLoadError,
  shouldExposeFallbackErrorDetails,
} from "../src/utils/appFallbackContent.js";

const root = process.cwd();
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const indexHtml = read("index.html");
const main = read("src/main.jsx");
const fallbackComponent = read("src/components/AppLoadFallback.jsx");
const app = read("src/App.jsx");
const pkg = JSON.parse(read("package.json"));

const loadingCopy = getAppLoadFallbackCopy("loading");
assert.equal(loadingCopy.title, "Loading Ember & Tide...");
assert.equal(loadingCopy.body, "Preparing your command center.");

const updatingCopy = getAppLoadFallbackCopy("updating");
assert.match(updatingCopy.title, /updating/i);
assert.match(updatingCopy.body, /refreshing the app/i);

const errorCopy = getAppLoadFallbackCopy("error");
assert.match(errorCopy.title, /Something washed out/i);
assert.match(errorCopy.body, /trouble loading this screen/i);

const chunkError = new Error("Failed to fetch dynamically imported module");
assert.equal(isLikelyChunkLoadError(chunkError), true);
assert.equal(isLikelyChunkLoadError(new Error("regular form validation error")), false);

assert.equal(shouldExposeFallbackErrorDetails("production"), false);
assert.equal(shouldExposeFallbackErrorDetails("development"), true);

assert.match(indexHtml, /Loading Ember & Tide\.\.\./);
assert.match(indexHtml, /If this takes more than a few seconds, refresh the page\./);
assert.doesNotMatch(indexHtml, /Ember & Tide is updating/);
assert.match(indexHtml, /Refresh app/);
assert.match(indexHtml, /Go to homepage/);
assert.match(indexHtml, /<noscript>/);
assert.doesNotMatch(indexHtml, /stack trace|ChunkLoadError/i);

assert.match(main, /class EmberTideErrorBoundary/);
assert.match(main, /getDerivedStateFromError/);
assert.match(main, /AppLoadFallback/);
assert.match(main, /shouldExposeFallbackErrorDetails\(import\.meta\.env\.MODE\)/);
assert.match(main, /createRoot\(document\.getElementById\("root"\)\)\.render/);
assert.match(main, /<App \/>/);

assert.match(fallbackComponent, /Something washed out|APP_LOAD_FALLBACK_COPY|getAppLoadFallbackCopy/);
assert.match(fallbackComponent, /Refresh app/);
assert.match(fallbackComponent, /Return home/);
assert.match(fallbackComponent, /showDetails/);
assert.doesNotMatch(fallbackComponent, /error\.stack/);

assert.match(app, /function RouteChunkFallback/);
assert.match(app, /Loading Ember & Tide/);
assert.match(app, /Preparing your command center/);

assert.equal(pkg.scripts?.["test:app-fallbacks"], "node --no-warnings scripts/test-app-fallbacks.mjs");

console.log("App fallback tests passed.");
