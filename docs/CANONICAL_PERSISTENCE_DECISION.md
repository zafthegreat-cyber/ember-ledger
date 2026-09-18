# Code 3 Canonical Persistence Decision

Status: Phase 1B validated checkpoint contract, published on the feature branch. The database artifact is `SCHEMA_ONLY`; repository/API contracts remain behind a disabled hosted gate; Migration Preview is `DRY_RUN_ONLY`; canonical `REMOTE_ACTIVE` persistence is `NOT_ACTIVE`.

Phase 2D-A does not expand this canonical scope. `code3.bot-ops.v1` is a separate browser-local provider-neutral metadata/evidence source fixed to `LOCAL_ONLY`; all ten Bot Operations paths are `REQUIRES_MAPPING`, and no Bot table, API route, remote adapter, schema execution, Purchase handoff, or Inventory mutation is authorized.

Phase 1B starting baseline: `26d30b9a0b1379d53778c0bc5c92887cc0ae744f`.

## Decision

Code 3 selects this canonical path for private owner records:

```text
React client
  -> owner-authorized Code 3 Express API
  -> domain service and repository layer
  -> PostgreSQL / Supabase Postgres
```

Supabase Auth remains the production identity provider selected in [OWNER_AUTH_DECISION.md](./OWNER_AUTH_DECISION.md). The browser may hold the provider session needed to call Code 3, but it is never the security authority for business records. The server verifies the identity, derives the immutable owner subject, and passes that owner context explicitly to repositories.

The current client-local repositories remain authoritative during Phase 1B. `REMOTE_ACTIVE` is not enabled, no owner record has been migrated, and no Phase 1B schema artifact has been applied to a production or owner database.

The server runtime gate is `CODE3_CANONICAL_PERSISTENCE_ENABLED`. Its name may appear in examples/documentation, but no real value is committed. Hosted canonical routes remain unavailable with a safe `503` unless that setting is explicitly enabled and `DATABASE_URL` is configured. This gate is a deployment safety control, not owner authorization; every enabled request still requires the Phase 1A owner policy.

## Why this backend

The repository already contains:

- an Express 5 TypeScript application used by Vercel functions;
- the Phase 1A Supabase identity verifier and owner policy;
- a `pg` pool and existing PostgreSQL-backed legacy services;
- Supabase migration history and an existing Supabase project convention;
- secure server-side eBay routing that demonstrates the required browser/API boundary.

Extending those boundaries is smaller and safer than adding a second authentication provider, a second API runtime, or direct browser writes to new tables. Supabase Postgres can supply the relational target while the Express API remains the only canonical business-write boundary.

Existing legacy tables, direct Supabase client writes, process-memory services, and browser repositories are migration inputs or compatibility implementations. They are not the canonical Code 3 repository merely because they already exist.

## Responsibility boundaries

| Layer | Responsibility | Must not do |
|---|---|---|
| React client | presentation, drafts, local fallback, authenticated API requests, conflict display | authorize itself, select `owner_subject`, issue SQL, silently switch persistence mode |
| Code 3 API | verify principal/owner, validate requests, paginate, map safe errors, set `no-store` | trust client role/owner fields, expose allowlists or secrets, return unbounded private data |
| Domain service | transaction orchestration, invariants, reference checks, idempotency, conflict policy | hide write failures or auto-resolve owner decisions |
| Repository | owner-scoped queries, stable IDs, optimistic versions, archive operations | perform an unscoped query or infer owner from request data |
| PostgreSQL | relational constraints, foreign keys, uniqueness, transactions, indexes | become directly writable by an untrusted browser |
| Supabase Auth | verify the external identity | decide Code 3 OWNER authorization by email alone |
| Object storage | future protected evidence bytes | become active in Phase 1B without a separate secure storage configuration |

## Canonical Phase 1B domains

The schema contract covers:

