#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

const ROOT = path.resolve(__dirname, "..");

function loadEnvFile(fileName) {
  const filePath = path.join(ROOT, fileName);
  if (!fs.existsSync(filePath)) return;
  dotenv.config({ path: filePath, override: false, quiet: true });
}

loadEnvFile(".env.local");
loadEnvFile(".env");

function envStatus(name) {
  console.log(`${name} is ${process.env[name] ? "set" : "missing"}`);
}

[
  "SUPABASE_DB_URL",
  "DATABASE_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
].forEach(envStatus);
console.log(`SUPABASE_DB_SSL_NO_VERIFY is ${process.env.SUPABASE_DB_SSL_NO_VERIFY === "true" ? "enabled" : "disabled"}`);
if (process.env.SUPABASE_DB_SSL_NO_VERIFY === "true") {
  console.log("WARNING: SSL certificate verification is disabled for this local verification run only.");
}
console.log("");

const rawDbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const allowInsecureDbSsl = process.env.SUPABASE_DB_SSL_NO_VERIFY === "true";

function buildPgConfig() {
  if (!rawDbUrl) return null;

  const parsedUrl = new URL(rawDbUrl);
  const strippedSslMode = parsedUrl.searchParams.has("sslmode");
  parsedUrl.searchParams.delete("sslmode");
  console.log(`sslmode stripped from verifier connection: ${strippedSslMode ? "yes" : "no"}`);

  return {
    connectionString: parsedUrl.toString(),
    ssl: {
      rejectUnauthorized: !allowInsecureDbSsl,
    },
  };
}

const relationChecks = [
  ["workspaces table", "public.workspaces"],
  ["workspace memberships table", "public.workspace_memberships"],
  ["profiles table", "public.profiles"],
  ["inventory items table", "public.inventory_items"],
  ["Vault inventory table", "public.user_inventory"],
  ["business expenses table", "public.business_expenses"],
  ["sales records table", "public.sales_records"],
  ["mileage trips table", "public.mileage_trips"],
  ["Scout reports table", "public.store_reports"],
  ["marketplace listings table", "public.marketplace_listings"],
  ["catalog suggestions table", "public.catalog_suggestions"],
  ["store suggestions table", "public.store_suggestions"],
  ["SKU suggestions table", "public.sku_suggestions"],
  ["master_catalog_items table", "public.master_catalog_items"],
  ["catalog_search_lightweight view", "public.catalog_search_lightweight"],
  ["catalog_item_details view", "public.catalog_item_details"],
  ["pokemon_catalog_browse view", "public.pokemon_catalog_browse"],
  ["Deal Finder sessions table", "public.deal_finder_sessions"],
  ["Deal Finder items table", "public.deal_finder_items"],
  ["scanner intake table", "public.scanner_intake_sessions"],
  ["receipt OCR/transcript draft table", "public.receipt_records"],
  ["receipt line items table", "public.receipt_line_items"],
  ["notification preferences table", "public.notification_preferences"],
  ["cross-listing channel draft table", "public.marketplace_listing_channels"],
  ["Kid Pack Builder project table", "public.kid_community_projects"],
  ["Kid Pack Builder project items table", "public.kid_community_project_items"],
  ["app user preferences table", "public.app_user_preferences"],
  ["user trust profiles table", "public.user_trust_profiles"],
];

const indexChecks = [
  "master_catalog_items_name_trgm_idx",
  "master_catalog_items_set_name_trgm_idx",
  "master_catalog_items_product_type_trgm_idx",
  "master_catalog_identifiers_lookup_idx",
  "master_market_sources_item_idx",
  "universal_data_suggestions_status_idx",
  "notification_preferences_user_type_idx",
  "deal_finder_sessions_user_created_idx",
  "deal_finder_items_session_idx",
  "scanner_intake_sessions_user_created_idx",
  "marketplace_listing_channels_workspace_status_idx",
  "receipt_records_user_created_idx",
  "kid_community_projects_workspace_status_idx",
];

