-- Policy claims now settle the hospital's invoice-based insurance claims. A
-- policy claim links to one insurance_claims row, and marking it paid records an
-- insurance payment allocation against the real invoice.

alter table public.insurance_policy_claims
  add column if not exists invoice_claim_id uuid
  references public.insurance_claims(id) on delete set null;

create unique index if not exists insurance_policy_claims_invoice_claim_uidx
  on public.insurance_policy_claims (invoice_claim_id)
  where invoice_claim_id is not null;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

drop function if exists public.facility_insurance_claims(uuid);

create function public.facility_insurance_claims(_facility_id uuid)
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
  approved_amount numeric,
  status text,
  note text,
  decision_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_name text,
  invoice_claim_id uuid,
  invoice_id uuid,
  invoice_number text,
  invoice_status text,
  invoice_net_amount numeric,
  invoice_paid_amount numeric,
  invoice_outstanding numeric
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
    coalesce(invoice_claim.approved_amount, 0),
    claim.status,
    claim.note,
    claim.decision_note,
    claim.submitted_at,
    claim.reviewed_at,
    coalesce(reviewer.full_name, 'Staff'),
    claim.invoice_claim_id,
    invoice_claim.invoice_id,
    invoice.invoice_number,
    invoice.status,
    invoice.net_amount,
    case
      when invoice.id is null then null
      else coalesce(paid.amount, 0)
    end,
    case
      when invoice.id is null then null
      else greatest(invoice.net_amount - coalesce(paid.amount, 0), 0)
    end
  from public.insurance_policy_claims claim
  join public.insurance_policies policy on policy.id = claim.policy_id
  join public.patients patient on patient.id = claim.patient_id
  left join public.staff_profiles reviewer on reviewer.id = claim.reviewed_by
  left join public.insurance_claims invoice_claim
    on invoice_claim.id = claim.invoice_claim_id
  left join public.invoices invoice on invoice.id = invoice_claim.invoice_id
  left join lateral (
    select sum(allocation.allocated_amount)::numeric(19,4) as amount
    from public.payment_allocations allocation
    join public.payments payment on payment.id = allocation.payment_id
    where allocation.invoice_id = invoice.id
      and payment.status <> 'refunded'
  ) paid on true
  where claim.facility_id = _facility_id
  order by claim.submitted_at desc
  limit 300;
end;
$$;

revoke all on function public.facility_insurance_claims(uuid) from public, anon;
grant execute on function public.facility_insurance_claims(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

drop function if exists public.submit_insurance_claim(uuid, numeric, text);
drop function if exists public.submit_insurance_claim(uuid, uuid, text);

create function public.submit_insurance_claim(
  _policy_id uuid,
  _invoice_id uuid,
  _note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy record;
  v_invoice record;
  v_payer uuid;
  v_claim uuid;
  v_invoice_claim uuid;
  v_number text;
  v_paid numeric(19,4);
  v_outstanding numeric(19,4);
  v_amount numeric(19,4);
begin
  if auth.uid() is null then
    raise exception 'Sign in to raise a claim'
      using errcode = '42501';
  end if;

  select policy.id, policy.tenant_id, policy.facility_id, policy.patient_id,
         policy.provider_name, policy.coverage_percent, policy.valid_from,
         policy.valid_until, policy.status
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

  if current_date < v_policy.valid_from
    or (v_policy.valid_until is not null and current_date > v_policy.valid_until) then
    raise exception 'That policy is not in force today'
      using errcode = '22023';
  end if;

  select invoice.id, invoice.tenant_id, invoice.facility_id, invoice.patient_id,
         invoice.net_amount, invoice.status
    into v_invoice
  from public.invoices invoice
  where invoice.id = _invoice_id
  for update;

  if not found then
    raise exception 'That hospital invoice could not be found'
      using errcode = '22023';
  end if;

  if v_invoice.tenant_id <> v_policy.tenant_id
    or v_invoice.facility_id <> v_policy.facility_id
    or v_invoice.patient_id <> v_policy.patient_id then
    raise exception 'Choose an invoice for the policy patient at this facility'
      using errcode = '22023';
  end if;

  if v_invoice.status not in ('issued', 'partially_paid') then
    raise exception 'Only an issued or partly paid invoice can be claimed'
      using errcode = '22023';
  end if;

  select coalesce(sum(allocation.allocated_amount), 0)
    into v_paid
  from public.payment_allocations allocation
  where allocation.invoice_id = _invoice_id;

  v_outstanding := v_invoice.net_amount - v_paid;

  if v_outstanding <= 0.0001 then
    raise exception 'That invoice has already been settled'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.insurance_claims claim
    where claim.invoice_id = _invoice_id
      and claim.status in ('submitted', 'in_review', 'approved', 'paid')
  ) then
    raise exception 'That invoice already has an active insurance claim'
      using errcode = '22023';
  end if;

  select payer.id into v_payer
  from public.payers payer
  where payer.tenant_id = v_policy.tenant_id
    and payer.payer_type = 'insurance'
    and lower(trim(payer.name)) = lower(trim(v_policy.provider_name))
  order by payer.created_at
  limit 1;

  if v_payer is null then
    insert into public.payers (
      tenant_id,
      payer_type,
      name,
      payer_code,
      status
    )
    values (
      v_policy.tenant_id,
      'insurance',
      v_policy.provider_name,
      'INS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
      'active'
    )
    returning id into v_payer;
  end if;

  v_amount := round(v_outstanding * v_policy.coverage_percent / 100, 4);

  if v_amount <= 0 then
    raise exception 'This policy does not cover any of the invoice balance'
      using errcode = '22023';
  end if;

  v_number := 'CLM-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.insurance_claims (
    patient_id,
    invoice_id,
    payer_id,
    claim_number,
    claimed_amount,
    approved_amount,
    status
  )
  values (
    v_policy.patient_id,
    v_invoice.id,
    v_payer,
    v_number,
    v_amount,
    0,
    'submitted'
  )
  returning id into v_invoice_claim;

  insert into public.insurance_policy_claims (
    tenant_id,
    facility_id,
    policy_id,
    patient_id,
    claim_number,
    amount,
    status,
    note,
    invoice_claim_id,
    submitted_by
  )
  values (
    v_policy.tenant_id,
    v_policy.facility_id,
    v_policy.id,
    v_policy.patient_id,
    v_number,
    v_amount,
    'submitted',
    nullif(trim(coalesce(_note, '')), ''),
    v_invoice_claim,
    auth.uid()
  )
  returning id into v_claim;

  return v_claim;
