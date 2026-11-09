import { useEffect, useState } from "react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  Users,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  greeting,
  loadPlatformAdminData,
  money,
  type AdminNotification,
  type HospitalAdminRequestRow,
  type PlatformHospitalRecord,
  type PlatformStaffRecord,
  type StaffContext,
} from "./data";
import { DashboardShell, PageHeading, type NavItem } from "./shell";
import { ErrorBlock, LoadingBlock } from "./doctor";
import { EmptyState, Panel, StatCard, StatusPill } from "./ui";
import { useDashboardData } from "./use-dashboard-data";

const NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: Building2 },
  {
    label: "Hospital admin approvals",
    href: "/dashboard/hospital-admin-approvals",
    icon: ClipboardCheck,
  },
  { label: "Hospitals", href: "/dashboard/hospital-records", icon: Building2 },
  { label: "Staff records", href: "/dashboard/staff-records", icon: Users },
];

export function PlatformAdminDashboard({ ctx }: { ctx: StaffContext }) {
  const { data, loading, error } = useDashboardData(ctx, loadPlatformAdminData);
  const [requests, setRequests] = useState<HospitalAdminRequestRow[] | null>(
    null,
  );
  const [reviewing, setReviewing] = useState<string | null>(null);
  const pending = requests ?? data?.requests ?? [];
  const notifications: AdminNotification[] = pending.length
    ? [
        {
          id: "platform-hospital-requests",
          title: `${pending.length} hospital request${pending.length === 1 ? "" : "s"} pending`,
          description: "Review new hospital administrator registrations.",
          tone: "warning",
          href: "/dashboard/hospital-admin-approvals",
        },
      ]
    : [];
  const collectionRate =
    data && data.overview.invoicedAmount > 0
      ? Math.round(
          (data.overview.collectedAmount / data.overview.invoicedAmount) * 100,
        )
      : 0;

  useEffect(() => {
    if (!data) return;
    const channel = supabase
      .channel(`hospital-admin-requests-${ctx.userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "hospital_admin_registration_requests",
        },
        (payload) => {
          const id = payload.new["id"];
          if (typeof id !== "string") return;
          void (async () => {
            const { data: request, error: requestError } = await supabase
              .from("hospital_admin_registration_requests")
              .select(
                "id, hospital_name, full_name, email, phone, submitted_at",
              )
              .eq("id", id)
              .eq("status", "pending")
              .maybeSingle();
            if (requestError) {
              toast.error(
                `Could not load the new hospital request: ${requestError.message}`,
              );
              return;
            }
            if (!request) return;
            setRequests((current) => {
              const next = current ?? data.requests;
              if (next.some((row) => row.id === request.id)) return next;
              return [...next, request].sort(
                (a, b) =>
                  new Date(a.submitted_at).getTime() -
                  new Date(b.submitted_at).getTime(),
              );
            });
            toast.info(`New hospital request from ${request.full_name}`, {
              description: "Review it in Hospital admin approvals.",
            });
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
            setRequests((current) =>
              (current ?? data.requests).filter(
                (row) => row.id !== payload.new["id"],
              ),
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
  }, [ctx.userId, data]);

  async function reviewRequest(id: string, approved: boolean) {
    setReviewing(id);
    const { error: reviewError } = await supabase.rpc(
      "review_hospital_admin_registration",
      { _request_id: id, _approved: approved },
    );
    setReviewing(null);
    if (reviewError) {
      toast.error(reviewError.message);
      return;
    }
    setRequests(pending.filter((request) => request.id !== id));
    toast.success(
      approved
        ? "Hospital administrator approved and hospital created"
        : "Hospital administrator request rejected",
    );
  }

  return (
    <DashboardShell
      ctx={ctx}
      nav={NAV}
      notificationCount={pending.length}
      notificationHref="/dashboard/hospital-admin-approvals"
      {...(notifications.length ? { notifications } : {})}
    >
      <PageHeading
        title={greeting(ctx.fullName)}
        subtitle="Hospital growth, activity and revenue across every workspace you host."
      />
      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}
      {!loading && !error && data && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Building2}
              label="Hospitals joined"
              value={data.overview.hospitalsTotal}
              hint={`${data.overview.hospitalsActive} active · ${data.overview.hospitalsTrial} trial`}
            />
            <StatCard
              icon={Building2}
              label="Facilities"
              value={data.overview.facilitiesTotal}
              hint="Across every hospital"
              tone="blue"
            />
            <StatCard
              icon={Users}
              label="Staff accounts"
              value={data.overview.staffTotal}
              hint={`${data.overview.staffActive} active`}
              tone="violet"
            />
            <StatCard
              icon={Users}
              label="Patients"
              value={data.overview.patientsTotal}
              hint={`${data.overview.patientsNew7d} new in the last 7 days`}
            />
          </div>

          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={ClipboardCheck}
              label="Pending hospital requests"
              value={pending.length}
              hint="Awaiting central approval"
              tone="amber"
            />
            <StatCard
              icon={CalendarDays}
              label="Appointments today"
              value={data.overview.appointmentsToday}
              hint={`${data.overview.encounters7d} encounters in 7 days`}
            />
            <StatCard
              icon={Receipt}
              label="Collected"
              value={money(data.overview.collectedAmount)}
              hint={`${collectionRate}% of ${money(data.overview.invoicedAmount)} invoiced`}
              tone="blue"
            />
            <StatCard
              icon={Wallet}
              label="Outstanding"
              value={money(data.overview.outstandingAmount)}
              hint={`${data.overview.invoicesIssued} invoices issued`}
              tone="amber"
            />
          </div>

          <div className="mb-5 grid gap-5 xl:grid-cols-2">
            <Panel
              title="Hospitals by status"
              subtitle="Where the estate stands today"
            >
              {[
                { label: "Active", value: data.overview.hospitalsActive },
                { label: "Trial", value: data.overview.hospitalsTrial },
                { label: "Suspended", value: data.overview.hospitalsSuspended },
                {
                  label: "Other",
                  value: Math.max(
                    data.overview.hospitalsTotal -
                      data.overview.hospitalsActive -
                      data.overview.hospitalsTrial -
                      data.overview.hospitalsSuspended,
                    0,
                  ),
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between border-b border-border py-2.5 last:border-0"
                >
                  <span className="text-sm text-foreground">{row.label}</span>
                  <span className="text-sm font-semibold">{row.value}</span>
                </div>
              ))}
            </Panel>

            <Panel
              title="Revenue health"
              subtitle="Issued invoices across every hospital"
            >
              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Invoiced</dt>
                  <dd className="font-semibold">
                    {money(data.overview.invoicedAmount)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Collected</dt>
                  <dd className="font-semibold text-primary">
                    {money(data.overview.collectedAmount)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Outstanding</dt>
                  <dd className="font-semibold">
                    {money(data.overview.outstandingAmount)}
                  </dd>
                </div>
              </dl>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Collection rate</span>
                  <span className="font-semibold text-foreground">
                    {collectionRate}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min(collectionRate, 100)}%` }}
                  />
                </div>
              </div>
            </Panel>
          </div>

          <HospitalAdminRequestList
            requests={pending}
            reviewing={reviewing}
            onReview={reviewRequest}
          />
        </>
      )}
    </DashboardShell>
  );
}

