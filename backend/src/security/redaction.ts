const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /(authorization|cookie|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|provider[_-]?secret|managed[_-]?reference|api[_-]?key|password|passcode|one[_-]?time|otp|verification[_-]?code|authorization[_-]?code|oauth[_-]?(?:code|state)|code[_-]?(?:verifier|challenge)|reset[_-]?(?:token|link)|login[_-]?link|session|owner.*subjects?|database[_-]?url|postgres[_-]?url|signed[_-]?url)/i;
const BEARER_VALUE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const BASIC_VALUE = /Basic\s+[A-Za-z0-9+/=]+/gi;
const URL_SECRET_VALUE = /([?&#](?:access_token|refresh_token|id_token|client_secret|authorization_code|oauth_code|oauth_state|state|code|code_verifier|reset_token|login_token|verification_code|otp)=)[^&#\s]*/gi;

export function redactText(value: unknown): string {
  return String(value ?? "")
    .replace(BEARER_VALUE, `Bearer ${REDACTED}`)
    .replace(BASIC_VALUE, `Basic ${REDACTED}`)
    .replace(URL_SECRET_VALUE, `$1${REDACTED}`);
}

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[MAX_DEPTH]";
  if (typeof value === "string") return redactText(value);
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((entry) => redactSensitive(entry, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redactText(value.message) };
  if (typeof value !== "object") return String(value);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    SENSITIVE_KEY.test(key) ? REDACTED : redactSensitive(entry, depth + 1),
  ]));
}
