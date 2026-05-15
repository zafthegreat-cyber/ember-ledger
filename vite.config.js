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

export default defineConfig({
  define: {
    __EMBER_TIDE_APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react(), appVersionPlugin()],
});
