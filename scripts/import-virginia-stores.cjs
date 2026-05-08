const fs = require("node:fs/promises");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const rootDir = path.resolve(__dirname, "..");
const seedDir = path.join(rootDir, "seeds", "stores");
const dryRun = process.argv.includes("--dry-run");

const requiredFields = ["chain", "name", "address", "city"];

function env(name) {
  return process.env[name] || "";
}

function normalizeStore(store, defaults, fileName) {
  const normalized = {
    chain: store.chain || "",
    name: store.name || "",
    nickname: store.nickname || null,
    address: store.address || "",
    city: store.city || "",
    state: store.state || defaults.state || "VA",
    zip: store.zip || null,
    region: store.region || defaults.region || null,
    county: store.county || null,
    phone: store.phone || null,
    website: store.website || null,
    sells_pokemon: store.sells_pokemon !== false,
    store_type: store.store_type || store.storeType || null,
    notes: store.notes || null,
    latitude: store.latitude ?? null,
    longitude: store.longitude ?? null,
  };

  const missing = requiredFields.filter((field) => !String(normalized[field] || "").trim());
  if (missing.length > 0) {
    throw new Error(`${fileName}: ${normalized.name || "Unnamed store"} is missing ${missing.join(", ")}`);
  }

  return normalized;
}

async function readSeedFiles() {
  const fileNames = (await fs.readdir(seedDir))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();

  const rows = [];

  for (const fileName of fileNames) {
    const fullPath = path.join(seedDir, fileName);
    const parsed = JSON.parse(await fs.readFile(fullPath, "utf8"));
    const stores = Array.isArray(parsed) ? parsed : parsed.stores || [];
    const defaults = Array.isArray(parsed) ? {} : parsed;

    for (const store of stores) {
      rows.push(normalizeStore(store, defaults, fileName));
    }

    console.log(`${fileName}: ${stores.length} store rows`);
  }

  return rows;
}

async function upsertStore(supabase, store) {
  const { data: existing, error: lookupError } = await supabase
    .from("stores")
    .select("id")
    .eq("chain", store.chain)
    .eq("address", store.address)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { error } = await supabase
      .from("stores")
      .update({ ...store, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) throw error;
    return "updated";
  }

  const { error } = await supabase.from("stores").insert(store);
  if (error) throw error;
  return "inserted";
}

async function main() {
  const stores = await readSeedFiles();

  if (dryRun) {
    console.log(`Dry run complete. ${stores.length} total Virginia store rows validated.`);
    return;
  }

  const supabaseUrl = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to import shared store seeds.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const counts = { inserted: 0, updated: 0 };

  for (const store of stores) {
    const result = await upsertStore(supabase, store);
    counts[result] += 1;
  }

  console.log(`Imported Virginia stores: ${counts.inserted} inserted, ${counts.updated} updated.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
