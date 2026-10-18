import express, { Router, type NextFunction, type Request, type Response } from "express";
import { readBearerToken } from "../auth/authPrincipal";
import { createOwnerRateLimit } from "../code3/rateLimit";
import { mailboxTransportAllowed } from "./mailboxImport.routes";
import { AccountDeletionError, createAccountDeletionService, DELETION_SCOPE, RETAINED_SCOPE, type AccountDeletionService, type DeletionIdentity } from "../accountDeletion/service";

type Options = { service?: AccountDeletionService; env?: Record<string, string | undefined> };
const run = (handler: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve(handler(req, res)).catch(next); };

export function createAccountDeletionRouter(options: Options = {}) {
  const router = Router();
  const service = options.service || createAccountDeletionService(options);
  router.use((_req, res, next) => { res.set({ "Cache-Control": "no-store", Pragma: "no-cache", "X-Content-Type-Options": "nosniff" }); next(); });
  router.use((req, res, next) => { Promise.resolve().then(async () => {
    if (!mailboxTransportAllowed(req, options.env)) throw new AccountDeletionError("account_secure_transport_required", "Use the secure Code 3 TCG app.", 403);
    const bearer = readBearerToken(req);
    if (!bearer.ok) throw new AccountDeletionError("account_sign_in_required", "Sign in to the account you want to delete.", 401);
    if (Object.keys(req.query).length) throw new AccountDeletionError("account_deletion_request_invalid", "URL parameters are not accepted.");
    const identity = await service.identify(bearer.token);
    res.locals.deletionIdentity = identity;
    res.locals.authPrincipal = { provider: "supabase", subject: identity.id };
    next();
  }).catch(next); });
  const identity = (res: Response) => res.locals.deletionIdentity as DeletionIdentity;
  router.get("/status", run(async (_req, res) => res.json({ ok: true, available: true, accountEmail: identity(res).email, ...await service.status(identity(res)), deletionScope: DELETION_SCOPE, retainedScope: RETAINED_SCOPE })));
  router.post("/", createOwnerRateLimit({ maximumRequests: 4 }), express.json({ limit: "4kb", strict: true, inflate: false }), run(async (req, res) => {
    const body = req.body;
    req.body = undefined;
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["password", "confirmation"].includes(key)) || body.confirmation !== "DELETE MY ACCOUNT" || typeof body.password !== "string" || !body.password || body.password.length > 1024) {
      if (body && typeof body === "object") delete body.password;
      throw new AccountDeletionError("account_deletion_request_invalid", "Enter your password and type DELETE MY ACCOUNT to confirm.");
    }
    let password = body.password;
    delete body.password;
    try { await service.remove(identity(res), password); return res.json({ ok: true, state: "deleted", localCleanupRequired: true }); }
    finally { password = ""; }
  }));
  router.use((_req, res) => res.status(404).json({ ok: false, error: { code: "account_deletion_route_not_found", message: "Account operation not found." } }));
  router.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    req.body = undefined;
    if (error instanceof AccountDeletionError) return res.status(error.status).json({ ok: false, error: { code: error.code, message: error.message } });
    const type = error && typeof error === "object" && "type" in error ? error.type : "";
    const invalid = ["entity.too.large", "entity.parse.failed", "encoding.unsupported"].includes(String(type));
    return res.status(invalid ? 400 : 503).json({ ok: false, error: { code: invalid ? "account_deletion_request_invalid" : "account_deletion_unavailable", message: invalid ? "The request could not be read." : "Account deletion could not be checked. Try again later." } });
  });
  return router;
}
