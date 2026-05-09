import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const migrationPath = path.join(rootDir, 'supabase', 'migrations', '20260509170000_normalized_pokemon_catalog_model.sql');

const requiredMigrationTokens = [
  'create table if not exists public.tcg_expansions',
  'create table if not exists public.product_identifiers',
  'create table if not exists public.catalog_product_variants',
  'create table if not exists public.tcg_card_details',
  'create table if not exists public.product_msrp_rules',
  'add column if not exists catalog_variant_id',
  'pokemon_center_elite_trainer_box',
  'productId + subTypeName',
];

async function verifyMigrationFile() {
  const sql = await fs.readFile(migrationPath, 'utf8');
  const missing = requiredMigrationTokens.filter((token) => !sql.includes(token));
  if (missing.length) {
    throw new Error(`Normalized catalog migration is missing expected token(s): ${missing.join(', ')}`);
  }
  console.log('Migration file check passed.');
}

async function optionalSupabaseChecks() {
  if (String(process.env.VERIFY_LIVE_CATALOG || '').toLowerCase() !== 'true') {
    console.log('Live Supabase checks skipped. Set VERIFY_LIVE_CATALOG=true after running migrations/imports.');
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.log('Supabase env not present; skipped live database checks.');
    return;
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: report, error: reportError } = await supabase
    .from('pokemon_catalog_normalization_report')
    .select('*')
    .maybeSingle();
  if (reportError) throw reportError;

  const checks = [
    ['Normalized expansions', 'tcg_expansions', (query) => query.select('id', { count: 'exact', head: true })],
    ['Regular ETBs', 'product_catalog', (query) => query.select('id', { count: 'exact', head: true }).eq('sealed_product_type', 'elite_trainer_box')],
    ['Pokemon Center ETBs', 'product_catalog', (query) => query.select('id', { count: 'exact', head: true }).eq('sealed_product_type', 'pokemon_center_elite_trainer_box').eq('is_pokemon_center_exclusive', true)],
    ['Reverse Holofoil variants', 'catalog_product_variants', (query) => query.select('id', { count: 'exact', head: true }).ilike('variant_name', '%Reverse Holofoil%')],
    ['Card anatomy rows', 'tcg_card_details', (query) => query.select('catalog_product_id', { count: 'exact', head: true })],
  ];

  console.log('Normalization report:', JSON.stringify(report || {}, null, 2));
  for (const [label, table, buildQuery] of checks) {
    const { count, error } = await buildQuery(supabase.from(table));
    if (error) throw error;
    console.log(`${label}: ${count ?? 0}`);
  }
}

async function main() {
  await verifyMigrationFile();
  await optionalSupabaseChecks();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
