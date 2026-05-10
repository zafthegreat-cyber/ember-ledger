-- Beta 1 scanner/catalog matching support.
-- Expands product_identifiers so UPCs, retailer SKUs, and catalog IDs stay separate.

alter table public.product_identifiers
  add column if not exists retailer text,
  add column if not exists confidence_score numeric,
  add column if not exists is_verified boolean not null default false,
  add column if not exists status text not null default 'needs_review',
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.product_identifiers
  drop constraint if exists product_identifiers_identifier_type_check;

alter table public.product_identifiers
  add constraint product_identifiers_identifier_type_check
  check (
    identifier_type in (
      'UPC',
      'EAN',
      'GTIN',
      'RETAILER_SKU',
      'BEST_BUY_SKU',
      'TARGET_TCIN',
      'WALMART_ITEM_ID',
      'WALMART_SKU',
      'GAMESTOP_SKU',
      'POKEMON_CENTER_SKU',
      'POKEMON_CENTER_ID',
      'TCGPLAYER_PRODUCT_ID',
      'TCGPLAYER_SKU_ID',
      'POKEMONTCG_IO_ID',
      'OTHER'
    )
  );

alter table public.product_identifiers
  drop constraint if exists product_identifiers_status_check;

alter table public.product_identifiers
  add constraint product_identifiers_status_check
  check (status in ('verified', 'user_submitted', 'needs_review', 'ambiguous', 'rejected', 'source_imported'));

create index if not exists product_identifiers_retailer_idx
  on public.product_identifiers(retailer);

create index if not exists product_identifiers_status_idx
  on public.product_identifiers(status);

create index if not exists product_identifiers_verified_idx
  on public.product_identifiers(is_verified);

update public.product_identifiers
set
  status = case
    when confidence = 'verified' then 'verified'
    when confidence in ('trusted_source', 'imported') then 'source_imported'
    when confidence = 'user_submitted' then 'user_submitted'
    else status
  end,
  is_verified = case
    when confidence = 'verified' then true
    else is_verified
  end
where status = 'needs_review';

comment on column public.product_identifiers.identifier_type is
  'Identifier namespace. UPC/EAN/GTIN, retailer SKUs, Pokemon Center IDs, TCGplayer IDs, and other external IDs must remain separate.';

comment on column public.product_identifiers.status is
  'Review state for scanner/catalog matching: verified, user_submitted, needs_review, ambiguous, rejected, or source_imported.';
