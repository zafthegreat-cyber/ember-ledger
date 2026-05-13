#!/usr/bin/env node
/**
 * TEST ONLY: workspace RLS role validation.
 *
 * Purpose:
 *   Run this against a non-production Supabase test database after the
 *   workspace RLS hardening migration has been approved and applied there.
 *
 * This script intentionally uses the public anon key plus real test-user
 * sessions. It does not use the service-role key, so every pass/fail reflects
 * client-visible RLS behavior.
 *
 * Required environment:
 *   RLS_TEST_TARGET=test
 *   RLS_TEST_ALLOW_WRITES=true
 *   RLS_TEST_SUPABASE_URL=https://your-test-project.supabase.co
 *   RLS_TEST_SUPABASE_ANON_KEY=...
 *   RLS_TEST_OWNER_EMAIL=...
 *   RLS_TEST_OWNER_PASSWORD=...
 *   RLS_TEST_WORKSPACE_ADMIN_EMAIL=...
 *   RLS_TEST_WORKSPACE_ADMIN_PASSWORD=...
 *   RLS_TEST_WORKSPACE_EDITOR_EMAIL=...
 *   RLS_TEST_WORKSPACE_EDITOR_PASSWORD=...
 *   RLS_TEST_WORKSPACE_VIEWER_EMAIL=...
 *   RLS_TEST_WORKSPACE_VIEWER_PASSWORD=...
 *   RLS_TEST_UNRELATED_EMAIL=...
 *   RLS_TEST_UNRELATED_PASSWORD=...
 *
 * Optional environment:
 *   RLS_TEST_PRODUCT_ID=...          # Used for public.user_inventory.
 *   RLS_TEST_STORE_ID=...            # Used for public.store_reports.
 *   RLS_TEST_APP_ADMIN_EMAIL=...     # App admin/moderator, used for cleanup
 *   RLS_TEST_APP_ADMIN_PASSWORD=...  # and admin-only moderation checks.
 *   RLS_TEST_ORPHAN_TABLE=...        # Existing orphan workspace fixture table.
 *   RLS_TEST_ORPHAN_ROW_ID=...       # Existing row owned by RLS_TEST_OWNER.
 *   RLS_TEST_VERBOSE=true
 *
 * Safety:
 *   The script refuses to run unless RLS_TEST_TARGET=test and
 *   RLS_TEST_ALLOW_WRITES=true. It writes only generated "RLS Test ..." rows
 *   and attempts cleanup in reverse order before exiting.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");

const ROOT = path.resolve(__dirname, "..");
const RUN_ID = `rls-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
const VERBOSE = process.env.RLS_TEST_VERBOSE === "true";

for (const fileName of [".env.rls-test.local", ".env.local", ".env"]) {
  const filePath = path.join(ROOT, fileName);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
  }
}

class SkipTest extends Error {
  constructor(message) {
    super(message);
    this.name = "SkipTest";
  }
}

const results = [];
const cleanupTasks = [];

const REQUIRED_ENV = [
  "RLS_TEST_SUPABASE_URL",
  "RLS_TEST_SUPABASE_ANON_KEY",
  "RLS_TEST_OWNER_EMAIL",
  "RLS_TEST_OWNER_PASSWORD",
  "RLS_TEST_WORKSPACE_ADMIN_EMAIL",
  "RLS_TEST_WORKSPACE_ADMIN_PASSWORD",
  "RLS_TEST_WORKSPACE_EDITOR_EMAIL",
  "RLS_TEST_WORKSPACE_EDITOR_PASSWORD",
  "RLS_TEST_WORKSPACE_VIEWER_EMAIL",
  "RLS_TEST_WORKSPACE_VIEWER_PASSWORD",
  "RLS_TEST_UNRELATED_EMAIL",
  "RLS_TEST_UNRELATED_PASSWORD",
];

function env(name, fallback = "") {
  return process.env[name] || fallback;
}

function requireEnv(name) {
  const value = env(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function assertSafeTarget() {
  if (env("RLS_TEST_TARGET") !== "test") {
    throw new Error("Refusing to run: set RLS_TEST_TARGET=test for an approved non-production database.");
  }
  if (env("RLS_TEST_ALLOW_WRITES") !== "true") {
    throw new Error("Refusing to run: set RLS_TEST_ALLOW_WRITES=true after confirming the target is a test database.");
  }
  for (const name of REQUIRED_ENV) {
    requireEnv(name);
  }
}

function clientFor(label) {
  return createClient(requireEnv("RLS_TEST_SUPABASE_URL"), requireEnv("RLS_TEST_SUPABASE_ANON_KEY"), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        "x-ember-tide-rls-test": label,
      },
    },
  });
}

async function signIn(label, emailEnv, passwordEnv) {
  const client = clientFor(label);
  const { data, error } = await client.auth.signInWithPassword({
    email: requireEnv(emailEnv),
    password: requireEnv(passwordEnv),
  });
  if (error || !data?.user?.id) {
    throw new Error(`Could not sign in ${label}: ${error?.message || "missing user"}`);
  }
  return { label, client, userId: data.user.id };
}

function optionalAppAdmin() {
  if (!env("RLS_TEST_APP_ADMIN_EMAIL") || !env("RLS_TEST_APP_ADMIN_PASSWORD")) {
    return null;
  }
  return signIn("app-admin", "RLS_TEST_APP_ADMIN_EMAIL", "RLS_TEST_APP_ADMIN_PASSWORD");
}

function tableErrorKind(error) {
  const message = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  if (!error) return "";
  if (message.includes("does not exist") || message.includes("could not find the table") || message.includes("pgrst205")) {
    return "missing_table";
  }
  if (message.includes("column") && (message.includes("does not exist") || message.includes("could not find"))) {
    return "missing_column";
  }
  return "";
}

function explainError(error) {
  if (!error) return "";
  return [error.code, error.message, error.details, error.hint].filter(Boolean).join(" | ");
}

function track(actor, table, id) {
  if (id) {
    cleanupTasks.push({ actor, table, id });
  }
}

async function cleanup() {
  for (const task of [...cleanupTasks].reverse()) {
    try {
      const { error } = await task.actor.client.from(task.table).delete().eq("id", task.id);
      if (error && VERBOSE) {
        console.warn(`[cleanup] ${task.table}/${task.id}: ${explainError(error)}`);
      }
    } catch (error) {
      if (VERBOSE) {
        console.warn(`[cleanup] ${task.table}/${task.id}: ${error.message}`);
      }
    }
  }
}

async function runTest(name, fn) {
  try {
    await fn();
    results.push({ status: "PASS", name });
    console.log(`PASS ${name}`);
  } catch (error) {
    if (error instanceof SkipTest) {
      results.push({ status: "SKIP", name, detail: error.message });
      console.log(`SKIP ${name}: ${error.message}`);
      return;
    }
    results.push({ status: "FAIL", name, detail: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function insertAllowed(actor, table, row, label) {
  const { data, error } = await actor.client.from(table).insert(row).select("id").single();
  if (error) {
    const kind = tableErrorKind(error);
    if (kind === "missing_table" || kind === "missing_column") {
      throw new SkipTest(`${table} skipped for ${label}: ${explainError(error)}`);
    }
    throw new Error(`${label} insert failed on ${table}: ${explainError(error)}`);
  }
  track(actor, table, data.id);
  return data.id;
}

async function expectInsertDenied(actor, table, row, label) {
  const { data, error } = await actor.client.from(table).insert(row).select("id");
  if (error) {
    return;
  }
  if (Array.isArray(data) && data.length > 0) {
    for (const created of data) {
      track(actor, table, created.id);
    }
    throw new Error(`${label} unexpectedly inserted ${data.length} row(s) into ${table}`);
  }
}

async function expectVisible(actor, table, id, label) {
  const { data, error } = await actor.client.from(table).select("id").eq("id", id);
  if (error) {
    const kind = tableErrorKind(error);
    if (kind === "missing_table" || kind === "missing_column") {
      throw new SkipTest(`${table} skipped for ${label}: ${explainError(error)}`);
    }
    throw new Error(`${label} read failed on ${table}: ${explainError(error)}`);
  }
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(`${label} should read ${table}/${id}, got ${data?.length || 0} row(s)`);
  }
}

async function expectHidden(actor, table, id, label) {
  const { data, error } = await actor.client.from(table).select("id").eq("id", id);
  if (error) {
    const kind = tableErrorKind(error);
    if (kind === "missing_table" || kind === "missing_column") {
      throw new SkipTest(`${table} skipped for ${label}: ${explainError(error)}`);
    }
    return;
  }
  if (Array.isArray(data) && data.length > 0) {
    throw new Error(`${label} unexpectedly read ${table}/${id}`);
  }
}

async function updateAllowed(actor, table, id, patch, label) {
  const { data, error } = await actor.client.from(table).update(patch).eq("id", id).select("id");
  if (error) {
    throw new Error(`${label} update failed on ${table}: ${explainError(error)}`);
  }
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(`${label} update should affect one ${table} row, got ${data?.length || 0}`);
  }
}

async function updateDenied(actor, table, id, patch, label) {
  const { data, error } = await actor.client.from(table).update(patch).eq("id", id).select("id");
  if (error) {
    return;
  }
  if (Array.isArray(data) && data.length > 0) {
    throw new Error(`${label} unexpectedly updated ${table}/${id}`);
  }
}

async function deleteAllowed(actor, table, id, label) {
  const { data, error } = await actor.client.from(table).delete().eq("id", id).select("id");
  if (error) {
    throw new Error(`${label} delete failed on ${table}: ${explainError(error)}`);
  }
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(`${label} delete should affect one ${table} row, got ${data?.length || 0}`);
  }
}

async function deleteDenied(actor, table, id, label) {
  const { data, error } = await actor.client.from(table).delete().eq("id", id).select("id");
  if (error) {
    return;
  }
  if (Array.isArray(data) && data.length > 0) {
    throw new Error(`${label} unexpectedly deleted ${table}/${id}`);
  }
}

async function maybeFirstId(actor, table) {
  const { data, error } = await actor.client.from(table).select("id").limit(1).maybeSingle();
  if (error) {
    return null;
  }
  return data?.id || null;
}

async function setupWorkspace(ctx) {
  const { data: workspace, error: workspaceError } = await ctx.owner.client
    .from("workspaces")
    .insert({
      name: `RLS Test Workspace ${RUN_ID}`,
      type: "team",
      owner_user_id: ctx.owner.userId,
    })
    .select("id")
    .single();

  if (workspaceError) {
    throw new Error(`Could not create test workspace: ${explainError(workspaceError)}`);
  }
  track(ctx.owner, "workspaces", workspace.id);

  const rows = [
    { workspace_id: workspace.id, user_id: ctx.owner.userId, role: "owner", status: "active", accepted_at: new Date().toISOString() },
    { workspace_id: workspace.id, user_id: ctx.workspaceAdmin.userId, role: "admin", status: "active", accepted_at: new Date().toISOString() },
    { workspace_id: workspace.id, user_id: ctx.workspaceEditor.userId, role: "editor", status: "active", accepted_at: new Date().toISOString() },
    { workspace_id: workspace.id, user_id: ctx.workspaceViewer.userId, role: "viewer", status: "active", accepted_at: new Date().toISOString() },
  ];
  const { data: memberships, error: membershipError } = await ctx.owner.client
    .from("workspace_memberships")
    .insert(rows)
    .select("id");

  if (membershipError) {
    throw new Error(`Could not create test memberships: ${explainError(membershipError)}`);
  }
  for (const row of memberships || []) {
    track(ctx.owner, "workspace_memberships", row.id);
  }

  return workspace.id;
}

function testSuffix(label) {
  return `RLS Test ${RUN_ID} ${label}`;
}

function actorOwnerColumn(spec, actor) {
  return spec.ownerColumn === "seller_user_id" ? { seller_user_id: actor.userId } : { [spec.ownerColumn]: actor.userId };
}

function workspaceRows(ctx) {
  return [
    ctx.owner,
    ctx.workspaceAdmin,
    ctx.workspaceEditor,
    ctx.workspaceViewer,
  ];
}

function editorRows(ctx) {
  return [
    ctx.owner,
    ctx.workspaceAdmin,
    ctx.workspaceEditor,
  ];
}

function deniedRows(ctx) {
  return [
    ctx.workspaceViewer,
    ctx.unrelated,
  ];
}

function genericSpecs(ctx) {
  return [
    {
      table: "user_inventory",
      ownerColumn: "user_id",
      require: () => ctx.refs.productId ? null : "No pokemon_products row was available. Set RLS_TEST_PRODUCT_ID.",
      row: (actor, workspaceId, label) => ({
        user_id: actor.userId,
        workspace_id: workspaceId,
        product_id: ctx.refs.productId,
        quantity: 1,
        cost_each: 1.23,
        location: "RLS Test",
        notes: testSuffix(label),
      }),
      update: (label) => ({ notes: testSuffix(`updated ${label}`) }),
    },
    {
      table: "inventory_items",
      ownerColumn: "user_id",
      row: (actor, workspaceId, label) => ({
        user_id: actor.userId,
        workspace_id: workspaceId,
        name: testSuffix(label),
        quantity: 1,
        product_type: "Card",
        status: "In Stock",
        notes: testSuffix(label),
      }),
      update: (label) => ({ notes: testSuffix(`updated ${label}`) }),
    },
    {
      table: "business_expenses",
      ownerColumn: "user_id",
      row: (actor, workspaceId, label) => ({
        user_id: actor.userId,
        workspace_id: workspaceId,
        vendor: testSuffix(label),
        category: "Miscellaneous",
        amount: 1.23,
        notes: testSuffix(label),
      }),
      update: (label) => ({ notes: testSuffix(`updated ${label}`) }),
    },
    {
      table: "sales_records",
      ownerColumn: "user_id",
      row: (actor, workspaceId, label) => ({
        user_id: actor.userId,
        workspace_id: workspaceId,
        item_name: testSuffix(label),
        platform: "RLS Test",
        quantity_sold: 1,
        final_sale_price: 2.34,
        gross_sale: 2.34,
        net_profit: 1.11,
        notes: testSuffix(label),
      }),
      update: (label) => ({ notes: testSuffix(`updated ${label}`) }),
    },
    {
      table: "mileage_trips",
      ownerColumn: "user_id",
      row: (actor, workspaceId, label) => ({
        user_id: actor.userId,
        workspace_id: workspaceId,
        purpose: testSuffix(label),
        driver: "RLS Test",
        start_miles: 10,
        end_miles: 20,
        business_miles: 10,
        gas_price: 3.5,
        fuel_cost: 1,
        mileage_value: 6.7,
        notes: testSuffix(label),
      }),
      update: (label) => ({ notes: testSuffix(`updated ${label}`) }),
    },
    {
      table: "receipt_records",
      ownerColumn: "user_id",
      row: (actor, workspaceId, label) => ({
        user_id: actor.userId,
        workspace_id: workspaceId,
        merchant: testSuffix(label),
        total: 12.34,
        tax: 0.99,
        split_mode: "expense_only",
        notes: testSuffix(label),
      }),
      update: (label) => ({ notes: testSuffix(`updated ${label}`) }),
    },
    {
      table: "deal_finder_sessions",
      ownerColumn: "user_id",
      row: (actor, workspaceId, label) => ({
        user_id: actor.userId,
        workspace_id: workspaceId,
        source_type: "manual",
        title: testSuffix(label),
        notes: testSuffix(label),
        visibility: "private",
      }),
      update: (label) => ({ notes: testSuffix(`updated ${label}`) }),
    },
    {
      table: "scanner_intake_sessions",
      ownerColumn: "user_id",
      row: (actor, workspaceId, label) => ({
        user_id: actor.userId,
        workspace_id: workspaceId,
        scan_type: "manual",
        raw_value: testSuffix(label),
        status: "review",
        destination: "search_only",
      }),
      update: (label) => ({ raw_value: testSuffix(`updated ${label}`) }),
    },
    {
      table: "marketplace_listings",
      ownerColumn: "seller_user_id",
      row: (actor, workspaceId, label) => ({
        seller_user_id: actor.userId,
        workspace_id: workspaceId,
        listing_type: "For Sale",
        title: testSuffix(label),
        description: testSuffix(label),
        category: "Pokemon",
        quantity: 1,
        asking_price: 1.23,
        source_type: "manual",
        status: "Draft",
      }),
      update: (label) => ({ seller_notes: testSuffix(`updated ${label}`) }),
    },
    {
      table: "marketplace_listing_channels",
      ownerColumn: "user_id",
      row: (actor, workspaceId, label) => ({
        user_id: actor.userId,
        workspace_id: workspaceId,
        platform: "local",
        listing_title: testSuffix(label),
        listed_price: 1.23,
        listing_status: "draft",
      }),
      update: (label) => ({ listing_description: testSuffix(`updated ${label}`) }),
    },
    {
      table: "kid_community_projects",
      ownerColumn: "user_id",
      optional: true,
      row: (actor, workspaceId, label) => ({
        user_id: actor.userId,
        workspace_id: workspaceId,
        project_type: "kid_pack_builder",
        name: testSuffix(label),
        status: "planning",
        notes: testSuffix(label),
      }),
      update: (label) => ({ notes: testSuffix(`updated ${label}`) }),
    },
  ];
}

function storeReportSpec(ctx) {
  return {
    table: "store_reports",
    ownerColumn: "user_id",
    require: () => ctx.refs.storeId ? null : "No stores row was available. Set RLS_TEST_STORE_ID.",
    row: (actor, workspaceId, label) => ({
      user_id: actor.userId,
      workspace_id: workspaceId,
      store_id: ctx.refs.storeId,
      report_type: "In stock",
      quantity_seen: 1,
      notes: testSuffix(label),
    }),
    update: (label) => ({ notes: testSuffix(`updated ${label}`) }),
    moderationPatch: { verification_status: "verified" },
  };
}

async function testGenericWorkspaceTable(ctx, spec) {
  const skipReason = spec.require?.();
  if (skipReason) throw new SkipTest(skipReason);

  const ownerRowId = await insertAllowed(ctx.owner, spec.table, spec.row(ctx.owner, ctx.workspaceId, "owner canonical"), "owner canonical");

  for (const actor of workspaceRows(ctx)) {
    await expectVisible(actor, spec.table, ownerRowId, `${actor.label} workspace read`);
  }
  await expectHidden(ctx.unrelated, spec.table, ownerRowId, "unrelated private workspace read");

  for (const actor of editorRows(ctx)) {
    const rowId = await insertAllowed(actor, spec.table, spec.row(actor, ctx.workspaceId, `${actor.label} write`), `${actor.label} workspace insert`);
    await updateAllowed(actor, spec.table, rowId, spec.update(`${actor.label} write`), `${actor.label} workspace update`);
    await deleteAllowed(actor, spec.table, rowId, `${actor.label} workspace delete`);
  }

  for (const actor of deniedRows(ctx)) {
    await expectInsertDenied(actor, spec.table, spec.row(actor, ctx.workspaceId, `${actor.label} denied`), `${actor.label} workspace insert`);
    await updateDenied(actor, spec.table, ownerRowId, spec.update(`${actor.label} denied`), `${actor.label} workspace update`);
    await deleteDenied(actor, spec.table, ownerRowId, `${actor.label} workspace delete`);
  }

  const legacyId = await insertAllowed(ctx.owner, spec.table, spec.row(ctx.owner, null, "legacy null-workspace"), "owner legacy null-workspace");
  await expectVisible(ctx.owner, spec.table, legacyId, "owner legacy read");
  await expectHidden(ctx.unrelated, spec.table, legacyId, "unrelated legacy read");
  await updateAllowed(ctx.owner, spec.table, legacyId, spec.update("legacy null-workspace"), "owner legacy update");
  await deleteAllowed(ctx.owner, spec.table, legacyId, "owner legacy delete");

  await deleteAllowed(ctx.owner, spec.table, ownerRowId, "owner canonical cleanup");
}

async function rpcAllowed(actor, fnName, args, label) {
  const { error } = await actor.client.rpc(fnName, args);
  if (error) {
    throw new Error(`${label} RPC ${fnName} failed: ${explainError(error)}`);
  }
}

async function rpcDenied(actor, fnName, args, label) {
  const { error } = await actor.client.rpc(fnName, args);
  if (error) {
    return;
  }
  throw new Error(`${label} unexpectedly succeeded via RPC ${fnName}`);
}

async function testStoreReportWorkspaceTable(ctx) {
  if (!ctx.appAdmin) {
    throw new SkipTest("store_reports hard-delete cleanup requires RLS_TEST_APP_ADMIN_EMAIL/PASSWORD.");
  }

  const storeSpec = storeReportSpec(ctx);
  const skipReason = storeSpec.require?.();
  if (skipReason) throw new SkipTest(skipReason);

  const ownerRowId = await insertAllowed(ctx.owner, storeSpec.table, storeSpec.row(ctx.owner, ctx.workspaceId, "owner canonical"), "store report owner canonical");
  track(ctx.appAdmin, "store_reports", ownerRowId);

  for (const actor of workspaceRows(ctx)) {
    await expectVisible(actor, "store_reports", ownerRowId, `${actor.label} store report read`);
  }
  await expectHidden(ctx.unrelated, "store_reports", ownerRowId, "unrelated store report read");

  for (const actor of editorRows(ctx)) {
    const rowId = await insertAllowed(actor, "store_reports", storeSpec.row(actor, ctx.workspaceId, `${actor.label} write`), `${actor.label} store report insert`);
    track(ctx.appAdmin, "store_reports", rowId);
    await updateAllowed(actor, "store_reports", rowId, storeSpec.update(`${actor.label} write`), `${actor.label} store report detail update`);
    await deleteDenied(actor, "store_reports", rowId, `${actor.label} direct store report delete`);
  }

  for (const actor of deniedRows(ctx)) {
    await expectInsertDenied(actor, "store_reports", storeSpec.row(actor, ctx.workspaceId, `${actor.label} denied`), `${actor.label} store report insert`);
    await updateDenied(actor, "store_reports", ownerRowId, storeSpec.update(`${actor.label} denied`), `${actor.label} store report update`);
    await deleteDenied(actor, "store_reports", ownerRowId, `${actor.label} store report delete`);
  }

  const legacyId = await insertAllowed(ctx.owner, "store_reports", storeSpec.row(ctx.owner, null, "legacy null-workspace"), "owner legacy store report");
  track(ctx.appAdmin, "store_reports", legacyId);
  await expectVisible(ctx.owner, "store_reports", legacyId, "owner legacy store report read");
  await expectHidden(ctx.unrelated, "store_reports", legacyId, "unrelated legacy store report read");
  await updateAllowed(ctx.owner, "store_reports", legacyId, storeSpec.update("legacy null-workspace"), "owner legacy store report update");
  await deleteDenied(ctx.owner, "store_reports", legacyId, "owner legacy direct store report delete");

  await rpcAllowed(ctx.owner, "user_mark_own_report_mistaken", { p_report_id: legacyId }, "owner marks own report mistaken");
  await rpcDenied(ctx.unrelated, "user_retract_own_report", { p_report_id: legacyId }, "unrelated retracts report");
}

async function testStoreModerationColumns(ctx) {
  if (!ctx.appAdmin) {
    throw new SkipTest("store report admin moderation checks require RLS_TEST_APP_ADMIN_EMAIL/PASSWORD.");
  }

  const storeSpec = storeReportSpec(ctx);
  const skipReason = storeSpec.require?.();
  if (skipReason) throw new SkipTest(skipReason);
  const rowId = await insertAllowed(ctx.owner, storeSpec.table, storeSpec.row(ctx.owner, ctx.workspaceId, "moderation guard"), "store report moderation fixture");
  track(ctx.appAdmin, "store_reports", rowId);

  await updateDenied(ctx.owner, "store_reports", rowId, storeSpec.moderationPatch, "owner moderation update");
  await updateDenied(ctx.workspaceAdmin, "store_reports", rowId, storeSpec.moderationPatch, "workspace admin moderation update");
  await updateDenied(ctx.workspaceEditor, "store_reports", rowId, storeSpec.moderationPatch, "workspace editor moderation update");
  await updateDenied(ctx.workspaceViewer, "store_reports", rowId, storeSpec.moderationPatch, "viewer moderation update");
  await updateDenied(ctx.unrelated, "store_reports", rowId, storeSpec.moderationPatch, "unrelated moderation update");

  await rpcAllowed(ctx.appAdmin, "admin_verify_store_report", { p_report_id: rowId, p_admin_note: testSuffix("verified by admin RPC") }, "app admin verify store report");
  await deleteAllowed(ctx.appAdmin, "store_reports", rowId, "store report moderation cleanup");
}

async function testChildTable(ctx, spec) {
  const parentId = await insertAllowed(ctx.owner, spec.parentTable, spec.parentRow(ctx.owner, ctx.workspaceId, "child parent"), `${spec.childTable} parent`);
  const childId = await insertAllowed(ctx.owner, spec.childTable, spec.childRow(parentId, "owner child"), "owner child canonical");

  for (const actor of workspaceRows(ctx)) {
    await expectVisible(actor, spec.childTable, childId, `${actor.label} child read`);
  }
  await expectHidden(ctx.unrelated, spec.childTable, childId, "unrelated child read");

  for (const actor of editorRows(ctx)) {
    const rowId = await insertAllowed(actor, spec.childTable, spec.childRow(parentId, `${actor.label} child`), `${actor.label} child insert`);
    await updateAllowed(actor, spec.childTable, rowId, spec.update(`${actor.label} child`), `${actor.label} child update`);
    await deleteAllowed(actor, spec.childTable, rowId, `${actor.label} child delete`);
  }

  for (const actor of deniedRows(ctx)) {
    await expectInsertDenied(actor, spec.childTable, spec.childRow(parentId, `${actor.label} denied`), `${actor.label} child insert`);
    await updateDenied(actor, spec.childTable, childId, spec.update(`${actor.label} denied`), `${actor.label} child update`);
    await deleteDenied(actor, spec.childTable, childId, `${actor.label} child delete`);
  }

  await deleteAllowed(ctx.owner, spec.childTable, childId, "owner child cleanup");
  await deleteAllowed(ctx.owner, spec.parentTable, parentId, "owner child parent cleanup");
}

function childSpecs() {
  return [
    {
      parentTable: "receipt_records",
      childTable: "receipt_line_items",
      parentRow: (actor, workspaceId, label) => ({
        user_id: actor.userId,
        workspace_id: workspaceId,
        merchant: testSuffix(label),
        total: 4.56,
        split_mode: "expense_only",
      }),
      childRow: (parentId, label) => ({
        receipt_id: parentId,
        product_name: testSuffix(label),
        quantity: 1,
        unit_price: 4.56,
        line_total: 4.56,
        destination: "expense_only",
        matched_confidence: "needs_review",
      }),
      update: (label) => ({ product_name: testSuffix(`updated ${label}`) }),
    },
    {
      parentTable: "deal_finder_sessions",
      childTable: "deal_finder_items",
      parentRow: (actor, workspaceId, label) => ({
        user_id: actor.userId,
        workspace_id: workspaceId,
        source_type: "manual",
        title: testSuffix(label),
        visibility: "private",
      }),
      childRow: (parentId, label) => ({
        session_id: parentId,
        product_name: testSuffix(label),
        quantity: 1,
        raw_product_text: testSuffix(label),
      }),
      update: (label) => ({ raw_product_text: testSuffix(`updated ${label}`) }),
    },
    {
      parentTable: "kid_community_projects",
      childTable: "kid_community_project_items",
      optional: true,
      parentRow: (actor, workspaceId, label) => ({
        user_id: actor.userId,
        workspace_id: workspaceId,
        project_type: "kid_pack_builder",
        name: testSuffix(label),
        status: "planning",
      }),
      childRow: (parentId, label) => ({
        project_id: parentId,
        item_name: testSuffix(label),
        quantity: 1,
        notes: testSuffix(label),
      }),
      update: (label) => ({ notes: testSuffix(`updated ${label}`) }),
    },
  ];
}

async function testSuggestionTable(ctx, table) {
  if (!ctx.appAdmin) {
    throw new SkipTest(`${table} creates durable review rows; set RLS_TEST_APP_ADMIN_EMAIL/PASSWORD for admin cleanup and moderation checks.`);
  }
  const row = {
    user_id: ctx.unrelated.userId,
    suggestion_type: "rls_test",
    target_table: table.replace("_suggestions", ""),
    submitted_data: { runId: RUN_ID, testOnly: true },
    notes: testSuffix(`${table} submission`),
    source: "rls-test",
    status: "Submitted",
  };

  const suggestionId = await insertAllowed(ctx.unrelated, table, row, "regular user suggestion submit");
  cleanupTasks.push({ actor: ctx.appAdmin, table, id: suggestionId });
  await expectVisible(ctx.unrelated, table, suggestionId, "submitter reads own suggestion");
  await expectHidden(ctx.workspaceViewer, table, suggestionId, "other regular user cannot read suggestion");
  await updateDenied(ctx.unrelated, table, suggestionId, { status: "Approved", admin_note: "should be denied" }, "regular user moderation update");
  await updateAllowed(ctx.appAdmin, table, suggestionId, { status: "Under Review", admin_note: testSuffix("admin moderation check") }, "app admin suggestion moderation");
  await deleteAllowed(ctx.appAdmin, table, suggestionId, "app admin suggestion cleanup");
}

async function testMarketplacePublicRead(ctx) {
  if (!ctx.appAdmin) {
    throw new SkipTest("Active marketplace fixture requires RLS_TEST_APP_ADMIN_EMAIL/PASSWORD because users cannot self-activate listings.");
  }

  const listing = {
    seller_user_id: ctx.owner.userId,
    workspace_id: ctx.workspaceId,
    listing_type: "For Sale",
    title: testSuffix("public active listing"),
    description: testSuffix("public active listing"),
    category: "Pokemon",
    quantity: 1,
    asking_price: 1.23,
    source_type: "manual",
    status: "Draft",
  };
  const rowId = await insertAllowed(ctx.owner, "marketplace_listings", listing, "marketplace public read fixture");
  track(ctx.appAdmin, "marketplace_listings", rowId);
  await updateAllowed(ctx.appAdmin, "marketplace_listings", rowId, { status: "Active" }, "app admin activates marketplace listing");
  await expectVisible(ctx.unrelated, "marketplace_listings", rowId, "unrelated public active marketplace read");
  await deleteAllowed(ctx.appAdmin, "marketplace_listings", rowId, "active marketplace cleanup");
}

async function testMarketplaceSelfActivation(ctx) {
  const listing = {
    seller_user_id: ctx.owner.userId,
    workspace_id: ctx.workspaceId,
    listing_type: "For Sale",
    title: testSuffix("draft listing"),
    category: "Pokemon",
    quantity: 1,
    asking_price: 1.23,
    source_type: "manual",
    status: "Draft",
  };
  const rowId = await insertAllowed(ctx.owner, "marketplace_listings", listing, "marketplace draft fixture");
  await updateDenied(ctx.owner, "marketplace_listings", rowId, { status: "Active" }, "owner self-activation");
  await deleteAllowed(ctx.owner, "marketplace_listings", rowId, "marketplace draft cleanup");
}

async function testOrphanWorkspaceFixture(ctx) {
  const table = env("RLS_TEST_ORPHAN_TABLE");
  const rowId = env("RLS_TEST_ORPHAN_ROW_ID");
  if (!table || !rowId) {
    throw new SkipTest(
      "orphan-workspace rows cannot be safely created through anon-key clients when workspace_id has a foreign key. " +
      "Set RLS_TEST_ORPHAN_TABLE and RLS_TEST_ORPHAN_ROW_ID for an existing orphan row owned by RLS_TEST_OWNER."
    );
  }

  const spec = genericSpecs(ctx).find((candidate) => candidate.table === table);
  if (!spec) {
    throw new SkipTest(`No generic table spec exists for orphan fixture table ${table}.`);
  }

  await expectVisible(ctx.owner, table, rowId, "owner orphan safeguard read");
  await updateAllowed(ctx.owner, table, rowId, spec.update("orphan safeguard owner update"), "owner orphan safeguard update");
  await updateDenied(ctx.unrelated, table, rowId, spec.update("orphan safeguard unrelated update"), "unrelated orphan safeguard update");
  await deleteDenied(ctx.unrelated, table, rowId, "unrelated orphan safeguard delete");
}

async function resolveFixtures(ctx) {
  const productId = env("RLS_TEST_PRODUCT_ID") || await maybeFirstId(ctx.owner, "pokemon_products");
  const storeId = env("RLS_TEST_STORE_ID") || await maybeFirstId(ctx.owner, "stores");
  ctx.refs = { productId, storeId };
}

async function main() {
  assertSafeTarget();

  const owner = await signIn("workspace-owner", "RLS_TEST_OWNER_EMAIL", "RLS_TEST_OWNER_PASSWORD");
  const workspaceAdmin = await signIn("workspace-admin", "RLS_TEST_WORKSPACE_ADMIN_EMAIL", "RLS_TEST_WORKSPACE_ADMIN_PASSWORD");
  const workspaceEditor = await signIn("workspace-editor", "RLS_TEST_WORKSPACE_EDITOR_EMAIL", "RLS_TEST_WORKSPACE_EDITOR_PASSWORD");
  const workspaceViewer = await signIn("workspace-viewer", "RLS_TEST_WORKSPACE_VIEWER_EMAIL", "RLS_TEST_WORKSPACE_VIEWER_PASSWORD");
  const unrelated = await signIn("unrelated-user", "RLS_TEST_UNRELATED_EMAIL", "RLS_TEST_UNRELATED_PASSWORD");
  const appAdmin = await optionalAppAdmin();

  const ctx = { owner, workspaceAdmin, workspaceEditor, workspaceViewer, unrelated, appAdmin, refs: {} };
  ctx.workspaceId = await setupWorkspace(ctx);
  await resolveFixtures(ctx);

  for (const spec of genericSpecs(ctx)) {
    await runTest(`${spec.table}: workspace role read/write/delete and legacy owner rows`, async () => {
      await testGenericWorkspaceTable(ctx, spec);
    });
  }

  await runTest("store_reports: workspace reads, detail edits, no direct user deletes", async () => {
    await testStoreReportWorkspaceTable(ctx);
  });

  for (const spec of childSpecs()) {
    await runTest(`${spec.childTable}: parent workspace role inheritance`, async () => {
      await testChildTable(ctx, spec);
    });
  }

  for (const table of ["catalog_suggestions", "store_suggestions", "sku_suggestions"]) {
    await runTest(`${table}: regular submission and admin moderation`, async () => {
      await testSuggestionTable(ctx, table);
    });
  }

  await runTest("marketplace_listings: public Active listing read remains available", async () => {
    await testMarketplacePublicRead(ctx);
  });

  await runTest("marketplace_listings: non-admin seller cannot self-activate public listing", async () => {
    await testMarketplaceSelfActivation(ctx);
  });

  await runTest("store_reports: moderation fields remain admin-only", async () => {
    await testStoreModerationColumns(ctx);
  });

  await runTest("legacy orphan-workspace safeguard: owner-only access", async () => {
    await testOrphanWorkspaceFixture(ctx);
  });
}

main()
  .catch((error) => {
    console.error(`FATAL ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    const failed = results.filter((result) => result.status === "FAIL");
    const skipped = results.filter((result) => result.status === "SKIP");
    console.log("");
    console.log(`Workspace RLS role test summary for ${RUN_ID}`);
    console.log(`PASS ${results.filter((result) => result.status === "PASS").length}`);
    console.log(`SKIP ${skipped.length}`);
    console.log(`FAIL ${failed.length}`);
    for (const result of skipped) {
      console.log(`SKIP ${result.name}: ${result.detail}`);
    }
    for (const result of failed) {
      console.log(`FAIL ${result.name}: ${result.detail}`);
    }
    if (failed.length > 0 || process.exitCode) {
      process.exitCode = 1;
    }
  });
