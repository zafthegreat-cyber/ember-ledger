-- Cards whose only printing was called "Default" although TCGplayer names it (Normal, Holofoil,
-- Reverse Holofoil, ...). Rename that printing to the TCGplayer name (same row and id), set its
-- finish/printing/price, then let catalog_add_missing_printings add the other printings for the
-- few that have more than one. Cards TCGplayer has no price for keep "Default".

with d as (
  select v.id as vid, mci.id as mci_id,
    coalesce(
      (select p.price_subtype from public.product_market_price_current p
        where p.source = 'TCGCSV' and p.source_product_id = pc.tcgplayer_product_id
          and p.price_subtype = pc.price_subtype limit 1),
      (select p.price_subtype from public.product_market_price_current p
        where p.source = 'TCGCSV' and p.source_product_id = pc.tcgplayer_product_id
          and coalesce(p.price_subtype, '') <> ''
        order by array_position(array['Normal', 'Holofoil', 'Reverse Holofoil', '1st Edition',
          '1st Edition Holofoil', 'Unlimited', 'Unlimited Holofoil'], p.price_subtype) nulls last
        limit 1)) as sub,
    pc.tcgplayer_product_id as pid
  from public.master_catalog_variants v
  join public.master_catalog_items mci on mci.id = v.catalog_item_id
  join public.product_catalog pc on pc.id = mci.legacy_product_catalog_id
  where v.variant_name = 'Default'
    and mci.catalog_item_type = 'card'
    and mci.archived_at is null and mci.duplicate_of is null
    and coalesce(pc.tcgplayer_product_id, '') <> ''
)
update public.master_catalog_variants v set
  variant_name = d.sub,
  variant_type = case
    when d.sub ilike '%reverse%' then 'reverse_holo'
    when d.sub ilike '%holo%' then 'holo'
    when d.sub ilike '%1st edition%' then 'first_edition'
    when d.sub ilike '%unlimited%' then 'unlimited'
    else 'standard' end,
  finish = case
    when d.sub ilike '%reverse%' then 'Reverse Holofoil'
    when d.sub ilike '%holo%' then 'Holofoil'
    when d.sub ilike '%normal%' then 'Normal' end,
  printing = case when d.sub ilike '%1st edition%' then '1st Edition' when d.sub ilike '%unlimited%' then 'Unlimited' end,
  external_ids = coalesce(v.external_ids, '{}'::jsonb) || jsonb_build_object('tcgplayer_product_id', d.pid),
  market_price = coalesce((select p.market_price from public.product_market_price_current p
                            where p.source = 'TCGCSV' and p.source_product_id = d.pid and p.price_subtype = d.sub),
                          v.market_price),
  updated_at = now()
from d
where v.id = d.vid
  and d.sub is not null
  and not exists (select 1 from public.master_catalog_variants o
                  where o.catalog_item_id = d.mci_id and o.variant_name = d.sub
                    and o.language = v.language and o.condition_name = v.condition_name);

-- The few with two or more printings now get the rest.
select public.catalog_add_missing_printings(null);
