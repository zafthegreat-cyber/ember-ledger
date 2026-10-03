export type RuntimeKind = "local-development" | "automated-test" | "preview" | "production" | "hosted-unknown" | "unknown";

type RuntimeEnvironment = Record<string, string | undefined>;

export function detectRuntimeKind(env: RuntimeEnvironment = process.env): RuntimeKind {
  const vercelEnvironment = String(env.VERCEL_ENV || "").trim().toLowerCase();
  if (vercelEnvironment === "production") return "production";
  if (vercelEnvironment === "preview" || vercelEnvironment === "development") return "preview";
  if (env.VERCEL === "1") return "hosted-unknown";

  const nodeEnvironment = String(env.NODE_ENV || "").trim().toLowerCase();
  if (nodeEnvironment === "production") return "production";
  if (nodeEnvironment === "test") return "automated-test";
  if (nodeEnvironment === "development") return "local-development";
  return "unknown";
}

export function isHostedRuntime(kind: RuntimeKind): boolean {
  return kind === "preview" || kind === "production" || kind === "hosted-unknown";
}

export function isLoopbackAddress(value = ""): boolean {
  const address = String(value || "").trim().toLowerCase();
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
