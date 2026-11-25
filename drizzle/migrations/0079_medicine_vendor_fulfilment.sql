-- Medicine order fulfilment: an order sent to a vendor moves through
-- dispatched (vendor packed and sent the medicines) and collected (the
-- hospital received them). Vendors can only advance their own orders, and
-- only the hospital administrator can record the collection.

alter table public.medicine_vendor_orders
  add column if not exists dispatched_at timestamptz,
  add column if not exists dispatch_note text,
  add column if not exists collected_at timestamptz,
  add column if not exists collected_by uuid references public.users(id) on delete set null;

alter table public.medicine_vendor_orders
  drop constraint if exists medicine_vendor_orders_status_check;

alter table public.medicine_vendor_orders
  add constraint medicine_vendor_orders_status_check
  check (status in ('sent', 'dispatched', 'collected', 'received', 'cancelled'));

-- Orders received before this migration were collected by definition.
update public.medicine_vendor_orders
set collected_at = coalesce(collected_at, updated_at)
where status = 'received' and collected_at is null;

create index if not exists medicine_vendor_orders_vendor_status_idx
  on public.medicine_vendor_orders (vendor_id, status);

-- ---------------------------------------------------------------------------
-- Vendor: mark an order dispatched
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
-- Hospital administrator: record that the medicines were collected
-- ---------------------------------------------------------------------------

create or replace function public.collect_medicine_vendor_order(
  _order_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.medicine_vendor_orders%rowtype;
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

revoke all on function public.collect_medicine_vendor_order(uuid) from public, anon;
grant execute on function public.collect_medicine_vendor_order(uuid) to authenticated;
grant execute on function public.collect_medicine_vendor_order(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Vendors may read the request note behind their own orders
-- ---------------------------------------------------------------------------

drop policy if exists "Vendors read requests sent to them"
  on public.medicine_requests;

create policy "Vendors read requests sent to them"
  on public.medicine_requests for select to authenticated
  using (
    exists (
      select 1
      from public.medicine_vendor_orders medicine_order
      join public.vendors vendor on vendor.id = medicine_order.vendor_id
      where medicine_order.request_id = medicine_requests.id
        and vendor.user_id = auth.uid()
    )
  );
