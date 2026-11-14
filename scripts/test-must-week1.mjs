// MUST items 1, 4, 6, 9, 10 (2026-11-13).
//   node --no-warnings --test scripts/test-must-week1.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const src = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

async function load(entry, name) {
  const dir = mkdtempSync(join(tmpdir(), "must-")); const out = join(dir, `${name}.mjs`);
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", resolveExtensions: [".js", ".jsx", ".mjs"], loader: { ".js": "jsx" }, jsx: "automatic", define: { "import.meta.env": JSON.stringify({ MODE: "test", DEV: false }) }, plugins: [{ name: "stubs", setup(api) {
    api.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
    api.onResolve({ filter: /^@(supabase|capacitor|sentry)\// }, (args) => ({ path: args.path, namespace: "stub" }));
    api.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default {}; export const init = () => {}; export const captureException = () => {}; export const getClient = () => null; export const createClient = () => null; export const Capacitor = { isNativePlatform: () => false }; export const registerPlugin = () => ({}); export const supabase = null;", loader: "js" }));
  } }], nodePaths: [join(process.cwd(), "node_modules")] });
  return import(pathToFileURL(out).href);
}

test("MUST-1: Android applicationId matches the Play Console package", () => {
  const gradle = src("android/app/build.gradle");
  assert.match(gradle, /applicationId "com\.code3tcg\.app"/);
  assert.match(gradle, /namespace = "app\.code3tcg\.mobile"/);
});

test("MUST-4: beta is open everywhere and the signup copy says so", async () => {
  const onboarding = await import("../src/utils/onboardingGuidance.js");
  assert.equal(onboarding.BETA_OPEN_EVERYWHERE, true);
  assert.ok(onboarding.isOpenAccessState("CA") && onboarding.isOpenAccessState("TX") && onboarding.isOpenAccessState("va"));
  assert.equal(onboarding.isOpenAccessState("ZZ"), false);
  assert.match(onboarding.BETA_REVIEW_EXPLANATION, /open/i);
  const app = src("src/App.jsx");
  assert.doesNotMatch(app, /New accounts may need approval/);
  assert.doesNotMatch(app, /Create Account \/ Request Beta Access/);
  assert.match(app, /Your account works right away/);
});

test("MUST-9: crash reports scrub emails, cards, tokens, inputs and record bodies", async () => {
  const m = await load("src/features/monitoring/crashReporting.js", "crash");
  assert.equal(m.scrubText("mail zena@example.com card 4111 1111 1111 1111 at /x?token=abc"), "mail [email] card [digits] at /x?[removed]");
  const event = m.scrubEvent({
    user: { email: "a@b.com" }, request: { url: "https://code3tcg.app/vault?item=secret" },
    message: "failed for zena@example.com", extra: { password: "hunter2", items: [{ name: "x" }], page: "vault" },
    exception: { values: [{ type: "Error", value: "token eyJaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbb.cccccccccccccccc leaked" }] },
    breadcrumbs: [{ category: "ui.input", message: "typed secret" }, { category: "navigation", message: "to /vault", data: { to: "/vault?x=1" } }],
  });
  assert.equal(event.user, undefined);
  assert.equal(event.request.url, "https://code3tcg.app/vault?[removed]");
  assert.equal(event.message, "failed for [email]");
  assert.equal(event.extra.password, "[removed]");
  assert.equal(event.extra.items, "[removed]");
  assert.equal(event.extra.page, "vault");
  assert.match(event.exception.values[0].value, /\[token\]/);
  assert.equal(event.breadcrumbs.length, 1);
  assert.equal(event.breadcrumbs[0].data.to, "/vault?[removed]");
  assert.equal(m.DEFAULT_SENTRY_DSN.includes("ingest.us.sentry.io"), true);
  assert.equal(m.resolveSentryDsn({ VITE_SENTRY_DSN: "" }), "", "empty env turns reporting off");
  const main = src("src/main.jsx");
  assert.match(main, /initCrashReporting\(\)/);
  assert.match(src("package.json"), /"@sentry\/react"/);
  assert.match(src("src/App.jsx"), /Send crash reports/);
});

test("MUST-10: quick feedback saves to beta_feedback, relays to Discord, and queues offline", async () => {
  const m = await load("src/features/feedback/QuickFeedback.jsx", "feedback");
  const inserted = []; const invoked = [];
  const supabase = {
    from: () => ({ insert: (row) => { inserted.push(row); return { select: () => ({ single: async () => ({ data: { id: "fb-1" }, error: null }) }) }; } }),
    functions: { invoke: async (name, opts) => { invoked.push([name, opts.body]); return { data: { ok: true } }; } },
  };
  const row = { title: "Something's broken: x", description: "the thing", page: "vault", feedback_type: "Bug", severity: "normal", app_version: "v1", device_info: { viewport: "390x844" } };
  const result = await m.sendQuickFeedback({ supabase, row });
  assert.equal(result.ok, true);
  assert.equal(inserted.length, 1);
  assert.equal(invoked[0][0], "feedback-discord");
  assert.equal(invoked[0][1].id, "fb-1");
  assert.equal(invoked[0][1].guest_email, "");
  const offline = await m.sendQuickFeedback({ supabase: null, row });
  assert.equal(offline.ok, false);
  const app = src("src/App.jsx");
  assert.match(app, /<QuickFeedback supabase=/);
  assert.match(app, /kidSafe=\{kidSafeView\}/);
  assert.match(src("supabase/functions/feedback-discord/index.ts"), /DISCORD_FEEDBACK_WEBHOOK/);
});
