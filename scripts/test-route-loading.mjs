import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const read = (filePath) => fs.readFileSync(path.join(root, filePath), "utf8");

const checks = [];

function check(label, passed, details = "") {
  checks.push({ label, passed, details });
}

const app = read("src/App.jsx");
const smartSearch = read("src/components/SmartCatalogSearchBox.jsx");
const smartInventory = read("src/components/SmartAddInventory.jsx");
const smartCatalog = read("src/components/SmartAddCatalog.jsx");
const viteConfig = read("vite.config.js");
const pkg = JSON.parse(read("package.json"));

check(
  "Scout is route-lazy loaded",
  app.includes('const Scout = lazy(() => import("./pages/Scout"))')
);

check(
  "Smart catalog tools are lazy-loaded",
  app.includes('const SmartAddInventory = lazy(() => import("./components/SmartAddInventory"))') &&
    app.includes('const SmartAddCatalog = lazy(() => import("./components/SmartAddCatalog"))')
);

check(
  "Backup and price history tools are lazy-loaded",
  app.includes('const BackupExportImport = lazy(() => import("./components/BackupExportImport"))') &&
    app.includes('const MarketPriceHistoryPanel = lazy(() => import("./components/MarketPriceHistoryPanel"))')
);

check(
  "Scanner library is dynamically imported only when activated",
  !/from\s+["']@zxing\/browser["']/.test(app) &&
    app.includes('await import("@zxing/browser")')
);

check(
  "Catalog seed is dynamically imported after the app shell loads",
  !/from\s+["']\.\/data\/pokemonProductCatalog["']/.test(app) &&
    app.includes('import("./data/pokemonProductCatalog")')
);

check(
  "Virginia store seed is dynamically imported after the app shell loads",
  !/from\s+["']\.\/data\/virginiaStoresSeed["']/.test(app) &&
    app.includes('import("./data/virginiaStoresSeed")')
);

check(
  "Shared search box no longer pulls catalog seed into the main bundle",
  !smartSearch.includes("pokemonProductCatalog") &&
    /localCatalogProducts\s*=\s*\[\]/.test(smartSearch)
);

check(
  "Lazy route/tool fallback exists",
  app.includes("function RouteChunkFallback") &&
    app.includes("function LazyToolBoundary") &&
    app.includes("<Suspense fallback={<RouteChunkFallback")
);

check(
  "Smart add tools accept a caller-provided local catalog pool",
  /SmartAddInventory\(\{\s*onAddInventory,\s*localCatalogProducts\s*=\s*\[\]\s*\}\)/.test(smartInventory) &&
    /SmartAddCatalog\(\{\s*onUseProduct,\s*localCatalogProducts\s*=\s*\[\]\s*\}\)/.test(smartCatalog)
);

check(
  "Vite manual chunk configuration is present",
  viteConfig.includes("manualChunks: emberManualChunks") &&
    viteConfig.includes("catalog-seed") &&
    viteConfig.includes("scanner-vendor")
);

check(
  "Deferred data/tool chunks are not module-preloaded on initial load",
  viteConfig.includes("resolveDependencies") &&
    viteConfig.includes("store-directory") &&
    viteConfig.includes("scanner-vendor")
);

check(
  "Route-loading test script is registered",
  pkg.scripts?.["test:route-loading"] === "node --no-warnings scripts/test-route-loading.mjs"
);

const failed = checks.filter((entry) => !entry.passed);

for (const entry of checks) {
  const prefix = entry.passed ? "PASS" : "FAIL";
  console.log(`${prefix} ${entry.label}${entry.details ? ` - ${entry.details}` : ""}`);
}

if (failed.length) {
  console.error(`Route loading checks failed: ${failed.length}`);
  process.exit(1);
}

console.log(`Route loading checks passed: ${checks.length}`);
