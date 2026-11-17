begin;

-- Code 3 TCG stock intelligence v1. No retailer scraping or inferred inventory.
create table if not exists public.retailer_intel_sources (
  retailer text primary key check (retailer in ('Target','Walmart','Pokémon Center','Best Buy')),
  mode text not null default 'manual-watch' check (mode in ('manual-watch','authorized-feed','official-api')),
  connected boolean not null default false,
  last_success_at timestamptz,
  updated_at timestamptz not null default now(),
  check (not connected or mode <> 'manual-watch')
);
alter table public.retailer_intel_sources enable row level security;
revoke all on public.retailer_intel_sources from public,anon,authenticated;
grant select,insert,update on public.retailer_intel_sources to service_role;

create table if not exists public.retailer_intelligence_signals (
  id uuid primary key default gen_random_uuid(),
  retailer text not null check (retailer in ('Target','Walmart','Pokémon Center','Best Buy')),
  product_id uuid references public.retailer_products(id) on delete set null,
  signal_type text not null check (signal_type in ('reported_stock','available_now','out_of_stock','possible_drop','queue_detected','queue_ended','raffle_open','new_listing')),
  evidence_level text not null default 'reported' check (evidence_level in ('reported','admin_checked','official')),
  source_type text not null check (source_type in ('authorized_discord','community_report','admin_review','official_api','retailer_notice')),
  headline text not null check (char_length(headline) between 4 and 180),
  source_url text not null check (char_length(source_url) <= 2048 and source_url ~ '^https://[^[:space:]]+$'),
  event_key text not null unique check (char_length(event_key) between 24 and 96),
  observed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > observed_at and expires_at <= observed_at + interval '48 hours'),
  check (signal_type <> 'available_now' or evidence_level in ('admin_checked','official')),
  check (evidence_level <> 'official' or source_type = 'official_api'),
  check (evidence_level <> 'admin_checked' or source_type = 'admin_review')
);
create index if not exists retailer_intelligence_signals_recent_idx
  on public.retailer_intelligence_signals (observed_at desc)
  where expires_at is not null;
alter table public.retailer_intelligence_signals enable row level security;
revoke all on public.retailer_intelligence_signals from public,anon,authenticated;
grant select,insert on public.retailer_intelligence_signals to service_role;

insert into public.retailer_intel_sources (retailer,mode,connected)
values ('Target','manual-watch',false),('Walmart','manual-watch',false),
       ('Pokémon Center','manual-watch',false),('Best Buy','manual-watch',false)
on conflict (retailer) do nothing;

-- The SKUs below are user-supplied watch targets, NOT verified stock.
insert into public.retailer_products (retailer,external_id,sku,name,url,source_type)
values
 ('Target','1012850572','1012850572','Pokémon TCG 30th Celebration Ultra-Premium Collection — Night','https://www.target.com/p/hoc2/A-1012850572','user_watchlist'),
 ('Target','1012850573','1012850573','Pokémon TCG 30th Celebration Figure Collection — Mewtwo','https://www.target.com/p/hoc2/A-1012850573','user_watchlist'),
 ('Target','1012793604','1012793604','Pokémon TCG Mega Evolution — Delta Reign Elite Trainer Box','https://www.target.com/p/hoc2/A-1012793604','user_watchlist'),
 ('Target','1013166578','1013166578','Pokémon TCG Mega Evolution — Delta Reign Booster Bundle','https://www.target.com/p/hoc2/A-1013166578','user_watchlist'),
 ('Target','1013166573','1013166573','Pokémon TCG Mega Evolution — Delta Reign Three-Booster Blister','https://www.target.com/p/hoc2/A-1013166573','user_watchlist'),
 ('Target','1012850570','1012850570','Pokémon TCG 30th Celebration Ultra-Premium Collection — Day','https://www.target.com/p/hoc2/A-1012850570','user_watchlist'),
 ('Target','1013166576','1013166576','Pokémon TCG Mega Evolution — Delta Reign Booster Display','https://www.target.com/p/hoc2/A-1013166576','user_watchlist'),
 ('Target','1012793603','1012793603','Pokémon TCG 30th Celebration Figure Collection — Mew','https://www.target.com/p/hoc2/A-1012793603','user_watchlist'),
 ('Target','1012663804','1012663804','Pokémon TCG 30th Celebration Ditto Premium Collection','https://www.target.com/p/hoc2/A-1012663804','user_watchlist'),
 ('Target','95120822','95120822','Pokémon TCG Mega Evolution Ascended Heroes Tech Sticker Collection — Gastly','https://www.target.com/p/hoc2/A-95120822','user_watchlist'),
 ('Target','95093981','95093981','Pokémon TCG Mega Evolution Ascended Heroes Premium Poster Collection — Mega Lucario','https://www.target.com/p/hoc2/A-95093981','user_watchlist')
