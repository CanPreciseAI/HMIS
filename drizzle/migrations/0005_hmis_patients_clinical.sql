-- Patients, identity records, encounters and clinical documentation.
--
-- Part of the HMIS backend described by HMIS_Design_Detail_v2.
-- Tenancy follows the global conventions: tenant-owned rows carry
-- tenant_id, or inherit it through the parent chain named in the
-- policy. Rows are deactivated by status, never hard-deleted.

-- Patient number is tenant-wide by design.
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  patient_number text not null,
  name text not null,
  date_of_birth date not null,
  sex text not null check (sex in ('female', 'male', 'other', 'unknown')),
  contact_details text,
  status text not null default 'active' check (status in ('active', 'merged', 'deactivated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, patient_number)
);
create index patients_tenant_id_idx on public.patients (tenant_id);

-- Identifiers are moved on merge, never duplicated.
create table public.patient_identifiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  identifier_type text not null,
  identifier_value text not null,
  issuing_authority text,
  created_at timestamptz not null default now(),
  unique (tenant_id, identifier_type, identifier_value)
);
create index patient_identifiers_tenant_id_idx on public.patient_identifiers (tenant_id);
create index patient_identifiers_patient_id_idx on public.patient_identifiers (patient_id);

create table public.patient_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  contact_type text not null,
  name text not null,
  phone text,
  relationship text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index patient_contacts_tenant_id_idx on public.patient_contacts (tenant_id);
create index patient_contacts_patient_id_idx on public.patient_contacts (patient_id);

create table public.patient_consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  consent_category text not null,
  consent_type text not null,
  purpose text not null,
  status text not null default 'granted' check (status in ('granted', 'withdrawn')),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index patient_consents_tenant_id_idx on public.patient_consents (tenant_id);
create index patient_consents_patient_id_idx on public.patient_consents (patient_id);

create table public.patient_portal_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  relationship text,
  verification_method text,
  verified_at timestamptz,
  status text not null default 'invited' check (status in ('invited', 'verified', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, patient_id)
);
create index patient_portal_access_user_id_idx on public.patient_portal_access (user_id);
create index patient_portal_access_patient_id_idx on public.patient_portal_access (patient_id);

create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  patient_id uuid references public.patients(id) on delete restrict not null,
  encounter_type text not null,
  provider_id uuid references public.employees(id) on delete restrict not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index encounters_tenant_id_idx on public.encounters (tenant_id);
create index encounters_facility_id_idx on public.encounters (facility_id);
create index encounters_patient_id_idx on public.encounters (patient_id);
create index encounters_provider_id_idx on public.encounters (provider_id);

create table public.admissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  patient_id uuid references public.patients(id) on delete restrict not null,
  encounter_id uuid references public.encounters(id) on delete cascade not null,
  admitted_at timestamptz not null default now(),
  discharged_at timestamptz,
  status text not null default 'active' check (status in ('active', 'discharged')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discharged_at is null or discharged_at >= admitted_at)
);
create index admissions_tenant_id_idx on public.admissions (tenant_id);
create index admissions_facility_id_idx on public.admissions (facility_id);
create index admissions_patient_id_idx on public.admissions (patient_id);
create index admissions_encounter_id_idx on public.admissions (encounter_id);

create table public.bed_assignments (
  id uuid primary key default gen_random_uuid(),
  admission_id uuid references public.admissions(id) on delete cascade not null,
  bed_id uuid references public.beds(id) on delete restrict not null,
  start_at timestamptz not null default now(),
  end_at timestamptz,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);
