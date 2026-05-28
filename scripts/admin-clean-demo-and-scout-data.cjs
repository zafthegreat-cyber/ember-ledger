#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

const ROOT = path.resolve(__dirname, "..");
const CONFIRM_FLAG = "--confirm-clean-demo-and-scout-data";
const BACKUP_ROOT = path.join(ROOT, "artifacts", "backups", "demo-scout-cleanup");
const args = process.argv.slice(2);
const hardDelete = args.includes(CONFIRM_FLAG) && !args.includes("--dry-run");
const dryRun = !hardDelete;

const cleanupKeywords = [
  "scout",
  "report",
  "restock",
  "prediction",
  "forecast",
  "guess",
  "drop",
  "alert",
  "confirmation",
  "proof",
  "sighting",
  "store_reports",
  "profile",
  "beta",
  "demo",
  "test",
  "mock",
  "fake",
  "seed",
  "tidepool",
  "inventory",
  "forge",
  "receipt",
  "expense",
  "mileage",
  "sale",
  "notification",
  "feedback",
  "missing",
  "catalog",
  "person",
  "people",
  "purchaser",
  "vehicle",
];

const tableDescriptions = {
  "auth.users": "Supabase authentication user records.",
  "public.profiles": "Application profile, beta access, role, and public identity data.",
  "public.user_profiles": "Legacy/early user profile preferences and beta plan metadata.",
  "public.beta_access_requests": "Beta request queue records.",
  "public.beta_invites": "Invite links and invite status records.",
  "public.beta_feedback": "Beta feedback and app issue reports.",
  "public.store_reports": "Scout/store restock report rows, including historical imports.",
  "public.restock_reports": "Legacy restock report rows from the original schema.",
  "public.store_guesses": "Community or private store restock guesses.",
  "public.forecast_windows": "Generated forecast/prediction windows derived from reports or guesses.",
  "public.scout_report_reviews": "Admin review queue rows for Scout report changes or reports.",
  "public.store_intelligence_suggestions": "Store intelligence suggestion/review rows.",
  "public.retailer_observations": "Retailer product availability observation snapshots.",
  "public.retailer_alert_log": "Generated retailer/restock alert log rows.",
  "public.retailer_monitor_targets": "Retailer monitor configuration targets.",
  "public.retailer_products": "Retailer product records used by monitor tooling.",
  "public.stores": "Shared store directory. Intentionally protected from cleanup.",
  "public.store_aliases": "Shared store aliases/nicknames. Intentionally protected from cleanup.",
  "public.store_regions": "Shared store region metadata. Intentionally protected from cleanup.",
  "public.user_inventory": "Legacy user inventory rows.",
  "public.inventory_items": "Inventory/Vault/Forge item records.",
  "public.vault_items": "Legacy Vault item rows.",
  "public.business_expenses": "Forge/business expense rows.",
  "public.receipt_records": "Receipt records and receipt proof metadata.",
  "public.receipt_line_items": "Receipt line item rows.",
  "public.notifications": "User notification rows, including generated alert notifications.",
  "public.app_activity_events": "App activity/audit event rows.",
  "public.audit_logs": "Audit log rows for admin/system actions.",
  "public.admin_review_log": "Admin review action log rows.",
  "public.market_price_snapshots": "Market price snapshots. Intentionally protected unless fake-user owned.",
  "public.catalog_products": "Catalog product rows. Intentionally protected.",
  "public.pokemon_products": "Pokemon catalog products. Intentionally protected.",
  "public.master_catalog_items": "Master catalog item records. Intentionally protected.",
  "public.product_market_price_current": "Current market price data. Intentionally protected.",
  "public.product_market_price_history": "Historical market price data. Intentionally protected.",
  "public.product_identifiers": "UPC/SKU/product identifiers. Intentionally protected.",
  "public.kids_program_applications": "The Spark/Kids Program applications.",
  "public.little_sparks_applications": "Legacy/alternate Kids Program applications.",
  "public.marketplace_listings": "Marketplace/listing rows.",
  "public.listing_photos": "Listing photo rows.",
  "public.listing_reports": "Listing report/moderation rows.",
  "public.listing_messages": "Listing message rows.",
  "public.seller_profiles": "Seller profile rows.",
  "public.seller_reviews": "Seller review rows.",
  "public.purchasers": "Reusable purchaser/person rows if present in Supabase.",
};

const intentionallyProtectedTables = new Set([
  "public.stores",
  "public.store_aliases",
  "public.store_regions",
  "public.catalog_products",
  "public.pokemon_products",
  "public.product_catalog",
  "public.market_products",
  "public.master_catalog_items",
  "public.master_catalog_variants",
  "public.master_catalog_identifiers",
  "public.master_market_price_sources",
  "public.master_market_summaries",
  "public.product_identifiers",
  "public.catalog_product_variants",
  "public.tcg_expansions",
  "public.tcg_card_details",
  "public.product_msrp_rules",
  "public.product_market_price_current",
  "public.product_market_price_history",
  "public.market_price_snapshots",
  "public.catalog_search_lightweight",
  "public.app_user_preferences",
  "public.notification_preferences",
  "public.role_audit_log",
  "public.workspace_memberships",
  "public.workspace_members",
  "public.workspace_invites",
  "public.workspaces",
]);

const fakeUserDataProtectedTables = new Set([
  ...intentionallyProtectedTables,
  "auth.users",
  "public.profiles",
  "public.user_profiles",
]);

const scoutAllRowTables = [
  { key: "public.store_reports", reason: "Scout/restock report rows, including historical report imports." },
  { key: "public.restock_reports", reason: "Legacy restock report rows." },
  { key: "public.store_guesses", reason: "Store guess/prediction rows." },
  { key: "public.forecast_windows", reason: "Generated forecast windows." },
  { key: "public.retailer_observations", reason: "Retailer/drop observation rows." },
  { key: "public.retailer_alert_log", reason: "Generated retailer/drop alert rows." },
  { key: "public.scout_report_reviews", reason: "Scout report admin review queue rows." },
];

