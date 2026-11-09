-- A doctor writes the medicines a patient should take. The prescription hangs
-- off the doctor's open encounter with that patient (opened on the spot when
-- there is none), and every line lands on the pharmacy dashboard. Only doctors
-- can write; pharmacists read the whole facility through one function.

create or replace function public.create_prescription(
  _patient_id uuid,
  _items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_employee_id uuid;
  v_tenant_id uuid;
  v_facility_id uuid;
  v_encounter_id uuid;
  v_prescription_id uuid;
  v_item jsonb;
  v_medicine_id uuid;
  v_quantity numeric;
begin
  if v_user_id is null then
    raise exception 'Sign in to write a prescription'
      using errcode = '28000';
  end if;

  select employee.id, employee.tenant_id, department.facility_id
    into v_employee_id, v_tenant_id, v_facility_id
  from public.employees employee
  left join public.departments department
    on department.id = employee.department_id
  where employee.user_id = v_user_id
    and employee.employment_status = 'active'
  limit 1;

  if v_employee_id is null then
    raise exception 'Only hospital staff can write prescriptions'
      using errcode = '42501';
  end if;

  if not public.is_doctor_employee(v_employee_id) then
    raise exception 'Only doctors can write prescriptions'
      using errcode = '42501';
  end if;

  if v_facility_id is null then
    raise exception 'Your department is not linked to a facility yet'
      using errcode = '22023';
  end if;

  if _items is null
    or jsonb_typeof(_items) <> 'array'
    or jsonb_array_length(_items) = 0
  then
    raise exception 'Add at least one medicine to the prescription'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.patients patient
    where patient.id = _patient_id
      and patient.tenant_id = v_tenant_id
      and patient.status = 'active'
  ) then
    raise exception 'That patient is not active in this hospital'
      using errcode = '22023';
  end if;

  select encounter.id
    into v_encounter_id
  from public.encounters encounter
  where encounter.patient_id = _patient_id
    and encounter.tenant_id = v_tenant_id
    and encounter.facility_id = v_facility_id
    and encounter.provider_id = v_employee_id
    and encounter.status = 'open'
  order by encounter.started_at desc
  limit 1;

  if v_encounter_id is null then
    insert into public.encounters (
      tenant_id,
      facility_id,
      patient_id,
      encounter_type,
      provider_id
    ) values (
      v_tenant_id,
      v_facility_id,
      _patient_id,
      'outpatient',
      v_employee_id
    )
    returning id into v_encounter_id;
  end if;

  insert into public.prescriptions (encounter_id, prescriber_id)
  values (v_encounter_id, v_employee_id)
  returning id into v_prescription_id;

  for v_item in select * from jsonb_array_elements(_items)
  loop
    v_medicine_id := nullif(trim(v_item ->> 'medicine_id'), '')::uuid;
    v_quantity := coalesce(
      nullif(trim(v_item ->> 'quantity'), '')::numeric,
      0
    );

    if v_medicine_id is null then
      raise exception 'Choose a medicine for every prescription line'
        using errcode = '22023';
    end if;

    if v_quantity <= 0 then
      raise exception 'Every prescribed quantity must be greater than zero'
        using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.medicine_catalog medicine
      where medicine.id = v_medicine_id
        and medicine.tenant_id = v_tenant_id
        and medicine.status = 'active'
    ) then
      raise exception 'One of the medicines is not available in this hospital'
        using errcode = '22023';
    end if;

    insert into public.prescription_items (
      tenant_id,
      prescription_id,
      medicine_id,
      dose,
      route,
      frequency,
      duration,
      quantity_prescribed
    ) values (
      v_tenant_id,
      v_prescription_id,
      v_medicine_id,
      coalesce(nullif(trim(v_item ->> 'dose'), ''), 'As directed'),
      coalesce(nullif(trim(v_item ->> 'route'), ''), 'Oral'),
      coalesce(nullif(trim(v_item ->> 'frequency'), ''), 'As directed'),
      coalesce(nullif(trim(v_item ->> 'duration'), ''), 'As directed'),
      v_quantity
    );
  end loop;

  return v_prescription_id;
end;
$$;

revoke all on function public.create_prescription(uuid, jsonb)
  from public, anon;
grant execute on function public.create_prescription(uuid, jsonb)
  to authenticated;

-- One row per prescription line with patient, prescriber and medicine, so the
-- pharmacy queue and the doctor's request both read from the same place.
create or replace function public.facility_prescription_lines(_facility_id uuid)
returns table (
  item_id uuid,
  prescription_id uuid,
  encounter_id uuid,
  patient_id uuid,
  patient_name text,
  patient_number text,
  prescriber_name text,
  medicine_id uuid,
  medicine_name text,
  dose text,
  route text,
  frequency text,
  duration text,
  quantity_prescribed numeric,
  quantity_dispensed numeric,
  remaining numeric,
  prescription_status text,
  prescribed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.employees employee
    join public.departments department
      on department.id = employee.department_id
    where employee.user_id = auth.uid()
      and employee.employment_status = 'active'
      and department.facility_id = _facility_id
  ) then
    raise exception 'You do not have access to this facility'
      using errcode = '42501';
  end if;

  return query
  select
    item.id,
    prescription.id,
    encounter.id,
    patient.id,
    patient.name,
    patient.patient_number,
    coalesce(profile.full_name, 'Doctor'),
    medicine.id,
    medicine.name || ' ' || medicine.strength,
    item.dose,
    item.route,
    item.frequency,
    item.duration,
    item.quantity_prescribed,
    item.quantity_dispensed,
    greatest(item.quantity_prescribed - item.quantity_dispensed, 0),
    prescription.status,
    prescription.created_at
  from public.prescription_items item
  join public.prescriptions prescription
    on prescription.id = item.prescription_id
  join public.encounters encounter
    on encounter.id = prescription.encounter_id
  join public.patients patient
    on patient.id = encounter.patient_id
  join public.medicine_catalog medicine
    on medicine.id = item.medicine_id
  left join public.employees prescriber
    on prescriber.id = prescription.prescriber_id
  left join public.users profile
    on profile.id = prescriber.user_id
  where encounter.facility_id = _facility_id
    and item.tenant_id = encounter.tenant_id
  order by prescription.created_at desc, item.created_at asc;
end;
$$;

revoke all on function public.facility_prescription_lines(uuid)
  from public, anon;
grant execute on function public.facility_prescription_lines(uuid)
  to authenticated;
