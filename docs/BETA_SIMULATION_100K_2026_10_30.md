# Simulated beta: 100,000 users (October 30, 2026)

An offline beta rehearsal. 100,000 synthetic users with realistic collections,
sales, mileage, Scout reports and community posts were run through the app's
real domain modules on one machine, plus persona walkthroughs decided by the
app's real access, gating, safety and onboarding code. Nothing touched
production, Supabase, Vercel or the network. Scripts:
`node --no-warnings scripts/simulate-beta-100k.mjs` and
`node --no-warnings scripts/simulate-beta-personas.mjs`; raw results in
`artifacts/qa/beta-simulation-100k/`.

What this is not: it is not a load test of code3tcg.app, it does not exercise
Supabase row-level security, auth, Stripe, eBay or the native shells, and it
does not render the React UI. Those need a staging deployment and a browser.

## Headline

**No crashes, no data-integrity failures, no access-control leaks across
100,000 users.** 800,000 feature-gate checks and 220,000 community posts behaved
exactly as designed. The problems found are all about scale and copy: the
biggest sellers cannot back up or even fit in browser storage, every restore
preview carries a meaningless warning, and Marketplace listings skip the
contact-detail safety check that Tidepool posts get.

One defect was found and fixed during the run: the additive restore planner
rescanned every accepted record for each incoming one. A 7,000-record restore
took 121 s before the fix and 2.8 s after, with identical results.

## Population

| Persona | Users | Collection | Sales | Tier |
|---|---|---|---|---|
| Family parent | 29,941 | 20–150 items, 1–4 kid purchasers | none | Family |
| Kid with parent | 15,133 | 5–60 items | none | Family (parent-managed) |
| Casual collector | 24,879 | 50–600 items | 0–5 | Collector |
| Active seller | 15,081 | 300–3,000 items | 50–800 | Seller |
| Power seller | 2,961 | 3,000–12,000 items | 1,000–5,000 | Seller |
| Scout | 7,994 | 0–40 items, 20–300 reports | none | Free |
| New / lurker | 4,011 | empty | none | Free |

Totals processed: 15.3 M sales records, 229,035 export disclosures, 220,272
community posts, 1,000,084 import rows parsed, 1,148 full backup → preview →
restore-plan cycles (every 100th user plus 150 power sellers).

## Findings, by priority

### P1 — Large sellers cannot export a verified backup
58 of the 150 sampled power sellers (39%) got "Backup verification failed"
because their backup JSON exceeded `BACKUP_PARSE_LIMITS.maxBytes` (10 MB). The
threshold is roughly 9,000 items plus 3,000 sales. The export succeeds, then
the self-check refuses to read it back, so the user is told verification failed
with no explanation and no file. Affects about 1.1% of all users but a large
share of the people most likely to pay for the Seller tier.
*Suggested fix:* raise the parse limit for self-produced backups, or split large
backups into per-source files, and show the size and the limit in the failure
message. Ledger item to add under Batch 8.

### P1 — Power-seller workspaces do not fit in localStorage
2,902 users (2.9%) have a legacy `et-tcg-beta-data` payload over 5 MB (UTF-16),
the usual browser quota; the largest was 17 MB (12,000 items). Median user is
122 KB, p95 3.2 MB, p99 12.4 MB. These users would hit save failures that the
app currently reports only after the write fails. This is improvement **#74**
(storage-quota guidance) and it is more urgent than its P1-queued position
suggests; cloud workspace sync is the real answer for the seller tier.

### P1 — Marketplace listings skip the contact/address safety check
Tidepool posts blocked all 26,823 unsafe posts (phone numbers, addresses,
"kids only", off-platform payment, counterfeit claims) with zero false
positives on 150,729 safe posts. Marketplace listing drafts with the same text
passed in every sampled case except "PayPal friends and family only".
`validateMarketplaceListingDraft` calls `validateCommunityCopy`, which does
not include `detectTidepoolSafetyReviewReason` (phone, email, exact address,
counterfeit/replica, guaranteed-restock claims). For a family-safe marketplace
the listing path should run the same check. Small, additive fix.

### P2 — Every restore preview shows a warning that means nothing
1,048 of 1,090 verified backups previewed as READY_WITH_WARNINGS; the warning
was always "Some records with money values do not declare a currency." Legacy
records never store a currency field, so every real user with a priced item
sees this. Treat legacy sources as USD by default in the preview, or drop the
warning for sources whose schema has no currency field.