create index bed_assignments_admission_id_idx on public.bed_assignments (admission_id);
create index bed_assignments_bed_id_idx on public.bed_assignments (bed_id);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  facility_id uuid references public.facilities(id) on delete restrict not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  provider_id uuid references public.employees(id) on delete restrict not null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'checked_in', 'completed', 'cancelled', 'no_show')),
  encounter_id uuid references public.encounters(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index appointments_tenant_id_idx on public.appointments (tenant_id);
create index appointments_facility_id_idx on public.appointments (facility_id);
create index appointments_patient_id_idx on public.appointments (patient_id);
create index appointments_provider_id_idx on public.appointments (provider_id);
create index appointments_encounter_id_idx on public.appointments (encounter_id);

create table public.allergies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  substance text not null,
  reaction text not null,
  severity text not null check (severity in ('mild', 'moderate', 'severe', 'life_threatening')),
  status text not null default 'active' check (status in ('active', 'resolved', 'entered_in_error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index allergies_tenant_id_idx on public.allergies (tenant_id);
create index allergies_patient_id_idx on public.allergies (patient_id);

-- Signed notes are immutable; amendments create a new version.
create table public.clinical_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  encounter_id uuid references public.encounters(id) on delete cascade not null,
  author_id uuid references public.employees(id) on delete restrict not null,
  note_type text not null,
  content text not null,
  version int not null default 1 check (version > 0),
  supersedes_id uuid references public.clinical_notes(id) on delete set null,
  amendment_reason text,
  content_hash text,
  signed_by uuid references public.employees(id) on delete set null,
  signed_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'signed', 'amended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (supersedes_id is null or supersedes_id <> id)
);
create index clinical_notes_tenant_id_idx on public.clinical_notes (tenant_id);
create index clinical_notes_encounter_id_idx on public.clinical_notes (encounter_id);
create index clinical_notes_author_id_idx on public.clinical_notes (author_id);
create index clinical_notes_supersedes_id_idx on public.clinical_notes (supersedes_id);
create index clinical_notes_signed_by_idx on public.clinical_notes (signed_by);

create table public.diagnoses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  encounter_id uuid references public.encounters(id) on delete cascade not null,
  code_system text not null default 'ICD-10',
  diagnosis_code text not null,
  description text,
  diagnosis_type text not null check (diagnosis_type in ('primary', 'secondary', 'provisional', 'differential')),
  created_at timestamptz not null default now()
);
create index diagnoses_tenant_id_idx on public.diagnoses (tenant_id);
create index diagnoses_encounter_id_idx on public.diagnoses (encounter_id);

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  encounter_id uuid references public.encounters(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  observation_code text not null,
  value text not null,
  unit text not null,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index observations_tenant_id_idx on public.observations (tenant_id);
create index observations_encounter_id_idx on public.observations (encounter_id);
create index observations_patient_id_idx on public.observations (patient_id);

create table public.clinical_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  patient_id uuid references public.patients(id) on delete cascade not null,
  encounter_id uuid references public.encounters(id) on delete set null,
  document_type text not null,
  document_id uuid references public.document_metadata(id) on delete restrict not null,
  uploaded_by uuid references public.users(id) on delete restrict not null,
  created_at timestamptz not null default now()
);
create index clinical_documents_tenant_id_idx on public.clinical_documents (tenant_id);
create index clinical_documents_patient_id_idx on public.clinical_documents (patient_id);
create index clinical_documents_encounter_id_idx on public.clinical_documents (encounter_id);
create index clinical_documents_document_id_idx on public.clinical_documents (document_id);
create index clinical_documents_uploaded_by_idx on public.clinical_documents (uploaded_by);

-- Detection never blocks registration; merges are always human-approved.
create table public.patient_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  patient_id_a uuid references public.patients(id) on delete cascade not null,
  patient_id_b uuid references public.patients(id) on delete cascade not null,
  signals text not null,
  status text not null default 'pending_review' check (status in ('pending_review', 'not_duplicate', 'merge_pending_approval', 'merged', 'merge_reversed')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  proposed_surviving_patient_id uuid references public.patients(id) on delete set null,
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id_a, patient_id_b),
  check (patient_id_a < patient_id_b)
);
create index patient_duplicate_candidates_patient_id_a_idx on public.patient_duplicate_candidates (patient_id_a);
create index patient_duplicate_candidates_patient_id_b_idx on public.patient_duplicate_candidates (patient_id_b);
create index patient_duplicate_candidates_reviewed_by_idx on public.patient_duplicate_candidates (reviewed_by);
create index patient_duplicate_candidates_proposed_surviving_patient_id_idx on public.patient_duplicate_candidates (proposed_surviving_patient_id);
create index patient_duplicate_candidates_approval_request_id_idx on public.patient_duplicate_candidates (approval_request_id);

-- Every executed merge is bound to its approved approval request.
create table public.patient_merge_log (
  id uuid primary key default gen_random_uuid(),
  surviving_patient_id uuid references public.patients(id) on delete restrict not null,
  merged_patient_id uuid references public.patients(id) on delete restrict not null,
  reason text,
  approval_request_id uuid references public.approval_requests(id) on delete restrict not null,
  merged_by uuid references public.users(id) on delete restrict not null,
  merged_at timestamptz not null default now(),
  reversed_by uuid references public.users(id) on delete set null,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  check (surviving_patient_id <> merged_patient_id),
  check (reversed_at is null or reversed_by is not null)
);
create index patient_merge_log_surviving_patient_id_idx on public.patient_merge_log (surviving_patient_id);
create index patient_merge_log_merged_patient_id_idx on public.patient_merge_log (merged_patient_id);
create index patient_merge_log_approval_request_id_idx on public.patient_merge_log (approval_request_id);
create index patient_merge_log_merged_by_idx on public.patient_merge_log (merged_by);
create index patient_merge_log_reversed_by_idx on public.patient_merge_log (reversed_by);

