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
const main = read("src/main.jsx");
const routeState = read("src/utils/appRouteState.js");
const appCss = read("src/App.css");
const storeSeed = read("src/data/virginiaStoresSeed.js");
const smartSearch = read("src/components/SmartCatalogSearchBox.jsx");
const smartInventory = read("src/components/SmartAddInventory.jsx");
const smartCatalog = read("src/components/SmartAddCatalog.jsx");
const routePages = {
  hearth: read("src/pages/Hearth.jsx"),
  operationsHome: read("src/pages/OperationsHome.jsx"),
  vault: read("src/pages/Vault.jsx"),
  forge: read("src/pages/Forge.jsx"),
  market: read("src/pages/Market.jsx"),
  spark: read("src/pages/Spark.jsx"),
  menu: read("src/pages/Menu.jsx"),
  scout: read("src/pages/Scout.jsx"),
};
const viteConfig = read("vite.config.js");
const pkg = JSON.parse(read("package.json"));
const commandBoardV4 = read("src/components/command-system/CommandBoardV4.jsx");

check(
  "Scout is route-lazy loaded",
  app.includes('const Scout = lazy(() => import("./pages/Scout"))')
);

check(
  "Primary app routes are lazy-loaded from page modules",
  app.includes('const OperationsHomePage = lazy(() => import("./pages/OperationsHome"))') &&
    app.includes('const VaultPage = lazy(() => import("./pages/Vault"))') &&
    app.includes('const ForgePage = lazy(() => import("./pages/Forge"))') &&
    app.includes('const MarketPage = lazy(() => import("./pages/Market"))') &&
    app.includes('const SparkPage = lazy(() => import("./pages/Spark"))') &&
    app.includes('const MenuPage = lazy(() => import("./pages/Menu"))')
);

check(
  "Home page body remains outside the app shell",
  !app.includes("function renderHearthHomeCommandView") &&
    routePages.operationsHome.includes("export default function OperationsHome") &&
    routePages.operationsHome.includes("ops-home-page") &&
    app.includes("<OperationsHomePage {...hearthPageProps} />")
);

check(
  "Vault dashboard and Market route body live in V4 page modules",
  routePages.vault.includes("export default function VaultPage") &&
    routePages.vault.includes("function renderVaultHomeDashboard") &&
    routePages.vault.includes("CommandBoardV4") &&
    routePages.vault.includes("vault-command-only-route") &&
    !routePages.vault.includes("EtMockupPageShell") &&
    !app.includes("function renderVaultHomeDashboard") &&
    routePages.market.includes("export default function MarketPage") &&
    routePages.market.includes("CommandBoardV4") &&
    routePages.market.includes("market-command-only-route") &&
    routePages.market.includes("Market Command Center") &&
    routePages.market.includes("Product Compare") &&
    routePages.market.includes("Watch Center") &&
    routePages.market.includes("No checkout, no seller matching") &&
    app.includes("<VaultPage renderHeader={renderVaultHeader} showDashboard={vaultSubTab === \"overview\"} {...vaultDashboardProps}>") &&
    app.includes("<MarketPage {...marketPageProps} />")
);

check(
  "Forge Exchange body, Spark, and Menu route mounts are delegated to V4 page modules",
  routePages.forge.includes("export default function ForgePage") &&
    routePages.forge.includes("exchange-page-final") &&
    routePages.forge.includes("CommandBoardV4") &&
    routePages.forge.includes("exchange-command-only-route") &&
    routePages.spark.includes("export default function SparkPage") &&
    routePages.spark.includes("CommandBoardV4") &&
    routePages.spark.includes("spark-command-only-route") &&
    routePages.spark.includes("FlowNextActionCard") &&
    routePages.spark.includes("submitKidsProgramApplication") &&
    routePages.menu.includes("export default function MenuPage") &&
    routePages.menu.includes("function renderSettingsPage") &&
    routePages.menu.includes("CommandBoardV4") &&
    routePages.menu.includes("hideCommandHeader: true") &&
    !app.includes("function renderExchangePage") &&
    !app.includes("function renderKidsProgramPage") &&
    !app.includes("function renderSettingsPage") &&
    app.includes("<ForgePage {...forgePageProps} />") &&
    app.includes("<SparkPage {...sparkPageProps} />") &&
    app.includes("<MenuPage {...settingsPageProps} />")
);

