import express, { Router, type NextFunction, type Request, type Response } from "express";
import { createNotificationVerifier, createPostgresDeletionStore, deletionConfig, EbayDeletionError, parseDeletionNotice, sha256, type DeletionStore } from "../ebayDeletion/service";

export function createEbayDeletionRouter(options: {
  env?: Record<string, string | undefined>;
  store?: DeletionStore;
  verify?: (raw: Buffer, header: string | undefined, payload: unknown) => Promise<void>;
} = {}) {
  const router = Router({ strict: true });
  const store = options.store || createPostgresDeletionStore(options.env);
  const verify = options.verify || createNotificationVerifier({ env: options.env });
  router.use((_req, res, next) => { res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); next(); });
  router.get("/", (req, res, next) => {
    try {
      const { token, endpoint } = deletionConfig(options.env);
      const code = req.query.challenge_code;
      if (typeof code !== "string" || !code || code.length > 4096 || Object.keys(req.query).length !== 1) throw new EbayDeletionError("ebay_deletion_invalid_challenge", 400);
      return res.status(200).json({ challengeResponse: sha256(code + token + endpoint) });
    } catch (error) { next(error); }
  });
  router.post("/", express.raw({ type: "application/json", limit: "64kb", inflate: false }), async (req, res, next) => {
    try {
      deletionConfig(options.env);
      if (Object.keys(req.query).length || !Buffer.isBuffer(req.body) || !req.body.length) throw new EbayDeletionError("ebay_deletion_invalid_body", 400);
      const raw = req.body as Buffer;
      let payload: unknown;
      try { payload = JSON.parse(raw.toString("utf8")); } catch { throw new EbayDeletionError("ebay_deletion_invalid_body", 400); }
      await verify(raw, req.get("x-ebay-signature"), payload);
      await store.process(parseDeletionNotice(payload));
      req.body = undefined;
      return res.status(204).end();
    } catch (error) { req.body = undefined; next(error); }
  });
  router.all("/", (_req, res) => res.set("Allow", "GET, POST").status(405).json({ error: { code: "method_not_allowed" } }));
  router.use((_req, res) => res.status(404).json({ error: { code: "not_found" } }));
  router.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    req.body = undefined;
    const type = (error as { type?: string })?.type;
    const status = error instanceof EbayDeletionError ? error.status : type === "entity.too.large" ? 413 : type === "encoding.unsupported" ? 415 : 503;
    if (status === 503) res.set("Retry-After", "30");
    // Never log payloads, signature headers, subject identifiers or underlying errors.
    return res.status(status).json({ error: { code: error instanceof EbayDeletionError ? error.code : "ebay_deletion_unavailable" } });
  });
  return router;
}
