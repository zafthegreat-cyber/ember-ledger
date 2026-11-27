-- Single cards are not sealed products.
--
-- The catalog decided "sealed" from the product name: any name holding tin, box, pack,
-- bundle or deck. So Dratini, Mantine, Victini, Giratina, Tinkaton ("tin"), Fighting Energy
-- ("figh-tin-g"), Iron Bundle, Nemona's Backpack and Boxed Order were filed as sealed
-- products (catalog_item_type = 'sealed', product_type = 'Sealed Product', is_sealed).
-- On 2026-11-26 that was 793 master items: 581 shown in catalog_search_lightweight
-- (444 of them numbered like 026/102) and 212 hidden pokemontcg.io duplicates.
--
-- The rule now looks at what only a single card carries: a card rarity, or a card-style
-- collector number. Sealed products (tins, boxes, booster packs) carry neither, and code
-- cards (rarity "Code Card") stay as they were. The same rule in JavaScript:
-- pokemon_market_ingestion_kit/single_card_evidence.cjs.
--
-- Nothing user-owned pointed at the affected rows when this ran: no inventory_items,
-- deal_finder_items, scanner_intake_sessions, marketplace listings, receipt lines,
-- kid project items, admin corrections, saved searches or notifications. Prices
-- (master_market_price_sources, master_market_summaries, product_market_price_current)
-- are left exactly as they were.

begin;

-- True when the row is a single card. A card rarity settles it; with no rarity at all,
-- a card-style collector number (026/102, SWSH026, GG69/GG70, 006) settles it.
create or replace function public.catalog_is_single_card(p_card_number text, p_rarity text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    (
      nullif(btrim(coalesce(p_rarity, ''), E' \t\n\r'), '') is not null
      and btrim(p_rarity, E' \t\n\r') !~* '^(code card|none|n/?a)$'
      and p_rarity !~* 'sealed'
    )
    or (
      nullif(btrim(coalesce(p_rarity, ''), E' \t\n\r'), '') is null
      and btrim(coalesce(p_card_number, ''), E' \t\n\r')
        ~* '^[a-z]{0,6}[- ]?[0-9]{1,4}[a-z]{0,2}(\s*/\s*[a-z]{0,6}[- ]?[0-9]{1,4}[a-z]{0,2})?$'
    );
$$;

comment on function public.catalog_is_single_card(text, text) is
  'Single card test for catalog rows: a card rarity, or (with no rarity) a card-style collector number. Names are not evidence. Mirrors pokemon_market_ingestion_kit/single_card_evidence.cjs.';

revoke all on function public.catalog_is_single_card(text, text) from public, anon, authenticated;

-- 1. Printings of the affected items were created as sealed ones (variant_type 'sealed',
--    finish 'Sealed', and the name 'Sealed' where the item had no printing of its own).
--    Give them what the backfill gives a card: 'standard', no finish, 'Default'.
update public.master_catalog_variants v
set
  variant_type = case when v.variant_type = 'sealed' then 'standard' else v.variant_type end,
  finish = case when v.finish = 'Sealed' then null else v.finish end,
  variant_name = case
    when v.variant_name = 'Sealed' and not exists (
      select 1 from public.master_catalog_variants d
      where d.catalog_item_id = v.catalog_item_id
        and d.variant_name = 'Default'
        and d.language = v.language
        and d.condition_name = v.condition_name
    ) then 'Default'
    else v.variant_name
  end
from public.master_catalog_items mci
where mci.id = v.catalog_item_id
  and mci.catalog_item_type = 'sealed'
  and public.catalog_is_single_card(mci.card_number, mci.rarity)
  and (v.variant_type = 'sealed' or v.finish = 'Sealed' or v.variant_name = 'Sealed');

-- 2. The master catalog, which catalog_search_lightweight reads.
update public.master_catalog_items mci
set
  catalog_item_type = 'card',
  product_type = 'Card'
where mci.catalog_item_type = 'sealed'
  and public.catalog_is_single_card(mci.card_number, mci.rarity);

-- 3. The table the importers write, which pokemon_catalog_browse reads.
update public.product_catalog pc
set
  is_sealed = false,
  product_type = 'Card',
  product_kind = case when lower(coalesce(pc.name, '')) like '%promo%' then 'promo' else 'single_card' end,
  sealed_product_type = null,
  updated_at = now()
where pc.category = 'Pokemon'
  and (
    coalesce(pc.is_sealed, false)
    or pc.product_kind = 'sealed_product'
    or pc.product_type = 'Sealed Product'
    or pc.sealed_product_type is not null
  )
  and public.catalog_is_single_card(pc.card_number, pc.rarity);

commit;
