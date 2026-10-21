import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";
import { createEbayDeletionProtocol, type VerifiedDeletionNotification } from "./protocol.ts";

export const PROJECT_URL = "https://gxsfququorfczvhrkudl.supabase.co";
export const NOTIFICATION_ENDPOINT = `${PROJECT_URL}/functions/v1/ebay-account-deletion`;
const FUNCTION_PATH = "/functions/v1/ebay-account-deletion";
const MAX_BODY_BYTES = 65536;
const REQUEST_TIMEOUT_MS = 3000;
const TRANSPORT_TIMEOUT_MS = 2500;

type Environment = Readonly<Record<string, string | undefined>>;
type JsonObject = Record<string, unknown>;
type Transport = (url: string, init: RequestInit) => Promise<Response>;
export type HandlerOptions = Readonly<{ env: Environment; fetchImpl: Transport; now?: () => number }>;

class Unavailable extends Error {}
class BodyLimit extends Error {}

function object(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function json(status: number, body: JsonObject, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", ...extraHeaders,
  } });
}

function secret(value: unknown, maximum = 16384): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && !/[\s,]/.test(value);
}

function serviceAuthorized(request: Request, serviceKey: string | undefined): boolean {
  if (!secret(serviceKey)) return false;
  const bearer = request.headers.get("authorization")?.match(/^Bearer ([^\s,]+)$/i)?.[1];
  if (!secret(bearer)) return false;
  return timingSafeEqual(createHash("sha256").update(bearer).digest(), createHash("sha256").update(serviceKey).digest());
}

async function bytesBounded(body: ReadableStream<Uint8Array> | null, maximum: number, signal?: AbortSignal): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let count = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw new Unavailable();
      const next = await reader.read();
      if (signal?.aborted) throw new Unavailable();
      if (next.done) break;
      count += next.value.byteLength;
      if (count > maximum) { await reader.cancel(); throw new BodyLimit(); }
      chunks.push(next.value);
    }
    return Buffer.concat(chunks);
  } finally { signal?.removeEventListener("abort", abort); reader.releaseLock(); }
}

async function boundedOperation<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent?.addEventListener("abort", abort, { once: true });
  if (parent?.aborted) controller.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => { if (controller.signal.aborted) throw new Unavailable(); return operation(controller.signal); }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Unavailable()); }, timeoutMs);
        controller.signal.addEventListener("abort", () => reject(new Unavailable()), { once: true });
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); parent?.removeEventListener("abort", abort); }
}

function eventId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
}

