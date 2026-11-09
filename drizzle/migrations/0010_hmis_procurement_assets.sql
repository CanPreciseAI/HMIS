-- Requisition -> purchase order -> goods receipt -> vendor invoice/payment,
-- and the asset register with maintenance work orders.
--
-- Part of the HMIS backend described by HMIS_Design_Detail_v2.
-- Tenancy follows the global conventions: tenant-owned rows carry
-- tenant_id, or inherit it through the parent chain named in the
-- policy. Rows are deactivated by status, never hard-deleted.

create table public.purchase_requisitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  requested_by uuid references public.employees(id) on delete restrict not null,
  department_id uuid references public.departments(id) on delete restrict not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'ordered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchase_requisitions_tenant_id_idx on public.purchase_requisitions (tenant_id);
create index purchase_requisitions_facility_id_idx on public.purchase_requisitions (facility_id);
create index purchase_requisitions_requested_by_idx on public.purchase_requisitions (requested_by);
create index purchase_requisitions_department_id_idx on public.purchase_requisitions (department_id);

create table public.purchase_requisition_items (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid references public.purchase_requisitions(id) on delete cascade not null,
  item_id uuid references public.inventory_items(id) on delete restrict not null,
  quantity numeric(19,4) not null check (quantity >= 0),
  estimated_price numeric(19,4) not null check (estimated_price >= 0),
  created_at timestamptz not null default now()
);
create index purchase_requisition_items_requisition_id_idx on public.purchase_requisition_items (requisition_id);
create index purchase_requisition_items_item_id_idx on public.purchase_requisition_items (item_id);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  vendor_id uuid references public.vendors(id) on delete restrict not null,
  po_number text not null,
  total_amount numeric(19,4) not null default 0 check (total_amount >= 0),
  status text not null default 'draft' check (status in ('draft', 'approved', 'partially_received', 'received', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, po_number)
);
create index purchase_orders_tenant_id_idx on public.purchase_orders (tenant_id);
create index purchase_orders_facility_id_idx on public.purchase_orders (facility_id);
create index purchase_orders_vendor_id_idx on public.purchase_orders (vendor_id);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references public.purchase_orders(id) on delete cascade not null,
  item_id uuid references public.inventory_items(id) on delete restrict not null,
  quantity numeric(19,4) not null check (quantity >= 0),
  unit_price numeric(19,4) not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);
create index purchase_order_items_purchase_order_id_idx on public.purchase_order_items (purchase_order_id);
create index purchase_order_items_item_id_idx on public.purchase_order_items (item_id);

create table public.po_requisition_allocations (
  id uuid primary key default gen_random_uuid(),
  po_item_id uuid references public.purchase_order_items(id) on delete cascade not null,
  requisition_item_id uuid references public.purchase_requisition_items(id) on delete restrict not null,
  quantity numeric(19,4) not null check (quantity >= 0),
  created_at timestamptz not null default now()
);
create index po_requisition_allocations_po_item_id_idx on public.po_requisition_allocations (po_item_id);
create index po_requisition_allocations_requisition_item_id_idx on public.po_requisition_allocations (requisition_item_id);

-- Single state: posted and immutable; corrections are return receipts.
create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references public.purchase_orders(id) on delete restrict not null,
  received_by uuid references public.employees(id) on delete restrict not null,
  received_at timestamptz,
  status text not null default 'posted' check (status in ('posted')),
  created_at timestamptz not null default now()
);
create index goods_receipts_purchase_order_id_idx on public.goods_receipts (purchase_order_id);
create index goods_receipts_received_by_idx on public.goods_receipts (received_by);

create table public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid references public.goods_receipts(id) on delete cascade not null,
  po_item_id uuid references public.purchase_order_items(id) on delete restrict not null,
  item_id uuid references public.inventory_items(id) on delete restrict not null,
  batch_id uuid references public.stock_batches(id) on delete restrict not null,
  received_quantity numeric(19,4) not null check (received_quantity >= 0),
  created_at timestamptz not null default now()
);
create index goods_receipt_items_goods_receipt_id_idx on public.goods_receipt_items (goods_receipt_id);
create index goods_receipt_items_po_item_id_idx on public.goods_receipt_items (po_item_id);
create index goods_receipt_items_item_id_idx on public.goods_receipt_items (item_id);
create index goods_receipt_items_batch_id_idx on public.goods_receipt_items (batch_id);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  asset_code text not null,
  name text not null,
  purchase_date date not null,
  status text not null default 'active' check (status in ('active', 'in_maintenance', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, asset_code)
);
create index assets_tenant_id_idx on public.assets (tenant_id);
create index assets_facility_id_idx on public.assets (facility_id);

