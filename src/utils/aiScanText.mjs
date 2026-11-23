// Text helpers for AI scan results (pure, testable).
/** Short line describing what the AI read, e.g. "Charizard ex · 199/165 · Scarlet & Violet 151". */
export function describeAiScan(result = {}) {
  const graded = [result.gradingCompany, result.grade].filter(Boolean).join(" ");
  return [result.name, result.cardNumber, result.setName || result.setCode, result.variant, graded, result.language && !/^english$/i.test(result.language) ? result.language : ""].filter(Boolean).join(" · ");
}

/** Other searches to try from an AI result, most exact first (the first one is searched automatically). */
export function aiScanSuggestions(result = {}) {
  const rows = [
    { label: "AI search", value: result.searchQuery },
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
