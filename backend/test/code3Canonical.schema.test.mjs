import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { CANONICAL_DOMAINS } = require("../dist/code3/types.js");
const migrationPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../supabase/migrations/20260820120000_code3_canonical_owner_records.sql");
const sql = readFileSync(migrationPath, "utf8");

test("canonical schema declares every Phase 1B domain and UUID stable IDs", () => {
  for (const domain of CANONICAL_DOMAINS) assert.match(sql, new RegExp(`'${domain}'`), domain);
  assert.match(sql, /id uuid not null default gen_random_uuid\(\)/i);
  assert.match(sql, /primary key \(owner_subject, id\)/i);
  assert.match(sql, /external_provider text/i);
  assert.match(sql, /external_id text/i);
  assert.match(sql, /record_version bigint not null default 1/i);
});

test("canonical money uses integer minor units with explicit ISO currency", () => {
  assert.match(sql, /amount_minor bigint/i);
  assert.match(sql, /currency varchar\(3\)/i);
  assert.match(sql, /currency ~ '\^\[A-Z\]\{3\}\$'/i);
  assert.match(sql, /code3_records_money_safe_integer/i);
  assert.match(sql, /-9007199254740991 and 9007199254740991/i);
  assert.doesNotMatch(sql, /amount_minor\s+(?:real|double precision|numeric\s*\()/i);
});

test("canonical metadata has a deterministic encoded-size constraint", () => {
  assert.match(sql, /octet_length\(metadata::text\)\s*<=\s*262144/i);
});

test("canonical percentage fields use bounded integer basis points", () => {
  assert.match(sql, /rate_basis_points integer/i);
  assert.match(sql, /rate_basis_points between 0 and 100000/i);
});

test("row ownership uses composite owner-safe relationships and RLS policies", () => {
  assert.match(sql, /owner_subject text not null/i);
  assert.match(sql, /'supabase:' \|\| \(select auth\.uid\(\)\)::text/i);
  assert.match(sql, /foreign key \(owner_subject, from_record_id\)/i);
  assert.match(sql, /foreign key \(owner_subject, to_record_id\)/i);
  for (const table of ["code3_records", "code3_record_links", "code3_file_assets", "code3_audit_events"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`owner_subject = public\\.code3_current_owner_subject\\(\\)`, "i"));
    assert.match(sql, new RegExp(`revoke all on public\\.${table} from anon, authenticated`, "i"));
  }
});

test("schema includes indexed owner lookup paths, typed file references, and append-only audit summaries", () => {
  for (const fragment of [
    "code3_records_owner_type_created_idx",
    "code3_records_owner_status_idx",
    "code3_records_owner_source_idx",
    "code3_records_owner_provider_idx",
    "code3_record_links_owner_parent_purchase_idx",
    "code3_record_links_owner_owned_item_idx",
    "code3_record_links_owner_sale_idx",
    "code3_record_links_owner_store_idx",
    "code3_record_links_owner_auction_idx",
  ]) assert.match(sql, new RegExp(fragment, "i"));
  assert.match(sql, /create table if not exists public\.code3_file_assets/i);
  assert.match(sql, /sha256 varchar\(64\)/i);
  assert.match(sql, /original_name text/i);
  assert.match(sql, /primary key \(owner_subject, asset_record_id\)/i);
  assert.match(sql, /code3_file_assets_related_pair/i);
  assert.match(sql, /create table if not exists public\.code3_audit_events/i);
  assert.doesNotMatch(sql, /create policy[^;]+code3_audit_events[^;]+for update/is);
});

test("migration is additive and contains no owner-data copy or destructive table operation", () => {
  assert.doesNotMatch(sql, /\b(?:drop table|truncate table)\b/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.code3_records\s+select/i);
  assert.doesNotMatch(sql, /update\s+public\.(?:user_inventory|inventory_items|sales_records|business_expenses)/i);
  assert.match(sql, /Phase 1B does not execute it/i);
});
