-- Laboratory tests become first-class billable items. Every test is linked to a
-- charge catalogue row, so it appears in the same price list finance uses and
-- doctors can order it without a second manual billing entry.
--
-- Existing tenants receive a standard laboratory menu with starter prices. The
-- rows are idempotent, so applying this migration again does not duplicate them.

alter table public.lab_test_catalog
  add column if not exists charge_id uuid
    references public.charge_catalog(id) on delete restrict;

create index if not exists lab_test_catalog_charge_idx
  on public.lab_test_catalog (charge_id);

-- Seed/reuse the standard laboratory menu for every existing hospital.
do $$
declare
  v_tenant record;
  v_facility uuid;
  v_department uuid;
  v_standard record;
  v_charge uuid;
  v_charge_code text;
begin
  for v_tenant in select id from public.tenants loop
    select facility.id
      into v_facility
    from public.facilities facility
    where facility.tenant_id = v_tenant.id
      and facility.status = 'active'
    order by facility.created_at
    limit 1;

    if v_facility is null then
      continue;
    end if;

    v_department := public.ensure_department(v_facility, 'Laboratory');
    if v_department is null then
      continue;
    end if;

    for v_standard in
      select *
      from (values
        ('CBC', 'Complete blood count', 'blood', 350::numeric),
        ('HBA1C', 'HbA1c', 'blood', 450::numeric),
        ('FBS', 'Fasting blood glucose', 'blood', 150::numeric),
        ('RBS', 'Random blood glucose', 'blood', 120::numeric),
        ('CREAT', 'Serum creatinine', 'blood', 300::numeric),
        ('BUN', 'Blood urea nitrogen', 'blood', 300::numeric),
        ('ELECTRO', 'Serum electrolytes', 'blood', 450::numeric),
        ('LFT', 'Liver function test', 'blood', 750::numeric),
        ('LIPID', 'Lipid profile', 'blood', 600::numeric),
        ('TSH', 'Thyroid stimulating hormone', 'blood', 500::numeric),
        ('TROP', 'Troponin I', 'blood', 800::numeric),
        ('CRP', 'C-reactive protein', 'blood', 400::numeric),
        ('PT-INR', 'Prothrombin time / INR', 'blood', 400::numeric),
        ('HBSAG', 'Hepatitis B surface antigen', 'blood', 400::numeric),
        ('HIV', 'HIV screening', 'blood', 300::numeric),
        ('MALARIA', 'Malaria smear', 'blood', 250::numeric),
        ('DENGUE-NS1', 'Dengue NS1 antigen', 'blood', 600::numeric),
        ('URINE-RM', 'Urine routine microscopy', 'urine', 200::numeric),
        ('URINE-CULT', 'Urine culture', 'urine', 650::numeric),
        ('STOOL-RM', 'Stool routine microscopy', 'stool', 200::numeric)
      ) as tests(code, name, specimen_type, price)
    loop
      v_charge_code := 'LAB-' || upper(v_standard.code);

      insert into public.charge_catalog (
        tenant_id,
        charge_code,
        name,
        category,
        base_rate,
        status
      ) values (
        v_tenant.id,
        v_charge_code,
        v_standard.name,
        'laboratory',
        v_standard.price,
        'active'
      )
      on conflict (tenant_id, charge_code) do nothing;

      select charge.id
        into v_charge
      from public.charge_catalog charge
      where charge.tenant_id = v_tenant.id
        and charge.charge_code = v_charge_code;

      insert into public.lab_test_catalog (
        tenant_id,
        test_code,
        name,
        specimen_type,
        department_id,
        charge_id
      ) values (
        v_tenant.id,
        v_standard.code,
        v_standard.name,
        v_standard.specimen_type,
        v_department,
        v_charge
      )
      on conflict (tenant_id, test_code) do update
        set charge_id = coalesce(
              lab_test_catalog.charge_id,
              excluded.charge_id
            ),
            updated_at = now();
    end loop;
  end loop;
end;
$$;

-- Any tests added before this migration get a price-list entry too. If a
-- standard price was seeded above it is reused; otherwise the starter price is
-- zero and the administrator can set it from the catalog screen.
do $$
declare
  v_test record;
  v_charge uuid;
  v_charge_code text;
