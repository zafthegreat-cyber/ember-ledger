# Sync Error States

Phase 2 workflows must tell the user where their data was saved and what they can do next. No workflow should silently fail.

## Supabase Connected

Use when the app is signed in and cloud persistence is available.

Expected behavior:

- Saves go to Supabase.
- Reloaded records come from Supabase.
- The status text is calm and affirmative.
- Local fallback is not presented as the active save path.

## Local Only Mode

Use when the app intentionally saves to local storage because cloud persistence is not configured or not available.

Expected behavior:

- The user sees `Local only mode`.
- The save still succeeds locally.
- The workflow explains that cloud sync is not active.
- Records remain available after reload on the same device.

## Supabase Unavailable

Use when the app has Supabase configuration but cannot reach the service.

Expected behavior:

- The user sees `Supabase unavailable` or equivalent status.
- The workflow saves locally if possible.
- A retry action is available when useful.
- The app avoids repeated noisy errors.

## Saved Locally

Use after a local fallback save succeeds.

Expected behavior:

- The user receives positive confirmation.
- The message does not imply cloud persistence.
- The record is marked for future sync if pending sync exists.

## Pending Sync

Use when a local record still needs to be copied to Supabase later.

Expected behavior:

- The record has a local ID.
- The record has no `synced_at` value or has changes newer than `synced_at`.
- The UI can show pending status without blocking local work.
- Manual retry remains possible.

## Retry Sync

Use when a previous sync failed but can be attempted again.

Expected behavior:

- The action is visible near the sync status.
- Retrying should not duplicate records.
- Success should update remote IDs and `synced_at`.
- Failure should preserve local data and show a clear reason.

## Missing Table

Use when Supabase responds that a required table, view, or route is missing.

Expected behavior:

- The app falls back locally.
- The user sees `Missing database table` or a similarly clear message.
- The message points to migration/setup, not user error.
- This state blocks signed-in persistence QA until fixed.

## RLS/Write Blocked

Use when Supabase exists but policies deny the operation.

Expected behavior:

- The app falls back locally when possible.
- The user sees `Permission/RLS blocked`.
- The message identifies this as an access-policy issue.
- The app does not retry in a loop.

## Sync Failed

Use for non-specific sync failures that are not clearly missing-table, unavailable, or RLS errors.

Expected behavior:

- The app preserves local data.
- The user sees `Sync failed`.
- Technical details are logged for developers without exposing secrets.
- The user can retry later.

## Synced Successfully

Use after a local or pending record has been written to Supabase.

Expected behavior:

- The record has a remote ID or confirmed remote key.
- `synced_at` is updated.
- The pending marker is cleared.
- Reloading the app reads the record from Supabase.

