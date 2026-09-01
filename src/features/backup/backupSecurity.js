const PROHIBITED_NORMALIZED_KEYS = new Set([
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "authtoken",
  "authorization",
  "authorizationcode",
  "authorizationheader",
  "bearertoken",
  "clientsecret",
  "ebayclientsecret",
  "ebaytoken",
  "ebayaccesstoken",
  "apikey",
  "authcookie",
  "captcharesponse",
  "captchatoken",
  "cardsecuritycode",
  "cardverificationvalue",
  "clientcredentials",
  "cookie",
  "credential",
  "credentials",
  "creditcardnumber",
  "cvc",
  "cvv",
  "debitcardnumber",
  "generatedpassword",
  "privatekey",
  "loginlink",
  "managedreference",
  "onetimecode",
  "onetimepassword",
  "oauthcode",
  "oauthstate",
  "otp",
  "otpcode",
  "otptoken",
  "passphrase",
  "pass",
  "passwd",
  "password",
  "pwd",
  "passwordhash",
  "passwordresetlink",
  "passwordresettoken",
  "paymentcardnumber",
  "plaintextpassword",
  "primaryaccountnumber",
  "providercredentials",
  "providersecret",
  "protectedcontent",
  "proxyauth",
  "proxyauthentication",
  "proxyendpoint",
  "proxyhost",
  "proxyhostname",
  "proxyip",
  "proxyipaddress",
  "proxypassword",
  "proxyurl",
  "proxypass",
  "proxyuser",
  "proxyusername",
  "rawlog",
  "rawlogs",
  "rawmessagebody",
  "rawmessagecontent",
  "rawpayload",
  "rawproviderlog",
  "rawproviderlogs",
  "rawproviderpayload",
  "rawproviderrequest",
  "rawproviderresponse",
  "rawemail",
  "rawemailbody",
  "rawemailcontent",
  "rawbotpayload",
  "rawsourcepayload",
  "rawrequest",
  "rawresponse",
  "secret",
  "session",
  "sessiontoken",
  "securitycode",
  "securityanswer",
  "securityanswers",
  "retailercookie",
  "retailerpassword",
  "paymentcredential",
  "paymentcredentials",
  "inventoryhandoffpreview",
  "handoffpreview",
  "inventorycreationcandidate",
  "inventorycreationpreview",
  "inventorycorrectioncandidate",
  "inventorycorrectionpreview",
  "inventorycommitjournal",
  "inventorycorrectionjournal",
  "supabasesession",
  "ownerauthorizationallowlist",
  "ownerallowlist",
  "developmentidentity",
  "developmentimpersonation",
  "localdevelopmentidentity",
  "token",
  "temporarypassword",
  "pan",
  "verificationcode",
  "codeverifier",
  "securitypin",
  "accountpin",
  "accesskey",
  "authkey",
  "clientkey",
  "providerkey",
  "sessionkey",
  "bankrouting",
  "routingno",
  "accountnumber",
  "iban",
  "rawbody",
  "emailhtml",
  "htmlbody",
  "mimebody",
  "headers",
  "request",
  "response",
  "sourcepayload",
  "providerdata",
]);
const SAFE_REFERENCE_KEYS = new Set(["credentialreference", "credentialprovider", "credentialreferenceid"]);
const SAFE_BUSINESS_IDENTIFIER_KEYS = new Set(["cardnumber"]);
const PROHIBITED_KEY_FRAGMENT_PATTERN = /(?:password(?:hash)?|passwordreset(?:link|token)|passphrase|(?:^|user|my)(?:pwd|passwd|pass)(?:value|field|data)?|(?:security|account)?pin(?:code|value|field|data)?|secret|managedreference|apikey|privatekey|(?:session|api|payment|license)?token(?:value|field|data)?|cookie(?:value|field|data)?|otp(?:code|token)?|oauth(?:code|state)|authorizationcode|codeverifier|security(?:code|answers?)|loginlink|retailer(?:password|cookie)|paymentcredentials?|inventoryhandoffpreview|handoffpreview|inventorycreationcandidate|inventorycreationpreview|inventorycorrectioncandidate|inventorycorrectionpreview|inventory(?:creation|correction|commit)journal|rawmessage(?:body|content)|rawemail(?:body|content)?|rawbotpayload|rawsourcepayload|rawprovider(?:payload|request|response|logs?)|raw(?:body|html|headers|payload|request|response|logs?)|(?:email|message|body)(?:html|content)|(?:original)?(?:message|email)(?:data|body|content|html)?|(?:source|response|request|provider)(?:data|payload|body|headers|content|value|field)|http(?:response|request)(?:data|body|headers|content)?|(?:emailhtml|htmlbody|mimebody|headers|request|response|sourcepayload|providerdata)(?:value|field|data)?|protectedcontent|(?:credit|debit|payment)cardnumber|primaryaccountnumber|pan|cvv|cvc|credentials?|(?:accesskey|authkey|clientkey|providerkey|sessionkey|bankrouting|routingno|accountnumber|iban)(?:value|field|data)?|proxy(?:user|pass|username|password|auth|authentication|url|endpoint|host|hostname|ip|ipaddress)|captcha(?:response|token)?|verificationcode)$/i;
const PROHIBITED_AUTHORITY_KEY_PATTERN = /^(?:(?:owner|auth|user)(?:principal|subject|privilege|privileges)|(?:principal|subject|privilege|privileges)(?:value|field|data)|(?:account|client|browser|current|supplied|requested)(?:role|authority|permission|session|owner)|(?:admin|owner|role|authority|entitlement|session|principal|privilege)(?:flag|status|level|plan|data|value|field)|is(?:authenticated|owner|admin|authorized|superuser))$/i;
const PROHIBITED_SENSITIVE_SUFFIX_PATTERN = /(?:accesstoken|refreshtoken|idtoken|authtoken|bearertoken|clientsecret|providersecret|apikey|privatekey|authorizationcode|codeverifier|oauthstate|password|passwordhash|passphrase|credential|credentials|cookie|sessioncookie|otp|onetimecode|securitycode|securityanswer|recoverycode|verificationcode|cardnumber|paymentcardnumber|primaryaccountnumber|cvv|cvc|bankaccount|routingnumber|proxyauth|proxypassword|proxyusername|proxyurl|licensekey|encryptionkey|signingkey|seedphrase)(?:value|field|data)?$/i;
const PROHIBITED_RAW_SUFFIX_PATTERN = /(?:rawbody|rawcontent|rawdata|rawmessage|rawemail|rawpayload|rawrequest|rawresponse|rawheaders|rawlogs?|rawproviderpayload|rawsourcepayload|providerpayload|sourcepayload|emailbody|messagebody|emailhtml|htmlbody|mimebody|requestbody|responsebody|requestheaders|responseheaders)(?:value|field|data)?$/i;
const PROHIBITED_OWNER_SUFFIX_PATTERN = /(?:ownerid|ownersubject|owneridentity|owneridentifier|ownerrole|ownerpermissions|ownerallowlist|ownerauthority|ownerauthorization)(?:value|field|data)?$/i;

