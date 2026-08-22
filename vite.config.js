import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { BRAND_CONFIG } from "./src/config/brand.js";

const brandReplacements = {
  __BRAND_NAME__: BRAND_CONFIG.applicationDisplayName,
  __BRAND_SHORT_NAME__: BRAND_CONFIG.shortName,
  __BRAND_PWA_NAME__: BRAND_CONFIG.pwaName,
  __BRAND_PWA_SHORT_NAME__: BRAND_CONFIG.pwaShortName || BRAND_CONFIG.shortName,
  __BRAND_ACCESSIBLE_LOGO_TEXT__: BRAND_CONFIG.accessibleLogoText || BRAND_CONFIG.applicationDisplayName,
  __BRAND_TAGLINE__: BRAND_CONFIG.tagline,
  __BRAND_ACCENT__: BRAND_CONFIG.primaryAccent,
  __BRAND_LOGO__: BRAND_CONFIG.logoReference,
  __BRAND_FAVICON__: BRAND_CONFIG.faviconReference,
  __BRAND_MONOGRAM__: BRAND_CONFIG.monogram,
};

function applyBrandReplacements(source = "") {
  return Object.entries(brandReplacements).reduce((output, [token, value]) => output.replaceAll(token, value), String(source));
}

function brandMetadataPlugin() {
  return {
    name: "business-hub-brand-metadata",
    transformIndexHtml: applyBrandReplacements,
    configureServer(server) {
      server.middlewares.use("/manifest.webmanifest", (_request, response) => {
        response.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
        response.end(applyBrandReplacements(JSON.stringify({
          name: BRAND_CONFIG.pwaName,
          short_name: BRAND_CONFIG.pwaShortName || BRAND_CONFIG.shortName,
          description: BRAND_CONFIG.tagline,
          id: "/",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#f6f3ed",
          theme_color: BRAND_CONFIG.primaryAccent,
          icons: [{ src: BRAND_CONFIG.logoReference, sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
        }, null, 2)));
      });
    },
    generateBundle(_options, bundle) {
      const manifest = bundle["manifest.webmanifest"];
      if (manifest?.type === "asset") manifest.source = applyBrandReplacements(manifest.source);
    },
    writeBundle(outputOptions) {
      const outputDirectory = resolve(process.cwd(), outputOptions.dir || "dist");
      for (const fileName of ["manifest.webmanifest", "offline.html", "sw.js"]) {
        const filePath = resolve(outputDirectory, fileName);
        if (existsSync(filePath)) writeFileSync(filePath, applyBrandReplacements(readFileSync(filePath, "utf8")));
      }
    },
  };
}

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
  plugins: [react(), brandMetadataPlugin(), appVersionPlugin()],
  server: {
    watch: {
      ignored: [
        "**/artifacts/**",
        "**/backend/**",
        "**/copy/**",
        "**/design/**",
        "**/dist/**",
        "**/docs/**",
        "**/mock-data/**",
        "**/pokemon_market_ingestion_kit/**",
        "**/seeds/**",
        "**/supabase/**",
        "**/.vercel/**",
      ],
    },
  },
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
