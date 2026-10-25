-- The deployed backend already has a Supabase service role credential and no
-- direct PostgreSQL connection. Expose invoker wrappers only to that role.
begin;
create function public.code3_process_ebay_deletion_notice(p_notification_digest text, p_event_at timestamptz, p_subjects jsonb)
returns void language sql security invoker set search_path = '' as $$
  select code3_ebay_private.process_notice(p_notification_digest,p_event_at,p_subjects);
$$;
create function public.code3_sanitize_ebay_data(p_data jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select code3_ebay_private.sanitize(p_data);
$$;
revoke all on function public.code3_process_ebay_deletion_notice(text,timestamptz,jsonb),public.code3_sanitize_ebay_data(jsonb) from public, anon, authenticated;
grant execute on function public.code3_process_ebay_deletion_notice(text,timestamptz,jsonb),public.code3_sanitize_ebay_data(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
