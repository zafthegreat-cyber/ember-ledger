import { createHash, randomUUID } from "node:crypto";
import { mkdir, lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type { OwnerContext } from "../code3/types";

export const SECURITY_LEDGER_FORMAT = "code3-owner-security-v1";
export const securityDigest = (value: string) => createHash("sha256").update(value).digest("hex");
export type GrantPurpose = "ACCOUNT_OPS_RESTORE" | "PRIVATE_FILE_RESTORE" | "SESSION_REVOKE";
export const GRANT_PURPOSES: GrantPurpose[] = ["ACCOUNT_OPS_RESTORE", "PRIVATE_FILE_RESTORE", "SESSION_REVOKE"];
export type OwnerDeviceSession = { id: string; sessionHash: string; label: string; firstSeenAt: string; lastSeenAt: string; expiresAt: string; revokedAt: string | null };
export type OwnerGrant = { tokenHash: string; verificationHash: string; sessionHash: string; planDigest: string; purpose: GrantPurpose; expiresAt: string; usedAt: string | null };
export type SecurityAuditAction = "SESSION_REGISTERED" | "SESSION_REVOKED" | "GRANT_ISSUED" | "GRANT_CONSUMED" | "RECOVERY_COMPLETED" | "RECOVERY_FAILED";
export type SecurityAuditEvent = { id: string; sequence: number; action: SecurityAuditAction; at: string; sessionId: string | null; planDigest: string | null; count: number | null; previousHash: string | null; sha256: string };
export type OwnerSecurityState = { format: typeof SECURITY_LEDGER_FORMAT; ownerHash: string; revision: number; sessions: OwnerDeviceSession[]; grants: OwnerGrant[]; audit: SecurityAuditEvent[] };
export interface OwnerSecurityStore {
  read(owner: OwnerContext): Promise<OwnerSecurityState>;
  transaction<T>(owner: OwnerContext, operation: (state: OwnerSecurityState) => Promise<T>): Promise<T>;
}
export class OwnerSessionError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); this.name = "OwnerSessionError"; }
}
export const sessionError = (code: string, status: number, message: string) => new OwnerSessionError(code, status, message);
const errorCode = (error: unknown) => error && typeof error === "object" && "code" in error ? error.code : "";
const validDate = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));
const validHash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const validId = (value: unknown) => typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
function exactFields(value: unknown, fields: string[]): boolean {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => fields.includes(key)) && fields.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function validateOwnerSecurityState(raw: unknown, ownerHash: string): OwnerSecurityState {
  const state = raw as OwnerSecurityState;
  if (!exactFields(state, ["format", "ownerHash", "revision", "sessions", "grants", "audit"]) || state.format !== SECURITY_LEDGER_FORMAT || state.ownerHash !== ownerHash
    || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.sessions) || state.sessions.length > 128
    || !Array.isArray(state.grants) || state.grants.length > 256 || !Array.isArray(state.audit) || state.audit.length > 4096) throw new Error("Invalid ledger envelope");
  for (const session of state.sessions) {
    if (!exactFields(session, ["id", "sessionHash", "label", "firstSeenAt", "lastSeenAt", "expiresAt", "revokedAt"]) || !validId(session.id) || !validHash(session.sessionHash)
      || typeof session.label !== "string" || !session.label.trim() || session.label.length > 80 || /[\x00-\x1f\x7f]/.test(session.label)
      || ![session.firstSeenAt, session.lastSeenAt, session.expiresAt].every(validDate) || (session.revokedAt !== null && !validDate(session.revokedAt))) throw new Error("Invalid session");
  }
  if (new Set(state.sessions.map((session) => session.sessionHash)).size !== state.sessions.length || new Set(state.sessions.map((session) => session.id)).size !== state.sessions.length) throw new Error("Duplicate session");
  for (const grant of state.grants) {
    if (!exactFields(grant, ["tokenHash", "verificationHash", "sessionHash", "planDigest", "purpose", "expiresAt", "usedAt"]) || ![grant.tokenHash, grant.verificationHash, grant.sessionHash, grant.planDigest].every(validHash)
      || !GRANT_PURPOSES.includes(grant.purpose) || !validDate(grant.expiresAt) || (grant.usedAt !== null && !validDate(grant.usedAt))) throw new Error("Invalid grant");
  }
  if (new Set(state.grants.map((grant) => grant.tokenHash)).size !== state.grants.length || new Set(state.grants.map((grant) => grant.verificationHash)).size !== state.grants.length) throw new Error("Duplicate grant");
  let previousHash: string | null = null;
  for (const [index, event] of state.audit.entries()) {
    const { sha256, ...body } = event;
    if (!exactFields(event, ["id", "sequence", "action", "at", "sessionId", "planDigest", "count", "previousHash", "sha256"]) || !validId(event.id)
      || event.sequence !== index + 1 || !["SESSION_REGISTERED", "SESSION_REVOKED", "GRANT_ISSUED", "GRANT_CONSUMED", "RECOVERY_COMPLETED", "RECOVERY_FAILED"].includes(event.action)
      || !validDate(event.at) || (event.sessionId !== null && !validId(event.sessionId)) || (event.planDigest !== null && !validHash(event.planDigest))
      || (event.count !== null && (!Number.isSafeInteger(event.count) || event.count < 0 || event.count > 1000000))
      || event.previousHash !== previousHash || sha256 !== securityDigest(JSON.stringify(body))) throw new Error("Invalid audit chain");
    previousHash = sha256;
  }
  return state;
}

