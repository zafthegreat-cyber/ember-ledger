import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

type Environment = Record<string, string | undefined>;
export class AccountDeletionError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
// passwordAccount: the account can sign in with email and password. Accounts that only use
// Google, Apple, Discord or Facebook confirm deletion with a fresh sign-in through that provider.
export type DeletionIdentity = { id: string; email: string; token: string; pending: boolean; passwordAccount?: boolean };
export type DeletionState = { state: "ready" | "pending"; blockers: { code: string; message: string }[] };
export const DELETION_SCOPE = [
  "Your sign-in account, profile, personal cloud collection, sales, preferences, and saved cloud versions.",
  "Your supported receipt and submission attachments, listings, reports, and private messages.",
];
export const RETAINED_SCOPE = [
  "Shared product catalogs, current prices, and records belonging to other accounts remain.",
  "Administrative actions on shared records can remain without your account reference.",
  "Downloaded backups and copies on your other devices are not remotely erased. Remove those copies yourself.",
  "Infrastructure backups expire under the hosting provider's retention schedule; they are not available through the app.",
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKETS = new Set(["receipts", "receipt-images", "product-submissions", "feedback-screenshots"]);
const unavailable = () => new AccountDeletionError("account_deletion_unavailable", "Account deletion is not available right now. No deletion has started.", 503);
const pending = () => new AccountDeletionError("account_deletion_pending", "Deletion started but has not finished. Some cloud files may already be removed. Sign in again if needed, then retry deletion to finish safely.", 503);

export interface AccountDeletionService {
  identify(token: string): Promise<DeletionIdentity>;
  status(identity: DeletionIdentity): Promise<DeletionState>;
  /** An empty password means the social path: the verified session must come from a fresh provider sign-in. */
  remove(identity: DeletionIdentity, password: string): Promise<void>;
}
type Options = { env?: Environment; admin?: SupabaseClient; clientFactory?: (token?: string) => SupabaseClient; now?: () => number };

/** Social re-authentication must be this recent (seconds); the provider round trip takes a minute or two. */
export const SOCIAL_REAUTH_WINDOW_SECONDS = 300;
function hasPasswordSignIn(user: User) {
  const providers = user.app_metadata?.providers;
  const identities = Array.isArray(user.identities) ? user.identities.map(item => item.provider) : [];
  // Unknown shape: keep the stricter password requirement.
  if (!Array.isArray(providers) && !identities.length) return true;
  return [...(Array.isArray(providers) ? providers : []), ...identities].includes("email");
}
function decodeClaims(token: string) {
  try { return JSON.parse(Buffer.from(token.split(".")[1] || "", "base64url").toString("utf8")); } catch { return null; }
}
const freshMethod = (claims: { amr?: unknown }, method: string, seconds: number, nowSeconds: number) => Array.isArray(claims?.amr)
  && claims.amr.some((entry: { method?: string; timestamp?: number }) => entry?.method === method && typeof entry.timestamp === "number" && entry.timestamp <= nowSeconds + 30 && nowSeconds - entry.timestamp <= seconds);

function validUser(user: User | null | undefined): user is User & { email: string } {
  return Boolean(user && UUID.test(user.id) && user.email && user.email_confirmed_at && !user.is_anonymous);
}

/** Secrets are used only by a transient server client. No password, token or email is logged. */
export function createAccountDeletionService(options: Options = {}): AccountDeletionService {
  const env = options.env || process.env;
  const now = options.now || Date.now;
  const url = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").trim();
  const anon = String(env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "").trim();
  const secret = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const enabled = env.CODE3_ACCOUNT_DELETION_ENABLED === "true";
  // Keep requests bounded even when Auth/Storage stalls. Abort remains active
  // while the response body is read, rather than ending at response headers.
  const boundedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(init?.signal ? [init.signal] : [])]) });
  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: boundedFetch } };
  const admin = options.admin || (url && secret ? createClient(url, secret, clientOptions) : null);
  const factory = options.clientFactory || ((token?: string) => createClient(url, anon, { ...clientOptions, global: { ...clientOptions.global, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) } }));
  const ready = () => { if (!enabled || !url || !anon || !admin) throw unavailable(); return admin; };
  async function rpc(name: string, args: Record<string, unknown>) {
    const result = await ready().rpc(name, args);
    if (result.error) throw unavailable();
    return result.data;
  }
  async function status(identity: DeletionIdentity): Promise<DeletionState> {
    const value = await rpc("code3_account_deletion_status", { target_user: identity.id });
    if (!value || !["ready", "pending"].includes(value.state) || !Array.isArray(value.blockers)) throw unavailable();
    const protectedOwner = String(env.CODE3_OWNER_SUBJECTS || "").split(",").map(x => x.trim()).includes(`supabase:${identity.id}`);
    return { state: value.state, blockers: [...value.blockers, ...(protectedOwner ? [{ code: "account_protected_owner", message: "Transfer the app owner's responsibilities to another account before deleting this account." }] : [])] };
  }
  return {
    async identify(token) {
      ready();
      const result = await factory().auth.getUser(token);
      if (result.error || !validUser(result.data.user)) throw new AccountDeletionError("account_sign_in_required", "Sign in to the account you want to delete.", 401);
      const user = result.data.user;
      // The only exception to a current session is a durable deletion already in
      // progress. It authorizes only retrying deletion, never ordinary app access.
      const state = await status({ id: user.id, email: user.email, token, pending: false });
      if (state.state !== "pending") {
        const sessionClient = factory(token);
        const active = await sessionClient.rpc("code3_current_session_valid");
        if (active.error || active.data !== true) throw new AccountDeletionError("account_sign_in_required", "Sign in again before deleting your account.", 401);
      }
      return { id: user.id, email: user.email, token, pending: state.state === "pending", passwordAccount: hasPasswordSignIn(user) };
    },
    status,
    async remove(identity, password) {
      const deadline = now() + 120_000;
      const checkDeadline = () => { if (now() > deadline) throw pending(); };
      const before = await status(identity);
      if (before.blockers.length) throw new AccountDeletionError(before.blockers[0].code, before.blockers[0].message, 409);
      const confirmation = factory();
      let freshToken = "";
      // Only a session this call created is signed out if deletion never starts.
      let ownsFreshToken = false;
      let started = before.state === "pending";
      let lease = "";
      try {
        if (!password) {
          // Social-only accounts: the bearer was verified by Auth in identify(); decode
          // only that token, never client-sent claims, and require a fresh provider sign-in.
          if (identity.passwordAccount !== false) throw new AccountDeletionError("account_reauthentication_failed", "Enter your account password to confirm.", 401);
          const claims = decodeClaims(identity.token);
          if (!claims || claims.sub !== identity.id || !freshMethod(claims, "oauth", SOCIAL_REAUTH_WINDOW_SECONDS, now() / 1000)) {
            throw new AccountDeletionError("account_social_reauthentication_required", "Sign in again with Google or Apple, then delete within 5 minutes.", 401);
          }
          freshToken = identity.token;
        } else {
          const signed = await confirmation.auth.signInWithPassword({ email: identity.email, password });
          password = "";
          if (signed.error || !validUser(signed.data.user) || signed.data.user.id !== identity.id || !signed.data.session?.access_token) {
            throw new AccountDeletionError("account_reauthentication_failed", "Your password could not be confirmed. Try again or reset your password first.", 401);
          }
          freshToken = signed.data.session.access_token;
          ownsFreshToken = true;
          // Decode only a token received directly from Auth, never client claims.
          const claims = decodeClaims(freshToken);
          if (!claims || claims.sub !== identity.id || !Array.isArray(claims.amr) || !claims.amr.some((entry: { method?: string; timestamp?: number }) => entry.method === "password" && typeof entry.timestamp === "number" && Math.abs(now() / 1000 - entry.timestamp) <= 120)) {
            throw new AccountDeletionError("account_reauthentication_failed", "Fresh password confirmation is required.", 401);
          }
        }
        checkDeadline();
        // A timeout can hide a committed begin RPC. Treat its outcome as pending
        // from dispatch onward, rather than falsely claiming nothing started.
        started = true;
        const claimed = await rpc("code3_begin_account_deletion", { target_user: identity.id });
        if (claimed?.busy) throw new AccountDeletionError("account_deletion_busy", "Deletion is already running. Wait a moment before retrying.", 409);
        if (!claimed || !UUID.test(claimed.lease) || !Array.isArray(claimed.files) || claimed.files.length > 10000) throw unavailable();
        lease = claimed.lease;
        const signOut = await ready().auth.admin.signOut(freshToken, "global");
        if (signOut.error) throw pending();
        for (const file of claimed.files) {
          if (!BUCKETS.has(file.bucket) || typeof file.path !== "string" || !file.path || file.path.length > 1024 || /[\x00-\x1f]/.test(file.path)) throw pending();
        }
        for (const bucket of BUCKETS) {
          const paths = claimed.files.filter((file: { bucket: string }) => file.bucket === bucket).map((file: { path: string }) => file.path);
          for (let index = 0; index < paths.length; index += 100) {
            checkDeadline();
            const removed = await ready().storage.from(bucket).remove(paths.slice(index, index + 100));
            if (removed.error) throw pending();
          }
        }
        checkDeadline();
        const cleaned = await rpc("code3_finish_account_data_deletion", { target_user: identity.id, lease_token: lease });
        if (cleaned?.readyForAuthDeletion !== true) throw pending();
        const deleted = await ready().auth.admin.deleteUser(identity.id, false);
        if (deleted.error) throw pending();
        // Failure to clean the tiny completion marker must not misreport a
        // successfully deleted Auth account as an active, recoverable account.
        await rpc("code3_complete_account_deletion", { target_user: identity.id, lease_token: lease }).catch(() => undefined);
      } catch (error) {
        if (error instanceof AccountDeletionError && [401, 409].includes(error.status)) throw error;
        throw started ? pending() : unavailable();
      } finally {
        password = "";
        if (lease) await rpc("code3_release_account_deletion", { target_user: identity.id, lease_token: lease }).catch(() => undefined);
        if (freshToken && ownsFreshToken && !started) await ready().auth.admin.signOut(freshToken, "local").catch(() => undefined);
        freshToken = "";
      }
    },
  };
}
