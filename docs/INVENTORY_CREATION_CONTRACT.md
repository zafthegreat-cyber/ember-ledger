# Owner-Confirmed Inventory Creation Contract

Status: Phase 2C-B local-only implementation candidate, locally validated and unpublished. This contract extends the published Phase 2C-A Purchase/Receiving foundation with one explicit, verified-OWNER mutation boundary from reviewed Receiving evidence into the existing canonical local Business Inventory. It does not activate remote persistence, provider evidence ingestion, automatic product creation, or Production.

Starting baseline: `3b10644cf1be9498c08b876b5a3bbef98a24ee1c`.

## Non-negotiable boundaries

```text
Order Candidate != Purchase
Checkout Evidence != Purchase
Purchase Draft != Purchase
Purchase != Received Inventory
Delivery != Receiving
Receiving != Inventory
Inventory Handoff Preview != Inventory
Inventory Creation Candidate != Inventory
```

An Inventory record may be created only after a canonical confirmed Purchase exists, the owner has separately confirmed physical Receiving, product identity and condition are resolved, exact allocated acquisition cost reconciles, and the owner explicitly selects **Confirm Inventory Creation**. There is no automatic Receiving-to-Inventory, email-to-Inventory, Bot-to-Inventory, delivery-to-Inventory, or title-to-product path.

## Existing Inventory authority

Phase 2C-B reuses the writable local Business Inventory document at `ember-and-tide.flip-scout.v1`; it does not introduce a parallel Inventory system. That document is normalized as Flip Scout schema version 3 and keeps existing Deal Finder, Purchase, lot, Inventory, sales, return, expense, mileage, activity, and listing collections compatible while adding:

- `inventoryLots`: acquisition lots with exact cost and Purchase/Receiving provenance;
- `inventoryCreationApplications`: deterministic idempotency/application records;
- `inventoryCreationEvents`: append-only successful creation facts; and
- `inventoryAdjustments`: append-only reversal/disposition facts.

Canonical Inventory remains represented by entries in the existing `inventory` collection. Each Phase 2C-B acquisition creates a new provenance-preserving Inventory item and acquisition lot, even when another item already references the same product. Existing inventory may be shown as a relationship, but acquisition costs are not silently averaged and prior lot history is not destroyed.

## Ephemeral Inventory Creation Candidate

`InventoryCreationCandidate` is a non-authoritative, non-persisted projection derived from current authoritative local records. It contains only bounded, safe review data:

- deterministic candidate identity and expected version;
- Purchase, Purchase-line, and owner-confirmed Receiving Event references;
- eligible received quantity and received timestamp;
- reviewed product reference and match state;
- condition and disposition;
- retailer/vendor references;
- exact currency, total acquisition cost, and per-unit minor-unit allocations;
- proposed lot relationship, warnings, and blocking reasons; and
- existing completed-application/inventory relationships when present.

The candidate is never a backup source or Migration Preview source. The browser cannot make candidate quantity, cost, owner identity, or version authoritative. Confirmation re-reads both Purchase/Receiving and Inventory documents and re-derives the candidate inside the exclusive mutation boundary.

## Eligibility and product resolution

Only positive quantity from owner-confirmed Receiving entries is eligible. A Purchase in `RETURN_INITIATED`, `RETURNED`, or `CANCELLED` state blocks every candidate. A Receiving Event in `RETURNED_TO_SENDER`, `CANCELLED`, `MISSING`, or `NOT_RECEIVED` state also blocks its candidate. Ordered-but-unreceived, duplicated, and unresolved-extra quantities are excluded, and Purchase cancellation quantities require cost review. Damaged units require an explicit `ADD_AS_DAMAGED` disposition and `DAMAGED` condition. Wrong or substituted units require a reviewed actual-product reference and bounded resolution reason. `HOLD_FOR_RETURN`, `HOLD_FOR_CLAIM`, `EXCLUDE`, and `UNRESOLVED_EXTRA` do not create Inventory.

Product resolution must be `MATCHED` from a supported exact reference or `OWNER_RESOLVED`. A manual owner resolution must identify an existing local Inventory/product relationship and retain the owner's bounded resolution reason on the application, creation event, Inventory item, and lot. An arbitrary new product string is not sufficient. `AMBIGUOUS`, `UNRESOLVED`, unknown condition, and title-only matching block confirmation. Phase 2C-B never creates a canonical product from a Purchase title.

Phase 2C-B actively supports the existing Inventory classifications `Sealed product` and `Accessory`. `Raw card` and `Graded card` remain blocked until a separately reviewed type-specific card/slab condition workflow can preserve their existing semantics; a generic condition value is not allowed to flatten those categories.

## Exact acquisition cost

The candidate consumes Phase 2C-A integer-minor-unit allocation. Floating-point values are compatibility display projections only, never cost authority.

Receiving-event allocation is deterministic. Confirmed Receiving Events retain their authoritative append order in the Purchase/Receiving record. Each event receives the exact slice of the line's eligible acquisition cost for its position in that immutable sequence; timestamps and client-chosen IDs cannot reorder earlier cost slices. Across partial receipts, cost is neither reused nor lost.

Within an event, total cost is divided across units with integer arithmetic:

1. compute the floor share;
2. assign that share to every unit;
3. distribute remaining minor units one at a time to earlier deterministic unit positions; and
4. assert that unit costs sum exactly to the event total.

