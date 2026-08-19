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
  "privatekey",
  "password",
  "secret",
  "sessiontoken",
  "supabasesession",
  "ownerauthorizationallowlist",
  "ownerallowlist",
  "developmentidentity",
  "developmentimpersonation",
  "localdevelopmentidentity",
  "token",
]);

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
  return PROHIBITED_NORMALIZED_KEYS.has(normalizeKey(key));
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
