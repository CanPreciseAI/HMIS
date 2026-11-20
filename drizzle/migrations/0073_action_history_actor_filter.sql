-- Dashboards show the signed-in actor's own recent actions only, so the
-- history function can now be scoped to one actor.

drop function if exists public.action_history(uuid, integer);

create or replace function public.action_history(
  _facility_id uuid default null,
  _limit integer default 60,
  _actor_id uuid default null
)
returns table(
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
  where (v_tenant is null or event.tenant_id = v_tenant)
    and (_actor_id is null or event.actor_id = _actor_id)
  order by event.occurred_at desc
  limit v_limit;
end;
$$;

revoke all on function public.action_history(uuid, integer, uuid) from public, anon;
grant execute on function public.action_history(uuid, integer, uuid) to authenticated;
