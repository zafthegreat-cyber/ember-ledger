import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes as nodeRandomBytes,
} from "crypto";
import { detectRuntimeKind, type RuntimeKind } from "../auth/runtimeEnvironment";
import type { ProviderConnectionStore } from "./connectionStore";
import { createUnavailableProviderConnectionStore } from "./connectionStore";
import type {
  MailboxProviderCapabilities,
  MailboxProviderId,
  ProviderOwnerContext,
  SafeProviderConnection,
} from "./contracts";
import { PROVIDER_CONNECTION_STATUSES, ownerContextKey } from "./contracts";
import { ProviderRuntimeError } from "./errors";
import type {
  OAuthStateConsumeInput,
  OAuthStateConsumption,
  OAuthStateIssueInput,
  OAuthStateStore,
} from "./oauthStateStore";
import { createUnavailableOAuthStateStore } from "./oauthStateStore";
import type {
  ProviderSecretMaterial,
  ProviderSecretReference,
  ProviderSecretStore,
} from "./secretStore";
import { createUnavailableProviderSecretStore } from "./secretStore";
import type { ManagedRedisClient } from "./managedRedis";
import { createUpstashManagedRedisClient, managedStoreOperation } from "./managedRedis";

const MANAGED_STORE_VERSION = "code3.provider-managed-store.v1" as const;
const DEFAULT_NAMESPACE = "code3:provider:v1:preview";
const MAXIMUM_CONNECTIONS_PER_OWNER = 200;
const MAXIMUM_ACTIVE_OAUTH_STATES_PER_OWNER = 50;
const DEFAULT_OAUTH_TTL_MS = 10 * 60 * 1_000;
const USED_STATE_TTL_MS = 15 * 60 * 1_000;
const MINIMUM_STATE_BYTES = 32;
const MAXIMUM_REDIRECT_LENGTH = 2_000;
const MAXIMUM_ALLOWED_REDIRECTS = 20;
const MAXIMUM_TOKEN_LENGTH = 16_384;
const MAXIMUM_SCOPES = 100;
const MAXIMUM_SCOPE_LENGTH = 512;
const MAXIMUM_CURSOR_ENTRIES = 100;
const MAXIMUM_CURSOR_KEY_LENGTH = 128;
const MAXIMUM_CURSOR_VALUE_LENGTH = 2_048;
const MAXIMUM_ACCOUNT_LABEL_LENGTH = 320;
const MAXIMUM_ERROR_CODE_LENGTH = 160;
const MAXIMUM_STORED_JSON_LENGTH = 128_000;
const MAXIMUM_SECRET_PLAINTEXT_BYTES = 65_536;
const MAXIMUM_SECRET_CIPHERTEXT_LENGTH = Math.ceil(MAXIMUM_SECRET_PLAINTEXT_BYTES * 4 / 3) + 4;
const PROVIDER_IDS = new Set<MailboxProviderId>(["gmail", "microsoft-outlook"]);
const CONNECTION_STATUSES = new Set<string>(PROVIDER_CONNECTION_STATUSES);
const CAPABILITY_KEYS = Object.freeze([
  "connect",
  "disconnect",
  "refreshAuthorization",
  "listBoundedMessageMetadata",
  "retrieveRequiredMessageContent",
  "incrementalCursor",
  "providerIdentity",
  "health",
  "sendMail",
  "deleteMail",
  "modifyMailbox",
  "accessContacts",
  "accessCalendar",
] as const);
const PROHIBITED_CAPABILITY_KEYS = Object.freeze([
  "sendMail",
  "deleteMail",
  "modifyMailbox",
  "accessContacts",
  "accessCalendar",
] as const);
const CONNECTION_FIELDS = new Set([
  "provider",
  "connectionId",
  "connectedAccountLabel",
  "grantedScopesSummary",
  "status",
  "connectedAt",
  "lastHealthyAt",
  "cursorMetadata",
  "capabilityFlags",
  "revokedAt",
  "errorCode",
]);

type RuntimeEnvironment = Record<string, string | undefined>;

export type ManagedProviderStoreConfig = Readonly<{
  namespace: string;
  redisUrl: string;
  redisToken: string;
  encryptionKey: Buffer;
  encryptionKeyVersion: string;
  allowedRedirectUris: readonly string[];
}>;

export type ManagedProviderStoreSelection = Readonly<{
  configured: boolean;
  reason: "READY" | "DISABLED" | "WRONG_RUNTIME" | "INCOMPLETE_CONFIGURATION";
  connectionStore: ProviderConnectionStore;
  secretStore: ProviderSecretStore;
  oauthStateStore: OAuthStateStore;
}>;

type ManagedStoreFactoryOptions = Readonly<{
  env?: RuntimeEnvironment;
  runtimeKind?: RuntimeKind;
  client?: ManagedRedisClient;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
}>;

type EncryptedSecretEnvelope = Readonly<{
  version: typeof MANAGED_STORE_VERSION;
  algorithm: "AES-256-GCM";
  keyVersion: string;
  provider: MailboxProviderId;
  connectionId: string;
  managedReference: string;
  createdAt: string;
  rotatedAt: string | null;
  revokedAt: null;
  iv: string;
  authTag: string;
  ciphertext: string;
}>;

