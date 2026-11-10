import { supabase } from "@/integrations/supabase/client";

/**
 * Data access for role workspaces. Every query runs as the signed-in
 * user, so row level security scopes results to their tenant/facility.
 */

export type StaffRole =
  | "admin"
  | "hospital_admin"
  | "insurance"
  | "doctor"
  | "nurse"
  | "lab_technician"
  | "pharmacist"
  | "receptionist";

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Administrator",
  hospital_admin: "Hospital administrator",
  insurance: "Insurance company",
  doctor: "Doctor",
  nurse: "Nurse",
  lab_technician: "Lab technician",
  pharmacist: "Pharmacist",
  receptionist: "Receptionist",
};

export type StaffContext = {
  userId: string;
  email: string | null;
  role: StaffRole;
  fullName: string;
  phone: string | null;
  licenseNumber: string | null;
  specialization: string | null;
  tenantName: string | null;
  tenantId: string | null;
  facilityName: string | null;
  facilityId: string | null;
  departmentName: string | null;
  designationName: string | null;
  employeeCode: string | null;
  employeeId: string | null;
  availability: string | null;
};

export type MedicineCatalogEntry = {
  id: string;
  tenant_id: string;
  medicine_code: string;
  name: string;
  strength: string;
  dosage_form: string;
  status: string;
};

export type MedicineCatalogStock = {
  medicine_id: string;
  is_mapped: boolean;
  available_quantity: number;
};

export type MedicineInventoryItem = {
  id: string;
  item_code: string;
  name: string;
  unit_of_measure: string;
  status: string;
};

export type MedicineInventoryMapping = {
  id: string;
  medicine_id: string;
  item_id: string;
  conversion_factor: number;
  status: string;
};

export type MedicineStockLine = {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  conversionFactor: number;
  onHand: number;
  reserved: number;
  available: number;
  nearestExpiry: string | null;
};

export type MedicineStockDetail = {
  medicineId: string;
  isMapped: boolean;
  onHand: number;
  reserved: number;
  pendingPrescriptions: number;
  available: number;
  projectedAvailable: number;
  lines: MedicineStockLine[];
};

/**
 * Builds catalog stock from the inventory tables: medicine -> inventory item
 * links, on-hand and reserved balances in active locations, unexpired batches,
 * and quantities still owed on active prescriptions. Available stock is
 * on-hand minus reserved; the projected figure also subtracts prescriptions
 * that have not been dispensed yet.
 */
export async function loadMedicineStockDetails(
  tenantId: string,
  medicineIds: string[],
  items: MedicineInventoryItem[],
  mappings: MedicineInventoryMapping[],
): Promise<MedicineStockDetail[]> {
  if (!tenantId) {
    throw new Error("Your workspace is missing its hospital ID.");
  }
  if (!medicineIds.length) return [];

  const itemById = new Map(items.map((item) => [item.id, item]));
  const activeMappings = mappings.filter(
    (mapping) =>
      mapping.status === "active" &&
      itemById.get(mapping.item_id)?.status === "active",
  );
  const itemIds = [
    ...new Set(activeMappings.map((mapping) => mapping.item_id)),
  ];

  const [balanceRes, locationRes] = await Promise.all([
    itemIds.length
      ? supabase
          .from("inventory_balances")
          .select(
            "item_id, location_id, batch_id, quantity_on_hand, quantity_reserved",
          )
          .in("item_id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("inventory_locations")
      .select("id, facility_id, status")
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
  ]);
  throwQueryErrors("medicine stock balances", balanceRes, locationRes);

  const balances = balanceRes.data ?? [];
  const locations = new Map(
    (locationRes.data ?? []).map((location) => [location.id, location]),
  );
  const batchIds = [...new Set(balances.map((balance) => balance.batch_id))];
  const batchRes = batchIds.length
    ? await supabase
        .from("stock_batches")
        .select("id, item_id, facility_id, expiry_date")
        .eq("tenant_id", tenantId)
        .in("id", batchIds)
    : { data: [], error: null };
  throwQueryErrors("medicine stock batches", batchRes);
  const batches = new Map(
    (batchRes.data ?? []).map((batch) => [batch.id, batch]),
  );

  const today = new Date().toISOString().slice(0, 10);
  const totalsByItem = new Map<
    string,
    {
      onHand: number;
      reserved: number;
      available: number;
      nearestExpiry: string | null;
    }
  >();
  for (const balance of balances) {
    const location = locations.get(balance.location_id);
    const batch = batches.get(balance.batch_id);
    if (!location || !batch) continue;
    if (batch.item_id !== balance.item_id) continue;
    if (batch.facility_id !== location.facility_id) continue;
    if (batch.expiry_date < today) continue;

    const onHand = Number(balance.quantity_on_hand);
    const reserved = Number(balance.quantity_reserved);
    const totals = totalsByItem.get(balance.item_id) ?? {
      onHand: 0,
      reserved: 0,
      available: 0,
      nearestExpiry: null,
    };
    totals.onHand += onHand;
    totals.reserved += reserved;
    totals.available += Math.max(onHand - reserved, 0);
    if (!totals.nearestExpiry || batch.expiry_date < totals.nearestExpiry) {
      totals.nearestExpiry = batch.expiry_date;
    }
    totalsByItem.set(balance.item_id, totals);
  }

  const byMedicine = new Map<string, MedicineStockDetail>();
  for (const mapping of activeMappings) {
    const item = itemById.get(mapping.item_id);
    if (!item) continue;
    const totals = totalsByItem.get(mapping.item_id) ?? {
      onHand: 0,
      reserved: 0,
      available: 0,
      nearestExpiry: null,
    };
    const factor = Number(mapping.conversion_factor);
    const detail = byMedicine.get(mapping.medicine_id) ?? {
      medicineId: mapping.medicine_id,
      isMapped: true,
      onHand: 0,
      reserved: 0,
      pendingPrescriptions: 0,
      available: 0,
      projectedAvailable: 0,
      lines: [],
    };
    detail.onHand += totals.onHand * factor;
    detail.reserved += totals.reserved * factor;
    detail.available += totals.available * factor;
    detail.lines.push({
      itemId: item.id,
      itemCode: item.item_code,
      itemName: item.name,
      unit: item.unit_of_measure,
      conversionFactor: factor,
      onHand: totals.onHand * factor,
      reserved: totals.reserved * factor,
      available: totals.available * factor,
      nearestExpiry: totals.nearestExpiry,
    });
    byMedicine.set(mapping.medicine_id, detail);
  }

  const prescriptionItemsRes = await supabase
    .from("prescription_items")
    .select(
      "id, prescription_id, medicine_id, quantity_prescribed, quantity_dispensed",
    )
    .eq("tenant_id", tenantId)
    .in("medicine_id", medicineIds);
  throwQueryErrors("pending prescriptions", prescriptionItemsRes);

  const prescriptionIds = [
    ...new Set(
      (prescriptionItemsRes.data ?? []).map((item) => item.prescription_id),
    ),
  ];
  const prescriptionRes = prescriptionIds.length
    ? await supabase
        .from("prescriptions")
        .select("id, status")
        .in("id", prescriptionIds)
    : { data: [], error: null };
  throwQueryErrors("prescription status", prescriptionRes);
  const activePrescriptionIds = new Set(
    (prescriptionRes.data ?? [])
      .filter((prescription) => prescription.status === "active")
      .map((prescription) => prescription.id),
  );

  const pendingByMedicine = new Map<string, number>();
  for (const item of prescriptionItemsRes.data ?? []) {
    if (!activePrescriptionIds.has(item.prescription_id)) continue;
    const remaining =
      Number(item.quantity_prescribed) - Number(item.quantity_dispensed);
    if (remaining <= 0) continue;
    pendingByMedicine.set(
      item.medicine_id,
      (pendingByMedicine.get(item.medicine_id) ?? 0) + remaining,
    );
  }

  return medicineIds.map((medicineId) => {
    const detail = byMedicine.get(medicineId);
    const pending = pendingByMedicine.get(medicineId) ?? 0;
    const available = detail?.available ?? 0;
    return {
      medicineId,
      isMapped: Boolean(detail),
      onHand: detail?.onHand ?? 0,
      reserved: detail?.reserved ?? 0,
      pendingPrescriptions: pending,
      available,
      projectedAvailable: Math.max(available - pending, 0),
      lines: detail?.lines ?? [],
    };
  });
}

type Employment = {
  tenant_name: string | null;
  facility_name: string | null;
  department_name: string | null;
  designation_name: string | null;
  employee_code: string | null;
  role_names: string[] | null;
};

export async function loadStaffContext(): Promise<StaffContext | null> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    throw new Error(`Could not verify your session: ${userError.message}`);
  }
  if (!user) return null;

  const [profileRes, rolesRes, employmentRes, employeeRes] = await Promise.all([
    supabase
      .from("staff_profiles")
      .select("full_name, phone, license_number, specialization")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .order("role", { ascending: true })
      .limit(1),
    supabase.rpc("my_employment"),
    supabase
      .from("employees")
      .select("id, department_id, tenant_id, availability")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  throwQueryErrors(
    "your staff workspace",
    profileRes,
    rolesRes,
    employmentRes,
    employeeRes,
  );
  const employment =
    (employmentRes.data?.[0] as Employment | undefined) ?? null;
  const role =
    rolesRes.data?.[0]?.role ??
    (employment?.role_names?.includes("hospital_admin")
      ? "hospital_admin"
      : undefined);
  if (!role) {
    throw new Error(
      "No staff role is assigned to this account. Contact an administrator.",
    );
  }

  const employee = employeeRes.data;

  let facilityId: string | null = null;
  if (employee?.department_id) {
    const { data: dept, error } = await supabase
      .from("departments")
      .select("facility_id")
      .eq("id", employee.department_id)
      .maybeSingle();
    if (error) {
      throw new Error(`Could not load your facility: ${error.message}`);
    }
    facilityId = dept?.facility_id ?? null;
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    role,
    fullName:
      profileRes.data?.full_name ?? user.email?.split("@")[0] ?? "Staff",
    phone: profileRes.data?.phone ?? null,
    licenseNumber: profileRes.data?.license_number ?? null,
    specialization: profileRes.data?.specialization ?? null,
    tenantName: employment?.tenant_name ?? null,
    tenantId: employee?.tenant_id ?? null,
    facilityName: employment?.facility_name ?? null,
    facilityId,
    departmentName: employment?.department_name ?? null,
    designationName: employment?.designation_name ?? null,
    employeeCode: employment?.employee_code ?? null,
    employeeId: employee?.id ?? null,
    availability: employee?.availability ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                             */
/* -------------------------------------------------------------------------- */

function dayBounds(offsetDays = 0) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + offsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Resolves an exact-count query without transferring rows. A failed query must
 * surface as an error: showing "0" would look like an empty ward instead of a
 * missing table or an expired session. Count queries are sent as HEAD, so a
 * 404 arrives with no body and no `error` — a missing count is the only signal.
 */
async function counted(
  label: string,
  query: PromiseLike<{
    count: number | null;
    error: { message: string } | null;
  }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
  if (count === null) {
    throw new Error(
      `Could not load ${label}. Confirm the HMIS tables are installed in Supabase.`,
    );
  }
  return count;
}

function throwQueryErrors(
  label: string,
  ...results: { error?: { message: string } | null }[]
) {
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw new Error(`Could not load ${label}: ${failed.error.message}`);
  }
}

async function patientLookup(
  ids: (string | null | undefined)[],
  tenantId?: string | null,
) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length)
    return new Map<string, { name: string; number: string | null }>();
  let query = supabase
    .from("patients")
    .select("id, name, patient_number")
    .in("id", unique);
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data, error } = await query;
  if (error) {
    throw new Error(`Could not load patient details: ${error.message}`);
  }
  return new Map(
    (data ?? []).map((row) => [
      row.id,
      { name: row.name, number: row.patient_number },
    ]),
  );
}

export type FeedItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  status: string;
};

export type NoteRow = {
  id: string;
  type: string;
  patient: string;
  at: string;
  status: string;
};

export type WardRow = { ward: string; total: number; occupied: number };

export type WardBed = {
  bedId: string;
  bedCode: string;
  ward: string;
  bedType: string;
  status: string;
  patient: string | null;
  patientNumber: string | null;
  admissionId: string | null;
  assignmentId: string | null;
  admittedAt: string | null;
  manuallyOccupied: boolean;
};

export type MedicineVendor = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
};

export type MedicineRequestRow = {
  id: string;
  medicineId: string;
  quantity: number;
  note: string | null;
  status: string;
  createdAt: string;
  requestedByUserId: string | null;
  vendorOrderId: string | null;
  vendorName: string | null;
  vendorOrderStatus: string | null;
  sentToVendorAt: string | null;
};

