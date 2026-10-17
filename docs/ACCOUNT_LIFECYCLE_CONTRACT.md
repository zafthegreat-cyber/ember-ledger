# Code 3 Account Lifecycle Contract

Status: Phase 2A.6-A local-only product/UX foundation. The implementation is additive to the published `code3.account-ops.v1` source and does not create a new retailer-account authority, provider connection, or persistence source.

## Purpose

This contract defines the owner-facing lifecycle projection used to organize legitimate retailer-account preparation and review:

```text
existing Account Ops metadata
  -> Account Creation Assistant projection
  -> duplicate/conflict review
  -> Account Health projection
  -> human Verification Inbox
  -> future separately authorized provider action
```

An `AccountCreationPlan` is an ephemeral, deeply frozen review model. It may reference a retailer, account label, email alias, phone resource, shipping and billing profiles, and a nonsecret credential reference. It may also expose bounded warnings, provenance, and verification requirements. It is never proof that a retailer account exists or that Code 3 is authorized to act for one.

## Lifecycle states

The projection recognizes:

- `DRAFT`;
- `READY`;
- `SIGNUP_OPEN`;
- `WAITING_FOR_CAPTCHA`;
- `WAITING_FOR_MFA`;
- `WAITING_FOR_EMAIL`;
- `WAITING_FOR_SMS`;
- `WAITING_FOR_TERMS`;
- `VERIFYING`;
- `ACTIVE`;
- `NEEDS_ATTENTION`;
- `FAILED`;
- `DISABLED`.

These states organize owner review only. They do not submit a signup form, accept terms, solve a challenge, establish a session, or change a retailer account.

## Creation Assistant boundary

The Account Creation Assistant may:

- assemble safe references already present in local Account Ops;
- show missing identity/profile inputs and owner-visible warnings;
- derive a proposed lifecycle state from existing metadata;
- open the existing owner-controlled Account Ops draft flow; and
- explain which human steps remain.

It may not:

- create, log in to, verify, unlock, disable, or recover a real retailer account;
- submit forms or accept terms;
- obtain or retain a password, OTP, CAPTCHA solution, cookie, token, security answer, payment credential, proxy endpoint, or retailer session;
- rotate identities, farm accounts, or evade household, account, purchase, or retailer limits; or
- use a browser role, session field, URL parameter, or projected state as authorization.

## Duplicate and conflict review

Duplicate warnings compare bounded normalized metadata within one retailer, including safe email references, phone references, profile references, and owner labels. A warning exists to prevent accidental duplication and improve organization. It is not an account-limit-evasion tool, does not merge records, and does not infer retailer enforcement.

## Account Health Center

Account health is a read-only derivation with these detailed states:

- `HEALTHY`;
- `NEEDS_VERIFICATION`;
- `PASSWORD_RESET_REQUIRED`;
- `EMAIL_UNVERIFIED`;
- `PHONE_UNVERIFIED`;
- `MFA_REQUIRED`;
- `CAPTCHA_REQUIRED`;
- `LOCKED`;
- `DISABLED`;
- `UNKNOWN`.

The projection may show last owner-recorded verification/check time, pending owner action, profile assignment, email/phone status, and warnings. `networkChecked` remains false. No retailer health endpoint is called, and a local label must not be presented as a provider-confirmed fact.

## Identity, profile, and payment metadata

Email/alias and profile views reuse `code3.account-ops.v1`; the Phase 2A.6-A layer does not duplicate their authority. Phone/SMS resources are synthetic, non-authoritative references containing a label, provider label, region, assignments, availability, verification state, timestamps, and warnings—never a real phone number or verification value.

Payment-card metadata is limited to a card alias, provider label, last four digits, expiration month/year, status, safe assignments, an optional exact minor-unit spending-limit value, currency, and warnings. Full card numbers, CVVs, PINs, bank credentials, payment tokens, and credential-bearing references are prohibited. Metadata does not establish that a card is valid or available.

Safe autofill means owner-approved ordinary name, shipping address, email, and phone references. It does not expose or submit authentication, verification, session, or payment secrets.

## Authority, persistence, and recovery

The verified OWNER gate runs before Account Ops storage or this projection is loaded. The projection fixes `authoritative=false`, `persisted=false`, `writesAllowed=false`, and `networkAllowed=false`; all live-capability boundary flags are false.

Phase 2A.6-A adds no localStorage/sessionStorage/IndexedDB key, repository collection, backup source, migration source, remote adapter, or schema. The existing eight `code3.account-ops.v1` collections remain the only Account Ops persistence authority and remain `LOCAL_ONLY`/`REQUIRES_MAPPING`. Operations projections, filters, search results, and synthetic fixtures are regenerated rather than backed up.

## Current configuration truth

`LOCAL_ONLY` remains authoritative, `REMOTE_ACTIVE` remains disabled, and the canonical remote schema remains unapplied. Owner data/files remain unmigrated. Phase 2B2-B.1 is paused and `hostedRuntimeVerified=false`. Gmail, Outlook, Stellar, and Hayha remain `NOT_CONFIGURED`; `NO_LIVE_BOT_PILOT_YET` remains the Bot decision. Billing and Production are untouched, and Phase 2D-B3 has not started.
