-- Ward staff discharge a patient from the ward board. Nurses and doctors could
-- not update `admissions` directly (only tenant admins had a write policy), and
-- the client also closed the bed assignment a second time after the discharge
-- trigger had already ended it. This function does the whole change once, with
-- an explicit access check, and lets the existing trigger free the bed.

create or replace function public.discharge_ward_patient(_admission_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to discharge a patient'
      using errcode = '42501';
  end if;

  select admission.tenant_id, admission.status
    into v_tenant, v_status
  from public.admissions admission
  where admission.id = _admission_id;

  if v_tenant is null then
    raise exception 'That admission could not be found'
      using errcode = '22023';
  end if;

  if not (
    public.is_tenant_admin(v_tenant)
    or public.is_tenant_nurse(v_tenant)
    or exists (
      select 1
      from public.employees employee
      where employee.user_id = auth.uid()
        and employee.tenant_id = v_tenant
        and employee.employment_status = 'active'
        and public.is_doctor_employee(employee.id)
    )
  ) then
    raise exception 'You do not have access to discharge this patient'
      using errcode = '42501';
  end if;

  if v_status = 'discharged' then
    return;
  end if;

  update public.admissions
  set status = 'discharged',
      discharged_at = now(),
      updated_at = now()
  where id = _admission_id;
end;
$$;

revoke all on function public.discharge_ward_patient(uuid) from public, anon;
grant execute on function public.discharge_ward_patient(uuid) to authenticated;
