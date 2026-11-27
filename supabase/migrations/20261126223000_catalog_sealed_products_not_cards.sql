-- Sealed products are not single cards.
--
-- The other side of 20261126090000. The first import decided "sealed" from the product
-- name, so a sealed product whose name held none of its words (box, pack, tin, bundle, deck,
-- collection...) was filed as a single card: Collector Chests, Prerelease Kits, Holiday
-- Calendars, Trainer's Toolkits, Battle Academy, the 2-Player Starter Sets, and the code
-- cards that came in them. On 2026-11-26 that was 85 TCGCSV items (55 sealed products,
-- 30 code cards), all shown under Cards in catalog_search_lightweight.
--
-- The rule is the one the daily job uses for new products
-- (public.catalog_tcgcsv_is_card, 20261126213000): a single card carries a card rarity, a
-- collector number or card stats. An item whose TCGCSV record carries none of them is a
-- sealed product or a code card, whatever its name. An item that someone gave a card number
-- or card rarity by hand is left as it is.
--
-- Nothing user-owned pointed at the 85 when this ran: no inventory_items,
-- deal_finder_items, scanner_intake_sessions, marketplace listings, receipt lines, kid
-- project items or admin corrections. Ids, names, set codes, prices and price history are
-- left exactly as they were; only how the item is filed changes. Running it again changes
-- nothing.

begin;

create temp table _sealed_not_card on commit drop as
select pc.id as pc_id, mci.id as mci_id
from public.product_catalog pc
join public.master_catalog_items mci on mci.legacy_product_catalog_id = pc.id
where pc.market_source = 'TCGCSV'
  and jsonb_typeof(pc.raw_source->'product') = 'object'
  and mci.catalog_item_type = 'card'
  and not public.catalog_tcgcsv_is_card(public.catalog_tcgcsv_extended_data(pc.raw_source->'product'))
  and not public.catalog_is_single_card(pc.card_number, pc.rarity)
  and not public.catalog_is_single_card(mci.card_number, mci.rarity);

-- 1. Their printings were created as a card's ('standard', no finish, and the name
--    'Default' where the item had no printing of its own). Give them what the first import
--    gives a sealed product: 'sealed', finish 'Sealed', and the name 'Sealed'.
update public.master_catalog_variants v
set
  variant_type = case when v.variant_type = 'standard' then 'sealed' else v.variant_type end,
  finish = coalesce(v.finish, 'Sealed'),
  variant_name = case
    when v.variant_name = 'Default' and not exists (
      select 1 from public.master_catalog_variants d
      where d.catalog_item_id = v.catalog_item_id
        and d.variant_name = 'Sealed'
        and d.language = v.language
        and d.condition_name = v.condition_name
    ) then 'Sealed'
    else v.variant_name
  end
from _sealed_not_card t
where v.catalog_item_id = t.mci_id
  and (v.variant_type = 'standard' or v.finish is null or v.variant_name = 'Default');

-- 2. The master catalog, which catalog_search_lightweight reads.
update public.master_catalog_items mci
set
  catalog_item_type = 'sealed',
  product_type = 'Sealed Product'
from _sealed_not_card t
where mci.id = t.mci_id;

-- 3. The table the importers write, which pokemon_catalog_browse reads.
update public.product_catalog pc
set
  is_sealed = true,
  product_type = 'Sealed Product',
  product_kind = 'sealed_product',
  sealed_product_type = coalesce(pc.sealed_product_type, public.catalog_tcgcsv_sealed_type(pc.name)),
  updated_at = now()
from _sealed_not_card t
where pc.id = t.pc_id;

commit;
