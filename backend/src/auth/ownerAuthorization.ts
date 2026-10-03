import type { NextFunction, Request, Response } from "express";
import type { AuthPrincipal, IdentityProvider } from "./authPrincipal";
import { readBearerToken } from "./authPrincipal";
import { detectRuntimeKind, isLoopbackAddress, type RuntimeKind } from "./runtimeEnvironment";
import { createSupabaseIdentityProvider } from "./supabaseIdentityProvider";

type RuntimeEnvironment = Record<string, string | undefined>;
type TestPrincipalResolver = (request: Request) => Promise<AuthPrincipal | null> | AuthPrincipal | null;

type OwnerSecurityOptions = {
  env?: RuntimeEnvironment;
  runtimeKind?: RuntimeKind;
  identityProvider?: IdentityProvider;
  testPrincipalResolver?: TestPrincipalResolver;
  now?: () => number;
};

type SessionInspection = {
  status: number;
  body: {
    authenticated: boolean;
    ownerAuthorized: boolean;
    provider?: string;
    displayIdentity?: string;
    expiresAt?: string;
    configurationState: "READY" | "AUTH_NOT_CONFIGURED" | "OWNER_NOT_CONFIGURED";
    error?: { code: string; message: string };
  };
  principal?: AuthPrincipal;
};

const LOCAL_DEVELOPMENT_SUBJECT = "local-development-owner";
const TEST_SUBJECT = "automated-test-owner";

function enabled(value: unknown): boolean {
  return String(value || "").trim().toLowerCase() === "true";
}

function ownerSubjects(env: RuntimeEnvironment): Set<string> {
  return new Set(String(env.CODE3_OWNER_SUBJECTS || "").split(",").map((entry) => entry.trim()).filter(Boolean));
}

function isLoopbackRequest(request: Request): boolean {
  const hostname = String(request.hostname || "").toLowerCase();
  const hostnameIsLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  return hostnameIsLoopback && isLoopbackAddress(request.socket?.remoteAddress || "");
}

function localAdapterAllowed(env: RuntimeEnvironment, runtimeKind: RuntimeKind): boolean {
  return runtimeKind === "local-development"
    && detectRuntimeKind(env) === "local-development"
    && enabled(env.CODE3_ENABLE_LOCAL_DEV_AUTH);
}

function testAdapterAllowed(env: RuntimeEnvironment, runtimeKind: RuntimeKind): boolean {
  return runtimeKind === "automated-test" && detectRuntimeKind(env) === "automated-test";
}

function localDevelopmentPrincipal(request: Request, env: RuntimeEnvironment, runtimeKind: RuntimeKind, now: () => number): AuthPrincipal | null {
  const requested = String(request.headers["x-code3-local-dev"] || "") === "1";
  if (!requested || !localAdapterAllowed(env, runtimeKind) || !isLoopbackRequest(request)) return null;
  const issuedAt = Math.floor(now() / 1_000);
  return Object.freeze({
    subject: LOCAL_DEVELOPMENT_SUBJECT,
    provider: "local-development",
    emailVerified: false,
    issuedAt,
    expiresAt: issuedAt + 60 * 60,
  });
}

function authorizedOwner(principal: AuthPrincipal, env: RuntimeEnvironment, runtimeKind: RuntimeKind): boolean {
  if (principal.provider === "local-development") return localAdapterAllowed(env, runtimeKind);
  if (principal.provider === "automated-test") return testAdapterAllowed(env, runtimeKind);
  return ownerSubjects(env).has(`${principal.provider}:${principal.subject}`);
}

function safeDisplayIdentity(principal: AuthPrincipal): string {
  if (principal.provider === "local-development") return "Local development owner";
  if (principal.provider === "automated-test") return "Automated test owner";
  if (!principal.email) return "Signed-in account";
  const [name, domain] = principal.email.split("@");
  if (!domain) return "Signed-in account";
  return `${name.slice(0, 1)}***@${domain}`;
}

