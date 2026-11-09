create type public.staff_role as enum ('admin','doctor','nurse','lab_technician','pharmacist','receptionist');

create table public.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  department text,
  specialization text,
  license_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.staff_role not null,
  unique (user_id, role)
);

grant select, insert, update, delete on public.staff_profiles to authenticated;
grant all on public.staff_profiles to service_role;
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.staff_profiles enable row level security;
alter table public.user_roles enable row level security;

create policy "Staff can view own profile"
  on public.staff_profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Staff can insert own profile"
  on public.staff_profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Staff can update own profile"
  on public.staff_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Staff can view own roles"
  on public.user_roles for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.staff_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.handle_new_staff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := lower(coalesce(nullif(new.raw_user_meta_data->>'role',''), 'receptionist'));
  v_valid boolean;
begin
  insert into public.staff_profiles (id, full_name, phone, department, specialization, license_number)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), 'New Staff'),
    nullif(new.raw_user_meta_data->>'phone',''),
    nullif(new.raw_user_meta_data->>'department',''),
    nullif(new.raw_user_meta_data->>'specialization',''),
    nullif(new.raw_user_meta_data->>'license_number','')
  );

  select exists (
    select 1 from unnest(enum_range(null::public.staff_role)) r where r::text = v_role
  ) into v_valid;

  if v_valid then
    insert into public.user_roles (user_id, role)
    values (new.id, v_role::public.staff_role)
    on conflict (user_id, role) do nothing;
  else
    insert into public.user_roles (user_id, role)
    values (new.id, 'receptionist')
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end;
$$;

create trigger on_staff_created
  after insert on auth.users
  for each row execute function public.handle_new_staff();