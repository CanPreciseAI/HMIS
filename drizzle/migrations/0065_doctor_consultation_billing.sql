-- Doctors now check a patient into a consultation before closing the visit.
-- Checking creates one standard consultation charge in the shared staff ledger
-- so reception can add it to the patient's invoice. The encounter link makes
-- the automatic charge idempotent, even if the doctor reopens and checks the
-- same visit again.

alter table public.encounters
  drop constraint if exists encounters_status_check;
alter table public.encounters
  add constraint encounters_status_check
  check (status in ('open', 'checked', 'closed'));

alter table public.service_charges
  add column if not exists encounter_id uuid
    references public.encounters(id) on delete set null;

create index if not exists service_charges_encounter_idx
  on public.service_charges (encounter_id);

create unique index if not exists service_charges_encounter_charge_once_idx
  on public.service_charges (encounter_id, charge_id)
  where encounter_id is not null
    and charge_id is not null
    and status <> 'void';

create or replace function public.update_my_encounter_status(
  _encounter_id uuid,
  _status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor_id uuid;
  v_tenant_id uuid;
  v_facility_id uuid;
  v_patient_id uuid;
  v_status text := lower(coalesce(_status, ''));
  v_consultation_id uuid;
  v_consultation_rate numeric(19,4) := 500;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update the patient status'
      using errcode = '42501';
  end if;

  select employee.id, employee.tenant_id, department.facility_id
    into v_doctor_id, v_tenant_id, v_facility_id
  from public.employees employee
  left join public.departments department
    on department.id = employee.department_id
  where employee.user_id = auth.uid()
    and employee.employment_status = 'active'
  limit 1;

  if v_doctor_id is null then
    raise exception 'Your staff record is not linked to an active hospital'
      using errcode = '42501';
  end if;

  if not public.is_doctor_employee(v_doctor_id) then
    raise exception 'Only doctors can update a patient status'
      using errcode = '42501';
  end if;

  if v_facility_id is null then
    raise exception 'Your department is not linked to a facility yet'
      using errcode = '22023';
  end if;

  if v_status not in ('open', 'checked', 'closed') then
    raise exception 'Choose Open, Checked or Closed'
      using errcode = '22023';
  end if;

  select encounter.patient_id
    into v_patient_id
  from public.encounters encounter
  where encounter.id = _encounter_id
    and encounter.tenant_id = v_tenant_id
    and encounter.facility_id = v_facility_id
    and encounter.provider_id = v_doctor_id
  for update;

  if not found then
    raise exception 'That patient encounter is not yours to update'
      using errcode = '42501';
  end if;

  update public.encounters encounter
     set status = v_status,
         ended_at = case
           when v_status = 'closed' then coalesce(encounter.ended_at, now())
           else null
         end
   where encounter.id = _encounter_id;

  if v_status = 'checked' then
    -- A standard consultation catalogue item ensures the price list and the
    -- automatic charge agree, even in a hospital that has not priced one yet.
    insert into public.charge_catalog (
      tenant_id,
      charge_code,
      name,
      category,
      base_rate,
      effective_from,
      status
    ) values (
      v_tenant_id,
      'CONS-01',
      'OPD consultation',
      'consultation',
      v_consultation_rate,
      current_date,
      'active'
    )
    on conflict (tenant_id, charge_code) do update
      set name = 'OPD consultation',
          category = 'consultation',
          base_rate = v_consultation_rate,
          effective_from = current_date,
          effective_to = null,
          status = 'active',
          updated_at = now()
    returning id into v_consultation_id;

    if not exists (
      select 1
      from public.service_charges charge
      where charge.encounter_id = _encounter_id
        and charge.charge_id = v_consultation_id
        and charge.status <> 'void'
    ) then
      insert into public.service_charges (
        tenant_id,
        facility_id,
        patient_id,
        charge_id,
        encounter_id,
        recorded_by,
        recorded_by_user,
        recorded_role,
        quantity,
        unit_price,
        amount,
        note,
        confirmed_at,
        confirmed_by
      ) values (
        v_tenant_id,
        v_facility_id,
        v_patient_id,
        v_consultation_id,
        _encounter_id,
        v_doctor_id,
        auth.uid(),
        'doctor',
        1,
        v_consultation_rate,
        v_consultation_rate,
        'Consultation fee',
        now(),
        auth.uid()
      );
    end if;
  end if;

  return _encounter_id;
end;
$$;

revoke all on function public.update_my_encounter_status(uuid, text)
  from public, anon;
grant execute on function public.update_my_encounter_status(uuid, text)
  to authenticated;
