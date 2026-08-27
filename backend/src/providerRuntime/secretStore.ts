import { detectRuntimeKind, type RuntimeKind } from "../auth/runtimeEnvironment";
import type { MailboxProviderId, ProviderOwnerContext } from "./contracts";
import { ownerContextKey } from "./contracts";
import { ProviderRuntimeError } from "./errors";

export type ProviderSecretMaterial = Readonly<{
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  grantedScopes?: readonly string[];
}>;

export type ProviderSecretReference = Readonly<{
  provider: MailboxProviderId;
  connectionId: string;
  managedReference: string;
  createdAt: string;
  rotatedAt: string | null;
  revokedAt: string | null;
}>;

export interface ProviderSecretStore {
  readonly kind: "UNAVAILABLE" | "AUTOMATED_TEST_MEMORY" | "MANAGED_SERVER_SECRET_STORE";
  readonly available: boolean;
  put(owner: ProviderOwnerContext, reference: ProviderSecretReference, secret: ProviderSecretMaterial): Promise<void>;
  get(owner: ProviderOwnerContext, connectionId: string): Promise<ProviderSecretMaterial | null>;
  revoke(owner: ProviderOwnerContext, connectionId: string, revokedAt: string): Promise<boolean>;
}

function unavailable(): never {
  throw new ProviderRuntimeError(
    "provider_runtime_unavailable",
    "Secure provider credential storage is not configured.",
    503,
  );
}

export function createUnavailableProviderSecretStore(): ProviderSecretStore {
  return Object.freeze({
    kind: "UNAVAILABLE" as const,
    available: false,
    put: async () => unavailable(),
    get: async () => unavailable(),
    revoke: async () => unavailable(),
  });
}

type TestSecretStoreOptions = {
  runtimeKind?: RuntimeKind;
};

function cloneSecret(secret: ProviderSecretMaterial): ProviderSecretMaterial {
  return Object.freeze({
    ...(secret.accessToken ? { accessToken: String(secret.accessToken) } : {}),
    ...(secret.refreshToken ? { refreshToken: String(secret.refreshToken) } : {}),
    ...(secret.expiresAt ? { expiresAt: String(secret.expiresAt) } : {}),
    ...(secret.grantedScopes ? { grantedScopes: Object.freeze(secret.grantedScopes.map(String)) } : {}),
  });
}

/** Dependency-injected fake for automated tests only. Never select this store from hosted configuration. */
export function createAutomatedTestMemorySecretStore(options: TestSecretStoreOptions = {}): ProviderSecretStore {
  const runtimeKind = options.runtimeKind || detectRuntimeKind(process.env);
  if (runtimeKind !== "automated-test") {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "The memory secret store is available only to automated tests.", 503);
  }
  const records = new Map<string, ProviderSecretMaterial>();
  const key = (owner: ProviderOwnerContext, connectionId: string) => `${ownerContextKey(owner)}:${connectionId}`;
  return Object.freeze({
    kind: "AUTOMATED_TEST_MEMORY" as const,
    available: true,
    async put(owner: ProviderOwnerContext, reference: ProviderSecretReference, secret: ProviderSecretMaterial) {
      records.set(key(owner, reference.connectionId), cloneSecret(secret));
    },
    async get(owner: ProviderOwnerContext, connectionId: string) {
      const secret = records.get(key(owner, connectionId));
      return secret ? cloneSecret(secret) : null;
    },
    async revoke(owner: ProviderOwnerContext, connectionId: string) {
      return records.delete(key(owner, connectionId));
    },
  });
}