end;
$$;

revoke all on function public.submit_insurance_claim(uuid, uuid, text)
  from public, anon;
grant execute on function public.submit_insurance_claim(uuid, uuid, text)
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
  v_invoice_claim record;
  v_invoice record;
  v_paid numeric(19,4);
  v_outstanding numeric(19,4);
  v_payment_amount numeric(19,4);
  v_payment uuid;
  v_status text := lower(trim(coalesce(_status, '')));
begin
  if auth.uid() is null then
    raise exception 'Sign in to review a claim'
      using errcode = '42501';
  end if;

  select claim.id, claim.tenant_id, claim.patient_id, claim.amount,
         claim.status, claim.invoice_claim_id
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

  if v_claim.invoice_claim_id is not null then
    select claim.id, claim.invoice_id, claim.payer_id, claim.status
      into v_invoice_claim
    from public.insurance_claims claim
    where claim.id = v_claim.invoice_claim_id
    for update;

    if not found then
      raise exception 'The linked hospital invoice claim could not be found'
        using errcode = '22023';
    end if;

    if v_invoice_claim.status in ('rejected', 'paid') then
      raise exception 'The linked hospital invoice claim is already closed'
        using errcode = '22023';
    end if;
  end if;

  if v_status = 'paid' and v_claim.invoice_claim_id is null then
    raise exception 'This claim is not linked to a hospital invoice'
      using errcode = '22023';
  end if;

  if v_status = 'paid' then
    if v_invoice_claim.status <> 'approved' then
      raise exception 'Approve the hospital invoice claim before settlement'
        using errcode = '22023';
    end if;

    select invoice.id, invoice.tenant_id, invoice.patient_id,
           invoice.net_amount, invoice.status
      into v_invoice
    from public.invoices invoice
    where invoice.id = v_invoice_claim.invoice_id
    for update;

    if not found then
      raise exception 'The linked hospital invoice could not be found'
        using errcode = '22023';
    end if;

    if v_invoice.tenant_id <> v_claim.tenant_id
      or v_invoice.patient_id <> v_claim.patient_id then
      raise exception 'The linked invoice does not belong to this claim'
        using errcode = '22023';
    end if;

    if v_invoice.status not in ('issued', 'partially_paid') then
      raise exception 'That hospital invoice is no longer open for settlement'
        using errcode = '22023';
    end if;

    select coalesce(sum(allocation.allocated_amount), 0)
      into v_paid
    from public.payment_allocations allocation
    where allocation.invoice_id = v_invoice.id;

    v_outstanding := v_invoice.net_amount - v_paid;

    if v_outstanding <= 0.0001 then
      raise exception 'That hospital invoice is already settled'
        using errcode = '22023';
    end if;

    v_payment_amount := least(v_claim.amount, v_outstanding);

    insert into public.payments (
      tenant_id,
      payment_reference,
      patient_id,
      payer_id,
      method,
      amount,
      currency,
      status,
      received_at
    )
    values (
      v_claim.tenant_id,
      'INS-' || to_char(now() at time zone 'UTC', 'YYYYMMDD') || '-' ||
        upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
      v_invoice.patient_id,
      v_invoice_claim.payer_id,
      'insurance',
      v_payment_amount,
      'INR',
      'allocated',
      now()
    )
    returning id into v_payment;

    insert into public.payment_allocations (
      payment_id,
      invoice_id,
      allocated_amount
    )
    values (v_payment, v_invoice.id, v_payment_amount);

    v_paid := v_paid + v_payment_amount;
    v_outstanding := v_invoice.net_amount - v_paid;

    update public.invoices
    set status = case
          when v_outstanding <= 0.0001 then 'paid'
          else 'partially_paid'
        end,
        updated_at = now()
    where id = v_invoice.id;

    update public.insurance_claims
    set status = 'paid',
        approved_amount = v_claim.amount,
        updated_at = now()
    where id = v_claim.invoice_claim_id;
  elsif v_claim.invoice_claim_id is not null then
    update public.insurance_claims
    set status = v_status,
        approved_amount = case when v_status = 'approved' then v_claim.amount else 0 end,
        updated_at = now()
    where id = v_claim.invoice_claim_id;
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