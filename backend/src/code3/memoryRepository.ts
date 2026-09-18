import { randomUUID } from "node:crypto";
import { decodeCursor, encodeCursor } from "./pagination";
import {
  CanonicalDuplicateError,
  CanonicalNotFoundError,
  CanonicalVersionConflictError,
  type CanonicalRepository,
} from "./repository";
import type {
  CanonicalDomain,
  CanonicalListQuery,
  CanonicalPage,
  CanonicalRecord,
  CanonicalRecordInput,
  CanonicalRecordUpdate,
  OwnerContext,
} from "./types";

type MemoryRepositoryOptions = {
  now?: () => Date;
  idFactory?: () => string;
};

function copyRecord(record: CanonicalRecord): CanonicalRecord {
  return structuredClone(record);
}

export class MemoryCanonicalRepository implements CanonicalRepository {
  private readonly records = new Map<string, CanonicalRecord>();
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private writes = 0;

  constructor(options: MemoryRepositoryOptions = {}) {
    this.now = options.now || (() => new Date());
    this.idFactory = options.idFactory || randomUUID;
  }

  async withConsistentRead<T>(operation: (repository: CanonicalRepository) => Promise<T>): Promise<T> {
    const snapshot = new MemoryCanonicalRepository({ now: this.now, idFactory: this.idFactory });
    for (const [key, value] of this.records.entries()) snapshot.records.set(key, copyRecord(value));
    snapshot.writes = this.writes;
    return operation(snapshot);
  }

  private key(owner: OwnerContext, domain: CanonicalDomain, id: string): string {
    return `${owner.ownerSubject}\u0000${domain}\u0000${id}`;
  }

  private ownerRecords(owner: OwnerContext, domain: CanonicalDomain): CanonicalRecord[] {
    return [...this.records.entries()]
      .filter(([key]) => key.startsWith(`${owner.ownerSubject}\u0000${domain}\u0000`))
      .map(([, record]) => record);
  }

  async list(owner: OwnerContext, domain: CanonicalDomain, query: CanonicalListQuery): Promise<CanonicalPage> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const values = this.ownerRecords(owner, domain)
      .filter((record) => query.includeArchived || !record.archivedAt)
      .filter((record) => !query.status || record.status === query.status)
      .filter((record) => !cursor || record.createdAt > cursor.createdAt || (record.createdAt === cursor.createdAt && record.id > cursor.id))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    const page = values.slice(0, query.limit + 1);
    const hasMore = page.length > query.limit;
    const records = page.slice(0, query.limit).map(copyRecord);
    const last = records.length ? records[records.length - 1] : undefined;
    return {
      records,
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }

  async getById(owner: OwnerContext, domain: CanonicalDomain, id: string): Promise<CanonicalRecord | null> {
    const record = this.records.get(this.key(owner, domain, id));
    return record ? copyRecord(record) : null;
  }

  async findByStableId(owner: OwnerContext, id: string): Promise<CanonicalRecord | null> {
    const ownerPrefix = `${owner.ownerSubject}\u0000`;
    const idSuffix = `\u0000${id}`;
    const entry = [...this.records.entries()].find(([key]) => key.startsWith(ownerPrefix) && key.endsWith(idSuffix));
    return entry ? copyRecord(entry[1]) : null;
  }

  async findByExternalIdentity(owner: OwnerContext, domain: CanonicalDomain, provider: string, externalId: string): Promise<CanonicalRecord | null> {
    const record = this.ownerRecords(owner, domain).find((entry) => !entry.archivedAt && entry.externalProvider === provider && entry.externalId === externalId);
    return record ? copyRecord(record) : null;
  }

  async findByCertificationNumber(owner: OwnerContext, certificationNumber: string): Promise<CanonicalRecord | null> {
    const normalized = certificationNumber.toUpperCase();
    const record = this.ownerRecords(owner, "OWNED_ITEM")
      .find((entry) => !entry.archivedAt && entry.certificationNumber?.toUpperCase() === normalized);
    return record ? copyRecord(record) : null;
  }

  async findByFileStoragePath(owner: OwnerContext, storageProvider: string, storagePath: string): Promise<CanonicalRecord | null> {
    const record = this.ownerRecords(owner, "FILE_ASSET")
      .find((entry) => entry.fileAsset?.storageProvider === storageProvider && entry.fileAsset.storagePath === storagePath);
    return record ? copyRecord(record) : null;
  }

