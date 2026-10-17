import { supabase, createIsolatedAuthClient } from "../supabaseClient.js";

function aborted(signal) {
  if (signal?.aborted) throw new DOMException("The operation was cancelled.", "AbortError");
}

export function createAccountSessionService({ client = supabase, makeIsolatedClient = createIsolatedAuthClient, requestTimeoutMs = 30_000 } = {}) {
  // One deadline covers the whole action, including provider auth calls that do
  // not accept AbortSignal. Their eventual result is still checked before use.
  function bounded(operation, signal) {
    aborted(signal);
    const controller = new AbortController();
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        callback(value);
      };
      const cancel = () => {
        controller.abort();
        finish(reject, new DOMException("The operation was cancelled.", "AbortError"));
      };
      signal?.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => {
        controller.abort();
        const error = new Error("Account services took too long to respond. Check your connection and refresh the status before trying again.");
        error.code = "ACCOUNT_TIMEOUT";
        finish(reject, error);
      }, requestTimeoutMs);
      Promise.resolve().then(() => operation(controller.signal)).then(
        value => finish(resolve, value), error => finish(reject, error),
      );
    });
  }
  async function accessToken(target, signal) {
    aborted(signal);
    if (!target?.auth?.getSession) throw new Error("Account services are not configured.");
    const { data, error } = await target.auth.getSession();
    aborted(signal);
    if (error || !data?.session?.access_token) throw new Error("Sign in again before continuing.");
    return data.session.access_token;
  }
  async function rpc(name, args = {}, { signal, target = client, token } = {}) {
    aborted(signal);
    if (!target) throw new Error("Account services are not configured.");
    const verifiedToken = token || await accessToken(target, signal);
    aborted(signal);
    const query = target.rpc(name, args);
    if (typeof query.setHeader !== "function") throw new Error("Update the account client before continuing.");
    query.setHeader("Authorization", `Bearer ${verifiedToken}`);
    const { data, error } = await (signal ? query.abortSignal(signal) : query);
    aborted(signal);
    if (error) {
      const next = new Error(error.code === "PGRST202" ? "Account security is not available on this deployment yet." : error.message || "The account operation could not be verified.");
      next.code = error.code;
      throw next;
    }
    return data;
  }

  async function currentIdentity(userId, signal) {
    aborted(signal);
    if (!client) throw new Error("Account services are not configured.");
    const token = await accessToken(client, signal);
    const { data, error } = await client.auth.getUser(token);
    aborted(signal);
    if (error || !data?.user?.id || (userId && data.user.id !== userId)) throw new Error("Your signed-in account changed. Sign in again before continuing.");
    if (!await rpc("code3_current_session_valid", {}, { signal, token })) throw new Error("This sign-in has expired or was revoked. Sign in again.");
    return { user: data.user, token };
  }

  return {
    currentUser: (userId, signal) => bounded(async activeSignal => (await currentIdentity(userId, activeSignal)).user, signal),
    list: ({ signal } = {}) => bounded(async activeSignal => {
      const devices = await rpc("code3_list_account_sessions", {}, { signal: activeSignal });
      if (!Array.isArray(devices)) throw new Error("The device list could not be verified.");
      return devices;
    }, signal),
    register: (label, options = {}) => bounded(signal => rpc("code3_register_account_session", { device_label: label }, { signal }), options.signal),
    confirm: ({ purpose, planDigest, password, userId, signal: outerSignal }) => bounded(async signal => {
      if (!/^[a-f0-9]{64}$/.test(planDigest || "") || !["BACKUP_RECOVERY", "CLOUD_RESTORE", "SESSION_REVOKE"].includes(purpose)) throw new Error("Review the exact operation before confirming it.");
      if (typeof password !== "string" || !password || password.length > 1024) throw new Error("Enter your current password.");
      const { user, token } = await currentIdentity(userId, signal);
      const { challengeId } = await rpc("code3_prepare_account_confirmation", { operation_purpose: purpose, operation_digest: planDigest }, { signal, token });
      const isolated = makeIsolatedClient();
      let temporarySession = false;
      try {
        const { data, error } = await isolated.auth.signInWithPassword({ email: user.email, password });
        temporarySession = Boolean(data?.session);
        password = "";
        aborted(signal);
        if (error || data?.user?.id !== user.id || !data?.session?.access_token) throw new Error("Password confirmation failed. Check your password and try again.");
        const confirmation = await rpc("code3_complete_account_confirmation", { challenge_id: challengeId }, { signal, target: isolated, token: data.session.access_token });
        if (confirmation?.challengeId !== challengeId || confirmation.purpose !== purpose || confirmation.planDigest !== planDigest
          || typeof confirmation.grant !== "string" || !/^[a-f0-9-]{72}$/i.test(confirmation.grant)) throw new Error("The account confirmation could not be verified. No records were changed.");
        const signedOut = await isolated.auth.signOut({ scope: "local" });
        if (signedOut.error) throw new Error("The temporary confirmation session could not be closed. Please try again.");
        temporarySession = false;
        await currentIdentity(user.id, signal);
        return confirmation;
      } finally {
        password = "";
        // Always close the temporary session, including cancellation and failures.
        if (temporarySession) await isolated.auth.signOut({ scope: "local" }).catch(() => undefined);
      }
    }, outerSignal),
    consume: (confirmation, options = {}) => bounded(async signal => {
      const accepted = await rpc("code3_consume_account_confirmation", {
        challenge_id: confirmation.challengeId, confirmation_token: confirmation.grant,
        operation_purpose: confirmation.purpose, operation_digest: confirmation.planDigest,
      }, { signal });
      if (accepted !== true) throw new Error("The account confirmation was not accepted. No records were changed.");
      return true;
    }, options.signal),
    revoke: (deviceId, confirmation, options = {}) => bounded(async signal => {
      const revoked = await rpc("code3_revoke_account_session", {
        target_id: deviceId, challenge_id: confirmation.challengeId, confirmation_token: confirmation.grant,
      }, { signal });
      if (revoked !== true) throw new Error("The device revocation could not be verified.");
      return true;
    }, options.signal),
  };
}

const accountSessions = createAccountSessionService();
export const confirmAccountOperation = (options) => accountSessions.confirm(options);
export const consumeAccountConfirmation = (confirmation, options) => accountSessions.consume(confirmation, options);
export const verifyCurrentAccount = (userId, signal) => accountSessions.currentUser(userId, signal);
export default accountSessions;
