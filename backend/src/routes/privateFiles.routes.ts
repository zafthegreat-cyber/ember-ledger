import express, { Router, type NextFunction, type Request, type Response } from "express";
import type { AuthPrincipal } from "../auth/authPrincipal";
import { ownerSecurity } from "../auth/ownerAuthorization";
import { createOwnerRateLimit } from "../code3/rateLimit";
import { ownerContextFromPrincipal } from "../code3/types";
import { PRIVATE_FILE_LIMITS, PrivateFileError, fileError } from "../privateFiles/contracts";
import type { PrivateFileService } from "../privateFiles/service";

type Options = { requireOwner?: typeof ownerSecurity.requireOwner; service?: PrivateFileService; maximumRequests?: number };
const run = (handler: (request: Request, response: Response) => Promise<unknown>) => (request: Request, response: Response, next: NextFunction) => { Promise.resolve(handler(request, response)).catch(next); };
function owner(response: Response) {
  const principal = response.locals.authPrincipal as AuthPrincipal | undefined;
  if (!principal) throw fileError("owner_required", 401, "Sign in is required.");
  return ownerContextFromPrincipal(principal);
}

/** Mount with protected CORS BEFORE the application's general JSON parser.
 * A store is intentionally never inferred from environment settings or activated by a request.
 */
export function createPrivateFilesRouter(options: Options = {}) {
  const router = Router();
  router.use(options.requireOwner || ownerSecurity.requireOwner);
  router.use(createOwnerRateLimit({ maximumRequests: options.maximumRequests ?? 60 }));
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (!options.service) return next(fileError("private_files_not_active", 503, "Private attachment storage is not active. No files have been uploaded."));
    return next();
  });
  const service = () => options.service!;
  router.get("/records/:domain/:recordId", run(async (request, response) => response.json({ ok: true, files: await service().list(owner(response), request.params.domain, request.params.recordId) })));
  router.post("/records/:domain/:recordId", express.raw({ type: () => true, limit: PRIVATE_FILE_LIMITS.fileBytes, inflate: false }), run(async (request, response) => {
    if (Object.keys(request.query).some((key) => key !== "name")) throw fileError("file_request_invalid", 400, "Unsupported upload options.");
    const file = await service().upload(owner(response), { name: request.query.name, mimeType: request.get("content-type"), domain: request.params.domain, recordId: request.params.recordId, bytes: request.body });
    response.status(201).json({ ok: true, file });
  }));
  router.get("/export", run(async (_request, response) => {
    response.setHeader("Content-Disposition", "attachment; filename=code3-private-files.json");
    response.json({ ok: true, verified: true, backup: await service().export(owner(response)) });
  }));
  router.post("/restore/preview", express.json({ limit: "48mb", inflate: false }), run(async (request, response) => response.json({ ok: true, plan: await service().previewRestore(owner(response), request.body) })));
  router.post("/restore/apply", express.json({ limit: "8kb", inflate: false }), run(async (request, response) => {
    if (!request.body || Object.keys(request.body).some((key) => !["planId", "sha256", "proof"].includes(key))) throw fileError("file_request_invalid", 400, "Unsupported recovery options.");
    response.json({ ok: true, result: await service().applyRestore(owner(response), request.body.planId, request.body.sha256, request.body.proof) });
  }));
  router.post("/:id/delete", express.json({ limit: "1kb", inflate: false }), run(async (request, response) => {
    if (!request.body || Object.keys(request.body).some((key) => key !== "sha256")) throw fileError("file_request_invalid", 400, "Unsupported delete options.");
    response.json({ ok: true, result: await service().remove(owner(response), request.params.id, request.body.sha256) });
  }));
  router.get("/:id/bytes", run(async (request, response) => {
    const { file, bytes } = await service().read(owner(response), request.params.id);
    response.setHeader("Content-Type", file.mimeType);
    response.setHeader("Content-Disposition", `attachment; filename="attachment-${file.id}"; filename*=UTF-8''${encodeURIComponent(file.originalName).replace(/['()*]/g, (value) => `%${value.charCodeAt(0).toString(16)}`)}`);
    response.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    response.send(bytes);
  }));
  router.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof PrivateFileError) return response.status(error.status).json({ ok: false, error: { code: error.code, message: error.message } });
    const type = error && typeof error === "object" && "type" in error ? error.type : "";
    if (type === "entity.too.large") return response.status(413).json({ ok: false, error: { code: "file_size_invalid", message: "The uploaded file or backup is too large." } });
    if (type === "entity.parse.failed" || type === "encoding.unsupported") return response.status(400).json({ ok: false, error: { code: "file_request_invalid", message: "The file request could not be read." } });
    return response.status(503).json({ ok: false, error: { code: "private_files_unavailable", message: "The file operation could not be verified. Reload before retrying." } });
  });
  return router;
}
