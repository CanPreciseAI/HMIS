import { useEffect, useMemo, useState } from "react";
import { Banknote, Loader2, Search } from "lucide-react";
import {
  formatDate,
  loadFacilityPaymentLedger,
  money,
  type PaymentLedgerRow,
  type StaffContext,
} from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";

const INVOICE_STATUSES = [
  "all",
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "cancelled",
];

/**
 * The hospital administrator's billing view: every patient's invoice with what
 * has been paid, what is still due, the latest payment and the staff caring for
 * that patient. No charge capture or invoice editing here.
 */
export function PaymentLedgerPanel({ ctx }: { ctx: StaffContext }) {
  const [rows, setRows] = useState<PaymentLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void loadFacilityPaymentLedger(ctx)
      .then((result) => {
        if (cancelled) return;
        setRows(result);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load patient payments.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus =
        statusFilter === "all" || row.status === statusFilter;
      const matchesSearch =
        !query ||
        [
          row.patient,
          row.patientNumber,
          row.number,
          row.staff.doctor,
          row.staff.nurse,
          row.staff.ward,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [rows, search, statusFilter]);

  const totals = useMemo(() => {
    const active = rows.filter((row) => row.status !== "cancelled");
    return {
      invoiced: active.reduce((sum, row) => sum + row.amount, 0),
      collected: active.reduce((sum, row) => sum + row.paid, 0),
      outstanding: active.reduce((sum, row) => sum + row.outstanding, 0),
      pending: active.filter(
        (row) => row.outstanding > 0 && row.status !== "draft",
      ).length,
    };
  }, [rows]);

  return (
    <Panel
      title="Patient payments"
      subtitle="Every invoice for this facility, what the patient has paid, what is still due, and the staff looking after them."
      action={
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
          <Banknote className="size-4" aria-hidden="true" />
        </span>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Invoiced", value: money(totals.invoiced) },
          { label: "Collected", value: money(totals.collected) },
          {
            label: "Still due",
            value: money(totals.outstanding),
            hint: `${totals.pending} invoice${totals.pending === 1 ? "" : "s"}`,
          },
          { label: "All invoices", value: String(rows.length) },
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
          <span className="sr-only">Search payments</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by patient, MRN, invoice or staff"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <label className="sr-only" htmlFor="payment-status-filter">
          Filter by payment status
        </label>
        <select
          id="payment-status-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {INVOICE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status === "all" ? "All statuses" : status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading patient payments…
        </p>
      )}

      {!loading && !error && visible.length === 0 && (
        <EmptyState
          icon={Banknote}
          title="No payments to show"
          description="Invoices and payments recorded for this facility will appear here with their status."
        />
      )}

      {!loading && visible.length > 0 && (
        <ul className="divide-y divide-border">
          {visible.map((row) => (
            <li key={row.invoiceId} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {row.number} · {row.patient}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {row.patientNumber ?? "No MRN"} ·{" "}
                    {row.issuedAt
                      ? `Issued ${formatDate(row.issuedAt)}`
                      : "Not issued yet"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {row.lastPaymentStatus && (
                    <StatusPill status={row.lastPaymentStatus} />
                  )}
                  <StatusPill status={row.status} />
                </div>
              </div>

              <p className="mt-1.5 text-xs text-muted-foreground">
                {money(row.amount)} total · {money(row.paid)} paid ·{" "}
                <span
                  className={
                    row.outstanding > 0
                      ? "font-semibold text-amber-700"
                      : "font-semibold text-emerald-700"
                  }
                >
                  {money(row.outstanding)} due
                </span>
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                {row.lastPaymentAt
                  ? `Last payment ${formatDate(row.lastPaymentAt)}${row.lastPaymentMethod ? ` by ${row.lastPaymentMethod.replaceAll("_", " ")}` : ""}${row.lastPaymentReference ? ` · ${row.lastPaymentReference}` : ""}`
                  : "No payment received yet"}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                {[
                  row.staff.doctor ? `Doctor: ${row.staff.doctor}` : null,
                  row.staff.nurse ? `Nurse: ${row.staff.nurse}` : null,
                  row.staff.ward
                    ? `${row.staff.ward}${row.staff.bed ? ` · bed ${row.staff.bed}` : ""}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "No care team assigned yet"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
