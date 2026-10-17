import { Router, type NextFunction, type Request, type Response } from "express";
import type { AuthPrincipal } from "../auth/authPrincipal";
import { ownerSecurity } from "../auth/ownerAuthorization";
import { pool } from "../db";
import { validateCanonicalDryRun } from "../code3/dryRun";
import { PostgresCanonicalRepository } from "../code3/postgresRepository";
import { createOwnerRateLimit } from "../code3/rateLimit";
import {
  CanonicalDuplicateError,
  CanonicalNotFoundError,
  CanonicalVersionConflictError,
  type CanonicalRepository,
} from "../code3/repository";
import { CanonicalService } from "../code3/service";
import { exportCanonicalOwnerRecords, MAX_EXPORT_RECORDS_PER_DOMAIN } from "../code3/serverExport";
import { ownerContextFromPrincipal, type CanonicalDomain } from "../code3/types";
import { Code3ValidationError } from "../code3/validation";

type OwnerMiddleware = typeof ownerSecurity.requireOwner;
type RuntimeEnvironment = Record<string, string | undefined>;

type Code3RouterOptions = {
  requireOwner?: OwnerMiddleware;
  repository?: CanonicalRepository;
  env?: RuntimeEnvironment;
  persistenceAvailable?: () => boolean;
  now?: () => Date;
  maximumRequests?: number;
};

export const CODE3_CANONICAL_PERSISTENCE_ENV = "CODE3_CANONICAL_PERSISTENCE_ENABLED";

export const CODE3_RESOURCE_ROUTES: ReadonlyArray<Readonly<{ path: string; domain: CanonicalDomain }>> = Object.freeze([
  { path: "/deals/snapshots", domain: "DEAL_SNAPSHOT" },
  { path: "/deals/analyses", domain: "DEAL_ANALYSIS" },
  { path: "/deals", domain: "DEAL" },
  { path: "/search-rules", domain: "SEARCH_RULE" },
  { path: "/auctions/events", domain: "AUCTION_EVENT" },
  { path: "/auctions/lots", domain: "AUCTION_LOT" },
  { path: "/auctions/bid-plans", domain: "BID_PLAN" },
  { path: "/restocks/stores", domain: "RESTOCK_STORE_PROFILE" },
  { path: "/restocks/events", domain: "RESTOCK_EVENT" },
  { path: "/restocks/predictions", domain: "RESTOCK_PREDICTION" },
  { path: "/restocks/visits", domain: "STORE_VISIT" },
  { path: "/restocks/observations", domain: "PRODUCT_OBSERVATION" },
  { path: "/purchases/lots", domain: "PURCHASE_LOT" },
  { path: "/purchases/allocations", domain: "COST_ALLOCATION" },
  { path: "/purchases", domain: "PURCHASE" },
  { path: "/owned-items/adjustments", domain: "INVENTORY_ADJUSTMENT" },
  { path: "/owned-items/storage-locations", domain: "STORAGE_LOCATION" },
  { path: "/owned-items", domain: "OWNED_ITEM" },
  { path: "/sales/line-items", domain: "SALE_LINE_ITEM" },
  { path: "/sales/shipments", domain: "SHIPMENT" },
  { path: "/sales/returns", domain: "RETURN" },
  { path: "/sales", domain: "SALE" },
  { path: "/expenses", domain: "EXPENSE" },
  { path: "/mileage", domain: "MILEAGE_TRIP" },
  { path: "/receipts", domain: "RECEIPT_METADATA" },
  { path: "/settings/preferences", domain: "OWNER_PREFERENCE" },
  { path: "/settings/features", domain: "FEATURE_SETTING" },
  { path: "/files/metadata", domain: "FILE_ASSET" },
]);

export function canonicalPersistenceEnabled(env: RuntimeEnvironment = process.env): boolean {
  return String(env[CODE3_CANONICAL_PERSISTENCE_ENV] || "").trim().toLowerCase() === "true"
    && Boolean(String(env.DATABASE_URL || "").trim());
}

function asyncRoute(handler: (request: Request, response: Response) => Promise<unknown>) {
  return (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(handler(request, response)).catch(next);
  };
}

