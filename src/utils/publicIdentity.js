export const DILLON_ADMIN_EMAIL = "dillonthedark@gmail.com";

export const OFFICIAL_ADMIN_USERNAMES = {
  ember: "official_admin_ember",
  tide: "official_admin_tide",
};

export const RESERVED_USERNAME_MESSAGE = "That username is reserved for Ember & Tide. Please choose another.";

export const PUBLIC_USERNAME_MIN_LENGTH = 3;
export const PUBLIC_USERNAME_MAX_LENGTH = 24;

const RESERVED_COMPACT_KEYS = new Set([
  "ember",
  "tide",
  "emberandtide",
  "official",
  "admin",
  "officialember",
  "officialtide",
  "officialadminember",
  "officialadmintide",
  "adminember",
  "admintide",
  "emberadmin",
  "tideadmin",
  "support",
  "staff",
  "moderator",
  "mod",
  "security",
  "verified",
]);

function emailFromProfile(profile = {}) {
  return String(profile.email || profile.accountEmail || profile.userEmail || "").trim().toLowerCase();
}

function metadataFromProfile(profile = {}) {
  return profile.app_metadata || profile.raw_app_meta_data || profile.rawAppMetaData || {};
}

export function normalizePublicUsername(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, PUBLIC_USERNAME_MAX_LENGTH);
}

export function usernameReservationKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

export function formatPublicUsername(username = "") {
  const normalized = normalizePublicUsername(username);
  if (normalized === OFFICIAL_ADMIN_USERNAMES.ember) return "official admin ember";
  if (normalized === OFFICIAL_ADMIN_USERNAMES.tide) return "official admin tide";
  return normalized;
}

export function officialAdminUsernameForProfile(profile = {}) {
  const email = emailFromProfile(profile);
  if (email === DILLON_ADMIN_EMAIL) return OFFICIAL_ADMIN_USERNAMES.tide;
  const metadata = metadataFromProfile(profile);
  const role = String(profile.userRole || profile.user_role || profile.role || metadata.role || metadata.user_role || "").toLowerCase();
  const adminFlag = Boolean(profile.isAdmin || profile.is_admin || metadata.is_admin || metadata.isAdmin);
  const nameSignals = [
    profile.firstName,
    profile.first_name,
    profile.displayName,
    profile.display_name,
    profile.fullName,
    profile.full_name,
  ].map((value) => String(value || "").trim().toLowerCase());
  if ((role === "admin" || adminFlag) && nameSignals.some((value) => value === "zena" || value.startsWith("zena "))) {
    return OFFICIAL_ADMIN_USERNAMES.ember;
  }
  return "";
}

export function publicUsernameFromProfile(profile = {}) {
  const official = officialAdminUsernameForProfile(profile);
  const explicitUsername =
    profile.publicUsername ||
    profile.public_username ||
    profile.username ||
    profile.handle ||
    "";
  const existing = normalizePublicUsername(
    explicitUsername ||
    profile.displayName ||
    profile.display_name ||
    profile.email ||
    "local_scout"
  );
  if (official && (!explicitUsername || usernameReservationKey(existing) === usernameReservationKey(official))) return official;
  return existing || "local_scout";
}

export function publicUsernameLabel(profile = {}) {
  return `@${formatPublicUsername(publicUsernameFromProfile(profile))}`;
}

export function publicUsernameLabelFromRecord(record = {}, fallback = "community") {
  const username = normalizePublicUsername(
    record.sellerUsername ||
    record.seller_username ||
    record.username ||
    record.publicUsername ||
    record.public_username ||
    record.sellerDisplayName ||
    record.seller_display_name ||
    record.displayName ||
    fallback
  );
  return `@${formatPublicUsername(username || normalizePublicUsername(fallback) || "community")}`;
}

export function canUseOfficialAdminUsername(username = "", profile = {}) {
  const normalized = normalizePublicUsername(username);
  const official = officialAdminUsernameForProfile(profile);
  if (normalized === OFFICIAL_ADMIN_USERNAMES.tide) return official === OFFICIAL_ADMIN_USERNAMES.tide;
  if (normalized === OFFICIAL_ADMIN_USERNAMES.ember) return official === OFFICIAL_ADMIN_USERNAMES.ember;
  return false;
}

export function validatePublicUsername(value = "", profile = {}, takenUsernames = []) {
  const username = normalizePublicUsername(value);
  if (!username) return "Choose a public username.";
  if (username.length < PUBLIC_USERNAME_MIN_LENGTH) return "Username must be at least 3 characters.";
  if (!/^[a-z0-9_]+$/.test(username)) return "Use only letters, numbers, and underscores.";

  const compactKey = usernameReservationKey(username);
  const officialUsername = officialAdminUsernameForProfile(profile);
  if (compactKey === usernameReservationKey(OFFICIAL_ADMIN_USERNAMES.ember) || compactKey === usernameReservationKey(OFFICIAL_ADMIN_USERNAMES.tide)) {
    if (username !== officialUsername) return RESERVED_USERNAME_MESSAGE;
  } else if (RESERVED_COMPACT_KEYS.has(compactKey)) {
    return RESERVED_USERNAME_MESSAGE;
  }

  const taken = new Set(takenUsernames.map(normalizePublicUsername).filter(Boolean));
  if (taken.has(username)) return `@${formatPublicUsername(username)} is already used in this local workspace.`;
  return "";
}

export function publicIdentityForProfile(profile = {}) {
  const username = publicUsernameFromProfile(profile);
  return {
    username,
    publicUsername: username,
    public_username: username,
    publicUsernameLabel: `@${formatPublicUsername(username)}`,
    officialAdminUsername: officialAdminUsernameForProfile(profile),
    isOfficialAdminIdentity: Boolean(officialAdminUsernameForProfile(profile) && username === officialAdminUsernameForProfile(profile)),
  };
}