check(
  "App shell uses a lazy app bootstrap boundary",
  main.includes('const App = lazy(() => import("./App.jsx"))') &&
    main.includes('<Suspense fallback={<AppLoadFallback kind="loading" />}>')
);

check(
  "Route state parser lives outside the main app module",
  app.includes('from "./utils/appRouteState"') &&
    routeState.includes("export function routeStateFromPath") &&
    routeState.includes("export function loadInitialRouteState") &&
    routeState.includes("BETA_LOCAL_STORAGE_KEYS.routeState")
);

check(
  "App CSS is split into ordered structural imports",
  appCss.includes('@import "./styles/app/01-tokens-theme.css";') &&
    appCss.includes('@import "./styles/app/02-app-shell-navigation.css";') &&
    appCss.includes('@import "./styles/app/03-cards-buttons-forms.css";') &&
    appCss.includes('@import "./styles/app/04-route-pages.css";') &&
    appCss.includes('@import "./styles/app/05-modals-search-data.css";') &&
    appCss.includes('@import "./styles/app/06-mobile-responsive.css";') &&
    appCss.includes('@import "./styles/app/10-scout-command-board.css";') &&
    appCss.includes('@import "./styles/app/11-command-ui-overhaul.css";') &&
    !appCss.includes('@import "./styles/app/08-command-shell-auth.css";') &&
    !appCss.includes('@import "./styles/app/09-experience-lock.css";')
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
  "Catalog metadata constants do not pull the catalog seed chunk into startup",
  app.includes('from "./data/pokemonCatalogCoreData"') &&
    !/from\s+["']\.\/data\/sharedPokemonCatalog["']/.test(app) &&
    read("src/data/pokemonSetCatalog.js").includes('from "./pokemonCatalogCoreData"')
);

check(
  "Catalog search UI and full search service are lazy-loaded",
  !/import\s+SmartCatalogSearchBox\s+from\s+["']\.\/components\/SmartCatalogSearchBox["']/.test(app) &&
    app.includes('const SmartCatalogSearchBox = lazy(() => import("./components/SmartCatalogSearchBox"))') &&
    app.includes('import("./services/pokemonCatalogSearch")') &&
    app.includes('from "./services/pokemonCatalogSearchCore"') &&
    !/from\s+["']\.\/services\/pokemonCatalogSearch["']/.test(app)
);

check(
  "Ember Assist heavy answer brain is lazy-loaded after launcher render",
  app.includes('from "./utils/emberAssistLite"') &&
    app.includes('import("./utils/emberAssist")') &&
    !/from\s+["']\.\/utils\/emberAssist["']/.test(app)
);

check(
  "Virginia store seed is dynamically imported after the app shell loads",
  !/from\s+["']\.\/data\/virginiaStoresSeed["']/.test(app) &&
    app.includes('import("./data/virginiaStoresSeed")')
);

check(
  "Calendar and retailer drop data load only when the Scout calendar is opened",
  !/from\s+["']\.\/data\/generated\/releaseCalendar\.json["']/.test(app) &&
    !/from\s+["']\.\/data\/generated\/dropCalendarSeed\.json["']/.test(app) &&
    !/from\s+["']\.\/data\/generated\/retailerDropEvents\.json["']/.test(app) &&
    app.includes("function loadCalendarDataOnDemand") &&
    app.includes('import("./data/generated/releaseCalendar.json")')
);

check(
  "Scout historical restock seed is loaded on demand instead of during Hearth startup",
  !/from\s+["']\.\/data\/scoutRestockIntelSeed["']/.test(app) &&
    app.includes("function loadScoutRestockIntelOnDemand") &&
    app.includes('import("./data/scoutRestockIntelSeed")') &&
    app.includes("const scoutRestockIntelWarmNeeded")
);

check(
  "Generated store directory is fetched as on-demand JSON, not bundled as startup JS",
  storeSeed.includes('generated/virginiaStores.json?url') &&
    storeSeed.includes("export async function loadVirginiaStoresSeed") &&
    !/import\s+generatedVirginiaStores\s+from\s+["']\.\/generated\/virginiaStores\.json["']/.test(storeSeed)
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
  "Command board navigation does not force local beta mode in production",
  !commandBoardV4.includes('href="/?betaLocalMode=true"') &&
    !commandBoardV4.includes('href: "/vault?betaLocalMode=true"') &&
    commandBoardV4.includes("function commandBoardHref(path)") &&
    commandBoardV4.includes("COMMAND_BOARD_QA_PARAMS")
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
