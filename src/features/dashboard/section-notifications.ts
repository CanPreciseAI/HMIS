import type {
  AdminData,
  AdminNotification,
  DoctorData,
  InsuranceData,
  InvoiceRow,
  LabTechnicianData,
  NurseData,
  PharmacistData,
  ReceptionistData,
  StaffRole,
  WardSectionData,
} from "./data";

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null;
}

function isAdminData(value: unknown): value is AdminData {
  return (
    isRecord(value) &&
    "notifications" in value &&
    "pendingApprovals" in value &&
    "wardPatients" in value
  );
}

function isDoctorData(value: unknown): value is DoctorData {
  return (
    isRecord(value) &&
    "appointmentsToday" in value &&
    "notifications" in value &&
    Array.isArray(value["schedule"])
  );
}

function isNurseData(value: unknown): value is NurseData {
  return (
    isRecord(value) &&
    "activeAdmissions" in value &&
    Array.isArray(value["queue"]) &&
    Array.isArray(value["notes"])
  );
}

function isLabTechnicianData(value: unknown): value is LabTechnicianData {
  return (
    isRecord(value) &&
    "pendingSamples" in value &&
    "resultsToVerify" in value &&
    Array.isArray(value["queue"])
  );
}

function isPharmacistData(value: unknown): value is PharmacistData {
  return (
    isRecord(value) &&
    "pendingPrescriptions" in value &&
    Array.isArray(value["medicineStock"])
  );
}

function isReceptionistData(value: unknown): value is ReceptionistData {
  return (
    isRecord(value) &&
    "registrations" in value &&
    "outstandingInvoices" in value &&
    Array.isArray(value["schedule"])
  );
}

function isInsuranceData(value: unknown): value is InsuranceData {
  return (
    isRecord(value) &&
    Array.isArray(value["policies"]) &&
    Array.isArray(value["claims"])
  );
}

function isWardSectionData(value: unknown): value is WardSectionData {
  return (
    isRecord(value) &&
    Array.isArray(value["wardBeds"]) &&
    Array.isArray(value["wardPatients"])
  );
}

function isInvoiceRows(value: unknown): value is InvoiceRow[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        isRecord(row) &&
        typeof row["number"] === "string" &&
        "grossAmount" in row,
    )
  );
}

function notification(
  id: string,
  title: string,
  description: string,
  tone: AdminNotification["tone"],
  href: string,
): AdminNotification {
  return { id, title, description, tone, href };
}

function lowStockCount(stock: PharmacistData["medicineStock"]) {
  return stock.filter((row) => row.isMapped && row.available <= 10).length;
}

/**
 * Section-specific notices built from the data already loaded for that page.
 * Each page therefore shows only the new work waiting in that part of the
 * workspace, rather than every notification in the hospital.
 */
