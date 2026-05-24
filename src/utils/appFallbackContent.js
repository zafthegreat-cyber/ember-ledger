export const APP_LOAD_FALLBACK_COPY = {
  loading: {
    eyebrow: "Ember & Tide",
    title: "Loading Ember & Tide...",
    body: "Preparing your command center.",
    helper: "Thanks for hanging tight while the app gets ready.",
  },
  updating: {
    eyebrow: "Ember & Tide",
    title: "Ember & Tide is updating",
    body: "We're refreshing the app so everything stays smooth.",
    helper: "Please try again in a moment. If this keeps happening, close and reopen the app.",
  },
  error: {
    eyebrow: "Ember & Tide",
    title: "We couldn't load this screen",
    body: "Ember & Tide had trouble opening this part of the app.",
    helper: "Refresh the app, return home, or send feedback if it keeps happening.",
  },
  chunk: {
    eyebrow: "Ember & Tide",
    title: "Ember & Tide may have just updated",
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
