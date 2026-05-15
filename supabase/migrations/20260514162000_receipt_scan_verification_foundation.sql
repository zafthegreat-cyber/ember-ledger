-- Receipt scan verification foundation.
-- Adds review-friendly receipt and line fields without removing legacy columns.

begin;

alter table public.receipt_records
  add column if not exists store_name text,
  add column if not exists purchase_date date,
  add column if not exists receipt_total numeric,
  add column if not exists subtotal numeric,
  add column if not exists discounts numeric,
  add column if not exists receipt_image_url text,
  add column if not exists status text not null default 'draft',
  add column if not exists source text not null default 'manual';

update public.receipt_records
set status = case when status in ('draft', 'verified', 'submitted', 'failed') then status else 'draft' end
where status is null
   or status not in ('draft', 'verified', 'submitted', 'failed');

update public.receipt_records
set source = case when source in ('upload', 'camera', 'manual') then source else 'manual' end
where source is null
   or source not in ('upload', 'camera', 'manual');

alter table public.receipt_records
  drop constraint if exists receipt_records_status_check;

alter table public.receipt_records
  add constraint receipt_records_status_check
  check (status in ('draft', 'verified', 'submitted', 'failed'));

alter table public.receipt_records
  drop constraint if exists receipt_records_source_check;

alter table public.receipt_records
  add constraint receipt_records_source_check
  check (source in ('upload', 'camera', 'manual'));

alter table public.receipt_line_items
  add column if not exists raw_text text,
  add column if not exists item_name text,
  add column if not exists matched_catalog_item_id uuid references public.master_catalog_items(id) on delete set null,
  add column if not exists unit_cost numeric,
  add column if not exists total_cost numeric,
  add column if not exists confidence_score numeric,
  add column if not exists verified boolean not null default false,
  add column if not exists created_inventory_item_id uuid references public.inventory_items(id) on delete set null,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

update public.receipt_records
set
  store_name = coalesce(nullif(store_name, ''), merchant),
  purchase_date = coalesce(purchase_date, purchased_at::date),
  receipt_total = coalesce(receipt_total, total),
  receipt_image_url = coalesce(nullif(receipt_image_url, ''), image_url),
  status = case when status in ('draft', 'verified', 'submitted', 'failed') then status else 'submitted' end,
  source = case when source in ('upload', 'camera', 'manual') then source else 'manual' end
where store_name is null
   or purchase_date is null
   or receipt_total is null
   or receipt_image_url is null
   or status is null
   or source is null;

update public.receipt_line_items
set
  item_name = coalesce(nullif(item_name, ''), product_name),
  matched_catalog_item_id = coalesce(matched_catalog_item_id, catalog_item_id),
  unit_cost = coalesce(unit_cost, unit_price),
  total_cost = coalesce(total_cost, line_total),
  verified = case when verified then true when matched_confidence = 'confirmed' then true else false end,
  updated_at = coalesce(updated_at, created_at)
where item_name is null
   or matched_catalog_item_id is null
   or unit_cost is null
   or total_cost is null
   or matched_confidence = 'confirmed'
   or updated_at is null;

create index if not exists receipt_records_workspace_status_idx
  on public.receipt_records(workspace_id, status, created_at desc);

create index if not exists receipt_records_user_purchase_date_idx
  on public.receipt_records(user_id, purchase_date desc nulls last, created_at desc);

create index if not exists receipt_line_items_receipt_destination_idx
  on public.receipt_line_items(receipt_id, destination, verified);

create index if not exists receipt_line_items_catalog_match_idx
  on public.receipt_line_items(matched_catalog_item_id)
  where matched_catalog_item_id is not null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_receipt_records_updated_at on public.receipt_records;
create trigger set_receipt_records_updated_at
before update on public.receipt_records
for each row execute function public.set_updated_at();

drop trigger if exists set_receipt_line_items_updated_at on public.receipt_line_items;
create trigger set_receipt_line_items_updated_at
before update on public.receipt_line_items
for each row execute function public.set_updated_at();

comment on table public.receipt_records is 'Receipt review records. OCR/import creates drafts; submitted records preserve store, totals, source, and workspace.';
comment on table public.receipt_line_items is 'Verified receipt line review items with destination routing to Vault, Forge, Wishlist, or expense-only.';

notify pgrst, 'reload schema';

commit;
