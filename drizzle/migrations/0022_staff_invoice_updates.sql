-- Allow hospital team members to update invoices while keeping patients
-- read-only. Issued invoices are exposed to the linked patient portal.
create or replace function public.is_patient_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.patient_profiles profile
      where profile.id = auth.uid()
    );
$$;

revoke all on function public.is_patient_account() from public, anon;
grant execute on function public.is_patient_account() to authenticated;

drop policy "Tenant admins manage invoices" on public.invoices;

create policy "Tenant admins manage invoices"
  on public.invoices for all to authenticated
  using (
    not public.is_patient_account()
    and (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  )
  with check (
    not public.is_patient_account()
    and (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  );

create policy "Tenant members update invoices"
  on public.invoices for update to authenticated
  using (
    not public.is_patient_account()
    and (public.is_platform_admin() or public.is_tenant_member(tenant_id))
  )
  with check (
    not public.is_patient_account()
    and (public.is_platform_admin() or public.is_tenant_member(tenant_id))
  );
