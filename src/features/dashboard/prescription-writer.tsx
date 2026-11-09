import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, Pill, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  loadMedicineCatalogStock,
  loadPharmacyMedicines,
  loadPrescriptionPatientOptions,
  writePrescription,
  type InvoicePatientOption,
  type MedicineCatalogStock,
  type PharmacyMedicine,
  type StaffContext,
} from "./data";
import { EmptyState, Panel } from "./ui";

const fieldClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

type DraftLine = {
  key: string;
  medicineId: string;
  dose: string;
  route: string;
  frequency: string;
  duration: string;
  quantity: string;
};

/**
 * The doctor prescribes medicines for a patient. Each line is stored against
 * the doctor's encounter and immediately shows on the pharmacy dashboard, where
 * the pharmacist dispenses from the prescription queue.
 */
export function PrescriptionWriterPanel({ ctx }: { ctx: StaffContext }) {
  const [patients, setPatients] = useState<InvoicePatientOption[]>([]);
  const [medicines, setMedicines] = useState<PharmacyMedicine[]>([]);
  const [stock, setStock] = useState<Map<string, MedicineCatalogStock>>(
    new Map(),
  );
  const [patientId, setPatientId] = useState("");
  const [medicineId, setMedicineId] = useState("");
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState("Oral");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [patientOptions, medicineOptions, stockRows] = await Promise.all([
        loadPrescriptionPatientOptions(ctx),
        loadPharmacyMedicines(ctx),
        ctx.tenantId
          ? loadMedicineCatalogStock(ctx.tenantId)
          : Promise.resolve([]),
      ]);
      setPatients(patientOptions);
      setMedicines(medicineOptions);
      setStock(new Map(stockRows.map((row) => [row.medicine_id, row])));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the prescription form.",
      );
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshStock = useCallback(async () => {
    if (!ctx.tenantId) return;
    try {
      const rows = await loadMedicineCatalogStock(ctx.tenantId);
      setStock(new Map(rows.map((row) => [row.medicine_id, row])));
    } catch {
      // The prescription was already sent; the next load refreshes stock.
    }
  }, [ctx.tenantId]);

  function availableFor(id: string): number | null {
    const row = stock.get(id);
    if (!row || !row.is_mapped) return null;
    return Number(row.available_quantity);
  }

  function draftQuantityFor(id: string): number {
    return lines
      .filter((line) => line.medicineId === id)
      .reduce((sum, line) => sum + Number(line.quantity), 0);
  }

  function medicineStockLabel(id: string): string {
    const available = availableFor(id);
    return available === null
      ? `Stock not linked to inventory`
      : `${available} in stock`;
  }

  function stockAfterLabel(id: string): string {
    const available = availableFor(id);
    if (available === null) return "Stock not linked to inventory";
    const remaining = available - draftQuantityFor(id);
    return remaining < 0
      ? `${available} in stock · short by ${Math.abs(remaining)}`
      : `${available} in stock · ${remaining} left after this prescription`;
  }

  function medicineLabel(id: string) {
    const medicine = medicines.find((row) => row.id === id);
    return medicine ? `${medicine.name} ${medicine.strength}` : "Medicine";
  }

  function addLine() {
    if (!medicineId) {
      setError("Choose a medicine to prescribe.");
      return;
    }
    const prescribedQuantity = Number(quantity);
    if (!Number.isFinite(prescribedQuantity) || prescribedQuantity <= 0) {
      setError("Enter a quantity greater than zero.");
      return;
    }
    if (lines.some((line) => line.medicineId === medicineId)) {
      setError(
        "That medicine is already on this prescription — remove the line to change it.",
      );
      return;
    }

    setError("");
    setLines((current) => [
      ...current,
      {
        key: `${medicineId}-${current.length}-${Date.now()}`,
        medicineId,
        dose: dose.trim() || "As directed",
        route: route.trim() || "Oral",
        frequency: frequency.trim() || "As directed",
        duration: duration.trim() || "As directed",
        quantity,
      },
    ]);
    setMedicineId("");
    setDose("");
    setFrequency("");
    setDuration("");
    setQuantity("1");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patientId) {
      setError("Choose the patient this prescription is for.");
      return;
    }
    if (!lines.length) {
      setError("Add at least one medicine to the prescription.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await writePrescription(
        patientId,
        lines.map((line) => ({
          medicineId: line.medicineId,
          dose: line.dose,
          route: line.route,
          frequency: line.frequency,
          duration: line.duration,
          quantity: Number(line.quantity),
        })),
      );
      toast.success("Prescription sent to the pharmacy");
      setLines([]);
      setPatientId("");
      await refreshStock();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not send the prescription.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      title="Write a prescription"
      subtitle="Each medicine you add appears on the pharmacy dashboard as a prescription line to dispense."
    >
      {loading ? (
        <div className="grid place-items-center py-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <label className="block max-w-md text-xs font-medium text-muted-foreground">
            Patient
            <select
              required
              value={patientId}
              onChange={(event) => setPatientId(event.currentTarget.value)}
              disabled={saving}
              className={fieldClass}
            >
              <option value="">Select a patient</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name} · {patient.number}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-foreground">
              Add a medicine
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Medicine
                <select
                  value={medicineId}
                  onChange={(event) => setMedicineId(event.currentTarget.value)}
                  disabled={saving || medicines.length === 0}
                  className={fieldClass}
                >
                  <option value="">
                    {medicines.length
                      ? "Select a medicine"
                      : "No medicines in the catalog"}
                  </option>
                  {medicines.map((medicine) => (
                    <option key={medicine.id} value={medicine.id}>
                      {medicine.name} {medicine.strength} ·{" "}
                      {medicine.dosageForm} · {medicineStockLabel(medicine.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Dose
                <input
                  value={dose}
                  onChange={(event) => setDose(event.currentTarget.value)}
                  placeholder="e.g. 1 tablet"
                  disabled={saving}
                  className={fieldClass}
                />
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Route
                <input
                  value={route}
                  onChange={(event) => setRoute(event.currentTarget.value)}
                  placeholder="e.g. Oral"
                  disabled={saving}
                  className={fieldClass}
                />
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Frequency
                <input
                  value={frequency}
                  onChange={(event) => setFrequency(event.currentTarget.value)}
                  placeholder="e.g. Twice daily"
                  disabled={saving}
                  className={fieldClass}
                />
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Duration
                <input
                  value={duration}
                  onChange={(event) => setDuration(event.currentTarget.value)}
                  placeholder="e.g. 7 days"
                  disabled={saving}
                  className={fieldClass}
                />
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Quantity
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.currentTarget.value)}
                  disabled={saving}
                  className={fieldClass}
                />
              </label>
            </div>
            {medicineId && (
              <p className="mt-2 text-xs text-muted-foreground">
                {stockAfterLabel(medicineId)}
              </p>
            )}
            <div className="mt-3">
              <button
                type="button"
                onClick={addLine}
                disabled={saving || !medicineId}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-semibold transition hover:bg-muted disabled:opacity-50"
              >
                <Plus className="size-4" />
                Add line
              </button>
            </div>
          </div>

          {lines.length ? (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {lines.map((line) => (
                <li
                  key={line.key}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {medicineLabel(line.medicineId)}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {line.dose} · {line.route} · {line.frequency} ·{" "}
                      {line.duration}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {stockAfterLabel(line.medicineId)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">
                      Qty {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setLines((current) =>
                          current.filter((row) => row.key !== line.key),
                        )
                      }
                      disabled={saving}
                      className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      aria-label={`Remove ${medicineLabel(line.medicineId)}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Pill}
              title="No medicines added yet"
              description="Pick a medicine, describe the regimen, then add it to the prescription."
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {lines.length
                  ? `${lines.length} medicine${lines.length === 1 ? "" : "s"} ready to send`
                  : "The prescription is sent once you add at least one medicine."}
              </p>
            )}
            <button
              type="submit"
              disabled={saving || !patientId || lines.length === 0}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {saving ? "Sending…" : "Send to pharmacy"}
            </button>
          </div>
        </form>
      )}
    </Panel>
  );
}
