# Code 3 Inbox and Order Provider Contract

Status: Phase 2B1 local implementation contract. Live mailbox authorization, message retrieval, and Business Purchase import are not enabled.

This contract governs the secure foundation for a future flow:

`Account Ops alias → provider event → minimized message evidence → Order Candidate → owner review → future Business Purchase`

It does not authorize Code 3 to connect to a real mailbox, retain a duplicate mailbox, or create a Purchase.

## Effective safety boundary

- Existing application and business records remain authoritative in `LOCAL_ONLY` mode.
- `REMOTE_ACTIVE` remains disabled.
- The canonical PostgreSQL schema remains unapplied.
- Provider secrets are a separate server-only concern and never activate canonical owner persistence.
- No real Gmail, Microsoft, IMAP, or other mailbox is contacted in Phase 2B1.
- No provider access token, refresh token, authorization code, OAuth state, PKCE verifier, OTP, reset token, or password may enter React persistence, Account Ops storage, backups, analytics, or client logs.
- All Order Candidates require explicit owner review. No candidate can create a Purchase or inventory record in this phase.

## Trusted runtime

The source-level trusted runtime is the existing Express application exported through `api/[...path].ts`. Provider routes reuse:

- Supabase bearer verification;
- immutable provider-qualified owner-subject authorization;
- exact-origin protected CORS;
- `Cache-Control: no-store`;
- bounded input validation; and
- redacted client errors and diagnostic summaries.

The Phase 2B1 provider runtime is deliberately default-unavailable. Its capability endpoint can report safe provider metadata, but live connection initiation and callback processing remain disabled until both of these server-side dependencies exist:

1. a durable managed secret store for provider grants and refresh tokens; and
2. a durable atomic OAuth-state store that can enforce expiration and one-time consumption across serverless instances.

An in-process map is permitted only as an injected automated-test adapter. It is not an accepted Preview or Production secret/state store.

The repository contains Vercel function entry points, but earlier Preview evidence did not prove that the Express API won route resolution over the SPA fallback. Local tests therefore do not label the provider runtime hosted or OAuth-ready. A future Preview checkpoint must prove that the protected provider endpoint returns JSON with the expected `401`, `403`, and safe authorized response rather than `index.html`.

## Provider capability model

Provider definitions are capability metadata, not connected integrations. A provider may declare support for:

- authorization connection;
- disconnection and revocation;
- bounded message metadata listing;
- retrieval of explicitly required content;
- incremental cursor/history processing;
- provider identity inspection; and
- health inspection.

Unsupported capabilities remain false. Phase 2B1 does not ship a network adapter for Gmail or Microsoft.

