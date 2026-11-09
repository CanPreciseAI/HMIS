import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Banknote,
  CheckCircle2,
  Loader2,
  Receipt,
  Search,
  Send,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  createInvoiceFromCharges,
  formatDate,
  humanise,
  loadInvoiceBalances,
  loadInvoiceChargeOptions,
  loadInvoicePatientOptions,
  loadPharmacyMedicines,
  loadServiceCharges,
  money,
  recordInvoicePayment,
  recordMedicineCharge,
  recordServiceCharge,
  voidServiceCharge,
  type InvoiceBalance,
  type InvoiceChargeOption,
  type InvoicePatientOption,
  type PharmacyMedicine,
  type ServiceChargeRow,
  type StaffContext,
} from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";

const fieldClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

const PAYMENT_METHODS = ["cash", "card", "upi", "bank_transfer", "insurance"];

function canIssueInvoices(role: StaffContext["role"]) {
  return (
    role === "hospital_admin" ||
    role === "receptionist" ||
    role === "lab_technician"
  );
}

function canRecordPayments(role: StaffContext["role"]) {
  return role === "hospital_admin" || role === "receptionist";
}

/**
 * Charge capture for every staff role. Each member records the billable
 * services they performed; the ledger is shared with all staff but never with
 * patients. Reception turns a patient's recorded charges into one invoice,
 * which is issued to the patient, and records payments against it. The invoice
 * list itself sits in the same billing section, below this panel.
 */
