import { createHash, createPublicKey, verify } from "node:crypto";
import { pool } from "../db";
import { getEbayApplicationToken, invalidateEbayToken, readEbayConfig } from "../services/ebayBrowse.service";

export const EBAY_DELETION_PATH = "/api/ebay/account-deletion";
export class EbayDeletionError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}
type Environment = Record<string, string | undefined>;
export type DeletionNotice = { id: string; eventDate: string; subjects: { kind: string; digest: string }[] };
export type DeletionStore = {
  process(notice: DeletionNotice): Promise<void>;
  sanitize(data: unknown): Promise<unknown>;
};
export const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export function deletionConfig(env: Environment = process.env) {
  const token = env.EBAY_DELETION_VERIFICATION_TOKEN || "";
  const endpoint = env.EBAY_DELETION_ENDPOINT_URL || "";
  let valid = false;
  try {
    const url = new URL(endpoint);
    valid = url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === EBAY_DELETION_PATH && !url.hostname.includes("localhost")
      && !/^[\d.]+$|:/.test(url.hostname) && endpoint === url.href;
  } catch { /* Missing/invalid configuration fails closed. */ }
  if (!/^[A-Za-z0-9_-]{32,80}$/.test(token) || !valid) throw new EbayDeletionError("ebay_deletion_unconfigured", 503);
  return { token, endpoint };
}

export function parseDeletionNotice(payload: unknown): DeletionNotice {
  const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const body = record(payload);
  const metadata = record(body.metadata);
  const notice = record(body.notification);
  if (metadata.topic !== "MARKETPLACE_ACCOUNT_DELETION" || metadata.schemaVersion !== "1.0"
    || !notice || typeof notice.notificationId !== "string" || !notice.notificationId || notice.notificationId.length > 256
    || typeof notice.eventDate !== "string" || !Number.isFinite(Date.parse(notice.eventDate))) {
    throw new EbayDeletionError("ebay_deletion_invalid_notice", 400);
  }
  const subjects: DeletionNotice["subjects"] = [];
  for (const kind of ["username", "userId", "eiasToken"]) {
    const value = record(notice.data)[kind];
    if (value == null || value === "") continue;
    if (typeof value !== "string" || value.length > 4096 || !value.trim()) throw new EbayDeletionError("ebay_deletion_invalid_notice", 400);
    // Only public usernames are case insensitive. Immutable IDs and EIAS tokens are opaque.
    const normalized = kind === "username" ? value.trim().toLowerCase() : value;
    subjects.push({ kind, digest: sha256(`${kind}:${normalized}`) });
  }
  if (!subjects.length) throw new EbayDeletionError("ebay_deletion_invalid_notice", 400);
  return { id: sha256(notice.notificationId), eventDate: notice.eventDate, subjects };
}

function decodeBase64(value: unknown, maximum: number): Buffer {
  if (typeof value !== "string" || !value || value.length > maximum || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
    || value.length % 4 === 1) throw new EbayDeletionError("ebay_deletion_invalid_signature", 412);
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64").replace(/=+$/, "") !== value.replace(/=+$/, "")) throw new EbayDeletionError("ebay_deletion_invalid_signature", 412);
  return bytes;
}

