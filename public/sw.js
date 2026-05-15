const CACHE_NAME = "ember-tide-pwa-v3";
const APP_SHELL = [
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon.svg",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/assets/brand/ember-tide-mark.svg",
  "/assets/brand/ember-tide-promo-hero.png",
  "/assets/brand/link-bio-header.png",
  "/assets/brand/pwa-install-promo.png",
];

function isAppCache(key) {
  return key.startsWith("ember-tide-");
}

async function clearOldCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => isAppCache(key) && key !== CACHE_NAME).map((key) => caches.delete(key)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clearOldCaches().then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === "CLEAR_APP_CACHES") {
    event.waitUntil(clearOldCaches());
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname === "/app-version.json") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(async () => (
        (await caches.match("/offline.html")) || Response.error()
      ))
    );
    return;
  }

  if (["script", "style", "worker"].includes(event.request.destination)) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  if (["image", "font", "manifest"].includes(event.request.destination)) {
    event.respondWith(
      caches.match(event.request).then((cached) => (
        cached || fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
      ))
    );
  }
});
