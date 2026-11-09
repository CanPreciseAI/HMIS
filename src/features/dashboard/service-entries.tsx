import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { CheckCheck, ClipboardList, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  confirmServiceCharge,
  formatDate,
  humanise,
  loadInvoiceChargeOptions,
  loadInvoicePatientOptions,
  loadPharmacyMedicines,
  loadServiceCharges,
  money,
  recordMedicineCharge,
  recordServiceCharge,
  type InvoiceChargeOption,
  type InvoicePatientOption,
  type PharmacyMedicine,
  type ServiceChargeRow,
  type StaffContext,
} from "./data";
import { EmptyState, Panel } from "./ui";
import { ReceptionInvoicePanel } from "./invoice-print";

const fieldClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

function canMarkEntries(role: StaffContext["role"]) {
  return role === "hospital_admin" || role === "receptionist";
}

function statusOf(row: ServiceChargeRow) {
  if (row.status === "invoiced") return { label: "Invoiced", tone: "invoiced" };
  if (row.confirmedAt) return { label: "Complete", tone: "complete" };
  return { label: "Pending review", tone: "pending" };
}

const STATUS_CLASS: Record<string, string> = {
  invoiced: "bg-sky-50 text-sky-700 ring-sky-200",
  complete: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
};

/**
 * The billing desk for every staff role except doctors: choose a patient, add
 * the service or item you provided, and see everything else recorded for that
 * patient. Entries stay open until an administrator or receptionist marks them
 * complete.
 */
