-- Charges, invoices, payments, credit notes, refunds and insurance claims.
--
-- Part of the HMIS backend described by HMIS_Design_Detail_v2.
-- Tenancy follows the global conventions: tenant-owned rows carry
-- tenant_id, or inherit it through the parent chain named in the
-- policy. Rows are deactivated by status, never hard-deleted.

create table public.charge_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  charge_code text not null,
  name text not null,
  category text not null,
  base_rate numeric(19,4) not null check (base_rate >= 0),
  effective_from date not null default current_date,
  effective_to date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, charge_code),
  check (effective_to is null or effective_to > effective_from)
);
create index charge_catalog_tenant_id_idx on public.charge_catalog (tenant_id);

create table public.payers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  payer_type text not null check (payer_type in ('insurance', 'government', 'corporate', 'self_pay')),
  name text not null,
  payer_code text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, payer_code)
);
create index payers_tenant_id_idx on public.payers (tenant_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  patient_id uuid references public.patients(id) on delete restrict not null,
  encounter_id uuid references public.encounters(id) on delete set null,
  invoice_number text not null,
  gross_amount numeric(19,4) not null default 0 check (gross_amount >= 0),
  discount_amount numeric(19,4) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(19,4) not null default 0 check (tax_amount >= 0),
  net_amount numeric(19,4) not null default 0 check (net_amount >= 0),
  status text not null default 'draft' check (status in ('draft', 'issued', 'partially_paid', 'paid', 'cancelled')),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, invoice_number)
);
create index invoices_tenant_id_idx on public.invoices (tenant_id);
create index invoices_facility_id_idx on public.invoices (facility_id);
create index invoices_patient_id_idx on public.invoices (patient_id);
create index invoices_encounter_id_idx on public.invoices (encounter_id);

-- source_id points at the performed service instance (polymorphic REF).
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  invoice_id uuid references public.invoices(id) on delete cascade not null,
  charge_id uuid references public.charge_catalog(id) on delete restrict not null,
  source_type text not null,
  source_id uuid,
  description text,
  quantity numeric(19,4) not null check (quantity >= 0),
  unit_price numeric(19,4) not null check (unit_price >= 0),
  discount_amount numeric(19,4) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(19,4) not null default 0 check (tax_amount >= 0),
  line_total numeric(19,4) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index invoice_items_tenant_id_idx on public.invoice_items (tenant_id);
create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id);
create index invoice_items_charge_id_idx on public.invoice_items (charge_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  payment_reference text not null,
  patient_id uuid references public.patients(id) on delete restrict not null,
  payer_id uuid references public.payers(id) on delete set null,
  method text not null,
  amount numeric(19,4) not null check (amount >= 0),
  currency text not null default 'INR',
  status text not null default 'captured' check (status in ('captured', 'partially_allocated', 'allocated', 'partially_refunded', 'refunded')),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, payment_reference)
);
create index payments_tenant_id_idx on public.payments (tenant_id);
create index payments_patient_id_idx on public.payments (patient_id);
create index payments_payer_id_idx on public.payments (payer_id);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete cascade not null,
  invoice_id uuid references public.invoices(id) on delete restrict not null,
  allocated_amount numeric(19,4) not null check (allocated_amount >= 0),
  created_at timestamptz not null default now()
);
create index payment_allocations_payment_id_idx on public.payment_allocations (payment_id);
create index payment_allocations_invoice_id_idx on public.payment_allocations (invoice_id);

create table public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  invoice_id uuid references public.invoices(id) on delete restrict not null,
  credit_note_number text not null,
  amount numeric(19,4) not null check (amount >= 0),
  reason text,
  status text not null default 'draft' check (status in ('draft', 'issued', 'settled', 'reversed')),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, credit_note_number)
);
create index credit_notes_tenant_id_idx on public.credit_notes (tenant_id);
create index credit_notes_invoice_id_idx on public.credit_notes (invoice_id);

create table public.credit_note_items (
  id uuid primary key default gen_random_uuid(),
  credit_note_id uuid references public.credit_notes(id) on delete cascade not null,
  invoice_item_id uuid references public.invoice_items(id) on delete restrict not null,
  amount numeric(19,4) not null check (amount >= 0),
  created_at timestamptz not null default now()
);
create index credit_note_items_credit_note_id_idx on public.credit_note_items (credit_note_id);
create index credit_note_items_invoice_item_id_idx on public.credit_note_items (invoice_item_id);

-- No tenant_id column: tenancy is inherited from payments.
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete cascade not null,
  amount numeric(19,4) not null check (amount >= 0),
  reason text,
  approved_by uuid references public.users(id) on delete set null,
  status text not null default 'requested' check (status in ('requested', 'approved', 'paid', 'rejected')),
  reference_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_payment_id_idx on public.refunds (payment_id);
create index refunds_approved_by_idx on public.refunds (approved_by);

