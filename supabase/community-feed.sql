begin;
create function public.code3_community_feed() returns jsonb
language sql stable security invoker set search_path='' as $function$
 with candidates as (
  select r.id,r.report,r.created_at,coalesce(r.updates_report,r.id) as root_id,
   c.channel_id,c.message_id
  from code3_submissions.reports r
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
  order by r.created_at desc limit 200
 ), latest as (
  select distinct on(root_id) * from candidates order by root_id,(report->>'observedAt')::timestamptz desc,created_at desc
 ), limited as (
  select * from latest order by (report->>'observedAt')::timestamptz desc,id desc limit 50
 )
 select jsonb_build_object('version',1,'generatedAt',now(),'reports',coalesce(jsonb_agg(jsonb_build_object(
  'id',id,'category',report->>'category','kind',report->>'kind','product',report->>'product',
  'store',report->>'store','status',report->>'status','observedAt',report->>'observedAt',
  'areaKey',report->>'locality','channelId',channel_id,'messageId',message_id
 ) order by (report->>'observedAt')::timestamptz desc,id desc),'[]'::jsonb)) from limited;
$function$;
revoke execute on function public.code3_community_feed() from public,anon,authenticated;
grant execute on function public.code3_community_feed() to service_role;
comment on function public.code3_community_feed() is 'Read-only public projection for the community app bridge. Published, recent observations after cutover only; no submitter, reviewer, claim, review notes, private records or TEST posts.';
commit;
