const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const AUTHORITY_KEYS = new Set([
  "auth", "authenticated", "authentication", "authorization", "authorizationheader",
  "bearer", "bearertoken", "cookie", "impersonation", "isauthorized", "owner",
  "ownerauthorized", "ownerid", "owneridentifier", "owneridentity", "ownerrole",
  "ownersubject", "permission", "permissions", "role", "roles", "securitycontext",
  "session", "sessionid", "sessionstate", "supabasesession", "userid",
]);
const SECRET_KEYS = new Set([
  "accesstoken", "refreshtoken", "idtoken", "authtoken", "clientsecret", "providersecret",
  "password", "passphrase", "privatekey", "apikey", "otp", "onetimecode", "onetimepin",
  "verificationcode", "securitycode", "recoverycode", "resettoken", "loginlink", "oauthstate",
  "csrfstate", "stateverifier", "pkceverifier", "codeverifier", "codechallenge",
  "authorizationcode", "oauthcode", "accesscredential", "clientcredential", "providercredential",
]);
const RAW_CONTENT_KEYS = new Set([
  "body", "rawbody", "rawcontent", "html", "textcontent", "messagebody", "content",
]);

export class InboxOrderSecurityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "InboxOrderSecurityError";
    this.code = code;
    this.details = details;
  }
}

function normalizedKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function authorityKey(key) {
  const normalized = normalizedKey(key);
  return AUTHORITY_KEYS.has(normalized)
    || /^(?:client|browser|requested|supplied)(?:owner|role|permission|session|auth)/.test(normalized);
}

function secretKey(key) {
  const normalized = normalizedKey(key);
  if (SECRET_KEYS.has(normalized)) return true;
  return /(?:access|refresh|bearer|auth|id|session|provider|oauth|api)?token$/.test(normalized)
    || /^(?:authorization|oauth|verification|security|recovery|reset)code$/.test(normalized)
    || /(?:password|passphrase|privatekey|clientsecret|providersecret|apikey)$/.test(normalized)
    || /^(?:otp|onetimecode|onetimepin|verificationcode|securitycode|recoverycode)$/.test(normalized);
}

/**
 * Inbox/order records are evidence, never an owner-authority or secret channel.
 * Raw content is accepted only at the normalization boundary and must not pass
 * through to a persisted record.
 */
export function assertSafeInboxOrderInput(value, options = {}) {
  const stack = [{ value, path: options.path || "$", depth: 0 }];
  const ancestors = new Set();
  let nodes = 0;

  while (stack.length) {
    const current = stack.pop();
    if (current.exit) {
      ancestors.delete(current.value);
      continue;
    }
    nodes += 1;
    if (nodes > (options.maximumNodes || 10_000)) {
      throw new InboxOrderSecurityError("INPUT_TOO_LARGE", "Inbox/order input contains too many values.");
    }
    if (current.depth > (options.maximumDepth || 16)) {
      throw new InboxOrderSecurityError("INPUT_TOO_DEEP", `Inbox/order input is too deeply nested at ${current.path}.`);
    }
    if (current.value == null || ["string", "number", "boolean"].includes(typeof current.value)) {
      if (typeof current.value === "number" && !Number.isFinite(current.value)) {
        throw new InboxOrderSecurityError("NON_FINITE_NUMBER", `A non-finite number was supplied at ${current.path}.`);
      }
      if (typeof current.value === "string" && current.value.length > (options.maximumString || 32_000)) {
        throw new InboxOrderSecurityError("STRING_TOO_LONG", `An oversized string was supplied at ${current.path}.`);
      }
      if (typeof current.value === "string" && options.allowRawContent !== true
        && /https?:\/\/[^\s]+[?&](?:access_?token|refresh_?token|token|code|key|secret|password|session)=/i.test(current.value)) {
        throw new InboxOrderSecurityError("CREDENTIAL_URL_REJECTED", `A credential-bearing URL was supplied at ${current.path}.`);
      }
      continue;
    }
    if (typeof current.value !== "object") {
      throw new InboxOrderSecurityError("UNSUPPORTED_VALUE", `An unsupported value was supplied at ${current.path}.`);
    }
    if (ancestors.has(current.value)) {
      throw new InboxOrderSecurityError("CYCLIC_INPUT", `Cyclic input was supplied at ${current.path}.`);
    }
    ancestors.add(current.value);
    stack.push({ ...current, exit: true });

    if (!Array.isArray(current.value)) {
      const prototype = Object.getPrototypeOf(current.value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new InboxOrderSecurityError("UNSAFE_OBJECT", `A plain object is required at ${current.path}.`);
      }
    } else if (current.value.length > (options.maximumArray || 5_000)) {
      throw new InboxOrderSecurityError("ARRAY_TOO_LARGE", `An oversized array was supplied at ${current.path}.`);
    }

    for (const key of Object.keys(current.value)) {
      const path = Array.isArray(current.value) ? `${current.path}[${key}]` : `${current.path}.${key}`;
      if (DANGEROUS_KEYS.has(key)) {
        throw new InboxOrderSecurityError("PROTOTYPE_KEY_REJECTED", `A prohibited key was supplied at ${path}.`, { path });
      }
      if (!Array.isArray(current.value) && authorityKey(key)) {
        throw new InboxOrderSecurityError(
          "AUTHORITY_FIELD_REJECTED",
          "Owner, role, session, and authentication authority cannot be supplied through inbox/order records.",
          { path },
        );
      }
      if (!Array.isArray(current.value) && secretKey(key)) {
        throw new InboxOrderSecurityError(
          "SECRET_FIELD_REJECTED",
          "Passwords, tokens, OTPs, and provider secrets cannot be stored in inbox/order records.",
          { path },
        );
      }
      if (!Array.isArray(current.value) && RAW_CONTENT_KEYS.has(normalizedKey(key)) && options.allowRawContent !== true) {
        throw new InboxOrderSecurityError(
          "RAW_CONTENT_REJECTED",
          "Raw message content is allowed only at the bounded normalization boundary.",
          { path },
        );
      }
      stack.push({ value: current.value[key], path, depth: current.depth + 1 });
    }
  }
  return value;
}

export function safeInboxOrderClone(value, options = {}) {
  assertSafeInboxOrderInput(value, options);
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function containsProtectedSecretText(value) {
  const text = String(value || "");
  return /\b(?:otp|one[ -]?time|verification|security|login|recovery|reset)\s+(?:code|pin|link|token)\b/i.test(text)
    || /\b(?:security alert|account recovery|payment security|suspicious (?:login|activity)|new sign[ -]?in)\b/i.test(text)
    || /(?:\?|&)(?:token|code|otp|key)=[^\s&#]+/i.test(text)
    || /\b(?:code|pin)\s*(?:is|:)?\s*\d{4,8}\b/i.test(text)
    || /\b\d{4,8}\s+(?:is\s+)?(?:your\s+)?(?:[a-z0-9-]+\s+){0,3}(?:code|pin)\b/i.test(text);
}
