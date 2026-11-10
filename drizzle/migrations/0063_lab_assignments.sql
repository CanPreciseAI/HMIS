-- Doctors assign the laboratory tests a patient needs to a technician at their
-- facility. The order keeps the doctor who requested it and the technician who
-- will process it, while every requested test gets its own accession number.

alter table public.lab_orders
  add column if not exists assigned_to uuid references public.employees(id) on delete set null,
  add column if not exists assigned_at timestamptz;

create index if not exists lab_orders_assigned_to_idx
  on public.lab_orders (assigned_to);

create or replace function public.is_lab_technician_employee(_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employees employee
    left join public.designations designation
      on designation.id = employee.designation_id
    where employee.id = _employee_id
      and (
        lower(replace(coalesce(designation.code, ''), ' ', '_')) in (
          'lab_technician',
          'lab_tech',
          'laboratory_technician'
        )
        or lower(coalesce(designation.name, '')) like '%lab%technician%'
        or exists (
          select 1
          from public.user_role_assignments assignment
          join public.roles role_row on role_row.id = assignment.role_id
          where assignment.user_id = employee.user_id
            and assignment.valid_from <= now()
            and (assignment.valid_until is null or assignment.valid_until > now())
            and lower(replace(role_row.name, ' ', '_')) in (
              'lab_technician',
              'lab_tech'
            )
        )
      )
  );
$$;

revoke all on function public.is_lab_technician_employee(uuid) from public, anon;
grant execute on function public.is_lab_technician_employee(uuid) to authenticated;

-- Active laboratory technicians in one facility, for the doctor's assignment
-- picker and the lab queue.
create or replace function public.facility_lab_technicians(_facility_id uuid)
returns table (employee_id uuid, full_name text)
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
    coalesce(profile.full_name, 'Lab technician')
  from public.employees employee
  join public.departments department
    on department.id = employee.department_id
  left join public.staff_profiles profile
    on profile.id = employee.user_id
  where department.facility_id = _facility_id
    and employee.employment_status = 'active'
    and public.is_lab_technician_employee(employee.id)
  order by 2;
end;
$$;

revoke all on function public.facility_lab_technicians(uuid) from public, anon;
grant execute on function public.facility_lab_technicians(uuid) to authenticated;

-- A doctor creates one lab order for a patient and assigns the selected tests
-- to a lab technician. The function opens an encounter when the doctor does not
-- already have one open, matching the prescription workflow.
create or replace function public.create_lab_assignment(
  _patient_id uuid,
  _test_ids uuid[],
  _assigned_to uuid,
  _priority text default 'routine'
)
returns table (lab_order_id uuid, item_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor_id uuid;
  v_tenant_id uuid;
  v_facility_id uuid;
  v_encounter_id uuid;
  v_order_id uuid;
  v_test_id uuid;
  v_test_ids uuid[];
  v_priority text := coalesce(_priority, 'routine');
  v_accession text;
  v_item_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in to assign lab tests'
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
    raise exception 'Only doctors can assign lab tests'
      using errcode = '42501';
  end if;

  if v_facility_id is null then
    raise exception 'Your department is not linked to a facility yet'
      using errcode = '22023';
  end if;

  if _test_ids is null or coalesce(array_length(_test_ids, 1), 0) = 0 then
    raise exception 'Choose at least one lab test'
      using errcode = '22023';
  end if;

  select array_agg(distinct requested.test_id)
    into v_test_ids
  from unnest(_test_ids) as requested(test_id);

  if v_test_ids is null or array_length(v_test_ids, 1) is null then
    raise exception 'Choose at least one lab test'
      using errcode = '22023';
  end if;

  if v_priority not in ('routine', 'urgent', 'stat') then
    raise exception 'Choose a valid lab priority'
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

  if _assigned_to is null or not exists (
    select 1
    from public.employees technician
    join public.departments department
      on department.id = technician.department_id
    where technician.id = _assigned_to
      and technician.tenant_id = v_tenant_id
      and department.facility_id = v_facility_id
      and technician.employment_status = 'active'
      and public.is_lab_technician_employee(technician.id)
  ) then
    raise exception 'Choose an active lab technician in this facility'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_test_ids) as requested(test_id)
    where not exists (
      select 1
      from public.lab_test_catalog catalog
      where catalog.id = requested.test_id
        and catalog.tenant_id = v_tenant_id
        and catalog.status = 'active'
    )
  ) then
    raise exception 'One or more selected lab tests are not active in this hospital'
      using errcode = '22023';
  end if;

  select encounter.id
    into v_encounter_id
  from public.encounters encounter
  where encounter.patient_id = _patient_id
    and encounter.tenant_id = v_tenant_id
    and encounter.facility_id = v_facility_id
    and encounter.provider_id = v_doctor_id
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
      v_doctor_id
    )
    returning id into v_encounter_id;
  end if;

  insert into public.lab_orders (
    tenant_id,
    encounter_id,
    patient_id,
    ordered_by,
    status,
    assigned_to,
    assigned_at
  ) values (
    v_tenant_id,
    v_encounter_id,
    _patient_id,
    v_doctor_id,
    'placed',
    _assigned_to,
    now()
  )
  returning id into v_order_id;

  foreach v_test_id in array v_test_ids
  loop
    v_accession :=
      'LAB-' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    insert into public.lab_order_items (
      lab_order_id,
      test_id,
      accession_number,
      priority,
      status
    ) values (
      v_order_id,
      v_test_id,
      v_accession,
      v_priority,
      'ordered'
    );

    v_item_count := v_item_count + 1;
  end loop;

  return query select v_order_id, v_item_count;
end;
$$;

revoke all on function public.create_lab_assignment(
  uuid, uuid[], uuid, text
) from public, anon;
grant execute on function public.create_lab_assignment(
  uuid, uuid[], uuid, text
) to authenticated;