export async function loadMedicineVendors(
  ctx: StaffContext,
): Promise<MedicineVendor[]> {
  if (!ctx.tenantId) return [];
  const { data, error } = await supabase
    .from("vendors")
    .select("id, name, email, phone, status")
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "active")
    .order("name");
  if (error) {
    throw new Error(`Could not load medicine vendors: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    status: row.status,
  }));
}

export async function createMedicineVendor(
  ctx: StaffContext,
  name: string,
  email: string,
  phone: string,
): Promise<string> {
  if (!ctx.tenantId) {
    throw new Error("Your workspace is missing its hospital.");
  }
  const vendorCode = `VND-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
  const { data, error } = await supabase
    .from("vendors")
    .insert({
      tenant_id: ctx.tenantId,
      vendor_code: vendorCode,
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      status: "active",
    })
    .select("id")
    .single();
  if (error) {
    throw new Error(`Could not add the vendor: ${error.message}`);
  }
  return data.id;
}

export async function loadMedicineRequests(
  ctx: StaffContext,
): Promise<MedicineRequestRow[]> {
  if (!ctx.tenantId || !ctx.facilityId) return [];
  const { data, error } = await supabase
    .from("medicine_requests")
    .select(
      "id, medicine_id, quantity, note, status, created_at, requested_by_user",
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("facility_id", ctx.facilityId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    throw new Error(`Could not load medicine requests: ${error.message}`);
  }

  const orders = new Map<
    string,
    { id: string; vendorId: string; status: string; sentAt: string }
  >();
  const vendorNames = new Map<string, string>();
  const rows = data ?? [];

  if (rows.length > 0) {
    const { data: orderRows, error: orderError } = await supabase
      .from("medicine_vendor_orders")
      .select("id, request_id, vendor_id, status, sent_at")
      .in(
        "request_id",
        rows.map((row) => row.id),
      );
    if (orderError) {
      throw new Error(
        `Could not load medicine vendor dispatches: ${orderError.message}`,
      );
    }

    const vendorIds = [
      ...new Set((orderRows ?? []).map((row) => row.vendor_id)),
    ];
    if (vendorIds.length > 0) {
      const { data: vendorRows, error: vendorError } = await supabase
        .from("vendors")
        .select("id, name")
        .in("id", vendorIds);
      if (vendorError) {
        throw new Error(
          `Could not load medicine vendor names: ${vendorError.message}`,
        );
      }
      for (const vendor of vendorRows ?? []) {
        vendorNames.set(vendor.id, vendor.name);
      }
    }

    for (const order of orderRows ?? []) {
      orders.set(order.request_id, {
        id: order.id,
        vendorId: order.vendor_id,
        status: order.status,
        sentAt: order.sent_at,
      });
    }
  }

  return rows.map((row) => {
    const order = orders.get(row.id);
    return {
      id: row.id,
      medicineId: row.medicine_id,
      quantity: Number(row.quantity),
      note: row.note,
      status: row.status,
      createdAt: row.created_at,
      requestedByUserId: row.requested_by_user,
      vendorOrderId: order?.id ?? null,
      vendorName: order ? (vendorNames.get(order.vendorId) ?? null) : null,
      vendorOrderStatus: order?.status ?? null,
      sentToVendorAt: order?.sentAt ?? null,
    };
  });
}

export async function createMedicineRequest(
  ctx: StaffContext,
  medicineId: string,
  quantity: number,
  note: string,
): Promise<void> {
  if (!ctx.tenantId || !ctx.facilityId) {
    throw new Error("Your workspace is missing its hospital or facility.");
  }
  const { error } = await supabase.from("medicine_requests").insert({
    tenant_id: ctx.tenantId,
    facility_id: ctx.facilityId,
    medicine_id: medicineId,
    requested_by: ctx.employeeId,
    requested_by_user: ctx.userId,
    quantity,
    note: note.trim() || null,
    status: "pending",
  });
  if (error) {
    throw new Error(`Could not send the medicine request: ${error.message}`);
  }
}

export async function reviewMedicineRequest(
  ctx: StaffContext,
  requestId: string,
  status: "declined" | "fulfilled",
): Promise<void> {
  if (!ctx.tenantId) {
    throw new Error("Your workspace is missing its hospital.");
  }
  const { error } = await supabase
    .from("medicine_requests")
    .update({
      status,
      reviewed_by: ctx.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", requestId);
  if (error) {
    throw new Error(`Could not update the medicine request: ${error.message}`);
  }
}

export async function sendMedicineRequestToVendor(
  ctx: StaffContext,
  requestId: string,
  vendorId: string,
): Promise<void> {
  if (!ctx.tenantId) {
    throw new Error("Your workspace is missing its hospital.");
  }
  const { error } = await supabase.rpc("send_medicine_request_to_vendor", {
    _request_id: requestId,
    _vendor_id: vendorId,
  });
  if (error) {
    throw new Error(
      `Could not send the medicine request to the vendor: ${error.message}`,
    );
  }
}

export type Ward = {
  id: string;
  name: string;
  wardType: string;
  floor: string | null;
  capacity: number | null;
  phone: string | null;
  notes: string | null;
  status: string;
};

/** Every ward in the signed-in user's facility with its physical details. */
export async function loadWards(ctx: StaffContext): Promise<Ward[]> {
  if (!ctx.tenantId || !ctx.facilityId) return [];
  const { data, error } = await supabase
    .from("wards")
    .select("id, name, ward_type, floor, capacity, phone, notes, status")
    .eq("tenant_id", ctx.tenantId)
    .eq("facility_id", ctx.facilityId)
    .order("name", { ascending: true });
  if (error) {
    throw new Error(`Could not load wards: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    wardType: row.ward_type,
    floor: row.floor,
    capacity: row.capacity,
    phone: row.phone,
    notes: row.notes,
    status: row.status,
  }));
}

/** Every bed in the signed-in user's facility with its current occupant. */
export async function loadWardBeds(ctx: StaffContext): Promise<WardBed[]> {
  if (!ctx.tenantId || !ctx.facilityId) return [];

  const [bedRes, assignmentRes] = await Promise.all([
    supabase
      .from("beds")
      .select("id, bed_code, ward, bed_type, status, is_occupied")
      .eq("tenant_id", ctx.tenantId)
      .eq("facility_id", ctx.facilityId)
      .order("ward", { ascending: true })
      .order("bed_code", { ascending: true }),
    supabase
      .from("bed_assignments")
      .select("id, bed_id, admission_id, start_at")
      .eq("status", "active"),
  ]);
  throwQueryErrors("ward beds", bedRes, assignmentRes);

  const bedIds = new Set((bedRes.data ?? []).map((bed) => bed.id));
  const activeAssignments = (assignmentRes.data ?? []).filter((assignment) =>
    bedIds.has(assignment.bed_id),
  );
  const admissionIds = [
    ...new Set(activeAssignments.map((assignment) => assignment.admission_id)),
  ];
  const admissionRes = admissionIds.length
    ? await supabase
        .from("admissions")
        .select("id, patient_id, admitted_at, status")
        .eq("tenant_id", ctx.tenantId)
        .in("id", admissionIds)
    : { data: [], error: null };
  throwQueryErrors("ward admissions", admissionRes);

  const admissions = (admissionRes.data ?? []).filter(
    (admission) => admission.status === "active",
  );
  const patients = await patientLookup(
    admissions.map((admission) => admission.patient_id),
    ctx.tenantId,
  );
  const admissionById = new Map(
    admissions.map((admission) => [admission.id, admission]),
  );
  const assignmentByBed = new Map<string, (typeof activeAssignments)[number]>();
  for (const assignment of activeAssignments) {
    if (admissionById.has(assignment.admission_id)) {
      assignmentByBed.set(assignment.bed_id, assignment);
    }
  }

  return (bedRes.data ?? []).map((bed) => {
    const assignment = assignmentByBed.get(bed.id);
    const admission = assignment
      ? admissionById.get(assignment.admission_id)
      : undefined;
    const patient = admission ? patients.get(admission.patient_id) : undefined;
    return {
      bedId: bed.id,
      bedCode: bed.bed_code,
      ward: bed.ward,
      manuallyOccupied: bed.is_occupied,
      bedType: bed.bed_type,
      status: bed.status,
      patient: patient?.name ?? null,
      patientNumber: patient?.number ?? null,
      admissionId: admission?.id ?? null,
      assignmentId: assignment?.id ?? null,
      admittedAt: admission?.admitted_at ?? null,
    };
  });
}

export async function loadFacilityWardStaff(
  ctx: StaffContext,
): Promise<WardStaffOption[]> {
  const { facilityId } = requireTenantAndFacility(ctx, "ward board");
  const { data, error } = await supabase.rpc("facility_ward_staff", {
    _facility_id: facilityId,
  });
  if (error) {
    throw new Error(`Could not load ward staff: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.employee_id,
    name: row.full_name,
    role: row.role_label === "doctor" ? "doctor" : "nurse",
  }));
}

export async function loadFacilityWardPatients(
  ctx: StaffContext,
): Promise<WardPatientRow[]> {
  const { facilityId } = requireTenantAndFacility(ctx, "ward board");
  const { data, error } = await supabase.rpc("facility_ward_patients", {
    _facility_id: facilityId,
  });
  if (error) {
    throw new Error(`Could not load patients in wards: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    assignmentId: row.assignment_id,
    admissionId: row.admission_id,
    patient: row.patient_name,
    number: row.patient_number,
    ward: row.ward,
    bed: row.bed_code,
    bedId: row.bed_id,
    nurseId: row.nurse_id,
    providerId: row.provider_id,
    nurse: row.nurse_name,
    doctor: row.doctor_name,
    admittedAt: row.admitted_at,
    startAt: row.start_at,
    admissionStatus: row.admission_status,
  }));
}

export async function admitPatientToWard(input: {
  patientId: string;
  bedId: string;
  nurseId: string | null;
  providerId: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("admit_patient_to_ward", {
    _patient_id: input.patientId,
    _bed_id: input.bedId,
    _nurse_id: input.nurseId,
    _provider_id: input.providerId,
  });
  if (error || !data) {
    throw new Error(
      `Could not admit the patient: ${error?.message ?? "unknown error"}`,
    );
  }
  return data;
}

export async function updateWardAssignment(input: {
  assignmentId: string;
  bedId: string;
  nurseId: string | null;
  providerId: string;
}): Promise<void> {
  const { error } = await supabase.rpc("update_ward_assignment", {
    _assignment_id: input.assignmentId,
    _bed_id: input.bedId,
    _nurse_id: input.nurseId,
    _provider_id: input.providerId,
  });
  if (error) {
    throw new Error(`Could not update the ward assignment: ${error.message}`);
  }
}

export type WardSectionData = {
  wardBeds: WardBed[];
  wardPatients: WardPatientRow[];
  wards: WardRow[];
  wardList: Ward[];
};

/** Ward board data for roles that do not load the full administrator view. */
export async function loadWardSectionData(
  ctx: StaffContext,
): Promise<WardSectionData> {
  const [wardBeds, wardPatients, wardList] = await Promise.all([
    loadWardBeds(ctx),
    loadFacilityWardPatients(ctx),
    loadWards(ctx),
  ]);

  const wards = new Map<string, { total: number; occupied: number }>();
  for (const bed of wardBeds) {
    const current = wards.get(bed.ward) ?? { total: 0, occupied: 0 };
    current.total += 1;
    wards.set(bed.ward, current);
  }
  for (const row of wardPatients) {
    const current = wards.get(row.ward);
    if (current) current.occupied += 1;
  }

  return {
    wardBeds,
    wardPatients,
    wards: [...wards.entries()]
      .map(([ward, stats]) => ({ ward, ...stats }))
      .sort((a, b) => b.total - a.total),
    wardList,
  };
}

export type InvoiceRow = {
  id: string;
  number: string;
  patient: string;
  items: InvoiceLineItem[];
  grossAmount: number;
  discountAmount: number;
  taxAmount: number;
  amount: number;
  status: string;
  issuedAt: string | null;
};

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type InvoicePatientOption = {
  id: string;
  name: string;
  number: string;
};

export type InvoiceChargeOption = {
  id: string;
  code: string;
  name: string;
  category: string;
  unitPrice: number;
};

export type PatientRegistrationRequest = {
  userId: string;
  fullName: string;
  phone: string;
  registeredAt: string;
};

export async function loadPatientRegistrations(): Promise<
  PatientRegistrationRequest[]
> {
  const { data, error } = await supabase.rpc("pending_patient_registrations");
  if (error) {
    throw new Error(`Could not load patient registrations: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    fullName: row.full_name,
    phone: row.phone,
    registeredAt: row.registered_at,
  }));
}

export async function loadReceptionistNotifications(): Promise<
  AdminNotification[]
> {
  const registrations = await loadPatientRegistrations();
  if (!registrations.length) return [];
  return [
    {
      id: "patient-approvals",
      title: `${registrations.length} patient${registrations.length === 1 ? "" : "s"} waiting for approval`,
      description: "Approve new patient accounts so their dashboard can open.",
      tone: "warning",
      href: "/dashboard/patient-approvals",
    },
  ];
}

export async function approvePatientRegistration(
  ctx: StaffContext,
  request: PatientRegistrationRequest,
  details: {
    patientId: string | null;
    dateOfBirth: string | null;
    sex: string | null;
  },
): Promise<string> {
  if (!ctx.tenantId) {
    throw new Error("Your workspace is missing its hospital.");
  }
  const { data, error } = await supabase.rpc("approve_patient_registration", {
    _tenant_id: ctx.tenantId,
    _user_id: request.userId,
    _patient_id: details.patientId,
    _date_of_birth: details.dateOfBirth,
    _sex: details.sex,
  });
  if (error || !data) {
    throw new Error(
      `Could not approve ${request.fullName}: ${error?.message ?? "unknown error"}`,
    );
  }
  return data;
}

export async function rejectPatientRegistration(
  request: PatientRegistrationRequest,
): Promise<void> {
  const { error } = await supabase.rpc("reject_patient_registration", {
    _user_id: request.userId,
  });
  if (error) {
    throw new Error(`Could not decline ${request.fullName}: ${error.message}`);
  }
}

export type LabTechnicianData = {
  pendingSamples: number;
  resultsToVerify: number;
  queue: {
    id: string;
    accession: string;
    test: string;
    patient: string;
    priority: string;
    status: string;
    orderedAt: string;
  }[];
  results: {
    id: string;
    test: string;
    patient: string;
    value: string;
    unit: string;
    status: string;
    at: string;
  }[];
};

export type PharmacistData = {
  pendingPrescriptions: number;
  dispensesToday: number;
  outstanding: {
    id: string;
    medicine: string;
    patient: string;
    dose: string;
    route: string;
    frequency: string;
    duration: string;
    remaining: number;
    prescribed: number;
    prescriber: string;
    prescriberDepartment: string | null;
    prescriberSpecialization: string | null;
    prescriberCode: string | null;
    prescribedAt: string;
  }[];
  recentDispenses: {
    id: string;
    medicine: string;
    quantity: number;
    patient: string;
    at: string;
  }[];
  stock: { id: string; item: string; location: string; quantity: number }[];
  medicineStock: {
    id: string;
    name: string;
    strength: string;
    isMapped: boolean;
    available: number;
    prescribed: number;
  }[];
};

export type ReceptionistData = {
  appointmentsToday: number;
  newPatients: number;
  registrations: PatientRegistrationRequest[];
  outstandingInvoices: number;
  activeAdmissions: number;
  schedule: {
    id: string;
    time: string;
    patient: string;
    number: string;
    status: string;
  }[];
  patients: {
    id: string;
    name: string;
    number: string;
    createdAt: string;
    admitted: boolean;
  }[];
  invoices: {
    id: string;
    number: string;
    patient: string;
    amount: number;
    status: string;
    issuedAt: string | null;
  }[];
};

function requireTenantAndFacility(ctx: StaffContext, workspace: string) {
  if (!ctx.tenantId)
    throw new Error(`Your ${workspace} is missing its hospital ID.`);
  if (!ctx.facilityId)
    throw new Error(`Your ${workspace} is missing its facility assignment.`);
  return { tenantId: ctx.tenantId, facilityId: ctx.facilityId };
}

export async function loadMedicineCatalog(
  tenantId: string,
  activeOnly = false,
): Promise<MedicineCatalogEntry[]> {
  if (!tenantId) {
    throw new Error("Your workspace is missing its hospital ID.");
  }
  let query = supabase
    .from("medicine_catalog")
    .select("id, tenant_id, medicine_code, name, strength, dosage_form, status")
    .eq("tenant_id", tenantId);
  if (activeOnly) query = query.eq("status", "active");

  const { data, error } = await query.order("name", { ascending: true });
  if (error) {
    throw new Error(
      `Could not load the hospital medicine catalog: ${error.message}`,
    );
  }
  return data ?? [];
}

export async function loadMedicineCatalogStock(
  tenantId: string,
): Promise<MedicineCatalogStock[]> {
  if (!tenantId) {
    throw new Error("Your workspace is missing its hospital ID.");
  }
  const { data, error } = await supabase.rpc("get_medicine_catalog_stock", {
    _tenant_id: tenantId,
  });
  if (error) {
    throw new Error(
      `Could not load available medicine stock: ${error.message}`,
    );
  }
  return data ?? [];
}

export async function loadMedicineInventoryAdminData(
  tenantId: string,
  medicineIds: string[],
): Promise<{
  items: MedicineInventoryItem[];
  mappings: MedicineInventoryMapping[];
}> {
  if (!tenantId) {
    throw new Error("Your workspace is missing its hospital ID.");
  }

  const [itemRes, mappingRes] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("id, item_code, name, unit_of_measure, status")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true }),
    medicineIds.length
      ? supabase
          .from("medicine_inventory_map")
          .select("id, medicine_id, item_id, conversion_factor, status")
          .in("medicine_id", medicineIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemRes.error) {
    throw new Error(
      `Could not load hospital inventory items: ${itemRes.error.message}`,
    );
  }
  if (mappingRes.error) {
    throw new Error(
      `Could not load medicine inventory links: ${mappingRes.error.message}`,
    );
  }
  return {
    items: itemRes.data ?? [],
    mappings: mappingRes.data ?? [],
  };
}

export type PaymentLedgerStaff = {
  doctor: string | null;
  nurse: string | null;
  ward: string | null;
  bed: string | null;
};

export type PaymentLedgerRow = {
  invoiceId: string;
  number: string;
  patient: string;
  patientNumber: string | null;
  amount: number;
  paid: number;
  outstanding: number;
  status: string;
  issuedAt: string | null;
  lastPaymentAt: string | null;
  lastPaymentMethod: string | null;
  lastPaymentReference: string | null;
  lastPaymentStatus: string | null;
  staff: PaymentLedgerStaff;
};

