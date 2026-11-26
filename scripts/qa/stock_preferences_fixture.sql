-- Disposable PostgreSQL service fixture for Stock Intelligence alert preferences.
-- Synthetic identities only. Never connect this script to the hosted Supabase DB.
\set ON_ERROR_STOP on
create role authenticated nologin;
create role anon nologin;
create role service_role nologin bypassrls;
create schema if not exists auth;
grant usage on schema auth to authenticated;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create function public.code3_current_session_valid() returns boolean
language sql stable as $$
  select auth.uid() is not null and current_setting('app.session_active',true) = 'true';
$$;
grant execute on function auth.uid() to authenticated;
grant execute on function public.code3_current_session_valid() to authenticated;
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
