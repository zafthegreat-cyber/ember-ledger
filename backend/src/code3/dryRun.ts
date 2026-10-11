import {
  CANONICAL_DOMAINS,
  type CanonicalDomain,
  type CanonicalRecord,
  type CanonicalRecordInput,
  type CanonicalRecordUpdate,
  type FileAssetMetadata,
  type OwnerContext,
} from "./types";
import { domainDefinition } from "./domainDefinitions";
import type { CanonicalRepository } from "./repository";
import { Code3ValidationError, validateCreateInput, validateUpdateInput, validateUuid } from "./validation";

export const DRY_RUN_FORMAT_VERSION = 1;
export const MAX_DRY_RUN_ACTIONS = 1_000;

type DryRunActionType = "INSERT" | "UPDATE" | "SKIP" | "REQUIRES_DECISION";

type DryRunAction = Readonly<{
  action: DryRunActionType;
  domain: CanonicalDomain;
  recordId?: string;
  input?: unknown;
}>;

type DryRunActionResult = Readonly<{
  index: number;
  action: DryRunActionType;
  domain: CanonicalDomain;
  recordId?: string;
  valid: boolean;
  outcome: "VALIDATED" | "WOULD_CONFLICT" | "WOULD_SKIP" | "REQUIRES_DECISION" | "INVALID";
  issues: ReadonlyArray<{ code: string; message: string }>;
}>;

type PlannedIdentity = Readonly<{
  index: number;
  action: "INSERT" | "UPDATE";
  domain: CanonicalDomain;
  recordId: string;
  externalProvider: string | null;
  externalId: string | null;
  certificationNumber: string | null;
  fileStorageProvider: string | null;
  fileStoragePath: string | null;
}>;

type DryRunPlanIndex = Readonly<{
  conflictsByIndex: ReadonlyMap<number, ReadonlyArray<{ code: string; message: string }>>;
  hasPlannedInsert(domain: CanonicalDomain, id: string): boolean;
}>;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Code3ValidationError({ path: "body", code: "invalid_type", message: "The dry-run body must be an object." });
  }
  return value as Record<string, unknown>;
}

function domain(value: unknown): CanonicalDomain {
  if (typeof value !== "string" || !(CANONICAL_DOMAINS as readonly string[]).includes(value)) {
    throw new Code3ValidationError({ path: "domain", code: "invalid_domain", message: "The canonical domain is not supported." });
  }
  return value as CanonicalDomain;
}

function actionType(value: unknown): DryRunActionType {
  if (value === "DELETE") {
    throw new Code3ValidationError({ path: "action", code: "delete_prohibited", message: "Migration dry runs never accept or propose DELETE actions." });
  }
  if (value !== "INSERT" && value !== "UPDATE" && value !== "SKIP" && value !== "REQUIRES_DECISION") {
    throw new Code3ValidationError({ path: "action", code: "invalid_action", message: "The migration action is not supported." });
  }
  return value;
}

function validateBody(raw: unknown): { sourceBackupHash: string; actions: DryRunAction[] } {
  const body = object(raw);
  const unknown = Object.keys(body).filter((key) => !["formatVersion", "sourceBackupHash", "actions"].includes(key));
  if (unknown.some((key) => key.toLowerCase().replace(/_/g, "") === "ownersubject")) {
    throw new Code3ValidationError({ path: "ownerSubject", code: "owner_scope_forbidden", message: "Owner scope is derived from the authenticated server principal." });
  }
  if (unknown.length) throw new Code3ValidationError(unknown.map((key) => ({ path: key, code: "unknown_field", message: `Unknown field: ${key}.` })));
  if (body.formatVersion !== DRY_RUN_FORMAT_VERSION) throw new Code3ValidationError({ path: "formatVersion", code: "unsupported_version", message: "The dry-run format version is unsupported." });
  if (typeof body.sourceBackupHash !== "string" || !/^[0-9a-f]{64}$/i.test(body.sourceBackupHash)) {
    throw new Code3ValidationError({ path: "sourceBackupHash", code: "invalid_hash", message: "sourceBackupHash must be a SHA-256 hex digest." });
  }
  if (!Array.isArray(body.actions) || body.actions.length > MAX_DRY_RUN_ACTIONS) {
    throw new Code3ValidationError({ path: "actions", code: "invalid_action_count", message: `actions must contain at most ${MAX_DRY_RUN_ACTIONS} entries.` });
  }
  const actions = body.actions.map((rawAction, index) => {
    const value = object(rawAction);
    const actionUnknown = Object.keys(value).filter((key) => !["action", "domain", "recordId", "input"].includes(key));
    if (actionUnknown.length) throw new Code3ValidationError(actionUnknown.map((key) => ({ path: `actions[${index}].${key}`, code: "unknown_field", message: `Unknown action field: ${key}.` })));
    return {
      action: actionType(value.action),
      domain: domain(value.domain),
      ...(value.recordId === undefined ? {} : { recordId: validateUuid(value.recordId, `actions[${index}].recordId`) }),
      ...(value.input === undefined ? {} : { input: value.input }),
    };
  });
  return { sourceBackupHash: body.sourceBackupHash.toLowerCase(), actions };
}