begin
  for v_test in
    select id, tenant_id, test_code, name, status
    from public.lab_test_catalog
    where charge_id is null
  loop
    v_charge_code :=
      'LAB-' ||
      upper(regexp_replace(btrim(v_test.test_code), '[^A-Za-z0-9]+', '-', 'g'));

    insert into public.charge_catalog (
      tenant_id,
      charge_code,
      name,
      category,
      base_rate,
      status
    ) values (
      v_test.tenant_id,
      v_charge_code,
      v_test.name,
      'laboratory',
      0,
      v_test.status
    )
    on conflict (tenant_id, charge_code) do nothing;

    select charge.id
      into v_charge
    from public.charge_catalog charge
    where charge.tenant_id = v_test.tenant_id
      and charge.charge_code = v_charge_code;

    update public.lab_test_catalog
    set charge_id = v_charge,
        updated_at = now()
    where id = v_test.id;
  end loop;
end;
$$;

alter table public.lab_test_catalog
  alter column charge_id set not null;

create unique index if not exists lab_test_catalog_charge_unique_idx
  on public.lab_test_catalog (charge_id);

-- Creates a laboratory test and its matching price-list item together.
create or replace function public.create_lab_test(
  _test_code text,
  _name text,
  _specimen_type text,
  _price numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid;
  v_tenant_id uuid;
  v_facility_id uuid;
  v_department_id uuid;
  v_test_code text := upper(
    regexp_replace(btrim(coalesce(_test_code, '')), '[^A-Za-z0-9]+', '-', 'g')
  );
  v_name text := btrim(coalesce(_name, ''));
  v_specimen_type text := lower(btrim(coalesce(_specimen_type, '')));
  v_price numeric(19,4) := coalesce(_price, 0);
  v_charge_code text;
  v_charge_id uuid;
  v_test_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage laboratory tests'
      using errcode = '42501';
  end if;

  select employee.id, employee.tenant_id, department.facility_id
    into v_employee_id, v_tenant_id, v_facility_id
  from public.employees employee
  left join public.departments department
    on department.id = employee.department_id
  where employee.user_id = auth.uid()
    and employee.employment_status = 'active'
  limit 1;

  if v_employee_id is null or v_tenant_id is null then
    raise exception 'Your staff record is not linked to an active hospital'
      using errcode = '42501';
  end if;

  if not public.is_tenant_admin(v_tenant_id) then
    raise exception 'Only hospital administrators can manage laboratory tests'
      using errcode = '42501';
  end if;

  if v_facility_id is null then
    raise exception 'Your department is not linked to a facility yet'
      using errcode = '22023';
  end if;

  if v_test_code = '' or v_name = '' or v_specimen_type = '' then
    raise exception 'Enter a test code, name and specimen type'
      using errcode = '22023';
  end if;

  if v_price < 0 then
    raise exception 'Enter a price of zero or more'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.lab_test_catalog test
    where test.tenant_id = v_tenant_id
      and lower(test.test_code) = lower(v_test_code)
  ) then
    raise exception 'That test code is already in the laboratory catalog'
      using errcode = '22023';
  end if;

  v_department_id := public.ensure_department(v_facility_id, 'Laboratory');
  if v_department_id is null then
    raise exception 'Could not resolve the laboratory department'
      using errcode = '22023';
  end if;

  v_charge_code := 'LAB-' || v_test_code;

  select charge.id
    into v_charge_id
  from public.charge_catalog charge
  where charge.tenant_id = v_tenant_id
    and charge.charge_code = v_charge_code;

  if v_charge_id is null then
    insert into public.charge_catalog (
      tenant_id,
      charge_code,
      name,
      category,
      base_rate,
      status
    ) values (
      v_tenant_id,
      v_charge_code,
      v_name,
      'laboratory',
      v_price,
      'active'
    )
    returning id into v_charge_id;
  else
    update public.charge_catalog
    set name = v_name,
        category = 'laboratory',
        base_rate = v_price,
        status = 'active',
        updated_at = now()
    where id = v_charge_id;
  end if;

  insert into public.lab_test_catalog (
    tenant_id,
    test_code,
    name,
    specimen_type,
    department_id,
    charge_id
  ) values (
    v_tenant_id,
    v_test_code,
    v_name,
    v_specimen_type,
    v_department_id,
    v_charge_id
  )
  returning id into v_test_id;

  return v_test_id;
