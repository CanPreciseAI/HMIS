import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  Check,
  ClipboardList,
  FileText,
  Loader2,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  cancelInsurancePolicy,
  createInsurancePolicy,
  formatDate,
  loadInsuranceData,
  loadInvoicePatientOptions,
  money,
  reviewInsuranceClaim,
  submitInsuranceClaim,
  type InsuranceClaimRow,
  type InsuranceData,
  type InsurancePolicyRow,
  type InvoicePatientOption,
  type StaffContext,
} from "./data";
import { ErrorBlock, LoadingBlock } from "./doctor";
import { DashboardShell, PageHeading, type NavItem } from "./shell";
import { useDashboardData } from "./use-dashboard-data";
import { EmptyState, Panel, StatCard, StatusPill } from "./ui";
import { buildOverviewNotifications } from "./section-notifications";

const fieldClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

const NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: ShieldCheck },
  { label: "Policies", href: "/dashboard/insurance-policies", icon: FileText },
  {
    label: "Claims",
    href: "/dashboard/insurance-claims",
    icon: ClipboardList,
  },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** The insurance company's home: cover at a glance, then policies and claims. */
export function InsuranceWorkspace({ ctx }: { ctx: StaffContext }) {
  const { data, loading, error } = useDashboardData(ctx, loadInsuranceData);

  const activePolicies = useMemo(
    () => (data?.policies ?? []).filter((row) => row.status === "active"),
    [data],
  );
  const openClaims = (data?.claims ?? []).filter(
    (row) => row.status === "submitted",
  );
  const settledClaims = (data?.claims ?? []).filter(
    (row) => row.status === "approved" || row.status === "paid",
  );
  const coveredPatients = new Set(activePolicies.map((row) => row.patientId))
    .size;
  const settledValue = settledClaims.reduce((sum, row) => sum + row.amount, 0);
  const notifications = data
    ? buildOverviewNotifications("insurance", data)
    : [];

  return (
    <DashboardShell
      ctx={ctx}
      nav={NAV}
      {...(notifications.length ? { notifications } : {})}
    >
      <PageHeading
        title="Insurance desk"
        subtitle="Cover and claims for patients treated at this hospital."
        meta={ctx.facilityName ?? undefined}
      />
      {loading && <LoadingBlock />}
      {error && <ErrorBlock message={error} />}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={ShieldCheck}
              label="Active policies"
              value={activePolicies.length}
              hint={`${data.policies.length} on file`}
            />
            <StatCard
              icon={ClipboardList}
              label="Patients covered"
              value={coveredPatients}
              hint="With active cover"
              tone="blue"
            />
            <StatCard
              icon={FileText}
              label="Claims to review"
              value={openClaims.length}
              hint="Waiting for a decision"
              tone="amber"
            />
            <StatCard
              icon={Check}
              label="Approved value"
              value={money(settledValue)}
              hint={`${settledClaims.length} settled claim${settledClaims.length === 1 ? "" : "s"}`}
              tone="violet"
            />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Panel
              title="Claims awaiting review"
              subtitle="Newest first"
              action={
                <Link
                  to="/dashboard/$section"
                  params={{ section: "insurance-claims" }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Open claims
                </Link>
              }
            >
              {openClaims.length ? (
                <ClaimList rows={openClaims.slice(0, 5)} />
              ) : (
                <EmptyState
                  icon={ClipboardList}
                  title="No claims waiting"
                  description="Claims raised against an active policy will appear here."
                />
              )}
            </Panel>
            <Panel
              title="Active cover"
              subtitle="Policies in force today"
              action={
                <Link
                  to="/dashboard/$section"
                  params={{ section: "insurance-policies" }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Open policies
                </Link>
              }
            >
              {activePolicies.length ? (
                <PolicyList rows={activePolicies.slice(0, 5)} />
              ) : (
                <EmptyState
                  icon={ShieldCheck}
                  title="No active policies"
                  description="Add a patient's policy from the Policies section."
                />
              )}
            </Panel>
          </div>
        </>
      )}
    </DashboardShell>
  );
}

