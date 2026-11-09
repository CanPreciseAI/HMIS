-- Billing entries now have a second pair of eyes: whoever provides a service
-- publishes it, and an administrator or receptionist marks it complete. Until
-- then the entry stays open, on every dashboard that reads the same ledger.

alter table public.service_charges
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid
    references public.users(id) on delete set null;

create index if not exists service_charges_open_idx
  on public.service_charges (facility_id, created_at desc)
  where confirmed_at is null;

create or replace function public.confirm_service_charge(
  _charge_id uuid,
  _confirmed boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge record;
begin
  if auth.uid() is null then
    raise exception 'Sign in to review a service entry'
      using errcode = '42501';
  end if;

  select charge.id, charge.tenant_id, charge.status
    into v_charge
  from public.service_charges charge
  where charge.id = _charge_id
  for update;

  if not found then
    raise exception 'That entry no longer exists'
      using errcode = '22023';
  end if;

  if v_charge.status <> 'recorded' then
    raise exception 'Only an entry that is still open can be marked'
      using errcode = '22023';
  end if;

  if not (
    public.is_tenant_admin(v_charge.tenant_id)
    or public.is_tenant_receptionist(v_charge.tenant_id)
  ) then
    raise exception 'Only an administrator or receptionist can mark services complete'
      using errcode = '42501';
  end if;

  update public.service_charges
  set confirmed_at = case when coalesce(_confirmed, true) then now() else null end,
      confirmed_by = case when coalesce(_confirmed, true) then auth.uid() else null end,
      updated_at = now()
  where id = _charge_id;
end;
$$;

revoke all on function public.confirm_service_charge(uuid, boolean)
  from public, anon;
grant execute on function public.confirm_service_charge(uuid, boolean)
  to authenticated;

-- The shared ledger now names medicine lines, the person who added them and
-- whether an administrator or receptionist has signed the entry off. The
-- return shape gains columns, so the old function has to be replaced outright.
drop function if exists public.facility_service_charges(uuid);

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
  confirmed_at timestamptz,
  confirmed_by uuid,
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
    charge.confirmed_at,
    charge.confirmed_by,
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
