# Ember & Tide Retailer Drop Source Framework

Drop Radar can track retailer drop/watch sources without scraping retailer websites, bypassing bot protection, or automating checkout.

## Commands

- `npm.cmd run sync:drop-sources`
  - Writes source profiles to `src/data/generated/retailerDropSources.json`.
  - Writes safe status metadata to `src/data/generated/retailerDropStatus.json`.

- `npm.cmd run sync:retailer-drops`
  - Refreshes source profiles and the generated retailer drop cache.
  - Writes `src/data/generated/retailerDropEvents.json`.
  - Writes `src/data/generated/retailerDropCalendarEvents.json`.

## Source Policy

- Connected API sources are used only when an allowed connector and required credentials are configured.
- Manual-only retailers are skipped gracefully by sync scripts.
- Community reports and admin-confirmed drops remain clearly labeled.
- No retailer webpages are scraped.
- No checkout, cart, or purchase automation is included.
- Missing API credentials do not fail the app.
- Secret values are never written to generated status files; only optional environment variable names may be listed.

## Labels

- `Official API`
- `Admin Confirmed`
- `Trusted Scout Report`
- `Community Report`
- `Manual Watch`
- `Source Not Connected`

## Calendar Event Types

- `Online Drop Watch`
- `Confirmed Online Drop`
- `Store Availability Watch`
- `Admin Confirmed Drop`
- `Community Reported Drop`
- `Manual Watch Reminder`

## Scheduling

No automatic scheduler is configured in this repo. If scheduling is added later, use hosting or CI to run `npm.cmd run sync:retailer-drops` on a safe cadence and keep manual-only retailers skipped.
