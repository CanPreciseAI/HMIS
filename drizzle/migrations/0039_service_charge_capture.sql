-- Every staff member records the billable services they perform for a patient.
-- The ledger is staff-only. Reception then turns a patient's recorded charges
-- into one issued invoice, and payments update the invoice status everywhere
-- the invoice is displayed (staff billing lists and the patient portal).

create table if not exists public.service_charges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete cascade,
  charge_id uuid not null references public.charge_catalog(id) on delete restrict,
  recorded_by uuid references public.employees(id) on delete set null,
  recorded_by_user uuid references public.users(id) on delete set null,
  recorded_role text not null default 'staff',
  quantity numeric(19,4) not null default 1 check (quantity > 0),
  unit_price numeric(19,4) not null check (unit_price >= 0),
  amount numeric(19,4) not null check (amount >= 0),
  note text,
  status text not null default 'recorded'
    check (status in ('recorded', 'invoiced', 'void')),
  invoice_id uuid references public.invoices(id) on delete set null,
  voided_by uuid references public.users(id) on delete set null,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_charges_tenant_idx
  on public.service_charges (tenant_id);
create index if not exists service_charges_facility_idx
  on public.service_charges (facility_id, created_at desc);
create index if not exists service_charges_patient_idx
  on public.service_charges (patient_id, status);
create index if not exists service_charges_invoice_idx
  on public.service_charges (invoice_id);

alter table public.service_charges enable row level security;
revoke all on public.service_charges from anon;
grant select on public.service_charges to authenticated;

-- Patients never read the staff ledger; invoices are their only view.
create policy "Hospital staff read service charges"
  on public.service_charges for select to authenticated
  using (
    not public.is_patient_account()
    and (public.is_platform_admin() or public.is_tenant_member(tenant_id))
  );

-- Any active staff member records what they did for the patient. The price is
-- snapshotted so later catalog edits do not rewrite the history.
create or replace function public.record_service_charge(
  _patient_id uuid,
  _charge_id uuid,
  _quantity numeric default 1,
  _note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee record;
  v_rate numeric(19,4);
  v_quantity numeric(19,4) := coalesce(_quantity, 1);
  v_charge uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to record a service'
      using errcode = '42501';
  end if;

  if public.is_patient_account() then
    raise exception 'Only hospital staff can record a service'
      using errcode = '42501';
  end if;

  select employee.id, employee.tenant_id, department.facility_id
    into v_employee
  from public.employees employee
  left join public.departments department on department.id = employee.department_id
  where employee.user_id = auth.uid()
    and employee.employment_status = 'active'
  limit 1;

  if not found or v_employee.facility_id is null then
    raise exception 'Your staff record is not linked to an active facility'
      using errcode = '42501';
  end if;

  if v_quantity <= 0 then
    raise exception 'Enter a quantity greater than zero'
      using errcode = '22023';
  end if;

  select charge.base_rate into v_rate
  from public.charge_catalog charge
  where charge.id = _charge_id
    and charge.tenant_id = v_employee.tenant_id
    and charge.status = 'active'
    and charge.effective_from <= current_date
    and (charge.effective_to is null or charge.effective_to > current_date);

  if not found then
    raise exception 'That service is not on your hospital price list'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.patients patient
    where patient.id = _patient_id
      and patient.tenant_id = v_employee.tenant_id
      and patient.status = 'active'
  ) then
    raise exception 'Choose an active patient in your hospital'
      using errcode = '22023';
  end if;

  insert into public.service_charges (
    tenant_id,
    facility_id,
    patient_id,
    charge_id,
    recorded_by,
    recorded_by_user,
    recorded_role,
    quantity,
    unit_price,
    amount,
    note
  )
  values (
    v_employee.tenant_id,
    v_employee.facility_id,
    _patient_id,
    _charge_id,
    v_employee.id,
    auth.uid(),
    coalesce(
      (
        select role::text
        from public.user_roles
        where user_id = auth.uid()
        order by role
        limit 1
      ),
      (
        select lower(replace(role_row.name, ' ', '_'))
        from public.user_role_assignments assignment
        join public.roles role_row on role_row.id = assignment.role_id
        where assignment.user_id = auth.uid()
          and assignment.valid_from <= now()
          and (assignment.valid_until is null or assignment.valid_until > now())
        order by role_row.name
        limit 1
      ),
      'staff'
    ),
    v_quantity,
    v_rate,
    v_quantity * v_rate,
    nullif(trim(coalesce(_note, '')), '')
  )
  returning id into v_charge;

  return v_charge;
