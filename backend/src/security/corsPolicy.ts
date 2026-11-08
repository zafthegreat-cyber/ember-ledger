import type { NextFunction, Request, Response } from "express";
import { detectRuntimeKind, type RuntimeKind } from "../auth/runtimeEnvironment";

type RuntimeEnvironment = Record<string, string | undefined>;

type CorsOptions = {
  env?: RuntimeEnvironment;
  runtimeKind?: RuntimeKind;
  allowDelete?: boolean;
};

function canonicalOrigin(value: unknown): string | null {
  const origin = String(value || "").trim();
  if (!origin || origin === "*" || origin === "null" || origin.endsWith("/")) return null;
  // This single bundled iOS origin is still required to be explicitly enabled
  // below. Custom schemes have URL.origin === "null", so never normalize them
  // generically or accept any arbitrary capacitor:// host.
  if (origin === "capacitor://localhost") return origin;
  try {
    const parsed = new URL(origin);
    const isLoopbackHttp = parsed.protocol === "http:"
      && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]");
    if (
      (parsed.protocol !== "https:" && !isLoopbackHttp)
      || parsed.username
      || parsed.password
      || parsed.pathname !== "/"
      || parsed.search
      || parsed.hash
      || parsed.origin !== origin
    ) return null;
    return origin;
  } catch {
    return null;
  }
}

function exactOrigins(value = ""): Set<string> {
  return new Set(String(value || "").split(",").map((origin) => canonicalOrigin(origin)).filter((origin): origin is string => Boolean(origin)));
}

function addVaryOrigin(response: Response): void {
  const current = String(response.getHeader("Vary") || "");
  const values = current.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (!values.some((entry) => entry.toLowerCase() === "origin")) values.push("Origin");
  response.setHeader("Vary", values.join(", "));
}

export function allowedOriginsForRuntime(env: RuntimeEnvironment, runtimeKind = detectRuntimeKind(env)): Set<string> {
  const addNative = (allowed: Set<string>) => {
    if (env.CODE3_NATIVE_CLIENT_ENABLED === "true") {
      allowed.add("capacitor://localhost");
      allowed.add("https://localhost");
    }
    return allowed;
  };
  if (runtimeKind === "preview") {
    const allowed = exactOrigins(env.CODE3_CORS_PREVIEW_ORIGINS);
    // Opt-in for disposable HTTPS acceptance only. VERCEL_URL is server-owned
    // deployment metadata: never derive this exception from Host or Origin.
    // A changing immutable deployment URL otherwise cannot be preconfigured.
    if (env.CODE3_PREVIEW_SELF_ORIGIN_ENABLED === "true"
      && env.VERCEL === "1" && env.VERCEL_ENV === "preview") {
      const host = String(env.VERCEL_URL || "");
      if (/^[a-z0-9]+(?:-[a-z0-9]+)*-[a-z0-9]{8,}-[a-z0-9]+(?:-[a-z0-9]+)*\.vercel\.app$/.test(host)) {
        const origin = canonicalOrigin(`https://${host}`);
        if (origin) allowed.add(origin);
      }
    }
    return addNative(allowed);
  }
  if (runtimeKind === "local-development" || runtimeKind === "automated-test") {
    const allowed = exactOrigins(env.CODE3_CORS_LOCAL_ORIGINS);
    exactOrigins(env.CODE3_CORS_ALLOWED_ORIGINS).forEach((origin) => allowed.add(origin));
    return addNative(allowed);
  }
  if (runtimeKind === "production") {
    return addNative(exactOrigins(env.CODE3_CORS_ALLOWED_ORIGINS));
  }
  return new Set<string>();
}

export function createProtectedCors(options: CorsOptions = {}) {
  const env = options.env || process.env;
  return function protectedCors(request: Request, response: Response, next: NextFunction) {
    response.setHeader("Cache-Control", "no-store");
    addVaryOrigin(response);
    const rawOrigin = typeof request.headers.origin === "string" ? request.headers.origin : "";
    const origin = rawOrigin ? canonicalOrigin(rawOrigin) : "";
    const runtimeKind = options.runtimeKind || detectRuntimeKind(env);
    const allowed = allowedOriginsForRuntime(env, runtimeKind);
    if (rawOrigin && (!origin || !allowed.has(origin))) {
      return response.status(403).json({
        ok: false,
        error: { code: "origin_not_allowed", message: "This application origin is not allowed." },
      });
    }
    if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", options.allowDelete
      ? "GET, POST, PATCH, PUT, DELETE, OPTIONS"
      : "GET, POST, PATCH, PUT, OPTIONS");
    const allowedHeaders = runtimeKind === "local-development" || runtimeKind === "automated-test"
      ? "Authorization, Content-Type, X-Code3-Local-Dev"
      : "Authorization, Content-Type";
    response.setHeader("Access-Control-Allow-Headers", allowedHeaders);
    response.setHeader("Access-Control-Max-Age", "600");
    if (request.method === "OPTIONS") return response.status(204).end();
    return next();
  };
}
