-- Add the printings TCGplayer sells for a card (Reverse Holofoil, 1st Edition, ...) that the
-- catalog does not list yet. Until now each card had only its first printing in
-- master_catalog_variants, so the app offered one choice even when TCGCSV prices several
-- (e.g. Sewaddle WHT 001/086: Normal and Reverse Holofoil).
--
-- Rules:
--  * Only visible card items (not archived, not a duplicate) with a TCGplayer product id.
--  * Only items whose product has two or more TCGCSV printings.
--  * Items that list a "Default" or "Sealed" printing are left alone (no double entries).
--  * Existing rows and ids are never changed, except a printing's market_price, which is only
--    ever replaced by a newer non-null price.
--  * The daily price run calls the same function for the items it just priced, so new
--    printings appear and their prices stay current.

create or replace function public.catalog_add_missing_printings(p_items uuid[] default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_added integer := 0;
begin
  create temp table if not exists _camp (
    mci_id uuid, pc_id uuid, pid text, sub text, market numeric
  ) on commit drop;
  truncate _camp;

  insert into _camp
  select mci.id, pc.id, p.source_product_id, p.price_subtype, p.market_price
  from public.master_catalog_items mci
  join public.product_catalog pc on pc.id = mci.legacy_product_catalog_id
  join public.product_market_price_current p
    on p.source = 'TCGCSV' and p.source_product_id = pc.tcgplayer_product_id
  where (p_items is null or mci.id = any (p_items))
    and mci.catalog_item_type = 'card'
    and mci.archived_at is null
    and mci.duplicate_of is null
    and coalesce(pc.tcgplayer_product_id, '') <> ''
    and coalesce(p.price_subtype, '') <> '';

  -- Keep only items with two or more printings and no Default/Sealed entry.
  delete from _camp c
  using (
    select k.mci_id from _camp k group by k.mci_id having count(distinct k.sub) < 2
    union
    select v.catalog_item_id from public.master_catalog_variants v
    where v.variant_name in ('Default', 'Sealed')
  ) d
  where d.mci_id = c.mci_id;
  analyze _camp;

  insert into public.master_catalog_variants
    (catalog_item_id, variant_type, variant_name, finish, printing, language, condition_name,
     is_default, external_ids, market_price, display_order)
  select c.mci_id,
    case
      when c.sub ilike '%reverse%' then 'reverse_holo'
      when c.sub ilike '%holo%' then 'holo'
      when c.sub ilike '%1st edition%' then 'first_edition'
      when c.sub ilike '%unlimited%' then 'unlimited'
      else 'standard'
    end,
    c.sub,
    case
      when c.sub ilike '%reverse%' then 'Reverse Holofoil'
      when c.sub ilike '%holo%' then 'Holofoil'
      when c.sub ilike '%normal%' then 'Normal'
    end,
    case when c.sub ilike '%1st edition%' then '1st Edition' when c.sub ilike '%unlimited%' then 'Unlimited' end,
    'English', '', false, jsonb_build_object('tcgplayer_product_id', c.pid), c.market,
    coalesce(array_position(array['Normal', 'Holofoil', 'Reverse Holofoil', '1st Edition',
      '1st Edition Holofoil', 'Unlimited', 'Unlimited Holofoil'], c.sub), 8)
  from _camp c
  where not exists (select 1 from public.master_catalog_variants v
                    where v.catalog_item_id = c.mci_id and v.variant_name = c.sub
                      and v.language = 'English' and v.condition_name = '')
  on conflict (catalog_item_id, variant_name, language, condition_name) do nothing;
  get diagnostics v_added = row_count;

  -- The older table the product page reads.
  insert into public.catalog_product_variants
    (catalog_product_id, variant_name, printing, finish, language, condition_name, is_default)
  select c.pc_id, c.sub,
    case when c.sub ilike '%1st edition%' then '1st Edition' when c.sub ilike '%unlimited%' then 'Unlimited' end,
    case when c.sub ilike '%reverse%' then 'Reverse Holofoil' when c.sub ilike '%holo%' then 'Holofoil'
      when c.sub ilike '%normal%' then 'Normal' end,
    'English', '', false
  from _camp c
  where not exists (select 1 from public.catalog_product_variants v
                    where v.catalog_product_id = c.pc_id and v.variant_name = c.sub
                      and v.language = 'English' and v.condition_name = '')
  on conflict (catalog_product_id, variant_name, language, condition_name) do nothing;

  -- Each printing's own price; never replaced with null.
  update public.master_catalog_variants v set
    market_price = c.market,
    updated_at = now()
  from _camp c
  where v.catalog_item_id = c.mci_id and v.variant_name = c.sub
    and v.language = 'English' and v.condition_name = ''
    and c.market is not null
    and v.market_price is distinct from c.market;

  return v_added;
end;
$function$;

revoke all on function public.catalog_add_missing_printings(uuid[]) from public, anon, authenticated;

-- Daily run: after pricing a set, add/refresh printings for the items it just priced.
-- Patched in place so other changes to catalog_price_apply_group are kept.
do $do$
declare d text := pg_get_functiondef('public.catalog_price_apply_group'::regproc);
begin
  if d !~ 'catalog_add_missing_printings' then
    d := replace(d,
      '  select count(*)::integer into v_items from _cpr_pick where market is not null;',
      '  perform public.catalog_add_missing_printings(array(select distinct mci_id from _cpr_pick where mci_id is not null));' || E'\n\n' ||
      '  select count(*)::integer into v_items from _cpr_pick where market is not null;');
    if d !~ 'catalog_add_missing_printings' then
      raise exception 'catalog_price_apply_group: hook point not found';
    end if;
    execute d;
  end if;
end $do$;

-- One-time fill for the whole catalog.
select public.catalog_add_missing_printings(null);