end;
$$;

revoke all on function public.record_service_charge(uuid, uuid, numeric, text)
  from public, anon;
grant execute on function public.record_service_charge(uuid, uuid, numeric, text)
  to authenticated;

-- A charge can be taken back until it is billed: the record's author or a
-- hospital administrator may void it.
create or replace function public.void_service_charge(_charge_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge record;
begin
  if auth.uid() is null then
    raise exception 'Sign in to remove a charge'
      using errcode = '42501';
  end if;

  select * into v_charge
  from public.service_charges
  where id = _charge_id
  for update;

  if not found then
    raise exception 'That charge no longer exists'
      using errcode = '22023';
  end if;

  if v_charge.status <> 'recorded' then
    raise exception 'Only a charge that has not been invoiced can be removed'
      using errcode = '22023';
  end if;

  if not (
    public.is_tenant_admin(v_charge.tenant_id)
    or v_charge.recorded_by_user = auth.uid()
  ) then
    raise exception 'Only the staff member who recorded this charge can remove it'
      using errcode = '42501';
  end if;

  update public.service_charges
  set status = 'void',
      voided_by = auth.uid(),
      voided_at = now(),
      updated_at = now()
  where id = _charge_id;
end;
$$;

revoke all on function public.void_service_charge(uuid) from public, anon;
grant execute on function public.void_service_charge(uuid) to authenticated;

-- The staff ledger: who recorded what, for which patient, and where the money
-- stands. Voided charges are excluded.
create or replace function public.facility_service_charges(_facility_id uuid)
returns table (
  charge_id uuid,
  patient_id uuid,
  patient_name text,
  patient_number text,
  service_name text,
  service_code text,
  quantity numeric,
  unit_price numeric,
  amount numeric,
  note text,
  status text,
  recorded_by_name text,
  recorded_by_role text,
  recorded_by_user uuid,
  invoice_id uuid,
  invoice_number text,
  invoice_status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  select facility.tenant_id into v_tenant
  from public.facilities facility
  where facility.id = _facility_id;

  if v_tenant is null then
    raise exception 'That facility could not be found'
      using errcode = '22023';
  end if;

  if auth.uid() is null
    or public.is_patient_account()
    or not (public.is_platform_admin() or public.is_tenant_member(v_tenant)) then
    raise exception 'Only hospital staff can read the service ledger'
      using errcode = '42501';
  end if;

  return query
  select
    charge.id,
    charge.patient_id,
    patient.name,
    patient.patient_number,
    catalog.name,
    catalog.charge_code,
    charge.quantity,
    charge.unit_price,
    charge.amount,
    charge.note,
    charge.status,
    coalesce(profile.full_name, 'Staff'),
    charge.recorded_role,
    charge.recorded_by_user,
    charge.invoice_id,
    invoice.invoice_number,
    invoice.status,
    charge.created_at
  from public.service_charges charge
  join public.patients patient on patient.id = charge.patient_id
  join public.charge_catalog catalog on catalog.id = charge.charge_id
  left join public.employees employee on employee.id = charge.recorded_by
  left join public.staff_profiles profile on profile.id = employee.user_id
  left join public.invoices invoice on invoice.id = charge.invoice_id
  where charge.facility_id = _facility_id
    and charge.status <> 'void'
  order by charge.created_at desc
  limit 300;
end;
$$;

revoke all on function public.facility_service_charges(uuid) from public, anon;
grant execute on function public.facility_service_charges(uuid) to authenticated;

-- Reception (or a hospital administrator) closes the loop: the selected
-- recorded charges become one invoice, which is issued to the patient straight
-- away so it appears in their portal.
create or replace function public.create_invoice_from_charges(
  _patient_id uuid,
  _charge_ids uuid[],
  _discount_amount numeric default 0,
  _tax_amount numeric default 0
)
returns table (id uuid, invoice_number text, net_amount numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient record;
  v_charge record;
  v_facility uuid;
  v_gross numeric(19,4) := 0;
  v_discount numeric(19,4) := coalesce(_discount_amount, 0);
  v_tax numeric(19,4) := coalesce(_tax_amount, 0);
  v_net numeric(19,4);
  v_invoice uuid;
  v_number text;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in to issue an invoice'
      using errcode = '42501';
  end if;

  select patient.id, patient.tenant_id
    into v_patient
  from public.patients patient
  where patient.id = _patient_id
    and patient.status = 'active';

  if not found then
    raise exception 'That patient is not active in this hospital'
      using errcode = '22023';
  end if;

  if not (
    public.is_platform_admin()
    or public.is_tenant_admin(v_patient.tenant_id)
    or public.is_tenant_receptionist(v_patient.tenant_id)
  ) then
    raise exception 'Only reception or hospital administrators can issue invoices'
      using errcode = '42501';
  end if;

  if _charge_ids is null
    or array_length(_charge_ids, 1) is null
    or array_length(_charge_ids, 1) = 0 then
    raise exception 'Choose at least one service to bill'
      using errcode = '22023';
  end if;

  if v_discount < 0 or v_tax < 0 then
    raise exception 'Discount and tax must be zero or greater'
      using errcode = '22023';
  end if;

  select charge.facility_id into v_facility
  from public.service_charges charge
  where charge.id = any(_charge_ids)
    and charge.patient_id = _patient_id
    and charge.tenant_id = v_patient.tenant_id
    and charge.status = 'recorded'
  limit 1;

  if v_facility is null then
    raise exception 'Those services are no longer available to bill'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.facilities facility
    where facility.id = v_facility
      and facility.tenant_id = v_patient.tenant_id
      and facility.status = 'active'
  ) then
    raise exception 'The facility is not active'
      using errcode = '22023';
  end if;

  for v_charge in
    select charge.id, charge.quantity, charge.unit_price, charge.facility_id
    from public.service_charges charge
    where charge.id = any(_charge_ids)
      and charge.patient_id = _patient_id
      and charge.tenant_id = v_patient.tenant_id
      and charge.status = 'recorded'
    for update
  loop
    if v_charge.facility_id <> v_facility then
      raise exception 'Bill services from one facility at a time'
        using errcode = '22023';
    end if;
    v_gross := v_gross + (v_charge.quantity * v_charge.unit_price);
    v_count := v_count + 1;
  end loop;

  if v_count <> array_length(_charge_ids, 1) then
    raise exception 'Some services were already invoiced or removed'
      using errcode = '22023';
  end if;

  if v_discount > v_gross then
    raise exception 'Discount cannot exceed the invoice subtotal'
      using errcode = '22023';
  end if;

  v_net := v_gross - v_discount + v_tax;

  if v_net <= 0 then
    raise exception 'The invoice total must be more than zero'
      using errcode = '22023';
  end if;

  v_number :=
    'INV-' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.invoices (
    tenant_id,
    facility_id,
    patient_id,
    invoice_number,
    gross_amount,
    discount_amount,
    tax_amount,
    net_amount,
    status,
    issued_at
  )
  values (
    v_patient.tenant_id,
    v_facility,
    _patient_id,
    v_number,
    v_gross,
    v_discount,
    v_tax,
    v_net,
    'issued',
    now()
  )
  returning invoices.id into v_invoice;

  insert into public.invoice_items (
    tenant_id,
    invoice_id,
    charge_id,
    source_type,
    source_id,
    description,
    quantity,
    unit_price,
    discount_amount,
    tax_amount,
    line_total
  )
  select
    charge.tenant_id,
    v_invoice,
    charge.charge_id,
    'service_charge',
    charge.id,
    catalog.name,
    charge.quantity,
    charge.unit_price,
    0,
    0,
    charge.quantity * charge.unit_price
  from public.service_charges charge
  join public.charge_catalog catalog on catalog.id = charge.charge_id
  where charge.id = any(_charge_ids)
    and charge.patient_id = _patient_id
    and charge.status = 'recorded';

  update public.service_charges
  set status = 'invoiced',
      invoice_id = v_invoice,
      updated_at = now()
  where id = any(_charge_ids)
    and patient_id = _patient_id
    and status = 'recorded';

  return query select v_invoice, v_number, v_net;
end;
$$;

revoke all on function public.create_invoice_from_charges(uuid, uuid[], numeric, numeric)
  from public, anon;
grant execute on function public.create_invoice_from_charges(uuid, uuid[], numeric, numeric)
  to authenticated;

-- Outstanding balances for the facility's issued invoices.
create or replace function public.facility_invoice_balances(_facility_id uuid)
returns table (
  invoice_id uuid,
  invoice_number text,
  patient_id uuid,
  patient_name text,
  net_amount numeric,
  paid_amount numeric,
  outstanding numeric,
  status text,
  issued_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  select facility.tenant_id into v_tenant
  from public.facilities facility
  where facility.id = _facility_id;

  if v_tenant is null then
    raise exception 'That facility could not be found'
      using errcode = '22023';
  end if;

  if auth.uid() is null
    or public.is_patient_account()
    or not (public.is_platform_admin() or public.is_tenant_member(v_tenant)) then
    raise exception 'Only hospital staff can read invoice balances'
      using errcode = '42501';
  end if;

  return query
  select
    invoice.id,
    invoice.invoice_number,
    invoice.patient_id,
    patient.name,
    invoice.net_amount,
    coalesce(paid.amount, 0),
    greatest(invoice.net_amount - coalesce(paid.amount, 0), 0),
    invoice.status,
    invoice.issued_at
  from public.invoices invoice
  join public.patients patient on patient.id = invoice.patient_id
  left join lateral (
    select sum(allocation.allocated_amount)::numeric(19,4) as amount
    from public.payment_allocations allocation
    where allocation.invoice_id = invoice.id
  ) paid on true
  where invoice.facility_id = _facility_id
    and invoice.status in ('issued', 'partially_paid', 'paid')
  order by invoice.issued_at desc nulls last
  limit 100;
end;
$$;

revoke all on function public.facility_invoice_balances(uuid) from public, anon;
grant execute on function public.facility_invoice_balances(uuid) to authenticated;

-- Payment taken at the desk. Allocations drive the invoice status, so the
-- patient portal and every staff billing list show the same state.
create or replace function public.record_invoice_payment(
  _invoice_id uuid,
  _amount numeric,
  _method text
)
returns table (status text, paid_amount numeric, outstanding numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice record;
  v_paid numeric(19,4);
  v_outstanding numeric(19,4);
  v_method text := lower(trim(coalesce(_method, '')));
  v_payment uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to record a payment'
      using errcode = '42501';
  end if;

  select * into v_invoice
  from public.invoices
  where id = _invoice_id
  for update;

  if not found then
    raise exception 'That invoice could not be found'
      using errcode = '22023';
  end if;

  if not (
    public.is_platform_admin()
    or public.is_tenant_admin(v_invoice.tenant_id)
    or public.is_tenant_receptionist(v_invoice.tenant_id)
  ) then
    raise exception 'Only reception or hospital administrators can record payments'
      using errcode = '42501';
  end if;

  if v_invoice.status not in ('issued', 'partially_paid') then
    raise exception 'Only an issued invoice can take a payment'
      using errcode = '22023';
  end if;

  select coalesce(sum(allocation.allocated_amount), 0)
    into v_paid
  from public.payment_allocations allocation
  where allocation.invoice_id = _invoice_id;

  v_outstanding := v_invoice.net_amount - v_paid;

  if _amount is null or _amount <= 0 then
    raise exception 'Enter a payment amount greater than zero'
      using errcode = '22023';
  end if;

  if _amount > v_outstanding + 0.0001 then
    raise exception 'Payment cannot be more than the outstanding balance'
      using errcode = '22023';
  end if;

  if v_method = '' then
    v_method := 'cash';
  end if;

  insert into public.payments (
    tenant_id,
    payment_reference,
    patient_id,
    method,
    amount,
    currency,
    status,
    received_at
  )
  values (
    v_invoice.tenant_id,
    'PAY-' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    v_invoice.patient_id,
    v_method,
    _amount,
    'INR',
    'allocated',
    now()
  )
  returning id into v_payment;

  insert into public.payment_allocations (payment_id, invoice_id, allocated_amount)
  values (v_payment, _invoice_id, _amount);

  v_paid := v_paid + _amount;
  v_outstanding := v_invoice.net_amount - v_paid;
  v_status := case when v_outstanding <= 0.0001 then 'paid' else 'partially_paid' end;

  update public.invoices
  set status = v_status,
      updated_at = now()
  where id = _invoice_id;

  return query select v_status, v_paid, greatest(v_outstanding, 0);
end;
$$;

revoke all on function public.record_invoice_payment(uuid, numeric, text)
  from public, anon;
grant execute on function public.record_invoice_payment(uuid, numeric, text)
  to authenticated;
