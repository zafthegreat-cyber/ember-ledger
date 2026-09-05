import { useCallback, useEffect, useState } from "react";
import { getEbayHealth } from "../ebayClient.js";
import { StatusPill } from "./Fields.jsx";

function healthPresentation(health) {
  if (!health) return { tone: "muted", label: "Checking server" };
  if (health.error?.code === "authentication_error") return { tone: "danger", label: "Authorization Required" };
  if (health.configured === false) return { tone: "muted", label: "Not Configured" };
  if (health.healthy === true) return { tone: "good", label: "Available" };
  if (health.error) return { tone: "warning", label: "Connection issue" };
  return { tone: "warning", label: "Configured · not verified" };
}

export default function EbayConnectionPanel({ onStatus }) {
  const [health, setHealth] = useState(null);
  const [checking, setChecking] = useState(false);
  const loadHealth = useCallback(async (verify = false) => {
    setChecking(true);
    try {
      const next = await getEbayHealth({ verify });
      setHealth(next);
      onStatus?.(next);
    } catch (error) {
      const routeUnavailable = error?.status === 404;
      const next = routeUnavailable
        ? {
            configured: false,
            healthy: false,
            missing: [],
            message: "The server-side eBay connector is not available in this frontend session.",
            checkedAt: new Date().toISOString(),
          }
        : { configured: true, healthy: false, error: { code: error.code, message: error.message }, checkedAt: new Date().toISOString() };
      setHealth(next);
      onStatus?.(next);
    } finally {
      setChecking(false);
    }
  }, [onStatus]);

  useEffect(() => { loadHealth(false); }, [loadHealth]);
  const presentation = healthPresentation(health);
  return (
    <article className="flip-ebay-connection" aria-live="polite">
      <div className="flip-record-card__head">
        <div><span>Server-side provider</span><h3>eBay Browse API</h3></div>
        <StatusPill tone={presentation.tone}>{presentation.label}</StatusPill>
      </div>
      <p>{health?.message || health?.error?.message || (health?.configured === false ? `Missing server variables: ${(health.missing || []).join(", ")}.` : "Checking whether the application server has eBay configuration.")}</p>
      <div className="flip-record-facts">
        <span>Environment <strong>{health?.environment || "—"}</strong></span>
        <span>Marketplace <strong>{health?.marketplaceId || "—"}</strong></span>
        <span>Last checked <strong>{health?.checkedAt ? new Date(health.checkedAt).toLocaleString() : "—"}</strong></span>
      </div>
      <button type="button" className="secondary-button" disabled={checking} onClick={() => loadHealth(true)}>{checking ? "Checking…" : "Verify connection"}</button>
      <small>Credentials and application tokens remain on the server. This screen never receives the client secret or token.</small>
    </article>
  );
}
