export const OWNER_SESSION_RECHECK_MS = 5 * 60 * 1000;

export function nextOwnerSessionRecheckDelay(expiresAt, now = Date.now()) {
  const expiration = Date.parse(String(expiresAt || ""));
  if (!Number.isFinite(expiration)) return OWNER_SESSION_RECHECK_MS;
  return Math.max(250, Math.min(OWNER_SESSION_RECHECK_MS, expiration - Number(now) + 250));
}
