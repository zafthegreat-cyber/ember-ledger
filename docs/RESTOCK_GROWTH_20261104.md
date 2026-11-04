# Restock signup and community growth

The organic campaign needs visitors to understand the app, create an account,
take a useful restock action and invite collectors they know.

## Experience

- The public landing now introduces community restocks in VA, NC, MD and DC.
  Its Create a free account action opens the existing signup panel. Email
  confirmation and all account access checks are unchanged.
- New members without a saved introduction choice begin with Restocks. Browse
  and Report my store visit reuse the existing application routes and submission
  flow. Previously saved collector, seller and shop choices remain available.
- Signup and member home community actions now include the Code 3 Facebook Page
  separately from the Facebook feedback group and Discord. Community membership
  is optional, and notification subscriptions remain separate.
- Invite a collector opens the device share sheet when available, otherwise
  copies a public app link. A cancelled share does not copy anything. If both
  methods are unavailable, a labelled, read-only field allows manual copying.
- The link opens `/scout/reports` with fixed campaign/source parameters. It
  contains no account IDs, workspace IDs, access credentials or private records.
  These parameters organize shared links only: existing Analytics removes query
  strings, and this change does not add attribution measurement or telemetry.

## Aggregate baseline

Read-only Code 3 Supabase counts at 2026-11-04 21:56:57 UTC:

- Profiles: 5 total, 3 created in the preceding seven days.
- Cloud `store_reports`: 0 total and 0 in the preceding seven days.
- Distinct authors of cloud reports in that window: 0.

Profiles include the owner's and any test accounts. These are not active-user,
reach or follower counts. Reports held only on devices are not represented.
No private identities or report contents were queried.

## Scope and verification

No paid ads, new paid features, custom telemetry, providers, billing, auth
settings, database writes or automatic social posting are part of this change.
Existing community reporting is not a stock guarantee.

Relevant checks exercise the real landing/member components, saved account
choices, share-sheet cancellation, clipboard failure and the exact public-only
share payload. Browser automation was unavailable in Work settings; browser
visual and authenticated member flows were not exercised through another tool.
