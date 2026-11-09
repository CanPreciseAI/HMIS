-- Inventory locations, items, batches, movements, pharmacy catalogue and
-- prescriptions through to dispense allocations.
--
-- Part of the HMIS backend described by HMIS_Design_Detail_v2.
-- Tenancy follows the global conventions: tenant-owned rows carry
-- tenant_id, or inherit it through the parent chain named in the
-- policy. Rows are deactivated by status, never hard-deleted.

create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete cascade not null,
  name text not null,
  location_type text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (facility_id, name)
);
create index inventory_locations_tenant_id_idx on public.inventory_locations (tenant_id);
create index inventory_locations_facility_id_idx on public.inventory_locations (facility_id);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  item_code text not null,
  name text not null,
  category text not null,
  unit_of_measure text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, item_code)
);
create index inventory_items_tenant_id_idx on public.inventory_items (tenant_id);

create table public.stock_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete cascade not null,
  item_id uuid references public.inventory_items(id) on delete restrict not null,
  batch_number text not null,
  expiry_date date not null,
  received_quantity numeric(19,4) not null default 0 check (received_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (facility_id, item_id, batch_number)
);
create index stock_batches_tenant_id_idx on public.stock_batches (tenant_id);
create index stock_batches_facility_id_idx on public.stock_batches (facility_id);
create index stock_batches_item_id_idx on public.stock_batches (item_id);

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  source_location_id uuid references public.inventory_locations(id) on delete restrict not null,
  destination_location_id uuid references public.inventory_locations(id) on delete restrict not null,
  status text not null default 'requested' check (status in ('requested', 'approved', 'in_transit', 'partially_received', 'received', 'cancelled')),
  approved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_location_id <> destination_location_id)
);
create index stock_transfers_source_location_id_idx on public.stock_transfers (source_location_id);
create index stock_transfers_destination_location_id_idx on public.stock_transfers (destination_location_id);
create index stock_transfers_approved_by_idx on public.stock_transfers (approved_by);

create table public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid references public.stock_transfers(id) on delete cascade not null,
  item_id uuid references public.inventory_items(id) on delete restrict not null,
  batch_id uuid references public.stock_batches(id) on delete restrict not null,
  quantity numeric(19,4) not null check (quantity >= 0),
  created_at timestamptz not null default now()
);
create index stock_transfer_items_transfer_id_idx on public.stock_transfer_items (transfer_id);
create index stock_transfer_items_item_id_idx on public.stock_transfer_items (item_id);
create index stock_transfer_items_batch_id_idx on public.stock_transfer_items (batch_id);

-- Authoritative stock ledger; quantity is always positive, direction comes from movement_type.
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.inventory_items(id) on delete restrict not null,
  batch_id uuid references public.stock_batches(id) on delete restrict not null,
  location_id uuid references public.inventory_locations(id) on delete restrict not null,
  transfer_item_id uuid references public.stock_transfer_items(id) on delete set null,
  movement_type text not null check (movement_type in ('receipt', 'issue', 'transfer_out', 'transfer_in', 'adjustment', 'write_off', 'return')),
  quantity numeric(19,4) not null check (quantity > 0),
  reference_type text not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);
create index stock_movements_item_id_idx on public.stock_movements (item_id);
create index stock_movements_batch_id_idx on public.stock_movements (batch_id);
create index stock_movements_location_id_idx on public.stock_movements (location_id);
create index stock_movements_transfer_item_id_idx on public.stock_movements (transfer_item_id);

create table public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.inventory_items(id) on delete restrict not null,
  location_id uuid references public.inventory_locations(id) on delete restrict not null,
  batch_id uuid references public.stock_batches(id) on delete restrict not null,
  quantity_on_hand numeric(19,4) not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved numeric(19,4) not null default 0 check (quantity_reserved >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, location_id, batch_id)
);
create index inventory_balances_item_id_idx on public.inventory_balances (item_id);
create index inventory_balances_location_id_idx on public.inventory_balances (location_id);
create index inventory_balances_batch_id_idx on public.inventory_balances (batch_id);

create table public.medicine_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  medicine_code text not null,
  name text not null,
  strength text not null,
  dosage_form text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, medicine_code)
);
create index medicine_catalog_tenant_id_idx on public.medicine_catalog (tenant_id);

