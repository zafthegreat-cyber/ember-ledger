const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const AUTHORITY_KEYS = new Set([
  "admin", "adminaccess", "adminrole", "auth", "authenticated", "authenticatedowner", "authentication", "authorization", "authorizationheader",
  "authorized", "authorizedowner", "authority",
  "clientrole", "browserrole", "isowner", "owner", "ownerauthorized", "ownerid", "owneridentity",
  "owneridentifier", "ownerrole", "ownersubject", "owneraccess", "ownerscope", "ownerallowlist", "ownerpermissions", "permission", "permissions", "permissionlevel", "role",
  "roles", "session", "sessionid", "sessionstate", "supabasesession", "userid", "userrole",
  "securitycontext", "entitlement", "entitlements", "rawclaims", "claims", "jwt", "scope",
  "accesslevel", "acl", "accesscontrol", "elevatedrole", "hasowneraccess", "identityrole", "impersonation", "isadmin",
  "isauthorized", "issuperuser", "principal", "privilege", "privileges", "subject", "superuser", "testauth", "userauthority", "verifiedowner",
]);

const SECRET_KEYS = new Set([
  "accesstoken", "refreshtoken", "idtoken", "authtoken", "providertoken", "bearertoken",
  "password", "passwd", "pwd", "pass", "passphrase", "passcode", "securitypin", "accountpin", "secret", "clientsecret", "providersecret", "apikey",
  "privatekey", "credentials", "credential", "otp", "otppin", "onetimecode", "onetimepin",
  "securitycode", "securityanswer", "securityanswers", "verificationcode", "recoverycode",
  "resettoken", "logintoken", "loginlink", "cookie", "cookies", "sessioncookie", "cvv", "cvc",
  "cardnumber", "paymentcardnumber", "pan", "bankaccount", "routingnumber", "proxypassword",
  "proxyusername", "proxyauth", "proxyauthentication", "proxyurl", "proxyendpoint",
  "authorizationcode", "oauthcode", "oauthstate", "pkceverifier", "codeverifier",
  "bearer", "bankaccountnumber", "cardexpiry", "cardexpiration", "encryptionkey", "licensekey",
  "recoveryphrase", "routingnumber", "routingno", "bankrouting", "accountnumber", "iban", "securityquestion", "securityquestions", "seedphrase", "signingkey", "webhooksecret",
  "accesskey", "authkey", "clientkey", "providerkey", "sessionkey", "proxyuser", "proxypass",
]);

const RAW_SOURCE_KEYS = new Set([
  "raw", "rawdata", "rawcontent", "rawmessage", "rawemail", "rawemailcontent", "emailbody", "messagebody",
  "rawpayload", "rawproviderpayload", "providerpayload", "payload", "rawrequest", "rawresponse",
  "requestbody", "responsebody", "providerrequest", "providerresponse", "rawlog", "rawlogs",
  "logs", "rawbotlog", "rawbotlogs", "botlog", "botlogs", "providerlog", "providerlogs", "requestheaders", "responseheaders", "mailboxcontent",
  "raworderemail", "rawwebhookpayload", "rawbody", "emailhtml", "htmlbody", "mimebody", "headers", "request", "response", "sourcepayload", "providerdata",
]);

