import { Buffer } from "node:buffer";
import { createHash, createPublicKey, verify, type KeyObject } from "node:crypto";

/** Local protocol preparation only. No route, credentials, inbox or deletion worker is installed here. */
export type EbayNotificationConfiguration = Readonly<{
  endpoint: string;
  verificationToken: string;
  environment: "production" | "sandbox";
  timeoutMs?: number;
}>;

export type VerifiedDeletionNotification = Readonly<{
  topic: "MARKETPLACE_ACCOUNT_DELETION";
  schemaVersion: "1.0";
  notificationId: string;
  eventDate: string;
  publishDate: string;
  publishAttemptCount: number;
  data: Readonly<{ userId: string; username?: string; eiasToken?: string }>;
  payloadSha256: string;
}>;

export type DurableAcceptance = Readonly<{
  status: "durably_accepted" | "already_accepted";
  receiptId: string;
}>;

export type EbayNotificationDependencies = Readonly<{
  // Intentionally no global fetch fallback: callers must explicitly supply server-only transports.
  fetchPublicKey?: (url: string, init: RequestInit) => Promise<Response>;
  getApplicationToken?: (signal: AbortSignal) => Promise<string>;
  // Must atomically persist an idempotent work item before resolving. Acceptance is NOT completed deletion.
  acceptVerifiedNotification?: (
    notification: VerifiedDeletionNotification,
    signal: AbortSignal,
  ) => Promise<DurableAcceptance>;
  now?: () => number;
}>;

export type ProtocolResponse = Readonly<{ status: number; code: string }>;

const MAX_BODY_BYTES = 64 * 1024;
const MAX_SIGNATURE_HEADER_BYTES = 4096;
const MAX_PUBLIC_KEY_RESPONSE_BYTES = 16 * 1024;
const MAX_KEY_CACHE_ENTRIES = 32;
const MAX_CONCURRENT_KEY_LOOKUPS = 8;
const KEY_TTL_MS = 60 * 60 * 1000;
// The current official Notification overview and Node SDK specify ECDSA/SHA1.
// SHA256 is used for the GET challenge. Other POST algorithms fail closed until separately verified.
const SIGNATURE_ALGORITHM = "ECDSA";
const SIGNATURE_DIGEST = "SHA1";

class InvalidSignature extends Error {}
class UpstreamUnavailable extends Error {}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function supportedLabel(value: unknown, expected: string): boolean {
  return typeof value === "string" && value.toUpperCase() === expected;
}

function checkedConfiguration(configuration: EbayNotificationConfiguration) {
  const invalid = () => new Error("eBay notification configuration is invalid.");
  if (!configuration || typeof configuration.endpoint !== "string"
    || configuration.endpoint !== configuration.endpoint.trim()
    || !boundedString(configuration.verificationToken, 80)
    || !/^[A-Za-z0-9_-]{32,80}$/.test(configuration.verificationToken)
    || !["production", "sandbox"].includes(configuration.environment)) throw invalid();
  let endpoint: URL;
  try { endpoint = new URL(configuration.endpoint); } catch { throw invalid(); }
  const hostname = endpoint.hostname.toLowerCase();
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
    || (endpoint.port && endpoint.port !== "443") || !hostname.includes(".")
    || !/^[a-z0-9.-]+$/.test(hostname) || /^\d+(?:\.\d+)*$/.test(hostname)
    || /(?:^|\.)(?:localhost|local|internal|test)$/.test(hostname)) throw invalid();
  const timeoutMs = configuration.timeoutMs ?? 3000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 5000) throw invalid();
  return Object.freeze({ ...configuration, timeoutMs });
}

function strictBase64(value: unknown, maximumBytes: number): Buffer {
  if (typeof value !== "string" || value.length === 0 || value.length > Math.ceil(maximumBytes / 3) * 4
    || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new InvalidSignature();
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > maximumBytes || bytes.toString("base64") !== value) throw new InvalidSignature();
  return bytes;
}

function jsonBytes(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function deadline<T>(timeoutMs: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new UpstreamUnavailable()); }, timeoutMs);
      }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

