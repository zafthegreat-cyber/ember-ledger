import { randomUUID } from "node:crypto";
import type { CanonicalRepository } from "../code3/repository";
import type { OwnerContext } from "../code3/types";
import { PRIVATE_FILE_FORMAT, PRIVATE_FILE_LIMITS, fileError, type FileBackup, type PrivateFile, type PrivateFileState, type PrivateFileStore, type StoredPrivateFile } from "./contracts";
import { digest, originalName, publicFile, recordReference, validId, validateBytes, validateStoredFile, verifiedBytes } from "./validation";

type RestoreSummary = { planId: string; sha256: string; fileCount: number; totalBytes: number; expiresAt: string; retainUntil: string };
type RestorePlan = RestoreSummary & { ownerHash: string; revision: number; files: StoredPrivateFile[]; minimumRetainUntil: string };
type FileServiceOptions = {
  store: PrivateFileStore;
  records: Pick<CanonicalRepository, "getById">;
  now?: () => Date;
  retentionDays?: number;
  // Must perform fresh, operation-bound owner verification. A current JWT alone is insufficient.
  authorizeRestore?: (owner: OwnerContext, plan: RestoreSummary, proof: unknown) => Promise<boolean>;
};

export class PrivateFileService {
  private readonly now: () => Date;
  private readonly retentionDays: number;
  private readonly plans = new Map<string, RestorePlan>();
  constructor(private readonly options: FileServiceOptions) {
    this.now = options.now || (() => new Date());
    this.retentionDays = options.retentionDays ?? 7;
    if (!Number.isInteger(this.retentionDays) || this.retentionDays < 0 || this.retentionDays > 3650) throw new Error("Invalid file retention policy");
  }

  private owner(owner: OwnerContext) {
    if (!owner?.principal || owner.ownerSubject !== `${owner.principal.provider}:${owner.principal.subject}`
      || !owner.principal.subject || !Number.isFinite(owner.principal.expiresAt) || owner.principal.expiresAt * 1000 <= this.now().getTime()) {
      throw fileError("owner_required", 401, "A current owner session is required.");
    }
  }

  private async linked(owner: OwnerContext, file: Pick<PrivateFile, "relatedRecordType" | "relatedRecordId">, active = false) {
    this.owner(owner);
    const record = await this.options.records.getById(owner, file.relatedRecordType, file.relatedRecordId);
    if (!record || (active && record.archivedAt)) throw fileError("file_record_unavailable", 404, "The linked record is unavailable to this owner.");
    this.owner(owner);
  }

  private receipt(state: PrivateFileState, action: "UPLOAD" | "DELETE" | "RESTORE", fileIds: string[], sha256: string) {
    state.receipts.push({ operationId: randomUUID(), action, fileIds, at: this.now().toISOString(), digest: sha256 });
  }

  private capacity(state: PrivateFileState, bytes: number, count: number) {
    if (state.files.length + count > PRIVATE_FILE_LIMITS.files
      || state.files.filter((file) => !file.deletedAt).reduce((total, file) => total + file.size, 0) + bytes > PRIVATE_FILE_LIMITS.ownerBytes) {
      throw fileError("file_storage_limit", 409, "This private file store is full. Export and review attachments before continuing.");
    }
  }

  async upload(owner: OwnerContext, input: { name: unknown; mimeType: unknown; domain: unknown; recordId: unknown; bytes: Buffer }) {
    this.owner(owner);
    const reference = recordReference(input.domain, input.recordId);
    const name = originalName(input.name);
    const mimeType = validateBytes(input.bytes, input.mimeType);
    const bytes = Buffer.from(input.bytes); // Caller mutation cannot change bytes during authorization.
    await this.linked(owner, reference, true);
    return this.options.store.transaction(owner, async (state) => {
      this.capacity(state, bytes.length, 1);
      await this.linked(owner, reference, true);
      const createdAt = this.now();
      const file: StoredPrivateFile = { id: randomUUID(), originalName: name, mimeType, size: bytes.length, sha256: digest(bytes),
        ...reference, createdAt: createdAt.toISOString(), retainUntil: new Date(createdAt.getTime() + this.retentionDays * 86400000).toISOString(),
        deletedAt: null, bytesBase64: bytes.toString("base64") };
      state.files.push(file);
      this.receipt(state, "UPLOAD", [file.id], file.sha256);
      return publicFile(file);
    });
  }

