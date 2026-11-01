export type BillingOffer = Readonly<{
  id: string;
  label: string;
  priceId: string;
  mode: "subscription" | "payment";
  entitlement: string;
}>;

export type BillingConfig = Readonly<{
  enabled: boolean;
  appId: "code3";
  origin: string;
  secretKey: string;
  expectedAccountId: string;
  webhookSecret: string;
  taxEnabled: boolean;
  portalConfiguration: string;
  offers: readonly BillingOffer[];
}>;

export class BillingError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); }
}

const fail = () => { throw new BillingError("billing_not_configured", 503, "Sandbox billing is not configured."); };

/** This first release intentionally cannot accept live keys. */
export function readBillingConfig(env: Record<string, string | undefined> = process.env): BillingConfig {
  const enabled = env.CODE3_BILLING_ENABLED === "true";
  const secretKey = env.STRIPE_SECRET_KEY || "";
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET || "";
  const origin = env.CODE3_BILLING_ORIGIN || "";
  let offers: BillingOffer[] = [];
  if (enabled) {
    if (!/^(?:rk|sk)_test_[A-Za-z0-9]+$/.test(secretKey) || !/^whsec_[A-Za-z0-9]+$/.test(webhookSecret)) fail();
    let url: URL;
    try { url = new URL(origin); } catch { return fail(); }
    const local = env.NODE_ENV !== "production" && env.VERCEL !== "1"
      && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((!local && url.protocol !== "https:") || url.origin !== origin || url.username || url.password) fail();
    try { offers = JSON.parse(env.CODE3_STRIPE_OFFERS_JSON || "[]"); } catch { return fail(); }
    if (!Array.isArray(offers) || !offers.length || offers.length > 30) fail();
    const ids = new Set<string>();
    const prices = new Set<string>();
    for (const offer of offers) {
      if (!offer || Object.keys(offer).some(key => !["id", "label", "priceId", "mode", "entitlement"].includes(key))
        || !/^[a-z][a-z0-9_]{0,63}$/.test(offer.id) || ids.has(offer.id)
        || typeof offer.label !== "string" || !offer.label.trim() || offer.label.length > 100
        || !/^price_[A-Za-z0-9]+$/.test(offer.priceId) || prices.has(offer.priceId)
        || !["subscription", "payment"].includes(offer.mode)
        || !(offer.mode === "subscription" ? /^(collector|family|seller|shop)$/ : /^addon:[a-z][a-z0-9_]{0,63}$/).test(offer.entitlement)) fail();
      ids.add(offer.id); prices.add(offer.priceId);
    }
  }
  return { enabled, appId: "code3", origin, secretKey, webhookSecret,
    expectedAccountId: "acct_1UUZfyJ8o8i7lNhO",
    taxEnabled: env.CODE3_STRIPE_TAX_ENABLED === "true",
    portalConfiguration: env.CODE3_STRIPE_PORTAL_CONFIGURATION || "", offers };
}
