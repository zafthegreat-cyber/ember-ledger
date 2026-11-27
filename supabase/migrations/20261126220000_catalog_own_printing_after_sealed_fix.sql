-- Main price of four cards that 20261126090000 moved from sealed back to cards.
--
-- While they were filed as sealed, the importer ranked their printings in the sealed
-- order (Normal, Sealed, Unlimited). Holofoil and Reverse Holofoil are both outside that
-- order, so the tie fell to Reverse Holofoil and it became the card's own printing
-- (product_catalog.price_subtype), which is the price the catalog shows. Every other
-- card of their kind shows Holofoil, the order the importer and the daily price job use
-- for cards (Normal, Holofoil, Reverse Holofoil, ...).
--
--   Giratina, SM - Lost Thunder 97/214            (TCGplayer 178908)
--   Rocky Fighting Energy, ME03 087/088            (TCGplayer 684350)
--   Ting-Lu, SV06: Twilight Masquerade 110/167     (TCGplayer 550154)
--   Victini, SV: Black Bolt 012/086                (TCGplayer 642461)
--
-- The price itself is not invented: it is the Holofoil row the daily price job already
-- stored in product_market_price_current. Rows are found by TCGplayer id and only
-- changed while they still show Reverse Holofoil and a Holofoil market price exists, so
-- a replay on another database changes nothing. No inventory, corrections or price
-- sources pointed at the printing being renamed.

begin;

create temp table _own_printing_fix on commit drop as
select pc.id as pc_id, mci.id as mci_id,
  c.market_price, c.low_price, c.mid_price, c.high_price, c.checked_at
from public.product_catalog pc
join public.product_market_price_current c
  on c.catalog_product_id = pc.id
 and c.source = 'TCGCSV'
 and c.price_subtype = 'Holofoil'
 and c.market_price is not null
left join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
where pc.tcgplayer_product_id in ('178908', '684350', '550154', '642461')
  and pc.market_source = 'TCGCSV'
  and pc.price_subtype = 'Reverse Holofoil';

-- The card's own printing and its price, as the daily price job writes them.
update public.product_catalog pc set
  price_subtype = 'Holofoil',
  market_price = f.market_price,
  low_price = f.low_price,
  mid_price = f.mid_price,
  high_price = f.high_price,
  last_price_checked = f.checked_at,
  updated_at = now()
from _own_printing_fix f
where pc.id = f.pc_id;

update public.catalog_product_variants v set
  is_default = (v.variant_name = 'Holofoil')
from _own_printing_fix f
where v.catalog_product_id = f.pc_id
  and v.variant_name in ('Holofoil', 'Reverse Holofoil');

-- The master catalog keeps one printing per card: its own.
update public.master_catalog_variants v set
  variant_type = 'holo',
  variant_name = 'Holofoil',
  finish = 'Holofoil'
from _own_printing_fix f
where v.catalog_item_id = f.mci_id
  and v.variant_name = 'Reverse Holofoil'
  and not exists (
    select 1 from public.master_catalog_variants d
    where d.catalog_item_id = v.catalog_item_id
      and d.variant_name = 'Holofoil'
      and d.language = v.language
      and d.condition_name = v.condition_name
  );

-- The own printing ranks first (0.9) so the catalog view's low/mid/high match its market price.
update public.master_market_price_sources s set
  confidence_score = case when s.price_type = 'Holofoil' then 0.9 else 0.8 end
from _own_printing_fix f
where s.catalog_item_id = f.mci_id
  and s.source = 'TCGCSV';

-- What the app shows as market_price.
update public.master_market_summaries ms set
  recommended_market_value = f.market_price,
  computed_at = now()
from _own_printing_fix f
where ms.catalog_item_id = f.mci_id;

commit;