export function createEbayNotificationHandler(options: HandlerOptions): (request: Request) => Promise<Response> {
  const { env, fetchImpl } = options;
  const now = options.now || Date.now;
  const serverConfigured = env.SUPABASE_URL === PROJECT_URL && secret(env.SUPABASE_SERVICE_ROLE_KEY);
  const ebayConfigured = secret(env.EBAY_CLIENT_ID, 512) && secret(env.EBAY_CLIENT_SECRET, 1024);
  let applicationToken: { value: string; expiresAt: number } | undefined;
  let tokenRequest: Promise<string> | undefined;

  async function transportJson(url: string, init: RequestInit, signal?: AbortSignal, responseLimit = 16384): Promise<unknown> {
    return boundedOperation(async (boundedSignal) => {
      const response = await fetchImpl(url, { ...init, signal: boundedSignal, redirect: "error" });
      if (!response.ok || !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get("content-type") || "")) {
        await response.body?.cancel(); throw new Unavailable();
      }
      const bytes = await bytesBounded(response.body, responseLimit, boundedSignal);
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    }, TRANSPORT_TIMEOUT_MS, signal);
  }

  async function rpc(name: string, arguments_: JsonObject, signal?: AbortSignal): Promise<unknown> {
    if (!serverConfigured) throw new Unavailable();
    return transportJson(`${PROJECT_URL}/rest/v1/rpc/${name}`, {
      method: "POST", headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY!}`,
        "Content-Type": "application/json", Accept: "application/json",
      }, body: JSON.stringify(arguments_),
    }, signal, name === "code3_ebay_notification_status" ? 65536 : 16384);
  }

  async function token(signal: AbortSignal): Promise<string> {
    if (applicationToken && applicationToken.expiresAt > now() + 60000) return applicationToken.value;
    if (tokenRequest) return tokenRequest;
    const pending = (async () => {
      const result = await transportJson("https://api.ebay.com/identity/v1/oauth2/token", {
        method: "POST", headers: {
          Authorization: `Basic ${Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json",
        }, body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }).toString(),
      }, signal);
      if (!object(result) || !secret(result.access_token) || typeof result.expires_in !== "number"
        || result.expires_in < 60 || result.expires_in > 86400) throw new Unavailable();
      applicationToken = { value: result.access_token, expiresAt: now() + result.expires_in * 1000 };
      return result.access_token;
    })();
    tokenRequest = pending;
    try { return await pending; } finally { tokenRequest = undefined; }
  }

  function payload(event: VerifiedDeletionNotification): JsonObject {
    return { metadata: { topic: event.topic, schemaVersion: event.schemaVersion, deprecated: false }, notification: {
      notificationId: event.notificationId, eventDate: event.eventDate, publishDate: event.publishDate,
      publishAttemptCount: event.publishAttemptCount, data: event.data,
    } };
  }

  async function process(event: string, signal?: AbortSignal): Promise<string> {
    const result = await rpc("code3_ebay_process_notification", { p_event_id: event }, signal);
    if (!object(result) || result.event_id !== event || !["processed", "already_processed", "needs_review"].includes(String(result.status))) throw new Unavailable();
    return String(result.status);
  }

  let protocol: ReturnType<typeof createEbayDeletionProtocol> | undefined;
  try {
    if (!serverConfigured) throw new Unavailable();
    protocol = createEbayDeletionProtocol({ endpoint: NOTIFICATION_ENDPOINT,
      verificationToken: env.EBAY_DELETION_VERIFICATION_TOKEN || "", environment: "production", timeoutMs: REQUEST_TIMEOUT_MS,
    }, serverConfigured && ebayConfigured ? {
      now, getApplicationToken: token, fetchPublicKey: fetchImpl,
      acceptVerifiedNotification: async (event, signal) => {
        const receipt = await rpc("code3_ebay_accept_notification", { p_event_id: event.notificationId,
          p_payload: payload(event), p_payload_sha256: event.payloadSha256 }, signal);
        if (!object(receipt) || receipt.event_id !== event.notificationId || receipt.durableReceipt !== true
          || !["accepted", "duplicate"].includes(String(receipt.status))) throw new Unavailable();
        // An attempted processor failure returns503 even though the durable inbox preserves the work.
        // needs_review is a durable review state, never a claim that no data existed or deletion finished.
        await process(event.notificationId, signal);
        return { status: receipt.status === "duplicate" ? "already_accepted" : "durably_accepted", receiptId: event.notificationId };
      },
    } : {});
  } catch { /* Missing/invalid secrets fail closed. GET cannot accidentally echo configuration. */ }

  return async function handler(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const pathname = url.pathname.startsWith(FUNCTION_PATH) ? url.pathname.slice(FUNCTION_PATH.length)
        : url.pathname.startsWith("/ebay-account-deletion") ? url.pathname.slice("/ebay-account-deletion".length) : "invalid";
      if (pathname === "/status" || pathname === "/retry") {
        if (!serviceAuthorized(request, env.SUPABASE_SERVICE_ROLE_KEY)) return json(401, { code: "unauthorized" });
        if (!serverConfigured) return json(503, { code: "service_unavailable" });
        if (pathname === "/status" && request.method === "GET") {
          const ids = url.searchParams.getAll("event_id");
          if (ids.length > 1 || (ids.length && !eventId(ids[0])) || [...url.searchParams.keys()].some(key => key !== "event_id")) return json(400, { code: "invalid_request" });
          const result = await rpc("code3_ebay_notification_status", { p_event_id: ids[0] || null });
          if (!object(result) || !Array.isArray(result.events) || result.events.length > 100) return json(503, { code: "service_unavailable" });
          // Explicit allowlist: event identities, payloads, user IDs and provider credentials are never returned.
          const safe: JsonObject = { code: "notification_status", transportConfigured: Boolean(ebayConfigured), challengeConfigured: Boolean(protocol), total: result.events.length, pending: 0, processed: 0, needs_review: 0, failed: 0 };
          for (const entry of result.events) {
            if (!object(entry) || !["pending", "processed", "needs_review", "failed"].includes(String(entry.state))) return json(503, { code: "service_unavailable" });
            safe[String(entry.state)] = Number(safe[String(entry.state)]) + 1;
            for (const key of ["workspace_rows", "history_rows", "canonical_rows", "matched_records"]) {
              const value = entry[key];
              if (value !== undefined) {
                if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return json(503, { code: "service_unavailable" });
                const sum = Number(safe[key] || 0) + value;
                if (!Number.isSafeInteger(sum)) return json(503, { code: "service_unavailable" });
                safe[key] = sum;
              }
            }
          }
          if (ids.length) safe.state = result.events.length ? result.events[0].state : "not_found";
          return json(200, safe);
        }
        if (pathname === "/retry" && request.method === "POST" && url.search === "") {
          const bytes = await boundedOperation(signal => bytesBounded(request.body, 1024, signal), REQUEST_TIMEOUT_MS);
          let input: unknown;
          try { input = bytes.length ? JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) : {}; } catch { return json(400, { code: "invalid_request" }); }
          if (!object(input) || Object.keys(input).some(key => key !== "limit")
            || (input.limit !== undefined && (!Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 25))) return json(400, { code: "invalid_request" });
          const result = await rpc("code3_ebay_retry_notifications", { p_limit: input.limit ?? 25 });
          if (!object(result) || !Array.isArray(result.results) || result.results.length > Number(input.limit ?? 25)) return json(503, { code: "service_unavailable" });
          const safe: JsonObject = { code: "retry_attempted", attempted: result.results.length, processed: 0, needs_review: 0, failed: 0 };
          for (const entry of result.results) {
            if (!object(entry) || !["processed", "already_processed", "needs_review", "failed"].includes(String(entry.status))) return json(503, { code: "service_unavailable" });
            const key = entry.status === "already_processed" ? "processed" : String(entry.status);
            safe[key] = Number(safe[key]) + 1;
          }
          if (Number(safe.failed)) { safe.code = "retry_incomplete"; return json(503, safe); }
          return json(200, safe);
        }
        return json(405, { code: "method_not_allowed" }, { Allow: pathname === "/status" ? "GET" : "POST" });
      }
      if (pathname !== "") return json(404, { code: "not_found" });
      if (request.method === "GET") {
        const challenges = url.searchParams.getAll("challenge_code");
        if (challenges.length !== 1 || [...url.searchParams.keys()].some(key => key !== "challenge_code")) return json(400, { code: "invalid_challenge" });
        if (!protocol) return json(503, { code: "challenge_unavailable" });
        try { return json(200, protocol.challenge(challenges[0])); } catch { return json(400, { code: "invalid_challenge" }); }
      }
      if (request.method !== "POST") return json(405, { code: "method_not_allowed" }, { Allow: "GET, POST" });
      if (!protocol) return json(503, { code: "processing_unavailable" });
      if (url.search || request.headers.has("content-encoding")) return json(400, { code: "invalid_request" });
      const length = request.headers.get("content-length");
      if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return json(413, { code: "body_too_large" });
      const bytes = await boundedOperation(signal => bytesBounded(request.body, MAX_BODY_BYTES, signal), REQUEST_TIMEOUT_MS);
      const result = await protocol.receive({ rawBody: bytes, signatureHeader: request.headers.get("x-ebay-signature"), contentType: request.headers.get("content-type") });
      return json(result.status, { code: result.code });
    } catch (error) {
      return error instanceof BodyLimit ? json(413, { code: "body_too_large" }) : json(503, { code: "service_unavailable" });
    }
  };
}

