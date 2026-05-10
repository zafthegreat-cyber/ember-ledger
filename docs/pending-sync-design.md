# Pending Sync Design

This is a design note only. It does not implement full sync.

## Goal

When Supabase is unavailable, Phase 2 workflow records should remain usable in
local fallback mode. When Supabase returns, users should be able to retry sync
manually without duplicating records or losing local work.

## Affected Records

- Deal Finder sessions and items
- scanner intake sessions
- receipt drafts and line items
- notification preferences
- marketplace channel drafts
- Kid Pack Builder projects and items

## Local-Only Detection

Local fallback records should be treated as pending sync when they have one or
more of these markers:

- no `synced_at`
- `sync_status = "pending"`
- `source = "local"`
- local IDs that are not valid UUIDs
- `updated_at` newer than the last known `synced_at`

The current localStorage bucket is:

```text
et-tcg-phase2-data
```

Future sync metadata can be added per record without changing the current
fallback shape:

```json
{
  "syncStatus": "pending",
  "syncedAt": null,
  "remoteId": null,
  "lastSyncError": null
}
```

## Duplicate Avoidance

Use stable client-generated identifiers where possible:

- If the local ID is a valid UUID, send it as the remote `id`.
- If the local ID is not a UUID, store it in a client reference column if one is
  added later, or map it locally to the returned remote ID.
- For child records, sync parent records first and rewrite child foreign keys to
  returned remote IDs.
- For notification preferences, use the natural key:
  `user_id`, `workspace_id`, `alert_type`.
- For marketplace channel drafts, use:
  `source_inventory_id`, `platform`, `workspace_id`.

## Conflict Handling

Use conservative conflict rules:

- If only local changed, upload local.
- If only remote changed, keep remote and update local cache.
- If both changed, keep both versions visible and ask the user to choose.
- Prefer explicit user action over silent overwrite.
- Preserve raw local payload when a sync attempt fails.

Suggested conflict fields:

```json
{
  "syncStatus": "conflict",
  "conflictDetectedAt": "ISO timestamp",
  "localUpdatedAt": "ISO timestamp",
  "remoteUpdatedAt": "ISO timestamp"
}
```

## Manual Retry UX

The existing Phase 2 panel already shows local/sync status and a `Retry sync`
button. Future work can extend that flow:

- Show count of pending local records.
- Let users retry all pending records.
- Let users retry one workflow at a time.
- Show the last sync error per workflow.
- Keep all records local until a remote write succeeds.

## Workflow Order

1. Load local fallback data.
2. Confirm Supabase session and schema availability.
3. Fetch existing remote records for the user/workspace.
4. Build a sync plan without writing.
5. Show pending/conflict counts.
6. On user retry, sync parent records first:
   - Deal Finder sessions
   - receipts
   - Kid Pack Builder projects
7. Sync child records:
   - Deal Finder items
   - receipt lines
   - Kid Pack Builder items
8. Sync independent records:
   - scanner intake sessions
   - notification preferences
   - marketplace channel drafts
9. Mark successful records with `synced_at` and remote IDs.
10. Keep failures pending with `lastSyncError`.

## Non-Goals For Recovery Mode

- Do not build automatic background sync yet.
- Do not delete local records after sync until the user has verified data.
- Do not silently overwrite remote records.
- Do not require Supabase availability for local app use.
