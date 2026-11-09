-- Patient portal accounts start pending and become visible only after a
-- receptionist approves the registration and links it to a patient record.
alter table public.patient_profiles
  add column if not exists registration_status text not null default 'pending'
  check (registration_status in ('pending', 'approved', 'rejected'));

update public.patient_profiles profile
set registration_status = 'approved'
where exists (
  select 1
  from public.patient_portal_access access
  where access.user_id = profile.id
    and access.status in ('verified', 'active')
);

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
          and role_row.code in ('receptionist', 'hospital_admin', 'admin')
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

create or replace function public.approve_patient_registration(
  _tenant_id uuid,
  _user_id uuid,
  _patient_id uuid,
  _date_of_birth date,
  _sex text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_patient uuid := _patient_id;
  v_number text;
begin
  if auth.uid() is null
    or not (
      public.is_platform_admin()
      or public.is_tenant_admin(_tenant_id)
      or public.is_tenant_receptionist(_tenant_id)
    ) then
    raise exception 'Only hospital staff can approve patient registrations.'
      using errcode = '42501';
  end if;

  select profile.full_name, profile.phone
    into v_profile
    from public.patient_profiles profile
    where profile.id = _user_id
      and profile.registration_status = 'pending';

  if not found then
    raise exception 'That patient registration is no longer pending.'
      using errcode = '22023';
  end if;

  if v_patient is null then
    if _date_of_birth is null
      or _sex is null
      or _sex not in ('female', 'male', 'other', 'unknown') then
      raise exception 'Enter the patient date of birth and sex.'
        using errcode = '22023';
    end if;

    v_number := 'PAT-' || to_char(now(), 'YYYYMMDD') || '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    insert into public.patients (
      tenant_id, patient_number, name, date_of_birth, sex, contact_details, status
    )
    values (
      _tenant_id, v_number, v_profile.full_name, _date_of_birth, _sex,
      v_profile.phone, 'active'
    )
    returning id into v_patient;
  elsif not exists (
    select 1 from public.patients
    where id = v_patient and tenant_id = _tenant_id
  ) then
    raise exception 'That patient does not belong to this hospital.'
      using errcode = '22023';
  end if;

  insert into public.patient_portal_access (
    user_id, patient_id, relationship, verification_method, verified_at, status
  )
  values (_user_id, v_patient, 'self', 'reception', now(), 'active')
  on conflict (user_id, patient_id) do update
    set status = 'active',
        verification_method = 'reception',
        verified_at = now(),
        updated_at = now();

  update public.patient_profiles
  set registration_status = 'approved', updated_at = now()
  where id = _user_id;

  return v_patient;
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
          and role_row.code in ('receptionist', 'hospital_admin', 'admin')
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
revoke all on function public.approve_patient_registration(uuid, uuid, uuid, date, text) from public, anon;
revoke all on function public.reject_patient_registration(uuid) from public, anon;
grant execute on function public.pending_patient_registrations() to authenticated;
grant execute on function public.approve_patient_registration(uuid, uuid, uuid, date, text) to authenticated;
grant execute on function public.reject_patient_registration(uuid) to authenticated;
