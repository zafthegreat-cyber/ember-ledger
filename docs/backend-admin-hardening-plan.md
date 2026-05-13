# Backend/Admin Hardening Plan

Status: planning only. Do not implement until the migration, RLS, RPC, and QA scope below is reviewed and approved.

## Goal

Move Ember & Tide admin review, Scout moderation, store suggestions, catalog suggestions, and trust/reputation updates from local beta state into durable Supabase-backed workflows.

The current app should keep its review-first behavior:

- Normal users can suggest universal data changes.
- Normal users cannot directly mutate universal catalog/store/default restock data.
- Admins approve, reject, merge, or request more information through audited actions.
- Private user collection/business data does not become public or feed Scout predictions without explicit aggregation/anonymization.
- Admin review visibility for private submissions must be disclosed in the UI before submission.

## 1. Current Local-Only Flows

### Suggestion submission and review

Current local-only surface:

- `src/utils/suggestionReviewUtils.js`
  - `loadSuggestions()` reads `localStorage` key `et-tcg-beta-suggestions`.
  - `submitSuggestion()` writes suggestions to localStorage.
  - `updateSuggestionRecord()` updates localStorage rows.
  - `appendAdminReviewLog()` writes audit entries to localStorage key `et-tcg-beta-admin-review-log`.
- `src/App.jsx`
  - `submitUniversalSuggestion()` wraps `submitSuggestion()`.
  - `reviewSuggestion()` applies approve/reject/merge/duplicate decisions locally.
  - `applyApprovedSuggestion()` mutates local React/catalog/Scout state instead of Supabase universal tables.
  - Admin dashboard reads local suggestions and local marketplace review state.

Impact:

- Review decisions are not durable across devices.
- Admin actions are not tamper-resistant.
- Approved changes do not update the Supabase master catalog/store tables.
- There is no server-side "cannot approve your own suggestion" enforcement.

### Scout reports, store reports, and restock intelligence

Current local-only surface:

- `src/pages/Scout.jsx`
  - `const BETA_LOCAL_SCOUT = true`.
  - `SCOUT_STORAGE_KEY = "et-tcg-beta-scout"`.
  - `saveLocalScout()` writes stores, reports, tracked products, Tidepool reports/events, Best Buy stock state, route planning, restock intel, and Scout profile state to localStorage.
  - Missing store suggestions call local `submitSuggestion()`.
  - Store create/update falls back to suggestions when local beta/admin mode is active.
  - Report create/edit/delete uses localStorage when `BETA_LOCAL_SCOUT` is true.
  - Tidepool moderation actions update local arrays.
- `backend/src/services/stores.service.ts`
  - Uses `createMemoryStore()` for stores, reports, and alerts.
  - Not durable and not suitable for production/admin review.

Impact:

- Scout reports and store suggestions are not durable in signed-in cloud mode.
- Admin moderation cannot be trusted as a record of fact.
- Report reliability and trusted-reporter status are not backed by durable events.

### Existing Supabase foundation already present

Do not duplicate these concepts:

- `public.universal_data_suggestions` exists in `20260510190000_master_catalog_market_foundation.sql`.
- `public.user_trust_profiles` exists in `20260510203000_tcg_operating_system_foundation.sql`.
- `public.store_reports` exists in the early shared catalog migration, but needs moderation/privacy hardening before it becomes the source of truth.
- `public.is_admin()` / `public.is_admin_or_moderator()` helpers exist in later hardening migrations.
- Older suggestion tables also exist in `011_universal_data_approval_system.sql`, but the preferred direction should consolidate on `universal_data_suggestions` unless a separate table is intentionally required.

## 2. Tables, Functions, and Policies Needed

### Extend `universal_data_suggestions`

Use this as the main queue for store, catalog, SKU/UPC, restock pattern, and moderation suggestions.

Recommended additions:

- `visibility text not null default 'admin_review'`
- `admin_review_visible boolean not null default true`
- `admin_visibility_disclosed_at timestamptz`
- `review_section text`
- `duplicate_of uuid references public.universal_data_suggestions(id)`
- `merge_target_table text`
- `merge_target_record_id text`
- `decision_reason text`
- `confidence numeric`
- `client_request_id text`
- `idempotency_key text`
- `source_context jsonb not null default '{}'::jsonb`

