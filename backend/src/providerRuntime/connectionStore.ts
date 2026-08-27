import { detectRuntimeKind, type RuntimeKind } from "../auth/runtimeEnvironment";
import type { ProviderOwnerContext, SafeProviderConnection } from "./contracts";
import { ownerContextKey } from "./contracts";
import { ProviderRuntimeError } from "./errors";

export interface ProviderConnectionStore {
  readonly kind: "UNAVAILABLE" | "AUTOMATED_TEST_MEMORY" | "DURABLE_SERVER_METADATA";
  readonly available: boolean;
  list(owner: ProviderOwnerContext): Promise<readonly SafeProviderConnection[]>;
  get(owner: ProviderOwnerContext, connectionId: string): Promise<SafeProviderConnection | null>;
  put(owner: ProviderOwnerContext, connection: SafeProviderConnection): Promise<void>;
  markDisconnected(
    owner: ProviderOwnerContext,
    connectionId: string,
    input: Readonly<{ status: "DISCONNECTED" | "REVOKED"; revokedAt: string | null; errorCode?: string | null }>,
  ): Promise<SafeProviderConnection>;
}

function unavailable(): never {
  throw new ProviderRuntimeError("provider_runtime_unavailable", "Provider connection storage is not configured.", 503);
}

export function createUnavailableProviderConnectionStore(): ProviderConnectionStore {
  return Object.freeze({
    kind: "UNAVAILABLE" as const,
    available: false,
    list: async () => unavailable(),
    get: async () => unavailable(),
    put: async () => unavailable(),
    markDisconnected: async () => unavailable(),
  });
}

function cloneConnection(connection: SafeProviderConnection): SafeProviderConnection {
  return Object.freeze({
    ...connection,
    grantedScopesSummary: Object.freeze([...connection.grantedScopesSummary]),
    cursorMetadata: Object.freeze({ ...connection.cursorMetadata }),
    capabilityFlags: Object.freeze({ ...connection.capabilityFlags }),
  });
}

/** Dependency-injected metadata store for automated tests only. */
export function createAutomatedTestMemoryConnectionStore(options: { runtimeKind?: RuntimeKind } = {}): ProviderConnectionStore {
  const runtimeKind = options.runtimeKind || detectRuntimeKind(process.env);
  if (runtimeKind !== "automated-test") {
    throw new ProviderRuntimeError("provider_runtime_unavailable", "The memory connection store is available only to automated tests.", 503);
  }
  const records = new Map<string, SafeProviderConnection>();
  const key = (owner: ProviderOwnerContext, connectionId: string) => `${ownerContextKey(owner)}:${connectionId}`;
  return Object.freeze({
    kind: "AUTOMATED_TEST_MEMORY" as const,
    available: true,
    async list(owner: ProviderOwnerContext) {
      const prefix = `${ownerContextKey(owner)}:`;
      return Object.freeze([...records.entries()]
        .filter(([recordKey]) => recordKey.startsWith(prefix))
        .map(([, record]) => cloneConnection(record)));
    },
    async get(owner: ProviderOwnerContext, connectionId: string) {
      const record = records.get(key(owner, connectionId));
      return record ? cloneConnection(record) : null;
    },
    async put(owner: ProviderOwnerContext, connection: SafeProviderConnection) {
      records.set(key(owner, connection.connectionId), cloneConnection(connection));
    },
    async markDisconnected(
      owner: ProviderOwnerContext,
      connectionId: string,
      input: Readonly<{ status: "DISCONNECTED" | "REVOKED"; revokedAt: string | null; errorCode?: string | null }>,
    ) {
      const recordKey = key(owner, connectionId);
      const current = records.get(recordKey);
      if (!current) throw new ProviderRuntimeError("provider_connection_not_found", "The provider connection was not found.", 404);
      const updated = cloneConnection({
        ...current,
        status: input.status,
        revokedAt: input.revokedAt,
        errorCode: input.errorCode || null,
        cursorMetadata: Object.freeze({}),
      });
      records.set(recordKey, updated);
      return cloneConnection(updated);
    },
  });
}
