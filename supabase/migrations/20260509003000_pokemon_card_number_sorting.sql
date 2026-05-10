-- Add sortable Pokemon card number metadata and a browse view for catalog screens.

begin;

alter table public.product_catalog
  add column if not exists card_number_sort integer,
  add column if not exists card_number_prefix text,
  add column if not exists card_number_suffix text,
  add column if not exists printed_total integer;

update public.product_catalog
set
  card_number_prefix = coalesce(upper(substring(trim(card_number) from '^([[:alpha:]]+)')), ''),
  card_number_sort = case
    when substring(card_number from '([0-9]+)') is not null then substring(card_number from '([0-9]+)')::integer
    else null
  end,
  card_number_suffix = coalesce(upper(substring(trim(card_number) from '^[[:alpha:]]*[0-9]+\s*([[:alpha:]]+)$')), ''),
  printed_total = coalesce(
    printed_total,
    case
      when substring(card_number from '/[[:alpha:]]*([0-9]+)') is not null then substring(card_number from '/[[:alpha:]]*([0-9]+)')::integer
      else null
    end,
    case
      when (raw_source #>> '{set,printedTotal}') ~ '^[0-9]+$' then (raw_source #>> '{set,printedTotal}')::integer
      else null
    end,
    case
      when (raw_source #>> '{set,total}') ~ '^[0-9]+$' then (raw_source #>> '{set,total}')::integer
      else null
    end
  )
where category = 'Pokemon'
  and nullif(trim(coalesce(card_number, '')), '') is not null;

create index if not exists product_catalog_pokemon_browse_sort_idx
  on public.product_catalog (
    category,
    is_sealed,
    set_name,
    expansion,
    card_number_prefix,
    card_number_sort,
    name
  );

drop view if exists public.pokemon_catalog_browse;

create view public.pokemon_catalog_browse
with (security_invoker = true)
as
select
  pc.*,
  case
    when coalesce(pc.is_sealed, false)
      or coalesce(pc.product_type, '') ~* '(sealed|booster|elite trainer|box|tin|collection|bundle|pack)'
      then 'Sealed'
    when coalesce(pc.product_type, '') ~* '(card)'
      or nullif(trim(coalesce(pc.card_number, '')), '') is not null
      then 'Cards'
    else 'Other'
  end as catalog_group,
  case
    when coalesce(pc.is_sealed, false)
      or coalesce(pc.product_type, '') ~* '(sealed|booster|elite trainer|box|tin|collection|bundle|pack)'
      then 1
    when coalesce(pc.product_type, '') ~* '(card)'
      or nullif(trim(coalesce(pc.card_number, '')), '') is not null
      then 2
    else 3
  end as catalog_group_sort,
  coalesce(nullif(pc.set_name, ''), nullif(pc.expansion, ''), 'Unknown Set') as set_sort_name,
  coalesce(nullif(pc.card_number_prefix, ''), '') as card_prefix_sort,
  coalesce(pc.card_number_sort, 999999) as card_number_sort_safe,
  case
    when nullif(trim(coalesce(pc.card_number, '')), '') is null
      and pc.card_number_sort is null
      then 1
    else 0
  end as card_number_missing_sort
from public.product_catalog pc;

grant select on public.pokemon_catalog_browse to anon, authenticated;

commit;