create table public.refund_allocations (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid references public.refunds(id) on delete cascade not null,
  invoice_id uuid references public.invoices(id) on delete restrict not null,
  credit_note_id uuid references public.credit_notes(id) on delete set null,
  allocated_amount numeric(19,4) not null check (allocated_amount >= 0),
  created_at timestamptz not null default now()
);
create index refund_allocations_refund_id_idx on public.refund_allocations (refund_id);
create index refund_allocations_invoice_id_idx on public.refund_allocations (invoice_id);
create index refund_allocations_credit_note_id_idx on public.refund_allocations (credit_note_id);

-- Tenant scope is inherited through invoices.
create table public.insurance_claims (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete restrict not null,
  invoice_id uuid references public.invoices(id) on delete restrict not null,
  payer_id uuid references public.payers(id) on delete restrict not null,
  claim_number text not null,
  claimed_amount numeric(19,4) not null check (claimed_amount >= 0),
  approved_amount numeric(19,4) not null default 0 check (approved_amount >= 0),
  status text not null default 'submitted' check (status in ('submitted', 'in_review', 'approved', 'rejected', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payer_id, claim_number)
);
create index insurance_claims_patient_id_idx on public.insurance_claims (patient_id);
create index insurance_claims_invoice_id_idx on public.insurance_claims (invoice_id);
create index insurance_claims_payer_id_idx on public.insurance_claims (payer_id);

create table public.service_charge_map (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid references public.charge_catalog(id) on delete cascade not null,
  service_type text not null,
  service_id uuid,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_charge_map_charge_id_idx on public.service_charge_map (charge_id);

-- ---------------------------------------------------------------------------
-- Grants, row level security and indexes
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
  'charge_catalog',
  'payers',
  'invoices',
  'invoice_items',
  'payments',
  'payment_allocations',
  'credit_notes',
  'credit_note_items',
  'refunds',
  'refund_allocations',
  'insurance_claims',
  'service_charge_map'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

create policy "Tenant members can read charge_catalog"
  on public.charge_catalog for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage charge_catalog"
  on public.charge_catalog for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read payers"
  on public.payers for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage payers"
  on public.payers for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read invoices"
  on public.invoices for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage invoices"
  on public.invoices for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read invoice_items"
  on public.invoice_items for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage invoice_items"
  on public.invoice_items for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read payments"
  on public.payments for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage payments"
  on public.payments for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read payment_allocations"
  on public.payment_allocations for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select p.tenant_id from public.payments p where p.id = payment_id)));

create policy "Tenant admins manage payment_allocations"
  on public.payment_allocations for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.payments p where p.id = payment_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.payments p where p.id = payment_id)));

create policy "Tenant members can read credit_notes"
  on public.credit_notes for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage credit_notes"
  on public.credit_notes for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read credit_note_items"
  on public.credit_note_items for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select c.tenant_id from public.credit_notes c where c.id = credit_note_id)));

create policy "Tenant admins manage credit_note_items"
  on public.credit_note_items for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select c.tenant_id from public.credit_notes c where c.id = credit_note_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select c.tenant_id from public.credit_notes c where c.id = credit_note_id)));

create policy "Tenant members can read refunds"
  on public.refunds for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select p.tenant_id from public.payments p where p.id = payment_id)));

create policy "Tenant admins manage refunds"
  on public.refunds for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.payments p where p.id = payment_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.payments p where p.id = payment_id)));

create policy "Tenant members can read refund_allocations"
  on public.refund_allocations for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.refunds r
     join public.payments p on p.id = r.payment_id
    where r.id = refund_id and public.is_tenant_member(p.tenant_id)));

create policy "Tenant admins manage refund_allocations"
  on public.refund_allocations for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.refunds r
     join public.payments p on p.id = r.payment_id
    where r.id = refund_id and public.is_tenant_admin(p.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.refunds r
     join public.payments p on p.id = r.payment_id
    where r.id = refund_id and public.is_tenant_admin(p.tenant_id)));

create policy "Tenant members can read insurance_claims"
  on public.insurance_claims for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select i.tenant_id from public.invoices i where i.id = invoice_id)));

create policy "Tenant admins manage insurance_claims"
  on public.insurance_claims for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select i.tenant_id from public.invoices i where i.id = invoice_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select i.tenant_id from public.invoices i where i.id = invoice_id)));

create policy "Tenant members can read service_charge_map"
  on public.service_charge_map for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select c.tenant_id from public.charge_catalog c where c.id = charge_id)));

create policy "Tenant admins manage service_charge_map"
  on public.service_charge_map for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select c.tenant_id from public.charge_catalog c where c.id = charge_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select c.tenant_id from public.charge_catalog c where c.id = charge_id)));

do $$
declare
  t text;
begin
  foreach t in array array[
    'charge_catalog',
    'payers',
    'invoices',
    'payments',
    'credit_notes',
    'refunds',
    'insurance_claims',
    'service_charge_map'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;