/** Registers a patient's policy and shows every policy on file. */
export function InsurancePoliciesPanel({
  ctx,
  initial,
}: {
  ctx: StaffContext;
  initial: InsuranceData;
}) {
  const [rows, setRows] = useState<InsuranceData>(initial);
  const [patients, setPatients] = useState<InvoicePatientOption[]>([]);
  const [patientId, setPatientId] = useState("");
  const [provider, setProvider] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [plan, setPlan] = useState("");
  const [coverage, setCoverage] = useState("100");
  const [validFrom, setValidFrom] = useState(today());
  const [validUntil, setValidUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  useEffect(() => {
    let cancelled = false;
    void loadInvoicePatientOptions(ctx)
      .then((options) => {
        if (!cancelled) setPatients(options);
      })
      .catch(() => {
        if (!cancelled) setPatients([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  async function refresh() {
    try {
      setRows(await loadInsuranceData(ctx));
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not refresh policies.",
      );
    }
  }

  async function addPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const coveragePercent = Number(coverage);
    if (!patientId) {
      toast.error("Choose the patient this policy covers.");
      return;
    }
    if (!provider.trim() || !policyNumber.trim()) {
      toast.error("Enter the insurer and the policy number.");
      return;
    }
    if (
      !Number.isFinite(coveragePercent) ||
      coveragePercent < 0 ||
      coveragePercent > 100
    ) {
      toast.error("Coverage must be between 0 and 100 percent.");
      return;
    }
    if (!validFrom) {
      toast.error("Choose the date cover starts.");
      return;
    }
    if (validUntil && validUntil < validFrom) {
      toast.error("Cover cannot end before it starts.");
      return;
    }

    setSaving(true);
    try {
      await createInsurancePolicy(ctx, {
        patientId,
        provider,
        policyNumber,
        plan,
        coveragePercent,
        validFrom,
        validUntil,
      });
      toast.success("Policy saved");
      setProvider("");
      setPolicyNumber("");
      setPlan("");
      setValidUntil("");
      setCoverage("100");
      setValidFrom(today());
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not save the policy.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancelPolicy(row: InsurancePolicyRow) {
    setCancellingId(row.id);
    try {
      await cancelInsurancePolicy(row.id);
      toast.success(`${row.policyNumber} cancelled`);
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not cancel the policy.",
      );
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Register a policy"
        subtitle="Cover a patient already treated at this hospital. Policy numbers must be unique for the insurer."
      >
        <form
          onSubmit={(event) => void addPolicy(event)}
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <label className="text-xs font-medium text-foreground sm:col-span-2">
            Patient
            <select
              required
              value={patientId}
              onChange={(event) => setPatientId(event.currentTarget.value)}
              className={fieldClass}
            >
              <option value="">
                {patients.length ? "Choose a patient" : "No active patients"}
              </option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name} · {patient.number}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-foreground">
            Insurance company
            <input
              required
              value={provider}
              onChange={(event) => setProvider(event.currentTarget.value)}
              placeholder="e.g. Star Health"
              disabled={saving}
              className={fieldClass}
            />
          </label>
          <label className="text-xs font-medium text-foreground">
            Policy number
            <input
              required
              value={policyNumber}
              onChange={(event) => setPolicyNumber(event.currentTarget.value)}
              placeholder="e.g. SH-2026-004512"
              disabled={saving}
              className={fieldClass}
            />
          </label>
          <label className="text-xs font-medium text-foreground">
            Plan (optional)
            <input
              value={plan}
              onChange={(event) => setPlan(event.currentTarget.value)}
              placeholder="e.g. Family floater"
              disabled={saving}
              className={fieldClass}
            />
          </label>
          <label className="text-xs font-medium text-foreground">
            Coverage %
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              value={coverage}
              onChange={(event) => setCoverage(event.currentTarget.value)}
              disabled={saving}
              className={fieldClass}
            />
          </label>
          <label className="text-xs font-medium text-foreground">
            Cover starts
            <input
              type="date"
              required
              value={validFrom}
              onChange={(event) => setValidFrom(event.currentTarget.value)}
              disabled={saving}
              className={fieldClass}
            />
          </label>
          <label className="text-xs font-medium text-foreground">
            Cover ends (optional)
            <input
              type="date"
              value={validUntil}
              onChange={(event) => setValidUntil(event.currentTarget.value)}
              disabled={saving}
              className={fieldClass}
            />
          </label>
          <div className="flex items-end justify-end sm:col-span-2 xl:col-span-4">
            <button
              type="submit"
              disabled={saving || !patientId}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="size-4" aria-hidden="true" />
              )}
              Save policy
            </button>
          </div>
        </form>
      </Panel>

      <Panel
        title="Policies on file"
        subtitle={`${rows.policies.length} polic${rows.policies.length === 1 ? "y" : "ies"}`}
      >
        {rows.policies.length ? (
          <PolicyList
            rows={rows.policies}
            onCancel={cancelPolicy}
            busyId={cancellingId}
          />
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title="No policies yet"
            description="Policies you register will be listed here, newest first."
          />
        )}
      </Panel>
    </div>
  );
}

/** Raises a claim against an active policy and settles claims awaiting review. */
export function InsuranceClaimsPanel({
  ctx,
  initial,
}: {
  ctx: StaffContext;
  initial: InsuranceData;
}) {
  const [rows, setRows] = useState<InsuranceData>(initial);
  const [policyId, setPolicyId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  const activePolicies = useMemo(
    () => rows.policies.filter((row) => row.status === "active"),
    [rows.policies],
  );
  const selectedPolicy =
    activePolicies.find((policy) => policy.id === policyId) ?? null;
  const selectedInvoice =
    rows.invoices.find((invoice) => invoice.invoiceId === invoiceId) ?? null;
  const claimableInvoices = useMemo(() => {
    if (!selectedPolicy) return [];
    const claimedInvoices = new Set<string>();
    for (const claim of rows.claims) {
      if (claim.invoiceId && claim.status !== "rejected") {
        claimedInvoices.add(claim.invoiceId);
      }
    }
    return rows.invoices.filter(
      (invoice) =>
        invoice.patientId === selectedPolicy.patientId &&
        (invoice.status === "issued" || invoice.status === "partially_paid") &&
        invoice.outstanding > 0 &&
        !claimedInvoices.has(invoice.invoiceId),
    );
  }, [rows.claims, rows.invoices, selectedPolicy]);
  const claimAmount =
    selectedPolicy && selectedInvoice
      ? Math.round(
          selectedInvoice.outstanding * selectedPolicy.coveragePercent,
        ) / 100
      : 0;

  async function refresh() {
    try {
      setRows(await loadInsuranceData(ctx));
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not refresh claims.",
      );
    }
  }

  async function addClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!policyId) {
      toast.error("Choose the policy this claim is against.");
      return;
    }
    if (!invoiceId) {
      toast.error("Choose the outstanding hospital invoice to claim.");
      return;
    }
    if (claimAmount <= 0) {
      toast.error("This policy does not cover any of the invoice balance.");
      return;
    }

    setSaving(true);
    try {
      await submitInsuranceClaim(ctx, { policyId, invoiceId, note });
      toast.success("Claim raised and linked to the hospital invoice");
      setPolicyId("");
      setInvoiceId("");
      setNote("");
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not raise the claim.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function review(
    row: InsuranceClaimRow,
    status: "approved" | "rejected" | "paid",
  ) {
    setBusyId(row.id);
    try {
      await reviewInsuranceClaim(row.id, status, "");
      toast.success(
        status === "approved"
          ? "Claim approved"
          : status === "rejected"
            ? "Claim rejected"
            : row.invoiceNumber
              ? "Claim paid and hospital invoice updated"
              : "Claim marked paid",
      );
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not review the claim.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Raise a claim"
        subtitle="Claims are linked to an outstanding hospital invoice. Marking one paid records an insurance payment against that invoice."
      >
        <form
          onSubmit={(event) => void addClaim(event)}
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <label className="text-xs font-medium text-foreground sm:col-span-2">
            Policy
            <select
              required
              value={policyId}
              onChange={(event) => {
                setPolicyId(event.currentTarget.value);
                setInvoiceId("");
              }}
              className={fieldClass}
            >
              <option value="">
                {activePolicies.length
                  ? "Choose an active policy"
                  : "No active policies"}
              </option>
              {activePolicies.map((policy) => (
                <option key={policy.id} value={policy.id}>
                  {policy.patient} · {policy.provider} · {policy.policyNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-foreground sm:col-span-2">
            Hospital invoice
            <select
              required
              value={invoiceId}
              onChange={(event) => setInvoiceId(event.currentTarget.value)}
              disabled={saving || !selectedPolicy}
              className={fieldClass}
            >
              <option value="">
                {selectedPolicy
                  ? claimableInvoices.length
                    ? "Choose an outstanding invoice"
                    : "No outstanding invoices for this patient"
                  : "Choose a policy first"}
              </option>
              {claimableInvoices.map((invoice) => (
                <option key={invoice.invoiceId} value={invoice.invoiceId}>
                  {invoice.invoiceNumber} · {money(invoice.outstanding)}{" "}
                  outstanding
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-foreground sm:col-span-2">
            Note (optional)
            <input
              value={note}
              onChange={(event) => setNote(event.currentTarget.value)}
              placeholder="e.g. admission for 3 days"
              disabled={saving}
              className={fieldClass}
            />
          </label>
          <div className="flex items-end justify-between gap-3 sm:col-span-2 xl:col-span-4">
            <p className="text-xs text-muted-foreground">
              {selectedPolicy
                ? selectedInvoice
                  ? `${money(claimAmount)} claim · ${selectedPolicy.coveragePercent}% of ${money(selectedInvoice.outstanding)} outstanding`
                  : "Choose an outstanding invoice to calculate the insurance share."
                : "Pick a policy to see the patient's cover."}
            </p>
            <button
              type="submit"
              disabled={saving || !policyId || !invoiceId || claimAmount <= 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="size-4" aria-hidden="true" />
              )}
              Raise claim
            </button>
          </div>
        </form>
      </Panel>

      <Panel
        title="Claims"
        subtitle={`${rows.claims.length} claim${rows.claims.length === 1 ? "" : "s"}`}
      >
        {rows.claims.length ? (
          <ClaimList rows={rows.claims} onReview={review} busyId={busyId} />
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No claims yet"
            description="Claims raised against a policy will appear here."
          />
        )}
      </Panel>
    </div>
  );
}

function PolicyList({
  rows,
  onCancel,
  busyId,
}: {
  rows: InsurancePolicyRow[];
  onCancel?: (row: InsurancePolicyRow) => void;
  busyId?: string | null;
}) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {row.patient} · {row.number}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.provider} · {row.policyNumber} · {row.coveragePercent}% cover
              {row.plan ? ` · ${row.plan}` : ""} · from{" "}
              {formatDate(row.validFrom)}
              {row.validUntil ? ` to ${formatDate(row.validUntil)}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill status={row.status} />
            {onCancel && row.status === "active" && (
              <button
                type="button"
                onClick={() => onCancel(row)}
                disabled={busyId === row.id}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
              >
                {busyId === row.id ? (
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <X className="size-3.5" aria-hidden="true" />
                )}
                Cancel
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ClaimList({
  rows,
  onReview,
  busyId,
}: {
  rows: InsuranceClaimRow[];
  onReview?: (
    row: InsuranceClaimRow,
    status: "approved" | "rejected" | "paid",
  ) => void;
  busyId?: string | null;
}) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {row.claimNumber} · {money(row.amount)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.patient} · {row.provider} · {row.policyNumber} · raised{" "}
              {formatDate(row.submittedAt)}
              {row.note ? ` · ${row.note}` : ""}
              {row.reviewedBy ? ` · reviewed by ${row.reviewedBy}` : ""}
            </p>
            {row.invoiceNumber ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Invoice {row.invoiceNumber} ·{" "}
                {money(row.invoiceOutstanding ?? 0)} outstanding
                {row.approvedAmount > 0
                  ? ` · ${money(row.approvedAmount)} approved`
                  : ""}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusPill status={row.status} />
            {onReview && row.status === "submitted" && (
              <>
                <button
                  type="button"
                  onClick={() => onReview(row, "approved")}
                  disabled={busyId === row.id}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                >
                  {busyId === row.id ? (
                    <Loader2
                      className="size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Check className="size-3.5" aria-hidden="true" />
                  )}
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onReview(row, "rejected")}
                  disabled={busyId === row.id}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                >
                  <X className="size-3.5" aria-hidden="true" />
                  Reject
                </button>
              </>
            )}
            {onReview && row.status === "approved" && (
              <button
                type="button"
                onClick={() => onReview(row, "paid")}
                disabled={busyId === row.id}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
              >
                {busyId === row.id ? (
                  <Loader2
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Check className="size-3.5" aria-hidden="true" />
                )}
                Mark paid
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