const conditionalScoutTables = [
  {
    key: "public.store_intelligence_suggestions",
    reason: "Store intelligence rows tied to Scout/restock/report/prediction text.",
  },
  {
    key: "public.user_suggestions",
    reason: "Generic suggestions tied to Scout/restock/report/prediction text.",
  },
  {
    key: "public.admin_review_log",
    reason: "Admin review log rows tied to Scout report review queues.",
  },
  {
    key: "public.notifications",
    reason: "Generated stock/restock prediction notifications.",
  },
  {
    key: "public.app_activity_events",
    reason: "Activity rows tied to Scout/report/restock/prediction activity.",
  },
  {
    key: "public.audit_logs",
    reason: "Audit rows tied to Scout/report/restock/prediction activity.",
  },
];

const userIdColumns = [
  "user_id",
  "userId",
  "owner_user_id",
  "ownerUserId",
  "created_by",
  "createdBy",
  "submitted_by",
  "submittedBy",
  "reviewed_by",
  "reviewedBy",
  "archived_by",
  "archivedBy",
  "seller_id",
  "sellerId",
  "buyer_id",
  "buyerId",
  "actor_user_id",
  "actorUserId",
  "target_user_id",
  "targetUserId",
];

const emailColumns = [
  "email",
  "guest_email",
  "guestEmail",
  "recipient_email",
  "recipientEmail",
  "invited_email",
  "invitedEmail",
  "from_email",
  "fromEmail",
];

const DB_ENV_NAMES = ["SUPABASE_DB_URL", "DATABASE_URL", "POSTGRES_URL"];
const TRACKED_ENV_NAMES = [
  ...DB_ENV_NAMES,
  "VITE_SUPABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_DB_SSL_NO_VERIFY",
];
const trackedEnv = new Set(TRACKED_ENV_NAMES);
const explicitProcessEnv = Object.fromEntries(
  TRACKED_ENV_NAMES.map((name) => [name, process.env[name]]),
);

function hasEnvValue(value) {
  return value !== undefined && value !== "";
}

function parseEnvFile(fileName) {
  const filePath = path.join(ROOT, fileName);
  if (!fs.existsSync(filePath)) return null;
  const dotenv = require("dotenv");
  return dotenv.parse(fs.readFileSync(filePath));
}

function loadEnvFilesPredictably() {
  const loaded = [];
  const warnings = [];
  const sources = {};
  const explicitProtected = [];
  const ignoredDbValues = [];

  for (const name of TRACKED_ENV_NAMES) {
    if (hasEnvValue(explicitProcessEnv[name])) sources[name] = "process";
  }

  for (const fileName of [".env", ".env.local"]) {
    const parsed = parseEnvFile(fileName);
    if (!parsed) continue;
    loaded.push(fileName);

    for (const [name, value] of Object.entries(parsed)) {
      const isTracked = trackedEnv.has(name);
      if (hasEnvValue(explicitProcessEnv[name])) {
        process.env[name] = explicitProcessEnv[name];
        sources[name] = "process";
        if (isTracked && value !== explicitProcessEnv[name]) {
          explicitProtected.push(name);
          warnings.push(`${fileName} value for ${name} was ignored because an explicit process environment value is set.`);
          if (DB_ENV_NAMES.includes(name)) {
            ignoredDbValues.push({ source: name, envSource: fileName, value });
          }
        }
        continue;
      }

      if (!hasEnvValue(process.env[name])) {
        process.env[name] = value;
        if (isTracked) sources[name] = fileName;
        continue;
      }

      if (fileName === ".env.local" && sources[name] === ".env") {
        if (isTracked && process.env[name] !== value) {
          warnings.push(".env.local overrides .env for " + name + ".");
        }
        process.env[name] = value;
        if (isTracked) sources[name] = fileName;
      }
    }
  }

  return {
    loadedEnvFiles: loaded,
    envPrecedenceWarnings: [...new Set(warnings)],
    envSources: sources,
    explicitProcessEnvProtected: [...new Set(explicitProtected)],
    ignoredDbValues,
  };
}

function maskHost(host) {
  const direct = host.match(/^db\.([a-z0-9-]+)\.supabase\.co$/i);
  if (direct) {
    const ref = direct[1];
    return `db.${ref.slice(0, 3)}...${ref.slice(-3)}.supabase.co`;
  }
  const rest = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  if (rest) {
    const ref = rest[1];
    return `${ref.slice(0, 3)}...${ref.slice(-3)}.supabase.co`;
  }
  return host;
}

function maskDatabaseUrl(value) {
  if (!hasEnvValue(value)) return "(not set)";
  try {
    const parsed = new URL(value);
    const auth = parsed.username || parsed.password ? "***:***@" : "";
    const port = parsed.port ? `:${parsed.port}` : "";
    return `${parsed.protocol}//${auth}${maskHost(parsed.hostname)}${port}/***`;
  } catch {
    return "(malformed URL masked)";
  }
}

function validatePostgresUrl(source, value) {
  if (!hasEnvValue(value)) {
    return { source, ok: false, reason: "not set", masked: "(not set)" };
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch (error) {
    return { source, ok: false, reason: `malformed URL: ${error.message}`, masked: maskDatabaseUrl(value) };
  }
  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
    return {
      source,
      ok: false,
      reason: `not a Postgres URL (${parsedUrl.protocol || "unknown protocol"})`,
      masked: maskDatabaseUrl(value),
    };
  }
  if (/^[a-z0-9-]+\.supabase\.co$/i.test(parsedUrl.hostname) && !parsedUrl.hostname.startsWith("db.")) {
    return {
      source,
      ok: false,
      reason: "looks like a Supabase REST API URL, not a Postgres database URL",
      masked: maskDatabaseUrl(value),
    };
  }
  return { source, ok: true, reason: "valid Postgres URL", masked: maskDatabaseUrl(value), value };
}

