-- Platform-wide analytics for the administrator overview: how many hospitals
-- have joined, how big the estate is, and the activity and revenue that follow
-- from it. One guarded function keeps the overview to a single round trip and
-- avoids relying on tenant row level security for cross-hospital totals.

create or replace function public.platform_overview_stats()
returns table (
  hospitals_total integer,
  hospitals_active integer,
  hospitals_trial integer,
  hospitals_suspended integer,
  facilities_total integer,
  staff_total integer,
  staff_active integer,
  patients_total integer,
  patients_new_7d integer,
  encounters_7d integer,
  appointments_today integer,
  invoices_issued integer,
  invoiced_amount numeric,
  collected_amount numeric,
  outstanding_amount numeric,
  pending_hospital_requests integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform administrators can view platform analytics'
      using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::integer from public.tenants),
    (select count(*)::integer from public.tenants where status = 'active'),
    (select count(*)::integer from public.tenants where status = 'trial'),
    (select count(*)::integer from public.tenants where status = 'suspended'),
    (select count(*)::integer from public.facilities),
    (select count(*)::integer from public.employees),
    (select count(*)::integer
      from public.employees
      where employment_status = 'active'),
    (select count(*)::integer from public.patients),
    (select count(*)::integer
      from public.patients
      where created_at >= now() - interval '7 days'),
    (select count(*)::integer
      from public.encounters
      where started_at >= now() - interval '7 days'),
    (select count(*)::integer
      from public.appointments
      where scheduled_at >= date_trunc('day', now())
        and scheduled_at < date_trunc('day', now()) + interval '1 day'),
    (select count(*)::integer
      from public.invoices
      where status in ('issued', 'partially_paid', 'paid')),
    (select coalesce(sum(invoice.net_amount), 0)::numeric
      from public.invoices invoice
      where invoice.status in ('issued', 'partially_paid', 'paid')),
    (select coalesce(sum(allocation.allocated_amount), 0)::numeric
      from public.payment_allocations allocation
      join public.invoices invoice on invoice.id = allocation.invoice_id
      where invoice.status in ('issued', 'partially_paid', 'paid')),
    (select coalesce(sum(invoice.net_amount), 0)::numeric
      from public.invoices invoice
      where invoice.status in ('issued', 'partially_paid', 'paid'))
      - (select coalesce(sum(allocation.allocated_amount), 0)::numeric
          from public.payment_allocations allocation
          join public.invoices invoice on invoice.id = allocation.invoice_id
          where invoice.status in ('issued', 'partially_paid', 'paid')),
    (select count(*)::integer
      from public.hospital_admin_registration_requests
      where status = 'pending');
end;
$$;

revoke all on function public.platform_overview_stats() from public, anon;
grant execute on function public.platform_overview_stats() to authenticated;
