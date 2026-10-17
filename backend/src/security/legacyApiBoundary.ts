import cors from "cors";
import type { NextFunction, Request, Response } from "express";
import { ownerSecurity } from "../auth/ownerAuthorization";
import { createProtectedCors } from "./corsPolicy";
import type { RuntimeKind } from "../auth/runtimeEnvironment";

const MODERN_ROUTES = ["/api/auth", "/api/ebay", "/api/code3", "/api/account-ops/provider-connections"];
const PRIVATE_ROUTES = [
  "/api/inventory", "/api/vault", "/api/sales", "/api/expenses", "/api/scout/alerts",
  "/api/store-reports", "/api/tidepool/reports", "/stores", "/predictions/week",
  "/user-inventory", "/contacts", "/notifications", "/db-test", "/sync", "/seed", "/seed-757",
];
const PUBLIC_READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function within(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function createLegacyApiBoundary(options: {
  security?: Pick<typeof ownerSecurity, "requireOwner">;
  env?: Record<string, string | undefined>;
  runtimeKind?: RuntimeKind;
} = {}) {
  const security = options.security || ownerSecurity;
  const protectedCors = createProtectedCors({ ...options, allowDelete: true });
  const publicCors = cors();
  return (request: Request, response: Response, next: NextFunction) => {
    const path = request.path.toLowerCase();
    // Modern routes enforce their own boundary. The monitor has separate server-to-server credentials.
    if (MODERN_ROUTES.some(prefix => within(path, prefix))) return next();
    if (within(path, "/api/bestbuy/monitor/run")) return protectedCors(request, response, next);
    const requestedMethod = request.method === "OPTIONS"
      ? String(request.headers["access-control-request-method"] || "GET").toUpperCase()
      : request.method;
    const privateRequest = PRIVATE_ROUTES.some(prefix => within(path, prefix))
      || !PUBLIC_READ_METHODS.has(requestedMethod);
    if (!privateRequest) return publicCors(request, response, next);
    return protectedCors(request, response, () => security.requireOwner(request, response, next));
  };
}
