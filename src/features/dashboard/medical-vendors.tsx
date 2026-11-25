import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Boxes,
  Building2,
  ClipboardList,
  History,
  Loader2,
  Mail,
  PackageCheck,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  dispatchMedicineOrder,
  formatDate,
  money,
  type StaffContext,
} from "./data";
import { EmptyState, Panel, StatCard, StatusPill } from "./ui";

const VENDOR_TYPES = [
  { value: "medicine", label: "Medicines" },
  { value: "equipment", label: "Medical equipment" },
  { value: "consumables", label: "Consumables" },
  { value: "services", label: "Services" },
  { value: "other", label: "Other" },
] as const;

type VendorRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  paymentTerms: string | null;
  status: string;
  createdAt: string;
};

type MedicineOrder = {
  id: string;
  vendorId: string;
  medicineId: string;
  medicine: string;
  quantity: number;
  status: string;
  sentAt: string;
  dispatchedAt: string | null;
  collectedAt: string | null;
  note: string | null;
};

type PurchaseOrder = {
  id: string;
  vendorId: string;
  number: string;
  total: number;
  status: string;
  createdAt: string;
};

type VendorInvoice = {
  id: string;
  vendorId: string;
  number: string;
  invoiceDate: string;
  dueDate: string | null;
  gross: number;
  paid: number;
  status: string;
};

type VendorInventoryRow = {
  id: string;
  medicineId: string;
  medicine: string;
  quantity: number;
  unit: string;
  notes: string | null;
  updatedAt: string;
};

type VendorCatalogEntry = {
  id: string;
  name: string;
  strength: string;
  dosageForm: string;
};

type VendorSnapshot = {
  vendors: VendorRow[];
  medicineOrders: MedicineOrder[];
  purchaseOrders: PurchaseOrder[];
  invoices: VendorInvoice[];
  vendorInventory: VendorInventoryRow[];
  vendorCatalog: VendorCatalogEntry[];
};

const OPEN_PO_STATUSES = new Set(["draft", "approved", "partially_received"]);
const OPEN_INVOICE_STATUSES = new Set([
  "received",
  "matched",
  "approved",
  "disputed",
]);

function vendorTypeLabel(value: string) {
  return VENDOR_TYPES.find((type) => type.value === value)?.label ?? "Other";
}

