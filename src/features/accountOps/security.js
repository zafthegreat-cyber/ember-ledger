const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// These names describe bounded metadata or a reference to an external secure
// store. They do not authorize storing the referenced secret itself.
const SAFE_REFERENCE_KEYS = new Set([
  "credentialreference",
  "credentialprovider",
  "credentialreferenceid",
]);

// Phase 2A.6-A uses these exact structural names. Keep this list narrow so a
// harmless collection name such as `paymentCards` does not become a loophole
// for fields such as `paymentCardNumber`.
const SAFE_STRUCTURAL_KEYS = new Set([
  "accountcreationplans",
  "phoneresources",
  "paymentcards",
  "verificationactions",
  "proxygroupviews",
  "exportreadiness",
  "webhookintegrations",
  "serverrecords",
  "cloudtemplates",
  "remoteaccessrecords",
  "browserworkspaces",
  "orderviews",
  "notificationpreferences",
]);

// Normalized projections use these fixed-false assertions to make exclusions
// visible to callers. They are allowed only as literal false; they cannot carry
// or claim the sensitive data named by the key.
const SAFE_FALSE_ONLY_KEYS = new Set([
  "automaticcaptchasolving",
  "automaticmfa",
  "browserfingerprintevasion",
  "containsauthentication",
  "containsendpoint",
  "containsfullcardnumber",
  "containsphonenumber",
  "containssecret",
  "containssecuritycode",
  "containsverificationvalue",
  "livebotconnection",
  "livemailboxconnection",
  "liveretaileraccountcreation",
  "productionmutation",
  "providerexportwrite",
  "remoteaccessconnection",
  "remotepersistence",
  "secretstorage",
  "serverprovisioning",
  "webhookendpointconfiguration",
]);

const AUTHORITY_KEYS = new Set([
  "accesscontrol", "accesslevel", "admin", "adminaccess", "adminrole", "auth", "authenticated", "authenticatedowner",
  "authentication", "authorization", "authorizationheader", "authorized", "authorizedowner", "authority", "browserrole",
  "clientrole", "entitlement", "entitlements", "hasowneraccess", "impersonation", "isadmin", "isauthorized", "isowner",
  "issuperuser", "ownerauthorized", "owner", "owneraccess", "ownerallowlist", "ownerid", "owneridentity", "owneridentifier",
  "ownerpermission", "ownerpermissions", "ownerrole", "ownerscope", "ownersubject", "permission", "permissions",
  "permissionlevel", "principal", "privilege", "privileges", "rawclaims", "role", "roles", "securitycontext", "session",
  "sessionid", "sessionstate", "supabasesession", "testauth", "userauthority", "userid", "userrole", "verifiedowner",
]);

const SECRET_KEYS = new Set([
  "accesskey", "accesstoken", "accountnumber", "accountpin", "apikey", "authkey", "authorizationcode", "authtoken",
  "bankaccount", "bankaccountnumber", "bankrouting", "bearer", "bearertoken", "botlicense", "botlicensekey",
  "captchacode", "captcharesponse", "captchasolution", "captchatoken", "cardnumber", "cardsecuritycode", "clientkey",
  "clientsecret", "codeverifier", "cookie", "cookies", "credential", "credentials", "creditcardnumber", "cvc", "cvv",
  "debitcardnumber", "encryptionkey", "idtoken", "iban", "licensekey", "licensesecret", "licensetoken", "loginlink",
  "logintoken", "oauthcode", "oauthstate", "onetimecode", "onetimepassword", "onetimepin", "otp", "otpcode",
  "otppin", "otptoken", "pan", "pass", "passcode", "passphrase", "passwd", "password", "paymentcardnumber",
  "paymentcredential", "paymentcredentials", "pkceverifier", "plaintextpassword", "primaryaccountnumber", "privatekey",
  "providercredentials", "providerkey", "providersecret", "providertoken", "proxyauth", "proxyauthentication", "proxyendpoint",
  "proxyhost", "proxyhostname", "proxyip", "proxyipaddress", "proxypass", "proxypassword", "proxyurl", "proxyuser",
  "proxyusername", "pwd", "recoverycode", "recoverycodes", "recoveryphrase", "refreshtoken", "resettoken",
  "retailercookie", "retailercredentials", "retailerpassword", "routingno", "routingnumber", "secret", "securityanswer",
  "securityanswers", "securitycode", "securitypin", "seedphrase", "sessioncookie", "sessionkey", "sessiontoken", "signingkey",
  "smscode", "temporarypassword", "token", "verificationcode", "verificationpin", "webhooksecret",
]);