export function createNotificationVerifier(options: {
  env?: Environment;
  fetch?: typeof fetch;
  token?: () => Promise<string>;
  now?: () => number;
} = {}) {
  const cache = new Map<string, { key: ReturnType<typeof createPublicKey>; expires: number }>();
  const pending = new Map<string, Promise<ReturnType<typeof createPublicKey>>>();
  const now = options.now || Date.now;
  return async (raw: Buffer, header: string | undefined, payload: unknown) => {
    let signature: Record<string, unknown>;
    try { signature = JSON.parse(decodeBase64(header, 8192).toString("utf8")); }
    catch { throw new EbayDeletionError("ebay_deletion_invalid_signature", 412); }
    if (!signature || signature.alg !== "ecdsa" || signature.digest !== "SHA1" || typeof signature.kid !== "string"
      || !/^[A-Za-z0-9_-]{1,256}$/.test(signature.kid)) throw new EbayDeletionError("ebay_deletion_invalid_signature", 412);
    const signatureBytes = decodeBase64(signature.signature, 2048);
    const config = readEbayConfig(options.env).config;
    const cacheId = `${config.environment}:${signature.kid}`;
    let key = cache.get(cacheId);
    if (!key || key.expires <= now()) {
      if (!pending.has(cacheId)) pending.set(cacheId, (async () => {
        const host = config.environment === "sandbox" ? "https://api.sandbox.ebay.com" : "https://api.ebay.com";
        const getToken = async () => options.token ? options.token() : (await getEbayApplicationToken(config)).accessToken;
        const request = async () => (options.fetch || fetch)(`${host}/commerce/notification/v1/public_key/${encodeURIComponent(signature.kid as string)}`, {
          headers: { Authorization: `Bearer ${await getToken()}`, Accept: "application/json" },
          signal: AbortSignal.timeout(5000), redirect: "error",
        });
        let response = await request();
        if (response.status === 401) { invalidateEbayToken(config); response = await request(); }
        if (!response.ok) throw new EbayDeletionError("ebay_deletion_key_unavailable", 503);
        const data = await response.json() as Record<string, unknown>;
        if (data.algorithm !== "ECDSA" || data.digest !== "SHA1" || typeof data.key !== "string" || data.key.length > 8192) {
          throw new EbayDeletionError("ebay_deletion_key_unavailable", 503);
        }
        const encodedKey = data.key.replace("-----BEGIN PUBLIC KEY-----", "").replace("-----END PUBLIC KEY-----", "").replace(/\s/g, "");
        const publicKey = createPublicKey({ key: decodeBase64(encodedKey, 8192), format: "der", type: "spki" });
        if (publicKey.asymmetricKeyType !== "ec") throw new EbayDeletionError("ebay_deletion_key_unavailable", 503);
        if (cache.size >= 100) cache.delete(cache.keys().next().value!);
        cache.set(cacheId, { key: publicKey, expires: now() + 3_600_000 });
        return publicKey;
      })());
      try { key = { key: await pending.get(cacheId)!, expires: now() + 3_600_000 }; }
      finally { pending.delete(cacheId); }
    }
    // eBay's Node SDK signs JSON.stringify(message); also accept exact wire bytes.
    const valid = verify("sha1", raw, key.key, signatureBytes)
      || verify("sha1", Buffer.from(JSON.stringify(payload), "utf8"), key.key, signatureBytes);
    if (!valid) throw new EbayDeletionError("ebay_deletion_invalid_signature", 412);
  };
}

// A single database transaction commits redaction, suppression and the receipt.
// No success is sent before commit; transient failures stay retryable by eBay.
export function createPostgresDeletionStore(env: Environment = process.env, dependencies: { fetch?: typeof fetch } = {}): DeletionStore {
  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
  function configured() {
    if (env.EBAY_DELETION_ENABLED !== "true" || (!env.DATABASE_URL && (!supabaseUrl.startsWith("https://") || !serviceKey))) throw new EbayDeletionError("ebay_deletion_unconfigured", 503);
  }
  async function rpc(name: string, args: Record<string, unknown>) {
    const response = await (dependencies.fetch || fetch)(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(args), signal: AbortSignal.timeout(15_000), redirect: "error",
    });
    if (!response.ok) throw new EbayDeletionError("ebay_deletion_store_unavailable", 503);
    return response.status === 204 ? null : response.json();
  }
  return {
    async process(notice) {
      configured();
      if (!env.DATABASE_URL) {
        await rpc("code3_process_ebay_deletion_notice", { p_notification_digest: notice.id, p_event_at: notice.eventDate, p_subjects: notice.subjects });
        return;
      }
      await pool.query({ text: "select code3_ebay_private.process_notice($1,$2,$3::jsonb)",
        values: [notice.id, notice.eventDate, JSON.stringify(notice.subjects)] });
    },
    async sanitize(data) {
      configured();
      if (!env.DATABASE_URL) return rpc("code3_sanitize_ebay_data", { p_data: data });
      const result = await pool.query({ text: "select code3_ebay_private.sanitize($1::jsonb) as data", values: [JSON.stringify(data)] });
      return result.rows[0].data;
    },
  };
}
