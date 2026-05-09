-- Admin/backend guardrails for shared Pokemon catalog management.
-- Public users can read approved Pokemon catalog rows through the prior read policy.
-- Direct shared-catalog writes require an authenticated admin/moderator profile or service-role backend code.

alter table public.product_catalog enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'is_admin_or_moderator'
  ) then
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'product_catalog'
        and policyname = 'Admins manage Pokemon product catalog'
    ) then
      create policy "Admins manage Pokemon product catalog"
        on public.product_catalog
        for all
        to authenticated
        using (public.is_admin_or_moderator())
        with check (public.is_admin_or_moderator());
    end if;
  end if;
end $$;
