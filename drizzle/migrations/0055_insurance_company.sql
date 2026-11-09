-- Insurance companies manage cover for patients treated at the hospital and
-- decide the claims raised against those policies.

insert into public.designations (code, name, description)
values ('insurance', 'Insurance', 'Policies and claims for insured patients')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_tenant_insurance(_tenant_id uuid)
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
        and lower(replace(role_row.name, ' ', '_')) = 'insurance'
    );
$$;

revoke all on function public.is_tenant_insurance(uuid) from public, anon;
grant execute on function public.is_tenant_insurance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete cascade,
  provider_name text not null,
  policy_number text not null,
  plan_name text,
  coverage_percent numeric(5,2) not null default 100
    check (coverage_percent between 0 and 100),
  valid_from date not null default current_date,
  valid_until date,
  status text not null default 'active'
    check (status in ('active', 'expired', 'cancelled')),
  created_by uuid references public.users(id) on delete set null
    default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_name, policy_number),
  check (valid_until is null or valid_until >= valid_from)
);

create index if not exists insurance_policies_facility_idx
  on public.insurance_policies (facility_id, created_at desc);
create index if not exists insurance_policies_patient_idx
  on public.insurance_policies (patient_id, status);

alter table public.insurance_policies enable row level security;
revoke all on public.insurance_policies from anon;
grant select, insert, update on public.insurance_policies to authenticated;

create policy "Hospital staff read insurance policies"
  on public.insurance_policies for select to authenticated
  using (
    not public.is_patient_account()
    and (public.is_platform_admin() or public.is_tenant_member(tenant_id))
  );

create policy "Insurance staff add policies"
  on public.insurance_policies for insert to authenticated
  with check (
    public.is_tenant_insurance(tenant_id)
    or public.is_tenant_admin(tenant_id)
  );