function validationIssue(path: string, code: string, message: string): Code3ValidationError {
  return new Code3ValidationError({ path, code, message });
}

async function assertRelationsAreApplicable(
  repository: CanonicalRepository,
  owner: OwnerContext,
  recordDomain: CanonicalDomain,
  relations: Record<string, string | null> | undefined,
  recordId?: string,
  planIndex?: DryRunPlanIndex,
): Promise<void> {
  const rules = domainDefinition(recordDomain).relations;
  const supplied = relations || {};
  for (const [relationName, rule] of Object.entries(rules)) {
    const targetId = supplied[relationName];
    if (!targetId) {
      if (rule.required) throw validationIssue(`relations.${relationName}`, "required", `${relationName} is required.`);
      continue;
    }
    if (recordId && targetId === recordId && recordDomain === rule.targetDomain) {
      throw validationIssue(`relations.${relationName}`, "self_reference", `${relationName} cannot reference the same record.`);
    }
    const target = planIndex?.hasPlannedInsert(rule.targetDomain, targetId)
      ? true
      : await repository.getById(owner, rule.targetDomain, targetId);
    if (!target) {
      throw validationIssue(
        `relations.${relationName}`,
        "invalid_foreign_reference",
        `${relationName} does not reference an owner-accessible ${rule.targetDomain} record.`,
      );
    }
  }
}

async function assertFileAssetReferenceIsApplicable(
  repository: CanonicalRepository,
  owner: OwnerContext,
  fileAsset: FileAssetMetadata | undefined | null,
  planIndex: DryRunPlanIndex,
  recordId?: string,
): Promise<void> {
  if (!fileAsset?.relatedRecordType || !fileAsset.relatedRecordId) return;
  if (recordId && fileAsset.relatedRecordType === "FILE_ASSET" && fileAsset.relatedRecordId === recordId) {
    throw validationIssue("fileAsset.relatedRecordId", "self_reference", "A FileAsset cannot reference itself.");
  }
  if (planIndex.hasPlannedInsert(fileAsset.relatedRecordType, fileAsset.relatedRecordId)) return;
  const target = await repository.getById(owner, fileAsset.relatedRecordType, fileAsset.relatedRecordId);
  if (!target) {
    throw validationIssue(
      "fileAsset.relatedRecordId",
      "invalid_foreign_reference",
      "relatedRecordId does not reference an owner-accessible canonical record of relatedRecordType.",
    );
  }
}

function finalIdentity(
  index: number,
  action: DryRunAction,
  input: CanonicalRecordInput | CanonicalRecordUpdate,
  recordId: string,
  existing?: CanonicalRecord | null,
): PlannedIdentity {
  const supplied = (key: keyof CanonicalRecordUpdate) => Object.prototype.hasOwnProperty.call(input, key);
  const fileAsset = supplied("fileAsset") ? input.fileAsset || null : existing?.fileAsset || null;
  return {
    index,
    action: action.action as "INSERT" | "UPDATE",
    domain: action.domain,
    recordId,
    externalProvider: supplied("externalProvider") ? input.externalProvider || null : existing?.externalProvider || null,
    externalId: supplied("externalId") ? input.externalId || null : existing?.externalId || null,
    certificationNumber: action.domain === "OWNED_ITEM"
      ? (supplied("certificationNumber") ? input.certificationNumber || null : existing?.certificationNumber || null)
      : null,
    fileStorageProvider: action.domain === "FILE_ASSET" ? fileAsset?.storageProvider || null : null,
    fileStoragePath: action.domain === "FILE_ASSET" ? fileAsset?.storagePath || null : null,
  };
}

function addPlanConflict(
  target: Map<number, Array<{ code: string; message: string }>>,
  identity: PlannedIdentity,
  code: string,
  message: string,
): void {
  const issues = target.get(identity.index) || [];
  issues.push({ code, message });
  target.set(identity.index, issues);
}

