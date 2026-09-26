import {
  STELLAR_PREVIEW_LIMITS,
  STELLAR_PREVIEW_SECURITY_CATEGORIES,
} from "./constants.js";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const AUTHORITY_KEYS = new Set([
  "authprincipal", "authority", "browserrole", "clientrole", "entitlement", "entitlements",
  "isowner", "owner", "ownerauthorized", "ownerid", "ownerrole", "ownersubject",
  "permission", "permissions", "role", "roles", "securitycontext", "userrole",
]);

const SESSION_KEYS = new Set([
  "browserstorage", "cookie", "cookies", "localstorage", "session", "sessioncookie",
  "sessiondata", "sessionid", "sessionstorage", "storage", "storagedump",
]);

const PAYMENT_KEYS = new Set([
  "accountnumber", "bankaccount", "bankaccountnumber", "cardnumber", "creditcardnumber",
  "cvc", "cvv", "debitcardnumber", "paymentcardnumber", "paymentcredential",
  "paymentcredentials", "routingnumber",
]);

const PROXY_AUTH_KEYS = new Set([
  "proxy", "proxies", "proxyauth", "proxyauthentication", "proxyauthorization", "proxyendpoint", "proxyhost",
  "proxyhostname", "proxyip", "proxypassword", "proxyurl", "proxyusername",
]);

const LICENSE_KEYS = new Set([
  "botkey", "botlicense", "botlicensekey", "license", "licensekey", "productlicense",
]);

const RAW_PROVIDER_KEYS = new Set([
  "backup", "config", "configuration", "configurationbackup", "payload", "providerlog", "providerlogs", "providerpayload", "providerrequest",
  "providerresponse", "raw", "rawdata", "rawlog", "rawlogs", "rawpayload",
  "rawrequest", "rawresponse", "requestbody", "requestheaders", "responsebody",
  "responseheaders", "settings",
]);

const PERSONAL_PROFILE_KEYS = new Set([
  "account", "accountdata", "accountemail", "accountexport", "accountprofile", "accountprofiles", "accounts", "address", "billingaddress",
  "billingprofile", "cardholdername", "checkoutprofile", "checkoutprofiles", "email",
  "paymentprofile", "phone", "phonenumber", "profile", "profiledata", "profileexport",
  "profiles", "shippingaddress", "shippingprofile", "username",
]);

const CREDENTIAL_KEYS = new Set([
  "accesstoken", "apikey", "authorization", "authorizationcode", "authorizationheader",
  "authtoken", "bearer", "bearertoken", "clientsecret", "codeverifier", "credential",
  "credentials", "idtoken", "loginlink", "logintoken", "oauthcode", "oauthstate",
  "onetimecode", "onetimepin", "otp", "otppin", "passcode", "passphrase", "password",
  "pass", "pkceverifier", "privatekey", "providersecret", "providertoken", "pwd", "recoverycode",
  "refreshtoken", "resettoken", "secret", "securityanswer", "securitycode", "token",
  "verificationcode", "webhooksecret",
]);

