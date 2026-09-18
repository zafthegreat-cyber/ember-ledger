import { WORKSPACE_IDS } from "../../config/workspaceRegistry.js";

export const WORKSPACE_PREFERENCE_STORAGE_KEY = "code3.workspace-preference.v1";
export const WORKSPACE_PREFERENCE_SCHEMA_VERSION = 1;
export const WORKSPACE_PREFERENCE_MAX_BYTES = 1_024;

export const PUBLIC_PRODUCT_WORKSPACE_IDS = Object.freeze([
  WORKSPACE_IDS.COLLECT,
  WORKSPACE_IDS.FIND,
  WORKSPACE_IDS.SELL,
  WORKSPACE_IDS.BUSINESS,
]);

export const DEFAULT_PRODUCT_WORKSPACE_ID = WORKSPACE_IDS.COLLECT;

const PUBLIC_PRODUCT_WORKSPACE_SET = new Set(PUBLIC_PRODUCT_WORKSPACE_IDS);
const PREFERENCE_KEYS = Object.freeze([
  "schemaVersion",
  "lastProductWorkspace",
  "lastSelectedWorkspace",
  "updatedAt",
]);
const PREFERENCE_KEY_SET = new Set(PREFERENCE_KEYS);
const REQUIRED_PREFERENCE_KEYS = Object.freeze([
  "schemaVersion",
  "lastProductWorkspace",
  "updatedAt",
]);
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function normalizeWorkspaceId(value) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return PUBLIC_PRODUCT_WORKSPACE_SET.has(normalized) ? normalized : "";
}

function normalizeSelectableWorkspaceId(value) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (normalized === WORKSPACE_IDS.BOT) return normalized;
  return normalizeWorkspaceId(normalized);
}

function safeFallbackWorkspace(value) {
  return normalizeWorkspaceId(value) || DEFAULT_PRODUCT_WORKSPACE_ID;
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string" || value.length !== 24) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function isStrictPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function invalidValidation(code, message) {
  return Object.freeze({ valid: false, code, message, preference: null });
}

function validValidation(preference) {
  return Object.freeze({
    valid: true,
    code: "VALID",
    message: "",
    preference: Object.freeze({ ...preference }),
  });
}

export function isPublicProductWorkspace(value) {
  return normalizeWorkspaceId(value) !== "";
}

/**
 * Validates the exact serialized preference contract. This intentionally
 * never accepts Owner Center, entitlement, role, or session information. Bot
 * may be retained only as inert last-selection metadata; it is never authority.
 */
export function validateWorkspacePreference(value) {
  if (!isStrictPlainRecord(value)) {
    return invalidValidation("INVALID_OBJECT", "Workspace preference must be a plain object.");
  }

  let keys;
  try {
    keys = Reflect.ownKeys(value);
  } catch {
    return invalidValidation("INVALID_OBJECT", "Workspace preference could not be inspected safely.");
  }
  if (keys.some((key) => typeof key !== "string")) {
    return invalidValidation("UNSUPPORTED_KEY", "Workspace preference keys must be strings.");
  }
  if (keys.some((key) => DANGEROUS_KEYS.has(key))) {
    return invalidValidation("PROHIBITED_KEY", "Workspace preference contains a prohibited key.");
  }
  if (
    keys.length < REQUIRED_PREFERENCE_KEYS.length
    || keys.length > PREFERENCE_KEYS.length
    || keys.some((key) => !PREFERENCE_KEY_SET.has(key))
    || REQUIRED_PREFERENCE_KEYS.some((key) => !keys.includes(key))
  ) {
    return invalidValidation("UNEXPECTED_FIELD", "Workspace preference contains an unexpected field.");
  }

  for (const key of keys) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch {
      return invalidValidation("UNSAFE_FIELD", "Workspace preference fields could not be inspected safely.");
    }
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      return invalidValidation("UNSAFE_FIELD", "Workspace preference fields must be ordinary data properties.");
    }
  }

  if (value.schemaVersion !== WORKSPACE_PREFERENCE_SCHEMA_VERSION) {
    return invalidValidation("UNSUPPORTED_SCHEMA", "Workspace preference schema is not supported.");
  }
  if (
    typeof value.lastProductWorkspace !== "string"
    || normalizeWorkspaceId(value.lastProductWorkspace) !== value.lastProductWorkspace
  ) {
    return invalidValidation("INVALID_WORKSPACE", "Workspace preference must name a public product workspace.");
  }
  if (
    Object.prototype.hasOwnProperty.call(value, "lastSelectedWorkspace")
    && (
      typeof value.lastSelectedWorkspace !== "string"
      || normalizeSelectableWorkspaceId(value.lastSelectedWorkspace) !== value.lastSelectedWorkspace
    )
  ) {
    return invalidValidation("INVALID_SELECTION", "Last selected workspace may name only a product workspace or Bot.");
  }
  if (!isCanonicalIsoTimestamp(value.updatedAt)) {
    return invalidValidation("INVALID_TIMESTAMP", "Workspace preference updatedAt must be a canonical ISO timestamp.");
  }

  const preference = {
    schemaVersion: WORKSPACE_PREFERENCE_SCHEMA_VERSION,
    lastProductWorkspace: value.lastProductWorkspace,
    updatedAt: value.updatedAt,
  };
  if (Object.prototype.hasOwnProperty.call(value, "lastSelectedWorkspace")) {
    preference.lastSelectedWorkspace = value.lastSelectedWorkspace;
  }
  return validValidation(preference);
}