async function boundedResponseJson(response: Response): Promise<unknown> {
  if (response.status !== 200 || !/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get("content-type") || "")) {
    await response.body?.cancel();
    throw new UpstreamUnavailable();
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_PUBLIC_KEY_RESPONSE_BYTES)) {
    await response.body?.cancel();
    throw new UpstreamUnavailable();
  }
  if (!response.body) throw new UpstreamUnavailable();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_PUBLIC_KEY_RESPONSE_BYTES) {
        await reader.cancel();
        throw new UpstreamUnavailable();
      }
      chunks.push(chunk.value);
    }
    return jsonBytes(Buffer.concat(chunks));
  } finally { reader.releaseLock(); }
}

function deletionPayload(bytes: Buffer): VerifiedDeletionNotification {
  const payload = jsonBytes(bytes);
  if (!record(payload) || !record(payload.metadata) || !record(payload.notification)) throw new Error();
  const { metadata, notification } = payload;
  const data = notification.data;
  const timestamp = (value: unknown): value is string => boundedString(value, 64)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
  if (metadata.topic !== "MARKETPLACE_ACCOUNT_DELETION" || metadata.schemaVersion !== "1.0"
    || metadata.deprecated !== false || !boundedString(notification.notificationId, 200)
    || !timestamp(notification.eventDate) || !timestamp(notification.publishDate)
    || !Number.isSafeInteger(notification.publishAttemptCount) || Number(notification.publishAttemptCount) < 1
    || !record(data) || !boundedString(data.userId, 1024)
    || (data.username !== undefined && !boundedString(data.username, 1024))
    || (data.eiasToken !== undefined && !boundedString(data.eiasToken, 2048))) throw new Error();
  return Object.freeze({
    topic: "MARKETPLACE_ACCOUNT_DELETION",
    schemaVersion: "1.0",
    notificationId: notification.notificationId,
    eventDate: notification.eventDate,
    publishDate: notification.publishDate,
    publishAttemptCount: Number(notification.publishAttemptCount),
    data: Object.freeze({
      userId: data.userId,
      ...(typeof data.username === "string" ? { username: data.username } : {}),
      ...(typeof data.eiasToken === "string" ? { eiasToken: data.eiasToken } : {}),
    }),
    payloadSha256: createHash("sha256").update(bytes).digest("hex"),
  });
}

