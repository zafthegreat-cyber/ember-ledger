# Code 3 Inventory Correction and Disposition Contract

Status: Phase 2C-C published at `ef30033a3b30989737878252fb31354aaecf68a3`. Phase 2C-D is the separate local-only historical reconciliation candidate. Remote activation, migration, and Production deployment remain separately gated.

## Purpose

Phase 2C-C adds a narrow, owner-reviewed workflow for correcting provenance-managed Inventory after Phase 2C-B creation. It does not create another Inventory authority. The existing `ember-and-tide.flip-scout.v1` document remains authoritative in `LOCAL_ONLY` mode and advances to schema version 4 under the same storage key.

The workflow preserves these invariants:

- `Refund != Physical Return`.
- `Correction Preview != Inventory Mutation`.
- `Replacement Evidence != Receiving`.
- `Unexpected Extra != Existing Acquisition`.
- original Purchase, Receiving, Inventory-creation, sale, transfer, and adjustment history is append-only;
- `REMOTE_ACTIVE` remains disabled and every affected remote path remains `REQUIRES_MAPPING`.

## Authority and confirmation

The workflow is available only after the existing verified-OWNER gate. Authorization occurs before managed Inventory is read. Browser-supplied owner, role, token, session, or entitlement fields cannot establish authority.

A correction begins as an ephemeral preview derived from the current item, acquisition lot, adjustment history, sales, and the explicit schema-4 no-managed-transfer invariant. The Preview is not persisted, backed up, migrated, or treated as authority. The published schema has no managed-transfer collection or writer; any future transfer collection/field fails closed until an authoritative reconciliation adapter exists. Confirmation requires:

- the reviewed candidate identity and expected version;
- a stable idempotency key and bounded owner reason;
- fresh derivation under the same-origin exclusive Inventory lock;
- current item and lot versions;
- a complete, valid creation bundle and adjustment chain; and
- successful whole-document write and exact read-back.

Stale, conflicting, malformed, replayed-with-different-semantics, incomplete, or unauthorized requests fail closed. Same-request replay returns the already-recorded result rather than appending a second correction.

## Schema version 4

Schema version 4 retains the Phase 2C-B storage key and collections. It extends provenance-managed item and acquisition-lot current state and makes `inventoryAdjustments` a typed append-only history. A correction never deletes or rewrites the original creation application or creation event.

Each typed adjustment retains deterministic identity, application/event/item/lot/Purchase/Receiving references, sequence, request digest, current-to-proposed state, exact quantity and integer-minor-unit cost effects, confirmation method, timestamp, and bounded reason. The validator reconciles the ordered chain from the immutable creation state to the current item and lot.

The repository permits only the reviewed mutation class. Generic Business edit, delete, import, or replacement paths remain unable to mutate provenance-managed records.

## Supported local corrections and dispositions

Phase 2C-C supports explicit preview and confirmation for the implemented schema-v4 categories, subject to their blockers:

- whole-lot product resolution, wrong-item resolution, or substitution resolution to an existing local product relationship;
- whole-lot condition correction and damaged-after-receiving disposition;
- bounded quantity correction for an allowed reason;
- full physical return of all currently available units, or a separately typed partial physical return;
- acquisition-cost correction before any sale or transfer;
- explicit repair of the immediately preceding eligible reversal/correction chain entry.

Product and condition corrections apply to the entire current acquisition lot. They are blocked after any unit has been sold or transferred because Phase 2C-C does not rewrite historical sale, transfer, tax-lot, or cost-of-goods identity.

Phase 2C-D does not weaken that rule. It introduces a separately reviewed reconciliation candidate/event for the supported post-sale cases. The original Sale remains unchanged; exact signed COGS and product projection deltas are appended. Transfer categories remain blocked because no managed Transfer authority exists. See [Historical Inventory Reconciliation Contract](./INVENTORY_RECONCILIATION_CONTRACT.md).

