import express, { Router, type NextFunction, type Request, type Response } from "express";
import type { AuthPrincipal } from "../auth/authPrincipal";
import { ownerSecurity } from "../auth/ownerAuthorization";
import { detectRuntimeKind, isHostedRuntime, isLoopbackAddress } from "../auth/runtimeEnvironment";
import { createOwnerRateLimit } from "../code3/rateLimit";
import {
  MAILBOX_IMPORT_DAYS, MAILBOX_IMPORT_LIMITS, MAILBOX_PROVIDERS, MailboxImportError, validateMailboxImportInput,
} from "../mailboxImport/contracts";
import { createMailboxPull, requireRealMailboxOwner } from "../mailboxImport/imapPull";

type Options = {
  requireOwner?: typeof ownerSecurity.requireOwner;
  pull?: ReturnType<typeof createMailboxPull>;
  env?: Record<string, string | undefined>;
  maximumRequests?: number;
};

function principal(response: Response): AuthPrincipal {
  const value = response.locals.authPrincipal as AuthPrincipal | undefined;
  if (!value) throw new MailboxImportError("mailbox_owner_required", "Sign in with the verified owner account to preview purchase emails.", 401);
  requireRealMailboxOwner(value);
  return value;
}

export function mailboxTransportAllowed(request: Request, env: Record<string, string | undefined> = process.env): boolean {
  if (request.secure) return true;
  if (env.VERCEL === "1" && request.headers["x-forwarded-proto"] === "https") return true;
  const hostname = String(request.hostname || "").toLowerCase();
  return !isHostedRuntime(detectRuntimeKind(env))
    && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname)
    && isLoopbackAddress(request.socket?.remoteAddress || "");
}

const run = (handler: (request: Request, response: Response) => Promise<unknown>) =>
  (request: Request, response: Response, next: NextFunction) => { Promise.resolve(handler(request, response)).catch(next); };

/** Mount behind protectedCors, before the application's general body parser. */
export function createMailboxImportRouter(options: Options = {}) {
  const router = Router();
  const pull = options.pull || createMailboxPull();
  const active = new Set<string>();
  router.use(options.requireOwner || ownerSecurity.requireOwner);
  router.use((request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("X-Content-Type-Options", "nosniff");
    try {
      principal(response);
      if (!mailboxTransportAllowed(request, options.env)) throw new MailboxImportError("mailbox_secure_transport_required", "Use the secure Code 3 TCG app to preview purchase emails.", 403);
      if (Object.keys(request.query).length) throw new MailboxImportError("mailbox_request_invalid", "Mailbox operations do not accept URL parameters.");
      next();
    } catch (error) { next(error); }
  });
  router.get("/status", (_request, response) => response.json({
    ok: true, available: true, mode: "ONE_TIME_READ", credentialStored: false,
    mailboxReadOnly: true, providers: MAILBOX_PROVIDERS, days: MAILBOX_IMPORT_DAYS, limits: MAILBOX_IMPORT_LIMITS,
  }));
  router.post("/preview", createOwnerRateLimit({ maximumRequests: options.maximumRequests || 4 }),
    express.json({ limit: MAILBOX_IMPORT_LIMITS.requestBytes, strict: true, type: "*/*", inflate: false }),
    run(async (request, response) => {
      const owner = principal(response);
      const key = `${owner.provider}:${owner.subject}`;
      let input;
      try { input = validateMailboxImportInput(request.body); }
      finally {
        if (request.body && typeof request.body === "object") delete request.body.appPassword;
        request.body = undefined;
      }
      if (active.has(key)) {
        input.appPassword = "";
        throw new MailboxImportError("mailbox_preview_active", "A mailbox preview is already running. Wait for it to finish.", 409);
      }
      active.add(key);
      const controller = new AbortController();
      const abort = () => controller.abort();
      const close = () => { if (!response.writableEnded) abort(); };
      request.once("aborted", abort);
      response.once("close", close);
      try {
        if (request.aborted || response.destroyed) controller.abort();
        const result = await pull(owner, input, controller.signal);
        if (!controller.signal.aborted && !response.destroyed) return response.json({ ok: true, ...result });
        return undefined;
      } finally {
        input.appPassword = "";
        request.removeListener("aborted", abort);
        response.removeListener("close", close);
        active.delete(key);
      }
    }));
  router.use((_request, response) => response.status(404).json({ ok: false, error: { code: "mailbox_route_not_found", message: "The mailbox operation is unavailable." } }));
  router.use((error: unknown, request: Request, response: Response, _next: NextFunction) => {
    if (request.body && typeof request.body === "object") delete request.body.appPassword;
    request.body = undefined;
    if (response.destroyed) return undefined;
    if (error instanceof MailboxImportError) return response.status(error.status).json({ ok: false, error: { code: error.code, message: error.message } });
    const type = error && typeof error === "object" && "type" in error ? error.type : "";
    if (type === "entity.too.large") return response.status(413).json({ ok: false, error: { code: "mailbox_request_invalid", message: "The mailbox request is too large." } });
    if (type === "entity.parse.failed" || type === "encoding.unsupported") return response.status(400).json({ ok: false, error: { code: "mailbox_request_invalid", message: "The mailbox request could not be read." } });
    return response.status(503).json({ ok: false, error: { code: "mailbox_unavailable", message: "The mailbox preview could not finish. No emails or saved records were changed." } });
  });
  return router;
}

export const mailboxImportRouter = createMailboxImportRouter();
