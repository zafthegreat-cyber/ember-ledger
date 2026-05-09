-- Beta 1 RLS hardening.
-- Adds policies for review/suggestion tables that already had RLS enabled but no policies.
-- Adds a safe public read policy for Pokemon market price history.

begin;

do $$
declare
  suggestion_table text;
begin
  foreach suggestion_table in array array[
    'store_suggestions',
    'catalog_suggestions',
    'sku_suggestions',
    'retailer_product_suggestions',
    'scout_report_reviews',
    'store_intelligence_suggestions'
  ]
  loop
    execute format('alter table public.%I enable row level security', suggestion_table);

    execute format('drop policy if exists "users_insert_own_%s" on public.%I', suggestion_table, suggestion_table);
    execute format(
      'create policy "users_insert_own_%s" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id and status in (''Draft'', ''Submitted''))',
      suggestion_table,
      suggestion_table
    );

    execute format('drop policy if exists "users_read_own_%s" on public.%I', suggestion_table, suggestion_table);
    execute format(
      'create policy "users_read_own_%s" on public.%I for select to authenticated using ((select auth.uid()) = user_id or public.is_admin_or_moderator())',
      suggestion_table,
      suggestion_table
    );

    execute format('drop policy if exists "admins_manage_%s" on public.%I', suggestion_table, suggestion_table);
    execute format(
      'create policy "admins_manage_%s" on public.%I for all to authenticated using (public.is_admin_or_moderator()) with check (public.is_admin_or_moderator())',
      suggestion_table,
      suggestion_table
    );
  end loop;
end $$;

alter table public.product_market_price_history enable row level security;

drop policy if exists "Public read Pokemon market price history" on public.product_market_price_history;
create policy "Public read Pokemon market price history"
  on public.product_market_price_history
  for select
  using (
    exists (
      select 1
      from public.product_catalog pc
      where pc.id = product_market_price_history.catalog_product_id
        and pc.category = 'Pokemon'
    )
    or source in ('TCGCSV', 'PokemonTCGAPI')
  );

commit;
