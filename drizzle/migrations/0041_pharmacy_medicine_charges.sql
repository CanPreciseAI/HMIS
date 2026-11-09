-- Pharmacy counter sales: the pharmacist adds the medicines a patient is
-- buying to the same staff charge ledger, priced at the counter, so reception
-- can invoice them together with the other services.

alter table public.service_charges
  alter column charge_id drop not null,
  add column if not exists medicine_id uuid
    references public.medicine_catalog(id) on delete set null;

alter table public.invoice_items
  alter column charge_id drop not null;

alter table public.service_charges
  drop constraint if exists service_charges_item_check;
alter table public.service_charges
  add constraint service_charges_item_check
  check (charge_id is not null or medicine_id is not null);

create index if not exists service_charges_medicine_idx
  on public.service_charges (medicine_id);

create or replace function public.record_medicine_charge(
  _patient_id uuid,
  _medicine_id uuid,
  _quantity numeric,
  _unit_price numeric,
  _note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee record;
  v_quantity numeric(19,4) := coalesce(_quantity, 1);
  v_price numeric(19,4) := coalesce(_unit_price, 0);
  v_medicine record;
begin
  if auth.uid() is null then
    raise exception 'Sign in to add medicines to a bill'
      using errcode = '42501';
  end if;

  if public.is_patient_account() then
    raise exception 'Only pharmacy staff can add medicines to a bill'
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

  if not (
    exists (
      select 1
      from public.user_roles
      where user_id = auth.uid()
        and role::text = 'pharmacist'
    )
    or exists (
      select 1
      from public.user_role_assignments assignment
      join public.roles role_row on role_row.id = assignment.role_id
      where assignment.user_id = auth.uid()
        and assignment.tenant_id = v_employee.tenant_id
        and assignment.valid_from <= now()
        and (assignment.valid_until is null or assignment.valid_until > now())
        and lower(replace(role_row.name, ' ', '_')) in ('pharmacist', 'pharmacy')
    )
  ) then
    raise exception 'Only a pharmacist can add medicines to a patient bill'
      using errcode = '42501';
  end if;

  if v_quantity <= 0 then
    raise exception 'Enter a quantity greater than zero'
      using errcode = '22023';
  end if;

  if v_price < 0 then
    raise exception 'Enter a price of zero or more'
      using errcode = '22023';
  end if;

  select medicine.id, medicine.name, medicine.strength
    into v_medicine
  from public.medicine_catalog medicine
  where medicine.id = _medicine_id
    and medicine.tenant_id = v_employee.tenant_id
    and medicine.status = 'active';

  if not found then
    raise exception 'That medicine is not active in your hospital'
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
    medicine_id,
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
    null,
    _medicine_id,
    v_employee.id,
    auth.uid(),
    'pharmacist',
    v_quantity,
    v_price,
    v_quantity * v_price,
    nullif(trim(coalesce(_note, '')), '')
  )
  returning id into v_medicine.id;

  return v_medicine.id;
end;
$$;

revoke all on function public.record_medicine_charge(uuid, uuid, numeric, numeric, text)
  from public, anon;
grant execute on function public.record_medicine_charge(uuid, uuid, numeric, numeric, text)
  to authenticated;

-- The ledger now names medicine lines as well as catalog services.
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
    coalesce(
      catalog.name,
      medicine.name || ' ' || medicine.strength,
      'Service'
    ),
    coalesce(catalog.charge_code, medicine.medicine_code, '—'),
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
  left join public.charge_catalog catalog on catalog.id = charge.charge_id
  left join public.medicine_catalog medicine on medicine.id = charge.medicine_id
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

-- Invoice line items now accept medicine lines, which have no price-list row.
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
    coalesce(
      catalog.name,
      medicine.name || ' ' || medicine.strength,
      'Service'
    ),
    charge.quantity,
    charge.unit_price,
    0,
    0,
    charge.quantity * charge.unit_price
  from public.service_charges charge
  left join public.charge_catalog catalog on catalog.id = charge.charge_id
  left join public.medicine_catalog medicine on medicine.id = charge.medicine_id
  where charge.id = any(_charge_ids)
    and charge.patient_id = _patient_id
    and charge.status = 'recorded';

  update public.service_charges charge
  set status = 'invoiced',
      invoice_id = v_invoice,
      updated_at = now()
  where charge.id = any(_charge_ids)
    and charge.patient_id = _patient_id
    and charge.status = 'recorded';

  return query select v_invoice, v_number, v_net;
end;
$$;

revoke all on function public.create_invoice_from_charges(uuid, uuid[], numeric, numeric)
  from public, anon;
grant execute on function public.create_invoice_from_charges(uuid, uuid[], numeric, numeric)
  to authenticated;
