const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const AUTHORITY_KEYS = new Set([
  "auth", "authenticated", "authentication", "authorization", "authorizationheader", "bearer", "bearertoken",
  "browserrole", "clientrole", "cookie", "impersonation", "isauthorized", "isowner", "ownerauthorized", "owner", "ownerid", "owneridentity",
  "owneridentifier", "ownerallowlist", "ownersubject", "permission", "permissions", "role", "roles",
  "ownerpermission", "ownerpermissions", "ownerrole", "authorizedowner", "authenticatedowner", "securitycontext", "session", "sessionid", "sessionstate", "supabasesession", "testauth", "token", "userid", "userrole",
]);
const AUTHORITY_KEY_PATTERN = /(?:owner(?:id|subject|identity|identifier|allowlist|authority|authorization|scope)|userauthority|securitycontext)$/i;
const SECRET_KEY_PATTERN = /(?:^|_)(?:access.?token|refresh.?token|id.?token|auth.?token|password|passphrase|secret|api.?key|private.?key|otp|cvv|credentials?|session)(?:$|_)/i;
const NORMALIZED_SECRET_KEY_PATTERN = /(?:password|passphrase|passcode|secret|apikey|privatekey|otp|otppin|onetimecode|onetimepin|smscode|authcode|authenticationcode|securitycode|verificationcode|verificationpin|cvv|cvc|credentials?|session|token|cookie|captcha)/i;
const SAFE_REFERENCE_KEYS = new Set(["credentialreference", "credentialprovider", "credentialreferenceid"]);

export class AccountOpsSecurityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AccountOpsSecurityError";
    this.code = code;
    this.details = details;
  }
}

function normalizedKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function keyContainsSecret(key) {
  const normalized = normalizedKey(key);
  if (SAFE_REFERENCE_KEYS.has(normalized)) return false;
  return SECRET_KEY_PATTERN.test(String(key))
    || NORMALIZED_SECRET_KEY_PATTERN.test(normalized);
}

function keyContainsAuthority(key) {
  const normalized = normalizedKey(key);
  return AUTHORITY_KEYS.has(normalized) || AUTHORITY_KEY_PATTERN.test(normalized);
}

/** Account Ops records are business metadata, never an authorization or secret channel. */
export function assertSafeAccountOpsInput(value, options = {}) {
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
    if (nodes > 10_000) throw new AccountOpsSecurityError("INPUT_TOO_LARGE", "Account Ops input contains too many values.");
    if (current.depth > 16) throw new AccountOpsSecurityError("INPUT_TOO_DEEP", `Account Ops input is too deeply nested at ${current.path}.`);
    if (current.value == null || ["string", "number", "boolean"].includes(typeof current.value)) {
      if (typeof current.value === "number" && !Number.isFinite(current.value)) {
        throw new AccountOpsSecurityError("NON_FINITE_NUMBER", `Account Ops input contains a non-finite number at ${current.path}.`);
      }
      if (typeof current.value === "string" && current.value.length > 32_000) {
        throw new AccountOpsSecurityError("STRING_TOO_LONG", `Account Ops input contains an oversized string at ${current.path}.`);
      }
      continue;
    }
    if (typeof current.value !== "object") {
      throw new AccountOpsSecurityError("UNSUPPORTED_VALUE", `Account Ops input contains an unsupported value at ${current.path}.`);
    }
    if (ancestors.has(current.value)) throw new AccountOpsSecurityError("CYCLIC_INPUT", `Account Ops input is cyclic at ${current.path}.`);
    ancestors.add(current.value);
    stack.push({ ...current, exit: true });

    if (!Array.isArray(current.value)) {
      const prototype = Object.getPrototypeOf(current.value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new AccountOpsSecurityError("UNSAFE_OBJECT", `Account Ops input at ${current.path} must be a plain object.`);
      }
    } else if (current.value.length > 5_000) {
      throw new AccountOpsSecurityError("ARRAY_TOO_LARGE", `Account Ops input contains an oversized array at ${current.path}.`);
    }

    for (const key of Object.keys(current.value)) {
      const path = Array.isArray(current.value) ? `${current.path}[${key}]` : `${current.path}.${key}`;
      if (DANGEROUS_KEYS.has(key)) throw new AccountOpsSecurityError("PROTOTYPE_KEY_REJECTED", `A prohibited key was supplied at ${path}.`, { path });
      if (!Array.isArray(current.value) && keyContainsAuthority(key)) {
        throw new AccountOpsSecurityError("AUTHORITY_FIELD_REJECTED", "Owner and authentication authority cannot be supplied through Account Ops records.", { path });
      }
      if (!Array.isArray(current.value) && keyContainsSecret(key)) {
        throw new AccountOpsSecurityError("SECRET_FIELD_REJECTED", "Passwords, tokens, sessions, OTPs, and provider secrets cannot be stored in Account Ops.", { path });
      }
      stack.push({ value: current.value[key], path, depth: current.depth + 1 });
    }
  }
  return value;
}

export function safeAccountOpsClone(value) {
  assertSafeAccountOpsInput(value);
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