export function createEbayDeletionProtocol(
  configuration: EbayNotificationConfiguration,
  dependencies: EbayNotificationDependencies = {},
) {
  const config = checkedConfiguration(configuration);
  const now = dependencies.now || Date.now;
  const cache = new Map<string, { key: KeyObject; expiresAt: number }>();
  const lookups = new Map<string, Promise<KeyObject>>();

  async function publicKey(kid: string): Promise<KeyObject> {
    const entry = cache.get(kid);
    if (entry && entry.expiresAt > now()) return entry.key;
    cache.delete(kid);
    const pending = lookups.get(kid);
    if (pending) return pending;
    if (lookups.size >= MAX_CONCURRENT_KEY_LOOKUPS) throw new UpstreamUnavailable();
    const lookup = deadline(config.timeoutMs, async (signal) => {
      const token = await dependencies.getApplicationToken!(signal);
      if (!boundedString(token, 16 * 1024) || /\s/.test(token)) throw new UpstreamUnavailable();
      const origin = config.environment === "production" ? "https://api.ebay.com" : "https://api.sandbox.ebay.com";
      const response = await dependencies.fetchPublicKey!(
        `${origin}/commerce/notification/v1/public_key/${encodeURIComponent(kid)}`,
        { method: "GET", redirect: "error", signal, headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
      );
      const body = await boundedResponseJson(response);
      if (!record(body) || !supportedLabel(body.algorithm, SIGNATURE_ALGORITHM) || !supportedLabel(body.digest, SIGNATURE_DIGEST)
        || typeof body.key !== "string" || body.key.length > 12 * 1024
        || !body.key.startsWith("-----BEGIN PUBLIC KEY-----") || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.key)) {
        throw new UpstreamUnavailable();
      }
      // eBay's SDK also normalizes single-line PEM wrappers returned by the key API.
      const pem = body.key.replace(/^-----BEGIN PUBLIC KEY-----\s*/, "-----BEGIN PUBLIC KEY-----\n")
        .replace(/\s*-----END PUBLIC KEY-----\s*$/, "\n-----END PUBLIC KEY-----\n");
      const key = createPublicKey(pem);
      if (key.asymmetricKeyType !== "ec"
        || !["prime256v1", "secp384r1", "secp521r1"].includes(key.asymmetricKeyDetails?.namedCurve || "")) {
        throw new UpstreamUnavailable();
      }
      return key;
    });
    lookups.set(kid, lookup);
    try {
      const key = await lookup;
      if (cache.size >= MAX_KEY_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
      cache.set(kid, { key, expiresAt: now() + KEY_TTL_MS });
      return key;
    } finally { lookups.delete(kid); }
  }

  function challenge(challengeCode: unknown): Readonly<{ challengeResponse: string }> {
    // Arrays/objects from duplicate query parameters must not be coerced into a challenge.
    if (!boundedString(challengeCode, 1024)) throw new Error("eBay challenge is invalid.");
    return Object.freeze({ challengeResponse: createHash("sha256")
      .update(challengeCode, "utf8").update(config.verificationToken, "utf8").update(config.endpoint, "utf8").digest("hex") });
  }

  async function receive(input: Readonly<{
    rawBody: Buffer;
    signatureHeader: unknown;
    contentType: unknown;
  }>): Promise<ProtocolResponse> {
    if (!Buffer.isBuffer(input?.rawBody) || input.rawBody.length === 0) return { status: 400, code: "invalid_body" };
    if (input.rawBody.length > MAX_BODY_BYTES) return { status: 413, code: "body_too_large" };
    if (typeof input.contentType !== "string"
      || !/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?\s*$/i.test(input.contentType)) {
      return { status: 415, code: "unsupported_content_type" };
    }
    if (!dependencies.getApplicationToken || !dependencies.fetchPublicKey || !dependencies.acceptVerifiedNotification) {
      return { status: 503, code: "processing_unavailable" };
    }
    // Copy before any awaits so a caller cannot mutate the buffer between verification and parsing.
    const bytes = Buffer.from(input.rawBody);
    let kid: string;
    let signature: Buffer;
    try {
      if (typeof input.signatureHeader !== "string" || input.signatureHeader.length > MAX_SIGNATURE_HEADER_BYTES) throw new InvalidSignature();
      const header = jsonBytes(strictBase64(input.signatureHeader, MAX_SIGNATURE_HEADER_BYTES));
      if (!record(header) || !supportedLabel(header.alg, SIGNATURE_ALGORITHM) || !supportedLabel(header.digest, SIGNATURE_DIGEST)
        || !boundedString(header.kid, 200) || !/^[A-Za-z0-9_-]{1,200}$/.test(header.kid)) throw new InvalidSignature();
      kid = header.kid;
      signature = strictBase64(header.signature, 160);
    } catch { return { status: 412, code: "invalid_signature" }; }
    let key: KeyObject;
    try { key = await publicKey(kid); } catch { return { status: 503, code: "verification_unavailable" }; }
    try {
      if (!verify("sha1", bytes, key, signature)) return { status: 412, code: "invalid_signature" };
    } catch { return { status: 412, code: "invalid_signature" }; }
    let notification: VerifiedDeletionNotification;
    try { notification = deletionPayload(bytes); } catch { return { status: 400, code: "invalid_notification" }; }
    try {
      const receipt = await deadline(config.timeoutMs, (signal) => dependencies.acceptVerifiedNotification!(notification, signal));
      if (!receipt || !["durably_accepted", "already_accepted"].includes(receipt.status) || !boundedString(receipt.receiptId, 200)) {
        return { status: 503, code: "processing_unavailable" };
      }
      return { status: 202, code: "accepted_for_processing" };
    } catch { return { status: 503, code: "processing_unavailable" }; }
  }

  return Object.freeze({ challenge, receive });
}
