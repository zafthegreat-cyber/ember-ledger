import { domainDefinition } from "./domainDefinitions";
import type { CanonicalRepository } from "./repository";
import { CanonicalDuplicateError, CanonicalNotFoundError } from "./repository";
import type {
  CanonicalDomain,
  CanonicalListQuery,
  CanonicalRecord,
  CanonicalRecordInput,
  CanonicalRecordUpdate,
  OwnerContext,
} from "./types";
import {
  Code3ValidationError,
  validateArchiveInput,
  validateCreateInput,
  validateDomainStatus,
  validateListQuery,
  validateUpdateInput,
  validateUuid,
} from "./validation";

export class CanonicalService {
  constructor(readonly repository: CanonicalRepository) {}

  list(owner: OwnerContext, domain: CanonicalDomain, rawQuery: Record<string, unknown>) {
    const query = validateListQuery(rawQuery);
    validateDomainStatus(domain, query.status);
    return this.repository.list(owner, domain, query);
  }

  async getById(owner: OwnerContext, domain: CanonicalDomain, rawId: unknown): Promise<CanonicalRecord> {
    const id = validateUuid(rawId);
    const record = await this.repository.getById(owner, domain, id);
    if (!record) throw new CanonicalNotFoundError();
    return record;
  }

  async create(owner: OwnerContext, domain: CanonicalDomain, rawInput: unknown): Promise<CanonicalRecord> {
    const input = validateCreateInput(domain, rawInput);
    if (input.id && await this.repository.findByStableId(owner, input.id)) {
      throw new CanonicalDuplicateError("ID");
    }
    await this.assertRelations(owner, domain, input.relations, input.id);
    await this.assertFileAssetReference(owner, input.fileAsset, input.id);
    return this.repository.create(owner, domain, input);
  }

  async update(owner: OwnerContext, domain: CanonicalDomain, rawId: unknown, rawInput: unknown): Promise<CanonicalRecord> {
    const id = validateUuid(rawId);
    const input = validateUpdateInput(domain, rawInput);
    const current = await this.repository.getById(owner, domain, id);
    if (!current) throw new CanonicalNotFoundError();
    if (current.archivedAt) {
      throw new Code3ValidationError({
        path: "record",
        code: "archived_record_immutable",
        message: "Archived records cannot be updated without a future explicit restore workflow.",
      });
    }
    const amountMinor = Object.prototype.hasOwnProperty.call(input, "amountMinor") ? input.amountMinor : current.amountMinor;
    const currency = Object.prototype.hasOwnProperty.call(input, "currency") ? input.currency : current.currency;
    if ((amountMinor == null) !== (currency == null)) {
      throw new Code3ValidationError({
        path: "amountMinor",
        code: "incomplete_money",
        message: "amountMinor and currency must both be present or both be null.",
      });
    }
    const mergedRelations = input.relations === undefined ? { ...current.relations } : { ...input.relations };
    await this.assertRelations(owner, domain, mergedRelations, id);
    await this.assertFileAssetReference(owner, input.fileAsset || current.fileAsset || undefined, id);
    return this.repository.update(owner, domain, id, { ...input, relations: mergedRelations });
  }

  async archive(owner: OwnerContext, domain: CanonicalDomain, rawId: unknown, rawInput: unknown): Promise<CanonicalRecord> {
    const id = validateUuid(rawId);
    const { expectedVersion } = validateArchiveInput(rawInput);
    return this.repository.archive(owner, domain, id, expectedVersion);
  }

  private async assertRelations(
    owner: OwnerContext,
    domain: CanonicalDomain,
    relations: CanonicalRecordInput["relations"],
    recordId?: string,
  ): Promise<void> {
    const rules = domainDefinition(domain).relations;
    const supplied = relations || {};
    for (const [relationName, rule] of Object.entries(rules)) {
      const targetId = supplied[relationName];
      if (!targetId) {
        if (rule.required) {
          throw new Code3ValidationError({
            path: `relations.${relationName}`,
            code: "required",
            message: `${relationName} is required.`,
          });
        }
        continue;
      }
      if (recordId && targetId === recordId && domain === rule.targetDomain) {
        throw new Code3ValidationError({
          path: `relations.${relationName}`,
          code: "self_reference",
          message: `${relationName} cannot reference the same record.`,
        });
      }
      const target = await this.repository.getById(owner, rule.targetDomain, targetId);
      if (!target) {
        throw new Code3ValidationError({
          path: `relations.${relationName}`,
          code: "invalid_foreign_reference",
          message: `${relationName} does not reference an owner-accessible ${rule.targetDomain} record.`,
        });
      }
    }
  }

  private async assertFileAssetReference(owner: OwnerContext, fileAsset: CanonicalRecordInput["fileAsset"], recordId?: string): Promise<void> {
    if (!fileAsset?.relatedRecordType || !fileAsset.relatedRecordId) return;
    if (recordId && fileAsset.relatedRecordType === "FILE_ASSET" && fileAsset.relatedRecordId === recordId) {
      throw new Code3ValidationError({
        path: "fileAsset.relatedRecordId",
        code: "self_reference",
        message: "A FileAsset cannot reference itself.",
      });
    }
    const target = await this.repository.getById(owner, fileAsset.relatedRecordType, fileAsset.relatedRecordId);
    if (!target) {
      throw new Code3ValidationError({
        path: "fileAsset.relatedRecordId",
        code: "invalid_foreign_reference",
        message: "relatedRecordId does not reference an owner-accessible canonical record of relatedRecordType.",
      });
    }
  }
}

export function defaultListQuery(limit = 100): CanonicalListQuery {
  return { limit, includeArchived: true };
}
