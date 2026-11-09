-- Allow a verified patient portal account to read only its linked records.
-- Portal access is granted explicitly by staff; registration alone never links charts.

create policy "Portal users read linked patients"
  on public.patients for select to authenticated
  using (
    exists (
      select 1
      from public.patient_portal_access access
      where access.patient_id = patients.id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read linked appointments"
  on public.appointments for select to authenticated
  using (
    exists (
      select 1
      from public.patient_portal_access access
      where access.patient_id = appointments.patient_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read linked encounters"
  on public.encounters for select to authenticated
  using (
    exists (
      select 1
      from public.patient_portal_access access
      where access.patient_id = encounters.patient_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read linked admissions"
  on public.admissions for select to authenticated
  using (
    exists (
      select 1
      from public.patient_portal_access access
      where access.patient_id = admissions.patient_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read linked allergies"
  on public.allergies for select to authenticated
  using (
    exists (
      select 1
      from public.patient_portal_access access
      where access.patient_id = allergies.patient_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read linked observations"
  on public.observations for select to authenticated
  using (
    exists (
      select 1
      from public.patient_portal_access access
      where access.patient_id = observations.patient_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read linked diagnoses"
  on public.diagnoses for select to authenticated
  using (
    exists (
      select 1
      from public.encounters encounter
      join public.patient_portal_access access
        on access.patient_id = encounter.patient_id
      where encounter.id = diagnoses.encounter_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read linked lab orders"
  on public.lab_orders for select to authenticated
  using (
    exists (
      select 1
      from public.patient_portal_access access
      where access.patient_id = lab_orders.patient_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read linked lab order items"
  on public.lab_order_items for select to authenticated
  using (
    exists (
      select 1
      from public.lab_orders orders
      join public.patient_portal_access access
        on access.patient_id = orders.patient_id
      where orders.id = lab_order_items.lab_order_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read released lab results"
  on public.lab_results for select to authenticated
  using (
    status in ('verified', 'amended')
    and exists (
      select 1
      from public.lab_order_items item
      join public.lab_orders orders on orders.id = item.lab_order_id
      join public.patient_portal_access access
        on access.patient_id = orders.patient_id
      where item.id = lab_results.lab_order_item_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read linked lab test names"
  on public.lab_test_catalog for select to authenticated
  using (
    exists (
      select 1
      from public.lab_order_items item
      join public.lab_orders orders on orders.id = item.lab_order_id
      join public.patient_portal_access access
        on access.patient_id = orders.patient_id
      where item.test_id = lab_test_catalog.id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read linked radiology orders"
  on public.radiology_orders for select to authenticated
  using (
    exists (
      select 1
      from public.patient_portal_access access
      where access.patient_id = radiology_orders.patient_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read approved radiology reports"
  on public.radiology_reports for select to authenticated
  using (
    status in ('approved', 'amended')
    and exists (
      select 1
      from public.radiology_orders orders
      join public.patient_portal_access access
        on access.patient_id = orders.patient_id
      where orders.id = radiology_reports.radiology_order_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read linked prescriptions"
  on public.prescriptions for select to authenticated
  using (
    exists (
      select 1
      from public.encounters encounter
      join public.patient_portal_access access
        on access.patient_id = encounter.patient_id
      where encounter.id = prescriptions.encounter_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read linked prescription items"
  on public.prescription_items for select to authenticated
  using (
    exists (
      select 1
      from public.prescriptions prescription
      join public.encounters encounter
        on encounter.id = prescription.encounter_id
      join public.patient_portal_access access
        on access.patient_id = encounter.patient_id
      where prescription.id = prescription_items.prescription_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read prescribed medicine names"
  on public.medicine_catalog for select to authenticated
  using (
    exists (
      select 1
      from public.prescription_items item
      join public.prescriptions prescription
        on prescription.id = item.prescription_id
      join public.encounters encounter
        on encounter.id = prescription.encounter_id
      join public.patient_portal_access access
        on access.patient_id = encounter.patient_id
      where item.medicine_id = medicine_catalog.id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read linked invoices"
  on public.invoices for select to authenticated
  using (
    status in ('issued', 'partially_paid', 'paid')
    and exists (
      select 1
      from public.patient_portal_access access
      where access.patient_id = invoices.patient_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );

create policy "Portal users read linked payments"
  on public.payments for select to authenticated
  using (
    exists (
      select 1
      from public.patient_portal_access access
      where access.patient_id = payments.patient_id
        and access.user_id = auth.uid()
        and access.status in ('verified', 'active')
    )
  );
