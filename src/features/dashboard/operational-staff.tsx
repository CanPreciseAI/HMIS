import {
  BedDouble,
  CalendarDays,
  ClipboardList,
  FileText,
  FlaskConical,
  Pill,
  Receipt,
  TestTubes,
  UserCheck,
  UserRound,
  Users,
  Warehouse,
} from "lucide-react";
import {
  formatDate,
  greeting,
  loadLabTechnicianData,
  loadPharmacistData,
  loadReceptionistData,
  money,
  type LabTechnicianData,
  type PharmacistData,
  type ReceptionistData,
  type StaffContext,
} from "./data";
import { DashboardShell, PageHeading, type NavItem } from "./shell";
import { useDashboardData } from "./use-dashboard-data";
import { ErrorBlock, LoadingBlock } from "./doctor";
import { EmptyState, Panel, StatCard, StatusPill } from "./ui";
import { MedicineCatalogReference } from "./medicine-catalog";
import { MedicineRequestsPanel } from "./medicine-requests";
import { buildOverviewNotifications } from "./section-notifications";

const NAV: Record<"lab_technician" | "pharmacist" | "receptionist", NavItem[]> =
  {
    lab_technician: [
      { label: "Overview", href: "/dashboard", icon: FlaskConical },
      {
        label: "Sample queue",
        href: "/dashboard/sample-queue",
        icon: TestTubes,
      },
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
  };

type OperationalData = LabTechnicianData | PharmacistData | ReceptionistData;

function loadRoleData(ctx: StaffContext): Promise<OperationalData> {
  switch (ctx.role) {
    case "lab_technician":
      return loadLabTechnicianData(ctx);
    case "pharmacist":
      return loadPharmacistData(ctx);
    case "receptionist":
      return loadReceptionistData(ctx);
    default:
      throw new Error("No operational workspace is configured for this role.");
  }
}

export function OperationalStaffDashboard({ ctx }: { ctx: StaffContext }) {
  const { data, loading, error } = useDashboardData<OperationalData>(
    ctx,
    loadRoleData,
  );
  const nav = NAV[ctx.role as keyof typeof NAV];
  const notifications = data ? buildOverviewNotifications(ctx.role, data) : [];

  return (
    <DashboardShell
      ctx={ctx}
      nav={nav}
      {...(notifications.length ? { notifications } : {})}
    >
      <PageHeading
        title={greeting(ctx.fullName)}
        subtitle={
          ctx.departmentName
            ? `${ctx.departmentName} operations at a glance.`
            : "Your facility operations at a glance."
        }
        meta={ctx.facilityName ?? undefined}
      />
      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}
      {data && "pendingSamples" in data && <LabOverview data={data} />}
      {data && "pendingPrescriptions" in data && (
        <>
          <PharmacyOverview data={data} />
          <div className="mt-5">
            <MedicineCatalogReference tenantId={ctx.tenantId} />
          </div>
          <div className="mt-5">
            <MedicineRequestsPanel ctx={ctx} />
          </div>
        </>
      )}
      {data && "appointmentsToday" in data && <ReceptionOverview data={data} />}
    </DashboardShell>
  );
}

function LabOverview({ data }: { data: LabTechnicianData }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard
          icon={TestTubes}
          label="Samples in queue"
          value={data.pendingSamples}
          hint="Ordered or collected"
          tone="amber"
        />
        <StatCard
          icon={FileText}
          label="Results to verify"
          value={data.resultsToVerify}
          hint="Preliminary lab results"
          tone="blue"
        />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Panel
          title="Priority sample queue"
          subtitle="Open samples, with urgent work first"
        >
          {data.queue.length ? (
            <ul className="divide-y divide-border">
              {data.queue.slice(0, 6).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.test} · {row.patient}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {row.accession} · {formatDate(row.orderedAt)}
                    </p>
                  </div>
                  <StatusPill
                    status={row.priority === "stat" ? "urgent" : row.status}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={TestTubes}
              title="No samples waiting"
              description="New laboratory orders will appear as soon as they are placed."
            />
          )}
        </Panel>
        <Panel
          title="Results awaiting verification"
          subtitle="Preliminary results in this facility"
        >
          {data.results.length ? (
            <ul className="divide-y divide-border">
              {data.results.slice(0, 6).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.test} · {row.patient}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.value}
                      {row.unit ? ` ${row.unit}` : ""} · {formatDate(row.at)}
                    </p>
                  </div>
                  <StatusPill status={row.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={FileText}
              title="No results awaiting verification"
              description="Preliminary lab results will be listed here for verification."
            />
          )}
        </Panel>
      </div>
    </>
  );
}