  async create(owner: OwnerContext, domain: CanonicalDomain, input: CanonicalRecordInput): Promise<CanonicalRecord> {
    const id = input.id || this.idFactory();
    if (await this.findByStableId(owner, id)) throw new CanonicalDuplicateError("ID");
    if (input.externalProvider && input.externalId && await this.findByExternalIdentity(owner, domain, input.externalProvider, input.externalId)) {
      throw new CanonicalDuplicateError("EXTERNAL_IDENTITY");
    }
    if (domain === "OWNED_ITEM" && input.certificationNumber && await this.findByCertificationNumber(owner, input.certificationNumber)) {
      throw new CanonicalDuplicateError("CERTIFICATION_NUMBER");
    }
    if (domain === "FILE_ASSET" && input.fileAsset && await this.findByFileStoragePath(owner, input.fileAsset.storageProvider, input.fileAsset.storagePath)) {
      throw new CanonicalDuplicateError("FILE_STORAGE_PATH");
    }
    const timestamp = this.now().toISOString();
    const record: CanonicalRecord = Object.freeze({
      id,
      domain,
      status: input.status || "ACTIVE",
      source: input.source || "manual",
      externalProvider: input.externalProvider || null,
      externalId: input.externalId || null,
      sourceUrl: input.sourceUrl || null,
      notes: input.notes || null,
      metadata: structuredClone(input.metadata || {}),
      amountMinor: input.amountMinor ?? null,
      currency: input.currency || null,
      rateBasisPoints: input.rateBasisPoints ?? null,
      quantity: input.quantity ?? null,
      certificationNumber: input.certificationNumber || null,
      occurredAt: input.occurredAt || null,
      relations: Object.freeze({ ...(input.relations || {}) } as Record<string, string>),
      fileAsset: input.fileAsset ? structuredClone(input.fileAsset) : null,
      createdAt: timestamp,
      updatedAt: timestamp,
      recordVersion: 1,
      archivedAt: null,
    });
    this.records.set(this.key(owner, domain, id), record);
    this.writes += 1;
    return copyRecord(record);
  }

  async update(owner: OwnerContext, domain: CanonicalDomain, id: string, input: CanonicalRecordUpdate): Promise<CanonicalRecord> {
    const key = this.key(owner, domain, id);
    const current = this.records.get(key);
    if (!current) throw new CanonicalNotFoundError();
    if (current.recordVersion !== input.expectedVersion) throw new CanonicalVersionConflictError(current);
    const nextExternalProvider = Object.prototype.hasOwnProperty.call(input, "externalProvider")
      ? input.externalProvider
      : current.externalProvider;
    const nextExternalId = Object.prototype.hasOwnProperty.call(input, "externalId")
      ? input.externalId
      : current.externalId;
    if (nextExternalProvider && nextExternalId) {
      const duplicate = await this.findByExternalIdentity(owner, domain, nextExternalProvider, nextExternalId);
      if (duplicate && duplicate.id !== id) throw new CanonicalDuplicateError("EXTERNAL_IDENTITY");
    }
    if (domain === "OWNED_ITEM" && input.certificationNumber) {
      const duplicate = await this.findByCertificationNumber(owner, input.certificationNumber);
      if (duplicate && duplicate.id !== id) throw new CanonicalDuplicateError("CERTIFICATION_NUMBER");
    }
    if (domain === "FILE_ASSET" && input.fileAsset) {
      const duplicate = await this.findByFileStoragePath(owner, input.fileAsset.storageProvider, input.fileAsset.storagePath);
      if (duplicate && duplicate.id !== id) throw new CanonicalDuplicateError("FILE_STORAGE_PATH");
    }
    const { expectedVersion: _expectedVersion, ...changes } = input;
    const updated: CanonicalRecord = Object.freeze({
      ...current,
      ...changes,
      metadata: changes.metadata === undefined ? current.metadata : structuredClone(changes.metadata),
      relations: changes.relations === undefined ? current.relations : Object.freeze({ ...changes.relations } as Record<string, string>),
      fileAsset: changes.fileAsset === undefined ? current.fileAsset : structuredClone(changes.fileAsset),
      updatedAt: this.now().toISOString(),
      recordVersion: current.recordVersion + 1,
    });
    this.records.set(key, updated);
    this.writes += 1;
    return copyRecord(updated);
  }

  async archive(owner: OwnerContext, domain: CanonicalDomain, id: string, expectedVersion: number): Promise<CanonicalRecord> {
    const key = this.key(owner, domain, id);
    const current = this.records.get(key);
    if (!current) throw new CanonicalNotFoundError();
    if (current.recordVersion !== expectedVersion) throw new CanonicalVersionConflictError(current);
    const timestamp = this.now().toISOString();
    const archived: CanonicalRecord = Object.freeze({
      ...current,
      status: "ARCHIVED",
      archivedAt: timestamp,
      updatedAt: timestamp,
      recordVersion: current.recordVersion + 1,
    });
    this.records.set(key, archived);
    this.writes += 1;
    return copyRecord(archived);
  }

  snapshot(): Readonly<{ records: CanonicalRecord[]; writes: number }> {
    return Object.freeze({
      records: [...this.records.values()].map(copyRecord).sort((left, right) => left.id.localeCompare(right.id)),
      writes: this.writes,
    });
  }
}
