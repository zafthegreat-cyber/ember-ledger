begin;

-- Extend only the approved Code 3 retail source set; no new retailer connection is enabled.
alter table public.retailer_intel_sources
  drop constraint if exists retailer_intel_sources_retailer_check;
alter table public.retailer_intel_sources
  add constraint retailer_intel_sources_retailer_check
  check (retailer in ('Target','Walmart','Pokémon Center','Best Buy','Sam''s Club','Costco'));

alter table public.retailer_intelligence_signals
  drop constraint if exists retailer_intelligence_signals_retailer_check;
alter table public.retailer_intelligence_signals
  add constraint retailer_intelligence_signals_retailer_check
  check (retailer in ('Target','Walmart','Pokémon Center','Best Buy','Sam''s Club','Costco'));

insert into public.retailer_intel_sources (retailer,mode,connected)
values ('Sam''s Club','manual-watch',false),('Costco','manual-watch',false)
on conflict (retailer) do nothing;

-- Keyword discovery watch targets; not proven inventory and not live pollers.
insert into public.retailer_monitor_targets
  (retailer,query,enabled,alert_on_change_only)
select v.retailer,v.query,true,true
from (values
  ('Sam''s Club'::text,'Pokémon Trading Card Game'::text),
  ('Costco'::text,'Pokémon Trading Card Game'::text)
) as v(retailer,query)
where not exists (
  select 1 from public.retailer_monitor_targets t
  where t.retailer=v.retailer and t.query=v.query
);
create or replace function public.code3_stock_intelligence_feed()
returns jsonb language sql stable security invoker set search_path = ''
as $function$
 select jsonb_build_object(
   'version',1,
   'generatedAt',now(),
   'discoveryWatches',coalesce((
     select jsonb_agg(jsonb_build_object(
       'retailer',w.retailer,'query',w.query
     ) order by w.retailer,w.query)
     from (
       select distinct t.retailer, t.query
       from public.retailer_monitor_targets t
       where t.enabled and t.query is not null and char_length(t.query) between 3 and 80
         and t.retailer in ('Target','Walmart','Pokémon Center','Best Buy','Sam''s Club','Costco')
       order by t.retailer,t.query limit 20
     ) w
   ),'[]'::jsonb),
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
       where p.retailer in ('Target','Walmart','Pokémon Center','Best Buy','Sam''s Club','Costco')
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