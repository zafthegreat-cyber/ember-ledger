# Purchase, Receiving, and Inventory Handoff Contract

Status: Phase 2C-A, Phase 2C-B, and Phase 2C-C are published; Phase 2C-D is the local-only historical Inventory/Sale reconciliation extension. This contract defines the OWNER-reviewed Purchase Draft boundary, canonical local Purchase, append-only Receiving, derived Inventory previews, and separate explicit Inventory creation/correction/reconciliation confirmation boundaries. Inbox/Order Intelligence and Bot Operations remain disconnected from every writer.

Phase 2C-B published commit: `bcff80042a15a29492ed32ba945291b50d35b5bb`.

## Invariants

```text
Order Candidate != Purchase
Checkout Evidence != Purchase
Purchase Draft != Purchase
Purchase != Received Inventory
Delivery != Receiving
Inventory Handoff Preview != Inventory
Inventory Creation Candidate != Inventory
Inventory Correction Candidate != Inventory Mutation

Inventory Reconciliation Candidate != Historical Mutation
Receiving != Inventory
```

No upstream evidence record, delivery status, refund, synthetic provider result, or local UI state can bypass these boundaries. Phase 2C-B adds one narrowly scoped local Inventory writer after fresh authoritative re-derivation and explicit verified-OWNER confirmation. Phase 2C-C adds a separate preview/confirmation path for supported append-only correction and physical-return disposition. Phase 2C-D adds a separate preview/confirmation path for append-only historical reconciliation while retaining original Sale/Transfer facts. None adds an automatic Purchase importer, Receiving inference, replacement/extra Inventory creator, remote adapter, or synchronization path.

## Future pipeline

```text
Order Candidate or Checkout Evidence
  -> non-authoritative Purchase Draft proposal
  -> OWNER inspection and corrections
  -> explicit OWNER confirmation
  -> one canonical local Purchase
  -> one or more explicit Receiving Events
  -> derived Inventory Handoff Preview
  -> ephemeral Inventory Creation Candidate
  -> OWNER product/condition/disposition review
  -> explicit OWNER Inventory confirmation
  -> canonical local Inventory item, acquisition lot, and append-only creation event
  -> optional owner correction/disposition preview
  -> explicit OWNER correction/disposition confirmation
  -> typed append-only Inventory adjustment
```

Phase 2C-A implements the local review portion through Inventory Handoff Preview. Phase 2C-B adds the owner-confirmed local handoff. Phase 2C-C adds only the post-creation correction/disposition path. Phase 2C-D reconciles downstream historical effects without rewriting the earlier records. Source relationships are stable references; raw messages, Bot payloads, and copied source records are prohibited. See [Owner-Confirmed Inventory Creation Contract](./INVENTORY_CREATION_CONTRACT.md), [Inventory Correction and Disposition Contract](./INVENTORY_CORRECTION_DISPOSITION_CONTRACT.md), and [Historical Inventory Reconciliation Contract](./INVENTORY_RECONCILIATION_CONTRACT.md).

## Authority and persistence

The Purchase/Receiving browser document remains schema version 1 at `code3.purchase-receiving.v1`. Owner-confirmed Inventory writes reuse the existing `ember-and-tide.flip-scout.v1` Business Inventory source, advanced by Phase 2C-D to schema version 5 under the same storage key. `LOCAL_ONLY` is fixed and authoritative. Callers cannot select `REMOTE_ACTIVE`, supply an owner subject, role, session, entitlement, migration executor, sync adapter, or substitute inventory writer.

The new service and storage document may be constructed or read only after the existing server-verified owner session reports `AUTHORIZED`. A query parameter, header controlled by the browser, localStorage flag, client role object, or record field never establishes OWNER authority. Session downgrade clears the mounted service and snapshot.

This browser-local checkpoint cannot provide server-grade multi-device concurrency or durable authorization. Phase 2C-B uses a same-origin exclusive Web Lock, deterministic identities, version checks, one whole-document local write, and verified read-back; a future hosted transaction remains required before multi-device or remote activation.

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

It is not stored in `code3.purchase-receiving.v1`, Backup Format v1, Migration Preview, localStorage, IndexedDB, Upstash, Supabase, or any Inventory repository. Refreshing or navigating away recomputes/discards the projection. Phase 2C-B may derive a separate ephemeral Inventory Creation Candidate from this view, but neither the preview nor candidate is Inventory.

## Phase 2C-B Inventory confirmation

