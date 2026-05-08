import { catalogService } from "./catalog.service";

function normalize(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export const scanService = {
  matchInput(input: string) {
    const q = normalize(input);
    if (!q) return { matched: false, matches: [], message: "No scan input provided." };

    const matches = catalogService.list().filter((item) => {
      const values = [item.name, item.upc, item.sku, item.setName, item.productType];
      return values.some((value) => normalize(value).includes(q) || q.includes(normalize(value)));
    });

    return {
      matched: matches.length > 0,
      bestMatch: matches[0] || null,
      matches,
      message: matches.length ? "Catalog match found." : "No match found.",
    };
  },
  scanUpc(input: string) {
    return this.matchInput(input);
  },
  scanCard(input: string) {
    return {
      ...this.matchInput(input),
      note: "Future OCR/card image recognition will plug in here.",
    };
  },
  scanReceipt(input: string) {
    return {
      ...this.matchInput(input),
      note: "Future receipt OCR/screenshot recognition will plug in here.",
    };
  },
};