/** Every invoice with its payments and the staff caring for the patient. */
export async function loadFacilityPaymentLedger(
  ctx: StaffContext,
): Promise<PaymentLedgerRow[]> {
  if (!ctx.facilityId) return [];
  const { data, error } = await supabase.rpc("facility_payment_ledger", {
    _facility_id: ctx.facilityId,
  });
  if (error) {
    throw new Error(`Could not load patient payments: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    invoiceId: row.invoice_id,
    number: row.invoice_number,
    patient: row.patient_name,
    patientNumber: row.patient_number,
    amount: Number(row.net_amount),
    paid: Number(row.paid_amount),
    outstanding: Number(row.outstanding),
    status: row.invoice_status,
    issuedAt: row.issued_at,
    lastPaymentAt: row.last_payment_at,
    lastPaymentMethod: row.last_payment_method,
    lastPaymentReference: row.last_payment_reference,
    lastPaymentStatus: row.last_payment_status,
    staff: {
      doctor: row.doctor_name,
      nurse: row.nurse_name,
      ward: row.ward,
      bed: row.bed_code,
    },
  }));
}

export async function loadFacilityInvoices(
  ctx: StaffContext,
): Promise<InvoiceRow[]> {
  const { tenantId, facilityId } = requireTenantAndFacility(
    ctx,
    "invoice workspace",
  );
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, patient_id, gross_amount, discount_amount, tax_amount, net_amount, status, issued_at",
    )
    .eq("tenant_id", tenantId)
    .eq("facility_id", facilityId)
    .order("created_at", { ascending: false })
    .limit(100);
  throwQueryErrors("facility invoices", { error });

  const rows = data ?? [];
  const [patients, itemsResult] = await Promise.all([
    patientLookup(
      rows.map((row) => row.patient_id),
      tenantId,
    ),
    rows.length
      ? supabase
          .from("invoice_items")
          .select("invoice_id, description, quantity, unit_price, line_total")
          .in(
            "invoice_id",
            rows.map((row) => row.id),
          )
      : Promise.resolve({ data: [], error: null }),
  ]);
  throwQueryErrors("invoice line items", itemsResult);

  const itemsByInvoice = new Map<string, InvoiceLineItem[]>();
  for (const item of itemsResult.data ?? []) {
    const items = itemsByInvoice.get(item.invoice_id) ?? [];
    items.push({
      description: item.description ?? "Charge",
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    });
    itemsByInvoice.set(item.invoice_id, items);
  }

  return rows.map((row) => ({
    id: row.id,
    number: row.invoice_number,
    patient: patients.get(row.patient_id)?.name ?? "Patient",
    items: itemsByInvoice.get(row.id) ?? [],
    grossAmount: Number(row.gross_amount),
    discountAmount: Number(row.discount_amount),
    taxAmount: Number(row.tax_amount),
    amount: Number(row.net_amount),
    status: row.status,
    issuedAt: row.issued_at,
  }));
}

export async function loadInvoicePatientOptions(
  ctx: StaffContext,
): Promise<InvoicePatientOption[]> {
  const { tenantId } = requireTenantAndFacility(ctx, "invoice workspace");
  const { data, error } = await supabase
    .from("patients")
    .select("id, name, patient_number")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("name", { ascending: true })
    .limit(500);

  if (error) {
    throw new Error(`Could not load patients for invoicing: ${error.message}`);
  }
  return (data ?? []).map((patient) => ({
    id: patient.id,
    name: patient.name,
    number: patient.patient_number,
  }));
}

export async function loadInvoiceChargeOptions(
  ctx: StaffContext,
): Promise<InvoiceChargeOption[]> {
  const { tenantId } = requireTenantAndFacility(ctx, "invoice workspace");
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("charge_catalog")
    .select(
      "id, charge_code, name, category, base_rate, effective_from, effective_to",
    )
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .lte("effective_from", today)
    .or(`effective_to.is.null,effective_to.gt.${today}`)
    .order("name", { ascending: true })
    .limit(500);

  if (error) {
    throw new Error(`Could not load your price list: ${error.message}`);
  }
  return (data ?? []).map((charge) => ({
    id: charge.id,
    code: charge.charge_code,
    name: charge.name,
    category: charge.category,
    unitPrice: Number(charge.base_rate),
  }));
}

export async function loadLabTechnicianData(
  ctx: StaffContext,
): Promise<LabTechnicianData> {
  const { tenantId } = requireTenantAndFacility(ctx, "lab workspace");
  const [ordersRes, resultRes] = await Promise.all([
    supabase
      .from("lab_orders")
      .select("id, patient_id, ordered_at")
      .eq("tenant_id", tenantId)
      .in("status", ["placed", "in_progress"])
      .or(
        ctx.employeeId
          ? `assigned_to.is.null,assigned_to.eq.${ctx.employeeId}`
          : "assigned_to.is.null",
      )
      .order("ordered_at", { ascending: true }),
    supabase
      .from("lab_results")
      .select("id, lab_order_item_id, result_value, unit, status, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "preliminary")
      .order("created_at", { ascending: true })
      .limit(50),
  ]);
  throwQueryErrors("laboratory work queue", ordersRes, resultRes);

  const orders = ordersRes.data ?? [];
  const orderIds = orders.map((order) => order.id);
  const [pendingSamples, resultsToVerify] = await Promise.all([
    orderIds.length
      ? counted(
          "pending laboratory samples",
          supabase
            .from("lab_order_items")
            .select("id", { count: "exact", head: true })
            .in("lab_order_id", orderIds)
            .in("status", ["ordered", "collected"]),
        )
      : 0,
    counted(
      "preliminary laboratory results",
      supabase
        .from("lab_results")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "preliminary"),
    ),
  ]);
  const [itemRes, resultItemsRes] = await Promise.all([
    orderIds.length
      ? supabase
          .from("lab_order_items")
          .select(
            "id, lab_order_id, test_id, accession_number, priority, status, created_at",
          )
          .in("lab_order_id", orderIds)
          .in("status", ["ordered", "collected"])
          .order("created_at", { ascending: true })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    resultRes.data?.length
      ? supabase
          .from("lab_order_items")
          .select("id, lab_order_id, test_id")
          .in(
            "id",
            resultRes.data.map((result) => result.lab_order_item_id),
          )
      : Promise.resolve({ data: [], error: null }),
  ]);
  throwQueryErrors("laboratory order details", itemRes, resultItemsRes);
  const items = itemRes.data ?? [];
  const resultItems = resultItemsRes.data ?? [];
  const allItems = [...items, ...resultItems];
  const allOrderIds = [
    ...new Set([
      ...orders.map((order) => order.id),
      ...resultItems.map((item) => item.lab_order_id),
    ]),
  ];
  const allTestIds = [...new Set(allItems.map((item) => item.test_id))];
  const [allOrdersRes, testsRes] = await Promise.all([
    allOrderIds.length
      ? supabase
          .from("lab_orders")
          .select("id, patient_id, ordered_at")
          .eq("tenant_id", tenantId)
          .in("id", allOrderIds)
      : Promise.resolve({ data: [], error: null }),
    allTestIds.length
      ? supabase
          .from("lab_test_catalog")
          .select("id, name")
          .eq("tenant_id", tenantId)
          .in("id", allTestIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  throwQueryErrors("laboratory queue labels", allOrdersRes, testsRes);
  const allOrders = allOrdersRes.data ?? [];
  const patients = await patientLookup(
    allOrders.map((order) => order.patient_id),
    tenantId,
  );
  const findOrder = (orderId: string) =>
    allOrders.find((row) => row.id === orderId);
  const findTest = (testId: string) =>
    (testsRes.data ?? []).find((row) => row.id === testId)?.name ?? "Lab test";

  return {
    pendingSamples,
    resultsToVerify,
    queue: items.map((item) => {
      const order = findOrder(item.lab_order_id);
      return {
        id: item.id,
        accession: item.accession_number,
        test: findTest(item.test_id),
        patient: (order && patients.get(order.patient_id)?.name) ?? "Patient",
        priority: item.priority,
        status: item.status,
        orderedAt: order?.ordered_at ?? item.created_at,
      };
    }),
    results: (resultRes.data ?? []).map((result) => {
      const item = resultItems.find(
        (row) => row.id === result.lab_order_item_id,
      );
      const order = item && findOrder(item.lab_order_id);
      return {
        id: result.id,
        test: item ? findTest(item.test_id) : "Lab result",
        patient: (order && patients.get(order.patient_id)?.name) ?? "Patient",
        value: result.result_value,
        unit: result.unit,
        status: result.status,
        at: result.created_at,
      };
    }),
  };
}

export type LabAssignmentPriority = "routine" | "urgent" | "stat";

export type LabTestOption = {
  id: string;
  code: string;
  name: string;
  specimenType: string;
};

export type LabTechnicianOption = {
  id: string;
  name: string;
};

export type LabAssignmentRow = {
  id: string;
  patient: string;
  patientNumber: string | null;
  tests: string[];
  technician: string;
  priority: string;
  status: string;
  orderedAt: string;
};

export type LabAssignmentWorkspace = {
  patients: InvoicePatientOption[];
  tests: LabTestOption[];
  technicians: LabTechnicianOption[];
  assignments: LabAssignmentRow[];
};

export async function loadLabAssignmentWorkspace(
  ctx: StaffContext,
): Promise<LabAssignmentWorkspace> {
  const { tenantId, facilityId } = requireTenantAndFacility(
    ctx,
    "lab assignment workspace",
  );

  const ordersPromise = ctx.employeeId
    ? supabase
        .from("lab_orders")
        .select("id, patient_id, ordered_at, status, assigned_to")
        .eq("tenant_id", tenantId)
        .eq("ordered_by", ctx.employeeId)
        .order("ordered_at", { ascending: false })
        .limit(50)
    : Promise.resolve({
        data: [] as {
          id: string;
          patient_id: string;
          ordered_at: string;
          status: string;
          assigned_to: string | null;
        }[],
        error: null,
      });

  const [patientRows, testRes, technicianRes, orderRes] = await Promise.all([
    loadInvoicePatientOptions(ctx),
    supabase
      .from("lab_test_catalog")
      .select("id, test_code, name, specimen_type")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .order("name", { ascending: true })
      .limit(500),
    supabase.rpc("facility_lab_technicians", { _facility_id: facilityId }),
    ordersPromise,
  ]);
  throwQueryErrors("lab assignment options", testRes, technicianRes, orderRes);

  const orders = orderRes.data ?? [];
  const orderIds = orders.map((order) => order.id);
  const [itemRes, patients] = await Promise.all([
    orderIds.length
      ? supabase
          .from("lab_order_items")
          .select("lab_order_id, test_id, priority, status")
          .in("lab_order_id", orderIds)
          .order("created_at", { ascending: true })
          .limit(200)
      : Promise.resolve({
          data: [] as {
            lab_order_id: string;
            test_id: string;
            priority: string;
            status: string;
          }[],
          error: null,
        }),
    patientLookup(
      orders.map((order) => order.patient_id),
      tenantId,
    ),
  ]);
  throwQueryErrors("lab assignment details", itemRes);

  const items = itemRes.data ?? [];
  const tests = new Map(
    (testRes.data ?? []).map((test) => [
      test.id,
      { code: test.test_code, name: test.name },
    ]),
  );
  const technicians = new Map(
    (technicianRes.data ?? []).map((technician) => [
      technician.employee_id,
      technician.full_name,
    ]),
  );
  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) {
    const current = itemsByOrder.get(item.lab_order_id) ?? [];
    current.push(item);
    itemsByOrder.set(item.lab_order_id, current);
  }

  return {
    patients: patientRows,
    tests: (testRes.data ?? []).map((test) => ({
      id: test.id,
      code: test.test_code,
      name: test.name,
      specimenType: test.specimen_type,
    })),
    technicians: (technicianRes.data ?? []).map((technician) => ({
      id: technician.employee_id,
      name: technician.full_name,
    })),
    assignments: orders.map((order) => {
      const orderItems = itemsByOrder.get(order.id) ?? [];
      return {
        id: order.id,
        patient: patients.get(order.patient_id)?.name ?? "Patient",
        patientNumber: patients.get(order.patient_id)?.number ?? null,
        tests: orderItems.map(
          (item) => tests.get(item.test_id)?.name ?? "Lab test",
        ),
        technician:
          (order.assigned_to && technicians.get(order.assigned_to)) ??
          "Lab technician",
        priority: orderItems[0]?.priority ?? "routine",
        status: order.status,
        orderedAt: order.ordered_at,
      };
    }),
  };
}

export async function createLabAssignment(input: {
  patientId: string;
  testIds: string[];
  technicianId: string;
  priority: LabAssignmentPriority;
}): Promise<{ labOrderId: string; itemCount: number }> {
  const { data, error } = await supabase.rpc("create_lab_assignment", {
    _patient_id: input.patientId,
    _test_ids: input.testIds,
    _assigned_to: input.technicianId,
    _priority: input.priority,
  });
  if (error) {
    throw new Error(`Could not assign the lab tests: ${error.message}`);
  }
  const row = data?.[0];
  if (!row) {
    throw new Error("Could not assign the lab tests.");
  }
  return { labOrderId: row.lab_order_id, itemCount: row.item_count };
}

export async function loadPharmacistData(
  ctx: StaffContext,
): Promise<PharmacistData> {
  const { tenantId, facilityId } = requireTenantAndFacility(
    ctx,
    "pharmacy workspace",
  );
  const today = dayBounds();
  const [itemRes, dispenseRes, locationRes] = await Promise.all([
    supabase
      .from("prescription_items")
      .select(
        "id, prescription_id, medicine_id, dose, frequency, quantity_prescribed, quantity_dispensed",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
    ctx.employeeId
      ? supabase
          .from("prescription_dispenses")
          .select("id, prescription_item_id, quantity, dispensed_at")
          .eq("pharmacist_id", ctx.employeeId)
          .gte("dispensed_at", today.start)
          .lt("dispensed_at", today.end)
          .order("dispensed_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("inventory_locations")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("facility_id", facilityId)
      .eq("status", "active"),
  ]);
  throwQueryErrors("pharmacy workspace", itemRes, dispenseRes, locationRes);

  const items = itemRes.data ?? [];
  const dispensesToday = ctx.employeeId
    ? await counted(
        "today's pharmacy dispenses",
        supabase
          .from("prescription_dispenses")
          .select("id", { count: "exact", head: true })
          .eq("pharmacist_id", ctx.employeeId)
          .gte("dispensed_at", today.start)
          .lt("dispensed_at", today.end),
      )
    : 0;
  const prescriptionIds = [
    ...new Set(items.map((item) => item.prescription_id)),
  ];
  const [prescriptionRes, medicineRes, dispenseItemsRes] = await Promise.all([
    prescriptionIds.length
      ? supabase
          .from("prescriptions")
          .select("id, encounter_id, status")
          .in("id", prescriptionIds)
      : Promise.resolve({ data: [], error: null }),
    items.length
      ? supabase
          .from("medicine_catalog")
          .select("id, name, strength")
          .eq("tenant_id", tenantId)
          .in("id", [...new Set(items.map((item) => item.medicine_id))])
      : Promise.resolve({ data: [], error: null }),
    dispenseRes.data?.length
      ? supabase
          .from("prescription_items")
          .select("id, medicine_id, prescription_id")
          .eq("tenant_id", tenantId)
          .in(
            "id",
            dispenseRes.data.map((row) => row.prescription_item_id),
          )
      : Promise.resolve({ data: [], error: null }),
  ]);
  throwQueryErrors(
    "prescription details",
    prescriptionRes,
    medicineRes,
    dispenseItemsRes,
  );

  const prescriptions = prescriptionRes.data ?? [];
  const activeItems = items.filter((item) =>
    prescriptions.some(
      (prescription) =>
        prescription.id === item.prescription_id &&
        prescription.status === "active",
    ),
  );
  const encounterIds = [
    ...new Set(prescriptions.map((row) => row.encounter_id)),
  ];
  const encounterRes = encounterIds.length
    ? await supabase
        .from("encounters")
        .select("id, patient_id, facility_id")
        .eq("tenant_id", tenantId)
        .eq("facility_id", facilityId)
        .in("id", encounterIds)
    : { data: [], error: null };
  throwQueryErrors("prescription patients", encounterRes);
  const encounters = encounterRes.data ?? [];
  const inFacilityPrescriptionIds = prescriptions
    .filter((prescription) =>
      encounters.some(
        (encounter) => encounter.id === prescription.encounter_id,
      ),
    )
    .map((prescription) => prescription.id);
  const localItems = activeItems.filter((item) =>
    inFacilityPrescriptionIds.includes(item.prescription_id),
  );
  const patients = await patientLookup(
    encounters.map((row) => row.patient_id),
    tenantId,
  );
  const medicineName = (id: string) => {
    const medicine = (medicineRes.data ?? []).find((row) => row.id === id);
    return medicine ? `${medicine.name} ${medicine.strength}` : "Medicine";
  };
  const remainingFor = (id: string) =>
    localItems.find((item) => item.id === id);
  const dispensedItems = dispenseItemsRes.data ?? [];
  const dispenseItemIds = [...new Set(dispensedItems.map((row) => row.id))];
  const dispensePrescriptionIds = [
    ...new Set(dispensedItems.map((row) => row.prescription_id)),
  ];
  const dispensePrescriptions = prescriptions.filter((row) =>
    dispensePrescriptionIds.includes(row.id),
  );
  const dispenseEncounterIds = [
    ...new Set(dispensePrescriptions.map((row) => row.encounter_id)),
  ];
  const dispenseEncounters = encounters.filter((row) =>
    dispenseEncounterIds.includes(row.id),
  );

  const locationIds = (locationRes.data ?? []).map((row) => row.id);
  const [balanceRes, itemLabelsRes] = await Promise.all([
    locationIds.length
      ? supabase
          .from("inventory_balances")
          .select(
            "id, item_id, location_id, quantity_on_hand, quantity_reserved",
          )
          .in("location_id", locationIds)
          .gt("quantity_on_hand", 0)
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
    locationIds.length
      ? supabase
          .from("inventory_items")
          .select("id, name")
          .eq("tenant_id", tenantId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  throwQueryErrors("pharmacy stock", balanceRes, itemLabelsRes);

  const balances = balanceRes.data ?? [];
  const stockNames = (itemLabelsRes.data ?? []).filter((row) =>
    balances.some((balance) => balance.item_id === row.id),
  );
  const dispenseRows = dispenseRes.data ?? [];
  const prescriptionLines = await loadFacilityPrescriptionLines(ctx);
  const openPrescriptionLines = prescriptionLines.filter(
    (line) => line.status === "active" && line.remaining > 0,
  );

  const [catalogRows, catalogStockRows] = await Promise.all([
    loadMedicineCatalog(tenantId, true),
    loadMedicineCatalogStock(tenantId),
  ]);
  const catalogStockById = new Map(
    catalogStockRows.map((row) => [row.medicine_id, row]),
  );
  const prescribedByMedicine = new Map<string, number>();
  for (const item of localItems) {
    const remaining =
      Number(item.quantity_prescribed) - Number(item.quantity_dispensed);
    if (remaining <= 0) continue;
    prescribedByMedicine.set(
      item.medicine_id,
      (prescribedByMedicine.get(item.medicine_id) ?? 0) + remaining,
    );
  }

  return {
    pendingPrescriptions: openPrescriptionLines.length,
    dispensesToday,
    outstanding: openPrescriptionLines.slice(0, 25).map((line) => ({
      id: line.id,
      medicine: line.medicine,
      patient: line.patient,
      dose: line.dose,
      route: line.route,
      frequency: line.frequency,
      duration: line.duration,
      remaining: line.remaining,
      prescribed: line.prescribed,
      prescriber: line.prescriber,
      prescriberDepartment: line.prescriberDepartment,
      prescriberSpecialization: line.prescriberSpecialization,
      prescriberCode: line.prescriberCode,
      prescribedAt: line.prescribedAt,
    })),
    recentDispenses: dispenseRows
      .filter((row) => dispenseItemIds.includes(row.prescription_item_id))
      .map((row) => {
        const item =
          remainingFor(row.prescription_item_id) ??
          dispensedItems.find(
            (candidate) => candidate.id === row.prescription_item_id,
          );
        const prescription =
          item &&
          prescriptions.find(
            (candidate) => candidate.id === item.prescription_id,
          );
        const encounter =
          prescription &&
          dispenseEncounters.find(
            (candidate) => candidate.id === prescription.encounter_id,
          );
        return {
          id: row.id,
          medicine: item ? medicineName(item.medicine_id) : "Medicine",
          quantity: Number(row.quantity),
          patient:
            (encounter && patients.get(encounter.patient_id)?.name) ??
            "Patient",
          at: row.dispensed_at,
        };
      }),
    medicineStock: catalogRows.map((entry) => {
      const stockRow = catalogStockById.get(entry.id);
      return {
        id: entry.id,
        name: entry.name,
        strength: entry.strength,
        isMapped: stockRow?.is_mapped ?? false,
        available: Number(stockRow?.available_quantity ?? 0),
        prescribed: prescribedByMedicine.get(entry.id) ?? 0,
      };
    }),
    stock: balances.map((balance) => ({
      id: balance.id,
      item:
        stockNames.find((row) => row.id === balance.item_id)?.name ??
        "Stock item",
      location:
        locationRes.data?.find((row) => row.id === balance.location_id)?.name ??
        "Location",
      quantity: Math.max(
        Number(balance.quantity_on_hand) - Number(balance.quantity_reserved),
        0,
      ),
    })),
  };
}

export async function loadReceptionistData(
  ctx: StaffContext,
): Promise<ReceptionistData> {
  const { tenantId, facilityId } = requireTenantAndFacility(
    ctx,
    "reception workspace",
  );
  const today = dayBounds();
  const [appointmentsRes, patientsRes, invoicesRes, admissionsRes] =
    await Promise.all([
      supabase
        .from("appointments")
        .select("id, patient_id, scheduled_at, status")
        .eq("tenant_id", tenantId)
        .eq("facility_id", facilityId)
        .gte("scheduled_at", today.start)
        .lt("scheduled_at", today.end)
        .in("status", ["scheduled", "checked_in"])
        .order("scheduled_at", { ascending: true })
        .limit(50),
      supabase
        .from("patients")
        .select("id, name, patient_number, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("invoices")
        .select("id, patient_id, invoice_number, net_amount, status, issued_at")
        .eq("tenant_id", tenantId)
        .eq("facility_id", facilityId)
        .in("status", ["issued", "partially_paid", "paid"])
        .order("issued_at", { ascending: false })
        .limit(20),
      supabase
        .from("admissions")
        .select("id, patient_id")
        .eq("tenant_id", tenantId)
        .eq("facility_id", facilityId)
        .eq("status", "active")
        .limit(500),
    ]);
  throwQueryErrors(
    "reception workspace",
    appointmentsRes,
    patientsRes,
    invoicesRes,
    admissionsRes,
  );
  const [appointmentsToday, outstandingInvoices] = await Promise.all([
    counted(
      "today's appointments",
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("facility_id", facilityId)
        .gte("scheduled_at", today.start)
        .lt("scheduled_at", today.end)
        .in("status", ["scheduled", "checked_in"]),
    ),
    counted(
      "outstanding invoices",
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("facility_id", facilityId)
        .in("status", ["issued", "partially_paid"]),
    ),
  ]);
  const registrations = await loadPatientRegistrations();
  const invoiceRows = invoicesRes.data ?? [];
  const admittedPatientIds = new Set(
    (admissionsRes.data ?? []).map((row) => row.patient_id),
  );
  const patientsById = await patientLookup(
    [
      ...(appointmentsRes.data ?? []).map((row) => row.patient_id),
      ...invoiceRows.map((row) => row.patient_id),
    ],
    tenantId,
  );
  return {
    appointmentsToday,
    newPatients: patientsRes.data?.length ?? 0,
    registrations,
    outstandingInvoices,
    activeAdmissions: admittedPatientIds.size,
    schedule: (appointmentsRes.data ?? []).map((row) => ({
      id: row.id,
      time: formatTime(row.scheduled_at),
      patient: patientsById.get(row.patient_id)?.name ?? "Patient",
      number: patientsById.get(row.patient_id)?.number ?? "No MRN",
      status: row.status,
    })),
    patients: (patientsRes.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      number: row.patient_number,
      createdAt: row.created_at,
      admitted: admittedPatientIds.has(row.id),
    })),
    invoices: invoiceRows.map((row) => ({
      id: row.id,
      number: row.invoice_number,
      patient: patientsById.get(row.patient_id)?.name ?? "Patient",
      amount: Number(row.net_amount),
      status: row.status,
      issuedAt: row.issued_at,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Doctor                                                                     */
/* -------------------------------------------------------------------------- */

export type DoctorAppointment = {
  id: string;
  patientId: string;
  patient: string;
  number: string | null;
  dateOfBirth: string | null;
  sex: string | null;
  contact: string | null;
  allergies: string[];
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  appointmentType: string;
  reason: string | null;
  location: string | null;
  response: string;
  note: string | null;
  respondedAt: string | null;
};

export type DoctorScheduleEntry = {
  id: string;
  at: string;
  patient: string;
  number: string | null;
  durationMinutes: number;
  status: string;
  appointmentType: string;
  reason: string | null;
  location: string | null;
  response: string;
};

type DoctorPatientDetail = {
  id: string;
  name: string;
  patient_number: string;
  date_of_birth: string;
  sex: string;
  contact_details: string | null;
};

type DoctorPatientAllergy = {
  patient_id: string;
  substance: string;
  reaction: string;
  severity: string;
};

/**
 * Appointments reception booked against the signed-in doctor, with the patient
 * details the doctor needs before the consultation.
 */
export async function loadDoctorAppointments(
  ctx: StaffContext,
): Promise<DoctorAppointment[]> {
  if (!ctx.tenantId || !ctx.employeeId) return [];
  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, patient_id, scheduled_at, status, appointment_type, reason, location, duration_minutes, doctor_response, doctor_response_note, doctor_responded_at",
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("provider_id", ctx.employeeId)
    .in("status", ["scheduled", "checked_in"])
    .gte("scheduled_at", new Date(Date.now() - 86_400_000).toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(50);
  if (error) {
    throw new Error(`Could not load your appointments: ${error.message}`);
  }

  const patientIds = [...new Set((data ?? []).map((row) => row.patient_id))];
  const [patientRes, allergyRes] = await Promise.all([
    patientIds.length
      ? supabase
          .from("patients")
          .select(
            "id, name, patient_number, date_of_birth, sex, contact_details",
          )
          .in("id", patientIds)
      : Promise.resolve({ data: [] as DoctorPatientDetail[], error: null }),
    patientIds.length
      ? supabase
          .from("allergies")
          .select("patient_id, substance, reaction, severity")
          .in("patient_id", patientIds)
          .eq("status", "active")
      : Promise.resolve({ data: [] as DoctorPatientAllergy[], error: null }),
  ]);
  throwQueryErrors("patient details", patientRes, allergyRes);
  const patientRows: DoctorPatientDetail[] = patientRes.data ?? [];
  const allergyRows: DoctorPatientAllergy[] = allergyRes.data ?? [];
  const patients = new Map(patientRows.map((row) => [row.id, row]));

  return (data ?? []).map((row) => {
    const patient = patients.get(row.patient_id);
    return {
      id: row.id,
      patientId: row.patient_id,
      patient: patient?.name ?? "Patient",
      number: patient?.patient_number ?? null,
      dateOfBirth: patient?.date_of_birth ?? null,
      sex: patient?.sex ?? null,
      contact: patient?.contact_details ?? null,
      allergies: allergyRows
        .filter((allergy) => allergy.patient_id === row.patient_id)
        .map((allergy) => `${allergy.substance} (${allergy.severity})`),
      scheduledAt: row.scheduled_at,
      durationMinutes: row.duration_minutes,
      status: row.status,
      appointmentType: row.appointment_type,
      reason: row.reason,
      location: row.location,
      response: row.doctor_response,
      note: row.doctor_response_note,
      respondedAt: row.doctor_responded_at,
    };
  });
}

/**
 * Appointments for one month of the signed-in doctor's calendar. Completed
 * visits are kept so past days still show how busy the clinic was.
 */
export async function loadDoctorScheduleMonth(
  ctx: StaffContext,
  month: string,
): Promise<DoctorScheduleEntry[]> {
  if (!ctx.tenantId || !ctx.facilityId || !ctx.employeeId) return [];
  const start = new Date(`${month}-01T00:00:00`);
  if (Number.isNaN(start.getTime())) {
    throw new Error("Could not load your schedule: invalid month.");
  }
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  const { data, error } = await supabase
    .from("appointments")
    .select(
      "id, patient_id, scheduled_at, duration_minutes, status, appointment_type, reason, location, doctor_response",
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("facility_id", ctx.facilityId)
    .eq("provider_id", ctx.employeeId)
    .gte("scheduled_at", start.toISOString())
    .lt("scheduled_at", end.toISOString())
    .in("status", ["scheduled", "checked_in", "completed"])
    .order("scheduled_at", { ascending: true })
    .limit(200);
  if (error) {
    throw new Error(`Could not load your schedule: ${error.message}`);
  }

  const patients = await patientLookup(
    (data ?? []).map((row) => row.patient_id),
    ctx.tenantId,
  );
  return (data ?? []).map((row) => ({
    id: row.id,
    at: row.scheduled_at,
    patient: patients.get(row.patient_id)?.name ?? "Patient",
    number: patients.get(row.patient_id)?.number ?? null,
    durationMinutes: row.duration_minutes,
    status: row.status,
    appointmentType: row.appointment_type,
    reason: row.reason,
    location: row.location,
    response: row.doctor_response,
  }));
}

export async function respondToAppointment(
  ctx: StaffContext,
  appointmentId: string,
  response: "available" | "unavailable",
  note: string,
): Promise<void> {
  const { error } = await supabase.rpc("respond_to_appointment", {
    _appointment_id: appointmentId,
    _response: response,
    _note: note.trim() || null,
  });
  if (error) {
    throw new Error(`Could not save your availability: ${error.message}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Appointment scheduling                                                     */
/* -------------------------------------------------------------------------- */

export type DoctorDayLoad = {
  providerId: string;
  name: string;
  department: string | null;
  designation: string | null;
  availability: string;
  appointments: number;
  bookedMinutes: number;
  firstSlot: string | null;
  lastSlot: string | null;
  completed: number;
};

export type FacilityAppointment = {
  id: string;
  patientId: string;
  patient: string;
  number: string;
  providerId: string;
  doctor: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  appointmentType: string;
  reason: string | null;
  location: string | null;
  response: string;
};

export type AppointmentPatient = {
  id: string;
  name: string;
  number: string;
  dateOfBirth: string;
  sex: string;
};

/** How booked each doctor's day is, used for reception's load chart. */
export async function loadDoctorDayLoad(
  ctx: StaffContext,
  from: string,
  to: string,
): Promise<DoctorDayLoad[]> {
  if (!ctx.facilityId) return [];
  const { data, error } = await supabase.rpc("facility_doctor_load", {
    _facility_id: ctx.facilityId,
    _from: from,
    _to: to,
  });
  if (error) {
    throw new Error(`Could not load the doctor load chart: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    providerId: row.provider_id,
    name: row.doctor_name,
    department: row.department_name,
    designation: row.designation_name,
    availability: row.availability,
    appointments: row.appointments,
    bookedMinutes: row.booked_minutes,
    firstSlot: row.first_slot,
    lastSlot: row.last_slot,
    completed: row.completed,
  }));
}

/** Every appointment in the facility between two instants. */
export async function loadFacilityDaySchedule(
  ctx: StaffContext,
  from: string,
  to: string,
): Promise<FacilityAppointment[]> {
  if (!ctx.facilityId) return [];
  const { data, error } = await supabase.rpc("facility_day_schedule", {
    _facility_id: ctx.facilityId,
    _from: from,
    _to: to,
  });
  if (error) {
    throw new Error(
      `Could not load the appointment schedule: ${error.message}`,
    );
  }
  return (data ?? []).map((row) => ({
    id: row.appointment_id,
    patientId: row.patient_id,
    patient: row.patient_name,
    number: row.patient_number,
    providerId: row.provider_id,
    doctor: row.doctor_name,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    status: row.status,
    appointmentType: row.appointment_type,
    reason: row.reason,
    location: row.location,
    response: row.doctor_response,
  }));
}

/** Active patient records reception can book. */
export async function loadAppointmentPatients(
  ctx: StaffContext,
): Promise<AppointmentPatient[]> {
  if (!ctx.tenantId) return [];
  const { data, error } = await supabase
    .from("patients")
    .select("id, name, patient_number, date_of_birth, sex")
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "active")
    .order("name", { ascending: true })
    .limit(500);
  if (error) {
    throw new Error(`Could not load patients to book: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    number: row.patient_number,
    dateOfBirth: row.date_of_birth,
    sex: row.sex,
  }));
}

/** Books the visit; the function refuses a time the doctor already has. */
export async function scheduleAppointment(
  ctx: StaffContext,
  input: {
    patientId: string;
    providerId: string;
    scheduledAt: string;
    durationMinutes: number;
    appointmentType: string;
    reason: string;
    location: string;
  },
): Promise<string> {
  if (!ctx.facilityId) {
    throw new Error("Your workspace is missing its facility assignment.");
  }
  const { data, error } = await supabase.rpc("schedule_appointment", {
    _patient_id: input.patientId,
    _provider_id: input.providerId,
    _scheduled_at: input.scheduledAt,
    _reason: input.reason.trim() || null,
    _location: input.location.trim() || null,
    _duration_minutes: input.durationMinutes,
    _appointment_type: input.appointmentType,
  });
  if (error) {
    throw new Error(`Could not schedule the appointment: ${error.message}`);
  }
  return data;
}

/* -------------------------------------------------------------------------- */
/* Service charges and payments                                               */
/* -------------------------------------------------------------------------- */

export type ServiceChargeRow = {
  id: string;
  patientId: string;
  patient: string;
  number: string;
  service: string;
  serviceCode: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  note: string | null;
  status: string;
  recordedBy: string;
  recordedRole: string;
  recordedByUser: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  confirmedAt: string | null;
  createdAt: string;
};

export type InvoiceBalance = {
  invoiceId: string;
  invoiceNumber: string;
  patientId: string;
  patient: string;
  netAmount: number;
  paidAmount: number;
  outstanding: number;
  status: string;
  issuedAt: string | null;
};

/** The staff-only ledger of services recorded against patients. */
export async function loadServiceCharges(
  ctx: StaffContext,
): Promise<ServiceChargeRow[]> {
  if (!ctx.facilityId) return [];
  const { data, error } = await supabase.rpc("facility_service_charges", {
    _facility_id: ctx.facilityId,
  });
  if (error) {
    throw new Error(`Could not load the service ledger: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.charge_id,
    patientId: row.patient_id,
    patient: row.patient_name,
    number: row.patient_number,
    service: row.service_name,
    serviceCode: row.service_code,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price),
    amount: Number(row.amount),
    note: row.note,
    status: row.status,
    recordedBy: row.recorded_by_name,
    recordedRole: row.recorded_by_role,
    recordedByUser: row.recorded_by_user,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    invoiceStatus: row.invoice_status,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
  }));
}

/** Records a billable service performed by the signed-in staff member. */
export async function recordServiceCharge(
  ctx: StaffContext,
  input: {
    patientId: string;
    chargeId: string;
    quantity: number;
    note: string;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc("record_service_charge", {
    _patient_id: input.patientId,
    _charge_id: input.chargeId,
    _quantity: input.quantity,
    _note: input.note.trim() || null,
  });
  if (error || !data) {
    throw new Error(
      `Could not record the service: ${error?.message ?? "unknown error"}`,
    );
  }
  return data;
}

export async function voidServiceCharge(chargeId: string): Promise<void> {
  const { error } = await supabase.rpc("void_service_charge", {
    _charge_id: chargeId,
  });
  if (error) {
    throw new Error(`Could not remove the charge: ${error.message}`);
  }
}

/** Administrators and receptionists sign off an entry once it is settled. */
export async function confirmServiceCharge(
  chargeId: string,
  confirmed: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("confirm_service_charge", {
    _charge_id: chargeId,
    _confirmed: confirmed,
  });
  if (error) {
    throw new Error(`Could not update the entry: ${error.message}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Insurance                                                                  */
/* -------------------------------------------------------------------------- */

export type InsurancePolicyRow = {
  id: string;
  patientId: string;
  patient: string;
  number: string;
  provider: string;
  policyNumber: string;
  plan: string | null;
  coveragePercent: number;
  validFrom: string;
  validUntil: string | null;
  status: string;
  createdAt: string;
};

export type InsuranceClaimRow = {
  id: string;
  claimNumber: string;
  policyId: string;
  patientId: string;
  patient: string;
  number: string;
  provider: string;
  policyNumber: string;
  amount: number;
  approvedAmount: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  invoiceNetAmount: number | null;
  invoicePaidAmount: number | null;
  invoiceOutstanding: number | null;
  status: string;
  note: string | null;
  decisionNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export type InsuranceData = {
  policies: InsurancePolicyRow[];
  claims: InsuranceClaimRow[];
  invoices: InvoiceBalance[];
};

/** Policies and claims for one facility, newest first. */
export async function loadInsuranceData(
  ctx: StaffContext,
): Promise<InsuranceData> {
  const { facilityId } = requireTenantAndFacility(ctx, "insurance workspace");
  const [policyRes, claimRes, invoices] = await Promise.all([
    supabase.rpc("facility_insurance_policies", { _facility_id: facilityId }),
    supabase.rpc("facility_insurance_claims", { _facility_id: facilityId }),
    loadInvoiceBalances(ctx),
  ]);

  if (policyRes.error) {
    throw new Error(
      `Could not load insurance policies: ${policyRes.error.message}`,
    );
  }
  if (claimRes.error) {
    throw new Error(
      `Could not load insurance claims: ${claimRes.error.message}`,
    );
  }

  return {
    policies: (policyRes.data ?? []).map((row) => ({
      id: row.policy_id,
      patientId: row.patient_id,
      patient: row.patient_name,
      number: row.patient_number,
      provider: row.provider_name,
      policyNumber: row.policy_number,
      plan: row.plan_name,
      coveragePercent: Number(row.coverage_percent),
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      status: row.status,
      createdAt: row.created_at,
    })),
    claims: (claimRes.data ?? []).map((row) => ({
      id: row.claim_id,
      claimNumber: row.claim_number,
      policyId: row.policy_id,
      patientId: row.patient_id,
      patient: row.patient_name,
      number: row.patient_number,
      provider: row.provider_name,
      policyNumber: row.policy_number,
      amount: Number(row.amount),
      approvedAmount: Number(row.approved_amount),
      invoiceId: row.invoice_id,
      invoiceNumber: row.invoice_number,
      invoiceStatus: row.invoice_status,
      invoiceNetAmount:
        row.invoice_net_amount === null ? null : Number(row.invoice_net_amount),
      invoicePaidAmount:
        row.invoice_paid_amount === null
          ? null
          : Number(row.invoice_paid_amount),
      invoiceOutstanding:
        row.invoice_outstanding === null
          ? null
          : Number(row.invoice_outstanding),
      status: row.status,
      note: row.note,
      decisionNote: row.decision_note,
      submittedAt: row.submitted_at,
      reviewedAt: row.reviewed_at,
      reviewedBy: row.reviewed_by_name,
    })),
    invoices,
  };
}

/** Registers cover a patient already has with an insurance provider. */
export async function createInsurancePolicy(
  ctx: StaffContext,
  input: {
    patientId: string;
    provider: string;
    policyNumber: string;
    plan: string;
    coveragePercent: number;
    validFrom: string;
    validUntil: string;
  },
): Promise<void> {
  const { tenantId, facilityId } = requireTenantAndFacility(
    ctx,
    "insurance workspace",
  );
  const { error } = await supabase.from("insurance_policies").insert({
    tenant_id: tenantId,
    facility_id: facilityId,
    patient_id: input.patientId,
    provider_name: input.provider.trim(),
    policy_number: input.policyNumber.trim(),
    plan_name: input.plan.trim() || null,
    coverage_percent: input.coveragePercent,
    valid_from: input.validFrom,
    valid_until: input.validUntil || null,
    created_by: ctx.userId,
  });

  if (error) {
    throw new Error(`Could not save the policy: ${error.message}`);
  }
}

export async function cancelInsurancePolicy(policyId: string): Promise<void> {
  const { error } = await supabase
    .from("insurance_policies")
    .update({ status: "cancelled" })
    .eq("id", policyId);

  if (error) {
    throw new Error(`Could not cancel the policy: ${error.message}`);
  }
}

/** Claims are raised against an active policy, with a server-made number. */
export async function submitInsuranceClaim(
  ctx: StaffContext,
  input: { policyId: string; invoiceId: string; note: string },
): Promise<void> {
  const { error } = await supabase.rpc("submit_insurance_claim", {
    _policy_id: input.policyId,
    _invoice_id: input.invoiceId,
    _note: input.note.trim() || null,
  });

  if (error) {
    throw new Error(`Could not raise the claim: ${error.message}`);
  }
}

export async function reviewInsuranceClaim(
  claimId: string,
  status: "approved" | "rejected" | "paid",
  note: string,
): Promise<void> {
  const { error } = await supabase.rpc("review_insurance_claim", {
    _claim_id: claimId,
    _status: status,
    _note: note.trim() || null,
  });

  if (error) {
    throw new Error(`Could not review the claim: ${error.message}`);
  }
}

/** Outstanding balances for the facility's issued invoices. */
export async function loadInvoiceBalances(
  ctx: StaffContext,
): Promise<InvoiceBalance[]> {
  if (!ctx.facilityId) return [];
  const { data, error } = await supabase.rpc("facility_invoice_balances", {
    _facility_id: ctx.facilityId,
  });
  if (error) {
    throw new Error(`Could not load invoice balances: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoice_number,
    patientId: row.patient_id,
    patient: row.patient_name,
    netAmount: Number(row.net_amount),
    paidAmount: Number(row.paid_amount),
    outstanding: Number(row.outstanding),
    status: row.status,
    issuedAt: row.issued_at,
  }));
}

/** Turns a patient's recorded charges into one invoice issued to the patient. */
export async function createInvoiceFromCharges(
  ctx: StaffContext,
  input: {
    patientId: string;
    chargeIds: string[];
    discountAmount: number;
    taxAmount: number;
  },
): Promise<{ id: string; invoiceNumber: string; netAmount: number }> {
  const { data, error } = await supabase.rpc("create_invoice_from_charges", {
    _patient_id: input.patientId,
    _charge_ids: input.chargeIds,
    _discount_amount: input.discountAmount,
    _tax_amount: input.taxAmount,
  });
  const created = data?.[0];
  if (error || !created) {
    throw new Error(
      `Could not issue the invoice: ${error?.message ?? "unknown error"}`,
    );
  }
  return {
    id: created.id,
    invoiceNumber: created.invoice_number,
    netAmount: Number(created.net_amount),
  };
}

/** Records a payment against an issued invoice and updates its status. */
export async function recordInvoicePayment(
  ctx: StaffContext,
  input: { invoiceId: string; amount: number; method: string },
): Promise<{ status: string; paidAmount: number; outstanding: number }> {
  const { data, error } = await supabase.rpc("record_invoice_payment", {
    _invoice_id: input.invoiceId,
    _amount: input.amount,
    _method: input.method,
  });
  const result = data?.[0];
  if (error || !result) {
    throw new Error(
      `Could not record the payment: ${error?.message ?? "unknown error"}`,
    );
  }
  return {
    status: result.status,
    paidAmount: Number(result.paid_amount),
    outstanding: Number(result.outstanding),
  };
}

export type PharmacyMedicine = {
  id: string;
  code: string;
  name: string;
  strength: string;
  dosageForm: string;
};

/** Active medicines the pharmacy can hand over and bill. */
export async function loadPharmacyMedicines(
  ctx: StaffContext,
): Promise<PharmacyMedicine[]> {
  if (!ctx.tenantId) return [];
  const { data, error } = await supabase
    .from("medicine_catalog")
    .select("id, medicine_code, name, strength, dosage_form")
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "active")
    .order("name", { ascending: true })
    .limit(500);
  if (error) {
    throw new Error(`Could not load the medicine catalog: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.medicine_code,
    name: row.name,
    strength: row.strength,
    dosageForm: row.dosage_form,
  }));
}

/** Pharmacist adds the medicines a patient is buying to the shared bill. */
export async function recordMedicineCharge(
  ctx: StaffContext,
  input: {
    patientId: string;
    medicineId: string;
    quantity: number;
    unitPrice: number;
    note: string;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc("record_medicine_charge", {
    _patient_id: input.patientId,
    _medicine_id: input.medicineId,
    _quantity: input.quantity,
    _unit_price: input.unitPrice,
    _note: input.note.trim() || null,
  });
  if (error || !data) {
    throw new Error(
      `Could not add the medicine to the bill: ${error?.message ?? "unknown error"}`,
    );
  }
  return data;
}

export type PrescriptionDraftLine = {
  medicineId: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: number;
};

export type PrescriptionLine = {
  id: string;
  medicine: string;
  patient: string;
  patientNumber: string | null;
  prescriber: string;
  prescriberId: string | null;
  prescriberDepartment: string | null;
  prescriberSpecialization: string | null;
  prescriberCode: string | null;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  remaining: number;
  prescribed: number;
  dispensed: number;
  status: string;
  prescribedAt: string;
  stockAvailable: number;
  stockLinked: boolean;
  lastDispensedQuantity: number | null;
  lastDispensedAt: string | null;
};

export async function loadPrescriptionPatientOptions(
  ctx: StaffContext,
): Promise<InvoicePatientOption[]> {
  const { tenantId } = requireTenantAndFacility(ctx, "prescription workspace");
  const { data, error } = await supabase
    .from("patients")
    .select("id, name, patient_number")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("name", { ascending: true })
    .limit(500);

  if (error) {
    throw new Error(`Could not load patients: ${error.message}`);
  }
  return (data ?? []).map((patient) => ({
    id: patient.id,
    name: patient.name,
    number: patient.patient_number,
  }));
}

/** A doctor sends a prescription; the pharmacy sees every line immediately. */
export async function writePrescription(
  patientId: string,
  lines: PrescriptionDraftLine[],
): Promise<string> {
  const { data, error } = await supabase.rpc("create_prescription", {
    _patient_id: patientId,
    _items: lines.map((line) => ({
      medicine_id: line.medicineId,
      dose: line.dose,
      route: line.route,
      frequency: line.frequency,
      duration: line.duration,
      quantity: line.quantity,
    })),
  });
  if (error || !data) {
    throw new Error(
      `Could not send the prescription: ${error?.message ?? "unknown error"}`,
    );
  }
  return data;
}

/** Every prescription line in the facility, newest prescription first. */
export async function loadFacilityPrescriptionLines(
  ctx: StaffContext,
): Promise<PrescriptionLine[]> {
  const { facilityId } = requireTenantAndFacility(ctx, "prescription queue");
  const { data, error } = await supabase.rpc("facility_prescription_lines", {
    _facility_id: facilityId,
  });
  if (error) {
    throw new Error(`Could not load prescriptions: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.item_id,
    medicine: row.medicine_name,
    patient: row.patient_name,
    patientNumber: row.patient_number,
    prescriber: row.prescriber_name,
    prescriberId: row.prescriber_id,
    prescriberDepartment: row.prescriber_department,
    prescriberSpecialization: row.prescriber_specialization,
    prescriberCode: row.prescriber_code,
    dose: row.dose,
    route: row.route,
    frequency: row.frequency,
    duration: row.duration,
    remaining: Number(row.remaining),
    prescribed: Number(row.quantity_prescribed),
    dispensed: Number(row.quantity_dispensed),
    status: row.prescription_status,
    prescribedAt: row.prescribed_at,
    stockAvailable: Number(row.stock_available),
    stockLinked: row.stock_linked,
    lastDispensedQuantity:
      row.last_dispensed_quantity === null
        ? null
        : Number(row.last_dispensed_quantity),
    lastDispensedAt: row.last_dispensed_at,
  }));
}

export type DoctorPrescriptionHistoryItem = {
  id: string;
  medicine: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  prescribed: number;
  dispensed: number;
  remaining: number;
  status: string;
};

export type DoctorPrescriptionHistoryRow = {
  id: string;
  patient: string;
  patientNumber: string | null;
  prescribedAt: string;
  status: string;
  prescriberName: string;
  prescriberDepartment: string | null;
  prescriberSpecialization: string | null;
  prescriberCode: string | null;
  items: DoctorPrescriptionHistoryItem[];
};

/**
 * The prescriptions this doctor wrote, newest first. Prescriptions are scoped
 * to the current facility through their encounter, and each line carries its
 * own dispensing progress so the doctor can follow the pharmacy hand-off.
 */
export async function loadDoctorPrescriptionHistory(
  ctx: StaffContext,
): Promise<DoctorPrescriptionHistoryRow[]> {
  const { tenantId, facilityId } = requireTenantAndFacility(
    ctx,
    "prescription history",
  );
  const employeeId = ctx.employeeId;
  if (!employeeId) return [];

  const { data, error } = await supabase
    .from("prescriptions")
    .select("id, encounter_id, status, created_at")
    .eq("prescriber_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(`Could not load your prescriptions: ${error.message}`);
  }

  const prescriptions = data ?? [];
  if (!prescriptions.length) return [];

  const encounterRes = await supabase
    .from("encounters")
    .select("id, patient_id")
    .eq("tenant_id", tenantId)
    .eq("facility_id", facilityId)
    .in("id", [...new Set(prescriptions.map((row) => row.encounter_id))]);
  if (encounterRes.error) {
    throw new Error(
      `Could not load prescription encounters: ${encounterRes.error.message}`,
    );
  }

  const encounterById = new Map(
    (encounterRes.data ?? []).map((encounter) => [encounter.id, encounter]),
  );
  const visible = prescriptions.filter((prescription) =>
    encounterById.has(prescription.encounter_id),
  );
  if (!visible.length) return [];

  const [patients, itemRes] = await Promise.all([
    patientLookup(
      visible.map(
        (prescription) =>
          encounterById.get(prescription.encounter_id)?.patient_id,
      ),
      tenantId,
    ),
    supabase
      .from("prescription_items")
      .select(
        "id, prescription_id, medicine_id, dose, route, frequency, duration, quantity_prescribed, quantity_dispensed",
      )
      .in(
        "prescription_id",
        visible.map((prescription) => prescription.id),
      )
      .order("created_at", { ascending: true }),
  ]);
  if (itemRes.error) {
    throw new Error(
      `Could not load your prescription lines: ${itemRes.error.message}`,
    );
  }

  const items = itemRes.data ?? [];
  const medicineRes = items.length
    ? await supabase
        .from("medicine_catalog")
        .select("id, name, strength")
        .eq("tenant_id", tenantId)
        .in("id", [...new Set(items.map((item) => item.medicine_id))])
    : { data: [], error: null };
  if (medicineRes.error) {
    throw new Error(
      `Could not load your prescription medicines: ${medicineRes.error.message}`,
    );
  }

  const medicineNames = new Map(
    (medicineRes.data ?? []).map((medicine) => [
      medicine.id,
      `${medicine.name} ${medicine.strength}`,
    ]),
  );
  const itemsByPrescription = new Map<
    string,
    DoctorPrescriptionHistoryItem[]
  >();
  for (const item of items) {
    const prescribed = Number(item.quantity_prescribed);
    const dispensed = Number(item.quantity_dispensed);
    const remaining = Math.max(prescribed - dispensed, 0);
    const lines = itemsByPrescription.get(item.prescription_id) ?? [];
    lines.push({
      id: item.id,
      medicine: medicineNames.get(item.medicine_id) ?? "Medicine",
      dose: item.dose,
      route: item.route,
      frequency: item.frequency,
      duration: item.duration,
      prescribed,
      dispensed,
      remaining,
      status:
        remaining <= 0 ? "dispensed" : dispensed > 0 ? "partial" : "pending",
    });
    itemsByPrescription.set(item.prescription_id, lines);
  }

  return visible.map((prescription) => {
    const encounter = encounterById.get(prescription.encounter_id);
    const patient = encounter ? patients.get(encounter.patient_id) : undefined;
    return {
      id: prescription.id,
      patient: patient?.name ?? "Patient",
      patientNumber: patient?.number ?? null,
      prescribedAt: prescription.created_at,
      status: prescription.status,
      prescriberName: ctx.fullName,
      prescriberDepartment: ctx.departmentName,
      prescriberSpecialization: ctx.specialization,
      prescriberCode: ctx.employeeCode,
      items: itemsByPrescription.get(prescription.id) ?? [],
    };
  });
}

/** Records a pharmacy hand-off and updates the prescription line's status. */
export async function dispensePrescriptionItem(
  itemId: string,
  quantity: number,
): Promise<void> {
  const { error } = await supabase.rpc("dispense_prescription_item", {
    _item_id: itemId,
    _quantity: quantity,
  });
  if (error) {
    throw new Error(`Could not record the dispense: ${error.message}`);
  }
}

export type HandoffNote = {
  id: string;
  patient: string;
  author: string;
  content: string;
  at: string;
  status: string;
  type: string;
};

/** Handoff notes doctors wrote for patients in this facility. */
export async function loadFacilityHandoffNotes(
  ctx: StaffContext,
): Promise<HandoffNote[]> {
  const { facilityId } = requireTenantAndFacility(ctx, "handoff notes");
  const { data, error } = await supabase.rpc("facility_handoff_notes", {
    _facility_id: facilityId,
  });
  if (error) {
    throw new Error(`Could not load handoff notes: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.note_id,
    patient: row.patient_name,
    author: row.author_name,
    content: row.content,
    at: row.created_at,
    status: row.status,
    type: humanise(row.note_type),
  }));
}

/** A doctor signs a handoff note; nurses see it immediately on their dashboard. */
export async function writeHandoffNote(
  patientId: string,
  content: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("write_handoff_note", {
    _patient_id: patientId,
    _content: content,
  });
  if (error || !data) {
    throw new Error(
      `Could not send the handoff note: ${error?.message ?? "unknown error"}`,
    );
  }
  return data;
}

export type DoctorData = {
  appointmentsToday: number;
  openEncounters: number;
  resultsToReview: number;
  draftNotes: number;
  labAssignments: number;
  schedule: {
    id: string;
    time: string;
    patient: string;
    number: string | null;
    status: string;
    appointmentType: string;
    reason: string | null;
    location: string | null;
  }[];
  patients: {
    id: string;
    patientId: string;
    name: string;
    number: string | null;
    detail: string;
    status: string;
  }[];
  critical: {
    id: string;
    patient: string;
    test: string;
    value: string;
    unit: string;
    at: string | null;
    acknowledged: boolean;
  }[];
  notes: NoteRow[];
  notifications: AdminNotification[];
};

export async function loadDoctorData(ctx: StaffContext): Promise<DoctorData> {
  const today = dayBounds();
  const employeeId = ctx.employeeId;

  const [
    appointmentsToday,
    openEncounters,
    resultsToReview,
    draftNotes,
    labAssignments,
  ] = await Promise.all([
    employeeId
      ? counted(
          "your appointments",
          supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", ctx.tenantId ?? "")
            .eq("facility_id", ctx.facilityId ?? "")
            .eq("provider_id", employeeId)
            .gte("scheduled_at", today.start)
            .lt("scheduled_at", today.end)
            .in("status", ["scheduled", "checked_in"]),
        )
      : 0,
    employeeId
      ? counted(
          "your open encounters",
          supabase
            .from("encounters")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", ctx.tenantId ?? "")
            .eq("facility_id", ctx.facilityId ?? "")
            .eq("provider_id", employeeId)
            .in("status", ["open", "checked"]),
        )
      : 0,
    counted(
      "lab results",
      supabase
        .from("lab_results")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId ?? "")
        .eq("status", "preliminary"),
    ),
    employeeId
      ? counted(
          "your draft notes",
          supabase
            .from("clinical_notes")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", ctx.tenantId ?? "")
            .eq("author_id", employeeId)
            .eq("status", "draft"),
        )
      : 0,
    employeeId
      ? counted(
          "your lab assignments",
          supabase
            .from("lab_orders")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", ctx.tenantId ?? "")
            .eq("ordered_by", employeeId)
            .in("status", ["placed", "in_progress"]),
        )
      : 0,
  ]);

  const [appointmentRes, encounterRes, noteRes, notificationRes, critical] =
    await Promise.all([
      employeeId
        ? supabase
            .from("appointments")
            .select(
              "id, patient_id, scheduled_at, status, appointment_type, reason, location, duration_minutes",
            )
            .eq("tenant_id", ctx.tenantId ?? "")
            .eq("facility_id", ctx.facilityId ?? "")
            .eq("provider_id", employeeId)
            .gte("scheduled_at", today.start)
            .lt("scheduled_at", today.end)
            .order("scheduled_at", { ascending: true })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
      employeeId
        ? supabase
            .from("encounters")
            .select("id, patient_id, encounter_type, started_at, status")
            .eq("tenant_id", ctx.tenantId ?? "")
            .eq("facility_id", ctx.facilityId ?? "")
            .eq("provider_id", employeeId)
            .order("started_at", { ascending: false })
            .limit(25)
        : Promise.resolve({ data: [], error: null }),
      employeeId
        ? supabase
            .from("clinical_notes")
            .select("id, encounter_id, note_type, status, created_at")
            .eq("tenant_id", ctx.tenantId ?? "")
            .eq("author_id", employeeId)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [], error: null }),
      employeeId
        ? supabase
            .from("appointments")
            .select(
              "id, patient_id, scheduled_at, reason, location, appointment_type",
            )
            .eq("tenant_id", ctx.tenantId ?? "")
            .eq("provider_id", employeeId)
            .eq("doctor_response", "pending")
            .in("status", ["scheduled", "checked_in"])
            .gte("scheduled_at", new Date().toISOString())
            .order("scheduled_at", { ascending: true })
            .limit(5)
        : Promise.resolve({ data: [], error: null }),
      loadCriticalResults(ctx, 25),
    ]);

  throwQueryErrors(
    "your clinical workspace",
    appointmentRes,
    encounterRes,
    noteRes,
    notificationRes,
  );
  const appointments = appointmentRes.data ?? [];
  const pendingSchedules = notificationRes.data ?? [];
  const encounters = encounterRes.data ?? [];
  const notes = noteRes.data ?? [];

  const noteEncounterRes = notes.length
    ? await supabase
        .from("encounters")
        .select("id, patient_id")
        .eq("tenant_id", ctx.tenantId ?? "")
        .in("id", [...new Set(notes.map((n) => n.encounter_id))])
    : { data: [] as { id: string; patient_id: string }[], error: null };
  throwQueryErrors("patients from your recent notes", noteEncounterRes);
  const noteEncounters = noteEncounterRes.data ?? [];

  const patients = await patientLookup(
    [
      ...appointments.map((a) => a.patient_id),
      ...pendingSchedules.map((a) => a.patient_id),
      ...encounters.map((e) => e.patient_id),
      ...noteEncounters.map((e) => e.patient_id),
    ],
    ctx.tenantId,
  );

  // The encounter query is newest first, so the first row seen for a patient
  // is their latest encounter. Keep one row per patient for the dropdown list.
  const recentPatients = new Map<string, DoctorData["patients"][number]>();
  for (const row of encounters) {
    if (recentPatients.has(row.patient_id)) continue;
    recentPatients.set(row.patient_id, {
      id: row.id,
      patientId: row.patient_id,
      name: patients.get(row.patient_id)?.name ?? "Patient",
      number: patients.get(row.patient_id)?.number ?? null,
      detail: humanise(row.encounter_type),
      status: row.status,
    });
  }

  return {
    appointmentsToday,
    openEncounters,
    resultsToReview,
    draftNotes,
    labAssignments,
    schedule: appointments.map((row) => ({
      id: row.id,
      time: formatTime(row.scheduled_at),
      patient: patients.get(row.patient_id)?.name ?? "Patient",
      number: patients.get(row.patient_id)?.number ?? null,
      status: row.status,
      appointmentType: row.appointment_type,
      reason: row.reason,
      location: row.location,
    })),
    patients: [...recentPatients.values()],
    critical,
    notes: notes.map((row) => {
      const enc = noteEncounters.find((e) => e.id === row.encounter_id);
      return {
        id: row.id,
        type: humanise(row.note_type),
        patient: (enc && patients.get(enc.patient_id)?.name) ?? "Patient",
        at: row.created_at,
        status: row.status,
      };
    }),
    notifications: pendingSchedules.map<AdminNotification>((row) => {
      const label =
        row.appointment_type === "surgery"
          ? "Surgery"
          : row.appointment_type === "procedure"
            ? "Procedure"
            : "Appointment";
      return {
        id: `appointment-${row.id}`,
        title: `${label} scheduled · ${patients.get(row.patient_id)?.name ?? "Patient"}`,
        description: `${new Date(row.scheduled_at).toLocaleString()}${row.reason ? ` · ${row.reason}` : ""}${row.location ? ` · ${row.location}` : ""}`,
        href: "/dashboard/today-schedule",
        tone:
          row.appointment_type === "surgery"
            ? "danger"
            : row.appointment_type === "procedure"
              ? "warning"
              : "info",
      };
    }),
  };
}

export type DoctorEncounterStatus = "open" | "checked" | "closed";

/**
 * A doctor updates the status of an encounter they own. The security-definer
 * RPC keeps the write to their own encounter in their tenant and facility.
 */
export async function updateMyPatientEncounterStatus(
  encounterId: string,
  status: DoctorEncounterStatus,
): Promise<void> {
  const { data, error } = await supabase.rpc("update_my_encounter_status", {
    _encounter_id: encounterId,
    _status: status,
  });
  if (error) {
    throw new Error(`Could not update the patient status: ${error.message}`);
  }
  if (!data) {
    throw new Error(
      "Could not update the patient status. Check your access and try again.",
    );
  }
}

async function loadCriticalResults(ctx: StaffContext, limit: number) {
  const { data: results, error } = await supabase
    .from("lab_results")
    .select(
      "id, lab_order_item_id, result_value, unit, critical_acknowledged_at, created_at",
    )
    .eq("tenant_id", ctx.tenantId ?? "")
    .eq("critical_flag", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`Could not load critical lab results: ${error.message}`);
  }

  const rows = results ?? [];
  if (!rows.length) return [];

  const itemRes = await supabase
    .from("lab_order_items")
    .select("id, lab_order_id, test_id")
    .in("id", [...new Set(rows.map((r) => r.lab_order_item_id))]);
  if (itemRes.error) {
    throw new Error(
      `Could not load lab result details: ${itemRes.error.message}`,
    );
  }
  const items = itemRes.data ?? [];

  const testIds = [...new Set(items.map((i) => i.test_id))];
  const orderIds = [...new Set(items.map((i) => i.lab_order_id))];

  const [testRes, orderRes] = await Promise.all([
    testIds.length
      ? supabase
          .from("lab_test_catalog")
          .select("id, name")
          .eq("tenant_id", ctx.tenantId ?? "")
          .in("id", testIds)
      : Promise.resolve({
          data: [] as { id: string; name: string }[],
          error: null,
        }),
    orderIds.length
      ? supabase
          .from("lab_orders")
          .select("id, patient_id")
          .eq("tenant_id", ctx.tenantId ?? "")
          .in("id", orderIds)
      : Promise.resolve({
          data: [] as { id: string; patient_id: string }[],
          error: null,
        }),
  ]);
  throwQueryErrors("lab result details", testRes, orderRes);

  const orders = orderRes.data ?? [];
  const patients = await patientLookup(
    orders.map((o) => o.patient_id),
    ctx.tenantId,
  );

  return rows.map((row) => {
    const item = items.find((i) => i.id === row.lab_order_item_id);
    const order = orders.find((o) => o.id === item?.lab_order_id);
    return {
      id: row.id,
      patient: (order && patients.get(order.patient_id)?.name) ?? "Patient",
      test:
        (testRes.data ?? []).find((t) => t.id === item?.test_id)?.name ??
        "Lab result",
      value: row.result_value,
      unit: row.unit,
      at: row.created_at,
      acknowledged: Boolean(row.critical_acknowledged_at),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Nurse                                                                      */
/* -------------------------------------------------------------------------- */

export type NurseData = {
  activeAdmissions: number;
  samplesPending: number;
  dispensesToday: number;
  bedsOccupied: number;
  bedsTotal: number;
  queue: FeedItem[];
  wards: WardRow[];
  notes: HandoffNote[];
};

export async function loadNurseData(ctx: StaffContext): Promise<NurseData> {
  const today = dayBounds();

  const [activeAdmissions, samplesPending, dispensesToday] = await Promise.all([
    counted(
      "active admissions",
      supabase
        .from("admissions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId ?? "")
        .eq("facility_id", ctx.facilityId ?? "")
        .eq("status", "active"),
    ),
    counted(
      "pending samples",
      supabase
        .from("lab_order_items")
        .select("id", { count: "exact", head: true })
        .eq("status", "ordered"),
    ),
    counted(
      "today's dispenses",
      supabase
        .from("prescription_dispenses")
        .select("id", { count: "exact", head: true })
        .gte("dispensed_at", today.start)
        .lt("dispensed_at", today.end),
    ),
  ]);

  const [bedRes, assignmentRes, labItemRes] = await Promise.all([
    ctx.facilityId
      ? supabase
          .from("beds")
          .select("id, ward")
          .eq("tenant_id", ctx.tenantId ?? "")
          .eq("facility_id", ctx.facilityId)
          .eq("status", "active")
      : Promise.resolve({
          data: [] as { id: string; ward: string }[],
          error: null,
        }),
    supabase
      .from("bed_assignments")
      .select("id, bed_id")
      .eq("status", "active"),
    supabase
      .from("lab_order_items")
      .select("id, lab_order_id, test_id, priority, status, created_at")
      .eq("status", "ordered")
      .order("created_at", { ascending: true })
      .limit(25),
  ]);
  throwQueryErrors("your nursing workspace", bedRes, assignmentRes, labItemRes);

  const wards = new Map<string, { total: number; occupied: number }>();
  const wardByBed = new Map<string, string>();
  for (const bed of bedRes.data ?? []) {
    wardByBed.set(bed.id, bed.ward);
    const current = wards.get(bed.ward) ?? { total: 0, occupied: 0 };
    current.total += 1;
    wards.set(bed.ward, current);
  }
  let bedsOccupied = 0;
  for (const row of assignmentRes.data ?? []) {
    const ward = wardByBed.get(row.bed_id);
    if (!ward) continue;
    bedsOccupied += 1;
    wards.get(ward)!.occupied += 1;
  }

  const items = labItemRes.data ?? [];
  const handoffNotes = await loadFacilityHandoffNotes(ctx);

  const [orderRes, testRes] = await Promise.all([
    items.length
      ? supabase
          .from("lab_orders")
          .select("id, patient_id")
          .eq("tenant_id", ctx.tenantId ?? "")
          .in("id", [...new Set(items.map((i) => i.lab_order_id))])
      : Promise.resolve({
          data: [] as { id: string; patient_id: string }[],
          error: null,
        }),
    items.length
      ? supabase
          .from("lab_test_catalog")
          .select("id, name")
          .eq("tenant_id", ctx.tenantId ?? "")
          .in("id", [...new Set(items.map((i) => i.test_id))])
      : Promise.resolve({
          data: [] as { id: string; name: string }[],
          error: null,
        }),
  ]);
  throwQueryErrors("nursing queue details", orderRes, testRes);

  const orders = orderRes.data ?? [];
  const patients = await patientLookup(
    orders.map((o) => o.patient_id),
    ctx.tenantId,
  );

  return {
    activeAdmissions,
    samplesPending,
    dispensesToday,
    bedsOccupied,
    bedsTotal: bedRes.data?.length ?? 0,
    queue: items.map((item) => {
      const order = orders.find((o) => o.id === item.lab_order_id);
      return {
        id: item.id,
        title:
          (testRes.data ?? []).find((t) => t.id === item.test_id)?.name ??
          "Lab test",
        subtitle: (order && patients.get(order.patient_id)?.name) ?? "Patient",
        meta: `${humanise(item.priority)} · ordered ${formatDate(item.created_at)}`,
        status: item.priority === "stat" ? "urgent" : item.status,
      };
    }),
    wards: [...wards.entries()]
      .map(([ward, stats]) => ({ ward, ...stats }))
      .sort((a, b) => b.total - a.total),
    notes: handoffNotes,
  };
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                      */
/* -------------------------------------------------------------------------- */

export type ApprovalRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  requested_role: string;
  submitted_at: string;
};

export type HospitalAdminRequestRow = {
  id: string;
  hospital_name: string;
  full_name: string;
  email: string;
  phone: string;
  submitted_at: string;
};

export type PlatformHospitalRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  facilities: {
    id: string;
    name: string;
    code: string;
    status: string;
  }[];
};

export type PlatformStaffRecord = {
  id: string;
  employeeCode: string;
  employmentStatus: string;
  email: string | null;
  hospitalName: string;
  departmentId: string | null;
  designationId: string | null;
  roles: string[];
};

export async function loadHospitalAdminRequests(): Promise<
  HospitalAdminRequestRow[]
> {
  const { data, error } = await supabase
    .from("hospital_admin_registration_requests")
    .select("id, hospital_name, full_name, email, phone, submitted_at")
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });

  if (error) {
    throw new Error(
      `Could not load hospital administrator requests: ${error.message}`,
    );
  }
  return data ?? [];
}

export async function loadPlatformHospitalRecords(): Promise<
  PlatformHospitalRecord[]
> {
  const [tenantRes, facilityRes] = await Promise.all([
    supabase
      .from("tenants")
      .select("id, name, slug, status")
      .order("name", { ascending: true }),
    supabase
      .from("facilities")
      .select("id, tenant_id, name, facility_code, status")
      .order("name", { ascending: true }),
  ]);
  throwQueryErrors("hospital records", tenantRes, facilityRes);

  const facilitiesByTenant = new Map<
    string,
    PlatformHospitalRecord["facilities"]
  >();
  for (const facility of facilityRes.data ?? []) {
    const facilities = facilitiesByTenant.get(facility.tenant_id) ?? [];
    facilities.push({
      id: facility.id,
      name: facility.name,
      code: facility.facility_code,
      status: facility.status,
    });
    facilitiesByTenant.set(facility.tenant_id, facilities);
  }

  return (tenantRes.data ?? []).map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    facilities: facilitiesByTenant.get(tenant.id) ?? [],
  }));
}