export function ServiceChargesPanel({ ctx }: { ctx: StaffContext }) {
  const canBill = canIssueInvoices(ctx.role);
  const canManagePayments = canRecordPayments(ctx.role);
  const [patients, setPatients] = useState<InvoicePatientOption[]>([]);
  const [services, setServices] = useState<InvoiceChargeOption[]>([]);
  const [charges, setCharges] = useState<ServiceChargeRow[]>([]);
  const [balances, setBalances] = useState<InvoiceBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [patientId, setPatientId] = useState("");
  const [chargeId, setChargeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [billPatientId, setBillPatientId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [billing, setBilling] = useState(false);

  const [payDrafts, setPayDrafts] = useState<
    Record<string, { amount: string; method: string }>
  >({});
  const [payingId, setPayingId] = useState<string | null>(null);

  const [medicines, setMedicines] = useState<PharmacyMedicine[]>([]);
  const [medicineId, setMedicineId] = useState("");
  const [medicineQty, setMedicineQty] = useState("1");
  const [medicinePrice, setMedicinePrice] = useState("");
  const [medicineNote, setMedicineNote] = useState("");
  const [medicineSaving, setMedicineSaving] = useState(false);
  const [medicineError, setMedicineError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      loadInvoicePatientOptions(ctx),
      loadInvoiceChargeOptions(ctx),
      ctx.role === "pharmacist"
        ? loadPharmacyMedicines(ctx)
        : Promise.resolve([] as PharmacyMedicine[]),
    ])
      .then(([patientOptions, chargeOptions, medicineOptions]) => {
        if (cancelled) return;
        setPatients(patientOptions);
        setServices(chargeOptions);
        setMedicines(medicineOptions);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not load patients and the price list.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [ctx]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCharges(await loadServiceCharges(ctx));
      if (canManagePayments) {
        setBalances(await loadInvoiceBalances(ctx));
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load the service ledger.",
      );
    } finally {
      setLoading(false);
    }
  }, [canManagePayments, ctx]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedService =
    services.find((service) => service.id === chargeId) ?? null;
  const quantityValue = Number(quantity);
  const estimatedAmount =
    selectedService && Number.isFinite(quantityValue) && quantityValue > 0
      ? selectedService.unitPrice * quantityValue
      : 0;

  const filteredCharges = useMemo(() => {
    const query = search.trim().toLowerCase();
    return charges.filter((row) => {
      const matchesStatus =
        statusFilter === "all" || row.status === statusFilter;
      const matchesSearch =
        !query ||
        [row.patient, row.number, row.service, row.recordedBy, row.recordedRole]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [charges, search, statusFilter]);

  const billable = useMemo(
    () =>
      charges.filter(
        (row) =>
          row.patientId === billPatientId &&
          row.status === "recorded" &&
          (ctx.role !== "lab_technician" || row.recordedByUser === ctx.userId),
      ),
    [billPatientId, charges, ctx.role, ctx.userId],
  );

  const billSubtotal = billable
    .filter((row) => selectedIds.includes(row.id))
    .reduce((sum, row) => sum + row.amount, 0);
  const billTotal =
    billSubtotal -
    (Number.isFinite(Number(discount)) ? Number(discount) : 0) +
    (Number.isFinite(Number(tax)) ? Number(tax) : 0);

  const totals = useMemo(() => {
    const outstanding = balances
      .filter((row) => row.status !== "paid")
      .reduce((sum, row) => sum + row.outstanding, 0);
    return {
      unbilled: charges
        .filter((row) => row.status === "recorded")
        .reduce((sum, row) => sum + row.amount, 0),
      outstanding,
      collected: balances.reduce((sum, row) => sum + row.paidAmount, 0),
      awaiting: balances.filter((row) => row.status !== "paid").length,
    };
  }, [balances, charges]);

  async function submitCharge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patientId || !chargeId) {
      setFormError("Choose the patient and the service performed.");
      return;
    }
    if (!Number.isFinite(quantityValue) || quantityValue <= 0) {
      setFormError("Enter a quantity greater than zero.");
      return;
    }

    setSaving(true);
    setFormError("");
    try {
      await recordServiceCharge(ctx, {
        patientId,
        chargeId,
        quantity: quantityValue,
        note,
      });
      toast.success(
        `${selectedService?.name ?? "Service"} recorded for ${patients.find((patient) => patient.id === patientId)?.name ?? "the patient"}`,
      );
      setChargeId("");
      setQuantity("1");
      setNote("");
      await refresh();
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "Could not record the service.",
      );
    } finally {
      setSaving(false);
    }
  }

  const selectedMedicine =
    medicines.find((medicine) => medicine.id === medicineId) ?? null;
  const medicineQuantity = Number(medicineQty);
  const medicineUnitPrice = Number(medicinePrice);
  const medicineAmount =
    Number.isFinite(medicineQuantity) &&
    medicineQuantity > 0 &&
    Number.isFinite(medicineUnitPrice) &&
    medicineUnitPrice >= 0
      ? medicineQuantity * medicineUnitPrice
      : 0;

  async function sellMedicine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patientId || !medicineId) {
      setMedicineError("Choose the patient and the medicine they are buying.");
      return;
    }
    if (!Number.isFinite(medicineQuantity) || medicineQuantity <= 0) {
      setMedicineError("Enter a quantity greater than zero.");
      return;
    }
    if (!Number.isFinite(medicineUnitPrice) || medicineUnitPrice < 0) {
      setMedicineError("Enter a unit price of zero or more.");
      return;
    }

    setMedicineSaving(true);
    setMedicineError("");
    try {
      await recordMedicineCharge(ctx, {
        patientId,
        medicineId,
        quantity: medicineQuantity,
        unitPrice: medicineUnitPrice,
        note: medicineNote,
      });
      toast.success(
        `${selectedMedicine?.name ?? "Medicine"} added to the patient bill`,
      );
      setMedicineId("");
      setMedicineQty("1");
      setMedicinePrice("");
      setMedicineNote("");
      await refresh();
    } catch (cause) {
      setMedicineError(
        cause instanceof Error
          ? cause.message
          : "Could not add the medicine to the bill.",
      );
    } finally {
      setMedicineSaving(false);
    }
  }

  async function removeCharge(row: ServiceChargeRow) {
    setRemovingId(row.id);
    try {
      await voidServiceCharge(row.id);
      setCharges((current) => current.filter((item) => item.id !== row.id));
      toast.success("Charge removed");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not remove the charge.",
      );
    } finally {
      setRemovingId(null);
    }
  }

  async function bill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!billPatientId || selectedIds.length === 0) {
      toast.error("Choose a patient and at least one recorded service.");
      return;
    }
    const discountValue = Number(discount) || 0;
    const taxValue = Number(tax) || 0;
    if (discountValue < 0 || taxValue < 0) {
      toast.error("Discount and tax must be zero or greater.");
      return;
    }
    if (discountValue > billSubtotal) {
      toast.error("Discount cannot exceed the selected subtotal.");
      return;
    }

    setBilling(true);
    try {
      const invoice = await createInvoiceFromCharges(ctx, {
        patientId: billPatientId,
        chargeIds: selectedIds,
        discountAmount: discountValue,
        taxAmount: taxValue,
      });
      toast.success(
        `Invoice ${invoice.invoiceNumber} sent to the patient for ${money(invoice.netAmount)}`,
      );
      setSelectedIds([]);
      setDiscount("0");
      setTax("0");
      await refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not issue the invoice.",
      );
    } finally {
      setBilling(false);
    }
  }

  async function takePayment(invoice: InvoiceBalance) {
    const draft = payDrafts[invoice.invoiceId] ?? {
      amount: String(invoice.outstanding),
      method: "cash",
    };
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a payment amount greater than zero.");
      return;
    }

    setPayingId(invoice.invoiceId);
    try {
      const result = await recordInvoicePayment(ctx, {
        invoiceId: invoice.invoiceId,
        amount,
        method: draft.method,
      });
      toast.success(
        result.status === "paid"
          ? `Invoice ${invoice.invoiceNumber} is fully paid`
          : `Payment recorded · ${money(result.outstanding)} still outstanding`,
      );
      setBalances((current) =>
        current.map((row) =>
          row.invoiceId === invoice.invoiceId
            ? {
                ...row,
                paidAmount: result.paidAmount,
                outstanding: result.outstanding,
                status: result.status,
              }
            : row,
        ),
      );
      setPayDrafts((current) => {
        const next = { ...current };
        delete next[invoice.invoiceId];
        return next;
      });
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not record the payment.",
      );
    } finally {
      setPayingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Recorded, not yet billed
          </p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {money(totals.unbilled)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Waiting for reception to invoice
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Awaiting payment
          </p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {money(totals.outstanding)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {totals.awaiting} issued invoice{totals.awaiting === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Collected</p>
          <p className="mt-1 text-xl font-semibold text-foreground">
            {money(totals.collected)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Payments allocated to invoices
          </p>
        </div>
      </div>

      {ctx.role === "pharmacist" && (
        <Panel
          title="Medicines the patient is buying"
          subtitle="Add what the pharmacy is handing over. The amount joins the patient bill with the other services, and reception invoices it."
        >
          <form
            onSubmit={(event) => void sellMedicine(event)}
            className="space-y-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Patient
                <select
                  required
                  value={patientId}
                  onChange={(event) => setPatientId(event.currentTarget.value)}
                  disabled={medicineSaving}
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
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Medicine
                <select
                  required
                  value={medicineId}
                  onChange={(event) => setMedicineId(event.currentTarget.value)}
                  disabled={medicineSaving || medicines.length === 0}
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
                      {medicine.dosageForm}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Quantity
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={medicineQty}
                  onChange={(event) =>
                    setMedicineQty(event.currentTarget.value)
                  }
                  disabled={medicineSaving}
                  className={fieldClass}
                />
              </label>
              <label className="min-w-0 text-xs font-medium text-muted-foreground">
                Unit price
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
              <label className="min-w-0 text-xs font-medium text-muted-foreground sm:col-span-2">
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
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Amount to bill:{" "}
                <span className="font-semibold text-foreground">
                  {money(medicineAmount)}
                </span>
              </p>
              {medicineError && (
                <p role="alert" className="text-sm text-destructive">
                  {medicineError}
                </p>
              )}
              <button
                type="submit"
                disabled={medicineSaving || !patientId || !medicineId}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
              >
                {medicineSaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Wallet className="size-4" />
                )}
                {medicineSaving ? "Adding…" : "Add medicine to bill"}
              </button>
            </div>
          </form>
        </Panel>
      )}

      <Panel
        title="Record a service you performed"
        subtitle="Pick the patient and the service. The price comes from your hospital price list and the entry joins the shared staff ledger."
      >
        <form
          onSubmit={(event) => void submitCharge(event)}
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="min-w-0 text-xs font-medium text-muted-foreground">
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
            <label className="min-w-0 text-xs font-medium text-muted-foreground">
              Service performed
              <select
                required
                value={chargeId}
                onChange={(event) => setChargeId(event.currentTarget.value)}
                disabled={saving || services.length === 0}
                className={fieldClass}
              >
                <option value="">
                  {services.length
                    ? "Select a service"
                    : "No price list items yet"}
                </option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} · {money(service.unitPrice)}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0 text-xs font-medium text-muted-foreground">
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
            <label className="min-w-0 text-xs font-medium text-muted-foreground">
              Note (optional)
              <input
                value={note}
                onChange={(event) => setNote(event.currentTarget.value)}
                placeholder="e.g. dressing on left forearm"
                disabled={saving}
                className={fieldClass}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Charge amount:{" "}
              <span className="font-semibold text-foreground">
                {money(estimatedAmount)}
              </span>
            </p>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <button
              type="submit"
              disabled={saving || !patientId || !chargeId}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Wallet className="size-4" />
              )}
              {saving ? "Recording…" : "Record charge"}
            </button>
          </div>
        </form>
      </Panel>

      <Panel
        title="Service ledger"
        subtitle="Every service recorded by hospital staff. Patients do not see this ledger — they receive the final invoice."
      >
        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex h-9 min-w-0 items-center gap-2 rounded-lg border border-input px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
            <Search aria-hidden="true" className="size-4 shrink-0" />
            <span className="sr-only">Search the service ledger</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search patient, service or staff member"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Filter charges by status"
          >
            <option value="all">All services</option>
            <option value="recorded">Awaiting invoice</option>
            <option value="invoiced">Invoiced</option>
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading the ledger…</p>
        ) : filteredCharges.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={
              charges.length ? "No matching services" : "No services recorded"
            }
            description={
              charges.length
                ? "Try another search or status filter."
                : "Services recorded by staff will appear here, and reception can turn them into an invoice."
            }
          />
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-1 py-2 font-semibold">When</th>
                  <th className="px-1 py-2 font-semibold">Patient</th>
                  <th className="px-1 py-2 font-semibold">Service</th>
                  <th className="px-1 py-2 font-semibold">Qty</th>
                  <th className="px-1 py-2 font-semibold">Amount</th>
                  <th className="px-1 py-2 font-semibold">Recorded by</th>
                  <th className="px-1 py-2 font-semibold">Status</th>
                  <th className="px-1 py-2 font-semibold">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCharges.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-1 py-2.5 text-xs text-muted-foreground">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-1 py-2.5">
                      <p className="text-sm font-medium text-foreground">
                        {row.patient}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.number}
                      </p>
                    </td>
                    <td className="px-1 py-2.5">
                      <p className="text-sm text-foreground">{row.service}</p>
                      {row.note && (
                        <p className="text-xs text-muted-foreground">
                          {row.note}
                        </p>
                      )}
                    </td>
                    <td className="px-1 py-2.5 text-foreground">
                      {row.quantity}
                    </td>
                    <td className="px-1 py-2.5 font-semibold text-foreground">
                      {money(row.amount)}
                    </td>
                    <td className="px-1 py-2.5">
                      <p className="text-sm text-foreground">
                        {row.recordedBy}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {humanise(row.recordedRole)}
                      </p>
                    </td>
                    <td className="px-1 py-2.5">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-1 py-2.5">
                      {row.invoiceNumber ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-foreground">
                            {row.invoiceNumber}
                          </span>
                          {row.invoiceStatus && (
                            <StatusPill status={row.invoiceStatus} />
                          )}
                        </div>
                      ) : row.status === "recorded" &&
                        row.recordedByUser === ctx.userId ? (
                        <button
                          type="button"
                          onClick={() => void removeCharge(row)}
                          disabled={removingId !== null}
                          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          {removingId === row.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                          Remove
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {canBill && (
        <Panel
          title="Bill a patient"
          subtitle={
            ctx.role === "lab_technician"
              ? "Select the lab services you recorded for one patient. Issuing the invoice sends it to their portal for payment."
              : "Select the recorded services for one patient. Issuing the invoice sends it to their portal for payment."
          }
        >
          <form onSubmit={(event) => void bill(event)} className="space-y-4">
            <label className="block max-w-md text-xs font-medium text-muted-foreground">
              Patient
              <select
                value={billPatientId}
                onChange={(event) => {
                  setBillPatientId(event.currentTarget.value);
                  setSelectedIds([]);
                }}
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

            {!billPatientId ? (
              <p className="text-xs text-muted-foreground">
                Choose a patient to see their recorded services.
              </p>
            ) : billable.length === 0 ? (
              <EmptyState
                icon={Banknote}
                title="Nothing waiting to be billed"
                description={
                  ctx.role === "lab_technician"
                    ? "Lab services you record for this patient will appear here."
                    : "Services recorded for this patient by any staff member will appear here."
                }
              />
            ) : (
              <div className="space-y-2">
                {billable.map((row) => {
                  const checked = selectedIds.includes(row.id);
                  return (
                    <label
                      key={row.id}
                      className={`flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm ${
                        checked
                          ? "border-primary bg-secondary/50"
                          : "border-border"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setSelectedIds((current) =>
                              event.currentTarget.checked
                                ? [...current, row.id]
                                : current.filter((id) => id !== row.id),
                            )
                          }
                          className="size-4 accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">
                            {row.service} · {row.quantity} ×{" "}
                            {money(row.unitPrice)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {humanise(row.recordedRole)} · {row.recordedBy} ·{" "}
                            {formatDate(row.createdAt)}
                          </span>
                        </span>
                      </span>
                      <span className="font-semibold text-foreground">
                        {money(row.amount)}
                      </span>
                    </label>
                  );
                })}

                <div className="flex flex-wrap items-end gap-3 rounded-lg bg-muted/30 p-3">
                  <label className="text-xs font-medium text-muted-foreground">
                    Subtotal
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {money(billSubtotal)}
                    </p>
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">
                    Discount
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discount}
                      onChange={(event) =>
                        setDiscount(event.currentTarget.value)
                      }
                      className={fieldClass}
                    />
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">
                    Tax
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tax}
                      onChange={(event) => setTax(event.currentTarget.value)}
                      className={fieldClass}
                    />
                  </label>
                  <p className="ml-auto text-sm font-semibold text-foreground">
                    Invoice total {money(Math.max(billTotal, 0))}
                  </p>
                  <button
                    type="submit"
                    disabled={billing || selectedIds.length === 0}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                  >
                    {billing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {billing ? "Issuing…" : "Issue invoice to patient"}
                  </button>
                </div>
              </div>
            )}
          </form>
        </Panel>
      )}

      {canManagePayments && (
        <Panel
          title="Payment status"
          subtitle="Issued invoices for this facility. Recording a payment updates the invoice, the ledger and the patient's portal."
        >
          {balances.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="No issued invoices"
              description="Invoices you issue to patients will appear here until they are fully paid."
            />
          ) : (
            <ul className="divide-y divide-border">
              {balances.map((row) => {
                const draft = payDrafts[row.invoiceId] ?? {
                  amount: String(row.outstanding),
                  method: "cash",
                };
                return (
                  <li key={row.invoiceId} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {row.invoiceNumber} · {row.patient}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {money(row.netAmount)} total · {money(row.paidAmount)}{" "}
                          paid · {money(row.outstanding)} outstanding
                          {row.issuedAt
                            ? ` · issued ${formatDate(row.issuedAt)}`
                            : ""}
                        </p>
                      </div>
                      <StatusPill status={row.status} />
                    </div>

                    {row.status !== "paid" && (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <label className="text-xs font-medium text-muted-foreground">
                          Amount
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.amount}
                            onChange={(event) =>
                              setPayDrafts((current) => ({
                                ...current,
                                [row.invoiceId]: {
                                  ...draft,
                                  amount: event.currentTarget.value,
                                },
                              }))
                            }
                            className={fieldClass}
                          />
                        </label>
                        <label className="text-xs font-medium text-muted-foreground">
                          Method
                          <select
                            value={draft.method}
                            onChange={(event) =>
                              setPayDrafts((current) => ({
                                ...current,
                                [row.invoiceId]: {
                                  ...draft,
                                  method: event.currentTarget.value,
                                },
                              }))
                            }
                            className={fieldClass}
                          >
                            {PAYMENT_METHODS.map((method) => (
                              <option key={method} value={method}>
                                {humanise(method)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => void takePayment(row)}
                          disabled={payingId !== null}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
                        >
                          {payingId === row.invoiceId ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Banknote className="size-4" />
                          )}
                          Record payment
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
