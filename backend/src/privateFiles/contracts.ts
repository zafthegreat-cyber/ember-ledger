import type { CanonicalDomain, OwnerContext } from "../code3/types";

export const PRIVATE_FILE_LIMITS = Object.freeze({ fileBytes: 8 * 1024 * 1024, ownerBytes: 32 * 1024 * 1024, files: 128 });
export const PRIVATE_FILE_FORMAT = "code3-private-files-v1";
export type PrivateFile = {
  id: string;
  originalName: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "application/pdf";
  size: number;
  sha256: string;
  relatedRecordType: CanonicalDomain;
  relatedRecordId: string;
  createdAt: string;
  retainUntil: string;
  deletedAt: string | null;
};
export type StoredPrivateFile = PrivateFile & { bytesBase64: string | null };
export type FileReceipt = { operationId: string; action: "UPLOAD" | "DELETE" | "RESTORE"; fileIds: string[]; at: string; digest: string };
export type PrivateFileState = { format: typeof PRIVATE_FILE_FORMAT; ownerHash: string; revision: number; files: StoredPrivateFile[]; receipts: FileReceipt[] };
export type FileBackup = { format: typeof PRIVATE_FILE_FORMAT; files: StoredPrivateFile[]; exportedAt: string; omittedDeletedCount: number; sha256: string };
export interface PrivateFileStore {
  read(owner: OwnerContext): Promise<PrivateFileState>;
  transaction<T>(owner: OwnerContext, operation: (state: PrivateFileState) => Promise<T>): Promise<T>;
}

export class PrivateFileError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
    this.name = "PrivateFileError";
  }
}

export const fileError = (code: string, status: number, message: string) => new PrivateFileError(code, status, message);
