# Code 3 Preview Trusted Runtime Contract

Status: Phase 2B2-A is published at `c379416336e32a67346c7a3bb95f7b6469f679f5` with partial hosted verification. Phase 2B2-B locally adds Preview-only managed connection, encrypted-secret, and OAuth-state adapters plus stricter exact-origin parsing. The Upstash marketplace resource could not be provisioned without accepting required marketplace terms, and no authenticated owner plus exact durable-store readiness request has been proven. Therefore `hostedRuntimeVerified=false`. This contract does not authorize Production, live provider OAuth, mailbox reads, canonical persistence, or business-record mutation.

## Purpose

Phase 2B2-A proves one narrow path:

```text
Code 3 browser
→ exact Vercel Preview function
→ canonical Express application
→ Supabase identity verification
→ immutable-subject OWNER authorization
→ provider runtime status
→ bounded JSON capability truth
```

A working SPA, successful frontend build, or Vercel `Ready` state is not this proof.

## Exact Preview mapping

The existing filesystem-before-SPA order in `vercel.json` is retained. Two exact Vercel Function entry points remove reliance on the previously ambiguous catch-all for the owner session and provider status paths:

- `api/auth/session.ts` → `backend/src/server.ts`
- `api/account-ops/provider-connections.ts` → `backend/src/server.ts`

Each entry point only imports and exports the canonical Express app. It contains no copied authentication, provider, or business logic. The Express app does not call `listen()` when `VERCEL=1`.

The generic `api/[...path].ts` remains compatibility code. Phase 2B2-A does not remap the entire legacy Express surface, change the Vercel framework, or make legacy APIs part of the trusted provider proof.

## Server execution proof

`backend/src/providerRuntime/trustedRuntime.ts` derives proof exclusively from server process state. A request is a verified Phase 2B2-A Preview execution only when both conditions are exact:

```text
VERCEL = 1
VERCEL_ENV = preview
```

The response projection is bounded to:

```text
proofVersion
execution = SERVER
environment
previewEnvironment
productionEnvironment
providerRuntimeLoaded
providerNetworkAccessEnabled
hostedRuntimeVerified
```

It does not expose environment contents, deployment/project/team identifiers, URLs, regions, owner configuration, identity claims, tokens, or stack traces. Headers, query parameters, bodies, local storage, client roles, and entitlement metadata cannot influence the proof.

Production, hosted-unknown, incomplete Vercel markers, local development, and automated tests do not satisfy the Preview proof. Test code may inject deterministic server environments, but that is not hosted verification.

## Provider readiness remains separate

`hostedRuntimeVerified=true` means only that a legitimate authenticated owner reached the protected provider runtime in Vercel Preview and all three configured managed-store health checks succeeded. It does not mean a provider is usable.

Phase 2B2-B keeps all of these states:

- provider runtime `available=false`;
- Gmail `NOT_CONFIGURED` / `UNAVAILABLE`;
- Outlook / Microsoft `NOT_CONFIGURED` / `UNAVAILABLE`;
- every live provider capability `false`;
- no provider adapter or SDK;
- connection, secret, and OAuth-state stores unavailable in the current deployment because no managed resource/configuration is provisioned;
- no live connection or provider health claim;
- `providerNetworkAccessEnabled=false`;
- automatic Purchase creation `false`;
- `LOCAL_ONLY` business data authoritative.

The Account Ops Connections UI may show `Trusted runtime available` only from the complete protected proof. It separately shows Gmail and Outlook as not configured and offers no active Connect action.

## Authentication, CORS, and failure behavior

The proof route reuses the existing server controls:

- Supabase `auth.getUser()` bearer verification;
- exact provider-qualified owner subject matching;
- `401` for missing/invalid/expired authentication;
- `403` for an authenticated non-owner;
- exact-origin protected CORS with `Vary: Origin`;
- `Cache-Control: no-store` and `Pragma: no-cache`;
- bounded request parsing and owner rate limiting;
- generic/redacted errors.

An authorized Preview request may contact Supabase solely to verify Code 3 identity. The provider-status operation makes no Gmail, Outlook, or mailbox-provider call.

Missing Preview auth or managed-store configuration fails closed. Local-development and automated-test identities/stores cannot activate in Preview or Production. Vercel deployment protection is an outer barrier, not Code 3 authorization.

Phase 2B2-B canonicalizes allowed origins to exact scheme/host/port values. It rejects wildcard or `null` origins, credentials, paths, trailing slashes, queries, fragments, malformed values, and arbitrary `*.vercel.app` matching. Preview reads only `CODE3_CORS_PREVIEW_ORIGINS` and does not inherit `CODE3_CORS_ALLOWED_ORIGINS`; Production reads only the general list and does not inherit Preview origins.

## Data and side effects

The proof path does not query or migrate PostgreSQL, apply Supabase migrations, write canonical data, activate `REMOTE_ACTIVE`, read mailbox content, persist provider credentials, create an Order Candidate, create a Purchase, or create/receive Inventory. Importing the canonical Express app constructs existing modules, but this exact request does not invoke their data routes.

`Order Candidate != Purchase` remains mandatory.

## Phase 2B2-B managed-store contract

The source contains one Preview-only managed-store selector. It activates only during real hosted execution with exact `VERCEL=1`, `VERCEL_ENV=preview`, `CODE3_PROVIDER_MANAGED_STORE_ENABLED=true`, exact matches between configured and server-owned Vercel project/Git-branch identifiers, and every required server value validated. The effective namespace appends a hash derived from the project ID and branch. Production, hosted-unknown, local-development, wrong project/branch, and ordinary automated-test runtime select unavailable stores; managed-store tests must explicitly inject their fake transport and hosted runtime never falls back to memory.

