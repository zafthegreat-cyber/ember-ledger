-- Japanese cards, sealed products and prices reach the catalog through the daily job.
--
-- Why (owner, Nov 27 2026: "support non-English cards, Japanese first"): the catalog held English
-- cards only, so a Japanese card could be neither found nor priced, and a scanned Japanese card
-- was matched to the English card with the same number. TCGCSV publishes TCGplayer's Japanese
-- catalog as category 85 ("Pokemon Japan": 463 sets on Nov 27 2026) in the same shape as the
-- English category 3 the job already reads: English card names ("Pikachu - 025/165"), number,
-- rarity, HP and attacks, the printed set code ("SV2a"), sealed products, and daily prices in USD.
--
-- What changes:
--   * catalog_tcgcsv_groups.category_id: which TCGCSV category a set belongs to (3 English, 85
--     Japanese). TCGplayer set ids and product ids are unique across categories, so the queue,
--     the set table and the catalog keep keying on them as before.
--   * catalog_price_refresh asks for both set lists. catalog_price_apply fetches a set's products
--     and prices from its own category.
--   * catalog_products_apply_group files a category's products with its language
--     (product_catalog.language and master_catalog_items.language, from
--     20261127210000_catalog_language.sql). catalog_price_apply_group and
--     catalog_add_missing_printings give an item's printings the item's language.
--
-- Rules:
--   * The functions are edited in place, one line at a time, as 20261127040000 does, so the rest
--     of each stays as it is live. Each edit must find its line exactly once, or nothing changes.
--   * English rows come out exactly as before: their language is "English" at every step.
--   * Same rules as the English feed: additive, one row per TCGplayer product id, a price is never
--     overwritten with nothing.
--
-- Load the Japanese sets now instead of at the next daily run (21:00 UTC), once no run is open:
--   select public.catalog_price_refresh(0, false, true);
-- Progress:  select category_id, count(*), count(products_checked_at) from public.catalog_tcgcsv_groups group by 1;
--            select language, catalog_item_type, count(*) from public.master_catalog_items group by 1, 2;

begin;

do $$
begin
  if to_regclass('public.catalog_tcgcsv_groups') is null then
    raise exception 'public.catalog_tcgcsv_groups is missing: apply 20261126213000_catalog_new_sets.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'master_catalog_items' and column_name = 'language') then
    raise exception 'master_catalog_items.language is missing: apply 20261127210000_catalog_language.sql first';
  end if;
end
$$;

alter table public.catalog_tcgcsv_groups
  add column if not exists category_id integer not null default 3;

-- The TCGCSV category a set is read from (English when the set is not listed yet).
create or replace function public.catalog_tcgcsv_category(p_group integer)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce((select g.category_id from public.catalog_tcgcsv_groups g where g.group_id = p_group), 3);
$$;

-- The language of a TCGCSV category's products, in the words the app and inventory use.
create or replace function public.catalog_tcgcsv_language(p_category integer)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_category when 85 then 'Japanese' else 'English' end;
$$;

-- Only the catalog job calls these, as the other catalog job helpers.
revoke all on function public.catalog_tcgcsv_category(integer) from public, anon, authenticated;
revoke all on function public.catalog_tcgcsv_language(integer) from public, anon, authenticated;

-- Edits one function: each [old line, new line] pair must match exactly once.
create or replace function pg_temp.catalog_edit(p_function regprocedure, p_edits text[][])
returns void
language plpgsql
as $$
declare
  d text := pg_get_functiondef(p_function);
  i integer;
  v_old text;
begin
  for i in 1 .. array_length(p_edits, 1) loop
    v_old := p_edits[i][1];
    if (length(d) - length(replace(d, v_old, ''))) / length(v_old) <> 1 then
      raise exception '%: line not found exactly once: %', p_function, v_old;
    end if;
    d := replace(d, v_old, p_edits[i][2]);
  end loop;
  execute d;
end
$$;

