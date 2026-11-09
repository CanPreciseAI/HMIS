import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BedDouble,
  Building2,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  FileText,
  FlaskConical,
  Loader2,
  NotebookPen,
  Pill,
  Plus,
  Receipt,
  Search,
  Send,
  ShieldCheck,
  TestTubes,
  Trash2,
  UserCheck,
  Users,
  Warehouse,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  ROLE_LABELS,
  greeting,
  loadAdminData,
  loadDoctorData,
  loadFacilityInvoices,
  loadHospitalAdminRequests,
  loadPlatformHospitalRecords,
  loadPlatformStaffRecords,
  loadLabTechnicianData,
  createChargeCatalogEntry,
  loadAdminNotifications,
  loadInvoiceChargeOptions,
  loadReceptionistNotifications,
  loadNurseData,
  loadPharmacistData,
  loadReceptionistData,
  loadStaffApprovalRequests,
  loadStaffContext,
  loadWardSectionData,
  loadInvoicePatientOptions,
  loadInsuranceData,
  formatDate,
  money,
  type AdminData,
  type ApprovalRow,
  type DoctorData,
  type InsuranceData,
  type HospitalAdminRequestRow,
  type PlatformHospitalRecord,
  type PlatformStaffRecord,
  type InvoiceRow,
  type AdminNotification,
  type InvoiceChargeOption,
  type InvoicePatientOption,
  type LabTechnicianData,
  loadMedicineCatalog,
  type MedicineCatalogEntry,
  type NurseData,
  type PharmacistData,
  type ReceptionistData,
  type StaffContext,
  type WardBed,
  type WardSectionData,
} from "@/features/dashboard/data";
import {
  DashboardShell,
  PageHeading,
  type NavItem,
} from "@/features/dashboard/shell";
import { ErrorBlock, LoadingBlock } from "@/features/dashboard/doctor";
import { DOCTOR_NAV } from "@/features/dashboard/doctor-nav";
import {
  EmptyState,
  FlowChart,
  LinkRow,
  Panel,
  StatusPill,
  WardMeter,
} from "@/features/dashboard/ui";
import { supabase } from "@/integrations/supabase/client";
import {
  MedicineCatalogManagement,
  MedicineCatalogReference,
} from "@/features/dashboard/medicine-catalog";
import { PatientFlowManagement } from "@/features/dashboard/patient-flow";
import { DepartmentStaffManagement } from "@/features/dashboard/departments";
import { WardCapacityManagement } from "@/features/dashboard/ward-capacity";
import { WardVisualizationPanel } from "@/features/dashboard/ward-map";
import { PatientApprovals } from "@/features/dashboard/patient-approvals";
import { ReceptionAdmissionsPanel } from "@/features/dashboard/reception-admissions";
import { DoctorAppointmentsPanel } from "@/features/dashboard/doctor-appointments";
import { AppointmentScheduler } from "@/features/dashboard/appointment-scheduler";
import { ServiceEntryPanel } from "@/features/dashboard/service-entries";
import {
  InsuranceClaimsPanel,
  InsurancePoliciesPanel,
} from "@/features/dashboard/insurance";
import { PrescriptionQueuePanel } from "@/features/dashboard/prescription-queue";
import { PharmacyStockPanel } from "@/features/dashboard/pharmacy-stock";
import { PaymentLedgerPanel } from "@/features/dashboard/payment-ledger";
import { PrescriptionWriterPanel } from "@/features/dashboard/prescription-writer";
import { buildSectionNotifications } from "@/features/dashboard/section-notifications";
import { HandoffNotePanel } from "@/features/dashboard/handoff-note";
import {
  HospitalAdminRequestList,
  PlatformHospitalRecords,
  PlatformStaffRecords,
} from "@/features/dashboard/platform-admin";

export const Route = createFileRoute("/_authenticated/dashboard/$section")({
  head: () => ({ meta: [{ title: "Workspace details — CanPreciseAI" }] }),
  component: DashboardSectionPage,
});

type Section =
  | "patient-flow"
  | "ward-capacity"
  | "departments"
  | "medicine-catalog"
  | "billing"
  | "staff-approvals"
  | "hospital-admin-approvals"
  | "hospital-records"
  | "staff-records"
  | "doctor-appointments"
  | "today-schedule"
  | "your-patients"
  | "results-to-review"
  | "recent-notes"
  | "write-prescription"
  | "care-queue"
  | "handoff-notes"
  | "sample-queue"
  | "lab-results"
  | "prescription-queue"
  | "dispensing-history"
  | "pharmacy-stock"
  | "reception-schedule"
  | "patient-register"
  | "patient-approvals"
  | "insurance-policies"
  | "insurance-claims"
  | "reception-billing"
  | "service-charges"
  | "invoices";

const SECTION_DETAILS: Record<
  Section,
  { role: StaffContext["role"][]; title: string; subtitle: string }
> = {
  "patient-flow": {
    role: ["hospital_admin"],
    title: "Patient flow",
    subtitle: "Admissions and discharges across the last seven days.",
  },
  "ward-capacity": {
    role: [
      "hospital_admin",
      "nurse",
      "doctor",
      "lab_technician",
      "receptionist",
    ],
    title: "Ward map",
    subtitle: "Visual ward map with bed occupancy and patient placements.",
  },
  departments: {
    role: ["hospital_admin"],
    title: "Departments",
    subtitle: "Staffing levels across departments in your facility.",
  },
  "medicine-catalog": {
    role: ["hospital_admin"],
    title: "Medicine catalog",
    subtitle: "Maintain the shared medicine reference for your hospital.",
  },
  billing: {
    role: ["hospital_admin"],
    title: "Billing",
    subtitle:
      "Patient payments and invoice status, with the staff looking after each patient.",
  },
  "staff-approvals": {
    role: ["hospital_admin"],
    title: "Staff approvals",
    subtitle: "Review staff access requests before granting workspace access.",
  },
  "hospital-admin-approvals": {
    role: ["admin"],
    title: "Hospital administrator approvals",
    subtitle: "Review applications to create a hospital workspace.",
  },
  "hospital-records": {
    role: ["admin"],
    title: "Hospitals",
    subtitle: "Hospital workspaces and their facility records.",
  },
  "staff-records": {
    role: ["admin"],
    title: "Staff records",
    subtitle: "Employee records across all hospital workspaces.",
  },
  "doctor-appointments": {
    role: ["doctor"],
    title: "Today's schedule",
    subtitle:
      "Appointments reception booked with you — confirm whether you can attend.",
  },
  "today-schedule": {
    role: ["doctor"],
    title: "Today's schedule",
    subtitle:
      "Review the appointments reception booked with you and confirm whether you can attend.",
  },
  "your-patients": {
    role: ["doctor"],
    title: "Your patients",
    subtitle: "Recent encounters assigned to your care.",
  },
  "results-to-review": {
    role: ["doctor"],
    title: "Results to review",
    subtitle: "Critical laboratory results requiring clinical attention.",
  },
  "recent-notes": {
    role: ["doctor"],
    title: "Recent notes",
    subtitle: "Clinical notes you have recently authored.",
  },
  "write-prescription": {
    role: ["doctor"],
    title: "Write prescription",
    subtitle:
      "Prescribe medicines for a patient — every line goes straight to the pharmacy.",
  },
  "care-queue": {
    role: ["nurse"],
    title: "Care queue",
    subtitle: "Ordered laboratory samples waiting to be collected.",
  },
  "handoff-notes": {
    role: ["nurse"],
    title: "Handoff notes",
    subtitle: "Latest clinical notes available for unit handover.",
  },
  "sample-queue": {
    role: ["lab_technician"],
    title: "Sample queue",
    subtitle: "Samples awaiting collection or processing in your hospital.",
  },
  "lab-results": {
    role: ["lab_technician"],
    title: "Results to verify",
    subtitle: "Preliminary laboratory results awaiting verification.",
  },
  "prescription-queue": {
    role: ["pharmacist"],
    title: "Prescription queue",
    subtitle: "Active prescriptions with quantities still to dispense.",
  },
  "dispensing-history": {
    role: ["pharmacist"],
    title: "Dispensing history",
    subtitle: "Your pharmacy hand-offs recorded today.",
  },
  "pharmacy-stock": {
    role: ["pharmacist"],
    title: "Stock on hand",
    subtitle: "Available inventory by item and active facility location.",
  },
  "reception-schedule": {
    role: ["receptionist"],
    title: "Appointments",
    subtitle:
      "Book patients with the doctor who has the most room in their day.",
  },
  "patient-register": {
    role: ["receptionist"],
    title: "Patient admission",
    subtitle:
      "Admit a patient to a ward, then review the patients registered today.",
  },
  "patient-approvals": {
    role: ["receptionist"],
    title: "Patient approvals",
    subtitle:
      "Review new patient accounts and link each one to a patient record.",
  },
  "insurance-policies": {
    role: ["insurance"],
    title: "Insurance policies",
    subtitle: "Cover held by patients treated at this hospital.",
  },
  "insurance-claims": {
    role: ["insurance"],
    title: "Claims",
    subtitle: "Claims raised against active policies, and their decisions.",
  },
  "service-charges": {
    role: [
      "hospital_admin",
      "nurse",
      "lab_technician",
      "pharmacist",
      "receptionist",
    ],
    title: "Billing",
    subtitle:
      "Services and charges, invoices and payments in one place for this facility.",
  },
  "reception-billing": {
    role: ["receptionist"],
    title: "Billing",
    subtitle:
      "Services and charges, invoices and payments in one place for this facility.",
  },
  invoices: {
    role: ["pharmacist"],
    title: "Billing",
    subtitle:
      "Services and charges, invoices and payments in one place for this facility.",
  },
};

