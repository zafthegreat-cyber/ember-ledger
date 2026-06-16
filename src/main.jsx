import { Component, lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import AppLoadFallback from "./components/AppLoadFallback";
import { registerServiceWorker } from "./registerServiceWorker";
import { shouldExposeFallbackErrorDetails } from "./utils/appFallbackContent";

const App = lazy(() => import("./App.jsx"));

class EmberTideErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { crashed: true, error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error("Ember & Tide crashed", error, info);
    } else {
      console.error("Ember & Tide had trouble loading this screen.", error?.message || "Unknown error");
    }
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return <AppLoadFallback error={this.state.error} showDetails={shouldExposeFallbackErrorDetails(import.meta.env.MODE)} />;
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <EmberTideErrorBoundary>
      <Suspense fallback={<AppLoadFallback />}>
        <App />
      </Suspense>
    </EmberTideErrorBoundary>
  </StrictMode>
);

registerServiceWorker();
