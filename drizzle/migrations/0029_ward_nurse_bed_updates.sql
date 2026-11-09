-- Let nurses maintain bed and ward details for their own hospital.
--
-- Bed and bed-assignment writes were previously limited to tenant
-- administrators. Ward nurses need to correct bed codes, ward names, bed
-- types and bed availability from the ward board, so this adds narrowly
-- scoped update policies instead of widening the existing administrative
-- policies.

create or replace function public.is_tenant_nurse(_tenant_id uuid)
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
        and lower(replace(role_row.name, ' ', '_')) = 'nurse'
    );
$$;

revoke all on function public.is_tenant_nurse(uuid) from public, anon;
grant execute on function public.is_tenant_nurse(uuid) to authenticated;

drop policy if exists "Nurses update beds" on public.beds;
create policy "Nurses update beds"
  on public.beds for update to authenticated
  using (public.is_tenant_nurse(tenant_id))
  with check (public.is_tenant_nurse(tenant_id));

drop policy if exists "Nurses update bed assignments" on public.bed_assignments;
create policy "Nurses update bed assignments"
  on public.bed_assignments for update to authenticated
  using (
    public.is_tenant_nurse(
      (select admission.tenant_id from public.admissions admission
        where admission.id = admission_id)
    )
  )
  with check (
    public.is_tenant_nurse(
      (select admission.tenant_id from public.admissions admission
        where admission.id = admission_id)
    )
  );
