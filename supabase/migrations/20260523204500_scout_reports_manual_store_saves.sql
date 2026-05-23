begin;

alter table if exists public.store_reports
  alter column store_id drop not null;

create index if not exists store_reports_store_name_time_idx
  on public.store_reports(lower(store_name), report_time desc nulls last)
  where store_id is null and store_name is not null;

create index if not exists store_reports_store_name_observed_at_idx
  on public.store_reports(lower(store_name), observed_at desc nulls last)
  where store_id is null and store_name is not null;

comment on column public.store_reports.store_id is
  'Optional Supabase store reference. Scout reports may use store_name when submitted against generated directory/manual stores that do not have a synced stores.id row yet.';

notify pgrst, 'reload schema';

commit;
