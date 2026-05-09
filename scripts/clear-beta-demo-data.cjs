#!/usr/bin/env node

require("dotenv").config();

const { createClient } = require("@supabase/supabase-js");

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = args.has("--dry-run") || !apply;
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MARKERS = ["demo", "mock", "fake", "dummy", "sample"];
const TEXT_MARKERS = ["%demo%", "%mock%", "%fake%", "%dummy%", "%sample%", "%test product%", "%placeholder product%"];
const DEMO_USER_IDS = String(process.env.DEMO_USER_IDS || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const TABLES = [
  { table: "product_catalog", columns: ["market_source", "source", "source_type"] },
  { table: "pokemon_products", columns: ["source"] },
  { table: "product_market_price_current", columns: ["source"] },
  { table: "product_market_price_history", columns: ["source"] },
  { table: "pokemon_retail_stores", columns: ["source"] },
  { table: "user_suggestions", columns: ["source"] },
  { table: "store_suggestions", columns: ["source"] },
  { table: "catalog_suggestions", columns: ["source"] },
  { table: "sku_suggestions", columns: ["source"] },
  { table: "retailer_product_suggestions", columns: ["source"] },
  { table: "scout_report_reviews", columns: ["source"] },
  { table: "store_intelligence_suggestions", columns: ["source"] },
  { table: "admin_review_log", columns: ["action", "suggestion_table"] },
  { table: "marketplace_listings", columns: ["source_type"] },
  { table: "listing_photos", columns: ["source"] },
  { table: "listing_reports", columns: ["status"] },
  { table: "listing_messages", columns: ["status"] },
  { table: "seller_reviews", columns: ["status"] },
];

if (!url || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Refusing to run cleanup.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function chunk(items, size = 100) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

async function idsForFilter(table, column, operator, value) {
  let query = supabase.from(table).select("id", { count: "exact" }).limit(10000);
  if (operator === "eq") query = query.eq(column, value);
  if (operator === "ilike") query = query.ilike(column, value);
  if (operator === "is") query = query.is(column, value);
  const { data, error, count } = await query;
  if (error) {
    return { ids: [], count: 0, skipped: `${column}: ${error.message}` };
  }
  return { ids: (data || []).map((row) => row.id).filter(Boolean), count: count || 0, skipped: "" };
}

async function collectDemoIds(config) {
  const ids = new Set();
  const skipped = [];
  const filters = [];

  for (const column of config.columns) {
    for (const marker of MARKERS) filters.push({ column, operator: "eq", value: marker });
    for (const marker of TEXT_MARKERS) filters.push({ column, operator: "ilike", value: marker });
  }

  for (const column of ["is_demo", "isDemo"]) {
    filters.push({ column, operator: "is", value: true });
  }

  for (const column of ["created_by", "createdBy", "user_id", "userId"]) {
    for (const userId of DEMO_USER_IDS) filters.push({ column, operator: "eq", value: userId });
  }

  for (const filter of filters) {
    const result = await idsForFilter(config.table, filter.column, filter.operator, filter.value);
    if (result.skipped) skipped.push(result.skipped);
    for (const id of result.ids) ids.add(id);
  }

  return { ids: [...ids], skipped: [...new Set(skipped)] };
}

async function deleteIds(table, ids) {
  let deleted = 0;
  for (const batch of chunk(ids, 100)) {
    const { data, error } = await supabase.from(table).delete().in("id", batch).select("id");
    if (error) throw new Error(`${table}: ${error.message}`);
    deleted += (data || []).length;
  }
  return deleted;
}

async function main() {
  const summary = [];
  const skippedNotes = [];

  for (const config of TABLES) {
    const { ids, skipped } = await collectDemoIds(config);
    if (skipped.length) skippedNotes.push({ table: config.table, skipped });

    let deleted = 0;
    if (apply && ids.length) deleted = await deleteIds(config.table, ids);

    summary.push({
      table: config.table,
      matchedDemoRecords: ids.length,
      deleted,
      mode: dryRun ? "dry-run" : "apply",
    });
  }

  console.log(JSON.stringify({
    ok: true,
    mode: dryRun ? "dry-run" : "apply",
    safety: "Only rows with explicit demo/mock/fake/dummy/sample markers, is_demo=true, or configured DEMO_USER_IDS are targeted. Unmarked rows are preserved.",
    summary,
    skippedNotes,
    applyHint: dryRun ? "Review the summary, then run npm run beta:clear-demo-data -- --apply if the matched records are safe." : "",
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});
