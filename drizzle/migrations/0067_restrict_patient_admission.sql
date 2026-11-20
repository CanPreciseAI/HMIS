-- Admission is a front-desk and ward-nursing task. Doctors and other clinical
-- staff can still manage the care team and discharge from the ward board via
-- can_manage_ward, but only receptionists, nurses and administrators may
-- create a new admission.
--
-- This intentionally does not change can_manage_ward: doctors keep the ward
-- assignment editing they already had.

create or replace function public.can_admit_patient(_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select _tenant_id is not null
    and auth.uid() is not null
    and (
      public.is_tenant_admin(_tenant_id)
      or public.is_tenant_nurse(_tenant_id)
      or public.is_tenant_receptionist(_tenant_id)
    );
$$;

revoke all on function public.can_admit_patient(uuid) from public, anon;
grant execute on function public.can_admit_patient(uuid) to authenticated;
