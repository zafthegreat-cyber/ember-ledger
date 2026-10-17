import express, { Router, type NextFunction, type Request, type Response } from "express";
import { ownerSecurity } from "../auth/ownerAuthorization";
import { type OwnerSessionService, type VerifiedOwnerSession } from "../auth/ownerSessionService";
import { OwnerSessionError, sessionError } from "../auth/sessionLedger";
import { createOwnerRateLimit } from "../code3/rateLimit";

export type OwnerSessionRouterOptions = {
  requireOwner?: typeof ownerSecurity.requireOwner;
  service?: OwnerSessionService;
  // Verify the real provider session server-side. A request-supplied session ID is not authoritative.
  resolveSession?: (request: Request, response: Response) => Promise<VerifiedOwnerSession | null>;
};
const run = (handler: (request: Request, response: Response) => Promise<unknown>) => (request: Request, response: Response, next: NextFunction) => { Promise.resolve(handler(request, response)).catch(next); };
function session(response: Response) { return response.locals.verifiedOwnerSession as VerifiedOwnerSession; }

export function createOwnerSessionGuard(options: OwnerSessionRouterOptions) {
  return async (request: Request, response: Response, next: NextFunction) => {
    try {
      if (!options.service || !options.resolveSession) throw sessionError("owner_sessions_not_active", 503, "Server session management is not active.");
      const verified = await options.resolveSession(request, response);
      const principal = response.locals.authPrincipal;
      if (!verified || !principal || verified.owner.principal.subject !== principal.subject || verified.owner.principal.provider !== principal.provider
        || verified.owner.principal.expiresAt !== principal.expiresAt) throw sessionError("verified_session_required", 401, "A current verified owner session is required.");
      await options.service.assertActive(verified);
      response.locals.verifiedOwnerSession = verified;
      next();
    } catch (error) { next(error); }
  };
}

/** Mount with protected CORS before general parsing. Defaults remain unavailable; no live provider
 * is connected, no server settings are inferred, and no Supabase-wide signout is performed. */
export function createOwnerSessionsRouter(options: OwnerSessionRouterOptions = {}) {
  const router = Router();
  router.use(options.requireOwner || ownerSecurity.requireOwner);
  router.use(createOwnerRateLimit({ maximumRequests: 30 }));
  router.use((request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    if (!options.service || !options.resolveSession) return next(sessionError("owner_sessions_not_active", 503, "Server session management is not active."));
    options.resolveSession(request, response).then((verified) => {
      const principal = response.locals.authPrincipal;
      if (!verified || !principal || verified.owner.principal.subject !== principal.subject || verified.owner.principal.provider !== principal.provider || verified.owner.principal.expiresAt !== principal.expiresAt) throw sessionError("verified_session_required", 401, "A current verified owner session is required.");
      response.locals.verifiedOwnerSession = verified;
      next();
    }).catch(next);
  });
  const service = () => options.service!;
  router.post("/register", express.json({ limit: "1kb", inflate: false }), run(async (request, response) => {
    if (!request.body || Object.keys(request.body).some((key) => key !== "label")) throw sessionError("invalid_session_request", 400, "Unsupported session details.");
    response.json({ ok: true, session: await service().register(session(response), request.body.label) });
  }));
  router.get("/", run(async (_request, response) => response.json({ ok: true, scope: "CODE3_APP", sessions: await service().list(session(response)) })));
  router.get("/audit", run(async (_request, response) => response.json({ ok: true, ...await service().audit(session(response)) })));
  router.post("/confirmation", express.json({ limit: "8kb", inflate: false }), run(async (request, response) => {
    if (!request.body || Object.keys(request.body).some((key) => !["purpose", "planDigest", "proof"].includes(key))) throw sessionError("invalid_session_request", 400, "Unsupported confirmation details.");
    response.json({ ok: true, confirmation: await service().issueGrant(session(response), request.body.purpose, request.body.planDigest, request.body.proof) });
  }));
  router.post("/:id/revoke", express.json({ limit: "1kb", inflate: false }), run(async (request, response) => {
    if (!request.body || Object.keys(request.body).some((key) => key !== "grant")) throw sessionError("invalid_session_request", 400, "Unsupported revocation details.");
    response.json({ ok: true, result: await service().revoke(session(response), String(request.params.id), request.body.grant) });
  }));
  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof OwnerSessionError) return response.status(error.status).json({ ok: false, error: { code: error.code, message: error.message } });
    const type = error && typeof error === "object" && "type" in error ? error.type : "";
    if (["entity.parse.failed", "entity.too.large", "encoding.unsupported"].includes(String(type))) return response.status(type === "entity.too.large" ? 413 : 400).json({ ok: false, error: { code: "invalid_session_request", message: "The owner session request could not be read." } });
    return response.status(503).json({ ok: false, error: { code: "owner_sessions_unavailable", message: "The owner security operation could not be verified." } });
  });
  return router;
}