on conflict (retailer,external_id) do nothing;

insert into public.retailer_monitor_targets (retailer,external_id,sku,enabled,alert_on_change_only)
select 'Target',p.external_id,p.external_id,true,true
from public.retailer_products p
where p.retailer = 'Target' and p.source_type = 'user_watchlist'
and p.external_id in ('1012850572','1012850573','1012793604','1013166578','1013166573','1012850570','1013166576','1012793603','1012663804','95120822','95093981')
and not exists (
  select 1 from public.retailer_monitor_targets t
  where t.retailer = 'Target' and (t.external_id = p.external_id or t.sku = p.external_id)
);

-- Read-only, bounded, non-identifying projection consumed by an Edge Function.
create or replace function public.code3_stock_intelligence_feed()
returns jsonb language sql stable security invoker set search_path = ''
as $function$
 select jsonb_build_object(
   'version',1,
   'generatedAt',now(),
   'sources',coalesce((
     select jsonb_agg(jsonb_build_object(
       'retailer',s.retailer,'mode',s.mode,'connected',s.connected,'lastSuccessAt',s.last_success_at
     ) order by s.retailer)
     from public.retailer_intel_sources s
   ),'[]'::jsonb),
   'targets',coalesce((
     select jsonb_agg(jsonb_build_object(
       'retailer',p.retailer,'sku',p.external_id,'name',p.name,'url',p.url
     ) order by p.retailer,p.external_id)
     from (
       select p.retailer,p.external_id,p.name,p.url
       from public.retailer_products p
       where p.retailer in ('Target','Walmart','Pokémon Center','Best Buy')
         and exists(
           select 1 from public.retailer_monitor_targets t
           where t.enabled and t.retailer = p.retailer
             and (t.external_id = p.external_id or t.sku = p.external_id)
         )
       order by p.retailer,p.external_id limit 80
     ) p
   ),'[]'::jsonb),
   'signals',coalesce((
     select jsonb_agg(jsonb_build_object(
       'id',s.id,'retailer',s.retailer,'signalType',s.signal_type,
       'evidenceLevel',s.evidence_level,'sourceType',s.source_type,
       'headline',s.headline,'sourceUrl',s.source_url,
       'observedAt',s.observed_at,'expiresAt',s.expires_at,
       'product',p.name,'productUrl',p.url,'sku',p.external_id
     ) order by s.observed_at desc,s.id desc)
     from (
       select * from public.retailer_intelligence_signals
       where observed_at >= now() - interval '24 hours'
         and observed_at <= now() + interval '1 minute'
         and expires_at > now()
       order by observed_at desc,id desc limit 40
     ) s
     left join public.retailer_products p on p.id = s.product_id
   ),'[]'::jsonb)
 );
$function$;
revoke all on function public.code3_stock_intelligence_feed() from public,anon,authenticated;
grant execute on function public.code3_stock_intelligence_feed() to service_role;
comment on function public.code3_stock_intelligence_feed() is 'Bounded public-safe stock intelligence projection through code3-stock-intel Edge Function; no raw payload, exact stock, member data, or private source IDs.';
commit;