- `Deal`, `DealSnapshot`, `DealAnalysis`, and `SearchRule`;
- `AuctionEvent`, `AuctionLot`, and `BidPlan`;
- `RestockStoreProfile`, `RestockEvent`, `RestockPrediction`, `StoreVisit`, and `ProductObservation`;
- `Purchase`, `PurchaseLot`, and `CostAllocation`;
- `OwnedItem`, `InventoryAdjustment`, and `StorageLocation`;
- `Sale`, `SaleLineItem`, `Shipment`, and `Return`;
- `Expense`, `MileageTrip`, and `ReceiptMetadata`;
- `OwnerPreference`, `FeatureSetting`, and file-reference metadata.

Schema coverage means the domain has a target representation and validation boundary. It does not mean its complete product workflow, remote adapter, or migration is active.

Account Ops, Inbox/Order Intelligence, and Bot Operations are intentionally outside the Phase 1B canonical domains. Phase 2D-A does not place Bot installations, retailer-account links, Bot profiles, proxy groups, product targets, task groups, tasks, attempts, Checkout Evidence, or activity into generic `code3_records`. A future schema decision must review their security, append-only history, idempotency, Account Ops references, Purchase boundary, and rollback separately rather than treating the local document as an approved server mapping.

## Owner identity and authorization

Every owner record carries `owner_subject`, using the provider-qualified immutable subject produced by Phase 1A. Repository calls require owner context as an explicit argument. Inserts derive the persisted owner from that context. Reads, updates, archives, and relationship checks include the same owner scope.

The client cannot grant or override ownership. A payload containing `owner_subject`, an owner role, or equivalent authority field is rejected or ignored according to the strict input schema; it is never accepted as authority. Owner A must not be able to read, update, relate, or infer Owner B records.

The schema includes owner-scoped constraints and row-level ownership policies where supplied for Supabase. Server enforcement remains mandatory even when database row-level security is present.

## Repository boundary

The canonical server layer uses domain-oriented repositories rather than exposing tables directly. Repository families cover deals/search rules, auctions, restocks, purchases/lots/allocations, owned items/storage/adjustments, sales/fulfillment/returns, expenses, mileage, and settings.

The common contract is conceptually:

```text
list(owner, pagination, filters)
getById(owner, id)
create(owner, validatedInput)
update(owner, id, validatedInput, expectedVersion)
archive(owner, id, expectedVersion)
withConsistentRead(owner-scoped read operation)
```

Every list is bounded and cursor-paginated. The local and PostgreSQL adapters share the same `status` and `includeArchived` semantics and use stable ascending `(createdAt, id)` keyset ordering so equal timestamps cannot skip or repeat records. The opaque server cursor strictly requires a valid timestamp plus a UUID record ID. The private `LOCAL_ONLY` cursor intentionally remains legacy-ID-compatible until local records have safely acquired canonical UUIDs; it is not accepted by the remote API. Archive sets the canonical status to `ARCHIVED` and records `archivedAt`; normal lists omit archived records unless explicitly requested. Domain repositories add only bounded, owner-scoped queries. Route handlers call services or repositories; they do not embed domain SQL when a repository operation can express it.

Phase 1B may include an in-memory/test implementation and a PostgreSQL contract. A passing mock or dry-run repository proves behavior, not deployment configuration or remote durability.

The authenticated server-export contract is `code-3-server-export` version 1. Its wire-domain keys use the uppercase backend `CanonicalDomain` enums (for example, `DEAL`, `DEAL_ANALYSIS`, and `PURCHASE_LOT`). It returns bounded domain records, `sourceHash`, and `coverageStatus` only when the canonical repository is safely available. PostgreSQL export runs every domain read inside one `REPEATABLE READ READ ONLY` transaction; the memory adapter exports from an isolated clone. The client recomputes SHA-256 over deterministically canonicalized `domains` and rejects a mismatched `sourceHash`. A response claiming `COMPLETE` is accepted only when every canonical domain key is present, no domain is truncated, and the repository supplied this consistent-read boundary. An unavailable, incomplete, hash-mismatched, or otherwise invalid route response is not an empty successful export; the client migration registry uses those same canonical wire keys when mapping and comparing local records.

