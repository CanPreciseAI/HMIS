-- Medical vendors are not all medicine suppliers: hospitals also buy
-- equipment, consumables and services. Classify each vendor so the dashboard
-- can group suppliers and report spend by category.

alter table public.vendors
  add column if not exists vendor_type text not null default 'medicine';

alter table public.vendors
  drop constraint if exists vendors_vendor_type_check;

alter table public.vendors
  add constraint vendors_vendor_type_check
  check (vendor_type in ('medicine', 'equipment', 'consumables', 'services', 'other'));

create index if not exists vendors_tenant_type_idx
  on public.vendors (tenant_id, vendor_type);