const ENCRYPTED_SECRET_FIELDS = new Set([
  "version",
  "algorithm",
  "keyVersion",
  "provider",
  "connectionId",
  "managedReference",
  "createdAt",
  "rotatedAt",
  "revokedAt",
  "iv",
  "authTag",
  "ciphertext",
]);

type OAuthStateRecord = Readonly<{
  version: typeof MANAGED_STORE_VERSION;
  provider: MailboxProviderId;
  ownerBindingHash: string;
  redirectBindingHash: string;
  issuedAt: number;
  expiresAt: number;
}>;
const OAUTH_STATE_FIELDS = new Set([
  "version",
  "provider",
  "ownerBindingHash",
  "redirectBindingHash",
  "issuedAt",
  "expiresAt",
]);

function enabled(value: unknown): boolean {
  return String(value || "").trim().toLowerCase() === "true";
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function ownerHash(owner: ProviderOwnerContext): string {
  return hash(`owner:${ownerContextKey(owner)}`);
}

function safeKeySegment(value: string): string {
  return hash(value);
}

function providerKey(namespace: string, family: string, owner: ProviderOwnerContext, suffix?: string): string {
  const base = `${namespace}:${family}:${ownerHash(owner)}`;
  return suffix ? `${base}:${safeKeySegment(suffix)}` : base;
}

function parseStoredValue<T>(value: unknown): T {
  if (typeof value === "string") {
    if (value.length > MAXIMUM_STORED_JSON_LENGTH) {
      throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider storage is invalid.", 503);
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider storage is invalid.", 503);
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider storage is invalid.", 503);
  }
  try {
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAXIMUM_STORED_JSON_LENGTH) {
      throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider storage is invalid.", 503);
    }
  } catch (error) {
    if (error instanceof ProviderRuntimeError) throw error;
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider storage is invalid.", 503);
  }
  return value as T;
}

function validateOAuthStateRecord(value: unknown): OAuthStateRecord {
  const record = parseStoredValue<Record<string, unknown>>(value);
  if (
    Object.keys(record).length !== OAUTH_STATE_FIELDS.size
    || Object.keys(record).some((key) => !OAUTH_STATE_FIELDS.has(key))
    || record.version !== MANAGED_STORE_VERSION
    || !PROVIDER_IDS.has(record.provider as MailboxProviderId)
    || typeof record.ownerBindingHash !== "string"
    || !/^[a-f0-9]{64}$/.test(record.ownerBindingHash)
    || typeof record.redirectBindingHash !== "string"
    || !/^[a-f0-9]{64}$/.test(record.redirectBindingHash)
    || !Number.isSafeInteger(record.issuedAt)
    || !Number.isSafeInteger(record.expiresAt)
    || Number(record.expiresAt) <= Number(record.issuedAt)
    || Number(record.expiresAt) - Number(record.issuedAt) > 15 * 60 * 1_000
  ) {
    throw new ProviderRuntimeError("oauth_state_invalid", "OAuth state is invalid.", 400);
  }
  return Object.freeze({
    version: MANAGED_STORE_VERSION,
    provider: record.provider as MailboxProviderId,
    ownerBindingHash: record.ownerBindingHash,
    redirectBindingHash: record.redirectBindingHash,
    issuedAt: Number(record.issuedAt),
    expiresAt: Number(record.expiresAt),
  });
}

function exactHttpsUrl(value: string, label: string): string {
  const candidate = String(value || "").trim();
  if (!candidate || candidate.length > MAXIMUM_REDIRECT_LENGTH) {
    throw new ProviderRuntimeError("invalid_provider_request", `${label} is invalid.`, 400);
  }
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== "https:"
      || parsed.username
      || parsed.password
      || parsed.hash
      || (parsed.origin !== candidate && parsed.origin + parsed.pathname + parsed.search !== candidate)
    ) {
      throw new Error("unsafe URL");
    }
    return candidate;
  } catch {
    throw new ProviderRuntimeError("invalid_provider_request", `${label} is invalid.`, 400);
  }
}

function parseEncryptionKey(value: string): Buffer {
  const candidate = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(candidate)) {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider storage is not configured.", 503);
  }
  let key: Buffer;
  try {
    key = Buffer.from(candidate, "base64url");
  } catch {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider storage is not configured.", 503);
  }
  if (key.length !== 32 || key.toString("base64url") !== candidate) {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider storage is not configured.", 503);
  }
  return key;
}

