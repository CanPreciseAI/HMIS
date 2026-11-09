-- Wards belong to a facility and describe the physical ward: its type, floor,
-- capacity and contact details. Beds keep their ward name so existing bed data
-- continues to group correctly.
create table public.wards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete cascade not null,
  name text not null,
  ward_type text not null default 'general',
  floor text,
  capacity integer check (capacity is null or capacity >= 0),
  phone text,
  notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (facility_id, name)
);
create index wards_tenant_id_idx on public.wards (tenant_id);
create index wards_facility_id_idx on public.wards (facility_id);

alter table public.wards enable row level security;
revoke all on public.wards from anon;
grant select, insert, update, delete on public.wards to authenticated;

create policy "Tenant members can read wards"
  on public.wards for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage wards"
  on public.wards for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Nurses manage wards"
  on public.wards for all to authenticated
  using (public.is_tenant_nurse(tenant_id))
  with check (public.is_tenant_nurse(tenant_id));

-- Sample wards with a few beds each so the ward map has something to show.
create or replace function public.seed_demo_wards(_tenant_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_facility uuid;
  v_count integer := 0;
  v_prefix text;
  v_bed integer;
  ward record;
begin
  if auth.uid() is not null
    and not (public.is_platform_admin() or public.is_tenant_admin(_tenant_id)) then
    raise exception 'Only a hospital administrator can load the sample wards.'
      using errcode = '42501';
  end if;

  select f.id into v_facility
  from public.facilities f
  where f.tenant_id = _tenant_id
  order by f.id
  limit 1;

  if v_facility is null then
    return 0;
  end if;

  for ward in
    select *
    from (
      values
        ('General Ward', 'general', 'Ground floor', 24, 'Ext 120', 'Shared rooms with four beds each.'),
        ('Maternity Ward', 'maternity', 'First floor', 16, 'Ext 131', 'Antenatal and postnatal beds.'),
        ('Paediatrics', 'paediatrics', 'First floor', 14, 'Ext 142', 'Children under 12.'),
        ('Surgical Ward', 'surgical', 'Second floor', 18, 'Ext 153', 'Post-operative recovery beds.'),
        ('Intensive Care Unit', 'icu', 'Second floor', 6, 'Ext 160', 'Ventilated and high-dependency beds.'),
        ('Isolation Ward', 'isolation', 'Ground floor', 4, 'Ext 170', 'Infectious cases with a separate entrance.')
    ) as m(name, ward_type, floor, capacity, phone, notes)
  loop
    insert into public.wards (
      tenant_id, facility_id, name, ward_type, floor, capacity, phone, notes, status
    )
    values (
      _tenant_id, v_facility, ward.name, ward.ward_type, ward.floor,
      ward.capacity, ward.phone, ward.notes, 'active'
    )
    on conflict (facility_id, name) do nothing;

    select string_agg(left(part, 1), '')
      into v_prefix
      from regexp_split_to_table(ward.name, '\s+') as part
      where part <> '';
    if v_prefix is null or v_prefix = '' then
      v_prefix := 'WARD';
    end if;

    for v_bed in 1..4 loop
      insert into public.beds (
        tenant_id, facility_id, bed_code, ward, bed_type, status
      )
      values (
        _tenant_id, v_facility,
        v_prefix || '-' || lpad(v_bed::text, 2, '0'),
        ward.name, ward.ward_type, 'active'
      )
      on conflict (facility_id, bed_code) do nothing;
    end loop;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.seed_demo_wards(uuid) from public, anon;
grant execute on function public.seed_demo_wards(uuid) to authenticated;

do $$
declare
  v_tenant uuid;
begin
  for v_tenant in select id from public.tenants loop
    perform public.seed_demo_wards(v_tenant);
  end loop;
end;
$$;
