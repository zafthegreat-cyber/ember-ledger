import { useEffect, useState } from "react";
import { BRAND_CONFIG } from "../config/brand";
import { APP_LOAD_SLOW_THRESHOLD_MS, getAppLoadFallbackCopy, isLikelyChunkLoadError, readAppLoadFallbackTheme } from "../utils/appFallbackContent";

export default function AppLoadFallback({ kind = "error", error = null, showDetails = false }) {
  const resolvedKind = kind === "error" && isLikelyChunkLoadError(error) ? "chunk" : kind;
  const isLoading = resolvedKind === "loading";
  const [slowLoading, setSlowLoading] = useState(false);
  const copy = getAppLoadFallbackCopy(isLoading && slowLoading ? "slow" : resolvedKind);
  const errorMessage = showDetails && error?.message ? String(error.message) : "";

  useEffect(() => {
    if (!isLoading) return undefined;
    const timer = window.setTimeout(() => setSlowLoading(true), APP_LOAD_SLOW_THRESHOLD_MS);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  function refreshApp() {
    window.location.reload();
  }

  function returnHome() {
    window.location.assign("/");
  }

  return (
    <main className="app-load-fallback" data-boot-theme={readAppLoadFallbackTheme()} role={isLoading ? "status" : "alert"} aria-live={isLoading ? "polite" : "assertive"} aria-label={copy.title}>
      <section className="app-load-fallback-card">
        <div className="app-load-fallback-brand" aria-hidden="true">
          <span>{BRAND_CONFIG.monogram}</span>
        </div>
        <p className="app-load-fallback-eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <small>{copy.helper}</small>
        {isLoading ? (
          <div className="app-load-fallback-progress" aria-hidden="true">
            <span />
          </div>
        ) : null}
        {!isLoading || slowLoading ? (
          <div className="app-load-fallback-actions">
            <button type="button" onClick={refreshApp}>Refresh app</button>
            <button type="button" className="app-load-fallback-secondary" onClick={returnHome}>Return home</button>
          </div>
        ) : null}
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
