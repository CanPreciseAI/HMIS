import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Loader2, Pill, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  dispensePrescriptionItem,
  formatDate,
  loadFacilityPrescriptionLines,
  LOW_STOCK_THRESHOLD,
  type PrescriptionLine,
  type StaffContext,
} from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";

const fieldClass =
  "h-8 w-20 rounded-lg border border-input bg-background px-2 text-right text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

const filterClass =
  "flex h-9 min-w-0 items-center gap-2 rounded-lg border border-input bg-background px-2.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring";

function lineStatus(row: PrescriptionLine) {
  if (row.remaining <= 0) return "dispensed";
  if (row.dispensed > 0) return "partial";
  return "pending";
}

function formatQuantity(value: number) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function stockTone(row: PrescriptionLine) {
  if (!row.stockLinked) {
    return "bg-muted text-muted-foreground ring-border";
  }
  if (row.stockAvailable <= 0) {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }
  if (row.stockAvailable <= LOW_STOCK_THRESHOLD) {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }
  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

type DispenseOutcome = {
  medicine: string;
  patient: string;
  quantity: number;
  remaining: number;
  fullyDispensed: boolean;
  stockAvailable: number | null;
  stockLinked: boolean | null;
};

/**
 * The pharmacist's dispensing desk: every active prescription line, what is
 * still owed, and a quantity to hand over. Recording it updates the line.
 */
export function PrescriptionQueuePanel({ ctx }: { ctx: StaffContext }) {
  const [lines, setLines] = useState<PrescriptionLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [medicineQuery, setMedicineQuery] = useState("");
  const [lastDispense, setLastDispense] = useState<DispenseOutcome | null>(
    null,
  );

  const refresh = useCallback(async (): Promise<PrescriptionLine[]> => {
    setLoading(true);
    setError("");
    try {
      const rows = await loadFacilityPrescriptionLines(ctx);
      setLines(rows);
      setQuantities((current) => {
        const next: Record<string, string> = { ...current };
        for (const row of rows) {
          if (row.status === "active" && row.remaining > 0) {
            next[row.id] ??= String(row.remaining);
          }
        }
        return next;
      });
      return rows;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the prescription queue.",
      );
      return [];
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openLines = useMemo(
    () =>
      lines.filter((line) => line.status === "active" && line.remaining > 0),
    [lines],
  );

  const filteredLines = useMemo(() => {
    const patientNeedle = patientQuery.trim().toLowerCase();
    const medicineNeedle = medicineQuery.trim().toLowerCase();

    return openLines.filter((line) => {
      const matchesPatient =
        !patientNeedle ||
        `${line.patient} ${line.patientNumber ?? ""}`
          .toLowerCase()
          .includes(patientNeedle);
      const matchesMedicine =
        !medicineNeedle || line.medicine.toLowerCase().includes(medicineNeedle);
      return matchesPatient && matchesMedicine;
    });
  }, [medicineQuery, openLines, patientQuery]);

  async function dispense(row: PrescriptionLine) {
    const quantity = Number(quantities[row.id] ?? row.remaining);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Enter a quantity greater than zero.");
      return;
    }
    if (quantity > row.remaining) {
      toast.error(`Only ${row.remaining} left to dispense on this line.`);
      return;
    }

    setBusyId(row.id);
    try {
      await dispensePrescriptionItem(row.id, quantity);
      const rows = await refresh();
      const updated = rows.find((line) => line.id === row.id);
      const remaining =
        updated?.remaining ?? Math.max(row.remaining - quantity, 0);
      setLastDispense({
        medicine: row.medicine,
        patient: row.patient,
        quantity,
        remaining,
        fullyDispensed: remaining <= 0,
        stockAvailable: updated?.stockAvailable ?? null,
        stockLinked: updated?.stockLinked ?? null,
      });
      toast.success(
        quantity === row.remaining
          ? `${row.medicine} fully dispensed`
          : `${quantity} of ${row.medicine} dispensed`,
      );
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not record the dispense.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title="Prescription lines"
      subtitle="Hand over what is owed and record it here. Narrow the queue by patient or medicine when the counter is busy."
    >
      {lastDispense && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900"
        >
          <p className="font-semibold">
            Dispensed {formatQuantity(lastDispense.quantity)} of{" "}
            {lastDispense.medicine}
          </p>
          <p className="mt-0.5">
            {lastDispense.patient} ·{" "}
            {lastDispense.fullyDispensed
              ? "line complete"
              : `${formatQuantity(lastDispense.remaining)} left to dispense`}
            {lastDispense.stockLinked === null
              ? " · stock unavailable"
              : lastDispense.stockLinked
                ? ` · ${formatQuantity(lastDispense.stockAvailable ?? 0)} stock remaining`
                : " · stock not linked"}
          </p>
        </div>
      )}
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading prescription lines…
        </p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : openLines.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nothing left to dispense"
          description="Active prescription lines with quantity remaining will appear here."
        />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className={filterClass}>
              <Search
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="sr-only">Search by patient</span>
              <input
                value={patientQuery}
                onChange={(event) => setPatientQuery(event.currentTarget.value)}
                placeholder="Search patient name or MRN"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              {patientQuery && (
                <button
                  type="button"
                  onClick={() => setPatientQuery("")}
                  aria-label="Clear patient filter"
                  className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </label>
            <label className={filterClass}>
              <Search
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="sr-only">Search by medicine</span>
              <input
                value={medicineQuery}
                onChange={(event) =>
                  setMedicineQuery(event.currentTarget.value)
                }
                placeholder="Search medicine name"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              {medicineQuery && (
                <button
                  type="button"
                  onClick={() => setMedicineQuery("")}
                  aria-label="Clear medicine filter"
                  className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </label>
          </div>

          {filteredLines.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No matching prescription lines"
              description="Try another patient name, MRN, or medicine."
            />
          ) : (
            <ul className="divide-y divide-border">
              {filteredLines.map((row) => {
                const quantity = quantities[row.id] ?? String(row.remaining);
                const status = lineStatus(row);
                return (
                  <li
                    key={row.id}
                    className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {row.medicine} · {row.patient}
                        {row.patientNumber ? ` (${row.patientNumber})` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.dose} · {row.route} · {row.frequency} ·{" "}
                        {row.duration}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatQuantity(row.dispensed)} of{" "}
                        {formatQuantity(row.prescribed)} dispensed ·{" "}
                        {formatQuantity(row.remaining)} left to dispense ·{" "}
                        {row.prescriber} · {formatDate(row.prescribedAt)}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                        <span
                          className={`inline-flex items-center rounded-full px-1.5 py-0.5 font-semibold ring-1 ring-inset ${stockTone(row)}`}
                        >
                          {row.stockLinked
                            ? `${formatQuantity(row.stockAvailable)} stock remaining`
                            : "Stock not linked"}
                        </span>
                        {row.lastDispensedQuantity !== null && (
                          <span className="text-muted-foreground">
                            Last dispense{" "}
                            {formatQuantity(row.lastDispensedQuantity)}
                            {row.lastDispensedAt
                              ? ` · ${formatDate(row.lastDispensedAt)}`
                              : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <StatusPill status={status} />
                      <label className="text-[11px] font-medium text-muted-foreground">
                        Qty
                        <input
                          type="number"
                          min="0.01"
                          max={row.remaining}
                          step="0.01"
                          value={quantity}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [row.id]: event.currentTarget.value,
                            }))
                          }
                          disabled={busyId === row.id}
                          className={`${fieldClass} ml-1`}
                          aria-label={`Quantity to dispense of ${row.medicine}`}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void dispense(row)}
                        disabled={busyId === row.id}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                      >
                        {busyId === row.id ? (
                          <Loader2
                            className="size-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Pill className="size-3.5" aria-hidden="true" />
                        )}
                        Dispense
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}
