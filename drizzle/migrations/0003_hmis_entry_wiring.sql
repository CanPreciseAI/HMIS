-- Connect the entries that exist in the app today (staff registration, staff
-- approval, patient registration) to the multi-tenant tables from 0002.
--
--   auth signUp (staff)  -> public.users, departments, employees, staff_profiles,
--                           staff_approval_requests   (handle_new_staff)
--   admin approves       -> roles, role_permissions, user_role_assignments,
--                           user_roles               (review_staff_access_request)
--   auth signUp (patient) -> public.users, patient_profiles  (already wired)
--
-- Everything runs as security definer so the writes do not depend on the
-- registering user's row level security.

-- ---------------------------------------------------------------------------
-- Default tenant + facility, so a first registration has a home
-- ---------------------------------------------------------------------------

insert into public.tenants (name, slug, subscription_plan_id, status)
values (
  'CanPreciseAI',
  'canprecise',
  (select id from public.subscription_plans where code = 'growth'),
  'active'
)
on conflict (slug) do nothing;

insert into public.facilities (tenant_id, name, facility_code, address, timezone)
select
  t.id,
  'Main Hospital',
  'MAIN',
  'CanPreciseAI Care Network',
  'Asia/Kolkata'
from public.tenants t
where t.slug = 'canprecise'
on conflict (tenant_id, facility_code) do nothing;

create or replace function public.default_facility_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select f.id
  from public.facilities f
  join public.tenants t on t.id = f.tenant_id
  where t.slug = 'canprecise' and f.facility_code = 'MAIN'
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Employee numbers
-- ---------------------------------------------------------------------------

create sequence if not exists public.employee_code_seq start with 1 increment by 1;

create or replace function public.next_employee_code()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'EMP-' || lpad(nextval('public.employee_code_seq')::text, 4, '0')
$$;

-- ---------------------------------------------------------------------------
-- Department resolution: reuse a department with the same name, or create it
-- from the free-text department the staff registration form collects.
-- ---------------------------------------------------------------------------

create or replace function public.ensure_department(_facility_id uuid, _name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(_name), '');
  v_code text;
  v_tenant uuid;
  v_id uuid;
begin
  if _facility_id is null or v_name is null then
    return null;
  end if;

  select d.id
    into v_id
    from public.departments d
    where d.facility_id = _facility_id
      and lower(d.name) = lower(v_name)
    limit 1;

  if v_id is not null then
    return v_id;
  end if;

  select f.tenant_id into v_tenant
    from public.facilities f
    where f.id = _facility_id;

  v_code := upper(left(regexp_replace(v_name, '[^a-zA-Z0-9]+', '_', 'g'), 24));

  insert into public.departments (tenant_id, facility_id, name, department_code)
  values (v_tenant, _facility_id, v_name, v_code)
  on conflict (facility_id, department_code) do update
    set name = excluded.name
  returning id into v_id;

  return v_id;
end;
$$;

-- Keep the employee row in step with the staff profile (idempotent).
create or replace function public.upsert_employee_for_user(
  _user_id uuid,
  _department_name text,
  _role text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_facility uuid := public.default_facility_id();
  v_tenant uuid;
  v_department uuid;
  v_designation uuid;
  v_role text := lower(coalesce(nullif(_role, ''), 'receptionist'));
  v_employee uuid;
begin
  if v_facility is null then
    return null;
  end if;

  select f.tenant_id into v_tenant
    from public.facilities f
    where f.id = v_facility;

  v_department := public.ensure_department(v_facility, _department_name);

  select dg.id into v_designation
    from public.designations dg
    where dg.code = v_role
    limit 1;

  select e.id into v_employee
    from public.employees e
    where e.user_id = _user_id
      and e.tenant_id = v_tenant
    limit 1;

  if v_employee is not null then
    update public.employees
      set department_id = coalesce(v_department, department_id),
          designation_id = coalesce(v_designation, designation_id)
      where id = v_employee;
    return v_employee;
  end if;

  insert into public.employees
    (tenant_id, employee_code, user_id, department_id, designation_id)
  values
    (v_tenant, public.next_employee_code(), _user_id, v_department, v_designation)
  returning id into v_employee;

  return v_employee;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff registration entry
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text := lower(coalesce(new.raw_user_meta_data->>'account_type', 'staff'));
  v_role text := lower(coalesce(nullif(new.raw_user_meta_data->>'role',''), 'receptionist'));
  v_full_name text := coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'New Staff');
  v_department text := nullif(new.raw_user_meta_data->>'department','');
  v_valid boolean;
  v_phone text := nullif(trim(new.raw_user_meta_data->>'phone'), '');