create table public.maintenance_work_orders (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets(id) on delete cascade not null,
  issue_type text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references public.employees(id) on delete restrict not null,
  status text not null default 'open' check (status in ('open', 'assigned', 'in_progress', 'closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index maintenance_work_orders_asset_id_idx on public.maintenance_work_orders (asset_id);
create index maintenance_work_orders_assigned_to_idx on public.maintenance_work_orders (assigned_to);

create table public.vendor_invoices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors(id) on delete restrict not null,
  purchase_order_id uuid references public.purchase_orders(id) on delete restrict not null,
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  gross_amount numeric(19,4) not null check (gross_amount >= 0),
  status text not null default 'received' check (status in ('received', 'matched', 'approved', 'paid', 'disputed', 'reversed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, invoice_number)
);
create index vendor_invoices_vendor_id_idx on public.vendor_invoices (vendor_id);
create index vendor_invoices_purchase_order_id_idx on public.vendor_invoices (purchase_order_id);

-- Three-way match: PO line + goods receipt line + invoice line.
create table public.vendor_invoice_items (
  id uuid primary key default gen_random_uuid(),
  vendor_invoice_id uuid references public.vendor_invoices(id) on delete cascade not null,
  po_item_id uuid references public.purchase_order_items(id) on delete restrict not null,
  goods_receipt_item_id uuid references public.goods_receipt_items(id) on delete restrict not null,
  quantity numeric(19,4) not null check (quantity >= 0),
  unit_price numeric(19,4) not null check (unit_price >= 0),
  line_total numeric(19,4) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index vendor_invoice_items_vendor_invoice_id_idx on public.vendor_invoice_items (vendor_invoice_id);
create index vendor_invoice_items_po_item_id_idx on public.vendor_invoice_items (po_item_id);
create index vendor_invoice_items_goods_receipt_item_id_idx on public.vendor_invoice_items (goods_receipt_item_id);

create table public.vendor_payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors(id) on delete restrict not null,
  payment_reference text not null,
  amount numeric(19,4) not null check (amount >= 0),
  method text not null,
  status text not null default 'initiated' check (status in ('initiated', 'paid', 'voided')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, payment_reference)
);
create index vendor_payments_vendor_id_idx on public.vendor_payments (vendor_id);

create table public.vendor_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  vendor_payment_id uuid references public.vendor_payments(id) on delete cascade not null,
  vendor_invoice_id uuid references public.vendor_invoices(id) on delete restrict not null,
  allocated_amount numeric(19,4) not null check (allocated_amount >= 0),
  created_at timestamptz not null default now()
);
create index vendor_payment_allocations_vendor_payment_id_idx on public.vendor_payment_allocations (vendor_payment_id);
create index vendor_payment_allocations_vendor_invoice_id_idx on public.vendor_payment_allocations (vendor_invoice_id);

-- ---------------------------------------------------------------------------
-- Grants, row level security and indexes
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
  'purchase_requisitions',
  'purchase_requisition_items',
  'purchase_orders',
  'purchase_order_items',
  'po_requisition_allocations',
  'goods_receipts',
  'goods_receipt_items',
  'assets',
  'maintenance_work_orders',
  'vendor_invoices',
  'vendor_invoice_items',
  'vendor_payments',
  'vendor_payment_allocations'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

create policy "Tenant members can read purchase_requisitions"
  on public.purchase_requisitions for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage purchase_requisitions"
  on public.purchase_requisitions for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read purchase_requisition_items"
  on public.purchase_requisition_items for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select r.tenant_id from public.purchase_requisitions r where r.id = requisition_id)));

create policy "Tenant admins manage purchase_requisition_items"
  on public.purchase_requisition_items for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select r.tenant_id from public.purchase_requisitions r where r.id = requisition_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select r.tenant_id from public.purchase_requisitions r where r.id = requisition_id)));

create policy "Tenant members can read purchase_orders"
  on public.purchase_orders for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage purchase_orders"
  on public.purchase_orders for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read purchase_order_items"
  on public.purchase_order_items for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select o.tenant_id from public.purchase_orders o where o.id = purchase_order_id)));

create policy "Tenant admins manage purchase_order_items"
  on public.purchase_order_items for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select o.tenant_id from public.purchase_orders o where o.id = purchase_order_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select o.tenant_id from public.purchase_orders o where o.id = purchase_order_id)));

