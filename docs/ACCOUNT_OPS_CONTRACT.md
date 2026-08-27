# Code 3 Account Ops Contract

Status: Phase 2A local-first implementation published at `c76e3e4bc668c08d9a0908c9bb2cd96444610297`. Phase 2A.5 changes its product-workspace placement, not its security or provider boundary. This contract does not authorize canonical persistence, database migration, synchronization, retailer automation, mailbox access, purchasing, or Production deployment.

Starting baseline: `af21199f610cc91e31d9dee59af6f0a2f748ab79`.

## Purpose

Account Ops is Code 3's private, owner-managed business-operations area for legitimate profiles, generated email-alias metadata, retailer-account records, assisted setup, verification state, account health, and account-related tasks.

The workflow is:

```text
Profile
  -> email alias metadata
  -> retailer account record
  -> owner-assisted setup and verification
  -> account health and tasks
  -> future reviewed inbox/order evidence
```

It is not an account-farming, retailer-limit-evasion, automatic-signup, verification-bypass, or checkout system.

## Phase boundary

Phase 2A keeps the Phase 1B persistence contract unchanged:

- `LOCAL_ONLY` is authoritative;
- `MIGRATION_PREVIEW` remains read-only;
- `REMOTE_ACTIVE` remains disabled and requires `OWNER_CONFIRMED_CUTOVER` in a separately approved phase;
- the canonical SQL schema remains unapplied;
- no owner record, file byte, password, or credential is migrated;
- no remote adapter or synchronization engine is supplied for Account Ops.

The Account Ops repository is loaded only after the verified application session reports OWNER authorization. That client gate prevents accidental display in the normal UI, but browser storage is not a server authorization boundary. A future remote implementation must derive owner scope from the verified server principal and must never accept it from an Account Ops record.

## Navigation and UI

Account Ops is a first-class, lazy-loaded private route family with canonical routes:

```text
/account-ops
/account-ops/profiles
/account-ops/emails
/account-ops/accounts
/account-ops/tasks
```

Under the Phase 2A.5 product-workspace architecture, Account Ops is associated with Business for navigation and route context. That association is descriptive only: Business workspace access does not grant Account Ops access, and Account Ops retains `VERIFIED_OWNER` authorization before `code3.account-ops.v1` is loaded. Account Ops may appear in Business navigation only for an authorized OWNER and remains available through the authenticated owner affordance. A direct URL renders the same compact Sign In Required, Owner Access Required, or unavailable state as other private owner surfaces.

Account Ops is not part of Bot, and moving between workspaces does not move or duplicate its records. The global product-workspace switcher cannot bypass its gate. Owner Center remains a separate private administration surface. See [WORKSPACE_ARCHITECTURE_CONTRACT.md](./WORKSPACE_ARCHITECTURE_CONTRACT.md).

The internal sections are Overview, Profiles, Emails, Store Accounts, and Tasks. Mobile uses compact cards, bounded search/filter controls, progressive disclosure, 44-pixel targets, and safe wrapping for long aliases and retailer names. Desktop may use a compact table, but it does not add extra dashboards merely to fill space.

Inbox and Orders are contract-only in Phase 2A and do not appear as working navigation destinations.

## Local data source

The versioned browser document uses the compatibility key `code3.account-ops.v1` and schema version 1. Its record collections are:

- `profileGroups`;
- `profiles`;
- `emailDomains`;
- `emailAliases`;
- `retailers` for owner-created directory entries;
- `storeAccounts`;
- `tasks`;
- `activity`.

Each writable collection uses the Phase 1B local collection data source and a persistence gateway constructed explicitly in `LOCAL_ONLY`. Callers cannot supply a persistence mode, remote adapter, request transport, owner subject, session, token, role, or authorization context. Records use stable IDs, timestamps, record versions, optimistic updates, and archive state rather than destructive deletion.

Static retailer presets are application metadata and do not claim verified signup, provisioning, inbox, or order capabilities. Owner-created retailer entries are persisted and backed up.

## Profile contract

An Account Ops profile is reusable owner-managed business metadata. It is intentionally separate from the Supabase authentication profile and cannot authenticate or authorize Code 3.