Only a fresh candidate derived from one confirmed Purchase, owner-confirmed Receiving entries, current product review, and current exact Inventory state may be confirmed. Purchase states `RETURN_INITIATED`, `RETURNED`, and `CANCELLED` block candidates. Receiving states `RETURNED_TO_SENDER`, `CANCELLED`, `MISSING`, and `NOT_RECEIVED` block the associated candidate. Ordered-but-unreceived, duplicate, and unresolved-extra units remain excluded. Ambiguous/unresolved products and unknown condition block confirmation; damaged, wrong, and substituted items require explicit reviewed disposition or actual-product resolution. Manual owner resolution must point to an existing local Inventory/product relationship and its bounded reason is preserved across the application/event/item/lot bundle.

The gateway checks verified OWNER state before storage access, re-derives quantity/cost/version inside a same-origin exclusive lock, and writes deterministic application, Inventory item, acquisition-lot, creation-event, and activity records in one normalized local document. Read-back verification and stable identities make repeat confirmation idempotent and repair a compatible interrupted partial write without adding quantity twice. A stale or conflicting candidate fails closed.

Phase 2C-B exact unit allocation uses integer minor units. It divides each Receiving cost slice by quantity, assigns the floor to every unit, and distributes remainder units to earlier deterministic positions. Across Receiving Events, authoritative append order—not mutable timestamps or client-chosen IDs—makes partial receipts consume disjoint exact portions of the line allocation. Those exact slices supply the compatibility cost projections used by existing Business/Flip Scout sales, COGS, summary, and valuation UI without making floating-point display values authoritative.

Phase 2C-B implements explicit append-only quantity/cost reversal after creation. Phase 2C-C extends the same protected history with typed correction and disposition records. A refund alone never removes Inventory. Physical return is explicit and limited to unsold/untransferred quantity; the full-return category consumes all available units and partial return uses its separate category. Product/condition and cost corrections are blocked after sales/transfers. A replacement requires one scoped, idempotently resumable owner-confirmed note linked to an effective unreversed return adjustment, then a new Receiving Event and Inventory-creation review. Replacement quantity is separate from ordinary order receipt totals, its new acquisition reuses the exact returned unit-cost slice, and completed replacement provenance blocks reversal of the consumed return. Unexpected extras require a separate acquisition/cost review. Provenance-managed acquisition items and lots cannot be generically edited, deleted, or imported over.

Phase 2C-D does not turn those blockers into destructive edits. Where supported, it preserves the original Sale and appends an exact signed COGS/product reconciliation event plus any current unsold Inventory cost correction. The original allocation sequence remains authoritative. Transfer categories remain blocked because the current document has no canonical managed-transfer authority. Refund remains separate from both return and Inventory removal.

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

Backup Format v1 may include validated safe `purchaseDrafts`, `purchases`, `purchaseEvents`, `receivingEvents`, and `activity` metadata from the separate source. The existing Deal Finder source may include safe schema-5 Inventory, acquisition-lot, application, creation-event, typed-adjustment, immutable Sale, and confirmed reconciliation metadata. Inventory Handoff/Creation/Correction/Reconciliation previews and candidates plus the private Inventory journal are not backup collections. The sanitizer independently removes prohibited authentication, payment, source-content, provider, and proxy fields.

Restore Preview validates schema, IDs, references, exact money, complete item/lot/application/event/typed-adjustment/reconciliation chains, immutable managed Sale snapshots, protected provenance, security exclusions, and duplicate conflicts but performs zero writes. Every Phase 2C-A path remains `REQUIRES_MAPPING`; the mixed existing `deal-finder.inventory` path and Phase 2C-B/2C-C/2C-D lot/application/event/adjustment/reconciliation and managed-Sale paths are also `REQUIRES_MAPPING`. The existing canonical Phase 1B domains do not represent the richer review/receiving/inventory-provenance contract, and the schema remains unapplied.

## Phase 2C-B through Phase 2C-D non-goals

These phases connect no mailbox, Bot, retailer account, payment service, Supabase owner store, or managed provider store. They do not automatically create Inventory, infer return from refund, create products/replacements/extras, enable Raw/Graded correction, resume Phase 2B2-B.1, begin Phase 2D-B3, enable billing, activate `REMOTE_ACTIVE`, apply a schema, migrate owner data/files, or deploy Production. Gmail, Outlook, Stellar, and Hayha remain unconfigured; `hostedRuntimeVerified=false`.

## Future hosted/canonical gate

A future phase may add hosted transactions, remote migration mapping, Raw/Graded type-specific correction, canonical managed-transfer authority, or separately reviewed product creation only after server-side OWNER authorization, multi-device conflict handling, backup/cutover safety, and canonical schema approval. It must not weaken any evidence, Purchase, Receiving, candidate, correction, reconciliation, or Inventory-separation invariant above.
