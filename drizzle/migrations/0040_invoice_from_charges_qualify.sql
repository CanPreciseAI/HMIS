-- create_invoice_from_charges returns an `id` column, which shadowed the
-- unqualified id in its final update. Qualify the table alias so issuing an
-- invoice from recorded charges works.

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