/** Load private Vault-backed configuration using only built-in server credentials.
 * A fresh handler every30s makes owner-entered eBay keys visible without redeployment.
 */
export function createEbayNotificationRuntimeHandler(options: HandlerOptions): (request: Request) => Promise<Response> {
  const now = options.now || Date.now;
  let current: { expiresAt: number; fingerprint: string; handler: (request: Request) => Promise<Response> } | undefined;
  let pending: Promise<(request: Request) => Promise<Response>> | undefined;

  async function configuredHandler(): Promise<(request: Request) => Promise<Response>> {
    if (current && current.expiresAt > now()) return current.handler;
    if (pending) return pending;
    const lookup = boundedOperation(async (signal) => {
      if (options.env.SUPABASE_URL !== PROJECT_URL || !secret(options.env.SUPABASE_SERVICE_ROLE_KEY)) throw new Unavailable();
      const response = await options.fetchImpl(`${PROJECT_URL}/rest/v1/rpc/code3_ebay_runtime_config`, {
        method: "POST", redirect: "error", signal, headers: {
          apikey: options.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${options.env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json", Accept: "application/json",
        }, body: "{}",
      });
      if (!response.ok || !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get("content-type") || "")) { await response.body?.cancel(); throw new Unavailable(); }
      const bytes = await bytesBounded(response.body, 16384, signal);
      const config = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!object(config) || config.endpoint !== NOTIFICATION_ENDPOINT || config.environment !== "production"
        || typeof config.verificationToken !== "string" || !/^[A-Za-z0-9_-]{32,80}$/.test(config.verificationToken)
        || /\s/.test(config.verificationToken)) throw new Unavailable();
      const effectiveEnv = {
        SUPABASE_URL: options.env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: options.env.SUPABASE_SERVICE_ROLE_KEY,
        EBAY_DELETION_VERIFICATION_TOKEN: options.env.EBAY_DELETION_VERIFICATION_TOKEN || config.verificationToken,
        EBAY_CLIENT_ID: options.env.EBAY_CLIENT_ID || (typeof config.clientId === "string" ? config.clientId : undefined),
        EBAY_CLIENT_SECRET: options.env.EBAY_CLIENT_SECRET || (typeof config.clientSecret === "string" ? config.clientSecret : undefined),
      };
      // Preserve valid OAuth/key caches on unchanged configuration; replace them when keys rotate.
      // This fingerprint is server-memory-only and is never logged or returned.
      const fingerprint = createHash("sha256").update(JSON.stringify(effectiveEnv)).digest("hex");
      const handler = current?.fingerprint === fingerprint ? current.handler
        : createEbayNotificationHandler({ ...options, env: effectiveEnv });
      current = { handler, fingerprint, expiresAt: now() + 30000 };
      return handler;
    }, REQUEST_TIMEOUT_MS);
    pending = lookup;
    try { return await lookup; } finally { pending = undefined; }
  }

  return async (request: Request) => {
    const path = new URL(request.url).pathname;
    if ((path.endsWith("/status") || path.endsWith("/retry"))
      && !serviceAuthorized(request, options.env.SUPABASE_SERVICE_ROLE_KEY)) return json(401, { code: "unauthorized" });
    // Authorized durable retries must remain available even if provider credentials/configuration are unavailable.
    if (path.endsWith("/retry")) return createEbayNotificationHandler(options)(request);
    try { return await (await configuredHandler())(request); }
    catch { return json(503, { code: "service_unavailable" }); }
  };
}
