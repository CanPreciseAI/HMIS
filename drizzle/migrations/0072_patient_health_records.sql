-- Patient health records travel with the patient: conditions (diagnoses),
-- allergies and uploaded reports are readable by the patient, by every staff
-- member of the patient's CURRENT hospital, and by platform administrators.

-- Private bucket for patient-uploaded reports and scans.
insert into storage.buckets (id, name, public)
values ('patient-health-records', 'patient-health-records', false)
on conflict (id) do nothing;

create table if not exists public.patient_health_documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  uploaded_by uuid not null references public.users(id) on delete cascade,
  uploader_role text not null default 'patient',
  title text not null,
  category text not null default 'report',
  file_path text not null unique,
  file_name text not null,
  mime_type text,
  file_size bigint,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists patient_health_documents_patient_idx
  on public.patient_health_documents (patient_id, created_at desc);
create index if not exists patient_health_documents_tenant_idx
  on public.patient_health_documents (tenant_id);

alter table public.patient_health_documents enable row level security;

-- One access check for both the table and the storage bucket. It follows the
-- patient's current hospital, so records remain visible after a transfer.
create or replace function public.can_access_patient_health(_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.patient_portal_access access
      where access.patient_id = _patient_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
    or exists (
      select 1
      from public.patients patient
      where patient.id = _patient_id
        and public.is_tenant_member(patient.tenant_id)
    );
$$;

revoke all on function public.can_access_patient_health(uuid) from public, anon;
grant execute on function public.can_access_patient_health(uuid) to authenticated;

drop policy if exists "Health documents readable" on public.patient_health_documents;
create policy "Health documents readable"
  on public.patient_health_documents for select to authenticated
  using (public.can_access_patient_health(patient_id));

drop policy if exists "Health documents uploadable" on public.patient_health_documents;
create policy "Health documents uploadable"
  on public.patient_health_documents for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and public.can_access_patient_health(patient_id)
  );

drop policy if exists "Health documents removable" on public.patient_health_documents;
create policy "Health documents removable"
  on public.patient_health_documents for delete to authenticated
  using (
    uploaded_by = auth.uid()
    or public.is_tenant_admin(tenant_id)
    or public.is_platform_admin()
  );

drop policy if exists "Health files readable" on storage.objects;
create policy "Health files readable"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'patient-health-records'
    and public.can_access_patient_health((split_part(name, '/', 1))::uuid)
  );

drop policy if exists "Health files uploadable" on storage.objects;
create policy "Health files uploadable"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'patient-health-records'
    and owner_id = auth.uid()::text
    and public.can_access_patient_health((split_part(name, '/', 1))::uuid)
  );

drop policy if exists "Health files removable" on storage.objects;
create policy "Health files removable"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'patient-health-records'
    and (
      owner_id = auth.uid()::text
      or exists (
        select 1
        from public.patient_health_documents document
        where document.file_path = name
          and (
            public.is_tenant_admin(document.tenant_id)
            or public.is_platform_admin()
          )
      )
    )
  );

-- Doctors record a diagnosis for a patient. It is appended to the patient's
-- encounter (creating an outpatient encounter when none is open) so it flows
-- into the patient's health information immediately.
create or replace function public.record_patient_diagnosis(
  _patient_id uuid,
  _diagnosis_code text,
  _description text default null,
  _diagnosis_type text default 'primary'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_tenant_id uuid;
  v_facility_id uuid;
  v_encounter_id uuid;
  v_diagnosis_id uuid;
  v_type text := coalesce(nullif(trim(_diagnosis_type), ''), 'primary');
begin
  if auth.uid() is null then
    raise exception 'Sign in to record a diagnosis'
      using errcode = '42501';
  end if;

  select employee.id, employee.tenant_id, department.facility_id
    into v_employee_id, v_tenant_id, v_facility_id
  from public.employees employee
  left join public.departments department on department.id = employee.department_id
  where employee.user_id = auth.uid()
    and employee.employment_status = 'active'
  limit 1;

  if v_employee_id is null or not public.is_doctor_employee(v_employee_id) then
    raise exception 'Only doctors can record a diagnosis'
      using errcode = '42501';
  end if;

  if v_facility_id is null then
    raise exception 'Your department is not linked to a facility yet'
      using errcode = '22023';
  end if;

  if _diagnosis_code is null or trim(_diagnosis_code) = '' then
    raise exception 'Enter a diagnosis code or name'
      using errcode = '22023';
  end if;

  if v_type not in ('primary', 'secondary', 'provisional', 'differential') then
    raise exception 'Choose a valid diagnosis type'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.patients patient
    where patient.id = _patient_id
      and patient.tenant_id = v_tenant_id
      and patient.status = 'active'
  ) then
    raise exception 'That patient is not active in this hospital'
      using errcode = '22023';
  end if;

  select encounter.id
    into v_encounter_id
  from public.encounters encounter
  where encounter.patient_id = _patient_id
    and encounter.tenant_id = v_tenant_id
    and encounter.provider_id = v_employee_id
    and encounter.status = 'open'
  order by encounter.started_at desc
  limit 1;

  if v_encounter_id is null then
    insert into public.encounters (
      tenant_id,
      facility_id,
      patient_id,
      encounter_type,
      provider_id
    ) values (
      v_tenant_id,
      v_facility_id,
      _patient_id,
      'outpatient',
      v_employee_id
    )
    returning id into v_encounter_id;
  end if;

  insert into public.diagnoses (
    tenant_id,
    encounter_id,
    code_system,
    diagnosis_code,
    description,
    diagnosis_type
  ) values (
    v_tenant_id,
    v_encounter_id,
    'ICD-10',
    upper(trim(_diagnosis_code)),
    nullif(trim(coalesce(_description, '')), ''),
    v_type
  )
  returning id into v_diagnosis_id;

  return v_diagnosis_id;
end;
$$;

revoke all on function public.record_patient_diagnosis(uuid, text, text, text)
  from public, anon;
grant execute on function public.record_patient_diagnosis(uuid, text, text, text)
  to authenticated;
