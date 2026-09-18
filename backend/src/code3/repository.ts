import type {
  CanonicalConflict,
  CanonicalDomain,
  CanonicalListQuery,
  CanonicalPage,
  CanonicalRecord,
  CanonicalRecordInput,
  CanonicalRecordUpdate,
  OwnerContext,
} from "./types";

export class CanonicalNotFoundError extends Error {
  constructor() {
    super("The requested record was not found.");
    this.name = "CanonicalNotFoundError";
  }
}

export class CanonicalDuplicateError extends Error {
  readonly duplicateType: "ID" | "EXTERNAL_IDENTITY" | "CERTIFICATION_NUMBER" | "FILE_STORAGE_PATH";

  constructor(duplicateType: CanonicalDuplicateError["duplicateType"]) {
    super("The record conflicts with an existing canonical identity.");
    this.name = "CanonicalDuplicateError";
    this.duplicateType = duplicateType;
  }
}

export class CanonicalVersionConflictError extends Error {
  readonly conflict: CanonicalConflict;

  constructor(record: Pick<CanonicalRecord, "id" | "recordVersion" | "updatedAt">) {
    super("The record changed after it was loaded.");
    this.name = "CanonicalVersionConflictError";
    this.conflict = Object.freeze({
      recordId: record.id,
      currentVersion: record.recordVersion,
      updatedAt: record.updatedAt,
      conflictType: "STALE_RECORD_VERSION",
    });
  }
}

export interface CanonicalRepository {
  withConsistentRead<T>(operation: (repository: CanonicalRepository) => Promise<T>): Promise<T>;
  list(owner: OwnerContext, domain: CanonicalDomain, query: CanonicalListQuery): Promise<CanonicalPage>;
  findByStableId(owner: OwnerContext, id: string): Promise<CanonicalRecord | null>;
  getById(owner: OwnerContext, domain: CanonicalDomain, id: string): Promise<CanonicalRecord | null>;
  findByExternalIdentity(owner: OwnerContext, domain: CanonicalDomain, provider: string, externalId: string): Promise<CanonicalRecord | null>;
  findByCertificationNumber(owner: OwnerContext, certificationNumber: string): Promise<CanonicalRecord | null>;
  findByFileStoragePath(owner: OwnerContext, storageProvider: string, storagePath: string): Promise<CanonicalRecord | null>;
  create(owner: OwnerContext, domain: CanonicalDomain, input: CanonicalRecordInput): Promise<CanonicalRecord>;
  update(owner: OwnerContext, domain: CanonicalDomain, id: string, input: CanonicalRecordUpdate): Promise<CanonicalRecord>;
  archive(owner: OwnerContext, domain: CanonicalDomain, id: string, expectedVersion: number): Promise<CanonicalRecord>;
}

export interface DomainRepository<D extends CanonicalDomain> {
  list(owner: OwnerContext, query: CanonicalListQuery): Promise<CanonicalPage>;
  getById(owner: OwnerContext, id: string): Promise<CanonicalRecord | null>;
  create(owner: OwnerContext, input: CanonicalRecordInput): Promise<CanonicalRecord>;
  update(owner: OwnerContext, id: string, input: CanonicalRecordUpdate): Promise<CanonicalRecord>;
  archive(owner: OwnerContext, id: string, expectedVersion: number): Promise<CanonicalRecord>;
  readonly domain: D;
}

export class BoundDomainRepository<D extends CanonicalDomain> implements DomainRepository<D> {
  constructor(readonly domain: D, private readonly repository: CanonicalRepository) {}

  list(owner: OwnerContext, query: CanonicalListQuery) {
    return this.repository.list(owner, this.domain, query);
  }

  getById(owner: OwnerContext, id: string) {
    return this.repository.getById(owner, this.domain, id);
  }

  create(owner: OwnerContext, input: CanonicalRecordInput) {
    return this.repository.create(owner, this.domain, input);
  }

  update(owner: OwnerContext, id: string, input: CanonicalRecordUpdate) {
    return this.repository.update(owner, this.domain, id, input);
  }

  archive(owner: OwnerContext, id: string, expectedVersion: number) {
    return this.repository.archive(owner, this.domain, id, expectedVersion);
  }
}

export type DealRepository = DomainRepository<"DEAL">;
export type SearchRuleRepository = DomainRepository<"SEARCH_RULE">;
export type AuctionRepository = DomainRepository<"AUCTION_EVENT" | "AUCTION_LOT" | "BID_PLAN">;
export type RestockRepository = DomainRepository<"RESTOCK_STORE_PROFILE" | "RESTOCK_EVENT" | "RESTOCK_PREDICTION" | "STORE_VISIT" | "PRODUCT_OBSERVATION">;
export type PurchaseRepository = DomainRepository<"PURCHASE" | "PURCHASE_LOT" | "COST_ALLOCATION">;
export type OwnedItemRepository = DomainRepository<"OWNED_ITEM" | "INVENTORY_ADJUSTMENT" | "STORAGE_LOCATION">;
export type SalesRepository = DomainRepository<"SALE" | "SALE_LINE_ITEM" | "SHIPMENT" | "RETURN">;
export type ExpenseRepository = DomainRepository<"EXPENSE">;
export type MileageRepository = DomainRepository<"MILEAGE_TRIP">;
export type SettingsRepository = DomainRepository<"OWNER_PREFERENCE" | "FEATURE_SETTING">;