async function buildPlanIndex(
  repository: CanonicalRepository,
  owner: OwnerContext,
  actions: DryRunAction[],
): Promise<DryRunPlanIndex> {
  const identities: PlannedIdentity[] = [];
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    try {
      if (action.action === "INSERT") {
        const input = validateCreateInput(action.domain, action.input);
        if (input.id && (!action.recordId || action.recordId === input.id)) {
          identities.push(finalIdentity(index, action, input, input.id));
        }
      } else if (action.action === "UPDATE" && action.recordId) {
        const input = validateUpdateInput(action.domain, action.input);
        const existing = await repository.getById(owner, action.domain, action.recordId);
        if (existing) identities.push(finalIdentity(index, action, input, action.recordId, existing));
      }
    } catch {
      // The main pass reports input validation errors with their original paths.
    }
  }

  const conflictsByIndex = new Map<number, Array<{ code: string; message: string }>>();
  const ids = new Map<string, PlannedIdentity[]>();
  const external = new Map<string, PlannedIdentity[]>();
  const certifications = new Map<string, PlannedIdentity[]>();
  const fileStoragePaths = new Map<string, PlannedIdentity[]>();
  for (const identity of identities) {
    const idKey = identity.recordId.toLowerCase();
    ids.set(idKey, [...(ids.get(idKey) || []), identity]);
    if (identity.externalProvider && identity.externalId) {
      const key = `${identity.domain}\u0000${identity.externalProvider.toLowerCase()}\u0000${identity.externalId}`;
      external.set(key, [...(external.get(key) || []), identity]);
    }
    if (identity.certificationNumber) {
      const key = identity.certificationNumber.toUpperCase();
      certifications.set(key, [...(certifications.get(key) || []), identity]);
    }
    if (identity.fileStorageProvider && identity.fileStoragePath) {
      const key = `${identity.fileStorageProvider}\u0000${identity.fileStoragePath}`;
      fileStoragePaths.set(key, [...(fileStoragePaths.get(key) || []), identity]);
    }
  }
  for (const group of ids.values()) {
    if (group.length < 2) continue;
    for (const identity of group) addPlanConflict(conflictsByIndex, identity, "duplicate_id_in_plan", "The stable ID appears more than once in this migration plan.");
  }
  for (const group of external.values()) {
    if (group.length < 2) continue;
    for (const identity of group) addPlanConflict(conflictsByIndex, identity, "duplicate_external_identity_in_plan", "The provider and external ID appear more than once in this migration plan.");
  }
  for (const group of certifications.values()) {
    if (group.length < 2) continue;
    for (const identity of group) addPlanConflict(conflictsByIndex, identity, "duplicate_certification_number_in_plan", "The certification number appears more than once in this migration plan.");
  }
  for (const group of fileStoragePaths.values()) {
    if (group.length < 2) continue;
    for (const identity of group) addPlanConflict(conflictsByIndex, identity, "duplicate_file_storage_path_in_plan", "The file storage provider and path appear more than once in this migration plan.");
  }

  const inserts = new Set(
    identities
      .filter((identity) => identity.action === "INSERT" && !conflictsByIndex.has(identity.index))
      .map((identity) => `${identity.domain}\u0000${identity.recordId.toLowerCase()}`),
  );
  return {
    conflictsByIndex,
    hasPlannedInsert: (targetDomain, id) => inserts.has(`${targetDomain}\u0000${id.toLowerCase()}`),
  };
}

function assertCompleteMoney(amountMinor: number | null | undefined, currency: string | null | undefined): void {
  if ((amountMinor == null) !== (currency == null)) {
    throw validationIssue("amountMinor", "incomplete_money", "amountMinor and currency must both be present or both be null.");
  }
}

async function findDuplicateIdentity(
  repository: CanonicalRepository,
  owner: OwnerContext,
  recordDomain: CanonicalDomain,
  input: {
    externalProvider?: string | null;
    externalId?: string | null;
    certificationNumber?: string | null;
    fileAsset?: FileAssetMetadata | null;
  },
  currentId?: string,
): Promise<{ code: string; message: string } | null> {
  if (input.externalProvider && input.externalId) {
    const duplicate = await repository.findByExternalIdentity(owner, recordDomain, input.externalProvider, input.externalId);
    if (duplicate && duplicate.id !== currentId) {
      return { code: "duplicate_external_identity", message: "The provider and external ID already belong to another canonical record." };
    }
  }
  if (recordDomain === "OWNED_ITEM" && input.certificationNumber) {
    const duplicate = await repository.findByCertificationNumber(owner, input.certificationNumber);
    if (duplicate && duplicate.id !== currentId) {
      return { code: "duplicate_certification_number", message: "The certification number already belongs to another canonical item." };
    }
  }
  if (recordDomain === "FILE_ASSET" && input.fileAsset) {
    const duplicate = await repository.findByFileStoragePath(owner, input.fileAsset.storageProvider, input.fileAsset.storagePath);
    if (duplicate && duplicate.id !== currentId) {
      return { code: "duplicate_file_storage_path", message: "The storage provider and path already belong to another FileAsset." };
    }
  }
  return null;
}