export async function loadPlatformStaffRecords(): Promise<
  PlatformStaffRecord[]
> {
  const [employeeRes, tenantRes, userRes, roleRes, assignmentRes] =
    await Promise.all([
      supabase
        .from("employees")
        .select(
          "id, tenant_id, employee_code, employment_status, user_id, department_id, designation_id",
        )
        .order("employee_code", { ascending: true }),
      supabase.from("tenants").select("id, name"),
      supabase.from("users").select("id, email"),
      supabase.from("roles").select("id, name"),
      supabase
        .from("user_role_assignments")
        .select("user_id, role_id, tenant_id, valid_from, valid_until"),
    ]);
  throwQueryErrors(
    "staff records",
    employeeRes,
    tenantRes,
    userRes,
    roleRes,
    assignmentRes,
  );

  const tenantNames = new Map(
    (tenantRes.data ?? []).map((tenant) => [tenant.id, tenant.name]),
  );
  const emails = new Map(
    (userRes.data ?? []).map((user) => [user.id, user.email]),
  );
  const roleNames = new Map(
    (roleRes.data ?? []).map((role) => [role.id, role.name]),
  );
  const rolesByEmployee = new Map<string, Set<string>>();
  const now = new Date();
  for (const assignment of assignmentRes.data ?? []) {
    const role = roleNames.get(assignment.role_id);
    if (
      !role ||
      new Date(assignment.valid_from) > now ||
      (assignment.valid_until !== null &&
        new Date(assignment.valid_until) <= now)
    ) {
      continue;
    }
    const key = `${assignment.tenant_id ?? ""}:${assignment.user_id}`;
    const roles = rolesByEmployee.get(key) ?? new Set<string>();
    roles.add(role);
    rolesByEmployee.set(key, roles);
  }

  return (employeeRes.data ?? []).map((employee) => {
    const assignedRoles = employee.user_id
      ? rolesByEmployee.get(`${employee.tenant_id}:${employee.user_id}`)
      : undefined;
    return {
      id: employee.id,
      employeeCode: employee.employee_code,
      employmentStatus: employee.employment_status,
      email: employee.user_id ? (emails.get(employee.user_id) ?? null) : null,
      hospitalName: tenantNames.get(employee.tenant_id) ?? "Hospital",
      departmentId: employee.department_id,
      designationId: employee.designation_id,
      roles: [...(assignedRoles ?? [])].sort(),
    };
  });
}

