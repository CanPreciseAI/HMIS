-- One read for the hospital administrator's billing section: every invoice in
-- the facility with the amount collected, the amount still owed, its status,
-- the latest payment and the staff currently looking after the patient. Staff
-- names come from this function because staff_profiles is otherwise readable
-- only by its owner.

create or replace function public.facility_payment_ledger(_facility_id uuid)
returns table (
  invoice_id uuid,
  invoice_number text,
  patient_id uuid,
  patient_name text,
  patient_number text,
  net_amount numeric,
  paid_amount numeric,
  outstanding numeric,
  invoice_status text,
  issued_at timestamptz,
  last_payment_at timestamptz,
  last_payment_method text,
  last_payment_reference text,
  last_payment_status text,
  doctor_name text,
  nurse_name text,
  ward text,
  bed_code text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.employees employee
    join public.departments department
      on department.id = employee.department_id
    where employee.user_id = auth.uid()
      and employee.employment_status = 'active'
      and department.facility_id = _facility_id
  ) then
    raise exception 'You do not have access to this facility'
      using errcode = '42501';
  end if;

  return query
  select
    invoice.id,
    invoice.invoice_number,
    invoice.patient_id,
    patient.name,
    patient.patient_number,
    invoice.net_amount,
    coalesce(collected.paid_amount, 0),
    greatest(invoice.net_amount - coalesce(collected.paid_amount, 0), 0),
    invoice.status,
    invoice.issued_at,
    latest.received_at,
    latest.method,
    latest.payment_reference,
    latest.status,
    coalesce(care.doctor_name, last_seen.doctor_name),
    care.nurse_name,
    care.ward,
    care.bed_code
  from public.invoices invoice
  join public.patients patient
    on patient.id = invoice.patient_id
  left join lateral (
    select sum(allocation.allocated_amount) as paid_amount
    from public.payment_allocations allocation
    join public.payments payment
      on payment.id = allocation.payment_id
    where allocation.invoice_id = invoice.id
      and payment.status <> 'refunded'
  ) collected on true
  left join lateral (
    select
      payment.received_at,
      payment.method,
      payment.payment_reference,
      payment.status
    from public.payment_allocations allocation
    join public.payments payment
      on payment.id = allocation.payment_id
    where allocation.invoice_id = invoice.id
    order by payment.received_at desc nulls last
    limit 1
  ) latest on true
  left join lateral (
    select
      doctor_profile.full_name as doctor_name,
      nurse_profile.full_name as nurse_name,
      bed.ward,
      bed.bed_code
    from public.admissions admission
    join public.bed_assignments assignment
      on assignment.admission_id = admission.id
      and assignment.status = 'active'
    join public.beds bed
      on bed.id = assignment.bed_id
    left join public.employees doctor
      on doctor.id = assignment.provider_id
    left join public.staff_profiles doctor_profile
      on doctor_profile.id = doctor.user_id
    left join public.employees nurse
      on nurse.id = assignment.nurse_id
    left join public.staff_profiles nurse_profile
      on nurse_profile.id = nurse.user_id
    where admission.patient_id = invoice.patient_id
      and admission.status = 'active'
    order by assignment.start_at desc
    limit 1
  ) care on true
  left join lateral (
    select doctor_profile.full_name as doctor_name
    from public.encounters encounter
    join public.employees doctor
      on doctor.id = encounter.provider_id
    left join public.staff_profiles doctor_profile
      on doctor_profile.id = doctor.user_id
    where encounter.patient_id = invoice.patient_id
      and encounter.facility_id = invoice.facility_id
    order by encounter.started_at desc
    limit 1
  ) last_seen on true
  where invoice.facility_id = _facility_id
  order by coalesce(invoice.issued_at, invoice.created_at) desc
  limit 200;
end;
$$;

revoke all on function public.facility_payment_ledger(uuid) from public, anon;
grant execute on function public.facility_payment_ledger(uuid) to authenticated;
