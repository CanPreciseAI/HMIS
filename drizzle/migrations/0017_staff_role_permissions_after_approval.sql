-- Preserve the existing read-permission grants when staff approval becomes
-- hospital-scoped.
create or replace function public.review_staff_access_request(
  _request_id uuid,
  _approved boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.staff_approval_requests%rowtype;
  v_profile public.staff_profiles%rowtype;
  v_facility_id uuid;
  v_department_id uuid;
  v_designation_id uuid;
  v_role_id uuid;
  v_employee_id uuid;
begin
  if auth.uid() is null or public.is_platform_admin() then
    raise exception 'Platform administrators cannot review staff requests';
  end if;

  select * into v_request
  from public.staff_approval_requests
  where id = _request_id
  for update;

  if not found then
    raise exception 'Staff approval request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Staff approval request has already been reviewed';
  end if;
  if v_request.tenant_id is null or not public.is_hospital_admin(v_request.tenant_id) then
    raise exception 'Only this hospital administrator can review the staff request';
  end if;

  if _approved then
    if not exists (
      select 1 from auth.users
      where id = v_request.user_id and email_confirmed_at is not null
    ) then
      raise exception 'The applicant must confirm their email before approval';
    end if;

    select facility.id into v_facility_id
    from public.facilities facility
    where facility.tenant_id = v_request.tenant_id
      and facility.status = 'active'
    order by facility.created_at
    limit 1;
    if v_facility_id is null then
      raise exception 'No active hospital facility is configured';
    end if;

    select * into v_profile
    from public.staff_profiles
    where id = v_request.user_id;
    if not found then
      raise exception 'Staff profile not found';
    end if;

    v_department_id := public.ensure_department(
      v_facility_id,
      coalesce(v_profile.department, 'General')
    );

    select designation.id into v_designation_id
    from public.designations designation
    where designation.code = v_request.requested_role::text
    limit 1;

    select employee.id into v_employee_id
    from public.employees employee
    where employee.tenant_id = v_request.tenant_id
      and employee.user_id = v_request.user_id
    limit 1;

    if v_employee_id is null then
      insert into public.employees
        (tenant_id, employee_code, user_id, department_id, designation_id)
      values (
        v_request.tenant_id,
        public.next_employee_code(),
        v_request.user_id,
        v_department_id,
        v_designation_id
      )
      returning id into v_employee_id;
    else
      update public.employees
      set department_id = v_department_id,
          designation_id = v_designation_id,
          employment_status = 'active'
      where id = v_employee_id;
    end if;

    insert into public.user_roles (user_id, role)
    values (v_request.user_id, v_request.requested_role)
    on conflict (user_id, role) do nothing;

    v_role_id := public.ensure_tenant_role(
      v_request.tenant_id,
      coalesce(
        (select designation.name from public.designations designation
         where designation.id = v_designation_id),
        initcap(replace(v_request.requested_role::text, '_', ' '))
      )
    );

    insert into public.role_permissions (role_id, permission_id)
    select v_role_id, permission.id
    from public.permissions permission
    where permission.action = 'read'
    on conflict (role_id, permission_id) do nothing;

    if not exists (
      select 1
      from public.user_role_assignments assignment
      where assignment.user_id = v_request.user_id
        and assignment.role_id = v_role_id
        and assignment.tenant_id = v_request.tenant_id
        and (assignment.valid_until is null or assignment.valid_until > now())
    ) then
      insert into public.user_role_assignments
        (user_id, role_id, tenant_id, facility_id, department_id)
      values (
        v_request.user_id,
        v_role_id,
        v_request.tenant_id,
        v_facility_id,
        v_department_id
      );
    end if;
  end if;

  update public.staff_approval_requests
  set status = case when _approved then 'approved' else 'rejected' end,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = _request_id;
end;
$$;

revoke all on function public.review_staff_access_request(uuid, boolean)
  from public;
grant execute on function public.review_staff_access_request(uuid, boolean)
  to authenticated;
