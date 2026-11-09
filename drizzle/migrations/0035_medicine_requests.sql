-- Staff can request a medicine that is out of stock or needed urgently. The
-- hospital administrator reviews the request from the stock page.
create table public.medicine_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete cascade not null,
  medicine_id uuid references public.medicine_catalog(id) on delete cascade not null,
  requested_by uuid references public.employees(id) on delete set null,
  requested_by_user uuid references public.users(id) on delete set null,
  quantity numeric(19,4) not null default 1 check (quantity > 0),
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'fulfilled')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index medicine_requests_tenant_id_idx on public.medicine_requests (tenant_id);
create index medicine_requests_facility_id_idx on public.medicine_requests (facility_id);
create index medicine_requests_medicine_id_idx on public.medicine_requests (medicine_id);
create index medicine_requests_pending_idx
  on public.medicine_requests (tenant_id, status)
  where status = 'pending';

alter table public.medicine_requests enable row level security;
revoke all on public.medicine_requests from anon;
grant select, insert, update on public.medicine_requests to authenticated;

create policy "Tenant members read medicine requests"
  on public.medicine_requests for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant members create medicine requests"
  on public.medicine_requests for insert to authenticated
  with check (
    public.is_platform_admin()
    or (
      public.is_tenant_member(tenant_id)
      and requested_by_user = auth.uid()
    )
  );

create policy "Tenant admins review medicine requests"
  on public.medicine_requests for update to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));