export type PatientFlowRow = {
  encounterId: string;
  patient: string;
  number: string | null;
  encounterType: string;
  startedAt: string;
  encounterStatus: string;
  admissionId: string | null;
  admissionStatus: string | null;
  admittedAt: string | null;
  dischargedAt: string | null;
};

export type DepartmentStaffRow = {
  employeeId: string;
  employeeCode: string;
  name: string | null;
  email: string | null;
  departmentId: string | null;
  departmentName: string;
  designationId: string | null;
  designationName: string | null;
  employmentStatus: string;
  availability: string;
  roles: string[];
};

export type WardPatientRow = {
  assignmentId: string;
  admissionId: string;
  patient: string;
  number: string | null;
  ward: string;
  bed: string;
  bedId: string;
  nurseId: string | null;
  providerId: string | null;
  nurse: string | null;
  doctor: string | null;
  admittedAt: string;
  startAt: string;
  admissionStatus: string;
};

export type WardStaffOption = {
  id: string;
  name: string;
  role: "doctor" | "nurse";
};

export type InventoryLocationOption = { id: string; name: string };

export async function loadInventoryLocations(
  tenantId: string,
): Promise<InventoryLocationOption[]> {
  const { data, error } = await supabase
    .from("inventory_locations")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("name", { ascending: true });
  if (error) {
    throw new Error(`Could not load stock locations: ${error.message}`);
  }
  return data ?? [];
}

