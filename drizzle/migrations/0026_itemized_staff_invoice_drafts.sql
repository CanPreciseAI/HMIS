-- Replace flat-total draft creation with catalog-backed invoice line items.
drop function if exists public.create_staff_draft_invoice(
  uuid, uuid, uuid, numeric, numeric, numeric
);

create function public.create_staff_draft_invoice(
  _tenant_id uuid,
  _facility_id uuid,
  _patient_id uuid,
  _line_items jsonb,
  _discount_amount numeric default 0,
  _tax_amount numeric default 0
)
returns table (id uuid, invoice_number text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_number text;
  v_invoice_id uuid;
  v_created_at timestamptz;
  v_gross_amount numeric(19,4) := 0;
  v_discount_amount numeric(19,4) := coalesce(_discount_amount, 0);
  v_tax_amount numeric(19,4) := coalesce(_tax_amount, 0);
  v_line jsonb;
  v_charge_id uuid;
  v_quantity numeric(19,4);
  v_unit_price numeric(19,4);
  v_charge_name text;
begin
  if auth.uid() is null
    or public.is_patient_account()
    or not coalesce(public.is_tenant_member(_tenant_id), false) then
    raise exception 'Only hospital staff can initiate invoices';
  end if;

  if _line_items is null
    or jsonb_typeof(_line_items) <> 'array'
    or jsonb_array_length(_line_items) = 0 then
    raise exception 'Add at least one invoice service';
  end if;

  if v_discount_amount < 0 or v_tax_amount < 0 then
    raise exception 'Discount and tax must be zero or greater';
  end if;

  if not exists (
    select 1
    from public.facilities facility
    where facility.id = _facility_id
      and facility.tenant_id = _tenant_id
      and facility.status = 'active'
  ) then
    raise exception 'Choose an active facility in your hospital';
  end if;

  if not exists (
    select 1
    from public.patients patient
    where patient.id = _patient_id
      and patient.tenant_id = _tenant_id
      and patient.status = 'active'
  ) then
    raise exception 'Choose an active patient in your hospital';
  end if;

  for v_line in select value from jsonb_array_elements(_line_items)
  loop
    if jsonb_typeof(v_line) <> 'object'
      or coalesce(v_line->>'charge_id', '') = ''
      or coalesce(v_line->>'quantity', '') = '' then
      raise exception 'Each invoice service needs a charge and quantity';
    end if;

    begin
      v_charge_id := (v_line->>'charge_id')::uuid;
      v_quantity := (v_line->>'quantity')::numeric;
    exception when invalid_text_representation then
      raise exception 'Invoice service details are invalid';
    end;

    if v_quantity <= 0 then
      raise exception 'Invoice service quantities must be greater than zero';
    end if;

    select charge.name, charge.base_rate
    into v_charge_name, v_unit_price
    from public.charge_catalog charge
    where charge.id = v_charge_id
      and charge.tenant_id = _tenant_id
      and charge.status = 'active'
      and charge.effective_from <= current_date
      and (charge.effective_to is null or charge.effective_to > current_date)
    for share;

    if not found then
      raise exception 'An invoice service is not active for this hospital';
    end if;

    v_gross_amount := v_gross_amount + (v_quantity * v_unit_price);

  end loop;

  if v_discount_amount > v_gross_amount then
    raise exception 'Discount cannot exceed invoice subtotal';
  end if;

  v_invoice_number :=
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
    status
  )
  values (
    _tenant_id,
    _facility_id,
    _patient_id,
    v_invoice_number,
    v_gross_amount,
    v_discount_amount,
    v_tax_amount,
    v_gross_amount - v_discount_amount + v_tax_amount,
    'draft'
  )
  returning invoices.id, invoices.created_at
  into v_invoice_id, v_created_at;

  for v_line in select value from jsonb_array_elements(_line_items)
  loop
    v_charge_id := (v_line->>'charge_id')::uuid;
    v_quantity := (v_line->>'quantity')::numeric;

    select charge.name, charge.base_rate
    into v_charge_name, v_unit_price
    from public.charge_catalog charge
    where charge.id = v_charge_id
      and charge.tenant_id = _tenant_id
      and charge.status = 'active'
      and charge.effective_from <= current_date
      and (charge.effective_to is null or charge.effective_to > current_date)
    for share;

    insert into public.invoice_items (
      tenant_id,
      invoice_id,
      charge_id,
      source_type,
      description,
      quantity,
      unit_price,
      discount_amount,
      tax_amount,
      line_total
    )
    values (
      _tenant_id,
      v_invoice_id,
      v_charge_id,
      'manual',
      v_charge_name,
      v_quantity,
      v_unit_price,
      0,
      0,
      v_quantity * v_unit_price
    );
  end loop;

  return query select v_invoice_id, v_invoice_number, v_created_at;
end;
$$;

revoke all on function public.create_staff_draft_invoice(
  uuid, uuid, uuid, jsonb, numeric, numeric
) from public, anon;
grant execute on function public.create_staff_draft_invoice(
  uuid, uuid, uuid, jsonb, numeric, numeric
) to authenticated;
