export const APP_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MODERATOR: "moderator",
  BETA_USER: "beta_user",
  USER: "user",
};

export const APP_ROLE_LABELS = {
  [APP_ROLES.OWNER]: "Owner",
  [APP_ROLES.ADMIN]: "Admin",
  [APP_ROLES.MODERATOR]: "Moderator",
  [APP_ROLES.BETA_USER]: "Beta User",
  [APP_ROLES.USER]: "User",
};

export const ROLE_FILTERS = ["All", "Admins", "Moderators", "Beta Users", "Users"];

export const OFFICIAL_ADMIN_LABELS = ["official admin ember", "official admin tide"];

const ADMIN_EMAILS = String(import.meta.env?.VITE_ADMIN_EMAILS || import.meta.env?.ADMIN_EMAILS || "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

const DEV_ADMIN_EMAIL = String(import.meta.env?.VITE_DEV_ADMIN_EMAIL || "").trim().toLowerCase();

function metadataFor(profile = {}) {
  return profile?.app_metadata || profile?.raw_app_meta_data || profile?.rawAppMetaData || {};
}

function truthy(value) {
  return value === true || ["true", "1", "yes"].includes(String(value || "").trim().toLowerCase());
}

function normalizedText(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function normalizeAppRole(value = "") {
  const role = normalizedText(value).replace(/-/g, "_");
  if (role === "super_admin" || role === "founder") return APP_ROLES.OWNER;
  if (Object.values(APP_ROLES).includes(role)) return role;
  if (role === "beta" || role === "beta_tester") return APP_ROLES.BETA_USER;
  return APP_ROLES.USER;
}

export function isOfficialAdminProfile(profile = {}) {
  const email = normalizedText(profile.email);
  if (email && (ADMIN_EMAILS.includes(email) || email === DEV_ADMIN_EMAIL)) return true;
  const identity = [
    profile.displayName,
    profile.fullName,
    profile.username,
    profile.publicUsername,
    profile.public_username,
  ].map(normalizedText).filter(Boolean).join(" ");
  return OFFICIAL_ADMIN_LABELS.some((label) => identity.includes(label));
}

export function appRoleForProfile(profile = {}) {
  const metadata = metadataFor(profile);
  const explicitRole = profile.appRole || profile.app_role || metadata.app_role || metadata.appRole;
  const normalizedExplicitRole = normalizeAppRole(explicitRole);
  if (normalizedExplicitRole !== APP_ROLES.USER) return normalizedExplicitRole;

  const legacyRole = normalizeAppRole(
    profile.userRole ||
      profile.user_role ||
      profile.role ||
      metadata.user_role ||
      metadata.role
  );
  if ([APP_ROLES.OWNER, APP_ROLES.ADMIN, APP_ROLES.MODERATOR].includes(legacyRole)) return legacyRole;

  if (isOfficialAdminProfile(profile) || truthy(profile.isAdmin) || truthy(profile.is_admin) || truthy(metadata.is_admin) || truthy(metadata.isAdmin)) {
    return APP_ROLES.ADMIN;
  }
  if (truthy(profile.isModerator) || truthy(profile.is_moderator) || truthy(metadata.is_moderator) || truthy(metadata.isModerator)) {
    return APP_ROLES.MODERATOR;
  }
  if (truthy(profile.appAccess) || truthy(profile.app_access) || ["approved", "active"].includes(normalizedText(profile.betaAccessStatus || profile.beta_access_status || profile.betaStatus || profile.beta_status))) {
    return APP_ROLES.BETA_USER;
  }
  return APP_ROLES.USER;
}

export function isOwner(profile = {}) {
  return appRoleForProfile(profile) === APP_ROLES.OWNER;
}

export function isAdmin(profile = {}) {
  return [APP_ROLES.OWNER, APP_ROLES.ADMIN].includes(appRoleForProfile(profile));
}

export function isModerator(profile = {}) {
  return appRoleForProfile(profile) === APP_ROLES.MODERATOR;
}

export function canManageBeta(profile = {}) {
  return isAdmin(profile);
}

export function canManageRoles(profile = {}) {
  return isAdmin(profile);
}

export function canModerateReports(profile = {}) {
  return [APP_ROLES.OWNER, APP_ROLES.ADMIN, APP_ROLES.MODERATOR].includes(appRoleForProfile(profile));
}

export function canViewAdminDashboard(profile = {}) {
  return canModerateReports(profile);
}

export function canAssignAppRole(actor = {}, target = {}, nextRole = APP_ROLES.USER) {
  const actorRole = appRoleForProfile(actor);
  const targetId = String(target.userId || target.id || "").trim();
  const actorId = String(actor.userId || actor.id || "").trim();
  const normalizedNextRole = normalizeAppRole(nextRole);
  if (![APP_ROLES.OWNER, APP_ROLES.ADMIN].includes(actorRole)) return false;
  if (actorId && targetId && actorId === targetId) return false;
  if (actorRole === APP_ROLES.OWNER) return true;
  return [APP_ROLES.MODERATOR, APP_ROLES.BETA_USER, APP_ROLES.USER].includes(normalizedNextRole);
}

export function roleLabel(role = APP_ROLES.USER) {
  return APP_ROLE_LABELS[normalizeAppRole(role)] || APP_ROLE_LABELS[APP_ROLES.USER];
}

export function roleFilterMatches(profile = {}, filter = "All") {
  const role = appRoleForProfile(profile);
  if (filter === "Admins") return [APP_ROLES.OWNER, APP_ROLES.ADMIN].includes(role);
  if (filter === "Moderators") return role === APP_ROLES.MODERATOR;
  if (filter === "Beta Users") return role === APP_ROLES.BETA_USER;
  if (filter === "Users") return role === APP_ROLES.USER;
  return true;
}
