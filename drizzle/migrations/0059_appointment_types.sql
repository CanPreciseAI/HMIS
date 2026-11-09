-- Reception schedules consultations, procedures and surgeries. The type is
-- stored on the appointment so the doctor's schedule can label it clearly.
alter table public.appointments
  add column if not exists appointment_type text not null default 'consultation'
    constraint appointments_type_check
    check (appointment_type in ('consultation', 'surgery', 'procedure'));

-- Rebuilt to expose the appointment type to reception's day view.
drop function if exists public.facility_day_schedule(uuid, timestamptz, timestamptz);
create function public.facility_day_schedule(
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
  appointment_type text,
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
    appointment.appointment_type,
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

-- Booking now carries the appointment type and refuses a doctor who is on
-- leave or off duty, in addition to the existing overlap check.
drop function if exists public.schedule_appointment(
  uuid, uuid, timestamptz, text, text, integer
);
create function public.schedule_appointment(
  _patient_id uuid,
  _provider_id uuid,
  _scheduled_at timestamptz,
  _reason text,
  _location text,
  _duration_minutes integer,
  _appointment_type text default 'consultation'
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
  v_type text := coalesce(nullif(trim(_appointment_type), ''), 'consultation');
begin
  if auth.uid() is null then
    raise exception 'Sign in to schedule appointments'
      using errcode = '42501';
  end if;

  if v_type not in ('consultation', 'surgery', 'procedure') then
    raise exception 'Choose a valid appointment type'
      using errcode = '22023';
  end if;

  select
    employee.tenant_id,
    department.facility_id,
    employee.availability
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

  if v_employee.availability in ('on_leave', 'off_duty') then
    raise exception 'That doctor is not available on this day'
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
    appointment_type,
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
    v_type,
    auth.uid()
  )
  returning id into v_appointment;

  return v_appointment;
end;
$$;

revoke all on function public.schedule_appointment(
  uuid, uuid, timestamptz, text, text, integer, text
) from public, anon;
grant execute on function public.schedule_appointment(
  uuid, uuid, timestamptz, text, text, integer, text
) to authenticated;