function selectDatabaseConnection(envLoadReport) {
  const effectiveCandidates = DB_ENV_NAMES.map((source) => ({
    ...validatePostgresUrl(source, process.env[source]),
    envSource: envLoadReport.envSources[source] || "",
    active: true,
  }));
  const ignoredFileCandidates = envLoadReport.ignoredDbValues.map((entry) => ({
    ...validatePostgresUrl(entry.source, entry.value),
    envSource: entry.envSource,
    active: false,
    note: "ignored by precedence; available only as an explicit dry-run fallback if the active connection fails",
  }));
  const candidates = [...effectiveCandidates, ...ignoredFileCandidates];
  const warnings = [];
  const selected = effectiveCandidates.find((candidate) => candidate.ok) || null;

  for (const candidate of candidates) {
    const hasValue = candidate.active ? hasEnvValue(process.env[candidate.source]) : hasEnvValue(candidate.value);
    if (hasValue && !candidate.ok) {
      warnings.push(`${candidate.source} from ${candidate.envSource || "process"} was skipped: ${candidate.reason}.`);
    }
  }
  const validNames = effectiveCandidates.filter((candidate) => candidate.ok).map((candidate) => candidate.source);
  if (validNames.includes("SUPABASE_DB_URL") && validNames.some((name) => name !== "SUPABASE_DB_URL")) {
    warnings.push("SUPABASE_DB_URL was selected because it matches the admin database convention used by existing scripts.");
  }

  return {
    selected,
    connectCandidates: [
      ...(selected ? [selected] : []),
      ...ignoredFileCandidates.filter((candidate) => candidate.ok),
      ...effectiveCandidates.filter((candidate) => candidate.ok && candidate !== selected),
    ],
    candidates: candidates.map((candidate) => ({
      source: candidate.source,
      envSource: candidate.envSource,
      active: candidate.active,
      ok: candidate.ok,
      reason: candidate.reason,
      masked: candidate.masked,
      note: candidate.note || "",
    })),
    selectionWarnings: [...new Set(warnings)],
  };
}

const envLoadReport = loadEnvFilesPredictably();
const connectionSelection = selectDatabaseConnection(envLoadReport);
const connectionString = connectionSelection.selected?.value || "";
const connectionSource = connectionSelection.selected?.source || "";
const sslNoVerify = process.env.SUPABASE_DB_SSL_NO_VERIFY === "true";
let lastConnectionAttempts = [];

function buildEnvDiagnostics() {
  return {
    loadedEnvFiles: envLoadReport.loadedEnvFiles,
    selectedConnectionEnvVar: connectionSource,
    selectedConnectionMasked: connectionSelection.selected?.masked || "(none)",
    envSources: Object.fromEntries(
      TRACKED_ENV_NAMES
        .filter((name) => hasEnvValue(process.env[name]))
        .map((name) => [name, envLoadReport.envSources[name] || "process"]),
    ),
    explicitProcessEnvProtected: envLoadReport.explicitProcessEnvProtected,
    warnings: [...new Set([
      ...envLoadReport.envPrecedenceWarnings,
      ...connectionSelection.selectionWarnings,
    ])],
    candidates: connectionSelection.candidates,
    connectionAttempts: lastConnectionAttempts,
  };
}