Future Gmail work should begin with the narrowest scope that can meet the reviewed use case. Google currently documents `gmail.readonly` as a restricted read scope, so approval, verification, data-use, and retention obligations remain external blockers. Future Microsoft work must compare metadata-only delegated access with `Mail.Read`; `offline_access` permits refresh-token-style continued access but grants no mailbox permission by itself. Phase 2B1 requests none of these scopes. See the official [Gmail scope reference](https://developers.google.com/workspace/gmail/api/auth/scopes) and [Microsoft Graph permission reference](https://learn.microsoft.com/en-us/graph/permissions-reference).

Code 3 must not request permission to send, delete, modify, manage contacts, or access calendars for retailer order intelligence.

## Safe connection projection

The browser may receive only a bounded, non-secret projection:

- opaque `connectionId`;
- provider ID and safe display label;
- connected-account label when supplied safely;
- summarized granted scopes;
- capability flags;
- connection and health status;
- connection, health, and revocation timestamps;
- safe cursor metadata when explicitly approved;
- alias/domain association IDs when relevant; and
- sanitized warnings or error codes.

Provider health states are:

- `DISCONNECTED`
- `CONNECTING`
- `HEALTHY`
- `NEEDS_REAUTH`
- `ERROR`
- `REVOKED`

A local metadata record cannot establish `HEALTHY`. That state requires successful provider verification by the trusted runtime.

## Server-only secret reference

A secret record is never a client record. The server-side abstraction may contain:

- provider ID;
- opaque connection ID;
- managed/encrypted secret reference;
- creation/rotation/revocation timestamps; and
- minimal non-secret lifecycle metadata.

The abstraction must support store, retrieve-for-provider-call, rotate, and revoke semantics without returning secret material to a browser response. Phase 2B1 supplies an unavailable production adapter and an explicitly injected test adapter only. It does not implement home-grown reversible encryption.

## OAuth state and redirect contract

Any future authorization initiation must create cryptographically random, bounded state and store only a digest plus server-trusted metadata. The state record is bound to:

- the verified `AuthPrincipal` provider and immutable subject;
- one provider;
- one exact allowlisted redirect URI;
- one issued and expiration window; and
- one unused state identifier.

Callback handling must atomically consume the state once. Missing, malformed, expired, already-used, wrong-owner, wrong-provider, or wrong-redirect state fails closed. Browser-supplied owner IDs, roles, emails, session fields, or entitlement values never establish provider ownership.

## Normalized message event

The Phase 2B1 client domain stores minimized normalized evidence under a separate versioned source, `code3.inbox-order.v1`. It does not modify the strict eight-collection `code3.account-ops.v1` schema.

A normalized message event supports:

- stable event ID;
- opaque provider connection ID;
- provider message and optional thread IDs;
- normalized sender address and domain;
- recipient/alias-match result;
- bounded subject and received timestamp;
- category, retailer, account, and order-reference proposals;
- shared `HIGH`, `MEDIUM`, `LOW`, or `INSUFFICIENT` confidence;
- per-field provenance;
- warnings and contradictions;
- deterministic source hash; and
- processing-method version.

Supported categories are:

- `VERIFICATION`
- `ORDER_CONFIRMATION`
- `SHIPPED`
- `DELIVERED`
- `CANCELLED`
- `REFUND`
- `RETURN`
- `PICKUP`
- `PASSWORD_SECURITY`
- `RETAILER_NOTICE`
- `OTHER`
- `PROTECTED`

Classification is advisory. A sender display name alone cannot create high-confidence retailer identity.

## Protected-message handling

Messages that may contain an OTP, one-time code, password reset, login link, recovery data, or similar security content are minimized before hashing or persistence. Code 3 retains only safe facts such as:

- provider/message identity;
- received timestamp;
- safe sender domain;
- protected category and reason codes; and
- safe relationship IDs.

The protected value, raw body, sensitive URL, body-derived hash, notification excerpt, or fixture output is not retained. Short secrets are not hashed as a substitute for deletion because their small search space can permit enumeration.

Unrelated personal messages remain `OTHER` and cannot produce an Order Candidate.

## Retention and content minimization

| Data class | Phase 2B1 treatment |
|---|---|
| Safe connection metadata | Server projection only; retained only by a future approved connection store |
| Provider secrets and OAuth state | Server-only abstraction; no durable adapter enabled |
| Normalized retailer/order evidence | Versioned local metadata for synthetic and owner-reviewed use |
| Raw message body | Not persisted by default |
| Protected code/link/content | Never retained |
| Sanitized processing error | Bounded code/message only |
| Owner correction | Retained with timestamp and `OWNER_ENTERED` provenance |

Phase 2B1 does not create a permanent duplicate mailbox.

## Alias and retailer matching

An exact normalized recipient match may propose an Account Ops alias, profile, retailer account, and retailer. It proves only which local alias metadata matches the recipient. It does not prove sender authenticity or that the message belongs to the alias-associated retailer.

Retailer identification may consider:

- normalized sender address and domain;
- an explicit trusted sender-domain/identity rule;
- exact alias association;
- known retailer directory identity;
- subject patterns; and
- contradictions among those facts.

Disabled, archived, errored, failed, missing, or ambiguous aliases produce warnings and cannot establish a healthy provider connection. Owner corrections remain distinct from inferred proposals.

## Order Candidate

An Order Candidate is external evidence awaiting owner review. It supports:

- stable candidate ID and record version;
- provider connection and source event IDs;
- retailer, store account, alias, and profile proposals;
- external order ID and ordered time;
- exact-minor-unit line items, subtotal, discount, tax, shipping, refund, and total;
- one currency per calculation;
- fulfillment type, pickup/store reference, and tracking references;
- normalized and safe provider raw status;
- confidence, warnings, contradictions, and per-field provenance;
- source hash, candidate version, and processing version;
- append-only event/review history; and
- review state.

Normalized order states are:

- `DETECTED`
- `CONFIRMED`
- `PROCESSING`
- `SHIPPED`
- `PARTIALLY_SHIPPED`
- `READY_FOR_PICKUP`
- `DELIVERED`
- `CANCELLED`
- `PARTIALLY_CANCELLED`
- `RETURNED`
- `REFUNDED`
- `PARTIALLY_REFUNDED`
- `UNKNOWN`

Review states are `NEW`, `NEEDS_REVIEW`, `CONFIRMED`, `CORRECTED`, `REJECTED`, and reserved `IMPORTED_FUTURE`.

Every new or materially changed candidate requires owner review. An explicit owner confirmation or rejection may clear `ownerReviewRequired`; later provider evidence that changes the proposal sets it again. Every candidate always retains:

- an `ownerReviewRequired` value consistent with the current review state;
- `automaticImportAllowed: false`; and
- `purchaseCreated: false`.

## Exact money behavior

Money reuses the Phase 1C safe-integer minor-unit contract. Decimal source text is parsed without floating-point arithmetic and rejects malformed or excess precision. Discounts and refunds are nonnegative semantic amounts. Mixed currencies block reconciliation. A mismatch between components and a stated total creates a warning; Code 3 does not silently rewrite either value.

## Idempotency and reconciliation

Primary event identity is the scoped pair:

`providerConnectionId + providerMessageId`

Reprocessing the same identity and source hash never creates another message or candidate. If an earlier local operation was interrupted after one write, the retry deterministically repairs only missing candidate/history/activity links; a fully complete retry is a no-op. Reusing a provider message ID on a different connection is distinct. A changed hash for the same scoped message identity is retained as a revision/conflict rather than silently overwritten.

Trustworthy order reconciliation uses the provider connection, retailer identity, and external order ID. Order confirmation, shipment, delivery, cancellation, return, and refund evidence append to one candidate history when those identities match. Missing IDs remain message-scoped and require review. Same-order evidence across aliases or connections is reported rather than silently merged.

Partial and out-of-order lifecycle messages are evidence, not a simple numeric status rank. Prior source evidence and owner corrections are never destroyed.

## Owner review and corrections

The owner may confirm, correct, or reject a candidate. A correction event records:

- field path;
- prior proposal;
- corrected value;
- timestamp;
- correction reason when provided; and
- `OWNER_ENTERED` provenance.

Later provider reconciliation may update system proposals and warnings but cannot overwrite a confirmed owner value.

## Future Purchase mapping

Phase 2B1 may describe a pure mapping preview from reviewed candidate fields to a future Purchase and Purchase Lot. It does not call the existing Business/Flip Scout purchase repository and does not write purchases, lots, inventory, receipts, sales, or files.

Actual import requires a later approved phase with:

- explicit owner confirmation;
- conversion from exact minor units into the approved Purchase money schema;
- stable source/import identity;
- duplicate prevention;
- receiving workflow integration; and
- rollback/reconciliation tests.

## Local persistence and recovery

The safe local source contains only:

- minimized message events;
- Order Candidate projections;
- append-only candidate/review events; and
- sanitized activity summaries.

It uses the existing persistence gateway fixed to `LOCAL_ONLY`, stable IDs, validation, archive semantics where relevant, and record versions. Caller input cannot select remote mode, sync, owner authority, migration apply, or rollback execution.

Backup Format v1 includes this validated non-secret source as the nineteenth local section, raising the registry to 23 total sources with four excluded/conditional. It excludes provider secrets, OAuth state/codes/verifiers, sessions, tokens, raw bodies, protected content, OTPs, passwords, and security links. Restore Preview remains zero-write. Every Phase 2B1 source path is `REQUIRES_MAPPING`; no canonical domain or migration is approved.

## Disconnect and revocation

A future disconnect must:

1. mark the safe connection projection disconnected or revoked;
2. stop future provider reads;
3. attempt provider revocation when the provider supports it;
4. revoke/remove the managed secret reference; and
5. retain only permitted normalized, owner-reviewed historical business evidence.

Disconnect never deletes an owner-reviewed Purchase or other legitimate business record. Phase 2B1 tests the contract with injected fakes but exposes no live provider connection.

## Owner-only API surface

The Phase 2B1 status/capability route is under `/api/account-ops/provider-connections`, before legacy wildcard CORS, and requires server-verified OWNER authorization. It returns only capability truth and safe connection projections with `Cache-Control: no-store`.

There is no active browser route that accepts provider tokens, OAuth codes, OAuth state, or owner identifiers. Connection and callback routes remain unavailable until the durable server dependencies and hosted route behavior are separately verified.

## Explicit non-goals

Phase 2B1 does not implement:

- live Gmail, Microsoft, IMAP, or other mailbox authorization;
- mailbox sending, deletion, modification, or bulk actions;
- raw mailbox mirroring;
- automatic Purchase or inventory creation;
- provider-token storage in the browser or backup;
- canonical database activation, migration, sync, or cutover;
- Bot provider integration;
- billing or subscriptions;
- purchasing, checkout, offer, bid, CAPTCHA/OTP bypass, or retailer-limit evasion; or
- Preview or Production deployment.

## Gate for a future Phase 2B2

Live provider work remains blocked until a separately approved task proves:

- one durable managed secret store;
- one durable atomic replay-resistant OAuth-state store;
- exact Preview callback/origin/redirect configuration;
- reachable owner-protected Vercel API behavior;
- provider registration and minimum-scope approval;
- disconnect/revocation behavior against a test account;
- retention/deletion and audit policy;
- redacted observability; and
- an explicit owner-controlled import review that still cannot auto-create a Purchase.
