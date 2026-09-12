import type { Request } from "express";

export type AuthProviderId = "supabase" | "local-development" | "automated-test";

export type AuthPrincipal = Readonly<{
  subject: string;
  provider: AuthProviderId;
  email?: string;
  emailVerified?: boolean;
  issuedAt: number;
  expiresAt: number;
}>;

export type IdentityVerificationResult =
  | { ok: true; principal: AuthPrincipal }
  | { ok: false; reason: "not_configured" | "invalid" | "expired" | "unavailable" };

export interface IdentityProvider {
  readonly providerId: AuthProviderId;
  isConfigured(): boolean;
  verifyAccessToken(token: string): Promise<IdentityVerificationResult>;
}

export type BearerTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: "missing" | "malformed" };

const MAX_AUTHORIZATION_HEADER_LENGTH = 12_000;

export function readBearerToken(request: Request): BearerTokenResult {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.trim()) return { ok: false, reason: "missing" };
  if (header.length > MAX_AUTHORIZATION_HEADER_LENGTH) return { ok: false, reason: "malformed" };
  const match = /^Bearer\s+([^\s]+)$/i.exec(header.trim());
  if (!match?.[1]) return { ok: false, reason: "malformed" };
  return { ok: true, token: match[1] };
}
