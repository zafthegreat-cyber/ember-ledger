import {
  PERSISTENCE_MODES,
  createLocalCollectionDataSource,
  createPersistenceGateway,
} from "../persistence/index.js";
import { ACCOUNT_OPS_COLLECTIONS } from "./constants.js";
import { createAccountOpsRepository } from "./repository.js";
import { assertSafeAccountOpsInput } from "./security.js";
import { secureUuid } from "./secureRandom.js";
import { ACCOUNT_OPS_RECORD_NORMALIZERS, AccountOpsValidationError } from "./validators.js";

const CALLER_MODE_FIELDS = new Set([
  "mode", "persistenceMode", "remoteDataSource", "request", "explicitRemoteActivation",
  "remoteActivationReason", "sync", "syncEngine", "migrationApply", "rollbackExecutor",
]);
const SYSTEM_FIELDS = new Set(["id", "recordVersion", "createdAt", "updatedAt", "archivedAt"]);

export class AccountOpsPersistenceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "AccountOpsPersistenceError";
    this.code = code;
    this.details = details;
  }
}

function rejectCallerPersistenceSelection(options) {
  const prohibited = Object.keys(options || {}).find((key) => CALLER_MODE_FIELDS.has(key));
  if (prohibited) {
    throw new AccountOpsPersistenceError(
      "PERSISTENCE_MODE_NOT_CALLER_SELECTABLE",
      "Account Ops is fixed to LOCAL_ONLY until a separately approved owner-confirmed cutover.",
      { field: prohibited },
    );
  }
}

function assertPatchFields(input) {
  assertSafeAccountOpsInput(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AccountOpsValidationError("INVALID_PATCH", "Account Ops updates require a plain object.");
  }
  const field = Object.keys(input).find((key) => SYSTEM_FIELDS.has(key));
  if (field) throw new AccountOpsValidationError("SYSTEM_FIELD_IMMUTABLE", `${field} is managed by Code 3 and cannot be changed directly.`, { field });
}

function mutablePayload(record) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !SYSTEM_FIELDS.has(key)));
}

function createValidatedCollectionGateway(collection, options) {
  const normalizer = ACCOUNT_OPS_RECORD_NORMALIZERS[collection];
  const base = createLocalCollectionDataSource({
    repository: options.repository,
    collection,
    now: options.now,
    idFactory: () => String(options.idFactory?.(collection) || `${collection}:${secureUuid(options.randomSource)}`),
  });
  const gateway = createPersistenceGateway({ mode: PERSISTENCE_MODES.LOCAL_ONLY, localDataSource: base });

  async function normalizeStored(record) {
    return record ? normalizer(record, { persisted: true }) : null;
  }

  return Object.freeze({
    kind: "LOCAL",
    mode: PERSISTENCE_MODES.LOCAL_ONLY,
    collection,
    async list(query = {}) {
      assertSafeAccountOpsInput(query);
      const result = await gateway.list(query);
      return { ...result, records: result.records.map((record) => normalizer(record, { persisted: true })) };
    },
    async getById(id) { return normalizeStored(await gateway.getById(id)); },
    async create(input) {
      assertSafeAccountOpsInput(input);
      const normalized = normalizer(input, { persisted: false });
      return normalizeStored(await gateway.create(normalized));
    },
    async update(id, input, expectedVersion) {
      assertPatchFields(input);
      const current = await gateway.getById(id);
      if (!current) throw new AccountOpsPersistenceError("NOT_FOUND", `No ${collection} record exists for ${String(id)}.`);
      const next = normalizer({ ...current, ...input }, { persisted: true });
      return normalizeStored(await gateway.update(id, mutablePayload(next), expectedVersion ?? current.recordVersion));
    },
    async archive(id, expectedVersion) {
      const current = await gateway.getById(id);
      if (!current) throw new AccountOpsPersistenceError("NOT_FOUND", `No ${collection} record exists for ${String(id)}.`);
      return normalizeStored(await gateway.archive(id, expectedVersion ?? current.recordVersion));
    },
  });
}

export function createAccountOpsPersistence(options = {}) {
  rejectCallerPersistenceSelection(options);
  const repository = options.repository || createAccountOpsRepository(options.storage, { now: options.now });
  const now = options.now || (() => new Date().toISOString());
  const randomSource = options.randomSource || globalThis.crypto;
  const collections = Object.fromEntries(ACCOUNT_OPS_COLLECTIONS.map((collection) => [
    collection,
    createValidatedCollectionGateway(collection, { repository, now, randomSource, idFactory: options.idFactory }),
  ]));
  return Object.freeze({
    mode: PERSISTENCE_MODES.LOCAL_ONLY,
    authoritative: "LOCAL_ONLY",
    remoteActive: false,
    repository,
    collections: Object.freeze(collections),
  });
}