export function parseWorkspacePreference(rawValue) {
  if (typeof rawValue !== "string") {
    return invalidValidation("INVALID_SERIALIZATION", "Workspace preference must be serialized JSON.");
  }
  if (rawValue.length === 0) {
    return invalidValidation("MISSING", "No workspace preference is stored.");
  }
  if (rawValue.length > WORKSPACE_PREFERENCE_MAX_BYTES) {
    return invalidValidation("TOO_LARGE", "Workspace preference exceeds the storage limit.");
  }

  try {
    return validateWorkspacePreference(JSON.parse(rawValue));
  } catch {
    return invalidValidation("MALFORMED_JSON", "Workspace preference is not valid JSON.");
  }
}

export function readWorkspacePreference(storage, options = {}) {
  const fallbackWorkspace = safeFallbackWorkspace(options.fallbackWorkspace);
  if (!storage || typeof storage.getItem !== "function") {
    return Object.freeze({
      status: "UNAVAILABLE",
      lastProductWorkspace: fallbackWorkspace,
      lastSelectedWorkspace: fallbackWorkspace,
      preference: null,
    });
  }

  let rawValue;
  try {
    rawValue = storage.getItem(WORKSPACE_PREFERENCE_STORAGE_KEY);
  } catch {
    return Object.freeze({
      status: "UNAVAILABLE",
      lastProductWorkspace: fallbackWorkspace,
      lastSelectedWorkspace: fallbackWorkspace,
      preference: null,
    });
  }

  if (rawValue == null || rawValue === "") {
    return Object.freeze({
      status: "MISSING",
      lastProductWorkspace: fallbackWorkspace,
      lastSelectedWorkspace: fallbackWorkspace,
      preference: null,
    });
  }

  const validation = parseWorkspacePreference(rawValue);
  if (!validation.valid) {
    return Object.freeze({
      status: "INVALID",
      reason: validation.code,
      lastProductWorkspace: fallbackWorkspace,
      lastSelectedWorkspace: fallbackWorkspace,
      preference: null,
    });
  }

  return Object.freeze({
    status: "VALID",
    lastProductWorkspace: validation.preference.lastProductWorkspace,
    lastSelectedWorkspace: validation.preference.lastSelectedWorkspace || validation.preference.lastProductWorkspace,
    preference: validation.preference,
  });
}

export function writeWorkspacePreference(storage, workspaceId, options = {}) {
  const selectedWorkspace = normalizeSelectableWorkspaceId(workspaceId);
  if (!selectedWorkspace) {
    return Object.freeze({ ok: false, status: "INVALID_WORKSPACE", preference: null });
  }
  if (selectedWorkspace === WORKSPACE_IDS.BOT && options.ownerAuthorized !== true) {
    return Object.freeze({ ok: false, status: "OWNER_AUTHORIZATION_REQUIRED", preference: null });
  }
  const lastProductWorkspace = selectedWorkspace === WORKSPACE_IDS.BOT
    ? safeFallbackWorkspace(options.lastProductWorkspace)
    : selectedWorkspace;

  let updatedAt;
  try {
    updatedAt = typeof options.now === "function"
      ? options.now()
      : options.updatedAt || new Date().toISOString();
  } catch {
    return Object.freeze({ ok: false, status: "INVALID_TIMESTAMP", preference: null });
  }

  const validation = validateWorkspacePreference({
    schemaVersion: WORKSPACE_PREFERENCE_SCHEMA_VERSION,
    lastProductWorkspace,
    lastSelectedWorkspace: selectedWorkspace,
    updatedAt,
  });
  if (!validation.valid) {
    return Object.freeze({ ok: false, status: validation.code, preference: null });
  }
  if (!storage || typeof storage.setItem !== "function") {
    return Object.freeze({ ok: false, status: "UNAVAILABLE", preference: validation.preference });
  }

  try {
    storage.setItem(WORKSPACE_PREFERENCE_STORAGE_KEY, JSON.stringify(validation.preference));
    return Object.freeze({ ok: true, status: "SAVED", preference: validation.preference });
  } catch {
    return Object.freeze({ ok: false, status: "WRITE_FAILED", preference: validation.preference });
  }
}

