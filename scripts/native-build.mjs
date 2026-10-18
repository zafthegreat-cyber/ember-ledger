import { loadEnv, build } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const settings = { ...loadEnv("native", process.cwd(), "VITE_"), ...process.env };
const smoke = process.argv.includes("--smoke");
if (!smoke && (!settings.VITE_SUPABASE_URL || !settings.VITE_SUPABASE_ANON_KEY)) {
  throw new Error("Provide the existing PUBLIC Supabase URL and publishable/anon key in .env.native.local before building a usable native app. No service-role key belongs in a native build.");
}
if (!smoke) {
  const url = new URL(settings.VITE_SUPABASE_URL);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/") throw new Error("Native account services require an HTTPS Supabase origin.");
  const key = settings.VITE_SUPABASE_ANON_KEY;
  if (key.startsWith("sb_secret_")) throw new Error("A secret key must never be bundled in the app.");
  if (key.split(".").length === 3) {
    const claim = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8"));
    if (claim.role !== "anon") throw new Error("Only a public anon key may be bundled.");
  } else if (!key.startsWith("sb_publishable_")) throw new Error("Use a public Supabase publishable or anon key.");
}
Object.assign(process.env, {
  VITE_API_BASE_URL: "https://code3tcg.app",
  VITE_PUBLIC_APP_URL: "https://code3tcg.app",
  VITE_BETA_LOCAL_MODE: "false",
  VITE_CODE3_LOCAL_AUTH_ENABLED: "false",
  VITE_NATIVE_BUILD: "true",
  VITE_SUPABASE_URL: smoke ? "" : settings.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: smoke ? "" : settings.VITE_SUPABASE_ANON_KEY,
});
await build({
  mode: "native",
  // Existing web screens include fixed headers/footers. Keep their viewport
  // inside native system bars rather than placing controls beneath a notch.
  plugins: [{ name: "code3-native-safe-viewport", transformIndexHtml: html => html.replace("viewport-fit=cover", "viewport-fit=contain") }],
  build: { outDir: "dist-native", rollupOptions: { input: "index.html" } },
});
mkdirSync(resolve("artifacts/native"), { recursive: true });
writeFileSync(resolve("artifacts/native/web-build.json"), JSON.stringify({
  builtAt: new Date().toISOString(), mode: smoke ? "configuration-smoke-only" : "native-beta",
  apiOrigin: process.env.VITE_API_BASE_URL, accountServicesConfigured: !smoke,
  storeSigned: false, physicalDeviceTested: false,
}, null, 2));
console.log(smoke ? "Native web smoke bundle built; sign-in is deliberately unconfigured. Do not distribute." : "Native web bundle built. Next: npm run native:sync.");
