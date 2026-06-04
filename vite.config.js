import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const appVersion = [
  process.env.VERCEL_DEPLOYMENT_ID,
  process.env.VERCEL_GIT_COMMIT_SHA,
  process.env.npm_package_version,
  new Date().toISOString(),
].filter(Boolean).join("-");

function appVersionPlugin() {
  return {
    name: "ember-tide-app-version",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "app-version.json",
        source: JSON.stringify({
          app: "ember-and-tide",
          version: appVersion,
          builtAt: new Date().toISOString(),
        }, null, 2),
      });
    },
  };
}

function emberManualChunks(id) {
  const normalizedId = id.replace(/\\/g, "/");

  if (normalizedId.includes("node_modules")) {
    if (normalizedId.includes("/react") || normalizedId.includes("/react-dom") || normalizedId.includes("/scheduler")) {
      return "react-vendor";
    }
    if (normalizedId.includes("/@supabase/")) return "supabase-vendor";
    if (normalizedId.includes("/@zxing/")) return "scanner-vendor";
    return "vendor";
  }

  if (normalizedId.includes("/src/data/pokemonProductCatalog") ||
      normalizedId.includes("/src/data/generated/sealedProducts") ||
      normalizedId.includes("/src/data/generated/catalogRecoveryProducts")) {
    return "catalog-seed";
  }

  if (normalizedId.includes("/src/data/generated/virginiaStores")) return "store-directory";

  if (normalizedId.includes("/src/data/generated/releaseCalendar") ||
      normalizedId.includes("/src/data/generated/dropCalendarSeed") ||
      normalizedId.includes("/src/data/generated/calendarSyncStatus")) {
    return "calendar-data";
  }

  return undefined;
}

export default defineConfig({
  define: {
    __EMBER_TIDE_APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react(), appVersionPlugin()],
  build: {
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter((dep) => ![
          "catalog-seed",
          "store-directory",
          "scanner-vendor",
        ].some((chunkName) => dep.includes(chunkName)));
      },
    },
    rollupOptions: {
      input: {
        main: "index.html",
        screenSet: "screen-set.html",
      },
      output: {
        manualChunks: emberManualChunks,
      },
    },
  },
});
