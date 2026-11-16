# Simulated beta — "build 11" (Nov 14, 2026)

**What this is.** An offline rehearsal of the code that will become bundle 11
(`main` + the Nov 13–14 work), run the same way as the Oct 30 100k simulation:
20,000 synthetic testers across the seven personas walk every feature that is
new since bundle 9, and every step is decided by the real modules. The "voices"
are template sentences keyed on what the code actually did to that tester, with
counts from the run. **It is not real feedback and not a load test.** It finds
things that are deterministic in code; it cannot find things that only a phone
shows (layout, colour, latency over LTE).

Scripts: `scripts/simulate-beta-build11.mjs` (new), plus the existing
`simulate-beta-features.mjs` (5,000 users) and `simulate-beta-personas.mjs`.
Raw output: `artifacts/qa/beta-simulation-build11/`.

## Defects found — all fixed before this doc was written

| # | Found by | What | Fix |
|---|---|---|---|
| 1 | checklist walk (store persona) | "Finish your public profile" could never be ticked: `publicProfileReady` was never passed from App, so shop accounts kept the getting-started card forever (dismiss still worked). | App now passes `publicProfileReady` (public username set); Home reads the prop. |
| 2 | search walk, 13 of ~3,000 number queries | "Jolteon EX 28" (no slash) ranked a different card first: the bare number got no card-number treatment, a name containing "28" won on substring, and a numeric *set code* could claim "Set code match". | Trailing bare number counts as the card number for ranking; name+number exact match returns 920–930 ahead of substring/alias hits; numeric set codes can't masquerade. Covered by `test:should-batch2`. |
| 3 | persona walk (community) | "Message me on Insta … meet up after school by the bus loop" passed the safety check because it had no digits or address. | Five grooming-shaped patterns added to `communitySafety.js` (off-platform handle + school/parents cue; "after school … meet"; "don't tell your parents"; "our secret … kid"). Ordinary "message me on Discord to trade" still passes. |

Two earlier "defects" were artifacts of the simulation itself (a made-up `/102`
total on every query; splitting Japanese names on spaces) and were corrected in
the script, not the app. The 5,000-user feature run reports
`INVARIANT:onboarding.checklist` because the old checklist now returns 6 items
instead of 12 — the invariant is stale, the behaviour is intended.

## Numbers

- Trade analyzer: 70.7% of simulated trades had one side blank (the Oct 30 run
  measured 31% "Unknown Balance" with no help). Every blank-side trade now gets a
  partial label and at least one fallback; 29% of those fallbacks are a one-tap
  button (what you paid / catalog estimate), the rest are a hint (MSRP floor,
  asking price).
- Catalog search p95 3.0 ms per query on 31-row samples (ranking changes added
  no measurable cost; `test:search-performance` still passes).
- CSV serialisation p95 5 ms for 1,500–5,000 rows on the main thread; the worker
  only matters on slow phones, where it is the difference between a hitch and none.
- Japanese alias coverage: 32 of 32 modern English sets have Japanese names and
  codes; barcode padding matched 12↔13↔14 digits in every sample.
- Open beta: 47 gates opened for Free; 12 stay closed (route planner, predictions,
  raw history, pattern tools, and the five admin tools). No tester reached a staff
  feature.
- Persona satisfaction (feature run, unchanged method from Oct 30): family-parent
  78%, kid-with-parent 80%, casual-collector 55%, active-seller 59%, power-seller
  56%, scout 57%, new-lurker 59%. Collectors and sellers are still capped by the
  Feature Status Matrix items that are "partial" (notifications, set detail,
  universal search, barcode entry UI).
- Access: all 7 real profiles in Supabase are approved; the persona warning about
  "pending" users is theoretical under the open-beta trigger.

## What testers said (counts out of 20,000; ordered by frequency)

**Liked**
- (20,000) Raw restock history still isn't there on any plan — "the thing that would turn this into a scalper tool."
- (19,184) The What's new card showed once after the update, with "Take the tour again", and went away on Got it.
- (17,083) Saved searches under the Market box — tap and it runs again.
- (13,735) The getting-started card went away on its own once the three things were done.
- (12,816) Quick report: tap a store, tap a status, report opens filled in; posting is one more tap.
- (5,449) Saving the same search twice with different capitals kept one, moved to the front.
- (2,073) 13-digit scan matched the 12-digit code typed earlier — "used to be two different products."
- (1,572) "sv2a" understood as Scarlet & Violet 151 — matters to people buying Japanese product.
- (1,467) Purchase return logged Requested → Returned → Refunded; refund capped at what was paid.
- (1,047) Blank-side trade offered "Use what you paid ($40.00)" as a button.
- (629) Warned the Market price was 105 days old before agreeing to a trade.
- (517) Exported 2,000+ sales without the app freezing.

**Wanted / confused**
- (8,592) First quick report pre-filled "Pokémon TCG sealed" as the category — right for most, wrong for singles reporters. *Suggestion: remember the last category per store, and offer "Singles" as a second chip.*
- (7,410) "Now that I can save a search, I want it to tell me when a saved search gets a new restock or a price drop." *This is SHOULD 17 (alerts end to end) wearing new clothes; saved searches are the natural trigger list.*
- (4,176) Quick-report buttons never appear for people who follow no stores. *Suggestion: show the two nearest directory stores as chips when nothing is followed.*
- (2,565) Blank-side trade with a Sealed item only got a hint ("use the shelf price as a floor"), not a button. *Suggestion: pull MSRP from the catalog row when present and make it tappable.*
- (2,480) Free users notice the Business ledger, Deal Finder and receipt scan are simply on, and want to be told before anything changes. *Covered by the Plans page copy; worth a line in the What's new card when prices go live.*
- (1,467) After a refund the items were still in inventory; testers expected a "remove these" action on the return record. *Suggestion: a "Mark items returned" button on a Refunded/Closed return that sets status/disposition on the linked inventory rows, with confirmation.*
- (5) Had the app a week with nothing ticked on the checklist and just hid it. Rare; fine.

**Top persona requests (feature run, unchanged from Oct 30 in order)**
restock notifications that actually arrive; set completion/missing cards; universal
search; barcode scan entry UI; one-file backup; wishlist price alerts; collection
export; follow a few stores; saved searches (now done); inventory with cost basis;
year-end export; list on eBay.

## Recommended before bundle 11 ships (small, from this run) — all done Nov 14

1. ✅ Quick report: Sealed / Singles / Both chips; category remembered per store.
2. ✅ Quick report: two suggested directory stores as chips when nothing is followed (ones you reported at first).
3. ✅ Trade fallback: MSRP floor is a tappable button when the catalog row has `msrpPrice`.
4. ✅ Purchase return: "Mark N items returned" on a Refunded/Closed return sets status "Returned", disposition "Returned to seller" on the linked unsold rows.

The simulation was updated to exercise all four (singles reporters, unfollowed
testers, sealed trades with MSRP) and reports zero code-decided defects.

## Recommended for the next sprint (bigger, confirmed by this run)

- Alerts end to end (SHOULD 17) with saved searches and followed stores as the subscription list — the single most-asked-for thing across both simulations.
- Main store off localStorage (SHOULD 16) — not exercised here, still the biggest data risk for sellers.

## Verification

`npm run test:should-batch2` (23), `test:community-safety`, `test:tidepool-community`,
`test:tidepool-moderation`, catalog shorthand/recovery, `test:search-performance`,
beta-corrections batch 3 + feedback-20 (28), quick-add routing; `simulate-beta-build11`
reports zero code-decided defects after the fixes; `simulate-beta-personas` no longer
flags the steering phrase. Build/lint on the PC as always.
