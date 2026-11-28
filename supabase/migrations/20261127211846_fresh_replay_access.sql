-- Explicit privileges are required on new Supabase branches, whose default
-- grants differ from older projects. Never expose private warehouse tables.
begin;
grant select on public.profiles to authenticated,service_role;
grant update on public.profiles to service_role;
grant usage on schema code3_private to service_role;
grant execute on function public.code3_current_session_valid(),
  code3_private.current_session_id(),public.is_admin_or_moderator(),
  public.is_admin(),public.current_app_role(),public.normalized_app_role(text)
  to service_role;
notify pgrst,'reload schema';
commit;