function PharmacyOverview({ data }: { data: PharmacistData }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={ClipboardList}
          label="Open prescriptions"
          value={data.pendingPrescriptions}
          hint="Outstanding quantities"
          tone="amber"
        />
        <StatCard
          icon={Pill}
          label="Dispensed today"
          value={data.dispensesToday}
          hint="Your recorded dispenses"
          tone="blue"
        />
        <StatCard
          icon={Warehouse}
          label="Stock lines"
          value={data.stock.length}
          hint="Items with stock on hand"
        />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Prescription queue"
          subtitle="Active prescriptions with quantity remaining"
        >
          {data.outstanding.length ? (
            <ul className="divide-y divide-border">
              {data.outstanding.slice(0, 6).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {row.medicine} · {row.patient}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {row.dose} · {row.route} · {row.frequency} ·{" "}
                      {row.remaining} of {row.prescribed} remaining
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.prescriber}
                      {row.prescriberDepartment
                        ? ` · ${row.prescriberDepartment}`
                        : ""}
                      {row.prescriberSpecialization
                        ? ` · ${row.prescriberSpecialization}`
                        : ""}
                      {row.prescriberCode ? ` · ${row.prescriberCode}` : ""} ·{" "}
                      {formatDate(row.prescribedAt)}
                    </p>
                  </div>
                  <StatusPill status="open" />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="No open prescriptions"
              description="Active prescription items awaiting dispensing will appear here."
            />
          )}
        </Panel>
        <Panel
          title="Recent dispenses"
          subtitle="Your latest recorded pharmacy hand-offs"
        >
          {data.recentDispenses.length ? (
            data.recentDispenses.slice(0, 6).map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {row.medicine} · {row.patient}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(row.at)}
                  </p>
                </div>
                <span className="text-sm font-semibold">{row.quantity}</span>
              </div>
            ))
          ) : (
            <EmptyState
              icon={Pill}
              title="No dispenses today"
              description="Your recorded dispensing activity for today will appear here."
            />
          )}
        </Panel>
      </div>
    </>
  );
}

function ReceptionOverview({ data }: { data: ReceptionistData }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CalendarDays}
          label="Appointments today"
          value={data.appointmentsToday}
          hint="Scheduled or checked in"
        />
        <StatCard
          icon={UserRound}
          label="Recent patient records"
          value={data.newPatients}
          hint="Latest registrations"
          tone="blue"
        />
        <StatCard
          icon={Receipt}
          label="Outstanding invoices"
          value={data.outstandingInvoices}
          hint="Issued or partly paid"
          tone="amber"
        />
        <StatCard
          icon={BedDouble}
          label="Admitted patients"
          value={data.activeAdmissions}
          hint="Currently in a hospital bed"
          tone="violet"
        />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Today's front desk schedule"
          subtitle="Appointments in time order"
        >
          {data.schedule.length ? (
            <ul className="divide-y divide-border">
              {data.schedule.slice(0, 8).map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-14 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold">
                      {row.time}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.patient}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.number}
                      </p>
                    </div>
                  </div>
                  <StatusPill status={row.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No appointments today"
              description="Today's scheduled and checked-in visits will appear here."
            />
          )}
        </Panel>
        <Panel
          title="Recently registered patients"
          subtitle="Latest patient records in your hospital"
        >
          {data.patients.length ? (
            data.patients.slice(0, 6).map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.number} · {formatDate(row.createdAt)}
                    {row.admitted ? " · Admitted" : ""}
                  </p>
                </div>
                <UserRound className="size-4 shrink-0 text-muted-foreground" />
              </div>
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
      <Panel
        title="Recent invoices"
        subtitle="Issued invoices for your facility"
        className="mt-5"
      >
        {data.invoices.length ? (
          data.invoices.slice(0, 5).map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {row.number} · {row.patient}
                </p>
                <p className="text-xs text-muted-foreground">
                  {row.issuedAt
                    ? formatDate(row.issuedAt)
                    : "Issue date unavailable"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold">
                  {money(row.amount)}
                </span>
                <StatusPill status={row.status} />
              </div>
            </div>
          ))
        ) : (
          <EmptyState
            icon={Receipt}
            title="No issued invoices"
            description="Issued invoices for your facility will appear here."
          />
        )}
      </Panel>
    </>
  );
}
