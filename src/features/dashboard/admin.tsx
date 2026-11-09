import { useEffect, useRef, useState } from "react";
import {
  BedDouble,
  Building2,
  CalendarClock,
  ClipboardList,
  Pill,
  Receipt,
  UserCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  formatDate,
  greeting,
  humanise,
  loadAdminData,
  loadStaffApprovalRequests,
  money,
  type ApprovalRow,
  type StaffContext,
} from "./data";
import { DashboardShell, PageHeading, type NavItem } from "./shell";
import { useDashboardData } from "./use-dashboard-data";
import { ErrorBlock, LoadingBlock } from "./doctor";
import { MedicineRequestsPanel } from "./medicine-requests";
import {
  EmptyState,
  FlowChart,
  LinkRow,
  Panel,
  StatCard,
  WardMeter,
} from "./ui";

const NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: CalendarClock },
  {
    label: "Patient flow",
    href: "/dashboard/patient-flow",
    icon: CalendarClock,
  },
  { label: "Ward capacity", href: "/dashboard/ward-capacity", icon: BedDouble },
  {
    label: "Stock & medicines",
    href: "/dashboard/medicine-catalog",
    icon: Pill,
  },
  { label: "Departments", href: "/dashboard/departments", icon: Building2 },
  { label: "Billing", href: "/dashboard/service-charges", icon: Receipt },
  {
    label: "Staff approvals",
    href: "/dashboard/staff-approvals",
    icon: UserCheck,
  },
];