export type MedicineStockEntry = {
  medicineId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  category: string;
  conversionFactor: number;
  locationId: string | null;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
};

/**
 * Records a stock receipt for a catalog medicine: the inventory item, the
 * medicine-to-item link, the batch, the on-hand balance and the movement
 * ledger entry are all created or updated together.
 */
export async function recordMedicineStock(
  tenantId: string,
  facilityId: string,
  entry: MedicineStockEntry,
): Promise<void> {
  let locationId = entry.locationId;
  if (!locationId) {
    const { data: existing, error } = await supabase
      .from("inventory_locations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("facility_id", facilityId)
      .eq("status", "active")
      .order("name", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`Could not load stock locations: ${error.message}`);
    }
    if (existing?.id) {
      locationId = existing.id;
    } else {
      const { data: created, error: createError } = await supabase
        .from("inventory_locations")
        .insert({
          tenant_id: tenantId,
          facility_id: facilityId,
          name: "Pharmacy",
          location_type: "pharmacy",
          status: "active",
        })
        .select("id")
        .single();
      if (createError || !created) {
        throw new Error(
          `Could not create a pharmacy location: ${createError?.message ?? "unknown error"}`,
        );
      }
      locationId = created.id;
    }
  }

  const { data: item, error: itemError } = await supabase
    .from("inventory_items")
    .upsert(
      {
        tenant_id: tenantId,
        item_code: entry.itemCode,
        name: entry.itemName,
        category: entry.category,
        unit_of_measure: entry.unit,
        status: "active",
      },
      { onConflict: "tenant_id,item_code" },
    )
    .select("id")
    .single();
  if (itemError || !item) {
    throw new Error(
      `Could not save the inventory item: ${itemError?.message ?? "unknown error"}`,
    );
  }

  const { error: mappingError } = await supabase.rpc(
    "manage_medicine_inventory_mapping",
    {
      _tenant_id: tenantId,
      _medicine_id: entry.medicineId,
      _item_id: item.id,
      _conversion_factor: entry.conversionFactor,
      _operation: "upsert",
    },
  );
  if (mappingError) {
    throw new Error(
      `Could not link the medicine to its inventory item: ${mappingError.message}`,
    );
  }

  const { data: existingBatch, error: batchLookupError } = await supabase
    .from("stock_batches")
    .select("id, received_quantity")
    .eq("facility_id", facilityId)
    .eq("item_id", item.id)
    .eq("batch_number", entry.batchNumber)
    .maybeSingle();
  if (batchLookupError) {
    throw new Error(
      `Could not check the stock batch: ${batchLookupError.message}`,
    );
  }

  let batchId = existingBatch?.id ?? null;
  if (batchId) {
    const { error } = await supabase
      .from("stock_batches")
      .update({
        received_quantity:
          Number(existingBatch?.received_quantity ?? 0) + entry.quantity,
        expiry_date: entry.expiryDate,
      })
      .eq("id", batchId);
    if (error) {
      throw new Error(`Could not update the stock batch: ${error.message}`);
    }
  } else {
    const { data: createdBatch, error } = await supabase
      .from("stock_batches")
      .insert({
        tenant_id: tenantId,
        facility_id: facilityId,
        item_id: item.id,
        batch_number: entry.batchNumber,
        expiry_date: entry.expiryDate,
        received_quantity: entry.quantity,
      })
      .select("id")
      .single();
    if (error || !createdBatch) {
      throw new Error(
        `Could not create the stock batch: ${error?.message ?? "unknown error"}`,
      );
    }
    batchId = createdBatch.id;
  }

  const { data: balance, error: balanceLookupError } = await supabase
    .from("inventory_balances")
    .select("id, quantity_on_hand")
    .eq("item_id", item.id)
    .eq("location_id", locationId)
    .eq("batch_id", batchId)
    .maybeSingle();
  if (balanceLookupError) {
    throw new Error(
      `Could not check stock balances: ${balanceLookupError.message}`,
    );
  }

  if (balance) {
    const { error } = await supabase
      .from("inventory_balances")
      .update({
        quantity_on_hand: Number(balance.quantity_on_hand) + entry.quantity,
      })
      .eq("id", balance.id);
    if (error) {
      throw new Error(`Could not update stock on hand: ${error.message}`);
    }
  } else {
    const { error } = await supabase.from("inventory_balances").insert({
      item_id: item.id,
      location_id: locationId,
      batch_id: batchId,
      quantity_on_hand: entry.quantity,
      quantity_reserved: 0,
    });
    if (error) {
      throw new Error(`Could not record stock on hand: ${error.message}`);
    }
  }

  const { error: movementError } = await supabase
    .from("stock_movements")
    .insert({
      item_id: item.id,
      batch_id: batchId,
      location_id: locationId,
      movement_type: "receipt",
      quantity: entry.quantity,
      reference_type: "manual_stock_entry",
    });
  if (movementError) {
    throw new Error(
      `Stock was received, but the movement could not be logged: ${movementError.message}`,
    );
  }
}

