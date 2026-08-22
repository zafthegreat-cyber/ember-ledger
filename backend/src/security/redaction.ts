const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /(authorization|cookie|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|api[_-]?key|password|session|owner.*subjects?|database[_-]?url|postgres[_-]?url|signed[_-]?url)/i;
const BEARER_VALUE = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

export function redactText(value: unknown): string {
  return String(value ?? "").replace(BEARER_VALUE, `Bearer ${REDACTED}`);
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
