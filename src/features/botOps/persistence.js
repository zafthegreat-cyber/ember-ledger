import {
  PERSISTENCE_MODES,
  createLocalCollectionDataSource,
  createPersistenceGateway,
} from "../persistence/index.js";
import { BOT_OPS_COLLECTIONS } from "./constants.js";
import { createBotOpsRepository } from "./repository.js";
import { assertSafeBotOpsInput } from "./security.js";
import { BOT_OPS_RECORD_NORMALIZERS, BotOpsValidationError } from "./validators.js";

const CALLER_MODE_FIELDS = new Set([
  "mode", "persistenceMode", "remoteDataSource", "request", "explicitRemoteActivation",
  "remoteActivationReason", "remoteActive", "sync", "syncEngine", "migrationApply", "rollbackExecutor",
]);
const SYSTEM_FIELDS = new Set(["id", "recordVersion", "createdAt", "updatedAt", "archivedAt"]);
const APPEND_ONLY_COLLECTIONS = new Set(["attempts", "activity"]);

export class BotOpsPersistenceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "BotOpsPersistenceError";
    this.code = code;
    this.details = details;
  }
}

function rejectCallerMode(options) {
  const prohibited = Object.keys(options || {}).find((key) => CALLER_MODE_FIELDS.has(key));
  if (prohibited) {
    throw new BotOpsPersistenceError(
      "PERSISTENCE_MODE_NOT_CALLER_SELECTABLE",
      "Bot Operations is fixed to LOCAL_ONLY and does not accept remote activation options.",
      { field: prohibited },
    );
  }
}

function withoutSystemFields(record) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !SYSTEM_FIELDS.has(key)));
}

function assertPatch(input) {
  assertSafeBotOpsInput(input);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new BotOpsValidationError("INVALID_PATCH", "Bot Operations updates require a plain object.");
  const systemField = Object.keys(input).find((key) => SYSTEM_FIELDS.has(key));
  if (systemField) throw new BotOpsPersistenceError("SYSTEM_FIELD_IMMUTABLE", `${systemField} cannot be changed directly.`);
}

function createCollection(collection, options) {
  const normalizer = BOT_OPS_RECORD_NORMALIZERS[collection];
  const base = createLocalCollectionDataSource({
    repository: options.repository,
    collection,
    now: options.now,
    idFactory: () => String(options.idFactory?.(collection) || `${collection}:${globalThis.crypto?.randomUUID?.()}`),
  });
  const gateway = createPersistenceGateway({ mode: PERSISTENCE_MODES.LOCAL_ONLY, localDataSource: base });
  const appendOnly = APPEND_ONLY_COLLECTIONS.has(collection);
  const rejectAppendOnly = () => {
    throw new BotOpsPersistenceError("APPEND_ONLY_COLLECTION", `${collection} is append-only and cannot be updated or archived.`);
  };

  return Object.freeze({
    kind: "LOCAL",
    mode: PERSISTENCE_MODES.LOCAL_ONLY,
    collection,
    async list(query = {}) {
      assertSafeBotOpsInput(query);
      const result = await gateway.list(query);
      return { ...result, records: result.records.map((record) => normalizer(record, { persisted: true })) };
    },
    async getById(recordId) {
      const record = await gateway.getById(String(recordId));
      return record ? normalizer(record, { persisted: true }) : null;
    },
    async create(input) {
      assertSafeBotOpsInput(input);
      const normalized = normalizer(input, { persisted: false });
      const stored = await gateway.create(normalized);
      return normalizer(stored, { persisted: true });
    },
    update: appendOnly ? rejectAppendOnly : async (recordId, input, expectedVersion) => {
      assertPatch(input);
      const current = await gateway.getById(recordId);
      if (!current) throw new BotOpsPersistenceError("NOT_FOUND", `No ${collection} record exists for ${String(recordId)}.`);
      const normalized = normalizer({ ...current, ...input }, { persisted: true });
      const stored = await gateway.update(recordId, withoutSystemFields(normalized), expectedVersion ?? current.recordVersion);
      return normalizer(stored, { persisted: true });
    },
    archive: appendOnly ? rejectAppendOnly : async (recordId, expectedVersion) => {
      const current = await gateway.getById(recordId);
      if (!current) throw new BotOpsPersistenceError("NOT_FOUND", `No ${collection} record exists for ${String(recordId)}.`);
      const stored = await gateway.archive(recordId, expectedVersion ?? current.recordVersion);
      return normalizer(stored, { persisted: true });
    },
  });
}

export function createBotOpsPersistence(options = {}) {
  rejectCallerMode(options);
  const now = options.now || (() => new Date().toISOString());
  const repository = options.repository || createBotOpsRepository(options.storage, { now });
  const collections = Object.fromEntries(BOT_OPS_COLLECTIONS.map((collection) => [
    collection,
    createCollection(collection, { repository, now, idFactory: options.idFactory }),
  ]));
  return Object.freeze({
    mode: PERSISTENCE_MODES.LOCAL_ONLY,
    authoritative: "LOCAL_ONLY",
    remoteActive: false,
    repository,
    collections: Object.freeze(collections),
  });
}
