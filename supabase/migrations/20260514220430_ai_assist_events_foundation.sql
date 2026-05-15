-- AI assistant foundation.
-- Logs reviewable AI suggestions without automatically saving final user data.
-- This migration is additive and safe to run after the Phase 2 workspace foundation.

begin;

create table if not exists public.ai_assist_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid references public.workspaces(id) on delete set null,
  feature_area text not null,
  input_summary text,
  output_summary text,
  confidence_score numeric,
  status text not null default 'suggested',
  accepted boolean,
  related_entity_type text,
  related_entity_id uuid,
  created_at timestamptz not null default now(),
  constraint ai_assist_events_feature_area_check
    check (feature_area in (
      'receipt_extraction',
      'catalog_match',
      'photo_lookup',
      'missing_product',
      'item_identification',
      'catalog_cleanup',
      'variant_help',
      'vault_summary',
      'forge_summary',
      'sales_summary',
      'expense_mileage',
      'business_report',
      'scout_report_classification',
      'scout_summary',
      'guess_planner',
      'forecast_explanation',
      'store_directory',
      'admin_review',
      'kids_program',
      'listing_description',
      'feedback_summary',
      'notification_copy',
      'marketing_copy',
      'trust_copy',
      'settings_help',
      'onboarding_help',
      'roadmap_changelog',
      'beta_readiness'
    )),
  constraint ai_assist_events_status_check
    check (status in ('suggested', 'accepted', 'rejected', 'edited', 'failed')),
  constraint ai_assist_events_confidence_score_check
    check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 100))
);

create index if not exists ai_assist_events_user_created_idx
  on public.ai_assist_events(user_id, created_at desc)
  where user_id is not null;

create index if not exists ai_assist_events_workspace_created_idx
  on public.ai_assist_events(workspace_id, created_at desc)
  where workspace_id is not null;

create index if not exists ai_assist_events_feature_status_idx
  on public.ai_assist_events(feature_area, status, created_at desc);

create index if not exists ai_assist_events_related_entity_idx
  on public.ai_assist_events(related_entity_type, related_entity_id)
  where related_entity_type is not null and related_entity_id is not null;

alter table public.ai_assist_events enable row level security;

drop policy if exists "ai_assist_events_read_own_workspace_admin" on public.ai_assist_events;
create policy "ai_assist_events_read_own_workspace_admin"
  on public.ai_assist_events for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin_or_moderator()
    or (
      workspace_id is not null
      and public.can_read_workspace(workspace_id)
    )
  );

drop policy if exists "ai_assist_events_insert_own_workspace" on public.ai_assist_events;
create policy "ai_assist_events_insert_own_workspace"
  on public.ai_assist_events for insert
  to authenticated
  with check (
    public.is_admin_or_moderator()
    or (
      user_id = (select auth.uid())
      and (
        workspace_id is null
        or public.can_edit_workspace(workspace_id)
      )
    )
  );

drop policy if exists "ai_assist_events_update_status_own_workspace" on public.ai_assist_events;
create policy "ai_assist_events_update_status_own_workspace"
  on public.ai_assist_events for update
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin_or_moderator()
    or (
      workspace_id is not null
      and public.can_edit_workspace(workspace_id)
    )
  )
  with check (
    user_id = (select auth.uid())
    or public.is_admin_or_moderator()
    or (
      workspace_id is not null
      and public.can_edit_workspace(workspace_id)
    )
  );

grant select, insert, update on public.ai_assist_events to authenticated;

comment on table public.ai_assist_events is 'Audit trail for reviewable AI helper suggestions. AI output is advisory and should not automatically create final user or global data.';
comment on column public.ai_assist_events.input_summary is 'Minimal, sanitized input summary. Avoid storing sensitive receipt/payment details or child personal information.';
comment on column public.ai_assist_events.output_summary is 'Short reviewable AI suggestion summary shown to users/admins.';
comment on column public.ai_assist_events.accepted is 'Whether the user/admin accepted the suggestion after review. Null means not decided.';

notify pgrst, 'reload schema';

commit;