function supabaseProjectRef() {
  const value = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
  try {
    const parsed = new URL(value);
    const match = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function buildConnectionConfig(candidate = connectionSelection.selected) {
  const candidateConnectionString = candidate?.value || "";
  const candidateSource = candidate?.source || "";
  if (!candidateConnectionString) {
    const candidateSummary = connectionSelection.candidates
      .map((candidate) => `${candidate.source}: ${candidate.reason}`)
      .join("; ");
    throw new Error(`Missing a valid Postgres database URL. Dry-run needs SUPABASE_DB_URL, DATABASE_URL, or POSTGRES_URL. Candidates: ${candidateSummary}`);
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(candidateConnectionString);
  } catch (error) {
    throw new Error(`Malformed ${candidateSource || "database URL"}: ${error.message}`);
  }
  if (!["postgres:", "postgresql:"].includes(parsedUrl.protocol)) {
    throw new Error(`${candidateSource} must be a Postgres URL, not ${parsedUrl.protocol || "an unknown protocol"}. Do not use the Supabase REST API URL here.`);
  }
  if (/^[a-z0-9-]+\.supabase\.co$/i.test(parsedUrl.hostname) && !parsedUrl.hostname.startsWith("db.")) {
    throw new Error(`${candidateSource} looks like a Supabase REST API URL. Use a direct Postgres URL such as db.<project-ref>.supabase.co or the Supabase pooler.`);
  }
  const projectRef = supabaseProjectRef();
  const username = decodeURIComponent(parsedUrl.username || "");
  const normalizedFromPooler = Boolean(
    projectRef &&
    /\.pooler\.supabase\.com$/i.test(parsedUrl.hostname) &&
    username === "postgres"
  );
  if (normalizedFromPooler) {
    parsedUrl.username = encodeURIComponent(`postgres.${projectRef}`);
  }
  const strippedSslMode = parsedUrl.searchParams.has("sslmode");
  parsedUrl.searchParams.delete("sslmode");
  const safeUsername = decodeURIComponent(parsedUrl.username || "");
  return {
    config: {
      connectionString: parsedUrl.toString(),
      ssl: { rejectUnauthorized: !sslNoVerify },
      statement_timeout: 120000,
      query_timeout: 120000,
      application_name: "ember-admin-demo-scout-cleanup",
    },
    info: {
      source: candidateSource,
      envSource: candidate?.envSource || "",
      activeEnvSelection: candidate?.active !== false,
      maskedUrl: maskDatabaseUrl(parsedUrl.toString()),
      protocol: parsedUrl.protocol,
      host: maskHost(parsedUrl.hostname),
      port: parsedUrl.port || "(default)",
      database: parsedUrl.pathname.replace(/^\//, "") ? "set (masked)" : "",
      username: safeUsername ? "set (masked)" : "",
      usernameHasPoolerProjectRef: /^postgres\.[a-z0-9-]+$/i.test(safeUsername),
      normalizedPoolerUsername: normalizedFromPooler,
      strippedSslMode,
      sslVerification: sslNoVerify ? "disabled by SUPABASE_DB_SSL_NO_VERIFY=true" : "enabled",
    },
  };
}

async function connectWithFallback() {
  const candidates = dryRun
    ? connectionSelection.connectCandidates
    : connectionSelection.connectCandidates.slice(0, 1);
  const uniqueCandidates = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const key = `${candidate.source}:${candidate.envSource}:${candidate.masked}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCandidates.push(candidate);
  }

  const attempts = [];
  let lastError = null;
  for (const candidate of uniqueCandidates) {
    let connection;
    let client;
    try {
      connection = buildConnectionConfig(candidate);
      client = new Client(connection.config);
      await client.connect();
      attempts.push({
        source: connection.info.source,
        envSource: connection.info.envSource,
        activeEnvSelection: connection.info.activeEnvSelection,
        maskedUrl: connection.info.maskedUrl,
        ok: true,
      });
      lastConnectionAttempts = attempts;
      return { client, connection, attempts };
    } catch (error) {
      lastError = error;
      attempts.push({
        source: candidate?.source || "",
        envSource: candidate?.envSource || "",
        activeEnvSelection: candidate?.active !== false,
        maskedUrl: candidate?.masked || "(none)",
        ok: false,
        error: error.message,
      });
      if (client) {
        await client.end().catch(() => {});
      }
      if (!dryRun) break;
    }
  }
  lastConnectionAttempts = attempts;
  throw lastError || new Error("No valid database connection candidate is available.");
}

function safeIdentifier(value) {
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

function tableRef(table) {
  return `${safeIdentifier(table.schema)}.${safeIdentifier(table.name)}`;
}

function tableKey(schema, name) {
  return `${schema}.${name}`;
}

function splitKey(key) {
  const [schema, ...rest] = key.split(".");
  return { schema, name: rest.join(".") };
}

function hasColumn(metadata, key, column) {
  return Boolean(metadata.columnsByTable.get(key)?.has(column));
}

function existingColumns(metadata, key, columns) {
  const set = metadata.columnsByTable.get(key) || new Set();
  return columns.filter((column) => set.has(column));
}

function valueText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function lowerText(value) {
  return valueText(value).toLowerCase();
}

function isTruthy(value) {
  return value === true || value === "true" || value === "1" || value === 1 || value === "yes";
}

function isProtectedIdentity(row) {
  const email = lowerText(row.email);
  const name = lowerText(row.display_name || row.displayName || row.full_name || row.fullName || row.username || row.raw_user_meta_data);
  const role = lowerText(row.app_role || row.appRole || row.user_role || row.userRole || row.admin_role || row.adminRole || row.role || row.raw_app_meta_data);
  if (email.includes("zena") || email.includes("dillon")) return true;
  if (name.includes("zena") || name.includes("dillon")) return true;
  if (isTruthy(row.is_admin) || isTruthy(row.isAdmin)) return true;
  if (/(^|[^a-z])(owner|admin|moderator|founder|official)([^a-z]|$)/i.test(role)) return true;
  return false;
}

function fakeIdentityEvidence(row, source) {
  if (isProtectedIdentity(row)) return [];
  const reasons = [];
  const id = valueText(row.id || row.user_id || row.userId);
  const email = lowerText(row.email);
  const name = lowerText(row.display_name || row.displayName || row.full_name || row.fullName || row.username || row.public_username || row.publicUsername);
  const metadata = lowerText(row.raw_user_meta_data || row.raw_app_meta_data || row.metadata || row.app_metadata || row.user_metadata);
  const sourceText = lowerText(row.source || row.source_type || row.created_by_source);

  if (/^(local-beta|local_beta|smoke-|demo-|fake-|mock-|sample-|dummy-|test-)/i.test(id)) {
    reasons.push(`${source}: non-production id marker (${id})`);
  }
  if (email) {
    if (/(^|[+._-])(test|demo|fake|mock|smoke|qa|sample|dummy)([+._-]|@)/i.test(email)) {
      reasons.push(`${source}: email contains explicit test/demo marker (${email})`);
    }
    if (/@(example\.com|example\.org|example\.net|test\.local|localhost|invalid|emberandtide\.test)$/i.test(email)) {
      reasons.push(`${source}: email uses non-production test domain (${email})`);
    }
  }
  if (/(^|[^a-z])(demo user|test user|fake user|mock user|sample user|dummy user|smoke user|local beta)([^a-z]|$)/i.test(name)) {
    reasons.push(`${source}: display/public name is an explicit test/demo label`);
  }
  if (/(is_demo|\"demo\"|\"test_user\"|\"fake\"|\"mock\"|\"smoke\"|seeded|seed data|local beta)/i.test(metadata)) {
    reasons.push(`${source}: metadata has explicit test/demo/seed marker`);
  }
  if (/(demo|fake|mock|sample|dummy|smoke|seed)/i.test(sourceText)) {
    reasons.push(`${source}: source marker is test/demo (${sourceText})`);
  }

  return [...new Set(reasons)];
}

function keywordMatchesTable(tableName, columns) {
  const haystack = `${tableName} ${columns.join(" ")}`.toLowerCase();
  return cleanupKeywords.some((keyword) => haystack.includes(keyword));
}

function descriptionForTable(key) {
  if (tableDescriptions[key]) return tableDescriptions[key];
  if (key.includes("scout") || key.includes("report") || key.includes("forecast") || key.includes("guess")) {
    return "Scout/report/restock intelligence or review data based on table naming.";
  }
  if (key.includes("catalog") || key.includes("product") || key.includes("price")) {
    return "Catalog/product/price data based on table naming.";
  }
  if (key.includes("inventory") || key.includes("vault") || key.includes("forge")) {
    return "Collection, Vault, Forge, or inventory data based on table naming.";
  }
  if (key.includes("profile") || key.includes("user") || key.includes("beta")) {
    return "User/profile/beta access data based on table naming.";
  }
  return "Application data table discovered from schema metadata.";
}

async function query(client, sql, params = []) {
  return client.query(sql, params);
}

async function getMetadata(client) {
  const columnsResult = await query(client, `
    select table_schema, table_name, column_name, data_type
    from information_schema.columns
    where table_schema in ('public', 'auth')
    order by table_schema, table_name, ordinal_position
  `);
  const columnsByTable = new Map();
  const dataTypes = new Map();
  for (const row of columnsResult.rows) {
    const key = tableKey(row.table_schema, row.table_name);
    if (!columnsByTable.has(key)) columnsByTable.set(key, new Set());
    columnsByTable.get(key).add(row.column_name);
    dataTypes.set(`${key}.${row.column_name}`, row.data_type);
  }

  const fkResult = await query(client, `
    select
      tc.table_schema,
      tc.table_name,
      kcu.column_name,
      ccu.table_schema as foreign_table_schema,
      ccu.table_name as foreign_table_name,
      ccu.column_name as foreign_column_name,
      rc.delete_rule
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
      and tc.table_schema = kcu.table_schema
    join information_schema.referential_constraints rc
      on rc.constraint_name = tc.constraint_name
      and rc.constraint_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = rc.unique_constraint_name
      and ccu.constraint_schema = rc.unique_constraint_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema in ('public', 'auth')
    order by tc.table_schema, tc.table_name, kcu.column_name
  `);

  return {
    columnsByTable,
    dataTypes,
    foreignKeys: fkResult.rows,
  };
}

async function countTable(client, table) {
  try {
    const result = await query(client, `select count(*)::int as count from ${tableRef(table)}`);
    return { count: result.rows[0]?.count || 0 };
  } catch (error) {
    return { count: null, error: error.message };
  }
}

async function countWhere(client, table, whereSql = "", params = []) {
  try {
    const result = await query(client, `select count(*)::int as count from ${tableRef(table)}${whereSql ? ` where ${whereSql}` : ""}`, params);
    return { count: result.rows[0]?.count || 0 };
  } catch (error) {
    return { count: 0, error: error.message };
  }
}

async function sampleWhere(client, metadata, table, whereSql = "", params = []) {
  const key = tableKey(table.schema, table.name);
  const wanted = existingColumns(metadata, key, [
    "id",
    "user_id",
    "email",
    "guest_email",
    "store_name",
    "name",
    "display_name",
    "username",
    "title",
    "source",
    "source_type",
    "status",
    "created_at",
  ]);
  if (!wanted.length) return [];
  try {
    const result = await query(
      client,
      `select ${wanted.map(safeIdentifier).join(", ")} from ${tableRef(table)}${whereSql ? ` where ${whereSql}` : ""} order by ${hasColumn(metadata, key, "created_at") ? "created_at desc nulls last" : "1"} limit 10`,
      params,
    );
    return result.rows;
  } catch (error) {
    return [{ sampleError: error.message }];
  }
}

async function selectRows(client, table, whereSql = "", params = []) {
  const result = await query(client, `select * from ${tableRef(table)}${whereSql ? ` where ${whereSql}` : ""}`, params);
  return result.rows;
}

function textPatternCondition(metadata, key, tableAlias = "") {
  const columns = existingColumns(metadata, key, [
    "source",
    "source_type",
    "suggestion_type",
    "target_table",
    "target_record_id",
    "type",
    "event_type",
    "action",
    "related_entity_type",
    "title",
    "message",
    "notes",
    "description",
  ]);
  const prefix = tableAlias ? `${tableAlias}.` : "";
  const patterns = ["%scout%", "%store_report%", "%store report%", "%restock%", "%forecast%", "%prediction%", "%guess%", "%drop%"];
  const sqlParts = [];
  const params = [];
  for (const column of columns) {
    for (const pattern of patterns) {
      params.push(pattern);
      sqlParts.push(`${prefix}${safeIdentifier(column)}::text ilike $${params.length}`);
    }
  }
  return { sql: sqlParts.length ? `(${sqlParts.join(" or ")})` : "", params };
}

function notificationScoutCondition(metadata, key) {
  if (!hasColumn(metadata, key, "type")) return textPatternCondition(metadata, key);
  return {
    sql: `${safeIdentifier("type")} in ('stock_alert', 'restock_prediction', 'admin_review_needed')`,
    params: [],
  };
}

function buildFakeUserCondition(metadata, key, fakeUserIds, fakeEmails) {
  const idColumns = existingColumns(metadata, key, userIdColumns);
  const mailColumns = existingColumns(metadata, key, emailColumns);
  const clauses = [];
  const params = [];
  if (fakeUserIds.length) {
    for (const column of idColumns) {
      params.push(fakeUserIds);
      clauses.push(`${safeIdentifier(column)} = any($${params.length}::uuid[])`);
    }
  }
  if (fakeEmails.length) {
    for (const column of mailColumns) {
      params.push(fakeEmails.map((email) => email.toLowerCase()));
      clauses.push(`lower(${safeIdentifier(column)}::text) = any($${params.length}::text[])`);
    }
  }
  return { sql: clauses.length ? `(${clauses.join(" or ")})` : "", params };
}

function makeTable(key) {
  return splitKey(key);
}

async function collectRows(client, metadata, key, whereSql, params, reason, category) {
  if (!metadata.columnsByTable.has(key)) {
    return {
      table: key,
      category,
      reason,
      exists: false,
      beforeCount: null,
      wouldDelete: 0,
      skipped: "Table not present in this database.",
      sampleRows: [],
    };
  }
  const table = makeTable(key);
  const before = await countTable(client, table);
  if (!whereSql && whereSql !== "") {
    return {
      table: key,
      category,
      reason,
      exists: true,
      beforeCount: before.count,
      wouldDelete: 0,
      skipped: "No safe condition could be built for this table.",
      sampleRows: [],
    };
  }
  const matched = await countWhere(client, table, whereSql, params);
  const sampleRows = matched.count > 0 ? await sampleWhere(client, metadata, table, whereSql, params) : [];
  return {
    table: key,
    category,
    reason,
    exists: true,
    beforeCount: before.count,
    wouldDelete: matched.count,
    error: matched.error || "",
    sampleRows,
    where: whereSql || "all rows",
    params,
  };
}

async function findFakeUsers(client, metadata) {
  const sources = [];
  for (const key of ["auth.users", "public.profiles", "public.user_profiles"]) {
    if (!metadata.columnsByTable.has(key)) continue;
    const table = makeTable(key);
    const columns = existingColumns(metadata, key, [
      "id",
      "user_id",
      "email",
      "display_name",
      "displayName",
      "full_name",
      "fullName",
      "username",
      "public_username",
      "publicUsername",
      "is_admin",
      "isAdmin",
      "role",
      "user_role",
      "userRole",
      "app_role",
      "appRole",
      "admin_role",
      "adminRole",
      "raw_user_meta_data",
      "raw_app_meta_data",
      "metadata",
      "app_metadata",
      "source",
      "source_type",
      "created_at",
    ]);
    if (!columns.length) continue;
    try {
      const result = await query(client, `select ${columns.map(safeIdentifier).join(", ")} from ${tableRef(table)} limit 10000`);
      sources.push({ key, rows: result.rows });
    } catch (error) {
      sources.push({ key, rows: [], error: error.message });
    }
  }

  const byIdentity = new Map();
  const sourceErrors = [];
  for (const source of sources) {
    if (source.error) {
      sourceErrors.push({ source: source.key, error: source.error });
      continue;
    }
    for (const row of source.rows) {
      const reasons = fakeIdentityEvidence(row, source.key);
      if (!reasons.length) continue;
      const id = valueText(row.id || row.user_id || row.userId);
      const email = lowerText(row.email);
      const identityKey = id || email;
      if (!identityKey) continue;
      if (!byIdentity.has(identityKey)) {
        byIdentity.set(identityKey, {
          id,
          email,
          displayName: valueText(row.display_name || row.displayName || row.full_name || row.fullName || row.username || row.public_username || row.publicUsername),
          reasons: [],
          sources: [],
          relatedRowsByTable: {},
        });
      }
      const entry = byIdentity.get(identityKey);
      if (!entry.id && id) entry.id = id;
      if (!entry.email && email) entry.email = email;
      if (!entry.displayName) entry.displayName = valueText(row.display_name || row.displayName || row.full_name || row.fullName || row.username || row.public_username || row.publicUsername);
      entry.reasons.push(...reasons);
      entry.sources.push(source.key);
    }
  }

  return {
    users: [...byIdentity.values()].map((entry) => ({
      ...entry,
      reasons: [...new Set(entry.reasons)],
      sources: [...new Set(entry.sources)],
    })),
    sourceErrors,
  };
}

async function addRelatedRowCounts(client, metadata, fakeUsers) {
  const fakeUserIds = fakeUsers.map((user) => user.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const fakeEmails = fakeUsers.map((user) => user.email).filter(Boolean);
  if (!fakeUserIds.length && !fakeEmails.length) return;

  for (const [key] of metadata.columnsByTable) {
    if (fakeUserDataProtectedTables.has(key)) continue;
    const condition = buildFakeUserCondition(metadata, key, fakeUserIds, fakeEmails);
    if (!condition.sql) continue;
    const count = await countWhere(client, makeTable(key), condition.sql, condition.params);
    if (!count.count) continue;
    for (const user of fakeUsers) {
      user.relatedRowsByTable[key] = count.count;
    }
  }
}

async function buildCleanupPlan(client, metadata, fakeUsers) {
  const groups = [];

  for (const config of scoutAllRowTables) {
    groups.push(await collectRows(client, metadata, config.key, "", [], config.reason, "scout_report_intelligence"));
  }

  for (const config of conditionalScoutTables) {
    const key = config.key;
    if (!metadata.columnsByTable.has(key)) {
      groups.push(await collectRows(client, metadata, key, null, [], config.reason, "scout_report_intelligence"));
      continue;
    }
    const condition = key === "public.notifications"
      ? notificationScoutCondition(metadata, key)
      : textPatternCondition(metadata, key);
    groups.push(await collectRows(client, metadata, key, condition.sql || null, condition.params, config.reason, "scout_report_intelligence"));
  }

  const fakeUserIds = fakeUsers.map((user) => user.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const fakeEmails = fakeUsers.map((user) => user.email).filter(Boolean);
  for (const [key] of metadata.columnsByTable) {
    if (fakeUserDataProtectedTables.has(key)) continue;
    const condition = buildFakeUserCondition(metadata, key, fakeUserIds, fakeEmails);
    if (!condition.sql) continue;
    const group = await collectRows(client, metadata, key, condition.sql, condition.params, "Rows clearly tied to fake/demo/test users by user id or email.", "fake_user_created_data");
    if (group.wouldDelete > 0) groups.push(group);
  }

  for (const key of ["public.profiles", "public.user_profiles"]) {
    const condition = buildFakeUserCondition(metadata, key, fakeUserIds, fakeEmails);
    if (condition.sql) {
      const group = await collectRows(client, metadata, key, condition.sql, condition.params, "Fake/demo/test profile rows. Real/admin/Zena/Dillon profiles are excluded by classification.", "fake_user_profiles");
      if (group.wouldDelete > 0) groups.push(group);
    }
  }

  if (metadata.columnsByTable.has("auth.users") && fakeUserIds.length) {
    groups.push(await collectRows(
      client,
      metadata,
      "auth.users",
      `${safeIdentifier("id")} = any($1::uuid[])`,
      [fakeUserIds],
      "Fake/demo/test auth users. Hard delete is last and only with the exact confirm flag.",
      "fake_auth_users",
    ));
  }

  return groups;
}

async function baselineCounts(client, metadata) {
  const groups = {
    stores: ["public.stores", "public.store_aliases", "public.store_regions"],
    realUsersProfiles: ["auth.users", "public.profiles", "public.user_profiles"],
    inventoryVault: ["public.inventory_items", "public.vault_items", "public.user_inventory"],
    forgeReceiptsMileageSales: ["public.business_expenses", "public.receipt_records", "public.receipt_line_items", "public.marketplace_listings"],
    marketCatalog: ["public.catalog_products", "public.pokemon_products", "public.product_catalog", "public.master_catalog_items", "public.product_market_price_current", "public.product_market_price_history"],
  };
  const output = {};
  for (const [groupName, keys] of Object.entries(groups)) {
    output[groupName] = {};
    for (const key of keys) {
      if (!metadata.columnsByTable.has(key)) continue;
      output[groupName][key] = await countTable(client, makeTable(key));
    }
  }
  return output;
}

function buildTablesFound(metadata) {
  const rows = [];
  for (const [key, columns] of metadata.columnsByTable) {
    if (!keywordMatchesTable(key, [...columns])) continue;
    rows.push({
      table: key,
      appearsToStore: descriptionForTable(key),
      columns: [...columns],
    });
  }
  return rows;
}

function buildRelationships(metadata) {
  return metadata.foreignKeys
    .filter((row) => {
      const left = tableKey(row.table_schema, row.table_name);
      const right = tableKey(row.foreign_table_schema, row.foreign_table_name);
      return keywordMatchesTable(left, [row.column_name]) || keywordMatchesTable(right, [row.foreign_column_name]);
    })
    .map((row) => ({
      table: tableKey(row.table_schema, row.table_name),
      column: row.column_name,
      references: `${row.foreign_table_schema}.${row.foreign_table_name}.${row.foreign_column_name}`,
      onDelete: row.delete_rule,
    }));
}

function buildNotTouched(metadata, baseline) {
  return [...intentionallyProtectedTables]
    .filter((key) => metadata.columnsByTable.has(key))
    .map((key) => ({
      table: key,
      reason: key.includes("store") && !key.includes("store_reports")
        ? "Store directory/profile/alias data is explicitly protected."
        : key.includes("catalog") || key.includes("product") || key.includes("price") || key.includes("market")
          ? "Market catalog/pricing data is explicitly protected."
          : key.includes("role")
            ? "Role/admin records are explicitly protected."
            : "App settings/workspace/shared configuration is outside this cleanup scope.",
      beforeCount: Object.values(baseline).find((group) => group[key])?.[key]?.count ?? null,
    }));
}

function readLocalSchemaSql() {
  const files = [
    path.join(ROOT, "supabase", "schema.sql"),
    ...(fs.existsSync(path.join(ROOT, "supabase", "migrations"))
      ? fs.readdirSync(path.join(ROOT, "supabase", "migrations"))
        .filter((fileName) => fileName.endsWith(".sql"))
        .map((fileName) => path.join(ROOT, "supabase", "migrations", fileName))
      : []),
  ];
  return files
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n\n");
}

function buildSchemaOnlyReport(error) {
  const sql = readLocalSchemaSql();
  const tableMatches = [...sql.matchAll(/create table if not exists\s+(?:public\.)?([a-zA-Z0-9_]+)/gi)];
  const uniqueKeys = [...new Set(tableMatches.map((match) => `public.${match[1]}`))].sort();
  const tablesFound = uniqueKeys
    .filter((key) => keywordMatchesTable(key, []))
    .map((key) => ({
      table: key,
      appearsToStore: descriptionForTable(key),
      columns: [],
      schemaOnly: true,
    }));
  const relationshipMatches = [...sql.matchAll(/([a-zA-Z0-9_]+)\s+[^,\n]*references\s+(auth|public)\.([a-zA-Z0-9_]+)\(([^)]+)\)\s*(on delete\s+[a-z ]+)?/gi)];
  const relationships = relationshipMatches.slice(0, 200).map((match) => ({
    column: match[1],
    references: `${match[2]}.${match[3]}.${match[4]}`,
    onDelete: match[5] ? match[5].replace(/^on delete\s+/i, "").trim().toUpperCase() : "UNKNOWN",
    schemaOnly: true,
  }));
  const plannedTables = [...new Set([
    ...scoutAllRowTables.map((entry) => entry.key),
    ...conditionalScoutTables.map((entry) => entry.key),
  ])];
  return {
    ok: false,
    mode: "dry-run",
    liveDatabaseDryRun: false,
    hardDeleteWasRun: false,
    error: error.message,
    loadedEnvFiles: envLoadReport.loadedEnvFiles,
    connectionSource,
    connectionInfo: (() => {
      try {
        return buildConnectionConfig().info;
      } catch {
        return null;
      }
    })(),
    envDiagnostics: buildEnvDiagnostics(),
    connectionAttempts: lastConnectionAttempts,
    safety: {
      defaultBehavior: "dry-run",
      hardDeleteFlagRequired: CONFIRM_FLAG,
      schemaChanges: "none",
      note: "No delete statements ran. Live row counts are unavailable until the direct DB URL is fixed.",
    },
    tablesFound,
    relationships,
    fakeDemoTestUsers: [],
    baselineCounts: {},
    wouldDeleteByTable: plannedTables.map((key) => ({
      table: key,
      wouldDelete: null,
      beforeCount: null,
      skipped: "Live count unavailable because database connection failed.",
    })),
    intentionallyNotTouched: [...intentionallyProtectedTables].map((key) => ({
      table: key,
      beforeCount: null,
      reason: "Protected by cleanup policy. Live count unavailable because database connection failed.",
    })),
    backup: {
      plannedBackupRoot: BACKUP_ROOT,
      willExportBeforeHardDelete: true,
      dryRunNote: "No backup files are written during dry-run.",
    },
    nextStep: "Fix SUPABASE_DB_URL/DATABASE_URL or provide a valid direct admin DB connection, then rerun the dry-run. Do not run the confirm flag until live counts are reviewed.",
  };
}

async function exportBackupRows(client, metadata, groups) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(BACKUP_ROOT, timestamp);
  fs.mkdirSync(backupDir, { recursive: true });
  const exports = [];
  for (const group of groups) {
    if (!group.exists || !group.wouldDelete || group.error) continue;
    const table = makeTable(group.table);
    const rows = await selectRows(client, table, group.where === "all rows" ? "" : group.where, group.where === "all rows" ? [] : group.params || []);
    const fileName = `${group.table.replace(/\./g, "__")}.json`;
    const filePath = path.join(backupDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
    exports.push({ table: group.table, rows: rows.length, filePath });
  }
  return { backupDir, exports };
}

async function deleteGroups(client, groups) {
  const results = [];
  for (const group of groups.filter((entry) => entry.exists && entry.wouldDelete > 0 && !entry.error)) {
    const table = makeTable(group.table);
    const whereSql = group.where === "all rows" ? "" : group.where;
    const params = group.where === "all rows" ? [] : group.params || [];
    const sql = `delete from ${tableRef(table)}${whereSql ? ` where ${whereSql}` : ""}`;
    const result = await query(client, sql, params);
    results.push({ table: group.table, deleted: result.rowCount });
  }
  return results;
}

async function main() {
  if (args.includes("--apply") || args.includes("--delete") || args.includes("--force")) {
    throw new Error(`Unsafe flag rejected. Hard delete requires exactly ${CONFIRM_FLAG}.`);
  }
  const { client, connection, attempts } = await connectWithFallback();

  try {
    const metadata = await getMetadata(client);
    const fakeUserScan = await findFakeUsers(client, metadata);
    await addRelatedRowCounts(client, metadata, fakeUserScan.users);
    const baseline = await baselineCounts(client, metadata);
    const cleanupGroups = await buildCleanupPlan(client, metadata, fakeUserScan.users);
    const decoratedGroups = cleanupGroups.map((group) => ({ ...group, params: undefined }));
    const tablesFound = buildTablesFound(metadata);
    const relationships = buildRelationships(metadata);
    const notTouched = buildNotTouched(metadata, baseline);

    let backup = {
      plannedBackupRoot: BACKUP_ROOT,
      willExportBeforeHardDelete: true,
      dryRunNote: "No backup files are written during dry-run. Hard delete would export matched rows first.",
    };
    let deleteResults = [];
    if (hardDelete) {
      backup = await exportBackupRows(client, metadata, cleanupGroups);
      deleteResults = await deleteGroups(client, cleanupGroups);
    }

    const output = {
      ok: true,
      mode: dryRun ? "dry-run" : "hard-delete",
      liveDatabaseDryRun: dryRun,
      hardDeleteWasRun: hardDelete,
      loadedEnvFiles: envLoadReport.loadedEnvFiles,
      connectionSource,
      connectionInfo: connection.info,
      envDiagnostics: buildEnvDiagnostics(),
      connectionAttempts: attempts,
      safety: {
        defaultBehavior: "dry-run",
        hardDeleteFlagRequired: CONFIRM_FLAG,
        hardDeleteWasRun: hardDelete,
        realUsersProtected: "Zena, Dillon, admin/moderator/owner/founder/official identities are excluded from fake-user classification.",
        schemaChanges: "none",
      },
      tablesFound,
      relationships,
      fakeDemoTestUsers: fakeUserScan.users,
      fakeUserScanErrors: fakeUserScan.sourceErrors,
      baselineCounts: baseline,
      wouldDeleteByTable: decoratedGroups,
      intentionallyNotTouched: notTouched,
      backup,
      deleteResults,
      nextStep: dryRun
        ? `Review this output. Do not run hard delete unless every matched table/user is approved. Hard delete requires npm run admin:clean-demo-scout-data -- ${CONFIRM_FLAG}`
        : "Hard delete completed after backup export.",
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  if (dryRun) {
    console.log(JSON.stringify(buildSchemaOnlyReport(error), null, 2));
    process.exit(0);
  }
  console.error(JSON.stringify({
    ok: false,
    mode: dryRun ? "dry-run" : "hard-delete",
    hardDeleteWasRun: false,
    error: error.message,
  }, null, 2));
  process.exit(1);
});
