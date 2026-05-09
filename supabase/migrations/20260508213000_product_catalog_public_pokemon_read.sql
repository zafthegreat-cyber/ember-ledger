-- Allow the frontend anon client to browse the shared imported Pokemon catalog.
-- This is read-only. Inserts/updates/deletes still require existing owner/admin/service-role paths.

alter table public.product_catalog enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'product_catalog'
      and policyname = 'Public read Pokemon product catalog'
  ) then
    create policy "Public read Pokemon product catalog"
      on public.product_catalog
      for select
      using (category = 'Pokemon');
  end if;
end $$;
