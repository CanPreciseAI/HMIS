-- Central administrators approve hospital administrators. Hospital
-- administrators approve staff for their own tenant.

alter table public.staff_approval_requests
  add column tenant_id uuid references public.tenants(id) on delete cascade;

update public.staff_approval_requests request
set tenant_id = facility.tenant_id
from public.facilities facility
where request.tenant_id is null
  and request.status = 'pending'
  and facility.id = public.default_facility_id();

create index staff_approval_requests_tenant_status_idx
  on public.staff_approval_requests (tenant_id, status, submitted_at);

create table public.hospital_admin_registration_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  hospital_name text not null check (length(trim(hospital_name)) between 2 and 160),
  full_name text not null,
  email text not null,
  phone text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  tenant_id uuid references public.tenants(id) on delete set null
);

create index hospital_admin_registration_requests_status_idx
  on public.hospital_admin_registration_requests (status, submitted_at);

grant select on public.hospital_admin_registration_requests to authenticated;

alter table public.hospital_admin_registration_requests enable row level security;

create policy "Applicants can view their hospital admin request"
  on public.hospital_admin_registration_requests for select to authenticated
  using (auth.uid() = user_id);

create policy "Platform admins can view hospital admin requests"
  on public.hospital_admin_registration_requests for select to authenticated
  using (public.is_platform_admin());

create or replace function public.is_hospital_admin(_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _tenant_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.user_role_assignments assignment
      join public.roles role on role.id = assignment.role_id
      where assignment.user_id = auth.uid()
        and assignment.tenant_id = _tenant_id
        and assignment.valid_from <= now()
        and (assignment.valid_until is null or assignment.valid_until > now())
        and lower(replace(role.name, ' ', '_')) = 'hospital_admin'
    )
$$;

drop policy if exists "Admins can view staff approval requests"
  on public.staff_approval_requests;

create policy "Hospital admins can view their staff approval requests"
  on public.staff_approval_requests for select to authenticated
  using (public.is_hospital_admin(tenant_id));

create or replace function public.registration_hospitals()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = public
as $$
  select tenant.id, tenant.name
  from public.tenants tenant
  where tenant.status in ('active', 'trial')
  order by tenant.name
$$;

revoke all on function public.registration_hospitals() from public;
grant execute on function public.registration_hospitals() to anon, authenticated;

create or replace function public.handle_new_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text := lower(coalesce(new.raw_user_meta_data->>'account_type', 'staff'));
  v_role text := lower(coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'receptionist'));
  v_full_name text := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'New Staff');
  v_department text := nullif(trim(new.raw_user_meta_data->>'department'), '');
  v_hospital_name text := nullif(trim(new.raw_user_meta_data->>'hospital_name'), '');
  v_tenant_id uuid := nullif(new.raw_user_meta_data->>'tenant_id', '')::uuid;
  v_phone text := nullif(trim(new.raw_user_meta_data->>'phone'), '');
  v_valid boolean;