do $do$
begin
  if position('catalog_tcgcsv_language' in pg_get_functiondef('public.catalog_products_apply_group(integer, jsonb)'::regprocedure)) > 0 then
    raise notice 'the catalog job already reads Japanese sets: nothing to do';
    return;
  end if;

  -- Both set lists. (group_id holds the TCGCSV category for this source.)
  perform pg_temp.catalog_edit('public.catalog_price_refresh(integer, boolean, boolean)'::regprocedure, array[
    [$a$values (v_run, 'tcgcsv-groups', 3);$a$,
     $b$values (v_run, 'tcgcsv-groups', 3), (v_run, 'tcgcsv-groups', 85);$b$]
  ]);

  -- A set's products and prices come from its own category.
  perform pg_temp.catalog_edit('public.catalog_price_apply(integer)'::regprocedure, array[
    [$a$when 'tcgcsv-products' then format('https://tcgcsv.com/tcgplayer/3/%s/products', r.group_id)$a$,
     $b$when 'tcgcsv-products' then format('https://tcgcsv.com/tcgplayer/%s/%s/products', public.catalog_tcgcsv_category(r.group_id), r.group_id)$b$],
    [$a$else format('https://tcgcsv.com/tcgplayer/3/%s/prices', r.group_id)$a$,
     $b$else format('https://tcgcsv.com/tcgplayer/%s/%s/prices', public.catalog_tcgcsv_category(r.group_id), r.group_id)$b$]
  ]);

  -- Each set's category, from TCGCSV's set list (every set there carries its categoryId).
  perform pg_temp.catalog_edit('public.catalog_groups_apply(bigint, jsonb)'::regprocedure, array[
    [$a$modified_on timestamptz, is_supplemental boolean, raw jsonb$a$,
     $b$modified_on timestamptz, is_supplemental boolean, category_id integer, raw jsonb$b$],
    [$a$coalesce(x->>'isSupplemental', '') = 'true',$a$,
     $b$coalesce(x->>'isSupplemental', '') = 'true',
    case when (x->>'categoryId') ~ '^[0-9]{1,9}$' then (x->>'categoryId')::integer else 3 end,$b$],
    [$a$(group_id, name, abbreviation, published_on, modified_on, is_supplemental, raw)$a$,
     $b$(group_id, name, abbreviation, published_on, modified_on, is_supplemental, raw, category_id)$b$],
    [$a$select l.group_id, l.name, l.abbreviation, l.published_on, l.modified_on, l.is_supplemental, l.raw$a$,
     $b$select l.group_id, l.name, l.abbreviation, l.published_on, l.modified_on, l.is_supplemental, l.raw, l.category_id$b$],
    [$a$raw = excluded.raw,$a$,
     $b$raw = excluded.raw,
    category_id = excluded.category_id,$b$],
    -- A run reads two set lists now: each adds its new sets to the run's count.
    [$a$set sets_added = v_new where id = p_run;$a$,
     $b$set sets_added = sets_added + v_new where id = p_run;$b$]
  ]);

  -- New products carry their category's language.
  perform pg_temp.catalog_edit('public.catalog_products_apply_group(integer, jsonb)'::regprocedure, array[
    [$a$raw_source, last_price_checked)$a$,
     $b$raw_source, last_price_checked, language)$b$],
    [$a$jsonb_build_object('group', g.raw, 'product', p.product, 'extendedData', p.ext), now()$a$,
     $b$jsonb_build_object('group', g.raw, 'product', p.product, 'extendedData', p.ext), now(),
      public.catalog_tcgcsv_language(g.category_id)$b$],
    [$a$external_links, last_verified_at, data_confidence_score, source, raw_source)$a$,
     $b$external_links, last_verified_at, data_confidence_score, source, raw_source, language)$b$],
    [$a$pc.last_price_checked, 0.70, 'TCGCSV', coalesce(pc.raw_source, '{}'::jsonb)$a$,
     $b$pc.last_price_checked, 0.70, 'TCGCSV', coalesce(pc.raw_source, '{}'::jsonb), pc.language$b$]
  ]);

  -- An item's printings carry the item's language.
  perform pg_temp.catalog_edit('public.catalog_price_apply_group(integer, jsonb)'::regprocedure, array[
    [$a$select pc.id as pc_id, r.sub,$a$,
     $b$select pc.id as pc_id, pc.language, r.sub,$b$],
    [$a$'English', '', n.rn = 1$a$,
     $b$n.language, '', n.rn = 1$b$],
    [$a$'English', '', true, jsonb_build_object('tcgplayer_product_id', p.pid)$a$,
     $b$mci.language, '', true, jsonb_build_object('tcgplayer_product_id', p.pid)$b$]
  ]);

  perform pg_temp.catalog_edit('public.catalog_add_missing_printings(uuid[])'::regprocedure, array[
    [$a$mci_id uuid, pc_id uuid, pid text, sub text, market numeric$a$,
     $b$mci_id uuid, pc_id uuid, pid text, sub text, market numeric, lang text$b$],
    [$a$select mci.id, pc.id, p.source_product_id, p.price_subtype, p.market_price$a$,
     $b$select mci.id, pc.id, p.source_product_id, p.price_subtype, p.market_price, mci.language$b$],
    [$a$'English', '', false, jsonb_build_object('tcgplayer_product_id', c.pid), c.market,$a$,
     $b$c.lang, '', false, jsonb_build_object('tcgplayer_product_id', c.pid), c.market,$b$],
    -- (the other printing insert: unique once the line above is edited)
    [$a$'English', '', false$a$,
     $b$c.lang, '', false$b$]
  ]);
end
$do$;

-- The three "same printing already listed" checks in catalog_add_missing_printings compare
-- against the item's own language too (they said 'English'). Done after the edits above, which
-- needed each of those lines to be unique.
do $do$
declare
  d text := pg_get_functiondef('public.catalog_add_missing_printings(uuid[])'::regprocedure);
  v_old constant text := $a$v.language = 'English'$a$;
begin
  if position(v_old in d) = 0 then
    return;
  end if;
  if (length(d) - length(replace(d, v_old, ''))) / length(v_old) <> 3 then
    raise exception 'catalog_add_missing_printings: expected 3 English printing checks';
  end if;
  execute replace(d, v_old, 'v.language = c.lang');
end
$do$;

commit;
