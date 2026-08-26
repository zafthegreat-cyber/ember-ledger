const PROHIBITED_NORMALIZED_KEYS = new Set([
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "authtoken",
  "authorization",
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
  "cvc",
  "cvv",
  "generatedpassword",
  "privatekey",
  "onetimecode",
  "onetimepassword",
  "otp",
  "otpcode",
  "otptoken",
  "passphrase",
  "password",
  "passwordhash",
  "plaintextpassword",
  "providercredentials",
  "providersecret",
  "secret",
  "session",
  "sessiontoken",
  "supabasesession",
  "ownerauthorizationallowlist",
  "ownerallowlist",
  "developmentidentity",
  "developmentimpersonation",
  "localdevelopmentidentity",
  "token",
  "temporarypassword",
  "verificationcode",
]);
const SAFE_REFERENCE_KEYS = new Set(["credentialreference", "credentialprovider", "credentialreferenceid"]);
const PROHIBITED_KEY_FRAGMENT_PATTERN = /(?:password(?:hash)?|passphrase|secret|apikey|privatekey|otp(?:code|token)?|cvv|cvc|credentials?|captcha(?:response|token)?|verificationcode)$/i;

const PROHIBITED_STORAGE_KEY_PATTERNS = [
  /^sb-.+-auth-token$/i,
  /(?:^|[.:-])auth(?:entication)?(?:$|[.:-])/i,
  /(?:^|[.:-])session(?:$|[.:-])/i,
  /(?:^|[.:-])access-token(?:$|[.:-])/i,
  /(?:^|[.:-])refresh-token(?:$|[.:-])/i,
  /(?:^|[.:-])invite-token(?:$|[.:-])/i,
  /^et-tcg-admin-mode:/i,
];

function normalizeKey(key) {
  return String(key || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function isProhibitedDataKey(key) {
  const normalized = normalizeKey(key);
  if (SAFE_REFERENCE_KEYS.has(normalized)) return false;
  return PROHIBITED_NORMALIZED_KEYS.has(normalized) || PROHIBITED_KEY_FRAGMENT_PATTERN.test(normalized);
}

export function isProhibitedStorageKey(key) {
  return PROHIBITED_STORAGE_KEY_PATTERNS.some((pattern) => pattern.test(String(key || "")));
}

export function findProhibitedData(value) {
  const matches = [];
  const stack = [{ value, path: "$" }];
  while (stack.length) {
    const current = stack.pop();
    if (!current.value || typeof current.value !== "object") continue;
    if (Array.isArray(current.value)) {
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: current.value[index], path: `${current.path}[${index}]` });
      }
      continue;
    }
    for (const key of Object.keys(current.value)) {
      const nextPath = `${current.path}.${key}`;
      if (isProhibitedDataKey(key)) matches.push({ path: nextPath, key });
      else stack.push({ value: current.value[key], path: nextPath });
    }
  }
  return matches;
}

export function sanitizeBackupData(value) {
  const excludedPaths = [];

  function visit(current, path) {
    if (Array.isArray(current)) return current.map((entry, index) => visit(entry, `${path}[${index}]`));
    if (!current || typeof current !== "object") return current;
    const result = Object.create(null);
    for (const key of Object.keys(current)) {
      const nextPath = `${path}.${key}`;
      if (isProhibitedDataKey(key)) {
        excludedPaths.push(nextPath);
        continue;
      }
      result[key] = visit(current[key], nextPath);
    }
    return result;
  }

  return { data: visit(value, "$"), excludedPaths };
}

export const SECURITY_EXCLUSION_SUMMARY = Object.freeze([
  "Authentication persistence and browser sessions",
  "Access, refresh, identity-provider, and eBay tokens",
  "Credentials, provider secrets, API keys, and environment values",
  "Owner allowlists and development impersonation state",
]);
