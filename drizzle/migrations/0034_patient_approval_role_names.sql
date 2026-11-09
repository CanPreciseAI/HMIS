-- Roles are stored by display name (public.roles.name), not a code column.
-- Recreate the review functions with the correct role lookup and add an index
-- for the pending-registration list.
create index if not exists patient_profiles_registration_status_idx
  on public.patient_profiles (registration_status);

create or replace function public.pending_patient_registrations()
returns table (
  user_id uuid,
  full_name text,
  phone text,
  registered_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or not (
      public.is_platform_admin()
      or exists (
        select 1
        from public.user_role_assignments assignment
        join public.roles role_row on role_row.id = assignment.role_id
        where assignment.user_id = auth.uid()
          and lower(replace(role_row.name, ' ', '_')) in (
            'receptionist', 'hospital_admin', 'admin'
          )
      )
    ) then
    raise exception 'Only hospital staff can review patient registrations.'
      using errcode = '42501';
  end if;

  return query
  select profile.id, profile.full_name, profile.phone, profile.created_at
  from public.patient_profiles profile
  where profile.registration_status = 'pending'
  order by profile.created_at;
end;
$$;

create or replace function public.reject_patient_registration(_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or not (
      public.is_platform_admin()
      or exists (
        select 1
        from public.user_role_assignments assignment
        join public.roles role_row on role_row.id = assignment.role_id
        where assignment.user_id = auth.uid()
          and lower(replace(role_row.name, ' ', '_')) in (
            'receptionist', 'hospital_admin', 'admin'
          )
      )
    ) then
    raise exception 'Only hospital staff can review patient registrations.'
      using errcode = '42501';
  end if;

  update public.patient_profiles
  set registration_status = 'rejected', updated_at = now()
  where id = _user_id
    and registration_status = 'pending';

  update public.patient_portal_access
  set status = 'revoked', updated_at = now()
  where user_id = _user_id;
end;
$$;

revoke all on function public.pending_patient_registrations() from public, anon;
revoke all on function public.reject_patient_registration(uuid) from public, anon;
grant execute on function public.pending_patient_registrations() to authenticated;
grant execute on function public.reject_patient_registration(uuid) to authenticated;
