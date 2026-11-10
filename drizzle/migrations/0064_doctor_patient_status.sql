-- Doctors close or reopen their own patient encounters from the patient list.
-- The write stays narrow: the signed-in user must be the active doctor on the
-- encounter in their own tenant and facility, and only status/ended_at change.

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
  v_status text := lower(coalesce(_status, ''));
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

  if v_status not in ('open', 'closed') then
    raise exception 'Choose Open or Closed'
      using errcode = '22023';
  end if;

  update public.encounters encounter
     set status = v_status,
         ended_at = case
           when v_status = 'closed' then coalesce(encounter.ended_at, now())
           else null
         end
   where encounter.id = _encounter_id
     and encounter.tenant_id = v_tenant_id
     and encounter.facility_id = v_facility_id
     and encounter.provider_id = v_doctor_id;

  if not found then
    raise exception 'That patient encounter is not yours to update'
      using errcode = '42501';
  end if;

  return _encounter_id;
end;
$$;

revoke all on function public.update_my_encounter_status(uuid, text)
  from public, anon;
grant execute on function public.update_my_encounter_status(uuid, text)
  to authenticated;