export function AdminDashboard({ ctx }: { ctx: StaffContext }) {
  const { data, loading, error } = useDashboardData(ctx, loadAdminData);
  const [approvals, setApprovals] = useState<ApprovalRow[] | null>(null);

  const notifiedRequestIds = useRef(new Set<string>());

  const pending = approvals ?? data?.approvals ?? [];

  useEffect(() => {
    if (ctx.role !== "hospital_admin" || !ctx.tenantId) return;

    const tenantId = ctx.tenantId;
    const channel = supabase
      .channel(`staff-approvals-${ctx.userId}`)
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

            setApprovals((current) => {
              const next = current ?? [];
              return next.some((row) => row.id === request.id)
                ? next
                : [...next, request].sort(
                    (a, b) =>
                      new Date(a.submitted_at).getTime() -
                      new Date(b.submitted_at).getTime(),
                  );
            });
            toast.info(`New staff request from ${request.full_name}`, {
              description: "Review it in Staff access requests.",
              action: {
                label: "Review",
                onClick: () =>
                  document
                    .getElementById("approvals")
                    ?.scrollIntoView({ behavior: "smooth" }),
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
            setApprovals((current) =>
              (current ?? []).filter(
                (request) => request.id !== payload.new["id"],
              ),
            );
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
  }, [ctx.role, ctx.tenantId, ctx.userId]);

  useEffect(() => {
    if (ctx.role !== "hospital_admin" || !ctx.tenantId) return;

    let cancelled = false;
    void loadStaffApprovalRequests(ctx.tenantId)
      .then((requests) => {
        if (cancelled) return;
        setApprovals((current) => {
          const combined = new Map(
            [...requests, ...(current ?? [])].map((request) => [
              request.id,
              request,
            ]),
          );
          return [...combined.values()].sort(
            (a, b) =>
              new Date(a.submitted_at).getTime() -
              new Date(b.submitted_at).getTime(),
          );
        });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const message =
          cause instanceof Error
            ? cause.message
            : "Could not load staff approval requests.";
        console.error(message, cause);
        toast.error(message);
      });

    return () => {
      cancelled = true;
    };
  }, [ctx.role, ctx.tenantId]);

  const outstanding = data ? Math.max(data.invoiced - data.collected, 0) : 0;
  const collectionRate =
    data && data.invoiced > 0
      ? Math.round((data.collected / data.invoiced) * 100)
      : 0;
  const revenueByStatus = data
    ? ["issued", "partially_paid", "paid"].map((status) => {
        const rows = data.billingInvoices.filter(
          (invoice) => invoice.status === status,
        );
        return {
          status,
          count: rows.length,
          amount: rows.reduce((sum, invoice) => sum + invoice.amount, 0),
        };
      })
    : [];

  // Keep the staff approval notification in step with the live approvals list.
  const notifications = data
    ? data.notifications
        .filter((item) => item.id !== "staff-approvals" || pending.length > 0)
        .map((item) =>
          item.id === "staff-approvals"
            ? {
                ...item,
                title: `${pending.length} staff access request${pending.length === 1 ? "" : "s"} pending`,
                description:
                  pending.length > 0
                    ? "Approve new staff before they can enter the workspace."
                    : item.description,
              }
            : item,
        )
    : undefined;

  return (
    <DashboardShell
      ctx={ctx}
      nav={NAV}
      notificationCount={pending.length}
      notificationHref="#approvals"
      {...(notifications ? { notifications } : {})}
    >
      <PageHeading
        title={greeting(ctx.fullName)}
        subtitle="Facility operations, staffing and revenue at a glance."
        meta={data ? `${data.encountersToday} encounters today` : undefined}
      />

      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              icon={CalendarClock}
              label="Encounters today"
              value={data.encountersToday}
              hint={`${data.admissionsToday} admitted today`}
            />
            <StatCard
              icon={BedDouble}
              label="Bed occupancy"
              value={
                data.bedsTotal ? `${data.bedsOccupied}/${data.bedsTotal}` : "—"
              }
              hint="Active beds in use"
              tone="blue"
            />
            <StatCard
              icon={Users}
              label="Patients in wards"
              value={data.wardPatients.length}
              hint="Rooms currently holding a patient"
              tone="blue"
            />
            <StatCard
              icon={Building2}
              label="Active staff"
              value={data.activeStaff}
              hint="Employees on the roster"
              tone="violet"
            />
            <StatCard
              icon={ClipboardList}
              label="Open prescriptions"
              value={data.openPrescriptions.length}
              hint="Lines awaiting dispensing"
              tone="amber"
            />
            <StatCard
              icon={UserCheck}
              label="Pending approvals"
              value={pending.length}
              hint="Staff access requests"
              tone="amber"
            />
          </div>

          <div className="mt-5">
            <MedicineRequestsPanel ctx={ctx} />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              <Panel
                id="flow"
                title="Patient flow"
                subtitle="Admissions and discharges over the last 7 days"
              >
                <FlowChart data={data.flow} />
              </Panel>

              <Panel
                id="departments"
                title="Departments"
                subtitle="Headcount by department"
              >
                {data.departments.length === 0 ? (
                  <EmptyState
                    icon={Building2}
                    title="No departments yet"
                    description="Departments created for this facility will be listed with their staff counts."
                  />
                ) : (
                  <div>
                    {data.departments.map((dept) => (
                      <LinkRow
                        key={dept.name}
                        label={dept.name}
                        value={`${dept.staff}`}
                        hint="employees"
                      />
                    ))}
                  </div>
                )}
              </Panel>

              <Panel
                id="pharmacy"
                title="Pharmacy queue"
                subtitle="Prescription lines still to dispense, and medicines running low"
              >
                {data.openPrescriptions.length ? (
                  <div>
                    {data.openPrescriptions.slice(0, 6).map((line) => (
                      <LinkRow
                        key={line.id}
                        label={`${line.medicine} · ${line.patient}`}
                        value={`${line.remaining} left`}
                        hint={`${line.prescriber} · ${formatDate(line.prescribedAt)}`}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No prescription lines are waiting to be dispensed.
                  </p>
                )}
                {data.lowStockMedicines.length ? (
                  <div className="mt-4 border-t border-border pt-3">
                    <h3 className="text-xs font-semibold text-muted-foreground">
                      Low stock
                    </h3>
                    <div className="mt-2">
                      {data.lowStockMedicines.slice(0, 5).map((row) => (
                        <LinkRow
                          key={row.medicineId}
                          label={row.name}
                          value={String(row.available)}
                          hint="available"
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </Panel>
            </div>

            <div className="space-y-5">
              <Panel
                id="wards"
                title="Ward capacity"
                subtitle="Occupied versus active beds"
              >
                {data.wards.length === 0 ? (
                  <EmptyState
                    icon={BedDouble}
                    title="No beds configured"
                    description="Register beds against this facility to track occupancy by ward."
                  />
                ) : (
                  <div className="space-y-4">
                    {data.wards.map((ward) => (
                      <WardMeter
                        key={ward.ward}
                        ward={ward.ward}
                        total={ward.total}
                        occupied={ward.occupied}
                      />
                    ))}
                  </div>
                )}
              </Panel>

              <Panel
                id="ward-patients"
                title="Patients in wards"
                subtitle="Room, nurse in charge and doctor handling each patient"
              >
                {data.wardPatients.length ? (
                  <div>
                    {data.wardPatients.slice(0, 6).map((row) => (
                      <LinkRow
                        key={row.assignmentId}
                        label={`${row.patient} · ${row.ward} ${row.bed}`}
                        value={row.doctor ?? "No doctor"}
                        hint={
                          row.nurse
                            ? `Nurse in charge: ${row.nurse} · ${row.number ?? "No MRN"}`
                            : `No nurse assigned · ${row.number ?? "No MRN"}`
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={BedDouble}
                    title="No patients in wards"
                    description="Admitted patients appear here with their room, nurse and doctor."
                  />
                )}
              </Panel>

              <Panel
                id="billing"
                title="Billing snapshot"
                subtitle="Issued invoices and captured payments"
              >
                <div>
                  <LinkRow label="Invoiced" value={money(data.invoiced)} />
                  <LinkRow label="Collected" value={money(data.collected)} />
                  <LinkRow label="Outstanding" value={money(outstanding)} />
                </div>
              </Panel>
            </div>
          </div>

          <Panel
            id="revenue"
            title="Revenue details"
            subtitle="Invoiced, collected and outstanding amounts for your facility"
            className="mt-5"
            action={
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                {collectionRate}% collected
              </span>
            }
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Invoiced", value: data.invoiced },
                { label: "Collected", value: data.collected },
                { label: "Outstanding", value: outstanding },
              ].map((tile) => (
                <div
                  key={tile.label}
                  className="rounded-xl border border-border p-3"
                >
                  <p className="text-xs font-medium text-muted-foreground">
                    {tile.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {money(tile.value)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground">
                  Invoiced by status
                </h3>
                <div className="mt-2">
                  {revenueByStatus.map((row) => (
                    <LinkRow
                      key={row.status}
                      label={humanise(row.status)}
                      value={money(row.amount)}
                      hint={`${row.count} invoice${row.count === 1 ? "" : "s"}`}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-muted-foreground">
                  Recent payments
                </h3>
                {data.recentPayments.length ? (
                  <div className="mt-2">
                    {data.recentPayments.slice(0, 5).map((payment) => (
                      <LinkRow
                        key={payment.id}
                        label={payment.patient}
                        value={money(payment.amount)}
                        hint={`${payment.reference} · ${
                          payment.receivedAt
                            ? formatDate(payment.receivedAt)
                            : "Pending"
                        }`}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No payments recorded yet.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-xs font-semibold text-muted-foreground">
                Latest invoices
              </h3>
              {data.billingInvoices.length ? (
                <div className="mt-2">
                  {data.billingInvoices.slice(0, 6).map((invoice) => (
                    <LinkRow
                      key={invoice.id}
                      label={`Invoice ${invoice.number} · ${invoice.patient}`}
                      value={money(invoice.amount)}
                      hint={`${humanise(invoice.status)}${
                        invoice.issuedAt
                          ? ` · ${formatDate(invoice.issuedAt)}`
                          : ""
                      }`}
                    />
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  No invoices issued yet.
                </p>
              )}
            </div>
          </Panel>
        </>
      )}
    </DashboardShell>
  );
}
