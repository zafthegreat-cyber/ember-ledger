import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let assertions = 0;
function equal(actual, expected, message) { assertions++; assert.equal(actual, expected, message); }
function matches(value, pattern, message) { assertions++; assert.match(value, pattern, message); }
const vercelConfig = JSON.parse(read("vercel.json"));
const filesystemIndex = vercelConfig.routes.findIndex((route) => route.handle === "filesystem");
const spaIndex = vercelConfig.routes.findIndex((route) => route.dest === "/index.html");
equal(filesystemIndex >= 0 && spaIndex > filesystemIndex, true, "filesystem routing must still precede the SPA fallback");

// Each API source file is packaged as a function for this Vite deployment.
// A duplicate Express adapter previously pushed the release over Hobby's
// 12-function limit even though its web build succeeded.
const apiRoot = fileURLToPath(new URL("../api/", import.meta.url));
function apiEntryFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? apiEntryFiles(path) : /\.(?:[cm]?[jt]s|[jt]sx|py|go|rb)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) ? [relative(apiRoot, path).replaceAll("\\", "/")] : [];
  });
}
const apiEntries = apiEntryFiles(apiRoot).sort();
const expectedApiEntries = [
  "[...path].ts", "account-ops/mailbox-import/preview.ts", "account-ops/mailbox-import/status.ts",
  "account-ops/provider-connections.ts", "account/deletion.ts", "auth/session.ts",
  "bestbuy/availability.ts", "bestbuy/match-catalog.ts", "bestbuy/monitor/run.ts",
  "bestbuy/search.ts", "bestbuy/sku/[sku].ts", "health.ts",
].sort();
equal(apiEntries.length <= 12, true, "the Vite API packaging must stay within the current 12-function limit");
equal(JSON.stringify(apiEntries), JSON.stringify(expectedApiEntries), "all twelve existing function entrypoints must remain; deletion status shares its adapter");

const deletionStatusIndex = vercelConfig.routes.findIndex((route) => route.src === "^/api/account/deletion/status$");
equal(deletionStatusIndex >= 0 && deletionStatusIndex < filesystemIndex, true, "the status rewrite must run before filesystem and SPA routing");
const deletionStatusRoute = vercelConfig.routes[deletionStatusIndex];
equal(JSON.stringify(deletionStatusRoute), JSON.stringify({ src: "^/api/account/deletion/status$", dest: "/api/account/deletion" }), "the status route must select the shared function without method, redirect or request transformations");
const deletionStatusPattern = new RegExp(deletionStatusRoute.src);
for (const url of ["https://example.invalid/api/account/deletion/status", "https://example.invalid/api/account/deletion/status?review=1"]) {
  equal(deletionStatusPattern.test(new URL(url).pathname), true, "the status pathname is routed independently of query parameters; the backend still rejects URL parameters");
}
for (const path of ["/api/account/deletion", "/api/account/deletion/status/", "/api/account/deletion/status/extra", "/api/account/deletion/status-anything", "/api/account/deletion/status.ts", "/prefix/api/account/deletion/status", "/API/account/deletion/status", "/api/auth/session", "/api/account-ops/mailbox-import/status", "/api/health", "/settings", "/delete-account", "/find/restocks"]) {
  equal(deletionStatusPattern.test(path), false, `the status rewrite must not capture ${path}`);
}
const deletionEntry = read("api/account/deletion.ts").trim().replaceAll("\r\n", "\n");
equal(deletionEntry, 'import app from "../../backend/src/server";\nexport default app;', "both account-deletion URLs must retain the canonical Express app without request rewriting");

const server = read("backend/src/server.ts");
matches(server, /app\.use\("\/api\/account\/deletion", protectedCors, createAccountDeletionRouter\(\)\)/, "the retained deletion adapter must keep the protected canonical account-deletion router");
matches(read("backend/src/routes/accountDeletion.routes.ts"), /router\.get\("\/status",/, "status remains a GET route on the same deletion router");

const marketSourcesIndex = vercelConfig.routes.findIndex((route) => route.src === "^/api/market/sources/[^/]+$");
equal(marketSourcesIndex >= 0 && marketSourcesIndex < filesystemIndex, true, "price sources must select their shared function before filesystem and SPA routing");
const marketSourcesRoute = vercelConfig.routes[marketSourcesIndex];
equal(JSON.stringify(marketSourcesRoute), JSON.stringify({ src: "^/api/market/sources/[^/]+$", dest: "/api/health" }), "price sources must reuse the existing canonical Express adapter without transforming method or request");
const marketSourcesPattern = new RegExp(marketSourcesRoute.src);
for (const path of ["/api/market/sources/502006", "/api/market/sources/retailer-sku", "/api/market/sources/0"]) {
  equal(marketSourcesPattern.test(path), true, "one product segment reaches backend identity validation, including malformed IDs");
}
equal(marketSourcesPattern.test(new URL("https://example.invalid/api/market/sources/502006?review=1").pathname), true, "query parameters do not prevent the canonical source route from matching");
for (const path of ["/api/market/sources", "/api/market/sources/502006/", "/api/market/sources/502006/extra", "/prefix/api/market/sources/502006", "/API/market/sources/502006", "/api/market/refresh/502006", "/api/auth/session", "/api/health", "/settings", "/find/restocks"]) {
  equal(marketSourcesPattern.test(path), false, `the source rewrite must not capture ${path}`);
}
const healthEntry = read("api/health.ts");
matches(healthEntry, /import app from "\.\.\/backend\/src\/server";/, "the shared health adapter imports the canonical Express app");
matches(healthEntry, /export default app;/, "the shared health adapter exports the canonical Express app without request rewriting");
matches(healthEntry, /bodyParser: false/, "the shared notification adapter preserves raw bytes for signature verification");
matches(server, /app\.use\("\/api\/market", marketRouter\)/, "source URLs remain on the existing market router");

// Nested eBay paths otherwise reach the SPA: GET returns HTML and POST returns
// 405 before Express can verify the owner or call the Browse API.
const ebayIndex = vercelConfig.routes.findIndex((route) => route.src === "^/api/ebay(?:/.*)?$");
equal(ebayIndex >= 0 && ebayIndex < filesystemIndex, true, "eBay routes must select Express before filesystem and SPA routing");
for (const path of ["/api/ebay/health", "/api/ebay/search", "/api/ebay/sold/health", "/api/ebay/sold/search", "/api/ebay/deletion/sanitize", "/api/ebay/account-deletion"]) {
  const firstRoute = vercelConfig.routes.find((route) => route.src && new RegExp(route.src).test(path));
  equal(firstRoute?.dest, "/api/health", `${path} must reach the shared Express function`);
}
const ebayPattern = new RegExp(vercelConfig.routes[ebayIndex].src);
for (const path of ["/api/ebay-other/search", "/api/auth/session", "/api/market/sources/502006", "/find/ebay", "/settings"]) {
  equal(ebayPattern.test(path), false, `the eBay route must not capture ${path}`);
}
matches(read("backend/src/routes/ebay.routes.ts"), /router\.use\(requireOwner\)/, "the shared eBay router retains owner authorization");
console.log(`PASS ${assertions} Vercel packaging checks: twelve API functions, source/status/eBay routing and canonical Express handlers.`);