function readManagedStoreConfig(env: RuntimeEnvironment): ManagedProviderStoreConfig {
  const baseNamespace = String(env.CODE3_PROVIDER_STORE_NAMESPACE || DEFAULT_NAMESPACE).trim();
  if (!/^[a-z0-9][a-z0-9:_-]{0,95}$/.test(baseNamespace) || !baseNamespace.includes("preview")) {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider storage is not configured.", 503);
  }
  const deploymentScope = hash(`${String(env.VERCEL_PROJECT_ID)}:${String(env.VERCEL_GIT_COMMIT_REF)}`).slice(0, 16);
  const namespace = `${baseNamespace}:${deploymentScope}`;
  const redisUrl = exactHttpsUrl(String(env.CODE3_PROVIDER_KV_REST_API_URL || ""), "The managed provider store URL");
  const redisToken = String(env.CODE3_PROVIDER_KV_REST_API_TOKEN || "").trim();
  if (redisToken.length < 20 || redisToken.length > 4_096) {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider storage is not configured.", 503);
  }
  const redirectValues = String(env.CODE3_PROVIDER_OAUTH_REDIRECT_URIS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (redirectValues.length < 1 || redirectValues.length > MAXIMUM_ALLOWED_REDIRECTS) {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed OAuth state storage is not configured.", 503);
  }
  const allowedRedirectUris = Object.freeze([...new Set(
    redirectValues.map((value) => exactHttpsUrl(value, "An OAuth redirect")),
  )]);
  return Object.freeze({
    namespace,
    redisUrl,
    redisToken,
    encryptionKey: parseEncryptionKey(String(env.CODE3_PROVIDER_SECRET_ENCRYPTION_KEY || "")),
    encryptionKeyVersion: String(env.CODE3_PROVIDER_SECRET_KEY_VERSION || "v1").trim() || "v1",
    allowedRedirectUris,
  });
}

function cloneCapabilities(value: MailboxProviderCapabilities): MailboxProviderCapabilities {
  return Object.freeze({ ...value });
}

function isExactTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function validatedTimestamp(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > 40) {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider metadata is invalid.", 503);
  }
  if (!isExactTimestamp(value)) {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider metadata is invalid.", 503);
  }
  return value;
}

function validatedCapabilities(value: unknown): MailboxProviderCapabilities {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider metadata is invalid.", 503);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== CAPABILITY_KEYS.length
    || keys.some((key) => !CAPABILITY_KEYS.includes(key as typeof CAPABILITY_KEYS[number]))
    || CAPABILITY_KEYS.some((key) => typeof record[key] !== "boolean")
    || PROHIBITED_CAPABILITY_KEYS.some((key) => record[key] !== false)
  ) {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider metadata is invalid.", 503);
  }
  return cloneCapabilities(record as unknown as MailboxProviderCapabilities);
}

function validateConnection(value: unknown): SafeProviderConnection {
  const record = parseStoredValue<Record<string, unknown>>(value);
  if (Object.keys(record).some((key) => !CONNECTION_FIELDS.has(key))) {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider metadata is invalid.", 503);
  }
  const provider = String(record.provider || "") as MailboxProviderId;
  const connectionId = String(record.connectionId || "");
  const status = String(record.status || "");
  const label = record.connectedAccountLabel;
  const scopes = Array.isArray(record.grantedScopesSummary) ? record.grantedScopesSummary : null;
  const cursorRecord = record.cursorMetadata && typeof record.cursorMetadata === "object" && !Array.isArray(record.cursorMetadata)
    ? record.cursorMetadata as Record<string, unknown>
    : null;
  const cursorEntries = cursorRecord ? Object.entries(cursorRecord) : [];
  const errorCode = record.errorCode;
  if (
    !PROVIDER_IDS.has(provider)
    || !/^connection:[a-z0-9][a-z0-9._:-]{7,159}$/i.test(connectionId)
    || !CONNECTION_STATUSES.has(status)
    || typeof label !== "string"
    || label.length > MAXIMUM_ACCOUNT_LABEL_LENGTH
    || /[\u0000-\u001f\u007f]/.test(label)
    || !scopes
    || scopes.length > MAXIMUM_SCOPES
    || scopes.some((scope) => typeof scope !== "string" || scope.length > MAXIMUM_SCOPE_LENGTH || /[\u0000-\u001f\u007f]/.test(scope))
    || !cursorRecord
    || cursorEntries.length > MAXIMUM_CURSOR_ENTRIES
    || cursorEntries.some(([key, entry]) => (
      !key
      || key.length > MAXIMUM_CURSOR_KEY_LENGTH
      || key === "__proto__"
      || key === "constructor"
      || key === "prototype"
      || typeof entry !== "string"
      || entry.length > MAXIMUM_CURSOR_VALUE_LENGTH
      || /[\u0000-\u001f\u007f]/.test(entry)
    ))
    || (errorCode != null && (typeof errorCode !== "string" || errorCode.length > MAXIMUM_ERROR_CODE_LENGTH || /[^A-Z0-9_:-]/.test(errorCode)))
  ) {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider metadata is invalid.", 503);
  }
  const cursor = Object.fromEntries(cursorEntries as [string, string][]);
  return Object.freeze({
    provider,
    connectionId,
    connectedAccountLabel: label,
    grantedScopesSummary: Object.freeze(scopes as string[]),
    status: status as SafeProviderConnection["status"],
    connectedAt: validatedTimestamp(record.connectedAt),
    lastHealthyAt: validatedTimestamp(record.lastHealthyAt),
    cursorMetadata: Object.freeze(cursor),
    capabilityFlags: validatedCapabilities(record.capabilityFlags),
    revokedAt: validatedTimestamp(record.revokedAt),
    errorCode: errorCode == null ? null : errorCode as string,
  });
}

