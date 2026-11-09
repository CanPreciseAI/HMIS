-- CanPreciseAI — admin grant + demo operational data
--
-- Run AFTER supabase/apply-hmis-migrations.sql (Supabase → SQL Editor → Run).
-- Safe to run more than once: the demo block is skipped when it is already there.
--
-- What it does
--   1. Makes prajvalakka021@gmail.com an admin (staff_profiles, user_roles,
--      public.users identity row, employees record via upsert_employee_for_user).
--   2. Seeds one tenant with departments, staff, beds, patients, encounters,
--      appointments, notes, lab work, pharmacy, admissions and billing so every
--      dashboard panel has something real to read.

do $$
declare
  v_admin_email text := 'prajvalakka021@gmail.com';
  v_admin uuid;
  v_admin_emp uuid;
  v_role_admin uuid;

  v_tenant uuid;
  v_facility uuid;

  v_dept_admin uuid;
  v_dept_med uuid;
  v_dept_nur uuid;
  v_dept_lab uuid;
  v_dept_phm uuid;
  v_dept_emr uuid;

  v_desig_doc uuid;
  v_desig_nur uuid;
  v_desig_lab uuid;
  v_desig_phm uuid;

  v_doc1 uuid;
  v_doc2 uuid;
  v_nurse uuid;
  v_lab uuid;
  v_pharm uuid;

  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_p6 uuid;

  v_enc1 uuid; v_enc2 uuid; v_enc3 uuid; v_enc4 uuid; v_enc5 uuid;

  v_test_cbc uuid; v_test_hba1c uuid; v_test_trop uuid; v_test_creat uuid;

  v_order1 uuid; v_order2 uuid;
  v_item1 uuid; v_item2 uuid; v_item3 uuid;

  v_med_metf uuid; v_med_amlo uuid; v_med_parac uuid;

  v_rx uuid;
  v_rx_item1 uuid;

  v_charge_cons uuid; v_charge_bed uuid; v_charge_cbc uuid;

  v_inv1 uuid; v_inv2 uuid;

  v_adm1 uuid; v_adm2 uuid;
  v_bed_gn1 uuid; v_bed_gn2 uuid;
