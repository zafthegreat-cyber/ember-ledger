-- Code 3 Phase 1B canonical owner records.
--
-- This migration is intentionally additive. It creates the schema contract used
-- by the owner-authorized Express repository, but Phase 1B does not execute it
-- against owner or production data and does not copy or delete legacy records.

create extension if not exists pgcrypto;

create or replace function public.code3_current_owner_subject()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then null
    else 'supabase:' || (select auth.uid())::text
  end
$$;

create table if not exists public.code3_records (
  id uuid not null default gen_random_uuid(),
  owner_subject text not null,
  record_type text not null,
  status text not null,
  source text not null default 'manual',
  external_provider text,
  external_id text,
  source_url text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  amount_minor bigint,
  currency varchar(3),
  rate_basis_points integer,
  quantity bigint,
  certification_number text,
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  record_version bigint not null default 1,
  archived_at timestamptz,
  constraint code3_records_owner_subject_format check (
    char_length(owner_subject) between 3 and 300
    and owner_subject ~ '^[a-z0-9-]+:[^[:space:]]+$'
  ),
  constraint code3_records_type_allowed check (record_type in (
    'DEAL', 'DEAL_SNAPSHOT', 'DEAL_ANALYSIS', 'SEARCH_RULE',
    'AUCTION_EVENT', 'AUCTION_LOT', 'BID_PLAN',
    'RESTOCK_STORE_PROFILE', 'RESTOCK_EVENT', 'RESTOCK_PREDICTION',
    'STORE_VISIT', 'PRODUCT_OBSERVATION',
    'PURCHASE', 'PURCHASE_LOT', 'COST_ALLOCATION',
    'OWNED_ITEM', 'INVENTORY_ADJUSTMENT', 'STORAGE_LOCATION',
    'SALE', 'SALE_LINE_ITEM', 'SHIPMENT', 'RETURN',
    'EXPENSE', 'MILEAGE_TRIP', 'RECEIPT_METADATA',
    'OWNER_PREFERENCE', 'FEATURE_SETTING', 'FILE_ASSET'
  )),
  constraint code3_records_status_format check (status ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  constraint code3_records_source_length check (char_length(source) between 1 and 120),
  constraint code3_records_external_provider_length check (external_provider is null or char_length(external_provider) <= 80),
  constraint code3_records_external_id_length check (external_id is null or char_length(external_id) <= 500),
  constraint code3_records_source_url_length check (source_url is null or char_length(source_url) <= 2048),
  constraint code3_records_notes_length check (notes is null or char_length(notes) <= 32000),
  constraint code3_records_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint code3_records_metadata_size check (octet_length(metadata::text) <= 262144),
  constraint code3_records_money_currency check (
    (amount_minor is null and currency is null)
    or (amount_minor is not null and currency ~ '^[A-Z]{3}$')
  ),
  constraint code3_records_money_safe_integer check (
    amount_minor is null or amount_minor between -9007199254740991 and 9007199254740991
  ),
  constraint code3_records_rate_basis_points_range check (
    rate_basis_points is null or rate_basis_points between 0 and 100000
  ),
  constraint code3_records_quantity_range check (quantity is null or quantity between -1000000000 and 1000000000),
  constraint code3_records_certification_length check (certification_number is null or char_length(certification_number) <= 160),
  constraint code3_records_record_version_positive check (record_version >= 1),
  primary key (owner_subject, id)
);

comment on table public.code3_records is
  'Canonical Code 3 owner records. Populated only after an approved, verified migration; Phase 1B creates schema and dry-run contracts only.';
comment on column public.code3_records.amount_minor is
  'Integer amount in the smallest unit of currency. Legacy floating-point values require preview reconciliation before conversion.';
comment on column public.code3_records.owner_subject is
  'Provider-qualified immutable owner subject derived by the server. It is never accepted as client authority.';

create unique index if not exists code3_records_owner_external_identity_uidx
  on public.code3_records(owner_subject, record_type, external_provider, external_id)
  where external_provider is not null and external_id is not null and archived_at is null;

create unique index if not exists code3_records_owner_certification_uidx
  on public.code3_records(owner_subject, upper(certification_number))
  where record_type = 'OWNED_ITEM' and certification_number is not null and archived_at is null;

create index if not exists code3_records_owner_type_created_idx
  on public.code3_records(owner_subject, record_type, created_at, id);
create index if not exists code3_records_owner_type_updated_idx
  on public.code3_records(owner_subject, record_type, updated_at desc, id);
create index if not exists code3_records_owner_status_idx
  on public.code3_records(owner_subject, status, updated_at desc);
create index if not exists code3_records_owner_source_idx
  on public.code3_records(owner_subject, source, updated_at desc);
create index if not exists code3_records_owner_provider_idx
  on public.code3_records(owner_subject, external_provider, external_id);

create table if not exists public.code3_record_links (
  owner_subject text not null,
  from_record_id uuid not null,
  relationship_type text not null,
  to_record_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (owner_subject, from_record_id, relationship_type),
  constraint code3_record_links_relationship_format check (relationship_type ~ '^[a-z][A-Za-z0-9]{0,63}$'),
  constraint code3_record_links_not_self check (from_record_id <> to_record_id),
  constraint code3_record_links_from_fk foreign key (owner_subject, from_record_id)
    references public.code3_records(owner_subject, id) on update restrict on delete restrict,
  constraint code3_record_links_to_fk foreign key (owner_subject, to_record_id)
    references public.code3_records(owner_subject, id) on update restrict on delete restrict
);

comment on table public.code3_record_links is
  'Owner-safe canonical relationships. Composite foreign keys prevent cross-owner links.';

create index if not exists code3_record_links_owner_target_idx
  on public.code3_record_links(owner_subject, to_record_id, relationship_type);
create index if not exists code3_record_links_owner_parent_purchase_idx
  on public.code3_record_links(owner_subject, relationship_type, to_record_id)
  where relationship_type in ('purchaseId', 'purchaseLotId');
create index if not exists code3_record_links_owner_owned_item_idx
  on public.code3_record_links(owner_subject, relationship_type, to_record_id)
  where relationship_type = 'ownedItemId';
create index if not exists code3_record_links_owner_sale_idx
  on public.code3_record_links(owner_subject, relationship_type, to_record_id)
  where relationship_type in ('saleId', 'returnId');
create index if not exists code3_record_links_owner_store_idx
  on public.code3_record_links(owner_subject, relationship_type, to_record_id)
  where relationship_type in ('storeId', 'storeVisitId');
create index if not exists code3_record_links_owner_auction_idx
  on public.code3_record_links(owner_subject, relationship_type, to_record_id)
  where relationship_type in ('auctionEventId', 'auctionLotId');

create table if not exists public.code3_file_assets (
  asset_record_id uuid not null,
  owner_subject text not null,
  storage_provider text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 varchar(64) not null,
  related_record_type text,
  related_record_id uuid,
  original_name text,
  created_at timestamptz not null default now(),
  constraint code3_file_assets_record_fk foreign key (owner_subject, asset_record_id)
    references public.code3_records(owner_subject, id) on update restrict on delete restrict,
  constraint code3_file_assets_related_fk foreign key (owner_subject, related_record_id)
    references public.code3_records(owner_subject, id) on update restrict on delete restrict,
  constraint code3_file_assets_provider_length check (char_length(storage_provider) between 1 and 80),
  constraint code3_file_assets_path_length check (char_length(storage_path) between 1 and 1024),
  constraint code3_file_assets_path_relative check (
    storage_path !~ '^(?:/|https?:|data:|blob:)' and storage_path !~ '(^|[/\\])\.\.([/\\]|$)'
  ),
  constraint code3_file_assets_mime_format check (mime_type ~ '^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$'),
  constraint code3_file_assets_size_range check (size_bytes between 0 and 104857600),
  constraint code3_file_assets_sha256_format check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint code3_file_assets_related_pair check ((related_record_type is null) = (related_record_id is null)),
  constraint code3_file_assets_original_name_length check (original_name is null or char_length(original_name) <= 255),
  primary key (owner_subject, asset_record_id)
);

comment on table public.code3_file_assets is
  'File reference metadata only. Phase 1B does not upload, copy, or claim recoverability of file bytes.';

create index if not exists code3_file_assets_owner_related_idx
  on public.code3_file_assets(owner_subject, related_record_type, related_record_id);
create unique index if not exists code3_file_assets_owner_storage_path_uidx
  on public.code3_file_assets(owner_subject, storage_provider, storage_path);

create table if not exists public.code3_audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_subject text not null,
  occurred_at timestamptz not null default now(),
  action text not null,
  record_type text,
  record_id uuid,
  record_version bigint,
  safe_summary jsonb not null default '{}'::jsonb,
  constraint code3_audit_events_action_format check (action ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  constraint code3_audit_events_summary_object check (jsonb_typeof(safe_summary) = 'object'),
  constraint code3_audit_events_summary_size check (pg_column_size(safe_summary) <= 32768),
  constraint code3_audit_events_record_fk foreign key (owner_subject, record_id)
    references public.code3_records(owner_subject, id) on update restrict on delete restrict
);

comment on table public.code3_audit_events is
  'Append-only safe audit summaries. Secrets, tokens, full records, and raw provider payloads are prohibited.';

create index if not exists code3_audit_events_owner_time_idx
  on public.code3_audit_events(owner_subject, occurred_at desc, id);
create index if not exists code3_audit_events_owner_record_idx
  on public.code3_audit_events(owner_subject, record_id, occurred_at desc);

create or replace function public.code3_touch_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id <> old.id or new.owner_subject <> old.owner_subject or new.record_type <> old.record_type then
    raise exception 'Code 3 record identity is immutable';
  end if;
  new.updated_at := now();
  new.record_version := old.record_version + 1;
  return new;
end
$$;

drop trigger if exists code3_records_touch on public.code3_records;
create trigger code3_records_touch
before update on public.code3_records
for each row execute function public.code3_touch_record();

alter table public.code3_records enable row level security;
alter table public.code3_record_links enable row level security;
alter table public.code3_file_assets enable row level security;
alter table public.code3_audit_events enable row level security;

drop policy if exists code3_records_owner_select on public.code3_records;
create policy code3_records_owner_select on public.code3_records
  for select to authenticated
  using (owner_subject = public.code3_current_owner_subject());
drop policy if exists code3_records_owner_insert on public.code3_records;
create policy code3_records_owner_insert on public.code3_records
  for insert to authenticated
  with check (owner_subject = public.code3_current_owner_subject());
drop policy if exists code3_records_owner_update on public.code3_records;
create policy code3_records_owner_update on public.code3_records
  for update to authenticated
  using (owner_subject = public.code3_current_owner_subject())
  with check (owner_subject = public.code3_current_owner_subject());

drop policy if exists code3_record_links_owner_select on public.code3_record_links;
create policy code3_record_links_owner_select on public.code3_record_links
  for select to authenticated
  using (owner_subject = public.code3_current_owner_subject());
drop policy if exists code3_record_links_owner_insert on public.code3_record_links;
create policy code3_record_links_owner_insert on public.code3_record_links
  for insert to authenticated
  with check (owner_subject = public.code3_current_owner_subject());
drop policy if exists code3_record_links_owner_update on public.code3_record_links;
create policy code3_record_links_owner_update on public.code3_record_links
  for update to authenticated
  using (owner_subject = public.code3_current_owner_subject())
  with check (owner_subject = public.code3_current_owner_subject());

drop policy if exists code3_file_assets_owner_select on public.code3_file_assets;
create policy code3_file_assets_owner_select on public.code3_file_assets
  for select to authenticated
  using (owner_subject = public.code3_current_owner_subject());
drop policy if exists code3_file_assets_owner_insert on public.code3_file_assets;
create policy code3_file_assets_owner_insert on public.code3_file_assets
  for insert to authenticated
  with check (owner_subject = public.code3_current_owner_subject());
drop policy if exists code3_file_assets_owner_update on public.code3_file_assets;
create policy code3_file_assets_owner_update on public.code3_file_assets
  for update to authenticated
  using (owner_subject = public.code3_current_owner_subject())
  with check (owner_subject = public.code3_current_owner_subject());

drop policy if exists code3_audit_events_owner_select on public.code3_audit_events;
create policy code3_audit_events_owner_select on public.code3_audit_events
  for select to authenticated
  using (owner_subject = public.code3_current_owner_subject());
drop policy if exists code3_audit_events_owner_insert on public.code3_audit_events;
create policy code3_audit_events_owner_insert on public.code3_audit_events
  for insert to authenticated
  with check (owner_subject = public.code3_current_owner_subject());

-- Direct browser roles do not receive table privileges in Phase 1B. The
-- policies above are defense-in-depth for an explicitly reviewed future grant;
-- current writes flow through the owner-authorized API and repository layer.
revoke all on public.code3_records from anon, authenticated;
revoke all on public.code3_record_links from anon, authenticated;
revoke all on public.code3_file_assets from anon, authenticated;
revoke all on public.code3_audit_events from anon, authenticated;
