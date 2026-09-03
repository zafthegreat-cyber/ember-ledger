# Historical Inventory Reconciliation Contract

Status: Phase 2C-D local-only foundation published at `5eef5ae59e79dccb7cbb341f42ca6bda7468a762`. Phase 2C-E consumes it through a separate read-only derived review boundary.

Phase 2C-D adds a reviewed reconciliation layer for acquisition corrections that affect completed Sales or managed Transfers. It does not rewrite historical transactions, connect an external provider, activate remote persistence, or authorize Production.

## Invariants

```text
Inventory Reconciliation Candidate != Historical Mutation
Refund != Return
Refund != Inventory Removal
```

The existing Purchase, Receiving, Inventory Creation, and Inventory Correction boundaries continue to apply. Original Purchase evidence, Receiving evidence, Inventory Creation records, acquisition lots, correction events, completed Sales, and completed Transfers remain historical evidence. Reconciliation appends a new fact; it never pretends the earlier fact did not happen.

## Candidate boundary

`InventoryReconciliationCandidate` is an ephemeral, non-authoritative projection. It is derived from current canonical local Inventory, its acquisition lot and creation provenance, the typed correction history, ordered managed Sales, and—only when a canonical managed-transfer authority exists—the affected Transfer chain.

The candidate contains bounded current/proposed state, affected record references, exact signed effects, warnings, blockers, an expected managed-state version, an idempotency identity, and a semantic digest. It is never stored, backed up, restored, or migrated. Browser-provided deltas, quantities, product identities, and costs are review input only.

Candidate statuses are `DRAFT`, `NEEDS_REVIEW`, `BLOCKED`, `READY_TO_CONFIRM`, `CONFIRMED`, and `REVERSED`. Unresolved quantity, cost, sale, or transfer conflicts cannot be reported as completed.

## Supported categories

The bounded category vocabulary includes:

- `COGS_RECONCILIATION`
- `SALE_PRODUCT_RECONCILIATION`
- `SALE_COST_RECONCILIATION`
- `TRANSFER_PRODUCT_RECONCILIATION`
- `TRANSFER_COST_RECONCILIATION`
- `TRANSFER_PROVENANCE_RECONCILIATION`
- `RETURN_AFTER_SALE_RECONCILIATION`
- `LOT_PROVENANCE_RECONCILIATION`
- `PRIOR_CORRECTION_REVERSAL`
- `ACCOUNTING_ADJUSTMENT`

There is no unrestricted historical-edit category. The current schema has no canonical managed-transfer collection. Transfer categories therefore remain `NEEDS_REVIEW` or `BLOCKED`; legacy Collection-to-Forge movement is not promoted into transfer authority.

## Realized COGS

Completed managed Sale records retain their original repository-assigned allocation sequence, original product relationship, original exact COGS, realized profit, and ROI. A later acquisition-cost correction computes exact signed deltas rather than overwriting those fields.

For each affected Sale:

```text
original recorded COGS
+ confirmed append-only reconciliation deltas
= effective projected COGS
```

Positive and negative deltas are valid signed integer minor-unit values. Generic acquisition cost fields remain non-negative. Sale ordering uses the immutable `inventoryAllocationSequence`; mutable timestamps never reassign historical cost slices.

For a partially sold lot, corrected cost is allocated deterministically across the same unit order. Sold-unit deltas become realized COGS reconciliation; the unsold suffix becomes the current Inventory cost correction. The two effects reconcile exactly to the total lot-cost delta, including minor-unit remainders.

## Product reconciliation

If a sold unit was originally recorded under Product A and later resolved to Product B, the Sale remains an historical Product A record. A confirmed reconciliation preserves that original relationship and appends the corrected product projection and owner reason. Current reporting may show an explicit reconciled projection, but it must also expose the original historical value. Product B must already exist in the local product relationship set; title text has no product-authority role.

## Transfers

Completed Transfer records, when a future managed authority exists, remain immutable. Reconciliation must preserve source, destination, quantity, timestamp, original lot relationship, and multi-hop chain. Quantity across the chain must be conserved, and cost-basis deltas must follow the transferred units into destination Inventory.

Phase 2C-D does not invent that authority. Transfer reconciliation fails closed until the system can re-read and atomically validate a canonical source/destination chain. Multi-hop ambiguity is `NEEDS_REVIEW`, never guessed.

## Returns, refunds, and replacements

Sold units are not physically available for return. A request to return more than current available quantity fails closed. Refund evidence may change acquisition economics, but it does not remove Inventory, rewrite a Sale, or prove a return. Replacement Inventory still requires separate Receiving and owner-confirmed Inventory Creation; it never compensates automatically for units already sold.