Supported profile fields include display name, user-created group, full/business name, email preference, phone, shipping and billing addresses, notes, active/archive state, timestamps, and record version. Names and groups are never seeded with real people. Copy actions are explicit owner actions.

Profiles can relate to aliases, store accounts, and tasks. Archive preserves those records and produces an explainable health warning where an active dependent still refers to the archived profile.

## Email alias contract

Alias generation supports bounded owner-configured templates using approved tokens such as store, profile, random suffix, and sequence. It does not derive local parts from unapproved sensitive profile fields. Random suffixes use Web Crypto or an explicitly injected deterministic test source; insecure `Math.random` fallback is prohibited.

Generation validates:

- domain syntax and length;
- local-part characters and length;
- complete address length;
- supported template tokens;
- duplicate/collision state within the owner registry;
- bounded regeneration attempts.

An alias record separates lifecycle from delivery capability:

- lifecycle: `ACTIVE`, `PENDING`, `DISABLED`, or `ERROR`;
- provisioning: generated local metadata, catch-all coverage, provider provisioned, receiving confirmed, or provider error.

`Generated` means only that Code 3 created local metadata. It must never be presented as provisioned or receiving mail. Catch-all and provider-managed states require explicit owner/provider evidence.

## Email provider boundary

The provider-neutral adapter types are:

- `LOCAL_METADATA_ONLY`;
- `CATCH_ALL`;
- `PROVIDER_MANAGED`.

Capabilities are declared independently for creating, disabling, checking, routing/forwarding, and listing messages. Phase 2A implements safe local metadata and contracts only. It does not expose provider credentials in the browser, call an email API, provision a mailbox, or parse messages.

Domain configuration is owner metadata. Examples use placeholders only; no real business domain is hard-coded.

## Retailer directory and store accounts

A retailer entry carries a stable retailer ID, display name, optional official URLs, notes, icon metadata, explicit capability metadata, and an `automatedProvisioning: false` boundary unless a future approved provider proves otherwise. Custom retailers are supported.

A store-account record can reference one retailer, profile, and alias. It records username metadata, display name, status, verification state, setup stage, manually supplied activity times, notes, archive state, and an optional credential reference. It never contains a plaintext password, OTP, session, payment-card detail, or provider token.

Statuses are:

- `SETUP`;
- `NEEDS_VERIFICATION`;
- `READY`;
- `NEEDS_ATTENTION`;
- `LOCKED`;
- `DISABLED`;
- `ARCHIVED`.

Existence alone does not imply health, verification, or retailer acceptance.

## Credential and password boundary

Code 3 stores only credential metadata:

```text
CredentialReference
  provider
  referenceId
  label
  lastUpdatedAt
```

Recognized provider states include external password manager, operating-system secure store, and unavailable. A reference does not prove that the secret exists or can be recovered.

The password generator creates a strong, bounded password for immediate owner use. It uses secure randomness, supports required character classes, and remains only in ephemeral UI memory. Regeneration replaces that ephemeral value. Code 3 does not persist, log, analyze, back up, place in a URL, or automatically submit the generated password. The UI warns that an unsaved generated password cannot be recovered.

## Assisted setup and human verification

The tracked setup stages are:

1. `PREPARED`;
2. `SIGNUP_OPENED`;
3. `EMAIL_VERIFICATION`;
4. `PHONE_VERIFICATION` when required;
5. `OWNER_CONFIRMATION`;
6. `READY`.

Code 3 may generate local alias metadata, create an ephemeral password, copy ordinary profile fields, open an owner-configured legitimate HTTPS retailer URL, present a checklist, and retain owner-confirmed progress.

Code 3 does not submit retailer signup forms, solve or bypass CAPTCHA, intercept or bypass OTP, fabricate email/phone verification, rotate identities to evade enforcement, create accounts in bulk, or circumvent retailer household/account/purchase limits. The owner must complete security challenges and confirm the resulting state. `READY` requires the defined checklist evidence and explicit owner confirmation; it is never inferred from account existence.

## Account health

Account health is a pure, explainable derivation:

