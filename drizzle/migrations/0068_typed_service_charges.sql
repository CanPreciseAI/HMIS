-- Staff used to pick a service from the saved price list. Billing now lets them
-- describe the service they actually provided and enter its price directly.
--
-- The typed service is stored as a hidden custom catalog entry so the existing
-- invoice, ledger and outstanding-balance functions keep one consistent source
-- of truth. Custom entries stay inactive, so they never appear in the saved
-- price-list dropdown.

create or replace function public.record_custom_service_charge(
  _patient_id uuid,
  _service_name text,
  _unit_price numeric,
  _quantity numeric default 1,
  _note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee record;
  v_quantity numeric(19,4) := coalesce(_quantity, 1);
  v_unit_price numeric(19,4) := coalesce(_unit_price, 0);
  v_service_name text := btrim(coalesce(_service_name, ''));
  v_catalog_id uuid;
  v_charge_id uuid;
  v_charge_code text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to record a service'
      using errcode = '42501';
  end if;

  if public.is_patient_account() then
    raise exception 'Only hospital staff can record a service'
      using errcode = '42501';
  end if;

  select employee.id, employee.tenant_id, department.facility_id
    into v_employee
  from public.employees employee
  left join public.departments department
    on department.id = employee.department_id
  where employee.user_id = auth.uid()
    and employee.employment_status = 'active'
  limit 1;

  if not found or v_employee.facility_id is null then
    raise exception 'Your staff record is not linked to an active facility'
      using errcode = '42501';
  end if;

  if v_service_name = '' then
    raise exception 'Enter the service you provided'
      using errcode = '22023';
  end if;

  if v_quantity <= 0 then
    raise exception 'Enter a quantity greater than zero'
      using errcode = '22023';
  end if;

  if v_unit_price < 0 then
    raise exception 'Enter a price of zero or more'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.patients patient
    where patient.id = _patient_id
      and patient.tenant_id = v_employee.tenant_id
      and patient.status = 'active'
  ) then
    raise exception 'Choose an active patient in your hospital'
      using errcode = '22023';
  end if;

  -- Reuse an earlier hidden entry for the same service when there is one, so
  -- repeated bedside entries do not multiply the catalog.
  select catalog.id
    into v_catalog_id
  from public.charge_catalog catalog
  where catalog.tenant_id = v_employee.tenant_id
    and catalog.category = 'custom'
    and catalog.status = 'inactive'
    and lower(catalog.name) = lower(v_service_name)
  order by catalog.created_at asc
  limit 1;

  if v_catalog_id is null then
    v_charge_code :=
      'CUSTOM-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

    insert into public.charge_catalog (
      tenant_id,
      charge_code,
      name,
      category,
      base_rate,
      status
    )
    values (
      v_employee.tenant_id,
      v_charge_code,
      v_service_name,
      'custom',
      v_unit_price,
      'inactive'
    )
    returning id into v_catalog_id;
  else
    update public.charge_catalog
    set base_rate = v_unit_price,
        updated_at = now()
    where id = v_catalog_id;
  end if;

  insert into public.service_charges (
    tenant_id,
    facility_id,
    patient_id,
    charge_id,
    recorded_by,
    recorded_by_user,
    recorded_role,
    quantity,
    unit_price,
    amount,
    note
  )
  values (
    v_employee.tenant_id,
    v_employee.facility_id,
    _patient_id,
    v_catalog_id,
    v_employee.id,
    auth.uid(),
    coalesce(
      (
        select role::text
        from public.user_roles
        where user_id = auth.uid()
        order by role
        limit 1
      ),
      (
        select lower(replace(role_row.name, ' ', '_'))
        from public.user_role_assignments assignment
        join public.roles role_row on role_row.id = assignment.role_id
        where assignment.user_id = auth.uid()
          and assignment.valid_from <= now()
          and (assignment.valid_until is null or assignment.valid_until > now())
        order by role_row.name
        limit 1
      ),
      'staff'
    ),
    v_quantity,
    v_unit_price,
    v_quantity * v_unit_price,
    nullif(btrim(coalesce(_note, '')), '')
  )
  returning id into v_charge_id;

  return v_charge_id;
end;
$$;

revoke all on function public.record_custom_service_charge(
  uuid, text, numeric, numeric, text
) from public, anon;
grant execute on function public.record_custom_service_charge(
  uuid, text, numeric, numeric, text
) to authenticated;
