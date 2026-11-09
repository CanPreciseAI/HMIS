import { supabase } from "@/integrations/supabase/client";

type PatientRecord = {
  id: string;
  name: string;
  number: string;
  dateOfBirth: string;
  sex: string;
  status: string;
};

type PatientAppointment = {
  id: string;
  scheduledAt: string;
  status: string;
  doctor: string;
  department: string | null;
  reason: string | null;
  location: string | null;
};

type PatientVisit = {
  id: string;
  type: string;
  startedAt: string;
  status: string;
};

type PatientAllergy = {
  id: string;
  substance: string;
  reaction: string;
  severity: string;
};

type PatientObservation = {
  id: string;
  name: string;
  value: string;
  unit: string;
  observedAt: string;
};

type PatientDiagnosis = {
  id: string;
  code: string;
  description: string | null;
  type: string;
  createdAt: string;
};

type PatientLabResult = {
  id: string;
  test: string;
  value: string;
  unit: string;
  referenceRange: string;
  verifiedAt: string | null;
};

type PatientPrescription = {
  id: string;
  medicine: string;
  strength: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  status: string;
  createdAt: string;
};

type PatientInvoice = {
  id: string;
  number: string;
  amount: number;
  status: string;
  issuedAt: string | null;
};

type PatientPayment = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  receivedAt: string | null;
};

export type PatientPortalData = {
  patientName: string;
  accessPending: boolean;
  patients: PatientRecord[];
  appointments: PatientAppointment[];
  visits: PatientVisit[];
  allergies: PatientAllergy[];
  observations: PatientObservation[];
  diagnoses: PatientDiagnosis[];
  labResults: PatientLabResult[];
  prescriptions: PatientPrescription[];
  invoices: PatientInvoice[];
  payments: PatientPayment[];
};

function requireData<T>(
  label: string,
  result: { data: T | null; error: { message: string } | null },
): T {
  if (result.error) {
    throw new Error(`Could not load ${label}: ${result.error.message}`);
  }
  if (result.data === null) {
    throw new Error(`Could not load ${label}. Please try again.`);
  }
  return result.data;
}

