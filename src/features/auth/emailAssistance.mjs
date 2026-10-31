export const EMAIL_REQUEST_COOLDOWN_MS = 60_000;
export const isAuthEmail = value => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

// Never display upstream messages: they can contain identifiers or reveal account existence.
export function safeAuthMessage(error, operation = "login") {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "");
  if (/rate_limit|over_email_send_rate_limit/.test(code) || /rate limit|too many requests/i.test(message)) return "Please wait a minute before trying again.";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) return "Confirm your email before logging in. Open Email confirmation help below to request a fresh link.";
  if (code === "weak_password" || /password.*(weak|short|least|minimum)/i.test(message)) return "Use a strong password with at least 8 characters.";
  if (operation === "signup") return "We couldn’t complete sign-up. Check your details, or use Log In or Forgot password if you already have an account.";
  if (operation === "recovery") return "We couldn’t request a reset link right now. Wait a minute, then try again or contact support.";
  return "We couldn’t log you in. Check your email and password, or use Forgot password for help.";
}

const result = (ok, message) => ({ ok, message });
export function createEmailRequestController({ now = Date.now, cooldownMs = EMAIL_REQUEST_COOLDOWN_MS, timeoutMs = 12_000 } = {}) {
  let pending = false, nextAllowedAt = 0;
  return {
    async send({ auth, kind, email, redirectTo }) {
      if (!["confirmation", "recovery"].includes(kind) || !isAuthEmail(email)) return result(false, "Enter a valid email address.");
      if (!auth || typeof auth.resend !== "function" || typeof auth.resetPasswordForEmail !== "function") return result(false, "Email help is unavailable right now. Try again later or contact support.");
      if (pending || now() < nextAllowedAt) return result(false, "Please wait a minute before requesting another email.");
      pending = true;
      nextAllowedAt = now() + cooldownMs;
      let timer;
      // On timeout the UI recovers, but keep the duplicate guard until the SDK request settles.
      const request = Promise.resolve().then(() => kind === "confirmation"
        ? auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: redirectTo } })
        : auth.resetPasswordForEmail(email.trim(), { redirectTo }))
        .then(value => ({ type: "response", value }), () => ({ type: "network" }))
        .finally(() => { pending = false; });
      const outcome = await Promise.race([request, new Promise(resolve => { timer = setTimeout(() => resolve({ type: "timeout" }), timeoutMs); })]);
      clearTimeout(timer);
      if (outcome.type === "timeout") return result(false, "The email request is taking longer than expected. It may still arrive. Wait a minute before trying again.");
      if (outcome.type === "network") return result(false, "The email request could not be confirmed. It may still arrive. Check your connection and wait a minute before trying again.");
      const error = outcome.value?.error;
      if (error && (error.status === 0 || error.name === "AuthRetryableFetchError")) return result(false, "The email request could not be confirmed. It may still arrive. Check your connection and wait a minute before trying again.");
      if (error && (error.status === 429 || /rate_limit/.test(error.code || ""))) return result(false, "Please wait a minute before requesting another email.");
      // Hide unknown/confirmed/nonexistent email distinctions, including provider errors.
      if (error && Number(error.status) >= 500) return result(false, "Email help is temporarily unavailable. Try again in a minute or contact support.");
      return result(true, kind === "confirmation"
        ? "If this email has an unconfirmed account, a fresh confirmation link will arrive. Check your inbox and spam folder, then use the newest link."
        : "If an account can receive a reset email, a link will arrive. Check your inbox and spam folder, then use the newest link.");
    },
  };
}

// Read only known failure codes, never raw callback descriptions or credentials.
export function expiredEmailLink(locationLike) {
  try {
    const url = new URL(locationLike.href);
    if (!["/", "/reset-password"].includes(url.pathname)) return false;
    const query = url.searchParams, hash = new URLSearchParams(url.hash.slice(1));
    return [query.get("error_code"), hash.get("error_code")].some(code => ["otp_expired", "email_link_invalid", "otp_disabled"].includes(code));
  } catch { return false; }
}
