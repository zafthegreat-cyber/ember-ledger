export function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then((registration) => {
        function notifyWaiting(worker = registration.waiting) {
          if (!worker) return;
          window.dispatchEvent(new CustomEvent("ember-tide:update-available", {
            detail: { source: "service-worker" },
          }));
        }

        notifyWaiting();

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              notifyWaiting(worker);
            }
          });
        });
      })
      .catch((error) => {
        console.warn("E&T TCG service worker registration failed", error);
      });
  });

  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadingForUpdate) return;
    if (sessionStorage.getItem("ember-tide-safe-refresh") !== "true") return;
    reloadingForUpdate = true;
    window.location.reload();
  });
}