function newVendorCode() {
  return `VND-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

async function loadVendorSnapshot(
  ctx: StaffContext,
  vendorUserId?: string,
): Promise<VendorSnapshot> {
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    throw new Error("Your workspace is missing its hospital.");
  }

  const vendorQuery = supabase
    .from("vendors")
    .select(
      "id, vendor_code, name, vendor_type, email, phone, tax_identifier, payment_terms, status, created_at",
    )
    .eq("tenant_id", tenantId);

  const [vendorResult, dispatchResult, orderResult] = await Promise.all([
    vendorUserId
      ? await vendorQuery.eq("user_id", vendorUserId).order("name")
      : await vendorQuery.order("name"),
    supabase
      .from("medicine_vendor_orders")
      .select(
        "id, request_id, vendor_id, medicine_id, quantity, status, sent_at, dispatched_at, collected_at",
      )
      .eq("tenant_id", tenantId)
      .order("sent_at", { ascending: false })
      .limit(200),
    supabase
      .from("purchase_orders")
      .select("id, vendor_id, po_number, total_amount, status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  if (vendorResult.error) {
    throw new Error(`Could not load vendors: ${vendorResult.error.message}`);
  }
  if (dispatchResult.error) {
    throw new Error(
      `Could not load medicine dispatches: ${dispatchResult.error.message}`,
    );
  }
  if (orderResult.error) {
    throw new Error(
      `Could not load purchase orders: ${orderResult.error.message}`,
    );
  }

  const vendors: VendorRow[] = (vendorResult.data ?? []).map((row) => ({
    id: row.id,
    code: row.vendor_code,
    name: row.name,
    type: row.vendor_type,
    email: row.email,
    phone: row.phone,
    taxId: row.tax_identifier,
    paymentTerms: row.payment_terms,
    status: row.status,
    createdAt: row.created_at,
  }));

  const orderRows = dispatchResult.data ?? [];
  const medicineIds = [...new Set(orderRows.map((row) => row.medicine_id))];
  const requestNotes = new Map<string, string>();
  const requestIds = [...new Set(orderRows.map((row) => row.request_id))];
  if (requestIds.length > 0) {
    const { data: requestRows, error: requestError } = await supabase
      .from("medicine_requests")
      .select("id, note")
      .in("id", requestIds);
    if (!requestError) {
      for (const request of requestRows ?? []) {
        if (request.note) requestNotes.set(request.id, request.note);
      }
    }
  }

  const medicineNames = new Map<string, string>();
  if (medicineIds.length > 0) {
    const { data: medicineRows, error: medicineError } = await supabase
      .from("medicine_catalog")
      .select("id, name, strength")
      .in("id", medicineIds);
    if (medicineError) {
      throw new Error(
        `Could not load the dispatched medicines: ${medicineError.message}`,
      );
    }
    for (const medicine of medicineRows ?? []) {
      medicineNames.set(
        medicine.id,
        medicine.strength
          ? `${medicine.name} ${medicine.strength}`
          : medicine.name,
      );
    }
  }

  const invoiceRows: VendorInvoice[] = [];
  const vendorIds = vendors.map((vendor) => vendor.id);
  if (vendorIds.length > 0) {
    const { data: invoices, error: invoiceError } = await supabase
      .from("vendor_invoices")
      .select(
        "id, vendor_id, invoice_number, invoice_date, due_date, gross_amount, status",
      )
      .in("vendor_id", vendorIds)
      .order("invoice_date", { ascending: false })
      .limit(200);
    if (invoiceError) {
      throw new Error(
        `Could not load vendor invoices: ${invoiceError.message}`,
      );
    }

    const invoiceIds = (invoices ?? []).map((invoice) => invoice.id);
    const paidByInvoice = new Map<string, number>();
    if (invoiceIds.length > 0) {
      const { data: allocations, error: allocationError } = await supabase
        .from("vendor_payment_allocations")
        .select("vendor_invoice_id, allocated_amount")
        .in("vendor_invoice_id", invoiceIds);
      if (allocationError) {
        throw new Error(
          `Could not load vendor payments: ${allocationError.message}`,
        );
      }
      for (const allocation of allocations ?? []) {
        paidByInvoice.set(
          allocation.vendor_invoice_id,
          (paidByInvoice.get(allocation.vendor_invoice_id) ?? 0) +
            Number(allocation.allocated_amount),
        );
      }
    }

    for (const invoice of invoices ?? []) {
      invoiceRows.push({
        id: invoice.id,
        vendorId: invoice.vendor_id,
        number: invoice.invoice_number,
        invoiceDate: invoice.invoice_date,
        dueDate: invoice.due_date,
        gross: Number(invoice.gross_amount),
        paid: paidByInvoice.get(invoice.id) ?? 0,
        status: invoice.status,
      });
    }
  }

  let vendorInventory: VendorInventoryRow[] = [];
  let vendorCatalog: VendorCatalogEntry[] = [];
  if (vendorUserId && vendors[0]) {
    const [inventoryResult, catalogResult] = await Promise.all([
      supabase
        .from("vendor_medicine_inventory")
        .select("id, medicine_id, quantity_available, unit, notes, updated_at")
        .eq("vendor_id", vendors[0].id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("medicine_catalog")
        .select("id, name, strength, dosage_form")
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(500),
    ]);
    if (inventoryResult.error) {
      throw new Error(
        `Could not load your medicine inventory: ${inventoryResult.error.message}`,
      );
    }
    if (catalogResult.error) {
      throw new Error(
        `Could not load the medicine catalog: ${catalogResult.error.message}`,
      );
    }
    vendorCatalog = (catalogResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      strength: row.strength,
      dosageForm: row.dosage_form,
    }));
    const catalogNames = new Map(
      vendorCatalog.map((row) => [
        row.id,
        row.strength ? `${row.name} ${row.strength}` : row.name,
      ]),
    );
    vendorInventory = (inventoryResult.data ?? []).map((row) => ({
      id: row.id,
      medicineId: row.medicine_id,
      medicine: catalogNames.get(row.medicine_id) ?? "Medicine",
      quantity: Number(row.quantity_available),
      unit: row.unit,
      notes: row.notes,
      updatedAt: row.updated_at,
    }));
  }

  return {
    vendors,
    medicineOrders: orderRows.map((row) => ({
      id: row.id,
      vendorId: row.vendor_id,
      medicineId: row.medicine_id,
      medicine: medicineNames.get(row.medicine_id) ?? "Medicine",
      quantity: Number(row.quantity),
      status: row.status,
      sentAt: row.sent_at,
      dispatchedAt: row.dispatched_at,
      collectedAt: row.collected_at,
      note: requestNotes.get(row.request_id) ?? null,
    })),
    purchaseOrders: (orderResult.data ?? []).map((row) => ({
      id: row.id,
      vendorId: row.vendor_id,
      number: row.po_number,
      total: Number(row.total_amount),
      status: row.status,
      createdAt: row.created_at,
    })),
    invoices: invoiceRows,
    vendorInventory,
    vendorCatalog,
  };
}

export function MedicalVendorsPanel({
  ctx,
  view = "overview",
}: {
  ctx: StaffContext;
  view?: "overview" | "orders" | "dispatches" | "inventory" | "history";
}) {
  const [snapshot, setSnapshot] = useState<VendorSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [stockSaving, setStockSaving] = useState(false);
  const isVendorAccount = ctx.role === "medical_vendor";

  useEffect(() => {
    let cancelled = false;
    if (reloadToken === 0) {
      setSnapshot(null);
      setError(null);
    }

    loadVendorSnapshot(ctx, isVendorAccount ? ctx.userId : undefined)
      .then((next) => {
        if (cancelled) return;
        setSnapshot(next);
        setSelectedId((current) => {
          if (current && next.vendors.some((vendor) => vendor.id === current)) {
            return current;
          }
          return next.vendors[0]?.id ?? null;
        });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setSnapshot(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the medical vendors.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ctx, isVendorAccount, reloadToken]);

  const refresh = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  const stats = useMemo(() => {
    if (!snapshot) return null;
    const activeVendors = snapshot.vendors.filter(
      (vendor) => vendor.status === "active",
    ).length;
    const openOrders = snapshot.purchaseOrders.filter((order) =>
      OPEN_PO_STATUSES.has(order.status),
    );
    const pendingDispatches = snapshot.medicineOrders.filter(
      (order) => order.status === "sent" || order.status === "dispatched",
    ).length;
    const outstanding = snapshot.invoices
      .filter((invoice) => OPEN_INVOICE_STATUSES.has(invoice.status))
      .reduce(
        (sum, invoice) => sum + Math.max(invoice.gross - invoice.paid, 0),
        0,
      );
    return {
      activeVendors,
      totalVendors: snapshot.vendors.length,
      openOrders: openOrders.length,
      openOrderValue: openOrders.reduce((sum, order) => sum + order.total, 0),
      pendingDeliveries:
        pendingDispatches +
        openOrders.filter(
          (order) =>
            order.status === "approved" ||
            order.status === "partially_received",
        ).length,
      outstanding,
    };
  }, [snapshot]);

  const visibleVendors = useMemo(() => {
    const rows = snapshot?.vendors ?? [];
    const needle = search.trim().toLowerCase();
    return rows.filter((vendor) => {
      if (typeFilter !== "all" && vendor.type !== typeFilter) return false;
      if (!needle) return true;
      return [
        vendor.name,
        vendor.code,
        vendor.email,
        vendor.phone,
        vendor.taxId,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle));
    });
  }, [snapshot, search, typeFilter]);

  const selected =
    snapshot?.vendors.find((vendor) => vendor.id === selectedId) ?? null;

  const selectedData = useMemo(() => {
    if (!snapshot || !selected) return null;
    const dispatches = snapshot.medicineOrders.filter(
      (row) => row.vendorId === selected.id,
    );
    const orders = snapshot.purchaseOrders.filter(
      (row) => row.vendorId === selected.id,
    );
    const invoices = snapshot.invoices.filter(
      (row) => row.vendorId === selected.id,
    );
    return {
      dispatches,
      orders,
      invoices,
      outstanding: invoices
        .filter((invoice) => OPEN_INVOICE_STATUSES.has(invoice.status))
        .reduce(
          (sum, invoice) => sum + Math.max(invoice.gross - invoice.paid, 0),
          0,
        ),
    };
  }, [snapshot, selected]);

  async function addVendor(input: {
    name: string;
    type: string;
    email: string;
    phone: string;
    taxId: string;
    paymentTerms: string;
  }) {
    if (!ctx.tenantId) {
      toast.error("Your workspace is missing its hospital.");
      return;
    }
    setSaving(true);
    const { data, error: insertError } = await supabase
      .from("vendors")
      .insert({
        tenant_id: ctx.tenantId,
        vendor_code: newVendorCode(),
        name: input.name.trim(),
        vendor_type: input.type,
        email: input.email.trim() || null,
        phone: input.phone.trim() || null,
        tax_identifier: input.taxId.trim() || null,
        payment_terms: input.paymentTerms.trim() || null,
        status: "active",
      })
      .select("id")
      .single();
    setSaving(false);
    if (insertError) {
      toast.error(`Could not add the vendor: ${insertError.message}`);
      return;
    }
    toast.success(`${input.name.trim()} added to your medical vendors`);
    setShowForm(false);
    setSelectedId(data.id);
    refresh();
  }

  async function saveVendorStock(input: {
    medicineId: string;
    quantity: number;
    unit: string;
  }) {
    if (!selected) return;
    setStockSaving(true);
    const { error: stockError } = await supabase
      .from("vendor_medicine_inventory")
      .upsert(
        {
          vendor_id: selected.id,
          medicine_id: input.medicineId,
          quantity_available: input.quantity,
          unit: input.unit.trim() || "units",
        },
        { onConflict: "vendor_id,medicine_id" },
      );
    setStockSaving(false);
    if (stockError) {
      toast.error(`Could not save your stock: ${stockError.message}`);
      return;
    }
    toast.success("Medicine stock saved");
    refresh();
  }

  async function markDispatched(order: MedicineOrder) {
    setDispatchingId(order.id);
    try {
      await dispatchMedicineOrder(order.id);
      toast.success(`${order.medicine} marked as dispatched`);
      refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not mark the order dispatched.",
      );
    } finally {
      setDispatchingId(null);
    }
  }

  async function toggleVendorStatus(vendor: VendorRow) {
    const nextStatus = vendor.status === "active" ? "inactive" : "active";
    setTogglingId(vendor.id);
    const { error: updateError } = await supabase
      .from("vendors")
      .update({ status: nextStatus })
      .eq("id", vendor.id)
      .eq("tenant_id", ctx.tenantId ?? "");
    setTogglingId(null);
    if (updateError) {
      toast.error(`Could not update the vendor: ${updateError.message}`);
      return;
    }
    toast.success(
      `${vendor.name} ${nextStatus === "active" ? "reactivated" : "deactivated"}`,
    );
    refresh();
  }

  if (error) {
    return (
      <Panel title="Medical vendors" subtitle="Suppliers and their activity">
        <EmptyState
          icon={Truck}
          title="Vendors could not be loaded"
          description={error}
        />
      </Panel>
    );
  }

  if (!snapshot || !stats) {
    return (
      <Panel title="Medical vendors" subtitle="Suppliers and their activity">
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading vendors…
        </div>
      </Panel>
    );
  }

  if (isVendorAccount) {
    return selected ? (
      <VendorFulfilmentDashboard
        vendor={selected}
        view={view}
        orders={snapshot.medicineOrders}
        inventory={snapshot.vendorInventory}
        catalog={snapshot.vendorCatalog}
        dispatchingId={dispatchingId}
        stockSaving={stockSaving}
        onDispatch={(order) => void markDispatched(order)}
        onSaveStock={(input) => void saveVendorStock(input)}
        onRefresh={refresh}
      />
    ) : (
      <Panel
        title="Medical vendors"
        subtitle="Your supplier account is not linked to this hospital"
      >
        <EmptyState
          icon={Truck}
          title="No supplier record linked"
          description="Ask the hospital administrator to approve and link your supplier account."
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Truck}
          label="Active vendors"
          value={stats.activeVendors}
          hint={`${stats.totalVendors} in the directory`}
        />
        <StatCard
          icon={ClipboardList}
          label="Open purchase orders"
          value={stats.openOrders}
          hint={`${money(stats.openOrderValue)} committed`}
          tone="blue"
        />
        <StatCard
          icon={PackageCheck}
          label="Pending deliveries"
          value={stats.pendingDeliveries}
          hint="Medicine orders awaiting dispatch or collection"
          tone="amber"
        />
        <StatCard
          icon={Wallet}
          label="Outstanding payable"
          value={money(stats.outstanding)}
          hint="Approved invoices not yet paid"
          tone="violet"
        />
      </div>

      <Panel
        title={isVendorAccount ? "Your supplier profile" : "Vendor directory"}
        subtitle={
          isVendorAccount
            ? "Your orders, invoices and payables with this hospital"
            : "Suppliers of medicines, equipment, consumables and services"
        }
        action={
          isVendorAccount ? undefined : (
            <button
              type="button"
              onClick={() => setShowForm((current) => !current)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              {showForm ? (
                <X className="size-3.5" />
              ) : (
                <Plus className="size-3.5" />
              )}
              {showForm ? "Close" : "Add vendor"}
            </button>
          )
        }
      >
        {showForm && !isVendorAccount && (
          <VendorForm
            saving={saving}
            onCancel={() => setShowForm(false)}
            onSubmit={addVendor}
          />
        )}

        {!isVendorAccount && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Search vendors</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, code, GSTIN or contact"
                className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              aria-label="Filter by vendor type"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="all">All vendor types</option>
              {VENDOR_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {visibleVendors.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Truck}
              title={
                snapshot.vendors.length === 0
                  ? "No medical vendors yet"
                  : "No vendors match this filter"
              }
              description={
                snapshot.vendors.length === 0
                  ? "Add your first supplier to track purchase orders, deliveries and payables."
                  : "Clear the search or choose another vendor type."
              }
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {visibleVendors.map((vendor) => {
              const isSelected = vendor.id === selected?.id;
              const vendorOrders = snapshot.purchaseOrders.filter(
                (order) => order.vendorId === vendor.id,
              ).length;
              const vendorPayable = snapshot.invoices
                .filter(
                  (invoice) =>
                    invoice.vendorId === vendor.id &&
                    OPEN_INVOICE_STATUSES.has(invoice.status),
                )
                .reduce(
                  (sum, invoice) =>
                    sum + Math.max(invoice.gross - invoice.paid, 0),
                  0,
                );
              return (
                <li key={vendor.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(vendor.id)}
                    className={`flex w-full flex-wrap items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-secondary/40 ${
                      isSelected ? "bg-secondary/60" : ""
                    }`}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                      <Building2 className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {vendor.name}
                        </span>
                        <StatusPill status={vendor.status} />
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {vendor.code} · {vendorTypeLabel(vendor.type)}
                        {vendor.paymentTerms ? ` · ${vendor.paymentTerms}` : ""}
                      </span>
                    </span>
                    <span className="text-right text-xs text-muted-foreground">
                      <span className="block font-semibold text-foreground">
                        {money(vendorPayable)}
                      </span>
                      {vendorOrders} order{vendorOrders === 1 ? "" : "s"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {selected && selectedData && (
        <Panel
          title={selected.name}
          subtitle={`${vendorTypeLabel(selected.type)} supplier · ${selected.code}`}
          action={
            isVendorAccount ? undefined : (
              <button
                type="button"
                onClick={() => void toggleVendorStatus(selected)}
                disabled={togglingId === selected.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
              >
                {togglingId === selected.id && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                {selected.status === "active" ? "Deactivate" : "Reactivate"}
              </button>
            )
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Status</dt>
                <dd>
                  <StatusPill status={selected.status} />
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">GSTIN</dt>
                <dd className="text-foreground">
                  {selected.taxId ?? "Not recorded"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Terms</dt>
                <dd className="text-foreground">
                  {selected.paymentTerms ?? "Not recorded"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Added</dt>
                <dd className="text-foreground">
                  {formatDate(selected.createdAt)}
                </dd>
              </div>
            </dl>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Email</dt>
                <dd className="flex min-w-0 items-center gap-1.5 text-foreground">
                  <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">
                    {selected.email ?? "Not recorded"}
                  </span>
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Phone</dt>
                <dd className="flex items-center gap-1.5 text-foreground">
                  <Phone className="size-3.5 text-muted-foreground" />
                  {selected.phone ?? "Not recorded"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">Payable</dt>
                <dd className="font-semibold text-foreground">
                  {money(selectedData.outstanding)}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted-foreground">
                  Activity
                </dt>
                <dd className="text-foreground">
                  {selectedData.dispatches.length} medicine order
                  {selectedData.dispatches.length === 1 ? "" : "s"} ·{" "}
                  {selectedData.orders.length} PO
                  {selectedData.orders.length === 1 ? "" : "s"} ·{" "}
                  {selectedData.invoices.length} invoice
                  {selectedData.invoices.length === 1 ? "" : "s"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <VendorList
              title="Medicine orders"
              empty="No medicine orders have been placed with this vendor."
              rows={selectedData.dispatches.slice(0, 6).map((order) => ({
                id: order.id,
                primary: order.medicine,
                secondary: `Qty ${order.quantity} · ordered ${formatDate(order.sentAt)}${
                  order.collectedAt
                    ? ` · collected ${formatDate(order.collectedAt)}`
                    : order.dispatchedAt
                      ? ` · dispatched ${formatDate(order.dispatchedAt)}`
                      : ""
                }`,
                status: order.status,
              }))}
            />
            <VendorList
              title="Purchase orders"
              empty="No purchase orders have been raised with this vendor."
              rows={selectedData.orders.slice(0, 6).map((order) => ({
                id: order.id,
                primary: order.number,
                secondary: `${money(order.total)} · ${formatDate(order.createdAt)}`,
                status: order.status,
              }))}
            />
            <VendorList
              title="Invoices"
              className="lg:col-span-2"
              empty="No vendor invoices recorded."
              rows={selectedData.invoices.slice(0, 6).map((invoice) => ({
                id: invoice.id,
                primary: invoice.number,
                secondary: `${money(invoice.gross)} · ${
                  invoice.dueDate
                    ? `due ${formatDate(invoice.dueDate)}`
                    : "no due date"
                } · ${money(Math.max(invoice.gross - invoice.paid, 0))} outstanding`,
                status: invoice.status,
              }))}
            />
          </div>
        </Panel>
      )}
    </div>
  );
}

const COLLECTED_ORDER_STATUSES = new Set(["collected", "received"]);

function VendorFulfilmentDashboard({
  vendor,
  view,
  orders,
  inventory,
  catalog,
  dispatchingId,
  stockSaving,
  onDispatch,
  onSaveStock,
  onRefresh,
}: {
  vendor: VendorRow;
  view: "overview" | "orders" | "dispatches" | "inventory" | "history";
  orders: MedicineOrder[];
  inventory: VendorInventoryRow[];
  catalog: VendorCatalogEntry[];
  dispatchingId: string | null;
  stockSaving: boolean;
  onDispatch: (order: MedicineOrder) => void;
  onSaveStock: (input: {
    medicineId: string;
    quantity: number;
    unit: string;
  }) => void;
  onRefresh: () => void;
}) {
  const sorted = [...orders].sort(
    (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
  );
  const awaitingDispatch = sorted.filter((order) => order.status === "sent");
  const dispatched = sorted.filter((order) => order.status === "dispatched");
  const collected = sorted
    .filter((order) => COLLECTED_ORDER_STATUSES.has(order.status))
    .sort(
      (a, b) =>
        new Date(b.collectedAt ?? b.sentAt).getTime() -
        new Date(a.collectedAt ?? a.sentAt).getTime(),
    );
  const unitsSupplied = collected.reduce(
    (sum, order) => sum + order.quantity,
    0,
  );

  const stockRows = [...inventory].sort((a, b) =>
    a.medicine.localeCompare(b.medicine),
  );
  const stockedMedicines = stockRows.filter((row) => row.quantity > 0).length;
  const show = (section: typeof view) => view === section;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ClipboardList}
          label="Orders to fulfil"
          value={awaitingDispatch.length}
          hint="Placed by the hospital, awaiting your dispatch"
          tone="blue"
        />
        <StatCard
          icon={Truck}
          label="Dispatched"
          value={dispatched.length}
          hint="On the way, awaiting hospital collection"
          tone="amber"
        />
        <StatCard
          icon={PackageCheck}
          label="Collected orders"
          value={collected.length}
          hint="Received and recorded by the hospital"
        />
        <StatCard
          icon={Boxes}
          label="Units supplied"
          value={unitsSupplied}
          hint="Total quantity collected by the hospital"
          tone="violet"
        />
      </div>

      {show("overview") && (
        <Panel
          title={vendor.name}
          subtitle={`${vendor.code} · your supplier profile`}
          action={
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
            >
              <RefreshCw className="size-3.5" /> Refresh
            </button>
          }
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span>
              <StatusPill status={vendor.status} />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Mail className="size-3.5" />{" "}
              {vendor.email ?? "No email recorded"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Phone className="size-3.5" />{" "}
              {vendor.phone ?? "No phone recorded"}
            </span>
          </div>
        </Panel>
      )}

      {show("orders") && (
        <Panel
          title="Orders"
          subtitle="Medicine orders the hospital has placed with you"
        >
          {sorted.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No orders yet"
              description="When the hospital orders a low-stock medicine from you, it appears here."
            />
          ) : (
            <ul className="divide-y divide-border">
              {sorted.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {order.medicine}
                      <span className="ml-2 font-normal text-muted-foreground">
                        Qty {order.quantity}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Ordered {formatDate(order.sentAt)}
                      {order.note ? ` · ${order.note}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={order.status} />
                    {order.status === "sent" && (
                      <button
                        type="button"
                        disabled={dispatchingId !== null}
                        onClick={() => onDispatch(order)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                      >
                        {dispatchingId === order.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Send className="size-3.5" />
                        )}
                        {dispatchingId === order.id
                          ? "Dispatching…"
                          : "Mark dispatched"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {show("dispatches") && (
        <Panel
          title="Dispatches"
          subtitle="Orders you have dispatched and the hospital has collected"
        >
          {dispatched.length === 0 && collected.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="Nothing dispatched yet"
              description="Mark an order dispatched and it will appear here until the hospital collects it."
            />
          ) : (
            <ul className="divide-y divide-border">
              {[...dispatched, ...collected].map((order) => (
                <li
                  key={order.id}
                  className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {order.medicine}
                      <span className="ml-2 font-normal text-muted-foreground">
                        Qty {order.quantity}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Dispatched{" "}
                      {order.dispatchedAt
                        ? formatDate(order.dispatchedAt)
                        : formatDate(order.sentAt)}
                      {order.collectedAt
                        ? ` · collected ${formatDate(order.collectedAt)}`
                        : " · awaiting hospital collection"}
                    </p>
                  </div>
                  <StatusPill status={order.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {show("inventory") && (
        <Panel
          title="Medicine inventory"
          subtitle="Medicines and quantities you currently hold"
        >
          <VendorStockForm
            catalog={catalog}
            saving={stockSaving}
            onSubmit={onSaveStock}
          />
          <p className="mt-4 text-xs text-muted-foreground">
            {stockRows.length} medicine{stockRows.length === 1 ? "" : "s"} in
            your list · {stockedMedicines} with stock available. Dispatching an
            order reduces the quantity here.
          </p>
          {stockRows.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                icon={Boxes}
                title="Your inventory is empty"
                description="Add the medicines you supply, with the quantity you currently hold, using the form above."
              />
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">Medicine</th>
                    <th className="py-2 pr-3 text-right font-medium">
                      Available
                    </th>
                    <th className="py-2 pr-3 font-medium">Unit</th>
                    <th className="py-2 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stockRows.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2.5 pr-3 font-medium text-foreground">
                        {row.medicine}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-foreground">
                        {row.quantity}
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">
                        {row.unit}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {formatDate(row.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {show("history") && (
        <Panel
          title="History"
          subtitle="Everything you have provided to this hospital"
        >
          {collected.length === 0 ? (
            <EmptyState
              icon={History}
              title="No completed supplies yet"
              description="Collected orders become part of the history of what you provided."
            />
          ) : (
            <ul className="divide-y divide-border">
              {collected.map((order) => (
                <li
                  key={order.id}
                  className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {order.medicine}
                      <span className="ml-2 font-normal text-muted-foreground">
                        Qty {order.quantity}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Provided {formatDate(order.collectedAt ?? order.sentAt)}
                      {order.dispatchedAt
                        ? ` · dispatched ${formatDate(order.dispatchedAt)}`
                        : ""}
                    </p>
                  </div>
                  <StatusPill status={order.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}

function VendorStockForm({
  catalog,
  saving,
  onSubmit,
}: {
  catalog: VendorCatalogEntry[];
  saving: boolean;
  onSubmit: (input: {
    medicineId: string;
    quantity: number;
    unit: string;
  }) => void;
}) {
  const [medicineId, setMedicineId] = useState(catalog[0]?.id ?? "");
  const [quantity, setQuantity] = useState("0");
  const [unit, setUnit] = useState("units");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!medicineId) {
      toast.error("Choose a medicine first.");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("Enter a valid stock quantity.");
      return;
    }
    onSubmit({ medicineId, quantity: qty, unit });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-secondary/30 p-3"
    >
      <p className="text-sm font-semibold text-foreground">
        Add or update stock
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-muted-foreground sm:col-span-2">
          Medicine
          <select
            value={medicineId}
            onChange={(event) => setMedicineId(event.target.value)}
            required
            className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground"
          >
            <option value="">
              {catalog.length
                ? "Choose a medicine"
                : "No medicines in the catalog"}
            </option>
            {catalog.map((medicine) => (
              <option key={medicine.id} value={medicine.id}>
                {medicine.name}
                {medicine.strength ? ` · ${medicine.strength}` : ""}
                {medicine.dosageForm ? ` · ${medicine.dosageForm}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Quantity available
          <input
            type="number"
            min="0"
            step="1"
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Unit
          <input
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="strips, vials, units"
            className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground"
          />
        </label>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          disabled={saving || catalog.length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          {saving ? "Saving…" : "Save stock"}
        </button>
      </div>
    </form>
  );
}

function VendorForm({
  saving,
  onCancel,
  onSubmit,
}: {
  saving: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    name: string;
    type: string;
    email: string;
    phone: string;
    taxId: string;
    paymentTerms: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("medicine");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Enter the vendor name.");
      return;
    }
    await onSubmit({ name, type, email, phone, taxId, paymentTerms });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-4 rounded-xl border border-border bg-secondary/30 p-4"
    >
      <p className="text-sm font-semibold text-foreground">
        Add a medical vendor
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted-foreground">
          Vendor name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            placeholder="e.g. MedPlus Supplies"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Vendor type
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          >
            {VENDOR_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="orders@vendor.example"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Phone
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+91 ..."
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          GSTIN / tax ID
          <input
            value={taxId}
            onChange={(event) => setTaxId(event.target.value)}
            placeholder="29ABCDE1234F1Z5"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Payment terms
          <input
            value={paymentTerms}
            onChange={(event) => setPaymentTerms(event.target.value)}
            placeholder="Net 30"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          Save vendor
        </button>
      </div>
    </form>
  );
}

function VendorList({
  title,
  rows,
  empty,
  className = "",
}: {
  title: string;
  rows: { id: string; primary: string; secondary: string; status: string }[];
  empty: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border p-3 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {row.primary}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.secondary}
                </p>
              </div>
              <StatusPill status={row.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
