-- Delete a Forge sale and restore its linked inventory quantity in one transaction.
-- This keeps sale deletion from permanently removing stock when a sale record is removed.

create or replace function public.delete_sale_and_restore_inventory(target_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  sale_row public.sales_records%rowtype;
  restore_quantity integer := 0;
  restored_inventory_id uuid;
  restored_inventory_quantity integer;
begin
  if actor_id is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;

  select *
    into sale_row
    from public.sales_records
   where id = target_sale_id
   for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'reason', 'sale_not_found',
      'sale_id', target_sale_id
    );
  end if;

  if not (
    sale_row.user_id = actor_id
    or public.can_edit_workspace(sale_row.workspace_id)
  ) then
    raise exception 'You do not have permission to delete this sale.'
      using errcode = '42501';
  end if;

  restore_quantity := greatest(0, coalesce(sale_row.quantity_sold, 0))::integer;

  if sale_row.item_id is not null and restore_quantity > 0 then
    update public.inventory_items
       set quantity = coalesce(quantity, 0) + restore_quantity,
           status = case
             when lower(trim(coalesce(status, ''))) in ('sold', 'out of stock') then 'In Stock'
             else status
           end,
           updated_at = now()
     where id = sale_row.item_id
       and (
         user_id = actor_id
         or public.can_edit_workspace(workspace_id)
       )
     returning id, quantity
       into restored_inventory_id, restored_inventory_quantity;

    if restored_inventory_id is null then
      raise exception 'Sale could not be deleted because inventory could not be restored.'
        using errcode = 'P0001';
    end if;
  end if;

  delete from public.sales_records
   where id = target_sale_id;

  return jsonb_build_object(
    'ok', true,
    'sale_id', target_sale_id,
    'restored_item_id', restored_inventory_id,
    'restored_quantity', restore_quantity,
    'inventory_quantity', restored_inventory_quantity
  );
end;
$$;

revoke all on function public.delete_sale_and_restore_inventory(uuid) from public;
grant execute on function public.delete_sale_and_restore_inventory(uuid) to authenticated;

comment on function public.delete_sale_and_restore_inventory(uuid) is
  'Deletes one Forge sale and restores linked inventory quantity atomically for the sale owner or workspace editor.';