const rlsChecks = [
  "workspaces",
  "workspace_memberships",
  "profiles",
  "inventory_items",
  "user_inventory",
  "business_expenses",
  "sales_records",
  "mileage_trips",
  "store_reports",
  "marketplace_listings",
  "catalog_suggestions",
  "store_suggestions",
  "sku_suggestions",
  "master_catalog_items",
  "master_catalog_variants",
  "master_catalog_identifiers",
  "master_market_price_sources",
  "master_market_summaries",
  "universal_data_suggestions",
  "app_user_preferences",
  "notification_preferences",
  "deal_finder_sessions",
  "deal_finder_items",
  "scanner_intake_sessions",
  "marketplace_listing_channels",
  "receipt_records",
  "receipt_line_items",
  "kid_community_projects",
  "kid_community_project_items",
  "user_trust_profiles",
];

const genericWorkspaceTables = [
  "user_inventory",
  "inventory_items",
  "business_expenses",
  "sales_records",
  "mileage_trips",
  "app_user_preferences",
  "notification_preferences",
  "deal_finder_sessions",
  "scanner_intake_sessions",
  "marketplace_listing_channels",
  "receipt_records",
  "kid_community_projects",
];

const suggestionTables = ["catalog_suggestions", "store_suggestions", "sku_suggestions"];

const policyChecks = [
  ["master_catalog_items", "Public read master catalog items"],
  ["master_catalog_variants", "Public read master catalog variants"],
  ["master_catalog_identifiers", "Public read approved catalog identifiers"],
  ["master_market_price_sources", "Public read master market price sources"],
  ["master_market_summaries", "Public read master market summaries"],
  ["universal_data_suggestions", "Users create universal data suggestions"],
  ["universal_data_suggestions", "Users read own universal data suggestions"],
  ["universal_data_suggestions", "Admins manage universal data suggestions"],
  ...suggestionTables.flatMap((tableName) => [
    [tableName, `suggestions_insert_own_${tableName}`],
    [tableName, `suggestions_read_own_or_admin_${tableName}`],
    [tableName, `suggestions_update_own_unreviewed_${tableName}`],
    [tableName, `suggestions_admin_manage_${tableName}`],
  ]),
  ...genericWorkspaceTables.flatMap((tableName) => [
    [tableName, `workspace_read_strict_${tableName}`],
    [tableName, `workspace_insert_strict_${tableName}`],
    [tableName, `workspace_update_strict_${tableName}`],
    [tableName, `workspace_delete_strict_${tableName}`],
  ]),
  ["store_reports", "store_reports_read_workspace_strict"],
  ["store_reports", "store_reports_insert_own_or_workspace_editor"],
  ["store_reports", "store_reports_update_details_workspace_strict"],
  ["store_reports", "store_reports_user_status_rpc_update"],
  ["store_reports", "store_reports_admin_delete"],
  ["marketplace_listings", "marketplace_read_active_own_or_admin"],
  ["marketplace_listings", "marketplace_workspace_read_nonpublic"],
  ["marketplace_listings", "marketplace_users_create_draft_or_pending_workspace"],
  ["marketplace_listings", "marketplace_users_update_own_nonpublic_workspace"],
  ["marketplace_listings", "marketplace_users_delete_own_draft_workspace"],
  ["receipt_line_items", "receipt_lines_read_workspace_strict"],
  ["receipt_line_items", "receipt_lines_write_workspace_strict"],
  ["deal_finder_items", "deal_items_read_workspace_strict"],
  ["deal_finder_items", "deal_items_write_workspace_strict"],
  ["kid_community_project_items", "kid_project_items_read_workspace_strict"],
  ["kid_community_project_items", "kid_project_items_write_workspace_strict"],
  ["user_trust_profiles", "Users manage own trust profile"],
];

const functionChecks = [
  ["workspace read helper", "public.can_read_workspace(uuid)"],
  ["workspace edit helper", "public.can_edit_workspace(uuid)"],
  ["admin helper", "public.is_admin()"],
  ["admin/moderator helper", "public.is_admin_or_moderator()"],
  ["store report moderation core RPC", "public.admin_set_store_report_moderation(uuid, text, text)"],
  ["admin verify store report RPC", "public.admin_verify_store_report(uuid, text)"],
  ["admin hide store report RPC", "public.admin_hide_store_report(uuid, text)"],
  ["admin restore store report RPC", "public.admin_restore_store_report(uuid, text)"],
  ["admin soft delete store report RPC", "public.admin_soft_delete_store_report(uuid, text)"],
  ["admin disputed store report RPC", "public.admin_mark_report_disputed(uuid, text)"],
  ["user store report status core RPC", "public.user_set_own_store_report_status(uuid, text)"],
  ["user retract report RPC", "public.user_retract_own_report(uuid)"],
  ["user mistaken report RPC", "public.user_mark_own_report_mistaken(uuid)"],
  ["store report moderation guard function", "public.store_reports_guard_moderation_fields()"],
];