## Local implementation map

Phase 1B keeps the boundaries explicit:

| Concern | Local implementation |
|---|---|
| Domain/status/relation definitions | `backend/src/code3/domainDefinitions.ts`, `backend/src/code3/types.ts` |
| Strict request validation | `backend/src/code3/validation.ts` |
| Repository contract and safe domain errors | `backend/src/code3/repository.ts` |
| In-memory test repository | `backend/src/code3/memoryRepository.ts` |
| PostgreSQL repository target | `backend/src/code3/postgresRepository.ts` |
| Service, cursor, rate limit | `backend/src/code3/service.ts`, `pagination.ts`, `rateLimit.ts` |
| Server dry-run and export | `backend/src/code3/dryRun.ts`, `serverExport.ts` |
| Owner-authorized route family | `backend/src/routes/code3.routes.ts`, mounted by `backend/src/server.ts` |
| Client persistence abstraction | `src/features/persistence/dataSources.js`, `persistenceMode.js` |
| Source/wire/money/file mapping | `migrationSourceRegistry.js`, `canonicalWireContract.js`, `moneyConversion.js`, `fileAsset.js` |
| Local migration plan | `migrationPreview.js` |
| Remote backup contract | `remoteBackupAdapter.js` |
| Owner-authorized client transport | `src/services/code3OwnerApi.js` |
| Owner UI | `src/features/backup/MigrationReadinessPanel.jsx` within Data & Backup |

Data & Backup uses `code3OwnerApi.js` to supply the verified owner session to `createRemoteBackupExportAdapter`. Verified Backup and Migration Readiness consume the bounded server export when it is available; an unauthenticated, unauthorized, unavailable, invalid, or partial response remains excluded or `PARTIAL` rather than being converted to an empty success. This read integration does not enable remote writes or `REMOTE_ACTIVE`.

The PostgreSQL repository and API contain real target operations, but the hosted safety gate keeps them unavailable unless explicitly configured. Their presence does not switch a browser from local persistence or prove the schema exists in a database.

## Canonical API shape

The local `/api/code3` family exposes bounded domain resources for deals/snapshots/analyses, Search Rules, auction events/lots/bid plans, restock stores/events/predictions/visits/observations, purchases/lots/allocations, owned items/adjustments/storage, sales/lines/shipments/returns, expenses, mileage, receipts, preferences/features, and file metadata.

Each resource supports bounded list, get, create, version-checked update, and archive through the common service/repository contract. Canonical create/update reject `ARCHIVED`; archive is available only through `POST /:id/archive` with `expectedVersion`. That operation sets `ARCHIVED`/`archivedAt`, is a state change rather than destructive deletion, and the canonical family has no `DELETE` route. Once archived, a record is immutable in Phase 1B; unarchive/restore requires a future explicit workflow rather than an ordinary update. `GET /api/code3/export` supplies the server-export contract, and `POST /api/code3/migration/dry-run` validates proposed actions without committing them.

`FILE_ASSET` is a typed canonical metadata record. The PostgreSQL repository stores the common envelope in `code3_records` and its metadata in `code3_file_assets`, whose owner-scoped foreign key points back to that envelope. The service and dry run require any `relatedRecordType`/`relatedRecordId` pair to resolve to an owner-accessible canonical record, including a valid planned insert during dry-run validation. The `(storageProvider, storagePath)` pair is unique within the owner in repository, dry-run, and schema contracts; unlike active external/certification identity, archiving does not free this physical reference. This contract does not upload, copy, hash, scan, serve, or otherwise establish protection or availability for file bytes.

Every route is mounted behind Phase 1A exact-origin CORS and OWNER middleware, adds `Cache-Control: no-store`, uses server-derived owner context, and has a bounded owner rate limit. With canonical persistence unavailable, the route returns a safe `503` explaining that local records remain authoritative.