## Prior correction reversal

An incorrect prior correction or reconciliation is reversed by another append-only event. The original event remains present. The reversal references its source, applies an exact inverse where valid, and is protected against duplicate reversal. The chain is:

```text
Original state
→ Correction/Reconciliation A
→ reviewed reversal of A
→ resulting current projection
```

## OWNER confirmation and local atomicity

Canonical reconciliation requires all of the following under the existing same-origin Inventory Web Lock:

1. verified OWNER authorization before storage access;
2. current Inventory, lot, Purchase/Receiving source provenance, Sales, and managed Transfer reread where such an authority exists; otherwise Transfer proposals block before mutation;
3. expected-version and managed-revision validation;
4. authoritative exact-effect recomputation;
5. quantity and cost conservation checks;
6. semantic-digest and deterministic-idempotency validation;
7. explicit owner confirmation;
8. private-journal-protected persistence; and
9. exact readback.

The existing private Inventory undo journal is reused. Tentative state is hidden until verification succeeds; failures roll back, ambiguous failures are read back, rollback failure remains fail-closed, and retry repairs deterministic partial state without duplicating quantity or COGS effects. Web Locks do not provide multi-device guarantees.

## Event and reporting model

Confirmed reconciliations are append-only `INVENTORY_RECONCILIATION_EVENT` records in the existing Business Inventory document. Events retain stable source references, category, original/corrected bounded projections, exact signed effects, affected Sale references, owner confirmation, timestamps, provenance, and semantic digest. Affected Transfer references remain empty in this phase because no managed Transfer authority exists. Events contain no raw email, provider, Bot, retailer-authentication, payment, session, or proxy data.

Reporting derives current effective COGS, profit, product relationship, and Inventory valuation from immutable transactions plus confirmed reconciliation events. Sale/source dates remain immutable and each reconciliation retains its own timestamp. Phase 2C-E may derive a separate ephemeral Accountant Review that compares the original Sale period with the reconciliation's UTC calendar period and shows original, signed adjustment, and current effective exact-money values. It does not rewrite transaction bytes or post accounting data.

## Phase 2C-E read-only consumer boundary

Accountant Review consumes only validated confirmed events and their immutable affected-Sale snapshots. It counts original COGS once per Sale and exact event/Sale deltas once; event-level and affected-Sale views are never added together. Reversal events remain visible and their signed inverse contributes to the current effective projection.

The review may classify current- or prior-month/quarter/year attention and use cautious `may warrant accountant review` wording. `FILING_STATUS_UNKNOWN` is mandatory because no filing-status authority exists. Sale `YYYY-MM-DD` values remain as recorded; ISO reconciliation instants use a disclosed UTC date basis because no owner-business time-zone contract exists.

`Accountant Review != Accounting Mutation`. Phase 2C-E adds no accounting ledger, journal entry, tax filing/amendment, export, note, backup source, migration source, or mutation path. Transfer review remains blocked without canonical managed-Transfer authority. See [ACCOUNTANT_REVIEW_CONTRACT.md](./ACCOUNTANT_REVIEW_CONTRACT.md).

## Backup, Restore Preview, and migration

No new Backup source is introduced. Safe confirmed reconciliation events extend the existing Deal Finder/Inventory section. Candidates, previews, and the private journal remain excluded. Backup and zero-write Restore Preview validate event identity, event order, source references, exact signed deltas, immutable Sale snapshots, current cost projections, and cross-section provenance.

The mixed Inventory, Sales, and reconciliation paths remain `REQUIRES_MAPPING`. A future remote transaction must atomically cover Inventory, lot, creation/correction/reconciliation events, Sales and COGS adjustments, Transfers and destination Inventory, and Purchase/Receiving provenance with isolation, optimistic versions, idempotency, immutable audit records, and rollback/compensation. Phase 2C-D does not apply that schema or activate `REMOTE_ACTIVE`.

## Explicit exclusions

Phase 2C-D and its Phase 2C-E read-only consumer do not add Raw-card or Graded-card condition authority, product creation, historical Sale or Transfer editing, negative Inventory, automatic refund disposition, automatic replacement Inventory, accounting posting, tax filing/amendment, provider integrations, OAuth, billing, owner-data migration, remote persistence, or Production deployment.

`LOCAL_ONLY` remains authoritative. Phase 2B2-B.1 remains paused with `hostedRuntimeVerified=false`. Phase 2D-B3 is not started. Gmail, Outlook, Stellar, and Hayha remain `NOT_CONFIGURED`.