-- One row per identity-record repoint; reversal replays these rows.
create table public.patient_merge_repoints (
  id uuid primary key default gen_random_uuid(),
  merge_id uuid references public.patient_merge_log(id) on delete cascade not null,
  entity_type text not null,
  entity_id uuid,
  previous_patient_id uuid references public.patients(id) on delete restrict not null,
  repointed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (merge_id, entity_type, entity_id)
);
create index patient_merge_repoints_merge_id_idx on public.patient_merge_repoints (merge_id);
create index patient_merge_repoints_previous_patient_id_idx on public.patient_merge_repoints (previous_patient_id);

-- ---------------------------------------------------------------------------
-- Grants, row level security and indexes
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
  'patients',
  'patient_identifiers',
  'patient_contacts',
  'patient_consents',
  'patient_portal_access',
  'encounters',
  'admissions',
  'bed_assignments',
  'appointments',
  'allergies',
  'clinical_notes',
  'diagnoses',
  'observations',
  'clinical_documents',
  'patient_duplicate_candidates',
  'patient_merge_log',
  'patient_merge_repoints'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

create policy "Tenant members can read patients"
  on public.patients for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage patients"
  on public.patients for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read patient_identifiers"
  on public.patient_identifiers for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage patient_identifiers"
  on public.patient_identifiers for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read patient_contacts"
  on public.patient_contacts for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage patient_contacts"
  on public.patient_contacts for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read patient_consents"
  on public.patient_consents for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage patient_consents"
  on public.patient_consents for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Portal users read their own access"
  on public.patient_portal_access for select to authenticated
  using (user_id = auth.uid());

create policy "Tenant members can read patient_portal_access"
  on public.patient_portal_access for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_tenant_member((select p.tenant_id from public.patients p where p.id = patient_id))
  );

create policy "Tenant admins manage patient_portal_access"
  on public.patient_portal_access for all to authenticated
  using (
    public.is_platform_admin()
    or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = patient_id))
  )
  with check (
    public.is_platform_admin()
    or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = patient_id))
  );

create policy "Tenant members can read encounters"
  on public.encounters for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage encounters"
  on public.encounters for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read admissions"
  on public.admissions for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage admissions"
  on public.admissions for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read bed_assignments"
  on public.bed_assignments for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select a.tenant_id from public.admissions a where a.id = admission_id)));

create policy "Tenant admins manage bed_assignments"
  on public.bed_assignments for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select a.tenant_id from public.admissions a where a.id = admission_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select a.tenant_id from public.admissions a where a.id = admission_id)));

create policy "Tenant members can read appointments"
  on public.appointments for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage appointments"
  on public.appointments for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read allergies"
  on public.allergies for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage allergies"
  on public.allergies for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read clinical_notes"
  on public.clinical_notes for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage clinical_notes"
  on public.clinical_notes for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read diagnoses"
  on public.diagnoses for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage diagnoses"
  on public.diagnoses for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read observations"
  on public.observations for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage observations"
  on public.observations for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read clinical_documents"
  on public.clinical_documents for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member(tenant_id));

create policy "Tenant admins manage clinical_documents"
  on public.clinical_documents for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin(tenant_id))
  with check (public.is_platform_admin() or public.is_tenant_admin(tenant_id));

create policy "Tenant members can read patient_duplicate_candidates"
  on public.patient_duplicate_candidates for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select p.tenant_id from public.patients p where p.id = patient_id_a)));

create policy "Tenant admins manage patient_duplicate_candidates"
  on public.patient_duplicate_candidates for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = patient_id_a)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = patient_id_a)));

create policy "Tenant members can read patient_merge_log"
  on public.patient_merge_log for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select p.tenant_id from public.patients p where p.id = surviving_patient_id)));

create policy "Tenant admins manage patient_merge_log"
  on public.patient_merge_log for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = surviving_patient_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = surviving_patient_id)));

create policy "Tenant members can read patient_merge_repoints"
  on public.patient_merge_repoints for select to authenticated
  using (public.is_platform_admin() or public.is_tenant_member((select p.tenant_id from public.patients p where p.id = previous_patient_id)));

create policy "Tenant admins manage patient_merge_repoints"
  on public.patient_merge_repoints for all to authenticated
  using (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = previous_patient_id)))
  with check (public.is_platform_admin() or public.is_tenant_admin((select p.tenant_id from public.patients p where p.id = previous_patient_id)));

do $$
declare
  t text;
begin
  foreach t in array array[
    'patients',
    'patient_contacts',
    'patient_consents',
    'patient_portal_access',
    'encounters',
    'admissions',
    'bed_assignments',
    'appointments',
    'allergies',
    'clinical_notes',
    'patient_duplicate_candidates'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end;
$$;
