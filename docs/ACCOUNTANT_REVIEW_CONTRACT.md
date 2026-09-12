# Accountant Review and Prior-Period Adjustment Preview Contract

Status: Phase 2C-E local-only, read-only review candidate. Starting baseline: `5eef5ae59e79dccb7cbb341f42ca6bda7468a762`.

Phase 2C-E derives an OWNER-only accounting review from existing canonical local Purchase, Receiving, Inventory, lot, Sale, correction, disposition, and reconciliation history. It is a review projection, not an accounting ledger, tax return, journal-entry system, or mutation boundary.

## Invariants

```text
Original Transaction Period != Correction Period
Original COGS != Reconciliation Adjustment
Historical Record != Current Effective Projection
Accountant Review != Accounting Mutation
Refund != Return
Refund != Inventory Removal
```

Historical Purchase, Receiving, Inventory Creation, Inventory correction, Sale, Transfer, and reconciliation records remain unchanged. Phase 2C-E adds no writer, mutation action, accounting authority, provider connection, or remote persistence path.

## Derived review boundary

`AccountantReviewItem` is an ephemeral, immutable projection derived after verified OWNER authorization from current validated local state. It may reference:

- an immutable managed Sale and its original Sale-time product and exact COGS;
- the Purchase, Receiving, Inventory item, and acquisition lot provenance behind that Sale;
- confirmed append-only Inventory correction, disposition, and reconciliation events;
- exact realized-COGS and remaining-Inventory deltas;
- separate refund and physical-return facts; and
- current effective reporting projections.

The item is not persisted, backed up, restored, migrated, synchronized, posted, or sent anywhere. It does not become a new canonical accounting record. Refresh or navigation requires regeneration from canonical local history.

## Review categories

The bounded review categories are:

- `PRIOR_PERIOD_COGS_ADJUSTMENT`
- `CURRENT_PERIOD_COGS_ADJUSTMENT`
- `PRODUCT_RECLASSIFICATION_REVIEW`
- `INVENTORY_COST_REVIEW`
- `REFUND_ACCOUNTING_REVIEW`
- `RETURN_ACCOUNTING_REVIEW`
- `RECONCILIATION_REVERSAL_REVIEW`
- `SALE_REPORTING_REVIEW`
- `TRANSFER_REVIEW_BLOCKED`

There is no generic bookkeeping category and no category authorizes a write. `TRANSFER_REVIEW_BLOCKED` is capability truth only: schema 5 has no canonical managed-Transfer authority, so Phase 2C-E cannot derive or confirm an authoritative transfer accounting correction.

## Reporting-period basis

Phase 2C-E supports calendar month, calendar quarter, and calendar year. It preserves the original transaction date and the correction/reconciliation timestamp as separate facts.

- An exact Sale date recorded as `YYYY-MM-DD` is classified exactly as recorded and is never shifted through a browser time zone.
- A canonical ISO reconciliation instant is classified from its UTC calendar date.
- Month is `YYYY-MM`, quarter is `YYYY-Q1` through `YYYY-Q4`, and year is `YYYY`.
- Input must pass strict calendar validation; JavaScript date rollover is not accepted.
- Period derivation does not mutate either source date.

The current canonical state has no authoritative owner-business time-zone policy for these events. The UI must disclose the date basis and must not describe UTC-derived correction periods as accountant-approved local-business periods.

For each item, the projection may expose `originalMonth`, `originalQuarter`, `originalYear`, `correctionMonth`, `correctionQuarter`, and `correctionYear`, plus explicit same/different-period facts.

## Prior-period classification

Review flags are operational aids, not tax conclusions:

- `NO_PRIOR_PERIOD_ISSUE`
- `SAME_MONTH_ADJUSTMENT`
- `SAME_QUARTER_ADJUSTMENT`
- `PRIOR_MONTH_REVIEW`
- `PRIOR_QUARTER_REVIEW`
- `PRIOR_YEAR_REVIEW`
- `ACCOUNTANT_REVIEW_RECOMMENDED`

When more than one boundary differs, the displayed primary flag uses deterministic precedence: prior year, prior quarter, prior month, same quarter, same month, then no issue. Separate booleans retain each month/quarter/year comparison so a higher-level flag does not erase the underlying facts.

`ACCOUNTANT_REVIEW_RECOMMENDED` may accompany a prior-period flag when the item affects realized COGS or another material historical projection. It means only that the owner may wish to consult an accountant.

## Original and effective exact-money projections

All canonical accounting values are integer minor units paired with one validated currency. Floating-point display fields are not authority.

For each Sale:

```text
original recorded COGS
+ confirmed reconciliation deltas
= current effective COGS projection
```

Where exact net proceeds are available:

```text
original profit = exact net proceeds - original recorded COGS
effective profit = exact net proceeds - current effective COGS
profit adjustment = effective profit - original profit
```

If net proceeds cannot be represented exactly under the current money contract, profit projections remain unavailable with a bounded warning. The review must never silently round a legacy floating value into accounting authority.

The UI must label `ORIGINAL_RECORDED` and `CURRENT_EFFECTIVE` separately. It must not relabel an effective projection as the value originally recorded on the Sale.