  async list(owner: OwnerContext, domain: unknown, recordId: unknown) {
    const reference = recordReference(domain, recordId);
    await this.linked(owner, reference);
    const state = await this.options.store.read(owner);
    await this.linked(owner, reference);
    return state.files.filter((file) => file.relatedRecordType === domain && file.relatedRecordId === recordId && !file.deletedAt).map((file) => {
      try { verifiedBytes(file); return { ...publicFile(file), availability: "VERIFIED" as const, issue: null }; }
      catch { return { ...publicFile(file), availability: "UNAVAILABLE" as const, issue: "This attachment is missing or failed its integrity check. Include it in recovery review." }; }
    });
  }

  async read(owner: OwnerContext, id: unknown) {
    this.owner(owner);
    if (!validId(id)) throw fileError("file_not_found", 404, "Attachment not found.");
    const state = await this.options.store.read(owner);
    const file = state.files.find((candidate) => candidate.id === id && !candidate.deletedAt);
    if (!file) throw fileError("file_not_found", 404, "Attachment not found.");
    await this.linked(owner, file);
    return { file: publicFile(file), bytes: verifiedBytes(file) };
  }

  async remove(owner: OwnerContext, id: unknown, expectedSha256: unknown) {
    this.owner(owner);
    if (!validId(id)) throw fileError("file_not_found", 404, "Attachment not found.");
    return this.options.store.transaction(owner, async (state) => {
      const file = state.files.find((candidate) => candidate.id === id && !candidate.deletedAt);
      if (!file) throw fileError("file_not_found", 404, "Attachment not found.");
      await this.linked(owner, file);
      if (expectedSha256 !== file.sha256) throw fileError("file_changed", 409, "The attachment changed. Reload before deleting.");
      if (Date.parse(file.retainUntil) > this.now().getTime()) throw fileError("file_retention_active", 409, "This attachment is still within its retention period.");
      file.deletedAt = this.now().toISOString();
      file.bytesBase64 = null;
      this.receipt(state, "DELETE", [file.id], file.sha256);
      return { id: file.id, deletedAt: file.deletedAt };
    });
  }

  async export(owner: OwnerContext): Promise<FileBackup> {
    this.owner(owner);
    const state = await this.options.store.read(owner);
    const files = state.files.filter((file) => !file.deletedAt);
    for (const file of files) { await this.linked(owner, file); verifiedBytes(file); }
    const payload = { format: PRIVATE_FILE_FORMAT as typeof PRIVATE_FILE_FORMAT, files, exportedAt: this.now().toISOString(), omittedDeletedCount: state.files.length - files.length };
    return { ...payload, sha256: digest(JSON.stringify(payload)) };
  }