Physical return quantity is limited to current unsold and untransferred availability. A partial return must leave a positive available quantity. Quantity corrections retain a bounded structured reason (`COUNT_CORRECTION`, `RETURN`, `DAMAGE_DISPOSITION`, `LOSS`, or `REVERSAL_REPAIR`) in addition to the owner note; only a `RETURN` reason produces returned disposition semantics. Quantity and exact cost effects use the existing deterministic unit-cost prefix; they cannot make quantity negative or remove units already committed to sales or transfers.

Acquisition-cost correction is blocked after any sale or transfer and when no quantity remains. It uses exact integer minor units and redistributes only the current remaining unit allocation. It does not rewrite realized cost of goods.

## Explicitly separate workflows

A retailer refund is financial evidence only. It never removes Inventory by itself. Physical return requires an explicit owner-confirmed return/disposition action.

A replacement item must enter through a new Receiving Event and the existing Inventory-creation review. A scoped owner-confirmed `REPLACEMENT_NOTED` Purchase Event binds exactly one Purchase line/quantity/reference to exactly one effective, unreversed physical-return Inventory adjustment. Replacement Receiving references that event, remains separate from ordinary ordered-quantity receipt totals, and can never authorize generic over-receipt. A noted-but-not-received workflow remains safely resumable with the same idempotent event after refresh. Its later Inventory candidate reuses the exact returned unit-cost slice. The completed application/event/item/lot persist the authorization, return-source, and deterministic source-unit offset; validation rejects wrong-line, wrong-currency, overlapping, shortened, gapped, or coherently altered cost slices. Before correction preview or mutation, the trusted Purchase/Receiving service also rechecks that the referenced owner-confirmed Purchase Event and Receiving Event exist and bind the same Purchase, line, return adjustment, and quantity. Once replacement Inventory depends on that return, any reversal-chain action that would deactivate the source return is blocked for reconciliation, preventing duplicate stock or cost. Original creation, return, Purchase, and Receiving history remains unchanged. Reference-only legacy replacement notes stay informational and cannot authorize Receiving.

An unexpected extra requires a separate acquisition identity and cost review. It cannot be added by increasing an existing lot through correction.

Raw-card and graded-card product/condition correction remains deferred. Phase 2C-C does not flatten raw-card condition, grading company, numeric grade, certification, or slab semantics into the generic sealed/accessory condition model. Existing legacy Raw card and Graded card records remain readable under their prior compatibility behavior, but the new provenance-managed correction workflow does not activate those categories.

## Backup, restore, and migration

No new backup source is created. Backup Format v1 continues to include the safe Deal Finder section, advanced by Phase 2C-D to schema version 5, with validated item/lot/application/event/typed-adjustment/reconciliation metadata.

Ephemeral correction previews/candidates and the private crash-recovery journal are not backup sources. Credentials, browser authority, raw evidence, provider payloads, and other prohibited security fields remain excluded.

Restore Preview validates schema compatibility, references, adjustment order, idempotency, before/after chain integrity, quantity, and exact cost without writing anything. The mixed Inventory collection and all Inventory provenance/adjustment paths remain `REQUIRES_MAPPING`; no canonical mapping, restore apply, schema application, sync, or remote cutover is authorized.

## Limitations

- Web Locks and the private local journal reduce same-origin replay/interruption risk; they are not a server transaction or multi-device serialization.
- Correction history is browser-local and shares the existing local-device and downloaded-backup exposure limitations.
- No automatic refund, return, replacement, extra-item, Purchase, Receiving, Inventory, or product-creation action exists.
- No remote repository, migration executor, rollback executor, sync engine, or Production deployment is enabled.

See also [INVENTORY_CREATION_CONTRACT.md](./INVENTORY_CREATION_CONTRACT.md), [PURCHASE_RECEIVING_CONTRACT.md](./PURCHASE_RECEIVING_CONTRACT.md), [BACKUP_FORMAT_V1.md](./BACKUP_FORMAT_V1.md), and [SECURITY_AND_PRIVACY.md](./SECURITY_AND_PRIVACY.md).
