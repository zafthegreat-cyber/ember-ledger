import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), "..");
const generatedDir = path.join(rootDir, "src", "data", "generated");
const SYNC_TIMESTAMP = "2026-05-20T00:00:00.000Z";

const OFFICIAL_RELEASE_SOURCES = [
  {
    url: "https://www.pokemon.com/us/pokemon-tcg/product-gallery/mega-evolution-chaos-rising-booster-bundle",
    fallbackTitle: "Pokemon TCG: Mega Evolution-Chaos Rising Booster Bundle",
    fallbackDate: "2026-05-22",
    productType: "Booster Bundle",
  },
  {
    url: "https://www.pokemon.com/uk/pokemon-tcg/product-gallery/mega-zygarde-ex-premium-collection",
    fallbackTitle: "Pokemon TCG: Mega Zygarde ex Premium Collection",
    fallbackDate: "2026-05-22",
    productType: "Premium Collection",
  },
  {
    url: "https://www.pokemon.com/uk/pokemon-tcg/product-gallery/mega-moonlit-tin",
    fallbackTitle: "Pokemon TCG: Mega Moonlit Tin",
    fallbackDate: "2026-06-05",
    productType: "Tin",
  },
  {
    url: "https://www.pokemon.com/uk/pokemon-news/the-pokemon-tcg-mega-evolution-pitch-black-expansion-arrives-july-17-2026",
    fallbackTitle: "Pokemon TCG: Mega Evolution-Pitch Black",
    fallbackDate: "2026-07-17",
    productType: "Expansion",
    eventType: "Set Release",
  },
];

function slug(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/pok[e\u00e9]mon/g, "pokemon")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/pok[e\u00e9]mon/g, "pokemon")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value = "") {
  const text = String(value || "");
  const monthNames = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[0];
  const named = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d{2})\b/i);
  if (named) return `${named[3]}-${monthNames[named[1].toLowerCase()]}-${String(named[2]).padStart(2, "0")}`;
  return "";
}

function inferProductType(title = "", fallback = "") {
  const text = normalizeText(`${title} ${fallback}`);
  if (text.includes("booster bundle")) return "Booster Bundle";
  if (text.includes("booster display") || text.includes("booster box")) return "Booster Box";
  if (text.includes("elite trainer box") || text.includes(" etb")) return "Elite Trainer Box";
  if (text.includes("premium collection")) return "Premium Collection";
  if (text.includes("collection")) return "Collection Box";
  if (text.includes("tin")) return "Tin";
  if (text.includes("blister")) return "Blister";
  if (text.includes("expansion")) return "Expansion";
  return fallback || "";
}