export function buildSectionNotifications(
  section: string,
  data: unknown,
): AdminNotification[] {
  const items: AdminNotification[] = [];
  const admin = isAdminData(data) ? data : null;
  const doctor = isDoctorData(data) ? data : null;
  const nurse = isNurseData(data) ? data : null;
  const lab = isLabTechnicianData(data) ? data : null;
  const pharmacist = isPharmacistData(data) ? data : null;
  const receptionist = isReceptionistData(data) ? data : null;
  const insurance = isInsuranceData(data) ? data : null;
  const ward = isWardSectionData(data) ? data : null;
  const invoices = isInvoiceRows(data) ? data : null;

  switch (section) {
    case "patient-flow":
      if (admin?.admissionsToday) {
        items.push(
          notification(
            "flow-admissions",
            `${admin.admissionsToday} patient${admin.admissionsToday === 1 ? "" : "s"} admitted today`,
            "Review the latest admissions and discharges in patient flow.",
            "info",
            "/dashboard/patient-flow",
          ),
        );
      }
      break;
    case "ward-capacity":
      if (admin?.wardPatients.length) {
        items.push(
          notification(
            "ward-patients",
            `${admin.wardPatients.length} patient${admin.wardPatients.length === 1 ? "" : "s"} currently in wards`,
            `${admin.bedsOccupied} of ${admin.bedsTotal} active beds are occupied.`,
            "info",
            "/dashboard/ward-capacity",
          ),
        );
      } else if (ward?.wardPatients.length) {
        items.push(
          notification(
            "ward-patients",
            `${ward.wardPatients.length} patient${ward.wardPatients.length === 1 ? "" : "s"} currently in wards`,
            `${ward.wardBeds.length} beds on the ward board.`,
            "info",
            "/dashboard/ward-capacity",
          ),
        );
      }
      break;
    case "departments":
      if (admin?.pendingApprovals) {
        items.push(
          notification(
            "department-approvals",
            `${admin.pendingApprovals} staff request${admin.pendingApprovals === 1 ? "" : "s"} pending`,
            "Review new staff before they can enter the workspace.",
            "warning",
            "/dashboard/staff-approvals",
          ),
        );
      }
      break;
    case "staff-approvals":
      if (admin?.approvals.length) {
        items.push(
          notification(
            "staff-approvals-new",
            `${admin.approvals.length} staff access request${admin.approvals.length === 1 ? "" : "s"} waiting`,
            "Approve or decline the latest staff requests.",
            "warning",
            "/dashboard/staff-approvals",
          ),
        );
      }
      break;
    case "billing":
    case "service-charges":
    case "reception-billing":
    case "invoices":
      if (invoices) {
        const drafts = invoices.filter((row) => row.status === "draft").length;
        const awaiting = invoices.filter((row) =>
          ["issued", "partially_paid"].includes(row.status),
        ).length;
        if (drafts) {
          items.push(
            notification(
              "billing-drafts",
              `${drafts} invoice draft${drafts === 1 ? "" : "s"} awaiting issue`,
              "Issue drafts from billing so patients can be charged.",
              "warning",
              "/dashboard/service-charges",
            ),
          );
        }
        if (awaiting) {
          items.push(
            notification(
              "billing-payments",
              `${awaiting} invoice${awaiting === 1 ? "" : "s"} awaiting payment`,
              "Review the latest payments and outstanding balances.",
              "info",
              "/dashboard/service-charges",
            ),
          );
        }
      } else if (admin) {
        const drafts = admin.billingInvoices.filter(
          (row) => row.status === "draft",
        ).length;
        if (drafts) {
          items.push(
            notification(
              "billing-drafts",
              `${drafts} invoice draft${drafts === 1 ? "" : "s"} awaiting issue`,
              "Issue drafts from billing so patients can be charged.",
              "warning",
              "/dashboard/service-charges",
            ),
          );
        }
      }
      break;
    case "today-schedule":
    case "doctor-appointments":
      if (doctor) {
        if (doctor.notifications.length) {
          items.push(...doctor.notifications);
        } else if (doctor.appointmentsToday) {
          items.push(
            notification(
              "doctor-appointments-today",
              `${doctor.appointmentsToday} appointment${doctor.appointmentsToday === 1 ? "" : "s"} on your list today`,
              "Review the schedule before your next consultation.",
              "info",
              "/dashboard/today-schedule",
            ),
          );
        }
      }
      break;
    case "results-to-review":
      if (doctor?.resultsToReview) {
        items.push(
          notification(
            "doctor-results",
            `${doctor.resultsToReview} lab result${doctor.resultsToReview === 1 ? "" : "s"} to review`,
            "Preliminary results are waiting for your review.",
            "warning",
            "/dashboard/results-to-review",
          ),
        );
      }
      break;
    case "recent-notes":
      if (doctor?.draftNotes) {
        items.push(
          notification(
            "doctor-draft-notes",
            `${doctor.draftNotes} draft note${doctor.draftNotes === 1 ? "" : "s"} awaiting signature`,
            "Finish and sign your open clinical notes.",
            "warning",
            "/dashboard/recent-notes",
          ),
        );
      }
      break;
    case "your-patients":
      if (doctor?.openEncounters) {
        items.push(
          notification(
            "doctor-open-encounters",
            `${doctor.openEncounters} open encounter${doctor.openEncounters === 1 ? "" : "s"}`,
            "Close or follow up on encounters assigned to you.",
            "info",
            "/dashboard/your-patients",
          ),
        );
      }
      break;
    case "care-queue":
      if (nurse) {
        if (nurse.queue.length) {
          items.push(
            notification(
              "nurse-care-queue",
              `${nurse.queue.length} task${nurse.queue.length === 1 ? "" : "s"} in the care queue`,
              "Samples and orders are waiting for the floor team.",
              "warning",
              "/dashboard/care-queue",
            ),
          );
        }
        if (nurse.notes.length) {
          items.push(
            notification(
              "nurse-handoffs",
              `${nurse.notes.length} handoff note${nurse.notes.length === 1 ? "" : "s"} for the next shift`,
              "Read the latest doctor handoffs before handover.",
              "info",
              "/dashboard/handoff-notes",
            ),
          );
        }
      }
      break;
    case "handoff-notes":
      if (nurse?.notes.length) {
        items.push(
          notification(
            "nurse-handoffs",
            `${nurse.notes.length} handoff note${nurse.notes.length === 1 ? "" : "s"} for the next shift`,
            "Read the latest doctor handoffs before handover.",
            "info",
            "/dashboard/handoff-notes",
          ),
        );
      }
      break;
    case "sample-queue":
      if (lab?.pendingSamples) {
        items.push(
          notification(
            "lab-samples",
            `${lab.pendingSamples} sample${lab.pendingSamples === 1 ? "" : "s"} waiting`,
            "Collect and process the latest laboratory samples.",
            "warning",
            "/dashboard/sample-queue",
          ),
        );
      }
      break;
    case "lab-results":
      if (lab?.resultsToVerify) {
        items.push(
          notification(
            "lab-results",
            `${lab.resultsToVerify} result${lab.resultsToVerify === 1 ? "" : "s"} to verify`,
            "Preliminary results need laboratory verification.",
            "warning",
            "/dashboard/lab-results",
          ),
        );
      }
      break;
    case "prescription-queue":
      if (pharmacist?.pendingPrescriptions) {
        items.push(
          notification(
            "pharmacy-prescriptions",
            `${pharmacist.pendingPrescriptions} prescription${pharmacist.pendingPrescriptions === 1 ? "" : "s"} to dispense`,
            "New prescription lines are waiting in the pharmacy queue.",
            "warning",
            "/dashboard/prescription-queue",
          ),
        );
      }
      break;
    case "dispensing-history":
      if (pharmacist?.dispensesToday) {
        items.push(
          notification(
            "pharmacy-dispenses",
            `${pharmacist.dispensesToday} dispense${pharmacist.dispensesToday === 1 ? "" : "s"} recorded today`,
            "Review your latest pharmacy hand-offs.",
            "info",
            "/dashboard/dispensing-history",
          ),
        );
      }
      break;
    case "pharmacy-stock":
      if (pharmacist) {
        const low = lowStockCount(pharmacist.medicineStock);
        if (low) {
          items.push(
            notification(
              "pharmacy-low-stock",
              `${low} medicine${low === 1 ? "" : "s"} low on stock`,
              "Review stock on hand before the next dispense.",
              "danger",
              "/dashboard/pharmacy-stock",
            ),
          );
        }
      }
      break;
    case "reception-schedule":
      if (receptionist) {
        if (receptionist.appointmentsToday) {
          items.push(
            notification(
              "reception-appointments",
              `${receptionist.appointmentsToday} appointment${receptionist.appointmentsToday === 1 ? "" : "s"} at the front desk today`,
              "Review today's schedule and doctor availability.",
              "info",
              "/dashboard/reception-schedule",
            ),
          );
        }
        if (receptionist.registrations.length) {
          items.push(
            notification(
              "patient-approvals",
              `${receptionist.registrations.length} patient${receptionist.registrations.length === 1 ? "" : "s"} waiting for approval`,
              "Approve new patient accounts so their dashboard can open.",
              "warning",
              "/dashboard/patient-approvals",
            ),
          );
        }
      }
      break;
    case "patient-register":
      if (receptionist) {
        if (receptionist.newPatients) {
          items.push(
            notification(
              "reception-new-patients",
              `${receptionist.newPatients} new patient record${receptionist.newPatients === 1 ? "" : "s"}`,
              "Review the latest registrations and admissions.",
              "info",
              "/dashboard/patient-register",
            ),
          );
        }
        if (receptionist.activeAdmissions) {
          items.push(
            notification(
              "reception-admissions",
              `${receptionist.activeAdmissions} active admission${receptionist.activeAdmissions === 1 ? "" : "s"}`,
              "Patients currently occupying a ward bed.",
              "info",
              "/dashboard/patient-register",
            ),
          );
        }
      }
      break;
    case "patient-approvals":
      if (receptionist?.registrations.length) {
        items.push(
          notification(
            "patient-approvals",
            `${receptionist.registrations.length} patient${receptionist.registrations.length === 1 ? "" : "s"} waiting for approval`,
            "Approve new patient accounts so their dashboard can open.",
            "warning",
            "/dashboard/patient-approvals",
          ),
        );
      }
      break;
    case "insurance-policies":
      if (insurance) {
        const active = insurance.policies.filter(
          (row) => row.status === "active",
        ).length;
        if (active) {
          items.push(
            notification(
              "insurance-active-policies",
              `${active} active polic${active === 1 ? "y" : "ies"} on file`,
              "Review cover before raising or settling a claim.",
              "info",
              "/dashboard/insurance-policies",
            ),
          );
        }
      }
      break;
    case "insurance-claims":
      if (insurance) {
        const open = insurance.claims.filter(
          (row) => row.status === "submitted",
        ).length;
        if (open) {
          items.push(
            notification(
              "insurance-open-claims",
              `${open} claim${open === 1 ? "" : "s"} awaiting review`,
              "Approve, reject or mark the latest claims paid.",
              "warning",
              "/dashboard/insurance-claims",
            ),
          );
        }
      }
      break;
    case "hospital-admin-approvals":
      if (Array.isArray(data)) {
        const pending = data.filter(
          (row) => isRecord(row) && row["status"] === "pending",
        ).length;
        if (pending) {
          items.push(
            notification(
              "hospital-requests",
              `${pending} hospital request${pending === 1 ? "" : "s"} pending`,
              "Review new hospital administrator registrations.",
              "warning",
              "/dashboard/hospital-admin-approvals",
            ),
          );
        }
      }
      break;
    default:
      break;
  }

  return items;
}

