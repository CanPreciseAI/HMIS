-- Let authenticated hospital staff initiate invoices as drafts.
-- Draft creation is tenant-scoped and patients cannot invoke it.
create or replace function public.create_staff_draft_invoice(
  _tenant_id uuid,
  _facility_id uuid,
  _patient_id uuid,
  _gross_amount numeric,
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
begin
  if auth.uid() is null
    or public.is_patient_account()
    or not public.is_tenant_member(_tenant_id) then
    raise exception 'Only hospital staff can initiate invoices';
  end if;

  if _gross_amount is null
    or _discount_amount is null
    or _tax_amount is null
    or _gross_amount < 0
    or _discount_amount < 0
    or _tax_amount < 0
    or _discount_amount > _gross_amount then
    raise exception 'Enter valid invoice amounts';
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
    _gross_amount,
    _discount_amount,
    _tax_amount,
    _gross_amount - _discount_amount + _tax_amount,
    'draft'
  )
  returning invoices.id, invoices.created_at
  into v_invoice_id, v_created_at;

  return query select v_invoice_id, v_invoice_number, v_created_at;
end;
$$;

revoke all on function public.create_staff_draft_invoice(
  uuid, uuid, uuid, numeric, numeric, numeric
) from public, anon;
grant execute on function public.create_staff_draft_invoice(
  uuid, uuid, uuid, numeric, numeric, numeric
) to authenticated;
