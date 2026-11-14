// Crash reporting (MUST-9, 2026-11-13).
//
// Sentry project: anchor-wing-llc / code3-tcg-app (created 2026-11-13). The
// DSN is a public client key, so a default is kept here; VITE_SENTRY_DSN
// overrides it, and an empty VITE_SENTRY_DSN turns reporting off.
//
// Privacy rules, enforced in code, not by convention:
// - sendDefaultPii is off; no IP, no email, no username is attached.
// - Every event, breadcrumb and URL is scrubbed: emails, long digit runs
//   (cards/phones), query strings, tokens, and anything that looks like a
//   record body are removed before it leaves the device.
// - People can turn it off in Settings → Privacy (localStorage flag); kid-safe
//   profiles never report.
// - Only errors. No session replay, no performance traces.
import { APP_VERSION } from "../../appUpdate";

export const CRASH_REPORTING_OPT_OUT_KEY = "code3-crash-reports-off";
export const DEFAULT_SENTRY_DSN = "https://aaf9f856fa13922eeec673769069e443@o4512392587051008.ingest.us.sentry.io/4512428027019264";

let started = false;
let sentryModule = null;

export function crashReportingAllowed() {
  try { return window.localStorage.getItem(CRASH_REPORTING_OPT_OUT_KEY) !== "1"; } catch { return true; }
}
export function setCrashReportingAllowed(allowed) {
  try {
    if (allowed) window.localStorage.removeItem(CRASH_REPORTING_OPT_OUT_KEY);
    else window.localStorage.setItem(CRASH_REPORTING_OPT_OUT_KEY, "1");
  } catch { /* storage unavailable */ }
  if (sentryModule?.getClient) {
    const client = sentryModule.getClient();
    if (client?.getOptions) client.getOptions().enabled = Boolean(allowed);
  }
}

export function resolveSentryDsn(env = import.meta.env || {}) {
  if (Object.prototype.hasOwnProperty.call(env, "VITE_SENTRY_DSN")) return String(env.VITE_SENTRY_DSN || "").trim();
  return DEFAULT_SENTRY_DSN;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const LONG_DIGITS = /\b\d(?:[ -]?\d){9,18}\b/g;
const TOKENISH = /\b(?:eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|sk_(?:live|test)_[A-Za-z0-9]{8,}|sbp_[A-Za-z0-9]{8,}|[A-Fa-f0-9]{32,})\b/g;
const SENSITIVE_KEYS = /^(?:email|password|passcode|pwd|token|access_token|refresh_token|apikey|api_key|authorization|cookie|card|cardNumber|cvv|cvc|ssn|phone|address|notes?|description|message|body|record|records|items?|inventory|sales|payload|data)$/i;

export function scrubText(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(EMAIL, "[email]")
    .replace(TOKENISH, "[token]")
    .replace(LONG_DIGITS, "[digits]")
    .replace(/([?#]).*$/s, "$1[removed]");
}

export function scrubValue(value, depth = 0) {
  if (depth > 6) return "[trimmed]";
  if (typeof value === "string") return scrubText(value).slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => scrubValue(entry, depth + 1));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value).slice(0, 40)) {
      out[key] = SENSITIVE_KEYS.test(key) ? "[removed]" : scrubValue(entry, depth + 1);
    }
    return out;
  }
  return value;
}

/** Applied to every event before it is sent. Exported for tests. */
export function scrubEvent(event) {
  if (!event || typeof event !== "object") return event;
  const next = { ...event };
  delete next.user;
  delete next.server_name;
  if (next.request) {
    next.request = { url: scrubText(String(next.request.url || "")) };
  }
  if (next.message) next.message = scrubText(String(next.message));
  if (next.exception?.values) {
    next.exception = { ...next.exception, values: next.exception.values.map((entry) => ({ ...entry, value: scrubText(String(entry.value || "")) })) };
  }
  if (next.extra) next.extra = scrubValue(next.extra);
  if (next.contexts) next.contexts = scrubValue(next.contexts);
  if (next.tags) next.tags = scrubValue(next.tags);
  if (Array.isArray(next.breadcrumbs)) {
    next.breadcrumbs = next.breadcrumbs.slice(-30).map((crumb) => scrubBreadcrumb(crumb)).filter(Boolean);
  }
  return next;
}

export function scrubBreadcrumb(crumb) {
  if (!crumb || typeof crumb !== "object") return null;
  // Keyboard/input breadcrumbs can carry what the person typed: drop them.
  if (crumb.category === "ui.input" || crumb.category === "console") return null;
  const next = { ...crumb };
  if (next.message) next.message = scrubText(String(next.message));
  if (next.data) next.data = scrubValue(next.data);
  return next;
}

export async function initCrashReporting({ dsn = resolveSentryDsn(), kidSafe = false, release = APP_VERSION, environment = import.meta.env?.MODE || "production" } = {}) {
  if (started || !dsn || kidSafe || import.meta.env?.DEV || !crashReportingAllowed()) return false;
  started = true;
  try {
    const Sentry = await import("@sentry/react");
    sentryModule = Sentry;
    Sentry.init({
      dsn,
      release: release ? `code3-tcg-app@${release}` : undefined,
      environment,
      sendDefaultPii: false,
      autoSessionTracking: false,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      maxBreadcrumbs: 30,
      integrations: (defaults) => defaults.filter((integration) => !/Replay|BrowserTracing|Feedback/i.test(integration.name)),
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
      ignoreErrors: [/ResizeObserver loop/, /Loading chunk \d+ failed/, /NetworkError/, /AbortError/],
    });
    return true;
  } catch (error) {
    // SDK not installed or blocked: the app must never fail because of telemetry.
    started = false;
    if (import.meta.env?.DEV) console.warn("Crash reporting unavailable", error);
    return false;
  }
}

/** Report a handled error with a short, non-sensitive label. */
export function reportHandledError(error, label = "", extra = {}) {
  if (!sentryModule || !crashReportingAllowed()) return;
  try { sentryModule.captureException(error, { tags: { label: scrubText(String(label)).slice(0, 80) }, extra: scrubValue(extra) }); } catch { /* ignore */ }
}
