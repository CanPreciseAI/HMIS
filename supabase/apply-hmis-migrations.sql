-- CanPreciseAI HMIS schema, generated from drizzle/migrations/*.sql.
-- Fresh Supabase projects only; prefer `npm run db:apply` for resumable migrations.
-- Regenerate this file from the migration sources rather than editing it.

-- 0000_hmis_staff_auth.sql
-- ============================================================================

create type public.staff_role as enum ('admin','doctor','nurse','lab_technician','pharmacist','receptionist');

create table public.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  department text,
  specialization text,
  license_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.staff_role not null,
  unique (user_id, role)
);

grant select, insert, update, delete on public.staff_profiles to authenticated;
grant all on public.staff_profiles to service_role;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.staff_profiles enable row level security;
alter table public.user_roles enable row level security;

create policy "Staff can view own profile"
  on public.staff_profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Staff can insert own profile"
  on public.staff_profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Staff can update own profile"
  on public.staff_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Staff can view own roles"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.staff_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.handle_new_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := lower(coalesce(nullif(new.raw_user_meta_data->>'role',''), 'receptionist'));
  v_valid boolean;
begin
  insert into public.staff_profiles (id, full_name, phone, department, specialization, license_number)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'New Staff'),
    nullif(new.raw_user_meta_data->>'phone',''),
    nullif(new.raw_user_meta_data->>'department',''),
    nullif(new.raw_user_meta_data->>'specialization',''),
    nullif(new.raw_user_meta_data->>'license_number','')
  );

  select exists (
    select 1 from unnest(enum_range(null::public.staff_role)) r where r::text = v_role
  ) into v_valid;

  if v_valid then
    insert into public.user_roles (user_id, role)
    values (new.id, v_role::public.staff_role)
    on conflict (user_id, role) do nothing;
  else
    insert into public.user_roles (user_id, role)
    values (new.id, 'receptionist')
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end;
$$;

create trigger on_staff_created
  after insert on auth.users
  for each row execute function public.handle_new_staff();

-- 0001_patient_accounts.sql
-- ============================================================================

create table public.patient_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_approval_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  requested_role public.staff_role not null check (requested_role <> 'admin'),
  full_name text not null,
  email text not null,
  phone text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

grant select, update on public.patient_profiles to authenticated;
grant all on public.patient_profiles to service_role;
grant select on public.staff_approval_requests to authenticated;
grant all on public.staff_approval_requests to service_role;

alter table public.patient_profiles enable row level security;
alter table public.staff_approval_requests enable row level security;

create policy "Patients can view own profile"
  on public.patient_profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Patients can update own profile"
  on public.patient_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Staff can view own approval request"
  on public.staff_approval_requests for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Admins can view staff approval requests"
  on public.staff_approval_requests for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can view staff profiles"
  on public.staff_profiles for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create or replace function public.handle_new_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text := lower(coalesce(new.raw_user_meta_data->>'account_type', 'staff'));
  v_role text := lower(coalesce(nullif(new.raw_user_meta_data->>'role',''), 'receptionist'));
  v_valid boolean;
  v_phone text := nullif(trim(new.raw_user_meta_data->>'phone'), '');
begin
  if v_phone is null or v_phone !~ '^[+0-9][0-9 ()-]{5,19}$' then
    raise exception 'A valid mobile number is required';
  end if;

  if v_account_type = 'patient' then
    insert into public.patient_profiles (id, full_name, phone)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'New Patient'),
      v_phone
    );
    return new;
  end if;

  insert into public.staff_profiles (id, full_name, phone, department, specialization, license_number)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'New Staff'),
    v_phone,
    nullif(new.raw_user_meta_data->>'department',''),
    nullif(new.raw_user_meta_data->>'specialization',''),
    nullif(new.raw_user_meta_data->>'license_number','')
  );

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
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'New Staff'),
    new.email,
    v_phone
  );

  return new;
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
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only an administrator can review staff requests';
  end if;

  select *
    into v_request
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

create or replace function public.promote_confirmed_staff_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.email_confirmed_at is not null
    or new.email_confirmed_at is null
    or lower(new.email) <> 'prajvalakka021@gmail.com'
    or lower(coalesce(new.raw_user_meta_data->>'account_type', 'staff')) <> 'staff' then
    return new;
  end if;

  insert into public.staff_profiles (id, full_name, phone)
  values (
    new.id,
    'Prajval Akka',
    nullif(trim(new.raw_user_meta_data->>'phone'), '')
  )
  on conflict (id) do update set full_name = 'Prajval Akka';

  insert into public.user_roles (user_id, role)
  values (new.id, 'admin')
  on conflict (user_id, role) do nothing;

  delete from public.staff_approval_requests
    where user_id = new.id and status = 'pending';

  return new;
end;
$$;

create trigger promote_confirmed_staff_admin
  after update of email_confirmed_at on auth.users
  for each row execute function public.promote_confirmed_staff_admin();

do $$
declare
  v_admin auth.users%rowtype;
begin
  select *
    into v_admin
    from auth.users
    where lower(email) = 'prajvalakka021@gmail.com'
      and email_confirmed_at is not null
      and lower(coalesce(raw_user_meta_data->>'account_type', 'staff')) = 'staff'
    limit 1;

  if found then
    insert into public.staff_profiles (id, full_name, phone)
    values (
      v_admin.id,
      'Prajval Akka',
      nullif(trim(v_admin.raw_user_meta_data->>'phone'), '')
    )
    on conflict (id) do update set full_name = 'Prajval Akka';

    insert into public.user_roles (user_id, role)
    values (v_admin.id, 'admin')
    on conflict (user_id, role) do nothing;

    delete from public.staff_approval_requests
      where user_id = v_admin.id and status = 'pending';
  end if;
end;
$$;

-- 0002_hmis_multi_tenant_core.sql
-- ============================================================================

-- Multi-tenant HMIS core schema.
--
-- Master data (platform scope): subscription_plans, designations, permissions.
-- Tenant scope chain:          tenants -> facilities -> departments -> employees.
-- Identity and access:         users, user_sessions, roles, role_permissions,
--                              user_role_assignments.
--
-- Scope columns follow the ERD: a tenant_id / facility_id / department_id column
-- is a polymorphic scope link, not necessarily a foreign key on every table.

-- ---------------------------------------------------------------------------
-- Master data
-- ---------------------------------------------------------------------------

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  currency text not null default 'INR',
  billing_interval text not null default 'monthly'
    check (billing_interval in ('monthly', 'quarterly', 'yearly', 'lifetime')),
  max_facilities integer check (max_facilities is null or max_facilities > 0),
  max_employees integer check (max_employees is null or max_employees > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.designations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  module text not null,
  action text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (module, action)
);

-- ---------------------------------------------------------------------------
-- Tenant scope
-- ---------------------------------------------------------------------------

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  subscription_plan_id uuid references public.subscription_plans(id)
    on delete restrict,
  status text not null default 'trial'
    check (status in ('trial', 'active', 'suspended', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  facility_code text not null,
  address text,
  timezone text not null default 'Asia/Kolkata',
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, facility_code)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete cascade,
  name text not null,
  department_code text not null,
  parent_id uuid references public.departments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (facility_id, department_code),
  check (parent_id is null or parent_id <> id)
);

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

-- One row per Supabase auth user. `auth_subject` mirrors the auth user id so an
-- external identity provider subject can be added later without moving the PK.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text,
  auth_subject text unique,
  status text not null default 'active'
    check (status in ('active', 'invited', 'suspended', 'disabled')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_code text not null,
  user_id uuid references public.users(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  designation_id uuid references public.designations(id) on delete set null,
  employment_status text not null default 'active'
    check (employment_status in ('active', 'probation', 'notice', 'terminated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, employee_code)
);

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

-- tenant_id is null for platform-wide (system) roles.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  name text not null,
  scope_type text not null default 'tenant'
    check (scope_type in ('platform', 'tenant', 'facility', 'department')),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index roles_tenant_name_key
  on public.roles (tenant_id, name) nulls not distinct;

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  facility_id uuid references public.facilities(id) on delete cascade,
  department_id uuid references public.departments(id) on delete cascade,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_until > valid_from)
);

create index facilities_tenant_idx on public.facilities (tenant_id);
create index departments_tenant_idx on public.departments (tenant_id);
create index departments_facility_idx on public.departments (facility_id);
create index employees_tenant_idx on public.employees (tenant_id);
create index employees_user_idx on public.employees (user_id);
create index employees_department_idx on public.employees (department_id);
create index roles_tenant_idx on public.roles (tenant_id);
create index user_sessions_user_idx on public.user_sessions (user_id);
create index user_role_assignments_user_idx
  on public.user_role_assignments (user_id);
create index user_role_assignments_tenant_idx
  on public.user_role_assignments (tenant_id);
create index user_role_assignments_role_idx
  on public.user_role_assignments (role_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.subscription_plans
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.designations
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.facilities
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.departments
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.employees
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.roles
  for each row execute function public.set_updated_at();

-- Mirror every new auth user into public.users (staff, patients and admins).
create or replace function public.handle_new_public_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, phone, auth_subject, status)
  values (
    new.id,
    new.email,
    nullif(trim(new.raw_user_meta_data->>'phone'), ''),
    new.id::text,
    'active'
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, public.users.email),
        phone = coalesce(excluded.phone, public.users.phone);

  return new;
end;
$$;

create trigger on_public_user_created
  after insert on auth.users
  for each row execute function public.handle_new_public_user();

-- Backfill accounts that already existed before this migration.
insert into public.users (id, email, phone, auth_subject)
select
  u.id,
  u.email,
  nullif(trim(u.raw_user_meta_data->>'phone'), ''),
  u.id::text
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tenant scope helpers (security definer so policy checks do not recurse)
-- ---------------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.has_role(auth.uid(), 'admin')
$$;

create or replace function public.is_tenant_member(_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _tenant_id is not null
    and auth.uid() is not null
    and (
      exists (
        select 1
        from public.employees e
        where e.tenant_id = _tenant_id
          and e.user_id = auth.uid()
          and e.employment_status <> 'terminated'
      )
      or exists (
        select 1
        from public.user_role_assignments a
        where a.tenant_id = _tenant_id
          and a.user_id = auth.uid()
          and a.valid_from <= now()
          and (a.valid_until is null or a.valid_until > now())
      )
    )
$$;

create or replace function public.is_tenant_admin(_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or (
      _tenant_id is not null
      and exists (
        select 1
        from public.user_role_assignments a
        join public.roles r on r.id = a.role_id
        where a.user_id = auth.uid()
          and a.tenant_id = _tenant_id
          and a.valid_from <= now()
          and (a.valid_until is null or a.valid_until > now())
          and lower(replace(r.name, ' ', '_')) in (
            'admin', 'tenant_admin', 'hospital_admin', 'owner'
          )
      )
    )
$$;

create or replace function public.has_permission(_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.user_role_assignments a
      join public.role_permissions rp on rp.role_id = a.role_id
      join public.permissions p on p.id = rp.permission_id
      where a.user_id = auth.uid()
        and p.code = _code
        and a.valid_from <= now()
        and (a.valid_until is null or a.valid_until > now())
    )
$$;

revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_tenant_member(uuid) from public;
revoke all on function public.is_tenant_admin(uuid) from public;
revoke all on function public.has_permission(text) from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_tenant_member(uuid) to authenticated;
grant execute on function public.is_tenant_admin(uuid) to authenticated;
grant execute on function public.has_permission(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants + row level security
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.subscription_plans to authenticated;
grant select, insert, update, delete on public.designations to authenticated;
grant select, insert, update, delete on public.permissions to authenticated;
grant select, insert, update, delete on public.tenants to authenticated;
grant select, insert, update, delete on public.facilities to authenticated;
grant select, insert, update, delete on public.departments to authenticated;
grant select, insert, update, delete on public.users to authenticated;
grant select, insert, update, delete on public.user_sessions to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
grant select, insert, update, delete on public.roles to authenticated;
grant select, insert, update, delete on public.role_permissions to authenticated;
grant select, insert, update, delete on public.user_role_assignments to authenticated;

grant all on public.subscription_plans to service_role;
grant all on public.designations to service_role;
grant all on public.permissions to service_role;
grant all on public.tenants to service_role;
grant all on public.facilities to service_role;
grant all on public.departments to service_role;
grant all on public.users to service_role;
grant all on public.user_sessions to service_role;
grant all on public.employees to service_role;
grant all on public.roles to service_role;
grant all on public.role_permissions to service_role;
grant all on public.user_role_assignments to service_role;

alter table public.subscription_plans enable row level security;
alter table public.designations enable row level security;
alter table public.permissions enable row level security;
alter table public.tenants enable row level security;
alter table public.facilities enable row level security;
alter table public.departments enable row level security;
alter table public.users enable row level security;
alter table public.user_sessions enable row level security;
alter table public.employees enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_role_assignments enable row level security;

-- Master data: readable by any signed-in user, writable by platform admins.
create policy "Members can view subscription plans"
  on public.subscription_plans for select to authenticated using (true);

create policy "Platform admins manage subscription plans"
  on public.subscription_plans for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Members can view designations"
  on public.designations for select to authenticated using (true);

create policy "Platform admins manage designations"
  on public.designations for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Members can view permissions"
  on public.permissions for select to authenticated using (true);

create policy "Platform admins manage permissions"
  on public.permissions for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Tenants.
create policy "Members can view their tenant"
  on public.tenants for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(id));

create policy "Platform admins create tenants"
  on public.tenants for insert to authenticated
  with check (public.is_platform_admin());

create policy "Platform admins manage tenants"
  on public.tenants for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Tenant admins update their tenant"
  on public.tenants for update to authenticated
  using (public.is_tenant_admin(id))
  with check (public.is_tenant_admin(id));

create policy "Platform admins delete tenants"
  on public.tenants for delete to authenticated
  using (public.is_platform_admin());

-- Tenant-scoped operational tables.
create policy "Tenant members can view facilities"
  on public.facilities for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage facilities"
  on public.facilities for all to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy "Tenant members can view departments"
  on public.departments for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage departments"
  on public.departments for all to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

create policy "Tenant members can view employees"
  on public.employees for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage employees"
  on public.employees for all to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

-- Identity.
create policy "Users can view their own record"
  on public.users for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());

create policy "Users can update their own record"
  on public.users for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Platform admins manage users"
  on public.users for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Users can view their own sessions"
  on public.user_sessions for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

create policy "Users can revoke their own sessions"
  on public.user_sessions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Platform admins manage sessions"
  on public.user_sessions for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Access control.
create policy "Members can view roles in scope"
  on public.roles for select to authenticated
  using (
    tenant_id is null
    or public.is_platform_admin()
    or public.is_tenant_member(tenant_id)
  );

create policy "Tenant admins manage roles"
  on public.roles for all to authenticated
  using (
    public.is_platform_admin()
    or (tenant_id is not null and public.is_tenant_admin(tenant_id))
  )
  with check (
    public.is_platform_admin()
    or (tenant_id is not null and public.is_tenant_admin(tenant_id))
  );

create policy "Members can view role permissions in scope"
  on public.role_permissions for select to authenticated
  using (
    exists (
      select 1
      from public.roles r
      where r.id = role_id
        and (
          r.tenant_id is null
          or public.is_platform_admin()
          or public.is_tenant_member(r.tenant_id)
        )
    )
  );

create policy "Tenant admins manage role permissions"
  on public.role_permissions for all to authenticated
  using (
    exists (
      select 1
      from public.roles r
      where r.id = role_id
        and (
          public.is_platform_admin()
          or (r.tenant_id is not null and public.is_tenant_admin(r.tenant_id))
        )
    )
  )
  with check (
    exists (
      select 1
      from public.roles r
      where r.id = role_id
        and (
          public.is_platform_admin()
          or (r.tenant_id is not null and public.is_tenant_admin(r.tenant_id))
        )
    )
  );

create policy "Members can view assignments in scope"
  on public.user_role_assignments for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_platform_admin()
    or (tenant_id is not null and public.is_tenant_member(tenant_id))
  );

create policy "Tenant admins manage assignments"
  on public.user_role_assignments for all to authenticated
  using (
    public.is_platform_admin()
    or (tenant_id is not null and public.is_tenant_admin(tenant_id))
  )
  with check (
    public.is_platform_admin()
    or (tenant_id is not null and public.is_tenant_admin(tenant_id))
  );

-- ---------------------------------------------------------------------------
-- Master data seeds
-- ---------------------------------------------------------------------------

insert into public.subscription_plans
  (code, name, description, price_cents, currency, billing_interval,
   max_facilities, max_employees)
values
  ('starter', 'Starter', 'Single facility practice', 0, 'INR', 'monthly', 1, 25),
  ('growth', 'Growth', 'Multi-facility hospital group', 0, 'INR', 'monthly', 5, 250),
  ('enterprise', 'Enterprise', 'Unlimited facilities and staff', 0, 'INR', 'yearly', null, null)
on conflict (code) do nothing;

insert into public.designations (code, name, description)
values
  ('doctor', 'Doctor', 'Consultations, diagnoses and prescriptions'),
  ('nurse', 'Nurse', 'Ward care and patient monitoring'),
  ('lab_technician', 'Lab Technician', 'Samples, tests and reports'),
  ('pharmacist', 'Pharmacist', 'Dispensing and inventory'),
  ('receptionist', 'Receptionist', 'Registration and appointments'),
  ('admin', 'Administrator', 'Tenant administration and staff access')
on conflict (code) do nothing;

insert into public.permissions (module, action, code, description)
select
  m.module,
  a.action,
  m.module || '.' || a.action,
  initcap(m.module) || ' ' || a.action
from unnest(
  array[
    'tenants', 'facilities', 'departments', 'employees',
    'roles', 'permissions', 'users', 'sessions'
  ]
) as m(module)
cross join unnest(array['read', 'manage']) as a(action)
where not (m.module = 'sessions' and a.action = 'manage')
on conflict (code) do nothing;

-- Example tenant role templates are intentionally not seeded: roles are created
-- per tenant from the designations and permission catalog above.

-- 0003_hmis_entry_wiring.sql
-- ============================================================================

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

-- 0004_hmis_shared_foundations.sql
-- ============================================================================

-- Shared foundations: facility master registries (beds, bank accounts,
-- cost centres, shifts, leave types, notification templates), the document
-- register, and the approval workflow that most other modules hang off.
--
-- Part of the HMIS backend described by HMIS_Design_Detail_v2.
-- Tenancy follows the global conventions: tenant-owned rows carry
-- tenant_id, or inherit it through the parent chain named in the
-- policy. Rows are deactivated by status, never hard-deleted.

-- Master registry behind bed_assignments (ERD master data).
create table public.beds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete cascade not null,
  bed_code text not null,
  ward text not null default 'General',
  bed_type text not null default 'general',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (facility_id, bed_code)
);
create index beds_tenant_id_idx on public.beds (tenant_id);
create index beds_facility_id_idx on public.beds (facility_id);

-- Master registry behind bank_reconciliations.
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  account_name text not null,
  account_number text not null,
  bank_name text not null,
  currency text not null default 'INR',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, account_number)
);
create index bank_accounts_tenant_id_idx on public.bank_accounts (tenant_id);

-- Master registry behind journal_lines.cost_center_id.
create table public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  code text not null,
  name text not null,
  department_id uuid references public.departments(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create index cost_centers_tenant_id_idx on public.cost_centers (tenant_id);
create index cost_centers_department_id_idx on public.cost_centers (department_id);

-- Master registry behind shift_assignments.
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  name text not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);
create index shifts_tenant_id_idx on public.shifts (tenant_id);

-- Master registry behind leave_requests.
create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  code text not null,
  name text not null,
  max_days_per_year int check (max_days_per_year is null or max_days_per_year >= 0),
  is_paid boolean not null default true,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create index leave_types_tenant_id_idx on public.leave_types (tenant_id);

-- Master registry behind notification_jobs.
create table public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  code text not null,
  channel text not null check (channel in ('email', 'sms', 'push', 'in_app', 'whatsapp')),
  subject text,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create index notification_templates_tenant_id_idx on public.notification_templates (tenant_id);

-- Canonical document register; clinical_documents and imaging_studies point here.
create table public.document_metadata (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  storage_key text not null unique,
  document_type text not null,
  checksum text not null,
  classification text not null,
  retention_class text not null,
  status text not null default 'active' check (status in ('active', 'archived', 'purged')),
  archived_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index document_metadata_tenant_id_idx on public.document_metadata (tenant_id);

-- Generic approval workflow (entity_id is a polymorphic REF).
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  entity_type text not null,
  entity_id uuid,
  entity_version int not null default 1 check (entity_version > 0),
  workflow_type text not null,
  requested_by uuid references public.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  resolved_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index approval_requests_tenant_id_idx on public.approval_requests (tenant_id);
create index approval_requests_requested_by_idx on public.approval_requests (requested_by);

create table public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid references public.approval_requests(id) on delete cascade not null,
  step_number int not null check (step_number > 0),
  approver_role_id uuid references public.roles(id) on delete restrict not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'skipped')),
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  comment text,
  created_at timestamptz not null default now(),
  unique (approval_request_id, step_number)
);
create index approval_steps_approval_request_id_idx on public.approval_steps (approval_request_id);
create index approval_steps_approver_role_id_idx on public.approval_steps (approver_role_id);
create index approval_steps_approved_by_idx on public.approval_steps (approved_by);

-- ---------------------------------------------------------------------------
-- Grants, row level security and indexes
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
  'beds',
  'bank_accounts',
  'cost_centers',
  'shifts',
  'leave_types',
  'notification_templates',
  'document_metadata',
  'approval_requests',
  'approval_steps'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

create policy "Tenant members can read beds"
  on public.beds for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage beds"
  on public.beds for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read bank_accounts"
  on public.bank_accounts for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage bank_accounts"
  on public.bank_accounts for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read cost_centers"
  on public.cost_centers for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage cost_centers"
  on public.cost_centers for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read shifts"
  on public.shifts for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage shifts"
  on public.shifts for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read leave_types"
  on public.leave_types for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage leave_types"
  on public.leave_types for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

-- Platform defaults (tenant_id null) are readable by everyone; tenant rows follow
-- the normal tenant rules.
create policy "Readable notification templates"
  on public.notification_templates for select to authenticated
  using (tenant_id is null or public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage notification templates"
  on public.notification_templates for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read document_metadata"
  on public.document_metadata for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage document_metadata"
  on public.document_metadata for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read approval_requests"
  on public.approval_requests for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage approval_requests"
  on public.approval_requests for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read approval_steps"
  on public.approval_steps for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select r.tenant_id from public.approval_requests r where r.id = approval_request_id)));

create policy "Tenant admins manage approval_steps"
  on public.approval_steps for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select r.tenant_id from public.approval_requests r where r.id = approval_request_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select r.tenant_id from public.approval_requests r where r.id = approval_request_id)));

do $$
declare
  t text;
begin
  foreach t in array array[
    'beds',
    'bank_accounts',
    'cost_centers',
    'shifts',
    'leave_types',
    'notification_templates',
    'document_metadata',
    'approval_requests'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- 0005_hmis_patients_clinical.sql
-- ============================================================================

-- Patients, identity records, encounters and clinical documentation.
--
-- Part of the HMIS backend described by HMIS_Design_Detail_v2.
-- Tenancy follows the global conventions: tenant-owned rows carry
-- tenant_id, or inherit it through the parent chain named in the
-- policy. Rows are deactivated by status, never hard-deleted.

-- Patient number is tenant-wide by design.
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  patient_number text not null,
  name text not null,
  date_of_birth date not null,
  sex text not null check (sex in ('female', 'male', 'other', 'unknown')),
  contact_details text,
  status text not null default 'active' check (status in ('active', 'merged', 'deactivated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, patient_number)
);
create index patients_tenant_id_idx on public.patients (tenant_id);

-- Identifiers are moved on merge, never duplicated.
create table public.patient_identifiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  identifier_type text not null,
  identifier_value text not null,
  issuing_authority text,
  created_at timestamptz not null default now(),
  unique (tenant_id, identifier_type, identifier_value)
);
create index patient_identifiers_tenant_id_idx on public.patient_identifiers (tenant_id);
create index patient_identifiers_patient_id_idx on public.patient_identifiers (patient_id);

create table public.patient_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  contact_type text not null,
  name text not null,
  phone text,
  relationship text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index patient_contacts_tenant_id_idx on public.patient_contacts (tenant_id);
create index patient_contacts_patient_id_idx on public.patient_contacts (patient_id);

create table public.patient_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  consent_category text not null,
  consent_type text not null,
  purpose text not null,
  status text not null default 'granted' check (status in ('granted', 'withdrawn')),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index patient_consents_tenant_id_idx on public.patient_consents (tenant_id);
create index patient_consents_patient_id_idx on public.patient_consents (patient_id);

create table public.patient_portal_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  relationship text,
  verification_method text,
  verified_at timestamptz,
  status text not null default 'invited' check (status in ('invited', 'verified', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, patient_id)
);
create index patient_portal_access_user_id_idx on public.patient_portal_access (user_id);
create index patient_portal_access_patient_id_idx on public.patient_portal_access (patient_id);

create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  patient_id uuid references public.patients(id) on delete restrict not null,
  encounter_type text not null,
  provider_id uuid references public.employees(id) on delete restrict not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index encounters_tenant_id_idx on public.encounters (tenant_id);
create index encounters_facility_id_idx on public.encounters (facility_id);
create index encounters_patient_id_idx on public.encounters (patient_id);
create index encounters_provider_id_idx on public.encounters (provider_id);

create table public.admissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  patient_id uuid references public.patients(id) on delete restrict not null,
  encounter_id uuid references public.encounters(id) on delete cascade not null,
  admitted_at timestamptz not null default now(),
  discharged_at timestamptz,
  status text not null default 'active' check (status in ('active', 'discharged')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discharged_at is null or discharged_at >= admitted_at)
);
create index admissions_tenant_id_idx on public.admissions (tenant_id);
create index admissions_facility_id_idx on public.admissions (facility_id);
create index admissions_patient_id_idx on public.admissions (patient_id);
create index admissions_encounter_id_idx on public.admissions (encounter_id);

create table public.bed_assignments (
  id uuid primary key default gen_random_uuid(),
  admission_id uuid references public.admissions(id) on delete cascade not null,
  bed_id uuid references public.beds(id) on delete restrict not null,
  start_at timestamptz not null default now(),
  end_at timestamptz,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);
create index bed_assignments_admission_id_idx on public.bed_assignments (admission_id);
create index bed_assignments_bed_id_idx on public.bed_assignments (bed_id);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  provider_id uuid references public.employees(id) on delete restrict not null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'checked_in', 'completed', 'cancelled', 'no_show')),
  encounter_id uuid references public.encounters(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appointments_tenant_id_idx on public.appointments (tenant_id);
create index appointments_facility_id_idx on public.appointments (facility_id);
create index appointments_patient_id_idx on public.appointments (patient_id);
create index appointments_provider_id_idx on public.appointments (provider_id);
create index appointments_encounter_id_idx on public.appointments (encounter_id);

create table public.allergies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  substance text not null,
  reaction text not null,
  severity text not null check (severity in ('mild', 'moderate', 'severe', 'life_threatening')),
  status text not null default 'active' check (status in ('active', 'resolved', 'entered_in_error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index allergies_tenant_id_idx on public.allergies (tenant_id);
create index allergies_patient_id_idx on public.allergies (patient_id);

-- Signed notes are immutable; amendments create a new version.
create table public.clinical_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  encounter_id uuid references public.encounters(id) on delete cascade not null,
  author_id uuid references public.employees(id) on delete restrict not null,
  note_type text not null,
  content text not null,
  version int not null default 1 check (version > 0),
  supersedes_id uuid references public.clinical_notes(id) on delete set null,
  amendment_reason text,
  content_hash text,
  signed_by uuid references public.employees(id) on delete set null,
  signed_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'signed', 'amended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (supersedes_id is null or supersedes_id <> id)
);
create index clinical_notes_tenant_id_idx on public.clinical_notes (tenant_id);
create index clinical_notes_encounter_id_idx on public.clinical_notes (encounter_id);
create index clinical_notes_author_id_idx on public.clinical_notes (author_id);
create index clinical_notes_supersedes_id_idx on public.clinical_notes (supersedes_id);
create index clinical_notes_signed_by_idx on public.clinical_notes (signed_by);

create table public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  encounter_id uuid references public.encounters(id) on delete cascade not null,
  code_system text not null default 'ICD-10',
  diagnosis_code text not null,
  description text,
  diagnosis_type text not null check (diagnosis_type in ('primary', 'secondary', 'provisional', 'differential')),
  created_at timestamptz not null default now()
);
create index diagnoses_tenant_id_idx on public.diagnoses (tenant_id);
create index diagnoses_encounter_id_idx on public.diagnoses (encounter_id);

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  encounter_id uuid references public.encounters(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  observation_code text not null,
  value text not null,
  unit text not null,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index observations_tenant_id_idx on public.observations (tenant_id);
create index observations_encounter_id_idx on public.observations (encounter_id);
create index observations_patient_id_idx on public.observations (patient_id);

create table public.clinical_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  encounter_id uuid references public.encounters(id) on delete set null,
  document_type text not null,
  document_id uuid references public.document_metadata(id) on delete restrict not null,
  uploaded_by uuid references public.users(id) on delete restrict not null,
  created_at timestamptz not null default now()
);
create index clinical_documents_tenant_id_idx on public.clinical_documents (tenant_id);
create index clinical_documents_patient_id_idx on public.clinical_documents (patient_id);
create index clinical_documents_encounter_id_idx on public.clinical_documents (encounter_id);
create index clinical_documents_document_id_idx on public.clinical_documents (document_id);
create index clinical_documents_uploaded_by_idx on public.clinical_documents (uploaded_by);

-- Detection never blocks registration; merges are always human-approved.
create table public.patient_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  patient_id_a uuid references public.patients(id) on delete cascade not null,
  patient_id_b uuid references public.patients(id) on delete cascade not null,
  signals text not null,
  status text not null default 'pending_review' check (status in ('pending_review', 'not_duplicate', 'merge_pending_approval', 'merged', 'merge_reversed')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  proposed_surviving_patient_id uuid references public.patients(id) on delete set null,
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id_a, patient_id_b),
  check (patient_id_a < patient_id_b)
);
create index patient_duplicate_candidates_patient_id_a_idx on public.patient_duplicate_candidates (patient_id_a);
create index patient_duplicate_candidates_patient_id_b_idx on public.patient_duplicate_candidates (patient_id_b);
create index patient_duplicate_candidates_reviewed_by_idx on public.patient_duplicate_candidates (reviewed_by);
create index patient_duplicate_candidates_proposed_surviving_patient_id_idx on public.patient_duplicate_candidates (proposed_surviving_patient_id);
create index patient_duplicate_candidates_approval_request_id_idx on public.patient_duplicate_candidates (approval_request_id);

-- Every executed merge is bound to its approved approval request.
create table public.patient_merge_log (
  id uuid primary key default gen_random_uuid(),
  surviving_patient_id uuid references public.patients(id) on delete restrict not null,
  merged_patient_id uuid references public.patients(id) on delete restrict not null,
  reason text,
  approval_request_id uuid references public.approval_requests(id) on delete restrict not null,
  merged_by uuid references public.users(id) on delete restrict not null,
  merged_at timestamptz not null default now(),
  reversed_by uuid references public.users(id) on delete set null,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  check (surviving_patient_id <> merged_patient_id),
  check (reversed_at is null or reversed_by is not null)
);
create index patient_merge_log_surviving_patient_id_idx on public.patient_merge_log (surviving_patient_id);
create index patient_merge_log_merged_patient_id_idx on public.patient_merge_log (merged_patient_id);
create index patient_merge_log_approval_request_id_idx on public.patient_merge_log (approval_request_id);
create index patient_merge_log_merged_by_idx on public.patient_merge_log (merged_by);
create index patient_merge_log_reversed_by_idx on public.patient_merge_log (reversed_by);

-- One row per identity-record repoint; reversal replays these rows.
create table public.patient_merge_repoints (
  id uuid primary key default gen_random_uuid(),
  merge_id uuid references public.patient_merge_log(id) on delete cascade not null,
  entity_type text not null,
  entity_id uuid,
  previous_patient_id uuid references public.patients(id) on delete restrict not null,
  repointed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (merge_id, entity_type, entity_id)
);
create index patient_merge_repoints_merge_id_idx on public.patient_merge_repoints (merge_id);
create index patient_merge_repoints_previous_patient_id_idx on public.patient_merge_repoints (previous_patient_id);

-- ---------------------------------------------------------------------------
-- Grants, row level security and indexes
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
  'patients',
  'patient_identifiers',
  'patient_contacts',
  'patient_consents',
  'patient_portal_access',
  'encounters',
  'admissions',
  'bed_assignments',
  'appointments',
  'allergies',
  'clinical_notes',
  'diagnoses',
  'observations',
  'clinical_documents',
  'patient_duplicate_candidates',
  'patient_merge_log',
  'patient_merge_repoints'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

create policy "Tenant members can read patients"
  on public.patients for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage patients"
  on public.patients for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read patient_identifiers"
  on public.patient_identifiers for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage patient_identifiers"
  on public.patient_identifiers for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read patient_contacts"
  on public.patient_contacts for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage patient_contacts"
  on public.patient_contacts for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read patient_consents"
  on public.patient_consents for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage patient_consents"
  on public.patient_consents for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Portal users read their own access"
  on public.patient_portal_access for select to authenticated
  using (user_id = auth.uid());

create policy "Tenant members can read patient_portal_access"
  on public.patient_portal_access for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_tenant_member((select p.tenant_id from public.patients p where p.id = patient_id))
  );

create policy "Tenant admins manage patient_portal_access"
  on public.patient_portal_access for all to authenticated
  using (
    public.is_platform_admin()
    or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = patient_id))
  )
  with check (
    public.is_platform_admin()
    or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = patient_id))
  );

create policy "Tenant members can read encounters"
  on public.encounters for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage encounters"
  on public.encounters for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read admissions"
  on public.admissions for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage admissions"
  on public.admissions for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read bed_assignments"
  on public.bed_assignments for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select a.tenant_id from public.admissions a where a.id = admission_id)));

create policy "Tenant admins manage bed_assignments"
  on public.bed_assignments for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select a.tenant_id from public.admissions a where a.id = admission_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select a.tenant_id from public.admissions a where a.id = admission_id)));

create policy "Tenant members can read appointments"
  on public.appointments for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage appointments"
  on public.appointments for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read allergies"
  on public.allergies for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage allergies"
  on public.allergies for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read clinical_notes"
  on public.clinical_notes for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage clinical_notes"
  on public.clinical_notes for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read diagnoses"
  on public.diagnoses for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage diagnoses"
  on public.diagnoses for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read observations"
  on public.observations for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage observations"
  on public.observations for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read clinical_documents"
  on public.clinical_documents for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage clinical_documents"
  on public.clinical_documents for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read patient_duplicate_candidates"
  on public.patient_duplicate_candidates for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select p.tenant_id from public.patients p where p.id = patient_id_a)));

create policy "Tenant admins manage patient_duplicate_candidates"
  on public.patient_duplicate_candidates for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = patient_id_a)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = patient_id_a)));

create policy "Tenant members can read patient_merge_log"
  on public.patient_merge_log for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select p.tenant_id from public.patients p where p.id = surviving_patient_id)));

create policy "Tenant admins manage patient_merge_log"
  on public.patient_merge_log for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = surviving_patient_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = surviving_patient_id)));

create policy "Tenant members can read patient_merge_repoints"
  on public.patient_merge_repoints for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select p.tenant_id from public.patients p where p.id = previous_patient_id)));

create policy "Tenant admins manage patient_merge_repoints"
  on public.patient_merge_repoints for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = previous_patient_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = previous_patient_id)));

do $$
declare
  t text;
begin
  foreach t in array array[
    'patients',
    'patient_contacts',
    'patient_consents',
    'patient_portal_access',
    'encounters',
    'admissions',
    'bed_assignments',
    'appointments',
    'allergies',
    'clinical_notes',
    'patient_duplicate_candidates'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- 0006_hmis_diagnostics.sql
-- ============================================================================

-- Laboratory and radiology orders, specimens, results, reports and imaging.
--
-- Part of the HMIS backend described by HMIS_Design_Detail_v2.
-- Tenancy follows the global conventions: tenant-owned rows carry
-- tenant_id, or inherit it through the parent chain named in the
-- policy. Rows are deactivated by status, never hard-deleted.

create table public.lab_test_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  test_code text not null,
  name text not null,
  specimen_type text not null,
  department_id uuid references public.departments(id) on delete restrict not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, test_code)
);
create index lab_test_catalog_tenant_id_idx on public.lab_test_catalog (tenant_id);
create index lab_test_catalog_department_id_idx on public.lab_test_catalog (department_id);

create table public.lab_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  encounter_id uuid references public.encounters(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete restrict not null,
  ordered_by uuid references public.employees(id) on delete restrict not null,
  status text not null default 'placed' check (status in ('placed', 'in_progress', 'completed', 'cancelled')),
  ordered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lab_orders_tenant_id_idx on public.lab_orders (tenant_id);
create index lab_orders_encounter_id_idx on public.lab_orders (encounter_id);
create index lab_orders_patient_id_idx on public.lab_orders (patient_id);
create index lab_orders_ordered_by_idx on public.lab_orders (ordered_by);

create table public.lab_order_items (
  id uuid primary key default gen_random_uuid(),
  lab_order_id uuid references public.lab_orders(id) on delete cascade not null,
  test_id uuid references public.lab_test_catalog(id) on delete restrict not null,
  accession_number text not null unique,
  priority text not null default 'routine' check (priority in ('routine', 'urgent', 'stat')),
  status text not null default 'ordered' check (status in ('ordered', 'collected', 'resulted', 'verified', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lab_order_items_lab_order_id_idx on public.lab_order_items (lab_order_id);
create index lab_order_items_test_id_idx on public.lab_order_items (test_id);

create table public.specimens (
  id uuid primary key default gen_random_uuid(),
  lab_order_item_id uuid references public.lab_order_items(id) on delete cascade not null,
  specimen_code text not null unique,
  collected_at timestamptz not null default now(),
  received_at timestamptz,
  status text not null default 'collected' check (status in ('collected', 'received', 'accepted', 'rejected')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'rejected' or rejection_reason is not null)
);
create index specimens_lab_order_item_id_idx on public.specimens (lab_order_item_id);

-- Verification releases the result; acknowledgement never gates release.
create table public.lab_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  lab_order_item_id uuid references public.lab_order_items(id) on delete cascade not null,
  specimen_id uuid references public.specimens(id) on delete restrict not null,
  result_value text not null,
  unit text not null,
  reference_range text not null,
  status text not null default 'preliminary' check (status in ('preliminary', 'verified', 'amended')),
  version int not null default 1 check (version > 0),
  supersedes_id uuid references public.lab_results(id) on delete set null,
  amendment_reason text,
  content_hash text,
  verified_by uuid references public.employees(id) on delete set null,
  verified_at timestamptz,
  critical_flag boolean not null default false,
  critical_acknowledged_by uuid references public.employees(id) on delete set null,
  critical_acknowledged_at timestamptz,
  critical_escalated_to uuid references public.employees(id) on delete set null,
  critical_escalated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (supersedes_id is null or supersedes_id <> id)
);
create index lab_results_tenant_id_idx on public.lab_results (tenant_id);
create index lab_results_lab_order_item_id_idx on public.lab_results (lab_order_item_id);
create index lab_results_specimen_id_idx on public.lab_results (specimen_id);
create index lab_results_supersedes_id_idx on public.lab_results (supersedes_id);
create index lab_results_verified_by_idx on public.lab_results (verified_by);
create index lab_results_critical_acknowledged_by_idx on public.lab_results (critical_acknowledged_by);
create index lab_results_critical_escalated_to_idx on public.lab_results (critical_escalated_to);

create table public.radiology_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  encounter_id uuid references public.encounters(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete restrict not null,
  accession_number text not null unique,
  modality text not null,
  body_site text,
  status text not null default 'placed' check (status in ('placed', 'scheduled', 'in_progress', 'reported', 'completed', 'cancelled')),
  ordered_by uuid references public.employees(id) on delete restrict not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index radiology_orders_tenant_id_idx on public.radiology_orders (tenant_id);
create index radiology_orders_encounter_id_idx on public.radiology_orders (encounter_id);
create index radiology_orders_patient_id_idx on public.radiology_orders (patient_id);
create index radiology_orders_ordered_by_idx on public.radiology_orders (ordered_by);

create table public.radiology_reports (
  id uuid primary key default gen_random_uuid(),
  radiology_order_id uuid references public.radiology_orders(id) on delete cascade not null,
  report_text text not null,
  reported_by uuid references public.employees(id) on delete restrict not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'amended')),
  version int not null default 1 check (version > 0),
  supersedes_id uuid references public.radiology_reports(id) on delete set null,
  amendment_reason text,
  content_hash text,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (supersedes_id is null or supersedes_id <> id)
);
create index radiology_reports_radiology_order_id_idx on public.radiology_reports (radiology_order_id);
create index radiology_reports_reported_by_idx on public.radiology_reports (reported_by);
create index radiology_reports_supersedes_id_idx on public.radiology_reports (supersedes_id);
create index radiology_reports_approved_by_idx on public.radiology_reports (approved_by);

-- DICOM study UID is unique per tenant.
create table public.imaging_studies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  radiology_order_id uuid references public.radiology_orders(id) on delete cascade not null,
  study_instance_uid text,
  modality text not null,
  pacs_study_reference text,
  document_id uuid references public.document_metadata(id) on delete set null,
  performed_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled', 'performed', 'available', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, study_instance_uid)
);
create index imaging_studies_tenant_id_idx on public.imaging_studies (tenant_id);
create index imaging_studies_radiology_order_id_idx on public.imaging_studies (radiology_order_id);
create index imaging_studies_document_id_idx on public.imaging_studies (document_id);

-- ---------------------------------------------------------------------------
-- Grants, row level security and indexes
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
  'lab_test_catalog',
  'lab_orders',
  'lab_order_items',
  'specimens',
  'lab_results',
  'radiology_orders',
  'radiology_reports',
  'imaging_studies'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

create policy "Tenant members can read lab_test_catalog"
  on public.lab_test_catalog for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage lab_test_catalog"
  on public.lab_test_catalog for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read lab_orders"
  on public.lab_orders for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage lab_orders"
  on public.lab_orders for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read lab_order_items"
  on public.lab_order_items for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select o.tenant_id from public.lab_orders o where o.id = lab_order_id)));

create policy "Tenant admins manage lab_order_items"
  on public.lab_order_items for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select o.tenant_id from public.lab_orders o where o.id = lab_order_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select o.tenant_id from public.lab_orders o where o.id = lab_order_id)));

create policy "Tenant members can read specimens"
  on public.specimens for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.lab_order_items i
     join public.lab_orders o on o.id = i.lab_order_id
    where i.id = lab_order_item_id and public.is_tenant_member(o.tenant_id)));

create policy "Tenant admins manage specimens"
  on public.specimens for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.lab_order_items i
     join public.lab_orders o on o.id = i.lab_order_id
    where i.id = lab_order_item_id and public.is_tenant_admin(o.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.lab_order_items i
     join public.lab_orders o on o.id = i.lab_order_id
    where i.id = lab_order_item_id and public.is_tenant_admin(o.tenant_id)));

create policy "Tenant members can read lab_results"
  on public.lab_results for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage lab_results"
  on public.lab_results for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read radiology_orders"
  on public.radiology_orders for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage radiology_orders"
  on public.radiology_orders for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read radiology_reports"
  on public.radiology_reports for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select o.tenant_id from public.radiology_orders o where o.id = radiology_order_id)));

create policy "Tenant admins manage radiology_reports"
  on public.radiology_reports for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select o.tenant_id from public.radiology_orders o where o.id = radiology_order_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select o.tenant_id from public.radiology_orders o where o.id = radiology_order_id)));

create policy "Tenant members can read imaging_studies"
  on public.imaging_studies for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage imaging_studies"
  on public.imaging_studies for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

do $$
declare
  t text;
begin
  foreach t in array array[
    'lab_test_catalog',
    'lab_orders',
    'lab_order_items',
    'specimens',
    'lab_results',
    'radiology_orders',
    'radiology_reports',
    'imaging_studies'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- 0007_hmis_stock_pharmacy.sql
-- ============================================================================

-- Inventory locations, items, batches, movements, pharmacy catalogue and
-- prescriptions through to dispense allocations.
--
-- Part of the HMIS backend described by HMIS_Design_Detail_v2.
-- Tenancy follows the global conventions: tenant-owned rows carry
-- tenant_id, or inherit it through the parent chain named in the
-- policy. Rows are deactivated by status, never hard-deleted.

create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete cascade not null,
  name text not null,
  location_type text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (facility_id, name)
);
create index inventory_locations_tenant_id_idx on public.inventory_locations (tenant_id);
create index inventory_locations_facility_id_idx on public.inventory_locations (facility_id);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  item_code text not null,
  name text not null,
  category text not null,
  unit_of_measure text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, item_code)
);
create index inventory_items_tenant_id_idx on public.inventory_items (tenant_id);

create table public.stock_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete cascade not null,
  item_id uuid references public.inventory_items(id) on delete restrict not null,
  batch_number text not null,
  expiry_date date not null,
  received_quantity numeric(19,4) not null default 0 check (received_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (facility_id, item_id, batch_number)
);
create index stock_batches_tenant_id_idx on public.stock_batches (tenant_id);
create index stock_batches_facility_id_idx on public.stock_batches (facility_id);
create index stock_batches_item_id_idx on public.stock_batches (item_id);

create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  source_location_id uuid references public.inventory_locations(id) on delete restrict not null,
  destination_location_id uuid references public.inventory_locations(id) on delete restrict not null,
  status text not null default 'requested' check (status in ('requested', 'approved', 'in_transit', 'partially_received', 'received', 'cancelled')),
  approved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_location_id <> destination_location_id)
);
create index stock_transfers_source_location_id_idx on public.stock_transfers (source_location_id);
create index stock_transfers_destination_location_id_idx on public.stock_transfers (destination_location_id);
create index stock_transfers_approved_by_idx on public.stock_transfers (approved_by);

create table public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid references public.stock_transfers(id) on delete cascade not null,
  item_id uuid references public.inventory_items(id) on delete restrict not null,
  batch_id uuid references public.stock_batches(id) on delete restrict not null,
  quantity numeric(19,4) not null check (quantity >= 0),
  created_at timestamptz not null default now()
);
create index stock_transfer_items_transfer_id_idx on public.stock_transfer_items (transfer_id);
create index stock_transfer_items_item_id_idx on public.stock_transfer_items (item_id);
create index stock_transfer_items_batch_id_idx on public.stock_transfer_items (batch_id);

-- Authoritative stock ledger; quantity is always positive, direction comes from movement_type.
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.inventory_items(id) on delete restrict not null,
  batch_id uuid references public.stock_batches(id) on delete restrict not null,
  location_id uuid references public.inventory_locations(id) on delete restrict not null,
  transfer_item_id uuid references public.stock_transfer_items(id) on delete set null,
  movement_type text not null check (movement_type in ('receipt', 'issue', 'transfer_out', 'transfer_in', 'adjustment', 'write_off', 'return')),
  quantity numeric(19,4) not null check (quantity > 0),
  reference_type text not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);
create index stock_movements_item_id_idx on public.stock_movements (item_id);
create index stock_movements_batch_id_idx on public.stock_movements (batch_id);
create index stock_movements_location_id_idx on public.stock_movements (location_id);
create index stock_movements_transfer_item_id_idx on public.stock_movements (transfer_item_id);

create table public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.inventory_items(id) on delete restrict not null,
  location_id uuid references public.inventory_locations(id) on delete restrict not null,
  batch_id uuid references public.stock_batches(id) on delete restrict not null,
  quantity_on_hand numeric(19,4) not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved numeric(19,4) not null default 0 check (quantity_reserved >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, location_id, batch_id)
);
create index inventory_balances_item_id_idx on public.inventory_balances (item_id);
create index inventory_balances_location_id_idx on public.inventory_balances (location_id);
create index inventory_balances_batch_id_idx on public.inventory_balances (batch_id);

create table public.medicine_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  medicine_code text not null,
  name text not null,
  strength text not null,
  dosage_form text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, medicine_code)
);
create index medicine_catalog_tenant_id_idx on public.medicine_catalog (tenant_id);

create table public.medicine_inventory_map (
  id uuid primary key default gen_random_uuid(),
  medicine_id uuid references public.medicine_catalog(id) on delete cascade not null,
  item_id uuid references public.inventory_items(id) on delete cascade not null,
  conversion_factor numeric(19,4) not null check (conversion_factor > 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (medicine_id, item_id)
);
create index medicine_inventory_map_medicine_id_idx on public.medicine_inventory_map (medicine_id);
create index medicine_inventory_map_item_id_idx on public.medicine_inventory_map (item_id);

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid references public.encounters(id) on delete cascade not null,
  prescriber_id uuid references public.employees(id) on delete restrict not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prescriptions_encounter_id_idx on public.prescriptions (encounter_id);
create index prescriptions_prescriber_id_idx on public.prescriptions (prescriber_id);

create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  prescription_id uuid references public.prescriptions(id) on delete cascade not null,
  medicine_id uuid references public.medicine_catalog(id) on delete restrict not null,
  dose text not null,
  route text not null,
  frequency text not null,
  duration text not null,
  quantity_prescribed numeric(19,4) not null check (quantity_prescribed >= 0),
  quantity_dispensed numeric(19,4) not null default 0 check (quantity_dispensed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prescription_items_tenant_id_idx on public.prescription_items (tenant_id);
create index prescription_items_prescription_id_idx on public.prescription_items (prescription_id);
create index prescription_items_medicine_id_idx on public.prescription_items (medicine_id);

-- dispensed_medicine_id is null when the prescribed medicine was dispensed.
create table public.prescription_dispenses (
  id uuid primary key default gen_random_uuid(),
  prescription_item_id uuid references public.prescription_items(id) on delete cascade not null,
  pharmacist_id uuid references public.employees(id) on delete restrict not null,
  quantity numeric(19,4) not null check (quantity >= 0),
  dispensed_at timestamptz not null default now(),
  dispensed_medicine_id uuid references public.medicine_catalog(id) on delete set null,
  substitution_reason text,
  substitution_authorized_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  check (substitution_reason is null or dispensed_medicine_id is not null)
);
create index prescription_dispenses_prescription_item_id_idx on public.prescription_dispenses (prescription_item_id);
create index prescription_dispenses_pharmacist_id_idx on public.prescription_dispenses (pharmacist_id);
create index prescription_dispenses_dispensed_medicine_id_idx on public.prescription_dispenses (dispensed_medicine_id);
create index prescription_dispenses_substitution_authorized_by_idx on public.prescription_dispenses (substitution_authorized_by);

-- One stock movement per allocation: dispense-to-stock trace.
create table public.dispense_allocations (
  id uuid primary key default gen_random_uuid(),
  dispense_id uuid references public.prescription_dispenses(id) on delete cascade not null,
  batch_id uuid references public.stock_batches(id) on delete restrict not null,
  location_id uuid references public.inventory_locations(id) on delete restrict not null,
  stock_movement_id uuid references public.stock_movements(id) on delete restrict not null,
  quantity numeric(19,4) not null check (quantity >= 0),
  created_at timestamptz not null default now()
);
create index dispense_allocations_dispense_id_idx on public.dispense_allocations (dispense_id);
create index dispense_allocations_batch_id_idx on public.dispense_allocations (batch_id);
create index dispense_allocations_location_id_idx on public.dispense_allocations (location_id);
create index dispense_allocations_stock_movement_id_idx on public.dispense_allocations (stock_movement_id);

-- ---------------------------------------------------------------------------
-- Grants, row level security and indexes
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
  'inventory_locations',
  'inventory_items',
  'stock_batches',
  'stock_transfers',
  'stock_transfer_items',
  'stock_movements',
  'inventory_balances',
  'medicine_catalog',
  'medicine_inventory_map',
  'prescriptions',
  'prescription_items',
  'prescription_dispenses',
  'dispense_allocations'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

create policy "Tenant members can read inventory_locations"
  on public.inventory_locations for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage inventory_locations"
  on public.inventory_locations for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read inventory_items"
  on public.inventory_items for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage inventory_items"
  on public.inventory_items for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read stock_batches"
  on public.stock_batches for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage stock_batches"
  on public.stock_batches for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read stock_transfers"
  on public.stock_transfers for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.inventory_locations l
    where l.id = source_location_id and public.is_tenant_member(l.tenant_id)));

create policy "Tenant admins manage stock_transfers"
  on public.stock_transfers for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.inventory_locations l
    where l.id = source_location_id and public.is_tenant_admin(l.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.inventory_locations l
    where l.id = source_location_id and public.is_tenant_admin(l.tenant_id)));

create policy "Tenant members can read stock_transfer_items"
  on public.stock_transfer_items for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.stock_transfers s
     join public.inventory_locations l on l.id = s.source_location_id
    where s.id = transfer_id and public.is_tenant_member(l.tenant_id)));

create policy "Tenant admins manage stock_transfer_items"
  on public.stock_transfer_items for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.stock_transfers s
     join public.inventory_locations l on l.id = s.source_location_id
    where s.id = transfer_id and public.is_tenant_admin(l.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.stock_transfers s
     join public.inventory_locations l on l.id = s.source_location_id
    where s.id = transfer_id and public.is_tenant_admin(l.tenant_id)));

create policy "Tenant members can read stock_movements"
  on public.stock_movements for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select b.tenant_id from public.stock_batches b where b.id = batch_id)));

create policy "Tenant admins manage stock_movements"
  on public.stock_movements for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select b.tenant_id from public.stock_batches b where b.id = batch_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select b.tenant_id from public.stock_batches b where b.id = batch_id)));

create policy "Tenant members can read inventory_balances"
  on public.inventory_balances for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select b.tenant_id from public.stock_batches b where b.id = batch_id)));

create policy "Tenant admins manage inventory_balances"
  on public.inventory_balances for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select b.tenant_id from public.stock_batches b where b.id = batch_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select b.tenant_id from public.stock_batches b where b.id = batch_id)));

create policy "Tenant members can read medicine_catalog"
  on public.medicine_catalog for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage medicine_catalog"
  on public.medicine_catalog for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read medicine_inventory_map"
  on public.medicine_inventory_map for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select m.tenant_id from public.medicine_catalog m where m.id = medicine_id)));

create policy "Tenant admins manage medicine_inventory_map"
  on public.medicine_inventory_map for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select m.tenant_id from public.medicine_catalog m where m.id = medicine_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select m.tenant_id from public.medicine_catalog m where m.id = medicine_id)));

create policy "Tenant members can read prescriptions"
  on public.prescriptions for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select e.tenant_id from public.encounters e where e.id = encounter_id)));

create policy "Tenant admins manage prescriptions"
  on public.prescriptions for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select e.tenant_id from public.encounters e where e.id = encounter_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select e.tenant_id from public.encounters e where e.id = encounter_id)));

create policy "Tenant members can read prescription_items"
  on public.prescription_items for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage prescription_items"
  on public.prescription_items for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read prescription_dispenses"
  on public.prescription_dispenses for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select i.tenant_id from public.prescription_items i where i.id = prescription_item_id)));

create policy "Tenant admins manage prescription_dispenses"
  on public.prescription_dispenses for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select i.tenant_id from public.prescription_items i where i.id = prescription_item_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select i.tenant_id from public.prescription_items i where i.id = prescription_item_id)));

create policy "Tenant members can read dispense_allocations"
  on public.dispense_allocations for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.prescription_dispenses d
     join public.prescription_items i on i.id = d.prescription_item_id
    where d.id = dispense_id and public.is_tenant_member(i.tenant_id)));

create policy "Tenant admins manage dispense_allocations"
  on public.dispense_allocations for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.prescription_dispenses d
     join public.prescription_items i on i.id = d.prescription_item_id
    where d.id = dispense_id and public.is_tenant_admin(i.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.prescription_dispenses d
     join public.prescription_items i on i.id = d.prescription_item_id
    where d.id = dispense_id and public.is_tenant_admin(i.tenant_id)));

do $$
declare
  t text;
begin
  foreach t in array array[
    'inventory_locations',
    'inventory_items',
    'stock_batches',
    'stock_transfers',
    'inventory_balances',
    'medicine_catalog',
    'medicine_inventory_map',
    'prescriptions',
    'prescription_items'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- 0008_hmis_billing.sql
-- ============================================================================

-- Charges, invoices, payments, credit notes, refunds and insurance claims.
--
-- Part of the HMIS backend described by HMIS_Design_Detail_v2.
-- Tenancy follows the global conventions: tenant-owned rows carry
-- tenant_id, or inherit it through the parent chain named in the
-- policy. Rows are deactivated by status, never hard-deleted.

create table public.charge_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  charge_code text not null,
  name text not null,
  category text not null,
  base_rate numeric(19,4) not null check (base_rate >= 0),
  effective_from date not null default current_date,
  effective_to date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, charge_code),
  check (effective_to is null or effective_to > effective_from)
);
create index charge_catalog_tenant_id_idx on public.charge_catalog (tenant_id);

create table public.payers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  payer_type text not null check (payer_type in ('insurance', 'government', 'corporate', 'self_pay')),
  name text not null,
  payer_code text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, payer_code)
);
create index payers_tenant_id_idx on public.payers (tenant_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  patient_id uuid references public.patients(id) on delete restrict not null,
  encounter_id uuid references public.encounters(id) on delete set null,
  invoice_number text not null,
  gross_amount numeric(19,4) not null default 0 check (gross_amount >= 0),
  discount_amount numeric(19,4) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(19,4) not null default 0 check (tax_amount >= 0),
  net_amount numeric(19,4) not null default 0 check (net_amount >= 0),
  status text not null default 'draft' check (status in ('draft', 'issued', 'partially_paid', 'paid', 'cancelled')),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, invoice_number)
);
create index invoices_tenant_id_idx on public.invoices (tenant_id);
create index invoices_facility_id_idx on public.invoices (facility_id);
create index invoices_patient_id_idx on public.invoices (patient_id);
create index invoices_encounter_id_idx on public.invoices (encounter_id);

-- source_id points at the performed service instance (polymorphic REF).
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  invoice_id uuid references public.invoices(id) on delete cascade not null,
  charge_id uuid references public.charge_catalog(id) on delete restrict not null,
  source_type text not null,
  source_id uuid,
  description text,
  quantity numeric(19,4) not null check (quantity >= 0),
  unit_price numeric(19,4) not null check (unit_price >= 0),
  discount_amount numeric(19,4) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(19,4) not null default 0 check (tax_amount >= 0),
  line_total numeric(19,4) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index invoice_items_tenant_id_idx on public.invoice_items (tenant_id);
create index invoice_items_invoice_id_idx on public.invoice_items (invoice_id);
create index invoice_items_charge_id_idx on public.invoice_items (charge_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  payment_reference text not null,
  patient_id uuid references public.patients(id) on delete restrict not null,
  payer_id uuid references public.payers(id) on delete set null,
  method text not null,
  amount numeric(19,4) not null check (amount >= 0),
  currency text not null default 'INR',
  status text not null default 'captured' check (status in ('captured', 'partially_allocated', 'allocated', 'partially_refunded', 'refunded')),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, payment_reference)
);
create index payments_tenant_id_idx on public.payments (tenant_id);
create index payments_patient_id_idx on public.payments (patient_id);
create index payments_payer_id_idx on public.payments (payer_id);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete cascade not null,
  invoice_id uuid references public.invoices(id) on delete restrict not null,
  allocated_amount numeric(19,4) not null check (allocated_amount >= 0),
  created_at timestamptz not null default now()
);
create index payment_allocations_payment_id_idx on public.payment_allocations (payment_id);
create index payment_allocations_invoice_id_idx on public.payment_allocations (invoice_id);

create table public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  invoice_id uuid references public.invoices(id) on delete restrict not null,
  credit_note_number text not null,
  amount numeric(19,4) not null check (amount >= 0),
  reason text,
  status text not null default 'draft' check (status in ('draft', 'issued', 'settled', 'reversed')),
  issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, credit_note_number)
);
create index credit_notes_tenant_id_idx on public.credit_notes (tenant_id);
create index credit_notes_invoice_id_idx on public.credit_notes (invoice_id);

create table public.credit_note_items (
  id uuid primary key default gen_random_uuid(),
  credit_note_id uuid references public.credit_notes(id) on delete cascade not null,
  invoice_item_id uuid references public.invoice_items(id) on delete restrict not null,
  amount numeric(19,4) not null check (amount >= 0),
  created_at timestamptz not null default now()
);
create index credit_note_items_credit_note_id_idx on public.credit_note_items (credit_note_id);
create index credit_note_items_invoice_item_id_idx on public.credit_note_items (invoice_item_id);

-- No tenant_id column: tenancy is inherited from payments.
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete cascade not null,
  amount numeric(19,4) not null check (amount >= 0),
  reason text,
  approved_by uuid references public.users(id) on delete set null,
  status text not null default 'requested' check (status in ('requested', 'approved', 'paid', 'rejected')),
  reference_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index refunds_payment_id_idx on public.refunds (payment_id);
create index refunds_approved_by_idx on public.refunds (approved_by);

create table public.refund_allocations (
  id uuid primary key default gen_random_uuid(),
  refund_id uuid references public.refunds(id) on delete cascade not null,
  invoice_id uuid references public.invoices(id) on delete restrict not null,
  credit_note_id uuid references public.credit_notes(id) on delete set null,
  allocated_amount numeric(19,4) not null check (allocated_amount >= 0),
  created_at timestamptz not null default now()
);
create index refund_allocations_refund_id_idx on public.refund_allocations (refund_id);
create index refund_allocations_invoice_id_idx on public.refund_allocations (invoice_id);
create index refund_allocations_credit_note_id_idx on public.refund_allocations (credit_note_id);

-- Tenant scope is inherited through invoices.
create table public.insurance_claims (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete restrict not null,
  invoice_id uuid references public.invoices(id) on delete restrict not null,
  payer_id uuid references public.payers(id) on delete restrict not null,
  claim_number text not null,
  claimed_amount numeric(19,4) not null check (claimed_amount >= 0),
  approved_amount numeric(19,4) not null default 0 check (approved_amount >= 0),
  status text not null default 'submitted' check (status in ('submitted', 'in_review', 'approved', 'rejected', 'paid')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payer_id, claim_number)
);
create index insurance_claims_patient_id_idx on public.insurance_claims (patient_id);
create index insurance_claims_invoice_id_idx on public.insurance_claims (invoice_id);
create index insurance_claims_payer_id_idx on public.insurance_claims (payer_id);

create table public.service_charge_map (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid references public.charge_catalog(id) on delete cascade not null,
  service_type text not null,
  service_id uuid,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_charge_map_charge_id_idx on public.service_charge_map (charge_id);

-- ---------------------------------------------------------------------------
-- Grants, row level security and indexes
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
  'charge_catalog',
  'payers',
  'invoices',
  'invoice_items',
  'payments',
  'payment_allocations',
  'credit_notes',
  'credit_note_items',
  'refunds',
  'refund_allocations',
  'insurance_claims',
  'service_charge_map'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

create policy "Tenant members can read charge_catalog"
  on public.charge_catalog for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage charge_catalog"
  on public.charge_catalog for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read payers"
  on public.payers for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage payers"
  on public.payers for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read invoices"
  on public.invoices for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage invoices"
  on public.invoices for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read invoice_items"
  on public.invoice_items for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage invoice_items"
  on public.invoice_items for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read payments"
  on public.payments for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage payments"
  on public.payments for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read payment_allocations"
  on public.payment_allocations for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select p.tenant_id from public.payments p where p.id = payment_id)));

create policy "Tenant admins manage payment_allocations"
  on public.payment_allocations for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.payments p where p.id = payment_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.payments p where p.id = payment_id)));

create policy "Tenant members can read credit_notes"
  on public.credit_notes for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage credit_notes"
  on public.credit_notes for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read credit_note_items"
  on public.credit_note_items for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select c.tenant_id from public.credit_notes c where c.id = credit_note_id)));

create policy "Tenant admins manage credit_note_items"
  on public.credit_note_items for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select c.tenant_id from public.credit_notes c where c.id = credit_note_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select c.tenant_id from public.credit_notes c where c.id = credit_note_id)));

create policy "Tenant members can read refunds"
  on public.refunds for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select p.tenant_id from public.payments p where p.id = payment_id)));

create policy "Tenant admins manage refunds"
  on public.refunds for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.payments p where p.id = payment_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.payments p where p.id = payment_id)));

create policy "Tenant members can read refund_allocations"
  on public.refund_allocations for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.refunds r
     join public.payments p on p.id = r.payment_id
    where r.id = refund_id and public.is_tenant_member(p.tenant_id)));

create policy "Tenant admins manage refund_allocations"
  on public.refund_allocations for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.refunds r
     join public.payments p on p.id = r.payment_id
    where r.id = refund_id and public.is_tenant_admin(p.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.refunds r
     join public.payments p on p.id = r.payment_id
    where r.id = refund_id and public.is_tenant_admin(p.tenant_id)));

create policy "Tenant members can read insurance_claims"
  on public.insurance_claims for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select i.tenant_id from public.invoices i where i.id = invoice_id)));

create policy "Tenant admins manage insurance_claims"
  on public.insurance_claims for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select i.tenant_id from public.invoices i where i.id = invoice_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select i.tenant_id from public.invoices i where i.id = invoice_id)));

create policy "Tenant members can read service_charge_map"
  on public.service_charge_map for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select c.tenant_id from public.charge_catalog c where c.id = charge_id)));

create policy "Tenant admins manage service_charge_map"
  on public.service_charge_map for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select c.tenant_id from public.charge_catalog c where c.id = charge_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select c.tenant_id from public.charge_catalog c where c.id = charge_id)));

do $$
declare
  t text;
begin
  foreach t in array array[
    'charge_catalog',
    'payers',
    'invoices',
    'payments',
    'credit_notes',
    'refunds',
    'insurance_claims',
    'service_charge_map'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- 0009_hmis_finance.sql
-- ============================================================================

-- General ledger: legal entities, periods, chart of accounts, posting map,
-- journals and bank reconciliation, plus the vendor register.
--
-- Part of the HMIS backend described by HMIS_Design_Detail_v2.
-- Tenancy follows the global conventions: tenant-owned rows carry
-- tenant_id, or inherit it through the parent chain named in the
-- policy. Rows are deactivated by status, never hard-deleted.

create table public.legal_entities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  entity_name text not null,
  registration_number text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, registration_number)
);
create index legal_entities_tenant_id_idx on public.legal_entities (tenant_id);

create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid references public.legal_entities(id) on delete cascade not null,
  period_name text not null,
  start_date date not null,
  end_date date,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (legal_entity_id, period_name),
  check (end_date is null or end_date >= start_date)
);
create index accounting_periods_legal_entity_id_idx on public.accounting_periods (legal_entity_id);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  legal_entity_id uuid references public.legal_entities(id) on delete cascade not null,
  account_code text not null,
  name text not null,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_id uuid references public.accounts(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (legal_entity_id, account_code),
  check (parent_id is null or parent_id <> id)
);
create index accounts_tenant_id_idx on public.accounts (tenant_id);
create index accounts_legal_entity_id_idx on public.accounts (legal_entity_id);
create index accounts_parent_id_idx on public.accounts (parent_id);

-- One active account binding per posting role per legal entity.
create table public.posting_role_accounts (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id uuid references public.legal_entities(id) on delete cascade not null,
  posting_role text not null,
  account_id uuid references public.accounts(id) on delete restrict not null,
  effective_from date not null default current_date,
  effective_to date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (legal_entity_id, posting_role, effective_from),
  check (effective_to is null or effective_to > effective_from)
);
create index posting_role_accounts_legal_entity_id_idx on public.posting_role_accounts (legal_entity_id);
create index posting_role_accounts_account_id_idx on public.posting_role_accounts (account_id);

-- Exactly-once posting: unique (posting_event, source_type, source_id).
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  legal_entity_id uuid references public.legal_entities(id) on delete restrict not null,
  accounting_period_id uuid references public.accounting_periods(id) on delete restrict not null,
  journal_number text not null,
  posting_date date not null,
  posting_event text not null,
  idempotency_key text not null unique,
  source_type text not null,
  source_id uuid,
  reversal_of_id uuid references public.journal_entries(id) on delete restrict,
  posted_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'posted', 'reversed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (posting_event, source_type, source_id),
  check (reversal_of_id is null or reversal_of_id <> id)
);
create index journal_entries_tenant_id_idx on public.journal_entries (tenant_id);
create index journal_entries_legal_entity_id_idx on public.journal_entries (legal_entity_id);
create index journal_entries_accounting_period_id_idx on public.journal_entries (accounting_period_id);
create index journal_entries_reversal_of_id_idx on public.journal_entries (reversal_of_id);

create table public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid references public.journal_entries(id) on delete cascade not null,
  account_id uuid references public.accounts(id) on delete restrict not null,
  debit_amount numeric(19,4) not null default 0 check (debit_amount >= 0),
  credit_amount numeric(19,4) not null default 0 check (credit_amount >= 0),
  cost_center_id uuid references public.cost_centers(id) on delete restrict not null,
  created_at timestamptz not null default now(),
  check (not (debit_amount > 0 and credit_amount > 0))
);
create index journal_lines_journal_entry_id_idx on public.journal_lines (journal_entry_id);
create index journal_lines_account_id_idx on public.journal_lines (account_id);
create index journal_lines_cost_center_id_idx on public.journal_lines (cost_center_id);

create table public.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  bank_account_id uuid references public.bank_accounts(id) on delete restrict not null,
  statement_date date not null,
  opening_balance numeric(19,4) not null,
  closing_balance numeric(19,4) not null,
  status text not null default 'draft' check (status in ('draft', 'reconciled')),
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bank_account_id, statement_date)
);
create index bank_reconciliations_tenant_id_idx on public.bank_reconciliations (tenant_id);
create index bank_reconciliations_bank_account_id_idx on public.bank_reconciliations (bank_account_id);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  vendor_code text not null,
  name text not null,
  tax_identifier text,
  payment_terms text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, vendor_code)
);
create index vendors_tenant_id_idx on public.vendors (tenant_id);

-- ---------------------------------------------------------------------------
-- Grants, row level security and indexes
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
  'legal_entities',
  'accounting_periods',
  'accounts',
  'posting_role_accounts',
  'journal_entries',
  'journal_lines',
  'bank_reconciliations',
  'vendors'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

create policy "Tenant members can read legal_entities"
  on public.legal_entities for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage legal_entities"
  on public.legal_entities for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read accounting_periods"
  on public.accounting_periods for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select l.tenant_id from public.legal_entities l where l.id = legal_entity_id)));

create policy "Tenant admins manage accounting_periods"
  on public.accounting_periods for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select l.tenant_id from public.legal_entities l where l.id = legal_entity_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select l.tenant_id from public.legal_entities l where l.id = legal_entity_id)));

create policy "Tenant members can read accounts"
  on public.accounts for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage accounts"
  on public.accounts for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read posting_role_accounts"
  on public.posting_role_accounts for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select l.tenant_id from public.legal_entities l where l.id = legal_entity_id)));

create policy "Tenant admins manage posting_role_accounts"
  on public.posting_role_accounts for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select l.tenant_id from public.legal_entities l where l.id = legal_entity_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select l.tenant_id from public.legal_entities l where l.id = legal_entity_id)));

create policy "Tenant members can read journal_entries"
  on public.journal_entries for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage journal_entries"
  on public.journal_entries for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read journal_lines"
  on public.journal_lines for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select j.tenant_id from public.journal_entries j where j.id = journal_entry_id)));

create policy "Tenant admins manage journal_lines"
  on public.journal_lines for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select j.tenant_id from public.journal_entries j where j.id = journal_entry_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select j.tenant_id from public.journal_entries j where j.id = journal_entry_id)));

create policy "Tenant members can read bank_reconciliations"
  on public.bank_reconciliations for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage bank_reconciliations"
  on public.bank_reconciliations for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read vendors"
  on public.vendors for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage vendors"
  on public.vendors for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

do $$
declare
  t text;
begin
  foreach t in array array[
    'legal_entities',
    'accounting_periods',
    'accounts',
    'posting_role_accounts',
    'journal_entries',
    'bank_reconciliations',
    'vendors'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- 0010_hmis_procurement_assets.sql
-- ============================================================================

-- Requisition -> purchase order -> goods receipt -> vendor invoice/payment,
-- and the asset register with maintenance work orders.
--
-- Part of the HMIS backend described by HMIS_Design_Detail_v2.
-- Tenancy follows the global conventions: tenant-owned rows carry
-- tenant_id, or inherit it through the parent chain named in the
-- policy. Rows are deactivated by status, never hard-deleted.

create table public.purchase_requisitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  requested_by uuid references public.employees(id) on delete restrict not null,
  department_id uuid references public.departments(id) on delete restrict not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected', 'ordered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchase_requisitions_tenant_id_idx on public.purchase_requisitions (tenant_id);
create index purchase_requisitions_facility_id_idx on public.purchase_requisitions (facility_id);
create index purchase_requisitions_requested_by_idx on public.purchase_requisitions (requested_by);
create index purchase_requisitions_department_id_idx on public.purchase_requisitions (department_id);

create table public.purchase_requisition_items (
  id uuid primary key default gen_random_uuid(),
  requisition_id uuid references public.purchase_requisitions(id) on delete cascade not null,
  item_id uuid references public.inventory_items(id) on delete restrict not null,
  quantity numeric(19,4) not null check (quantity >= 0),
  estimated_price numeric(19,4) not null check (estimated_price >= 0),
  created_at timestamptz not null default now()
);
create index purchase_requisition_items_requisition_id_idx on public.purchase_requisition_items (requisition_id);
create index purchase_requisition_items_item_id_idx on public.purchase_requisition_items (item_id);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  vendor_id uuid references public.vendors(id) on delete restrict not null,
  po_number text not null,
  total_amount numeric(19,4) not null default 0 check (total_amount >= 0),
  status text not null default 'draft' check (status in ('draft', 'approved', 'partially_received', 'received', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, po_number)
);
create index purchase_orders_tenant_id_idx on public.purchase_orders (tenant_id);
create index purchase_orders_facility_id_idx on public.purchase_orders (facility_id);
create index purchase_orders_vendor_id_idx on public.purchase_orders (vendor_id);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references public.purchase_orders(id) on delete cascade not null,
  item_id uuid references public.inventory_items(id) on delete restrict not null,
  quantity numeric(19,4) not null check (quantity >= 0),
  unit_price numeric(19,4) not null check (unit_price >= 0),
  created_at timestamptz not null default now()
);
create index purchase_order_items_purchase_order_id_idx on public.purchase_order_items (purchase_order_id);
create index purchase_order_items_item_id_idx on public.purchase_order_items (item_id);

create table public.po_requisition_allocations (
  id uuid primary key default gen_random_uuid(),
  po_item_id uuid references public.purchase_order_items(id) on delete cascade not null,
  requisition_item_id uuid references public.purchase_requisition_items(id) on delete restrict not null,
  quantity numeric(19,4) not null check (quantity >= 0),
  created_at timestamptz not null default now()
);
create index po_requisition_allocations_po_item_id_idx on public.po_requisition_allocations (po_item_id);
create index po_requisition_allocations_requisition_item_id_idx on public.po_requisition_allocations (requisition_item_id);

-- Single state: posted and immutable; corrections are return receipts.
create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid references public.purchase_orders(id) on delete restrict not null,
  received_by uuid references public.employees(id) on delete restrict not null,
  received_at timestamptz,
  status text not null default 'posted' check (status in ('posted')),
  created_at timestamptz not null default now()
);
create index goods_receipts_purchase_order_id_idx on public.goods_receipts (purchase_order_id);
create index goods_receipts_received_by_idx on public.goods_receipts (received_by);

create table public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid references public.goods_receipts(id) on delete cascade not null,
  po_item_id uuid references public.purchase_order_items(id) on delete restrict not null,
  item_id uuid references public.inventory_items(id) on delete restrict not null,
  batch_id uuid references public.stock_batches(id) on delete restrict not null,
  received_quantity numeric(19,4) not null check (received_quantity >= 0),
  created_at timestamptz not null default now()
);
create index goods_receipt_items_goods_receipt_id_idx on public.goods_receipt_items (goods_receipt_id);
create index goods_receipt_items_po_item_id_idx on public.goods_receipt_items (po_item_id);
create index goods_receipt_items_item_id_idx on public.goods_receipt_items (item_id);
create index goods_receipt_items_batch_id_idx on public.goods_receipt_items (batch_id);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  asset_code text not null,
  name text not null,
  purchase_date date not null,
  status text not null default 'active' check (status in ('active', 'in_maintenance', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, asset_code)
);
create index assets_tenant_id_idx on public.assets (tenant_id);
create index assets_facility_id_idx on public.assets (facility_id);

create table public.maintenance_work_orders (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.assets(id) on delete cascade not null,
  issue_type text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to uuid references public.employees(id) on delete restrict not null,
  status text not null default 'open' check (status in ('open', 'assigned', 'in_progress', 'closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index maintenance_work_orders_asset_id_idx on public.maintenance_work_orders (asset_id);
create index maintenance_work_orders_assigned_to_idx on public.maintenance_work_orders (assigned_to);

create table public.vendor_invoices (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors(id) on delete restrict not null,
  purchase_order_id uuid references public.purchase_orders(id) on delete restrict not null,
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  gross_amount numeric(19,4) not null check (gross_amount >= 0),
  status text not null default 'received' check (status in ('received', 'matched', 'approved', 'paid', 'disputed', 'reversed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, invoice_number)
);
create index vendor_invoices_vendor_id_idx on public.vendor_invoices (vendor_id);
create index vendor_invoices_purchase_order_id_idx on public.vendor_invoices (purchase_order_id);

-- Three-way match: PO line + goods receipt line + invoice line.
create table public.vendor_invoice_items (
  id uuid primary key default gen_random_uuid(),
  vendor_invoice_id uuid references public.vendor_invoices(id) on delete cascade not null,
  po_item_id uuid references public.purchase_order_items(id) on delete restrict not null,
  goods_receipt_item_id uuid references public.goods_receipt_items(id) on delete restrict not null,
  quantity numeric(19,4) not null check (quantity >= 0),
  unit_price numeric(19,4) not null check (unit_price >= 0),
  line_total numeric(19,4) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);
create index vendor_invoice_items_vendor_invoice_id_idx on public.vendor_invoice_items (vendor_invoice_id);
create index vendor_invoice_items_po_item_id_idx on public.vendor_invoice_items (po_item_id);
create index vendor_invoice_items_goods_receipt_item_id_idx on public.vendor_invoice_items (goods_receipt_item_id);

create table public.vendor_payments (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.vendors(id) on delete restrict not null,
  payment_reference text not null,
  amount numeric(19,4) not null check (amount >= 0),
  method text not null,
  status text not null default 'initiated' check (status in ('initiated', 'paid', 'voided')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, payment_reference)
);
create index vendor_payments_vendor_id_idx on public.vendor_payments (vendor_id);

create table public.vendor_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  vendor_payment_id uuid references public.vendor_payments(id) on delete cascade not null,
  vendor_invoice_id uuid references public.vendor_invoices(id) on delete restrict not null,
  allocated_amount numeric(19,4) not null check (allocated_amount >= 0),
  created_at timestamptz not null default now()
);
create index vendor_payment_allocations_vendor_payment_id_idx on public.vendor_payment_allocations (vendor_payment_id);
create index vendor_payment_allocations_vendor_invoice_id_idx on public.vendor_payment_allocations (vendor_invoice_id);

-- ---------------------------------------------------------------------------
-- Grants, row level security and indexes
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
  'purchase_requisitions',
  'purchase_requisition_items',
  'purchase_orders',
  'purchase_order_items',
  'po_requisition_allocations',
  'goods_receipts',
  'goods_receipt_items',
  'assets',
  'maintenance_work_orders',
  'vendor_invoices',
  'vendor_invoice_items',
  'vendor_payments',
  'vendor_payment_allocations'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

create policy "Tenant members can read purchase_requisitions"
  on public.purchase_requisitions for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage purchase_requisitions"
  on public.purchase_requisitions for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read purchase_requisition_items"
  on public.purchase_requisition_items for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select r.tenant_id from public.purchase_requisitions r where r.id = requisition_id)));

create policy "Tenant admins manage purchase_requisition_items"
  on public.purchase_requisition_items for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select r.tenant_id from public.purchase_requisitions r where r.id = requisition_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select r.tenant_id from public.purchase_requisitions r where r.id = requisition_id)));

create policy "Tenant members can read purchase_orders"
  on public.purchase_orders for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage purchase_orders"
  on public.purchase_orders for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read purchase_order_items"
  on public.purchase_order_items for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select o.tenant_id from public.purchase_orders o where o.id = purchase_order_id)));

create policy "Tenant admins manage purchase_order_items"
  on public.purchase_order_items for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select o.tenant_id from public.purchase_orders o where o.id = purchase_order_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select o.tenant_id from public.purchase_orders o where o.id = purchase_order_id)));

create policy "Tenant members can read po_requisition_allocations"
  on public.po_requisition_allocations for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.purchase_order_items i
     join public.purchase_orders o on o.id = i.purchase_order_id
    where i.id = po_item_id and public.is_tenant_member(o.tenant_id)));

create policy "Tenant admins manage po_requisition_allocations"
  on public.po_requisition_allocations for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.purchase_order_items i
     join public.purchase_orders o on o.id = i.purchase_order_id
    where i.id = po_item_id and public.is_tenant_admin(o.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.purchase_order_items i
     join public.purchase_orders o on o.id = i.purchase_order_id
    where i.id = po_item_id and public.is_tenant_admin(o.tenant_id)));

create policy "Tenant members can read goods_receipts"
  on public.goods_receipts for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select o.tenant_id from public.purchase_orders o where o.id = purchase_order_id)));

create policy "Tenant admins manage goods_receipts"
  on public.goods_receipts for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select o.tenant_id from public.purchase_orders o where o.id = purchase_order_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select o.tenant_id from public.purchase_orders o where o.id = purchase_order_id)));

create policy "Tenant members can read goods_receipt_items"
  on public.goods_receipt_items for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.goods_receipts g
     join public.purchase_orders o on o.id = g.purchase_order_id
    where g.id = goods_receipt_id and public.is_tenant_member(o.tenant_id)));

create policy "Tenant admins manage goods_receipt_items"
  on public.goods_receipt_items for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.goods_receipts g
     join public.purchase_orders o on o.id = g.purchase_order_id
    where g.id = goods_receipt_id and public.is_tenant_admin(o.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.goods_receipts g
     join public.purchase_orders o on o.id = g.purchase_order_id
    where g.id = goods_receipt_id and public.is_tenant_admin(o.tenant_id)));

create policy "Tenant members can read assets"
  on public.assets for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage assets"
  on public.assets for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read maintenance_work_orders"
  on public.maintenance_work_orders for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select a.tenant_id from public.assets a where a.id = asset_id)));

create policy "Tenant admins manage maintenance_work_orders"
  on public.maintenance_work_orders for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select a.tenant_id from public.assets a where a.id = asset_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select a.tenant_id from public.assets a where a.id = asset_id)));

create policy "Tenant members can read vendor_invoices"
  on public.vendor_invoices for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select v.tenant_id from public.vendors v where v.id = vendor_id)));

create policy "Tenant admins manage vendor_invoices"
  on public.vendor_invoices for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select v.tenant_id from public.vendors v where v.id = vendor_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select v.tenant_id from public.vendors v where v.id = vendor_id)));

create policy "Tenant members can read vendor_invoice_items"
  on public.vendor_invoice_items for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.vendor_invoices vi
     join public.vendors v on v.id = vi.vendor_id
    where vi.id = vendor_invoice_id and public.is_tenant_member(v.tenant_id)));

create policy "Tenant admins manage vendor_invoice_items"
  on public.vendor_invoice_items for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.vendor_invoices vi
     join public.vendors v on v.id = vi.vendor_id
    where vi.id = vendor_invoice_id and public.is_tenant_admin(v.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.vendor_invoices vi
     join public.vendors v on v.id = vi.vendor_id
    where vi.id = vendor_invoice_id and public.is_tenant_admin(v.tenant_id)));

create policy "Tenant members can read vendor_payments"
  on public.vendor_payments for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select v.tenant_id from public.vendors v where v.id = vendor_id)));

create policy "Tenant admins manage vendor_payments"
  on public.vendor_payments for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select v.tenant_id from public.vendors v where v.id = vendor_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select v.tenant_id from public.vendors v where v.id = vendor_id)));

create policy "Tenant members can read vendor_payment_allocations"
  on public.vendor_payment_allocations for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.vendor_payments vp
     join public.vendors v on v.id = vp.vendor_id
    where vp.id = vendor_payment_id and public.is_tenant_member(v.tenant_id)));

create policy "Tenant admins manage vendor_payment_allocations"
  on public.vendor_payment_allocations for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.vendor_payments vp
     join public.vendors v on v.id = vp.vendor_id
    where vp.id = vendor_payment_id and public.is_tenant_admin(v.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.vendor_payments vp
     join public.vendors v on v.id = vp.vendor_id
    where vp.id = vendor_payment_id and public.is_tenant_admin(v.tenant_id)));

do $$
declare
  t text;
begin
  foreach t in array array[
    'purchase_requisitions',
    'purchase_orders',
    'assets',
    'maintenance_work_orders',
    'vendor_invoices',
    'vendor_payments'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- 0011_hmis_hr_payroll.sql
-- ============================================================================

-- Attendance, shifts, leave, salary structures, payroll runs and payslips.
--
-- Part of the HMIS backend described by HMIS_Design_Detail_v2.
-- Tenancy follows the global conventions: tenant-owned rows carry
-- tenant_id, or inherit it through the parent chain named in the
-- policy. Rows are deactivated by status, never hard-deleted.

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  attendance_date date not null,
  clock_in timestamptz not null,
  clock_out timestamptz,
  status text not null default 'recorded' check (status in ('recorded', 'approved', 'disputed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, attendance_date),
  check (clock_out is null or clock_out >= clock_in)
);
create index attendance_records_employee_id_idx on public.attendance_records (employee_id);
create index attendance_records_facility_id_idx on public.attendance_records (facility_id);

create table public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade not null,
  shift_id uuid references public.shifts(id) on delete restrict not null,
  start_at timestamptz not null,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);
create index shift_assignments_employee_id_idx on public.shift_assignments (employee_id);
create index shift_assignments_shift_id_idx on public.shift_assignments (shift_id);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade not null,
  leave_type_id uuid references public.leave_types(id) on delete restrict not null,
  start_date date not null,
  end_date date,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'cancelled')),
  approved_by uuid references public.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index leave_requests_employee_id_idx on public.leave_requests (employee_id);
create index leave_requests_leave_type_id_idx on public.leave_requests (leave_type_id);
create index leave_requests_approved_by_idx on public.leave_requests (approved_by);

create table public.salary_structures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  name text not null,
  effective_from date not null,
  effective_to date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name, effective_from),
  check (effective_to is null or effective_to > effective_from)
);
create index salary_structures_tenant_id_idx on public.salary_structures (tenant_id);

create table public.salary_components (
  id uuid primary key default gen_random_uuid(),
  salary_structure_id uuid references public.salary_structures(id) on delete cascade not null,
  component_code text not null,
  component_type text not null check (component_type in ('earning', 'deduction', 'employer_contribution')),
  calculation_type text not null check (calculation_type in ('fixed', 'percentage', 'formula')),
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salary_structure_id, component_code)
);
create index salary_components_salary_structure_id_idx on public.salary_components (salary_structure_id);

-- No overlapping effective ranges per employee (enforced by the service).
create table public.employee_salary_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade not null,
  salary_structure_id uuid references public.salary_structures(id) on delete restrict not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);
create index employee_salary_assignments_employee_id_idx on public.employee_salary_assignments (employee_id);
create index employee_salary_assignments_salary_structure_id_idx on public.employee_salary_assignments (salary_structure_id);

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'calculating' check (status in ('calculating', 'draft', 'approved', 'paid')),
  approved_by uuid references public.users(id) on delete set null,
  calculation_version text not null default 'v1',
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, period_start, period_end, calculation_version),
  check (period_end >= period_start)
);
create index payroll_runs_tenant_id_idx on public.payroll_runs (tenant_id);
create index payroll_runs_facility_id_idx on public.payroll_runs (facility_id);
create index payroll_runs_approved_by_idx on public.payroll_runs (approved_by);

create table public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid references public.payroll_runs(id) on delete cascade not null,
  employee_id uuid references public.employees(id) on delete restrict not null,
  gross_pay numeric(19,4) not null check (gross_pay >= 0),
  deductions numeric(19,4) not null default 0 check (deductions >= 0),
  net_pay numeric(19,4) not null check (net_pay >= 0),
  status text not null default 'calculated' check (status in ('calculated', 'approved', 'paid')),
  input_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_run_id, employee_id)
);
create index payroll_items_payroll_run_id_idx on public.payroll_items (payroll_run_id);
create index payroll_items_employee_id_idx on public.payroll_items (employee_id);

create table public.payroll_item_components (
  id uuid primary key default gen_random_uuid(),
  payroll_item_id uuid references public.payroll_items(id) on delete cascade not null,
  component_code text not null,
  amount numeric(19,4) not null check (amount >= 0),
  calculation_details text not null,
  created_at timestamptz not null default now()
);
create index payroll_item_components_payroll_item_id_idx on public.payroll_item_components (payroll_item_id);

create table public.payroll_payments (
  id uuid primary key default gen_random_uuid(),
  payroll_item_id uuid references public.payroll_items(id) on delete cascade not null,
  payment_reference text not null,
  amount numeric(19,4) not null check (amount >= 0),
  status text not null default 'initiated' check (status in ('initiated', 'paid', 'failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_item_id, payment_reference)
);
create index payroll_payments_payroll_item_id_idx on public.payroll_payments (payroll_item_id);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  payroll_item_id uuid references public.payroll_items(id) on delete cascade not null,
  storage_key text not null unique,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index payslips_payroll_item_id_idx on public.payslips (payroll_item_id);

create table public.reimbursements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade not null,
  amount numeric(19,4) not null check (amount >= 0),
  expense_type text not null,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'paid', 'rejected')),
  approved_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reimbursements_employee_id_idx on public.reimbursements (employee_id);
create index reimbursements_approved_by_idx on public.reimbursements (approved_by);

create table public.employee_exit_settlements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade not null,
  final_payable numeric(19,4) not null check (final_payable >= 0),
  deductions numeric(19,4) not null default 0 check (deductions >= 0),
  status text not null default 'calculated' check (status in ('calculated', 'approved', 'paid')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employee_exit_settlements_employee_id_idx on public.employee_exit_settlements (employee_id);

-- ---------------------------------------------------------------------------
-- Grants, row level security and indexes
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
  'attendance_records',
  'shift_assignments',
  'leave_requests',
  'salary_structures',
  'salary_components',
  'employee_salary_assignments',
  'payroll_runs',
  'payroll_items',
  'payroll_item_components',
  'payroll_payments',
  'payslips',
  'reimbursements',
  'employee_exit_settlements'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

create policy "Tenant members can read attendance_records"
  on public.attendance_records for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select f.tenant_id from public.facilities f where f.id = facility_id)));

create policy "Tenant admins manage attendance_records"
  on public.attendance_records for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select f.tenant_id from public.facilities f where f.id = facility_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select f.tenant_id from public.facilities f where f.id = facility_id)));

create policy "Tenant members can read shift_assignments"
  on public.shift_assignments for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select e.tenant_id from public.employees e where e.id = employee_id)));

create policy "Tenant admins manage shift_assignments"
  on public.shift_assignments for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select e.tenant_id from public.employees e where e.id = employee_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select e.tenant_id from public.employees e where e.id = employee_id)));

create policy "Tenant members can read leave_requests"
  on public.leave_requests for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select e.tenant_id from public.employees e where e.id = employee_id)));

create policy "Tenant admins manage leave_requests"
  on public.leave_requests for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select e.tenant_id from public.employees e where e.id = employee_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select e.tenant_id from public.employees e where e.id = employee_id)));

create policy "Tenant members can read salary_structures"
  on public.salary_structures for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage salary_structures"
  on public.salary_structures for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read salary_components"
  on public.salary_components for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select s.tenant_id from public.salary_structures s where s.id = salary_structure_id)));

create policy "Tenant admins manage salary_components"
  on public.salary_components for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select s.tenant_id from public.salary_structures s where s.id = salary_structure_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select s.tenant_id from public.salary_structures s where s.id = salary_structure_id)));

create policy "Tenant members can read employee_salary_assignments"
  on public.employee_salary_assignments for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select e.tenant_id from public.employees e where e.id = employee_id)));

create policy "Tenant admins manage employee_salary_assignments"
  on public.employee_salary_assignments for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select e.tenant_id from public.employees e where e.id = employee_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select e.tenant_id from public.employees e where e.id = employee_id)));

create policy "Tenant members can read payroll_runs"
  on public.payroll_runs for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage payroll_runs"
  on public.payroll_runs for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read payroll_items"
  on public.payroll_items for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select r.tenant_id from public.payroll_runs r where r.id = payroll_run_id)));

create policy "Tenant admins manage payroll_items"
  on public.payroll_items for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select r.tenant_id from public.payroll_runs r where r.id = payroll_run_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select r.tenant_id from public.payroll_runs r where r.id = payroll_run_id)));

create policy "Tenant members can read payroll_item_components"
  on public.payroll_item_components for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.payroll_items i
     join public.payroll_runs r on r.id = i.payroll_run_id
    where i.id = payroll_item_id and public.is_tenant_member(r.tenant_id)));

create policy "Tenant admins manage payroll_item_components"
  on public.payroll_item_components for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.payroll_items i
     join public.payroll_runs r on r.id = i.payroll_run_id
    where i.id = payroll_item_id and public.is_tenant_admin(r.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.payroll_items i
     join public.payroll_runs r on r.id = i.payroll_run_id
    where i.id = payroll_item_id and public.is_tenant_admin(r.tenant_id)));

create policy "Tenant members can read payroll_payments"
  on public.payroll_payments for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.payroll_items i
     join public.payroll_runs r on r.id = i.payroll_run_id
    where i.id = payroll_item_id and public.is_tenant_member(r.tenant_id)));

create policy "Tenant admins manage payroll_payments"
  on public.payroll_payments for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.payroll_items i
     join public.payroll_runs r on r.id = i.payroll_run_id
    where i.id = payroll_item_id and public.is_tenant_admin(r.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.payroll_items i
     join public.payroll_runs r on r.id = i.payroll_run_id
    where i.id = payroll_item_id and public.is_tenant_admin(r.tenant_id)));

create policy "Tenant members can read payslips"
  on public.payslips for select to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.payroll_items i
     join public.payroll_runs r on r.id = i.payroll_run_id
    where i.id = payroll_item_id and public.is_tenant_member(r.tenant_id)));

create policy "Tenant admins manage payslips"
  on public.payslips for all to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.payroll_items i
     join public.payroll_runs r on r.id = i.payroll_run_id
    where i.id = payroll_item_id and public.is_tenant_admin(r.tenant_id)))
  with check (public.is_platform_admin() or exists (select 1 from public.payroll_items i
     join public.payroll_runs r on r.id = i.payroll_run_id
    where i.id = payroll_item_id and public.is_tenant_admin(r.tenant_id)));

create policy "Tenant members can read reimbursements"
  on public.reimbursements for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select e.tenant_id from public.employees e where e.id = employee_id)));

create policy "Tenant admins manage reimbursements"
  on public.reimbursements for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select e.tenant_id from public.employees e where e.id = employee_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select e.tenant_id from public.employees e where e.id = employee_id)));

create policy "Tenant members can read employee_exit_settlements"
  on public.employee_exit_settlements for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select e.tenant_id from public.employees e where e.id = employee_id)));

create policy "Tenant admins manage employee_exit_settlements"
  on public.employee_exit_settlements for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select e.tenant_id from public.employees e where e.id = employee_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select e.tenant_id from public.employees e where e.id = employee_id)));

do $$
declare
  t text;
begin
  foreach t in array array[
    'attendance_records',
    'shift_assignments',
    'leave_requests',
    'salary_structures',
    'salary_components',
    'employee_salary_assignments',
    'payroll_runs',
    'payroll_items',
    'payroll_payments',
    'reimbursements',
    'employee_exit_settlements'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

-- 0012_hmis_audit_integration.sql
-- ============================================================================

-- Audit trail, status history, integration messaging and notification jobs.
--
-- Part of the HMIS backend described by HMIS_Design_Detail_v2.
-- Tenancy follows the global conventions: tenant-owned rows carry
-- tenant_id, or inherit it through the parent chain named in the
-- policy. Rows are deactivated by status, never hard-deleted.

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  actor_id uuid references public.users(id) on delete restrict not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_after jsonb,
  reason text,
  ip_address text,
  device text,
  outcome text not null check (outcome in ('success', 'failure', 'denied')),
  occurred_at timestamptz not null default now(),
  correlation_id uuid,
  created_at timestamptz not null default now()
);
create index audit_events_tenant_id_idx on public.audit_events (tenant_id);
create index audit_events_actor_id_idx on public.audit_events (actor_id);

-- Append-only: one row per status transition.
create table public.status_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  entity_type text not null,
  entity_id uuid,
  from_status text not null,
  to_status text not null,
  changed_by uuid references public.users(id) on delete restrict not null,
  changed_at timestamptz not null default now(),
  reason text,
  created_at timestamptz not null default now()
);
create index status_history_tenant_id_idx on public.status_history (tenant_id);
create index status_history_changed_by_idx on public.status_history (changed_by);

-- configuration_reference names a secret stored outside the database.
create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete cascade not null,
  integration_type text not null,
  configuration_reference text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (facility_id, integration_type)
);
create index integration_connections_tenant_id_idx on public.integration_connections (tenant_id);
create index integration_connections_facility_id_idx on public.integration_connections (facility_id);

create table public.integration_messages (
  id uuid primary key default gen_random_uuid(),
  integration_connection_id uuid references public.integration_connections(id) on delete cascade not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  message_type text not null,
  external_reference text,
  idempotency_key text not null,
  payload_reference text,
  schema_version text not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'processed', 'failed', 'dead_lettered')),
  attempt_count int not null default 0 check (attempt_count >= 0),
  dead_lettered boolean,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_connection_id, idempotency_key)
);
create index integration_messages_integration_connection_id_idx on public.integration_messages (integration_connection_id);

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  recipient_id uuid references public.users(id) on delete cascade not null,
  channel text not null check (channel in ('email', 'sms', 'push', 'in_app', 'whatsapp')),
  template_id uuid references public.notification_templates(id) on delete restrict not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'dead')),
  payload jsonb,
  sent_at timestamptz,
  attempt_count int not null default 0 check (attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_jobs_tenant_id_idx on public.notification_jobs (tenant_id);
create index notification_jobs_recipient_id_idx on public.notification_jobs (recipient_id);
create index notification_jobs_template_id_idx on public.notification_jobs (template_id);

-- ---------------------------------------------------------------------------
-- Grants, row level security and indexes
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
  'audit_events',
  'status_history',
  'integration_connections',
  'integration_messages',
  'notification_jobs'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

create policy "Tenant members can read audit_events"
  on public.audit_events for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage audit_events"
  on public.audit_events for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read status_history"
  on public.status_history for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage status_history"
  on public.status_history for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read integration_connections"
  on public.integration_connections for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage integration_connections"
  on public.integration_connections for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read integration_messages"
  on public.integration_messages for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select c.tenant_id from public.integration_connections c where c.id = integration_connection_id)));

create policy "Tenant admins manage integration_messages"
  on public.integration_messages for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select c.tenant_id from public.integration_connections c where c.id = integration_connection_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select c.tenant_id from public.integration_connections c where c.id = integration_connection_id)));

create policy "Tenant members can read notification_jobs"
  on public.notification_jobs for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage notification_jobs"
  on public.notification_jobs for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

do $$
declare
  t text;
begin
  foreach t in array array[
    'integration_connections',
    'integration_messages',
    'notification_jobs'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

-- 0015_staff_approval_notifications.sql
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_approval_requests'
  ) then
    if not exists (
      select 1 from pg_publication where pubname = 'supabase_realtime'
    ) then
      raise exception 'Supabase Realtime publication is not configured';
    end if;

    execute 'alter publication supabase_realtime add table public.staff_approval_requests';
  end if;
end;
$$;
