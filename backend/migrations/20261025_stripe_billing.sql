-- Apply explicitly to the backend billing database, using a server role.
-- Do not run the repository's unrelated Supabase migrations as part of billing setup.
begin;
create schema if not exists code3_billing;
revoke all on schema code3_billing from public;
create table if not exists code3_billing.accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider='supabase'),
  subject text not null,
  customer_id text unique check (customer_id ~ '^cus_[A-Za-z0-9]+$'),
  adult_approved boolean not null default false,
  approved_at timestamptz,
  approved_by text,
  created_at timestamptz not null default now(),
  unique(provider,subject),
  check (not adult_approved or (approved_at is not null and approved_by is not null))
);
create table if not exists code3_billing.events (
  event_id text primary key,
  event_type text not null,
  account_id uuid not null references code3_billing.accounts(id) on delete restrict,
  processed_at timestamptz not null default now()
);
create table if not exists code3_billing.grants (
  account_id uuid not null references code3_billing.accounts(id) on delete restrict,
  source text not null,
  entitlement text not null,
  kind text not null check (kind in ('subscription','purchase')),
  valid_until timestamptz,
  primary key(account_id,source,entitlement),
  check (kind <> 'subscription' or valid_until is not null)
);
-- A fresh schema has no browser grants; RLS also prevents accidental later exposure.
alter table code3_billing.accounts enable row level security;
alter table code3_billing.events enable row level security;
alter table code3_billing.grants enable row level security;
revoke all on all tables in schema code3_billing from public;
commit;