begin
  ---------------------------------------------------------------------------
  -- Tenant + facility (created by migration 0003; recreated harmlessly here)
  ---------------------------------------------------------------------------
  select id into v_tenant from public.tenants where slug = 'canprecise';
  if v_tenant is null then
    insert into public.tenants (name, slug, status)
    values ('CanPreciseAI', 'canprecise', 'active')
    returning id into v_tenant;
  end if;

  select id into v_facility
    from public.facilities
    where tenant_id = v_tenant and facility_code = 'MAIN';
  if v_facility is null then
    insert into public.facilities (tenant_id, name, facility_code, address)
    values (v_tenant, 'Main Hospital', 'MAIN', 'CanPreciseAI Care Network')
    returning id into v_facility;
  end if;

  ---------------------------------------------------------------------------
  -- 1. Admin access for the given email
  ---------------------------------------------------------------------------
  select id into v_admin from auth.users where lower(email) = lower(v_admin_email);

  if v_admin is null then
    raise notice 'No auth user for %, skipping admin grant', v_admin_email;
  else
    -- Identity row the employee record points at.
    insert into public.users (id, email, auth_subject)
    values (v_admin, v_admin_email, v_admin::text)
    on conflict (id) do nothing;

    insert into public.staff_profiles (id, full_name)
    values (v_admin, 'Prajval Akka')
    on conflict (id) do update set full_name = excluded.full_name;

    insert into public.user_roles (user_id, role)
    values (v_admin, 'admin')
    on conflict (user_id, role) do nothing;

    -- Tenant-scoped role assignment, used by the tenant admin checks.
    v_role_admin := public.ensure_tenant_role(v_tenant, 'admin');

    insert into public.user_role_assignments (user_id, tenant_id, role_id)
    select v_admin, v_tenant, v_role_admin
    where v_role_admin is not null
      and not exists (
        select 1 from public.user_role_assignments a
        where a.user_id = v_admin and a.tenant_id = v_tenant
      );

    -- An admin does not need to approve themselves.
    delete from public.staff_approval_requests
    where user_id = v_admin and status = 'pending';

    v_admin_emp := public.upsert_employee_for_user(v_admin, 'Administration', 'admin');
    raise notice 'Admin ready for % (employee %)', v_admin_email, v_admin_emp;
  end if;

  ---------------------------------------------------------------------------
  -- Demo data guard
  ---------------------------------------------------------------------------
  if exists (
    select 1 from public.patients
    where tenant_id = v_tenant and patient_number = 'MRN-1001'
  ) then
    raise notice 'Demo data already present — nothing else to seed';
    return;
  end if;

  ---------------------------------------------------------------------------
  -- 2. Departments
  ---------------------------------------------------------------------------
  select id into v_dept_admin from public.departments
    where facility_id = v_facility and department_code = 'ADM';
  if v_dept_admin is null then
    insert into public.departments (tenant_id, facility_id, name, department_code)
    values (v_tenant, v_facility, 'Administration', 'ADM') returning id into v_dept_admin;
  end if;

  insert into public.departments (tenant_id, facility_id, name, department_code)
  values (v_tenant, v_facility, 'Internal Medicine', 'IM')
  on conflict (facility_id, department_code) do nothing;
  select id into v_dept_med from public.departments
    where facility_id = v_facility and department_code = 'IM';

  insert into public.departments (tenant_id, facility_id, name, department_code)
  values (v_tenant, v_facility, 'Nursing', 'NUR')
  on conflict (facility_id, department_code) do nothing;
  select id into v_dept_nur from public.departments
    where facility_id = v_facility and department_code = 'NUR';

  insert into public.departments (tenant_id, facility_id, name, department_code)
  values (v_tenant, v_facility, 'Laboratory', 'LAB')
  on conflict (facility_id, department_code) do nothing;
  select id into v_dept_lab from public.departments
    where facility_id = v_facility and department_code = 'LAB';

  insert into public.departments (tenant_id, facility_id, name, department_code)
  values (v_tenant, v_facility, 'Pharmacy', 'PHM')
  on conflict (facility_id, department_code) do nothing;
  select id into v_dept_phm from public.departments
    where facility_id = v_facility and department_code = 'PHM';

  insert into public.departments (tenant_id, facility_id, name, department_code)
  values (v_tenant, v_facility, 'Emergency', 'EMR')
  on conflict (facility_id, department_code) do nothing;
  select id into v_dept_emr from public.departments
    where facility_id = v_facility and department_code = 'EMR';

  ---------------------------------------------------------------------------
  -- 3. Staff (designations are seeded by migration 0002)
  ---------------------------------------------------------------------------
  select id into v_desig_doc from public.designations where code = 'doctor';
  select id into v_desig_nur from public.designations where code = 'nurse';
  select id into v_desig_lab from public.designations where code = 'lab_technician';
  select id into v_desig_phm from public.designations where code = 'pharmacist';

  insert into public.employees (tenant_id, employee_code, department_id, designation_id)
  values (v_tenant, 'DEMO-0001', v_dept_med, v_desig_doc)
  on conflict (tenant_id, employee_code) do nothing;
  select id into v_doc1 from public.employees
    where tenant_id = v_tenant and employee_code = 'DEMO-0001';

  insert into public.employees (tenant_id, employee_code, department_id, designation_id)
  values (v_tenant, 'DEMO-0002', v_dept_emr, v_desig_doc)
  on conflict (tenant_id, employee_code) do nothing;
  select id into v_doc2 from public.employees
    where tenant_id = v_tenant and employee_code = 'DEMO-0002';

  insert into public.employees (tenant_id, employee_code, department_id, designation_id)
  values (v_tenant, 'DEMO-0003', v_dept_nur, v_desig_nur)
  on conflict (tenant_id, employee_code) do nothing;
  select id into v_nurse from public.employees
    where tenant_id = v_tenant and employee_code = 'DEMO-0003';

  insert into public.employees (tenant_id, employee_code, department_id, designation_id)
  values (v_tenant, 'DEMO-0004', v_dept_lab, v_desig_lab)
  on conflict (tenant_id, employee_code) do nothing;
  select id into v_lab from public.employees
    where tenant_id = v_tenant and employee_code = 'DEMO-0004';

  insert into public.employees (tenant_id, employee_code, department_id, designation_id)
  values (v_tenant, 'DEMO-0005', v_dept_phm, v_desig_phm)
  on conflict (tenant_id, employee_code) do nothing;
  select id into v_pharm from public.employees
    where tenant_id = v_tenant and employee_code = 'DEMO-0005';

  ---------------------------------------------------------------------------
  -- 4. Beds
  ---------------------------------------------------------------------------
  insert into public.beds (tenant_id, facility_id, bed_code, ward, bed_type)
  values
    (v_tenant, v_facility, 'GN-01', 'General', 'general'),
    (v_tenant, v_facility, 'GN-02', 'General', 'general'),
    (v_tenant, v_facility, 'GN-03', 'General', 'general'),
    (v_tenant, v_facility, 'GN-04', 'General', 'general'),
    (v_tenant, v_facility, 'ICU-01', 'ICU', 'icu'),
    (v_tenant, v_facility, 'ICU-02', 'ICU', 'icu'),
    (v_tenant, v_facility, 'ICU-03', 'ICU', 'icu'),
    (v_tenant, v_facility, 'MAT-01', 'Maternity', 'general'),
    (v_tenant, v_facility, 'MAT-02', 'Maternity', 'general'),
    (v_tenant, v_facility, 'MAT-03', 'Maternity', 'general')
  on conflict (facility_id, bed_code) do nothing;

  select id into v_bed_gn1 from public.beds where facility_id = v_facility and bed_code = 'GN-01';
  select id into v_bed_gn2 from public.beds where facility_id = v_facility and bed_code = 'GN-02';

  ---------------------------------------------------------------------------
  -- 5. Patients
  ---------------------------------------------------------------------------
  insert into public.patients (tenant_id, patient_number, name, date_of_birth, sex, contact_details)
  values (v_tenant, 'MRN-1001', 'Meera Iyer', '1968-04-12', 'female', '+91 98765 40001')
  returning id into v_p1;
  insert into public.patients (tenant_id, patient_number, name, date_of_birth, sex, contact_details)
  values (v_tenant, 'MRN-1002', 'Rahul Deshpande', '1982-09-03', 'male', '+91 98765 40002')
  returning id into v_p2;
  insert into public.patients (tenant_id, patient_number, name, date_of_birth, sex, contact_details)
  values (v_tenant, 'MRN-1003', 'Sana Qureshi', '1995-01-27', 'female', '+91 98765 40003')
  returning id into v_p3;
  insert into public.patients (tenant_id, patient_number, name, date_of_birth, sex, contact_details)
  values (v_tenant, 'MRN-1004', 'Vikram Shetty', '1957-11-19', 'male', '+91 98765 40004')
  returning id into v_p4;
  insert into public.patients (tenant_id, patient_number, name, date_of_birth, sex, contact_details)
  values (v_tenant, 'MRN-1005', 'Anita Bose', '1990-06-08', 'female', '+91 98765 40005')
  returning id into v_p5;
  insert into public.patients (tenant_id, patient_number, name, date_of_birth, sex, contact_details)
  values (v_tenant, 'MRN-1006', 'Imran Khan', '1975-02-14', 'male', '+91 98765 40006')
  returning id into v_p6;

  ---------------------------------------------------------------------------
  -- 6. Encounters
  ---------------------------------------------------------------------------
  insert into public.encounters (tenant_id, facility_id, patient_id, encounter_type, provider_id, started_at, status)
  values (v_tenant, v_facility, v_p1, 'opd', v_doc1, now() - interval '3 hours', 'open')
  returning id into v_enc1;
  insert into public.encounters (tenant_id, facility_id, patient_id, encounter_type, provider_id, started_at, status)
  values (v_tenant, v_facility, v_p2, 'opd', v_doc1, now() - interval '90 minutes', 'open')
  returning id into v_enc2;
  insert into public.encounters (tenant_id, facility_id, patient_id, encounter_type, provider_id, started_at, status)
  values (v_tenant, v_facility, v_p3, 'emergency', v_doc2, now() - interval '5 hours', 'open')
  returning id into v_enc3;
  insert into public.encounters (tenant_id, facility_id, patient_id, encounter_type, provider_id, started_at, status)
  values (v_tenant, v_facility, v_p4, 'ipd', v_doc1, now() - interval '2 days', 'open')
  returning id into v_enc4;
  insert into public.encounters (tenant_id, facility_id, patient_id, encounter_type, provider_id, started_at, ended_at, status)
  values (v_tenant, v_facility, v_p5, 'ipd', v_doc2, now() - interval '6 days', now() - interval '2 days', 'closed')
  returning id into v_enc5;

  ---------------------------------------------------------------------------
  -- 7. Appointments (today and tomorrow)
  ---------------------------------------------------------------------------
  insert into public.appointments (tenant_id, facility_id, patient_id, provider_id, scheduled_at, status)
  values
    (v_tenant, v_facility, v_p1, v_doc1, now() + interval '45 minutes', 'checked_in'),
    (v_tenant, v_facility, v_p2, v_doc1, now() + interval '2 hours', 'scheduled'),
    (v_tenant, v_facility, v_p6, v_doc1, now() + interval '3 hours', 'scheduled'),
    (v_tenant, v_facility, v_p3, v_doc2, now() + interval '1 hour', 'checked_in'),
    (v_tenant, v_facility, v_p5, v_doc1, now() + interval '1 day', 'scheduled');

  ---------------------------------------------------------------------------
  -- 8. Clinical notes
  ---------------------------------------------------------------------------
  insert into public.clinical_notes (tenant_id, encounter_id, author_id, note_type, content, status)
  values
    (v_tenant, v_enc1, v_doc1, 'progress',
     'Blood sugar poorly controlled over the last two weeks. Escalating metformin, repeat HbA1c in six weeks.',
     'draft'),
    (v_tenant, v_enc2, v_doc1, 'progress',
     'Chest tightness on exertion, ECG normal. Ordered troponin and creatinine before discharge.',
     'draft'),
    (v_tenant, v_enc4, v_doc1, 'discharge_summary',
     'Admitted with dehydration secondary to gastroenteritis. Tolerating oral intake, vitals stable.',
     'signed');

  ---------------------------------------------------------------------------
  -- 9. Laboratory
  ---------------------------------------------------------------------------
  insert into public.lab_test_catalog (tenant_id, test_code, name, specimen_type, department_id)
  values (v_tenant, 'CBC', 'Complete blood count', 'blood', v_dept_lab)
  on conflict (tenant_id, test_code) do nothing;
  select id into v_test_cbc from public.lab_test_catalog
    where tenant_id = v_tenant and test_code = 'CBC';

  insert into public.lab_test_catalog (tenant_id, test_code, name, specimen_type, department_id)
  values (v_tenant, 'HBA1C', 'HbA1c', 'blood', v_dept_lab)
  on conflict (tenant_id, test_code) do nothing;
  select id into v_test_hba1c from public.lab_test_catalog
    where tenant_id = v_tenant and test_code = 'HBA1C';

  insert into public.lab_test_catalog (tenant_id, test_code, name, specimen_type, department_id)
  values (v_tenant, 'TROP', 'Troponin I', 'blood', v_dept_lab)
  on conflict (tenant_id, test_code) do nothing;
  select id into v_test_trop from public.lab_test_catalog
    where tenant_id = v_tenant and test_code = 'TROP';

  insert into public.lab_test_catalog (tenant_id, test_code, name, specimen_type, department_id)
  values (v_tenant, 'CREAT', 'Serum creatinine', 'blood', v_dept_lab)
  on conflict (tenant_id, test_code) do nothing;
  select id into v_test_creat from public.lab_test_catalog
    where tenant_id = v_tenant and test_code = 'CREAT';

  insert into public.lab_orders (tenant_id, encounter_id, patient_id, ordered_by, status)
  values (v_tenant, v_enc1, v_p1, v_doc1, 'in_progress')
  returning id into v_order1;
  insert into public.lab_orders (tenant_id, encounter_id, patient_id, ordered_by, status)
  values (v_tenant, v_enc2, v_p2, v_doc1, 'in_progress')
  returning id into v_order2;

  insert into public.lab_order_items (lab_order_id, test_id, accession_number, priority, status, created_at)
  values (v_order1, v_test_hba1c, 'ACC-2026-0001', 'routine', 'collected', now() - interval '2 hours')
  returning id into v_item1;
  insert into public.lab_order_items (lab_order_id, test_id, accession_number, priority, status, created_at)
  values (v_order2, v_test_trop, 'ACC-2026-0002', 'stat', 'resulted', now() - interval '80 minutes')
  returning id into v_item2;
  insert into public.lab_order_items (lab_order_id, test_id, accession_number, priority, status, created_at)
  values (v_order1, v_test_cbc, 'ACC-2026-0003', 'routine', 'ordered', now() - interval '30 minutes')
  returning id into v_item3;
  insert into public.lab_order_items (lab_order_id, test_id, accession_number, priority, status, created_at)
  values (v_order2, v_test_creat, 'ACC-2026-0004', 'routine', 'ordered', now() - interval '20 minutes');

  insert into public.specimens (lab_order_item_id, specimen_code, collected_at, received_at, status)
  values (v_item2, 'SPC-2026-0002', now() - interval '75 minutes', now() - interval '70 minutes', 'accepted');

  insert into public.lab_results
    (tenant_id, lab_order_item_id, specimen_id, result_value, unit, reference_range, status, verified_by, verified_at)
  select v_tenant, v_item2, s.id, '2.4', 'ng/mL', '0.0 - 0.04', 'preliminary', v_lab, now() - interval '40 minutes'
  from public.specimens s
  where s.lab_order_item_id = v_item2;

  update public.lab_results
    set critical_flag = true
    where lab_order_item_id = v_item2;

  ---------------------------------------------------------------------------
  -- 10. Pharmacy
  ---------------------------------------------------------------------------
  insert into public.medicine_catalog (tenant_id, medicine_code, name, strength, dosage_form)
  values (v_tenant, 'MED-METF', 'Metformin', '500 mg', 'tablet')
  on conflict (tenant_id, medicine_code) do nothing;
  select id into v_med_metf from public.medicine_catalog
    where tenant_id = v_tenant and medicine_code = 'MED-METF';

  insert into public.medicine_catalog (tenant_id, medicine_code, name, strength, dosage_form)
  values (v_tenant, 'MED-AMLO', 'Amlodipine', '5 mg', 'tablet')
  on conflict (tenant_id, medicine_code) do nothing;
  select id into v_med_amlo from public.medicine_catalog
    where tenant_id = v_tenant and medicine_code = 'MED-AMLO';

  insert into public.medicine_catalog (tenant_id, medicine_code, name, strength, dosage_form)
  values (v_tenant, 'MED-PARA', 'Paracetamol', '650 mg', 'tablet')
  on conflict (tenant_id, medicine_code) do nothing;
  select id into v_med_parac from public.medicine_catalog
    where tenant_id = v_tenant and medicine_code = 'MED-PARA';

  insert into public.prescriptions (encounter_id, prescriber_id, status)
  values (v_enc1, v_doc1, 'active')
  returning id into v_rx;

  insert into public.prescription_items
    (tenant_id, prescription_id, medicine_id, dose, route, frequency, duration,
     quantity_prescribed, quantity_dispensed)
  values (v_tenant, v_rx, v_med_metf, '1 tablet', 'oral', 'twice daily', '30 days', 60, 30)
  returning id into v_rx_item1;

  insert into public.prescription_items
    (tenant_id, prescription_id, medicine_id, dose, route, frequency, duration,
     quantity_prescribed, quantity_dispensed)
  values (v_tenant, v_rx, v_med_amlo, '1 tablet', 'oral', 'once daily', '30 days', 30, 30);

  insert into public.prescription_dispenses
    (prescription_item_id, pharmacist_id, quantity, dispensed_at)
  values (v_rx_item1, v_pharm, 30, now() - interval '1 hour');

  ---------------------------------------------------------------------------
  -- 11. Admissions and beds
  ---------------------------------------------------------------------------
  insert into public.admissions (tenant_id, facility_id, patient_id, encounter_id, admitted_at, status)
  values (v_tenant, v_facility, v_p4, v_enc4, now() - interval '2 days', 'active')
  returning id into v_adm1;

  insert into public.admissions (tenant_id, facility_id, patient_id, encounter_id, admitted_at, discharged_at, status)
  values (v_tenant, v_facility, v_p5, v_enc5, now() - interval '6 days', now() - interval '2 days', 'discharged')
  returning id into v_adm2;

  insert into public.bed_assignments (admission_id, bed_id, start_at, status)
  values (v_adm1, v_bed_gn1, now() - interval '2 days', 'active');

  insert into public.bed_assignments (admission_id, bed_id, start_at, end_at, status)
  values (v_adm2, v_bed_gn2, now() - interval '6 days', now() - interval '2 days', 'ended');

  ---------------------------------------------------------------------------
  -- 12. Billing
  ---------------------------------------------------------------------------
  insert into public.charge_catalog (tenant_id, charge_code, name, category, base_rate)
  values (v_tenant, 'CONS-01', 'OPD consultation', 'consultation', 500)
  on conflict (tenant_id, charge_code) do nothing;
  select id into v_charge_cons from public.charge_catalog
    where tenant_id = v_tenant and charge_code = 'CONS-01';

  insert into public.charge_catalog (tenant_id, charge_code, name, category, base_rate)
  values (v_tenant, 'BED-GEN', 'General ward bed (per day)', 'bed', 1500)
  on conflict (tenant_id, charge_code) do nothing;
  select id into v_charge_bed from public.charge_catalog
    where tenant_id = v_tenant and charge_code = 'BED-GEN';

  insert into public.charge_catalog (tenant_id, charge_code, name, category, base_rate)
  values (v_tenant, 'LAB-CBC', 'Complete blood count', 'laboratory', 350)
  on conflict (tenant_id, charge_code) do nothing;
  select id into v_charge_cbc from public.charge_catalog
    where tenant_id = v_tenant and charge_code = 'LAB-CBC';

  insert into public.invoices
    (tenant_id, facility_id, patient_id, encounter_id, invoice_number,
     gross_amount, discount_amount, tax_amount, net_amount, status, issued_at)
  values (v_tenant, v_facility, v_p1, v_enc1, 'INV-1001', 850, 0, 0, 850, 'issued', now() - interval '40 minutes')
  returning id into v_inv1;

  insert into public.invoices
    (tenant_id, facility_id, patient_id, encounter_id, invoice_number,
     gross_amount, discount_amount, tax_amount, net_amount, status, issued_at)
  values (v_tenant, v_facility, v_p2, v_enc2, 'INV-1002', 500, 0, 0, 500, 'paid', now() - interval '30 minutes')
  returning id into v_inv2;

  insert into public.invoice_items
    (tenant_id, invoice_id, charge_id, source_type, description, quantity, unit_price, line_total)
  values
    (v_tenant, v_inv1, v_charge_cons, 'service', 'OPD consultation', 1, 500, 500),
    (v_tenant, v_inv1, v_charge_cbc, 'service', 'Complete blood count', 1, 350, 350),
    (v_tenant, v_inv2, v_charge_cons, 'service', 'OPD consultation', 1, 500, 500);

  insert into public.payments
    (tenant_id, payment_reference, patient_id, method, amount, status, received_at)
  values
    (v_tenant, 'PAY-1001', v_p2, 'upi', 500, 'allocated', now() - interval '25 minutes'),
    (v_tenant, 'PAY-1002', v_p1, 'card', 350, 'captured', now() - interval '20 minutes');

  raise notice 'Demo data seeded for tenant %', v_tenant;
end $$;

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
select 'staff' as table_name, count(*) as rows from public.employees
union all select 'patients', count(*) from public.patients
union all select 'encounters', count(*) from public.encounters
union all select 'appointments', count(*) from public.appointments
union all select 'beds', count(*) from public.beds
union all select 'lab_results', count(*) from public.lab_results
union all select 'invoices', count(*) from public.invoices
union all select 'payments', count(*) from public.payments
union all select 'admins', count(*) from public.user_roles where role = 'admin';
