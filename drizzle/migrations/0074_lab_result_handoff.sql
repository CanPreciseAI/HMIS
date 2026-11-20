-- Laboratory hand-off: the assigned technician moves a sample through its
-- statuses, records the result and sends it back to the ordering doctor, who
-- verifies it from "Results to verify".

create or replace function public.update_lab_item_status(
  _item_id uuid,
  _status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee uuid;
  v_tenant uuid;
  v_current text;
  v_order uuid;
  v_order_tenant uuid;
  v_assigned uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to update a laboratory test'
      using errcode = '42501';
  end if;

  select employee.id, employee.tenant_id
    into v_employee, v_tenant
  from public.employees employee
  where employee.user_id = auth.uid()
    and employee.employment_status = 'active'
  limit 1;

  if v_employee is null or not public.is_lab_technician_employee(v_employee) then
    raise exception 'Only laboratory technicians can update a test status'
      using errcode = '42501';
  end if;

  if _status not in ('ordered', 'collected', 'cancelled') then
    raise exception 'Choose a valid test status'
      using errcode = '22023';
  end if;

  select item.status, item.lab_order_id, orders.tenant_id, orders.assigned_to
    into v_current, v_order, v_order_tenant, v_assigned
  from public.lab_order_items item
  join public.lab_orders orders on orders.id = item.lab_order_id
  where item.id = _item_id;

  if v_order is null then
    raise exception 'That laboratory test could not be found'
      using errcode = '22023';
  end if;

  if v_order_tenant <> v_tenant then
    raise exception 'That laboratory test belongs to another hospital'
      using errcode = '42501';
  end if;

  if v_assigned is not null and v_assigned <> v_employee then
    raise exception 'That test is assigned to another laboratory technician'
      using errcode = '42501';
  end if;

  if v_current in ('resulted', 'verified') then
    raise exception 'This test already has a result and can no longer change status'
      using errcode = '22023';
  end if;

  update public.lab_order_items
  set status = _status,
      updated_at = now()
  where id = _item_id;

  if _status = 'collected' then
    update public.lab_orders
    set status = 'in_progress',
        updated_at = now()
    where id = v_order
      and status = 'placed';
  elsif _status = 'cancelled' then
    if not exists (
      select 1
      from public.lab_order_items item
      where item.lab_order_id = v_order
        and item.status <> 'cancelled'
    ) then
      update public.lab_orders
      set status = 'cancelled',
          updated_at = now()
      where id = v_order;
    end if;
  end if;
end;
$$;

create or replace function public.record_lab_result(
  _item_id uuid,
  _result_value text,
  _unit text default null,
  _reference_range text default null,
  _critical boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee uuid;
  v_tenant uuid;
  v_current text;
  v_order uuid;
  v_order_tenant uuid;
  v_assigned uuid;
  v_specimen uuid;
  v_result_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to record a laboratory result'
      using errcode = '42501';
  end if;

  select employee.id, employee.tenant_id
    into v_employee, v_tenant
  from public.employees employee
  where employee.user_id = auth.uid()
    and employee.employment_status = 'active'
  limit 1;

  if v_employee is null or not public.is_lab_technician_employee(v_employee) then
    raise exception 'Only laboratory technicians can record a laboratory result'
      using errcode = '42501';
  end if;

  if nullif(trim(coalesce(_result_value, '')), '') is null then
    raise exception 'Enter the result value'
      using errcode = '22023';
  end if;

  select item.status, item.lab_order_id, orders.tenant_id, orders.assigned_to
    into v_current, v_order, v_order_tenant, v_assigned
  from public.lab_order_items item
  join public.lab_orders orders on orders.id = item.lab_order_id
  where item.id = _item_id;

  if v_order is null then
    raise exception 'That laboratory test could not be found'
      using errcode = '22023';
  end if;

  if v_order_tenant <> v_tenant then
    raise exception 'That laboratory test belongs to another hospital'
      using errcode = '42501';
  end if;

  if v_assigned is not null and v_assigned <> v_employee then
    raise exception 'That test is assigned to another laboratory technician'
      using errcode = '42501';
  end if;

  if v_current in ('verified', 'cancelled') then
    raise exception 'That test is already verified or cancelled'
      using errcode = '22023';
  end if;

  -- Every result hangs off a specimen; record one when the technician has not
  -- logged it separately.
  select specimen.id
    into v_specimen
  from public.specimens specimen
  where specimen.lab_order_item_id = _item_id
  order by specimen.created_at desc
  limit 1;

  if v_specimen is null then
    insert into public.specimens (
      lab_order_item_id,
      specimen_code,
      status,
      received_at
    ) values (
      _item_id,
      'SPC-' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '-' ||
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
      'received',
      now()
    )
    returning id into v_specimen;
  end if;

  insert into public.lab_results (
    tenant_id,
    lab_order_item_id,
    specimen_id,
    result_value,
    unit,
    reference_range,
    status,
    version,
    critical_flag
  ) values (
    v_tenant,
    _item_id,
    v_specimen,
    trim(_result_value),
    trim(coalesce(_unit, '')),
    trim(coalesce(_reference_range, '')),
    'preliminary',
    1,
    coalesce(_critical, false)
  )
  returning id into v_result_id;

  update public.lab_order_items
  set status = 'resulted',
      updated_at = now()
  where id = _item_id;

  update public.lab_orders
  set status = 'in_progress',
      updated_at = now()
  where id = v_order
    and status = 'placed';

  return v_result_id;
end;
$$;

create or replace function public.verify_lab_result(_result_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee uuid;
  v_item uuid;
  v_order uuid;
  v_status text;
  v_ordered_by uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to verify a laboratory result'
      using errcode = '42501';
  end if;

  select employee.id
    into v_employee
  from public.employees employee
  where employee.user_id = auth.uid()
    and employee.employment_status = 'active'
  limit 1;

  if v_employee is null or not public.is_doctor_employee(v_employee) then
    raise exception 'Only doctors can verify a laboratory result'
      using errcode = '42501';
  end if;

  select result.lab_order_item_id, result.status, item.lab_order_id, orders.ordered_by
    into v_item, v_status, v_order, v_ordered_by
  from public.lab_results result
  join public.lab_order_items item on item.id = result.lab_order_item_id
  join public.lab_orders orders on orders.id = item.lab_order_id
  where result.id = _result_id;

  if v_item is null then
    raise exception 'That laboratory result could not be found'
      using errcode = '22023';
  end if;

  if v_ordered_by <> v_employee then
    raise exception 'Only the doctor who ordered this test can verify its result'
      using errcode = '42501';
  end if;

  if v_status <> 'preliminary' then
    raise exception 'This result has already been verified'
      using errcode = '22023';
  end if;

  update public.lab_results
  set status = 'verified',
      verified_by = v_employee,
      verified_at = now(),
      updated_at = now()
  where id = _result_id;

  update public.lab_order_items
  set status = 'verified',
      updated_at = now()
  where id = v_item;

  if not exists (
    select 1
    from public.lab_order_items item
    where item.lab_order_id = v_order
      and item.status not in ('verified', 'cancelled')
  ) then
    update public.lab_orders
    set status = 'completed',
        updated_at = now()
    where id = v_order;
  end if;
end;
$$;

revoke all on function public.update_lab_item_status(uuid, text) from public, anon;
revoke all on function public.record_lab_result(uuid, text, text, text, boolean) from public, anon;
revoke all on function public.verify_lab_result(uuid) from public, anon;

grant execute on function public.update_lab_item_status(uuid, text) to authenticated;
grant execute on function public.record_lab_result(uuid, text, text, text, boolean) to authenticated;
grant execute on function public.verify_lab_result(uuid) to authenticated;
