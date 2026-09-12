import { createHash, randomBytes as nodeRandomBytes, timingSafeEqual } from "crypto";
import { detectRuntimeKind, type RuntimeKind } from "../auth/runtimeEnvironment";
import type { MailboxProviderId, ProviderOwnerContext } from "./contracts";
import { ownerContextKey } from "./contracts";
import { ProviderRuntimeError } from "./errors";

const DEFAULT_TTL_MS = 10 * 60 * 1_000;
const MINIMUM_STATE_BYTES = 32;
const MAXIMUM_REDIRECT_LENGTH = 2_000;
const MAXIMUM_ALLOWED_REDIRECTS = 20;
const MAXIMUM_ACTIVE_TEST_STATES = 1_000;
const PROVIDER_IDS = new Set<MailboxProviderId>(["gmail", "microsoft-outlook"]);

export type OAuthStateIssueInput = Readonly<{
  provider: MailboxProviderId;
  owner: ProviderOwnerContext;
  redirectUri: string;
}>;

export type OAuthStateIssueResult = Readonly<{
  state: string;
  expiresAt: string;
}>;

export type OAuthStateConsumeInput = OAuthStateIssueInput & Readonly<{ state: string }>;

export type OAuthStateConsumption = Readonly<{
  provider: MailboxProviderId;
  owner: ProviderOwnerContext;
  redirectUri: string;
  issuedAt: string;
  expiresAt: string;
  consumedAt: string;
}>;

export interface OAuthStateStore {
  readonly kind: "UNAVAILABLE" | "AUTOMATED_TEST_MEMORY" | "DURABLE_SINGLE_USE";
  readonly available: boolean;
  healthCheck(): Promise<void>;
  verifyReadiness(owner: ProviderOwnerContext): Promise<void>;
  issue(input: OAuthStateIssueInput): Promise<OAuthStateIssueResult>;
  consume(input: OAuthStateConsumeInput): Promise<OAuthStateConsumption>;
}

function unavailable(): never {
  throw new ProviderRuntimeError(
    "provider_runtime_unavailable",
    "Durable single-use OAuth state storage is not configured.",
    503,
  );
}

export function createUnavailableOAuthStateStore(): OAuthStateStore {
  return Object.freeze({
    kind: "UNAVAILABLE" as const,
    available: false,
    healthCheck: async () => unavailable(),
    verifyReadiness: async () => unavailable(),
    issue: async () => unavailable(),
    consume: async () => unavailable(),
  });
}

type StateRecord = {
  stateHash: string;
  provider: MailboxProviderId;
  ownerKey: string;
  owner: ProviderOwnerContext;
  redirectUri: string;
  issuedAt: number;
  expiresAt: number;
  consumedAt: number | null;
};

type TestStateStoreOptions = {
  runtimeKind?: RuntimeKind;
  now?: () => number;
  ttlMs?: number;
  randomBytes?: (size: number) => Buffer;
  allowedRedirectUris: readonly string[];
};

function stateHash(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

function safeHashEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function normalizeRedirect(value: string, allowed: Set<string>): string {
  const candidate = String(value || "").trim();
  if (!candidate || candidate.length > MAXIMUM_REDIRECT_LENGTH || !allowed.has(candidate)) {
    throw new ProviderRuntimeError("oauth_state_redirect_mismatch", "The OAuth redirect is not allowed.", 400);
  }
  return candidate;
}

function validatedAllowedRedirect(value: string): string {
  const candidate = String(value || "").trim();
  if (!candidate || candidate.length > MAXIMUM_REDIRECT_LENGTH) {
    throw new ProviderRuntimeError("invalid_provider_request", "An allowed OAuth redirect is invalid.", 400);
  }
  try {
    const parsed = new URL(candidate);
    const loopbackHttp = parsed.protocol === "http:"
      && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]");
    if ((!loopbackHttp && parsed.protocol !== "https:") || parsed.username || parsed.password || parsed.hash) throw new Error("unsafe redirect");
    return candidate;
  } catch {
    throw new ProviderRuntimeError("invalid_provider_request", "An allowed OAuth redirect is invalid.", 400);
  }
}

