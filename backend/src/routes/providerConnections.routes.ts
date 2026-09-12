import express, { Router, type NextFunction, type Request, type Response } from "express";
import type { AuthPrincipal } from "../auth/authPrincipal";
import { ownerSecurity } from "../auth/ownerAuthorization";
import { createOwnerRateLimit } from "../code3/rateLimit";
import { ProviderRuntimeError } from "../providerRuntime/errors";
import { createProviderRuntime, providerRuntime } from "../providerRuntime/runtime";

type OwnerMiddleware = typeof ownerSecurity.requireOwner;
type ProviderRuntime = ReturnType<typeof createProviderRuntime>;

type ProviderConnectionsRouterOptions = {
  requireOwner?: OwnerMiddleware;
  runtime?: ProviderRuntime;
  maximumBodyBytes?: number;
  maximumRequests?: number;
};

function principal(response: Response): AuthPrincipal {
  const value = response.locals.authPrincipal as AuthPrincipal | undefined;
  if (!value) throw new ProviderRuntimeError("provider_runtime_unavailable", "Owner authorization is required.", 401);
  return value;
}

function asyncRoute(handler: (request: Request, response: Response) => Promise<unknown>) {
  return (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(handler(request, response)).catch(next);
  };
}

function ensureEmptyBoundedBody(request: Request, maximumBodyBytes: number): void {
  const contentLength = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > maximumBodyBytes) {
    throw new ProviderRuntimeError("invalid_provider_request", "The provider request body is too large.", 413);
  }
  const body = request.body;
  if (body == null) return;
  if (typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0) {
    throw new ProviderRuntimeError("invalid_provider_request", "This provider operation does not accept request fields.", 400);
  }
}

function sendError(response: Response, error: unknown) {
  if (error instanceof ProviderRuntimeError) {
    return response.status(error.status).json({
      ok: false,
      error: { code: error.code, message: error.message },
    });
  }
  if (error && typeof error === "object" && "type" in error) {
    const type = String((error as { type?: string }).type || "");
    if (type === "entity.too.large") {
      return response.status(413).json({ ok: false, error: { code: "invalid_provider_request", message: "The provider request body is too large." } });
    }
    if (type === "entity.parse.failed") {
      return response.status(400).json({ ok: false, error: { code: "invalid_provider_request", message: "The provider request body is invalid." } });
    }
  }
  return response.status(500).json({
    ok: false,
    error: { code: "provider_runtime_unavailable", message: "The mailbox provider runtime is unavailable." },
  });
}

function safeConnectionForClient(connection: Awaited<ReturnType<ProviderRuntime["status"]>>["connections"][number]) {
  const { cursorMetadata: _serverCursorMetadata, ...safeConnection } = connection;
  return Object.freeze({ ...safeConnection });
}

export function createProviderConnectionsRouter(options: ProviderConnectionsRouterOptions = {}) {
  const router = Router();
  const runtime = options.runtime || providerRuntime;
  const maximumBodyBytes = options.maximumBodyBytes || 1_024;

  router.use(options.requireOwner || ownerSecurity.requireOwner);
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
    next();
  });
  router.use(createOwnerRateLimit({ maximumRequests: options.maximumRequests || 120 }));
  // All provider-operation bodies are JSON and deliberately tiny. Parsing every
  // content type here also applies the byte limit to chunked/non-standard input.
  router.use(express.json({ limit: maximumBodyBytes, strict: true, type: "*/*" }));

  router.get("/", asyncRoute(async (_request, response) => {
    const status = await runtime.status(principal(response));
    const { connections, ...safeRuntime } = status;
    return response.json({
      ok: true,
      connections: Object.freeze(connections.map(safeConnectionForClient)),
      configurationState: status.available ? "AVAILABLE" : "NOT_CONFIGURED",
      providerCapabilities: status.providers,
      warnings: Object.freeze([status.detail]),
      runtime: safeRuntime,
    });
  }));

  router.get("/capabilities", asyncRoute(async (_request, response) => {
    const result = await runtime.status(principal(response));
    const { connections: _connections, ...safeResult } = result;
    return response.json({
      ok: true,
      configurationState: result.available ? "AVAILABLE" : "NOT_CONFIGURED",
      ...safeResult,
    });
  }));

  router.post("/:connectionId/disconnect", asyncRoute(async (request, response) => {
    ensureEmptyBoundedBody(request, maximumBodyBytes);
    const result = await runtime.disconnect(principal(response), request.params.connectionId);
    return response.json({ ok: true, ...result });
  }));

  // Keep unknown paths inside the protected/no-store boundary instead of
  // falling through to the legacy wildcard-CORS portion of the Express app.
  router.use((_request, response) => response.status(404).json({
    ok: false,
    error: { code: "provider_route_not_found", message: "The provider operation is unavailable." },
  }));
  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => sendError(response, error));
  return router;
}

export const providerConnectionsRouter = createProviderConnectionsRouter();