type MedicineCatalogSectionData = {
  medicineCatalog: MedicineCatalogEntry[];
};

type WardBedsSectionData = {
  wardBeds: WardBed[];
};

const NAV: Record<StaffContext["role"], NavItem[]> = {
  admin: [
    { label: "Overview", href: "/dashboard", icon: CalendarDays },
    {
      label: "Hospital admin approvals",
      href: "/dashboard/hospital-admin-approvals",
      icon: UserCheck,
    },
    {
      label: "Hospitals",
      href: "/dashboard/hospital-records",
      icon: Building2,
    },
    { label: "Staff records", href: "/dashboard/staff-records", icon: Users },
  ],
  hospital_admin: [
    { label: "Overview", href: "/dashboard", icon: CalendarDays },
    {
      label: "Patient flow",
      href: "/dashboard/patient-flow",
      icon: CalendarRange,
    },
    {
      label: "Ward capacity",
      href: "/dashboard/ward-capacity",
      icon: BedDouble,
    },
    { label: "Departments", href: "/dashboard/departments", icon: Building2 },
    {
      label: "Stock & medicines",
      href: "/dashboard/medicine-catalog",
      icon: Pill,
    },
    { label: "Billing", href: "/dashboard/service-charges", icon: Receipt },
    {
      label: "Staff approvals",
      href: "/dashboard/staff-approvals",
      icon: UserCheck,
    },
  ],
  doctor: DOCTOR_NAV,
  nurse: [
    { label: "Overview", href: "/dashboard", icon: ClipboardList },
    { label: "Care queue", href: "/dashboard/care-queue", icon: ClipboardList },
    {
      label: "Ward capacity",
      href: "/dashboard/ward-capacity",
      icon: BedDouble,
    },
    {
      label: "Handoff notes",
      href: "/dashboard/handoff-notes",
      icon: NotebookPen,
    },
    { label: "Billing", href: "/dashboard/service-charges", icon: Receipt },
  ],
  lab_technician: [
    { label: "Overview", href: "/dashboard", icon: FlaskConical },
    { label: "Wards", href: "/dashboard/ward-capacity", icon: BedDouble },
    { label: "Sample queue", href: "/dashboard/sample-queue", icon: TestTubes },
    {
      label: "Results to verify",
      href: "/dashboard/lab-results",
      icon: FileText,
    },
    { label: "Billing", href: "/dashboard/service-charges", icon: Receipt },
  ],
  pharmacist: [
    { label: "Overview", href: "/dashboard", icon: Pill },
    {
      label: "Prescription queue",
      href: "/dashboard/prescription-queue",
      icon: ClipboardList,
    },
    {
      label: "Dispensing history",
      href: "/dashboard/dispensing-history",
      icon: Receipt,
    },
    {
      label: "Stock on hand",
      href: "/dashboard/pharmacy-stock",
      icon: Warehouse,
    },
    { label: "Billing", href: "/dashboard/service-charges", icon: Receipt },
  ],
  receptionist: [
    { label: "Overview", href: "/dashboard", icon: CalendarDays },
    { label: "Wards", href: "/dashboard/ward-capacity", icon: BedDouble },
    {
      label: "Appointments & doctor load",
      href: "/dashboard/reception-schedule",
      icon: CalendarDays,
    },
    {
      label: "Patient admission",
      href: "/dashboard/patient-register",
      icon: Users,
    },
    {
      label: "Patient approvals",
      href: "/dashboard/patient-approvals",
      icon: UserCheck,
    },
    { label: "Billing", href: "/dashboard/service-charges", icon: Receipt },
  ],
  insurance: [
    { label: "Overview", href: "/dashboard", icon: ShieldCheck },
    {
      label: "Policies",
      href: "/dashboard/insurance-policies",
      icon: FileText,
    },
    {
      label: "Claims",
      href: "/dashboard/insurance-claims",
      icon: ClipboardList,
    },
  ],
};

function isSection(value: string): value is Section {
  return Object.hasOwn(SECTION_DETAILS, value);
}

function isHospitalAdminRequestList(
  value: unknown,
): value is HospitalAdminRequestRow[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row: unknown) =>
        typeof row === "object" && row !== null && "hospital_name" in row,
    )
  );
}

function isPlatformHospitalRecordList(
  value: unknown,
): value is PlatformHospitalRecord[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row: unknown) =>
        typeof row === "object" &&
        row !== null &&
        "id" in row &&
        "name" in row &&
        "slug" in row &&
        "status" in row &&
        "facilities" in row &&
        Array.isArray(row.facilities),
    )
  );
}

function isPlatformStaffRecordList(
  value: unknown,
): value is PlatformStaffRecord[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row: unknown) =>
        typeof row === "object" &&
        row !== null &&
        "id" in row &&
        "employeeCode" in row &&
        "employmentStatus" in row &&
        "hospitalName" in row &&
        "roles" in row &&
        Array.isArray(row.roles),
    )
  );
}

function isInvoiceRecordList(value: unknown): value is InvoiceRow[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row: unknown) =>
        typeof row === "object" &&
        row !== null &&
        "id" in row &&
        "number" in row &&
        "patient" in row &&
        "items" in row &&
        Array.isArray(row.items) &&
        "amount" in row &&
        typeof row.amount === "number",
    )
  );
}

function isMedicineCatalogSectionData(
  value: unknown,
): value is MedicineCatalogSectionData {
  return (
    typeof value === "object" &&
    value !== null &&
    "medicineCatalog" in value &&
    Array.isArray(value.medicineCatalog)
  );
}

function isMedicineCatalogEntries(
  value: unknown,
): value is MedicineCatalogEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        typeof row.id === "string" &&
        typeof row.tenant_id === "string" &&
        typeof row.medicine_code === "string" &&
        typeof row.name === "string" &&
        typeof row.strength === "string" &&
        typeof row.dosage_form === "string" &&
        typeof row.status === "string",
    )
  );
}

async function loadHospitalAdminSectionData(
  context: StaffContext,
  section: Section,
): Promise<
  AdminData | Pick<AdminData, "approvals" | "pendingApprovals"> | InvoiceRow[]
> {
  if (section === "billing") return loadFacilityInvoices(context);
  if (section !== "staff-approvals") return loadAdminData(context);
  if (!context.tenantId) {
    throw new Error("Your hospital workspace is missing its hospital ID.");
  }

  const approvals = await loadStaffApprovalRequests(context.tenantId);
  return { approvals, pendingApprovals: approvals.length };
}

