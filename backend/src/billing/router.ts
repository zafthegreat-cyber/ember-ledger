import express, { Router, type NextFunction, type Request, type Response } from "express";
import { readBearerToken, type AuthPrincipal, type IdentityProvider } from "../auth/authPrincipal";
import { createSupabaseIdentityProvider } from "../auth/supabaseIdentityProvider";
import { createOwnerRateLimit } from "../code3/rateLimit";
import { createProtectedCors } from "../security/corsPolicy";
import { BillingError } from "./config";
import type { BillingService } from "./service";

export function createBillingRouter(options: { service?: BillingService; identityProvider?: IdentityProvider } = {}) {
  const router = Router();
  const provider = options.identityProvider || createSupabaseIdentityProvider();
  const run = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
  const service = () => { if (!options.service) throw new BillingError("billing_not_configured", 503, "Sandbox billing is not configured."); return options.service; };
  router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  // Signature verification needs the original bytes. This route precedes app JSON/auth middleware.
  router.post("/webhook", express.raw({ type: "application/json", limit: "256kb", inflate: false }), run(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || typeof req.headers["stripe-signature"] !== "string") throw new BillingError("invalid_stripe_signature", 400, "A signed Stripe payload is required.");
    await service().webhook(req.body, req.headers["stripe-signature"]);
    res.json({ received: true });
  }));
  router.use(createProtectedCors());
  router.use((req, res, next) => { (async () => {
    const token = readBearerToken(req);
    const result = token.ok ? await provider.verifyAccessToken(token.token) : null;
    if (!result?.ok || result.principal.provider !== "supabase" || !result.principal.emailVerified) {
      const unavailable = result?.ok === false && ["unavailable", "not_configured"].includes(result.reason);
      throw new BillingError(unavailable ? "authentication_unavailable" : "authentication_required", unavailable ? 503 : 401, "Sign in with a verified account to use billing.");
    }
    res.locals.authPrincipal = result.principal;
    next();
  })().catch(next); });
  return finishRouter(router, options, service);
}

function finishRouter(router: Router, options: { service?: BillingService }, service: () => BillingService) {
  router.use(createOwnerRateLimit({ maximumRequests: 20 }));
  router.use(express.json({ limit: "2kb", inflate: false }));
  const run = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
  const principal = (res: Response) => res.locals.authPrincipal as AuthPrincipal;
  router.get("/status", run(async (_req, res) => {
    if (!options.service) return res.json({ enabled: false, mode: "sandbox", offers: [], grants: [] });
    res.json(await service().status(principal(res)));
  }));
  router.post("/checkout", run(async (req, res) => {
    if (!req.body || Object.keys(req.body).some(key => !["offerId", "attemptId"].includes(key)) || typeof req.body.offerId !== "string" || typeof req.body.attemptId !== "string") throw new BillingError("invalid_checkout_request", 400, "Select an offer and start a checkout attempt.");
    res.json(await service().checkout(principal(res), req.body.offerId, req.body.attemptId));
  }));
  router.post("/portal", run(async (req, res) => {
    if (!req.body || Object.keys(req.body).length) throw new BillingError("invalid_portal_request", 400, "Unsupported portal details.");
    res.json(await service().portal(principal(res)));
  }));
  router.use((_req, res) => res.status(404).json({ ok: false, error: { code: "billing_route_not_found", message: "Billing route not found." } }));
  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof BillingError) return res.status(error.status).json({ ok: false, error: { code: error.code, message: error.message } });
    const type = error && typeof error === "object" && "type" in error ? String(error.type) : "";
    if (["entity.parse.failed", "entity.too.large", "encoding.unsupported"].includes(type)) return res.status(type === "entity.too.large" ? 413 : 400).json({ ok: false, error: { code: "invalid_billing_request", message: "The billing request could not be read." } });
    // Provider errors can contain account details or secrets; never return or log raw errors.
    return res.status(503).json({ ok: false, error: { code: "billing_unavailable", message: "Sandbox billing is temporarily unavailable." } });
  });
  return router;
}