/** Explicit private local adapter, not a substitute for a managed hosted store. Atomic owner ledger
 * commits include session revocations, one-use grants and audit together. Crash locks fail closed.
 */
export class FilesystemOwnerSecurityStore implements OwnerSecurityStore {
  private readonly root: string;
  constructor(root: string) { if (!isAbsolute(root)) throw new Error("An absolute private security directory is required."); this.root = resolve(root); }
  private async directory(owner: OwnerContext) {
    if (!owner?.principal || owner.ownerSubject !== `${owner.principal.provider}:${owner.principal.subject}`) throw sessionError("owner_required", 401, "A current owner session is required.");
    const ownerHash = securityDigest(owner.ownerSubject);
    const directory = join(this.root, ownerHash);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const rootInfo = await lstat(this.root);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw sessionError("session_store_unavailable", 503, "Owner security storage is unavailable.");
    await mkdir(directory, { mode: 0o700 }).catch((error) => { if (errorCode(error) !== "EEXIST") throw error; });
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw sessionError("session_store_unavailable", 503, "Owner security storage is unavailable.");
    return { ownerHash, directory };
  }
  private async load(directory: string, ownerHash: string): Promise<OwnerSecurityState> {
    try {
      const path = join(directory, "security.json");
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) throw new Error("Invalid ledger");
      return validateOwnerSecurityState(JSON.parse(await readFile(path, "utf8")), ownerHash);
    } catch (error) {
      if (errorCode(error) === "ENOENT") return { format: SECURITY_LEDGER_FORMAT, ownerHash, revision: 0, sessions: [], grants: [], audit: [] };
      throw sessionError("session_store_unreadable", 503, "Owner security records are unreadable. Access remains blocked until they are reviewed.");
    }
  }
  private async operation<T>(owner: OwnerContext, mutate: boolean, operation: (state: OwnerSecurityState) => Promise<T>): Promise<T> {
    const { ownerHash, directory } = await this.directory(owner);
    const lockPath = join(directory, "operation.lock");
    const lock = await open(lockPath, "wx", 0o600).catch(() => { throw sessionError("session_operation_pending", 503, "An owner security operation is pending. Retry after it finishes."); });
    try {
      const state = await this.load(directory, ownerHash);
      const result = await operation(state);
      if (mutate) {
        state.revision++;
        validateOwnerSecurityState(state, ownerHash);
        const payload = JSON.stringify(state);
        if (Buffer.byteLength(payload) > 4 * 1024 * 1024) throw sessionError("session_store_full", 503, "Owner security records require archival review before continuing.");
        const path = join(directory, `${randomUUID()}.pending`);
        const handle = await open(path, "wx", 0o600);
        try { await handle.writeFile(payload, "utf8"); await handle.sync(); await handle.close(); await rename(path, join(directory, "security.json")); }
        finally { await handle.close().catch(() => undefined); await unlink(path).catch((error) => { if (errorCode(error) !== "ENOENT") throw error; }); }
        if (JSON.stringify(await this.load(directory, ownerHash)) !== payload) throw sessionError("session_commit_unverified", 503, "The owner security operation could not be verified.");
      }
      return result;
    } finally { await lock.close(); await unlink(lockPath); }
  }
  read(owner: OwnerContext) { return this.operation(owner, false, async (state) => state); }
  transaction<T>(owner: OwnerContext, operation: (state: OwnerSecurityState) => Promise<T>) { return this.operation(owner, true, operation); }
}
