# Ember & Tide Calendar Data Sync

The release/drop calendar is generated from safe public and local sources.

## Commands

- `npm.cmd run sync:release-calendar`
  - Pulls official Pokemon.com release/product pages listed in `scripts/sync-calendar-data.mjs`.
  - Writes deterministic rows to `src/data/generated/releaseCalendar.json`.
  - Uses local TCGCSV/catalog data for image and product matching when possible.

- `npm.cmd run sync:drop-calendar`
  - Refreshes local Drop Radar calendar seed/status data.
  - Runtime Drop Radar events are generated in the app from Scout reports and admin/manual training restocks.

- `npm.cmd run sync:calendar-data`
  - Runs both release and drop calendar sync paths.
  - Updates `src/data/generated/calendarSyncStatus.json`.

## Scheduling

No automatic scheduler is configured in this repository.

Suggested cadence:

- Release calendar: daily or weekly.
- Market pricing: daily via `npm.cmd run sync:market-prices`.
- Drop calendar: daily or immediately after confirmed restock/training entry.

Do not add new secrets for these scripts. If a live source is unavailable, the scripts keep deterministic fallback rows and log counts only.
