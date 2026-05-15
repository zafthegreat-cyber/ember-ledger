export const APP_VERSION = typeof __EMBER_TIDE_APP_VERSION__ === "string"
  ? __EMBER_TIDE_APP_VERSION__
  : "dev";

export const APP_VERSION_URL = "/app-version.json";

function normalizeVersion(value) {
  return String(value || "").trim();
}

export async function checkForEmberTideUpdate() {
  const response = await fetch(`${APP_VERSION_URL}?t=${Date.now()}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) return { available: false, currentVersion: APP_VERSION };

  const latest = await response.json();
  const latestVersion = normalizeVersion(latest.version || latest.builtAt);
  const currentVersion = normalizeVersion(APP_VERSION);
  return {
    available: Boolean(latestVersion && currentVersion && latestVersion !== currentVersion),
    currentVersion,
    latestVersion,
    latest,
  };
}

export async function clearEmberTideAppCaches() {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith("ember-tide-"))
      .map((key) => caches.delete(key))
  );
}

export async function refreshEmberTideApp() {
  try {
    sessionStorage.setItem("ember-tide-safe-refresh", "true");
  } catch {
    // Session storage is optional; refresh still works without it.
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    registrations.forEach((registration) => {
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      } else if (registration.active) {
        registration.active.postMessage({ type: "CLEAR_APP_CACHES" });
      }
    });
  }

  await clearEmberTideAppCaches();
  window.setTimeout(() => {
    window.location.reload();
  }, 250);
}