const NETWORK_CREDENTIAL_PATTERN = /(?:^|[?&#;]|&amp;)(?:access[-_]?token|refresh[-_]?token|id[-_]?token|api[-_]?key|client[-_]?secret|oauth[-_]?state|code[-_]?verifier|pkce[-_]?verifier|authorization[-_]?code|x[-_]?amz[-_]?(?:credential|signature)|signature|token|key|secret|password|passphrase|session|cookie|otp|code)=/i;
const CREDENTIAL_URI_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+@/i;
const AUTHORIZATION_TEXT_PATTERN = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/i;
const COOKIE_HEADER_PATTERN = /\b(?:Set-Cookie|Cookie)\s*:\s*[^\r\n]{1,500}/i;
const STRUCTURED_CREDENTIAL_PATTERN = /["']?(?:access[-_]?token|refresh[-_]?token|api[-_]?key|authorization|password|passphrase|secret|session|cookie|otp|cvv|cvc)["']?\s*(?::|=)\s*["']?[^\s"',;}]{3,}/i;
const JWT_TEXT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/;
const HIGH_CONFIDENCE_TOKEN_PATTERN = /\b(?:(?:AKIA|ASIA)[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{16,}|npm_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{16,}|(?:sk|rk)_live_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|SG\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/;
const CARD_CANDIDATE_PATTERN = /(?:^|\D)(\d(?:[ -]?\d){12,18})(?=\D|$)/g;

const AUTHORITY_KEY_FRAGMENT = /(?:accesscontrol|accesslevel|adminaccess|adminrole|authprincipal|authenticatedowner|authenticationstate|authorizationheader|authorizationstate|authorizedowner|browserrole|clientrole|elevatedrole|hasowneraccess|identityrole|impersonation|isadmin|isauthorized|isowner|issuperuser|ownerauthorized|owneraccess|ownerallowlist|ownerid|owneridentity|owneridentifier|ownerpermissions|ownerrole|ownerscope|ownersubject|permissionlevel|rawclaims|securitycontext|supabasesession|testauth|userauthority|userrole|verifiedowner)/;
const SECRET_KEY_FRAGMENT = /(?:accesskey|accesstoken|accountnumber|accountpin|apikey|authkey|authorizationcode|authtoken|bankaccount|bankrouting|bearer|cardexpiration|cardexpiry|cardnumber|clientkey|clientsecret|codeverifier|credential|cvv|cvc|encryptionkey|idtoken|licensekey|loginlink|logintoken|oauthcode|oauthstate|onetimecode|onetimepin|otp|passcode|passphrase|passwd|password|paymentcard|pkceverifier|privatekey|providerkey|providersecret|providertoken|proxyauth|proxypass|proxypassword|proxyuser|proxyusername|recoverycode|recoveryphrase|refreshtoken|resettoken|routingno|routingnumber|secret|securityanswer|securitycode|securitypin|securityquestion|seedphrase|sessioncookie|sessionkey|signingkey|verificationcode|webhooksecret)/;
const RAW_SOURCE_KEY_FRAGMENT = /(?:emailbody|emailhtml|htmlbody|mailboxcontent|messagebody|mimebody|originalemail|providerdata|providerlog|providerpayload|providerrequest|providerresponse|rawbody|rawbotlog|rawcontent|rawdata|rawemail|rawlog|rawmessage|raworderemail|rawpayload|rawrequest|rawresponse|rawwebhookpayload|requestbody|requestheaders|responsebody|responseheaders|sourcepayload)/;
const PRODUCT_CHECKSUM_IDENTIFIER_KEYS = new Set(["gtin", "upc"]);

export class PurchaseReceivingSecurityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PurchaseReceivingSecurityError";
    this.code = code;
    this.details = details;
  }
}

function normalizeKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isAuthorityKey(key) {
  const normalized = normalizeKey(key);
  return AUTHORITY_KEYS.has(normalized)
    || AUTHORITY_KEY_FRAGMENT.test(normalized)
    || /(?:auth|authorization|authentication)(?:session|state|value)$/.test(normalized)
    || /(?:^|my)(?:sessionid|sessionidentifier|sessionvalue)$/.test(normalized)
    || /(?:claim|claims|entitlement|entitlements|jwt|permission|permissions|userid)(?:data|field|value)?$/.test(normalized)
    || /^(?:account|client|browser|current|requested|supplied)(?:owner|role|authority|permission|session|auth|entitlement)/.test(normalized)
    || /^(?:my|requested|supplied)?role(?:data|field|value)?$/.test(normalized)
    || /^(?:admin|owner|role|authority|entitlement|session|principal|privilege)(?:flag|status|level|plan|data|value|field)$/.test(normalized)
    || /^is(?:authenticated|owner|admin|authorized|superuser)$/.test(normalized)
    || /^owner(?:id|subject|identity|identifier|authority|authorization|scope)$/.test(normalized);
}

function isSecretKey(key) {
  const normalized = normalizeKey(key);
  return SECRET_KEYS.has(normalized)
    || SECRET_KEY_FRAGMENT.test(normalized)
    || /^(?:my|payment|card)?pan(?:data|field|value)?$/.test(normalized)
    || /(?:access|refresh|bearer|auth|id|session|provider|oauth|api|payment|license)?token(?:value|field|data)?$/.test(normalized)
    || /(?:password|passphrase|privatekey|clientsecret|providersecret|apikey|cookie|credentials?)(?:value|field|data)?$/.test(normalized)
    || /^(?:my|user)?(?:pass|passwd|pwd)(?:value|field|data)?$/.test(normalized)
    || /^(?:otp|onetimecode|onetimepin|verificationcode|securitycode|recoverycode|cvv|cvc|cardnumber)$/.test(normalized)
    || /^(?:payment|credit|debit)?card(?:number|pan|cvv|cvc|expiry|expiration)$/.test(normalized)
    || /^proxy(?:username|password|auth|authentication|url|endpoint|host|hostname|ip|ipaddress)$/.test(normalized);
}

function isRawSourceKey(key) {
  const normalized = normalizeKey(key);
  return RAW_SOURCE_KEYS.has(normalized)
    || RAW_SOURCE_KEY_FRAGMENT.test(normalized)
    || /^(?:source|response|request|provider)(?:data|payload|body|headers|content|value|field)$/.test(normalized)
    || /^(?:original)?(?:message|email)(?:data|body|content|html)?$/.test(normalized)
    || /^(?:raw|body|message|email)(?:html|headers)$/.test(normalized)
    || /^http(?:response|request)(?:data|body|headers|content)?$/.test(normalized);
}

function luhnValid(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function isProductChecksumIdentifierKey(key) {
  return PRODUCT_CHECKSUM_IDENTIFIER_KEYS.has(normalizeKey(key));
}

function isCredentialBearingText(value, options = {}) {
  const text = String(value || "");
  const candidates = [text];
  let encoded = text;
  let encodingLimitExceeded = false;
  for (let pass = 0; pass < 8; pass += 1) {
    let decoded;
    try {
      decoded = decodeURIComponent(encoded.replaceAll("+", "%20"));
    } catch {
      // Decode valid ASCII escapes even when a separate malformed escape is present.
      decoded = encoded.replaceAll("+", " ").replace(/%([0-9a-f]{2})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
    }
    if (decoded === encoded) break;
    candidates.push(decoded);
    encoded = decoded;
  }
  try {
    encodingLimitExceeded = decodeURIComponent(encoded.replaceAll("+", "%20")) !== encoded;
  } catch {
    encodingLimitExceeded = encoded.replaceAll("+", " ").replace(/%([0-9a-f]{2})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16))) !== encoded;
  }
  return encodingLimitExceeded || candidates.some((candidate) => NETWORK_CREDENTIAL_PATTERN.test(candidate)
    || CREDENTIAL_URI_PATTERN.test(candidate)
    || AUTHORIZATION_TEXT_PATTERN.test(candidate)
    || COOKIE_HEADER_PATTERN.test(candidate)
    || STRUCTURED_CREDENTIAL_PATTERN.test(candidate)
    || JWT_TEXT_PATTERN.test(candidate)
    || PRIVATE_KEY_PATTERN.test(candidate)
    || HIGH_CONFIDENCE_TOKEN_PATTERN.test(candidate)
    || (!options.allowProductChecksum && [...candidate.matchAll(CARD_CANDIDATE_PATTERN)].some((match) => luhnValid(match[1])))
    || /\b(?:password|passphrase|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|session[ _-]?cookie|otp|cvv|cvc|card[ _-]?number)\s*(?:is|:|=)\s*\S+/i.test(candidate));
}

/** Purchase/receiving records are business metadata, never an authority, secret, or raw-source channel. */
export function assertSafePurchaseReceivingInput(value, options = {}) {
  const maximumNodes = options.maximumNodes || 12_000;
  const maximumDepth = options.maximumDepth || 16;
  const maximumArray = options.maximumArray || 1_000;
  const maximumString = options.maximumString || 16_000;
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
    if (nodes > maximumNodes) {
      throw new PurchaseReceivingSecurityError("INPUT_TOO_LARGE", "Purchase/Receiving input contains too many values.");
    }
    if (current.depth > maximumDepth) {
      throw new PurchaseReceivingSecurityError("INPUT_TOO_DEEP", `Purchase/Receiving input is too deeply nested at ${current.path}.`);
    }

    if (current.value == null || ["string", "number", "boolean"].includes(typeof current.value)) {
      if (typeof current.value === "number" && !Number.isFinite(current.value)) {
        throw new PurchaseReceivingSecurityError("NON_FINITE_NUMBER", `A non-finite number was supplied at ${current.path}.`);
      }
      if (typeof current.value === "number" && !Number.isSafeInteger(current.value)) {
        throw new PurchaseReceivingSecurityError("UNSAFE_NUMBER", `A non-integer or unsafe numeric value was supplied at ${current.path}.`);
      }
      if (typeof current.value === "number" && Number.isSafeInteger(current.value) && !isProductChecksumIdentifierKey(current.key) && luhnValid(current.value)) {
        throw new PurchaseReceivingSecurityError("PAYMENT_VALUE_REJECTED", `Payment-card-like data was supplied at ${current.path}.`);
      }
      if (typeof current.value === "string") {
        if (current.value.length > maximumString) {
          throw new PurchaseReceivingSecurityError("STRING_TOO_LONG", `An oversized string was supplied at ${current.path}.`);
        }
        if (isCredentialBearingText(current.value, { allowProductChecksum: isProductChecksumIdentifierKey(current.key) })) {
          throw new PurchaseReceivingSecurityError("CREDENTIAL_TEXT_REJECTED", `Credential-bearing text was supplied at ${current.path}.`);
        }
      }
      continue;
    }

    if (typeof current.value !== "object") {
      throw new PurchaseReceivingSecurityError("UNSUPPORTED_VALUE", `An unsupported value was supplied at ${current.path}.`);
    }
    if (ancestors.has(current.value)) {
      throw new PurchaseReceivingSecurityError("CYCLIC_INPUT", `Cyclic input was supplied at ${current.path}.`);
    }
    ancestors.add(current.value);
    stack.push({ ...current, exit: true });

    if (Array.isArray(current.value)) {
      if (current.value.length > maximumArray) {
        throw new PurchaseReceivingSecurityError("ARRAY_TOO_LARGE", `An oversized array was supplied at ${current.path}.`);
      }
    } else {
      const prototype = Object.getPrototypeOf(current.value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new PurchaseReceivingSecurityError("UNSAFE_OBJECT", `A plain object is required at ${current.path}.`);
      }
    }

    for (const key of Object.keys(current.value)) {
      const path = Array.isArray(current.value) ? `${current.path}[${key}]` : `${current.path}.${key}`;
      if (DANGEROUS_KEYS.has(key)) {
        throw new PurchaseReceivingSecurityError("PROTOTYPE_KEY_REJECTED", `A prohibited key was supplied at ${path}.`, { path });
      }
      if (!Array.isArray(current.value) && isAuthorityKey(key)) {
        throw new PurchaseReceivingSecurityError(
          "AUTHORITY_FIELD_REJECTED",
          "Owner, role, session, claim, and entitlement authority cannot be supplied through Purchase/Receiving records.",
          { path },
        );
      }
      if (!Array.isArray(current.value) && isSecretKey(key)) {
        throw new PurchaseReceivingSecurityError(
          "SECRET_FIELD_REJECTED",
          "Payment, retailer, provider, proxy, and authentication secrets cannot be stored in Purchase/Receiving records.",
          { path },
        );
      }
      if (!Array.isArray(current.value) && isRawSourceKey(key)) {
        throw new PurchaseReceivingSecurityError(
          "RAW_SOURCE_DATA_REJECTED",
          "Raw email, bot, provider payload, request/response, and log data cannot be stored in Purchase/Receiving records.",
          { path },
        );
      }
      stack.push({ value: current.value[key], path, key, depth: current.depth + 1 });
    }
  }
  return value;
}

export function safePurchaseReceivingClone(value) {
  assertSafePurchaseReceivingInput(value);
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function sanitizePurchaseReceivingNote(value, fallback = "Details were unavailable.") {
  const text = String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  return text && !isCredentialBearingText(text) ? text : fallback;
}