create table public.medicine_inventory_map (
  id uuid primary key default gen_random_uuid(),
  medicine_id uuid references public.medicine_catalog(id) on delete cascade not null,
  item_id uuid references public.inventory_items(id) on delete cascade not null,
  conversion_factor numeric(19,4) not null check (conversion_factor > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (medicine_id, item_id)
);
create index medicine_inventory_map_medicine_id_idx on public.medicine_inventory_map (medicine_id);
create index medicine_inventory_map_item_id_idx on public.medicine_inventory_map (item_id);

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid references public.encounters(id) on delete cascade not null,
  prescriber_id uuid references public.employees(id) on delete restrict not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prescriptions_encounter_id_idx on public.prescriptions (encounter_id);
create index prescriptions_prescriber_id_idx on public.prescriptions (prescriber_id);

create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  prescription_id uuid references public.prescriptions(id) on delete cascade not null,
  medicine_id uuid references public.medicine_catalog(id) on delete restrict not null,
  dose text not null,
  route text not null,
  frequency text not null,
  duration text not null,
  quantity_prescribed numeric(19,4) not null check (quantity_prescribed >= 0),
  quantity_dispensed numeric(19,4) not null default 0 check (quantity_dispensed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prescription_items_tenant_id_idx on public.prescription_items (tenant_id);
create index prescription_items_prescription_id_idx on public.prescription_items (prescription_id);
create index prescription_items_medicine_id_idx on public.prescription_items (medicine_id);

-- dispensed_medicine_id is null when the prescribed medicine was dispensed.
create table public.prescription_dispenses (
  id uuid primary key default gen_random_uuid(),
  prescription_item_id uuid references public.prescription_items(id) on delete cascade not null,
  pharmacist_id uuid references public.employees(id) on delete restrict not null,
  quantity numeric(19,4) not null check (quantity >= 0),
  dispensed_at timestamptz not null default now(),
  dispensed_medicine_id uuid references public.medicine_catalog(id) on delete set null,
  substitution_reason text,
  substitution_authorized_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  check (substitution_reason is null or dispensed_medicine_id is not null)
);
create index prescription_dispenses_prescription_item_id_idx on public.prescription_dispenses (prescription_item_id);
create index prescription_dispenses_pharmacist_id_idx on public.prescription_dispenses (pharmacist_id);
create index prescription_dispenses_dispensed_medicine_id_idx on public.prescription_dispenses (dispensed_medicine_id);
create index prescription_dispenses_substitution_authorized_by_idx on public.prescription_dispenses (substitution_authorized_by);

-- One stock movement per allocation: dispense-to-stock trace.
create table public.dispense_allocations (
  id uuid primary key default gen_random_uuid(),
  dispense_id uuid references public.prescription_dispenses(id) on delete cascade not null,
  batch_id uuid references public.stock_batches(id) on delete restrict not null,
  location_id uuid references public.inventory_locations(id) on delete restrict not null,
  stock_movement_id uuid references public.stock_movements(id) on delete restrict not null,
  quantity numeric(19,4) not null check (quantity >= 0),
  created_at timestamptz not null default now()
);
create index dispense_allocations_dispense_id_idx on public.dispense_allocations (dispense_id);
create index dispense_allocations_batch_id_idx on public.dispense_allocations (batch_id);
create index dispense_allocations_location_id_idx on public.dispense_allocations (location_id);
create index dispense_allocations_stock_movement_id_idx on public.dispense_allocations (stock_movement_id);

-- ---------------------------------------------------------------------------
-- Grants, row level security and indexes
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
  'inventory_locations',
  'inventory_items',
  'stock_batches',
  'stock_transfers',
  'stock_transfer_items',
  'stock_movements',
  'inventory_balances',
  'medicine_catalog',
  'medicine_inventory_map',
  'prescriptions',
  'prescription_items',
  'prescription_dispenses',
  'dispense_allocations'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

create policy "Tenant members can read inventory_locations"
  on public.inventory_locations for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage inventory_locations"
  on public.inventory_locations for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read inventory_items"
  on public.inventory_items for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage inventory_items"
  on public.inventory_items for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read stock_batches"
  on public.stock_batches for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage stock_batches"
  on public.stock_batches for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read stock_transfers"
  on public.stock_transfers for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.inventory_locations l
    where l.id = source_location_id and public.is_tenant_member(l.tenant_id)));

