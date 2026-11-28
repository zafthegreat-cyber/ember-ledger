begin;
-- Per-account retailer alert choices. This does NOT create or enable a dispatcher.
create table if not exists public.stock_alert_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  retailers text[] not null default '{}'::text[],
  signal_types text[] not null default array['available_now']::text[],
  product_keys text[] not null default '{}'::text[],
  quiet_hours_enabled boolean not null default false,
  quiet_start text,
  quiet_end text,
  time_zone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_alert_retailers_allowed check (
    retailers <@ array['Target','Walmart','Pokémon Center','Best Buy','Sam''s Club','Costco']::text[]
    and array_position(retailers,null) is null
    and cardinality(retailers) <= 6
  ),
  constraint stock_alert_signals_allowed check (
    signal_types <@ array['available_now','possible_drop','queue_detected','reported_stock','new_listing','raffle_open','out_of_stock']::text[]
    and array_position(signal_types,null) is null
    and cardinality(signal_types) <= 7
  ),
  constraint stock_alert_products_limit check (
    cardinality(product_keys) <= 80
    and array_position(product_keys,null) is null
  ),
  constraint stock_alert_enabled_requires_filters check (
    not enabled or (cardinality(retailers) > 0 and cardinality(signal_types) > 0)
  ),
  constraint stock_alert_quiet_hours_valid check (
    (quiet_start is null or quiet_start ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
    and (quiet_end is null or quiet_end ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
    and (not quiet_hours_enabled or (quiet_start is not null and quiet_end is not null))
  ),
  constraint stock_alert_timezone_bounded check (char_length(time_zone) between 1 and 64)
);
alter table public.stock_alert_preferences enable row level security;
revoke all on public.stock_alert_preferences from public,anon,authenticated;
grant select,insert,update,delete on public.stock_alert_preferences to authenticated;
grant select,insert,update,delete on public.stock_alert_preferences to service_role;
create policy stock_alert_own_select
  on public.stock_alert_preferences for select to authenticated
  using (user_id=(select auth.uid()) and (select code3_current_session_valid()));
create policy stock_alert_own_insert
  on public.stock_alert_preferences for insert to authenticated
  with check (user_id=(select auth.uid()) and (select code3_current_session_valid()));
create policy stock_alert_own_update
  on public.stock_alert_preferences for update to authenticated
  using (user_id=(select auth.uid()) and (select code3_current_session_valid()))
  with check (user_id=(select auth.uid()) and (select code3_current_session_valid()));
create policy stock_alert_own_delete
  on public.stock_alert_preferences for delete to authenticated
  using (user_id=(select auth.uid()) and (select code3_current_session_valid()));
comment on table public.stock_alert_preferences is
  'Explicit account-only watch preferences. Not a delivery subscription; no stock dispatcher is active. Only the user can access their choices using a valid account session.';
commit;