create policy "Insurance staff update policies"
  on public.insurance_policies for update to authenticated
  using (
    public.is_tenant_insurance(tenant_id)
    or public.is_tenant_admin(tenant_id)
  )
  with check (
    public.is_tenant_insurance(tenant_id)
    or public.is_tenant_admin(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- Claims
-- ---------------------------------------------------------------------------

create table if not exists public.insurance_policy_claims (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  facility_id uuid not null references public.facilities(id) on delete restrict,
  policy_id uuid not null references public.insurance_policies(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  claim_number text not null unique,
  amount numeric(19,4) not null check (amount > 0),
  status text not null default 'submitted'
    check (status in ('submitted', 'approved', 'rejected', 'paid')),
  note text,
  decision_note text,
  submitted_by uuid references public.users(id) on delete set null
    default auth.uid(),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists insurance_policy_claims_facility_idx
  on public.insurance_policy_claims (facility_id, submitted_at desc);
create index if not exists insurance_policy_claims_policy_idx
  on public.insurance_policy_claims (policy_id, status);

alter table public.insurance_policy_claims enable row level security;
revoke all on public.insurance_policy_claims from anon;
-- Claims are written only through the functions below.
grant select on public.insurance_policy_claims to authenticated;

create policy "Hospital staff read insurance claims"
  on public.insurance_policy_claims for select to authenticated
  using (
    not public.is_patient_account()
    and (public.is_platform_admin() or public.is_tenant_member(tenant_id))
  );

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

create or replace function public.facility_insurance_policies(_facility_id uuid)
returns table (
  policy_id uuid,
  patient_id uuid,
  patient_name text,
  patient_number text,
  provider_name text,
  policy_number text,
  plan_name text,
  coverage_percent numeric,
  valid_from date,
  valid_until date,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  select facility.tenant_id into v_tenant
  from public.facilities facility
  where facility.id = _facility_id;

  if v_tenant is null then
    raise exception 'That facility could not be found'
      using errcode = '22023';
  end if;

  if auth.uid() is null
    or public.is_patient_account()
    or not (public.is_platform_admin() or public.is_tenant_member(v_tenant)) then
    raise exception 'Only hospital staff can read insurance policies'
      using errcode = '42501';
  end if;

  return query
  select
    policy.id,
    policy.patient_id,
    patient.name,
    patient.patient_number,
    policy.provider_name,
    policy.policy_number,
    policy.plan_name,
    policy.coverage_percent,
    policy.valid_from,
    policy.valid_until,
    policy.status,
    policy.created_at
  from public.insurance_policies policy
  join public.patients patient on patient.id = policy.patient_id
  where policy.facility_id = _facility_id
  order by policy.created_at desc
  limit 300;
end;
$$;

revoke all on function public.facility_insurance_policies(uuid) from public, anon;
grant execute on function public.facility_insurance_policies(uuid) to authenticated;

create or replace function public.facility_insurance_policy_claims(_facility_id uuid)
returns table (
  claim_id uuid,
  claim_number text,
  policy_id uuid,
  patient_id uuid,
  patient_name text,
  patient_number text,
  provider_name text,
  policy_number text,
  amount numeric,
  status text,
  note text,
  decision_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  select facility.tenant_id into v_tenant
  from public.facilities facility
  where facility.id = _facility_id;

  if v_tenant is null then
    raise exception 'That facility could not be found'
      using errcode = '22023';
  end if;

  if auth.uid() is null
    or public.is_patient_account()
    or not (public.is_platform_admin() or public.is_tenant_member(v_tenant)) then
    raise exception 'Only hospital staff can read insurance claims'
      using errcode = '42501';
  end if;

  return query
  select
    claim.id,
    claim.claim_number,
    claim.policy_id,
    claim.patient_id,
    patient.name,
    patient.patient_number,
    policy.provider_name,
    policy.policy_number,
    claim.amount,
    claim.status,
    claim.note,
    claim.decision_note,
    claim.submitted_at,
    claim.reviewed_at,
    coalesce(reviewer.full_name, 'Staff')
  from public.insurance_policy_claims claim
  join public.insurance_policies policy on policy.id = claim.policy_id
  join public.patients patient on patient.id = claim.patient_id
  left join public.staff_profiles reviewer on reviewer.id = claim.reviewed_by
  where claim.facility_id = _facility_id
  order by claim.submitted_at desc
  limit 300;
end;
$$;

revoke all on function public.facility_insurance_policy_claims(uuid) from public, anon;
grant execute on function public.facility_insurance_policy_claims(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

create or replace function public.submit_insurance_claim(
  _policy_id uuid,
  _amount numeric,
  _note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy record;
  v_claim uuid;
  v_number text;
begin
  if auth.uid() is null then
    raise exception 'Sign in to raise a claim'
      using errcode = '42501';
  end if;

  select policy.id, policy.tenant_id, policy.facility_id, policy.patient_id,
         policy.status
    into v_policy
  from public.insurance_policies policy
  where policy.id = _policy_id;

  if not found then
    raise exception 'That policy could not be found'
      using errcode = '22023';
  end if;

  if not (
    public.is_tenant_insurance(v_policy.tenant_id)
    or public.is_tenant_admin(v_policy.tenant_id)
  ) then
    raise exception 'Only an insurance company can raise a claim'
      using errcode = '42501';
  end if;

  if v_policy.status <> 'active' then
    raise exception 'Only an active policy can be claimed against'
      using errcode = '22023';
  end if;

  if coalesce(_amount, 0) <= 0 then
    raise exception 'Enter a claim amount greater than zero'
      using errcode = '22023';
  end if;

  v_number := 'CLM-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.insurance_policy_claims (
    tenant_id,
    facility_id,
    policy_id,
    patient_id,
    claim_number,
    amount,
    note,
    submitted_by
  )
  values (
    v_policy.tenant_id,
    v_policy.facility_id,
    v_policy.id,
    v_policy.patient_id,
    v_number,
    _amount,
    nullif(trim(coalesce(_note, '')), ''),
    auth.uid()
  )
  returning id into v_claim;

  return v_claim;
end;
$$;

revoke all on function public.submit_insurance_claim(uuid, numeric, text)
  from public, anon;
grant execute on function public.submit_insurance_claim(uuid, numeric, text)
  to authenticated;

create or replace function public.review_insurance_claim(
  _claim_id uuid,
  _status text,
  _note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim record;
  v_status text := lower(trim(coalesce(_status, '')));
begin
  if auth.uid() is null then
    raise exception 'Sign in to review a claim'
      using errcode = '42501';
  end if;

  select claim.id, claim.tenant_id, claim.status
    into v_claim
  from public.insurance_policy_claims claim
  where claim.id = _claim_id
  for update;

  if not found then
    raise exception 'That claim could not be found'
      using errcode = '22023';
  end if;

  if not (
    public.is_tenant_insurance(v_claim.tenant_id)
    or public.is_tenant_admin(v_claim.tenant_id)
  ) then
    raise exception 'Only an insurance company can review a claim'
      using errcode = '42501';
  end if;

  if v_status not in ('approved', 'rejected', 'paid') then
    raise exception 'Choose approved, rejected or paid'
      using errcode = '22023';
  end if;

  if v_status = 'paid' and v_claim.status <> 'approved' then
    raise exception 'Approve the claim before marking it paid'
      using errcode = '22023';
  end if;

  if v_claim.status in ('paid', 'rejected') then
    raise exception 'This claim has already been closed'
      using errcode = '22023';
  end if;

  if v_claim.status = 'approved' and v_status <> 'paid' then
    raise exception 'An approved claim can only be marked paid'
      using errcode = '22023';
  end if;

  update public.insurance_policy_claims
  set status = v_status,
      decision_note = nullif(trim(coalesce(_note, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = _claim_id;
end;
$$;

revoke all on function public.review_insurance_claim(uuid, text, text)
  from public, anon;
grant execute on function public.review_insurance_claim(uuid, text, text)
  to authenticated;
