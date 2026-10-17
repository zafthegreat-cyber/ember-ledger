const SUCCESS_STATES = new Set([
  "HEALTHY", "READY", "ACTIVE", "AVAILABLE", "VERIFIED", "COMPLETED", "DONE",
  "READY_FOR_PREVIEW", "ONLINE", "RECEIVING_CONFIRMED", "PROVIDER_PROVISIONED", "SOLVED",
]);

export function accountOpsStatusTone(value) {
  const state = String(value || "").toUpperCase();
  if (SUCCESS_STATES.has(state)) return "success";
  if (/CRITICAL|PROBLEM|FAILED|LOCKED|DISABLED|EXPIRED|OFFLINE|UNSUPPORTED|ERROR/.test(state)) return "danger";
  if (/HIGH|WAITING|REQUIRED|REVIEW|DEGRADED|UNKNOWN|NOT_READY|PARTIAL|UNVERIFIED|NEEDS|PENDING|SETUP|PREPARED|INSUFFICIENT/.test(state)) return "warning";
  return "neutral";
}
