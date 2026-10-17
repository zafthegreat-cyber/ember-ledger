import { hashCanonicalJson, canonicalStringify } from "../backup/canonicalJson.js";
import { validateCanonicalWireInput } from "./canonicalWireContract.js";

const LIMIT = 200;
const MAX_ATTEMPTS = 6;
const STATES = new Set(["PENDING", "SYNCED", "CONFLICT", "ERROR", "AUTH_REQUIRED"]);
const OPERATIONS = new Set(["CREATE", "UPDATE", "ARCHIVE"]);
const SAFE_ERRORS = new Set([null, "VERSION_CONFLICT", "SIGN_IN_REQUIRED", "OWNER_ACCESS_REQUIRED", "RATE_LIMITED", "CONNECTION_UNAVAILABLE", "INVALID_ACKNOWLEDGEMENT", "VALIDATION_FAILED", "RETRY_DELAY_REQUIRES_REVIEW"]);
export class OfflineQueueError extends Error {
  constructor(code, message) { super(message); this.name = "OfflineQueueError"; this.code = code; }
}
const fail = (code, message) => { throw new OfflineQueueError(code, message); };

function validateCommand(command) {
  if (!command || Object.keys(command).some((key) => !["operation", "domain", "recordId", "input", "dependencies"].includes(key)) || !OPERATIONS.has(command.operation)) fail("INVALID_COMMAND", "Only reviewed canonical record mutations may be queued.");
  if (!/^[0-9a-f-]{36}$/i.test(command.recordId || "")) fail("INVALID_RECORD", "A stable canonical record ID is required.");
  if (!Array.isArray(command.dependencies || []) || (command.dependencies || []).length > 25) fail("INVALID_DEPENDENCIES", "Queue dependencies are invalid.");
  if ((command.dependencies || []).some((id) => typeof id !== "string" || id.length > 160)) fail("INVALID_DEPENDENCIES", "Queue dependencies require stable operation IDs.");
  if (command.operation === "CREATE" && command.input?.id != null && command.input.id !== command.recordId) fail("INVALID_RECORD", "The queued create must preserve its exact stable ID.");
  const input = command.operation === "CREATE" ? { ...command.input, id: command.recordId } : command.input;
  const validation = validateCanonicalWireInput(command.domain, input, { update: command.operation !== "CREATE" });
  if (!validation.valid) fail("INVALID_INPUT", "The queued record failed canonical validation.");
  if (command.operation !== "CREATE" && (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)) fail("EXPECTED_VERSION_REQUIRED", "Updates must identify the version that was reviewed.");
  if (command.operation === "ARCHIVE" && Object.keys(input).some((key) => key !== "expectedVersion")) fail("INVALID_ARCHIVE", "Archive may contain only an expected version.");
  if (canonicalStringify(command).length > 64_000) fail("COMMAND_TOO_LARGE", "The offline mutation exceeds the queue size limit.");
}

function readState(raw) {
  if (raw === null) return { schemaVersion: 1, entries: [] };
  let value;
  try { value = JSON.parse(raw); } catch { fail("QUEUE_UNREADABLE", "The pending queue is unreadable and has been preserved."); }
  if (value?.schemaVersion !== 1 || Object.keys(value).some((key) => !["schemaVersion", "entries"].includes(key)) || !Array.isArray(value.entries) || value.entries.length > LIMIT) fail("QUEUE_SCHEMA_UNSUPPORTED", "The pending queue requires a compatible app version.");
  const ids = new Set();
  for (const row of value.entries) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,159}$/.test(row.id || "") || ids.has(row.id) || !STATES.has(row.state) || !Number.isInteger(row.attempts) || row.attempts < 0 || row.attempts > MAX_ATTEMPTS
      || !Number.isSafeInteger(row.createdAt) || !Number.isSafeInteger(row.nextAttemptAt) || !SAFE_ERRORS.has(row.error)
      || Object.keys(row).some((key) => !["id", "command", "state", "attempts", "createdAt", "nextAttemptAt", "error", "acknowledgedVersion", "lastSyncedAt"].includes(key))) fail("QUEUE_INVALID", "The pending queue contains invalid records.");
    validateCommand(row.command);
    if (row.state === "SYNCED") {
      const expected = row.command.operation === "CREATE" ? 1 : row.command.input.expectedVersion + 1;
      if (row.acknowledgedVersion !== expected || !Number.isSafeInteger(row.lastSyncedAt) || row.lastSyncedAt < row.createdAt) fail("QUEUE_INVALID", "A pending record has no valid server acknowledgement.");
    } else if (Object.hasOwn(row, "acknowledgedVersion") || Object.hasOwn(row, "lastSyncedAt")) fail("QUEUE_INVALID", "An unconfirmed record cannot contain a server acknowledgement.");
    ids.add(row.id);
  }
  const checked = new Set();
  const visit = (row, chain = new Set()) => {
    if (chain.has(row.id)) fail("QUEUE_INVALID", "Pending records contain a circular dependency.");
    if (checked.has(row.id)) return;
    const next = new Set(chain).add(row.id);
    for (const id of row.command.dependencies || []) { const related = value.entries.find((entry) => entry.id === id); if (!related) fail("QUEUE_INVALID", "A pending dependency is missing."); visit(related, next); }
    checked.add(row.id);
  };
  value.entries.forEach((row) => visit(row));
  return value;
}

