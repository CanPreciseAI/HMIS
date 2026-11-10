-- The pharmacy queue already shows the prescriber's name. Include the rest of
-- the doctor context that helps the pharmacist verify a prescription: their
-- department, specialization and employee code. The prescription itself still
-- flows straight from create_prescription into this queue.

drop function if exists public.facility_prescription_lines(uuid);

create function public.facility_prescription_lines(_facility_id uuid)
returns table (
  item_id uuid,
  prescription_id uuid,
  encounter_id uuid,
  patient_id uuid,
  patient_name text,
  patient_number text,
  prescriber_id uuid,
  prescriber_name text,
  prescriber_department text,
  prescriber_specialization text,
  prescriber_code text,
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
  prescribed_at timestamptz,
  stock_available numeric,
  stock_linked boolean,
  last_dispensed_quantity numeric,
  last_dispensed_at timestamptz
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
    prescriber.id,
    coalesce(profile.full_name, 'Doctor'),
    coalesce(department.name, profile.department, 'Department'),
    profile.specialization,
    prescriber.employee_code,
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
    prescription.created_at,
    coalesce(stock.stock_available, 0),
    coalesce(stock.stock_linked, false),
    latest_dispense.quantity,
    latest_dispense.dispensed_at
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
  left join public.departments department
    on department.id = prescriber.department_id
  left join lateral (
    select
      count(distinct mapping.id) > 0 as stock_linked,
      coalesce(
        sum(
          case
            when balance.id is not null
              and location.status = 'active'
              and location.facility_id = _facility_id
              and batch.facility_id = _facility_id
              and batch.item_id = mapping.item_id
              and batch.expiry_date >= current_date
            then greatest(
              balance.quantity_on_hand - balance.quantity_reserved,
              0
            ) * mapping.conversion_factor
            else 0
          end
        ),
        0
      ) as stock_available
    from public.medicine_inventory_map mapping
    join public.inventory_items inventory_item
      on inventory_item.id = mapping.item_id
     and inventory_item.tenant_id = encounter.tenant_id
     and inventory_item.status = 'active'
    left join public.inventory_balances balance
      on balance.item_id = mapping.item_id
    left join public.inventory_locations location
      on location.id = balance.location_id
     and location.tenant_id = encounter.tenant_id
    left join public.stock_batches batch
      on batch.id = balance.batch_id
     and batch.item_id = mapping.item_id
     and batch.tenant_id = encounter.tenant_id
    where mapping.medicine_id = item.medicine_id
      and mapping.status = 'active'
  ) stock on true
  left join lateral (
    select dispense.quantity, dispense.dispensed_at
    from public.prescription_dispenses dispense
    where dispense.prescription_item_id = item.id
    order by dispense.dispensed_at desc, dispense.created_at desc
    limit 1
  ) latest_dispense on true
  where encounter.facility_id = _facility_id
    and item.tenant_id = encounter.tenant_id
  order by prescription.created_at desc, item.created_at asc;
end;
$$;

revoke all on function public.facility_prescription_lines(uuid)
  from public, anon;
grant execute on function public.facility_prescription_lines(uuid)
  to authenticated;
