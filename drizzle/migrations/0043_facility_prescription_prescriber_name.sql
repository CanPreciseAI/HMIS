-- The prescriber's name comes from the staff profile, not the auth user row.
-- Replaces the function from 0042, which joined the wrong table.

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
  left join public.staff_profiles profile
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