const functionDefinitionChecks = [
  {
    name: "can_read_workspace allows viewer reads",
    signature: "public.can_read_workspace(uuid)",
    includes: ["'viewer'", "'editor'", "'admin'", "'owner'"],
  },
  {
    name: "can_edit_workspace allows owner/admin/editor only",
    signature: "public.can_edit_workspace(uuid)",
    includes: ["'editor'", "'admin'", "'owner'"],
    excludes: ["'viewer'"],
  },
];

const policyExpressionChecks = [
  ...genericWorkspaceTables.flatMap((tableName) => [
    {
      tableName,
      policyName: `workspace_read_strict_${tableName}`,
      columnName: "qual",
      includes: ["can_read_workspace(workspace_id)", "is_admin_or_moderator"],
    },
    {
      tableName,
      policyName: `workspace_insert_strict_${tableName}`,
      columnName: "with_check",
      includes: ["workspace_id is null", "can_edit_workspace(workspace_id)", "is_admin_or_moderator"],
    },
    {
      tableName,
      policyName: `workspace_update_strict_${tableName}`,
      columnName: "with_check",
      includes: ["workspace_id is null", "not (exists", "can_edit_workspace(workspace_id)", "is_admin_or_moderator"],
    },
    {
      tableName,
      policyName: `workspace_delete_strict_${tableName}`,
      columnName: "qual",
      includes: ["workspace_id is null", "not (exists", "can_edit_workspace(workspace_id)", "is_admin_or_moderator"],
    },
  ]),
  ...suggestionTables.flatMap((tableName) => [
    {
      tableName,
      policyName: `suggestions_insert_own_${tableName}`,
      columnName: "with_check",
      includes: ["auth.uid()", "submitted", "admin_note is null", "reviewed_by is null", "reviewed_at is null"],
    },
    {
      tableName,
      policyName: `suggestions_admin_manage_${tableName}`,
      columnName: "with_check",
      includes: ["is_admin_or_moderator"],
    },
  ]),
  {
    tableName: "store_reports",
    policyName: "store_reports_read_workspace_strict",
    columnName: "qual",
    includes: ["can_read_workspace(workspace_id)", "is_admin_or_moderator"],
  },
  {
    tableName: "store_reports",
    policyName: "store_reports_insert_own_or_workspace_editor",
    columnName: "with_check",
    includes: ["can_edit_workspace(workspace_id)", "is_admin_or_moderator"],
  },
  {
    tableName: "store_reports",
    policyName: "store_reports_update_details_workspace_strict",
    columnName: "with_check",
    includes: ["workspace_id is null", "not (exists", "can_edit_workspace(workspace_id)", "is_admin_or_moderator"],
  },
  {
    tableName: "store_reports",
    policyName: "store_reports_user_status_rpc_update",
    columnName: "with_check",
    includes: ["app.store_report_user_status_rpc", "retracted", "mistaken"],
  },
  {
    tableName: "marketplace_listings",
    policyName: "marketplace_read_active_own_or_admin",
    columnName: "qual",
    includes: ["active"],
  },
  {
    tableName: "marketplace_listings",
    policyName: "marketplace_users_create_draft_or_pending_workspace",
    columnName: "with_check",
    includes: ["draft", "pending review", "can_edit_workspace(workspace_id)"],
    excludes: ["active"],
  },
  {
    tableName: "marketplace_listings",
    policyName: "marketplace_users_update_own_nonpublic_workspace",
    columnName: "with_check",
    includes: ["draft", "pending review", "sold", "traded", "archived", "can_edit_workspace(workspace_id)"],
    excludes: ["active"],
  },
  {
    tableName: "receipt_line_items",
    policyName: "receipt_lines_read_workspace_strict",
    columnName: "qual",
    includes: ["receipt_records", "can_read_workspace(receipt.workspace_id)"],
  },
  {
    tableName: "receipt_line_items",
    policyName: "receipt_lines_write_workspace_strict",
    columnName: "with_check",
    includes: ["receipt_records", "can_edit_workspace(receipt.workspace_id)", "workspace_id is null"],
  },
  {
    tableName: "deal_finder_items",
    policyName: "deal_items_read_workspace_strict",
    columnName: "qual",
    includes: ["deal_finder_sessions", "can_read_workspace(session.workspace_id)"],
  },
  {
    tableName: "deal_finder_items",
    policyName: "deal_items_write_workspace_strict",
    columnName: "with_check",
    includes: ["deal_finder_sessions", "can_edit_workspace(session.workspace_id)", "workspace_id is null"],
  },
  {
    tableName: "kid_community_project_items",
    policyName: "kid_project_items_read_workspace_strict",
    columnName: "qual",
    includes: ["kid_community_projects", "can_read_workspace(project.workspace_id)"],
  },
  {
    tableName: "kid_community_project_items",
    policyName: "kid_project_items_write_workspace_strict",
    columnName: "with_check",
    includes: ["kid_community_projects", "can_edit_workspace(project.workspace_id)", "workspace_id is null"],
  },
];