begin
  if v_phone is null or v_phone !~ '^[+0-9][0-9 ()-]{5,19}$' then
    raise exception 'A valid mobile number is required';
  end if;

  if v_account_type = 'patient' then
    insert into public.patient_profiles (id, full_name, phone)
    values (
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'New Patient'),
      v_phone
    );
    return new;
  end if;

  if v_account_type not in ('staff', 'hospital_admin') then
    raise exception 'Unsupported account type';
  end if;

  if v_account_type = 'hospital_admin' and
    (v_hospital_name is null or length(v_hospital_name) > 160) then
    raise exception 'Enter a valid hospital name';
  end if;

  if v_account_type = 'staff'
    and lower(coalesce(new.email, '')) <> 'prajvalakka021@gmail.com' then
    if v_tenant_id is null or not exists (
      select 1 from public.tenants
      where id = v_tenant_id and status in ('active', 'trial')
    ) then
      raise exception 'Choose an approved hospital';
    end if;

    select exists (
      select 1 from unnest(enum_range(null::public.staff_role)) candidate
      where candidate::text = v_role and candidate::text <> 'admin'
    ) into v_valid;

    if not v_valid then
      raise exception 'Choose a valid staff role';
    end if;
  end if;

  insert into public.staff_profiles
    (id, full_name, phone, department, specialization, license_number)
  values (
    new.id,
    v_full_name,
    v_phone,
    v_department,
    nullif(trim(new.raw_user_meta_data->>'specialization'), ''),
    nullif(trim(new.raw_user_meta_data->>'license_number'), '')
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone,
        department = excluded.department,
        specialization = excluded.specialization,
        license_number = excluded.license_number;

  insert into public.users (id, email, phone, auth_subject)
  values (new.id, new.email, v_phone, new.id::text)
  on conflict (id) do nothing;

  if v_account_type = 'staff'
    and lower(coalesce(new.email, '')) = 'prajvalakka021@gmail.com' then
    return new;
  end if;

  if v_account_type = 'hospital_admin' then
    insert into public.hospital_admin_registration_requests
      (user_id, hospital_name, full_name, email, phone)
    values (new.id, v_hospital_name, v_full_name, new.email, v_phone);
    return new;
  end if;

  insert into public.staff_approval_requests
    (user_id, requested_role, full_name, email, phone, tenant_id)
  values (
    new.id,
    v_role::public.staff_role,
    v_full_name,
    new.email,
    v_phone,
    v_tenant_id
  );

  return new;
end;
$$;

create or replace function public.review_hospital_admin_registration(
  _request_id uuid,
  _approved boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.hospital_admin_registration_requests%rowtype;
  v_tenant_id uuid;
  v_facility_id uuid;
  v_department_id uuid;
  v_role_id uuid;
  v_slug text;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Only a platform administrator can review hospital administrator requests';
  end if;

  select * into v_request
  from public.hospital_admin_registration_requests
  where id = _request_id
  for update;

  if not found then
    raise exception 'Hospital administrator request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Hospital administrator request has already been reviewed';
  end if;

  if _approved then
    if not exists (
      select 1 from auth.users
      where id = v_request.user_id and email_confirmed_at is not null
    ) then
      raise exception 'The applicant must confirm their email before approval';
    end if;

    if exists (
      select 1 from public.tenants
      where lower(name) = lower(v_request.hospital_name)
    ) then
      raise exception 'A hospital with this name is already registered';
    end if;

    v_slug := trim(both '-' from regexp_replace(
      lower(v_request.hospital_name), '[^a-z0-9]+', '-', 'g'
    ));
    v_slug := left(coalesce(nullif(v_slug, ''), 'hospital'), 80)
      || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);

    insert into public.tenants (name, slug, status)
    values (v_request.hospital_name, v_slug, 'active')
    returning id into v_tenant_id;

    insert into public.facilities (tenant_id, name, facility_code)
    values (v_tenant_id, v_request.hospital_name, 'MAIN')
    returning id into v_facility_id;

    insert into public.departments (tenant_id, facility_id, name, department_code)
    values (v_tenant_id, v_facility_id, 'Administration', 'ADMIN')
    returning id into v_department_id;

    v_role_id := public.ensure_tenant_role(v_tenant_id, 'hospital_admin');

    insert into public.employees
      (tenant_id, employee_code, user_id, department_id)
    values (
      v_tenant_id,
      'HADM-' || left(replace(v_request.user_id::text, '-', ''), 8),
      v_request.user_id,
      v_department_id
    );

    insert into public.user_role_assignments
      (user_id, role_id, tenant_id, facility_id, department_id)
    values
      (v_request.user_id, v_role_id, v_tenant_id, v_facility_id, v_department_id);

    update public.hospital_admin_registration_requests
    set status = 'approved',
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        tenant_id = v_tenant_id
    where id = _request_id;
  else
    update public.hospital_admin_registration_requests
    set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
    where id = _request_id;
  end if;
end;
$$;

revoke all on function public.review_hospital_admin_registration(uuid, boolean)
  from public;
grant execute on function public.review_hospital_admin_registration(uuid, boolean)
  to authenticated;

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

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'hospital_admin_registration_requests'
    ) then
    execute 'alter publication supabase_realtime add table public.hospital_admin_registration_requests';
  end if;
end;
$$;
