-- Reception admits patients into the hospital: the patient gets a bed, the
-- doctor handling them and, optionally, the nurse in charge. Ward staff keep
-- managing the care team afterwards; reception is only allowed to create the
-- admission and its bed assignment. Every other dashboard reads the same
-- admissions and bed_assignments rows, so the patient appears immediately on
-- the ward board, patient flow, nursing counts and the doctor's patient history.

create or replace function public.can_admit_patient(_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_ward(_tenant_id)
    or public.is_tenant_receptionist(_tenant_id);
$$;

revoke all on function public.can_admit_patient(uuid) from public, anon;
grant execute on function public.can_admit_patient(uuid) to authenticated;

create or replace function public.admit_patient_to_ward(
  _patient_id uuid,
  _bed_id uuid,
  _nurse_id uuid,
  _provider_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bed record;
  v_encounter_id uuid;
  v_admission_id uuid;
  v_assignment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to admit a patient'
      using errcode = '42501';
  end if;

  select bed.id, bed.tenant_id, bed.facility_id, bed.status
    into v_bed
  from public.beds bed
  where bed.id = _bed_id;

  if not found then
    raise exception 'That bed could not be found'
      using errcode = '22023';
  end if;

  if v_bed.status <> 'active' then
    raise exception 'That bed is not active'
      using errcode = '22023';
  end if;

  if not public.can_admit_patient(v_bed.tenant_id) then
    raise exception 'Only ward staff or reception can admit a patient'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.patients patient
    where patient.id = _patient_id
      and patient.tenant_id = v_bed.tenant_id
      and patient.status = 'active'
  ) then
    raise exception 'Choose an active patient in this hospital'
      using errcode = '22023';
  end if;

  if _provider_id is null or not public.is_doctor_employee(_provider_id) then
    raise exception 'Choose the doctor handling the patient'
      using errcode = '22023';
  end if;

  if _nurse_id is not null and not exists (
    select 1
    from public.employees employee
    where employee.id = _nurse_id
      and employee.tenant_id = v_bed.tenant_id
      and employee.employment_status = 'active'
  ) then
    raise exception 'Choose an active nurse in this hospital'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.bed_assignments assignment
    where assignment.bed_id = _bed_id
      and assignment.status = 'active'
  ) then
    raise exception 'That bed is already occupied'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.admissions admission
    join public.bed_assignments assignment
      on assignment.admission_id = admission.id
    where admission.patient_id = _patient_id
      and admission.status = 'active'
      and assignment.status = 'active'
  ) then
    raise exception 'That patient is already in a ward'
      using errcode = '22023';
  end if;

  select encounter.id
    into v_encounter_id
  from public.encounters encounter
  where encounter.patient_id = _patient_id
    and encounter.tenant_id = v_bed.tenant_id
    and encounter.facility_id = v_bed.facility_id
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
      v_bed.tenant_id,
      v_bed.facility_id,
      _patient_id,
      'inpatient',
      _provider_id
    )
    returning id into v_encounter_id;
  end if;

  insert into public.admissions (
    tenant_id,
    facility_id,
    patient_id,
    encounter_id
  ) values (
    v_bed.tenant_id,
    v_bed.facility_id,
    _patient_id,
    v_encounter_id
  )
  returning id into v_admission_id;

  insert into public.bed_assignments (
    admission_id,
    bed_id,
    nurse_id,
    provider_id
  ) values (
    v_admission_id,
    _bed_id,
    _nurse_id,
    _provider_id
  )
  returning id into v_assignment_id;

  update public.beds
  set is_occupied = true,
      updated_at = now()
  where id = _bed_id;

  return v_assignment_id;
end;
$$;

revoke all on function public.admit_patient_to_ward(uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.admit_patient_to_ward(uuid, uuid, uuid, uuid)
  to authenticated;
