import { Component, lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AppLoadFallback from "./components/AppLoadFallback";
import { registerServiceWorker } from "./registerServiceWorker";
import { BRAND_CONFIG, applyBrandDocumentMetadata } from "./config/brand";
import { shouldExposeFallbackErrorDetails } from "./utils/appFallbackContent";
import CloudWorkspaceBoundary from "./features/persistence/CloudWorkspaceBoundary.jsx";
import NativeBridge from "./native/NativeBridge.jsx";
import SocialAuthBoundary from "./features/auth/SocialAuthBoundary.jsx";
import "./native/native.css";
import { initCrashReporting, reportHandledError } from "./features/monitoring/crashReporting.js";

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
// Crash reports (errors only, scrubbed, off for kid profiles and when turned off in Settings → Privacy).
initCrashReporting().catch(() => {});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppErrorBoundary>
      <NativeBridge />
      <Suspense fallback={<AppLoadFallback kind="loading" />}>
        <SocialAuthBoundary><CloudWorkspaceBoundary><App /></CloudWorkspaceBoundary></SocialAuthBoundary>
      </Suspense>
    </AppErrorBoundary>
  </StrictMode>
);

registerServiceWorker();