## Transactions and concurrency

Multi-record business operations will run in one database transaction when atomicity matters—for example purchase/lot/allocation creation, inventory adjustment with sale lines, or return inspection with quantity restoration. External provider calls do not remain open inside a database transaction; their normalized evidence is validated before the write boundary.

Mutable records carry `record_version`, beginning at one and incrementing on a successful mutation. An update or archive includes `expectedVersion`. A stale version produces `409 Conflict` with only safe metadata: record ID, current version, updated time, and conflict type. The server does not apply last-write-wins automatically.

## Stable IDs

Canonical IDs are UUIDs generated once and retained throughout a record's life. The schema key is `(owner_subject, id)`, so an ID must be unique across all canonical domains for one owner; the same UUID may exist for a different owner without exposing or merging records. Provider external IDs, certification numbers, listing URLs, and legacy IDs remain separate attributed fields.

- A valid local stable UUID is preserved only when it is unique across that owner's canonical domains.
- A non-UUID legacy ID is retained as migration provenance. Preview derives its proposed UUID from source ID, source collection, and the legacy ID, but cannot write it.
- A record without a legacy ID may use only a recognized semantic identity—an active provider/external-ID pair, an active Owned Item certification number, or a Sale reference—for a deterministic warning-level proposal. Archived provider/certification identities are intentionally not used to derive a new active identity. A record with no stable legacy or recognized semantic identity receives no proposed canonical UUID in Phase 1B. It is `REQUIRES_DECISION` until the owner supplies or confirms a stable identity; a content hash, whole-backup hash, array position, or mutable title cannot become identity authority.
- A matching UUID with different content is `STABLE_ID_CONTENT_COLLISION` and `REQUIRES_DECISION` unless matching migration provenance proves it is the same source/collection/legacy record. ID, provider/external-ID, certification, and reference collisions are never silently merged.

Provider/external identity is unique per owner and canonical domain among active records. Certification uniqueness applies only to active `OWNED_ITEM` records and is case-insensitive. The schema and in-memory/PostgreSQL repositories consistently ignore archived records for these two lookups, so an archived record does not permanently reserve an external identity or certification number. Stable canonical IDs remain owner-wide and are never reused merely because a record was archived.

## Money

Canonical money uses integer minor units plus an explicit ISO 4217 currency:

```text
amount_minor: 1234
currency: USD
```

The database uses integer columns sized for safe aggregation. The Phase 1B canonical envelope, client/server validators, repository, and schema include one optional generic `rateBasisPoints` / `rate_basis_points` field, constrained to a safe integer from 0 through 100,000. Canonical money requires `amountMinor` and `currency` as a pair; create may use the documented default `USD` only when an amount exists, while currency without an amount is invalid. The migration mapper does not yet decide which legacy fee, tax, ROI, or other domain-specific percentage belongs in that generic field. Those legacy values remain preserved in source metadata and require an explicit semantic mapping before a future apply. Existing browser values remain unchanged in Phase 1B.

Canonical metadata is bounded to 250,000 UTF-8 JSON bytes at the client/server wire boundary, with tighter depth/node/string/array/key limits. The SQL constraint allows 262,144 bytes to leave an encoding/representation margin rather than weakening the API limit.

Migration Preview may propose `$12.34 -> 1234`, `$12.3 -> 1230`, and `$12 -> 1200` for a two-decimal currency. It warns or blocks excess precision and blocks nonnumeric, non-finite, ambiguous-string, or incompatible-currency inputs. A missing currency may use the explicitly configured default only with a visible warning; it blocks when no safe default exists. Preview never silently rounds an ambiguous value. Original values and any proposed conversion remain visible for reconciliation.

## Schema and migration status