const PUT_CONNECTION_SCRIPT = `
local existing = redis.call('HEXISTS', KEYS[1], ARGV[1])
if existing == 0 and redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[3]) then
  return -1
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return 1
`;

const DISCONNECT_CONNECTION_SCRIPT = `
local current = redis.call('HGET', KEYS[1], ARGV[1])
if not current then return false end
local record = cjson.decode(current)
record.status = ARGV[2]
if ARGV[3] == '' then record.revokedAt = cjson.null else record.revokedAt = ARGV[3] end
if ARGV[4] == '' then record.errorCode = cjson.null else record.errorCode = ARGV[4] end
record.cursorMetadata = {}
local updated = cjson.encode(record)
redis.call('HSET', KEYS[1], ARGV[1], updated)
return updated
`;

const VERIFY_CONNECTION_STORE_SCRIPT = `
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[3])
local stored = redis.call('HGET', KEYS[1], ARGV[1])
redis.call('HDEL', KEYS[1], ARGV[1])
if redis.call('HLEN', KEYS[1]) == 0 then redis.call('DEL', KEYS[1]) end
if stored ~= ARGV[2] then return 0 end
return 1
`;

export function createManagedProviderConnectionStore(
  client: ManagedRedisClient,
  config: Pick<ManagedProviderStoreConfig, "namespace">,
): ProviderConnectionStore {
  return Object.freeze({
    kind: "DURABLE_SERVER_METADATA" as const,
    available: true,
    healthCheck: async () => managedStoreOperation(async () => {
      if (await client.ping() !== "PONG") throw new Error("managed store health check failed");
    }),
    verifyReadiness: async (owner: ProviderOwnerContext) => managedStoreOperation(async () => {
      const nonce = nodeRandomBytes(16).toString("hex");
      const result = Number(await client.eval(
        VERIFY_CONNECTION_STORE_SCRIPT,
        [providerKey(config.namespace, "readiness:connection", owner)],
        [`readiness:${nonce}`, `verified:${nonce}`, 60_000],
      ));
      if (result !== 1) throw new Error("managed connection store readiness failed");
    }),
    async list(owner: ProviderOwnerContext) {
      return managedStoreOperation(async () => {
        const values = await client.hvals(providerKey(config.namespace, "connection", owner));
        if (values.length > MAXIMUM_CONNECTIONS_PER_OWNER) {
          throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider metadata is invalid.", 503);
        }
        return Object.freeze(values.map(validateConnection).sort((left, right) => left.connectionId.localeCompare(right.connectionId)));
      });
    },
    async get(owner: ProviderOwnerContext, connectionId: string) {
      return managedStoreOperation(async () => {
        const value = await client.hget(providerKey(config.namespace, "connection", owner), connectionId);
        return value == null ? null : validateConnection(value);
      });
    },
    async put(owner: ProviderOwnerContext, connection: SafeProviderConnection) {
      const validated = validateConnection(connection);
      await managedStoreOperation(async () => {
        const result = Number(await client.eval(
          PUT_CONNECTION_SCRIPT,
          [providerKey(config.namespace, "connection", owner)],
          [validated.connectionId, JSON.stringify(validated), MAXIMUM_CONNECTIONS_PER_OWNER],
        ));
        if (result !== 1) throw new ProviderRuntimeError("provider_runtime_unavailable", "The provider connection store is at capacity.", 503);
      });
    },
    async markDisconnected(
      owner: ProviderOwnerContext,
      connectionId: string,
      input: Readonly<{ status: "DISCONNECTED" | "REVOKED"; revokedAt: string | null; errorCode?: string | null }>,
    ) {
      return managedStoreOperation(async () => {
        const result = await client.eval(
          DISCONNECT_CONNECTION_SCRIPT,
          [providerKey(config.namespace, "connection", owner)],
          [connectionId, input.status, input.revokedAt || "", input.errorCode || ""],
        );
        if (result == null || result === false) {
          throw new ProviderRuntimeError("provider_connection_not_found", "The provider connection was not found.", 404);
        }
        return validateConnection(result);
      });
    },
  });
}

function validateSecretMaterial(secret: ProviderSecretMaterial): ProviderSecretMaterial {
  const accessToken = secret.accessToken == null ? undefined : String(secret.accessToken);
  const refreshToken = secret.refreshToken == null ? undefined : String(secret.refreshToken);
  const expiresAt = secret.expiresAt == null ? undefined : String(secret.expiresAt);
  const grantedScopes = secret.grantedScopes == null
    ? undefined
    : Array.isArray(secret.grantedScopes) && secret.grantedScopes.every((scope) => typeof scope === "string")
      ? [...secret.grantedScopes]
      : null;
  if (
    (!accessToken && !refreshToken)
    || (accessToken && accessToken.length > MAXIMUM_TOKEN_LENGTH)
    || (refreshToken && refreshToken.length > MAXIMUM_TOKEN_LENGTH)
    || (expiresAt && !isExactTimestamp(expiresAt))
    || grantedScopes === null
    || (grantedScopes && (grantedScopes.length > MAXIMUM_SCOPES || grantedScopes.some((scope) => scope.length > MAXIMUM_SCOPE_LENGTH)))
  ) {
    throw new ProviderRuntimeError("invalid_provider_request", "Provider secret material is invalid.", 400);
  }
  const normalized = {
    ...(accessToken ? { accessToken } : {}),
    ...(refreshToken ? { refreshToken } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(grantedScopes ? { grantedScopes: Object.freeze(grantedScopes) } : {}),
  };
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > MAXIMUM_SECRET_PLAINTEXT_BYTES) {
    throw new ProviderRuntimeError("invalid_provider_request", "Provider secret material is invalid.", 400);
  }
  return Object.freeze(normalized);
}

