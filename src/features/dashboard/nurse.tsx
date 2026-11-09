import {
  BedDouble,
  ClipboardList,
  NotebookPen,
  Pill,
  Receipt,
  TestTubes,
  Users,
} from "lucide-react";
import { greeting, loadNurseData, type StaffContext } from "./data";
import { DashboardShell, PageHeading, type NavItem } from "./shell";
import { useDashboardData } from "./use-dashboard-data";
import { ErrorBlock, LoadingBlock } from "./doctor";
import { EmptyState, Panel, StatCard, StatusPill, WardMeter } from "./ui";
import { MedicineCatalogReference } from "./medicine-catalog";
import { MedicineRequestsPanel } from "./medicine-requests";
import { buildOverviewNotifications } from "./section-notifications";

const NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: ClipboardList },
  { label: "Care queue", href: "/dashboard/care-queue", icon: ClipboardList },
  { label: "Ward capacity", href: "/dashboard/ward-capacity", icon: BedDouble },
  {
    label: "Handoff notes",
    href: "/dashboard/handoff-notes",
    icon: NotebookPen,
  },
  { label: "Billing", href: "/dashboard/service-charges", icon: Receipt },
];

export function NurseDashboard({ ctx }: { ctx: StaffContext }) {
  const { data, loading, error } = useDashboardData(ctx, loadNurseData);
  const occupancy =
    data && data.bedsTotal > 0
      ? `${Math.round((data.bedsOccupied / data.bedsTotal) * 100)}%`
      : "—";
  const notifications = data ? buildOverviewNotifications("nurse", data) : [];

  return (
    <DashboardShell
      ctx={ctx}
      nav={NAV}
      {...(notifications.length ? { notifications } : {})}
    >
      <PageHeading
        title={greeting(ctx.fullName)}
        subtitle="Tasks waiting on the floor, ward capacity and the latest handoff notes."
        meta={data ? `${data.activeAdmissions} inpatients` : undefined}
      />

      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Users}
              label="Active admissions"
              value={data.activeAdmissions}
              hint="Currently admitted"
            />
            <StatCard
              icon={TestTubes}
              label="Samples to collect"
              value={data.samplesPending}
              hint="Lab tests ordered"
              tone="amber"
            />
            <StatCard
              icon={Pill}
              label="Dispenses today"
              value={data.dispensesToday}
              hint="Pharmacy hand-offs"
              tone="violet"
            />
            <StatCard
              icon={BedDouble}
              label="Bed occupancy"
              value={
                data.bedsTotal ? `${data.bedsOccupied}/${data.bedsTotal}` : "—"
              }
              hint={`${occupancy} of active beds`}
              tone="blue"
            />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              <Panel
                id="queue"
                title="Care queue"
                subtitle="Samples ordered and not yet collected"
              >
                {data.queue.length === 0 ? (
                  <EmptyState
                    icon={ClipboardList}
                    title="Queue is clear"
                    description="New lab orders appear here the moment they are placed."
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {data.queue.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {row.title}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.subtitle} · {row.meta}
                          </p>
                        </div>
                        <StatusPill status={row.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                id="wards"
                title="Ward capacity"
                subtitle="Active beds with current assignments"
              >
                {data.wards.length === 0 ? (
                  <EmptyState
                    icon={BedDouble}
                    title="No beds configured"
                    description="Beds registered against this facility will be summarised here."
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
            </div>

            <Panel
              id="notes"
              title="Handoff notes"
              subtitle="Notes doctors wrote for the next shift"
            >
              {data.notes.length === 0 ? (
                <EmptyState
                  icon={NotebookPen}
                  title="No handoff notes yet"
                  description="Handoff notes written by doctors will appear here for the next shift."
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
                          {row.patient} · {row.type}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {row.content}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {row.author} ·{" "}
                          {new Date(row.at).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                      </div>
                      <StatusPill status={row.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
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
