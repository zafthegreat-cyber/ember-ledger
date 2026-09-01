# Purchase, Receiving, and Inventory Handoff Contract

Status: Phase 2C-A local-only foundation. This contract defines an OWNER-reviewed Purchase Draft boundary, canonical local Purchase records, append-only Receiving Events, and a derived Inventory Handoff Preview. It does not connect Inbox/Order Intelligence or Bot Operations to a Purchase writer, and it does not create Inventory.

Starting baseline: `0b45c3584f7f15b4d951c5e4cddd1e42dcbeb5a3`.

## Invariants

```text
Order Candidate != Purchase
Checkout Evidence != Purchase
Purchase Draft != Purchase
Purchase != Received Inventory
Delivery != Receiving
Inventory Handoff Preview != Inventory
Receiving != Inventory until a separately approved, explicit confirmation workflow exists
```

No upstream evidence record, delivery status, synthetic provider result, or local UI state can bypass these boundaries. Phase 2C-A has no automatic Purchase importer, receiving inference, inventory writer, quantity adjustment, cost-basis mutation, remote adapter, or synchronization path.

## Future pipeline

```text
Order Candidate or Checkout Evidence
  -> non-authoritative Purchase Draft proposal
  -> OWNER inspection and corrections
  -> explicit OWNER confirmation
  -> one canonical local Purchase
  -> one or more explicit Receiving Events
  -> derived Inventory Handoff Preview
  -> future separately approved Inventory creation
```

Only the middle, local review portion through Inventory Handoff Preview exists in Phase 2C-A. Source relationships are stable references; raw messages, Bot payloads, and copied source records are prohibited.

## Authority and persistence

The browser-local document uses schema version 1 at `code3.purchase-receiving.v1`. `LOCAL_ONLY` is fixed and authoritative. Callers cannot select `REMOTE_ACTIVE`, supply an owner subject, role, session, entitlement, migration executor, sync adapter, or inventory writer.

The new service and storage document may be constructed or read only after the existing server-verified owner session reports `AUTHORIZED`. A query parameter, header controlled by the browser, localStorage flag, client role object, or record field never establishes OWNER authority. Session downgrade clears the mounted service and snapshot.

This browser-local checkpoint cannot provide server-grade concurrency or durable authorization. A future hosted mutation service remains required before multi-device or remote Purchase confirmation.

## Purchase Draft

A Purchase Draft is a non-authoritative, versioned review record. It may retain:

- a stable draft ID and source identity (`MANUAL`, `ORDER_CANDIDATE`, or `CHECKOUT_EVIDENCE`);
- source reference and source version/fingerprint, without embedding the source object;
- retailer/vendor and stable Account Ops reference IDs;
- external order reference, dates, fulfillment, and bounded shipment/tracking references;
- validated multi-line proposals using integer-minor-unit money;
- warnings, confidence, field provenance, and append-only owner corrections; and
- one of `DRAFT`, `NEEDS_REVIEW`, `READY_TO_CONFIRM`, `CONFIRMED`, `REJECTED`, or `CANCELLED`.

An upstream record marked confirmed is still evidence only. It cannot change a draft to `CONFIRMED`. Rejection or cancellation does not destroy the proposal or its review history.

## OWNER confirmation

Confirmation is explicit and validates the complete draft. Blocking failures include a missing retailer/vendor, currency or line item, invalid quantity or money, inconsistent currency, impossible cancellation/refund totals, unresolved blocking product conflicts, and duplicate identity conflicts.

Confirmation uses a stable confirmation identity plus an expected draft version. The draft-to-Purchase transition and its history entry are saved as one normalized state update. Repeating or repairing the same confirmation returns the same Purchase; it cannot create a second record. Client-supplied authority fields are rejected before persistence.

## Purchase and line items

A Purchase is the immutable confirmed projection of one draft plus append-only revision/history references. It retains owner-confirmation metadata and exact business facts; it does not retain passwords, payment-card credentials, cookies, tokens, raw source bodies, or raw provider payloads.

Each line item has a stable ID and supports:

- shared product references and bounded retailer identifiers (SKU, UPC/GTIN, or TCIN);
- title/category/game and ordered quantity;
- exact unit, extended, discount, tax, shipping, fee, refund, and allocated acquisition amounts;
- cancelled, refunded, received, and remaining quantities;
- product-match state (`MATCHED`, `AMBIGUOUS`, or `UNRESOLVED`);
- warnings and provenance.

The original Purchase evidence is never silently rewritten by a Receiving Event, return, refund, or discrepancy.

## Exact money and cost allocation

Canonical money uses `{ currency, minor }`, where `minor` is a safe integer in the currency's minor unit. Floating-point values are never monetary authority. Malformed, negative where prohibited, over-precise, unsafe, or cross-currency values fail validation or remain explicit warnings; they are not rounded into validity.

Order-level discount, tax, shipping, and fee pools are allocated independently across eligible line subtotals. For each pool:

