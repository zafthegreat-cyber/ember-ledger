import { getApiBase, isTrustedNativeOrigin } from "../native/nativeRuntime.js";

export const ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGES = Object.freeze({
  account_sign_in_required: "Sign in to your Code 3 TCG account to review or delete it.",
  account_reauthentication_failed: "Password confirmation failed. Check your account password and try again.",
  account_shared_workspace: "Transfer shared workspace ownership before deleting this account. Other members' records must be preserved.",
  account_protected_owner: "Transfer protected service ownership before deleting this account. Contact support for help.",
  account_deletion_pending: "Deletion has started but has not finished. Some cloud files may already have been removed. Retry deletion to finish.",
  account_deletion_busy: "Deletion is already running. Wait a moment, then check its status.",
  account_storage_review_required: "Some stored files need an ownership review before deletion. Contact support; other people's files will not be removed.",
  account_data_review_required: "Some records need an ownership review before deletion. Contact support to finish safely.",
  account_deletion_unavailable: "Account deletion is not available right now. Keep your backups and contact support if this continues.",
  account_deletion_rate_limited: "Too many confirmation attempts. Wait before trying again.",
  invalid_response: "The account service returned an unexpected response. Deletion is not confirmed. Check status before trying again.",
  outcome_unknown: "The account service did not confirm the result. Deletion may have started. Check status or contact support before making further changes.",
  secure_transport_required: "Open the secure Code 3 TCG app before entering your account password.",
  invalid_confirmation: "Type DELETE MY ACCOUNT exactly and enter your account password to continue.",
});
export function accountDeletionError(code) {
  const safe = Object.hasOwn(MESSAGES, code) ? code : "account_deletion_unavailable";
  return Object.assign(new Error(MESSAGES[safe]), { code: safe });
}
const plain = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const loopback = (hostname) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);

export function resolveAccountDeletionUrl(action, { apiBase = getApiBase(), pageUrl = globalThis.location?.href, nativeOrigin = isTrustedNativeOrigin } = {}) {
  if (!["status", "delete"].includes(action)) throw accountDeletionError("invalid_response");
  let page; let endpoint;
  try {
    page = new URL(pageUrl);
    endpoint = new URL(`${apiBase}/api/account/deletion${action === "status" ? "/status" : ""}`, page);
  } catch { throw accountDeletionError("secure_transport_required"); }
  const native = nativeOrigin(page.href);
  const safePage = native || page.protocol === "https:" || (page.protocol === "http:" && loopback(page.hostname));
  const safeEndpoint = endpoint.protocol === "https:" || (!native && endpoint.protocol === "http:" && loopback(endpoint.hostname) && loopback(page.hostname));
  if (!safePage || !safeEndpoint || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw accountDeletionError("secure_transport_required");
  return endpoint.href;
}

async function authenticatedHeaders(expectedUserId) {
  const { supabase } = await import("../supabaseClient.js");
  if (!supabase || !UUID.test(expectedUserId || "")) throw accountDeletionError("account_sign_in_required");
  const { data, error } = await supabase.auth.getSession();
  if (error || data?.session?.user?.id !== expectedUserId || !data.session.access_token) throw accountDeletionError("account_sign_in_required");
  // The server independently verifies the bearer and determines the account id.
  return { Authorization: `Bearer ${data.session.access_token}` };
}

function abortable(operation, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Cancelled", "AbortError"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(operation).then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function readBoundedBody(response, signal) {
  if (!response.body?.getReader) {
    const raw = await abortable(response.text(), signal);
    if (new TextEncoder().encode(raw).byteLength > 32_768) throw accountDeletionError("invalid_response");
    return raw;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) return raw + decoder.decode();
      bytes += value.byteLength;
      if (bytes > 32_768) throw accountDeletionError("invalid_response");
      raw += decoder.decode(value, { stream: true });
    }
  } finally { void reader.cancel().catch(() => undefined); }
}

async function request(action, input, options = {}) {
  if (!UUID.test(options.expectedUserId || "")) throw accountDeletionError("account_sign_in_required");
  const endpoint = resolveAccountDeletionUrl(action, options);
  const headers = await (options.getHeaders || authenticatedHeaders)(options.expectedUserId);
  if (!plain(headers) || Object.keys(headers).length !== 1 || typeof headers.Authorization !== "string" || !/^Bearer [^\s]+$/.test(headers.Authorization)) throw accountDeletionError("account_sign_in_required");
  if (options.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, options.requestTimeoutMs || 60_000);
  try {
    const response = await abortable((options.fetchImpl || globalThis.fetch)(endpoint, {
      method: input ? "POST" : "GET", headers: { Accept: "application/json", ...headers, ...(input ? { "Content-Type": "application/json" } : {}) },
      body: input ? JSON.stringify(input) : undefined, credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal,
    }), controller.signal);
    if (!response.headers?.get("content-type")?.toLowerCase().includes("application/json")) throw accountDeletionError("invalid_response");
    const raw = await readBoundedBody(response, controller.signal);
    let payload;
    try { payload = JSON.parse(raw); } catch { throw accountDeletionError("invalid_response"); }
    if (!plain(payload)) throw accountDeletionError("invalid_response");
    if (!response.ok || payload.ok !== true) throw accountDeletionError(payload.error?.code || payload.code || (response.status === 429 ? "account_deletion_rate_limited" : "account_deletion_unavailable"));
    return payload;
  } catch (error) {
    if (error?.name === "AbortError" && options.signal?.aborted) throw error;
    if (error?.code && Object.hasOwn(MESSAGES, error.code)) throw error;
    throw accountDeletionError(input ? "outcome_unknown" : "account_deletion_unavailable");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}

export async function fetchAccountDeletionStatus(options = {}) {
  const value = await request("status", undefined, options);
  const list = (items) => Array.isArray(items) && items.length <= 40 && items.every((text) => typeof text === "string" && text.length <= 1500);
  if (typeof value.available !== "boolean" || !["ready", "pending"].includes(value.state)
    || typeof value.accountEmail !== "string" || value.accountEmail.length > 320
    || !list(value.deletionScope) || !list(value.retainedScope) || !Array.isArray(value.blockers) || value.blockers.length > 20
    || value.blockers.some((blocker) => !plain(blocker) || typeof blocker.code !== "string" || typeof blocker.message !== "string" || blocker.message.length > 1500)) throw accountDeletionError("invalid_response");
  return { available: value.available, state: value.state, accountEmail: value.accountEmail,
    deletionScope: value.deletionScope, retainedScope: value.retainedScope, blockers: value.blockers };
}

export async function deleteOwnAccount(input, options = {}) {
  if (!plain(input) || Object.keys(input).some((key) => !["password", "confirmation"].includes(key))
    || input.confirmation !== ACCOUNT_DELETION_CONFIRMATION || typeof input.password !== "string" || !input.password || input.password.length > 1024) throw accountDeletionError("invalid_confirmation");
  const result = await request("delete", { password: input.password, confirmation: input.confirmation }, options);
  if (result.state !== "deleted" || result.localCleanupRequired !== true) throw accountDeletionError("invalid_response");
  return { state: "deleted", localCleanupRequired: true };
}
