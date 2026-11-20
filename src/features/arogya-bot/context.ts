import type { PatientPortalData } from "@/features/patient-portal/data";
import type { PatientClinicalHistory } from "@/features/dashboard/data";

/**
 * Arogya Bot answers only from the patient dashboard context. These builders
 * turn the dashboard's rows into a compact, readable brief so the model sees
 * the same information the actor sees on screen.
 */

function date(value: string | null | undefined) {
  if (!value) return "unknown date";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toISOString().slice(0, 10);
}

function age(dateOfBirth: string | null | undefined) {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const monthDiff = now.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) {
    years -= 1;
  }
  return years >= 0 ? years : null;
}

function label(value: string) {
  return value.replace(/[_-]+/g, " ").trim();
}

function money(value: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function section(title: string, lines: string[]) {
  return `\n${title}\n${lines.length ? lines.map((line) => `- ${line}`).join("\n") : "- None recorded"}`;
}

/** Context for the signed-in patient's own dashboard. */
export function buildPatientDashboardContext(data: PatientPortalData): string {
  const patient = data.patients[0];
  const years = age(patient?.dateOfBirth);
  const header = [
    "PATIENT DASHBOARD CONTEXT",
    `Name: ${patient?.name ?? data.patientName}`,
    `Patient number: ${patient?.number ?? "not recorded"}`,
    `Date of birth: ${patient?.dateOfBirth ? date(patient.dateOfBirth) : "not recorded"}${years !== null ? ` (age ${years})` : ""}`,
    `Sex: ${patient?.sex ?? "not recorded"}`,
    `Record status: ${patient?.status ?? "not recorded"}`,
  ].join("\n");

  const parts = [
    header,
    section(
      "ALLERGIES",
      data.allergies.map(
        (row) => `${row.substance}: ${row.reaction} (${row.severity})`,
      ),
    ),
    section(
      "DIAGNOSES",
      data.diagnoses.map(
        (row) =>
          `${row.code} ${row.description ?? ""} (${label(row.type)}), recorded ${date(row.createdAt)}`,
      ),
    ),
    section(
      "RECENT VISITS AND ADMISSIONS",
      data.visits.map(
        (row) =>
          `${label(row.type)} on ${date(row.startedAt)} · ${label(row.status)}`,
      ),
    ),
    section(
      "APPOINTMENTS",
      data.appointments.map(
        (row) =>
          `${date(row.scheduledAt)} · ${row.doctor}${row.department ? `, ${row.department}` : ""} · ${label(row.status)}${row.reason ? ` · ${row.reason}` : ""}`,
      ),
    ),
    section(
      "LATEST OBSERVATIONS",
      data.observations
        .slice(0, 10)
        .map(
          (row) =>
            `${label(row.name)}: ${row.value} ${row.unit} (${date(row.observedAt)})`,
        ),
    ),
    section(
      "LAB RESULTS",
      data.labResults.map(
        (row) =>
          `${row.test}: ${row.value} ${row.unit} (reference ${row.referenceRange}), released ${date(row.verifiedAt)}`,
      ),
    ),
    section(
      "ACTIVE PRESCRIPTIONS",
      data.prescriptions.map(
        (row) =>
          `${row.medicine} ${row.strength} · ${row.dose} · ${row.route} · ${row.frequency} · ${row.duration}`,
      ),
    ),
    section(
      "BILLING",
      data.invoices.map(
        (row) =>
          `Invoice ${row.number}: ${money(row.amount)} · ${label(row.status)} · issued ${date(row.issuedAt)}`,
      ),
    ),
    section(
      "PAYMENTS",
      data.payments.map(
        (row) =>
          `${money(row.amount, row.currency || "INR")} on ${date(row.receivedAt)} · ${label(row.status)} · ref ${row.reference}`,
      ),
    ),
  ];

  return parts.join("\n");
}

/** Context for a patient opened from a staff dashboard. */
export function buildStaffPatientContext(
  history: PatientClinicalHistory,
): string {
  const { patient } = history;
  const years = age(patient.dateOfBirth);
  const header = [
    "PATIENT DASHBOARD CONTEXT",
    `Name: ${patient.name}`,
    `Patient number: ${patient.number}`,
    `Date of birth: ${patient.dateOfBirth ? date(patient.dateOfBirth) : "not recorded"}${years !== null ? ` (age ${years})` : ""}`,
    `Sex: ${patient.sex ?? "not recorded"}`,
  ].join("\n");

  const parts = [
    header,
    section(
      "ALLERGIES",
      history.allergies.map(
        (row) => `${row.substance}: ${row.reaction} (${row.severity})`,
      ),
    ),
    section(
      "DIAGNOSES",
      history.diagnoses
        .slice(0, 15)
        .map(
          (row) =>
            `${row.code} ${row.description} (${label(row.type)}), recorded ${date(row.at)}`,
        ),
    ),
    section(
      "RECENT VISITS AND ADMISSIONS",
      history.events
        .filter((row) => row.kind !== "appointment")
        .slice(0, 15)
        .map((row) => `${row.title} on ${date(row.at)} · ${label(row.status)}`),
    ),
    section(
      "APPOINTMENTS",
      history.events
        .filter((row) => row.kind === "appointment")
        .slice(0, 10)
        .map(
          (row) =>
            `${date(row.at)} · ${label(row.status)}${row.detail ? ` · ${row.detail}` : ""}`,
        ),
    ),
    section(
      "LAB RESULTS",
      history.labs
        .slice(0, 15)
        .map(
          (row) =>
            `${row.test}: ${row.value} ${row.unit} · ${label(row.status)} · ${date(row.at)}`,
        ),
    ),
    section(
      "MEDICATIONS",
      history.medications
        .slice(0, 20)
        .map(
          (row) =>
            `${row.medicine} · ${row.dose} · ${row.route} · ${row.frequency} · ${row.duration} · ${label(row.status)}`,
        ),
    ),
  ];

  return parts.join("\n");
}