const RAW_SOURCE_KEYS = new Set([
  "emailbody", "emailhtml", "headers", "htmlbody", "httpresponse", "httprequest", "logs", "mailboxcontent",
  "messagebody", "mimebody", "originalemail", "payload", "providerdata", "providerlog", "providerlogs", "providerpayload",
  "providerrequest", "providerresponse", "raw", "rawbody", "rawbotlog", "rawbotlogs", "rawbotpayload", "rawcontent",
  "rawdata", "rawemail", "rawemailbody", "rawemailcontent", "rawlog", "rawlogs", "rawmessage", "rawmessagebody",
  "rawmessagecontent", "raworderemail", "rawpayload", "rawproviderlog", "rawproviderlogs", "rawproviderpayload",
  "rawproviderrequest", "rawproviderresponse", "rawrequest", "rawresponse", "rawsourcepayload", "rawwebhookpayload",
  "request", "requestbody", "requestheaders", "response", "responsebody", "responseheaders", "sourcepayload",
]);

const PRODUCT_CHECKSUM_IDENTIFIER_KEYS = new Set(["gtin", "productid", "retaileritemid", "sku", "tcin", "upc"]);

const AUTHORITY_KEY_FRAGMENT = /(?:accesscontrol|accesslevel|adminaccess|adminrole|authprincipal|authenticatedowner|authenticationstate|authorizationheader|authorizationstate|authorizedowner|browserrole|clientrole|elevatedrole|hasowneraccess|identityrole|impersonation|isadmin|isauthorized|isowner|issuperuser|ownerauthorized|owneraccess|ownerallowlist|ownerid|owneridentity|owneridentifier|ownerpermissions|ownerrole|ownerscope|ownersubject|permissionlevel|rawclaims|securitycontext|supabasesession|testauth|userauthority|userrole|verifiedowner)/;
const SECRET_KEY_FRAGMENT = /(?:accesskey|accesstoken|accountpin|apikey|authkey|authorizationcode|authtoken|bankaccount|bankrouting|bearertoken|botlicense(?:key|secret|token)|captcha(?:code|response|solution|token)|cardsecuritycode|clientkey|clientsecret|codeverifier|credential|cvv|cvc|encryptionkey|idtoken|licensekey|licensesecret|licensetoken|loginlink|logintoken|oauthcode|oauthstate|onetimecode|onetimepassword|onetimepin|passcode|passphrase|passwd|password|paymentcardnumber|paymentcredential|pkceverifier|plaintextpassword|primaryaccountnumber|privatekey|providerkey|providersecret|providertoken|proxyauth|proxyendpoint|proxyhost|proxyip|proxypass|proxypassword|proxyurl|proxyuser|proxyusername|recoverycode|recoveryphrase|refreshtoken|resettoken|retailercookie|retailercredentials|retailerpassword|routingno|routingnumber|secret|securityanswer|securitycode|securitypin|seedphrase|sessioncookie|sessionkey|sessiontoken|signingkey|smscode|temporarypassword|verificationcode|verificationpin|webhooksecret)/;
const RAW_SOURCE_KEY_FRAGMENT = /(?:emailbody|emailhtml|htmlbody|mailboxcontent|messagebody|mimebody|originalemail|providerdata|providerlog|providerpayload|providerrequest|providerresponse|rawbody|rawbotlog|rawcontent|rawdata|rawemail|rawlog|rawmessage|raworderemail|rawpayload|rawprovider|rawrequest|rawresponse|rawsourcepayload|rawwebhookpayload|requestbody|requestheaders|responsebody|responseheaders|sourcepayload)/;

