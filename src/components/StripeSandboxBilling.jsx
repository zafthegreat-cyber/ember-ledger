import { useEffect, useRef, useState } from "react";
import { createStripeCheckout, createStripePortal, getStripeBillingStatus, openStripeBillingUrl } from "../services/stripeBillingApi.js";

function priceLabel(offer) {
  const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency: offer.currency });
  return formatter.format(offer.amount / 10 ** formatter.resolvedOptions().maximumFractionDigits);
}

export default function StripeSandboxBilling() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const attempt = useRef(null);
  useEffect(() => {
    let active = true;
    getStripeBillingStatus().then(value => { if (active) setStatus(value); }).catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);
  async function start(offer) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (offer && attempt.current?.offerId !== offer.id) attempt.current = { offerId: offer.id, id: crypto.randomUUID() };
      const result = offer ? await createStripeCheckout(offer.id, attempt.current.id) : await createStripePortal();
      openStripeBillingUrl(result.url);
    } catch (reason) { setError(reason.message); setBusy(false); }
  }
  return <section className="command-board-v4-section" aria-label="Stripe sandbox billing">
    <h2>Test billing</h2>
    <p>Stripe sandbox — use test payment details. No real charges are made.</p>
    {error && <p role="alert">{error}</p>}
    {!status && !error && <p role="status">Loading billing…</p>}
    {status && !status.enabled && <p>Sandbox billing setup is pending.</p>}
    {status?.enabled && <>
      <p>{status.adultApproved ? "Adult billing account approved for testing." : "An adult billing account must be approved before purchases."}</p>
      {status.offers.map(offer => <button key={offer.id} type="button" className="command-board-v4-secondary-action"
        style={{ minHeight: 44, margin: "4px" }} disabled={busy || !status.adultApproved} onClick={() => start(offer)}>
        {offer.label} — {priceLabel(offer)}
        {offer.interval ? ` / ${offer.intervalCount > 1 ? `${offer.intervalCount} ` : ""}${offer.interval}` : " one-time"}
      </button>)}
      {status.hasCustomer && <button type="button" className="command-board-v4-secondary-action" style={{ minHeight: 44 }} disabled={busy || !status.adultApproved} onClick={() => start(null)}>Manage test billing</button>}
      <p>{status.taxCollection ? "Tax calculation is enabled for registered locations." : "Tax collection is not enabled in this sandbox."}</p>
    </>}
  </section>;
}
