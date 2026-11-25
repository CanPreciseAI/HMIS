-- Vendor accounts: a medical vendor registers like staff, a hospital
-- administrator approves the request, and approval links the account to the
-- supplier record for that hospital (creating one when the supplier is new).
--
-- Vendor accounts are intentionally NOT employees and get NO role assignment,
-- so is_tenant_member() stays false and they cannot read patients, staff or
-- hospital data. They see only their own supplier record and its orders,
-- invoices and payments.

alter table public.vendors
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists vendors_tenant_user_idx
  on public.vendors (tenant_id, user_id)
  where user_id is not null;

alter table public.staff_approval_requests
  add column if not exists vendor_name text;

-- ---------------------------------------------------------------------------
-- Registration: keep the business name with the approval request
-- ---------------------------------------------------------------------------

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
  v_vendor_name text := nullif(trim(new.raw_user_meta_data->>'vendor_name'), '');
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
      raise exception 'Hospital administrator applications must register a new hospital';
    end if;
    if v_hospital_name is null or length(v_hospital_name) > 160 then
      raise exception 'Enter a valid hospital name';
    end if;
  end if;

  if v_account_type = 'staff'
    and lower(coalesce(new.email, '')) <> 'prajvalakka021@gmail.com' then
    if v_tenant_id is null or not exists (
      select 1 from public.tenants tenant
      where tenant.id = v_tenant_id and tenant.status in ('active', 'trial')
        and exists (
          select 1
          from public.user_role_assignments assignment
          join public.roles role on role.id = assignment.role_id
          where assignment.tenant_id = tenant.id
            and assignment.valid_from <= now()
            and (assignment.valid_until is null or assignment.valid_until > now())
            and lower(replace(role.name, ' ', '_')) = 'hospital_admin'
        )
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

    if v_role = 'medical_vendor'
      and (v_vendor_name is null or length(v_vendor_name) < 2) then
      raise exception 'Enter your business or vendor name';
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
      (user_id, hospital_name, full_name, email, phone)
    values (new.id, v_hospital_name, v_full_name, new.email, v_phone);
    return new;
  end if;

  insert into public.staff_approval_requests
    (user_id, requested_role, full_name, email, phone, tenant_id, vendor_name)
  values (
    new.id,
    v_role::public.staff_role,
    v_full_name,
    new.email,
    v_phone,
    v_tenant_id,
    v_vendor_name
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Approval: vendors get a supplier record, not an employee record
-- ---------------------------------------------------------------------------

create or replace function public.review_staff_access_request(
  _request_id uuid,
  _approved boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.staff_approval_requests%rowtype;
  v_profile public.staff_profiles%rowtype;
  v_facility_id uuid;
  v_department_id uuid;
  v_designation_id uuid;
  v_role_id uuid;
  v_employee_id uuid;
  v_vendor_id uuid;
begin
  if auth.uid() is null or public.is_platform_admin() then
    raise exception 'Platform administrators cannot review staff requests';
  end if;

  select * into v_request
  from public.staff_approval_requests
  where id = _request_id
  for update;

  if not found then
    raise exception 'Staff approval request not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Staff approval request has already been reviewed';
  end if;
  if v_request.tenant_id is null or not public.is_hospital_admin(v_request.tenant_id) then
    raise exception 'Only this hospital administrator can review the staff request';
  end if;

  if _approved then
    if not exists (
      select 1 from auth.users
      where id = v_request.user_id and email_confirmed_at is not null
    ) then
      raise exception 'The applicant must confirm their email before approval';
    end if;

    select * into v_profile
    from public.staff_profiles
    where id = v_request.user_id;
    if not found then
      raise exception 'Staff profile not found';
    end if;

    if v_request.requested_role::text = 'medical_vendor' then
      select vendor.id into v_vendor_id
      from public.vendors vendor
      where vendor.tenant_id = v_request.tenant_id
        and (
          vendor.user_id = v_request.user_id
          or (
            vendor.user_id is null
            and lower(coalesce(vendor.email, '')) = lower(v_request.email)
          )
        )
      order by (vendor.user_id = v_request.user_id) desc
      limit 1;

      if v_vendor_id is null then
        insert into public.vendors
          (tenant_id, vendor_code, name, vendor_type, email, phone, user_id, status)
        values (
          v_request.tenant_id,
          'VND-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
          coalesce(v_request.vendor_name, v_request.full_name),
          'medicine',
          v_request.email,
          v_request.phone,
          v_request.user_id,
          'active'
        )
        returning id into v_vendor_id;
      else
        update public.vendors
        set user_id = v_request.user_id,
            name = coalesce(v_request.vendor_name, name),
            email = coalesce(nullif(v_request.email, ''), email),
            phone = coalesce(nullif(v_request.phone, ''), phone)
        where id = v_vendor_id;
      end if;

      insert into public.user_roles (user_id, role)
      values (v_request.user_id, 'medical_vendor')
      on conflict (user_id, role) do nothing;
    else
      select facility.id into v_facility_id
      from public.facilities facility
      where facility.tenant_id = v_request.tenant_id
        and facility.status = 'active'
      order by facility.created_at
      limit 1;
      if v_facility_id is null then
        raise exception 'No active hospital facility is configured';
      end if;

      v_department_id := public.ensure_department(
        v_facility_id,
        coalesce(v_profile.department, 'General')
      );

      select designation.id into v_designation_id
      from public.designations designation
      where designation.code = v_request.requested_role::text
      limit 1;

      select employee.id into v_employee_id
      from public.employees employee
      where employee.tenant_id = v_request.tenant_id
        and employee.user_id = v_request.user_id
      limit 1;

      if v_employee_id is null then
        insert into public.employees
          (tenant_id, employee_code, user_id, department_id, designation_id)
        values (
          v_request.tenant_id,
          public.next_employee_code(),
          v_request.user_id,
          v_department_id,
          v_designation_id
        )
        returning id into v_employee_id;
      else
        update public.employees
        set department_id = v_department_id,
            designation_id = v_designation_id,
            employment_status = 'active'
        where id = v_employee_id;
      end if;

      insert into public.user_roles (user_id, role)
      values (v_request.user_id, v_request.requested_role)
      on conflict (user_id, role) do nothing;

      v_role_id := public.ensure_tenant_role(
        v_request.tenant_id,
        coalesce(
          (select designation.name from public.designations designation
           where designation.id = v_designation_id),
          initcap(replace(v_request.requested_role::text, '_', ' '))
        )
      );

      insert into public.role_permissions (role_id, permission_id)
      select v_role_id, permission.id
      from public.permissions permission
      where permission.action = 'read'
      on conflict (role_id, permission_id) do nothing;

      if not exists (
        select 1
        from public.user_role_assignments assignment
        where assignment.user_id = v_request.user_id
          and assignment.role_id = v_role_id
          and assignment.tenant_id = v_request.tenant_id
          and (assignment.valid_until is null or assignment.valid_until > now())
      ) then
        insert into public.user_role_assignments
          (user_id, role_id, tenant_id, facility_id, department_id)
        values (
          v_request.user_id,
          v_role_id,
          v_request.tenant_id,
          v_facility_id,
          v_department_id
        );
      end if;
    end if;
  end if;

  update public.staff_approval_requests
  set status = case when _approved then 'approved' else 'rejected' end,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = _request_id;
end;
$$;

revoke all on function public.review_staff_access_request(uuid, boolean)
  from public;
grant execute on function public.review_staff_access_request(uuid, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- The vendor's own workspace header
-- ---------------------------------------------------------------------------

create or replace function public.my_vendor_workspace()
returns table (
  vendor_id uuid,
  vendor_name text,
  vendor_status text,
  tenant_id uuid,
  tenant_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select vendor.id, vendor.name, vendor.status, vendor.tenant_id, tenant.name
  from public.vendors vendor
  join public.tenants tenant on tenant.id = vendor.tenant_id
  where vendor.user_id = auth.uid()
  limit 1
$$;

revoke all on function public.my_vendor_workspace() from public, anon;
grant execute on function public.my_vendor_workspace() to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security for vendor accounts
-- ---------------------------------------------------------------------------

-- Permissive access to their own supplier record and its commercial documents.
create policy "Vendors read their own vendor record"
  on public.vendors for select to authenticated
  using (user_id = auth.uid());

create policy "Vendors read their medicine orders"
  on public.medicine_vendor_orders for select to authenticated
  using (
    exists (
      select 1 from public.vendors vendor
      where vendor.id = vendor_id and vendor.user_id = auth.uid()
    )
  );

create policy "Vendors read their purchase orders"
  on public.purchase_orders for select to authenticated
  using (
    exists (
      select 1 from public.vendors vendor
      where vendor.id = vendor_id and vendor.user_id = auth.uid()
    )
  );

create policy "Vendors read their invoices"
  on public.vendor_invoices for select to authenticated
  using (
    exists (
      select 1 from public.vendors vendor
      where vendor.id = vendor_id and vendor.user_id = auth.uid()
    )
  );

create policy "Vendors read their payments"
  on public.vendor_payments for select to authenticated
  using (
    exists (
      select 1 from public.vendors vendor
      where vendor.id = vendor_id and vendor.user_id = auth.uid()
    )
  );

create policy "Vendors read medicines they supply"
  on public.medicine_catalog for select to authenticated
  using (
    exists (
      select 1
      from public.medicine_vendor_orders medicine_order
      join public.vendors vendor on vendor.id = medicine_order.vendor_id
      where medicine_order.medicine_id = medicine_catalog.id
        and vendor.user_id = auth.uid()
    )
  );

-- Restrictive guards: if a vendor account is ever also a tenant member, it
-- still cannot read another supplier's commercial data.
create policy "Vendor accounts only see their supplier row"
  on public.vendors as restrictive for select to authenticated
  using (
    not public.has_role(auth.uid(), 'medical_vendor')
    or user_id = auth.uid()
  );

create policy "Vendor accounts only see their orders"
  on public.medicine_vendor_orders as restrictive for select to authenticated
  using (
    not public.has_role(auth.uid(), 'medical_vendor')
    or exists (
      select 1 from public.vendors vendor
      where vendor.id = vendor_id and vendor.user_id = auth.uid()
    )
  );

create policy "Vendor accounts only see their purchase orders"
  on public.purchase_orders as restrictive for select to authenticated
  using (
    not public.has_role(auth.uid(), 'medical_vendor')
    or exists (
      select 1 from public.vendors vendor
      where vendor.id = vendor_id and vendor.user_id = auth.uid()
    )
  );

create policy "Vendor accounts only see their invoices"
  on public.vendor_invoices as restrictive for select to authenticated
  using (
    not public.has_role(auth.uid(), 'medical_vendor')
    or exists (
      select 1 from public.vendors vendor
      where vendor.id = vendor_id and vendor.user_id = auth.uid()
    )
  );
