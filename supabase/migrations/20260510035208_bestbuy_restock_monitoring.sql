-- Production restock monitoring storage.
-- Port of the starter kit SQLite observation model into Supabase/Postgres.

create table if not exists public.retailer_products (
  id uuid primary key default gen_random_uuid(),
  retailer text not null,
  external_id text not null,
  name text,
  url text,
  upc text,
  sku text,
  source_type text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (retailer, external_id)
);

create table if not exists public.retailer_observations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.retailer_products(id) on delete cascade,
  checked_at timestamptz not null default now(),
  status text not null,
  raw_status text,
  price numeric,
  online_available boolean,
  store_available boolean,
  item_loaded boolean,
  stores jsonb not null default '[]'::jsonb,
  payload_hash text,
  source_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint retailer_observations_status_check
    check (status in ('IN_STOCK', 'OUT_OF_STOCK', 'PREORDER', 'BACKORDER', 'COMING_SOON', 'LOADED_NOT_BUYABLE', 'UNKNOWN'))
);

create table if not exists public.retailer_alert_log (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.retailer_products(id) on delete cascade,
  observation_id uuid not null references public.retailer_observations(id) on delete cascade,
  sent_at timestamptz not null default now(),
  channel text not null,
  message_hash text not null,
  response_status integer,
  unique (channel, message_hash)
);

create table if not exists public.retailer_monitor_targets (
  id uuid primary key default gen_random_uuid(),
  retailer text not null default 'Best Buy',
  external_id text,
  sku text,
  query text,
  zip text,
  enabled boolean not null default true,
  alert_on_change_only boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retailer_monitor_targets_has_target
    check (coalesce(nullif(external_id, ''), nullif(sku, ''), nullif(query, '')) is not null)
);

create index if not exists retailer_products_retailer_external_idx
  on public.retailer_products(retailer, external_id);

create index if not exists retailer_products_sku_idx
  on public.retailer_products(sku);

create index if not exists retailer_products_upc_idx
  on public.retailer_products(upc);

create index if not exists retailer_observations_product_time_idx
  on public.retailer_observations(product_id, checked_at desc);

create index if not exists retailer_observations_status_idx
  on public.retailer_observations(status);

create index if not exists retailer_alert_log_product_sent_idx
  on public.retailer_alert_log(product_id, sent_at desc);

create index if not exists retailer_monitor_targets_enabled_idx
  on public.retailer_monitor_targets(retailer, enabled);

alter table public.retailer_products enable row level security;
alter table public.retailer_observations enable row level security;
alter table public.retailer_alert_log enable row level security;
alter table public.retailer_monitor_targets enable row level security;

comment on table public.retailer_products is
  'Retailer-specific product identities discovered through authorized APIs or permitted feeds. Mirrors the starter kit products table.';

comment on table public.retailer_observations is
  'Point-in-time retailer stock observations: status, price, availability fields, store availability JSON, source URL, and raw payload hash.';

comment on table public.retailer_alert_log is
  'Deduplicated outbound alert log for Discord/webhook/in-app restock notifications.';

comment on table public.retailer_monitor_targets is
  'Configured retailer SKUs/searches for scheduled monitoring. Keep writes server/admin controlled.';
