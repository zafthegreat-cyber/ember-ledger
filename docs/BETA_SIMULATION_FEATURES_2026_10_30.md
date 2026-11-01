# Simulated beta, round 2: feature coverage and what users would want (October 30, 2026)

Second offline rehearsal with 100,000 synthetic users (same persona mix as
`BETA_SIMULATION_100K_2026_10_30.md`). This round asks two questions: does every
feature behind the product areas work, and what would these users ask us to
change or add? Scripts: `node --no-warnings scripts/simulate-beta-features.mjs`
(45 minutes on two cores; `--recompute` re-runs the wants model from saved
results). Raw data: `artifacts/qa/beta-simulation-features/results.json`.

How to read "what users want": the simulation cannot interview anyone. Each
persona has a set of goals (3 = central, 1 = nice-to-have). A goal is decided by
the real code — the tier gate, whether the module behind it ran cleanly, and the
documented status of that feature in `FEATURE_STATUS_MATRIX.md`. Goals that are
locked, partial, local-only or not built become requests, weighted by how many
simulated users hold that goal and how central it is. Treat the numbers as
relative priority, not survey results. Note that the matrix predates the
October cloud-sync work, so some CLIENT_LOCAL_ONLY rows may be out of date.

## Part A — Is everything working?

34 feature functions behind Vault, Market, Scout, Forge, Tidepool, The Spark,
Ember Assist, onboarding and suggestions were run for every user: **3.38 million
calls, 0 exceptions, 1 harmless invariant mismatch** (the trade analyzer returned
"fair" for an exactly even trade, a value the check didn't list).

| Area | Feature | Runs | Throws | Avg ms | p95 ms | Max ms |
|---|---|---|---|---|---|---|
| Vault | Portfolio summary | 100,000 | 0 | 0.3 | 1.1 | 36 |
| Vault | Set completion | 84,397 | 0 | 7.0 | 31 | 103 |
| Vault | Collection set rows + filter | 168,794 | 0 | 6.5 | 21 | 99 |
| Vault | CSV export | 92,850 | 0 | 1.9 | 11 | 46 |
| Vault | Wishlist → owned | 92,623 | 0 | 0.02 | 0 | 7 |
| Vault | Inventory valuation | 95,811 | 0 | 4.7 | 22 | 84 |
| Vault | Price reliability | 95,811 | 0 | 3.0 | 13 | 66 |
| Market | Catalog search (2,500 products) | 100,000 | 0 | 10.2 | 19 | 98 |
| Market | UPC scan match | 100,000 | 0 | 5.2 | 8.6 | 59 |
| Market | Best catalog match | 11,838 | 0 | 24.5 | 40 | 97 |
| Market | Trade analyzer | 76,660 | 0 | 0.01 | 0 | 14 |
| Market | Quick Add catalog match | 100,000 | 0 | 0.06 | 0.1 | 10 |
| Market | Market confidence | 95,811 | 0 | 0.00 | 0 | 5 |
| Scout | Restock feed prepare | 68,286 | 0 | 0.09 | 0.5 | 12 |
| Scout | Feed filter | 68,286 | 0 | 0.01 | 0 | 4 |
| Scout | Guess eligibility | 100,000 | 0 | 0.01 | 0 | 7 |
| Scout | Regional store buckets | 68,286 | 0 | 0.14 | 0.4 | 12 |
| Scout | Store search | 68,286 | 0 | 0.07 | 0.3 | 12 |
| Scout | Notifications build/prefs | 204,858 | 0 | 0.02 | 0.1 | 8 |
| Forge | Sales summary | 76,345 | 0 | 0.5 | 2.4 | 82 |
| Forge | Year-end tax summary | 76,345 | 0 | 9.6 | 37 | 253 |
| Forge | Mileage grouping | 76,345 | 0 | 0.09 | 0.4 | 12 |
| Forge | Sales export rows | 76,345 | 0 | 0.14 | 0.6 | 21 |
| Forge | Bulk import parse | 9,071 | 0 | 0.4 | 2.5 | 8 |
| Forge | Manual fallback validation | 18,142 | 0 | 0.00 | 0 | 9 |
| Forge | Sale draft validation | 76,345 | 0 | 0.01 | 0 | 12 |
| Tidepool | Post validation | 61,751 | 0 | 0.03 | 0 | 12 |
| Tidepool | Comment validation | 123,502 | 0 | 0.01 | 0 | 11 |
| Spark | Application validation | 8,925 | 0 | 0.01 | 0 | 5 |
| Assist | Starter prompts | 100,000 | 0 | 0.01 | 0 | 6 |
| Onboarding | Checklist | 100,000 | 0 | 0.05 | 0.1 | 11 |
| Onboarding | Empty-state guidance (7 areas) | 700,000 | 0 | 0.00 | 0 | 12 |
| Suggestions | Submit + duplicate check | 10,296 | 0 | 0.02 | 0 | 4 |
| Exports | Disclosure sentence | 76,345 | 0 | 0.05 | 0.1 | 15 |

Behavioural observations from the same run:

- UPC scanning matched 70,110 of 70,110 real barcodes and produced 0 false
  matches on 29,890 unknown barcodes.
- Catalog search never returned an empty result for a known name.
- Trade analyzer: 11,899 of 38,330 trades (31%) ended "Unknown Balance" because
  one side had no value. Users will read that as "the app couldn't help".
- Price reliability: on average 25% of a user's items have no market value.
- Scout guess eligibility: 16,728 of 100,000 (17%) blocked for too few Scout
  points, which is the intended ramp but will be asked about.
- Set rows: 941,105 of 1,067,083 set rows (88%) had owned progress to show.
- Tidepool comments: **all 61,751 comments containing a phone number were
  accepted.** `validateTidepoolCommentDraft` only checks the short unsafe-phrase
  list, not the contact/address/counterfeit detector that posts use. Same gap
  as Marketplace listings in round 1. **P1, kid-safety.**
- Bulk import: 290,272 pasted rows parsed, 0 lost their item name; the valid
  manual-fallback draft was accepted 9,071/9,071 times and the empty one
  rejected every time.
- Every empty state (Vault, Forge, Scout, Market, Hearth, Tidepool, Spark) has
  copy; Ember Assist always returns starter prompts.

Documented feature status (from `FEATURE_STATUS_MATRIX.md`, 278 rows): 54
IMPLEMENTED, 9 IMPLEMENTED_DIFFERENTLY, 71 CLIENT_LOCAL_ONLY (work on this
device, no cloud), 73 PARTIALLY_IMPLEMENTED, 23 FRONTEND_ONLY, 17 MISSING, 11
BLOCKED_BY_AUTHORIZATION, 6 BACKEND_REQUIRED, 5 FUTURE, 9 deprecated routes.
So: the code that exists is solid (nothing crashed), but by the app's own
inventory only about a quarter of planned features are complete end to end.

## Part B — Satisfaction by persona

| Persona | Users | Satisfaction | Biggest gaps |
|---|---|---|---|
| Kid with parent | 15,133 | 80% | Set progress partial; wishlist local-only; Tidepool events partial |
| Family parent | 29,941 | 78% | Set progress, Spark flows, restock notifications, one-file backup — all partial |
| New / lurker | 4,011 | 68% | Collection value locked on Free; PWA install partial |
| Active seller | 15,081 | 59% | eBay listing, cross-listing, receipt scan, year-end report — partial; sales/expenses local-only |
| Casual collector | 24,879 | 55% | Barcode scan not built; universal search partial; alerts, saved searches, export partial |
| Power seller | 2,961 | 44% | Shop profile and staff seats locked behind Shop plan; cloud sync of a large workspace partial |
| Scout | 7,994 | 37% | Current store details and restock alerts locked on Free; Report Restock and reputation partial |

Satisfaction credits 100% for working, 75% for works-on-this-device, 50% for
partial, 0 for locked/not built. Scouts score lowest because the Free tier
locks the two things a scout is there for, and the reporting flow itself is
marked partial.

## Part C — What users would want changed or added

Ranked by estimated number of simulated users who would raise it.

### Add / finish (highest demand)
1. **Restock and price alerts that actually notify** — ~12,000 parents plus
   ~6,200 collectors and ~4,800 scouts. In-app notifications are partial and
   provider-backed push is blocked by authorization. This is the single most
   requested capability across personas.
2. **Set completion and missing-card lists** — ~10,000 collectors, ~7,500
   parents, ~3,800 kids. Sets are local-only and Set Detail is partial; binders
   are MISSING in the matrix.
3. **Universal search across cards, sealed and your own records** — ~10,000.
   Catalog search works; the cross-record search is partial.
4. **Barcode scan to add a product** — ~10,000 collectors. The UPC matcher
   works perfectly in code (70,110/70,110); the camera/share entry is
   FRONTEND_ONLY. Finishing the entry point unlocks a feature that already works.
5. **The Spark application and kids' program flows** — ~7,500 parents.
   Validation is solid; donations, giveaways and events are partial.
6. **One-file complete backup** — ~7,500 parents, ~1,200 power sellers; also
   the >10 MB verification failure from round 1.
7. **Collection export to spreadsheet** — ~6,200 (plus year-end export for
   ~6,000 sellers). Exports exist; the "complete bookkeeping export" is partial.
8. **Follow several Scout stores with current details** — ~6,200 collectors.
9. **Saved Market searches / watchlists** — ~6,200.
10. **Seller workflow completions** — list on eBay (~6,000), cross-listing
    (~3,800), receipt scan to expenses (~3,800), bulk purchase import
    (~3,800). Sales channel profiles, shipping and returns are MISSING.

### Change (friction in what exists)
11. **Free-tier scope for scouts** — ~4,800 scouts hit two Collector locks
    (current details, alerts) on the flows that make them useful to everyone
    else. Consider a scout-specific unlock earned with Scout points, which also
    answers the 17% blocked from guessing.
12. **Trade analyzer "Unknown Balance" 31% of the time** — offer a one-tap
    estimate from the catalog/market price when a side has no value.
13. **25% of items with no market value** — surface a "price these" queue;
    the price-reliability summary already computes it.
14. **Collection value locked on Free** (~1,400 newcomers) conflicts with the
    Free pricing copy; align copy and gate (round-1 finding).
15. **Shop plan gating** for power sellers (~1,000) — staff seats and shop
    profile are the upgrade path, so the Shop plan's "checkout coming soon"
    becomes a blocker for the highest-value users.
16. **Cloud sync for seller data** — sales, expenses and mileage are
    local-only; ~3,000 sellers would ask for cross-device access, and round 1
    showed 2.9% of users exceed browser storage.
17. **Onboarding** — 12-item checklist regardless of persona; scouts and
    parents see 4–5 irrelevant items.

### Fix (defects, from both rounds)
18. Tidepool comment and Marketplace listing drafts skip the contact/address/
    counterfeit safety check (P1).
19. Backups over 10 MB fail self-verification (P1).
20. Restore preview warns about currency on every legacy backup (P2).
21. Manual sale drafts accept a missing or invalid date (P2).
22. Year-end summary (p99 139 ms, max 253 ms) and set completion (max 103 ms)
    on the main thread for big sellers (P3).

## Suggested order
1. Safety: route comments and listings through the same detector as posts.
2. Alerts: finish in-app notifications end to end; decide the push provider.
3. Finish what already works underneath: barcode scan entry, set detail,
   universal search, saved searches, complete export.
4. Seller completions: eBay listing, cross-listing, receipts, import queue; then
   cloud sync for seller data and the large-backup fix.
5. Tier adjustments: scout unlock path, Free copy vs. gates, Shop plan path.