begin
  if v_phone is null or v_phone !~ '^[+0-9][0-9 ()-]{5,19}$' then
    raise exception 'A valid mobile number is required';
  end if;

  if v_account_type = 'patient' then
    insert into public.patient_profiles (id, full_name, phone)
    values (new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'New Patient'), v_phone);
    return new;
  end if;

  insert into public.staff_profiles (id, full_name, phone, department, specialization, license_number)
  values (
    new.id,
    v_full_name,
    v_phone,
    v_department,
    nullif(new.raw_user_meta_data->>'specialization',''),
    nullif(new.raw_user_meta_data->>'license_number','')
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone,
        department = coalesce(excluded.department, public.staff_profiles.department),
        specialization = coalesce(excluded.specialization, public.staff_profiles.specialization),
        license_number = coalesce(excluded.license_number, public.staff_profiles.license_number);

  select exists (
    select 1
    from unnest(enum_range(null::public.staff_role)) r
    where r::text = v_role and r::text <> 'admin'
  ) into v_valid;

  if not v_valid then
    v_role := 'receptionist';
  end if;

  insert into public.staff_approval_requests
    (user_id, requested_role, full_name, email, phone)
  values (
    new.id,
    v_role::public.staff_role,
    v_full_name,
    new.email,
    v_phone
  )
  on conflict (user_id) do nothing;

  -- Identity + employment records.
  insert into public.users (id, email, phone, auth_subject)
  values (new.id, new.email, v_phone, new.id::text)
  on conflict (id) do nothing;

  perform public.upsert_employee_for_user(new.id, v_department, v_role);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff approval entry
-- ---------------------------------------------------------------------------

create or replace function public.ensure_tenant_role(_tenant_id uuid, _name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_role text := nullif(trim(_name), '');
begin
  if _tenant_id is null or v_role is null then
    return null;
  end if;

  select r.id into v_id
    from public.roles r
    where r.tenant_id = _tenant_id
      and lower(r.name) = lower(v_role)
    limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.roles (tenant_id, name, scope_type, description)
  values (_tenant_id, v_role, 'tenant', 'Seeded from staff access approval')
  returning id into v_id;

  return v_id;
end;
$$;

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
  v_request public.staff_approval_requests;
  v_profile public.staff_profiles;
  v_facility uuid := public.default_facility_id();
  v_tenant uuid;
  v_employee uuid;
  v_department uuid;
  v_designation_name text;
  v_role uuid;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only an administrator can review staff requests';
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

  if _approved then
    insert into public.user_roles (user_id, role)
    values (v_request.user_id, v_request.requested_role)
    on conflict (user_id, role) do nothing;

    select * into v_profile
      from public.staff_profiles
      where id = v_request.user_id;

    v_employee := public.upsert_employee_for_user(
      v_request.user_id,
      v_profile.department,
      v_request.requested_role::text
    );

    if v_facility is not null then
      select f.tenant_id into v_tenant
        from public.facilities f
        where f.id = v_facility;
    end if;

    select dg.name into v_designation_name
      from public.designations dg
      where dg.code = v_request.requested_role::text;

    v_role := public.ensure_tenant_role(
      v_tenant,
      coalesce(v_designation_name, initcap(replace(v_request.requested_role::text, '_', ' ')))
    );

    if v_employee is not null then
      select e.department_id into v_department
        from public.employees e
        where e.id = v_employee;
    end if;

    if v_role is not null and v_tenant is not null then
      -- Administrators can manage every module; other roles start read-only.
      insert into public.role_permissions (role_id, permission_id)
      select v_role, p.id
        from public.permissions p
        where p.action = 'read'
           or v_request.requested_role = 'admin'
      on conflict (role_id, permission_id) do nothing;

      if not exists (
        select 1
        from public.user_role_assignments a
        where a.user_id = v_request.user_id
          and a.role_id = v_role
          and a.tenant_id = v_tenant
          and (a.valid_until is null or a.valid_until > now())
      ) then
        insert into public.user_role_assignments
          (user_id, role_id, tenant_id, facility_id, department_id)
        values
          (v_request.user_id, v_role, v_tenant, v_facility, v_department);
      end if;
    end if;
  else
    update public.employees
      set employment_status = 'terminated'
      where user_id = v_request.user_id
        and employee_code is not null;
  end if;

  update public.staff_approval_requests
    set status = case when _approved then 'approved' else 'rejected' end,
        reviewed_at = now(),
        reviewed_by = auth.uid()
    where id = _request_id;
end;
$$;

revoke all on function public.review_staff_access_request(uuid, boolean) from public;
grant execute on function public.review_staff_access_request(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: staff who registered before this migration
-- ---------------------------------------------------------------------------

do $$
declare
  v_row record;
begin
  for v_row in
    select
      sp.id,
      sp.department,
      coalesce(ur.role::text, req.requested_role::text, 'receptionist') as role
    from public.staff_profiles sp
    left join lateral (
      select r.role
      from public.user_roles r
      where r.user_id = sp.id
      order by (r.role = 'admin') desc
      limit 1
    ) ur on true
    left join public.staff_approval_requests req on req.user_id = sp.id
  loop
    perform public.upsert_employee_for_user(v_row.id, v_row.department, v_row.role);
  end loop;

  -- Assign the tenant role to staff who were already approved.
  for v_row in
    select
      sp.id as user_id,
      coalesce(ur.role::text, 'receptionist') as role,
      public.ensure_tenant_role(
        (select f.tenant_id from public.facilities f where f.id = public.default_facility_id()),
        coalesce(
          (select dg.name from public.designations dg
            where dg.code = coalesce(ur.role::text, 'receptionist')),
          initcap(replace(coalesce(ur.role::text, 'receptionist'), '_', ' '))
        )
      ) as role_id,
      e.department_id
    from public.staff_profiles sp
    join public.user_roles ur on ur.user_id = sp.id
    left join public.employees e on e.user_id = sp.id
  loop
    if v_row.role_id is not null and not exists (
      select 1 from public.user_role_assignments a
      where a.user_id = v_row.user_id and a.role_id = v_row.role_id
    ) then
      insert into public.user_role_assignments
        (user_id, role_id, tenant_id, facility_id, department_id)
      values (
        v_row.user_id,
        v_row.role_id,
        (select f.tenant_id from public.facilities f where f.id = public.default_facility_id()),
        public.default_facility_id(),
        v_row.department_id
      );
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- One read used by the signed-in chrome (dashboard)
-- ---------------------------------------------------------------------------

create or replace function public.my_employment()
returns table (
  tenant_name text,
  tenant_slug text,
  facility_name text,
  facility_code text,
  department_name text,
  designation_name text,
  employee_code text,
  employment_status text,
  role_names text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.name,
    t.slug,
    f.name,
    f.facility_code,
    d.name,
    dg.name,
    e.employee_code,
    e.employment_status,
    coalesce(array_agg(distinct r.name) filter (where r.name is not null), '{}')
  from public.employees e
  join public.tenants t on t.id = e.tenant_id
  left join public.departments d on d.id = e.department_id
  left join public.facilities f on f.id = d.facility_id
  left join public.designations dg on dg.id = e.designation_id
  left join public.user_role_assignments a
    on a.user_id = e.user_id
   and a.tenant_id = e.tenant_id
   and a.valid_from <= now()
   and (a.valid_until is null or a.valid_until > now())
  left join public.roles r on r.id = a.role_id
  where e.user_id = auth.uid()
  group by t.name, t.slug, f.name, f.facility_code, d.name, dg.name,
           e.employee_code, e.employment_status
  limit 1
$$;

revoke all on function public.my_employment() from public;
grant execute on function public.my_employment() to authenticated;

revoke all on function public.default_facility_id() from public;
revoke all on function public.ensure_department(uuid, text) from public;
revoke all on function public.upsert_employee_for_user(uuid, text, text) from public;
revoke all on function public.ensure_tenant_role(uuid, text) from public;
revoke all on function public.next_employee_code() from public;
