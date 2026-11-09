import {
  CalendarDays,
  CircleAlert,
  FileText,
  FlaskConical,
  Loader2,
  Stethoscope,
  Users,
} from "lucide-react";
import { greeting, loadDoctorData, type StaffContext } from "./data";
import { DashboardShell, PageHeading } from "./shell";
import { DOCTOR_NAV } from "./doctor-nav";
import { useDashboardData } from "./use-dashboard-data";
import { EmptyState, Panel, StatCard, StatusPill } from "./ui";
import { MedicineCatalogReference } from "./medicine-catalog";
import { MedicineRequestsPanel } from "./medicine-requests";
import { PatientHistoryPanel } from "./patient-history";

export function DoctorDashboard({ ctx }: { ctx: StaffContext }) {
  const { data, loading, error } = useDashboardData(ctx, loadDoctorData);

  return (
    <DashboardShell
      ctx={ctx}
      nav={DOCTOR_NAV}
      {...(data?.notifications.length
        ? { notifications: data.notifications }
        : {})}
    >
      <PageHeading
        title={greeting(ctx.fullName)}
        subtitle={
          ctx.departmentName
            ? `Your clinical day in ${ctx.departmentName}.`
            : "Your clinical day at a glance."
        }
        meta={data ? `${data.appointmentsToday} booked today` : undefined}
      />

      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={CalendarDays}
              label="Appointments today"
              value={data.appointmentsToday}
              hint="Scheduled or checked in"
            />
            <StatCard
              icon={Stethoscope}
              label="Open encounters"
              value={data.openEncounters}
              hint="Not yet closed"
              tone="blue"
            />
            <StatCard
              icon={FlaskConical}
              label="Results to review"
              value={data.resultsToReview}
              hint="Preliminary lab results"
              tone="amber"
            />
            <StatCard
              icon={FileText}
              label="Draft notes"
              value={data.draftNotes}
              hint="Awaiting signature"
              tone="violet"
            />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              <Panel
                id="schedule"
                title="Today's schedule"
                subtitle="Appointments assigned to you"
              >
                {data.schedule.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="No appointments booked"
                    description="Appointments assigned to you for today will appear here as they are scheduled."
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {data.schedule.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-9 w-14 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold text-foreground">
                            {row.time}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {row.patient}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {row.appointmentType} · {row.number ?? "No MRN"}
                            </p>
                          </div>
                        </div>
                        <StatusPill status={row.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                id="patients"
                title="Your patients"
                subtitle="Most recent encounters you are responsible for"
              >
                {data.patients.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title="No encounters yet"
                    description="Patients you open an encounter for will be listed here."
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {data.patients.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {row.name}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.number ?? "No MRN"} · {row.detail}
                          </p>
                        </div>
                        <StatusPill status={row.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="space-y-5">
              <Panel
                id="results"
                title="Critical results"
                subtitle="Flagged by the laboratory"
              >
                {data.critical.length === 0 ? (
                  <EmptyState
                    icon={CircleAlert}
                    title="Nothing flagged"
                    description="Critical laboratory results are escalated here for review."
                  />
                ) : (
                  <ul className="space-y-3">
                    {data.critical.map((row) => (
                      <li
                        key={row.id}
                        className="rounded-xl border border-border bg-muted/30 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {row.test}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {row.patient}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200 ring-inset">
                            {row.acknowledged ? "Acknowledged" : "Critical"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-foreground">
                          {row.value}
                          {row.unit ? ` ${row.unit}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                id="notes"
                title="Recent notes"
                subtitle="Your latest notes"
              >
                {data.notes.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="No notes yet"
                    description="Notes you author against an encounter will show up here."
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {data.notes.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {row.type}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.patient}
                          </p>
                        </div>
                        <StatusPill status={row.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
          <div className="mt-5">
            <PatientHistoryPanel ctx={ctx} />
          </div>
          <div className="mt-5">
            <MedicineCatalogReference tenantId={ctx.tenantId} />
          </div>
          <div className="mt-5">
            <MedicineRequestsPanel ctx={ctx} />
          </div>
        </>
      )}
    </DashboardShell>
  );
}

export function LoadingBlock() {
  return (
    <div className="grid place-items-center rounded-2xl border border-border bg-card py-20 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      {message}
    </div>
  );
}