const triggerChecks = [
  ["set_master_catalog_items_updated_at", "master_catalog_items"],
  ["set_master_catalog_variants_updated_at", "master_catalog_variants"],
  ["set_master_catalog_identifiers_updated_at", "master_catalog_identifiers"],
  ["set_master_market_price_sources_updated_at", "master_market_price_sources"],
  ["set_master_market_summaries_updated_at", "master_market_summaries"],
  ["set_universal_data_suggestions_updated_at", "universal_data_suggestions"],
  ["store_reports_guard_moderation_fields", "store_reports"],
];

const migrationChecks = [
  ["20260510190000", "master_catalog_market_foundation"],
  ["20260510203000", "tcg_operating_system_foundation"],
];

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  const status = ok ? "PASS" : "FAIL";
  console.log(`${status} ${name}${detail ? ` - ${detail}` : ""}`);
}

function normalizeSql(sql = "") {
  return String(sql).toLowerCase().replace(/\s+/g, " ").trim();
}

async function runPostgresChecks() {
  const { Client } = require("pg");
  const client = new Client(buildPgConfig());
  await client.connect();

  try {
    for (const [label, relation] of relationChecks) {
      const { rows } = await client.query("select to_regclass($1) is not null as ok", [relation]);
      record(label, Boolean(rows[0]?.ok), relation);
    }

    const { rows: extensionRows } = await client.query("select exists(select 1 from pg_extension where extname = 'pg_trgm') as ok");
    record("pg_trgm extension", Boolean(extensionRows[0]?.ok));

    const { rows: functionRows } = await client.query("select to_regprocedure('public.set_updated_at()') is not null as ok");
    record("set_updated_at function", Boolean(functionRows[0]?.ok));

    for (const [label, signature] of functionChecks) {
      const { rows } = await client.query("select to_regprocedure($1) is not null as ok", [signature]);
      record(`function ${label}`, Boolean(rows[0]?.ok), signature);
    }

    for (const check of functionDefinitionChecks) {
      const { rows } = await client.query(
        "select case when to_regprocedure($1) is null then null else pg_get_functiondef(to_regprocedure($1)) end as definition",
        [check.signature]
      );
      const definition = normalizeSql(rows[0]?.definition || "");
      const missing = (check.includes || []).filter((fragment) => !definition.includes(fragment.toLowerCase()));
      const unexpected = (check.excludes || []).filter((fragment) => definition.includes(fragment.toLowerCase()));
      record(
        `function definition ${check.name}`,
        definition && missing.length === 0 && unexpected.length === 0,
        [
          missing.length ? `missing: ${missing.join(", ")}` : "",
          unexpected.length ? `unexpected: ${unexpected.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("; ") || check.signature
      );
    }

    for (const indexName of indexChecks) {
      const { rows } = await client.query(
        "select exists(select 1 from pg_indexes where schemaname = 'public' and indexname = $1) as ok",
        [indexName]
      );
      record(`index ${indexName}`, Boolean(rows[0]?.ok));
    }

    for (const tableName of rlsChecks) {
      const { rows } = await client.query(
        `select c.relrowsecurity as ok
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = $1`,
        [tableName]
      );
      record(`RLS enabled on ${tableName}`, Boolean(rows[0]?.ok));
    }

    for (const [tableName, policyName] of policyChecks) {
      const { rows } = await client.query(
        "select exists(select 1 from pg_policies where schemaname = 'public' and tablename = $1 and policyname = $2) as ok",
        [tableName, policyName]
      );
      record(`policy ${tableName}: ${policyName}`, Boolean(rows[0]?.ok));
    }

    for (const check of policyExpressionChecks) {
      const { rows } = await client.query(
        "select qual, with_check from pg_policies where schemaname = 'public' and tablename = $1 and policyname = $2",
        [check.tableName, check.policyName]
      );
      const expression = normalizeSql(rows[0]?.[check.columnName] || "");
      const missing = (check.includes || []).filter((fragment) => !expression.includes(fragment.toLowerCase()));
      const unexpected = (check.excludes || []).filter((fragment) => expression.includes(fragment.toLowerCase()));
      record(
        `policy expression ${check.tableName}: ${check.policyName}.${check.columnName}`,
        expression && missing.length === 0 && unexpected.length === 0,
        [
          missing.length ? `missing: ${missing.join(", ")}` : "",
          unexpected.length ? `unexpected: ${unexpected.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("; ") || "hardened expression present"
      );
    }

    for (const [triggerName, tableName] of triggerChecks) {
      const { rows } = await client.query(
        `select exists(
          select 1
          from pg_trigger t
          join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname = $1
            and t.tgname = $2
            and not t.tgisinternal
        ) as ok`,
        [tableName, triggerName]
      );
      record(`trigger ${triggerName}`, Boolean(rows[0]?.ok));
    }

    for (const [version, name] of migrationChecks) {
      const { rows } = await client.query(
        "select exists(select 1 from supabase_migrations.schema_migrations where version = $1 and name = $2) as ok",
        [version, name]
      );
      record(`migration history ${version}_${name}`, Boolean(rows[0]?.ok));
    }
  } finally {
    await client.end();
  }
}

async function runRestChecks() {
  const { createClient } = require("@supabase/supabase-js");
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const [label, relation] of relationChecks) {
    const table = relation.replace(/^public\./, "");
    const { error } = await client.from(table).select("*").limit(1);
    record(label, !error, error ? error.message : table);
  }

  for (const indexName of indexChecks) {
    record(`index ${indexName}`, false, "requires SUPABASE_DB_URL/DATABASE_URL for pg_catalog verification");
  }
  for (const tableName of rlsChecks) {
    record(`RLS enabled on ${tableName}`, false, "requires SUPABASE_DB_URL/DATABASE_URL for pg_catalog verification");
  }
  for (const [label, signature] of functionChecks) {
    record(`function ${label}`, false, `requires SUPABASE_DB_URL/DATABASE_URL for ${signature}`);
  }
  for (const check of functionDefinitionChecks) {
    record(`function definition ${check.name}`, false, "requires SUPABASE_DB_URL/DATABASE_URL for function definition verification");
  }
  for (const [tableName, policyName] of policyChecks) {
    record(`policy ${tableName}: ${policyName}`, false, "requires SUPABASE_DB_URL/DATABASE_URL for pg_policies verification");
  }
  for (const check of policyExpressionChecks) {
    record(
      `policy expression ${check.tableName}: ${check.policyName}.${check.columnName}`,
      false,
      "requires SUPABASE_DB_URL/DATABASE_URL for pg_policies verification"
    );
  }
  for (const [triggerName] of triggerChecks) {
    record(`trigger ${triggerName}`, false, "requires SUPABASE_DB_URL/DATABASE_URL for pg_trigger verification");
  }
  for (const [version, name] of migrationChecks) {
    record(`migration history ${version}_${name}`, false, "requires SUPABASE_DB_URL/DATABASE_URL for migration history verification");
  }
}

async function main() {
  console.log("Verifying Ember & Tide Phase 2 Supabase foundation...\n");

  if (rawDbUrl) {
    await runPostgresChecks();
  } else if (supabaseUrl && supabaseKey) {
    console.log("No SUPABASE_DB_URL/DATABASE_URL found. Running partial REST checks only.\n");
    await runRestChecks();
  } else {
    console.error("Missing Supabase connection. Set SUPABASE_DB_URL for full checks, or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for partial REST checks.");
    process.exit(1);
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("FAIL verification crashed -", error.message || error);
  process.exit(1);
});
