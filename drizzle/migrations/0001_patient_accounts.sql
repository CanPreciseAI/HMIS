create table public.patient_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_approval_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  requested_role public.staff_role not null check (requested_role <> 'admin'),
  full_name text not null,
  email text not null,
  phone text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

grant select, update on public.patient_profiles to authenticated;
grant all on public.patient_profiles to service_role;
grant select on public.staff_approval_requests to authenticated;
grant all on public.staff_approval_requests to service_role;

alter table public.patient_profiles enable row level security;
alter table public.staff_approval_requests enable row level security;

create policy "Patients can view own profile"
  on public.patient_profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Patients can update own profile"
  on public.patient_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Staff can view own approval request"
  on public.staff_approval_requests for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Admins can view staff approval requests"
  on public.staff_approval_requests for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can view staff profiles"
  on public.staff_profiles for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

create or replace function public.handle_new_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text := lower(coalesce(new.raw_user_meta_data->>'account_type', 'staff'));
  v_role text := lower(coalesce(nullif(new.raw_user_meta_data->>'role',''), 'receptionist'));
  v_valid boolean;
  v_phone text := nullif(trim(new.raw_user_meta_data->>'phone'), '');
begin
  if v_phone is null or v_phone !~ '^[+0-9][0-9 ()-]{5,19}$' then
    raise exception 'A valid mobile number is required';
  end if;

  if v_account_type = 'patient' then
    insert into public.patient_profiles (id, full_name, phone)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'New Patient'),
      v_phone
    );
    return new;
  end if;

  insert into public.staff_profiles (id, full_name, phone, department, specialization, license_number)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'New Staff'),
    v_phone,
    nullif(new.raw_user_meta_data->>'department',''),
    nullif(new.raw_user_meta_data->>'specialization',''),
    nullif(new.raw_user_meta_data->>'license_number','')
  );

  select exists (
    select 1
    from unnest(enum_range(null::public.staff_role)) r
    where r::text = v_role and r::text <> 'admin'
  ) into v_valid;

  if not v_valid then
    v_role := 'receptionist';
  end if;

  insert into public.staff_approval_requests
    (user_id, requested_role, full_name, email, phone)
  values (
    new.id,
    v_role::public.staff_role,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'New Staff'),
    new.email,
    v_phone
  );

  return new;
end;
$$;

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
  v_request public.staff_approval_requests;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then
    raise exception 'Only an administrator can review staff requests';
  end if;

  select *
    into v_request
    from public.staff_approval_requests
    where id = _request_id
    for update;

  if not found then
    raise exception 'Staff approval request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Staff approval request has already been reviewed';
  end if;

  if _approved then
    insert into public.user_roles (user_id, role)
    values (v_request.user_id, v_request.requested_role)
    on conflict (user_id, role) do nothing;
  end if;

  update public.staff_approval_requests
    set status = case when _approved then 'approved' else 'rejected' end,
        reviewed_at = now(),
        reviewed_by = auth.uid()
    where id = _request_id;
end;
$$;

revoke all on function public.review_staff_access_request(uuid, boolean) from public;
grant execute on function public.review_staff_access_request(uuid, boolean) to authenticated;

create or replace function public.promote_confirmed_staff_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.email_confirmed_at is not null
    or new.email_confirmed_at is null
    or lower(new.email) <> 'prajvalakka021@gmail.com'
    or lower(coalesce(new.raw_user_meta_data->>'account_type', 'staff')) <> 'staff' then
    return new;
  end if;

  insert into public.staff_profiles (id, full_name, phone)
  values (
    new.id,
    'Prajval Akka',
    nullif(trim(new.raw_user_meta_data->>'phone'), '')
  )
  on conflict (id) do update set full_name = 'Prajval Akka';

  insert into public.user_roles (user_id, role)
  values (new.id, 'admin')
  on conflict (user_id, role) do nothing;

  delete from public.staff_approval_requests
    where user_id = new.id and status = 'pending';

  return new;
end;
$$;

create trigger promote_confirmed_staff_admin
  after update of email_confirmed_at on auth.users
  for each row execute function public.promote_confirmed_staff_admin();

do $$
declare
  v_admin auth.users%rowtype;
begin
  select *
    into v_admin
    from auth.users
    where lower(email) = 'prajvalakka021@gmail.com'
      and email_confirmed_at is not null
      and lower(coalesce(raw_user_meta_data->>'account_type', 'staff')) = 'staff'
    limit 1;

  if found then
    insert into public.staff_profiles (id, full_name, phone)
    values (
      v_admin.id,
      'Prajval Akka',
      nullif(trim(v_admin.raw_user_meta_data->>'phone'), '')
    )
    on conflict (id) do update set full_name = 'Prajval Akka';

    insert into public.user_roles (user_id, role)
    values (v_admin.id, 'admin')
    on conflict (user_id, role) do nothing;

    delete from public.staff_approval_requests
      where user_id = v_admin.id and status = 'pending';
  end if;
end;
$$;
