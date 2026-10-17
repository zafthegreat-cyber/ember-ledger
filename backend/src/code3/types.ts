import type { AuthPrincipal } from "../auth/authPrincipal";

export const CANONICAL_DOMAINS = [
  "DEAL",
  "DEAL_SNAPSHOT",
  "DEAL_ANALYSIS",
  "SEARCH_RULE",
  "AUCTION_EVENT",
  "AUCTION_LOT",
  "BID_PLAN",
  "RESTOCK_STORE_PROFILE",
  "RESTOCK_EVENT",
  "RESTOCK_PREDICTION",
  "STORE_VISIT",
  "PRODUCT_OBSERVATION",
  "PURCHASE",
  "PURCHASE_LOT",
  "COST_ALLOCATION",
  "OWNED_ITEM",
  "INVENTORY_ADJUSTMENT",
  "STORAGE_LOCATION",
  "SALE",
  "SALE_LINE_ITEM",
  "SHIPMENT",
  "RETURN",
  "EXPENSE",
  "MILEAGE_TRIP",
  "RECEIPT_METADATA",
  "OWNER_PREFERENCE",
  "FEATURE_SETTING",
  "FILE_ASSET",
] as const;

export type CanonicalDomain = (typeof CANONICAL_DOMAINS)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type OwnerContext = Readonly<{
  ownerSubject: string;
  principal: AuthPrincipal;
}>;

export type FileAssetMetadata = Readonly<{
  storageProvider: string;
  storagePath: string;
  mimeType: string;
  size: number;
  sha256: string;
  relatedRecordType: CanonicalDomain | null;
  relatedRecordId: string | null;
  originalName: string | null;
}>;

export type CanonicalRecord = Readonly<{
  id: string;
  domain: CanonicalDomain;
  status: string;
  source: string;
  externalProvider: string | null;
  externalId: string | null;
  sourceUrl: string | null;
  notes: string | null;
  metadata: JsonObject;
  amountMinor: number | null;
  currency: string | null;
  rateBasisPoints: number | null;
  quantity: number | null;
  certificationNumber: string | null;
  occurredAt: string | null;
  relations: Readonly<Record<string, string>>;
  fileAsset: FileAssetMetadata | null;
  createdAt: string;
  updatedAt: string;
  recordVersion: number;
  archivedAt: string | null;
}>;

export type CanonicalRecordInput = {
  id?: string;
  status?: string;
  source?: string;
  externalProvider?: string | null;
  externalId?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
  metadata?: JsonObject;
  amountMinor?: number | null;
  currency?: string | null;
  rateBasisPoints?: number | null;
  quantity?: number | null;
  certificationNumber?: string | null;
  occurredAt?: string | null;
  relations?: Record<string, string | null>;
  fileAsset?: FileAssetMetadata;
};

export type CanonicalRecordUpdate = Omit<CanonicalRecordInput, "id"> & {
  expectedVersion: number;
};

export type CanonicalListQuery = Readonly<{
  limit: number;
  cursor?: string;
  status?: string;
  includeArchived?: boolean;
}>;

export type CanonicalPage = Readonly<{
  records: CanonicalRecord[];
  nextCursor: string | null;
}>;

export type RelationRule = Readonly<{
  targetDomain: CanonicalDomain;
  required?: boolean;
}>;

export type DomainDefinition = Readonly<{
  domain: CanonicalDomain;
  defaultStatus: string;
  statuses: ReadonlySet<string>;
  relations: Readonly<Record<string, RelationRule>>;
  immutable?: boolean;
  allowNegativeAmountMinor?: boolean;
  allowNegativeQuantity?: boolean;
}>;

export type CanonicalConflict = Readonly<{
  recordId: string;
  currentVersion: number;
  updatedAt: string;
  conflictType: "STALE_RECORD_VERSION";
}>;

export function ownerContextFromPrincipal(principal: AuthPrincipal): OwnerContext {
  return Object.freeze({
    ownerSubject: `${principal.provider}:${principal.subject}`,
    principal,
  });
}
