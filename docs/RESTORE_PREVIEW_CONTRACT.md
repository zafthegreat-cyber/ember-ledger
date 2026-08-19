# Code 3 Restore Preview Contract

Status: Phase 1A local implementation, not committed or deployed.

## Non-negotiable rule

Restore Preview is inspection only. It must perform zero writes.

It does not import, merge, correct, delete, archive, migrate, upload, fetch, or apply records. The Owner Center explanation is: **No data will be changed during restore preview.** Phase 1A exposes no apply-restore action.

## Input boundary

Phase 1A accepts JSON text from a local file only. The file is parsed in the browser and is not uploaded to a server.

Default parser bounds in `src/features/backup/canonicalJson.js` are:

| Limit | Value |
|---|---:|
| File size | 10 MiB |
| Nesting depth | 40 |
| Array length | 50,000 |
| Keys per object | 1,000 |
| String length | 256 KiB |
| Total array records | 100,000 |

The parser rejects malformed or truncated JSON, a non-object top level, unsupported values, non-finite numbers, cycles during canonical processing, and prototype-pollution keys `__proto__`, `constructor`, and `prototype`. It never evaluates code or renders values as raw HTML.

## Inspection stages

1. Bound and parse the JSON.
2. Recognize `code-3-backup` and format version `1`.
3. Verify the section index, every section SHA-256 hash, and manifest SHA-256 hash.
4. Compare source IDs and section schema versions with the local registry.
5. Count and classify incoming records.
6. Compare stable IDs with current registered browser records without mutation.
7. detect duplicates, collisions, prohibited fields, money issues, and broken references.
8. Produce a result, warnings, and errors.
9. Discard the in-memory file contents when the UI leaves the preview.

## Result states

| Result | Meaning |
|---|---|
| `READY_FOR_FUTURE_RESTORE` | Recognized, integrity-valid, compatible, and no blocking validation errors; this is not permission to apply it |
| `READY_WITH_WARNINGS` | Integrity-valid and inspectable, but nonblocking gaps need owner review |
| `BLOCKED` | Recognized but one or more validation, collision, reference, prohibited-data, or compatibility errors prevent a future restore |
| `UNSUPPORTED` | Format or version has no supported adapter |
| `CORRUPTED` | JSON is malformed/truncated or integrity hashes do not match |

The word “ready” always means ready for a future separately approved restore implementation, never restored.

## Preview report

The preview reports, when applicable:

- recognized format and version;
- manifest and section integrity;
- schema compatibility;
- included and excluded sources;
- per-source and total record counts;
- new, matching, and potential-update counts;
- duplicate stable IDs;
- ID collisions;
- duplicate provider/external-listing pairs;
- duplicate certification numbers;
- missing purchase, lot, owned-item, sale, storage-location, allocation, return, and related-record references;
- unknown sources and unsupported schemas;
- prohibited security/session fields;
- invalid money and precision/currency issues;
- missing required fields;
- warnings and blocking errors.

Preview does not automatically repair any finding.

## Match semantics

A matching ID means only that the same source and stable ID exist locally. A potential update means the canonical incoming and current values differ. Preview does not decide which version is authoritative and does not overwrite owner-entered tax, costs, notes, condition, status, resale assumptions, or decision history.

Provider/external-listing pairs and certification numbers are additional duplicate signals. They are not used to silently merge records.

## Money validation

Restore Preview does not mutate or round money. It flags:

- nonnumeric values where a money field is expected;
- string spellings of `NaN`, `Infinity`, or `-Infinity`;
- negative values where the field contract prohibits them;
- decimal precision beyond the expected currency precision;
- absent currency where a record requires one;
- currency mismatches within a linked record set;
- legacy floating-point values that require future minor-unit conversion.

The future migration must preserve the original value and produce a reconciliation difference before any conversion is accepted.

## Stable IDs and references

Preview reports but does not fix:

- duplicate IDs within a section or across sources where the target namespace requires uniqueness;
- duplicate provider/external ID pairs;
- duplicate grading certification numbers;
- missing purchase, purchase-lot, owned-item, sale, storage-location, return, or allocation targets;
- orphaned cost allocations and returns;
- broken related-record links.

Legacy sources do not always share canonical field names. A validation adapter may therefore report that a relationship cannot yet be proven instead of guessing.

## Zero-write proof

Automated tests snapshot the Phase 1A registered writable stores—localStorage and sessionStorage—before the complete current-source inspection plus preview path and compare them afterward. They also assert that every currently included writable registry adapter is one of those snapshotted browser stores and that the pure preview module imports or invokes no storage, IndexedDB, Supabase, PostgreSQL, or file writer. Supabase, PostgreSQL, and file assets are registered exclusions with no Phase 1A preview adapter, so there is no mutation surface to call. If any such adapter, or IndexedDB support, is added later, an instrumented before/after snapshot becomes mandatory before the zero-write claim can continue.

The implementation must not call:

- `setItem`, `removeItem`, or `clear` on browser storage;
- IndexedDB mutation transactions;
- Supabase insert/update/upsert/delete/RPC mutation paths;
- PostgreSQL mutation queries;
- filesystem or object-storage writes;
- feature-setting or owner-setting mutations;
- auth/session mutation APIs.

Preview does not write an audit event into a business datastore because that would violate the Phase 1A zero-write guarantee. A safe in-memory diagnostic summary is allowed. Durable preview auditing is deferred until it can use a separately specified non-mutating or explicitly exempt audit channel.

## Error handling and privacy

Errors identify the source, section, field path, and validation category only as needed for repair. They do not include whole records, tokens, secrets, raw identity claims, allowlists, session data, or full file contents. The UI does not show raw JSON by default.

## UI contract

Owner Center → Controls → Data & Backup uses the approved minimal interface:

- one title;
- one primary `Export verified backup` action;
- one secondary `Preview restore` action;
- compact coverage, count, file-reference, server-data, and integrity rows;
- a visible `PARTIAL` warning;
- expandable warnings/errors;
- no apply or confirm-restore button.

The page remains owner-only through the verified application session. Hiding the navigation item is not the security boundary.

## Acceptance tests

Tests must cover valid complete and partial artifacts, deterministic hashes, corruption, unsupported format/version/schema, unknown sources, duplicates, broken references, invalid money/precision, malformed/truncated/oversized input, prototype-pollution keys, excessive records/depth/strings, security-field exclusion, and failed self-verification. The zero-write snapshot must pass for every preview outcome, including exceptions.

## Future restore gate

Applying a restore requires a separate approved phase. That phase must add owner reauthentication, migration preview, explicit confirmation, durable audit, transactional or reversible writes, conflict policy, attachment recovery, server-source export, rollback, and end-to-end restore tests. Phase 1A intentionally provides none of those mutation paths.
