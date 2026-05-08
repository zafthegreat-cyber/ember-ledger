create table if not exists public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  date date,
  vendor text,
  category text default 'Supplies',
  subcategory text,
  buyer text,
  amount numeric default 0,
  payment_method text,
  linked_item_id uuid,
  linked_sale_id uuid,
  notes text,
  receipt_image text,
  receipt_photo text,
  tax_deductible boolean default false,
  campaign_name text,
  platform text,
  goal text,
  start_date date,
  end_date date,
  linked_sales text,
  results_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.business_expenses
  add column if not exists date date,
  add column if not exists subcategory text,
  add column if not exists payment_method text,
  add column if not exists linked_item_id uuid,
  add column if not exists linked_sale_id uuid,
  add column if not exists receipt_photo text,
  add column if not exists tax_deductible boolean default false,
  add column if not exists campaign_name text,
  add column if not exists platform text,
  add column if not exists goal text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists linked_sales text,
  add column if not exists results_notes text,
  add column if not exists updated_at timestamptz default now();

alter table public.business_expenses
  drop constraint if exists business_expenses_category_check;

update public.business_expenses
set category = case
  when category = 'Gas' then 'Mileage/Vehicle'
  when category = 'Software' then 'Software/Subscriptions'
  when category = 'Other' then 'Miscellaneous'
  when category in ('Storage', 'Equipment') then 'Supplies'
  when category is null or category = '' then 'Miscellaneous'
  else category
end;

alter table public.business_expenses
  add constraint business_expenses_category_check
  check (
    category in (
      'Inventory/Product Cost',
      'Shipping',
      'Packaging Supplies',
      'Platform Fees',
      'Payment Processing Fees',
      'Mileage/Vehicle',
      'Marketing',
      'Events/Giveaways',
      'Supplies',
      'Software/Subscriptions',
      'Miscellaneous'
    )
  );

create index if not exists business_expenses_user_id_idx on public.business_expenses(user_id);
create index if not exists business_expenses_category_idx on public.business_expenses(category);
create index if not exists business_expenses_date_idx on public.business_expenses(date);
