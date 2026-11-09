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
