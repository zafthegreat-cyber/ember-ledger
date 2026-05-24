begin;

alter table if exists public.store_reports
  add column if not exists source_type text,
  add column if not exists source_label text,
  add column if not exists submitted_by_display text,
  add column if not exists confidence text,
  add column if not exists imported_batch text,
  add column if not exists imported_by_admin boolean not null default false,
  add column if not exists scout_points_awarded boolean not null default true,
  add column if not exists import_key text,
  add column if not exists report_status text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'store_reports_report_status_check'
      and conrelid = 'public.store_reports'::regclass
  ) then
    alter table public.store_reports
      add constraint store_reports_report_status_check
      check (
        report_status is null
        or report_status in ('stock_seen', 'vendor_seen', 'leftover_stock')
      );
  end if;
end $$;

create unique index if not exists store_reports_import_key_uidx
  on public.store_reports(import_key)
  where import_key is not null;

create index if not exists store_reports_historical_import_idx
  on public.store_reports(imported_batch, observed_at desc nulls last)
  where source_type = 'historical_import';

create index if not exists store_reports_report_status_time_idx
  on public.store_reports(report_status, observed_at desc nulls last)
  where report_status is not null;

comment on column public.store_reports.source_type is 'Source category for Scout report rows, including historical_import for admin-seeded historical restock notes.';
comment on column public.store_reports.source_label is 'Human-readable source description shown in admin/history views.';
comment on column public.store_reports.submitted_by_display is 'Display name for imported/admin-submitted report rows when no normal user profile should be credited.';
comment on column public.store_reports.confidence is 'Text confidence label such as unverified_historical; separate from confidence_score for backwards compatibility.';
comment on column public.store_reports.imported_batch is 'Stable batch id for idempotent historical/admin imports.';
comment on column public.store_reports.imported_by_admin is 'True when a row came from an admin/import process rather than normal Scout submission.';
comment on column public.store_reports.scout_points_awarded is 'False for imported historical rows so Scout reputation/points are not awarded.';
comment on column public.store_reports.import_key is 'Stable unique key used by import scripts to prevent duplicate historical Scout reports.';
comment on column public.store_reports.report_status is 'Stock-positive historical status. Empty/no-stock sightings are intentionally excluded from import.';

notify pgrst, 'reload schema';

commit;