function DashboardSectionPage() {
  const { section: rawSection } = Route.useParams();
  const navigate = useNavigate();
  const [ctx, setCtx] = useState<StaffContext | null>(null);
  const [data, setData] = useState<
    | AdminData
    | Pick<AdminData, "approvals" | "pendingApprovals">
    | DoctorData
    | NurseData
    | LabTechnicianData
    | PharmacistData
    | ReceptionistData
    | MedicineCatalogSectionData
    | HospitalAdminRequestRow[]
    | PlatformHospitalRecord[]
    | PlatformStaffRecord[]
    | InvoiceRow[]
    | WardBedsSectionData
    | WardSectionData
    | InsuranceData
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewingHospitalRequest, setReviewingHospitalRequest] = useState<
    string | null
  >(null);
  const notifiedRequestIds = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    loadStaffContext()
      .then(async (staffContext) => {
        if (!staffContext)
          throw new Error("Your staff session could not be loaded.");
        if (cancelled) return;
        setCtx(staffContext);
        if (!isSection(rawSection)) {
          throw new Error("This dashboard page does not exist.");
        }
        if (!SECTION_DETAILS[rawSection].role.includes(staffContext.role)) {
          throw new Error(
            "This dashboard page is not available for your role.",
          );
        }
        const result = [
          "service-charges",
          "billing",
          "invoices",
          "reception-billing",
        ].includes(rawSection)
          ? await loadFacilityInvoices(staffContext)
          : rawSection === "ward-capacity" && staffContext.role !== "admin"
            ? staffContext.role === "hospital_admin"
              ? await loadAdminData(staffContext)
              : await loadWardSectionData(staffContext)
            : staffContext.role === "admin"
              ? rawSection === "hospital-admin-approvals"
                ? await loadHospitalAdminRequests()
                : rawSection === "hospital-records"
                  ? await loadPlatformHospitalRecords()
                  : rawSection === "staff-records"
                    ? await loadPlatformStaffRecords()
                    : null
              : staffContext.role === "hospital_admin"
                ? rawSection === "medicine-catalog"
                  ? {
                      medicineCatalog: await loadMedicineCatalog(
                        staffContext.tenantId ?? "",
                      ),
                    }
                  : await loadHospitalAdminSectionData(staffContext, rawSection)
                : staffContext.role === "doctor"
                  ? rawSection === "invoices"
                    ? await loadFacilityInvoices(staffContext)
                    : await loadDoctorData(staffContext)
                  : staffContext.role === "nurse"
                    ? rawSection === "invoices"
                      ? await loadFacilityInvoices(staffContext)
                      : await loadNurseData(staffContext)
                    : staffContext.role === "lab_technician"
                      ? rawSection === "invoices"
                        ? await loadFacilityInvoices(staffContext)
                        : await loadLabTechnicianData(staffContext)
                      : staffContext.role === "pharmacist"
                        ? rawSection === "invoices"
                          ? await loadFacilityInvoices(staffContext)
                          : await loadPharmacistData(staffContext)
                        : staffContext.role === "receptionist"
                          ? rawSection === "reception-billing"
                            ? await loadFacilityInvoices(staffContext)
                            : await loadReceptionistData(staffContext)
                          : staffContext.role === "insurance"
                            ? await loadInsuranceData(staffContext)
                            : null;
        if (!result)
          throw new Error("No dashboard modules are configured for your role.");
        if (!cancelled) setData(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load this page.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rawSection]);

  const isAdminDataLoaded = data !== null && "approvals" in data;

  useEffect(() => {
    if (ctx?.role !== "hospital_admin" || !ctx.tenantId || !isAdminDataLoaded)
      return;

    const tenantId = ctx.tenantId;
    const channel = supabase
      .channel(`dashboard-staff-approvals-${ctx.userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "staff_approval_requests",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const requestId = payload.new["id"];
          if (
            typeof requestId !== "string" ||
            notifiedRequestIds.current.has(requestId)
          ) {
            return;
          }
          notifiedRequestIds.current.add(requestId);

          void (async () => {
            const { data: request, error: requestError } = await supabase
              .from("staff_approval_requests")
              .select(
                "id, full_name, email, phone, requested_role, submitted_at",
              )
              .eq("tenant_id", tenantId)
              .eq("id", requestId)
              .eq("status", "pending")
              .maybeSingle();

            if (requestError) {
              toast.error(
                `Could not load the new staff request: ${requestError.message}`,
              );
              return;
            }
            if (!request) return;

            setData((current) => {
              if (!current || !("approvals" in current)) return current;
              if (current.approvals.some((row) => row.id === request.id)) {
                return current;
              }
              const approvals = [...current.approvals, request].sort(
                (a, b) =>
                  new Date(a.submitted_at).getTime() -
                  new Date(b.submitted_at).getTime(),
              );
              return {
                ...current,
                approvals,
                pendingApprovals: approvals.length,
              };
            });
            toast.info(`New staff request from ${request.full_name}`, {
              description: "Open staff approvals to review this request.",
              action: {
                label: "Review",
                onClick: () =>
                  navigate({
                    to: "/dashboard/$section",
                    params: { section: "staff-approvals" },
                  }),
              },
            });
          })();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "staff_approval_requests",
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          if (
            payload.new["status"] !== "pending" &&
            typeof payload.new["id"] === "string"
          ) {
            setData((current) => {
              if (!current || !("approvals" in current)) return current;
              const approvals = current.approvals.filter(
                (row) => row.id !== payload.new["id"],
              );
              return {
                ...current,
                approvals,
                pendingApprovals: approvals.length,
              };
            });
          }
        },
      )
      .subscribe((status, subscriptionError) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(
            "Staff approval notifications could not connect",
            subscriptionError ?? status,
          );
          toast.error("Live staff approval notifications are unavailable.");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ctx?.role, ctx?.tenantId, ctx?.userId, isAdminDataLoaded, navigate]);

  useEffect(() => {
    if (ctx?.role !== "admin" || !Array.isArray(data)) return;

    const channel = supabase
      .channel(`dashboard-hospital-requests-${ctx.userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "hospital_admin_registration_requests",
        },
        (payload) => {
          const requestId = payload.new["id"];
          if (typeof requestId !== "string") return;
          void (async () => {
            const { data: request, error: requestError } = await supabase
              .from("hospital_admin_registration_requests")
              .select(
                "id, hospital_name, full_name, email, phone, submitted_at",
              )
              .eq("id", requestId)
              .eq("status", "pending")
              .maybeSingle();
            if (requestError) {
              toast.error(
                `Could not load the new hospital request: ${requestError.message}`,
              );
              return;
            }
            if (!request) return;
            setData((current) => {
              if (!isHospitalAdminRequestList(current)) return current;
              return current.some((row) => row.id === request.id)
                ? current
                : [...current, request].sort(
                    (a, b) =>
                      new Date(a.submitted_at).getTime() -
                      new Date(b.submitted_at).getTime(),
                  );
            });
            toast.info(`New hospital request from ${request.full_name}`);
          })();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "hospital_admin_registration_requests",
        },
        (payload) => {
          if (
            payload.new["status"] !== "pending" &&
            typeof payload.new["id"] === "string"
          ) {
            setData((current) =>
              isHospitalAdminRequestList(current)
                ? current.filter((row) => row.id !== payload.new["id"])
                : current,
            );
          }
        },
      )
      .subscribe((status, subscriptionError) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error(
            "Hospital admin approval notifications could not connect",
            subscriptionError ?? status,
          );
          toast.error(
            "Live hospital administrator notifications are unavailable.",
          );
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ctx?.role, ctx?.userId, data]);

  const [extraNotifications, setExtraNotifications] = useState<
    AdminNotification[] | null
  >(null);
  useEffect(() => {
    if (!ctx) return;
    if (ctx.role === "hospital_admin") {
      if (data && "notifications" in data) {
        setExtraNotifications(data.notifications);
        return;
      }
      let cancelledForAdmin = false;
      void loadAdminNotifications(ctx)
        .then((rows) => {
          if (!cancelledForAdmin) setExtraNotifications(rows);
        })
        .catch(() => {
          if (!cancelledForAdmin) setExtraNotifications([]);
        });
      return () => {
        cancelledForAdmin = true;
      };
    }
    if (ctx.role === "receptionist") {
      let cancelledForReception = false;
      void loadReceptionistNotifications()
        .then((rows) => {
          if (!cancelledForReception) setExtraNotifications(rows);
        })
        .catch(() => {
          if (!cancelledForReception) setExtraNotifications([]);
        });
      return () => {
        cancelledForReception = true;
      };
    }
    setExtraNotifications(null);
    return () => {
      // Other roles do not show a notification bell.
    };
  }, [ctx, data]);

  async function reviewHospitalRequest(id: string, approved: boolean) {
    setReviewingHospitalRequest(id);
    const { error: reviewError } = await supabase.rpc(
      "review_hospital_admin_registration",
      { _request_id: id, _approved: approved },
    );
    setReviewingHospitalRequest(null);
    if (reviewError) {
      toast.error(reviewError.message);
      return;
    }
    setData((current) =>
      isHospitalAdminRequestList(current)
        ? current.filter((row) => row.id !== id)
        : current,
    );
    toast.success(
      approved
        ? "Hospital administrator approved and hospital created"
        : "Hospital administrator request rejected",
    );
  }

  if (!ctx) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        {loading ? (
          <Loader2 className="size-6 animate-spin" />
        ) : (
          <ErrorBlock message={error ?? "Workspace unavailable."} />
        )}
      </div>
    );
  }

  const section = isSection(rawSection) ? SECTION_DETAILS[rawSection] : null;
  const title = section?.title ?? "Workspace details";
  const subtitle =
    section?.subtitle ?? "Choose a workspace page from the navigation.";
  const approvals = data && "approvals" in data ? data.approvals : [];
  const hospitalRequests = isHospitalAdminRequestList(data) ? data : [];
  const notificationsForBell: AdminNotification[] =
    ctx.role === "hospital_admin" ||
    ctx.role === "receptionist" ||
    ctx.role === "doctor"
      ? (extraNotifications ??
        (data && "notifications" in data ? data.notifications : []))
      : [];
  const sectionNotifications =
    section && data ? buildSectionNotifications(rawSection, data) : [];
  const notificationItems = [
    ...sectionNotifications,
    ...notificationsForBell,
  ].filter(
    (item, index, all) =>
      all.findIndex((candidate) => candidate.id === item.id) === index,
  );

  return (
    <DashboardShell
      ctx={ctx}
      nav={NAV[ctx.role]}
      {...(notificationItems.length
        ? { notifications: notificationItems }
        : {})}
      {...(ctx.role === "admin" && hospitalRequests.length
        ? {
            notificationCount: hospitalRequests.length,
            notificationHref: "/dashboard/hospital-admin-approvals",
          }
        : {})}
    >
      <Link
        to="/dashboard"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="size-4" /> Back to overview
      </Link>
      <PageHeading title={title} subtitle={subtitle} />
      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}
      {!loading && !error && data && section && isSection(rawSection) && (
        <SectionContent
          section={rawSection}
          data={data}
          ctx={ctx}
          reviewingHospitalRequest={reviewingHospitalRequest}
          onHospitalRequestReview={reviewHospitalRequest}
          onApprovalsChange={(next) =>
            setData((current) =>
              current && "approvals" in current
                ? { ...current, approvals: next, pendingApprovals: next.length }
                : current,
            )
          }
        />
      )}
    </DashboardShell>
  );
}

