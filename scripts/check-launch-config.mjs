import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

export function validateLaunchConfig(env = {}) {
  for (const key of ["VITE_BETA_LOCAL_MODE", "VITE_CODE3_LOCAL_AUTH_ENABLED", "VITE_QA_UNLOCK_PAID_FEATURES"]) {
    if (String(env[key] || "").toLowerCase() === "true") throw new Error(`${key} must be disabled for a release candidate.`);
  }
  for (const [name, value] of Object.entries(env)) {
    if (value && /^VITE_.*(?:SERVICE_ROLE|SECRET_KEY|PRIVATE_KEY|CLIENT_SECRET)/.test(name)) throw new Error(`Remove ${name} from public build configuration. Server credentials must not be bundled.`);
  }
  let project;
  try { project = new URL(env.VITE_SUPABASE_URL); } catch { throw new Error("A public HTTPS Supabase project URL is required."); }
  if (project.protocol !== "https:" || project.username || project.password || project.pathname !== "/" || project.search || project.hash || project.hostname !== "gxsfququorfczvhrkudl.supabase.co") throw new Error("The release must use the existing Code 3 TCG Supabase HTTPS origin.");
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (typeof key !== "string" || !key) throw new Error("A public Supabase publishable/anon key is required. No server key may be used.");
  if (!key.startsWith("sb_publishable_")) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString("utf8")); } catch { throw new Error("Use a public Supabase publishable/anon key."); }
    if (claims.role !== "anon" || claims.ref !== "gxsfququorfczvhrkudl") throw new Error("The release key must be the public anon key for the existing app project.");
  }
  for (const name of ["VITE_API_BASE_URL", "VITE_PUBLIC_APP_URL"]) {
    if (!env[name]) continue;
    let url;
    try { url = new URL(env[name]); } catch { throw new Error(`${name} must be the public app HTTPS origin.`); }
    if (url.origin !== "https://code3tcg.app" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error(`${name} must be the public app HTTPS origin.`);
  }
  return { accountServicesConfigured: true, appOrigin: "https://code3tcg.app", publicCredentialsOnly: true, testBypassesDisabled: true };
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const env = { ...loadEnv("production", process.cwd(), "VITE_"), ...process.env };
  if (process.argv.includes("--use-native-public-config")) {
    const native = loadEnv("native", process.cwd(), "VITE_");
    for (const name of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]) if (!env[name]) env[name] = native[name];
  }
  console.log(JSON.stringify(validateLaunchConfig(env)));
}