function secretAad(owner: ProviderOwnerContext, reference: ProviderSecretReference): Buffer {
  return Buffer.from([
    MANAGED_STORE_VERSION,
    ownerHash(owner),
    reference.provider,
    reference.connectionId,
    reference.managedReference,
  ].join("|"), "utf8");
}

function encryptSecret(
  owner: ProviderOwnerContext,
  reference: ProviderSecretReference,
  secret: ProviderSecretMaterial,
  config: Pick<ManagedProviderStoreConfig, "encryptionKey" | "encryptionKeyVersion">,
  randomBytes: (size: number) => Buffer,
): EncryptedSecretEnvelope {
  const validated = validateSecretMaterial(secret);
  const iv = randomBytes(12);
  if (!Buffer.isBuffer(iv) || iv.length !== 12) {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Provider secret encryption is unavailable.", 503);
  }
  const cipher = createCipheriv("aes-256-gcm", config.encryptionKey, iv);
  cipher.setAAD(secretAad(owner, reference));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(validated), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Object.freeze({
    version: MANAGED_STORE_VERSION,
    algorithm: "AES-256-GCM",
    keyVersion: config.encryptionKeyVersion,
    provider: reference.provider,
    connectionId: reference.connectionId,
    managedReference: reference.managedReference,
    createdAt: reference.createdAt,
    rotatedAt: reference.rotatedAt,
    revokedAt: null,
    iv: iv.toString("base64url"),
    authTag: authTag.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  });
}

function decodeCanonicalBase64Url(
  value: unknown,
  minimumBytes: number,
  maximumBytes: number,
): Buffer | null {
  if (typeof value !== "string" || value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    if (
      decoded.length < minimumBytes
      || decoded.length > maximumBytes
      || decoded.toString("base64url") !== value
    ) return null;
    return decoded;
  } catch {
    return null;
  }
}

function decryptSecret(
  owner: ProviderOwnerContext,
  envelopeValue: unknown,
  config: Pick<ManagedProviderStoreConfig, "encryptionKey" | "encryptionKeyVersion">,
  expectedConnectionId: string,
): ProviderSecretMaterial {
  const envelope = parseStoredValue<EncryptedSecretEnvelope>(envelopeValue);
  const iv = decodeCanonicalBase64Url(envelope.iv, 12, 12);
  const authTag = decodeCanonicalBase64Url(envelope.authTag, 16, 16);
  const ciphertext = decodeCanonicalBase64Url(
    envelope.ciphertext,
    1,
    MAXIMUM_SECRET_PLAINTEXT_BYTES,
  );
  if (
    Object.keys(envelope).some((key) => !ENCRYPTED_SECRET_FIELDS.has(key))
    || Object.keys(envelope).length !== ENCRYPTED_SECRET_FIELDS.size
    || envelope.version !== MANAGED_STORE_VERSION
    || envelope.algorithm !== "AES-256-GCM"
    || envelope.keyVersion !== config.encryptionKeyVersion
    || !PROVIDER_IDS.has(envelope.provider)
    || envelope.connectionId !== expectedConnectionId
    || !/^connection:[a-z0-9][a-z0-9._:-]{7,159}$/i.test(envelope.connectionId)
    || typeof envelope.managedReference !== "string"
    || !/^managed:[a-z0-9][a-z0-9._:-]{7,319}$/i.test(envelope.managedReference)
    || validatedTimestamp(envelope.createdAt) == null
    || envelope.rotatedAt != null && validatedTimestamp(envelope.rotatedAt) == null
    || envelope.revokedAt !== null
    || iv == null
    || authTag == null
    || ciphertext == null
    || envelope.ciphertext.length > MAXIMUM_SECRET_CIPHERTEXT_LENGTH
  ) {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider secret storage is invalid.", 503);
  }
  try {
    const reference: ProviderSecretReference = {
      provider: envelope.provider,
      connectionId: envelope.connectionId,
      managedReference: envelope.managedReference,
      createdAt: envelope.createdAt,
      rotatedAt: envelope.rotatedAt,
      revokedAt: null,
    };
    const decipher = createDecipheriv("aes-256-gcm", config.encryptionKey, iv, { authTagLength: 16 });
    decipher.setAAD(secretAad(owner, reference));
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    return validateSecretMaterial(JSON.parse(plaintext) as ProviderSecretMaterial);
  } catch (error) {
    if (error instanceof ProviderRuntimeError) throw error;
    throw new ProviderRuntimeError("provider_runtime_unavailable", "Managed provider secret storage is invalid.", 503);
  }
}

