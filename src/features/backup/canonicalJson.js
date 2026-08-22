export const BACKUP_PARSE_LIMITS = Object.freeze({
  maxBytes: 10 * 1024 * 1024,
  maxDepth: 40,
  maxArrayLength: 50_000,
  maxObjectKeys: 1_000,
  maxStringLength: 256 * 1024,
  maxTotalRecords: 100_000,
});

export const PROTOTYPE_POLLUTION_KEYS = Object.freeze([
  "__proto__",
  "constructor",
  "prototype",
]);

const prototypePollutionKeys = new Set(PROTOTYPE_POLLUTION_KEYS);
const textEncoder = new TextEncoder();

export class BackupParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BackupParseError";
    this.code = code;
  }
}

function assertSafeKey(key, path) {
  if (prototypePollutionKeys.has(key)) {
    throw new BackupParseError("PROHIBITED_KEY", `Prohibited object key at ${path}.${key}.`);
  }
}

function canonicalize(value, path, ancestors) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new BackupParseError("INVALID_NUMBER", `Non-finite number at ${path}.`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") {
    throw new BackupParseError("UNSUPPORTED_VALUE", `Unsupported ${typeof value} value at ${path}.`);
  }
  if (ancestors.has(value)) {
    throw new BackupParseError("CYCLIC_VALUE", `Cyclic value at ${path}.`);
  }

  ancestors.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map((entry, index) => canonicalize(entry, `${path}[${index}]`, ancestors));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      ancestors.delete(value);
      throw new BackupParseError("UNSUPPORTED_OBJECT", `Only plain objects are supported at ${path}.`);
    }
    result = Object.create(null);
    for (const key of Object.keys(value).sort()) {
      assertSafeKey(key, path);
      result[key] = canonicalize(value[key], `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
  return result;
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value, "$", new Set()));
}

function mergeLimits(overrides = {}) {
  return { ...BACKUP_PARSE_LIMITS, ...overrides };
}

export function inspectJsonValue(value, limitOverrides = {}) {
  const limits = mergeLimits(limitOverrides);
  const stack = [{ value, path: "$", depth: 0 }];
  let arrayEntries = 0;
  let objectEntries = 0;

  while (stack.length) {
    const current = stack.pop();
    if (current.depth > limits.maxDepth) {
      throw new BackupParseError("MAX_DEPTH", `Backup nesting exceeds ${limits.maxDepth} levels at ${current.path}.`);
    }
    if (typeof current.value === "string" && current.value.length > limits.maxStringLength) {
      throw new BackupParseError("MAX_STRING_LENGTH", `String exceeds ${limits.maxStringLength} characters at ${current.path}.`);
    }
    if (typeof current.value === "number" && !Number.isFinite(current.value)) {
      throw new BackupParseError("INVALID_NUMBER", `Non-finite number at ${current.path}.`);
    }
    if (!current.value || typeof current.value !== "object") continue;

    if (Array.isArray(current.value)) {
      if (current.value.length > limits.maxArrayLength) {
        throw new BackupParseError("MAX_ARRAY_LENGTH", `Array exceeds ${limits.maxArrayLength} entries at ${current.path}.`);
      }
      arrayEntries += current.value.length;
      if (arrayEntries > limits.maxTotalRecords) {
        throw new BackupParseError("MAX_RECORD_COUNT", `Backup exceeds ${limits.maxTotalRecords} array records.`);
      }
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        stack.push({ value: current.value[index], path: `${current.path}[${index}]`, depth: current.depth + 1 });
      }
      continue;
    }

    const keys = Object.keys(current.value);
    if (keys.length > limits.maxObjectKeys) {
      throw new BackupParseError("MAX_OBJECT_KEYS", `Object exceeds ${limits.maxObjectKeys} keys at ${current.path}.`);
    }
    objectEntries += keys.length;
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      assertSafeKey(key, current.path);
      stack.push({ value: current.value[key], path: `${current.path}.${key}`, depth: current.depth + 1 });
    }
  }

  return { arrayEntries, objectEntries };
}

export function parseUntrustedJsonValue(raw, limitOverrides = {}) {
  if (typeof raw !== "string") {
    throw new BackupParseError("NOT_JSON_TEXT", "Backup input must be JSON text.");
  }
  const limits = mergeLimits(limitOverrides);
  const byteLength = textEncoder.encode(raw).byteLength;
  if (byteLength > limits.maxBytes) {
    throw new BackupParseError("MAX_FILE_SIZE", `Backup exceeds the ${limits.maxBytes}-byte file limit.`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BackupParseError("MALFORMED_JSON", "Backup JSON is malformed or truncated.");
  }
  inspectJsonValue(parsed, limits);
  return parsed;
}

export function parseUntrustedBackupJson(raw, limitOverrides = {}) {
  const parsed = parseUntrustedJsonValue(raw, limitOverrides);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new BackupParseError("INVALID_TOP_LEVEL", "Backup must contain a top-level JSON object.");
  }
  return parsed;
}

async function defaultSha256(bytes) {
  if (!globalThis.crypto?.subtle?.digest) {
    throw new Error("SHA-256 is unavailable in this runtime.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Text(value, hashImplementation = defaultSha256) {
  return hashImplementation(textEncoder.encode(String(value)));
}

export async function hashCanonicalJson(value, hashImplementation) {
  return sha256Text(canonicalStringify(value), hashImplementation);
}
