-- Reception books a patient with a chosen doctor. The appointment carries what
-- the visit is for and where it happens, so the patient portal and the doctor
-- workspace can show the same details. Doctors expose how loaded their day is
-- through a read-only function that reception shows as a chart.

alter table public.appointments
  add column if not exists reason text,
  add column if not exists location text,
  add column if not exists duration_minutes integer not null default 20
    constraint appointments_duration_check
    check (duration_minutes between 5 and 240),
  add column if not exists scheduled_by uuid references public.users(id) on delete set null;

create index if not exists appointments_facility_scheduled_idx
  on public.appointments (facility_id, scheduled_at);
create index if not exists appointments_provider_scheduled_idx
  on public.appointments (provider_id, scheduled_at);

-- A provider counts as a doctor when their role assignment says so, or when
-- their designation is a doctor role. Used to keep booking limited to doctors.
create or replace function public.is_doctor_employee(_employee_id uuid)
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
        lower(coalesce(designation.code, '')) in ('doctor', 'consultant', 'specialist')
        or lower(coalesce(designation.name, '')) like '%doctor%'
        or exists (
          select 1
          from public.user_role_assignments assignment
          join public.roles role_row on role_row.id = assignment.role_id
          where assignment.user_id = employee.user_id
            and assignment.valid_from <= now()
            and (assignment.valid_until is null or assignment.valid_until > now())
            and lower(replace(role_row.name, ' ', '_')) = 'doctor'
        )
      )
  );
$$;

revoke all on function public.is_doctor_employee(uuid) from public, anon;
grant execute on function public.is_doctor_employee(uuid) to authenticated;

