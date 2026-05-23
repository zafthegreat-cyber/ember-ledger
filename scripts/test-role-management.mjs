import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  APP_ROLES,
  appRoleForProfile,
  canAssignAppRole,
  canManageRoles,
  canModerateReports,
  canViewAdminDashboard,
  isOfficialAdminProfile,
  normalizeAppRole,
  roleLabel,
} from "../src/utils/rolePermissions.js";

const root = process.cwd();
const app = fs.readFileSync(path.join(root, "src", "App.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "App.css"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
const service = fs.readFileSync(path.join(root, "src", "services", "shorelineAccessService.js"), "utf8");
const featureGates = fs.readFileSync(path.join(root, "src", "services", "featureGates.js"), "utf8");
const userProfile = fs.readFileSync(path.join(root, "src", "lib", "userProfile.js"), "utf8");
const adminUtils = fs.readFileSync(path.join(root, "src", "utils", "adminCommandCenterUtils.js"), "utf8");
const migrationPath = path.join(root, "supabase", "migrations", "20260523184039_role_management.sql");
const migration = fs.readFileSync(migrationPath, "utf8");

assert.equal(normalizeAppRole("super-admin"), APP_ROLES.OWNER);
assert.equal(normalizeAppRole("beta"), APP_ROLES.BETA_USER);
assert.equal(roleLabel("moderator"), "Moderator");
assert.equal(appRoleForProfile({ app_role: "admin" }), APP_ROLES.ADMIN);
assert.equal(appRoleForProfile({ user_role: "moderator" }), APP_ROLES.MODERATOR);
assert.equal(appRoleForProfile({ app_access: true }), APP_ROLES.BETA_USER);
assert.equal(canManageRoles({ appRole: "owner" }), true);
assert.equal(canManageRoles({ appRole: "moderator" }), false);
assert.equal(canModerateReports({ appRole: "moderator" }), true);
assert.equal(canViewAdminDashboard({ appRole: "moderator" }), true);
assert.equal(canAssignAppRole({ userId: "admin", appRole: "admin" }, { userId: "target" }, "moderator"), true);
assert.equal(canAssignAppRole({ userId: "admin", appRole: "admin" }, { userId: "target" }, "admin"), false);
assert.equal(canAssignAppRole({ userId: "owner", appRole: "owner" }, { userId: "target" }, "admin"), true);
assert.equal(canAssignAppRole({ userId: "owner", appRole: "owner" }, { userId: "owner" }, "user"), false);
assert.equal(isOfficialAdminProfile({ displayName: "official admin ember" }), true);
assert.equal(isOfficialAdminProfile({ displayName: "Local Scout" }), false);

assert.match(migration, /add column if not exists app_role text not null default 'user'/i, "profiles.app_role should be added");
assert.match(migration, /profiles_app_role_check/i, "app_role check constraint should exist");
assert.match(migration, /create table if not exists public\.role_audit_log/i, "role audit log should exist");
assert.match(migration, /create or replace function public\.admin_list_users_for_roles\(search_text text default null\)/i, "role list RPC should exist");
assert.match(migration, /create or replace function public\.admin_update_user_role/i, "role update RPC should exist");
assert.match(migration, /if not public\.is_owner_or_admin\(\)/i, "role RPCs must require owner/admin access");
assert.match(migration, /target_user_id = actor_id[\s\S]*You cannot change your own role/i, "self role changes should be blocked");
assert.match(migration, /Only owners can assign owner or admin roles/i, "only owners should assign owner/admin roles");
assert.match(migration, /Cannot downgrade the last owner\/admin/i, "last owner/admin downgrade should be blocked");
assert.match(migration, /insert into public\.role_audit_log/i, "role changes should be audited");
assert.doesNotMatch(migration, /set[^;]*(tier|plan_tier)\s*=/i, "role update must not change tier or plan_tier");

assert.match(service, /loadAdminRoleUsers/, "service should load role users through RPC");
assert.match(service, /updateAdminUserRole/, "service should update roles through RPC");
assert.match(service, /loadRoleAuditLog/, "service should load role audit log");
assert.match(service, /isMissingRoleManagementBackend/, "service should report missing role backend safely");

assert.match(featureGates, /OWNER: "owner"/, "feature gates should know owner role");
assert.match(featureGates, /BETA_USER: "beta_user"/, "feature gates should know beta user role");
assert.match(featureGates, /app_role/, "feature gates should protect app_role");
assert.match(userProfile, /appRoleForProfile/, "profile parsing should map app_role");
assert.match(userProfile, /app_role: APP_ROLES\.USER/, "new profiles should default app_role to user");

assert.match(app, /function renderRoleManagementSection\(\)/, "Role Management UI should exist");
assert.match(app, /roleManagementVisible/, "Role Management should be gated");
assert.match(app, /Moderator Command Center/, "moderators should have a limited command center");
assert.match(app, /openRoleChangeConfirmation/, "role changes should require confirmation");
assert.match(app, /Official admin accounts require owner confirmation/, "official admin protections should be visible");
assert.match(app, /Your role cannot make that role change/, "frontend should block disallowed role changes");
assert.match(app, /Role Management/, "Admin Command Center should include Role Management");
assert.match(adminUtils, /"Role Management"/, "admin filters should include Role Management");
assert.match(css, /\.role-management-panel/, "Role Management CSS should exist");
assert.match(css, /\.role-change-modal/, "Role confirmation modal CSS should exist");
assert.match(packageJson, /"test:role-management"/, "package script should include role management test");

console.log("Role Management tests passed.");
