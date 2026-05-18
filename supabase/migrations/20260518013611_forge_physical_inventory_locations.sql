alter table public.inventory_items
  add column if not exists physical_location text,
  add column if not exists physical_location_notes text;

create index if not exists inventory_items_physical_location_idx
  on public.inventory_items(workspace_id, physical_location);
