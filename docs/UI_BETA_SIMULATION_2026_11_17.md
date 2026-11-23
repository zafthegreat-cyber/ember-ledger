# Simulated UI beta, Nov 17 2026

5,000 synthetic testers walked over 220 real screen measurements (5 phone sizes x 2 themes x 2 text sizes x 11 screens). The measurements are facts from the running app (`scripts/measure-ui-beta.cjs`); the testers are simulated (`scripts/simulate-ui-beta.mjs`), so the percentages rank what to fix and are not a forecast of real ratings. It measures size, contrast, clipping and crowding only; it cannot judge taste, wording or whether a feature makes sense.

| | Before | After |
|---|---|---|
| Sessions with no UI problem | 25.6% | 96.3% |
| Problems hit per tester | 1.27 | 0.04 |
| Distinct problems | 21 | 7 |

## Top problems before the fixes

| # | Testers | Type | What was measured | Screens |
|---|---|---|---|---|
| 1 | 36.6% | tinyText | settings-layout__footer: "Build 2026-11" is 10px | settings |
| 2 | 24% | tinyText | settings-layout__account-type: "Local beta" is 10px | settings |
| 3 | 24% | tinyText | settings-layout__row-status: "All quiet" is 10px | settings |
| 4 | 14.8% | clipped | : "Collection" is cut off | sets, home, settings, wants, sell |
| 5 | 9.9% | tinyText | command-board-v4-mobile-brand: "Code 3 TCGMarket" is 11px | market |
| 6 | 4.9% | clipped | is-active: "Collection" is cut off | collection |
| 7 | 3.9% | crowded | collection: 20 controls on the first screen | collection |
| 8 | 1.7% | tinyText | scout-tile-map-attribution: "Map data OpenStreetMap" is 10px | restocks |
| 9 | 2.5% | crowded | sets: 22 controls on the first screen | sets |
| 10 | 0.5% | target | scout-tile-map-pin: "Open Greenbrier Target, Chesapeake, VA" is 36x36px (needs 44) | restocks |
| 11 | 0.7% | tinyText | code3-workspace-summary: "Ready to list" is 11px | sell |
| 12 | 0.9% | crowded | settings: 18 controls on the first screen | settings |
| 13 | 0.4% | target | scout-tile-map-pin: "Open Pembroke Target, Virginia Beach, VA" is 36x36px (needs 44) | restocks |
| 14 | 0.4% | target | scout-tile-map-pin: "Open Redmill Target, Virginia Beach, VA" is 36x36px (needs 44) | restocks |
| 15 | 0.4% | target | scout-tile-map-pin: "Open Greenbrier Barnes & Noble, Chesapeake, VA" is 36x36px (needs 44) | restocks |
| 16 | 0.3% | tinyText | home-desktop-context: "Home" is 11px | home |
| 17 | 0.3% | crowded | signin: 15 controls on the first screen | signin |
| 18 | 0.1% | crowded | home: 17 controls on the first screen | home |
| 19 | 0.1% | tinyText | code3-workspace-home__header: "workspace" is 11px | sell |
| 20 | 0% | crowded | sell: 17 controls on the first screen | sell |
| 21 | 0% | long | sets: 7.9 screens of scrolling | sets |

## What is left

| # | Testers | Type | What was measured | Screens |
|---|---|---|---|---|
| 1 | 2.3% | crowded | sets: 22 controls on the first screen | sets |
| 2 | 0.6% | crowded | settings: 19 controls on the first screen | settings |
| 3 | 0.4% | crowded | home: 17 controls on the first screen | home |
| 4 | 0.2% | crowded | signin: 15 controls on the first screen | signin |
| 5 | 0.2% | crowded | collection: 23 controls on the first screen | collection |
| 6 | 0% | clipped | : "Auctions" is cut off | deals |
| 7 | 0% | long | sets: 6.6 screens of scrolling | sets |

Left on purpose: the Collection and Sets pages still show 20+ controls on the first screen. Folding their filters away is a layout change that needs its own pass.

Re-run: start the dev server, then `APP_URL=http://127.0.0.1:5280 node scripts/measure-ui-beta.cjs --out=artifacts/qa/ui-beta/run.json` and `node scripts/simulate-ui-beta.mjs --in=artifacts/qa/ui-beta/run.json`.