const VERIFY_SECRET_STORE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return false end
local stored = redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX')
if not stored then return false end
local raw = redis.call('GET', KEYS[1])
redis.call('DEL', KEYS[1])
return raw
`;

export function createManagedProviderSecretStore(
  client: ManagedRedisClient,
  config: Pick<ManagedProviderStoreConfig, "namespace" | "encryptionKey" | "encryptionKeyVersion">,
  options: Readonly<{ randomBytes?: (size: number) => Buffer }> = {},
): ProviderSecretStore {
  const randomBytes = options.randomBytes || nodeRandomBytes;
  return Object.freeze({
    kind: "MANAGED_SERVER_SECRET_STORE" as const,
    available: true,
    healthCheck: async () => managedStoreOperation(async () => {
      if (await client.ping() !== "PONG") throw new Error("managed store health check failed");
    }),
    verifyReadiness: async (owner: ProviderOwnerContext) => managedStoreOperation(async () => {
      const nonce = nodeRandomBytes(16).toString("hex");
      const connectionId = `connection:readiness-${nonce}`;
      const marker = `readiness-${nonce}`;
      const reference: ProviderSecretReference = Object.freeze({
        provider: "gmail",
        connectionId,
        managedReference: `managed:readiness:${nonce}`,
        createdAt: new Date().toISOString(),
        rotatedAt: null,
        revokedAt: null,
      });
      const envelope = encryptSecret(owner, reference, { refreshToken: marker }, config, randomBytes);
      const stored = await client.eval(
        VERIFY_SECRET_STORE_SCRIPT,
        [providerKey(config.namespace, "readiness:secret", owner, connectionId)],
        [JSON.stringify(envelope), 60_000],
      );
      if (!stored || decryptSecret(owner, stored, config, connectionId).refreshToken !== marker) {
        throw new Error("managed secret store readiness failed");
      }
    }),
    async put(owner: ProviderOwnerContext, reference: ProviderSecretReference, secret: ProviderSecretMaterial) {
      if (
        !PROVIDER_IDS.has(reference.provider)
        || !/^connection:[a-z0-9][a-z0-9._:-]{7,159}$/i.test(reference.connectionId)
        || !/^managed:[a-z0-9][a-z0-9._:-]{7,319}$/i.test(reference.managedReference)
        || validatedTimestamp(reference.createdAt) == null
        || reference.rotatedAt != null && validatedTimestamp(reference.rotatedAt) == null
        || reference.revokedAt !== null
      ) {
        throw new ProviderRuntimeError("invalid_provider_request", "Provider secret reference is invalid.", 400);
      }
      const envelope = encryptSecret(owner, reference, secret, config, randomBytes);
      await managedStoreOperation(async () => {
        await client.set(providerKey(config.namespace, "secret", owner, reference.connectionId), JSON.stringify(envelope));
      });
    },
    async get(owner: ProviderOwnerContext, connectionId: string) {
      if (!/^connection:[a-z0-9][a-z0-9._:-]{7,159}$/i.test(connectionId)) {
        throw new ProviderRuntimeError("invalid_provider_request", "Provider secret reference is invalid.", 400);
      }
      return managedStoreOperation(async () => {
        const envelope = await client.get(providerKey(config.namespace, "secret", owner, connectionId));
        return envelope == null ? null : decryptSecret(owner, envelope, config, connectionId);
      });
    },
    async revoke(owner: ProviderOwnerContext, connectionId: string) {
      return managedStoreOperation(async () => (
        await client.del(providerKey(config.namespace, "secret", owner, connectionId)) > 0
      ));
    },
  });
}

const ISSUE_OAUTH_STATE_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[4])
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[5]) then return -1 end
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[3]) == 1 then return -2 end
local stored = redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX')
if not stored then return -2 end
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[6])
redis.call('PEXPIRE', KEYS[2], ARGV[7])
return 1
`;

const CONSUME_OAUTH_STATE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  if redis.call('EXISTS', KEYS[3]) == 1 then return 'ALREADY_USED' end
  return 'INVALID'
end
local record = cjson.decode(raw)
local now = tonumber(ARGV[4])
if tonumber(record.expiresAt) <= now then
  redis.call('DEL', KEYS[1])
  redis.call('ZREM', KEYS[2], ARGV[5])
  return 'EXPIRED'
end
if record.provider ~= ARGV[1] or record.ownerBindingHash ~= ARGV[2] then return 'OWNER_MISMATCH' end
if record.redirectBindingHash ~= ARGV[3] then return 'REDIRECT_MISMATCH' end
redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[2], ARGV[5])
redis.call('SET', KEYS[3], '1', 'PX', ARGV[6], 'NX')
return raw
`;

const VERIFY_OAUTH_STATE_STORE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then return false end
local stored = redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2], 'NX')
if not stored then return false end
local raw = redis.call('GET', KEYS[1])
if raw ~= ARGV[1] then redis.call('DEL', KEYS[1]); return false end
redis.call('DEL', KEYS[1])
local used = redis.call('SET', KEYS[2], '1', 'PX', ARGV[2], 'NX')
if not used or redis.call('EXISTS', KEYS[1]) == 1 then redis.call('DEL', KEYS[2]); return false end
redis.call('DEL', KEYS[2])
return raw
`;

