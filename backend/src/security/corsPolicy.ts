import type { NextFunction, Request, Response } from "express";
import { detectRuntimeKind, type RuntimeKind } from "../auth/runtimeEnvironment";

type RuntimeEnvironment = Record<string, string | undefined>;

type CorsOptions = {
  env?: RuntimeEnvironment;
  runtimeKind?: RuntimeKind;
};

function exactOrigins(value = ""): Set<string> {
  return new Set(String(value || "").split(",").map((origin) => origin.trim()).filter((origin) => {
    if (!origin || origin === "*") return false;
    try {
      const parsed = new URL(origin);
      const isLoopbackHttp = parsed.protocol === "http:"
        && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]");
      return (parsed.protocol === "https:" || isLoopbackHttp) && parsed.origin === origin.replace(/\/$/, "");
    } catch {
      return false;
    }
  }).map((origin) => origin.replace(/\/$/, "")));
}

function addVaryOrigin(response: Response): void {
  const current = String(response.getHeader("Vary") || "");
  const values = current.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (!values.some((entry) => entry.toLowerCase() === "origin")) values.push("Origin");
  response.setHeader("Vary", values.join(", "));
}

export function allowedOriginsForRuntime(env: RuntimeEnvironment, runtimeKind = detectRuntimeKind(env)): Set<string> {
  const allowed = exactOrigins(env.CODE3_CORS_ALLOWED_ORIGINS);
  if (runtimeKind === "preview") {
    exactOrigins(env.CODE3_CORS_PREVIEW_ORIGINS).forEach((origin) => allowed.add(origin));
  }
  if (runtimeKind === "local-development" || runtimeKind === "automated-test") {
    exactOrigins(env.CODE3_CORS_LOCAL_ORIGINS).forEach((origin) => allowed.add(origin));
  }
  return allowed;
}

export function createProtectedCors(options: CorsOptions = {}) {
  const env = options.env || process.env;
  return function protectedCors(request: Request, response: Response, next: NextFunction) {
    response.setHeader("Cache-Control", "no-store");
    addVaryOrigin(response);
    const origin = typeof request.headers.origin === "string" ? request.headers.origin.replace(/\/$/, "") : "";
    const runtimeKind = options.runtimeKind || detectRuntimeKind(env);
    const allowed = allowedOriginsForRuntime(env, runtimeKind);
    if (origin && !allowed.has(origin)) {
      return response.status(403).json({
        ok: false,
        error: { code: "origin_not_allowed", message: "This application origin is not allowed." },
      });
    }
    if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    const allowedHeaders = runtimeKind === "local-development" || runtimeKind === "automated-test"
      ? "Authorization, Content-Type, X-Code3-Local-Dev"
      : "Authorization, Content-Type";
    response.setHeader("Access-Control-Allow-Headers", allowedHeaders);
    response.setHeader("Access-Control-Max-Age", "600");
    if (request.method === "OPTIONS") return response.status(204).end();
    return next();
  };
}
