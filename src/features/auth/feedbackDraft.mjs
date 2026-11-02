const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields = ["message", "mainReason", "role", "state", "cityRegion"];
const keyFor = id => uuid.test(String(id || "")) ? `code3:feedback-draft:v1:${id}` : "";
export function readFeedbackDraft(storage, userId) {
  try {
    const key = keyFor(userId); if (!key) return null;
    const raw = storage.getItem(key); if (!raw || raw.length > 12_000) return null;
    const row = JSON.parse(raw); if (!uuid.test(row.reference || "")) return null;
    return { reference: row.reference, ...Object.fromEntries(fields.map(field => [field, typeof row[field] === "string" ? row[field].slice(0, field === "message" ? 6000 : 200) : ""])) };
  } catch { return null; }
}
export function saveFeedbackDraft(storage, userId, form) {
  try {
    const key = keyFor(userId); if (!key || !uuid.test(form?.reference || "")) return false;
    if (fields.some(field => String(form[field] || "").length > (field === "message" ? 6000 : 200))) return false;
    const draft = { reference: form.reference, ...Object.fromEntries(fields.map(field => [field, String(form[field] || "").slice(0, field === "message" ? 6000 : 200)])) };
    storage.setItem(key, JSON.stringify(draft)); return true;
  } catch { return false; }
}
export function clearFeedbackDraft(storage, userId) {
  try { const key = keyFor(userId); if (key) storage.removeItem(key); } catch { /* A storage error must not erase the form. */ }
}
