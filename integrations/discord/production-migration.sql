begin;
-- Additive, private Discord area preferences. No retailer jobs or permissions change.
create table code3_submissions.nearby_preferences(
 member_id text primary key check(member_id ~ '^[0-9]{17,20}$'),
 area_id text check(area_id ~ '^(us-[0-9]{7}|zip-[0-9]{5})$'),
 radius integer not null check(radius in(10,25,50,100)),
 latitude double precision, longitude double precision,
 request_id text not null check(request_id ~ '^[0-9]{17,20}$'),
 updated_at timestamptz not null default now(),
 check((area_id is null and latitude is null and longitude is null) or
  (area_id is not null and latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180))
);
alter table code3_submissions.nearby_preferences enable row level security;
revoke all on code3_submissions.nearby_preferences from public,anon,authenticated;
grant select,insert,update on code3_submissions.nearby_preferences to service_role;

create function public.code3_nearby_get(p_member text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select to_jsonb(p) from code3_submissions.nearby_preferences p where member_id=p_member;
$$;
create function public.code3_nearby_save(p_member text,p_area text,p_radius integer,p_lat double precision,p_lng double precision,p_request text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare old code3_submissions.nearby_preferences; result code3_submissions.nearby_preferences;
begin
 if p_member is null or p_member !~ '^[0-9]{17,20}$' or p_request is null or p_request !~ '^[0-9]{17,20}$'
  or p_radius is null or p_radius not in(10,25,50,100)
  or (p_area is not null and (p_area !~ '^(us-[0-9]{7}|zip-[0-9]{5})$' or p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180))
  or (p_area is null and (p_lat is not null or p_lng is not null)) then raise exception 'nearby_invalid'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('code3-nearby:'||p_member,0));
 select * into old from code3_submissions.nearby_preferences where member_id=p_member;
 if found and old.request_id::numeric>=p_request::numeric then
  if old.request_id=p_request and (old.area_id is distinct from p_area or old.radius<>p_radius or old.latitude is distinct from p_lat or old.longitude is distinct from p_lng) then raise exception 'nearby_request_identity';end if;
  return to_jsonb(old);
 end if;
 insert into code3_submissions.nearby_preferences(member_id,area_id,radius,latitude,longitude,request_id)
 values(p_member,p_area,p_radius,p_lat,p_lng,p_request)
 on conflict(member_id) do update set area_id=excluded.area_id,radius=excluded.radius,latitude=excluded.latitude,longitude=excluded.longitude,request_id=excluded.request_id,updated_at=now()
 returning * into result;
 return to_jsonb(result);
end $$;

create function public.code3_nearby_candidates(p_lat double precision,p_lng double precision) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('member_id',member_id,'area_id',area_id,'radius',radius)),'[]'::jsonb)
 from (select member_id,area_id,radius from code3_submissions.nearby_preferences
  where area_id is not null and p_lat between -90 and 90 and p_lng between -180 and 180
   and 3958.7613*acos(least(1.0,greatest(-1.0,sin(radians(p_lat))*sin(radians(latitude))+cos(radians(p_lat))*cos(radians(latitude))*cos(radians(longitude-p_lng)))))<=radius
  order by member_id limit 51) matching;
$$;
revoke execute on function public.code3_nearby_get(text),public.code3_nearby_save(text,text,integer,double precision,double precision,text),public.code3_nearby_candidates(double precision,double precision) from public,anon,authenticated;
grant execute on function public.code3_nearby_get(text),public.code3_nearby_save(text,text,integer,double precision,double precision,text),public.code3_nearby_candidates(double precision,double precision) to service_role;
comment on table code3_submissions.nearby_preferences is 'Private opt-in public-area centers for signed Discord members; no home addresses or device coordinates. Clearing stores a minimal replay tombstone.';

CREATE OR REPLACE FUNCTION public.code3_report_submit(p_id text, p_submitter text, p_report jsonb, p_is_test boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r code3_submissions.reports; n integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('code3-report:'||p_submitter,0));
 select * into r from code3_submissions.reports where id=p_id;
 if found then
  if r.submitter<>p_submitter or r.report<>p_report or r.is_test<>p_is_test then raise exception 'report_identity_mismatch';end if;
  return jsonb_build_object('created',false,'report',to_jsonb(r));
 end if;
 n:=(select count(*) from jsonb_object_keys(p_report));
 if not(p_report?&array['kind','category','product','store','status','observedAt'])
  or exists(select 1 from jsonb_each(p_report) where jsonb_typeof(value)<>'string')
  or p_report->>'kind' not in('local','online') or p_report->>'category' not in('pokemon','onepiece','magic','lorcana','needoh','hotwheels','collectibles')
  or p_report->>'status' not in('stock','preorder','backorder','empty')
  or length(coalesce(p_report->>'product','')) not between 1 and 180 or length(coalesce(p_report->>'store','')) not between 1 and 300
  or coalesce((p_report->>'observedAt')::timestamptz,'epoch'::timestamptz) not between now()-interval '24 hours' and now()+interval '1 minute'
  or n not in(6,7,9)
 or (n in(7,9) and (p_report->>'kind'<>'local' or not(p_report?'locality') or not (exists(select 1 from code3_submissions.destinations where kind='locality' and key=p_report->>'locality') or p_report->>'locality' ~ '^(us-[0-9]{7}|zip-[0-9]{5})$')))
 or (n=9 and (not(p_report?&array['areaLat','areaLng'])
   or not coalesce(case when p_report->>'areaLat' ~ '^-?[0-9]{1,2}([.][0-9]{1,5})?$' then (p_report->>'areaLat')::numeric between -90 and 90 else false end,false)
   or not coalesce(case when p_report->>'areaLng' ~ '^-?[0-9]{1,3}([.][0-9]{1,5})?$' then (p_report->>'areaLng')::numeric between -180 and 180 else false end,false)))
 then raise exception 'report_invalid';end if;
 if (select count(*) from code3_submissions.reports where submitter=p_submitter and created_at>now()-interval '10 minutes')>=3 then raise exception 'report_rate_limit';end if;
 select * into r from code3_submissions.reports where submitter=p_submitter and report=p_report and created_at>now()-interval '10 minutes' limit 1;
 if found then return jsonb_build_object('created',false,'report',to_jsonb(r));end if;
 insert into code3_submissions.reports(id,submitter,report,is_test) values(p_id,p_submitter,p_report,p_is_test) returning * into r;
 return jsonb_build_object('created',true,'report',to_jsonb(r));
