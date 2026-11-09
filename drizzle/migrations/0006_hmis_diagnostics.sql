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