function normalizedState(value: unknown): string {
  const state = String(value || "").trim();
  if (state.length < 32 || state.length > 512 || !/^[A-Za-z0-9_-]+$/.test(state)) {
    throw new ProviderRuntimeError("oauth_state_invalid", "OAuth state is invalid.", 400);
  }
  return state;
}

export function createManagedOAuthStateStore(
  client: ManagedRedisClient,
  config: Pick<ManagedProviderStoreConfig, "namespace" | "allowedRedirectUris">,
  options: Readonly<{
    now?: () => number;
    ttlMs?: number;
    randomBytes?: (size: number) => Buffer;
  }> = {},
): OAuthStateStore {
  const now = options.now || Date.now;
  const ttlMs = options.ttlMs || DEFAULT_OAUTH_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 15 * 60 * 1_000) {
    throw new ProviderRuntimeError("invalid_provider_request", "OAuth state expiry must be between one and fifteen minutes.", 400);
  }
  const allowedRedirects = new Set(config.allowedRedirectUris);
  const randomBytes = options.randomBytes || nodeRandomBytes;

  function redirectHash(value: string): string {
    const redirect = exactHttpsUrl(value, "The OAuth redirect");
    if (!allowedRedirects.has(redirect)) {
      throw new ProviderRuntimeError("oauth_state_redirect_mismatch", "The OAuth redirect is not allowed.", 400);
    }
    return hash(`redirect:${redirect}`);
  }

  return Object.freeze({
    kind: "DURABLE_SINGLE_USE" as const,
    available: true,
    healthCheck: async () => managedStoreOperation(async () => {
      if (await client.ping() !== "PONG") throw new Error("managed store health check failed");
    }),
    verifyReadiness: async (owner: ProviderOwnerContext) => managedStoreOperation(async () => {
      const nonce = nodeRandomBytes(MINIMUM_STATE_BYTES).toString("base64url");
      const stateHash = hash(nonce);
      const record: OAuthStateRecord = Object.freeze({
        version: MANAGED_STORE_VERSION,
        provider: "gmail",
        ownerBindingHash: ownerHash(owner),
        redirectBindingHash: hash(`readiness:${stateHash}`),
        issuedAt: now(),
        expiresAt: now() + DEFAULT_OAUTH_TTL_MS,
      });
      const stored = await client.eval(
        VERIFY_OAUTH_STATE_STORE_SCRIPT,
        [
          `${config.namespace}:readiness:oauth:state:${stateHash}`,
          `${config.namespace}:readiness:oauth:used:${stateHash}`,
        ],
        [JSON.stringify(record), 60_000],
      );
      const validated = validateOAuthStateRecord(stored);
      if (validated.version !== MANAGED_STORE_VERSION || validated.ownerBindingHash !== record.ownerBindingHash) {
        throw new Error("managed OAuth state readiness failed");
      }
    }),
    async issue(input: OAuthStateIssueInput) {
      if (!PROVIDER_IDS.has(input.provider)) {
        throw new ProviderRuntimeError("invalid_provider_request", "The mailbox provider is unsupported.", 400);
      }
      const redirectBindingHash = redirectHash(input.redirectUri);
      const issuedAt = now();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const bytes = randomBytes(MINIMUM_STATE_BYTES);
        if (!Buffer.isBuffer(bytes) || bytes.length < MINIMUM_STATE_BYTES) {
          throw new ProviderRuntimeError("provider_runtime_unavailable", "A secure OAuth state could not be generated.", 503);
        }
        const state = bytes.toString("base64url");
        const stateHash = hash(state);
        const expiresAt = issuedAt + ttlMs;
        const stateKey = `${config.namespace}:oauth:state:${stateHash}`;
        const indexKey = providerKey(config.namespace, "oauth:index", input.owner);
        const usedKey = `${config.namespace}:oauth:used:${stateHash}`;
        const record: OAuthStateRecord = Object.freeze({
          version: MANAGED_STORE_VERSION,
          provider: input.provider,
          ownerBindingHash: ownerHash(input.owner),
          redirectBindingHash,
          issuedAt,
          expiresAt,
        });
        const result = Number(await managedStoreOperation(() => client.eval(
          ISSUE_OAUTH_STATE_SCRIPT,
          [stateKey, indexKey, usedKey],
          [
            JSON.stringify(record),
            ttlMs + USED_STATE_TTL_MS,
            expiresAt,
            issuedAt,
            MAXIMUM_ACTIVE_OAUTH_STATES_PER_OWNER,
            stateHash,
            ttlMs + USED_STATE_TTL_MS,
          ],
        )));
        if (result === 1) return Object.freeze({ state, expiresAt: new Date(expiresAt).toISOString() });
        if (result === -1) {
          throw new ProviderRuntimeError("provider_runtime_unavailable", "The OAuth state store is at capacity.", 503);
        }
      }
      throw new ProviderRuntimeError("provider_runtime_unavailable", "A unique OAuth state could not be generated.", 503);
    },
    async consume(input: OAuthStateConsumeInput): Promise<OAuthStateConsumption> {
      if (!PROVIDER_IDS.has(input.provider)) {
        throw new ProviderRuntimeError("invalid_provider_request", "The mailbox provider is unsupported.", 400);
      }
      const state = normalizedState(input.state);
      const stateHash = hash(state);
      const consumedAt = now();
      const stateKey = `${config.namespace}:oauth:state:${stateHash}`;
      const indexKey = providerKey(config.namespace, "oauth:index", input.owner);
      const usedKey = `${config.namespace}:oauth:used:${stateHash}`;
      const result = await managedStoreOperation(() => client.eval(
        CONSUME_OAUTH_STATE_SCRIPT,
        [stateKey, indexKey, usedKey],
        [
          input.provider,
          ownerHash(input.owner),
          redirectHash(input.redirectUri),
          consumedAt,
          stateHash,
          USED_STATE_TTL_MS,
        ],
      ));
      if (result === "ALREADY_USED") throw new ProviderRuntimeError("oauth_state_already_used", "OAuth state has already been used.", 409);
      if (result === "EXPIRED") throw new ProviderRuntimeError("oauth_state_expired", "OAuth state has expired.", 400);
      if (result === "OWNER_MISMATCH") throw new ProviderRuntimeError("oauth_state_owner_mismatch", "OAuth state is not valid for this session.", 403);
      if (result === "REDIRECT_MISMATCH") throw new ProviderRuntimeError("oauth_state_redirect_mismatch", "OAuth state is not valid for this redirect.", 400);
      if (result === "INVALID" || result == null) throw new ProviderRuntimeError("oauth_state_invalid", "OAuth state is invalid.", 400);
      const record = validateOAuthStateRecord(result);
      if (record.provider !== input.provider) {
        throw new ProviderRuntimeError("oauth_state_invalid", "OAuth state is invalid.", 400);
      }
      return Object.freeze({
        provider: input.provider,
        owner: Object.freeze({ ...input.owner }),
        redirectUri: input.redirectUri,
        issuedAt: new Date(record.issuedAt).toISOString(),
        expiresAt: new Date(record.expiresAt).toISOString(),
        consumedAt: new Date(consumedAt).toISOString(),
      });
    },
  });
}

