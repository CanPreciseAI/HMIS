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
