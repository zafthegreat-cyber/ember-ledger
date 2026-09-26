const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const AUTHORITY_KEYS = new Set([
  "auth", "authenticated", "authentication", "authorization", "authorizationheader",
  "bearer", "bearertoken", "clientrole", "browserrole", "impersonation", "isauthorized",
  "isowner", "owner", "ownerauthorized", "ownerid", "owneridentity", "owneridentifier",
  "ownerrole", "ownersubject", "permission", "permissions", "role", "roles", "session",
  "sessionid", "sessionstate", "supabasesession", "userid", "userrole", "securitycontext",
  "entitlement", "entitlements",
]);

const SECRET_KEYS = new Set([
  "accesstoken", "refreshtoken", "idtoken", "authtoken", "providertoken", "bearertoken",
  "password", "passphrase", "passcode", "secret", "clientsecret", "providersecret", "apikey",
  "privatekey", "credentials", "credential", "otp", "otppin", "onetimecode", "onetimepin",
  "securitycode", "verificationcode", "recoverycode", "resettoken", "logintoken", "loginlink",
  "cookie", "cookies", "sessioncookie", "cvv", "cvc", "cardnumber", "paymentcardnumber",
  "pan", "proxyusername", "proxypassword", "proxyauth", "proxyauthentication", "proxyurl",
  "proxyendpoint", "authorizationcode", "oauthcode", "oauthstate", "pkceverifier", "codeverifier",
]);

const RAW_PROVIDER_KEYS = new Set([
  "raw", "rawdata", "rawpayload", "rawproviderpayload", "providerpayload", "payload",
  "rawrequest", "rawresponse", "requestbody", "responsebody", "providerrequest", "providerresponse",
  "rawlog", "rawlogs", "logs", "providerlog", "providerlogs", "requestheaders", "responseheaders",
]);

const NETWORK_CREDENTIAL_PATTERN = /(?:^|[?&#])(?:access_?token|refresh_?token|token|key|secret|password|passphrase|session|cookie|otp|code)=/i;
const PROXY_URI_PATTERN = /\b(?:https?|socks4?|socks5):\/\/[^\s/@]+:[^\s/@]+@/i;

export class BotOpsSecurityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "BotOpsSecurityError";
    this.code = code;
    this.details = details;
  }
}

function normalizedKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isAuthorityKey(key) {
  const normalized = normalizedKey(key);
  return AUTHORITY_KEYS.has(normalized)
    || /^(?:client|browser|requested|supplied)(?:owner|role|permission|session|auth|entitlement)/.test(normalized)
    || /^owner(?:id|subject|identity|identifier|authority|authorization|scope)$/.test(normalized);
}

function isSecretKey(key) {
  const normalized = normalizedKey(key);
  return SECRET_KEYS.has(normalized)
    || /(?:access|refresh|bearer|auth|id|session|provider|oauth|api)?token$/.test(normalized)
    || /(?:password|passphrase|privatekey|clientsecret|providersecret|apikey|cookie|credentials?)$/.test(normalized)
    || /^(?:otp|onetimecode|onetimepin|verificationcode|securitycode|recoverycode|cvv|cvc|cardnumber)$/.test(normalized)
    || /^proxy(?:username|password|auth|authentication|url|endpoint|host|hostname|ip|ipaddress)$/.test(normalized);
}

function isRawProviderKey(key) {
  return RAW_PROVIDER_KEYS.has(normalizedKey(key));
}

function credentialBearingText(value) {
  const text = String(value || "");
  return NETWORK_CREDENTIAL_PATTERN.test(text)
    || PROXY_URI_PATTERN.test(text)
    || /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/i.test(text)
    || /\b(?:password|passphrase|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|session[ _-]?cookie|otp|cvv|cvc|card[ _-]?number)\s*(?:is|:|=)\s*\S+/i.test(text)
    || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text);
}

/** Bot records are normalized metadata, never an authority, credential, raw-log, or raw-payload channel. */
export function assertSafeBotOpsInput(value, options = {}) {
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
      throw new BotOpsSecurityError("INPUT_TOO_LARGE", "Bot Operations input contains too many values.");
    }
    if (current.depth > (options.maximumDepth || 16)) {
      throw new BotOpsSecurityError("INPUT_TOO_DEEP", `Bot Operations input is too deeply nested at ${current.path}.`);
    }
    if (current.value == null || ["string", "number", "boolean"].includes(typeof current.value)) {
      if (typeof current.value === "number" && !Number.isFinite(current.value)) {
        throw new BotOpsSecurityError("NON_FINITE_NUMBER", `A non-finite number was supplied at ${current.path}.`);
      }
      if (typeof current.value === "string") {
        if (current.value.length > (options.maximumString || 32_000)) {
          throw new BotOpsSecurityError("STRING_TOO_LONG", `An oversized string was supplied at ${current.path}.`);
        }
        if (credentialBearingText(current.value)) {
          throw new BotOpsSecurityError("CREDENTIAL_TEXT_REJECTED", `Credential-bearing text was supplied at ${current.path}.`);
        }
      }
      continue;
    }
    if (typeof current.value !== "object") {
      throw new BotOpsSecurityError("UNSUPPORTED_VALUE", `An unsupported value was supplied at ${current.path}.`);
    }
    if (ancestors.has(current.value)) {
      throw new BotOpsSecurityError("CYCLIC_INPUT", `Cyclic input was supplied at ${current.path}.`);
    }
    ancestors.add(current.value);
    stack.push({ ...current, exit: true });

    if (!Array.isArray(current.value)) {
      const prototype = Object.getPrototypeOf(current.value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new BotOpsSecurityError("UNSAFE_OBJECT", `A plain object is required at ${current.path}.`);
      }
    } else if (current.value.length > (options.maximumArray || 1_000)) {
      throw new BotOpsSecurityError("ARRAY_TOO_LARGE", `An oversized array was supplied at ${current.path}.`);
    }

    for (const key of Object.keys(current.value)) {
      const path = Array.isArray(current.value) ? `${current.path}[${key}]` : `${current.path}.${key}`;
      if (DANGEROUS_KEYS.has(key)) {
        throw new BotOpsSecurityError("PROTOTYPE_KEY_REJECTED", `A prohibited key was supplied at ${path}.`, { path });
      }
      if (!Array.isArray(current.value) && isAuthorityKey(key)) {
        throw new BotOpsSecurityError("AUTHORITY_FIELD_REJECTED", "Owner, role, session, and entitlement authority cannot be supplied through Bot Operations records.", { path });
      }
      if (!Array.isArray(current.value) && isSecretKey(key)) {
        throw new BotOpsSecurityError("SECRET_FIELD_REJECTED", "Bot, retailer, payment, proxy, and authentication secrets cannot be stored in Bot Operations.", { path });
      }
      if (!Array.isArray(current.value) && isRawProviderKey(key)) {
        throw new BotOpsSecurityError("RAW_PROVIDER_DATA_REJECTED", "Raw provider payloads, request/response bodies, and logs cannot be stored in Bot Operations.", { path });
      }
      stack.push({ value: current.value[key], path, depth: current.depth + 1 });
    }
  }
  return value;
}

export function safeBotOpsClone(value) {
  assertSafeBotOpsInput(value);
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function sanitizeBotProviderMessage(value, fallback = "Provider status was unavailable.") {
  const normalized = String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!normalized || credentialBearingText(normalized)) return fallback;
  return normalized;
}