export async function loadPatientPortalData(
  userId: string,
): Promise<PatientPortalData> {
  const [profileResult, accessResult] = await Promise.all([
    supabase
      .from("patient_profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("patient_portal_access")
      .select("patient_id, status")
      .eq("user_id", userId),
  ]);
  if (profileResult.error) {
    throw new Error(
      `Could not load your profile: ${profileResult.error.message}`,
    );
  }
  const accesses = requireData("your linked records", accessResult);
  const activeAccesses = accesses.filter((row) =>
    ["verified", "active"].includes(row.status),
  );
  const patientIds = [...new Set(activeAccesses.map((row) => row.patient_id))];
  const patientName = profileResult.data?.full_name ?? "Patient";

  if (!patientIds.length) {
    return {
      patientName,
      accessPending: true,
      patients: [],
      appointments: [],
      visits: [],
      allergies: [],
      observations: [],
      diagnoses: [],
      labResults: [],
      prescriptions: [],
      invoices: [],
      payments: [],
    };
  }

  const [
    patientResult,
    appointmentResult,
    encounterResult,
    admissionResult,
    allergyResult,
    observationResult,
    labOrderResult,
    radiologyOrderResult,
    invoiceResult,
    paymentResult,
  ] = await Promise.all([
    supabase
      .from("patients")
      .select("id, name, patient_number, date_of_birth, sex, status")
      .in("id", patientIds),
    supabase.rpc("patient_appointments"),
    supabase
      .from("encounters")
      .select("id, patient_id, encounter_type, started_at, status")
      .in("patient_id", patientIds)
      .order("started_at", { ascending: false })
      .limit(12),
    supabase
      .from("admissions")
      .select("id, patient_id, status, admitted_at, discharged_at")
      .in("patient_id", patientIds)
      .order("admitted_at", { ascending: false })
      .limit(8),
    supabase
      .from("allergies")
      .select("id, patient_id, substance, reaction, severity, status")
      .in("patient_id", patientIds)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("observations")
      .select("id, patient_id, observation_code, value, unit, observed_at")
      .in("patient_id", patientIds)
      .order("observed_at", { ascending: false })
      .limit(12),
    supabase
      .from("lab_orders")
      .select("id, patient_id")
      .in("patient_id", patientIds)
      .order("ordered_at", { ascending: false })
      .limit(20),
    supabase
      .from("radiology_orders")
      .select("id, patient_id")
      .in("patient_id", patientIds)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("invoices")
      .select("id, invoice_number, net_amount, status, issued_at")
      .in("patient_id", patientIds)
      .in("status", ["issued", "partially_paid", "paid"])
      .order("issued_at", { ascending: false })
      .limit(10),
    supabase
      .from("payments")
      .select("id, payment_reference, amount, currency, status, received_at")
      .in("patient_id", patientIds)
      .order("received_at", { ascending: false })
      .limit(10),
  ]);
  const patients = requireData("your patient records", patientResult);
  const appointments = requireData("appointments", appointmentResult);
  const encounters = requireData("visits", encounterResult);
  const admissions = requireData("admissions", admissionResult);
  const allergies = requireData("allergies", allergyResult);
  const observations = requireData("observations", observationResult);
  const labOrders = requireData("lab orders", labOrderResult);
  const radiologyOrders = requireData("imaging orders", radiologyOrderResult);
  const invoices = requireData("invoices", invoiceResult);
  const payments = requireData("payments", paymentResult);
  const encounterIds = encounters.map((row) => row.id);
  const labOrderIds = labOrders.map((row) => row.id);
  const radiologyOrderIds = radiologyOrders.map((row) => row.id);

  const [
    diagnosisResult,
    labItemResult,
    radiologyReportResult,
    prescriptionResult,
  ] = await Promise.all([
    encounterIds.length
      ? supabase
          .from("diagnoses")
          .select(
            "id, encounter_id, diagnosis_code, description, diagnosis_type, created_at",
          )
          .in("encounter_id", encounterIds)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
    labOrderIds.length
      ? supabase
          .from("lab_order_items")
          .select("id, lab_order_id, test_id")
          .in("lab_order_id", labOrderIds)
      : Promise.resolve({ data: [], error: null }),
    radiologyOrderIds.length
      ? supabase
          .from("radiology_reports")
          .select("id, radiology_order_id, report_text, approved_at")
          .in("radiology_order_id", radiologyOrderIds)
          .in("status", ["approved", "amended"])
          .order("approved_at", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
    encounterIds.length
      ? supabase
          .from("prescriptions")
          .select("id, encounter_id, status, created_at")
          .in("encounter_id", encounterIds)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const diagnoses = requireData("diagnoses", diagnosisResult);
  const labItems = requireData("lab orders", labItemResult);
  const radiologyReports = requireData(
    "imaging reports",
    radiologyReportResult,
  );
  const prescriptions = requireData("prescriptions", prescriptionResult);
  const labItemIds = labItems.map((row) => row.id);
  const testIds = [...new Set(labItems.map((row) => row.test_id))];
  const prescriptionIds = prescriptions.map((row) => row.id);
  const [labResultResult, testResult, prescriptionItemResult] =
    await Promise.all([
      labItemIds.length
        ? supabase
            .from("lab_results")
            .select(
              "id, lab_order_item_id, result_value, unit, reference_range, verified_at",
            )
            .in("lab_order_item_id", labItemIds)
            .in("status", ["verified", "amended"])
            .order("verified_at", { ascending: false })
            .limit(12)
        : Promise.resolve({ data: [], error: null }),
      testIds.length
        ? supabase.from("lab_test_catalog").select("id, name").in("id", testIds)
        : Promise.resolve({ data: [], error: null }),
      prescriptionIds.length
        ? supabase
            .from("prescription_items")
            .select(
              "id, prescription_id, medicine_id, dose, route, frequency, duration",
            )
            .in("prescription_id", prescriptionIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  const labResults = requireData("released lab results", labResultResult);
  const tests = requireData("lab test names", testResult);
  const prescriptionItems = requireData(
    "prescription details",
    prescriptionItemResult,
  );
  const medicineIds = [
    ...new Set(prescriptionItems.map((row) => row.medicine_id)),
  ];
  const medicineResult = medicineIds.length
    ? await supabase
        .from("medicine_catalog")
        .select("id, name, strength")
        .in("id", medicineIds)
    : { data: [], error: null };
  const medicines = requireData("prescribed medicines", medicineResult);

  return {
    patientName,
    accessPending: false,
    patients: patients.map((row) => ({
      id: row.id,
      name: row.name,
      number: row.patient_number,
      dateOfBirth: row.date_of_birth,
      sex: row.sex,
      status: row.status,
    })),
    appointments: appointments.map((row) => ({
      id: row.appointment_id,
      scheduledAt: row.scheduled_at,
      status: row.status,
      doctor: row.doctor_name,
      department: row.department_name,
      reason: row.reason,
      location: row.location,
    })),
    visits: [
      ...encounters.map((row) => ({
        id: row.id,
        type: row.encounter_type,
        startedAt: row.started_at,
        status: row.status,
      })),
      ...admissions.map((row) => ({
        id: row.id,
        type: row.status === "active" ? "Inpatient admission" : "Admission",
        startedAt: row.admitted_at,
        status: row.status,
      })),
    ]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 12),
    allergies: allergies.map((row) => ({
      id: row.id,
      substance: row.substance,
      reaction: row.reaction,
      severity: row.severity,
    })),
    observations: observations.map((row) => ({
      id: row.id,
      name: row.observation_code,
      value: row.value,
      unit: row.unit,
      observedAt: row.observed_at,
    })),
    diagnoses: diagnoses.map((row) => ({
      id: row.id,
      code: row.diagnosis_code,
      description: row.description,
      type: row.diagnosis_type,
      createdAt: row.created_at,
    })),
    labResults: labResults.map((row) => {
      const item = labItems.find(
        (candidate) => candidate.id === row.lab_order_item_id,
      );
      return {
        id: row.id,
        test:
          tests.find((test) => test.id === item?.test_id)?.name ?? "Lab result",
        value: row.result_value,
        unit: row.unit,
        referenceRange: row.reference_range,
        verifiedAt: row.verified_at,
      };
    }),
    prescriptions: prescriptionItems.map((row) => {
      const prescription = prescriptions.find(
        (candidate) => candidate.id === row.prescription_id,
      );
      const medicine = medicines.find(
        (candidate) => candidate.id === row.medicine_id,
      );
      return {
        id: row.id,
        medicine: medicine?.name ?? "Prescribed medicine",
        strength: medicine?.strength ?? "",
        dose: row.dose,
        route: row.route,
        frequency: row.frequency,
        duration: row.duration,
        status: prescription?.status ?? "active",
        createdAt: prescription?.created_at ?? "",
      };
    }),
    invoices: invoices.map((row) => ({
      id: row.id,
      number: row.invoice_number,
      amount: Number(row.net_amount),
      status: row.status,
      issuedAt: row.issued_at,
    })),
    payments: payments.map((row) => ({
      id: row.id,
      reference: row.payment_reference,
      amount: Number(row.amount),
      currency: row.currency,
      status: row.status,
      receivedAt: row.received_at,
    })),
  };
}