/** Notifications for a role's overview dashboard. */
export function buildOverviewNotifications(
  role: StaffRole,
  data: unknown,
): AdminNotification[] {
  const items: AdminNotification[] = [];
  const nurse = isNurseData(data) ? data : null;
  const lab = isLabTechnicianData(data) ? data : null;
  const pharmacist = isPharmacistData(data) ? data : null;
  const receptionist = isReceptionistData(data) ? data : null;
  const insurance = isInsuranceData(data) ? data : null;

  if (role === "nurse" && nurse) {
    if (nurse.queue.length) {
      items.push(
        notification(
          "overview-nurse-queue",
          `${nurse.queue.length} task${nurse.queue.length === 1 ? "" : "s"} in the care queue`,
          "Samples and orders are waiting for the floor team.",
          "warning",
          "/dashboard/care-queue",
        ),
      );
    }
    if (nurse.notes.length) {
      items.push(
        notification(
          "overview-nurse-handoffs",
          `${nurse.notes.length} handoff note${nurse.notes.length === 1 ? "" : "s"} for the next shift`,
          "Read the latest doctor handoffs before handover.",
          "info",
          "/dashboard/handoff-notes",
        ),
      );
    }
  }

  if (role === "lab_technician" && lab) {
    if (lab.pendingSamples) {
      items.push(
        notification(
          "overview-lab-samples",
          `${lab.pendingSamples} sample${lab.pendingSamples === 1 ? "" : "s"} waiting`,
          "Collect and process the latest laboratory samples.",
          "warning",
          "/dashboard/sample-queue",
        ),
      );
    }
    if (lab.resultsToVerify) {
      items.push(
        notification(
          "overview-lab-results",
          `${lab.resultsToVerify} result${lab.resultsToVerify === 1 ? "" : "s"} to verify`,
          "Preliminary results need laboratory verification.",
          "warning",
          "/dashboard/lab-results",
        ),
      );
    }
  }

  if (role === "pharmacist" && pharmacist) {
    if (pharmacist.pendingPrescriptions) {
      items.push(
        notification(
          "overview-pharmacy-prescriptions",
          `${pharmacist.pendingPrescriptions} prescription${pharmacist.pendingPrescriptions === 1 ? "" : "s"} to dispense`,
          "New prescription lines are waiting in the pharmacy queue.",
          "warning",
          "/dashboard/prescription-queue",
        ),
      );
    }
    const low = lowStockCount(pharmacist.medicineStock);
    if (low) {
      items.push(
        notification(
          "overview-pharmacy-stock",
          `${low} medicine${low === 1 ? "" : "s"} low on stock`,
          "Review stock on hand before the next dispense.",
          "danger",
          "/dashboard/pharmacy-stock",
        ),
      );
    }
  }

  if (role === "receptionist" && receptionist) {
    if (receptionist.registrations.length) {
      items.push(
        notification(
          "overview-patient-approvals",
          `${receptionist.registrations.length} patient${receptionist.registrations.length === 1 ? "" : "s"} waiting for approval`,
          "Approve new patient accounts so their dashboard can open.",
          "warning",
          "/dashboard/patient-approvals",
        ),
      );
    }
    if (receptionist.outstandingInvoices) {
      items.push(
        notification(
          "overview-reception-invoices",
          `${receptionist.outstandingInvoices} outstanding invoice${receptionist.outstandingInvoices === 1 ? "" : "s"}`,
          "Review issued invoices and payments.",
          "info",
          "/dashboard/reception-billing",
        ),
      );
    }
  }

  if (role === "insurance" && insurance) {
    const open = insurance.claims.filter(
      (row) => row.status === "submitted",
    ).length;
    if (open) {
      items.push(
        notification(
          "overview-insurance-claims",
          `${open} claim${open === 1 ? "" : "s"} awaiting review`,
          "Approve, reject or mark the latest claims paid.",
          "warning",
          "/dashboard/insurance-claims",
        ),
      );
    }
  }

  return items;
}
