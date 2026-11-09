-- The ward board now records who is looking after each admitted patient: the
-- bed they are in, the nurse in charge of them, and the doctor handling them.
-- Ward staff (hospital administrators and nurses) admit patients and update the
-- care team; everyone else in the facility can read the board.

alter table public.bed_assignments
  add column if not exists nurse_id uuid references public.employees(id) on delete set null,
  add column if not exists provider_id uuid references public.employees(id) on delete set null;

create index if not exists bed_assignments_nurse_idx
  on public.bed_assignments (nurse_id);
create index if not exists bed_assignments_provider_idx
  on public.bed_assignments (provider_id);

-- Doctors and nurses available to be assigned in this facility.
create or replace function public.facility_ward_staff(_facility_id uuid)
returns table (employee_id uuid, full_name text, role_label text)
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
    employee.id,
    coalesce(profile.full_name, 'Staff'),
    case when public.is_doctor_employee(employee.id) then 'doctor' else 'nurse' end
  from public.employees employee
  join public.departments department
    on department.id = employee.department_id
  left join public.designations designation
    on designation.id = employee.designation_id
  left join public.staff_profiles profile
    on profile.id = employee.user_id
  where department.facility_id = _facility_id
    and employee.employment_status = 'active'
    and (
      public.is_doctor_employee(employee.id)
      or lower(coalesce(designation.name, '')) like '%nurse%'
      or lower(coalesce(designation.code, '')) in ('nurse', 'staff_nurse', 'head_nurse')
      or exists (
        select 1
        from public.user_role_assignments assignment
        join public.roles role_row on role_row.id = assignment.role_id
        where assignment.user_id = employee.user_id
          and assignment.valid_from <= now()
          and (assignment.valid_until is null or assignment.valid_until > now())
          and lower(replace(role_row.name, ' ', '_')) = 'nurse'
      )
    )
  order by 3, 2;
end;
$$;

revoke all on function public.facility_ward_staff(uuid) from public, anon;
grant execute on function public.facility_ward_staff(uuid) to authenticated;

-- One row per admitted patient with their bed and care team.
create or replace function public.facility_ward_patients(_facility_id uuid)
returns table (
  assignment_id uuid,
  admission_id uuid,
  patient_id uuid,
  patient_name text,
  patient_number text,
  ward text,
  bed_code text,
  bed_id uuid,
  nurse_id uuid,
  provider_id uuid,
  nurse_name text,
  doctor_name text,
  admitted_at timestamptz,
  start_at timestamptz,
  admission_status text
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
    assignment.id,
    admission.id,
    patient.id,
    patient.name,
    patient.patient_number,
    bed.ward,
    bed.bed_code,
    bed.id,
    assignment.nurse_id,
    assignment.provider_id,
    nurse_profile.full_name,
    doctor_profile.full_name,
    admission.admitted_at,
    assignment.start_at,
    admission.status
  from public.bed_assignments assignment
  join public.admissions admission
    on admission.id = assignment.admission_id
  join public.beds bed on bed.id = assignment.bed_id
  join public.patients patient on patient.id = admission.patient_id
  left join public.employees nurse on nurse.id = assignment.nurse_id
  left join public.staff_profiles nurse_profile
    on nurse_profile.id = nurse.user_id
  left join public.employees doctor on doctor.id = assignment.provider_id
  left join public.staff_profiles doctor_profile
    on doctor_profile.id = doctor.user_id
  where bed.facility_id = _facility_id
    and assignment.status = 'active'
    and admission.status = 'active'
  order by bed.ward, bed.bed_code;
end;
$$;

revoke all on function public.facility_ward_patients(uuid) from public, anon;
grant execute on function public.facility_ward_patients(uuid) to authenticated;

-- Admit a patient into a specific bed, naming the nurse in charge and the
-- doctor handling them. The bed must be free and the patient not already in a
-- ward; the encounter is reused, or opened for the doctor when there is none.
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

  if not (
    public.is_tenant_admin(v_bed.tenant_id)
    or public.is_tenant_nurse(v_bed.tenant_id)
  ) then
    raise exception 'Only ward staff can admit a patient'
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

-- Move an admitted patient to another bed and/or change the nurse in charge
-- and the doctor handling them.
create or replace function public.update_ward_assignment(
  _assignment_id uuid,
  _bed_id uuid,
  _nurse_id uuid,
  _provider_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment record;
  v_bed record;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update a ward assignment'
      using errcode = '42501';
  end if;

  select assignment.id, assignment.bed_id, admission.tenant_id, admission.facility_id
    into v_assignment
  from public.bed_assignments assignment
  join public.admissions admission on admission.id = assignment.admission_id
  where assignment.id = _assignment_id
    and assignment.status = 'active';

  if not found then
    raise exception 'That ward assignment is no longer active'
      using errcode = '22023';
  end if;

  if not (
    public.is_tenant_admin(v_assignment.tenant_id)
    or public.is_tenant_nurse(v_assignment.tenant_id)
  ) then
    raise exception 'Only ward staff can update a ward assignment'
      using errcode = '42501';
  end if;

  if _provider_id is null or not public.is_doctor_employee(_provider_id) then
    raise exception 'Choose the doctor handling the patient'
      using errcode = '22023';
  end if;

  if _nurse_id is not null and not exists (
    select 1
    from public.employees employee
    where employee.id = _nurse_id
      and employee.tenant_id = v_assignment.tenant_id
      and employee.employment_status = 'active'
  ) then
    raise exception 'Choose an active nurse in this hospital'
      using errcode = '22023';
  end if;

  select bed.id, bed.facility_id, bed.status
    into v_bed
  from public.beds bed
  where bed.id = _bed_id;

  if not found or v_bed.facility_id <> v_assignment.facility_id then
    raise exception 'Choose a bed in this facility'
      using errcode = '22023';
  end if;

  if v_bed.status <> 'active' then
    raise exception 'That bed is not active'
      using errcode = '22023';
  end if;

  if _bed_id <> v_assignment.bed_id and exists (
    select 1
    from public.bed_assignments assignment
    where assignment.bed_id = _bed_id
      and assignment.status = 'active'
  ) then
    raise exception 'That bed is already occupied'
      using errcode = '22023';
  end if;

  update public.bed_assignments
  set bed_id = _bed_id,
      nurse_id = _nurse_id,
      provider_id = _provider_id,
      updated_at = now()
  where id = _assignment_id;

  if _bed_id <> v_assignment.bed_id then
    update public.beds
    set is_occupied = false,
        updated_at = now()
    where id = v_assignment.bed_id
      and not exists (
        select 1
        from public.bed_assignments assignment
        where assignment.bed_id = v_assignment.bed_id
          and assignment.status = 'active'
      );

    update public.beds
    set is_occupied = true,
        updated_at = now()
    where id = _bed_id;
  end if;
end;
$$;

revoke all on function public.update_ward_assignment(uuid, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.update_ward_assignment(uuid, uuid, uuid, uuid)
  to authenticated;
