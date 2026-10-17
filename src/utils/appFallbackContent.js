import { BRAND_CONFIG } from "../config/brand.js";

export const APP_LOAD_SLOW_THRESHOLD_MS = 12000;

export function readAppLoadFallbackTheme() {
  if (typeof window === "undefined") return "light";
  try {
    const inspectionTheme = new URLSearchParams(window.location.search).get("themeInspect");
    if (inspectionTheme === "light" || inspectionTheme === "dark") return inspectionTheme;
    const direct = window.localStorage.getItem("et-tcg-app-theme");
    if (direct) return direct.trim().toLowerCase() === "dark" ? "dark" : "light";
    const saved = JSON.parse(window.localStorage.getItem("et-tcg-beta-data") || "{}");
    const choice = saved?.appThemeChoice || saved?.themeChoice || saved?.settings?.appThemeChoice;
    return String(choice || "").trim().toLowerCase() === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export const APP_LOAD_FALLBACK_COPY = {
  loading: {
    eyebrow: BRAND_CONFIG.applicationDisplayName,
    title: `Loading ${BRAND_CONFIG.shortName}...`,
    body: "Preparing your business workspace.",
    helper: "This usually takes a few seconds.",
  },
  slow: {
    eyebrow: BRAND_CONFIG.applicationDisplayName,
    title: "Still loading your workspace",
    body: "This is taking longer than usual.",
    helper: "Check your connection, then try refreshing the app.",
  },
  updating: {
    eyebrow: BRAND_CONFIG.applicationDisplayName,
    title: `${BRAND_CONFIG.shortName} is updating`,
    body: "We are refreshing the application.",
    helper: "Please try again in a moment. If this keeps happening, close and reopen the app.",
  },
  error: {
    eyebrow: BRAND_CONFIG.applicationDisplayName,
    title: "We couldn't load this screen",
    body: "The application had trouble opening this part of the workspace.",
    helper: "Refresh the app, return home, or send feedback if it keeps happening.",
  },
  chunk: {
    eyebrow: BRAND_CONFIG.applicationDisplayName,
    title: `${BRAND_CONFIG.shortName} may have just updated`,
    body: "Refresh to load the newest version.",
    helper: "This can happen when an older app screen is open during a new release.",
  },
};

export function getAppLoadFallbackCopy(kind = "error") {
  return APP_LOAD_FALLBACK_COPY[kind] || APP_LOAD_FALLBACK_COPY.error;
}

export function isLikelyChunkLoadError(error = {}) {
  const message = String(error?.message || error || "");
  const name = String(error?.name || "");
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed|dynamically imported module/i.test(`${name} ${message}`);
}

export function shouldExposeFallbackErrorDetails(mode = "") {
  return String(mode || "").toLowerCase() === "development";
}
