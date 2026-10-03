import {
  BUSINESS_COMPLIANCE_STORAGE_KEY,
  createInitialBusinessComplianceState,
  normalizeBusinessComplianceState,
} from "./businessComplianceModel.js";

function canUseStorage() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function loadBusinessCompliance() {
  const fallback = createInitialBusinessComplianceState();
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(BUSINESS_COMPLIANCE_STORAGE_KEY);
    if (!raw) return fallback;
    return normalizeBusinessComplianceState(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function saveBusinessCompliance(state) {
  const normalized = normalizeBusinessComplianceState({ ...state, updatedAt: new Date().toISOString() });
  if (!canUseStorage()) return normalized;
  try {
    window.localStorage.setItem(BUSINESS_COMPLIANCE_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent("code3:business-compliance", { detail: normalized }));
  } catch {
    // Best-effort local persistence; the UI retains the in-memory state.
  }
  return normalized;
}

export function resetBusinessCompliance() {
  const next = createInitialBusinessComplianceState();
  if (canUseStorage()) {
    try { window.localStorage.setItem(BUSINESS_COMPLIANCE_STORAGE_KEY, JSON.stringify(next)); } catch { /* best effort */ }
  }
  return next;
}