export function ServiceEntryPanel({ ctx }: { ctx: StaffContext }) {
  const [patients, setPatients] = useState<InvoicePatientOption[]>([]);
  const [services, setServices] = useState<InvoiceChargeOption[]>([]);
  const [medicines, setMedicines] = useState<PharmacyMedicine[]>([]);
  const [entries, setEntries] = useState<ServiceChargeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [patientId, setPatientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [medicineId, setMedicineId] = useState("");
  const [medicineQuantity, setMedicineQuantity] = useState("1");
  const [medicinePrice, setMedicinePrice] = useState("");
  const [medicineNote, setMedicineNote] = useState("");
  const [medicineSaving, setMedicineSaving] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const isPharmacist = ctx.role === "pharmacist";
  const canMark = canMarkEntries(ctx.role);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [patientRows, serviceRows, medicineRows, entryRows] =
        await Promise.all([
          loadInvoicePatientOptions(ctx),
          loadInvoiceChargeOptions(ctx),
          isPharmacist
            ? loadPharmacyMedicines(ctx)
            : Promise.resolve([] as PharmacyMedicine[]),
          loadServiceCharges(ctx),
        ]);
      setPatients(patientRows);
      setServices(serviceRows);
      setMedicines(medicineRows);
      setEntries(entryRows);
      setPatientId((current) => current || patientRows[0]?.id || "");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the billing entries.",
      );
    } finally {
      setLoading(false);
    }
  }, [ctx, isPharmacist]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedPatient = patients.find((row) => row.id === patientId) ?? null;
  const patientEntries = useMemo(
    () => entries.filter((row) => row.patientId === patientId),
    [entries, patientId],
  );
  const pendingCount = patientEntries.filter(
    (row) => row.status === "recorded" && !row.confirmedAt,
  ).length;
  const selectedService =
    services.find((service) => service.id === serviceId) ?? null;
  const selectedMedicine =
    medicines.find((medicine) => medicine.id === medicineId) ?? null;

  async function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!patientId || !serviceId) {
      toast.error("Choose the patient and the service you provided.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Enter a quantity greater than zero.");
      return;
    }

    setSaving(true);
    try {
      await recordServiceCharge(ctx, {
        patientId,
        chargeId: serviceId,
        quantity: qty,
        note,
      });
      toast.success("Service added — it stays open until reception marks it");
      setServiceId("");
      setQuantity("1");
      setNote("");
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not add the service.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function addMedicine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = Number(medicineQuantity);
    const price = Number(medicinePrice);
    if (!patientId || !medicineId) {
      toast.error("Choose the patient and the medicine supplied.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Enter a quantity greater than zero.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Enter a price of zero or more.");
      return;
    }

    setMedicineSaving(true);
    try {
      await recordMedicineCharge(ctx, {
        patientId,
        medicineId,
        quantity: qty,
        unitPrice: price,
        note: medicineNote,
      });
      toast.success("Medicine added — it stays open until reception marks it");
      setMedicineId("");
      setMedicineQuantity("1");
      setMedicinePrice("");
      setMedicineNote("");
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not add the medicine.",
      );
    } finally {
      setMedicineSaving(false);
    }
  }

  async function markComplete(row: ServiceChargeRow) {
    setMarkingId(row.id);
    try {
      await confirmServiceCharge(row.id, true);
      setEntries((current) =>
        current.map((item) =>
          item.id === row.id
            ? { ...item, confirmedAt: new Date().toISOString() }
            : item,
        ),
      );
      toast.success(`${row.service} marked complete`);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not mark the entry.",
      );
    } finally {
      setMarkingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Billing entries"
        subtitle="Choose a patient, add what you provided, and see every entry recorded for them. Entries stay open until an administrator or receptionist marks them complete."
      >
        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}

        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading billing entries…
          </p>
        ) : (
          <div className="space-y-4">
            <label className="block max-w-md text-xs font-medium text-foreground">
              Patient
              <select
                value={patientId}
                onChange={(event) => setPatientId(event.currentTarget.value)}
                className={fieldClass}
              >
                {patients.length === 0 && (
                  <option value="">No active patients</option>
                )}
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name} · {patient.number}
                  </option>
                ))}
              </select>
            </label>

            {selectedPatient && (
              <form
                onSubmit={(event) => void addService(event)}
                className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-2 xl:grid-cols-4"
              >
                <label className="text-xs font-medium text-foreground sm:col-span-2">
                  Service provided
                  <select
                    required
                    value={serviceId}
                    onChange={(event) =>
                      setServiceId(event.currentTarget.value)
                    }
                    disabled={saving || services.length === 0}
                    className={fieldClass}
                  >
                    <option value="">
                      {services.length
                        ? "Choose a service"
                        : "No price list yet"}
                    </option>
                    {services.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} · {money(service.unitPrice)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-foreground">
                  Quantity
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={quantity}
                    onChange={(event) => setQuantity(event.currentTarget.value)}
                    disabled={saving}
                    className={fieldClass}
                  />
                </label>
                <label className="text-xs font-medium text-foreground">
                  Note (optional)
                  <input
                    value={note}
                    onChange={(event) => setNote(event.currentTarget.value)}
                    placeholder="e.g. dressing on left arm"
                    disabled={saving}
                    className={fieldClass}
                  />
                </label>
                <div className="flex items-end justify-between gap-3 sm:col-span-2 xl:col-span-4">
                  <p className="text-xs text-muted-foreground">
                    {selectedService
                      ? `Amount ${money(selectedService.unitPrice * (Number(quantity) || 0))}`
                      : "Pick a service to see the amount."}
                  </p>
                  <button
                    type="submit"
                    disabled={saving || !serviceId}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Send className="size-4" aria-hidden="true" />
                    )}
                    Add service
                  </button>
                </div>
              </form>
            )}

            {isPharmacist && selectedPatient && (
              <form
                onSubmit={(event) => void addMedicine(event)}
                className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-2 xl:grid-cols-5"
              >
                <label className="text-xs font-medium text-foreground sm:col-span-2">
                  Medicine supplied
                  <select
                    required
                    value={medicineId}
                    onChange={(event) =>
                      setMedicineId(event.currentTarget.value)
                    }
                    disabled={medicineSaving || medicines.length === 0}
                    className={fieldClass}
                  >
                    <option value="">
                      {medicines.length ? "Choose a medicine" : "No medicines"}
                    </option>
                    {medicines.map((medicine) => (
                      <option key={medicine.id} value={medicine.id}>
                        {medicine.name} {medicine.strength}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-foreground">
                  Quantity
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={medicineQuantity}
                    onChange={(event) =>
                      setMedicineQuantity(event.currentTarget.value)
                    }
                    disabled={medicineSaving}
                    className={fieldClass}
                  />
                </label>
                <label className="text-xs font-medium text-foreground">
                  Price per unit
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={medicinePrice}
                    onChange={(event) =>
                      setMedicinePrice(event.currentTarget.value)
                    }
                    placeholder="e.g. 25.50"
                    disabled={medicineSaving}
                    className={fieldClass}
                  />
                </label>
                <label className="text-xs font-medium text-foreground">
                  Note (optional)
                  <input
                    value={medicineNote}
                    onChange={(event) =>
                      setMedicineNote(event.currentTarget.value)
                    }
                    placeholder="e.g. 10 tablets handed over"
                    disabled={medicineSaving}
                    className={fieldClass}
                  />
                </label>
                <div className="flex items-end justify-between gap-3 sm:col-span-2 xl:col-span-5">
                  <p className="text-xs text-muted-foreground">
                    {selectedMedicine
                      ? `Amount ${money((Number(medicineQuantity) || 0) * (Number(medicinePrice) || 0))}`
                      : "Pick a medicine to see the amount."}
                  </p>
                  <button
                    type="submit"
                    disabled={medicineSaving || !medicineId}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
                  >
                    {medicineSaving ? (
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Send className="size-4" aria-hidden="true" />
                    )}
                    Add medicine
                  </button>
                </div>
              </form>
            )}

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ClipboardList className="size-4" aria-hidden="true" />
                  Entries for {selectedPatient?.name ?? "this patient"}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {patientEntries.length} entr
                  {patientEntries.length === 1 ? "y" : "ies"}
                  {pendingCount > 0 ? ` · ${pendingCount} awaiting review` : ""}
                </span>
              </div>

              {patientEntries.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="Nothing added yet"
                  description="Services and items added for this patient will appear here."
                />
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {patientEntries.map((row) => {
                    const status = statusOf(row);
                    return (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {row.service} · {money(row.amount)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {row.quantity} × {money(row.unitPrice)} ·{" "}
                            {humanise(row.recordedRole)} {row.recordedBy} ·{" "}
                            {formatDate(row.createdAt)}
                            {row.note ? ` · ${row.note}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_CLASS[status.tone]}`}
                          >
                            {status.label}
                          </span>
                          {canMark &&
                            row.status === "recorded" &&
                            !row.confirmedAt && (
                              <button
                                type="button"
                                onClick={() => void markComplete(row)}
                                disabled={markingId === row.id}
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
                              >
                                {markingId === row.id ? (
                                  <Loader2
                                    className="size-3.5 animate-spin"
                                    aria-hidden="true"
                                  />
                                ) : (
                                  <CheckCheck
                                    className="size-3.5"
                                    aria-hidden="true"
                                  />
                                )}
                                Mark complete
                              </button>
                            )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </Panel>
      {ctx.role === "receptionist" && <ReceptionInvoicePanel ctx={ctx} />}
    </div>
  );
}