- `HEALTHY`;
- `NEEDS_ATTENTION`;
- `PROBLEM`;
- `UNKNOWN`.

Signals include incomplete setup, pending verification, missing or archived relationships, missing credential reference, stale owner verification, security/password-reset notice, locked/disabled account, disabled/error alias, duplicate alias conflict, and unresolved task. Every nonhealthy result identifies its reasons. Code 3 does not infer a retailer ban or enforcement action without supplied evidence.

## Tasks

Phase 2A tasks are local Account Ops records, not a claim that the target global task/calendar architecture is complete. Supported task types include verification, setup, password/security review, account problem, order/pickup/return/refund follow-up, and custom owner work. Statuses are `OPEN`, `DONE`, and `DISMISSED`.

Tasks can link to a profile, retailer, or store account. Counts are derived from persisted open records. Completion and dismissal retain the record and timestamps.

Safe bulk actions are limited to metadata work such as assigning a profile group, assigning an existing retailer, archiving selected metadata records, exporting metadata, and creating tasks. There is no bulk retailer registration or bulk signup submission.

## Future inbox contract

Phase 2A defines only a normalized boundary for future, authorized mail evidence. Categories include verification, order confirmation, shipped, delivered, cancelled, refund, password/security, retailer notice, and other.

The future record may retain message ID, alias/retailer/account relationships, category, subject, sender, received time, order reference, confidence, provider/source, and a protected raw-content reference. Phase 2A does not connect a mailbox, list messages, parse message bodies, persist unnecessary content, or claim background delivery.

## Future order contract

The future flow is:

```text
authorized message/order evidence
  -> normalized order candidate
  -> owner review
  -> explicit Add to Purchases
  -> shipment/delivery evidence
  -> explicit Receive Inventory
```

External text cannot create a purchase or inventory record automatically. Provider evidence, owner corrections, and confirmed business records remain separate. Phase 2A adds no order importer, checkout, payment, or purchase action.

## Backup and Restore Preview

The Account Ops document is a registered browser backup source. Allowed metadata includes profiles, aliases, owner-created retailers, store accounts, account state, credential references, tasks, and activity. Passwords, OTPs, tokens, sessions, authorization fields, environment values, and provider secrets are prohibited before persistence and remain prohibited by the backup sanitizer.

Restore Preview validates schema, counts, IDs, duplicate aliases, and relationships such as profile, alias, retailer, and store-account references. It remains JSON-only and zero-write. Account Ops has no restore-apply path.

The migration registry classifies every Account Ops collection `REQUIRES_MAPPING` because the Phase 1B canonical schema has no Account Ops domain. This produces no canonical action, schema change, or migration authorization.

## Security and privacy limitations

Account Ops can contain names, phone numbers, addresses, aliases, retailer usernames, and operational notes. In Phase 2A those records remain readable by scripts executing in the same browser origin, remain device/profile local, and appear in unencrypted JSON backup exports. The owner must protect the device and downloaded files. This is not suitable for production private-data use until the broader Code 3 server authorization, protected persistence, recovery, CSP/dependency, and audit gates are satisfied.

No payment-card/CVV data, plaintext password, OTP, provider token, Code 3 owner identifier, or authentication persistence belongs in Account Ops.

## Explicit non-goals

Phase 2A does not implement:

- mass account generation or farming;
- automatic or bulk retailer signup;
- CAPTCHA, OTP, phone, email, bot-detection, household-limit, account-limit, or purchase-limit bypass;
- identity rotation to avoid enforcement;
- automatic checkout, purchasing, payment, offers, or bidding;
- plaintext password or payment-card vaults;
- mailbox authorization, inbox parsing, or automatic order import;
- provider-managed alias provisioning;
- canonical database domains, migration execution, remote persistence, sync, or Production deployment.

## Future acceptance gate

A separately approved Phase 2B may add a read-only, minimally scoped mailbox/provider connection and normalized message/order review only after provider selection, authorization scopes, retention, file/content protection, server-secret handling, owner authorization, idempotency, and import-review tests are approved. It must keep an owner review gate before Purchases and must not introduce checkout or retailer-security bypass behavior.