1. compute each exact share with integer/BigInt arithmetic;
2. assign its floor in minor units;
3. rank remainders from largest to smallest;
4. distribute remaining minor units in that order, tie-breaking by stable line-item ID and then source order; and
5. assert that allocated minors equal the original pool exactly.

Zero-weight allocation is never guessed. A separately explicit fallback or blocking validation is required. Per-line acquisition cost is line subtotal minus line and allocated discounts plus allocated tax, shipping, and fees. Allocation does not update existing Inventory cost basis.

## Receiving

A Purchase may have multiple append-only, owner-confirmed Receiving Events. Each event uses a stable submission identity and includes Purchase/line references, timestamp, location, quantity, condition, discrepancy, notes, and provenance. Replaying one event ID returns the original event; two distinct partial receipts with equal quantities remain distinct.

Receiving states include `NOT_RECEIVED`, `PARTIALLY_RECEIVED`, `FULLY_RECEIVED`, `DAMAGED`, `MISSING`, `WRONG_ITEM`, `RETURNED_TO_SENDER`, and `CANCELLED`. Over-receipt and impossible quantities are blocked. A delivered or shipped source event never creates a Receiving Event.

Discrepancies are append-only observations. Missing, wrong, damaged, substituted, extra, cancelled, replacement, return, and refund facts do not erase original order evidence or automatically adjust Inventory.

## Returns, refunds, and cancellation

Full/partial cancellation, full/partial refund, return initiation/completion, replacement shipment, damaged-item refund, and order adjustment remain explicit facts and history. A refund may occur before or after receipt. Neither refund nor return deletes Inventory. Phase 2C-A has no destructive adjustment path.

## Product matching

Product matching reuses existing Code 3 product identity where an exact safe identifier is available. Title text alone is not authoritative. An ambiguous or unresolved item remains reviewable and blocks future Inventory creation when required. No Product Target, catalog product, Owned Item, or Inventory record is cloned or created by matching.

## Inventory Handoff Preview

The handoff preview is a pure, ephemeral projection from one confirmed Purchase and its owner-confirmed Receiving Events. It may show product, eligible quantity, allocated acquisition cost, vendor, Purchase reference, received date, condition, lot/batch relationship, product-match state, and warnings.

It is not stored in `code3.purchase-receiving.v1`, Backup Format v1, Migration Preview, localStorage, IndexedDB, Upstash, Supabase, or any Inventory repository. Refreshing or navigating away recomputes/discards the projection. There is no Save, Apply, Receive Into Inventory, or Create Inventory action in Phase 2C-A.

## Idempotency and history

- Draft identity is scoped by source type and stable source reference/version.
- External order duplicates are scoped by retailer/vendor plus account/profile reference and external ID; the same external ID under a different account can remain distinct.
- Confirmation identity is stable per draft and expected version.
- Receiving identity is stable per Purchase, line, and owner submission/event ID.
- Corrections, confirmation, receiving, discrepancy, return/refund, and local activity summaries retain provenance and append-only order.
- Interrupted confirmation repair finds the already-created Purchase and completes the draft link instead of duplicating the Purchase.

## Security exclusions

The persistence boundary recursively rejects authority/session fields, passwords, payment-card numbers, CVVs, retailer cookies, bearer/access/refresh tokens, OTPs, recovery/security answers, provider or proxy credentials, credential-bearing URLs, raw email content, raw Bot/provider payloads, raw logs, prototype-pollution keys, cyclic/non-finite values, and unsafe oversized structures.

Safe records may keep non-secret business metadata and stable references only. Errors and history contain bounded summaries, not rejected values.

## Backup, Restore Preview, and migration

Backup Format v1 may include validated safe `purchaseDrafts`, `purchases`, `purchaseEvents`, `receivingEvents`, and `activity` metadata from the separate source. Inventory Handoff Preview is not a backup collection. The backup sanitizer independently removes prohibited authentication, payment, source-content, provider, and proxy fields.

Restore Preview validates schema, IDs, references, exact money, security exclusions, and duplicate conflicts but performs zero writes. Every Phase 2C-A migration path is `REQUIRES_MAPPING`; the existing canonical Phase 1B Purchase domains do not yet represent this richer review/receiving contract, and the schema remains unapplied.

## Phase 2C-A non-goals

Phase 2C-A does not connect a mailbox, Bot, retailer account, payment service, Supabase owner store, or managed provider store. It does not resume Phase 2B2-B.1, begin Phase 2D-B3, enable billing, activate `REMOTE_ACTIVE`, apply a schema, migrate owner data/files, deploy Production, or authorize a live Purchase/Inventory flow.

## Future Phase 2C-B gate

A future phase may add an explicit Inventory creation boundary only after reviewing canonical inventory identity, lot/batch semantics, product-resolution requirements, server-side OWNER authorization, idempotent multi-device mutation, returns/reversals, auditability, and migration/cutover safety. It must not weaken any evidence, Purchase, Receiving, or inventory-separation invariant above.