The target transport is the official Upstash Redis REST client with client telemetry disabled. Its roles are separated by key family:

- owner-scoped validated connection metadata in a Redis hash;
- owner/connection-scoped secret envelopes encrypted by Code 3 with AES-256-GCM before storage; and
- SHA-256-digest OAuth-state records plus owner expiry indexes and short-lived used-state markers.

The secret envelope includes a fresh 96-bit IV, authentication tag, key-version label, and associated owner/provider/connection/reference data. The exact 32-byte application encryption key is supplied through server environment configuration and is not stored with ciphertext. This contract does not assert platform encryption at rest because no resource has been provisioned or independently verified.

OAuth state issuance is capacity-bounded and TTL-backed. A Redis Lua script atomically validates expiry, provider, hashed owner binding, and hashed exact redirect before deleting state and writing a temporary replay marker. The raw state, provider authorization code, PKCE verifier, token, and owner subject are not stored in ordinary client or backup data.

Hosted readiness is stronger than `PING`: the runtime requires exact durable store kinds, then performs bounded owner-scoped connection metadata write/read/delete, encrypted secret write/decrypt/delete, and atomic OAuth state write/read/delete operations. Readiness keys are short-lived and removed in the operation. A configured variable, a successful transport ping, or a test-memory store cannot set `hostedRuntimeVerified=true`.

Current operational status is `NOT_PROVISIONED`. Upstash marketplace creation is blocked by required marketplace-terms acceptance. No Redis resource, environment secret, connection record, encrypted secret, or OAuth-state record was created during local implementation. Project-wide Preview resource secrets are unacceptable because they could authorize unrelated Preview branches; operational proof requires a dedicated Preview project/resource or branch-scoped environment values that satisfy the exact project/branch gate.

## Verification gate

`hostedRuntimeVerified` is accepted as hosted evidence only when an exact candidate Preview demonstrates:

1. the deployment is Preview and not Production;
2. the exact provider URL returns JSON rather than the SPA;
3. no application identity returns `401` through Express;
4. a valid non-owner returns `403` when a safe test identity is available;
5. a verified owner receives `200` with Preview/non-Production proof;
6. exact durable store kinds are selected and all three bounded write/read/delete readiness operations succeed in that authenticated request;
7. Gmail and Outlook remain not configured with all live capabilities false;
8. response headers are no-store and no credential/claim/configuration data is present;
9. the normal SPA and owner-gated Account Ops route still load;
10. no provider network call, database migration, owner-data change, or Production promotion occurs.

If deployment protection, missing Preview auth variables, absent owner credentials, or project-linking prevents the complete proof, Code 3 must report the limitation and must not infer success from a frontend deployment.

### 2026-08-27 Preview evidence

- Vercel reports the exact-candidate deployment as `READY` with target `preview`. It was rebuilt after the temporary CLI verification bypass was revoked, so that credential is not part of the final Preview build.
- `/` renders `Code 3 — Home`; direct `/account-ops/connections` navigation reaches the application sign-in boundary.
- `/api/auth/session` returns bounded JSON with `authenticated=false`, `ownerAuthorized=false`, and `configurationState=AUTH_NOT_CONFIGURED`, plus `Cache-Control: no-store` and Express response headers.
- `/api/account-ops/provider-connections` returns bounded JSON `401 authentication_required`, including when a synthetic client role query is supplied. It is not the SPA fallback.
- The deployed build contains the exact Node functions for both paths and completed cleanly under Vercel's TypeScript checker.
- No valid owner request was possible because the server-only Preview authentication and owner-allowlist variables are not configured. The protected response therefore cannot yet attest Gmail/Outlook status from hosted execution, and `hostedRuntimeVerified` remains `false`.
- No provider credential, provider adapter, provider network call, mailbox connection, database migration, owner-data write, or Production promotion was used.

## State progression

| State | Current Phase 2B2-B status | Meaning |
|---|---|---|
| SPA Preview | Existing | Static application can load; not API proof |
| Trusted Preview runtime | Partially verified; `hostedRuntimeVerified=false` | Exact Express route and fail-closed auth execute in Preview; legitimate owner plus healthy managed-store proof remains blocked by missing operational configuration/resource |
| Managed secret/state storage | Adapter implemented locally; resource not provisioned | Preview-only Redis connection metadata, AES-256-GCM secret envelopes, and atomic digest-state code exist; required Upstash terms block operational proof |
| Live provider authorization | Missing | Approved OAuth client, scopes, callback, and revocation |
| Mailbox ingestion | Missing | Provider reads, cursors/webhooks/polling, minimization, retention |
| Production runtime | Prohibited in Phase 2B2-B | Separately reviewed Production authorization and deployment |

## Phase 2B2-C boundary

A separately approved Phase 2B2-C may provision the reviewed Preview resource/configuration after required marketplace terms are accepted and complete the authenticated OWNER plus managed-store health proof. It must not infer authorization from source/tests or work around provisioning with browser storage, committed secrets, in-memory hosted state, the canonical business database, or `REMOTE_ACTIVE`. Gmail/Outlook OAuth, callback routes, provider SDKs, message reads, Order Candidate ingestion from a real mailbox, Purchase import, remote canonical persistence, Bot providers, billing, and Production remain separately authorized work.