end $function$
;
create function public.code3_community_feed_v2(p_lat double precision default null,p_lng double precision default null,p_radius integer default 25,p_online boolean default false) returns jsonb
language sql stable security invoker set search_path='' as $function$
 with area_centers(key,lat,lng) as (values ('chesapeake',36.67938::double precision,-76.30179::double precision),('emporia',36.69618::double precision,-77.53597::double precision),('franklin',36.68401::double precision,-76.9414::double precision),('hampton',37.04796::double precision,-76.29729::double precision),('mathews',37.44326::double precision,-76.32772::double precision),('newport-news',37.07646::double precision,-76.52064::double precision),('norfolk',36.92301::double precision,-76.24464::double precision),('poquoson',37.12836::double precision,-76.30353::double precision),('portsmouth',36.86385::double precision,-76.36237::double precision),('suffolk',36.69716::double precision,-76.63478::double precision),('surry',37.13707::double precision,-76.83328::double precision),('sussex',36.91736::double precision,-77.27187::double precision),('virginia-beach',36.77911::double precision,-76.02845::double precision),('williamsburg',37.26895::double precision,-76.70865::double precision),('fredericksburg',38.29927::double precision,-77.48666::double precision),('king-george',38.27944::double precision,-77.18431::double precision)), candidates as (
  select r.id,r.report,r.created_at,coalesce(r.updates_report,r.id) as root_id,
   c.channel_id,c.message_id,coalesce((r.report->>'areaLat')::double precision,a.lat) as area_lat,coalesce((r.report->>'areaLng')::double precision,a.lng) as area_lng
  from code3_submissions.reports r left join area_centers a on a.key=r.report->>'locality'
  join lateral (
   select dc.channel_id,dc.message_id
   from code3_submissions.delivery_copies dc
   join code3_submissions.destinations d on d.channel_id=dc.channel_id
   where dc.report_id=r.id and dc.status='published' and dc.message_id is not null
    and d.kind in('locality','online','shared-local')
   order by case when d.kind='shared-local' then 1 else 0 end,dc.channel_id limit 1
  ) c on true
  where r.state='published' and not r.is_test and r.withdrawn_at is null
   and r.created_at >= timestamptz '2026-10-29 00:00:00+00'
   and (r.report->>'observedAt')::timestamptz between now()-interval '24 hours' and now()+interval '1 minute'
   and r.report->>'product' !~* '(^test([[:space:][:punct:]]|$)|synthetic|no real inventory)'
   and p_radius in(10,25,50,100)
  order by r.created_at desc
 ), latest as (
  select distinct on(root_id) * from candidates order by root_id,(report->>'observedAt')::timestamptz desc,created_at desc
 ), limited as (
  select * from latest where (not p_online or report->>'kind'='online')
  and (p_lat is null and p_lng is null or p_lat between -90 and 90 and p_lng between -180 and 180 and report->>'kind'='local'
   and area_lat is not null and 3958.7613*acos(least(1.0,greatest(-1.0,sin(radians(p_lat))*sin(radians(area_lat))+cos(radians(p_lat))*cos(radians(area_lat))*cos(radians(area_lng-p_lng)))))<=p_radius)
 order by (report->>'observedAt')::timestamptz desc,id desc limit 50
 )
 select jsonb_build_object('version',1,'generatedAt',now(),'reports',coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'category',report->>'category','kind',report->>'kind','product',report->>'product',
  'store',report->>'store','status',report->>'status','observedAt',report->>'observedAt',
  'areaKey',report->>'locality','channelId',channel_id,'messageId',message_id
 ) order by (report->>'observedAt')::timestamptz desc,id desc),'[]'::jsonb)) from limited;
$function$;

revoke execute on function public.code3_community_feed_v2(double precision,double precision,integer,boolean) from public,anon,authenticated;
grant execute on function public.code3_community_feed_v2(double precision,double precision,integer,boolean) to service_role;

commit;