`supabase/migrations/20260820120000_code3_canonical_owner_records.sql` is a versioned source artifact only. The selected flexible relational representation uses typed `code3_records` rows plus explicit `code3_record_links` rather than one directly exposed table per route. It also defines file-reference metadata in `code3_file_assets` and an append-only future summary shape in `code3_audit_events`. Domain definitions and strict validators preserve the bounded domain contract.

The schema source includes constraints, owner/type/status/provider/time indexes, a version/update trigger, composite owner-safe relationship foreign keys, RLS policies, and revocation of direct `anon`/`authenticated` table privileges. RLS is defense in depth for a separately reviewed future grant; current canonical access is designed to flow through the owner-authorized API and its explicitly owner-filtered repository.

The file has not been applied to a disposable, owner, Preview, or Production database by this task. No table, policy, trigger, or owner row can be claimed as deployed merely because the SQL exists in Git working state.

Adding a migration file is not the same as executing it. A future execution requires a separately approved task, a verified pre-migration backup, environment confirmation, dry-run evidence, rollback readiness, and explicit owner confirmation.

## Persistence modes

| Mode | Meaning | Phase 1B use |
|---|---|---|
| `LOCAL_ONLY` | existing local repositories remain authoritative | active default |
| `MIGRATION_PREVIEW` | read local data and optional remote comparison data; produce no writes | available only for explicit preview/testing |
| `REMOTE_ACTIVE` | canonical API is authoritative and local storage is a cache/fallback | defined but not enabled |

Phase 1B creates the persistence abstraction for later feature-by-feature adoption. Existing production feature components still use their established local repositories; they are not silently rewired in this phase. Future migrated components must depend on the abstraction rather than select local or remote storage directly. Phase 1B must not silently change a browser from `LOCAL_ONLY` to `REMOTE_ACTIVE`.

Phase 2D-A follows that rule by constructing its gateway internally with `LOCAL_ONLY` and exposing no caller-selected persistence mode or remote adapter. Its Backup/Migration Preview classification proposes no canonical action. The paused Phase 2B2-B.1 Upstash resource is operational mailbox-provider security state only and cannot be used as Bot or canonical business persistence.

## Migration and rollback strategy

The migration is a later, separately authorized sequence:

1. create and immediately verify a source backup;
2. inventory every source and validate schemas, IDs, references, and money;
3. compare against canonical data with no writes;
4. create a deterministic plan with `INSERT`, `UPDATE`, `SKIP`, or `REQUIRES_DECISION` only;
5. review conflicts and reconcile totals;
6. apply a future approved plan transactionally while journaling record mappings;
7. verify remote counts, hashes, references, totals, and owner scope;
8. retain the local snapshot as a read-only fallback;
9. switch persistence only after explicit confirmation;
10. retire local data only in another separately approved phase.

Rollback requirements are normative in [MIGRATION_ROLLBACK_CONTRACT.md](./MIGRATION_ROLLBACK_CONTRACT.md). Preview behavior is normative in [MIGRATION_PREVIEW_CONTRACT.md](./MIGRATION_PREVIEW_CONTRACT.md).

## Offline implications

The future server source of truth does not remove offline support. Saved reads and drafts may remain local, but queued writes need idempotency keys, dependency ordering, bounded retries, and version checks. A conflict must be shown rather than overwritten. Phase 1B documents this contract in [OFFLINE_SYNC_CONTRACT.md](./OFFLINE_SYNC_CONTRACT.md); it does not implement a sync engine.

## Remaining risks

- canonical schema artifacts can drift from the repository contract before activation;
- legacy data overlaps across devices and namespaces;
- float-to-minor-unit conversion may reveal irreconcilable historical precision;
- file references are modeled but bytes are not migrated or protected yet;
- row-level security must be tested with the real deployment roles before use;
- serverless database connection limits and transaction behavior require deployment verification;
- remote export and dry-run contracts do not prove a complete disaster-recovery path;
- `REMOTE_ACTIVE` would be unsafe until clean-checkout, disposable-database, authorization, migration, rollback, and physical-device evidence all pass.