// Nothing is connected automatically. A transport must implement durable server
// idempotency for this exact protocol; ordinary CRUD adapters cannot be substituted.
export function createOfflineMutationQueue({ store, authorize, transport, now = Date.now, random = Math.random, idFactory = () => crypto.randomUUID() } = {}) {
  if (!store?.runExclusive || !store?.read || !store?.write || typeof authorize !== "function") fail("HOST_REQUIRED", "A durable queue store and current owner authorization are required.");
  let closed = false;
  let lifetime = null;
  async function owner() {
    if (closed) fail("SESSION_CLOSED", "This offline queue session is closed.");
    const current = await authorize();
    if (closed) fail("SESSION_CLOSED", "This offline queue session is closed.");
    if (!current?.authorized || !current.identity || !current.epoch) fail("AUTH_REQUIRED", "Sign in again to view or send pending records.");
    const next = `${current.identity}:${current.epoch}`;
    if (lifetime && lifetime !== next) { closed = true; fail("SESSION_CHANGED", "The account session changed. Pending records remain with their original account."); }
    lifetime = next;
    const partition = await hashCanonicalJson(current.identity);
    const latest = await authorize();
    if (closed) fail("SESSION_CLOSED", "This offline queue session is closed.");
    if (!latest?.authorized || !latest.identity || !latest.epoch) fail("AUTH_REQUIRED", "Sign in again to view or send pending records.");
    if (`${latest.identity}:${latest.epoch}` !== next) { closed = true; fail("SESSION_CHANGED", "The account session changed. Pending records remain with their original account."); }
    return partition;
  }
  async function run(operation) {
    const partition = await owner();
    return store.runExclusive(partition, async () => {
      if (await owner() !== partition) fail("SESSION_CHANGED", "The owner session changed.");
      const raw = await store.read(partition);
      if (await owner() !== partition) fail("SESSION_CHANGED", "The owner session changed.");
      const state = readState(raw);
      const save = async () => {
        if (await owner() !== partition) fail("SESSION_CHANGED", "The owner session changed.");
        if (await store.read(partition) !== raw) fail("QUEUE_CONFLICT", "Pending records changed in another view.");
        if (await owner() !== partition) fail("SESSION_CHANGED", "The owner session changed.");
        const next = canonicalStringify(state);
        readState(next);
        await store.write(partition, next);
        if (await store.read(partition) !== next) fail("QUEUE_SAVE_FAILED", "The pending records were not saved reliably.");
      };
      const result = await operation(state, save);
      if (await owner() !== partition) fail("SESSION_CHANGED", "The owner session changed.");
      return result;
    });
  }
  return Object.freeze({
    close() { closed = true; },
    list: () => run((state) => structuredClone(state.entries)),
    enqueue(command) {
      validateCommand(command);
      return run(async (state, save) => {
        const normalized = { ...command, dependencies: command.dependencies || [] };
        const existing = state.entries.find((row) => canonicalStringify(row.command) === canonicalStringify(normalized));
        if (existing) return structuredClone(existing);
        if (state.entries.length >= LIMIT) fail("QUEUE_FULL", "Review the pending queue before adding more records.");
        const dependencies = command.dependencies || [];
        if (new Set(dependencies).size !== dependencies.length || dependencies.some((id) => !state.entries.some((row) => row.id === id))) fail("DEPENDENCY_MISSING", "Queue dependencies must refer to existing pending records.");
        const id = idFactory();
        if (state.entries.some((row) => row.id === id)) fail("DUPLICATE_OPERATION", "An operation with this identity already exists.");
        const row = { id, command: structuredClone(normalized), state: "PENDING", attempts: 0, createdAt: now(), nextAttemptAt: now(), error: null };
        state.entries.push(row); await save(); return structuredClone(row);
      });
    },
    flushOne: () => run(async (state, save) => {
      if (transport?.protocol !== "code3-idempotent-mutations-v1" || typeof transport.send !== "function") fail("TRANSPORT_UNAVAILABLE", "Server idempotency is not connected. Pending records remain saved locally.");
      const row = state.entries.find((entry) => entry.state === "PENDING" && entry.nextAttemptAt <= now() && entry.command.dependencies.every((id) => state.entries.find((dependency) => dependency.id === id)?.state === "SYNCED"));
      if (!row) return { status: "IDLE" };
      await owner();
      let response;
      try { response = await transport.send({ idempotencyKey: row.id, ...structuredClone(row.command) }); }
      catch { response = { status: 0 }; }
      await owner();
      row.attempts++;
      const status = Number(response?.status || 0);
      const expectedAcknowledgement = row.command.operation === "CREATE" ? 1 : row.command.input.expectedVersion + 1;
      if (status >= 200 && status < 300 && response.record?.id === row.command.recordId && response.record.recordVersion === expectedAcknowledgement) {
        row.state = "SYNCED"; row.acknowledgedVersion = response.record.recordVersion; row.lastSyncedAt = now(); row.error = null;
      } else if (status === 409) { row.state = "CONFLICT"; row.error = "VERSION_CONFLICT"; }
      else if (status === 401) { row.state = "AUTH_REQUIRED"; row.error = "SIGN_IN_REQUIRED"; }
      else if (status === 403) { row.state = "ERROR"; row.error = "OWNER_ACCESS_REQUIRED"; }
      else if ([0, 429].includes(status) || status >= 500) {
        row.state = row.attempts >= MAX_ATTEMPTS ? "ERROR" : "PENDING"; row.error = status === 429 ? "RATE_LIMITED" : "CONNECTION_UNAVAILABLE";
        const retry = Number(response.retryAfterMs);
        if (status === 429 && retry > 86_400_000) { row.state = "ERROR"; row.error = "RETRY_DELAY_REQUIRES_REVIEW"; }
        row.nextAttemptAt = now() + (status === 429 && Number.isFinite(retry) && retry > 0 && retry <= 86_400_000 ? retry : Math.min(300_000, 1000 * 2 ** row.attempts + Math.floor(random() * 1000)));
      } else { row.state = "ERROR"; row.error = status >= 200 && status < 300 ? "INVALID_ACKNOWLEDGEMENT" : "VALIDATION_FAILED"; }
      await save(); return structuredClone(row);
    }),
    resolve(id, { decision, replacement } = {}) {
      return run(async (state, save) => {
        const row = state.entries.find((entry) => entry.id === id);
        if (!row || !["CONFLICT", "ERROR", "AUTH_REQUIRED"].includes(row.state)) fail("RESOLUTION_NOT_AVAILABLE", "Select a stopped operation to review.");
        if (decision === "KEEP_SERVER") {
          if (state.entries.some((entry) => entry.command.dependencies.includes(id))) fail("DEPENDENTS_REQUIRE_REVIEW", "Review dependent pending records before discarding this operation.");
          state.entries = state.entries.filter((entry) => entry.id !== id);
        } else if (decision === "REVIEWED_REPLACEMENT") {
          validateCommand(replacement);
          if (state.entries.some((entry) => entry.command.dependencies.includes(id))) fail("DEPENDENTS_REQUIRE_REVIEW", "Review dependent pending records before replacing this operation.");
          if ((replacement.dependencies || []).some((dependency) => dependency === id || !state.entries.some((entry) => entry.id === dependency))) fail("DEPENDENCY_MISSING", "The replacement has an invalid dependency.");
          const replacementId = idFactory();
          if (state.entries.some((entry) => entry.id === replacementId)) fail("DUPLICATE_OPERATION", "The replacement needs a new operation ID.");
          Object.assign(row, { id: replacementId, command: structuredClone({ ...replacement, dependencies: replacement.dependencies || [] }), state: "PENDING", attempts: 0, nextAttemptAt: now(), error: null });
        } else fail("EXPLICIT_DECISION_REQUIRED", "Review the server record or an explicit replacement. Automatic merging is unavailable.");
        await save(); return { status: "RESOLVED" };
      });
    },
  });
}

export function createBrowserOfflineQueueStore({ storage = globalThis.localStorage, locks = globalThis.navigator?.locks } = {}) {
  if (!locks?.request) fail("LOCK_UNAVAILABLE", "Offline queues require browser Web Locks.");
  const key = (partition) => `code3.pending-mutations.v1:${partition}`;
  return Object.freeze({ runExclusive: (partition, operation) => locks.request(key(partition), { mode: "exclusive" }, operation), read: async (partition) => storage.getItem(key(partition)), write: async (partition, raw) => storage.setItem(key(partition), raw) });
}
