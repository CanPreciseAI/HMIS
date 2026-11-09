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
