-- Loads a realistic sample medicine catalog with live stock so the Stock &
-- medicines page is populated out of the box. Safe to run more than once: the
-- catalog rows, inventory items, links, batches and balances are all idempotent.

create or replace function public.seed_demo_medicine_catalog(_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_facility uuid;
  v_location uuid;
  v_item uuid;
  v_batch uuid;
  v_medicine uuid;
  v_count integer := 0;
  med record;
begin
  if auth.uid() is not null
    and not (public.is_platform_admin() or public.is_tenant_admin(_tenant_id)) then
    raise exception 'Only a hospital administrator can load the sample catalog.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.tenants where id = _tenant_id) then
    raise exception 'Hospital not found.' using errcode = '22023';
  end if;

  select f.id into v_facility
  from public.facilities f
  where f.tenant_id = _tenant_id
  order by f.id
  limit 1;

  if v_facility is null then
    return 0;
  end if;

  select l.id into v_location
  from public.inventory_locations l
  where l.tenant_id = _tenant_id
    and l.facility_id = v_facility
    and l.name = 'Pharmacy'
  limit 1;

  if v_location is null then
    insert into public.inventory_locations (
      tenant_id, facility_id, name, location_type, status
    )
    values (_tenant_id, v_facility, 'Pharmacy', 'pharmacy', 'active')
    returning id into v_location;
  end if;

  for med in
    select *
    from (
      values
        ('PARA500', 'Paracetamol', '500 mg', 'Tablet', 'tablet', 240::numeric),
        ('AMOX500', 'Amoxicillin', '500 mg', 'Capsule', 'capsule', 120::numeric),
        ('AUGMENT625', 'Amoxicillin/clavulanate', '625 mg', 'Tablet', 'tablet', 42::numeric),
        ('AZITH500', 'Azithromycin', '500 mg', 'Tablet', 'tablet', 36::numeric),
        ('CETIR10', 'Cetirizine', '10 mg', 'Tablet', 'tablet', 180::numeric),
        ('OMEP20', 'Omeprazole', '20 mg', 'Capsule', 'capsule', 90::numeric),
        ('PANTO40', 'Pantoprazole', '40 mg', 'Tablet', 'tablet', 60::numeric),
        ('METF500', 'Metformin', '500 mg', 'Tablet', 'tablet', 300::numeric),
        ('AMLO5', 'Amlodipine', '5 mg', 'Tablet', 'tablet', 150::numeric),
        ('ATOR10', 'Atorvastatin', '10 mg', 'Tablet', 'tablet', 72::numeric),
        ('LOSAR50', 'Losartan', '50 mg', 'Tablet', 'tablet', 84::numeric),
        ('IBUP400', 'Ibuprofen', '400 mg', 'Tablet', 'tablet', 160::numeric),
        ('DICLO50', 'Diclofenac', '50 mg', 'Tablet', 'tablet', 48::numeric),
        ('ONDAN4', 'Ondansetron', '4 mg', 'Tablet', 'tablet', 8::numeric),
        ('TRAM50', 'Tramadol', '50 mg', 'Capsule', 'capsule', 5::numeric),
        ('CIPRO500', 'Ciprofloxacin', '500 mg', 'Tablet', 'tablet', 24::numeric),
        ('METRO400', 'Metronidazole', '400 mg', 'Tablet', 'tablet', 110::numeric),
        ('DOXY100', 'Doxycycline', '100 mg', 'Capsule', 'capsule', 70::numeric),
        ('COARTEM', 'Artemether/Lumefantrine', '20/120 mg', 'Tablet', 'tablet', 30::numeric),
        ('ORS', 'Oral rehydration salts', '20.5 g', 'Sachet', 'sachet', 200::numeric),
        ('SALB100', 'Salbutamol', '100 mcg', 'Inhaler', 'inhaler', 4::numeric),
        ('INSULIN30', 'Insulin (Mixtard 30/70)', '100 IU/mL', 'Injection', 'vial', 12::numeric),
        ('CEFTRI1G', 'Ceftriaxone', '1 g', 'Injection', 'vial', 40::numeric),
        ('NS09', 'Sodium chloride 0.9%', '500 mL', 'Infusion', 'bottle', 120::numeric),
        ('RL', 'Ringer''s lactate', '500 mL', 'Infusion', 'bottle', 80::numeric),
        ('HYDROC100', 'Hydrocortisone', '100 mg', 'Injection', 'vial', 18::numeric),
        ('DEXA4', 'Dexamethasone', '4 mg', 'Injection', 'ampoule', 6::numeric),
        ('FURO40', 'Furosemide', '40 mg', 'Tablet', 'tablet', 100::numeric),
        ('PRED5', 'Prednisolone', '5 mg', 'Tablet', 'tablet', 130::numeric),
        ('VITC500', 'Ascorbic acid', '500 mg', 'Tablet', 'tablet', 220::numeric),
        ('FERROUS200', 'Ferrous sulphate', '200 mg', 'Tablet', 'tablet', 190::numeric),
        ('FOLIC5', 'Folic acid', '5 mg', 'Tablet', 'tablet', 260::numeric)
    ) as m(code, name, strength, form, unit, quantity)
  loop
    insert into public.medicine_catalog (
      tenant_id, medicine_code, name, strength, dosage_form, status
    )
    values (_tenant_id, med.code, med.name, med.strength, med.form, 'active')
    on conflict (tenant_id, medicine_code) do nothing;

    select m.id into v_medicine
    from public.medicine_catalog m
    where m.tenant_id = _tenant_id
      and m.medicine_code = med.code;

    insert into public.inventory_items (
      tenant_id, item_code, name, category, unit_of_measure, status
    )
    values (
      _tenant_id,
      'INV-' || med.code,
      med.name || ' ' || med.strength,
      'Medicine',
      med.unit,
      'active'
    )
    on conflict (tenant_id, item_code)
    do update set
      name = excluded.name,
      category = excluded.category,
      unit_of_measure = excluded.unit_of_measure,
      status = 'active'
    returning id into v_item;

    insert into public.medicine_inventory_map (
      medicine_id, item_id, conversion_factor, status
    )
    values (v_medicine, v_item, 1, 'active')
    on conflict (medicine_id, item_id) do nothing;

    insert into public.stock_batches (
      tenant_id, facility_id, item_id, batch_number, expiry_date, received_quantity
    )
    values (
      _tenant_id, v_facility, v_item, 'DEMO-2026', date '2027-12-31', med.quantity
    )
    on conflict (facility_id, item_id, batch_number)
    do update set expiry_date = excluded.expiry_date
    returning id into v_batch;

    insert into public.inventory_balances (
      item_id, location_id, batch_id, quantity_on_hand, quantity_reserved
    )
    values (v_item, v_location, v_batch, med.quantity, 0)
    on conflict (item_id, location_id, batch_id) do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.seed_demo_medicine_catalog(uuid) from public;
grant execute on function public.seed_demo_medicine_catalog(uuid) to authenticated;

do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select id from public.tenants loop
    perform public.seed_demo_medicine_catalog(v_tenant);
  end loop;
end;
$$;