function configurationState(provider: IdentityProvider, env: RuntimeEnvironment, runtimeKind: RuntimeKind): SessionInspection["body"]["configurationState"] {
  if (localAdapterAllowed(env, runtimeKind)) return "READY";
  if (testAdapterAllowed(env, runtimeKind)) return "READY";
  if (!provider.isConfigured()) return "AUTH_NOT_CONFIGURED";
  return ownerSubjects(env).size ? "READY" : "OWNER_NOT_CONFIGURED";
}

export function createOwnerSecurity(options: OwnerSecurityOptions = {}) {
  const env = options.env || process.env;
  const runtimeKind = options.runtimeKind || detectRuntimeKind(env);
  const now = options.now || Date.now;
  const provider = options.identityProvider || createSupabaseIdentityProvider({ env, now });

  async function inspectSession(request: Request): Promise<SessionInspection> {
    const state = configurationState(provider, env, runtimeKind);
    const localPrincipal = localDevelopmentPrincipal(request, env, runtimeKind, now);
    if (localPrincipal) {
      return {
        status: 200,
        principal: localPrincipal,
        body: {
          authenticated: true,
          ownerAuthorized: true,
          provider: localPrincipal.provider,
          displayIdentity: safeDisplayIdentity(localPrincipal),
          expiresAt: new Date(localPrincipal.expiresAt * 1_000).toISOString(),
          configurationState: state,
        },
      };
    }

    if (options.testPrincipalResolver && testAdapterAllowed(env, runtimeKind)) {
      const resolved = await options.testPrincipalResolver(request);
      if (resolved) {
        const principal = Object.freeze({ ...resolved, subject: resolved.subject || TEST_SUBJECT, provider: "automated-test" as const });
        return {
          status: 200,
          principal,
          body: {
            authenticated: true,
            ownerAuthorized: true,
            provider: principal.provider,
            displayIdentity: safeDisplayIdentity(principal),
            expiresAt: new Date(principal.expiresAt * 1_000).toISOString(),
            configurationState: state,
          },
        };
      }
    }

    const bearer = readBearerToken(request);
    if (bearer.ok === false) {
      return {
        status: 200,
        body: { authenticated: false, ownerAuthorized: false, configurationState: state },
      };
    }
    const result = await provider.verifyAccessToken(bearer.token);
    if (result.ok === false) {
      if (result.reason === "unavailable") {
        return {
          status: 503,
          body: {
            authenticated: false,
            ownerAuthorized: false,
            configurationState: state,
            error: { code: "authentication_unavailable", message: "Authentication is temporarily unavailable." },
          },
        };
      }
      return {
        status: 401,
        body: {
          authenticated: false,
          ownerAuthorized: false,
          configurationState: state,
          error: { code: "authentication_required", message: "Sign in is required." },
        },
      };
    }
    const ownerAuthorized = authorizedOwner(result.principal, env, runtimeKind);
    return {
      status: 200,
      principal: result.principal,
      body: {
        authenticated: true,
        ownerAuthorized,
        provider: result.principal.provider,
        displayIdentity: safeDisplayIdentity(result.principal),
        expiresAt: new Date(result.principal.expiresAt * 1_000).toISOString(),
        configurationState: state,
      },
    };
  }

  async function requireOwner(request: Request, response: Response, next: NextFunction) {
    response.setHeader("Cache-Control", "no-store");
    const inspected = await inspectSession(request);
    if (!inspected.body.authenticated) {
      const status = inspected.status === 503 ? 503 : 401;
      return response.status(status).json({
        ok: false,
        error: inspected.body.error || { code: "authentication_required", message: "Sign in is required." },
      });
    }
    if (!inspected.body.ownerAuthorized || !inspected.principal) {
      return response.status(403).json({
        ok: false,
        error: { code: "owner_access_required", message: "Owner access is required." },
      });
    }
    response.locals.authPrincipal = inspected.principal;
    return next();
  }

  return { inspectSession, requireOwner, runtimeKind };
}

export const ownerSecurity = createOwnerSecurity();
