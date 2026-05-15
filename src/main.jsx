import { Component, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import { refreshEmberTideApp } from "./appUpdate";
import { registerServiceWorker } from "./registerServiceWorker";

class UpdateRecoveryBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    console.error("Ember & Tide crashed", error, info);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <main className="app-crash-recovery" role="alert">
        <section className="panel app-crash-card">
          <h1>Something went wrong after an update.</h1>
          <p>Refresh Ember & Tide to load the newest version.</p>
          <button type="button" onClick={() => void refreshEmberTideApp()}>
            Refresh App
          </button>
        </section>
      </main>
    );
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <UpdateRecoveryBoundary>
      <App />
    </UpdateRecoveryBoundary>
  </StrictMode>
);

registerServiceWorker();
