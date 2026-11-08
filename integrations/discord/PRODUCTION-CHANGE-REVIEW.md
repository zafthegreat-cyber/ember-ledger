# Nationwide city/ZIP rollout

Target: Code 3 TCG, Supabase `gxsfququorfczvhrkudl` only.

Apply `production-migration.sql`: adds private `code3_submissions.nearby_preferences` and get/save/candidates RPCs; replaces only the existing report-submit validation to accept canonical national locality keys and validated public area centers; adds a service-only area-filtered public-feed RPC. All functions are SECURITY INVOKER with an empty search path. Anonymous and authenticated users have no table or RPC access. No existing rows, roles, grants on existing account tables, retention rules or cron jobs are changed.

Replace `code3-discord-roles` with the preserved live v14 handlers plus the tested nearby module, shared Census catalog, simplified private picker, reporting entry point and updated help copy. Preserve `verify_jwt=false`; Ed25519 request verification remains in core.mjs. Existing environment secrets are reused without reading or replacing them.

Replace `code3-community-feed` with the preserved public projection plus validated nearby/Online reads and coarse public place labels. Preserve `verify_jwt=true`. The new RPC filters the latest report before the 50-report cap; member preferences, submitter IDs and staff notes are not projected.

After readback verification, edit only existing bot-owned public picker/submission instructions and directly related guides, with all mentions disabled. Preserve current buttons and reset controls. No channels or roles are created or deleted and no permissions are expanded. Members opt in themselves; no existing member selections are changed.

Nearby notification uses explicit signed-member opt-in plus the member's current product role and channel visibility. Default approval and product copies stay silent. Existing original-area role notifications remain, and overlapping nearby recipients are excluded from a second mention. Online remains separate. More than 50 nearby candidates fails closed and requires silent publication in this rollout.

Validation: 187 Discord tests; disposable PostgreSQL migration/privacy/replay/report/feed checks; both Deno entry points typecheck; 10 app tests; web and native smoke bundles. No synthetic observation has been published as real inventory and no live member has been pinged during these tests.

Backups: exact live v14 roles source in `backup-v14/` and `readback-before/`; public feed v1 in `backup-feed-v1/`; original report-submit definition in `backup-v14/report-submit.sql`. Restore code first for rollback. Do not remove member data or additive RPCs as part of rollback.

Best Buy must remain `paused=true`, `locked_paused=true`; `code3-bestbuy-discord` must remain inactive. No retailer function, API key, cron schedule, source state or maintenance behavior is changed.