### P2 — Manual sale drafts accept a missing or invalid sale date
`validateManualSaleDraft` validates quantity, amount and channel but not
`saleDate`; "not a date" and an empty date both pass. `summarizeSalesRecords`
then includes undated sales in every year's summary, which would misstate the
year-end export. Add a date check (the form uses a date input, so the main
exposure is bulk/CSV paths).

### P3 — Free-plan copy promises features the gates lock
The Free pricing card says "collection value", "set progress" and "Forge
ledger", while `portfolio_value`, `set_completion` and `forge_inventory` are
gated to Collector/Seller. Either the card means a lighter sub-feature or the
copy will read as a broken promise to the 12,005 Free users in this mix. Confirm
in the Vault UI and align one or the other.

### P3 — Main-thread work for big sellers
Year-end summary: p50 2.5 ms, p95 47 ms, p99 139 ms, max 392 ms. Set completion:
p95 31 ms, p99 59 ms, max 228 ms. Both run synchronously on the main thread in
the UI and will drop frames for power sellers; consider memoising per record set
or moving to a worker. Catalog search over a 20,000-product synthetic catalog:
p50 86 ms, p95 160 ms, max 466 ms per query, so the existing debounce matters.

### Informational
- Feature gates: 800,000 checks, 0 unexpected. Kids never reached seller
  tools (15,133/15,133). Pending/waitlisted users were held every time
  (9,979/9,979).
- Tidepool: new posts always start as Pending Review (0 public by default).
- The Spark: 338 valid applications accepted; 338 applications containing an
  exact birthdate rejected (corrected 3,000-user run; the first pass used a
  wrong age-range code in the test data).
- Portfolio summaries: 0 invariant failures across 200,000 summaries.
- Export disclosures (#97): 229,035 generated, 0 missing a private-data flag.
- Backup plans (#80): 1,090 plans, 1,090 matched their dry-run counts, 0
  wrote to storage.
- Restock feed at community scale: 250,000 reports prepared in 0.73 s; filter
  p50 12 ms, p99 102 ms.
- Timing after the planner fix: backup export p95 1.8 s, preview p95 0.6 s,
  plan p95 1.9 s, worst case 4.2 s on a 12,000-item seller.

## Persona walkthroughs

Steps decided by the real modules (`personas.json` has every step):

- **Access.** 20% of modelled sign-ups are outside Virginia and get the
  waitlist message; 10% of approved-state users are pending and wait on an
  admin. Together that is the largest "stuck" population in the beta, and it
  is by design — plan admin approval throughput accordingly.
- **Onboarding.** Everyone gets the 12-item checklist; 4–5 items (Forge,
  Scout report, kids program, Scout points, alerts) are irrelevant to a given
  persona and still count toward completion. Average completion after first
  actions in the simulation was 2.6/12. Consider per-persona checklists.
- **Scouts and new users (12%).** Free tier locks Portfolio Value, Set
  Completion, Wishlist Alerts and Collection Export with clear upgrade copy,
  but see the pricing-copy mismatch above.
- **Sellers.** All seller tools available; Shop Profile Tools locked behind the
  Shop plan with admin review, which is the intended path.
- **Kids.** Cannot post; parents' Spark applications validate correctly.
- **Everyone.** Off-platform steering with no digits or address ("message me
  on Insta, meet after school by the bus loop") passes the automated check and
  relies on the Pending Review moderation queue. Moderation staffing is part
  of beta readiness.

## Changes made during this exercise
- `src/features/backup/workspaceRestorePlan.js`: exact-duplicate detection in
  `mergeMissing` now uses a set of canonical strings (linear) instead of a
  rescan (quadratic). Existing recovery, device-transfer, restore-preview and
  restore-compatibility tests pass unchanged.
- New scripts: `scripts/simulate-beta-100k.mjs`,
  `scripts/lib/beta-simulation-worker.mjs`, `scripts/simulate-beta-personas.mjs`.

## Suggested next steps
1. Fix the Marketplace listing safety check (one-line change, add a test).
2. Decide the large-backup strategy (raise limit vs. split files) and add the
   size to the failure message; pull **#74** forward.
3. Default legacy money fields to USD in the restore preview.
4. Validate `saleDate` in manual sale drafts.
5. Align Free-plan copy with the gates.
6. When a staging deployment exists, run a real load test against it.
