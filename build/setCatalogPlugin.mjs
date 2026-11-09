import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { buildCollectionSetRows } from "../src/utils/collectionSets.mjs";
import { setCatalogKind } from "../src/utils/setCatalog.mjs";

const virtualId = "virtual:code3-set-catalog";
const resolvedId = `\0${virtualId}`;
const fields = ["id", "name", "tcgplayerProductId", "catalogType", "setName", "setCode", "language", "cardNumber", "rarity", "productType", "variant", "edition", "finish", "printing", "packCount", "imageUrl", "marketPrice", "marketSource", "marketLastUpdated", "priceCheckedAt", "marketStatus"];

export function createSetCatalogSnapshot(cards, sealed) {
  const products = [...cards, ...sealed].filter(row => setCatalogKind(row) !== "other").map(row => ({ ...Object.fromEntries(fields.filter(field => row[field] !== undefined).map(field => [field, row[field]])), tcgGame: "pokemon" }));
  return buildCollectionSetRows({ catalogProducts: products }).map(row => {
    const records = row.catalogRecords;
    const counts = { cards: records.filter(product => setCatalogKind(product) === "card").length, sealed: records.filter(product => setCatalogKind(product) === "sealed").length };
    return { key: row.key, slug: createHash("sha256").update(row.key).digest("hex").slice(0,20), ...counts, json: JSON.stringify({ schemaVersion: 1, key: row.key, products: records }) };
  });
}

// Emit only public catalog projections, one content-hashed asset per set. The
// 57MB source card snapshot is never parsed or downloaded by the app at startup.
export function setCatalogPlugin() {
  let root = process.cwd(), command, cached;
  const files = () => ["pokemonTcgCards.json", "sealedProducts.json"].map(name => resolve(root, "src/data/generated", name));
  function snapshot() {
    const inputs = files(), signature = inputs.map(file => { const stat = statSync(file); return `${stat.mtimeMs}:${stat.size}`; }).join("|");
    if (cached?.signature === signature) return cached.rows;
    const [cards, sealed] = inputs.map(file => JSON.parse(readFileSync(file,"utf8")));
    const rows = createSetCatalogSnapshot(cards, sealed);
    cached = { signature, rows }; return rows;
  }
  return {
    name: "code3-per-set-catalog",
    configResolved(config) { root = config.root; command = config.command; },
    resolveId(id) { if (id === virtualId) return resolvedId; },
    load(id) {
      if (id !== resolvedId) return;
      for (const file of files()) this.addWatchFile(file);
      const entries = snapshot().map(row => {
        const url = command === "serve" ? JSON.stringify(`/__catalog/sets/${row.slug}.json`) : `import.meta.ROLLUP_FILE_URL_${this.emitFile({ type: "asset", name: `set-catalog-${row.slug}.json`, source: row.json })}`;
        return `${JSON.stringify(row.key)}:{url:${url},cards:${row.cards},sealed:${row.sealed}}`;
      });
      return `export default {${entries.join(",")}};`;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const match = /^\/__catalog\/sets\/([a-f0-9]{20})\.json(?:\?.*)?$/.exec(request.url || "");
        if (!match || !["GET", "HEAD"].includes(request.method)) return next();
        try {
          const row = snapshot().find(entry => entry.slug === match[1]);
          if (!row) { response.statusCode = 404; return response.end(); }
          response.setHeader("Content-Type", "application/json; charset=utf-8"); response.setHeader("Cache-Control", "no-cache");
          response.end(request.method === "HEAD" ? undefined : row.json);
        } catch (error) { next(error); }
      });
    },
  };
}
