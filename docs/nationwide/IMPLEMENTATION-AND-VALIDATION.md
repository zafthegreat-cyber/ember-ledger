# Easy nationwide coverage

The normal path is one city/ZIP search, one matching result, then nearby reports. Nationwide and Online are separate one-tap choices. State/city dropdowns remain optional filters. Store coverage varies; accepting nationwide reports does not claim a complete national store inventory.

## App and website

- A shared accessible search covers all 50 states and DC, including Alaska, Hawaii and leading-zero ZIPs. Nearby uses a 25-mile default across state borders; 10/50/100 miles are optional.
- The selected public area is remembered on this device, independently of accounts and private collection permissions. No GPS permission or home address is required.
- Report cards, community reports, the store directory, manual store forms and the profile location use the shared controls. Forms retain manual entry as a fallback for postal-only ZIPs or unmapped places.
- Existing authorization and visibility checks run before location filtering. Authentication, account linking, collection data and retailer monitoring are unchanged.
- City/ZIP centers are approximate public Census geography, not store coordinates. Existing records without coordinates match their city and state only.

## Discord and public feed

- The private interests picker starts with three menus: products, Online and projects. Original local-room menus remain under Optional local rooms, preserving existing roles and room visibility.
- Set nearby area searches the same city/ZIP catalog. One private opt-in area per signed Discord member is stored through service-only RPCs. Changing or clearing an area requires that member's signed interaction. Clear writes a replay tombstone so delayed saves cannot restore an opt-in.
- Local reporting starts with city/ZIP search, then the existing private form and staff review. Known original cities preserve their existing routing. New places use shared-local and product copies.
- Default staff approval remains silent. Explicit notification checks the current product role, private nearby preference, radius and room visibility. Explicit user mentions in the shared local feed exclude members already eligible for the original area-room role mention. Online stays separate.
- A report with over 50 nearby candidates fails closed before publication; staff can publish silently. This first rollout does not claim unlimited notification throughput.
- The public feed accepts only validated public area/radius or Online filters. Filtering precedes the 50-report limit. Only approved, recent, non-test, non-withdrawn public fields are returned. Discord member IDs, private area preferences and staff notes never enter this feed.
- No channel permission changes, new location roles, member role assignments, automatic stock checks or retailer jobs are part of this rollout. Best Buy stays locked paused.

## Verification

- 11 app/report tests: all 51 jurisdictions; all 663 state/game combinations; ambiguous cities; ZIP+4 and leading zeros; cross-state radius; Online separation; actual rendered report controls and empty states; preserved existing visibility input.
- 187 Discord tests: signed private ownership; opt-out and stale replay; live-role/visibility intersection; duplicate mention exclusion; national approval-to-two-copy delivery; retry idempotence; public projection and invalid query rejection; preserved existing handlers.
- Disposable PostgreSQL: private grants/RLS, replay-safe save/clear, report validation, invalid coordinates, and per-area filtering with over 50 newer out-of-area reports.
- Both Edge Function entry points typecheck. Web production build and native configuration smoke bundle pass. The smoke bundle deliberately has no account credentials and must not be distributed.
- Changed React files pass lint with one pre-existing App.jsx hook dependency warning.
- Browser visual verification is pending because local browser use is disabled in Work settings. No alternative browser automation bypass was used.

## Release and rollback

`integrations/discord/PRODUCTION-CHANGE-REVIEW.md` identifies the exact database and function changes. Run `node scripts/prepare-nationwide-discord.mjs` before packaging functions; it copies the same nonsecret catalog and matching engine used by the app.

The website uses the normal repository/Vercel release. Installed native apps require a normal signed native update; building a web smoke bundle does not update installed apps. App browsing preferences and Discord notification preferences remain separate explicit choices; linking an account does not silently opt it into notifications.

Rollback restores the saved pre-rollout functions and previous website deployment. Leave the additive private table and service-only RPCs in place until its stored opt-ins are reviewed; do not drop member preferences or report records as part of a code rollback.

## Production backend receipt

November 8, 2026: the private-area migration was applied successfully. Both functions were read back byte-for-byte after deployment. A rollback-only check exercised private save/clear/stale replay and the real national submit/queue/review/two-copy planner; zero fixtures remained. Public global/Nearby/Online requests returned HTTP 200; invalid/private filter requests returned 400; unsigned Discord interaction returned 401. Five existing bot-owned instruction messages were updated with mentions disabled and controls preserved. Best Buy remained locked paused, with its polling job inactive.
