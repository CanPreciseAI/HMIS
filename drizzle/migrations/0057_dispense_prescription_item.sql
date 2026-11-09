-- The pharmacist hands medicines over line by line. Recording a dispense
-- updates the line's dispensed quantity, closes the prescription once every
-- line is complete, and keeps the pharmacist's own dispensing history.
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
  v_remaining numeric(19,4);
  v_quantity numeric(19,4);
begin
  if auth.uid() is null then
    raise exception 'Sign in to dispense a medicine'
      using errcode = '42501';
  end if;

  if not public.has_role(auth.uid(), 'pharmacist') then
    raise exception 'Only a pharmacist can dispense a prescription line'
      using errcode = '42501';
  end if;

  select employee.id, employee.tenant_id
    into v_employee
  from public.employees employee
  where employee.user_id = auth.uid()
    and employee.employment_status = 'active'
  limit 1;

  if not found then
    raise exception 'Your staff record is not linked to an active facility'
      using errcode = '42501';
  end if;

  select item.id, item.tenant_id, item.prescription_id,
         item.quantity_prescribed, item.quantity_dispensed
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

  select prescription.status into v_prescription_status
  from public.prescriptions prescription
  where prescription.id = v_item.prescription_id;

  if v_prescription_status <> 'active' then
    raise exception 'This prescription is no longer active'
      using errcode = '22023';
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
  values (_item_id, v_employee.id, v_quantity);

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