async function readJson(fileName, fallback = []) {
  try {
    return JSON.parse(await fs.readFile(path.join(generatedDir, fileName), "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(fileName, value) {
  await fs.mkdir(generatedDir, { recursive: true });
  await fs.writeFile(path.join(generatedDir, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function matchCatalogProduct(release, catalogProducts) {
  const releaseText = normalizeText(release.title);
  return catalogProducts.find((product) => {
    const productText = normalizeText(`${product.productName || product.name || ""} ${product.setName || product.expansion || product.productLine || ""}`);
    return productText && (productText === releaseText || productText.includes(releaseText) || releaseText.includes(productText));
  }) || null;
}

async function fetchOfficialRelease(source) {
  try {
    const response = await fetch(source.url, {
      headers: {
        "user-agent": "EmberAndTideCalendarSync/1.0 (+https://emberandtide.app)",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    if (/Pardon Our Interruption|Incapsula|Request unsuccessful/i.test(html)) {
      throw new Error("Pokemon.com bot protection response");
    }
    const $ = cheerio.load(html);
    const title = $("h1").first().text().trim() || $("meta[property='og:title']").attr("content") || source.fallbackTitle;
    const bodyText = $("body").text().replace(/\s+/g, " ");
    const date = parseDate(bodyText.match(/(?:Launch|Available|available|sale|release)[^A-Za-z0-9]{0,10}(?:on\s+)?[A-Z][a-z]+\s+\d{1,2},\s+20\d{2}/)?.[0] || bodyText) || source.fallbackDate;
    const imageUrl = $("meta[property='og:image']").attr("content") || "";
    return { ...source, title, releaseDate: date, imageUrl, fetched: true };
  } catch (error) {
    return { ...source, title: source.fallbackTitle, releaseDate: source.fallbackDate, imageUrl: "", fetched: false, warning: error.message };
  }
}

export async function syncReleaseCalendar() {
  const catalogProducts = await readJson("sealedProducts.json", []);
  const fetched = [];
  for (const source of OFFICIAL_RELEASE_SOURCES) {
    fetched.push(await fetchOfficialRelease(source));
  }
  const rows = fetched
    .filter((row) => row.releaseDate)
    .map((row) => {
      const matched = matchCatalogProduct(row, catalogProducts);
      const title = (row.fallbackTitle || row.title).replace(/\s+\|\s+Pokemon\.com$/i, "");
      return {
        id: `pokemon-official-${slug(title)}-${row.releaseDate}`,
        title,
        productName: title.replace(/^Pokemon TCG:\s*/i, ""),
        releaseDate: row.releaseDate,
        eventType: row.eventType || (inferProductType(title, row.productType) === "Expansion" ? "Set Release" : "Product Release"),
        source: "Pokemon.com",
        sourceLabel: "Official Pokemon product/news page",
        sourceUrl: row.url,
        confidence: "confirmed",
        productType: inferProductType(title, row.productType),
        category: inferProductType(title, row.productType) === "Expansion" ? "Singles/set" : "Sealed product",
        productImage: row.imageUrl || matched?.imageUrl || matched?.photoUrl || "",
        catalogProductId: matched?.id || "",
        sourceUpdatedAt: SYNC_TIMESTAMP,
        notes: row.fetched
          ? "Official Pokemon.com release page parsed by sync:release-calendar."
          : "Official Pokemon.com source configured, but live fetch was unavailable; existing official fallback date retained.",
        visibility: "public",
      };
    })
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.title.localeCompare(b.title));
  await writeJson("releaseCalendar.json", rows);
  return { releaseEvents: rows.length, fetched: fetched.filter((row) => row.fetched).length, warnings: fetched.filter((row) => !row.fetched).length };
}

export async function syncDropCalendar() {
  const existing = await readJson("dropCalendarSeed.json", []);
  const rows = existing.length ? existing : [{
    id: "drop-calendar-seed-needs-training",
    dateKey: "",
    storeName: "Drop Radar",
    retailer: "Scout",
    eventType: "Predicted Drop Window",
    confidence: "unavailable",
    patternStrength: "weak",
    trainingCount: 0,
    source: "Generated placeholder",
    sourceLabel: "Drop Radar training data",
    sourceUpdatedAt: SYNC_TIMESTAMP,
    visibility: "admin_only",
    notes: "Runtime Drop Radar events are generated from Scout reports and manual training restocks.",
  }];
  await writeJson("dropCalendarSeed.json", rows.map((row) => ({ sourceUpdatedAt: SYNC_TIMESTAMP, ...row })));
  return { dropSeedEvents: rows.length };
}

async function main() {
  const mode = process.argv[2] || "all";
  const release = mode === "drop" ? { releaseEvents: (await readJson("releaseCalendar.json", [])).length, fetched: 0, warnings: 0 } : await syncReleaseCalendar();
  const drop = mode === "release" ? { dropSeedEvents: (await readJson("dropCalendarSeed.json", [])).length } : await syncDropCalendar();
  await writeJson("calendarSyncStatus.json", {
    source: "Pokemon.com official pages + local Drop Radar runtime data",
    releaseCalendarUpdatedAt: SYNC_TIMESTAMP,
    dropCalendarUpdatedAt: SYNC_TIMESTAMP,
    releaseEvents: release.releaseEvents,
    releaseFetchSuccesses: release.fetched,
    releaseFetchWarnings: release.warnings,
    dropSeedEvents: drop.dropSeedEvents,
    scheduling: "Scripts are available; no automatic scheduler is configured in this repo. Suggested cadence: release weekly/daily, drop daily or after restock entry.",
  });
  console.log(JSON.stringify({ ok: true, mode, ...release, ...drop }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    process.exitCode = 1;
  });
}