create policy "Tenant members can read po_requisition_allocations"
  on public.po_requisition_allocations for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.purchase_order_items i
     join public.purchase_orders o on o.id = i.purchase_order_id
    where i.id = po_item_id and public.is_tenant_member(o.tenant_id)));

create policy "Tenant admins manage po_requisition_allocations"
  on public.po_requisition_allocations for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.purchase_order_items i
     join public.purchase_orders o on o.id = i.purchase_order_id
    where i.id = po_item_id and public.is_tenant_admin(o.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.purchase_order_items i
     join public.purchase_orders o on o.id = i.purchase_order_id
    where i.id = po_item_id and public.is_tenant_admin(o.tenant_id)));

create policy "Tenant members can read goods_receipts"
  on public.goods_receipts for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select o.tenant_id from public.purchase_orders o where o.id = purchase_order_id)));

create policy "Tenant admins manage goods_receipts"
  on public.goods_receipts for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select o.tenant_id from public.purchase_orders o where o.id = purchase_order_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select o.tenant_id from public.purchase_orders o where o.id = purchase_order_id)));

create policy "Tenant members can read goods_receipt_items"
  on public.goods_receipt_items for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.goods_receipts g
     join public.purchase_orders o on o.id = g.purchase_order_id
    where g.id = goods_receipt_id and public.is_tenant_member(o.tenant_id)));

create policy "Tenant admins manage goods_receipt_items"
  on public.goods_receipt_items for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.goods_receipts g
     join public.purchase_orders o on o.id = g.purchase_order_id
    where g.id = goods_receipt_id and public.is_tenant_admin(o.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.goods_receipts g
     join public.purchase_orders o on o.id = g.purchase_order_id
    where g.id = goods_receipt_id and public.is_tenant_admin(o.tenant_id)));

create policy "Tenant members can read assets"
  on public.assets for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage assets"
  on public.assets for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read maintenance_work_orders"
  on public.maintenance_work_orders for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select a.tenant_id from public.assets a where a.id = asset_id)));

create policy "Tenant admins manage maintenance_work_orders"
  on public.maintenance_work_orders for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select a.tenant_id from public.assets a where a.id = asset_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select a.tenant_id from public.assets a where a.id = asset_id)));

create policy "Tenant members can read vendor_invoices"
  on public.vendor_invoices for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select v.tenant_id from public.vendors v where v.id = vendor_id)));

create policy "Tenant admins manage vendor_invoices"
  on public.vendor_invoices for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select v.tenant_id from public.vendors v where v.id = vendor_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select v.tenant_id from public.vendors v where v.id = vendor_id)));

create policy "Tenant members can read vendor_invoice_items"
  on public.vendor_invoice_items for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.vendor_invoices vi
     join public.vendors v on v.id = vi.vendor_id
    where vi.id = vendor_invoice_id and public.is_tenant_member(v.tenant_id)));

create policy "Tenant admins manage vendor_invoice_items"
  on public.vendor_invoice_items for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.vendor_invoices vi
     join public.vendors v on v.id = vi.vendor_id
    where vi.id = vendor_invoice_id and public.is_tenant_admin(v.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.vendor_invoices vi
     join public.vendors v on v.id = vi.vendor_id
    where vi.id = vendor_invoice_id and public.is_tenant_admin(v.tenant_id)));

create policy "Tenant members can read vendor_payments"
  on public.vendor_payments for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select v.tenant_id from public.vendors v where v.id = vendor_id)));

create policy "Tenant admins manage vendor_payments"
  on public.vendor_payments for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select v.tenant_id from public.vendors v where v.id = vendor_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select v.tenant_id from public.vendors v where v.id = vendor_id)));

create policy "Tenant members can read vendor_payment_allocations"
  on public.vendor_payment_allocations for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.vendor_payments vp
     join public.vendors v on v.id = vp.vendor_id
    where vp.id = vendor_payment_id and public.is_tenant_member(v.tenant_id)));

create policy "Tenant admins manage vendor_payment_allocations"
  on public.vendor_payment_allocations for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.vendor_payments vp
     join public.vendors v on v.id = vp.vendor_id
    where vp.id = vendor_payment_id and public.is_tenant_admin(v.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.vendor_payments vp
     join public.vendors v on v.id = vp.vendor_id
    where vp.id = vendor_payment_id and public.is_tenant_admin(v.tenant_id)));

do $$
declare
  t text;
begin
  foreach t in array array[
    'purchase_requisitions',
    'purchase_orders',
    'assets',
    'maintenance_work_orders',
    'vendor_invoices',
    'vendor_payments'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;
