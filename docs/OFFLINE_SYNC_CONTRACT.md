# Code 3 Offline and Sync Contract

Status: future contract. Phase 1B defines persistence modes and conflict semantics but does not implement a full sync engine.

Phase 1B starting baseline: `26d30b9a0b1379d53778c0bc5c92887cc0ae744f`.

## Scope

Code 3 must remain useful on an Android device with intermittent connectivity while treating the owner-authorized canonical API as the future source of truth. Offline support must not create duplicate financial/inventory actions or silently overwrite a newer device.

The active Phase 1B default remains `LOCAL_ONLY`. `REMOTE_ACTIVE` is not enabled for owner data, so the states below are architectural and test contracts for a later sync phase unless an implementation is explicitly marked otherwise.

## Sync states

| State | Meaning |
|---|---|
| `LOCAL` | record exists only in the current local authority or is a local-only draft |
| `SYNCED` | local cache matches the acknowledged server ID and version |
| `PENDING` | a validated mutation is queued but not acknowledged |
| `CONFLICT` | server and queued/local versions diverged and owner review is required |
| `ERROR` | retry stopped because validation, authorization, or repeated transport failure requires action |
| `OFFLINE` | network is unavailable; saved reads/drafts remain available but remote state is unknown |

UI labels must distinguish a saved local draft from a server-confirmed record.

## Cached reads

- The client may cache owner-authorized records with schema version, record ID/version, fetched time, and last-synced time.
- Cache reads show offline or potentially stale state when freshness cannot be verified.
- Signing out prevents another session from reading private cached records unless a separately approved protected-device design exists.
- The cache is not evidence that cloud sync or backup succeeded.
- Cache eviction does not delete the server record.

## Drafts

- Long forms preserve local drafts with schema version and owning workflow identity.
- Drafts do not consume inventory, create purchases, create sales, or trigger external actions.
- A draft submitted after reconnect is revalidated against current server records and rules.
- Signing out ends the application session but must not silently delete business records; draft retention/privacy behavior requires an explicit policy.

## Pending write queue

Every retryable mutation carries:

- a client-generated idempotency key;
- record ID and expected server version when updating;
- operation type and dependency IDs;
- created time and bounded attempt count;
- schema version;
- safe failure category;
- no access token or secret in persisted queue data.

The queue processes in dependency order. A purchase must exist before a purchase lot, and an owned item before a sale line. A failed dependency pauses dependents rather than sending malformed requests.

External buying, offers, bids, messages, and listing publication are never queueable Code 3 actions.

## Retry rules

- Network failure and bounded `5xx` responses may retry with exponential backoff and jitter.
- `429` honors `Retry-After` and provider/application limits.
- `401` pauses and requests sign-in; it does not loop.
- `403` becomes an owner-access error and does not retry automatically.
- `409` becomes `CONFLICT` and never overwrites automatically.
- `4xx` validation failures become `ERROR` until corrected.
- Retries preserve one idempotency key so the server can return the original result instead of duplicating a mutation.
- Retry counts and payload sizes are bounded.

## Optimistic concurrency and conflict UI

A mutable record uses `recordVersion`. The client sends `expectedVersion`; a stale version receives `409` with safe current-version metadata.

The conflict screen shows:

- record identity;
- local and remote updated times/versions;
- field-level differences where safe;
- affected dependent records;
- owner choices to keep local, keep remote, or review manually only after the relevant domain defines how that choice creates an audited correction.

The default is no write. Financial, quantity, purpose, status, notes, and provenance conflicts are never auto-merged.

## Duplicate-submit protection

A future sync-capable server must record bounded idempotency state for mutation keys within an appropriate retention window. Reusing a key with the same request must return the original safe outcome; reusing it with different content must be rejected. Client taps, browser retry, service-worker retry, and server retry must not create duplicate sales, purchases, allocations, returns, expenses, or inventory adjustments.

## Last-synced semantics

`lastSyncedAt` means that a specific server version was acknowledged at that time. It does not mean every Code 3 domain is synchronized, every file is uploaded, or a backup exists. The UI exposes per-record/per-domain state where a global statement would be misleading.

## Files

Offline file capture requires a separately approved bounded local blob strategy. Metadata and bytes have independent states and hashes. A record with an unuploaded receipt/photo remains visibly incomplete. Upload retry requires owner authorization, MIME/size/hash validation, idempotency, and protected storage; none is implemented in Phase 1B.

## Security

- queued operations never persist bearer/refresh tokens or provider credentials;
- replay uses the current verified owner session;
- the server derives owner scope and rejects a queued owner field;
- local caches and queues are minimized and cleared or protected according to a future device-security policy;
- service workers must not cache sensitive API responses marked `no-store`;
- logs include safe IDs/statuses only, never full private records or secrets.

## Transition from local authority

Migration and sync are separate. A successful future migration first verifies remote records while preserving local source data. Only an explicit cutover sets `REMOTE_ACTIVE`; then local repositories become validated caches/adapters, not parallel sources of truth. A read-only fallback period precedes any optional cleanup.

## Future acceptance tests

Before activation, test offline reads, draft persistence, ordered dependencies, idempotent duplicate submission, bounded retries, authentication expiry, authorization denial, rate limiting, stale-version conflict, restart recovery, partial file upload, schema upgrade, sign-out/privacy behavior, and multi-device edits. No sync state may claim `SYNCED` without a matching acknowledged server ID/version.
