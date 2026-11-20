-- Action history: record every insert/update/delete on operational tables in
-- public.audit_events, then expose it to the dashboard through a scoped RPC.
--
-- The audit row carries the acting user (auth.uid()), the tenant, the entity
-- and a snapshot, so each dashboard section can show what everyone did there.

create index if not exists audit_events_tenant_occurred_idx
  on public.audit_events (tenant_id, occurred_at desc);

create or replace function public.record_action_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_actor uuid := auth.uid();
  v_row jsonb;
  v_previous jsonb;
  v_entity uuid;
begin
  begin
    v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
    v_previous := case when tg_op = 'INSERT' then null else to_jsonb(old) end;

    -- Tables without their own tenant_id inherit it from their parent.
    if tg_table_name = 'prescriptions' then
      select e.tenant_id into v_tenant
        from public.encounters e
        where e.id = (v_row ->> 'encounter_id')::uuid;
    elsif tg_table_name = 'lab_order_items' then
      select o.tenant_id into v_tenant
        from public.lab_orders o
        where o.id = (v_row ->> 'lab_order_id')::uuid;
    elsif tg_table_name = 'bed_assignments' then
      select a.tenant_id into v_tenant
        from public.admissions a
        where a.id = (v_row ->> 'admission_id')::uuid;
    elsif tg_table_name = 'prescription_dispenses' then
      select i.tenant_id into v_tenant
        from public.prescription_items i
        where i.id = (v_row ->> 'prescription_item_id')::uuid;
    elsif tg_table_name = 'payment_allocations' then
      select p.tenant_id into v_tenant
        from public.payments p
        where p.id = (v_row ->> 'payment_id')::uuid;
    else
      v_tenant := (v_row ->> 'tenant_id')::uuid;
    end if;

    if v_tenant is null then
      return null;
    end if;

    if v_actor is null or not exists (
      select 1 from public.users u where u.id = v_actor
    ) then
      return null;
    end if;

    v_entity := nullif(v_row ->> 'id', '')::uuid;

    insert into public.audit_events
      (tenant_id, actor_id, action, entity_type, entity_id, before_after,
       outcome, occurred_at)
    values (
      v_tenant, v_actor, lower(tg_op), tg_table_name, v_entity,
      jsonb_build_object(
        'operation', tg_op,
        'row', v_row,
        'previous', v_previous
      ),
      'success', now()
    );
  exception when others then
    -- Logging must never block the clinical or billing action itself.
    null;
  end;

  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'patients',
    'encounters',
    'appointments',
    'clinical_notes',
    'admissions',
    'allergies',
    'diagnoses',
    'observations',
    'lab_orders',
    'lab_order_items',
    'lab_results',
    'radiology_orders',
    'prescriptions',
    'prescription_items',
    'prescription_dispenses',
    'beds',
    'bed_assignments',
    'wards',
    'employees',
    'staff_approval_requests',
    'invoices',
    'invoice_items',
    'payments',
    'payment_allocations',
    'charge_catalog',
    'lab_test_catalog',
    'medicine_catalog',
    'medicine_requests',
    'medicine_vendor_orders',
    'inventory_items',
    'stock_batches',
    'insurance_policies',
    'insurance_policy_claims',
    'vendors',
    'assets',
    'purchase_requisitions'
  ]
  loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format(
        'drop trigger if exists record_action_history on public.%I', t
      );
      execute format(
        'create trigger record_action_history
           after insert or update or delete on public.%I
           for each row execute function public.record_action_history()',
        t
      );
    end if;
  end loop;
end;
$$;

/**
 * History visible to the signed-in actor. Staff see their hospital's actions;
 * the platform administrator sees every hospital. `_facility_id` may be null,
 * in which case the actor's own hospital is used.
 */
create or replace function public.action_history(
  _facility_id uuid default null,
  _limit integer default 60
)
returns table (
  event_id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  actor_name text,
  actor_role text,
  detail jsonb,
  occurred_at timestamptz,
  tenant_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_limit integer := least(greatest(coalesce(_limit, 60), 1), 200);
begin
  if auth.uid() is null then
    raise exception 'Sign in to read the action history'
      using errcode = '42501';
  end if;

  if public.is_platform_admin() then
    v_tenant := null;
  else
    if _facility_id is not null then
      select f.tenant_id into v_tenant
        from public.facilities f
        where f.id = _facility_id;
    else
      select e.tenant_id into v_tenant
        from public.employees e
        where e.user_id = auth.uid()
          and e.employment_status = 'active'
        limit 1;
    end if;

    if v_tenant is null or not public.is_tenant_member(v_tenant) then
      raise exception 'You do not have access to this history'
        using errcode = '42501';
    end if;
  end if;

  return query
  select
    event.id,
    event.action,
    event.entity_type,
    event.entity_id,
    coalesce(profile.full_name, 'System'),
    coalesce(actor_role.role::text, 'staff'),
    event.before_after,
    event.occurred_at,
    tenant.name
  from public.audit_events event
  left join public.staff_profiles profile on profile.id = event.actor_id
  left join lateral (
    select r.role
    from public.user_roles r
    where r.user_id = event.actor_id
    order by r.role
    limit 1
  ) actor_role on true
  left join public.tenants tenant on tenant.id = event.tenant_id
  where v_tenant is null or event.tenant_id = v_tenant
  order by event.occurred_at desc
  limit v_limit;
end;
$$;

grant execute on function public.action_history(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
