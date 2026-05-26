import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const app = fs.readFileSync(path.join(root, "src", "App.jsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src", "App.css"), "utf8");
const service = fs.readFileSync(path.join(root, "src", "services", "shorelineAccessService.js"), "utf8");
const adminUtils = fs.readFileSync(path.join(root, "src", "utils", "adminCommandCenterUtils.js"), "utf8");
const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
const migrationPath = path.join(root, "supabase", "migrations", "20260523183000_beta_users_activity_notes.sql");
const migration = fs.readFileSync(migrationPath, "utf8");

assert.match(migration, /create table if not exists public\.app_activity_events/i, "activity events table should exist");
assert.match(migration, /event_type text not null/i, "activity events should store event type");
assert.match(migration, /metadata jsonb not null default '\{\}'::jsonb/i, "activity events should store metadata safely");
assert.match(migration, /alter table public\.app_activity_events enable row level security/i, "activity events RLS should be enabled");
assert.match(migration, /Users insert own activity events/i, "users should insert only their own activity");
assert.match(migration, /user_id = auth\.uid\(\)/i, "activity RLS should tie rows to auth.uid");
assert.match(migration, /public\.is_admin_or_moderator\(\)/i, "admins should be able to read beta activity");

assert.match(migration, /create table if not exists public\.beta_admin_notes/i, "beta admin notes table should exist");
assert.match(migration, /target_user_id uuid not null references auth\.users\(id\)/i, "admin notes should target auth users");
assert.match(migration, /Only admins|Admins read beta admin notes|Admins create beta admin notes/i, "admin notes policies should be admin-only");
assert.doesNotMatch(migration, /grant .*beta_admin_notes.* to anon/i, "anon should not receive beta admin notes access");

assert.match(service, /recordAppActivityEvent/, "service should record activity events");
assert.match(service, /loadAdminBetaActivityEvents/, "service should load admin activity events");
assert.match(service, /loadAdminBetaAdminNotes/, "service should load beta admin notes");
assert.match(service, /createBetaAdminNote/, "service should create admin notes");
assert.match(service, /isMissingBetaUsersBackend/, "missing beta dashboard backend should be handled safely");

assert.match(app, /function renderBetaUsersDashboard\(\)/, "Beta Users dashboard should be rendered by App");
assert.match(app, /adminToolsVisible\) return null/, "Beta Users dashboard should be gated by adminToolsVisible");
assert.match(app, /Beta Users/, "Admin UI should include Beta Users label");
assert.match(app, /Pending beta requests/, "Beta Users should show pending requests");
assert.match(app, /Approved and invited beta users/, "Beta Users should show approved and invited users");
assert.match(app, /Invite tracking/, "Beta Users should include invite tracking");
assert.match(app, /Beta user detail/, "Beta Users should include user detail drawer");
assert.match(app, /Private notes are admin-only/, "Admin notes should be labeled private");
assert.match(app, /History never shows plaintext tokens or token hashes/, "invite history should not expose token secrets");
assert.match(app, /Test\/fake account cleanup/, "Beta Users should include test/fake account cleanup");
assert.match(app, /queueDisableSuspectedTestAccount/, "cleanup should route suspected test accounts through a confirmed action");
assert.match(app, /Supabase Auth deletion is not exposed/, "cleanup should explain full Auth deletion is not exposed from the frontend");
assert.match(app, /recordAppActivityEvent/, "App should call activity recording service");
assert.match(app, /market_search/, "Market search activity should be tracked");
assert.match(app, /submitted_scout_report/, "Scout report activity should be tracked");
assert.match(app, /added_vault_item/, "Vault add activity should be tracked");
assert.match(app, /added_forge_item/, "Forge add activity should be tracked");
assert.match(app, /opened_ask_ember/, "Ask Ember activity should be tracked");
assert.match(app, /sent_admin_support_message/, "Admin support message activity should be tracked");

assert.match(adminUtils, /"Beta Users"/, "Admin Command Center filters should include Beta Users");
assert.match(css, /\.beta-users-dashboard/, "Beta Users dashboard CSS should exist");
assert.match(css, /\.beta-user-detail-drawer/, "Beta user detail drawer CSS should exist");
assert.match(packageJson, /"test:beta-users-dashboard"/, "package script should include test:beta-users-dashboard");

console.log("Beta Users dashboard tests passed.");
