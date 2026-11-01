import { Component, lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import * as Sentry from "@sentry/react";
import "./index.css";
import AppLoadFallback from "./components/AppLoadFallback";
import { registerServiceWorker } from "./registerServiceWorker";
import { BRAND_CONFIG, applyBrandDocumentMetadata } from "./config/brand";
import { shouldExposeFallbackErrorDetails } from "./utils/appFallbackContent";
import CloudWorkspaceBoundary from "./features/persistence/CloudWorkspaceBoundary.jsx";
import NativeBridge from "./native/NativeBridge.jsx";
import "./native/native.css";

const App = lazy(() => import("./App.jsx"));

if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    sendDefaultPii: false,
    integrations: [],
    beforeSend(event) {
      delete event.user;
      delete event.request;
      delete event.breadcrumbs;
      return event;
    },
  });
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { crashed: true, error };
  }

  componentDidCatch(error, info) {
    Sentry.captureException(error);
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

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {import.meta.env.PROD && <Analytics beforeSend={(event) => ({ ...event, url: new URL(event.url).origin + new URL(event.url).pathname })} />}
    <AppErrorBoundary>
      <NativeBridge />
      <Suspense fallback={<AppLoadFallback kind="loading" />}>
        <CloudWorkspaceBoundary><App /></CloudWorkspaceBoundary>
      </Suspense>
    </AppErrorBoundary>
  </StrictMode>
);

registerServiceWorker();
