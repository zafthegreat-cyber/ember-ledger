// Runtime diagnostics can contain raw provider/error text. They belong to the
// device that recorded them, never another device's account snapshot or restore.
// All other fields still pass the existing strict source/security validation.
const DEVICE_ONLY_FIELDS = Object.freeze({
  "beta-readiness-records": Object.freeze(["appErrorLogs"]),
});

function fieldsFor(source) {
  const id = typeof source === "string" ? source : source?.sourceId;
  return Object.hasOwn(DEVICE_ONLY_FIELDS, id) ? DEVICE_ONLY_FIELDS[id] : [];
}

export function projectSourceData(source, data) {
  const fields = fieldsFor(source);
  if (!fields.length || !data || typeof data !== "object" || Array.isArray(data)) return data;
  return Object.fromEntries(Object.entries(data).filter(([key]) => !fields.includes(key)));
}

export function retainDeviceOnlySourceFields(source, original, incoming) {
  const fields = fieldsFor(source);
  if (!fields.length || !incoming || typeof incoming !== "object" || Array.isArray(incoming)) return incoming;
  const retained = { ...projectSourceData(source, incoming) };
  for (const field of fields) {
    if (original && typeof original === "object" && Object.hasOwn(original, field)) retained[field] = original[field];
  }
  return retained;
}
