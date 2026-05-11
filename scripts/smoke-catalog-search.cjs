const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
for (const fileName of [".env.local", ".env"]) {
  const envPath = path.join(root, fileName);
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, override: fileName === ".env.local" });
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const RESULT_FIELDS = [
  "id",
  "master_catalog_item_id",
  "name",
  "set_name",
  "set_code",
  "product_type",
  "catalog_type",
  "image_url",
  "msrp_price",
  "market_price",
  "barcode",
  "tcgplayer_product_id",
  "external_product_id",
].join(",");

const terms = ["etb", "prismatic", "pikachu", "booster bundle"];

function safeTerm(value) {
  return String(value || "").replace(/[%,()]/g, " ").replace(/\s+/g, " ").trim();
}

async function timed(label, fn) {
  const started = performance.now();
  const result = await fn();
  return { label, elapsedMs: Math.round(performance.now() - started), ...result };
}

async function searchTerm(supabase, term) {
  const safe = safeTerm(term);
  const { data, error } = await supabase
    .from("catalog_search_lightweight")
    .select(RESULT_FIELDS)
    .or(["name", "set_name", "product_type", "set_code"].map((field) => `${field}.ilike.%${safe}%`).join(","))
    .limit(30);
  if (error) throw error;
  return { rows: data?.length || 0 };
}

async function searchKnownBarcode(supabase) {
  const { data: barcodeRows, error: barcodeError } = await supabase
    .from("catalog_search_lightweight")
    .select("barcode")
    .not("barcode", "is", null)
    .neq("barcode", "")
    .limit(1);
  if (barcodeError) throw barcodeError;
  const barcode = barcodeRows?.[0]?.barcode || "";
  if (!barcode) return { rows: 0, skipped: true };
  const { data, error } = await supabase
    .from("catalog_search_lightweight")
    .select(RESULT_FIELDS)
    .eq("barcode", barcode)
    .limit(5);
  if (error) throw error;
  return { rows: data?.length || 0, skipped: false };
}

async function main() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL/anon key is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results = [];
  for (const term of terms) {
    results.push(await timed(term, () => searchTerm(supabase, term)));
  }
  results.push(await timed("known barcode exact", () => searchKnownBarcode(supabase)));

  const failures = results.filter((result) => !result.skipped && result.rows <= 0);
  console.log(JSON.stringify({ ok: failures.length === 0, source: "catalog_search_lightweight", selectStar: false, results }, null, 2));
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