function unavailableSelection(reason: ManagedProviderStoreSelection["reason"]): ManagedProviderStoreSelection {
  return Object.freeze({
    configured: false,
    reason,
    connectionStore: createUnavailableProviderConnectionStore(),
    secretStore: createUnavailableProviderSecretStore(),
    oauthStateStore: createUnavailableOAuthStateStore(),
  });
}

export function createManagedProviderStoresFromEnvironment(
  options: ManagedStoreFactoryOptions = {},
): ManagedProviderStoreSelection {
  const env = options.env || process.env;
  const runtimeKind = options.runtimeKind || detectRuntimeKind(env);
  const actualRuntimeKind = detectRuntimeKind(process.env);
  const exactPreviewMarkers = env.VERCEL === "1" && String(env.VERCEL_ENV || "").trim().toLowerCase() === "preview";
  const expectedProjectId = String(env.CODE3_PROVIDER_PREVIEW_PROJECT_ID || "").trim();
  const expectedGitBranch = String(env.CODE3_PROVIDER_PREVIEW_GIT_BRANCH || "").trim();
  const actualProjectId = String(env.VERCEL_PROJECT_ID || "").trim();
  const actualGitBranch = String(env.VERCEL_GIT_COMMIT_REF || "").trim();
  const isolatedDeployment = (
    expectedProjectId.length >= 3
    && expectedProjectId.length <= 160
    && expectedGitBranch.length >= 1
    && expectedGitBranch.length <= 240
    && actualProjectId === expectedProjectId
    && actualGitBranch === expectedGitBranch
  );
  const realHostedPreview = options.env === undefined
    && options.runtimeKind === undefined
    && actualRuntimeKind === "preview";
  const managedStoreTestHarness = actualRuntimeKind === "automated-test" && Boolean(options.client);
  if (
    runtimeKind !== "preview"
    || !exactPreviewMarkers
    || !isolatedDeployment
    || (!realHostedPreview && !managedStoreTestHarness)
  ) return unavailableSelection("WRONG_RUNTIME");
  if (!enabled(env.CODE3_PROVIDER_MANAGED_STORE_ENABLED)) return unavailableSelection("DISABLED");

  try {
    const config = readManagedStoreConfig(env);
    const client = options.client || createUpstashManagedRedisClient({ url: config.redisUrl, token: config.redisToken });
    return Object.freeze({
      configured: true,
      reason: "READY" as const,
      connectionStore: createManagedProviderConnectionStore(client, config),
      secretStore: createManagedProviderSecretStore(client, config, { randomBytes: options.randomBytes }),
      oauthStateStore: createManagedOAuthStateStore(client, config, {
        now: options.now,
        randomBytes: options.randomBytes,
      }),
    });
  } catch {
    return unavailableSelection("INCOMPLETE_CONFIGURATION");
  }
}
