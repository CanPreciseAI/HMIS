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
