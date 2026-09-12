import { Redis } from "@upstash/redis";
import { ProviderRuntimeError } from "./errors";

/**
 * Small server-only transport boundary used by the durable provider stores.
 * Tests inject a deterministic fake; hosted code uses the official Upstash
 * REST client. No transport error body is allowed to cross this boundary.
 */
export interface ManagedRedisClient {
  ping(): Promise<string>;
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  hget(key: string, field: string): Promise<unknown | null>;
  hvals(key: string): Promise<readonly unknown[]>;
  eval(script: string, keys: readonly string[], args: readonly unknown[]): Promise<unknown>;
}

export type ManagedRedisConfiguration = Readonly<{
  url: string;
  token: string;
}>;

export function createUpstashManagedRedisClient(configuration: ManagedRedisConfiguration): ManagedRedisClient {
  const redis = new Redis({
    url: configuration.url,
    token: configuration.token,
    enableTelemetry: false,
    // Keep stored JSON as a string so Code 3 can enforce byte limits before
    // parsing untrusted managed-store values.
    automaticDeserialization: false,
  });

  return Object.freeze({
    ping: async () => redis.ping(),
    get: async (key: string) => redis.get(key),
    set: async (key: string, value: unknown) => redis.set(key, value),
    del: async (...keys: string[]) => redis.del(...keys),
    hget: async (key: string, field: string) => redis.hget(key, field),
    hvals: async (key: string) => redis.hvals(key),
    eval: async (script: string, keys: readonly string[], args: readonly unknown[]) => (
      redis.eval(script, [...keys], [...args])
    ),
  });
}

export async function managedStoreOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProviderRuntimeError) throw error;
    throw new ProviderRuntimeError(
      "provider_runtime_unavailable",
      "Managed provider storage is temporarily unavailable.",
      503,
    );
  }
}