const URL_CREDENTIAL_QUERY = /(?:^|[?&#])(?:access_?token|api_?key|authorization|auth|bearer|code|cookie|credential|key|password|refresh_?token|secret|session|token)=/i;
const AUTHORIZATION_TEXT = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/i;
const JWT_TEXT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const PRIVATE_KEY_TEXT = /-----BEGIN (?:EC |ENCRYPTED |OPENSSH |PGP |RSA )?PRIVATE KEY-----/;
const HIGH_CONFIDENCE_TOKEN_TEXT = /\b(?:(?:AKIA|ASIA)[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|(?:sk|rk)_live_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/;
const DISCORD_WEBHOOK_TEXT = /https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+/i;
const CARD_CANDIDATE = /(?:^|\D)(\d(?:[ -]?\d){12,18})(?=\D|$)/g;
const UNSAFE_KEY_TEXT = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function classifyKey(key) {
  const normalized = normalizeKey(key);
  if (AUTHORITY_KEYS.has(normalized)
    || /^(?:browser|client|requested|supplied)(?:authority|owner|permission|role)$/.test(normalized)
    || /^owner(?:identity|identifier|scope)$/.test(normalized)) {
    return STELLAR_PREVIEW_SECURITY_CATEGORIES.AUTHORITY_DATA;
  }
  if (PAYMENT_KEYS.has(normalized)
    || /^(?:card|paymentcard)(?:number|pan|cvc|cvv)$/.test(normalized)
    || /(?:bankaccount|cardexpiry|cardholder|cardnumber|creditcard|cvv|cvc|paymentcredential|paymentprofile|routingnumber)/.test(normalized)) {
    return STELLAR_PREVIEW_SECURITY_CATEGORIES.PAYMENT_DATA;
  }
  if (PROXY_AUTH_KEYS.has(normalized)
    || /^proxy.*(?:auth|credential|endpoint|host|ip|password|token|url|user)/.test(normalized)) {
    return STELLAR_PREVIEW_SECURITY_CATEGORIES.PROXY_AUTHENTICATION_DATA;
  }
  if (SESSION_KEYS.has(normalized)
    || /(?:browserstorage|cookie|localstorage|session)/.test(normalized)) {
    return STELLAR_PREVIEW_SECURITY_CATEGORIES.SESSION_DATA;
  }
  if (LICENSE_KEYS.has(normalized) || /license/.test(normalized)) {
    return STELLAR_PREVIEW_SECURITY_CATEGORIES.LICENSE_DATA;
  }
  if (RAW_PROVIDER_KEYS.has(normalized)
    || /(?:raw(?:data|log|logs|payload|request|response)|provider(?:log|logs|payload|request|response)|request(?:body|headers)|response(?:body|headers))/.test(normalized)
    || /(?:config|configuration|settings)(?:backup|data|dump|export|payload|record|records|value|values)/.test(normalized)) {
    return STELLAR_PREVIEW_SECURITY_CATEGORIES.RAW_PROVIDER_DATA;
  }
  if (PERSONAL_PROFILE_KEYS.has(normalized)
    || /(?:accountemail|billingaddress|billingprofile|cardholdername|checkoutprofile|paymentprofile|phonenumber|profileexport|shippingaddress|shippingprofile)/.test(normalized)
    || /(?:address|email|phone|profiledata|username)/.test(normalized)
    || /^(?:email|profile)/.test(normalized)) {
    return STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA;
  }
  if (CREDENTIAL_KEYS.has(normalized)
    || /(?:accesstoken|apikey|authorization|authtoken|bearertoken|clientsecret|credential|idtoken|loginlink|oauthcode|oauthstate|onetimecode|otp|passcode|passphrase|password|pkceverifier|privatekey|providersecret|providertoken|recoverycode|refreshtoken|resettoken|secret|securityanswer|securitycode|token|verificationcode|webhooksecret)/.test(normalized)) {
    return STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA;
  }
  return null;
}

function luhnValid(text) {
  const digits = text.replace(/\D/g, "");
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

function classifyText(value) {
  const text = String(value || "");
  const candidates = [text];
  try {
    const decoded = decodeURIComponent(text.replaceAll("+", "%20"));
    if (decoded !== text) candidates.push(decoded);
  } catch {
    // Malformed percent encoding is not interpreted as a safe credential URL.
  }
  if (AUTHORIZATION_TEXT.test(text) || JWT_TEXT.test(text) || PRIVATE_KEY_TEXT.test(text) || HIGH_CONFIDENCE_TOKEN_TEXT.test(text)) {
    return STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA;
  }
  if (candidates.some((candidate) => DISCORD_WEBHOOK_TEXT.test(candidate) || URL_CREDENTIAL_QUERY.test(candidate))) {
    return STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_BEARING_URL;
  }
  if (candidates.some((candidate) => /\b(?:https?|socks4?|socks5):\/\/[^\s/@]+:[^\s/@]+@/i.test(candidate))) {
    return STELLAR_PREVIEW_SECURITY_CATEGORIES.PROXY_AUTHENTICATION_DATA;
  }
  if ([...text.matchAll(CARD_CANDIDATE)].some((match) => luhnValid(match[1]))) {
    return STELLAR_PREVIEW_SECURITY_CATEGORIES.PAYMENT_DATA;
  }
  return null;
}

function freezeResult(result) {
  return Object.freeze({
    ...result,
    findings: Object.freeze(result.findings.map((finding) => Object.freeze({ ...finding }))),
  });
}

/**
 * Scans parsed, untrusted JSON before format recognition. Findings contain
 * category/count only so field paths and values cannot leak into UI or logs.
 */
export function scanStellarTaskExportSecurity(value, limitOverrides = {}) {
  const limits = { ...STELLAR_PREVIEW_LIMITS, ...limitOverrides };
  const findingCounts = new Map();
  const ancestors = new Set();
  const stack = [{ value, depth: 0 }];
  let inspectedNodes = 0;

  const addFinding = (category) => {
    if (!category) return;
    findingCounts.set(category, (findingCounts.get(category) || 0) + 1);
  };

  while (stack.length) {
    const current = stack.pop();
    if (current.exit) {
      ancestors.delete(current.value);
      continue;
    }
    inspectedNodes += 1;
    if (inspectedNodes > limits.maximumNodes) {
      addFinding(STELLAR_PREVIEW_SECURITY_CATEGORIES.INPUT_LIMIT_EXCEEDED);
      break;
    }
    if (current.depth > limits.maximumDepth) {
      addFinding(STELLAR_PREVIEW_SECURITY_CATEGORIES.INPUT_LIMIT_EXCEEDED);
      continue;
    }
    if (current.value == null || ["boolean", "number", "string"].includes(typeof current.value)) {
      if (typeof current.value === "number" && !Number.isFinite(current.value)) {
        addFinding(STELLAR_PREVIEW_SECURITY_CATEGORIES.UNSAFE_OBJECT_STRUCTURE);
      }
      if (typeof current.value === "number" && Number.isInteger(current.value) && !Number.isSafeInteger(current.value)) {
        addFinding(STELLAR_PREVIEW_SECURITY_CATEGORIES.UNSAFE_OBJECT_STRUCTURE);
      }
      if (typeof current.value === "number" && Number.isSafeInteger(current.value) && luhnValid(String(current.value))) {
        addFinding(STELLAR_PREVIEW_SECURITY_CATEGORIES.PAYMENT_DATA);
      }
      if (typeof current.value === "string") {
        if (current.value.length > limits.maximumStringLength) {
          addFinding(STELLAR_PREVIEW_SECURITY_CATEGORIES.INPUT_LIMIT_EXCEEDED);
        } else {
          addFinding(classifyText(current.value));
        }
      }
      continue;
    }
    if (typeof current.value !== "object" || ancestors.has(current.value)) {
      addFinding(STELLAR_PREVIEW_SECURITY_CATEGORIES.UNSAFE_OBJECT_STRUCTURE);
      continue;
    }

    ancestors.add(current.value);
    stack.push({ ...current, exit: true });
    if (Array.isArray(current.value)) {
      if (current.value.length > limits.maximumRecords) {
        addFinding(STELLAR_PREVIEW_SECURITY_CATEGORIES.INPUT_LIMIT_EXCEEDED);
        continue;
      }
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: current.value[index], depth: current.depth + 1 });
      }
      continue;
    }

    const prototype = Object.getPrototypeOf(current.value);
    if (prototype !== Object.prototype && prototype !== null) {
      addFinding(STELLAR_PREVIEW_SECURITY_CATEGORIES.UNSAFE_OBJECT_STRUCTURE);
      continue;
    }
    const keys = Object.keys(current.value);
    if (keys.length > limits.maximumKeysPerObject) {
      addFinding(STELLAR_PREVIEW_SECURITY_CATEGORIES.INPUT_LIMIT_EXCEEDED);
      continue;
    }
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key.length > limits.maximumFieldLength) {
        addFinding(STELLAR_PREVIEW_SECURITY_CATEGORIES.INPUT_LIMIT_EXCEEDED);
        continue;
      }
      if (UNSAFE_KEY_TEXT.test(key)) {
        addFinding(STELLAR_PREVIEW_SECURITY_CATEGORIES.UNSAFE_OBJECT_STRUCTURE);
        continue;
      }
      if (DANGEROUS_KEYS.has(key)) {
        addFinding(STELLAR_PREVIEW_SECURITY_CATEGORIES.UNSAFE_OBJECT_STRUCTURE);
        continue;
      }
      addFinding(classifyText(key));
      addFinding(classifyKey(key));
      stack.push({ value: current.value[key], depth: current.depth + 1 });
    }
  }

  const findings = [...findingCounts.entries()]
    .slice(0, limits.maximumFindings)
    .map(([category, count]) => ({ category, count }));
  return freezeResult({
    safe: findings.length === 0,
    inspectedNodes,
    findings,
  });
}

