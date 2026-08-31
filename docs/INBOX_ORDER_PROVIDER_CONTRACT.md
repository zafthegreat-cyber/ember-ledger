# Code 3 Inbox and Order Provider Contract

Status: Phase 2B1 and Phase 2B2-B are published through `b4848cb851b2be83093fbdc4ed4b976857f9d3ff`. The separate Phase 2B2-B.1 operational proof is paused. A Free Upstash resource and three branch-scoped Preview secrets exist, but the remaining owner/CORS/activation configuration is absent, no follow-up Preview was deployed, and `hostedRuntimeVerified=false`. Live mailbox authorization, message retrieval, and Business Purchase import are not enabled. Phase 2D-A Bot Checkout Evidence remains a separate local source and does not use this provider runtime.

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

The trusted runtime is the existing Express application. Phase 2B2-A adds exact filesystem functions at `api/auth/session.ts` and `api/account-ops/provider-connections.ts`; each only exports `backend/src/server.ts`. Provider routes reuse:

- Supabase bearer verification;
- immutable provider-qualified owner-subject authorization;
- exact-origin protected CORS;
- `Cache-Control: no-store`;
- bounded input validation; and
- redacted client errors and diagnostic summaries.

The provider runtime remains default-unavailable. Its capability endpoint can report safe provider metadata, but live connection initiation and callback processing remain disabled. Phase 2B2-B supplies code adapters for both server-side dependencies:

1. a durable managed secret store for future provider grants and refresh tokens; and
2. a durable atomic OAuth-state store that enforces expiration and one-time consumption across serverless instances.

The adapters target a separately configured Upstash Redis resource in Preview. Selection requires exact Vercel Preview markers and exact server-owned project/branch matches; the effective namespace appends a project/branch-derived hash. Connection metadata uses an owner-scoped hash family. Secret material is stored in a separate owner/connection key family only after Code 3 encrypts it with AES-256-GCM, a fresh IV/authentication tag, key-version metadata, and associated owner/provider/connection/reference data. OAuth state uses a random value returned once, persists only its SHA-256 digest and hashed bindings, and uses Lua to issue/consume atomically. An in-process map remains permitted only as an injected automated-test adapter and is never a hosted fallback.

The Free Upstash resource is provisioned and three managed-store values are configured as branch-scoped Preview secrets, but Supabase owner/auth values and the remaining Preview CORS/activation/runtime values are absent. No follow-up Preview, provider secret, OAuth state, or connection record exists, and `hostedRuntimeVerified=false`. Phase 2B2-B.1 remains paused pending the owner's explicit `Supabase signed in.` confirmation. No claim is made about platform encryption at rest. The resource is isolated provider-security infrastructure; it is not canonical business persistence or a Bot credential store.

`backend/src/providerRuntime/trustedRuntime.ts` derives a bounded Preview proof only from exact server `VERCEL=1` and `VERCEL_ENV=preview` markers. The proof does not accept request, browser, role, owner, query, or entitlement input and does not expose deployment/environment details. Production, hosted-unknown, local, and test execution cannot satisfy it.

The proof remains independent from provider readiness. Even after authenticated owner and managed-store health are verified, runtime `available` remains false until a separately approved live provider adapter exists. Gmail and Outlook remain not configured, all provider capabilities remain false, and there is no network adapter. A frontend `Ready` state is insufficient evidence. See [PREVIEW_TRUSTED_RUNTIME_CONTRACT.md](./PREVIEW_TRUSTED_RUNTIME_CONTRACT.md).

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

The abstraction supports store, retrieve-for-provider-call, and revoke semantics without returning secret material to a browser response. Phase 2B2-B adds a Preview-only implementation whose secret envelope is encrypted with AES-256-GCM before it reaches Redis. The 32-byte application encryption key and key-version label are server environment configuration and are never stored in the same envelope. Metadata and secrets remain separate. The implementation does not claim that key rotation is complete merely because a version field exists, and it makes no claim about provider-platform encryption at rest.

## OAuth state and redirect contract

Any future authorization initiation must create cryptographically random, bounded state and store only a digest plus server-trusted metadata. Phase 2B2-B implements this storage contract without exposing an initiation or callback route. The state record is bound to:

- the verified `AuthPrincipal` provider and immutable subject;
- one provider;
- one exact allowlisted redirect URI;
- one issued and expiration window; and
- one unused state identifier.

Callback handling must atomically consume the state once. The managed adapter uses one Redis Lua transaction to validate expiry/provider/hashed owner/hashed exact redirect, delete live state, remove its owner index entry, and write a short-lived used marker. Missing, malformed, expired, already-used, wrong-owner, wrong-provider, or wrong-redirect state fails closed. Expired index entries are removed during issue and Redis TTL bounds residual keys. Browser-supplied owner IDs, roles, emails, session fields, or entitlement values never establish provider ownership.

Hosted managed-storage verification requires the exact durable store kinds and bounded ephemeral readiness operations: connection metadata write/read/delete, encrypted secret write/decrypt/delete, and atomic OAuth-state write/read/delete. `PING`, configured environment names, or test-memory adapters are not readiness proof.

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
| Safe connection metadata | Phase 2B2-B Preview-only durable adapter implemented; approved Free Upstash resource exists, but runtime activation/deployed proof remain paused and no connection record exists |
| Provider secrets and OAuth state | Preview-only encrypted-secret and atomic digest-state adapters implemented; three required managed-store variables are Secret and branch-scoped to Preview, but no provider secret or OAuth state has been provisioned |
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

