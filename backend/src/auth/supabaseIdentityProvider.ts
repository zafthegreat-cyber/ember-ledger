import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { AuthPrincipal, IdentityProvider, IdentityVerificationResult } from "./authPrincipal";

type RuntimeEnvironment = Record<string, string | undefined>;

type SupabaseAuthClient = Pick<SupabaseClient, "auth"> & Partial<Pick<SupabaseClient, "rpc">>;

type SupabaseProviderOptions = {
  env?: RuntimeEnvironment;
  client?: SupabaseAuthClient;
  now?: () => number;
};

type TokenClaims = {
  sub?: unknown;
  iat?: unknown;
  exp?: unknown;
  session_id?: unknown;
};

function decodeClaims(token: string): TokenClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || !parts[1]) return null;
    const value = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value as TokenClaims : null;
  } catch {
    return null;
  }
}

function finiteTimestamp(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null;
}

function normalizedPrincipal(user: User, claims: TokenClaims): AuthPrincipal | null {
  const subject = String(user.id || "").trim();
  const claimSubject = String(claims.sub || "").trim();
  const issuedAt = finiteTimestamp(claims.iat);
  const expiresAt = finiteTimestamp(claims.exp);
  if (!subject || subject !== claimSubject || issuedAt == null || expiresAt == null) return null;
  return Object.freeze({
    subject,
    provider: "supabase" as const,
    ...(user.email ? { email: user.email } : {}),
    emailVerified: Boolean(user.email_confirmed_at),
    issuedAt,
    expiresAt,
    ...(typeof claims.session_id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(claims.session_id)
      ? { providerSessionId: claims.session_id } : {}),
  });
}

export function createSupabaseIdentityProvider(options: SupabaseProviderOptions = {}): IdentityProvider {
  const env = options.env || process.env;
  const now = options.now || Date.now;
  const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();
  const supabaseAnonKey = String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "").trim();
  const configured = Boolean(supabaseUrl && supabaseAnonKey);
  const client = options.client || (configured
    ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    : null);

  return {
    providerId: "supabase",
    isConfigured: () => configured && Boolean(client),
    async verifyAccessToken(token: string): Promise<IdentityVerificationResult> {
      if (!configured || !client) return { ok: false, reason: "not_configured" };
      const claims = decodeClaims(token);
      const expiresAt = finiteTimestamp(claims?.exp);
      if (!claims || expiresAt == null) return { ok: false, reason: "invalid" };
      if (expiresAt * 1_000 <= now()) return { ok: false, reason: "expired" };
      try {
        const { data, error } = await client.auth.getUser(token);
        if (error || !data?.user) return { ok: false, reason: "invalid" };
        const principal = normalizedPrincipal(data.user, claims);
        if (!principal?.providerSessionId) return { ok: false, reason: "invalid" };
        // Check provider revocation when a real session identifier is available.
        // The RPC runs as this user's JWT, never as a privileged service key.
        if (principal.providerSessionId) {
          const sessionClient = options.client || createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            global: { headers: { Authorization: `Bearer ${token}` } },
          });
          if (!sessionClient.rpc) return { ok: false, reason: "unavailable" };
          const current = await sessionClient.rpc("code3_current_session_valid");
          if (current.error) return { ok: false, reason: "unavailable" };
          if (current.data !== true) return { ok: false, reason: "invalid" };
        }
        return { ok: true, principal };
      } catch {
        return { ok: false, reason: "unavailable" };
      }
    },
  };
}