const PROHIBITED_STORAGE_KEY_PATTERNS = [
  /^sb-.+-auth-token$/i,
  /(?:^|[.:-])auth(?:entication)?(?:$|[.:-])/i,
  /(?:^|[.:-])session(?:$|[.:-])/i,
  /(?:^|[.:-])access-token(?:$|[.:-])/i,
  /(?:^|[.:-])refresh-token(?:$|[.:-])/i,
  /(?:^|[.:-])invite-token(?:$|[.:-])/i,
  /^et-tcg-admin-mode:/i,
  /inventory-(?:creation|correction)-commit-journal/i,
];

const CREDENTIAL_URI_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+@/i;
const NETWORK_CREDENTIAL_PATTERN = /(?:^|[?&#;]|&amp;)(?:access[-_]?token|refresh[-_]?token|id[-_]?token|api[-_]?key|client[-_]?secret|oauth[-_]?state|code[-_]?verifier|pkce[-_]?verifier|authorization[-_]?code|x[-_]?amz[-_]?(?:credential|signature)|signature|token|key|secret|password|passphrase|session|cookie|otp|code)=/i;
const AUTHORIZATION_TEXT_PATTERN = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/i;
const COOKIE_HEADER_PATTERN = /\b(?:Set-Cookie|Cookie)\s*:\s*[^\r\n]{1,500}/i;
const STRUCTURED_CREDENTIAL_PATTERN = /["']?(?:access[-_]?token|refresh[-_]?token|api[-_]?key|authorization|password|passphrase|secret|session|cookie|otp|cvv|cvc)["']?\s*(?::|=)\s*["']?[^\s"',;}]{3,}/i;
const JWT_TEXT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const PRIVATE_KEY_PATTERN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/;
const HIGH_CONFIDENCE_TOKEN_PATTERN = /\b(?:(?:AKIA|ASIA)[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{16,}|npm_[A-Za-z0-9]{20,}|sb_secret_[A-Za-z0-9_-]{16,}|(?:sk|rk)_live_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|SG\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/;
const CARD_CANDIDATE_PATTERN = /(?:^|\D)(\d(?:[ -]?\d){12,18})(?=\D|$)/g;
const PRODUCT_CHECKSUM_IDENTIFIER_KEYS = new Set(["gtin", "productid", "retaileritemid", "sku", "tcin", "upc"]);

function normalizeKey(key) {
  return String(key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function isProhibitedDataKey(key) {
  const normalized = normalizeKey(key);
  if (SAFE_REFERENCE_KEYS.has(normalized) || SAFE_BUSINESS_IDENTIFIER_KEYS.has(normalized)) return false;
  return PROHIBITED_NORMALIZED_KEYS.has(normalized)
    || PROHIBITED_KEY_FRAGMENT_PATTERN.test(normalized)
    || PROHIBITED_AUTHORITY_KEY_PATTERN.test(normalized)
    || PROHIBITED_SENSITIVE_SUFFIX_PATTERN.test(normalized)
    || PROHIBITED_RAW_SUFFIX_PATTERN.test(normalized)
    || PROHIBITED_OWNER_SUFFIX_PATTERN.test(normalized);
}

export function isProhibitedStorageKey(key) {
  return PROHIBITED_STORAGE_KEY_PATTERNS.some((pattern) => pattern.test(String(key || "")));
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

export function isProhibitedDataValue(value, key = "") {
  const allowProductChecksum = PRODUCT_CHECKSUM_IDENTIFIER_KEYS.has(normalizeKey(key));
  if (typeof value === "number") return Number.isSafeInteger(value) && !allowProductChecksum && luhnValid(value);
  if (typeof value !== "string") return false;
  const candidates = [value];
  let encoded = value;
  let encodingLimitExceeded = false;
  for (let pass = 0; pass < 8; pass += 1) {
    let decoded;
    try {
      decoded = decodeURIComponent(encoded.replaceAll("+", "%20"));
    } catch {
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
  return encodingLimitExceeded || candidates.some((candidate) => CREDENTIAL_URI_PATTERN.test(candidate)
    || NETWORK_CREDENTIAL_PATTERN.test(candidate)
    || AUTHORIZATION_TEXT_PATTERN.test(candidate)
    || COOKIE_HEADER_PATTERN.test(candidate)
    || STRUCTURED_CREDENTIAL_PATTERN.test(candidate)
    || JWT_TEXT_PATTERN.test(candidate)
    || PRIVATE_KEY_PATTERN.test(candidate)
    || HIGH_CONFIDENCE_TOKEN_PATTERN.test(candidate)
    || (!allowProductChecksum && [...candidate.matchAll(CARD_CANDIDATE_PATTERN)].some((match) => luhnValid(match[1]))));
}

export function findProhibitedData(value) {
  const matches = [];
  const stack = [{ value, path: "$", key: "" }];
  while (stack.length) {
    const current = stack.pop();
    if (isProhibitedDataValue(current.value, current.key)) {
      matches.push({ path: current.path, key: "[credential-bearing value]" });
      continue;
    }
    if (!current.value || typeof current.value !== "object") continue;
    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: current.value[index], path: `${current.path}[${index}]`, key: current.key });
      }
      continue;
    }
    for (const key of Object.keys(current.value)) {
      const nextPath = `${current.path}.${key}`;
      if (isProhibitedDataKey(key)) matches.push({ path: nextPath, key });
      else stack.push({ value: current.value[key], path: nextPath, key });
    }
  }
  return matches;
}

export function sanitizeBackupData(value) {
  const excludedPaths = [];

  function visit(current, path, key = "") {
    if (isProhibitedDataValue(current, key)) {
      excludedPaths.push(path);
      return null;
    }
    if (Array.isArray(current)) return current.map((entry, index) => visit(entry, `${path}[${index}]`, key));
    if (!current || typeof current !== "object") return current;
    const result = Object.create(null);
    for (const key of Object.keys(current)) {
      const nextPath = `${path}.${key}`;
      if (isProhibitedDataKey(key)) {
        excludedPaths.push(nextPath);
        continue;
      }
      if (isProhibitedDataValue(current[key], key)) {
        excludedPaths.push(nextPath);
        continue;
      }
      result[key] = visit(current[key], nextPath, key);
    }
    return result;
  }

  return { data: visit(value, "$"), excludedPaths };
}

export const SECURITY_EXCLUSION_SUMMARY = Object.freeze([
  "Authentication persistence and browser sessions",
  "Access, refresh, identity-provider, and eBay tokens",
  "Mailbox OAuth state, authorization codes, code verifiers, and provider tokens",
  "One-time codes, password-reset/login links, and raw protected message content",
  "Credentials, provider secrets, API keys, and environment values",
  "Owner allowlists and development impersonation state",
  "Purchase/Receiving payment, retailer-authentication, raw evidence, and derived Inventory handoff data",
]);
