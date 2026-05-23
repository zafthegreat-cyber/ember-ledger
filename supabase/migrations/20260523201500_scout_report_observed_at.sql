-- Scout report observed visit time for backfilled store visits.
-- created_at remains the insert/submission time; observed_at is the actual store visit time.

begin;

alter table if exists public.store_reports
  add column if not exists observed_at timestamptz default now();

update public.store_reports
set observed_at = coalesce(observed_at, created_at, report_time, reported_at, now())
where observed_at is null;

update public.store_reports
set report_time = coalesce(report_time, observed_at)
where report_time is null;

create index if not exists store_reports_observed_at_idx
  on public.store_reports(observed_at desc nulls last);

create index if not exists store_reports_store_observed_at_idx
  on public.store_reports(store_id, observed_at desc nulls last);

create index if not exists store_reports_workspace_observed_at_idx
  on public.store_reports(workspace_id, status, observed_at desc nulls last)
  where workspace_id is not null;

comment on column public.store_reports.observed_at is
  'Actual store visit/restock observation time. created_at remains the time the report was submitted to Ember & Tide.';

commit;
