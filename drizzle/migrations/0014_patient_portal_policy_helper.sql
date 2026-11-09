-- Keep the patient-chart policy from recursing through the tenant policy on
-- patient_portal_access.
create or replace function public.patient_portal_has_access(_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.patient_portal_access access
    where access.patient_id = _patient_id
      and access.user_id = auth.uid()
      and access.status in ('verified', 'active')
  );
$$;

revoke all on function public.patient_portal_has_access(uuid) from public, anon;
grant execute on function public.patient_portal_has_access(uuid) to authenticated;

alter policy "Portal users read linked patients"
  on public.patients
  using (public.patient_portal_has_access(patients.id));