export type ChargeCatalogEntry = {
  id: string;
  charge_code: string;
  name: string;
  category: string;
  base_rate: number;
  status: string;
  effective_from: string;
  effective_to: string | null;
};

export async function loadChargeCatalog(
  tenantId: string,
): Promise<ChargeCatalogEntry[]> {
  const { data, error } = await supabase
    .from("charge_catalog")
    .select(
      "id, charge_code, name, category, base_rate, status, effective_from, effective_to",
    )
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });
  if (error) {
    throw new Error(`Could not load your price list: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    ...row,
    base_rate: Number(row.base_rate),
  }));
}

export async function createChargeCatalogEntry(
  tenantId: string,
  values: {
    charge_code: string;
    name: string;
    category: string;
    base_rate: number;
  },
): Promise<ChargeCatalogEntry> {
  const { data, error } = await supabase
    .from("charge_catalog")
    .insert({
      tenant_id: tenantId,
      charge_code: values.charge_code,
      name: values.name,
      category: values.category,
      base_rate: values.base_rate,
      status: "active",
    })
    .select(
      "id, charge_code, name, category, base_rate, status, effective_from, effective_to",
    )
    .single();
  if (error || !data) {
    throw new Error(
      `Could not add this item to your price list: ${error?.message ?? "unknown error"}`,
    );
  }
  return { ...data, base_rate: Number(data.base_rate) };
}

export async function deleteChargeCatalogEntry(
  tenantId: string,
  chargeId: string,
): Promise<void> {
  const { error } = await supabase
    .from("charge_catalog")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", chargeId);
  if (error) {
    throw new Error(
      `Could not remove this item from your price list: ${error.message}`,
    );
  }
}

export async function setChargeCatalogStatus(
  tenantId: string,
  chargeId: string,
  status: string,
): Promise<void> {
  const { error } = await supabase
    .from("charge_catalog")
    .update({ status })
    .eq("tenant_id", tenantId)
    .eq("id", chargeId);
  if (error) {
    throw new Error(`Could not update this price list item: ${error.message}`);
  }
}

export const LOW_STOCK_THRESHOLD = 10;

export type LowStockMedicine = {
  medicineId: string;
  name: string;
  code: string;
  available: number;
};

export type AdminNotification = {
  id: string;
  title: string;
  description: string;
  tone: "info" | "warning" | "danger";
  href: string;
};

/** Active catalog medicines whose projected stock is at or below the alert threshold. */
export async function loadLowStockMedicines(
  tenantId: string,
): Promise<LowStockMedicine[]> {
  if (!tenantId) return [];
  const catalog = await loadMedicineCatalog(tenantId, true);
  if (!catalog.length) return [];

  const medicineIds = catalog.map((entry) => entry.id);
  const adminData = await loadMedicineInventoryAdminData(tenantId, medicineIds);
  const stockRows = await loadMedicineStockDetails(
    tenantId,
    medicineIds,
    adminData.items,
    adminData.mappings,
  );
  const stockById = new Map(stockRows.map((row) => [row.medicineId, row]));

  return catalog
    .map((entry) => {
      const stock = stockById.get(entry.id);
      if (!stock?.isMapped) return null;
      return {
        medicineId: entry.id,
        name: entry.name,
        code: entry.medicine_code,
        available: stock.projectedAvailable,
      };
    })
    .filter(
      (row): row is LowStockMedicine =>
        row !== null && row.available <= LOW_STOCK_THRESHOLD,
    )
    .sort((a, b) => a.available - b.available);
}

export type PlatformOverview = {
  hospitalsTotal: number;
  hospitalsActive: number;
  hospitalsTrial: number;
  hospitalsSuspended: number;
  facilitiesTotal: number;
  staffTotal: number;
  staffActive: number;
  patientsTotal: number;
  patientsNew7d: number;
  encounters7d: number;
  appointmentsToday: number;
  invoicesIssued: number;
  invoicedAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  pendingHospitalRequests: number;
};

export type PlatformAdminData = {
  overview: PlatformOverview;
  requests: HospitalAdminRequestRow[];
};

export async function loadPlatformOverview(): Promise<PlatformOverview> {
  const { data, error } = await supabase.rpc("platform_overview_stats");
  const row = data?.[0];
  if (error || !row) {
    throw new Error(
      `Could not load platform analytics: ${error?.message ?? "unknown error"}`,
    );
  }
  return {
    hospitalsTotal: Number(row.hospitals_total),
    hospitalsActive: Number(row.hospitals_active),
    hospitalsTrial: Number(row.hospitals_trial),
    hospitalsSuspended: Number(row.hospitals_suspended),
    facilitiesTotal: Number(row.facilities_total),
    staffTotal: Number(row.staff_total),
    staffActive: Number(row.staff_active),
    patientsTotal: Number(row.patients_total),
    patientsNew7d: Number(row.patients_new_7d),
    encounters7d: Number(row.encounters_7d),
    appointmentsToday: Number(row.appointments_today),
    invoicesIssued: Number(row.invoices_issued),
    invoicedAmount: Number(row.invoiced_amount),
    collectedAmount: Number(row.collected_amount),
    outstandingAmount: Number(row.outstanding_amount),
    pendingHospitalRequests: Number(row.pending_hospital_requests),
  };
}

export async function loadPlatformAdminData(): Promise<PlatformAdminData> {
  const [overview, requests] = await Promise.all([
    loadPlatformOverview(),
    loadHospitalAdminRequests(),
  ]);
  return { overview, requests };
}

export type AdminData = {
  encountersToday: number;
  admissionsToday: number;
  bedsOccupied: number;
  bedsTotal: number;
  activeStaff: number;
  pendingApprovals: number;
  patientFlow: PatientFlowRow[];
  wardPatients: WardPatientRow[];
  wardBeds: WardBed[];
  wardList: Ward[];
  notifications: AdminNotification[];
  invoiced: number;
  collected: number;
  flow: { day: string; admissions: number; discharges: number }[];
  wards: WardRow[];
  departments: { id: string; name: string; staff: number }[];
  departmentStaff: DepartmentStaffRow[];
  approvals: ApprovalRow[];
  billingInvoices: {
    id: string;
    number: string;
    patient: string;
    amount: number;
    status: string;
    issuedAt: string | null;
  }[];
  recentPayments: {
    id: string;
    reference: string;
    patient: string;
    amount: number;
    status: string;
    receivedAt: string | null;
  }[];
  openPrescriptions: {
    id: string;
    medicine: string;
    patient: string;
    remaining: number;
    prescriber: string;
    prescribedAt: string;
  }[];
  lowStockMedicines: LowStockMedicine[];
};

export async function loadStaffApprovalRequests(
  tenantId: string,
): Promise<ApprovalRow[]> {
  const { data, error } = await supabase
    .from("staff_approval_requests")
    .select("id, full_name, email, phone, requested_role, submitted_at")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .order("submitted_at", { ascending: true });

  if (error) {
    throw new Error(`Could not load staff approval requests: ${error.message}`);
  }
  return data ?? [];
}

function buildAdminNotifications({
  approvalCount,
  lowStock,
  draftInvoiceCount,
  medicineRequestCount,
  outstandingTotal,
  unpaidCount,
}: {
  approvalCount: number;
  lowStock: { name: string; available: number }[];
  draftInvoiceCount: number;
  medicineRequestCount: number;
  outstandingTotal: number;
  unpaidCount: number;
}): AdminNotification[] {
  const notifications: AdminNotification[] = [];
  if (approvalCount) {
    notifications.push({
      id: "staff-approvals",
      title: `${approvalCount} staff access request${approvalCount === 1 ? "" : "s"} pending`,
      description: "Approve new staff before they can enter the workspace.",
      tone: "info",
      href: "/dashboard/staff-approvals",
    });
  }
  if (lowStock.length) {
    const outOfStock = lowStock.filter((row) => row.available <= 0).length;
    const names = lowStock
      .slice(0, 3)
      .map((row) => `${row.name} (${row.available})`)
      .join(", ");
    notifications.push({
      id: "low-stock",
      title: `${lowStock.length} medicine${lowStock.length === 1 ? "" : "s"} low on stock`,
      description: `${outOfStock ? `${outOfStock} out of stock · ` : ""}${names}${lowStock.length > 3 ? "…" : ""}`,
      tone: outOfStock ? "danger" : "warning",
      href: "/dashboard/medicine-catalog",
    });
  }
  if (medicineRequestCount) {
    notifications.push({
      id: "medicine-requests",
      title: `${medicineRequestCount} medicine request${medicineRequestCount === 1 ? "" : "s"} waiting`,
      description: "Staff asked for medicines that are out of stock.",
      tone: "warning",
      href: "/dashboard/medicine-catalog",
    });
  }
  if (draftInvoiceCount) {
    notifications.push({
      id: "draft-invoices",
      title: `${draftInvoiceCount} invoice draft${draftInvoiceCount === 1 ? "" : "s"} awaiting issue`,
      description: "Issue drafts from Billing to send them to patients.",
      tone: "warning",
      href: "/dashboard/service-charges",
    });
  }
  if (outstandingTotal > 0) {
    notifications.push({
      id: "outstanding-payments",
      title: `${money(outstandingTotal)} still outstanding`,
      description: `${unpaidCount} issued invoices are not fully collected.`,
      tone: "warning",
      href: "/dashboard/service-charges",
    });
  }
  return notifications;
}

/**
 * The bell's contents for hospital-admin pages whose data does not already
 * carry notifications (billing, staff approvals, and so on).
 */
export async function loadAdminNotifications(
  ctx: StaffContext,
): Promise<AdminNotification[]> {
  if (!ctx.tenantId || !ctx.facilityId) return [];
  const [
    approvals,
    lowStock,
    draftInvoiceCount,
    medicineRequestCount,
    invoiceRes,
    paymentRes,
  ] = await Promise.all([
    loadStaffApprovalRequests(ctx.tenantId),
    loadLowStockMedicines(ctx.tenantId),
    counted(
      "draft invoices",
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId)
        .eq("facility_id", ctx.facilityId)
        .eq("status", "draft"),
    ),
    counted(
      "medicine requests",
      supabase
        .from("medicine_requests")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId)
        .eq("status", "pending"),
    ),
    supabase
      .from("invoices")
      .select("net_amount, status")
      .eq("tenant_id", ctx.tenantId)
      .eq("facility_id", ctx.facilityId)
      .in("status", ["issued", "partially_paid", "paid"]),
    supabase
      .from("payments")
      .select("amount, status")
      .eq("tenant_id", ctx.tenantId),
  ]);
  throwQueryErrors("notifications", invoiceRes, paymentRes);

  const invoiceRows = invoiceRes.data ?? [];
  const invoiced = invoiceRows.reduce(
    (sum, row) => sum + Number(row.net_amount ?? 0),
    0,
  );
  const collected = (paymentRes.data ?? [])
    .filter((row) => row.status !== "refunded")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  return buildAdminNotifications({
    approvalCount: approvals.length,
    lowStock,
    draftInvoiceCount,
    medicineRequestCount,
    outstandingTotal: Math.max(invoiced - collected, 0),
    unpaidCount: invoiceRows.filter((row) => row.status !== "paid").length,
  });
}

export async function loadAdminData(ctx: StaffContext): Promise<AdminData> {
  if (!ctx.tenantId) {
    throw new Error("Your hospital workspace is missing its hospital ID.");
  }

  const today = dayBounds();
  const weekAgo = dayBounds(-6).start;

  const [encountersToday, bedsTotal] = await Promise.all([
    counted(
      "today's encounters",
      supabase
        .from("encounters")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId)
        .eq("facility_id", ctx.facilityId ?? "")
        .gte("started_at", today.start)
        .lt("started_at", today.end),
    ),
    counted(
      "beds",
      supabase
        .from("beds")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", ctx.tenantId)
        .eq("facility_id", ctx.facilityId ?? "")
        .eq("status", "active"),
    ),
  ]);

  const [
    bedRes,
    assignmentRes,
    invoiceRes,
    paymentRes,
    admissionRes,
    deptRes,
    employeeRes,
    approvals,
  ] = await Promise.all([
    ctx.facilityId
      ? supabase
          .from("beds")
          .select("id, ward, bed_code, bed_type, status, is_occupied")
          .eq("tenant_id", ctx.tenantId)
          .eq("facility_id", ctx.facilityId)
      : Promise.resolve({
          data: [] as {
            id: string;
            ward: string;
            bed_code: string;
            bed_type: string;
            status: string;
            is_occupied: boolean;
          }[],
          error: null,
        }),
    supabase
      .from("bed_assignments")
      .select("id, bed_id, admission_id, start_at")
      .eq("status", "active"),
    supabase
      .from("invoices")
      .select("id, patient_id, invoice_number, net_amount, status, issued_at")
      .eq("tenant_id", ctx.tenantId)
      .eq("facility_id", ctx.facilityId ?? "")
      .in("status", ["issued", "partially_paid", "paid"]),
    supabase
      .from("payments")
      .select("id, payment_reference, patient_id, amount, status, received_at")
      .eq("tenant_id", ctx.tenantId)
      .order("received_at", { ascending: false }),
    supabase
      .from("admissions")
      .select("id, admitted_at, discharged_at")
      .eq("tenant_id", ctx.tenantId)
      .eq("facility_id", ctx.facilityId ?? "")
      .or(`admitted_at.gte.${weekAgo},discharged_at.gte.${weekAgo}`),
    supabase
      .from("departments")
      .select("id, name")
      .eq("tenant_id", ctx.tenantId)
      .eq("facility_id", ctx.facilityId ?? ""),
    supabase
      .from("employees")
      .select(
        "id, department_id, employee_code, user_id, designation_id, employment_status, availability",
      )
      .eq("tenant_id", ctx.tenantId),
    loadStaffApprovalRequests(ctx.tenantId),
  ]);
  throwQueryErrors(
    "your administrator workspace",
    bedRes,
    assignmentRes,
    invoiceRes,
    paymentRes,
    admissionRes,
    deptRes,
    employeeRes,
  );

  const encounterRes = ctx.facilityId
    ? await supabase
        .from("encounters")
        .select("id, patient_id, encounter_type, started_at, ended_at, status")
        .eq("tenant_id", ctx.tenantId)
        .eq("facility_id", ctx.facilityId)
        .order("started_at", { ascending: false })
        .limit(50)
    : { data: [], error: null };
  throwQueryErrors("patient flow", encounterRes);

  const flowEncounters = encounterRes.data ?? [];
  const admissionFlowRes = flowEncounters.length
    ? await supabase
        .from("admissions")
        .select("id, encounter_id, admitted_at, discharged_at, status")
        .eq("tenant_id", ctx.tenantId)
        .in(
          "encounter_id",
          flowEncounters.map((row) => row.id),
        )
    : { data: [], error: null };
  throwQueryErrors("patient flow admissions", admissionFlowRes);

  const flowPatients = await patientLookup(
    flowEncounters.map((row) => row.patient_id),
    ctx.tenantId,
  );
  const admissionByEncounter = new Map(
    (admissionFlowRes.data ?? []).map((row) => [row.encounter_id, row]),
  );

  const wards = new Map<string, { total: number; occupied: number }>();
  const wardByBed = new Map<string, string>();
  for (const bed of bedRes.data ?? []) {
    wardByBed.set(bed.id, bed.ward);
    const current = wards.get(bed.ward) ?? { total: 0, occupied: 0 };
    current.total += 1;
    wards.set(bed.ward, current);
  }
  let bedsOccupied = 0;
  for (const row of assignmentRes.data ?? []) {
    const ward = wardByBed.get(row.bed_id);
    if (!ward) continue;
    bedsOccupied += 1;
    wards.get(ward)!.occupied += 1;
  }

  const activeWardAssignments = (assignmentRes.data ?? []).filter((row) =>
    wardByBed.has(row.bed_id),
  );
  const wardAdmissionIds = [
    ...new Set(activeWardAssignments.map((row) => row.admission_id)),
  ];
  const wardAdmissionRes = wardAdmissionIds.length
    ? await supabase
        .from("admissions")
        .select("id, patient_id, admitted_at, status")
        .eq("tenant_id", ctx.tenantId)
        .in("id", wardAdmissionIds)
    : { data: [], error: null };
  throwQueryErrors("patients in wards", wardAdmissionRes);
  const wardAdmissions = (wardAdmissionRes.data ?? []).filter(
    (row) => row.status === "active",
  );
  const wardPatientNames = await patientLookup(
    wardAdmissions.map((row) => row.patient_id),
    ctx.tenantId,
  );
  const wardPatientRows = await loadFacilityWardPatients(ctx);

  const wardAssignmentByBed = new Map(
    activeWardAssignments.map((assignment) => [assignment.bed_id, assignment]),
  );
  const wardBeds: WardBed[] = (bedRes.data ?? []).map((bed) => {
    const assignment = wardAssignmentByBed.get(bed.id);
    const admission = assignment
      ? wardAdmissions.find((row) => row.id === assignment.admission_id)
      : undefined;
    const patient = admission
      ? wardPatientNames.get(admission.patient_id)
      : undefined;
    return {
      bedId: bed.id,
      bedCode: bed.bed_code,
      ward: bed.ward,
      manuallyOccupied: bed.is_occupied,
      bedType: bed.bed_type,
      status: bed.status,
      patient: patient?.name ?? null,
      patientNumber: patient?.number ?? null,
      admissionId: admission?.id ?? null,
      assignmentId: assignment?.id ?? null,
      admittedAt: admission?.admitted_at ?? null,
    };
  });

  const admissions = admissionRes.data ?? [];
  const employees = employeeRes.data ?? [];
  const departmentIds = new Set((deptRes.data ?? []).map((dept) => dept.id));
  const activeStaff = employees.filter(
    (employee) =>
      employee.department_id !== null &&
      departmentIds.has(employee.department_id) &&
      employee.employment_status === "active",
  ).length;
  const invoiceRows = invoiceRes.data ?? [];
  const paymentRows = paymentRes.data ?? [];
  const billingPatients = await patientLookup(
    [
      ...invoiceRows.map((row) => row.patient_id),
      ...paymentRows.map((row) => row.patient_id),
    ],
    ctx.tenantId,
  );

  const facilityEmployees = employees.filter(
    (employee) =>
      employee.department_id !== null &&
      departmentIds.has(employee.department_id),
  );
  const staffUserIds = [
    ...new Set(
      facilityEmployees
        .map((employee) => employee.user_id)
        .filter((userId): userId is string => Boolean(userId)),
    ),
  ];
  const [designationRes, staffRequestRes, staffRoleRes, staffAssignmentRes] =
    await Promise.all([
      supabase.from("designations").select("id, name"),
      staffUserIds.length
        ? supabase
            .from("staff_approval_requests")
            .select("user_id, full_name, email")
            .eq("tenant_id", ctx.tenantId)
            .in("user_id", staffUserIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("roles").select("id, name"),
      staffUserIds.length
        ? supabase
            .from("user_role_assignments")
            .select("user_id, role_id, valid_from, valid_until")
            .eq("tenant_id", ctx.tenantId)
            .in("user_id", staffUserIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  throwQueryErrors(
    "department staff",
    designationRes,
    staffRequestRes,
    staffRoleRes,
    staffAssignmentRes,
  );

  const designationNames = new Map(
    (designationRes.data ?? []).map((designation) => [
      designation.id,
      designation.name,
    ]),
  );
  const staffNames = new Map(
    (staffRequestRes.data ?? []).map((row) => [row.user_id, row]),
  );
  const roleNames = new Map(
    (staffRoleRes.data ?? []).map((role) => [role.id, role.name]),
  );
  const rolesByUser = new Map<string, string[]>();
  const now = new Date();
  for (const assignment of staffAssignmentRes.data ?? []) {
    if (
      new Date(assignment.valid_from) > now ||
      (assignment.valid_until !== null &&
        new Date(assignment.valid_until) <= now)
    ) {
      continue;
    }
    const role = roleNames.get(assignment.role_id);
    if (!role) continue;
    const roles = rolesByUser.get(assignment.user_id) ?? [];
    roles.push(role);
    rolesByUser.set(assignment.user_id, roles);
  }
  const departmentNameById = new Map(
    (deptRes.data ?? []).map((dept) => [dept.id, dept.name]),
  );
  const departmentStaff: DepartmentStaffRow[] = facilityEmployees
    .map((employee) => {
      const request = employee.user_id
        ? staffNames.get(employee.user_id)
        : undefined;
      return {
        employeeId: employee.id,
        employeeCode: employee.employee_code,
        name: request?.full_name ?? null,
        email: request?.email ?? null,
        departmentId: employee.department_id,
        departmentName:
          departmentNameById.get(employee.department_id ?? "") ?? "Department",
        designationId: employee.designation_id,
        designationName: employee.designation_id
          ? (designationNames.get(employee.designation_id) ?? null)
          : null,
        employmentStatus: employee.employment_status,
        availability: employee.availability,
        roles: [
          ...new Set(
            employee.user_id ? (rolesByUser.get(employee.user_id) ?? []) : [],
          ),
        ].sort(),
      };
    })
    .sort(
      (a, b) =>
        a.departmentName.localeCompare(b.departmentName) ||
        a.employeeCode.localeCompare(b.employeeCode),
    );

  const invoicedTotal = invoiceRows.reduce(
    (sum, row) => sum + Number(row.net_amount ?? 0),
    0,
  );
  const collectedTotal = paymentRows
    .filter((row) => row.status !== "refunded")
    .reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const outstandingTotal = Math.max(invoicedTotal - collectedTotal, 0);

  const [draftInvoiceCount, lowStock, medicineRequestCount] = await Promise.all(
    [
      counted(
        "draft invoices",
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", ctx.tenantId)
          .eq("facility_id", ctx.facilityId ?? "")
          .eq("status", "draft"),
      ),
      loadLowStockMedicines(ctx.tenantId),
      counted(
        "medicine requests",
        supabase
          .from("medicine_requests")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", ctx.tenantId)
          .eq("status", "pending"),
      ),
    ],
  );

  const prescriptionLines = await loadFacilityPrescriptionLines(ctx);
  const openPrescriptionLines = prescriptionLines.filter(
    (line) => line.status === "active" && line.remaining > 0,
  );

  const notifications = buildAdminNotifications({
    approvalCount: approvals.length,
    lowStock,
    draftInvoiceCount,
    medicineRequestCount,
    outstandingTotal,
    unpaidCount: invoiceRows.filter((row) => row.status !== "paid").length,
  });

  return {
    encountersToday,
    admissionsToday: admissions.filter(
      (a) => a.admitted_at >= today.start && a.admitted_at < today.end,
    ).length,
    bedsOccupied,
    bedsTotal,
    activeStaff,
    pendingApprovals: approvals.length,
    openPrescriptions: openPrescriptionLines.map((line) => ({
      id: line.id,
      medicine: line.medicine,
      patient: line.patient,
      remaining: line.remaining,
      prescriber: line.prescriber,
      prescribedAt: line.prescribedAt,
    })),
    lowStockMedicines: lowStock,
    invoiced: invoicedTotal,
    collected: collectedTotal,
    notifications,
    flow: buildFlowSeries(admissions),
    wards: [...wards.entries()]
      .map(([ward, stats]) => ({ ward, ...stats }))
      .sort((a, b) => b.total - a.total),
    departments: (deptRes.data ?? [])
      .map((dept) => ({
        id: dept.id,
        name: dept.name,
        staff: employees.filter(
          (employee) =>
            employee.department_id === dept.id &&
            employee.employment_status === "active",
        ).length,
      }))
      .sort((a, b) => b.staff - a.staff),
    departmentStaff,
    patientFlow: flowEncounters.map((row) => {
      const admission = admissionByEncounter.get(row.id);
      const patient = flowPatients.get(row.patient_id);
      return {
        encounterId: row.id,
        patient: patient?.name ?? "Patient",
        number: patient?.number ?? null,
        encounterType: row.encounter_type,
        startedAt: row.started_at,
        encounterStatus: row.status,
        admissionId: admission?.id ?? null,
        admissionStatus: admission?.status ?? null,
        admittedAt: admission?.admitted_at ?? null,
        dischargedAt: admission?.discharged_at ?? null,
      };
    }),
    wardPatients: wardPatientRows,
    wardBeds,
    wardList: await loadWards(ctx),
    approvals,
    billingInvoices: invoiceRows
      .slice()
      .sort((a, b) => (b.issued_at ?? "").localeCompare(a.issued_at ?? ""))
      .slice(0, 20)
      .map((row) => ({
        id: row.id,
        number: row.invoice_number,
        patient: billingPatients.get(row.patient_id)?.name ?? "Patient",
        amount: Number(row.net_amount),
        status: row.status,
        issuedAt: row.issued_at,
      })),
    recentPayments: paymentRows.slice(0, 10).map((row) => ({
      id: row.id,
      reference: row.payment_reference,
      patient: billingPatients.get(row.patient_id)?.name ?? "Patient",
      amount: Number(row.amount),
      status: row.status,
      receivedAt: row.received_at,
    })),
  };
}

function buildFlowSeries(
  admissions: { admitted_at: string; discharged_at: string | null }[],
) {
  const series: { day: string; admissions: number; discharges: number }[] = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const { start, end } = dayBounds(offset);
    series.push({
      day: new Date(start).toLocaleDateString(undefined, { weekday: "short" }),
      admissions: admissions.filter(
        (a) => a.admitted_at >= start && a.admitted_at < end,
      ).length,
      discharges: admissions.filter(
        (a) =>
          a.discharged_at && a.discharged_at >= start && a.discharged_at < end,
      ).length,
    });
  }
  return series;
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

const HONORIFICS = new Set([
  "dr",
  "mr",
  "mrs",
  "ms",
  "miss",
  "prof",
  "sister",
  "sr",
]);

export function greeting(fullName: string) {
  const hour = new Date().getHours();
  const part =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const name =
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .find((word) => !HONORIFICS.has(word.replace(/\.$/, "").toLowerCase())) ??
    "there";
  return `${part}, ${name}`;
}

export function humanise(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function money(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

/* -------------------------------------------------------------------------- */
/* Patient history                                                            */
/* -------------------------------------------------------------------------- */

export type PatientHistoryOption = {
  id: string;
  name: string;
  number: string;
  dateOfBirth: string | null;
  sex: string | null;
};

export type PatientHistoryEvent = {
  id: string;
  kind: "visit" | "admission" | "appointment";
  title: string;
  detail: string | null;
  status: string;
  at: string;
};

export type PatientHistoryMedication = {
  id: string;
  medicine: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  quantityPrescribed: number;
  quantityDispensed: number;
  status: string;
  prescribedAt: string;
};

export type PatientHistoryDiagnosis = {
  id: string;
  code: string;
  description: string;
  type: string;
  at: string;
};

export type PatientHistoryLab = {
  id: string;
  test: string;
  value: string;
  unit: string;
  status: string;
  at: string;
};

export type PatientClinicalHistory = {
  patient: PatientHistoryOption;
  allergies: { substance: string; reaction: string; severity: string }[];
  events: PatientHistoryEvent[];
  medications: PatientHistoryMedication[];
  diagnoses: PatientHistoryDiagnosis[];
  labs: PatientHistoryLab[];
};

/** Active patients a doctor can open a history for. */
export async function loadPatientHistoryOptions(
  ctx: StaffContext,
): Promise<PatientHistoryOption[]> {
  if (!ctx.tenantId) return [];
  const { data, error } = await supabase
    .from("patients")
    .select("id, name, patient_number, date_of_birth, sex")
    .eq("tenant_id", ctx.tenantId)
    .eq("status", "active")
    .order("name", { ascending: true })
    .limit(500);
  if (error) {
    throw new Error(`Could not load patients: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    number: row.patient_number,
    dateOfBirth: row.date_of_birth,
    sex: row.sex,
  }));
}

