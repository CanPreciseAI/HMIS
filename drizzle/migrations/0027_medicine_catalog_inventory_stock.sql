-- Tenant-safe medicine inventory mapping management and catalog stock totals.

create or replace function public.manage_medicine_inventory_mapping(
  _tenant_id uuid,
  _medicine_id uuid,
  _item_id uuid,
  _conversion_factor numeric,
  _operation text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item_status text;
begin
  if auth.uid() is null
    or not (public.is_platform_admin() or public.is_tenant_admin(_tenant_id)) then
    raise exception 'Only a hospital administrator can manage medicine inventory links.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.medicine_catalog m
    where m.id = _medicine_id
      and m.tenant_id = _tenant_id
  ) then
    raise exception 'Medicine does not belong to this hospital.'
      using errcode = '22023';
  end if;

  if _operation = 'delete' then
    delete from public.medicine_inventory_map
    where medicine_id = _medicine_id
      and item_id = _item_id;
  elsif _operation = 'upsert' then
    select i.status
    into item_status
    from public.inventory_items i
    where i.id = _item_id
      and i.tenant_id = _tenant_id;

    if not found then
      raise exception 'Inventory item does not belong to this hospital.'
        using errcode = '22023';
    end if;
    if item_status <> 'active' then
      raise exception 'Only active inventory items can be linked.'
        using errcode = '22023';
    end if;
    if _conversion_factor is null or _conversion_factor <= 0 then
      raise exception 'Conversion factor must be greater than zero.'
        using errcode = '22023';
    end if;

    insert into public.medicine_inventory_map (
      medicine_id,
      item_id,
      conversion_factor,
      status
    )
    values (_medicine_id, _item_id, _conversion_factor, 'active')
    on conflict (medicine_id, item_id)
    do update set
      conversion_factor = excluded.conversion_factor,
      status = 'active',
      updated_at = now();
  else
    raise exception 'Unsupported medicine inventory mapping operation.'
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.manage_medicine_inventory_mapping(uuid, uuid, uuid, numeric, text) from public;
grant execute on function public.manage_medicine_inventory_mapping(uuid, uuid, uuid, numeric, text) to authenticated;

create or replace function public.get_medicine_catalog_stock(_tenant_id uuid)
returns table (
  medicine_id uuid,
  is_mapped boolean,
  available_quantity numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or not (public.is_platform_admin() or public.is_tenant_member(_tenant_id)) then
    raise exception 'You are not a member of this hospital.'
      using errcode = '42501';
  end if;

  return query
  with eligible_mappings as (
    select
      mapping.medicine_id,
      mapping.item_id,
      mapping.conversion_factor
    from public.medicine_inventory_map mapping
    join public.medicine_catalog medicine
      on medicine.id = mapping.medicine_id
      and medicine.tenant_id = _tenant_id
    join public.inventory_items item
      on item.id = mapping.item_id
      and item.tenant_id = _tenant_id
      and item.status = 'active'
    where mapping.status = 'active'
  ),
  stock_totals as (
    select
      mapping.medicine_id,
      sum(
        greatest(balance.quantity_on_hand - balance.quantity_reserved, 0)
        * mapping.conversion_factor
      ) as quantity
    from eligible_mappings mapping
    join public.inventory_balances balance
      on balance.item_id = mapping.item_id
    join public.inventory_locations location
      on location.id = balance.location_id
      and location.tenant_id = _tenant_id
      and location.status = 'active'
    join public.stock_batches batch
      on batch.id = balance.batch_id
      and batch.item_id = balance.item_id
      and batch.tenant_id = _tenant_id
      and batch.facility_id = location.facility_id
      and batch.expiry_date >= current_date
    group by mapping.medicine_id
  )
  select
    medicine.id,
    exists (
      select 1
      from eligible_mappings mapping
      where mapping.medicine_id = medicine.id
    ),
    coalesce(stock_totals.quantity, 0)
  from public.medicine_catalog medicine
  left join stock_totals on stock_totals.medicine_id = medicine.id
  where medicine.tenant_id = _tenant_id;
end;
$$;

revoke all on function public.get_medicine_catalog_stock(uuid) from public;
grant execute on function public.get_medicine_catalog_stock(uuid) to authenticated;