const CREDENTIAL_URI_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+@/i;
const AUTHENTICATED_PROXY_PATTERN = /\b[^\s:@/?#]+:[^\s:@/?#]+@[a-z0-9.-]+:\d{2,5}\b/i;
const NETWORK_CREDENTIAL_PATTERN = /(?:^|[?&#;]|&amp;)(?:access[-_]?token|refresh[-_]?token|id[-_]?token|api[-_]?key|client[-_]?secret|oauth[-_]?state|code[-_]?verifier|pkce[-_]?verifier|authorization[-_]?code|x[-_]?amz[-_]?(?:credential|signature)|signature|token|key|secret|password|passphrase|session|cookie|otp|captcha[-_]?(?:response|solution|token))=/i;
const AUTHORIZATION_TEXT_PATTERN = /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]{8,}|Basic\s+(?=[A-Za-z0-9+/=]{8,}(?:\s|$))(?=[A-Za-z0-9+/=]*[A-Z0-9+/=])[A-Za-z0-9+/=]{8,})/;
const COOKIE_HEADER_PATTERN = /\b(?:Set-Cookie|Cookie)\s*:\s*[^\r\n]{1,500}/i;
const STRUCTURED_CREDENTIAL_PATTERN = /["']?(?:access[-_ ]?token|refresh[-_ ]?token|api[-_ ]?key|authorization|password|passphrase|secret|session[-_ ]?cookie|cookie|otp|one[-_ ]?time[-_ ]?(?:code|password|pin)|verification[-_ ]?code|recovery[-_ ]?code|captcha[-_ ]?(?:response|solution|token)|cvv|cvc|card[-_ ]?number|proxy[-_ ]?(?:username|password|authorization)|bot[-_ ]?license|license[-_ ]?key)["']?\s*(?::|=)\s*["']?[^\s"',;}]{3,}/i;
const LABELED_CREDENTIAL_TEXT_PATTERN = /\b(?:password|passphrase|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|session[ _-]?cookie|otp|one[ _-]?time[ _-]?(?:code|password|pin)|verification[ _-]?code|captcha[ _-]?(?:response|solution|token)|cvv|cvc|card[ _-]?number|proxy[ _-]?(?:username|password|authorization)|bot[ _-]?license|license[ _-]?key)\s+is\s+(?!not\b|never\b|redacted\b|omitted\b|unavailable\b)[^\s,;.]+/i;
const JWT_TEXT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/;
const HIGH_CONFIDENCE_TOKEN_PATTERN = /\b(?:(?:AKIA|ASIA)[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{16,}|npm_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{16,}|(?:sk|rk)_live_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|SG\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/;
const CARD_CANDIDATE_PATTERN = /(?:^|\D)(\d(?:[ -]?\d){12,18})(?=\D|$)/g;

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
  if (SAFE_REFERENCE_KEYS.has(normalized) || SAFE_STRUCTURAL_KEYS.has(normalized) || SAFE_FALSE_ONLY_KEYS.has(normalized)) return false;
  return SECRET_KEYS.has(normalized)
    || SECRET_KEY_FRAGMENT.test(normalized)
    || /^(?:my|payment|card)?pan(?:data|field|value)?$/.test(normalized)
    || /(?:access|refresh|bearer|auth|id|session|provider|oauth|api|payment|license)?token(?:data|field|value)?$/.test(normalized)
    || /(?:password|passphrase|privatekey|clientsecret|providersecret|apikey|cookie|credentials?)(?:data|field|value)?$/.test(normalized)
    || /^(?:my|user)?(?:pass|passwd|pwd)(?:data|field|value)?$/.test(normalized)
    || /^(?:account|email|mfa|my|sms|verification)?otp(?:code|data|field|pin|token|value)?$/.test(normalized)
    || /^(?:payment|credit|debit)?card(?:number|pan|cvv|cvc)$/.test(normalized)
    || /^proxy(?:username|password|auth|authentication|url|endpoint|host|hostname|ip|ipaddress)$/.test(normalized)
    || /^(?:retailer|browser|provider|bot)?session(?:cookie|id|key|token)?$/.test(normalized);
}

function keyContainsAuthority(key) {
  const normalized = normalizedKey(key);
  if (SAFE_STRUCTURAL_KEYS.has(normalized)) return false;
  return AUTHORITY_KEYS.has(normalized)
    || AUTHORITY_KEY_FRAGMENT.test(normalized)
    || /(?:auth|authorization|authentication)(?:session|state|value)$/.test(normalized)
    || /(?:claim|claims|entitlement|entitlements|jwt|permission|permissions|userid)(?:data|field|value)?$/.test(normalized)
    || /^(?:account|client|browser|current|requested|supplied)(?:owner|role|authority|permission|session|auth|entitlement)/.test(normalized)
    || /^(?:my|requested|supplied)?role(?:data|field|value)?$/.test(normalized)
    || /^(?:admin|owner|role|authority|entitlement|session|principal|privilege)(?:flag|status|level|plan|data|value|field)$/.test(normalized)
    || /^is(?:authenticated|owner|admin|authorized|superuser)$/.test(normalized)
    || /^owner(?:id|subject|identity|identifier|authority|authorization|scope)$/.test(normalized);
}

function keyContainsRawSource(key) {
  const normalized = normalizedKey(key);
  if (SAFE_STRUCTURAL_KEYS.has(normalized)) return false;
  return RAW_SOURCE_KEYS.has(normalized)
    || RAW_SOURCE_KEY_FRAGMENT.test(normalized)
    || /^(?:source|response|request|provider)(?:data|payload|body|headers|content|value|field)$/.test(normalized)
    || /^(?:original)?(?:message|email)(?:data|body|content|html)$/.test(normalized)
    || /^http(?:response|request)(?:data|body|headers|content)$/.test(normalized);
}

function luhnValid(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function isProductChecksumIdentifierKey(key) {
  return PRODUCT_CHECKSUM_IDENTIFIER_KEYS.has(normalizedKey(key));
}

function containsCredentialText(value, { allowProductChecksum = false } = {}) {
  const candidates = [String(value || "")];
  let encoded = candidates[0];
  let encodingLimitExceeded = false;

  for (let pass = 0; pass < 8; pass += 1) {
    let decoded;
    try {
      decoded = decodeURIComponent(encoded.replaceAll("+", "%20"));
    } catch {
      decoded = encoded
        .replaceAll("+", " ")
        .replace(/%([0-9a-f]{2})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
    }
    if (decoded === encoded) break;
    candidates.push(decoded);
    encoded = decoded;
  }

  try {
    encodingLimitExceeded = decodeURIComponent(encoded.replaceAll("+", "%20")) !== encoded;
  } catch {
    encodingLimitExceeded = encoded
      .replaceAll("+", " ")
      .replace(/%([0-9a-f]{2})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16))) !== encoded;
  }

  return encodingLimitExceeded || candidates.some((candidate) => CREDENTIAL_URI_PATTERN.test(candidate)
    || AUTHENTICATED_PROXY_PATTERN.test(candidate)
    || NETWORK_CREDENTIAL_PATTERN.test(candidate)
    || AUTHORIZATION_TEXT_PATTERN.test(candidate)
    || COOKIE_HEADER_PATTERN.test(candidate)
    || STRUCTURED_CREDENTIAL_PATTERN.test(candidate)
    || LABELED_CREDENTIAL_TEXT_PATTERN.test(candidate)
    || JWT_TEXT_PATTERN.test(candidate)
    || PRIVATE_KEY_PATTERN.test(candidate)
    || HIGH_CONFIDENCE_TOKEN_PATTERN.test(candidate)
    || (!allowProductChecksum && [...candidate.matchAll(CARD_CANDIDATE_PATTERN)].some((match) => luhnValid(match[1]))));
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
      if (typeof current.value === "number" && Number.isSafeInteger(current.value) && !isProductChecksumIdentifierKey(current.key) && luhnValid(current.value)) {
        throw new AccountOpsSecurityError("PAYMENT_VALUE_REJECTED", "Payment-card-like data cannot be stored in Account Ops.", { path: current.path });
      }
      if (typeof current.value === "string" && current.value.length > 32_000) {
        throw new AccountOpsSecurityError("STRING_TOO_LONG", `Account Ops input contains an oversized string at ${current.path}.`);
      }
      if (typeof current.value === "string" && containsCredentialText(current.value, { allowProductChecksum: isProductChecksumIdentifierKey(current.key) })) {
        const code = normalizedKey(current.key).endsWith("url") ? "INVALID_URL" : "CREDENTIAL_TEXT_REJECTED";
        throw new AccountOpsSecurityError(code, "Credential-bearing text cannot be stored in Account Ops.", { path: current.path });
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

    if (Object.getOwnPropertySymbols(current.value).length) {
      throw new AccountOpsSecurityError("UNSAFE_OBJECT", `Account Ops input contains symbol properties at ${current.path}.`);
    }

    for (const key of Object.keys(current.value)) {
      const path = Array.isArray(current.value) ? `${current.path}[${key}]` : `${current.path}.${key}`;
      if (Array.isArray(current.value) && !/^(?:0|[1-9]\d*)$/.test(key)) {
        throw new AccountOpsSecurityError("UNSAFE_OBJECT", `Account Ops input contains a named array property at ${path}.`, { path });
      }
      const descriptor = Object.getOwnPropertyDescriptor(current.value, key);
      if (!descriptor || typeof descriptor.get === "function" || typeof descriptor.set === "function") {
        throw new AccountOpsSecurityError("UNSAFE_OBJECT", `Account Ops input contains an accessor property at ${path}.`, { path });
      }
      if (DANGEROUS_KEYS.has(key)) throw new AccountOpsSecurityError("PROTOTYPE_KEY_REJECTED", `A prohibited key was supplied at ${path}.`, { path });
      if (!Array.isArray(current.value) && SAFE_FALSE_ONLY_KEYS.has(normalizedKey(key)) && descriptor.value !== false) {
        throw new AccountOpsSecurityError("SECRET_FIELD_REJECTED", "Sensitive-data exclusion markers must remain false in Account Ops.", { path });
      }
      if (!Array.isArray(current.value) && keyContainsAuthority(key)) {
        throw new AccountOpsSecurityError("AUTHORITY_FIELD_REJECTED", "Owner and authentication authority cannot be supplied through Account Ops records.", { path });
      }
      if (!Array.isArray(current.value) && keyContainsSecret(key)) {
        throw new AccountOpsSecurityError("SECRET_FIELD_REJECTED", "Authentication, payment, proxy, CAPTCHA, and provider secrets cannot be stored in Account Ops.", { path });
      }
      if (!Array.isArray(current.value) && keyContainsRawSource(key)) {
        throw new AccountOpsSecurityError("RAW_SOURCE_DATA_REJECTED", "Raw mailbox, bot, provider, request/response, and log data cannot be stored in Account Ops.", { path });
      }
      stack.push({ value: descriptor.value, path, key: Array.isArray(current.value) ? current.key : key, depth: current.depth + 1 });
    }
  }
  return value;
}

export function safeAccountOpsClone(value) {
  assertSafeAccountOpsInput(value);
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