Recommended constraints:

- `status in ('Draft', 'Submitted', 'Under Review', 'Approved', 'Rejected', 'Needs More Info', 'Merged', 'Duplicate')`
- `visibility in ('admin_review', 'private_admin_review', 'community_report', 'team_shared', 'private_note', 'admin_only')`
- unique partial index on `(user_id, idempotency_key)` where `idempotency_key is not null`

### Add durable admin audit log

Preferred table: `public.admin_audit_log`

Columns:

- `id uuid primary key default gen_random_uuid()`
- `actor_user_id uuid references auth.users(id) on delete set null`
- `actor_role text`
- `action text not null`
- `entity_table text not null`
- `entity_id text`
- `suggestion_id uuid references public.universal_data_suggestions(id) on delete set null`
- `before_snapshot jsonb`
- `after_snapshot jsonb`
- `request_payload jsonb`
- `decision_reason text`
- `ip_hash text`
- `user_agent_hash text`
- `created_at timestamptz not null default now()`

Rules:

- Insert-only for RPC/admin functions.
- Admins can read.
- Normal users cannot read global audit logs.
- Do not expose private user inventory/receipt payloads unless specifically audited and labeled.

### Scout report moderation persistence

Option A, preferred: harden existing `public.store_reports`.

Add/confirm:

- `status text not null default 'submitted'`
- `visibility text not null default 'community_report'`
- `source_type text not null default 'user_report'`
- `confidence text`
- `confidence_score numeric`
- `verification_status text not null default 'unverified'`
- `moderation_status text not null default 'pending'`
- `reviewed_by uuid references auth.users(id) on delete set null`
- `reviewed_at timestamptz`
- `review_note text`
- `items_seen jsonb not null default '[]'::jsonb`
- `evidence jsonb not null default '[]'::jsonb`
- `admin_review_visible boolean not null default false`
- `admin_visibility_disclosed_at timestamptz`
- `is_public_signal boolean generated or maintained by RPC`

Option B: create `public.scout_reports` and migrate/alias later.

Recommendation: use existing `store_reports` if column compatibility is acceptable, because the app and migrations already reference it.

### Store suggestion approval target

Use one universal store table as the write target. Candidate tables already exist:

- `public.stores`
- `public.pokemon_retail_stores`

Recommendation before implementation:

- Choose one canonical table for Scout store pages.
- Treat the other as legacy/import source or create a compatibility view.
- Do not approve suggestions into both without a clear sync policy.

Canonical store table needs:

- public/authenticated read for approved/active stores.
- admin-only write.
- normal users submit `universal_data_suggestions`, not direct store inserts.
- unique/dedupe support by retailer + normalized address/store number.

### Catalog suggestion approval target

Use master catalog tables already built:

- `public.master_catalog_items`
- `public.master_catalog_variants`
- `public.master_catalog_identifiers`
- `public.master_market_price_sources`
- `public.master_market_summaries`

Do not approve new catalog suggestions into legacy `product_catalog` unless explicitly preserving a compatibility path.

### Safe user reputation/report reliability

Extend or add companion tables around `user_trust_profiles`:

`public.user_trust_events`

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid references auth.users(id) on delete cascade`
- `event_type text not null`
- `source_table text`
- `source_id text`
- `score_delta numeric not null default 0`
- `created_by uuid references auth.users(id) on delete set null`
- `reason text`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

Use events to update profile counters instead of directly trusting frontend increments.

## 3. RLS Rules Needed

### Admin identity

Use `public.is_admin()` and `public.is_admin_or_moderator()` backed by trusted `auth.jwt()->app_metadata` and/or protected `profiles.user_role`.

Do not use `user_metadata` for authorization.

### `universal_data_suggestions`

Normal users:

- `insert`: allowed only when `user_id = auth.uid()` and `status in ('Draft', 'Submitted')`.
- `select`: allowed only for own rows.
- `update`: allowed only for own rows while status is `Draft` or `Needs More Info`, and must not set admin fields.
- `delete`: optional; prefer soft-cancel status instead of delete.

Admins/moderators:

- `select`: allowed for reviewable rows.
- `update`: status/admin fields allowed through RPC only.
- `insert`: allowed for admin-entered suggestions.
- `delete`: avoid direct delete; use reject/archive status unless correcting accidental data.

### `admin_audit_log`

Normal users:

- no read.
- no insert/update/delete.

Admins:

- `select`: allowed.
- `insert`: preferably only through RPC/security-definer function.
- no update/delete except emergency service role maintenance.

### Store reports / Scout reports

Normal users:

- `insert`: own report only.
- `select`: public/community reports, own private reports, team-shared reports when workspace membership allows.
- `update`: own report only while status is draft/submitted and not verified/rejected.
- no direct verification/moderation fields.

Admins/moderators:

- `select`: public/community reports and admin-review-visible private submissions.
- `update`: moderation fields through RPC only.

Privacy:

- `private_note` remains visible only to owner and explicitly disclosed admin review.
- private Vault/Forge records must not be joined into community Scout views.

### User trust/reputation

Normal users:

- `select`: own private profile; public profiles only when `profile_visibility = 'public'`.
- no direct updates to report counters/reliability scores.

Admins/RPC:

- write trust events and update derived counters.

## 4. RPC / Function Names and Responsibilities

Keep write-capable approval operations server-side. Use RPCs rather than frontend multi-table writes.

Recommended RPCs:

- `public.submit_universal_data_suggestion(payload jsonb)`
  - validates target type, status, visibility disclosure, idempotency key.
  - inserts `universal_data_suggestions`.
  - returns suggestion row.

- `public.admin_start_suggestion_review(suggestion_id uuid)`
  - admin-only.
  - sets status `Under Review`.
  - writes `admin_audit_log`.

- `public.admin_reject_suggestion(suggestion_id uuid, reason text)`
  - admin-only.
  - sets status `Rejected`, decision reason, reviewer fields.
  - writes audit log.

- `public.admin_request_suggestion_info(suggestion_id uuid, reason text)`
  - admin-only.
  - sets status `Needs More Info`.
  - writes audit log.

- `public.admin_mark_suggestion_duplicate(suggestion_id uuid, duplicate_of uuid, reason text)`
  - admin-only.
  - sets status `Duplicate` or `Merged`.
  - links duplicate row.
  - writes audit log.

- `public.admin_approve_store_suggestion(suggestion_id uuid)`
  - admin-only.
  - validates suggestion target.
  - inserts/updates canonical store table.
  - updates suggestion status.
  - writes audit log with before/after snapshots.

- `public.admin_merge_store_suggestion(suggestion_id uuid, target_store_id uuid)`
  - admin-only.
  - merges into existing store.
  - writes audit log.

- `public.admin_approve_catalog_suggestion(suggestion_id uuid)`
  - admin-only.
  - routes by suggestion type:
    - missing catalog item -> `master_catalog_items`
    - UPC/SKU -> `master_catalog_identifiers`
    - variant correction -> `master_catalog_variants`
    - market value correction -> manual/approved `master_market_price_sources`
  - writes audit log.

- `public.admin_merge_catalog_suggestion(suggestion_id uuid, target_catalog_item_id uuid)`
  - admin-only.
  - merges duplicate/missing item suggestion into existing master item.
  - writes audit log.

- `public.submit_store_report(payload jsonb)`
  - normal user.
  - validates store exists or links to missing-store suggestion.
  - inserts store report with source, visibility, confidence, evidence.

- `public.admin_moderate_store_report(report_id uuid, action text, reason text)`
  - admin/moderator.
  - verifies/rejects/spam-flags report.
  - updates trust events.
  - writes audit log.

- `public.admin_record_trust_event(target_user_id uuid, event_type text, source_table text, source_id text, score_delta numeric, reason text)`
  - admin/RPC-only.
  - inserts trust event and updates `user_trust_profiles`.

Implementation note:

- Write functions that mutate privileged universal tables as `security definer`, but place them in an unexposed schema such as `private` if possible.
- Expose thin `public` RPC wrappers only if needed, with strict grants and explicit validation.

## 5. Admin UI Changes Needed

### Suggestion service adapter

Replace direct localStorage calls with a small service layer:

- `loadSuggestions()`
- `submitSuggestion()`
- `reviewSuggestion()`
- `loadAdminAuditLog()`

Behavior:

- signed-in cloud mode uses Supabase/RPC.
- local beta mode can continue using localStorage fallback.
- UI labels must clearly show `Cloud review queue` vs `Local beta review queue`.

### Admin dashboard

Add cloud-backed sections:

- Pending universal data suggestions.
- Pending store suggestions.
- Pending catalog suggestions.
- Pending Scout report moderation.
- Recent admin audit log.
- User trust/reliability changes.

### Store approval UI

Needs:

- Approve as new store.
- Merge into existing store.
- Reject with reason.
- Mark duplicate.
- Show current store candidates by retailer/address/city.
- Show submitted user, reason, visibility, and disclosure status.

### Catalog approval UI

Needs:

- Approve missing product.
- Add identifier to existing master item.
- Merge duplicate.
- Reject with reason.
- Show before/after catalog fields.
- Show variant/source/market data implications.

### Scout moderation UI

Needs:

- Verify report.
- Reject/spam.
- Mark as guess/prediction.
- Set visibility.
- Add moderation reason.
- Show report source and privacy label.
- Show whether report affects public confidence/predictions.

### User reputation UI

Needs:

- Show reliability counters and recent trust events.
- Dangerous trust changes require confirmation.
- Avoid exposing unnecessary email/private account details.

## 6. Migration Order

1. **Preflight inventory migration**
   - Confirm canonical store table choice.
   - Confirm legacy suggestion tables vs `universal_data_suggestions` consolidation.
   - Add comments documenting deprecated/local-only tables if needed.

2. **Admin audit log**
   - Create `admin_audit_log`.
   - Enable RLS.
   - Admin read policy.
   - RPC-only insert path.

3. **Universal suggestion hardening**
   - Add missing columns/indexes to `universal_data_suggestions`.
   - Add owner read/insert policies.
   - Add admin review policies.
   - Add idempotency/duplicate indexes.

4. **RPC foundation**
   - Add submit/review/reject/request-info/duplicate RPCs.
   - Add audit logging inside every admin RPC.
   - Verify no direct frontend multi-table approval writes are required.

5. **Store reports moderation**
   - Harden `store_reports` or create `scout_reports`.
   - Add visibility/moderation/evidence/items columns.
   - Add RLS policies.
   - Add submit/moderate RPCs.

6. **Store suggestion approval**
   - Add approve/merge/reject store RPCs.
   - Add dedupe helper/indexes.

7. **Catalog suggestion approval**
   - Add approve/merge/reject catalog RPCs.
   - Add identifier/variant/market-source approval behavior.

8. **Trust/reputation events**
   - Add `user_trust_events`.
   - Harden `user_trust_profiles` so normal users cannot self-award trust.
   - Add RPC updates from moderation decisions.

9. **Frontend service switch**
   - Introduce Supabase-backed suggestion/admin service.
   - Keep local fallback only in local beta mode.

10. **Verification and cleanup**
   - Add verify script checks for tables, policies, RPCs, and audit log.
   - Add admin E2E/smoke coverage.

## 7. Testing Plan

### Read-only verification

- Extend `verify:phase2:supabase` or add `verify:admin:supabase`.
- Check tables exist.
- Check RLS enabled.
- Check policies exist.
- Check functions/RPCs exist.
- Check grants do not expose privileged writes to anon.

### RLS tests

Use two normal test users and one admin test user.

Normal user:

- can submit own suggestion.
- can read own suggestion.
- cannot read another user's private suggestion.
- cannot approve/reject/merge.
- cannot update admin fields.
- cannot see admin audit log.

Admin:

- can see reviewable suggestions.
- can approve/reject/merge via RPC.
- cannot approve own suggestion unless explicitly allowed by policy, preferably disallowed.
- every action writes audit log.

Scout reports:

- normal user can submit report.
- public/community report is visible as community data.
- private report is owner-only unless admin-review disclosure is set.
- admin moderation changes report state and trust events.

Store/catalog approval:

- approve missing store creates/updates canonical store row.
- merge store suggestion updates target store and links suggestion.
- approve UPC/SKU inserts identifier without duplicate conflict.
- reject leaves universal data unchanged.

### UI tests

- signed-out user cannot open admin tools.
- normal signed-in user cannot see admin actions.
- admin can open review queue.
- admin action success messages only appear after RPC success.
- local beta mode still works as fallback and is labeled local-only.

### Regression tests

- `npm.cmd run backend:build`
- `npm.cmd run build`
- `npm.cmd run verify:phase2:supabase`
- `npm.cmd run smoke:beta`
- `npm.cmd run smoke:catalog-search`
- `npm.cmd run test:catalog-search`
- new admin verification script.

## 8. Rollback Plan

### Migration rollback

Prefer additive migrations first:

- Add tables/columns/functions without dropping old local fallback.
- Keep local beta fallback available behind `BETA_LOCAL_MODE`.
- Keep old UI localStorage path until Supabase path passes signed-in QA.

If a migration fails:

- Do not run repair by default.
- Stop and inspect migration history.
- Revert the migration file before applying to shared environments.

If a deployed frontend has admin RPC issues:

- Feature-flag the Supabase admin service off.
- Fall back to local beta review queue for testers only.
- Leave RLS-denied operations visibly failed, not silently successful.

If data is partially approved:

- Use `admin_audit_log` before/after snapshots to identify affected rows.
- Add compensating migration/RPC only after review.
- Do not manually edit production data without an approved recovery plan.

## 9. Risks

- Existing schema has overlapping store tables: `stores` and `pokemon_retail_stores`.
- Existing schema has overlapping suggestion systems: legacy specialized suggestion tables and `universal_data_suggestions`.
- Frontend currently applies approvals locally; moving to RPC can expose hidden assumptions in UI state.
- Admin identity must use trusted app metadata/protected profile fields, not user-editable metadata.
- Security-definer functions are powerful; they need strict input validation and narrow grants.
- Private Scout reports can leak if community views join or select too broadly.
- Trust/reputation can be gamed if frontend can write counters directly.
- Store report moderation can become a public prediction source too early unless verified/guess labels are enforced.
- Approval RPCs may need canonical mapping from legacy `product_catalog` IDs to `master_catalog_items`.

## 10. What Needs Approval Before Implementation

Before any code or migration work starts, approve:

1. Canonical store table:
   - `stores`
   - `pokemon_retail_stores`
   - or new `scout_stores` with compatibility views.

2. Suggestion system direction:
   - consolidate everything into `universal_data_suggestions`
   - or keep specialized `store_suggestions` / `catalog_suggestions` tables.

3. Admin role source:
   - app metadata only
   - protected `profiles.user_role`
   - both, with precedence rules.

4. Whether moderators can approve changes or only admins.

5. Which private submissions admins may review and what disclosure text users must see.

6. Whether store reports should use existing `store_reports` or a new `scout_reports` table.

7. Exact approval effects:
   - missing store creates active store immediately or creates inactive/admin-verified store.
   - catalog correction mutates master item or creates pending admin task for manual edit.
   - market price correction creates manual price source or updates summary directly.

8. Trust model scoring rules:
   - verified report score delta.
   - rejected/spam score delta.
   - helpful/community-confirmed score delta.
   - cooldown/limits for low-trust users.

9. Required audit retention:
   - keep forever.
   - keep for beta window.
   - export/archive policy later.

10. Rollout mode:
    - admin-only QA first.
    - limited beta users.
    - all signed-in users.

## Implementation Boundary

This plan intentionally does not:

- apply migrations.
- run `db push`.
- change RLS.
- connect providers.
- backfill data.
- rewrite frontend admin behavior.

Implementation should start only after the approval decisions above are resolved.
