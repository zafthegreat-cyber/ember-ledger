import {
  PERSISTENCE_MODES,
  createLocalCollectionDataSource,
  createPersistenceGateway,
} from "../persistence/index.js";
import { INBOX_ORDER_COLLECTIONS } from "./constants.js";
import { createInboxOrderRepository } from "./repository.js";
import { assertSafeInboxOrderInput } from "./security.js";

const CALLER_MODE_FIELDS = new Set([
  "mode", "persistenceMode", "remoteDataSource", "request", "explicitRemoteActivation",
  "remoteActivationReason", "sync", "syncEngine", "migrationApply", "rollbackExecutor",
]);
const SYSTEM_FIELDS = new Set(["id", "recordVersion", "createdAt", "updatedAt", "archivedAt"]);
const IMMUTABLE_COLLECTIONS = new Set(["messageEvents", "candidateEvents", "activity"]);

export class InboxOrderPersistenceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "InboxOrderPersistenceError";
    this.code = code;
    this.details = details;
  }
}

function rejectCallerMode(options) {
  const prohibited = Object.keys(options || {}).find((key) => CALLER_MODE_FIELDS.has(key));
  if (prohibited) {
    throw new InboxOrderPersistenceError(
      "PERSISTENCE_MODE_NOT_CALLER_SELECTABLE",
      "Inbox/order persistence is fixed to LOCAL_ONLY until a separately approved cutover.",
      { field: prohibited },
    );
  }
}

function mutablePayload(record) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !SYSTEM_FIELDS.has(key)));
}

function createCollection(collection, options) {
  const base = createLocalCollectionDataSource({
    repository: options.repository,
    collection,
    now: options.now,
    idFactory: () => String(options.idFactory?.(collection) || `${collection}:${globalThis.crypto?.randomUUID?.()}`),
  });
  const gateway = createPersistenceGateway({ mode: PERSISTENCE_MODES.LOCAL_ONLY, localDataSource: base });
  const immutable = IMMUTABLE_COLLECTIONS.has(collection);
  const rejectImmutable = () => {
    throw new InboxOrderPersistenceError("APPEND_ONLY_COLLECTION", `${collection} is append-only and cannot be updated or archived.`);
  };
  return Object.freeze({
    kind: "LOCAL",
    mode: PERSISTENCE_MODES.LOCAL_ONLY,
    collection,
    async list(query = {}) { assertSafeInboxOrderInput(query); return gateway.list(query); },
    async getById(id) { return gateway.getById(String(id)); },
    async create(input) { assertSafeInboxOrderInput(input); return gateway.create(input); },
    update: immutable ? rejectImmutable : async (id, input, expectedVersion) => {
      assertSafeInboxOrderInput(input);
      const directSystemField = Object.keys(input || {}).find((key) => SYSTEM_FIELDS.has(key));
      if (directSystemField) throw new InboxOrderPersistenceError("SYSTEM_FIELD_IMMUTABLE", `${directSystemField} cannot be changed directly.`);
      const current = await gateway.getById(id);
      if (!current) throw new InboxOrderPersistenceError("NOT_FOUND", `No ${collection} record exists for ${String(id)}.`);
      return gateway.update(id, mutablePayload(input), expectedVersion);
    },
    archive: immutable ? rejectImmutable : (...args) => gateway.archive(...args),
  });
}

export function createInboxOrderPersistence(options = {}) {
  rejectCallerMode(options);
  const now = options.now || (() => new Date().toISOString());
  const repository = options.repository || createInboxOrderRepository(options.storage, { now });
  const collections = Object.fromEntries(INBOX_ORDER_COLLECTIONS.map((collection) => [
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