export function HospitalAdminRequestList({
  requests,
  reviewing,
  onReview,
}: {
  requests: HospitalAdminRequestRow[];
  reviewing: string | null;
  onReview: (id: string, approved: boolean) => void;
}) {
  return (
    <Panel
      id="hospital-admin-requests"
      title="Hospital administrator requests"
      subtitle="Approval creates a hospital, its main facility and an administrator workspace"
      action={
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
          {requests.length} pending
        </span>
      }
    >
      {requests.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nothing waiting"
          description="New hospital administrator applications will appear here."
        />
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {requests.map((request) => (
            <article
              key={request.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">
                  {request.hospital_name}
                </h3>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {request.full_name} · {request.email} · {request.phone}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Submitted {new Date(request.submitted_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={reviewing !== null}
                  onClick={() => onReview(request.id, false)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
                >
                  <XCircle className="size-4" /> Reject
                </button>
                <button
                  type="button"
                  disabled={reviewing !== null}
                  onClick={() => onReview(request.id, true)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                >
                  {reviewing === request.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
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

const HOSPITAL_STATUSES = ["trial", "active", "suspended", "cancelled"];
const FACILITY_STATUSES = ["active", "inactive"];
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const fieldClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

type HospitalDraft = { name: string; slug: string; status: string };
type FacilityDraft = { name: string; code: string; status: string };
type FacilityRecord = PlatformHospitalRecord["facilities"][number];

export function PlatformHospitalRecords({
  records,
}: {
  records: PlatformHospitalRecord[];
}) {
  const [hospitals, setHospitals] = useState(records);
  const [editingHospitalId, setEditingHospitalId] = useState<string | null>(
    null,
  );
  const [hospitalDraft, setHospitalDraft] = useState<HospitalDraft | null>(
    null,
  );
  const [editingFacilityId, setEditingFacilityId] = useState<string | null>(
    null,
  );
  const [facilityDraft, setFacilityDraft] = useState<FacilityDraft | null>(
    null,
  );
  const [newFacilityFor, setNewFacilityFor] = useState<string | null>(null);
  const [newFacilityDraft, setNewFacilityDraft] = useState<FacilityDraft>({
    name: "",
    code: "",
    status: "active",
  });
  const [saving, setSaving] = useState<string | null>(null);

  function beginHospitalEdit(hospital: PlatformHospitalRecord) {
    setEditingHospitalId(hospital.id);
    setEditingFacilityId(null);
    setNewFacilityFor(null);
    setHospitalDraft({
      name: hospital.name,
      slug: hospital.slug,
      status: hospital.status,
    });
  }

  function beginFacilityEdit(facility: FacilityRecord) {
    setEditingHospitalId(null);
    setHospitalDraft(null);
    setNewFacilityFor(null);
    setEditingFacilityId(facility.id);
    setFacilityDraft({
      name: facility.name,
      code: facility.code,
      status: facility.status,
    });
  }

  async function saveHospital(hospital: PlatformHospitalRecord) {
    if (!hospitalDraft) return;
    const name = hospitalDraft.name.trim();
    const slug = hospitalDraft.slug.trim().toLowerCase();
    if (!name) {
      toast.error("Enter the hospital name.");
      return;
    }
    if (!SLUG_PATTERN.test(slug)) {
      toast.error(
        "Use a slug of lowercase letters and numbers, separated by single hyphens.",
      );
      return;
    }

    setSaving(`hospital:${hospital.id}`);
    const { data: updated, error } = await supabase
      .from("tenants")
      .update({ name, slug, status: hospitalDraft.status })
      .eq("id", hospital.id)
      .select("id")
      .maybeSingle();
    setSaving(null);
    if (error) {
      toast.error(`Could not update hospital: ${error.message}`);
      return;
    }
    if (!updated) {
      toast.error(
        "Hospital could not be updated. Check your access and try again.",
      );
      return;
    }

    setHospitals((current) =>
      current.map((row) =>
        row.id === hospital.id
          ? { ...row, name, slug, status: hospitalDraft.status }
          : row,
      ),
    );
    setEditingHospitalId(null);
    setHospitalDraft(null);
    toast.success("Hospital updated");
  }

  async function saveFacility(
    hospital: PlatformHospitalRecord,
    facilityId: string,
  ) {
    if (!facilityDraft) return;
    const name = facilityDraft.name.trim();
    const code = facilityDraft.code.trim();
    if (!name || !code) {
      toast.error("Enter both the facility name and its code.");
      return;
    }

    setSaving(`facility:${facilityId}`);
    const { data: updated, error } = await supabase
      .from("facilities")
      .update({ name, facility_code: code, status: facilityDraft.status })
      .eq("id", facilityId)
      .eq("tenant_id", hospital.id)
      .select("id")
      .maybeSingle();
    setSaving(null);
    if (error) {
      toast.error(`Could not update facility: ${error.message}`);
      return;
    }
    if (!updated) {
      toast.error(
        "Facility could not be updated. Check your access and try again.",
      );
      return;
    }

    setHospitals((current) =>
      current.map((row) =>
        row.id === hospital.id
          ? {
              ...row,
              facilities: row.facilities.map((facility) =>
                facility.id === facilityId
                  ? { ...facility, name, code, status: facilityDraft.status }
                  : facility,
              ),
            }
          : row,
      ),
    );
    setEditingFacilityId(null);
    setFacilityDraft(null);
    toast.success("Facility updated");
  }

  async function addFacility(hospital: PlatformHospitalRecord) {
    const name = newFacilityDraft.name.trim();
    const code = newFacilityDraft.code.trim();
    if (!name || !code) {
      toast.error("Enter both the facility name and its code.");
      return;
    }

    setSaving(`new-facility:${hospital.id}`);
    const { data: created, error } = await supabase
      .from("facilities")
      .insert({
        tenant_id: hospital.id,
        name,
        facility_code: code,
        status: newFacilityDraft.status,
      })
      .select("id, name, facility_code, status")
      .maybeSingle();
    setSaving(null);
    if (error) {
      toast.error(`Could not add facility: ${error.message}`);
      return;
    }
    if (!created) {
      toast.error(
        "Facility could not be added. Check your access and try again.",
      );
      return;
    }

    setHospitals((current) =>
      current.map((row) =>
        row.id === hospital.id
          ? {
              ...row,
              facilities: [
                ...row.facilities,
                {
                  id: created.id,
                  name: created.name,
                  code: created.facility_code,
                  status: created.status,
                },
              ].sort((a, b) => a.name.localeCompare(b.name)),
            }
          : row,
      ),
    );
    setNewFacilityFor(null);
    setNewFacilityDraft({ name: "", code: "", status: "active" });
    toast.success("Facility added");
  }

  return (
    <Panel
      title="Hospital records"
      subtitle={`${hospitals.length} hospital workspaces · names, status and facilities can be updated`}
    >
      {hospitals.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No hospitals registered"
          description="Approved hospital workspaces will appear here."
        />
      ) : (
        <div className="space-y-3">
          {hospitals.map((hospital) => (
            <article
              key={hospital.id}
              className="rounded-xl border border-border p-4"
            >
              {editingHospitalId === hospital.id && hospitalDraft ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-medium text-muted-foreground">
                    Hospital name
                    <input
                      value={hospitalDraft.name}
                      onChange={(event) =>
                        setHospitalDraft({
                          ...hospitalDraft,
                          name: event.currentTarget.value,
                        })
                      }
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">
                    Slug
                    <input
                      value={hospitalDraft.slug}
                      onChange={(event) =>
                        setHospitalDraft({
                          ...hospitalDraft,
                          slug: event.currentTarget.value,
                        })
                      }
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">
                    Status
                    <select
                      value={hospitalDraft.status}
                      onChange={(event) =>
                        setHospitalDraft({
                          ...hospitalDraft,
                          status: event.currentTarget.value,
                        })
                      }
                      className={fieldClass}
                    >
                      {HOSPITAL_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2 sm:col-span-3">
                    <button
                      type="button"
                      onClick={() => void saveHospital(hospital)}
                      disabled={saving !== null}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                    >
                      {saving === `hospital:${hospital.id}` ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      Save hospital
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingHospitalId(null);
                        setHospitalDraft(null);
                      }}
                      disabled={saving !== null}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
                    >
                      <X className="size-4" /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">
                      {hospital.name}
                    </h3>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {hospital.slug}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill status={hospital.status} />
                    <button
                      type="button"
                      onClick={() => beginHospitalEdit(hospital)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground transition hover:bg-accent"
                    >
                      <Pencil className="size-3.5" /> Edit
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 border-t border-border pt-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Facilities · {hospital.facilities.length}
                  </p>
                  {newFacilityFor === hospital.id ? null : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFacilityId(null);
                        setFacilityDraft(null);
                        setEditingHospitalId(null);
                        setHospitalDraft(null);
                        setNewFacilityFor(hospital.id);
                        setNewFacilityDraft({
                          name: "",
                          code: "",
                          status: "active",
                        });
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground transition hover:bg-accent"
                    >
                      <Plus className="size-3.5" /> Add facility
                    </button>
                  )}
                </div>

                {hospital.facilities.length ? (
                  <div className="mt-2 divide-y divide-border">
                    {hospital.facilities.map((facility) => (
                      <div
                        key={facility.id}
                        className="flex flex-col gap-2 py-2 first:pt-0 last:pb-0"
                      >
                        {editingFacilityId === facility.id && facilityDraft ? (
                          <div className="grid gap-3 sm:grid-cols-3">
                            <label className="text-xs font-medium text-muted-foreground">
                              Facility name
                              <input
                                value={facilityDraft.name}
                                onChange={(event) =>
                                  setFacilityDraft({
                                    ...facilityDraft,
                                    name: event.currentTarget.value,
                                  })
                                }
                                className={fieldClass}
                              />
                            </label>
                            <label className="text-xs font-medium text-muted-foreground">
                              Facility code
                              <input
                                value={facilityDraft.code}
                                onChange={(event) =>
                                  setFacilityDraft({
                                    ...facilityDraft,
                                    code: event.currentTarget.value,
                                  })
                                }
                                className={fieldClass}
                              />
                            </label>
                            <label className="text-xs font-medium text-muted-foreground">
                              Status
                              <select
                                value={facilityDraft.status}
                                onChange={(event) =>
                                  setFacilityDraft({
                                    ...facilityDraft,
                                    status: event.currentTarget.value,
                                  })
                                }
                                className={fieldClass}
                              >
                                {FACILITY_STATUSES.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <div className="flex gap-2 sm:col-span-3">
                              <button
                                type="button"
                                onClick={() =>
                                  void saveFacility(hospital, facility.id)
                                }
                                disabled={saving !== null}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                              >
                                {saving === `facility:${facility.id}` ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="size-4" />
                                )}
                                Save facility
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingFacilityId(null);
                                  setFacilityDraft(null);
                                }}
                                disabled={saving !== null}
                                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
                              >
                                <X className="size-4" /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {facility.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {facility.code}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusPill status={facility.status} />
                              <button
                                type="button"
                                onClick={() => beginFacilityEdit(facility)}
                                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground transition hover:bg-accent"
                              >
                                <Pencil className="size-3.5" /> Edit
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No facilities recorded.
                  </p>
                )}

                {newFacilityFor === hospital.id && (
                  <div className="mt-3 grid gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-3">
                    <label className="text-xs font-medium text-muted-foreground">
                      Facility name
                      <input
                        value={newFacilityDraft.name}
                        onChange={(event) =>
                          setNewFacilityDraft({
                            ...newFacilityDraft,
                            name: event.currentTarget.value,
                          })
                        }
                        className={fieldClass}
                      />
                    </label>
                    <label className="text-xs font-medium text-muted-foreground">
                      Facility code
                      <input
                        value={newFacilityDraft.code}
                        onChange={(event) =>
                          setNewFacilityDraft({
                            ...newFacilityDraft,
                            code: event.currentTarget.value,
                          })
                        }
                        className={fieldClass}
                      />
                    </label>
                    <label className="text-xs font-medium text-muted-foreground">
                      Status
                      <select
                        value={newFacilityDraft.status}
                        onChange={(event) =>
                          setNewFacilityDraft({
                            ...newFacilityDraft,
                            status: event.currentTarget.value,
                          })
                        }
                        className={fieldClass}
                      >
                        {FACILITY_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex gap-2 sm:col-span-3">
                      <button
                        type="button"
                        onClick={() => void addFacility(hospital)}
                        disabled={saving !== null}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                      >
                        {saving === `new-facility:${hospital.id}` ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Plus className="size-4" />
                        )}
                        Add facility
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewFacilityFor(null);
                          setNewFacilityDraft({
                            name: "",
                            code: "",
                            status: "active",
                          });
                        }}
                        disabled={saving !== null}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
                      >
                        <X className="size-4" /> Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function PlatformStaffRecords({
  records,
}: {
  records: PlatformStaffRecord[];
}) {
  return (
    <Panel
      title="Staff records"
      subtitle={`${records.length} employee records across all hospitals`}
    >
      {records.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff records found"
          description="Employee accounts will appear here when they are registered with a hospital."
        />
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {records.map((staff) => (
            <article
              key={staff.id}
              className="min-w-0 rounded-xl border border-border p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="break-all text-sm font-semibold text-foreground">
                    {staff.email ?? staff.employeeCode}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Employee code: {staff.employeeCode}
                  </p>
                </div>
                <StatusPill status={staff.employmentStatus} />
              </div>
              <dl className="mt-3 grid gap-2 border-t border-border pt-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Hospital</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {staff.hospitalName}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Assigned roles</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {staff.roles.length
                      ? staff.roles.join(", ")
                      : "No role assigned"}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}
