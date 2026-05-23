# Ember & Tide Calendar Data Sync

The release/drop calendar is generated from safe public and local sources.

## Commands

- `npm.cmd run sync:release-calendar`
  - Pulls official Pokemon.com release/product pages listed in `scripts/sync-calendar-data.mjs`.
  - Writes deterministic rows to `src/data/generated/releaseCalendar.json`.
  - Uses local TCGCSV/catalog data for image and product matching when possible.
  - Labels rows as `Confirmed Release` only when the official source is reachable and a release date is parsed.
  - Keeps configured fallback rows as `Rumored/Unconfirmed` when the source cannot be verified.

- `npm.cmd run sync:drop-calendar`
  - Refreshes local Drop Radar calendar seed/status data.
  - Runtime Drop Radar events are generated in the app from Scout reports and admin/manual training restocks.
  - Keeps predicted drop windows separate from Scout-confirmed restocks.

- `npm.cmd run sync:calendar-data`
  - Runs both release and drop calendar sync paths.
  - Updates `src/data/generated/calendarSyncStatus.json`.

- `npm.cmd run sync:retailer-drops`
  - Refreshes the safe all-retailer drop source framework.
  - Writes generated retailer drop cache rows only for connected/allowed sources.
  - Manual-only retailers are skipped without failing the app.

## Scheduling

No automatic scheduler is configured in this repository.

Suggested cadence:

- Release calendar: daily or weekly.
- Market pricing: daily via `npm.cmd run sync:market-prices`.
- Drop calendar: daily or immediately after confirmed restock/training entry.

Do not add new secrets for these scripts. If a live source is unavailable, the scripts keep deterministic fallback rows as unconfirmed watch items and log counts only.

## Source policy

- Release Calendar rows are facts only when labeled `Confirmed Release`.
- Drop Radar Calendar rows are estimates when labeled `Predicted Drop Window`.
- Scout-confirmed store reports are labeled `Confirmed Restock`.
- Community or unverified rows are labeled `Rumored/Unconfirmed`.
- No retailer websites are scraped and no restock/drop times are invented by these scripts.
- Automatic scheduling is not configured in this repo; scheduling must be wired in hosting or CI before claiming a daily calendar refresh.
