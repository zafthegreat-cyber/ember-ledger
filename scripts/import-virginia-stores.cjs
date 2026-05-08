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
    chain: store.chain || store.retailer || "",
    name: store.name || store.storeName || "",
    nickname: store.nickname || null,
    address: store.address || "",
    city: store.city || "",
    state: store.state || defaults.state || "VA",
    zip: store.zip || null,
    region: store.region || defaults.region || null,
    county: store.county || null,
    phone: store.phone || null,
    website: store.website || null,
    sells_pokemon: store.sells_pokemon !== false && store.carriesPokemon !== "false" && store.carriesPokemonLikely !== "false",
    store_type: store.store_type || store.storeType || store.storeGroup || null,
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

function parseCsv(text = "") {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => String(value).trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => String(value).trim())) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, String(cells[index] || "").trim()]))
  );
}

async function readSeedFiles() {
  const fileNames = (await fs.readdir(seedDir))
    .filter((fileName) => fileName.endsWith(".json") || fileName.endsWith(".csv"))
    .sort();

  const rows = [];

  for (const fileName of fileNames) {
    const fullPath = path.join(seedDir, fileName);
    const raw = await fs.readFile(fullPath, "utf8");
    const parsed = fileName.endsWith(".json") ? JSON.parse(raw) : parseCsv(raw);
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
