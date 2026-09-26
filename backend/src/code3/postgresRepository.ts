import type { Pool, PoolClient, QueryResult } from "pg";
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
  FileAssetMetadata,
  JsonObject,
  OwnerContext,
} from "./types";

type RecordRow = {
  id: string;
  record_type: CanonicalDomain;
  status: string;
  source: string;
  external_provider: string | null;
  external_id: string | null;
  source_url: string | null;
  notes: string | null;
  metadata: JsonObject | null;
  amount_minor: string | number | null;
  currency: string | null;
  rate_basis_points: string | number | null;
  quantity: string | number | null;
  certification_number: string | null;
  occurred_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  record_version: string | number;
  archived_at: string | Date | null;
  relations?: Record<string, string> | null;
  file_asset?: FileAssetMetadata | null;
};

const RECORD_COLUMNS = `
  r.id, r.record_type, r.status, r.source, r.external_provider, r.external_id,
  r.source_url, r.notes, r.metadata, r.amount_minor, r.currency, r.rate_basis_points, r.quantity,
  r.certification_number, r.occurred_at, r.created_at, r.updated_at,
  r.record_version, r.archived_at,
  coalesce((
    select jsonb_object_agg(link.relationship_type, link.to_record_id::text)
    from public.code3_record_links link
    where link.owner_subject = r.owner_subject and link.from_record_id = r.id
  ), '{}'::jsonb) as relations,
  case when r.record_type = 'FILE_ASSET' then (
    select jsonb_build_object(
      'storageProvider', asset.storage_provider,
      'storagePath', asset.storage_path,
      'mimeType', asset.mime_type,
      'size', asset.size_bytes,
      'sha256', asset.sha256,
      'relatedRecordType', asset.related_record_type,
      'relatedRecordId', asset.related_record_id,
      'originalName', asset.original_name
    )
    from public.code3_file_assets asset
    where asset.owner_subject = r.owner_subject and asset.asset_record_id = r.id
  ) else null end as file_asset`;

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function safeNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("Canonical integer is outside the supported API range.");
  return parsed;
}

function record(row: RecordRow): CanonicalRecord {
  return Object.freeze({
    id: row.id,
    domain: row.record_type,
    status: row.status,
    source: row.source,
    externalProvider: row.external_provider,
    externalId: row.external_id,
    sourceUrl: row.source_url,
    notes: row.notes,
    metadata: row.metadata || {},
    amountMinor: safeNumber(row.amount_minor),
    currency: row.currency,
    rateBasisPoints: safeNumber(row.rate_basis_points),
    quantity: safeNumber(row.quantity),
    certificationNumber: row.certification_number,
    occurredAt: iso(row.occurred_at),
    relations: Object.freeze({ ...(row.relations || {}) }),
    fileAsset: row.file_asset || null,
    createdAt: iso(row.created_at) as string,
    updatedAt: iso(row.updated_at) as string,
    recordVersion: safeNumber(row.record_version) as number,
    archivedAt: iso(row.archived_at),
  });
}

function mapDuplicate(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505") {
    const constraint = String((error as { constraint?: string }).constraint || "");
    if (constraint.includes("external")) throw new CanonicalDuplicateError("EXTERNAL_IDENTITY");
    if (constraint.includes("certification")) throw new CanonicalDuplicateError("CERTIFICATION_NUMBER");
    if (constraint.includes("storage_path")) throw new CanonicalDuplicateError("FILE_STORAGE_PATH");
    throw new CanonicalDuplicateError("ID");
  }
  throw error;
}

export class PostgresCanonicalRepository implements CanonicalRepository {
  constructor(private readonly pool: Pool, private readonly reader: Pool | PoolClient = pool) {}