export function stellarPreviewSecurityMessage(category) {
  const messages = {
    [STELLAR_PREVIEW_SECURITY_CATEGORIES.AUTHORITY_DATA]: "Authority or session-control data was detected.",
    [STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_DATA]: "Credential information was detected.",
    [STELLAR_PREVIEW_SECURITY_CATEGORIES.SESSION_DATA]: "Session or browser-storage data was detected.",
    [STELLAR_PREVIEW_SECURITY_CATEGORIES.PAYMENT_DATA]: "Payment information was detected.",
    [STELLAR_PREVIEW_SECURITY_CATEGORIES.PROXY_AUTHENTICATION_DATA]: "Proxy authentication data was detected.",
    [STELLAR_PREVIEW_SECURITY_CATEGORIES.LICENSE_DATA]: "Bot license information was detected.",
    [STELLAR_PREVIEW_SECURITY_CATEGORIES.PERSONAL_PROFILE_DATA]: "Account or checkout profile information was detected.",
    [STELLAR_PREVIEW_SECURITY_CATEGORIES.RAW_PROVIDER_DATA]: "Raw provider data or logs were detected.",
    [STELLAR_PREVIEW_SECURITY_CATEGORIES.CREDENTIAL_BEARING_URL]: "A credential-bearing URL was detected.",
    [STELLAR_PREVIEW_SECURITY_CATEGORIES.UNSAFE_OBJECT_STRUCTURE]: "An unsafe object structure was detected.",
    [STELLAR_PREVIEW_SECURITY_CATEGORIES.INPUT_LIMIT_EXCEEDED]: "The file exceeds a preview safety limit.",
  };
  return messages[category] || "Prohibited information was detected.";
}