## Aggregation and reversal handling

Summary calculations count each fact exactly once:

- original realized COGS is counted once per distinct Sale;
- later adjustments are the exact per-event/per-Sale signed deltas for Sales in the original reporting period;
- an event-level realized delta and its affected-Sale detail are alternate views of the same effect and must not be added together;
- remaining-Inventory effects are counted once per reconciliation event, not repeated for each affected Sale; and
- reversal events remain visible and contribute their signed inverse rather than deleting or hiding the event they reverse.

A period summary may show:

```text
original realized COGS for the original period
+ later reconciliation adjustments affecting that period
= current effective projection for that original period
```

It must be labeled `Current projection including later corrections`; it is not a rewritten historical snapshot.

## Sale- and lot-level review

A Sale-level item may show bounded references and exact values for Sale date, product, quantity, revenue, original COGS, adjustment, effective COGS, original/effective profit when exact, reconciliation date/category/reason, source lot, Purchase, and period classification.

A lot-level summary may show original acquisition cost only when that original can be proven from immutable Inventory Creation provenance. A reconciliation event's `previousState` is the state immediately before that event, not necessarily the original acquisition state. If the original cannot be proven, the projection reports it unavailable rather than inferring it. Lot summaries keep acquired, sold, and remaining quantity plus realized and remaining exact-cost effects visibly reconciled.

## Refund and return review

Money movement and physical movement remain separate. Review may distinguish:

- `REFUND_ONLY`
- `RETURN_ONLY`
- `REFUND_AND_RETURN`
- `PARTIAL_REFUND`
- `PARTIAL_RETURN`

A Purchase return event alone does not prove Inventory moved. Physical return must be supported by the effective append-only Inventory disposition history. Refund evidence alone never removes Inventory or rewrites a Sale.

## Filing status, severity, and wording

No authoritative filed-period status exists. Every Phase 2C-E item therefore reports `FILING_STATUS_UNKNOWN`. This phase does not add `OWNER_MARKED_FILED`, filing-status persistence, or any tax-filing action.

Attention levels are operational only:

- `INFO`: ordinarily a same-month correction;
- `REVIEW`: ordinarily a prior-month or prior-quarter item; and
- `HIGH_ATTENTION`: ordinarily a prior-year item affecting realized COGS.

The UI may say `Review item`, `Prior-period adjustment`, `Current projection`, or `May warrant accountant review`. It must not claim `tax error`, `tax violation`, `deductible`, `must amend`, or any professional tax/legal conclusion.

## OWNER-only read path and UI

The Accountant Review section belongs within the existing Business Purchase/reporting workflow. Verified OWNER authorization must occur before Purchase or Inventory storage is read. Browser query parameters, localStorage flags, role/session fields, profiles, and entitlement metadata never establish authority.

Allowed behavior is limited to viewing, grouping, and in-memory filtering by period, retailer, product, Sale, category, or attention level. Phase 2C-E adds no `Post Adjustment`, `Journal Entry`, `Book Entry`, `Amend Tax Return`, `Mark Deductible`, `File Return`, synchronization, accounting export, free-form note, or other mutation control.

## Security and data minimization

The projection accepts only validated canonical local records and bounded safe references. It rejects client authority/session injection, credentials, passwords, payment-card/CVV data, retailer authentication, cookies, tokens, OAuth material, OTPs, proxy credentials, credential-bearing URLs, raw mailbox/provider/Bot content, unsafe objects, and prototype-pollution keys. Error and review copy never echoes a rejected value.

Accountant review requires no provider credential or payment credential and performs no network request.

## Backup, Restore Preview, and migration

`AccountantReviewItem`, filters, groups, period summaries, and impact projections are regenerable derived state. Phase 2C-E adds no Backup Format source, record path, export section, migration source, or remote authority. It does not persist notes or export files.

The existing schema-5 Inventory/Sale/reconciliation and Purchase/Receiving sources remain the canonical local inputs and retain their existing Backup/Restore Preview validation. Restore Preview remains zero-write. All mixed Inventory, Sale, reconciliation, and Purchase/Receiving remote paths remain `REQUIRES_MAPPING`; no Accountant Review projection is mapped.

## Explicit exclusions and current safety state

Phase 2C-E does not create a general ledger, post a journal or accounting adjustment, amend or file a tax return, infer filed status, alter a historical period, mutate a Sale/Purchase/Inventory/Transfer, send or export accountant data, or provide tax/legal advice. Managed Transfer authority, server-grade transactions, prior-period tax policy, Raw-card condition authority, and Graded-card/slab authority remain separately gated future work.

`LOCAL_ONLY` remains authoritative. `REMOTE_ACTIVE` remains disabled. The canonical PostgreSQL/Supabase schema remains unapplied and owner data/files remain unmigrated. Phase 2B2-B.1 remains paused with `hostedRuntimeVerified=false`; Phase 2D-B3 remains unstarted. Gmail, Outlook, Stellar, and Hayha remain `NOT_CONFIGURED`; `NO_LIVE_BOT_PILOT_YET` is unchanged. Upstash, Supabase, provider-auth Vercel configuration, billing, and Production remain untouched.