function SectionContent({
  section,
  data,
  ctx,
  reviewingHospitalRequest,
  onHospitalRequestReview,
  onApprovalsChange,
}: {
  section: Section;
  data:
    | AdminData
    | Pick<AdminData, "approvals" | "pendingApprovals">
    | DoctorData
    | NurseData
    | LabTechnicianData
    | PharmacistData
    | ReceptionistData
    | MedicineCatalogSectionData
    | HospitalAdminRequestRow[]
    | PlatformHospitalRecord[]
    | PlatformStaffRecord[]
    | InvoiceRow[]
    | WardBedsSectionData
    | WardSectionData
    | InsuranceData;
  ctx: StaffContext;
  reviewingHospitalRequest: string | null;
  onHospitalRequestReview: (id: string, approved: boolean) => void;
  onApprovalsChange: (approvals: ApprovalRow[]) => void;
}) {
  if (
    section === "medicine-catalog" &&
    isMedicineCatalogSectionData(data) &&
    isMedicineCatalogEntries(data.medicineCatalog)
  ) {
    return (
      <MedicineCatalogManagement
        ctx={ctx}
        initialEntries={data.medicineCatalog}
      />
    );
  }

  if (section === "hospital-records" && isPlatformHospitalRecordList(data)) {
    return <PlatformHospitalRecords records={data} />;
  }
  if (section === "staff-records" && isPlatformStaffRecordList(data)) {
    return <PlatformStaffRecords records={data} />;
  }
  if (
    section === "hospital-admin-approvals" &&
    isHospitalAdminRequestList(data)
  ) {
    return (
      <HospitalAdminRequestList
        requests={data}
        reviewing={reviewingHospitalRequest}
        onReview={onHospitalRequestReview}
      />
    );
  }
  if (section === "write-prescription") {
    return <PrescriptionWriterPanel ctx={ctx} />;
  }
  if (section === "billing" && ctx.role === "hospital_admin") {
    return (
      <div className="space-y-5">
        <ServiceEntryPanel ctx={ctx} />
        <PaymentLedgerPanel ctx={ctx} />
      </div>
    );
  }
  if (
    section === "service-charges" ||
    section === "reception-billing" ||
    section === "invoices"
  ) {
    return <ServiceEntryPanel ctx={ctx} />;
  }
  if (section === "patient-flow" && "flow" in data && "patientFlow" in data) {
    return (
      <div className="space-y-5">
        <Panel
          title="Admissions and discharges"
          subtitle="Daily patient movement over the last seven days"
        >
          <FlowChart data={data.flow} />
        </Panel>
        <PatientFlowManagement ctx={ctx} initialRows={data.patientFlow} />
      </div>
    );
  }
  if (section === "ward-capacity" && "wardBeds" in data) {
    return (
      <div className="space-y-5">
        <WardVisualizationPanel
          ctx={ctx}
          beds={data.wardBeds}
          wards={"wardList" in data ? data.wardList : []}
          canEdit={ctx.role === "hospital_admin" || ctx.role === "nurse"}
        />
        {"wardPatients" in data && (
          <WardCapacityManagement
            ctx={ctx}
            wards={data.wards}
            patients={data.wardPatients}
            canEdit={
              ctx.role === "hospital_admin" ||
              ctx.role === "nurse" ||
              ctx.role === "doctor"
            }
          />
        )}
      </div>
    );
  }
  if (section === "ward-capacity") {
    const wards = "wards" in data ? data.wards : [];
    const bedsTotal =
      "bedsTotal" in data
        ? data.bedsTotal
        : wards.reduce((sum, ward) => sum + ward.total, 0);
    const bedsOccupied =
      "bedsOccupied" in data
        ? data.bedsOccupied
        : wards.reduce((sum, ward) => sum + ward.occupied, 0);
    return (
      <Panel
        title="Ward-by-ward occupancy"
        subtitle={`${bedsOccupied} of ${bedsTotal} active beds are occupied`}
      >
        {wards.length ? (
          <div className="space-y-5">
            {wards.map((ward) => (
              <WardMeter key={ward.ward} {...ward} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BedDouble}
            title="No ward data available"
            description="Active beds in your facility will appear here."
          />
        )}
      </Panel>
    );
  }
  if (section === "departments" && "departments" in data) {
    return (
      <DepartmentStaffManagement
        ctx={ctx}
        departments={data.departments}
        staff={data.departmentStaff}
      />
    );
  }
  if (section === "staff-approvals" && "approvals" in data) {
    return (
      <StaffApprovalList rows={data.approvals} onChange={onApprovalsChange} />
    );
  }
  if (
    (section === "today-schedule" || section === "doctor-appointments") &&
    "schedule" in data &&
    "openEncounters" in data
  ) {
    return (
      <div className="space-y-5">
        {ctx.role === "doctor" && <DoctorAppointmentsPanel ctx={ctx} />}
        <Panel
          title="Today's appointments"
          subtitle="Your appointments in time order"
        >
          {data.schedule.length ? (
            data.schedule.map((row) => (
              <LinkRow
                key={row.id}
                label={`${row.time} · ${row.patient}`}
                value={row.status.replaceAll("_", " ")}
                hint={`${row.number ?? "No MRN"}${row.reason ? ` · ${row.reason}` : ""}${row.location ? ` · ${row.location}` : ""}`}
              />
            ))
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No appointments booked"
              description="Appointments assigned to you for today will appear here."
            />
          )}
        </Panel>
      </div>
    );
  }
  if (
    section === "your-patients" &&
    "patients" in data &&
    "openEncounters" in data
  ) {
    return (
      <Panel
        title="Recent patient encounters"
        subtitle={`${data.openEncounters} encounters currently open`}
      >
        {data.patients.length ? (
          data.patients.map((row) => (
            <LinkRow
              key={row.id}
              label={row.name}
              value={row.status.replaceAll("_", " ")}
              hint={`${row.number ?? "No MRN"} · ${row.detail}`}
            />
          ))
        ) : (
          <EmptyState
            icon={Users}
            title="No encounters yet"
            description="Patients you open an encounter for will be listed here."
          />
        )}
      </Panel>
    );
  }
  if (section === "results-to-review" && "critical" in data) {
    return (
      <Panel
        title="Critical laboratory results"
        subtitle="Flagged results with patient and acknowledgement details"
      >
        {data.critical.length ? (
          data.critical.map((row) => (
            <LinkRow
              key={row.id}
              label={`${row.test} · ${row.patient}`}
              value={`${row.value}${row.unit ? ` ${row.unit}` : ""}`}
              hint={`${row.acknowledged ? "Acknowledged" : "Needs acknowledgement"}${row.at ? ` · ${new Date(row.at).toLocaleString()}` : ""}`}
            />
          ))
        ) : (
          <EmptyState
            icon={FlaskConical}
            title="No critical results"
            description="Critical laboratory results requiring review will appear here."
          />
        )}
      </Panel>
    );
  }
  if (section === "recent-notes" && "notes" in data) {
    return (
      <div className="space-y-5">
        <HandoffNotePanel ctx={ctx} />
        <Panel
          title="Recent clinical notes"
          subtitle={`${data.notes.length} recent notes`}
        >
          {data.notes.length ? (
            data.notes.map((row) => (
              <LinkRow
                key={row.id}
                label={`${row.type} · ${row.patient}`}
                value={row.status.replaceAll("_", " ")}
                hint={
                  row.at
                    ? new Date(row.at).toLocaleString()
                    : "Date unavailable"
                }
              />
            ))
          ) : (
            <EmptyState
              icon={NotebookPen}
              title="No notes recorded"
              description="Clinical notes will appear here as they are recorded."
            />
          )}
        </Panel>
      </div>
    );
  }
  if (
    section === "handoff-notes" &&
    "activeAdmissions" in data &&
    "queue" in data
  ) {
    return (
      <Panel
        title="Handoff notes from doctors"
        subtitle={`${data.notes.length} notes for the next shift`}
      >
        {data.notes.length ? (
          <ul className="divide-y divide-border">
            {data.notes.map((row) => (
              <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {row.patient} · {row.type}
                  </p>
                  <StatusPill status={row.status} />
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                  {row.content}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.author} · {new Date(row.at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={NotebookPen}
            title="No handoff notes yet"
            description="Notes doctors write for the next shift will appear here."
          />
        )}
      </Panel>
    );
  }
  if (section === "care-queue" && "queue" in data && "samplesPending" in data) {
    return (
      <Panel
        title="Samples waiting"
        subtitle="Ordered tests sorted by time submitted"
      >
        {data.queue.length ? (
          data.queue.map((row) => (
            <LinkRow
              key={row.id}
              label={`${row.title} · ${row.subtitle}`}
              value={row.status}
              hint={row.meta}
            />
          ))
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="Queue is clear"
            description="New laboratory orders will appear here."
          />
        )}
      </Panel>
    );
  }
  if (section === "sample-queue" && "pendingSamples" in data) {
    return (
      <Panel
        title="Samples awaiting processing"
        subtitle="Priority and accession details for open lab orders"
      >
        {data.queue.length ? (
          data.queue.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-2 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {row.test} · {row.patient}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.accession} · ordered{" "}
                  {new Date(row.orderedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill
                  status={row.priority === "stat" ? "urgent" : row.priority}
                />
                <StatusPill status={row.status} />
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            icon={TestTubes}
            title="No samples waiting"
            description="New laboratory orders will appear here."
          />
        )}
      </Panel>
    );
  }
  if (section === "lab-results" && "resultsToVerify" in data) {
    return (
      <Panel
        title="Preliminary laboratory results"
        subtitle="Patient, test and result values awaiting verification"
      >
        {data.results.length ? (
          data.results.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-2 border-b border-border py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {row.test} · {row.patient}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Recorded {new Date(row.at).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">
                  {row.value}
                  {row.unit ? ` ${row.unit}` : ""}
                </span>
                <StatusPill status={row.status} />
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            icon={FileText}
            title="No results awaiting verification"
            description="Preliminary results will be listed here."
          />
        )}
      </Panel>
    );
  }
  if (section === "prescription-queue") {
    return <PrescriptionQueuePanel ctx={ctx} />;
  }
  if (section === "dispensing-history" && "recentDispenses" in data) {
    return (
      <Panel
        title="Today's dispensing activity"
        subtitle={`${data.dispensesToday} dispenses recorded by you today`}
      >
        {data.recentDispenses.length ? (
          data.recentDispenses.map((row) => (
            <LinkRow
              key={row.id}
              label={`${row.medicine} · ${row.patient}`}
              value={`Qty ${row.quantity}`}
              hint={new Date(row.at).toLocaleString()}
            />
          ))
        ) : (
          <EmptyState
            icon={Pill}
            title="No dispenses recorded today"
            description="Your pharmacy dispensing activity will appear here."
          />
        )}
      </Panel>
    );
  }
  if (section === "pharmacy-stock" && "stock" in data) {
    return (
      <>
        <PharmacyStockPanel rows={data.medicineStock} />
        <Panel
          title="Item stock on hand"
          subtitle="On-hand quantity less reserved inventory, by storage location"
        >
          {data.stock.length ? (
            data.stock.map((row) => (
              <LinkRow
                key={row.id}
                label={row.item}
                value={String(row.quantity)}
                hint={row.location}
              />
            ))
          ) : (
            <EmptyState
              icon={Warehouse}
              title="No stock on hand"
              description="Inventory balances for active pharmacy locations will appear here."
            />
          )}
        </Panel>
        <div className="mt-5">
          <MedicineCatalogReference tenantId={ctx.tenantId} />
        </div>
      </>
    );
  }
  if (section === "reception-schedule") {
    return <AppointmentScheduler ctx={ctx} />;
  }
  if (section === "insurance-policies" && isInsuranceData(data)) {
    return <InsurancePoliciesPanel ctx={ctx} initial={data} />;
  }
  if (section === "insurance-claims" && isInsuranceData(data)) {
    return <InsuranceClaimsPanel ctx={ctx} initial={data} />;
  }
  if (section === "patient-approvals") {
    return (
      <PatientApprovals
        ctx={ctx}
        initialRows={"registrations" in data ? data.registrations : []}
      />
    );
  }
  if (
    section === "patient-register" &&
    "patients" in data &&
    "newPatients" in data
  ) {
    return (
      <div className="space-y-5">
        <ReceptionAdmissionsPanel ctx={ctx} />
        <Panel
          title="Recent patient registrations"
          subtitle="Latest patient records in your hospital"
        >
          {data.patients.length ? (
            data.patients.map((row) => (
              <LinkRow
                key={row.id}
                label={row.name}
                value={row.number ?? "No MRN"}
                hint={`${row.admitted ? "Admitted · " : ""}Registered ${formatDate(row.createdAt)}`}
              />
            ))
          ) : (
            <EmptyState
              icon={Users}
              title="No patient records yet"
              description="New patient registrations will appear here."
            />
          )}
        </Panel>
      </div>
    );
  }
  return (
    <EmptyState
      title="No details available"
      description="This section does not have any data to display yet."
    />
  );
}

function isInsuranceData(value: unknown): value is InsuranceData {
  return (
    typeof value === "object" &&
    value !== null &&
    "policies" in value &&
    "claims" in value
  );
}

function isInvoiceRow(
  row: InvoiceRow | HospitalAdminRequestRow,
): row is InvoiceRow {
  return "number" in row && "grossAmount" in row;
}

function InvoiceRecordsPanel({
  rows,
  ctx,
  canEdit,
  canInitiate,
}: {
  rows: (InvoiceRow | HospitalAdminRequestRow)[];
  ctx: StaffContext;
  canEdit: boolean;
  canInitiate: boolean;
}) {
  const [invoices, setInvoices] = useState(rows.filter(isInvoiceRow));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    grossAmount: string;
    discountAmount: string;
    taxAmount: string;
    status: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNewInvoice, setShowNewInvoice] = useState(false);

  function startEditing(invoice: InvoiceRow) {
    setEditingId(invoice.id);
    setDraft({
      grossAmount: String(invoice.grossAmount),
      discountAmount: String(invoice.discountAmount),
      taxAmount: String(invoice.taxAmount),
      status: invoice.status,
    });
  }

  async function issueInvoice(invoice: InvoiceRow) {
    if (!ctx.tenantId || !ctx.facilityId) return;
    setIssuingId(invoice.id);
    const issuedAt = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("invoices")
      .update({ status: "issued", issued_at: issuedAt })
      .eq("id", invoice.id)
      .eq("tenant_id", ctx.tenantId)
      .eq("facility_id", ctx.facilityId)
      .select("id")
      .maybeSingle();
    setIssuingId(null);
    if (error) {
      toast.error(`Could not issue invoice: ${error.message}`);
      return;
    }
    if (!updated) {
      toast.error(
        "Invoice could not be issued. Check access or refresh the page.",
      );
      return;
    }

    setInvoices((current) =>
      current.map((row) =>
        row.id === invoice.id ? { ...row, status: "issued", issuedAt } : row,
      ),
    );
    toast.success(`Invoice ${invoice.number} issued to ${invoice.patient}`);
  }

  async function markPaid(invoice: InvoiceRow) {
    if (!ctx.tenantId || !ctx.facilityId) return;
    const issuedAt = invoice.issuedAt ?? new Date().toISOString();
    setPayingId(invoice.id);
    const { data: updated, error } = await supabase
      .from("invoices")
      .update({ status: "paid", issued_at: issuedAt })
      .eq("id", invoice.id)
      .eq("tenant_id", ctx.tenantId)
      .eq("facility_id", ctx.facilityId)
      .select("id")
      .maybeSingle();
    setPayingId(null);
    if (error) {
      toast.error(`Could not mark invoice paid: ${error.message}`);
      return;
    }
    if (!updated) {
      toast.error(
        "Invoice could not be updated. Check access or refresh the page.",
      );
      return;
    }

    setInvoices((current) =>
      current.map((row) =>
        row.id === invoice.id ? { ...row, status: "paid", issuedAt } : row,
      ),
    );
    toast.success(`Invoice ${invoice.number} marked paid`);
  }

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const matchesStatus =
        statusFilter === "all" || invoice.status === statusFilter;
      const matchesSearch =
        !query ||
        [invoice.number, invoice.patient]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [invoices, search, statusFilter]);

  const totals = useMemo(() => {
    const awaiting = invoices.filter(
      (invoice) =>
        invoice.status === "issued" || invoice.status === "partially_paid",
    );
    return {
      invoiced: invoices
        .filter((invoice) =>
          ["issued", "partially_paid", "paid"].includes(invoice.status),
        )
        .reduce((sum, invoice) => sum + invoice.amount, 0),
      awaiting: awaiting.reduce((sum, invoice) => sum + invoice.amount, 0),
      awaitingCount: awaiting.length,
      paid: invoices
        .filter((invoice) => invoice.status === "paid")
        .reduce((sum, invoice) => sum + invoice.amount, 0),
      drafts: invoices.filter((invoice) => invoice.status === "draft").length,
    };
  }, [invoices]);

  async function saveInvoice(invoice: InvoiceRow) {
    if (!draft || !ctx.tenantId || !ctx.facilityId) return;
    const grossAmount = Number(draft.grossAmount);
    const discountAmount = Number(draft.discountAmount);
    const taxAmount = Number(draft.taxAmount);
    const status = draft.status;
    if (
      ![grossAmount, discountAmount, taxAmount].every(
        (value) => Number.isFinite(value) && value >= 0,
      ) ||
      discountAmount > grossAmount
    ) {
      toast.error(
        "Enter valid invoice amounts. Discount cannot exceed subtotal.",
      );
      return;
    }

    const netAmount =
      Math.round((grossAmount - discountAmount + taxAmount) * 10000) / 10000;
    const issuedAt =
      status === "issued" && !invoice.issuedAt
        ? new Date().toISOString()
        : invoice.issuedAt;
    setSaving(true);
    const { data: updated, error } = await supabase
      .from("invoices")
      .update({
        gross_amount: grossAmount,
        discount_amount: discountAmount,
        tax_amount: taxAmount,
        net_amount: netAmount,
        status,
        ...(issuedAt ? { issued_at: issuedAt } : {}),
      })
      .eq("id", invoice.id)
      .eq("tenant_id", ctx.tenantId)
      .eq("facility_id", ctx.facilityId)
      .select("id")
      .maybeSingle();
    setSaving(false);
    if (error) {
      toast.error(`Could not update invoice: ${error.message}`);
      return;
    }
    if (!updated) {
      toast.error(
        "Invoice could not be updated. Check access or refresh the page.",
      );
      return;
    }

    setInvoices((current) =>
      current.map((row) =>
        row.id === invoice.id
          ? {
              ...row,
              grossAmount,
              discountAmount,
              taxAmount,
              amount: netAmount,
              status,
              issuedAt,
            }
          : row,
      ),
    );
    setEditingId(null);
    setDraft(null);
    toast.success("Invoice updated");
  }

  return (
    <div className="space-y-5">
      {canInitiate &&
        (showNewInvoice ? (
          <InvoiceDraftForm
            ctx={ctx}
            onClose={() => setShowNewInvoice(false)}
            onCreated={(invoice) => {
              setInvoices((current) => [
                invoice,
                ...current.filter((row) => row.id !== invoice.id),
              ]);
              setShowNewInvoice(false);
            }}
          />
        ) : (
          <Panel
            title="Create a bill for a patient"
            subtitle="Pick the patient, add what they are being charged for, then save it as a draft you can issue."
            action={
              <button
                type="button"
                onClick={() => setShowNewInvoice(true)}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                <Plus className="size-4" /> New invoice
              </button>
            }
          >
            <p className="text-sm text-muted-foreground">
              A draft is a bill you can still change. Pick the patient, add the
              items from your price list, then save. Issue the bill when you are
              ready from the list below.
            </p>
          </Panel>
        ))}
      <Panel
        title="Facility invoices"
        subtitle={
          canEdit
            ? "Review invoices and update their amounts or status."
            : "Invoice records and payment status for your facility."
        }
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Invoiced", value: money(totals.invoiced) },
            {
              label: "Awaiting payment",
              value: money(totals.awaiting),
              hint: `${totals.awaitingCount} invoice${totals.awaitingCount === 1 ? "" : "s"}`,
            },
            { label: "Paid", value: money(totals.paid) },
            {
              label: "Drafts",
              value: String(totals.drafts),
              hint: "Not yet issued",
            },
          ].map((tile) => (
            <div
              key={tile.label}
              className="rounded-xl border border-border bg-card p-3"
            >
              <p className="text-xs font-medium text-muted-foreground">
                {tile.label}
              </p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {tile.value}
              </p>
              {"hint" in tile && tile.hint && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {tile.hint}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-input px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
            <Search aria-hidden="true" className="size-4 shrink-0" />
            <span className="sr-only">Search invoices</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by invoice number or patient"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <label className="sr-only" htmlFor="invoice-status-filter">
            Filter by invoice status
          </label>
          <select
            id="invoice-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="partially_paid">Partially paid</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {filteredInvoices.length ? (
          <div className="divide-y divide-border">
            {filteredInvoices.map((invoice) => (
              <article key={invoice.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      Invoice {invoice.number} · {invoice.patient}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {invoice.issuedAt
                        ? `Issued ${formatDate(invoice.issuedAt)}`
                        : "Not issued"}
                    </p>
                  </div>
                  {editingId !== invoice.id && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">
                        {money(invoice.amount)}
                      </span>
                      <StatusPill status={invoice.status} />
                      {canEdit && invoice.status === "draft" && (
                        <button
                          type="button"
                          onClick={() => void issueInvoice(invoice)}
                          disabled={issuingId !== null}
                          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {issuingId === invoice.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Send className="size-3.5" />
                          )}
                          Issue
                        </button>
                      )}
                      {canEdit &&
                        (invoice.status === "issued" ||
                          invoice.status === "partially_paid") && (
                          <button
                            type="button"
                            onClick={() => void markPaid(invoice)}
                            disabled={payingId !== null}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                          >
                            {payingId === invoice.id ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-3.5" />
                            )}
                            Mark paid
                          </button>
                        )}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => startEditing(invoice)}
                          className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {editingId === invoice.id && draft && (
                  <div className="mt-4 grid gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-2 xl:grid-cols-4">
                    <label className="text-xs font-medium text-muted-foreground">
                      Subtotal
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.grossAmount}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            grossAmount: event.currentTarget.value,
                          })
                        }
                        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      />
                    </label>
                    <label className="text-xs font-medium text-muted-foreground">
                      Discount
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.discountAmount}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            discountAmount: event.currentTarget.value,
                          })
                        }
                        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      />
                    </label>
                    <label className="text-xs font-medium text-muted-foreground">
                      Tax
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.taxAmount}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            taxAmount: event.currentTarget.value,
                          })
                        }
                        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      />
                    </label>
                    <label className="text-xs font-medium text-muted-foreground">
                      Status
                      <select
                        value={draft.status}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            status: event.currentTarget.value,
                          })
                        }
                        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      >
                        {[
                          "draft",
                          "issued",
                          "partially_paid",
                          "paid",
                          "cancelled",
                        ].map((status) => (
                          <option key={status} value={status}>
                            {status.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-center justify-between gap-3 sm:col-span-2 xl:col-span-4">
                      <p className="text-xs text-muted-foreground">
                        Total:{" "}
                        {money(
                          Math.max(
                            Number(draft.grossAmount) -
                              Number(draft.discountAmount) +
                              Number(draft.taxAmount),
                            0,
                          ),
                        )}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => {
                            setEditingId(null);
                            setDraft(null);
                          }}
                          className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void saveInvoice(invoice)}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                        >
                          {saving ? "Saving…" : "Save changes"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {editingId !== invoice.id && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Subtotal {money(invoice.grossAmount)} · Discount{" "}
                    {money(invoice.discountAmount)} · Tax{" "}
                    {money(invoice.taxAmount)}
                  </p>
                )}
                {invoice.items.length > 0 && (
                  <div className="mt-3 space-y-2 rounded-md bg-muted/30 p-3">
                    {invoice.items.map((item, index) => (
                      <div
                        key={`${invoice.id}-${index}`}
                        className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs"
                      >
                        <span className="text-foreground">
                          {item.description} · {item.quantity} ×{" "}
                          {money(item.unitPrice)}
                        </span>
                        <span className="font-medium text-foreground">
                          {money(item.lineTotal)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Receipt}
            title={
              invoices.length ? "No matching invoices" : "No invoices found"
            }
            description={
              invoices.length
                ? "Try another search or status filter."
                : "Invoices initiated for patients at your facility will appear here."
            }
          />
        )}
      </Panel>
    </div>
  );
}

function InvoiceDraftForm({
  ctx,
  onCreated,
  onClose,
}: {
  ctx: StaffContext;
  onCreated: (invoice: InvoiceRow) => void;
  onClose?: () => void;
}) {
  const [patients, setPatients] = useState<InvoicePatientOption[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [patientLoadError, setPatientLoadError] = useState("");
  const [charges, setCharges] = useState<InvoiceChargeOption[]>([]);
  const [chargesLoading, setChargesLoading] = useState(true);
  const [chargeLoadError, setChargeLoadError] = useState("");
  const [patientId, setPatientId] = useState("");
  const [lineItems, setLineItems] = useState([
    { key: 0, chargeId: "", quantity: "1" },
  ]);
  const [nextLineKey, setNextLineKey] = useState(1);
  const [discountAmount, setDiscountAmount] = useState("0");
  const [taxAmount, setTaxAmount] = useState("0");
  const [saving, setSaving] = useState(false);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [newItem, setNewItem] = useState({ name: "", code: "", price: "" });
  const [newItemSaving, setNewItemSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPatientsLoading(true);
    setChargesLoading(true);
    setPatients([]);
    setCharges([]);
    setPatientId("");
    setPatientLoadError("");
    setChargeLoadError("");
    setLineItems([{ key: 0, chargeId: "", quantity: "1" }]);
    setNextLineKey(1);
    void loadInvoicePatientOptions(ctx)
      .then((options) => {
        if (cancelled) return;
        setPatients(options);
        setPatientId(options[0]?.id ?? "");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const message =
          cause instanceof Error
            ? cause.message
            : "Could not load patients for invoicing.";
        setPatientLoadError(message);
      })
      .finally(() => {
        if (!cancelled) setPatientsLoading(false);
      });
    void loadInvoiceChargeOptions(ctx)
      .then((options) => {
        if (cancelled) return;
        setCharges(options);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const message =
          cause instanceof Error
            ? cause.message
            : "Could not load hospital charges for invoicing.";
        setChargeLoadError(message);
      })
      .finally(() => {
        if (!cancelled) setChargesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ctx]);

  const subtotal = lineItems.reduce((sum, item) => {
    const charge = charges.find((option) => option.id === item.chargeId);
    const quantity = Number(item.quantity);
    return charge && Number.isFinite(quantity) && quantity > 0
      ? sum + charge.unitPrice * quantity
      : sum;
  }, 0);
  const discount = Number(discountAmount);
  const tax = Number(taxAmount);
  const total =
    subtotal -
    (Number.isFinite(discount) ? discount : 0) +
    (Number.isFinite(tax) ? tax : 0);

  function updateLine(
    key: number,
    changes: Partial<{ chargeId: string; quantity: string }>,
  ) {
    setLineItems((current) =>
      current.map((item) =>
        item.key === key ? { ...item, ...changes } : item,
      ),
    );
  }

  function addChargeLine(chargeId: string) {
    setLineItems((current) => {
      const emptyIndex = current.findIndex((line) => !line.chargeId);
      if (emptyIndex >= 0) {
        return current.map((line, index) =>
          index === emptyIndex ? { ...line, chargeId, quantity: "1" } : line,
        );
      }
      return [...current, { key: nextLineKey, chargeId, quantity: "1" }];
    });
    setNextLineKey((key) => key + 1);
  }

  async function addPriceItem() {
    if (!ctx.tenantId) {
      toast.error("Your workspace is missing its hospital.");
      return;
    }
    const price = Number(newItem.price);
    if (!newItem.name.trim() || !newItem.code.trim()) {
      toast.error("Enter the item name and a short code.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Enter a valid price of zero or more.");
      return;
    }

    setNewItemSaving(true);
    try {
      const created = await createChargeCatalogEntry(ctx.tenantId, {
        charge_code: newItem.code.trim().toUpperCase(),
        name: newItem.name.trim(),
        category: "Service",
        base_rate: price,
      });
      const option: InvoiceChargeOption = {
        id: created.id,
        code: created.charge_code,
        name: created.name,
        category: created.category,
        unitPrice: created.base_rate,
      };
      setCharges((current) =>
        [...current, option].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewItem({ name: "", code: "", price: "" });
      setNewItemOpen(false);
      addChargeLine(option.id);
      toast.success(`${option.name} added to the bill`);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not add this item to your price list.",
      );
    } finally {
      setNewItemSaving(false);
    }
  }

  async function createDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ctx.tenantId || !ctx.facilityId || !patientId) {
      toast.error("Choose a patient and confirm your facility assignment.");
      return;
    }

    const selectedLineItems = lineItems
      .filter((item) => item.chargeId)
      .map((item) => ({
        charge_id: item.chargeId,
        quantity: Number(item.quantity),
      }));
    const validLineItems = selectedLineItems.filter(
      (item) => Number.isFinite(item.quantity) && item.quantity > 0,
    );
    if (
      validLineItems.length === 0 ||
      validLineItems.length !== selectedLineItems.length
    ) {
      toast.error("Select at least one charge and enter a positive quantity.");
      return;
    }

    const discountValue = Number(discountAmount);
    const taxValue = Number(taxAmount);
    if (
      ![discountValue, taxValue].every(
        (amount) => Number.isFinite(amount) && amount >= 0,
      ) ||
      discountValue > subtotal
    ) {
      toast.error(
        "Enter valid invoice amounts. Discount cannot exceed subtotal.",
      );
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.rpc("create_staff_draft_invoice", {
      _tenant_id: ctx.tenantId,
      _facility_id: ctx.facilityId,
      _patient_id: patientId,
      _line_items: validLineItems,
      _discount_amount: discountValue,
      _tax_amount: taxValue,
    });
    setSaving(false);
    if (error) {
      toast.error(`Could not create invoice draft: ${error.message}`);
      return;
    }

    const created = data?.[0];
    const patient = patients.find((option) => option.id === patientId);
    if (!created || !patient) {
      toast.error("Invoice draft was created, but its details could not load.");
      return;
    }

    try {
      const savedInvoices = await loadFacilityInvoices(ctx);
      const savedInvoice = savedInvoices.find(
        (invoice) => invoice.id === created.id,
      );
      if (!savedInvoice) {
        toast.error(
          "Invoice draft was created, but its saved totals could not be loaded.",
        );
        return;
      }
      onCreated(savedInvoice);
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? `Invoice draft was created, but could not be reloaded: ${cause.message}`
          : "Invoice draft was created, but could not be reloaded.",
      );
      return;
    }

    setLineItems([{ key: nextLineKey, chargeId: "", quantity: "1" }]);
    setNextLineKey((key) => key + 1);
    setDiscountAmount("0");
    setTaxAmount("0");
    toast.success("Invoice draft created");
  }

  return (
    <Panel
      title="Initiate an invoice"
      subtitle="Create a draft for a patient at your facility, then issue it to send it to them."
      {...(onClose
        ? {
            action: (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent"
              >
                <X className="size-4" /> Hide
              </button>
            ),
          }
        : {})}
    >
      {chargeLoadError && (
        <p
          role="alert"
          className="mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
        >
          {chargeLoadError}
        </p>
      )}
      {patientLoadError && (
        <p
          role="alert"
          className="mb-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
        >
          {patientLoadError}
        </p>
      )}
      <form onSubmit={(event) => void createDraft(event)} className="space-y-4">
        <label className="block max-w-xl text-xs font-medium text-muted-foreground">
          Patient
          <select
            required
            value={patientId}
            onChange={(event) => setPatientId(event.currentTarget.value)}
            disabled={patientsLoading || patients.length === 0 || saving}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="">
              {patientsLoading
                ? "Loading patients…"
                : patients.length
                  ? "Select a patient"
                  : "No active patients found"}
            </option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.name} · {patient.number}
              </option>
            ))}
          </select>
        </label>

        <section className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Add what the patient is paying for
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Pick items from your price list — the bill total updates as you
                add them.
              </p>
            </div>
            {ctx.role === "hospital_admin" && (
              <button
                type="button"
                onClick={() => setNewItemOpen((current) => !current)}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-xs font-medium text-foreground hover:bg-accent"
              >
                <Plus className="size-4" aria-hidden="true" /> New price item
              </button>
            )}
          </div>

          {newItemOpen && ctx.role === "hospital_admin" && (
            <div className="grid gap-2 rounded-md bg-muted/30 p-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(7rem,1fr)_minmax(7rem,1fr)_auto]">
              <label className="text-xs font-medium text-muted-foreground">
                What is it?
                <input
                  required
                  value={newItem.name}
                  onChange={(event) =>
                    setNewItem({ ...newItem, name: event.currentTarget.value })
                  }
                  placeholder="e.g. Doctor consultation"
                  disabled={newItemSaving}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Short code
                <input
                  required
                  value={newItem.code}
                  onChange={(event) =>
                    setNewItem({ ...newItem, code: event.currentTarget.value })
                  }
                  placeholder="CONSULT"
                  disabled={newItemSaving}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                />
              </label>
              <label className="text-xs font-medium text-muted-foreground">
                Price
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={newItem.price}
                  onChange={(event) =>
                    setNewItem({ ...newItem, price: event.currentTarget.value })
                  }
                  placeholder="500"
                  disabled={newItemSaving}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                />
              </label>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => void addPriceItem()}
                  disabled={newItemSaving}
                  className="inline-flex h-10 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {newItemSaving ? "Saving…" : "Save item"}
                </button>
                <button
                  type="button"
                  onClick={() => setNewItemOpen(false)}
                  disabled={newItemSaving}
                  className="inline-flex h-10 items-center rounded-lg border border-input px-3 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {chargesLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading your price list…
            </p>
          ) : charges.length === 0 ? (
            <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              Your price list is empty.{" "}
              {ctx.role === "hospital_admin"
                ? "Use “New price item” to add the first one, for example a doctor consultation."
                : "Ask your hospital administrator to add what you charge for."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {charges.map((charge) => (
                <button
                  key={charge.id}
                  type="button"
                  onClick={() => addChargeLine(charge.id)}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg border border-input px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  {charge.name}
                  <span className="text-muted-foreground">
                    {money(charge.unitPrice)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {" "}
            <h3 className="text-sm font-semibold text-foreground">
              Items on this bill
            </h3>
            <button
              type="button"
              onClick={() => {
                setLineItems((current) => [
                  ...current,
                  { key: nextLineKey, chargeId: "", quantity: "1" },
                ]);
                setNextLineKey((key) => key + 1);
              }}
              disabled={chargesLoading || charges.length === 0 || saving}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-xs font-medium text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-4" aria-hidden="true" />
              Add another item
            </button>
          </div>
          {chargesLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading your price list…
            </p>
          ) : chargeLoadError ? null : charges.length === 0 ? (
            <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              Your price list is empty. Add what you charge for on this Billing
              page — for example “Doctor consultation” with its price — then you
              can create invoices.
            </p>
          ) : (
            <div className="space-y-3">
              {lineItems.map((item, index) => {
                const charge = charges.find(
                  (option) => option.id === item.chargeId,
                );
                const quantity = Number(item.quantity);
                const lineTotal =
                  charge && Number.isFinite(quantity) && quantity > 0
                    ? charge.unitPrice * quantity
                    : 0;
                return (
                  <div
                    key={item.key}
                    className="grid gap-3 rounded-md bg-muted/30 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(8rem,1fr)_auto]"
                  >
                    <label className="text-xs font-medium text-muted-foreground">
                      Item {index + 1}
                      <select
                        value={item.chargeId}
                        onChange={(event) =>
                          updateLine(item.key, {
                            chargeId: event.currentTarget.value,
                          })
                        }
                        disabled={saving}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      >
                        <option value="">Choose an item</option>
                        {charges.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name} · {option.code}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-muted-foreground">
                      Quantity
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={(event) =>
                          updateLine(item.key, {
                            quantity: event.currentTarget.value,
                          })
                        }
                        disabled={saving}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
                      />
                    </label>
                    <div className="text-xs font-medium text-muted-foreground">
                      Unit price
                      <p className="mt-1 flex h-10 items-center text-sm text-foreground">
                        {charge ? money(charge.unitPrice) : "—"}
                      </p>
                    </div>
                    <div className="text-xs font-medium text-muted-foreground">
                      Line total
                      <p className="mt-1 flex h-10 items-center text-sm font-semibold text-foreground">
                        {charge ? money(lineTotal) : "—"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setLineItems((current) =>
                          current.length > 1
                            ? current.filter((line) => line.key !== item.key)
                            : current.map((line) =>
                                line.key === item.key
                                  ? { ...line, chargeId: "", quantity: "1" }
                                  : line,
                              ),
                        )
                      }
                      disabled={saving}
                      aria-label={`Remove item ${index + 1}`}
                      className="inline-flex h-10 items-center justify-center self-end rounded-md border border-input px-3 text-foreground hover:bg-accent disabled:opacity-50"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs font-medium text-muted-foreground">
            Discount
            <input
              min="0"
              step="0.01"
              type="number"
              value={discountAmount}
              onChange={(event) => setDiscountAmount(event.currentTarget.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Tax
            <input
              min="0"
              step="0.01"
              type="number"
              value={taxAmount}
              onChange={(event) => setTaxAmount(event.currentTarget.value)}
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
          </label>
          <div className="rounded-md bg-muted/40 p-3 text-sm sm:col-span-2">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-4">
              <span className="text-muted-foreground">Discount</span>
              <span>−{money(Number.isFinite(discount) ? discount : 0)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-4">
              <span className="text-muted-foreground">Tax</span>
              <span>{money(Number.isFinite(tax) ? tax : 0)}</span>
            </div>
            <div className="mt-2 flex justify-between gap-4 border-t border-border pt-2 font-semibold">
              <span>Total</span>
              <span>{money(total)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={
              saving ||
              patientsLoading ||
              chargesLoading ||
              patients.length === 0 ||
              charges.length === 0
            }
            className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save this bill"}
          </button>
        </div>
      </form>
    </Panel>
  );
}

function StaffApprovalList({
  rows,
  onChange,
}: {
  rows: ApprovalRow[];
  onChange: (rows: ApprovalRow[]) => void;
}) {
  const [reviewing, setReviewing] = useState<string | null>(null);

  async function reviewRequest(id: string, approved: boolean) {
    setReviewing(id);
    const { error } = await supabase.rpc("review_staff_access_request", {
      _request_id: id,
      _approved: approved,
    });
    setReviewing(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    onChange(rows.filter((row) => row.id !== id));
    toast.success(approved ? "Staff access approved" : "Request rejected");
  }

  return (
    <Panel
      title="Pending staff requests"
      subtitle="Review the staff identity and requested role before deciding"
      action={
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
          {rows.length} pending
        </span>
      }
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nothing waiting"
          description="New staff registrations will appear here for review."
        />
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {rows.map((row) => (
            <article
              key={row.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">
                  {row.full_name}
                </h3>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {row.email} · {row.phone}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {ROLE_LABELS[
                    row.requested_role as keyof typeof ROLE_LABELS
                  ] ?? row.requested_role}{" "}
                  · submitted {new Date(row.submitted_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={reviewing !== null}
                  onClick={() => reviewRequest(row.id, false)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
                >
                  <XCircle className="size-4" /> Reject
                </button>
                <button
                  type="button"
                  disabled={reviewing !== null}
                  onClick={() => reviewRequest(row.id, true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                >
                  {reviewing === row.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}{" "}
                  Approve
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}
