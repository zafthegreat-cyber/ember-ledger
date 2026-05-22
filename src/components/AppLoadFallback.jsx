import { refreshEmberTideApp } from "../appUpdate";
import { getAppLoadFallbackCopy, isLikelyChunkLoadError } from "../utils/appFallbackContent";

export default function AppLoadFallback({ kind = "error", error = null, showDetails = false }) {
  const resolvedKind = kind === "error" && isLikelyChunkLoadError(error) ? "chunk" : kind;
  const copy = getAppLoadFallbackCopy(resolvedKind);
  const errorMessage = showDetails && error?.message ? String(error.message) : "";

  function refreshApp() {
    void refreshEmberTideApp();
  }

  function returnHome() {
    window.location.assign("/");
  }

  return (
    <main className="app-load-fallback" role="alert" aria-label={copy.title}>
      <section className="app-load-fallback-card">
        <div className="app-load-fallback-brand" aria-hidden="true">
          <span>ET</span>
        </div>
        <p className="app-load-fallback-eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <small>{copy.helper}</small>
        <div className="app-load-fallback-actions">
          <button type="button" onClick={refreshApp}>Refresh app</button>
          <button type="button" className="secondary-button" onClick={returnHome}>Return home</button>
        </div>
        {errorMessage ? (
          <details className="app-load-fallback-details">
            <summary>Developer details</summary>
            <pre>{errorMessage}</pre>
          </details>
        ) : null}
      </section>
    </main>
  );
}
