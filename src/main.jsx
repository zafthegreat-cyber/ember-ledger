import { Component, lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import "./index.css";
import AppLoadFallback from "./components/AppLoadFallback";
import { registerServiceWorker } from "./registerServiceWorker";
import { BRAND_CONFIG, applyBrandDocumentMetadata } from "./config/brand";
import { shouldExposeFallbackErrorDetails } from "./utils/appFallbackContent";
import CloudWorkspaceBoundary from "./features/persistence/CloudWorkspaceBoundary.jsx";
import NativeBridge from "./native/NativeBridge.jsx";
import SocialAuthBoundary from "./features/auth/SocialAuthBoundary.jsx";
import "./native/native.css";
import { initCrashReporting, reportHandledError, crashReportingAllowed } from "./features/monitoring/crashReporting.js";
import { preloadDurableAppData } from "./features/persistence/legacyAppStorage.js";

const App = lazy(() => import("./App.jsx"));

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { crashed: true, error };
  }

  componentDidCatch(error, info) {
    reportHandledError(error, "app_error_boundary", { componentStack: String(info?.componentStack || "").slice(0, 400) });
    if (import.meta.env.DEV) {
      console.error(`${BRAND_CONFIG.applicationDisplayName} crashed`, error, info);
    } else {
      console.error(`${BRAND_CONFIG.applicationDisplayName} had trouble loading this screen.`, error?.message || "Unknown error");
    }
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return <AppLoadFallback error={this.state.error} showDetails={shouldExposeFallbackErrorDetails(import.meta.env.MODE)} />;
  }
}

applyBrandDocumentMetadata();
// Crash reports (errors only, scrubbed, off when turned off in Settings → Privacy). The profile is not
// known yet here; App.jsx calls setCrashReportingKidSafe() once it is, and kid-safe sessions send nothing.
initCrashReporting().catch(() => {});

// SHOULD 16: the durable on-device copy (IndexedDB) is read before the first
// render so a collection that outgrew the 5 MB quick copy opens intact.
preloadDurableAppData().finally(() => {
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      {import.meta.env.PROD && /^(code3tcg\.app|emberandtide\.app)$/.test(window.location.hostname) && <Analytics beforeSend={(event) => {
        if (!crashReportingAllowed()) return null;
        const url = new URL(event.url);
        url.search = "";
        url.hash = "";
        url.pathname = url.pathname.replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "record");
        return { ...event, url: url.toString() };
      }} />}
      <AppErrorBoundary>
        <NativeBridge />
        <Suspense fallback={<AppLoadFallback kind="loading" />}>
          <SocialAuthBoundary><CloudWorkspaceBoundary><App /></CloudWorkspaceBoundary></SocialAuthBoundary>
        </Suspense>
      </AppErrorBoundary>
    </StrictMode>
  );
  registerServiceWorker();
});
