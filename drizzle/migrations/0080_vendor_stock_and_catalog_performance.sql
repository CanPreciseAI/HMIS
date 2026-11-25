-- Vendor medicine stock, stock receipt on collection, and a simpler
-- medicine-catalog read policy.
--
-- The catalog had four permissive SELECT policies, two of which expanded into
-- nested portal/vendor policy trees on every row. Under PostgREST that can hit
-- the statement timeout. A single security-definer predicate keeps the same
-- access rules without re-entering RLS for each catalog row.

create index if not exists medicine_catalog_tenant_name_idx
  on public.medicine_catalog (tenant_id, name);
create index if not exists medicine_catalog_tenant_status_idx
  on public.medicine_catalog (tenant_id, status);
create index if not exists medicine_vendor_orders_medicine_id_idx
  on public.medicine_vendor_orders (medicine_id);
create index if not exists patient_portal_access_user_status_idx
  on public.patient_portal_access (user_id, status);

create or replace function public.can_read_medicine_catalog(
  _medicine_id uuid,
  _tenant_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or public.is_tenant_member(_tenant_id)
    or public.is_tenant_admin(_tenant_id)
    -- Any supplier account for this hospital may browse the catalog so it can
    -- maintain its own stock list.
    or exists (
      select 1 from public.vendors vendor
      where vendor.tenant_id = _tenant_id
        and vendor.user_id = auth.uid()
    )
    -- A vendor can always see medicines it has been sent an order for, even
    -- if its supplier row is still being linked.
    or exists (
      select 1
      from public.medicine_vendor_orders medicine_order
      join public.vendors vendor on vendor.id = medicine_order.vendor_id
      where medicine_order.medicine_id = _medicine_id
        and vendor.user_id = auth.uid()
    )
    -- Patients can see names of medicines prescribed to them in the portal.
    or exists (
      select 1
      from public.prescription_items item
      join public.prescriptions prescription on prescription.id = item.prescription_id
      join public.encounters encounter on encounter.id = prescription.encounter_id
      join public.patient_portal_access access on access.patient_id = encounter.patient_id
      where item.medicine_id = _medicine_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
$$;

revoke all on function public.can_read_medicine_catalog(uuid, uuid) from public, anon;
grant execute on function public.can_read_medicine_catalog(uuid, uuid) to authenticated;
grant execute on function public.can_read_medicine_catalog(uuid, uuid) to service_role;

drop policy if exists "Portal users read prescribed medicine names"
  on public.medicine_catalog;
drop policy if exists "Tenant members can read medicine_catalog"
  on public.medicine_catalog;
drop policy if exists "Vendors read medicines they supply"
  on public.medicine_catalog;

drop policy if exists "Authorized users read medicine catalog"
  on public.medicine_catalog;
create policy "Authorized users read medicine catalog"
  on public.medicine_catalog for select to authenticated
  using (public.can_read_medicine_catalog(id, tenant_id));

-- ---------------------------------------------------------------------------
-- Supplier-owned medicine stock
-- ---------------------------------------------------------------------------

create table if not exists public.vendor_medicine_inventory (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  medicine_id uuid not null references public.medicine_catalog(id) on delete cascade,
  quantity_available numeric(19,4) not null default 0 check (quantity_available >= 0),
  unit text not null default 'units',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, medicine_id)
);

create index if not exists vendor_medicine_inventory_vendor_idx
  on public.vendor_medicine_inventory (vendor_id);
create index if not exists vendor_medicine_inventory_medicine_idx
  on public.vendor_medicine_inventory (medicine_id);

alter table public.vendor_medicine_inventory enable row level security;
revoke all on public.vendor_medicine_inventory from anon;
grant select, insert, update, delete on public.vendor_medicine_inventory to authenticated;
grant all on public.vendor_medicine_inventory to service_role;

drop policy if exists "Vendors manage their medicine inventory"
  on public.vendor_medicine_inventory;
create policy "Vendors manage their medicine inventory"
  on public.vendor_medicine_inventory for all to authenticated
  using (
    exists (
      select 1 from public.vendors vendor
      where vendor.id = vendor_id and vendor.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.vendors vendor
      where vendor.id = vendor_id and vendor.user_id = auth.uid()
    )
  );

drop trigger if exists set_updated_at on public.vendor_medicine_inventory;
create trigger set_updated_at before update on public.vendor_medicine_inventory
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Dispatch deducts the supplier's own stock when it is tracked
-- ---------------------------------------------------------------------------

create or replace function public.vendor_dispatch_medicine_order(
  _order_id uuid,
  _note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.medicine_vendor_orders%rowtype;
  v_stock numeric;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update this order';
  end if;

  select * into v_order
  from public.medicine_vendor_orders
  where id = _order_id
  for update;

  if not found then
    raise exception 'Medicine order not found';
  end if;

  if not exists (
    select 1 from public.vendors vendor
    where vendor.id = v_order.vendor_id and vendor.user_id = auth.uid()
  ) then
    raise exception 'Only this supplier can dispatch its orders';
  end if;

  if v_order.status <> 'sent' then
    raise exception 'Only orders awaiting dispatch can be marked dispatched';
  end if;

  select quantity_available into v_stock
  from public.vendor_medicine_inventory
  where vendor_id = v_order.vendor_id
    and medicine_id = v_order.medicine_id
  for update;

  if found then
    if v_stock < v_order.quantity then
      raise exception 'Only % units of this medicine are recorded in your inventory', v_stock;
    end if;
    update public.vendor_medicine_inventory
    set quantity_available = quantity_available - v_order.quantity
    where vendor_id = v_order.vendor_id
      and medicine_id = v_order.medicine_id;
  end if;

  update public.medicine_vendor_orders
  set status = 'dispatched',
      dispatched_at = now(),
      dispatch_note = nullif(trim(_note), '')
  where id = v_order.id;
end;
$$;

revoke all on function public.vendor_dispatch_medicine_order(uuid, text) from public, anon;
grant execute on function public.vendor_dispatch_medicine_order(uuid, text) to authenticated;
grant execute on function public.vendor_dispatch_medicine_order(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Collection receives the batch into hospital inventory
-- ---------------------------------------------------------------------------

drop function if exists public.collect_medicine_vendor_order(uuid);

create or replace function public.collect_medicine_vendor_order(
  _order_id uuid,
  _batch_number text default null,
  _expiry_date date default null,
  _location_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.medicine_vendor_orders%rowtype;
  v_item_id uuid;
  v_factor numeric := 1;
  v_location_id uuid;
  v_batch_id uuid;
  v_batch_number text;
  v_quantity numeric;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update this order';
  end if;

  select * into v_order
  from public.medicine_vendor_orders
  where id = _order_id
  for update;

  if not found then
    raise exception 'Medicine order not found';
  end if;

  if not (public.is_platform_admin() or public.is_tenant_admin(v_order.tenant_id)) then
    raise exception 'Only this hospital administrator can record the collection';
  end if;

  if v_order.status in ('collected', 'received') then
    return;
  end if;

  if v_order.status <> 'dispatched' then
    raise exception 'Only dispatched orders can be recorded as collected';
  end if;

  select mapping.item_id, mapping.conversion_factor
  into v_item_id, v_factor
  from public.medicine_inventory_map mapping
  join public.inventory_items item
    on item.id = mapping.item_id
    and item.tenant_id = v_order.tenant_id
    and item.status = 'active'
  where mapping.medicine_id = v_order.medicine_id
    and mapping.status = 'active'
  order by mapping.created_at
  limit 1;

  if v_item_id is null then
    raise exception 'Link this medicine to a hospital inventory item before collecting the order';
  end if;

  if _expiry_date is null then
    raise exception 'Enter the expiry date for the received batch';
  end if;
  if _expiry_date < current_date then
    raise exception 'The expiry date must be today or later';
  end if;

  v_quantity := v_order.quantity * coalesce(nullif(v_factor, 0), 1);

  if _location_id is not null then
    select location.id into v_location_id
    from public.inventory_locations location
    where location.id = _location_id
      and location.tenant_id = v_order.tenant_id
      and location.facility_id = v_order.facility_id
      and location.status = 'active';
    if v_location_id is null then
      raise exception 'Choose an active stock location for this hospital';
    end if;
  else
    select location.id into v_location_id
    from public.inventory_locations location
    where location.tenant_id = v_order.tenant_id
      and location.facility_id = v_order.facility_id
      and location.status = 'active'
    order by location.created_at
    limit 1;

    if v_location_id is null then
      insert into public.inventory_locations
        (tenant_id, facility_id, name, location_type, status)
      values
        (v_order.tenant_id, v_order.facility_id, 'Pharmacy', 'pharmacy', 'active')
      returning id into v_location_id;
    end if;
  end if;

  v_batch_number := coalesce(
    nullif(trim(_batch_number), ''),
    'VND-' || substr(replace(v_order.id::text, '-', ''), 1, 10)
  );

  select batch.id into v_batch_id
  from public.stock_batches batch
  where batch.tenant_id = v_order.tenant_id
    and batch.facility_id = v_order.facility_id
    and batch.item_id = v_item_id
    and batch.batch_number = v_batch_number
  for update;

  if v_batch_id is null then
    insert into public.stock_batches
      (tenant_id, facility_id, item_id, batch_number, expiry_date, received_quantity)
    values
      (v_order.tenant_id, v_order.facility_id, v_item_id, v_batch_number, _expiry_date, v_quantity)
    returning id into v_batch_id;
  else
    update public.stock_batches
    set received_quantity = received_quantity + v_quantity,
        expiry_date = _expiry_date
    where id = v_batch_id;
  end if;

  insert into public.inventory_balances
    (item_id, location_id, batch_id, quantity_on_hand, quantity_reserved)
  values
    (v_item_id, v_location_id, v_batch_id, v_quantity, 0)
  on conflict (item_id, location_id, batch_id)
  do update set quantity_on_hand = public.inventory_balances.quantity_on_hand + excluded.quantity_on_hand;

  insert into public.stock_movements
    (item_id, batch_id, location_id, movement_type, quantity, reference_type, reference_id)
  values
    (v_item_id, v_batch_id, v_location_id, 'receipt', v_quantity,
     'medicine_vendor_order', v_order.id);

  update public.medicine_vendor_orders
  set status = 'collected',
      collected_at = now(),
      collected_by = auth.uid()
  where id = v_order.id;

  update public.medicine_requests
  set status = 'fulfilled',
      reviewed_by = coalesce(reviewed_by, auth.uid()),
      reviewed_at = coalesce(reviewed_at, now()),
      updated_at = now()
  where id = v_order.request_id
    and status <> 'fulfilled';
end;
$$;

revoke all on function public.collect_medicine_vendor_order(uuid, text, date, uuid) from public, anon;
grant execute on function public.collect_medicine_vendor_order(uuid, text, date, uuid) to authenticated;
grant execute on function public.collect_medicine_vendor_order(uuid, text, date, uuid) to service_role;