/**
 * Everything recorded for one patient in this hospital: their medication
 * history, visits, admissions, appointments, diagnoses and laboratory results.
 */
export async function loadPatientClinicalHistory(
  ctx: StaffContext,
  patientId: string,
): Promise<PatientClinicalHistory> {
  const { tenantId, facilityId } = requireTenantAndFacility(
    ctx,
    "patient history",
  );

  const patientRes = await supabase
    .from("patients")
    .select("id, name, patient_number, date_of_birth, sex")
    .eq("tenant_id", tenantId)
    .eq("id", patientId)
    .maybeSingle();
  throwQueryErrors("that patient", patientRes);
  const patient = patientRes.data;
  if (!patient) {
    throw new Error("That patient is not part of this hospital.");
  }

  const [encounterRes, admissionRes, appointmentRes, allergyRes] =
    await Promise.all([
      supabase
        .from("encounters")
        .select("id, encounter_type, started_at, status")
        .eq("tenant_id", tenantId)
        .eq("facility_id", facilityId)
        .eq("patient_id", patientId)
        .order("started_at", { ascending: false })
        .limit(50),
      supabase
        .from("admissions")
        .select("id, admitted_at, discharged_at, status")
        .eq("tenant_id", tenantId)
        .eq("patient_id", patientId)
        .order("admitted_at", { ascending: false })
        .limit(20),
      supabase
        .from("appointments")
        .select("id, scheduled_at, status, reason")
        .eq("tenant_id", tenantId)
        .eq("patient_id", patientId)
        .order("scheduled_at", { ascending: false })
        .limit(20),
      supabase
        .from("allergies")
        .select("substance, reaction, severity")
        .eq("patient_id", patientId)
        .eq("status", "active"),
    ]);
  throwQueryErrors(
    "the patient's history",
    encounterRes,
    admissionRes,
    appointmentRes,
    allergyRes,
  );

  const encounters = encounterRes.data ?? [];
  const encounterIds = encounters.map((row) => row.id);
  const [prescriptionRes, diagnosisRes, labOrderRes] = await Promise.all([
    encounterIds.length
      ? supabase
          .from("prescriptions")
          .select("id, encounter_id, status, created_at")
          .in("encounter_id", encounterIds)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({
          data: [] as {
            id: string;
            encounter_id: string;
            status: string;
            created_at: string;
          }[],
          error: null,
        }),
    encounterIds.length
      ? supabase
          .from("diagnoses")
          .select(
            "id, encounter_id, diagnosis_code, description, diagnosis_type, created_at",
          )
          .in("encounter_id", encounterIds)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({
          data: [] as {
            id: string;
            encounter_id: string;
            diagnosis_code: string;
            description: string;
            diagnosis_type: string;
            created_at: string;
          }[],
          error: null,
        }),
    supabase
      .from("lab_orders")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("patient_id", patientId)
      .order("ordered_at", { ascending: false })
      .limit(20),
  ]);
  throwQueryErrors(
    "the patient's records",
    prescriptionRes,
    diagnosisRes,
    labOrderRes,
  );

  const prescriptions = prescriptionRes.data ?? [];
  const prescriptionIds = prescriptions.map((row) => row.id);
  const labOrderIds = (labOrderRes.data ?? []).map((row) => row.id);
  const [itemRes, labItemRes] = await Promise.all([
    prescriptionIds.length
      ? supabase
          .from("prescription_items")
          .select(
            "id, prescription_id, medicine_id, dose, route, frequency, duration, quantity_prescribed, quantity_dispensed",
          )
          .in("prescription_id", prescriptionIds)
          .order("created_at", { ascending: true })
          .limit(200)
      : Promise.resolve({
          data: [] as {
            id: string;
            prescription_id: string;
            medicine_id: string;
            dose: string;
            route: string;
            frequency: string;
            duration: string;
            quantity_prescribed: number;
            quantity_dispensed: number;
          }[],
          error: null,
        }),
    labOrderIds.length
      ? supabase
          .from("lab_order_items")
          .select("id, test_id")
          .in("lab_order_id", labOrderIds)
      : Promise.resolve({
          data: [] as { id: string; test_id: string }[],
          error: null,
        }),
  ]);
  throwQueryErrors("prescribed medicines and tests", itemRes, labItemRes);

  const items = itemRes.data ?? [];
  const medicineIds = [...new Set(items.map((row) => row.medicine_id))];
  const labItems = labItemRes.data ?? [];
  const labItemIds = labItems.map((row) => row.id);
  const [medicineRes, labResultRes, testRes] = await Promise.all([
    medicineIds.length
      ? supabase
          .from("medicine_catalog")
          .select("id, name, strength")
          .in("id", medicineIds)
      : Promise.resolve({
          data: [] as { id: string; name: string; strength: string }[],
          error: null,
        }),
    labItemIds.length
      ? supabase
          .from("lab_results")
          .select(
            "id, lab_order_item_id, result_value, unit, status, created_at, verified_at",
          )
          .in("lab_order_item_id", labItemIds)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({
          data: [] as {
            id: string;
            lab_order_item_id: string;
            result_value: string;
            unit: string;
            status: string;
            created_at: string;
            verified_at: string | null;
          }[],
          error: null,
        }),
    labItems.length
      ? supabase
          .from("lab_test_catalog")
          .select("id, name")
          .in("id", [...new Set(labItems.map((row) => row.test_id))])
      : Promise.resolve({
          data: [] as { id: string; name: string }[],
          error: null,
        }),
  ]);
  throwQueryErrors(
    "medicine names and results",
    medicineRes,
    labResultRes,
    testRes,
  );

  const medicines = new Map(
    (medicineRes.data ?? []).map((row) => [
      row.id,
      `${row.name} ${row.strength}`.trim(),
    ]),
  );
  const prescriptionsById = new Map(prescriptions.map((row) => [row.id, row]));

  const events: PatientHistoryEvent[] = [
    ...encounters.map((row) => ({
      id: `visit-${row.id}`,
      kind: "visit" as const,
      title: humanise(row.encounter_type),
      detail: null,
      status: row.status,
      at: row.started_at,
    })),
    ...(admissionRes.data ?? []).map((row) => ({
      id: `admission-${row.id}`,
      kind: "admission" as const,
      title: "Inpatient admission",
      detail: row.discharged_at
        ? `Discharged ${formatDate(row.discharged_at)}`
        : null,
      status: row.status,
      at: row.admitted_at,
    })),
    ...(appointmentRes.data ?? []).map((row) => ({
      id: `appointment-${row.id}`,
      kind: "appointment" as const,
      title: "Appointment",
      detail: row.reason,
      status: row.status,
      at: row.scheduled_at,
    })),
  ]
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, 40);

  const tests = new Map((testRes.data ?? []).map((row) => [row.id, row.name]));
  const testByItem = new Map(
    labItems.map((row) => [row.id, tests.get(row.test_id) ?? "Lab result"]),
  );

  return {
    patient: {
      id: patient.id,
      name: patient.name,
      number: patient.patient_number,
      dateOfBirth: patient.date_of_birth,
      sex: patient.sex,
    },
    allergies: (allergyRes.data ?? []).map((row) => ({
      substance: row.substance,
      reaction: row.reaction,
      severity: row.severity,
    })),
    events,
    medications: items
      .map((row) => {
        const prescription = prescriptionsById.get(row.prescription_id);
        return {
          id: row.id,
          medicine: medicines.get(row.medicine_id) ?? "Medicine",
          dose: row.dose,
          route: row.route,
          frequency: row.frequency,
          duration: row.duration,
          quantityPrescribed: Number(row.quantity_prescribed),
          quantityDispensed: Number(row.quantity_dispensed),
          status: prescription?.status ?? "completed",
          prescribedAt: prescription?.created_at ?? "",
        };
      })
      .sort((left, right) =>
        right.prescribedAt.localeCompare(left.prescribedAt),
      ),
    diagnoses: (diagnosisRes.data ?? []).map((row) => ({
      id: row.id,
      code: row.diagnosis_code,
      description: row.description ?? row.diagnosis_code,
      type: row.diagnosis_type,
      at: row.created_at,
    })),
    labs: (labResultRes.data ?? []).map((row) => ({
      id: row.id,
      test: testByItem.get(row.lab_order_item_id) ?? "Lab result",
      value: row.result_value,
      unit: row.unit,
      status: row.status,
      at: row.verified_at ?? row.created_at,
    })),
  };
}