For example, 1,000 minor units across three units becomes `334`, `333`, `333`. The original and current total/unit allocations remain on the managed Inventory item and lot. Compatibility projections from those exact slices feed the existing Business/Flip Scout sales, COGS, summary, and valuation UI; integer minor units remain the authority.

## OWNER confirmation and local atomicity

The Inventory gateway checks verified OWNER state before every storage read or mutation. Browser role strings, query parameters, headers, local/session storage, client authority fields, or candidate payloads never grant authority.

Confirmation requires:

1. a fresh candidate re-derivation from canonical local Purchase/Receiving and Inventory state;
2. exact candidate ID and expected-version agreement;
3. owner-confirmed Receiving references and positive recomputed eligible quantity;
4. valid product resolution, condition, and inventory disposition;
5. exact reconciled currency and unit-cost allocation;
6. stable deterministic application, Inventory item, lot, and creation-event IDs; and
7. an explicit owner action.

The mutation uses one same-origin exclusive Web Lock and one normalized whole-document write to add/update the Inventory item, acquisition lot, application, creation event, and bounded activity summary. Hosted or browser environments without the safe lock fail closed. A read-back verifies every required record and semantic identity before reporting success.

## Idempotency, repair, and conflicts

Stable identities derive from Purchase, line, Receiving Event, and entry position. Repeating a confirmation, double-clicking, refreshing, or recreating the same candidate returns the existing exact result. The idempotency application is checked before a stale preview can create another quantity.

If an interrupted write leaves a compatible subset of deterministic records, retry repairs the missing set under the same IDs. A conflicting application with the same source identity fails with an idempotency conflict. A changed candidate or Inventory version fails with a version conflict. The exclusive lock serializes same-origin tabs; Phase 2C-B does not claim server-grade multi-device transactions while `LOCAL_ONLY` is authoritative.

## Inventory Creation Event and protected provenance

Every successful handoff writes an append-only `INVENTORY_CREATED` event referencing the application, Purchase, line, Receiving Event, product, lot, Inventory item, quantity, currency, and exact costs. It stores bounded summaries and warnings, not raw email/Bot/provider evidence or credentials.

Phase 2C-B-created Inventory and lots are marked `provenanceManaged`. Generic Business record edit/delete actions must not rewrite or erase those records. Changes use explicit reviewed correction or adjustment workflows so the chain remains inspectable:

```text
Purchase -> Receiving Event -> Inventory Creation Application/Event -> Inventory item + acquisition lot
```

## Returns, refunds, and reversals

A refund without a physical return does not remove Inventory. Phase 2C-B implements only explicit owner-confirmed append-only quantity/cost reversal after creation; it never deletes the creation event, application, original quantity, original cost, or original unit allocation. A richer post-creation product-resolution correction workflow is deliberately deferred to Phase 2C-C.

Reversal re-checks current Inventory version and quantity still available after sales. Sold, transferred, consumed, or otherwise unavailable quantity cannot be reversed into a negative balance. The reversal removes deterministic trailing unit-cost shares from current quantity/cost, updates current item/lot state, and appends one idempotent adjustment. Full reversal marks the local item disposed and the lot reversed; partial reversal preserves the remaining exact cost. Insufficient quantity fails for owner review.

## Security exclusions

Candidate, application, event, lot, adjustment, UI, log, backup, and migration boundaries reject browser authority/session data, passwords, card numbers, CVVs, cookies, bearer/access/refresh tokens, OAuth material, OTPs, security answers, provider/retailer/proxy credentials, credential-bearing URLs, raw email/Bot/provider payloads or logs, prototype-pollution keys, non-finite values, cycles, and unsafe structures. Inventory creation never requires payment credentials.

## Backup, Restore Preview, and migration

The existing Deal Finder Backup Format source now recognizes Flip Scout schema version 3. Safe `inventory`, `inventoryLots`, `inventoryCreationApplications`, `inventoryCreationEvents`, and `inventoryAdjustments` metadata may be included with the other sanitized Business collections. Validation requires complete application/event/item/lot bundles and strict identity, Purchase/line/Receiving/product/resolution/condition/disposition, original/current quantity, and exact original/current cost reconciliation. Ephemeral candidates and handoff previews remain excluded. Raw evidence, credentials, payments, sessions, tokens, and secret-bearing URLs remain prohibited.

Restore Preview remains zero-write and validates the extended schema, strict bundle shape/references/exact costs/protected provenance, and conflicts without applying anything. The mixed existing `deal-finder.inventory` path and new acquisition-lot, application, creation-event, and adjustment paths are all `REQUIRES_MAPPING`; no Phase 2C-B data is remote-authoritative and no canonical schema has been applied.

## Operational and provider isolation

`LOCAL_ONLY` remains authoritative and `REMOTE_ACTIVE` remains disabled. Phase 2B2-B.1 stays paused with `hostedRuntimeVerified=false`; existing Upstash, Supabase, and provider-auth Vercel configuration are untouched. Phase 2D-B3 is not started. Gmail, Outlook, Stellar, and Hayha remain unconfigured; no mailbox, Bot, retailer, proxy, payment, billing, or Production integration is used.

## Phase 2C-B non-goals

Phase 2C-B does not activate automatic Inventory creation, bulk auto-confirmation, automatic product creation, post-creation product-resolution correction, Inventory creation from upstream evidence, remote sync, canonical database migration, provider configuration, real business records, Production deployment, or destructive history deletion. Validation and publication remain separate checkpoints.
