-- Allow a hospital administrator applicant to join an existing tenant.

create index hospital_admin_registration_requests_tenant_status_idx
  on public.hospital_admin_registration_requests (tenant_id, status, submitted_at);

create or replace function public.handle_new_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text := lower(coalesce(new.raw_user_meta_data->>'account_type', 'staff'));
  v_role text := lower(coalesce(nullif(new.raw_user_meta_data->>'role', ''), 'receptionist'));
  v_full_name text := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'New Staff');
  v_department text := nullif(trim(new.raw_user_meta_data->>'department'), '');
  v_hospital_name text := nullif(trim(new.raw_user_meta_data->>'hospital_name'), '');
  v_tenant_id uuid := nullif(new.raw_user_meta_data->>'tenant_id', '')::uuid;
  v_phone text := nullif(trim(new.raw_user_meta_data->>'phone'), '');
  v_valid boolean;
begin
  if v_phone is null or v_phone !~ '^[+0-9][0-9 ()-]{5,19}$' then
    raise exception 'A valid mobile number is required';
  end if;

  if v_account_type = 'patient' then
    insert into public.patient_profiles (id, full_name, phone)
    values (
      new.id,
      coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'New Patient'),
      v_phone
    );
    return new;
  end if;

  if v_account_type not in ('staff', 'hospital_admin') then
    raise exception 'Unsupported account type';
  end if;

  if v_account_type = 'hospital_admin' then
    if v_tenant_id is not null then
      select tenant.name into v_hospital_name
      from public.tenants tenant
      where tenant.id = v_tenant_id
        and tenant.status in ('active', 'trial');
      if not found then
        raise exception 'Choose an approved hospital';
      end if;
    elsif v_hospital_name is null or length(v_hospital_name) > 160 then
      raise exception 'Enter a valid hospital name';
    end if;
  end if;

  if v_account_type = 'staff'
    and lower(coalesce(new.email, '')) <> 'prajvalakka021@gmail.com' then
    if v_tenant_id is null or not exists (
      select 1 from public.tenants
      where id = v_tenant_id and status in ('active', 'trial')
    ) then
      raise exception 'Choose an approved hospital';
    end if;

    select exists (
      select 1 from unnest(enum_range(null::public.staff_role)) candidate
      where candidate::text = v_role and candidate::text <> 'admin'
    ) into v_valid;

    if not v_valid then
      raise exception 'Choose a valid staff role';
    end if;
  end if;

  insert into public.staff_profiles
    (id, full_name, phone, department, specialization, license_number)
  values (
    new.id,
    v_full_name,
    v_phone,
    v_department,
    nullif(trim(new.raw_user_meta_data->>'specialization'), ''),
    nullif(trim(new.raw_user_meta_data->>'license_number'), '')
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone,
        department = excluded.department,
        specialization = excluded.specialization,
        license_number = excluded.license_number;

  insert into public.users (id, email, phone, auth_subject)
  values (new.id, new.email, v_phone, new.id::text)
  on conflict (id) do nothing;

  if v_account_type = 'staff'
    and lower(coalesce(new.email, '')) = 'prajvalakka021@gmail.com' then
    return new;
  end if;

  if v_account_type = 'hospital_admin' then
    insert into public.hospital_admin_registration_requests
      (user_id, hospital_name, full_name, email, phone, tenant_id)
    values (new.id, v_hospital_name, v_full_name, new.email, v_phone, v_tenant_id);
    return new;
  end if;

  insert into public.staff_approval_requests
    (user_id, requested_role, full_name, email, phone, tenant_id)
  values (
    new.id,
    v_role::public.staff_role,
    v_full_name,
    new.email,
    v_phone,
    v_tenant_id
  );

  return new;
end;
$$;

create or replace function public.review_hospital_admin_registration(
  _request_id uuid,
  _approved boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.hospital_admin_registration_requests%rowtype;
  v_tenant_id uuid;
  v_facility_id uuid;
  v_department_id uuid;
  v_role_id uuid;
  v_slug text;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception 'Only a platform administrator can review hospital administrator requests';
  end if;

  select * into v_request
  from public.hospital_admin_registration_requests
  where id = _request_id
  for update;

  if not found then
    raise exception 'Hospital administrator request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Hospital administrator request has already been reviewed';
  end if;

  if _approved then
    if not exists (
      select 1 from auth.users
      where id = v_request.user_id and email_confirmed_at is not null
    ) then
      raise exception 'The applicant must confirm their email before approval';
    end if;

    if v_request.tenant_id is null then
      if exists (
        select 1 from public.tenants
        where lower(name) = lower(v_request.hospital_name)
      ) then
        raise exception 'A hospital with this name is already registered';
      end if;

      v_slug := trim(both '-' from regexp_replace(
        lower(v_request.hospital_name), '[^a-z0-9]+', '-', 'g'
      ));
      v_slug := left(coalesce(nullif(v_slug, ''), 'hospital'), 80)
        || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);

      insert into public.tenants (name, slug, status)
      values (v_request.hospital_name, v_slug, 'active')
      returning id into v_tenant_id;

      insert into public.facilities (tenant_id, name, facility_code)
      values (v_tenant_id, v_request.hospital_name, 'MAIN')
      returning id into v_facility_id;

      insert into public.departments (tenant_id, facility_id, name, department_code)
      values (v_tenant_id, v_facility_id, 'Administration', 'ADMIN')
      returning id into v_department_id;
    else
      select tenant.id into v_tenant_id
      from public.tenants tenant
      where tenant.id = v_request.tenant_id
        and tenant.status in ('active', 'trial');
      if not found then
        raise exception 'The selected hospital is no longer available';
      end if;

      select facility.id into v_facility_id
      from public.facilities facility
      where facility.tenant_id = v_tenant_id
        and facility.status = 'active'
      order by (facility.facility_code = 'MAIN') desc, facility.created_at
      limit 1;
      if not found then
        raise exception 'The selected hospital has no active facility';
      end if;

      select department.id into v_department_id
      from public.departments department
      where department.facility_id = v_facility_id
        and (
          lower(department.name) = 'administration'
          or upper(department.department_code) = 'ADMIN'
        )
      order by (upper(department.department_code) = 'ADMIN') desc
      limit 1;
      if not found then
        insert into public.departments
          (tenant_id, facility_id, name, department_code)
        values (v_tenant_id, v_facility_id, 'Administration', 'ADMIN')
        returning id into v_department_id;
      end if;
    end if;

    v_role_id := public.ensure_tenant_role(v_tenant_id, 'hospital_admin');

    insert into public.employees
      (tenant_id, employee_code, user_id, department_id)
    values (
      v_tenant_id,
      'HADM-' || left(replace(v_request.user_id::text, '-', ''), 8),
      v_request.user_id,
      v_department_id
    );

    insert into public.user_role_assignments
      (user_id, role_id, tenant_id, facility_id, department_id)
    values
      (v_request.user_id, v_role_id, v_tenant_id, v_facility_id, v_department_id);

    update public.hospital_admin_registration_requests
    set status = 'approved',
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        tenant_id = v_tenant_id
    where id = _request_id;
  else
    update public.hospital_admin_registration_requests
    set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid()
    where id = _request_id;
  end if;
end;
$$;

revoke all on function public.review_hospital_admin_registration(uuid, boolean)
  from public;
grant execute on function public.review_hospital_admin_registration(uuid, boolean)
  to authenticated;
