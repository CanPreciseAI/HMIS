import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, PackagePlus, Plus, Send, Store, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  createMedicineRequest,
  createMedicineVendor,
  loadMedicineCatalog,
  loadMedicineRequests,
  loadMedicineVendors,
  reviewMedicineRequest,
  sendMedicineRequestToVendor,
  type MedicineCatalogEntry,
  type MedicineRequestRow,
  type MedicineVendor,
  type StaffContext,
} from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";

const fieldClass =
  "mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60";

/**
 * Staff ask for a medicine that is out of stock. The hospital administrator
 * reviews requests here, approves them, and sends the approved order to a
 * medicine vendor.
 */
export function MedicineRequestsPanel({ ctx }: { ctx: StaffContext }) {
  const [rows, setRows] = useState<MedicineRequestRow[] | null>(null);
  const [medicines, setMedicines] = useState<MedicineCatalogEntry[]>([]);
  const [vendors, setVendors] = useState<MedicineVendor[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [medicineId, setMedicineId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [vendorPhone, setVendorPhone] = useState("");
  const [vendorSaving, setVendorSaving] = useState(false);

  const isAdmin = ctx.role === "hospital_admin" || ctx.role === "admin";
  const pendingCount = (rows ?? []).filter(
    (row) => row.status === "pending",
  ).length;

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [requests, catalog, vendorRows] = await Promise.all([
        loadMedicineRequests(ctx),
        ctx.tenantId
          ? loadMedicineCatalog(ctx.tenantId, true)
          : Promise.resolve([]),
        isAdmin ? loadMedicineVendors(ctx) : Promise.resolve([]),
      ]);
      setRows(requests);
      setMedicines(catalog);
      setVendors(vendorRows);
      setMedicineId((current) => current || catalog[0]?.id || "");
      setVendorId((current) => current || vendorRows[0]?.id || "");
    } catch (cause) {
      setRows([]);
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not load medicine requests.",
      );
    }
  }, [ctx, isAdmin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function medicineName(id: string) {
    const medicine = medicines.find((row) => row.id === id);
    return medicine
      ? `${medicine.name} ${medicine.strength}`
      : "Medicine no longer in the catalog";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const qty = Number(quantity);
    if (!medicineId) {
      toast.error("Choose the medicine you need.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Enter a quantity greater than zero.");
      return;
    }

    setSaving(true);
    try {
      await createMedicineRequest(ctx, medicineId, qty, note);
      setNote("");
      setQuantity("1");
      setOpen(false);
      await refresh();
      toast.success("Request sent — the hospital admin has been notified");
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not send the medicine request.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function addVendor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vendorName.trim()) {
      toast.error("Enter the vendor name.");
      return;
    }
    setVendorSaving(true);
    try {
      const id = await createMedicineVendor(
        ctx,
        vendorName,
        vendorEmail,
        vendorPhone,
      );
      setVendorName("");
      setVendorEmail("");
      setVendorPhone("");
      await refresh();
      setVendorId(id);
      toast.success("Vendor added");
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not add the vendor.",
      );
    } finally {
      setVendorSaving(false);
    }
  }

  async function sendToVendor(row: MedicineRequestRow) {
    if (!vendorId) {
      toast.error("Add or select a medicine vendor first.");
      return;
    }
    setBusyId(row.id);
    try {
      await sendMedicineRequestToVendor(ctx, row.id, vendorId);
      await refresh();
      const vendor = vendors.find((item) => item.id === vendorId);
      toast.success(
        `Request approved and sent to ${vendor?.name ?? "the vendor"}`,
      );
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not send the request to the vendor.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function review(
    row: MedicineRequestRow,
    status: "declined" | "fulfilled",
  ) {
    setBusyId(row.id);
    try {
      await reviewMedicineRequest(ctx, row.id, status);
      await refresh();
      toast.success(
        status === "declined"
          ? "Request declined"
          : "Request marked as fulfilled",
      );
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not update the request.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title="Medicine requests"
      subtitle={
        isAdmin
          ? `${pendingCount} pending · Approve staff requests and send them to a medicine vendor.`
          : "Ask for a medicine that is out of stock or needed urgently. The hospital admin is notified."
      }
      action={
        isAdmin ? undefined : (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <PackagePlus className="size-4" />{" "}
            {open ? "Hide form" : "Request medicine"}
          </button>
        )
      }
    >
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {isAdmin && (
        <div className="mb-5 rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Store className="size-4 text-primary" /> Medicine vendors
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Approved requests are sent to the selected vendor.
              </p>
            </div>
            {vendors.length > 0 && (
              <label className="w-full text-xs font-medium text-foreground sm:w-64">
                Send approvals to
                <select
                  value={vendorId}
                  onChange={(event) => setVendorId(event.currentTarget.value)}
                  className={fieldClass}
                >
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {vendors.length === 0 ? (
            <p className="mt-3 rounded-lg bg-background p-2.5 text-xs text-muted-foreground">
              No vendors yet. Add the supplier you order medicines from before
              approving requests.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {vendors.map((vendor) => (
                <li
                  key={vendor.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                >
                  <span className="text-sm font-medium text-foreground">
                    {vendor.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {[vendor.email, vendor.phone].filter(Boolean).join(" · ") ||
                      "No contact details"}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={(event) => void addVendor(event)}
            className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <label className="text-xs font-medium text-foreground">
              Vendor name
              <input
                required
                value={vendorName}
                onChange={(event) => setVendorName(event.currentTarget.value)}
                placeholder="e.g. City Pharma Supplies"
                disabled={vendorSaving}
                className={fieldClass}
              />
            </label>
            <label className="text-xs font-medium text-foreground">
              Email (optional)
              <input
                type="email"
                value={vendorEmail}
                onChange={(event) => setVendorEmail(event.currentTarget.value)}
                placeholder="orders@vendor.com"
                disabled={vendorSaving}
                className={fieldClass}
              />
            </label>
            <label className="text-xs font-medium text-foreground">
              Phone (optional)
              <input
                value={vendorPhone}
                onChange={(event) => setVendorPhone(event.currentTarget.value)}
                placeholder="Contact number"
                disabled={vendorSaving}
                className={fieldClass}
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={vendorSaving}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
              >
                {vendorSaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                {vendorSaving ? "Adding…" : "Add vendor"}
              </button>
            </div>
          </form>
        </div>
      )}

      {!isAdmin && open && (
        <form
          onSubmit={(event) => void submit(event)}
          className="mb-4 grid gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <label className="text-xs font-medium text-foreground sm:col-span-2">
            Medicine needed
            <select
              required
              value={medicineId}
              onChange={(event) => setMedicineId(event.currentTarget.value)}
              disabled={saving || medicines.length === 0}
              className={fieldClass}
            >
              <option value="">
                {medicines.length
                  ? "Choose a medicine"
                  : "No medicines in the catalog"}
              </option>
              {medicines.map((medicine) => (
                <option key={medicine.id} value={medicine.id}>
                  {medicine.name} · {medicine.strength} · {medicine.dosage_form}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-foreground">
            Quantity needed
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
              placeholder="e.g. needed for ward rounds tomorrow"
              disabled={saving}
              className={fieldClass}
            />
          </label>
          <div className="flex gap-2 sm:col-span-2 xl:col-span-4">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {saving ? "Sending…" : "Send request"}
            </button>
          </div>
        </form>
      )}

      {rows === null ? (
        <p className="text-sm text-muted-foreground">
          Loading medicine requests…
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={PackagePlus}
          title="No medicine requests yet"
          description={
            isAdmin
              ? "Staff requests for out-of-stock medicines will appear here for approval."
              : "When someone asks for an out-of-stock medicine it will appear here."
          }
        />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {medicineName(row.medicineId)} · {row.quantity}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.requestedByUserId === ctx.userId
                    ? "Requested by you"
                    : "Requested by staff"}{" "}
                  · {new Date(row.createdAt).toLocaleDateString()}
                  {row.note ? ` · ${row.note}` : ""}
                </p>
                {row.vendorOrderId && (
                  <p className="mt-1 text-[11px] font-medium text-primary">
                    Sent to {row.vendorName ?? "the vendor"}
                    {row.sentToVendorAt
                      ? ` · ${new Date(row.sentToVendorAt).toLocaleDateString()}`
                      : ""}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={row.status} />
                {row.vendorOrderId && row.vendorOrderStatus && (
                  <StatusPill status={row.vendorOrderStatus} />
                )}
                {isAdmin && row.status === "pending" && (
                  <>
                    <button
                      type="button"
                      disabled={busyId !== null || vendors.length === 0}
                      title={
                        vendors.length === 0
                          ? "Add a medicine vendor first"
                          : undefined
                      }
                      onClick={() => void sendToVendor(row)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Truck className="size-3.5" />
                      {busyId === row.id ? "Sending…" : "Approve & send"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void review(row, "declined")}
                      className="h-8 rounded-lg border border-destructive/40 px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </>
                )}
                {isAdmin && row.status === "approved" && !row.vendorOrderId && (
                  <button
                    type="button"
                    disabled={busyId !== null || vendors.length === 0}
                    onClick={() => void sendToVendor(row)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                  >
                    <Truck className="size-3.5" />
                    {busyId === row.id ? "Sending…" : "Send to vendor"}
                  </button>
                )}
                {isAdmin && row.status === "approved" && row.vendorOrderId && (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void review(row, "fulfilled")}
                    className="h-8 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
                  >
                    Mark fulfilled
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
