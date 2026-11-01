import { Pool } from "pg";
import { readBillingConfig } from "./config";
import { createBillingRepository } from "./repository";
import { createBillingService } from "./service";
import { createBillingRouter } from "./router";

/** Missing or invalid billing configuration must not interrupt the existing app. */
export function createConfiguredBillingRouter(env: Record<string, string | undefined> = process.env) {
  try {
    const config = readBillingConfig(env);
    if (!config.enabled || !env.CODE3_BILLING_DATABASE_URL) return createBillingRouter();
    const pool = new Pool({ connectionString: env.CODE3_BILLING_DATABASE_URL, max: 3,
      connectionTimeoutMillis: 5_000, idleTimeoutMillis: 10_000 });
    return createBillingRouter({ service: createBillingService(config, createBillingRepository(pool)) });
  } catch { return createBillingRouter(); }
}