end;
$$;

revoke all on function public.create_lab_test(text, text, text, numeric)
  from public, anon;
grant execute on function public.create_lab_test(text, text, text, numeric)
  to authenticated;

create or replace function public.update_lab_test(
  _test_id uuid,
  _name text,
  _specimen_type text,
  _price numeric,
  _status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee_id uuid;
  v_tenant_id uuid;
  v_name text := btrim(coalesce(_name, ''));
  v_specimen_type text := lower(btrim(coalesce(_specimen_type, '')));
  v_price numeric(19,4) := coalesce(_price, 0);
  v_status text := lower(coalesce(_status, ''));
  v_charge_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage laboratory tests'
      using errcode = '42501';
  end if;

  select employee.id, employee.tenant_id
    into v_employee_id, v_tenant_id
  from public.employees employee
  where employee.user_id = auth.uid()
    and employee.employment_status = 'active'
  limit 1;

  if v_employee_id is null or v_tenant_id is null then
    raise exception 'Your staff record is not linked to an active hospital'
      using errcode = '42501';
  end if;

  if not public.is_tenant_admin(v_tenant_id) then
    raise exception 'Only hospital administrators can manage laboratory tests'
      using errcode = '42501';
  end if;

  if v_name = '' or v_specimen_type = '' then
    raise exception 'Enter a test name and specimen type'
      using errcode = '22023';
  end if;

  if v_price < 0 then
    raise exception 'Enter a price of zero or more'
      using errcode = '22023';
  end if;

  if v_status not in ('active', 'inactive') then
    raise exception 'Choose active or inactive'
      using errcode = '22023';
  end if;

  select test.charge_id
    into v_charge_id
  from public.lab_test_catalog test
  where test.id = _test_id
    and test.tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'That laboratory test is not in this hospital'
      using errcode = '22023';
  end if;

  update public.lab_test_catalog
  set name = v_name,
      specimen_type = v_specimen_type,
      status = v_status,
      updated_at = now()
  where id = _test_id;

  if v_charge_id is not null then
    update public.charge_catalog
    set name = v_name,
        category = 'laboratory',
        base_rate = v_price,
        status = v_status,
        updated_at = now()
    where id = v_charge_id
      and tenant_id = v_tenant_id;
  end if;
end;
$$;

revoke all on function public.update_lab_test(uuid, text, text, numeric, text)
  from public, anon;
grant execute on function public.update_lab_test(uuid, text, text, numeric, text)
  to authenticated;

-- Doctors' orders now create the matching lab charge in the shared ledger, so
-- reception and hospital administrators can invoice the test without retyping.
create or replace function public.create_lab_assignment(
  _patient_id uuid,
  _test_ids uuid[],
  _assigned_to uuid,
  _priority text default 'routine'
)
returns table (lab_order_id uuid, item_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor_id uuid;
  v_tenant_id uuid;
  v_facility_id uuid;
  v_encounter_id uuid;
  v_order_id uuid;
  v_test_id uuid;
  v_test_ids uuid[];
  v_priority text := coalesce(_priority, 'routine');
  v_accession text;
  v_item_count integer := 0;
  v_test_charge_id uuid;
  v_test_rate numeric(19,4);
  v_test_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to assign lab tests'
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
    raise exception 'Only doctors can assign lab tests'
      using errcode = '42501';
  end if;

  if v_facility_id is null then
    raise exception 'Your department is not linked to a facility yet'
      using errcode = '22023';
  end if;

  if _test_ids is null or coalesce(array_length(_test_ids, 1), 0) = 0 then
    raise exception 'Choose at least one lab test'
      using errcode = '22023';
  end if;

  select array_agg(distinct requested.test_id)
    into v_test_ids
  from unnest(_test_ids) as requested(test_id);

  if v_test_ids is null or array_length(v_test_ids, 1) is null then
    raise exception 'Choose at least one lab test'
      using errcode = '22023';
  end if;

  if v_priority not in ('routine', 'urgent', 'stat') then
    raise exception 'Choose a valid lab priority'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.patients patient
    where patient.id = _patient_id
      and patient.tenant_id = v_tenant_id
      and patient.status = 'active'
  ) then
    raise exception 'That patient is not active in this hospital'
      using errcode = '22023';
  end if;

  if _assigned_to is null or not exists (
    select 1
    from public.employees technician
    join public.departments department
      on department.id = technician.department_id
    where technician.id = _assigned_to
      and technician.tenant_id = v_tenant_id
      and department.facility_id = v_facility_id
      and technician.employment_status = 'active'
      and public.is_lab_technician_employee(technician.id)
  ) then
    raise exception 'Choose an active lab technician in this facility'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_test_ids) as requested(test_id)
    where not exists (
      select 1
      from public.lab_test_catalog catalog
      where catalog.id = requested.test_id
        and catalog.tenant_id = v_tenant_id
        and catalog.status = 'active'
    )
  ) then
    raise exception 'One or more selected lab tests are not active in this hospital'
      using errcode = '22023';
  end if;

  select encounter.id
    into v_encounter_id
  from public.encounters encounter
  where encounter.patient_id = _patient_id
    and encounter.tenant_id = v_tenant_id
    and encounter.facility_id = v_facility_id
    and encounter.provider_id = v_doctor_id
    and encounter.status = 'open'
  order by encounter.started_at desc
  limit 1;

  if v_encounter_id is null then
    insert into public.encounters (
      tenant_id,
      facility_id,
      patient_id,
      encounter_type,
      provider_id
    ) values (
      v_tenant_id,
      v_facility_id,
      _patient_id,
      'outpatient',
      v_doctor_id
    )
    returning id into v_encounter_id;
  end if;

  insert into public.lab_orders (
    tenant_id,
    encounter_id,
    patient_id,
    ordered_by,
    status,
    assigned_to,
    assigned_at
  ) values (
    v_tenant_id,
    v_encounter_id,
    _patient_id,
    v_doctor_id,
    'placed',
    _assigned_to,
    now()
  )
  returning id into v_order_id;

  foreach v_test_id in array v_test_ids
  loop
    v_accession :=
      'LAB-' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    insert into public.lab_order_items (
      lab_order_id,
      test_id,
      accession_number,
      priority,
      status
    ) values (
      v_order_id,
      v_test_id,
      v_accession,
      v_priority,
      'ordered'
    );

    select catalog.charge_id, catalog.name, charge.base_rate
      into v_test_charge_id, v_test_name, v_test_rate
    from public.lab_test_catalog catalog
    join public.charge_catalog charge on charge.id = catalog.charge_id
    where catalog.id = v_test_id
      and catalog.tenant_id = v_tenant_id
      and charge.status = 'active';

    if v_test_charge_id is not null
      and not exists (
        select 1
        from public.service_charges existing
        where existing.encounter_id = v_encounter_id
          and existing.charge_id = v_test_charge_id
          and existing.status <> 'void'
      )
    then
      insert into public.service_charges (
        tenant_id,
        facility_id,
        patient_id,
        charge_id,
        encounter_id,
        recorded_by,
        recorded_by_user,
        recorded_role,
        quantity,
        unit_price,
        amount,
        note
      ) values (
        v_tenant_id,
        v_facility_id,
        _patient_id,
        v_test_charge_id,
        v_encounter_id,
        v_doctor_id,
        auth.uid(),
        'doctor',
        1,
        v_test_rate,
        v_test_rate,
        'Lab test: ' || coalesce(v_test_name, 'Laboratory test')
      );
    end if;

    v_item_count := v_item_count + 1;
  end loop;

  return query select v_order_id, v_item_count;
end;
$$;

revoke all on function public.create_lab_assignment(
  uuid, uuid[], uuid, text
) from public, anon;
grant execute on function public.create_lab_assignment(
  uuid, uuid[], uuid, text
) to authenticated;