-- Reception's day view: every appointment in the facility with the patient and
-- doctor names, so a single read fills the schedule table.
create or replace function public.facility_day_schedule(
  _facility_id uuid,
  _from timestamptz,
  _to timestamptz
)
returns table (
  appointment_id uuid,
  patient_id uuid,
  patient_name text,
  patient_number text,
  provider_id uuid,
  doctor_name text,
  scheduled_at timestamptz,
  duration_minutes integer,
  status text,
  reason text,
  location text,
  doctor_response text
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
    or not (public.is_platform_admin() or public.is_tenant_member(v_tenant)) then
    raise exception 'Only hospital staff can view the appointment schedule'
      using errcode = '42501';
  end if;

  return query
  select
    appointment.id,
    appointment.patient_id,
    patient.name,
    patient.patient_number,
    appointment.provider_id,
    coalesce(profile.full_name, 'Doctor'),
    appointment.scheduled_at,
    appointment.duration_minutes,
    appointment.status,
    appointment.reason,
    appointment.location,
    appointment.doctor_response
  from public.appointments appointment
  join public.patients patient on patient.id = appointment.patient_id
  left join public.employees employee on employee.id = appointment.provider_id
  left join public.staff_profiles profile on profile.id = employee.user_id
  where appointment.facility_id = _facility_id
    and appointment.scheduled_at >= _from
    and appointment.scheduled_at < _to
  order by appointment.scheduled_at, patient.name;
end;
$$;

revoke all on function public.facility_day_schedule(uuid, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.facility_day_schedule(uuid, timestamptz, timestamptz)
  to authenticated;

-- One row per doctor for the chosen day: how many appointments and how many
-- minutes are already committed. Reception turns this into the load chart.
create or replace function public.facility_doctor_load(
  _facility_id uuid,
  _from timestamptz,
  _to timestamptz
)
returns table (
  provider_id uuid,
  doctor_name text,
  department_name text,
  designation_name text,
  availability text,
  appointments integer,
  booked_minutes integer,
  first_slot timestamptz,
  last_slot timestamptz,
  completed integer
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
    or not (public.is_platform_admin() or public.is_tenant_member(v_tenant)) then
    raise exception 'Only hospital staff can view the doctor load chart'
      using errcode = '42501';
  end if;

  return query
  select
    employee.id,
    coalesce(profile.full_name, 'Doctor'),
    department.name,
    designation.name,
    employee.availability,
    count(appointment.id)::integer,
    coalesce(sum(appointment.duration_minutes), 0)::integer,
    min(appointment.scheduled_at),
    max(appointment.scheduled_at),
    count(appointment.id) filter (where appointment.status = 'completed')::integer
  from public.employees employee
  join public.departments department
    on department.id = employee.department_id
   and department.facility_id = _facility_id
  left join public.staff_profiles profile on profile.id = employee.user_id
  left join public.designations designation
    on designation.id = employee.designation_id
  left join public.appointments appointment
    on appointment.provider_id = employee.id
   and appointment.scheduled_at >= _from
   and appointment.scheduled_at < _to
   and appointment.status in ('scheduled', 'checked_in', 'completed')
  where employee.tenant_id = v_tenant
    and employee.employment_status = 'active'
    and public.is_doctor_employee(employee.id)
  group by employee.id, profile.full_name, department.name, designation.name,
    employee.availability
  order by coalesce(sum(appointment.duration_minutes), 0),
    coalesce(profile.full_name, 'Doctor');
end;
$$;

revoke all on function public.facility_doctor_load(uuid, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.facility_doctor_load(uuid, timestamptz, timestamptz)
  to authenticated;

-- Reception (or a hospital administrator) books the visit. The doctor cannot
-- be double-booked: overlapping appointments for the same provider are refused.
create or replace function public.schedule_appointment(
  _patient_id uuid,
  _provider_id uuid,
  _scheduled_at timestamptz,
  _reason text,
  _location text,
  _duration_minutes integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee record;
  v_appointment uuid;
  v_duration integer := coalesce(_duration_minutes, 20);
begin
  if auth.uid() is null then
    raise exception 'Sign in to schedule appointments'
      using errcode = '42501';
  end if;

  select employee.tenant_id, department.facility_id
    into v_employee
  from public.employees employee
  left join public.departments department on department.id = employee.department_id
  where employee.id = _provider_id
    and employee.employment_status = 'active';

  if not found then
    raise exception 'That doctor is not active in this hospital'
      using errcode = '22023';
  end if;

  if not (
    public.is_platform_admin()
    or public.is_tenant_admin(v_employee.tenant_id)
    or public.is_tenant_receptionist(v_employee.tenant_id)
  ) then
    raise exception 'Only reception or hospital administrators can schedule appointments'
      using errcode = '42501';
  end if;

  if not public.is_doctor_employee(_provider_id) then
    raise exception 'Choose a doctor for the appointment'
      using errcode = '22023';
  end if;

  if v_employee.facility_id is null then
    raise exception 'That doctor is not assigned to a facility'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.patients patient
    where patient.id = _patient_id
      and patient.tenant_id = v_employee.tenant_id
      and patient.status = 'active'
  ) then
    raise exception 'That patient is not active in this hospital'
      using errcode = '22023';
  end if;

  if _scheduled_at is null or _scheduled_at < now() - interval '1 hour' then
    raise exception 'Choose a time that has not already passed'
      using errcode = '22023';
  end if;

  if _scheduled_at > now() + interval '180 days' then
    raise exception 'Appointments can be booked up to six months ahead'
      using errcode = '22023';
  end if;

  if v_duration < 5 or v_duration > 240 then
    raise exception 'Choose an appointment length between 5 and 240 minutes'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.appointments appointment
    where appointment.provider_id = _provider_id
      and appointment.status in ('scheduled', 'checked_in')
      and tstzrange(
            appointment.scheduled_at,
            appointment.scheduled_at + make_interval(mins => appointment.duration_minutes),
            '[)'
          ) && tstzrange(
            _scheduled_at,
            _scheduled_at + make_interval(mins => v_duration),
            '[)'
          )
  ) then
    raise exception 'That doctor already has an appointment in this time slot'
      using errcode = '23P01';
  end if;

  insert into public.appointments (
    tenant_id,
    facility_id,
    patient_id,
    provider_id,
    scheduled_at,
    status,
    reason,
    location,
    duration_minutes,
    scheduled_by
  )
  values (
    v_employee.tenant_id,
    v_employee.facility_id,
    _patient_id,
    _provider_id,
    _scheduled_at,
    'scheduled',
    nullif(trim(coalesce(_reason, '')), ''),
    nullif(trim(coalesce(_location, '')), ''),
    v_duration,
    auth.uid()
  )
  returning id into v_appointment;

  return v_appointment;
end;
$$;

revoke all on function public.schedule_appointment(uuid, uuid, timestamptz, text, text, integer)
  from public, anon;
grant execute on function public.schedule_appointment(uuid, uuid, timestamptz, text, text, integer)
  to authenticated;

-- The patient portal reads only the appointments linked to the signed-in
-- patient, with the doctor and place included.
create or replace function public.patient_appointments()
returns table (
  appointment_id uuid,
  scheduled_at timestamptz,
  duration_minutes integer,
  status text,
  reason text,
  location text,
  doctor_name text,
  department_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to view your appointments'
      using errcode = '42501';
  end if;

  return query
  select
    appointment.id,
    appointment.scheduled_at,
    appointment.duration_minutes,
    appointment.status,
    appointment.reason,
    appointment.location,
    coalesce(profile.full_name, 'Care team'),
    department.name
  from public.appointments appointment
  join public.patient_portal_access access
    on access.patient_id = appointment.patient_id
   and access.user_id = auth.uid()
   and access.status in ('verified', 'active')
  left join public.employees employee on employee.id = appointment.provider_id
  left join public.staff_profiles profile on profile.id = employee.user_id
  left join public.departments department on department.id = employee.department_id
  order by appointment.scheduled_at desc
  limit 25;
end;
$$;

revoke all on function public.patient_appointments() from public, anon;
grant execute on function public.patient_appointments() to authenticated;
