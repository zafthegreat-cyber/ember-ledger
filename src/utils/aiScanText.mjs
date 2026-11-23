// Text helpers for AI scan results (pure, testable).
/** Short line describing what the AI read, e.g. "Charizard ex · 199/165 · Scarlet & Violet 151". */
export function describeAiScan(result = {}) {
  const graded = [result.gradingCompany, result.grade].filter(Boolean).join(" ");
  return [result.name, result.cardNumber, result.setName || result.setCode, result.variant, graded, result.language && !/^english$/i.test(result.language) ? result.language : ""].filter(Boolean).join(" · ");
}

/**
 * The search to run for an AI result (Nov 23 2026). For a single card with a
 * printed number, "name number" is what the catalog's exact-number lookup reads
 * best; the free-text searchQuery can carry set names or variants that make the
 * number filter miss. Everything else uses the AI's own search.
 */
export function aiScanQuery(result = {}) {
  const number = String(result.cardNumber || "").trim();
  const name = String(result.name || "").trim();
  const isCard = !result.itemType || /card|slab|single/i.test(String(result.itemType));
  if (isCard && name && /\d/.test(number)) return `${name} ${number}`.slice(0, 160);
  return String(result.searchQuery || [name, number].filter(Boolean).join(" ")).trim().slice(0, 160);
}

/** Other searches to try from an AI result, most exact first (the first one is searched automatically). */
export function aiScanSuggestions(result = {}) {
  const rows = [
    { label: "AI search", value: aiScanQuery(result) },
    { label: "AI search text", value: result.searchQuery },
    { label: "Name and number", value: [result.name, result.cardNumber].filter(Boolean).join(" ") },
    { label: "Name and set", value: [result.name, result.setName].filter(Boolean).join(" ") },
    { label: "Name", value: result.name },
    { label: "Cert number", value: result.certNumber },
  ];
  const seen = new Set();
  return rows.filter((row) => {
    const key = String(row.value || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((row) => ({ type: "ai", label: row.label, value: String(row.value).trim().slice(0, 160) }));
}