export async function validateCanonicalDryRun(repository: CanonicalRepository, owner: OwnerContext, raw: unknown) {
  const { sourceBackupHash, actions } = validateBody(raw);
  const planIndex = await buildPlanIndex(repository, owner, actions);
  const results: DryRunActionResult[] = [];
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    try {
      if (action.action === "SKIP") {
        results.push({ index, action: action.action, domain: action.domain, recordId: action.recordId, valid: true, outcome: "WOULD_SKIP", issues: [] });
        continue;
      }
      if (action.action === "REQUIRES_DECISION") {
        results.push({
          index,
          action: action.action,
          domain: action.domain,
          recordId: action.recordId,
          valid: false,
          outcome: "REQUIRES_DECISION",
          issues: [{ code: "unresolved_owner_decision", message: "This action requires an owner decision before a migration can be applied." }],
        });
        continue;
      }
      const planConflicts = planIndex.conflictsByIndex.get(index);
      if (planConflicts?.length) {
        results.push({ index, action: action.action, domain: action.domain, recordId: action.recordId, valid: false, outcome: "WOULD_CONFLICT", issues: planConflicts });
        continue;
      }
      if (action.action === "INSERT") {
        const input = validateCreateInput(action.domain, action.input);
        if (input.id && action.recordId && input.id !== action.recordId) {
          throw validationIssue("recordId", "stable_id_mismatch", "The action recordId and input ID do not match.");
        }
        const recordId = input.id;
        if (!recordId) throw validationIssue("input.id", "stable_id_required", "Migration INSERT input requires the exact stable UUID that a future create would persist.");
        const existing = recordId ? await repository.findByStableId(owner, recordId) : null;
        if (existing) {
          results.push({ index, action: action.action, domain: action.domain, recordId, valid: false, outcome: "WOULD_CONFLICT", issues: [{ code: "duplicate_id", message: "The stable ID already exists." }] });
        } else {
          await assertRelationsAreApplicable(repository, owner, action.domain, input.relations, recordId, planIndex);
          await assertFileAssetReferenceIsApplicable(repository, owner, input.fileAsset, planIndex, recordId);
          const duplicate = await findDuplicateIdentity(repository, owner, action.domain, input, recordId);
          results.push(duplicate
            ? { index, action: action.action, domain: action.domain, recordId, valid: false, outcome: "WOULD_CONFLICT", issues: [duplicate] }
            : { index, action: action.action, domain: action.domain, recordId, valid: true, outcome: "VALIDATED", issues: [] });
        }
        continue;
      }
      const recordId = action.recordId ? validateUuid(action.recordId) : "";
      if (!recordId) throw new Code3ValidationError({ path: `actions[${index}].recordId`, code: "required", message: "recordId is required for UPDATE." });
      const update = validateUpdateInput(action.domain, action.input);
      const existing = await repository.getById(owner, action.domain, recordId);
      if (!existing) {
        results.push({ index, action: action.action, domain: action.domain, recordId, valid: false, outcome: "WOULD_CONFLICT", issues: [{ code: "missing_remote_record", message: "The proposed update has no matching remote record." }] });
      } else if (existing.recordVersion !== update.expectedVersion) {
        results.push({ index, action: action.action, domain: action.domain, recordId, valid: false, outcome: "WOULD_CONFLICT", issues: [{ code: "stale_record_version", message: "The remote record version differs from the proposed version." }] });
      } else {
        if (existing.archivedAt) {
          throw validationIssue("record", "archived_record_immutable", "Archived records cannot be updated without a future explicit restore workflow.");
        }
        const mergedAmountMinor = Object.prototype.hasOwnProperty.call(update, "amountMinor") ? update.amountMinor : existing.amountMinor;
        const mergedCurrency = Object.prototype.hasOwnProperty.call(update, "currency") ? update.currency : existing.currency;
        assertCompleteMoney(mergedAmountMinor, mergedCurrency);
        const mergedRelations = update.relations === undefined ? { ...existing.relations } : { ...update.relations };
        await assertRelationsAreApplicable(repository, owner, action.domain, mergedRelations, recordId, planIndex);
        await assertFileAssetReferenceIsApplicable(repository, owner, update.fileAsset || existing.fileAsset, planIndex, recordId);
        const duplicate = await findDuplicateIdentity(repository, owner, action.domain, {
          externalProvider: Object.prototype.hasOwnProperty.call(update, "externalProvider") ? update.externalProvider : existing.externalProvider,
          externalId: Object.prototype.hasOwnProperty.call(update, "externalId") ? update.externalId : existing.externalId,
          certificationNumber: Object.prototype.hasOwnProperty.call(update, "certificationNumber") ? update.certificationNumber : existing.certificationNumber,
          fileAsset: Object.prototype.hasOwnProperty.call(update, "fileAsset") ? update.fileAsset : existing.fileAsset,
        }, recordId);
        results.push(duplicate
          ? { index, action: action.action, domain: action.domain, recordId, valid: false, outcome: "WOULD_CONFLICT", issues: [duplicate] }
          : { index, action: action.action, domain: action.domain, recordId, valid: true, outcome: "VALIDATED", issues: [] });
      }
    } catch (error) {
      const issues = error instanceof Code3ValidationError
        ? error.issues.map(({ code, message }) => ({ code, message }))
        : [{ code: "invalid_action", message: "The proposed action is invalid." }];
      results.push({ index, action: action.action, domain: action.domain, recordId: action.recordId, valid: false, outcome: "INVALID", issues });
    }
  }
  // A forward reference is valid only when the planned INSERT that supplies it
  // is itself valid. Propagate failed targets through dependent actions so a
  // dry run never describes a child as applicable when its parent would not be.
  const plannedInsertByTarget = new Map<string, number>();
  actions.forEach((action, index) => {
    if (action.action !== "INSERT" || !action.input || typeof action.input !== "object" || Array.isArray(action.input)) return;
    const inputId = (action.input as Record<string, unknown>).id;
    if (typeof inputId === "string") plannedInsertByTarget.set(`${action.domain}\u0000${inputId.toLowerCase()}`, index);
  });
  let propagated = true;
  while (propagated) {
    propagated = false;
    for (let index = 0; index < actions.length; index += 1) {
      if (!results[index]?.valid) continue;
      const action = actions[index];
      if (!action.input || typeof action.input !== "object" || Array.isArray(action.input)) continue;
      const input = action.input as Record<string, unknown>;
      const dependencies: Array<{ domain: CanonicalDomain; id: string }> = [];
      if (input.relations && typeof input.relations === "object" && !Array.isArray(input.relations)) {
        for (const [name, rule] of Object.entries(domainDefinition(action.domain).relations)) {
          const targetId = (input.relations as Record<string, unknown>)[name];
          if (typeof targetId === "string") dependencies.push({ domain: rule.targetDomain, id: targetId });
        }
      }
      if (action.domain === "FILE_ASSET" && input.fileAsset && typeof input.fileAsset === "object" && !Array.isArray(input.fileAsset)) {
        const fileAsset = input.fileAsset as Record<string, unknown>;
        if (typeof fileAsset.relatedRecordType === "string" && typeof fileAsset.relatedRecordId === "string") {
          dependencies.push({ domain: fileAsset.relatedRecordType as CanonicalDomain, id: fileAsset.relatedRecordId });
        }
      }
      const invalidTarget = dependencies.find((dependency) => {
        const targetIndex = plannedInsertByTarget.get(`${dependency.domain}\u0000${dependency.id.toLowerCase()}`);
        return targetIndex !== undefined && !results[targetIndex]?.valid;
      });
      if (!invalidTarget) continue;
      results[index] = {
        ...results[index],
        valid: false,
        outcome: "INVALID",
        issues: [...results[index].issues, {
          code: "planned_reference_target_invalid",
          message: `A planned ${invalidTarget.domain} reference target is not valid in this dry run.`,
        }],
      };
      propagated = true;
    }
  }
  const blockerCount = results.filter((result) => !result.valid).length;
  return Object.freeze({
    format: "code3-canonical-dry-run",
    formatVersion: DRY_RUN_FORMAT_VERSION,
    sourceBackupHash,
    zeroWrites: true,
    actionCount: results.length,
    validActionCount: results.length - blockerCount,
    blockerCount,
    status: blockerCount ? "BLOCKED" : actions.length ? "READY" : "NO_DATA",
    results,
  });
}
