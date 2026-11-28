begin;
-- Code 3 TCG private retailer inbound/warehouse evidence, additive to Stock Intelligence.
-- No retailer warehouse access is inferred. No schedules, shipment IDs, locations or quantities.
create table if not exists public.retailer_inbound_events (
  id uuid primary key default gen_random_uuid(),
  retailer text not null references public.retailer_intel_sources(retailer),
  product_id uuid references public.retailer_products(id) on delete set null,
  stage text not null check (stage in (
    'ordered','en_route','arrived_warehouse','in_warehouse',
    'warehouse_processing','allocated','distribution_en_route',
    'retail_available','delayed','unknown'
  )),
  evidence_level text not null default 'reported'
    check (evidence_level in ('reported','verified')),
  source_type text not null default 'staff_report'
    check (source_type in ('staff_report','authorized_supplier_feed','retailer_notice')),
  summary text not null check (char_length(summary) between 8 and 180),
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  event_key text not null unique check (event_key ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  constraint inbound_evidence_matched_source check (
    (source_type = 'staff_report' and evidence_level = 'reported')
    or (source_type in ('authorized_supplier_feed','retailer_notice') and evidence_level = 'verified')
  ),
  constraint inbound_stage_freshness check (
    expires_at > observed_at and
    expires_at <= observed_at + interval '14 days'
  )
);
create index if not exists retailer_inbound_events_recent_idx
  on public.retailer_inbound_events(retailer, observed_at desc);
create index if not exists retailer_inbound_events_expires_idx
  on public.retailer_inbound_events(expires_at);
alter table public.retailer_inbound_events enable row level security;
revoke all on public.retailer_inbound_events from public, anon, authenticated;
grant select, insert on public.retailer_inbound_events to service_role;
comment on table public.retailer_inbound_events is
 'Private staff-only inbound evidence. Retailer warehouse data requires source authorization; manual observations stay reported, not verified. No facility, PO, quantity, route, or ETA data.';

-- Do NOT expose this RPC to the public stock-intelligence feed.
commit;