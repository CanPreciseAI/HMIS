-- Limit invoice updates to hospital admins and receptionists.
create or replace function public.is_tenant_receptionist(_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select _tenant_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.user_role_assignments assignment
      join public.roles role_row on role_row.id = assignment.role_id
      where assignment.user_id = auth.uid()
        and assignment.tenant_id = _tenant_id
        and assignment.valid_from <= now()
        and (assignment.valid_until is null or assignment.valid_until > now())
        and lower(replace(role_row.name, ' ', '_')) = 'receptionist'
    );
$$;

revoke all on function public.is_tenant_receptionist(uuid) from public, anon;
grant execute on function public.is_tenant_receptionist(uuid) to authenticated;

drop policy "Tenant members update invoices" on public.invoices;

revoke update on public.invoices from authenticated;
grant update (
  gross_amount,
  discount_amount,
  tax_amount,
  net_amount,
  status,
  issued_at
) on public.invoices to authenticated;

create policy "Hospital admins and receptionists update invoices"
  on public.invoices for update to authenticated
  using (
    not public.is_patient_account()
    and (
      public.is_platform_admin()
      or public.is_tenant_admin(tenant_id)
      or public.is_tenant_receptionist(tenant_id)
    )
  )
  with check (
    not public.is_patient_account()
    and (
      public.is_platform_admin()
      or public.is_tenant_admin(tenant_id)
      or public.is_tenant_receptionist(tenant_id)
    )
  );