  private decodeBackup(raw: unknown): StoredPrivateFile[] {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some((key) => !["format", "files", "exportedAt", "omittedDeletedCount", "sha256"].includes(key))) throw fileError("file_backup_invalid", 400, "Choose a complete private-file backup.");
    const backup = raw as FileBackup;
    if (backup.format !== PRIVATE_FILE_FORMAT || !Array.isArray(backup.files) || backup.files.length > PRIVATE_FILE_LIMITS.files
      || typeof backup.exportedAt !== "string" || !Number.isFinite(Date.parse(backup.exportedAt))
      || !Number.isSafeInteger(backup.omittedDeletedCount) || backup.omittedDeletedCount < 0) throw fileError("file_backup_invalid", 400, "The private-file backup format is invalid.");
    const payload = { format: backup.format, files: backup.files, exportedAt: backup.exportedAt, omittedDeletedCount: backup.omittedDeletedCount };
    if (digest(JSON.stringify(payload)) !== backup.sha256) throw fileError("file_backup_integrity_failed", 400, "The private-file backup failed its integrity check.");
    const files = backup.files.map(validateStoredFile);
    if (new Set(files.map((file) => file.id)).size !== files.length || files.some((file) => file.deletedAt)
      || files.reduce((total, file) => total + file.size, 0) > PRIVATE_FILE_LIMITS.ownerBytes) throw fileError("file_backup_invalid", 400, "The private-file backup contains duplicate, deleted or oversized records.");
    for (const file of files) verifiedBytes(file);
    return files;
  }

  async previewRestore(owner: OwnerContext, backup: unknown): Promise<RestoreSummary> {
    this.owner(owner);
    if (!this.options.authorizeRestore) throw fileError("file_restore_unavailable", 503, "Fresh owner verification is not configured for file recovery.");
    const files = this.decodeBackup(backup);
    if (!files.length) throw fileError("file_backup_empty", 400, "This backup contains no attachments to recover.");
    for (const file of files) await this.linked(owner, file);
    const state = await this.options.store.read(owner);
    if (state.files.length) throw fileError("file_restore_destination_not_empty", 409, "File recovery requires an empty destination. Existing attachments have not been changed.");
    const ownerHash = digest(owner.ownerSubject);
    for (const [id, plan] of this.plans) if (Date.parse(plan.expiresAt) <= this.now().getTime() || plan.ownerHash === ownerHash) this.plans.delete(id);
    if (this.plans.size >= 4) throw fileError("file_restore_busy", 409, "Other recovery previews are open. Try again shortly.");
    const minimumRetainUntil = new Date(this.now().getTime() + this.retentionDays * 86400000).toISOString();
    const retainUntil = new Date(Math.max(Date.parse(minimumRetainUntil), ...files.map((file) => Date.parse(file.retainUntil)))).toISOString();
    const plan: RestorePlan = { planId: randomUUID(), sha256: digest(JSON.stringify({ files, revision: state.revision, ownerHash, minimumRetainUntil })),
      fileCount: files.length, totalBytes: files.reduce((total, file) => total + file.size, 0), expiresAt: new Date(this.now().getTime() + 300000).toISOString(),
      retainUntil, minimumRetainUntil, ownerHash, revision: state.revision, files };
    this.plans.set(plan.planId, plan);
    return this.summary(plan);
  }

  private summary(plan: RestorePlan): RestoreSummary {
    const { planId, sha256, fileCount, totalBytes, expiresAt, retainUntil } = plan;
    return { planId, sha256, fileCount, totalBytes, expiresAt, retainUntil };
  }

  async applyRestore(owner: OwnerContext, planId: unknown, expectedSha256: unknown, proof: unknown) {
    this.owner(owner);
    const plan = typeof planId === "string" ? this.plans.get(planId) : undefined;
    if (!plan || plan.ownerHash !== digest(owner.ownerSubject) || plan.sha256 !== expectedSha256 || Date.parse(plan.expiresAt) <= this.now().getTime()) {
      throw fileError("file_restore_plan_invalid", 409, "The recovery preview expired or changed. Preview the backup again.");
    }
    return this.options.store.transaction(owner, async (state) => {
      if (state.files.length || state.revision !== plan.revision) throw fileError("file_restore_destination_changed", 409, "The recovery destination changed. Existing files have not been replaced.");
      for (const file of plan.files) { await this.linked(owner, file); verifiedBytes(file); }
      if (!await this.options.authorizeRestore?.(owner, this.summary(plan), proof)) throw fileError("file_restore_reauthentication_required", 403, "Complete fresh owner verification for this recovery preview.");
      this.owner(owner);
      if (Date.parse(plan.expiresAt) <= this.now().getTime()) throw fileError("file_restore_plan_invalid", 409, "The recovery preview expired. Preview the backup again.");
      state.files = plan.files.map((file) => ({ ...file, retainUntil: Date.parse(file.retainUntil) < Date.parse(plan.minimumRetainUntil) ? plan.minimumRetainUntil : file.retainUntil }));
      this.receipt(state, "RESTORE", state.files.map((file) => file.id), plan.sha256);
      this.plans.delete(plan.planId);
      return { restoredCount: state.files.length, totalBytes: plan.totalBytes, sha256: plan.sha256 };
    });
  }
}