  async withConsistentRead<T>(operation: (repository: CanonicalRepository) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin transaction isolation level repeatable read read only");
      const result = await operation(new PostgresCanonicalRepository(this.pool, client));
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async list(owner: OwnerContext, domain: CanonicalDomain, query: CanonicalListQuery): Promise<CanonicalPage> {
    const values: unknown[] = [owner.ownerSubject, domain];
    const filters = ["r.owner_subject = $1", "r.record_type = $2"];
    if (!query.includeArchived) filters.push("r.archived_at is null");
    if (query.status) {
      values.push(query.status);
      filters.push(`r.status = $${values.length}`);
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      values.push(cursor.createdAt, cursor.id);
      filters.push(`(r.created_at, r.id) > ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
    }
    values.push(query.limit + 1);
    const result = await this.reader.query<RecordRow>(`
      select ${RECORD_COLUMNS}
      from public.code3_records r
      where ${filters.join(" and ")}
      order by r.created_at asc, r.id asc
      limit $${values.length}
    `, values);
    const rows = result.rows.map(record);
    const hasMore = rows.length > query.limit;
    const records = rows.slice(0, query.limit);
    const last = records.length ? records[records.length - 1] : undefined;
    return {
      records,
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }

  async getById(owner: OwnerContext, domain: CanonicalDomain, id: string): Promise<CanonicalRecord | null> {
    const result = await this.reader.query<RecordRow>(`
      select ${RECORD_COLUMNS}
      from public.code3_records r
      where r.owner_subject = $1 and r.record_type = $2 and r.id = $3
      limit 1
    `, [owner.ownerSubject, domain, id]);
    return result.rows[0] ? record(result.rows[0]) : null;
  }

  async findByStableId(owner: OwnerContext, id: string): Promise<CanonicalRecord | null> {
    const result = await this.reader.query<RecordRow>(`
      select ${RECORD_COLUMNS}
      from public.code3_records r
      where r.owner_subject = $1 and r.id = $2
      limit 1
    `, [owner.ownerSubject, id]);
    return result.rows[0] ? record(result.rows[0]) : null;
  }

  async findByExternalIdentity(owner: OwnerContext, domain: CanonicalDomain, provider: string, externalId: string): Promise<CanonicalRecord | null> {
    const result = await this.reader.query<RecordRow>(`
      select ${RECORD_COLUMNS}
      from public.code3_records r
      where r.owner_subject = $1 and r.record_type = $2
        and r.external_provider = $3 and r.external_id = $4
        and r.archived_at is null
      limit 1
    `, [owner.ownerSubject, domain, provider, externalId]);
    return result.rows[0] ? record(result.rows[0]) : null;
  }

  async findByCertificationNumber(owner: OwnerContext, certificationNumber: string): Promise<CanonicalRecord | null> {
    const result = await this.reader.query<RecordRow>(`
      select ${RECORD_COLUMNS}
      from public.code3_records r
      where r.owner_subject = $1 and r.record_type = 'OWNED_ITEM'
        and upper(r.certification_number) = upper($2)
        and r.archived_at is null
      limit 1
    `, [owner.ownerSubject, certificationNumber]);
    return result.rows[0] ? record(result.rows[0]) : null;
  }

  async findByFileStoragePath(owner: OwnerContext, storageProvider: string, storagePath: string): Promise<CanonicalRecord | null> {
    const result = await this.reader.query<RecordRow>(`
      select ${RECORD_COLUMNS}
      from public.code3_records r
      join public.code3_file_assets asset
        on asset.owner_subject = r.owner_subject and asset.asset_record_id = r.id
      where r.owner_subject = $1 and r.record_type = 'FILE_ASSET'
        and asset.storage_provider = $2 and asset.storage_path = $3
      limit 1
    `, [owner.ownerSubject, storageProvider, storagePath]);
    return result.rows[0] ? record(result.rows[0]) : null;
  }

  async create(owner: OwnerContext, domain: CanonicalDomain, input: CanonicalRecordInput): Promise<CanonicalRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await client.query<RecordRow>(`
        insert into public.code3_records (
          id, owner_subject, record_type, status, source, external_provider, external_id,
          source_url, notes, metadata, amount_minor, currency, rate_basis_points, quantity,
          certification_number, occurred_at
        ) values (
          coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7,
          $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16
        )
        returning *
      `, [
        input.id || null,
        owner.ownerSubject,
        domain,
        input.status || "ACTIVE",
        input.source || "manual",
        input.externalProvider || null,
        input.externalId || null,
        input.sourceUrl || null,
        input.notes || null,
        JSON.stringify(input.metadata || {}),
        input.amountMinor ?? null,
        input.currency || null,
        input.rateBasisPoints ?? null,
        input.quantity ?? null,
        input.certificationNumber || null,
        input.occurredAt || null,
      ]);
      if (domain === "FILE_ASSET" && input.fileAsset) {
        await this.upsertFileAsset(client, owner, result.rows[0].id, input.fileAsset);
      }
      await this.replaceRelations(client, owner, result.rows[0].id, input.relations || {});
      await client.query("commit");
      const created = await this.getById(owner, domain, result.rows[0].id);
      if (!created) throw new CanonicalNotFoundError();
      return created;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      return mapDuplicate(error);
    } finally {
      client.release();
    }
  }

  async update(owner: OwnerContext, domain: CanonicalDomain, id: string, input: CanonicalRecordUpdate): Promise<CanonicalRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const assignments: string[] = ["source = source"];
      const values: unknown[] = [owner.ownerSubject, domain, id, input.expectedVersion];
      const fields: Array<[keyof Omit<CanonicalRecordUpdate, "expectedVersion" | "relations">, string, (value: unknown) => unknown]> = [
        ["status", "status", (value) => value],
        ["source", "source", (value) => value],
        ["externalProvider", "external_provider", (value) => value],
        ["externalId", "external_id", (value) => value],
        ["sourceUrl", "source_url", (value) => value],
        ["notes", "notes", (value) => value],
        ["metadata", "metadata", (value) => JSON.stringify(value)],
        ["amountMinor", "amount_minor", (value) => value],
        ["currency", "currency", (value) => value],
        ["rateBasisPoints", "rate_basis_points", (value) => value],
        ["quantity", "quantity", (value) => value],
        ["certificationNumber", "certification_number", (value) => value],
        ["occurredAt", "occurred_at", (value) => value],
      ];
      for (const [key, column, transform] of fields) {
        if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
        values.push(transform(input[key]));
        assignments.push(`${column} = $${values.length}${column === "metadata" ? "::jsonb" : ""}`);
      }
      const result = await client.query<RecordRow>(`
        update public.code3_records
        set ${assignments.join(", ")}
        where owner_subject = $1 and record_type = $2 and id = $3 and record_version = $4
        returning *
      `, values);
      if (!result.rows[0]) {
        const current = await this.findCurrent(client, owner, domain, id);
        if (!current) throw new CanonicalNotFoundError();
        throw new CanonicalVersionConflictError(current);
      }
      if (domain === "FILE_ASSET" && input.fileAsset) {
        await this.upsertFileAsset(client, owner, id, input.fileAsset);
      }
      if (input.relations !== undefined) await this.replaceRelations(client, owner, id, input.relations);
      await client.query("commit");
      const updated = await this.getById(owner, domain, id);
      if (!updated) throw new CanonicalNotFoundError();
      return updated;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      if (error instanceof CanonicalNotFoundError || error instanceof CanonicalVersionConflictError) throw error;
      return mapDuplicate(error);
    } finally {
      client.release();
    }
  }

  async archive(owner: OwnerContext, domain: CanonicalDomain, id: string, expectedVersion: number): Promise<CanonicalRecord> {
    const result = await this.reader.query<RecordRow>(`
      update public.code3_records r
      set status = 'ARCHIVED', archived_at = now()
      where owner_subject = $1 and record_type = $2 and id = $3 and record_version = $4
      returning *
    `, [owner.ownerSubject, domain, id, expectedVersion]);
    if (!result.rows[0]) {
      const current = await this.getById(owner, domain, id);
      if (!current) throw new CanonicalNotFoundError();
      throw new CanonicalVersionConflictError(current);
    }
    const archived = await this.getById(owner, domain, id);
    if (!archived) throw new CanonicalNotFoundError();
    return archived;
  }

  private async findCurrent(client: PoolClient, owner: OwnerContext, domain: CanonicalDomain, id: string): Promise<CanonicalRecord | null> {
    const result = await client.query<RecordRow>(`
      select ${RECORD_COLUMNS}
      from public.code3_records r
      where r.owner_subject = $1 and r.record_type = $2 and r.id = $3
      limit 1
    `, [owner.ownerSubject, domain, id]);
    return result.rows[0] ? record(result.rows[0]) : null;
  }

  private async replaceRelations(client: PoolClient, owner: OwnerContext, fromRecordId: string, relations: Record<string, string | null>): Promise<void> {
    await client.query(
      "delete from public.code3_record_links where owner_subject = $1 and from_record_id = $2",
      [owner.ownerSubject, fromRecordId],
    );
    for (const [relationshipType, targetId] of Object.entries(relations)) {
      if (!targetId) continue;
      await client.query(`
        insert into public.code3_record_links (owner_subject, from_record_id, relationship_type, to_record_id)
        values ($1, $2, $3, $4)
      `, [owner.ownerSubject, fromRecordId, relationshipType, targetId]);
    }
  }

  private async upsertFileAsset(
    client: PoolClient,
    owner: OwnerContext,
    recordId: string,
    fileAsset: FileAssetMetadata,
  ): Promise<void> {
    await client.query(`
      insert into public.code3_file_assets (
        owner_subject, asset_record_id, storage_provider, storage_path, mime_type,
        size_bytes, sha256, related_record_type, related_record_id, original_name
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (owner_subject, asset_record_id) do update set
        storage_provider = excluded.storage_provider,
        storage_path = excluded.storage_path,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        sha256 = excluded.sha256,
        related_record_type = excluded.related_record_type,
        related_record_id = excluded.related_record_id,
        original_name = excluded.original_name
    `, [
      owner.ownerSubject,
      recordId,
      fileAsset.storageProvider,
      fileAsset.storagePath,
      fileAsset.mimeType,
      fileAsset.size,
      fileAsset.sha256,
      fileAsset.relatedRecordType,
      fileAsset.relatedRecordId,
      fileAsset.originalName,
    ]);
  }
}