## Phase 2D-A Bot Checkout Evidence relationship

`code3.bot-ops.v1.checkoutEvidence` is a separate evidence class and storage source. It is not written into `code3.inbox-order.v1`, is not a normalized mailbox message, and does not silently create or merge an Order Candidate.

Bot Checkout Evidence may retain bounded provider/installation/task/attempt/product/retailer/account/profile relationships, quantity, expected amount/currency, an external reference when supplied safely, time, confidence, warnings, provenance, source hash, and owner review/correction state. It excludes provider credentials, retailer authentication, payment credentials, proxy credentials, raw provider payloads/logs, and credential-bearing URLs.

Provider event idempotency is scoped by provider + installation + provider event ID. This differs deliberately from mailbox event identity, which is scoped by provider connection + message ID. Reusing the same provider event ID on another Bot installation is distinct. Cross-source Bot/email evidence is never merged merely because retailer/order text looks similar.

A future separately approved reconciliation service may compare reviewed Bot Checkout Evidence with an Order Candidate or another external order source. It must retain each source independently, report conflicts, use stable reconciliation/import identities, and require explicit OWNER confirmation before any Purchase. Phase 2D-A implements no cross-source write or Purchase mapping.

```text
Bot Success != Purchase
Bot Checkout Evidence != Order Candidate
Bot Checkout Evidence != Purchase
```

See [BOT_INTEGRATION_CONTRACT.md](./BOT_INTEGRATION_CONTRACT.md).

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

Backup Format v1 includes this validated non-secret source as the nineteenth local section. Phase 2D-A adds a separate twentieth local Bot Operations section, raising the registry to 24 total sources with four excluded/conditional. Both exclude provider/Bot/retailer/payment/proxy secrets, OAuth state/codes/verifiers, sessions, tokens, raw bodies/provider payloads/logs, protected content, OTPs, passwords, credential-bearing URLs, and security links. Restore Preview remains zero-write. Every Phase 2B1 and Phase 2D-A source path is `REQUIRES_MAPPING`; no canonical domain or migration is approved.

## Disconnect and revocation

A future disconnect must:

1. mark the safe connection projection disconnected or revoked;
2. stop future provider reads;
3. attempt provider revocation when the provider supports it;
4. revoke/remove the managed secret reference; and
5. retain only permitted normalized, owner-reviewed historical business evidence.

Disconnect never deletes an owner-reviewed Purchase or other legitimate business record. Phase 2B1 tests the lifecycle contract with injected fakes. Phase 2B2-B adds durable metadata/disconnect and managed secret-deletion behavior, still with no live provider connection or provider-specific revocation proof.

## Owner-only API surface

The Phase 2B1 status/capability route is under `/api/account-ops/provider-connections`, before legacy wildcard CORS, and requires server-verified OWNER authorization. Phase 2B2-A maps its exact public path to that canonical Express route. It returns only bounded runtime proof, capability truth, and safe connection projections with `Cache-Control: no-store`.

There is no active browser route that accepts provider tokens, OAuth codes, OAuth state, or owner identifiers. Connection and callback routes remain unavailable. Local durable-adapter code does not authorize a real provider flow.

## Explicit non-goals

Phase 2B1, Phase 2B2-A, and Phase 2B2-B do not implement:

- live Gmail, Microsoft, IMAP, or other mailbox authorization;
- mailbox sending, deletion, modification, or bulk actions;
- raw mailbox mirroring;
- automatic Purchase or inventory creation;
- provider-token storage in the browser or backup;
- canonical database activation, migration, sync, or cutover;
- live Bot provider integration, Bot credentials, task control, checkout, or Bot-to-Purchase import; Phase 2D-A local contracts remain a separate source;
- billing or subscriptions;
- purchasing, checkout, offer, bid, CAPTCHA/OTP bypass, or retailer-limit evasion; or
- Production deployment or promotion.

## Gate for a future Phase 2B2-C

Live provider work remains blocked until a separately approved task proves:

- a provisioned and healthy Preview resource behind the durable managed secret and atomic replay-resistant OAuth-state adapters;
- exact Preview callback/origin/redirect configuration;
- the exact owner-protected Vercel API behavior with a legitimate authenticated owner and `hostedRuntimeVerified=true`;
- provider registration and minimum-scope approval;
- disconnect/revocation behavior against a test account;
- retention/deletion and audit policy;
- redacted observability; and
- an explicit owner-controlled import review that still cannot auto-create a Purchase.

The approved Free Upstash resource and three branch-scoped Preview secrets exist. Phase 2B2-B.1 remains paused pending Supabase sign-in; Supabase owner/auth and remaining CORS/activation/runtime values are absent, no follow-up Preview was deployed, and `hostedRuntimeVerified=false`. Phase 2B2-C must not work around that gate with browser storage, committed secrets, a hosted in-memory store, the canonical business database, or `REMOTE_ACTIVE`.
