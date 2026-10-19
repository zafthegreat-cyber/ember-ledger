import { readFileSync } from "node:fs";
import { join } from "node:path";

type PublicPriceRow = Record<string, unknown>;
const MAX_QUOTES = 20;
const validProductId = (value: unknown): value is string => typeof value === "string" && /^[1-9]\d{0,9}$/.test(value);
const positive = (value: unknown) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount <= 1_000_000_000 ? amount : null;
};
const text = (value: unknown) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 80).trim() : "";
const timestamp = (value: unknown) => {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:?\d{2})$/.test(value)) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
};

/** Public generated prices only. Never consult account records, credentials or a provider at request time. */
export function buildMarketSourceSnapshot(productId: string, rows: unknown, metadata: unknown) {
  if (!validProductId(productId)) return null;
  const meta = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  const snapshotLastImportedAt = timestamp(meta.lastImportedAt);
  const quotes: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  if (Array.isArray(rows)) {
    for (const candidate of rows) {
      if (quotes.length >= MAX_QUOTES) break;
      if (!candidate || typeof candidate !== "object") continue;
      const row = candidate as PublicPriceRow;
      if (String(row.tcgplayerProductId || "") !== productId || row.currency !== "USD") continue;
      const provenance = [row.source, row.externalSource, row.marketSource, row.sourceType, row.marketValueSource, row.marketStatus].map(value => text(value).toLowerCase());
      // Daily imports preserve manual values, but those must never be relabeled
      // as quotes from a marketplace just because they share its product ID.
      if (!provenance.includes("tcgcsv") || provenance.some(value => /manual|admin|mock|estimated/.test(value))) continue;
      const amount = positive(row.marketPrice);
      if (amount === null) continue;
      const variant = text(row.variant) || "Unspecified printing";
      const priceBasis = ["market", "mid"].includes(String(row.marketPriceBasis)) ? String(row.marketPriceBasis) : "unknown";
      const observedAt = timestamp(row.priceCheckedAt);
      const id = `tcgcsv:${productId}:${variant}:${priceBasis}`;
      if (seen.has(id)) continue;
      seen.add(id);
      quotes.push({
        id, sourceId: "tcgplayer", sourceLabel: "TCGplayer", via: "TCGCSV daily snapshot",
        kind: priceBasis === "mid" ? "listing" : "market", amount, currency: "USD", variant,
        condition: "Product-level aggregate", observedAt, snapshotLastImportedAt, priceBasis,
        sourceUrl: `https://www.tcgplayer.com/product/${productId}`,
        marketEligible: priceBasis === "market" && Boolean(observedAt),
        matchNote: priceBasis === "mid"
          ? "Median asking price from a daily snapshot; this is not a completed-sale price."
          : priceBasis === "unknown"
            ? "Cached reference; upstream price basis and observation date were not recorded."
            : "Exact product and printing; aggregate price across conditions, not a condition-specific quote.",
      });
    }
  }
  return { productId, source: "TCGCSV", status: quotes.length ? "ready" : "no_quote", snapshotLastImportedAt, quotes };
}

let generatedSnapshot: { rows: unknown; metadata: unknown } | undefined;
export function getMarketSourceSnapshot(productId: string) {
  if (!validProductId(productId)) return null;
  if (!generatedSnapshot) {
    try {
      // Literal paths let the deployment tracer bundle only these public generated assets.
      const rows: unknown = JSON.parse(readFileSync(join(process.cwd(), "src/data/generated/marketPrices.json"), "utf8"));
      const metadata: unknown = JSON.parse(readFileSync(join(process.cwd(), "src/data/generated/catalogImportStatus.json"), "utf8"));
      if (!Array.isArray(rows) || rows.length > 200_000) throw new Error("Invalid public price snapshot");
      generatedSnapshot = { rows, metadata };
    } catch {
      return { productId, source: "TCGCSV", status: "unavailable", snapshotLastImportedAt: "", quotes: [] };
    }
  }
  return buildMarketSourceSnapshot(productId, generatedSnapshot.rows, generatedSnapshot.metadata);
}
