# Code 3 Automation and Export Preview Contract

Status: Phase 2A.6-A local-only readiness and preview-design foundation. No outbound provider export, Bot connection, webhook endpoint, or live automation is active.

## Purpose

The Automation area answers whether safe Code 3 metadata appears ready for a future provider-specific review:

```text
existing Code 3 references
  -> provider-specific readiness projection
  -> security validation
  -> future preview
  -> explicit owner review
  -> future separately authorized local export
```

Phase 2A.6-A stops at readiness/review. It contains no transform that emits a provider file, no download/send action, and no direct provider write.

## Provider readiness

Readiness states are `NOT_READY`, `REVIEW_REQUIRED`, `PARTIALLY_SUPPORTED`, `READY_FOR_PREVIEW`, and `UNSUPPORTED`. Schema states are `UNVERIFIED`, `PARTIALLY_VERIFIED`, `VERIFIED`, and `UNSUPPORTED`.

Every readiness record forces:

- `providerCapabilityVerified=false`;
- `liveConnection=false`; and
- `directExportAllowed=false`.

The initial provider set is Stellar, Hayha, Shikari, Valor, and Refract. Stellar and Hayha remain `NOT_CONFIGURED` and have no verified Code 3 outbound schema. Shikari, Valor, and Refract remain unreviewed/unsupported. Parser or readiness logic is not provider capability evidence.

The existing Stellar feature remains an inbound, owner-selected, offline JSON inspection preview. It is not an outbound Account Ops export, Bot task import, or live integration. Its `SUPPORTED` compatibility state remains reserved under the existing evidence contract.

## Safe inputs and output boundary

A future provider transform may consume only explicitly allowlisted, bounded, nonsecret references after provider format and policy review. It must not include passwords, OTPs, CAPTCHA responses, tokens, cookies, sessions, retailer credentials, payment credentials, proxy endpoints/authentication, Bot license material, raw provider content, or browser authority fields.

No action in Phase 2A.6-A may be labeled or behave as Send, Sync, Upload to Bot, Create Tasks, Start, Stop, Restart, or Connect. Review/readiness controls are navigation only.

## Webhook Hub

Webhook records are non-authoritative metadata: provider label, direction, event-type labels, health/readiness, last-event display time, and warnings. They force `enabled=false`, `endpointConfigured=false`, and `containsSecret=false`.

The Hub does not create a route, endpoint URL, signing secret, subscription, delivery, receiver, retry queue, event log, or external request. It must not be interpreted as provider health.

## Cross-domain references

Profile/account/proxy/product/task readiness uses references to existing Account Ops and Bot Operations authorities. It does not copy credentials, change those records, or create a new product/task authority. Unified Order projections remain under the existing Inbox/Order Candidate and Purchase/Receiving contracts and cannot become an export source by implication.

## Persistence and future acceptance

Readiness records, compatibility notes, and any future preview remain ephemeral/non-authoritative in this phase. They add no backup or migration source. A future export requires a separately authorized provider evidence review, exact schema/version contract, security allowlist, deterministic transform, no-secret proof, owner-visible preview, local-only file lifecycle, and explicit owner confirmation. Live provider send/control remains a separate authorization after that.
