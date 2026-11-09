-- Hospital administrators approve staff medicine requests and dispatch the
-- approved order to a medicine vendor. Vendors keep contact details so the
-- order can be traced, and every approval produces one vendor order.
alter table public.vendors
  add column email text,
  add column phone text;

create table public.medicine_vendor_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete cascade not null,
  request_id uuid references public.medicine_requests(id) on delete cascade not null unique,
  vendor_id uuid references public.vendors(id) on delete restrict not null,
  medicine_id uuid references public.medicine_catalog(id) on delete restrict not null,
  quantity numeric(19,4) not null check (quantity > 0),
  status text not null default 'sent'
    check (status in ('sent', 'received', 'cancelled')),
  sent_by uuid references public.users(id) on delete set null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index medicine_vendor_orders_tenant_id_idx
  on public.medicine_vendor_orders (tenant_id);
create index medicine_vendor_orders_facility_id_idx
  on public.medicine_vendor_orders (facility_id);
create index medicine_vendor_orders_vendor_id_idx
  on public.medicine_vendor_orders (vendor_id);
create index medicine_vendor_orders_status_idx
  on public.medicine_vendor_orders (tenant_id, status);

alter table public.medicine_vendor_orders enable row level security;
revoke all on public.medicine_vendor_orders from anon;
grant select, insert, update on public.medicine_vendor_orders to authenticated;
grant all on public.medicine_vendor_orders to service_role;

create policy "Tenant members read medicine vendor orders"
  on public.medicine_vendor_orders for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage medicine vendor orders"
  on public.medicine_vendor_orders for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create trigger set_updated_at before update on public.medicine_vendor_orders
  for each row execute function public.set_updated_at();

-- Approving a request and creating its vendor order happen together. A
-- request can only be dispatched once, and only to an active vendor owned by
-- the same hospital.
create or replace function public.send_medicine_request_to_vendor(
  _request_id uuid,
  _vendor_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.medicine_requests%rowtype;
  supplier public.vendors%rowtype;
  order_id uuid;
begin
  select * into req
  from public.medicine_requests
  where id = _request_id
  for update;

  if not found then
    raise exception 'Medicine request not found';
  end if;

  if not (public.is_platform_admin() or public.is_tenant_admin(req.tenant_id)) then
    raise exception 'Only hospital administrators can approve medicine requests';
  end if;

  if req.status not in ('pending', 'approved') then
    raise exception 'Only pending or approved requests can be sent to a vendor';
  end if;

  if exists (
    select 1 from public.medicine_vendor_orders where request_id = req.id
  ) then
    raise exception 'This request has already been sent to a vendor';
  end if;

  select * into supplier
  from public.vendors
  where id = _vendor_id and tenant_id = req.tenant_id;

  if not found then
    raise exception 'Vendor not found for this hospital';
  end if;
  if supplier.status <> 'active' then
    raise exception 'This vendor is inactive';
  end if;

  insert into public.medicine_vendor_orders (
    tenant_id,
    facility_id,
    request_id,
    vendor_id,
    medicine_id,
    quantity,
    status,
    sent_by
  ) values (
    req.tenant_id,
    req.facility_id,
    req.id,
    supplier.id,
    req.medicine_id,
    req.quantity,
    'sent',
    auth.uid()
  ) returning id into order_id;

  update public.medicine_requests
  set status = 'approved',
      reviewed_by = coalesce(reviewed_by, auth.uid()),
      reviewed_at = coalesce(reviewed_at, now()),
      updated_at = now()
  where id = req.id;

  return order_id;
end;
$$;

revoke all on function public.send_medicine_request_to_vendor(uuid, uuid) from public;
grant execute on function public.send_medicine_request_to_vendor(uuid, uuid) to authenticated;
grant execute on function public.send_medicine_request_to_vendor(uuid, uuid) to service_role;