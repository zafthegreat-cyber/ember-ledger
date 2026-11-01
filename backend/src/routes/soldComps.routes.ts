import { Router } from "express";
import { createOwnerRateLimit } from "../code3/rateLimit";
import { searchSoldComps, soldCompsHealth, SoldCompsError } from "../services/soldComps.service";

/** Mounted after the existing eBay owner boundary. No raw provider proxy. */
export function createSoldCompsRouter() {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  router.get("/health", (_req, res) => res.json(soldCompsHealth()));
  router.post("/search", createOwnerRateLimit({ maximumRequests: 10 }), async (req, res) => {
    try { return res.json(await searchSoldComps(req.body)); }
    catch (error) {
      const safe = error instanceof SoldCompsError ? error : new SoldCompsError("sold_data_unavailable", "Sold-price estimates are temporarily unavailable.", 503);
      if (safe.retryAfterSeconds) res.setHeader("Retry-After", String(safe.retryAfterSeconds));
      return res.status(safe.status).json({ ok: false, providerId: "compsapi", error: { code: safe.code, message: safe.message, retryAfterSeconds: safe.retryAfterSeconds } });
    } finally { req.body = undefined; }
  });
  return router;
}
