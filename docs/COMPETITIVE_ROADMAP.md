# Competitive roadmap (started Nov 17, 2026)

Goal from the owner: "We want to be the best." Compared against Collectr, Dex,
TCGplayer, pkmn.gg (collection trackers) and TrackaLacker, PokeNotify,
HiddenHolo and paid Discord groups (restock alerts). Sources and the
side-by-side are in the Nov 17 session notes; competitor feature claims are
mostly self-reported.

Our angle: one app for both halves of the hobby, free alerts, built for
collectors and not scalpers, any trading card game, Android first.

## Done

| What | Why it matters | Build |
|---|---|---|
| Headline: "Track your collection. Get free restock alerts. Built for collectors, not scalpers." | Says the angle in one line | 20 |
| Deals and Auctions hidden from collectors | Seller tools confused everyone else | 20 |
| Restock map at the top of Find > Restocks | HiddenHolo and TrackaLacker lead with a map | 20 |
| Home opens on search and your numbers | Collectr opens on one clear thing | 20 |
| Calm futuristic look, readable labels, dark set tiles with game names | Looks current; set tiles no longer clash | 21 |
| Collection value on Home | The number people open a tracker for | 22 |
| One-tap "Follow for free alerts" on the restock map | TrackaLacker's "Subscribe to alerts" is one tap; theirs is paid | 22 |
| Wants turn into alerts automatically | Ties collection and restocks together, which no competitor does | 22 |
| Card set filters on one row | First set shows sooner | 22 |

## Next, in order

1. **Scanner accuracy and speed.** The first thing people try in a tracker and
   the top complaint about Collectr. Needs a test set of real cards (photos of
   50 to 100 cards across games, sleeved and unsleeved, good and poor light)
   so results can be measured before and after tuning. Owner: supply photos.
2. **Seed restock reports in a few areas.** A restock app with no reports looks
   empty. Start with the owner's own area; ask Discord and Facebook group
   members to post for two weeks. Not a code task.
3. **Value over time.** Collectr's chart is its hook. We already keep value
   snapshots (`collectionPortfolio.mjs`); show a small 30-day line on Home once
   an account has a week of history.
4. **Art-first tiles.** Competitors fill tiles with card art. The phone apps
   only show licensed or member-uploaded images, so this needs a licensing
   decision first (see `nativeLaunchScope.js`).
5. **Report trust on every report.** Show "seen 2 h ago", confirmed or not, and
   the reporter's trust level on each report row, not only on the map.
6. **Alert when a set you collect is reported.** Wants are covered (build 22);
   extend the server trigger to sets a person is working on.
7. **Fold Card sets and Collection filters into one Filters sheet.** Both pages
   still show 20+ controls on the first screen. Several browser tests click
   these controls, so it needs its own careful pass.
8. **Open testing, then production.** Play listing text is ready in
   `docs/PLAY_LISTING_TEXT.md`.

## Not planned

- Paid alert tiers, checkout bots, restock pattern history, store delivery
  schedules: against the collectors-first rules in `AGENTS.md`.
