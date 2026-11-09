-- Dispensing a prescription line now consumes real pharmacy stock. Stock is
-- allocated first-expiry-first from active locations in the prescription's
-- facility, converted through the medicine-to-inventory mapping, and recorded
-- as an issue movement plus dispense allocation. The whole dispense rolls back
-- when there is not enough stock.

create or replace function public.dispense_prescription_item(
  _item_id uuid,
  _quantity numeric default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee record;
  v_item record;
  v_prescription_status text;
  v_facility_id uuid;
  v_remaining numeric(19,4);
  v_quantity numeric(19,4);
  v_dispense uuid;
  v_movement uuid;
  v_needed numeric(19,4);
  v_stock record;
  v_available_medicine numeric(19,4);
  v_take_medicine numeric(19,4);
  v_take_inventory numeric(19,4);
begin
  if auth.uid() is null then
    raise exception 'Sign in to dispense a medicine'
      using errcode = '42501';
  end if;

  if not public.has_role(auth.uid(), 'pharmacist') then
    raise exception 'Only a pharmacist can dispense a prescription line'
      using errcode = '42501';
  end if;

  select employee.id, employee.tenant_id, department.facility_id
    into v_employee
  from public.employees employee
  join public.departments department on department.id = employee.department_id
  where employee.user_id = auth.uid()
    and employee.employment_status = 'active'
  limit 1;

  if not found or v_employee.facility_id is null then
    raise exception 'Your staff record is not linked to an active facility'
      using errcode = '42501';
  end if;

  select item.id, item.tenant_id, item.prescription_id,
         item.medicine_id, item.quantity_prescribed, item.quantity_dispensed
    into v_item
  from public.prescription_items item
  where item.id = _item_id
  for update;

  if not found then
    raise exception 'That prescription line could not be found'
      using errcode = '22023';
  end if;

  if v_item.tenant_id <> v_employee.tenant_id then
    raise exception 'That prescription line belongs to another hospital'
      using errcode = '42501';
  end if;

  select prescription.status, encounter.facility_id
    into v_prescription_status, v_facility_id
  from public.prescriptions prescription
  join public.encounters encounter on encounter.id = prescription.encounter_id
  where prescription.id = v_item.prescription_id;

  if not found then
    raise exception 'The encounter for this prescription could not be found'
      using errcode = '22023';
  end if;

  if v_prescription_status <> 'active' then
    raise exception 'This prescription is no longer active'
      using errcode = '22023';
  end if;

  if v_facility_id <> v_employee.facility_id then
    raise exception 'This prescription belongs to another facility'
      using errcode = '42501';
  end if;

  v_remaining := v_item.quantity_prescribed - v_item.quantity_dispensed;
  if v_remaining <= 0 then
    raise exception 'This line is already fully dispensed'
      using errcode = '22023';
  end if;

  v_quantity := coalesce(_quantity, v_remaining);
  if v_quantity <= 0 or v_quantity > v_remaining then
    raise exception 'Enter a quantity up to the remaining amount'
      using errcode = '22023';
  end if;

  insert into public.prescription_dispenses (
    prescription_item_id,
    pharmacist_id,
    quantity
  )
  values (_item_id, v_employee.id, v_quantity)
  returning id into v_dispense;

  v_needed := v_quantity;

  for v_stock in
    select
      balance.id as balance_id,
      balance.item_id,
      balance.batch_id,
      balance.location_id,
      mapping.conversion_factor,
      balance.quantity_on_hand - balance.quantity_reserved as available
    from public.medicine_inventory_map mapping
    join public.medicine_catalog medicine
      on medicine.id = mapping.medicine_id
     and medicine.tenant_id = v_item.tenant_id
    join public.inventory_items item
      on item.id = mapping.item_id
     and item.tenant_id = v_item.tenant_id
     and item.status = 'active'
    join public.inventory_balances balance
      on balance.item_id = item.id
    join public.inventory_locations location
      on location.id = balance.location_id
     and location.tenant_id = v_item.tenant_id
     and location.facility_id = v_facility_id
     and location.status = 'active'
    join public.stock_batches batch
      on batch.id = balance.batch_id
     and batch.item_id = item.id
     and batch.tenant_id = v_item.tenant_id
     and batch.facility_id = v_facility_id
     and batch.expiry_date >= current_date
    where mapping.medicine_id = v_item.medicine_id
      and mapping.status = 'active'
      and balance.quantity_on_hand - balance.quantity_reserved > 0
    order by
      case when lower(location.location_type) = 'pharmacy' then 0 else 1 end,
      batch.expiry_date,
      batch.created_at,
      balance.id
    for update of balance
  loop
    exit when v_needed <= 0.0001;

    v_available_medicine :=
      v_stock.available * v_stock.conversion_factor;
    continue when v_available_medicine <= 0;

    v_take_medicine := least(v_needed, v_available_medicine);
    v_take_inventory :=
      round(v_take_medicine / v_stock.conversion_factor, 4);

    if v_take_inventory > v_stock.available then
      v_take_inventory := v_stock.available;
    end if;

    continue when v_take_inventory <= 0;

    v_take_medicine := v_take_inventory * v_stock.conversion_factor;

    insert into public.stock_movements (
      item_id,
      batch_id,
      location_id,
      movement_type,
      quantity,
      reference_type,
      reference_id
    )
    values (
      v_stock.item_id,
      v_stock.batch_id,
      v_stock.location_id,
      'issue',
      v_take_inventory,
      'prescription_dispense',
      v_dispense
    )
    returning id into v_movement;

    insert into public.dispense_allocations (
      dispense_id,
      batch_id,
      location_id,
      stock_movement_id,
      quantity
    )
    values (
      v_dispense,
      v_stock.batch_id,
      v_stock.location_id,
      v_movement,
      v_take_inventory
    );

    update public.inventory_balances
    set quantity_on_hand = quantity_on_hand - v_take_inventory,
        updated_at = now()
    where id = v_stock.balance_id;

    v_needed := v_needed - v_take_medicine;
  end loop;

  if v_needed > 0.0001 then
    raise exception 'Not enough pharmacy stock for this medicine (short by % units)',
      round(v_needed, 4)
      using errcode = '22023';
  end if;

  update public.prescription_items
  set quantity_dispensed = quantity_dispensed + v_quantity,
      updated_at = now()
  where id = _item_id;

  if not exists (
    select 1
    from public.prescription_items item
    where item.prescription_id = v_item.prescription_id
      and item.quantity_dispensed < item.quantity_prescribed
  ) then
    update public.prescriptions
    set status = 'completed',
        updated_at = now()
    where id = v_item.prescription_id;
  end if;

  return v_item.quantity_dispensed + v_quantity;
end;
$$;

revoke all on function public.dispense_prescription_item(uuid, numeric)
  from public, anon;
grant execute on function public.dispense_prescription_item(uuid, numeric)
  to authenticated;