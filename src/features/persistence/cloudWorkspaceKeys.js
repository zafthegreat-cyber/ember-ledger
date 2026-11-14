// Lightweight cloud-workspace constants (audit 2026-11-14).
//
// The owner-binding checks that run at startup only need the list of synced
// storage keys and the error helper. They live here so the first page does not
// load cloudWorkspaceSources.js (which pulls in backup validation and the
// inventory cost rules). cloudWorkspaceSources.js re-exports all of these.
import { BACKUP_SOURCE_REGISTRY, BACKUP_STORAGE_TYPES } from "../backup/backupSourceRegistry.js";

export const WORKSPACE_SYNC_SOURCES = Object.freeze(BACKUP_SOURCE_REGISTRY.filter((source) =>
  source.storageType === BACKUP_STORAGE_TYPES.LOCAL_STORAGE && source.includedInPhase1AExport));
export const WORKSPACE_SYNC_KEYS = Object.freeze(WORKSPACE_SYNC_SOURCES.flatMap((source) => source.storageKeys || [source.storageKey]));

export class WorkspaceSyncError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "WorkspaceSyncError";
    this.code = code;
    this.details = details;
  }
}

export function workspaceFail(code, message, details) { throw new WorkspaceSyncError(code, message, details); }