function owner(response: Response) {
  const principal = response.locals.authPrincipal as AuthPrincipal | undefined;
  if (!principal) throw new Code3ValidationError({ path: "session", code: "authentication_required", message: "Sign in is required." });
  return ownerContextFromPrincipal(principal);
}

function createResourceRouter(domain: CanonicalDomain, service: CanonicalService) {
  const router = Router();
  router.get("/", asyncRoute(async (request, response) => {
    const page = await service.list(owner(response), domain, request.query as Record<string, unknown>);
    response.json({ ok: true, ...page });
  }));
  router.post("/", asyncRoute(async (request, response) => {
    const created = await service.create(owner(response), domain, request.body);
    response.status(201).json({ ok: true, record: created });
  }));
  router.get("/:id", asyncRoute(async (request, response) => {
    const found = await service.getById(owner(response), domain, request.params.id);
    response.json({ ok: true, record: found });
  }));
  const update = asyncRoute(async (request, response) => {
    const updated = await service.update(owner(response), domain, request.params.id, request.body);
    response.json({ ok: true, record: updated });
  });
  router.patch("/:id", update);
  router.put("/:id", update);
  router.post("/:id/archive", asyncRoute(async (request, response) => {
    const archived = await service.archive(owner(response), domain, request.params.id, request.body);
    response.json({ ok: true, record: archived });
  }));
  return router;
}

function sendError(response: Response, error: unknown) {
  if (error instanceof Code3ValidationError) {
    return response.status(400).json({ ok: false, error: { code: "validation_failed", message: "The request is invalid.", issues: error.issues } });
  }
  if (error instanceof CanonicalNotFoundError) {
    return response.status(404).json({ ok: false, error: { code: "record_not_found", message: error.message } });
  }
  if (error instanceof CanonicalDuplicateError) {
    return response.status(409).json({ ok: false, error: { code: "duplicate_record", message: error.message, duplicateType: error.duplicateType } });
  }
  if (error instanceof CanonicalVersionConflictError) {
    return response.status(409).json({ ok: false, error: { code: "record_version_conflict", message: error.message, conflict: error.conflict } });
  }
  if (error && typeof error === "object" && "code" in error && ["42P01", "3F000", "ECONNREFUSED"].includes(String((error as { code?: string }).code))) {
    return response.status(503).json({ ok: false, error: { code: "canonical_persistence_unavailable", message: "Canonical persistence is not available." } });
  }
  return response.status(500).json({ ok: false, error: { code: "canonical_operation_failed", message: "The canonical data operation failed." } });
}

export function createCode3Router(options: Code3RouterOptions = {}) {
  const router = Router();
  const repository = options.repository || new PostgresCanonicalRepository(pool);
  const service = new CanonicalService(repository);
  const env = options.env || process.env;
  const available = options.persistenceAvailable || (() => canonicalPersistenceEnabled(env));

  router.use(options.requireOwner || ownerSecurity.requireOwner);
  router.use(createOwnerRateLimit({ maximumRequests: options.maximumRequests }));
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    if (!available()) {
      return response.status(503).json({
        ok: false,
        error: {
          code: "canonical_persistence_not_active",
          message: "Canonical persistence is not active. Current owner records remain in local persistence.",
        },
      });
    }
    return next();
  });

  router.get("/export", asyncRoute(async (request, response) => {
    const rawMaximum = request.query.maxRecordsPerDomain;
    const maximum = rawMaximum === undefined ? MAX_EXPORT_RECORDS_PER_DOMAIN : Number(rawMaximum);
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > MAX_EXPORT_RECORDS_PER_DOMAIN) {
      throw new Code3ValidationError({ path: "maxRecordsPerDomain", code: "invalid_limit", message: `maxRecordsPerDomain must be between 1 and ${MAX_EXPORT_RECORDS_PER_DOMAIN}.` });
    }
    response.json(await exportCanonicalOwnerRecords(repository, owner(response), { maxRecordsPerDomain: maximum, now: options.now }));
  }));
  router.post("/migration/dry-run", asyncRoute(async (request, response) => {
    response.json(await validateCanonicalDryRun(repository, owner(response), request.body));
  }));

  for (const resource of CODE3_RESOURCE_ROUTES) {
    router.use(resource.path, createResourceRouter(resource.domain, service));
  }

  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => sendError(response, error));
  return router;
}

export const code3Router = createCode3Router();