/** Atomic only inside one automated-test process. It is intentionally unavailable to Preview/Production. */
export function createAutomatedTestMemoryOAuthStateStore(options: TestStateStoreOptions): OAuthStateStore {
  const actualRuntimeKind = detectRuntimeKind(process.env);
  const runtimeKind = options.runtimeKind || actualRuntimeKind;
  if (runtimeKind !== "automated-test" || actualRuntimeKind !== "automated-test") {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "The memory OAuth state store is available only to automated tests.", 503);
  }
  const now = options.now || Date.now;
  const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 15 * 60 * 1_000) {
    throw new ProviderRuntimeError("invalid_provider_request", "OAuth state expiry must be between one and fifteen minutes.", 400);
  }
  const randomBytes = options.randomBytes || nodeRandomBytes;
  if (!Array.isArray(options.allowedRedirectUris) || options.allowedRedirectUris.length < 1 || options.allowedRedirectUris.length > MAXIMUM_ALLOWED_REDIRECTS) {
    throw new ProviderRuntimeError("invalid_provider_request", "OAuth requires a bounded redirect allowlist.", 400);
  }
  const allowedRedirects = new Set(options.allowedRedirectUris.map(validatedAllowedRedirect));
  const records = new Map<string, StateRecord>();

  return Object.freeze({
    kind: "AUTOMATED_TEST_MEMORY" as const,
    available: true,
    healthCheck: async () => undefined,
    verifyReadiness: async () => undefined,
    async issue(input: OAuthStateIssueInput) {
      if (!PROVIDER_IDS.has(input.provider)) {
        throw new ProviderRuntimeError("invalid_provider_request", "The mailbox provider is unsupported.", 400);
      }
      const redirectUri = normalizeRedirect(input.redirectUri, allowedRedirects);
      const issuedAt = now();
      for (const [hash, record] of records) {
        if (record.expiresAt <= issuedAt || record.consumedAt != null) records.delete(hash);
      }
      if (records.size >= MAXIMUM_ACTIVE_TEST_STATES) {
        throw new ProviderRuntimeError("provider_runtime_unavailable", "The OAuth state store is at capacity.", 503);
      }
      const bytes = randomBytes(MINIMUM_STATE_BYTES);
      if (!Buffer.isBuffer(bytes) || bytes.length < MINIMUM_STATE_BYTES) {
        throw new ProviderRuntimeError("provider_runtime_unavailable", "A secure OAuth state could not be generated.", 503);
      }
      const state = bytes.toString("base64url");
      const hash = stateHash(state);
      if (records.has(hash)) {
        throw new ProviderRuntimeError("provider_runtime_unavailable", "A unique OAuth state could not be generated.", 503);
      }
      records.set(hash, {
        stateHash: hash,
        provider: input.provider,
        ownerKey: ownerContextKey(input.owner),
        owner: Object.freeze({ ...input.owner }),
        redirectUri,
        issuedAt,
        expiresAt: issuedAt + ttlMs,
        consumedAt: null,
      });
      return Object.freeze({ state, expiresAt: new Date(issuedAt + ttlMs).toISOString() });
    },
    async consume(input: OAuthStateConsumeInput) {
      const candidate = String(input.state || "").trim();
      if (candidate.length < 32 || candidate.length > 512) {
        throw new ProviderRuntimeError("oauth_state_invalid", "OAuth state is invalid.", 400);
      }
      const hash = stateHash(candidate);
      const record = [...records.values()].find((entry) => safeHashEquals(entry.stateHash, hash));
      if (!record) throw new ProviderRuntimeError("oauth_state_invalid", "OAuth state is invalid.", 400);
      if (record.consumedAt != null) throw new ProviderRuntimeError("oauth_state_already_used", "OAuth state has already been used.", 409);
      const consumedAt = now();
      if (record.expiresAt <= consumedAt) throw new ProviderRuntimeError("oauth_state_expired", "OAuth state has expired.", 400);
      if (record.provider !== input.provider || record.ownerKey !== ownerContextKey(input.owner)) {
        throw new ProviderRuntimeError("oauth_state_owner_mismatch", "OAuth state is not valid for this session.", 403);
      }
      const redirectUri = normalizeRedirect(input.redirectUri, allowedRedirects);
      if (record.redirectUri !== redirectUri) {
        throw new ProviderRuntimeError("oauth_state_redirect_mismatch", "OAuth state is not valid for this redirect.", 400);
      }
      record.consumedAt = consumedAt;
      return Object.freeze({
        provider: record.provider,
        owner: record.owner,
        redirectUri: record.redirectUri,
        issuedAt: new Date(record.issuedAt).toISOString(),
        expiresAt: new Date(record.expiresAt).toISOString(),
        consumedAt: new Date(consumedAt).toISOString(),
      });
    },
  });
}
