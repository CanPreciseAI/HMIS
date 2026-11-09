-- Doctors write handoff notes for the next shift. The note is stored against
-- their encounter as a signed clinical note of type 'handoff', and the nursing
-- dashboard reads every handoff note in the facility with the author's name.

create or replace function public.write_handoff_note(
  _patient_id uuid,
  _content text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_employee_id uuid;
  v_tenant_id uuid;
  v_facility_id uuid;
  v_encounter_id uuid;
  v_note_id uuid;
begin
  if v_user_id is null then
    raise exception 'Sign in to write a handoff note'
      using errcode = '28000';
  end if;

  select employee.id, employee.tenant_id, department.facility_id
    into v_employee_id, v_tenant_id, v_facility_id
  from public.employees employee
  left join public.departments department
    on department.id = employee.department_id
  where employee.user_id = v_user_id
    and employee.employment_status = 'active'
  limit 1;

  if v_employee_id is null then
    raise exception 'Only hospital staff can write handoff notes'
      using errcode = '42501';
  end if;

  if not public.is_doctor_employee(v_employee_id) then
    raise exception 'Only doctors can write handoff notes'
      using errcode = '42501';
  end if;

  if v_facility_id is null then
    raise exception 'Your department is not linked to a facility yet'
      using errcode = '22023';
  end if;

  if _content is null or length(trim(_content)) < 3 then
    raise exception 'Write the handoff details before sending the note'
      using errcode = '22023';
  end if;

  if length(_content) > 4000 then
    raise exception 'Keep the handoff note under 4000 characters'
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
    and encounter.facility_id = v_facility_id
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

  insert into public.clinical_notes (
    tenant_id,
    encounter_id,
    author_id,
    note_type,
    content,
    status,
    signed_by,
    signed_at
  ) values (
    v_tenant_id,
    v_encounter_id,
    v_employee_id,
    'handoff',
    trim(_content),
    'signed',
    v_employee_id,
    now()
  )
  returning id into v_note_id;

  return v_note_id;
end;
$$;

revoke all on function public.write_handoff_note(uuid, text) from public, anon;
grant execute on function public.write_handoff_note(uuid, text) to authenticated;

create or replace function public.facility_handoff_notes(_facility_id uuid)
returns table (
  note_id uuid,
  patient_name text,
  author_name text,
  content text,
  note_type text,
  status text,
  created_at timestamptz
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
    note.id,
    patient.name,
    coalesce(profile.full_name, 'Doctor'),
    note.content,
    note.note_type,
    note.status,
    note.created_at
  from public.clinical_notes note
  join public.encounters encounter on encounter.id = note.encounter_id
  join public.patients patient on patient.id = encounter.patient_id
  left join public.employees author on author.id = note.author_id
  left join public.staff_profiles profile on profile.id = author.user_id
  where encounter.facility_id = _facility_id
    and note.tenant_id = encounter.tenant_id
    and lower(note.note_type) like '%handoff%'
  order by note.created_at desc
  limit 50;
end;
$$;

revoke all on function public.facility_handoff_notes(uuid) from public, anon;
grant execute on function public.facility_handoff_notes(uuid) to authenticated;
