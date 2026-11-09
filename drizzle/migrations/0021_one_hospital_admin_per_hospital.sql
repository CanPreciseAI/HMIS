-- Enforce one hospital name and one hospital administrator per hospital.
create unique index tenants_normalized_name_key
  on public.tenants (lower(btrim(name)));

create unique index hospital_admin_registration_requests_pending_name_key
  on public.hospital_admin_registration_requests (lower(btrim(hospital_name)))
  where status = 'pending';

create or replace function public.enforce_single_hospital_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_name text;
  v_lock_key text;
begin
  select lower(replace(role.name, ' ', '_'))
  into v_role_name
  from public.roles role
  where role.id = new.role_id;

  if v_role_name is distinct from 'hospital_admin' then
    return new;
  end if;

  if new.tenant_id is null then
    raise exception 'A hospital administrator must belong to one hospital';
  end if;

  for v_lock_key in
    select lock_key
    from unnest(array[
      'hospital-admin-tenant:' || new.tenant_id::text,
      'hospital-admin-user:' || new.user_id::text
    ]) as locks(lock_key)
    order by lock_key
  loop
    perform pg_advisory_xact_lock(hashtext(v_lock_key));
  end loop;

  if exists (
    select 1
    from public.user_role_assignments assignment
    join public.roles role on role.id = assignment.role_id
    where assignment.id <> new.id
      and lower(replace(role.name, ' ', '_')) = 'hospital_admin'
      and assignment.valid_from < coalesce(new.valid_until, 'infinity'::timestamptz)
      and new.valid_from < coalesce(assignment.valid_until, 'infinity'::timestamptz)
      and (
        (assignment.tenant_id = new.tenant_id and assignment.user_id <> new.user_id)
        or (assignment.user_id = new.user_id and assignment.tenant_id <> new.tenant_id)
      )
  ) then
    raise exception 'A hospital can have only one hospital administrator, and each administrator can manage only one hospital';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_single_hospital_admin() from public;

create trigger enforce_single_hospital_admin
  before insert or update of user_id, role_id, tenant_id, valid_from, valid_until
  on public.user_role_assignments
  for each row execute function public.enforce_single_hospital_admin();