/**
 * Resolves only a public product workspace. Private Bot and Owner routes must
 * be resolved by the authoritative route/session layer before calling this.
 */
export function resolvePublicProductWorkspace({
  directWorkspace,
  rememberedWorkspace,
  availableWorkspaces = PUBLIC_PRODUCT_WORKSPACE_IDS,
  fallbackWorkspace = DEFAULT_PRODUCT_WORKSPACE_ID,
} = {}) {
  const available = [];
  for (const candidate of Array.isArray(availableWorkspaces) ? availableWorkspaces : []) {
    const normalized = normalizeWorkspaceId(
      candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate.id : candidate,
    );
    if (normalized && !available.includes(normalized)) available.push(normalized);
  }

  const direct = normalizeWorkspaceId(directWorkspace);
  if (direct && available.includes(direct)) {
    return Object.freeze({ workspace: direct, source: "DIRECT_ROUTE" });
  }

  const remembered = normalizeWorkspaceId(rememberedWorkspace);
  if (remembered && available.includes(remembered)) {
    return Object.freeze({ workspace: remembered, source: "REMEMBERED" });
  }

  const fallback = safeFallbackWorkspace(fallbackWorkspace);
  if (available.includes(fallback)) {
    return Object.freeze({ workspace: fallback, source: "FALLBACK" });
  }

  return Object.freeze({
    workspace: available[0] || DEFAULT_PRODUCT_WORKSPACE_ID,
    source: available.length ? "FIRST_AVAILABLE" : "DEFAULT",
  });
}

/**
 * Resolves an optional last selection. A persisted Bot string remains inert
 * unless verified owner authorization is currently present. Owner Center is
 * intentionally not a product workspace and is never returned.
 */
export function resolveWorkspaceSelection({
  directWorkspace,
  lastSelectedWorkspace,
  rememberedWorkspace,
  availableWorkspaces = PUBLIC_PRODUCT_WORKSPACE_IDS,
  fallbackWorkspace = DEFAULT_PRODUCT_WORKSPACE_ID,
  ownerAuthorized = false,
  authorizationPending = false,
} = {}) {
  const resolvePublic = (directCandidate) => resolvePublicProductWorkspace({
    directWorkspace: directCandidate,
    rememberedWorkspace,
    availableWorkspaces,
    fallbackWorkspace,
  });
  const direct = normalizeSelectableWorkspaceId(directWorkspace);

  if (direct && direct !== WORKSPACE_IDS.BOT) return resolvePublic(direct);
  if (direct === WORKSPACE_IDS.BOT) {
    if (ownerAuthorized === true && authorizationPending !== true) {
      return Object.freeze({ workspace: WORKSPACE_IDS.BOT, source: "DIRECT_ROUTE", ownerRequired: true });
    }
    const fallback = resolvePublic("");
    return Object.freeze({
      ...fallback,
      source: authorizationPending === true ? "AUTHORIZATION_PENDING_FALLBACK" : "UNAUTHORIZED_FALLBACK",
    });
  }

  const selected = normalizeSelectableWorkspaceId(lastSelectedWorkspace);
  if (selected === WORKSPACE_IDS.BOT) {
    if (ownerAuthorized === true && authorizationPending !== true) {
      return Object.freeze({ workspace: WORKSPACE_IDS.BOT, source: "LAST_SELECTED", ownerRequired: true });
    }
    const fallback = resolvePublic("");
    return Object.freeze({
      ...fallback,
      source: authorizationPending === true ? "AUTHORIZATION_PENDING_FALLBACK" : "UNAUTHORIZED_FALLBACK",
    });
  }
  if (selected) return resolvePublic(selected);

  return resolvePublic("");
}
