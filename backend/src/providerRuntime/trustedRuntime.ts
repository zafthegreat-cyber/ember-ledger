import { detectRuntimeKind } from "../auth/runtimeEnvironment";

export const TRUSTED_RUNTIME_PROOF_VERSION = "code3.preview-runtime-proof.v1";

export type TrustedRuntimeEnvironment =
  | "PREVIEW"
  | "PRODUCTION"
  | "HOSTED_UNKNOWN"
  | "LOCAL_DEVELOPMENT"
  | "AUTOMATED_TEST"
  | "UNKNOWN";

export type TrustedRuntimeProof = Readonly<{
  proofVersion: typeof TRUSTED_RUNTIME_PROOF_VERSION;
  execution: "SERVER";
  environment: TrustedRuntimeEnvironment;
  previewEnvironment: boolean;
  productionEnvironment: boolean;
  providerRuntimeLoaded: true;
  providerNetworkAccessEnabled: false;
  serverExecutionVerified: boolean;
  hostedRuntimeVerified: boolean;
}>;

type RuntimeEnvironment = Record<string, string | undefined>;

/**
 * Produce bounded execution evidence from server-owned process state only.
 *
 * VERCEL_ENV by itself is not sufficient: browser-controlled input, local test
 * input, or a partially configured host must never be able to claim that the
 * trusted Preview function executed. Production deliberately does not satisfy
 * this Phase 2B2-A Preview-only proof.
 */
export function resolveTrustedRuntimeProof(env: RuntimeEnvironment = process.env): TrustedRuntimeProof {
  const vercelEnvironment = String(env.VERCEL_ENV || "").trim().toLowerCase();
  const vercelFunction = env.VERCEL === "1";
  const previewEnvironment = vercelFunction && vercelEnvironment === "preview";
  const runtimeKind = detectRuntimeKind(env);
  const productionEnvironment = runtimeKind === "production";

  const environment: TrustedRuntimeEnvironment = previewEnvironment
    ? "PREVIEW"
    : productionEnvironment
      ? "PRODUCTION"
      : vercelFunction
        ? "HOSTED_UNKNOWN"
        : runtimeKind === "local-development"
          ? "LOCAL_DEVELOPMENT"
          : runtimeKind === "automated-test"
            ? "AUTOMATED_TEST"
            : "UNKNOWN";

  return Object.freeze({
    proofVersion: TRUSTED_RUNTIME_PROOF_VERSION,
    execution: "SERVER",
    environment,
    previewEnvironment,
    productionEnvironment,
    providerRuntimeLoaded: true,
    providerNetworkAccessEnabled: false,
    serverExecutionVerified: previewEnvironment && !productionEnvironment,
    // Final hosted verification additionally requires an authenticated owner
    // and healthy managed stores. That can only be established inside the
    // protected runtime status request, not from process markers alone.
    hostedRuntimeVerified: false,
  });
}