create policy "Tenant admins manage stock_transfers"
  on public.stock_transfers for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.inventory_locations l
    where l.id = source_location_id and public.is_tenant_admin(l.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.inventory_locations l
    where l.id = source_location_id and public.is_tenant_admin(l.tenant_id)));

create policy "Tenant members can read stock_transfer_items"
  on public.stock_transfer_items for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.stock_transfers s
     join public.inventory_locations l on l.id = s.source_location_id
    where s.id = transfer_id and public.is_tenant_member(l.tenant_id)));

create policy "Tenant admins manage stock_transfer_items"
  on public.stock_transfer_items for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.stock_transfers s
     join public.inventory_locations l on l.id = s.source_location_id
    where s.id = transfer_id and public.is_tenant_admin(l.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.stock_transfers s
     join public.inventory_locations l on l.id = s.source_location_id
    where s.id = transfer_id and public.is_tenant_admin(l.tenant_id)));

create policy "Tenant members can read stock_movements"
  on public.stock_movements for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select b.tenant_id from public.stock_batches b where b.id = batch_id)));

create policy "Tenant admins manage stock_movements"
  on public.stock_movements for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select b.tenant_id from public.stock_batches b where b.id = batch_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select b.tenant_id from public.stock_batches b where b.id = batch_id)));

create policy "Tenant members can read inventory_balances"
  on public.inventory_balances for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select b.tenant_id from public.stock_batches b where b.id = batch_id)));

create policy "Tenant admins manage inventory_balances"
  on public.inventory_balances for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select b.tenant_id from public.stock_batches b where b.id = batch_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select b.tenant_id from public.stock_batches b where b.id = batch_id)));

create policy "Tenant members can read medicine_catalog"
  on public.medicine_catalog for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage medicine_catalog"
  on public.medicine_catalog for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read medicine_inventory_map"
  on public.medicine_inventory_map for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select m.tenant_id from public.medicine_catalog m where m.id = medicine_id)));

create policy "Tenant admins manage medicine_inventory_map"
  on public.medicine_inventory_map for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select m.tenant_id from public.medicine_catalog m where m.id = medicine_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select m.tenant_id from public.medicine_catalog m where m.id = medicine_id)));

create policy "Tenant members can read prescriptions"
  on public.prescriptions for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select e.tenant_id from public.encounters e where e.id = encounter_id)));

create policy "Tenant admins manage prescriptions"
  on public.prescriptions for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select e.tenant_id from public.encounters e where e.id = encounter_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select e.tenant_id from public.encounters e where e.id = encounter_id)));

create policy "Tenant members can read prescription_items"
  on public.prescription_items for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage prescription_items"
  on public.prescription_items for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read prescription_dispenses"
  on public.prescription_dispenses for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select i.tenant_id from public.prescription_items i where i.id = prescription_item_id)));

create policy "Tenant admins manage prescription_dispenses"
  on public.prescription_dispenses for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select i.tenant_id from public.prescription_items i where i.id = prescription_item_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select i.tenant_id from public.prescription_items i where i.id = prescription_item_id)));

create policy "Tenant members can read dispense_allocations"
  on public.dispense_allocations for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.prescription_dispenses d
     join public.prescription_items i on i.id = d.prescription_item_id
    where d.id = dispense_id and public.is_tenant_member(i.tenant_id)));

create policy "Tenant admins manage dispense_allocations"
  on public.dispense_allocations for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.prescription_dispenses d
     join public.prescription_items i on i.id = d.prescription_item_id
    where d.id = dispense_id and public.is_tenant_admin(i.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.prescription_dispenses d
     join public.prescription_items i on i.id = d.prescription_item_id
    where d.id = dispense_id and public.is_tenant_admin(i.tenant_id)));

do $$
declare
  t text;
begin
  foreach t in array array[
    'inventory_locations',
    'inventory_items',
    'stock_batches',
    'stock_transfers',
    'inventory_balances',
    'medicine_catalog',
    'medicine_inventory_map',
    'prescriptions',
    'prescription_items'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;
