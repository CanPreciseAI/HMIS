import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Check,
  Edit2,
  Link2,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  loadInventoryLocations,
  loadMedicineCatalogStock,
  loadMedicineInventoryAdminData,
  loadMedicineCatalog,
  loadMedicineStockDetails,
  recordMedicineStock,
  type InventoryLocationOption,
  type MedicineCatalogEntry,
  type MedicineCatalogStock,
  type MedicineInventoryItem,
  type MedicineInventoryMapping,
  type MedicineStockDetail,
  type StaffContext,
} from "./data";
import { EmptyState, Panel, StatusPill } from "./ui";
import { MedicineRequestsPanel } from "./medicine-requests";

const CATALOG_FIELDS =
  "id, tenant_id, medicine_code, name, strength, dosage_form, status";

export function MedicineCatalogReference({
  tenantId,
}: {
  tenantId: string | null;
}) {
  const [entries, setEntries] = useState<MedicineCatalogEntry[] | null>(null);
  const [stock, setStock] = useState<Map<string, MedicineCatalogStock> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (reloadToken === 0) {
      setEntries(null);
      setError(null);
    }
    if (!tenantId) {
      setError("Your workspace is missing its hospital ID.");
      return () => {
        cancelled = true;
      };
    }

    void Promise.all([
      loadMedicineCatalog(tenantId, true),
      loadMedicineCatalogStock(tenantId),
    ])
      .then(([catalog, stockRows]) => {
        if (!cancelled) {
          setEntries(catalog);
          setStock(new Map(stockRows.map((row) => [row.medicine_id, row])));
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setEntries([]);
          setStock(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the hospital medicine catalog and available stock.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, reloadToken]);

  // Prescribing or adjusting stock elsewhere must show here immediately, so
  // reload whenever prescription lines or balances change while this is open.
  useEffect(() => {
    if (!tenantId) return;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        setReloadToken((current) => current + 1);
      }, 700);
    };

    const channel = supabase
      .channel(`medicine-reference-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "prescription_items",
          filter: `tenant_id=eq.${tenantId}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_balances" },
        scheduleRefresh,
      )
      .subscribe((status, subscriptionError) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "Medicine stock live updates are unavailable",
            subscriptionError ?? status,
          );
        }
      });

    window.addEventListener("focus", scheduleRefresh);
    return () => {
      window.removeEventListener("focus", scheduleRefresh);
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [tenantId]);

  const filtered = (entries ?? []).filter((entry) => {
    const query = search.trim().toLowerCase();
    return (
      !query ||
      [entry.name, entry.medicine_code, entry.strength, entry.dosage_form]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  });

  return (
    <Panel
      title="Hospital medicine catalog"
      subtitle="Active medicines shared across your hospital"
    >
      <label className="mb-3 flex h-9 items-center gap-2 rounded-lg border border-input px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
        <Search aria-hidden="true" className="size-4 shrink-0" />
        <span className="sr-only">Search medicine catalog</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search medicines"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : entries === null ? (
        <p
          className="py-6 text-center text-sm text-muted-foreground"
          role="status"
        >
          Loading medicine catalog…
        </p>
      ) : filtered.length ? (
        <ul className="divide-y divide-border">
          {filtered.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {entry.name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {entry.medicine_code} · {entry.strength} · {entry.dosage_form}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <StockQuantity
                  stock={stock?.get(entry.id)}
                  loading={stock === null && !error}
                  error={Boolean(error)}
                />
                <StatusPill status="active" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Search}
          title={search ? "No matching medicines" : "No active medicines"}
          description={
            search
              ? "Try another name, code, strength or dosage form."
              : "Active medicines added by your hospital administrator will appear here."
          }
        />
      )}
    </Panel>
  );
}

export function MedicineCatalogManagement({
  ctx,
  initialEntries,
}: {
  ctx: StaffContext;
  initialEntries: MedicineCatalogEntry[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [editing, setEditing] = useState<MedicineCatalogEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    medicine_code: "",
    name: "",
    strength: "",
    dosage_form: "",
  });
  const [inventoryItems, setInventoryItems] = useState<MedicineInventoryItem[]>(
    [],
  );
  const [inventoryMappings, setInventoryMappings] = useState<
    MedicineInventoryMapping[]
  >([]);
  const [stockByMedicine, setStockByMedicine] = useState<
    Map<string, MedicineStockDetail>
  >(new Map());
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [mappingEditorEntry, setMappingEditorEntry] =
    useState<MedicineCatalogEntry | null>(null);
  const [stockEditorEntry, setStockEditorEntry] =
    useState<MedicineCatalogEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<MedicineCatalogEntry | null>(
    null,
  );
  const medicineIds = useMemo(
    () => entries.map((entry) => entry.id),
    [entries],
  );

  const refreshInventoryData = useCallback(
    async (showLoading = true) => {
      if (!ctx.tenantId) return;
      if (showLoading) setInventoryLoading(true);
      setInventoryError(null);
      try {
        const adminData = await loadMedicineInventoryAdminData(
          ctx.tenantId,
          medicineIds,
        );
        const stockDetails = await loadMedicineStockDetails(
          ctx.tenantId,
          medicineIds,
          adminData.items,
          adminData.mappings,
        );
        setStockByMedicine(
          new Map(stockDetails.map((row) => [row.medicineId, row])),
        );
        setInventoryItems(adminData.items);
        setInventoryMappings(adminData.mappings);
      } catch (cause) {
        setInventoryError(
          cause instanceof Error
            ? cause.message
            : "Could not load medicine stock and inventory links.",
        );
        setStockByMedicine(new Map());
      } finally {
        setInventoryLoading(false);
      }
    },
    [ctx.tenantId, medicineIds],
  );

  useEffect(() => {
    void refreshInventoryData();
  }, [refreshInventoryData]);

  // Keep the catalog current when another actor prescribes, dispenses, raises
  // an invoice item or adjusts stock balances.
  useEffect(() => {
    if (!ctx.tenantId) return;
    const tenantId = ctx.tenantId;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        void refreshInventoryData(false);
      }, 700);
    };

    const channel = supabase
      .channel(`medicine-stock-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "prescription_items",
          filter: `tenant_id=eq.${tenantId}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invoice_items",
          filter: `tenant_id=eq.${tenantId}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prescription_dispenses" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "inventory_balances" },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "medicine_inventory_map" },
        scheduleRefresh,
      )
      .subscribe((status, subscriptionError) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(
            "Medicine stock live updates are unavailable",
            subscriptionError ?? status,
          );
        }
      });

    window.addEventListener("focus", scheduleRefresh);
    return () => {
      window.removeEventListener("focus", scheduleRefresh);
      if (refreshTimer) clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [ctx.tenantId, refreshInventoryData]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesStatus =
        statusFilter === "all" || entry.status === statusFilter;
      const matchesSearch =
        !query ||
        [entry.name, entry.medicine_code, entry.strength, entry.dosage_form]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [entries, search, statusFilter]);

  if (ctx.role !== "hospital_admin" || !ctx.tenantId) {
    return (
      <p
        role="alert"
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
      >
        Only a hospital administrator can manage this catalog.
      </p>
    );
  }
  const tenantId = ctx.tenantId;

  function resetForm() {
    setEditing(null);
    setForm({ medicine_code: "", name: "", strength: "", dosage_form: "" });
    setFormError(null);
    setFormOpen(false);
  }

  function startCreate() {
    setEditing(null);
    setForm({ medicine_code: "", name: "", strength: "", dosage_form: "" });
    setFormError(null);
    setFormOpen(true);
  }

  function startEdit(entry: MedicineCatalogEntry) {
    setEditing(entry);
    setForm({
      medicine_code: entry.medicine_code,
      name: entry.name,
      strength: entry.strength,
      dosage_form: entry.dosage_form,
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = {
      medicine_code: form.medicine_code.trim().toUpperCase(),
      name: form.name.trim(),
      strength: form.strength.trim(),
      dosage_form: form.dosage_form.trim(),
    };
    if (Object.values(values).some((value) => !value)) {
      setFormError("Complete all fields before saving.");
      return;
    }

    const duplicate = entries.find(
      (entry) =>
        entry.id !== editing?.id &&
        entry.medicine_code.toLowerCase() ===
          values.medicine_code.toLowerCase(),
    );
    if (duplicate) {
      setFormError(`Code ${values.medicine_code} is already in this catalog.`);
      return;
    }

    setSaving(true);
    setFormError(null);
    const request = editing
      ? supabase
          .from("medicine_catalog")
          .update(values)
          .eq("tenant_id", tenantId)
          .eq("id", editing.id)
          .select(CATALOG_FIELDS)
          .single()
      : supabase
          .from("medicine_catalog")
          .insert({
            ...values,
            tenant_id: tenantId,
            status: "active",
          })
          .select(CATALOG_FIELDS)
          .single();

    const { data, error } = await request;
    setSaving(false);
    if (error) {
      const message =
        error.code === "23505"
          ? `Code ${values.medicine_code} is already in this catalog.`
          : `Could not ${editing ? "update" : "add"} medicine: ${error.message}`;
      setFormError(message);
      return;
    }
    if (!data) {
      setFormError("The medicine could not be saved. Please try again.");
      return;
    }

    setEntries((current) =>
      editing
        ? current.map((entry) => (entry.id === data.id ? data : entry))
        : [...current, data].sort((a, b) => a.name.localeCompare(b.name)),
    );
    toast.success(editing ? "Medicine updated" : "Medicine added");
    resetForm();
  }

  async function toggleStatus(entry: MedicineCatalogEntry) {
    const nextStatus = entry.status === "active" ? "inactive" : "active";
    setSaving(true);
    const { data, error } = await supabase
      .from("medicine_catalog")
      .update({ status: nextStatus })
      .eq("tenant_id", tenantId)
      .eq("id", entry.id)
      .select(CATALOG_FIELDS)
      .single();
    setSaving(false);
    if (error || !data) {
      toast.error(
        error
          ? `Could not ${nextStatus === "active" ? "activate" : "deactivate"} medicine: ${error.message}`
          : "The medicine status could not be updated.",
      );
      return;
    }
    setEntries((current) =>
      current.map((row) => (row.id === data.id ? data : row)),
    );
    toast.success(
      nextStatus === "active" ? "Medicine activated" : "Medicine deactivated",
    );
  }

  async function removeEntry(entry: MedicineCatalogEntry) {
    setSaving(true);
    const { error } = await supabase
      .from("medicine_catalog")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", entry.id);
    setSaving(false);
    if (error) {
      toast.error(`Could not remove ${entry.name}: ${error.message}`);
      return;
    }
    setEntries((current) => current.filter((row) => row.id !== entry.id));
    setDeleteEntry(null);
    await refreshInventoryData(false);
    toast.success(`${entry.name} removed from the catalog`);
  }

  async function saveInventoryMapping(
    medicineId: string,
    itemId: string,
    factor: number | null,
    operation: "upsert" | "delete",
  ) {
    const { error } = await supabase.rpc("manage_medicine_inventory_mapping", {
      _tenant_id: tenantId,
      _medicine_id: medicineId,
      _item_id: itemId,
      _conversion_factor: factor,
      _operation: operation,
    });
    if (error) {
      throw new Error(`Could not save inventory link: ${error.message}`);
    }
    await refreshInventoryData(false);
    toast.success(
      operation === "delete"
        ? "Inventory link removed"
        : "Inventory link saved",
    );
  }

  return (
    <div className="space-y-5">
      <MedicineRequestsPanel ctx={ctx} />
      <Panel
        title="Catalog entries"
        subtitle="Medicine reference with live stock from inventory and pending prescriptions."
        action={
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <Plus className="size-4" /> Add medicine
            </button>
          </div>
        }
      >
        {inventoryError && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-destructive/5 p-3 text-sm text-destructive"
          >
            {inventoryError}
          </p>
        )}
        {formOpen && (
          <form
            onSubmit={saveEntry}
            className="mb-5 rounded-xl border border-border bg-muted/20 p-4"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">
                {editing ? "Edit medicine" : "Add a medicine"}
              </h3>
              <button
                type="button"
                aria-label="Close medicine form"
                onClick={resetForm}
                className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["medicine_code", "Medicine code", "e.g. AMOX-500"],
                  ["name", "Medicine name", "e.g. Amoxicillin"],
                  ["strength", "Strength", "e.g. 500 mg"],
                  ["dosage_form", "Dosage form", "e.g. Capsule"],
                ] as const
              ).map(([key, label, placeholder]) => (
                <label
                  key={key}
                  className="block text-xs font-medium text-foreground"
                >
                  {label}
                  <input
                    required
                    value={form[key]}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    placeholder={placeholder}
                    className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
              ))}
            </div>
            {formError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {formError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="h-9 rounded-lg border border-input px-3 text-sm font-medium text-foreground hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                <Check className="size-4" />
                {saving
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Save medicine"}
              </button>
            </div>
          </form>
        )}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
            <Search aria-hidden="true" className="size-4 shrink-0" />
            <span className="sr-only">Search medicine catalog</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, code or strength"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <label className="sr-only" htmlFor="medicine-status-filter">
            Filter by status
          </label>
          <select
            id="medicine-status-filter"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as typeof statusFilter)
            }
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {filtered.length ? (
          <>
            <ul className="space-y-3 xl:hidden">
              {filtered.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-xl border border-border p-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-foreground">
                        {entry.name}
                      </p>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {entry.medicine_code} · {entry.strength} ·{" "}
                        {entry.dosage_form}
                      </p>
                    </div>
                    <StatusPill status={entry.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <MedicineStockFigures
                      stock={stockByMedicine.get(entry.id)}
                      loading={inventoryLoading}
                      error={Boolean(inventoryError)}
                    />
                    <button
                      type="button"
                      onClick={() => setStockEditorEntry(entry)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Package className="size-3.5" />
                      Add stock
                    </button>
                    <button
                      type="button"
                      disabled={inventoryLoading}
                      onClick={() => setMappingEditorEntry(entry)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      <Link2 className="size-3.5" />
                      Inventory links
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => startEdit(entry)}
                      className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-input px-2 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      <Edit2 className="size-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void toggleStatus(entry)}
                      className="h-9 rounded-lg border border-input px-2 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      {entry.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => setDeleteEntry(entry)}
                      className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-destructive/40 px-2 text-xs font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    >
                      <Trash2 className="size-3.5" /> Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="pb-2 pr-4 font-medium">
                      Medicine
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-medium">
                      On hand
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-medium">
                      Available
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-medium">
                      Status
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((entry) => (
                    <tr key={entry.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-foreground">
                          {entry.name}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {entry.medicine_code} · {entry.strength} ·{" "}
                          {entry.dosage_form}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <StockFigure
                          stock={stockByMedicine.get(entry.id)}
                          loading={inventoryLoading}
                          error={Boolean(inventoryError)}
                          figure="onHand"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <StockFigure
                          stock={stockByMedicine.get(entry.id)}
                          loading={inventoryLoading}
                          error={Boolean(inventoryError)}
                          figure="projectedAvailable"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <StatusPill status={entry.status} />
                      </td>
                      <td className="py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setStockEditorEntry(entry)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                          >
                            <Package className="size-3.5" /> Stock
                          </button>
                          <button
                            type="button"
                            disabled={inventoryLoading}
                            onClick={() => setMappingEditorEntry(entry)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60"
                          >
                            <Link2 className="size-3.5" /> Links
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => startEdit(entry)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60"
                          >
                            <Edit2 className="size-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void toggleStatus(entry)}
                            className="h-8 rounded-lg border border-input px-2.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60"
                          >
                            {entry.status === "active"
                              ? "Deactivate"
                              : "Activate"}
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => setDeleteEntry(entry)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-destructive/40 px-2.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                          >
                            <Trash2 className="size-3.5" /> Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <EmptyState
            title={
              entries.length ? "No matching medicines" : "Catalog is empty"
            }
            description={
              entries.length
                ? "Try another search or status filter."
                : "Add a medicine to make the hospital-wide catalog available to clinical teams."
            }
          />
        )}
      </Panel>
      {mappingEditorEntry && (
        <MedicineInventoryLinkDialog
          medicine={mappingEditorEntry}
          items={inventoryItems}
          mappings={inventoryMappings.filter(
            (mapping) => mapping.medicine_id === mappingEditorEntry.id,
          )}
          onClose={() => setMappingEditorEntry(null)}
          onSave={saveInventoryMapping}
        />
      )}
      {stockEditorEntry && ctx.tenantId && ctx.facilityId && (
        <MedicineStockDialog
          medicine={stockEditorEntry}
          tenantId={ctx.tenantId}
          facilityId={ctx.facilityId}
          onClose={() => setStockEditorEntry(null)}
          onSaved={() => void refreshInventoryData(false)}
        />
      )}
      {deleteEntry && (
        <RemoveMedicineDialog
          medicine={deleteEntry}
          busy={saving}
          onCancel={() => setDeleteEntry(null)}
          onConfirm={() => void removeEntry(deleteEntry)}
        />
      )}
    </div>
  );
}

function StockQuantity({
  stock,
  loading,
  error,
}: {
  stock: MedicineCatalogStock | undefined;
  loading: boolean;
  error: boolean;
}) {
  const label = error
    ? "Unavailable"
    : loading
      ? "Loading…"
      : !stock?.is_mapped
        ? "Not linked"
        : `${Number(stock.available_quantity).toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })} medicine units`;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${
        error || !stock?.is_mapped
          ? "bg-muted text-muted-foreground"
          : "bg-primary/10 text-primary"
      }`}
      aria-label={`Available medicine stock: ${label}`}
    >
      {label}
    </span>
  );
}

function MedicineStockDialog({
  medicine,
  tenantId,
  facilityId,
  onClose,
  onSaved,
}: {
  medicine: MedicineCatalogEntry;
  tenantId: string;
  facilityId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [locations, setLocations] = useState<InventoryLocationOption[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const [form, setForm] = useState({
    itemName: `${medicine.name} ${medicine.strength}`.trim(),
    itemCode: medicine.medicine_code,
    unit: "tablet",
    category: "Medicine",
    conversionFactor: "1",
    locationId: "",
    batchNumber: `BATCH-${new Date().toISOString().slice(0, 10)}`,
    expiryDate: nextYear.toISOString().slice(0, 10),
    quantity: "",
  });

  useEffect(() => {
    let cancelled = false;
    void loadInventoryLocations(tenantId)
      .then((rows) => {
        if (cancelled) return;
        setLocations(rows);
        setForm((current) => ({
          ...current,
          locationId: rows[0]?.id ?? "",
        }));
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setLocations([]);
        setLoadError(
          cause instanceof Error
            ? cause.message
            : "Could not load stock locations.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantity = Number(form.quantity);
    const factor = Number(form.conversionFactor);
    if (
      !form.itemName.trim() ||
      !form.itemCode.trim() ||
      !form.unit.trim() ||
      !form.batchNumber.trim() ||
      !form.expiryDate
    ) {
      setError("Complete the item, batch and expiry details.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Enter a stock quantity greater than zero.");
      return;
    }
    if (!Number.isFinite(factor) || factor <= 0) {
      setError("The conversion factor must be greater than zero.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await recordMedicineStock(tenantId, facilityId, {
        medicineId: medicine.id,
        itemCode: form.itemCode.trim().toUpperCase(),
        itemName: form.itemName.trim(),
        unit: form.unit.trim(),
        category: form.category.trim() || "Medicine",
        conversionFactor: factor,
        locationId: form.locationId || null,
        batchNumber: form.batchNumber.trim(),
        expiryDate: form.expiryDate,
        quantity,
      });
      toast.success(`Stock added for ${medicine.name}`);
      onSaved();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save stock details.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4">
      <section
        aria-labelledby="medicine-stock-title"
        className="w-full rounded-2xl border border-border bg-card p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="medicine-stock-title"
              className="text-base font-semibold text-foreground"
            >
              Add stock
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {medicine.name} · {medicine.strength} · {medicine.dosage_form}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close stock details"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mt-3 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          Received stock is recorded against an inventory item, batch and
          location. The stock left on the catalog is on-hand quantity minus
          reservations, multiplied by the medicine units per item unit.
        </p>

        {loadError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {loadError}
          </p>
        )}

        <form
          onSubmit={(event) => void submit(event)}
          className="mt-4 space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-foreground">
              Item name
              <input
                required
                value={form.itemName}
                onChange={(event) =>
                  setForm({ ...form, itemName: event.currentTarget.value })
                }
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="text-xs font-medium text-foreground">
              Item code
              <input
                required
                value={form.itemCode}
                onChange={(event) =>
                  setForm({ ...form, itemCode: event.currentTarget.value })
                }
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="text-xs font-medium text-foreground">
              Unit of measure
              <input
                required
                value={form.unit}
                onChange={(event) =>
                  setForm({ ...form, unit: event.currentTarget.value })
                }
                placeholder="tablet, bottle, vial"
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="text-xs font-medium text-foreground">
              Medicine units per item unit
              <input
                type="number"
                min="0.0001"
                step="0.0001"
                required
                value={form.conversionFactor}
                onChange={(event) =>
                  setForm({
                    ...form,
                    conversionFactor: event.currentTarget.value,
                  })
                }
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="text-xs font-medium text-foreground">
              Stock location
              <select
                value={form.locationId}
                onChange={(event) =>
                  setForm({ ...form, locationId: event.currentTarget.value })
                }
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">
                  {locations === null
                    ? "Loading locations…"
                    : "Create pharmacy location"}
                </option>
                {(locations ?? []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-foreground">
              Batch number
              <input
                required
                value={form.batchNumber}
                onChange={(event) =>
                  setForm({ ...form, batchNumber: event.currentTarget.value })
                }
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="text-xs font-medium text-foreground">
              Expiry date
              <input
                type="date"
                required
                value={form.expiryDate}
                onChange={(event) =>
                  setForm({ ...form, expiryDate: event.currentTarget.value })
                }
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="text-xs font-medium text-foreground">
              Quantity received
              <input
                type="number"
                min="1"
                step="1"
                required
                value={form.quantity}
                onChange={(event) =>
                  setForm({ ...form, quantity: event.currentTarget.value })
                }
                placeholder="e.g. 100"
                className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-9 rounded-lg border border-input px-3 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              <Package className="size-4" />
              {saving ? "Saving…" : "Add stock"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

type StockFigureKey =
  "onHand" | "reserved" | "pendingPrescriptions" | "projectedAvailable";

function formatQuantity(value: number) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function StockFigure({
  stock,
  loading,
  error,
  figure,
}: {
  stock: MedicineStockDetail | undefined;
  loading: boolean;
  error: boolean;
  figure: StockFigureKey;
}) {
  if (error) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (loading) {
    return <span className="text-xs text-muted-foreground">…</span>;
  }
  if (!stock) {
    return <span className="text-sm text-muted-foreground">0</span>;
  }
  return (
    <span
      className={
        figure === "projectedAvailable"
          ? "text-sm font-semibold text-foreground"
          : "text-sm text-muted-foreground"
      }
    >
      {formatQuantity(stock[figure])}
    </span>
  );
}

function MedicineStockFigures({
  stock,
  loading,
  error,
}: {
  stock: MedicineStockDetail | undefined;
  loading: boolean;
  error: boolean;
}) {
  if (error) {
    return (
      <span className="text-xs text-muted-foreground">Stock unavailable</span>
    );
  }
  if (loading) {
    return (
      <span className="text-xs text-muted-foreground">Loading stock…</span>
    );
  }
  if (!stock) {
    return (
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">0 left</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          No stock recorded yet
        </p>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-foreground">
        {formatQuantity(stock.projectedAvailable)} left
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        On hand {formatQuantity(stock.onHand)}
        {stock.pendingPrescriptions > 0
          ? ` · Pending Rx ${formatQuantity(stock.pendingPrescriptions)}`
          : ""}
      </p>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
        {stock.lines
          .map((line) => `${line.itemName} (${line.unit})`)
          .join(" · ")}
      </p>
    </div>
  );
}

function RemoveMedicineDialog({
  medicine,
  busy,
  onCancel,
  onConfirm,
}: {
  medicine: MedicineCatalogEntry;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-4">
      <section
        aria-labelledby="remove-medicine-title"
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5"
      >
        <h2
          id="remove-medicine-title"
          className="text-base font-semibold text-foreground"
        >
          Remove {medicine.name}?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This deletes the catalog entry and its inventory links permanently.
          Stock batches and prescription history are kept. A medicine that is
          still on a prescription cannot be removed — deactivate it instead.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 rounded-lg border border-input px-3 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive px-3 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
          >
            <Trash2 className="size-4" />
            {busy ? "Removing…" : "Remove permanently"}
          </button>
        </div>
      </section>
    </div>
  );
}

function MedicineInventoryLinkDialog({
  medicine,
  items,
  mappings,
  onClose,
  onSave,
}: {
  medicine: MedicineCatalogEntry;
  items: MedicineInventoryItem[];
  mappings: MedicineInventoryMapping[];
  onClose: () => void;
  onSave: (
    medicineId: string,
    itemId: string,
    factor: number | null,
    operation: "upsert" | "delete",
  ) => Promise<void>;
}) {
  const [selectedItemId, setSelectedItemId] = useState("");
  const [newFactor, setNewFactor] = useState("1");
  const [factorDrafts, setFactorDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alreadyLinked = new Set(mappings.map((mapping) => mapping.item_id));
  const availableItems = items.filter(
    (item) => item.status === "active" && !alreadyLinked.has(item.id),
  );

  async function submit(
    itemId: string,
    factor: number | null,
    operation: "upsert" | "delete",
  ) {
    setBusyKey(itemId);
    setError(null);
    try {
      await onSave(medicine.id, itemId, factor, operation);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save inventory link.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  function parseFactor(value: string) {
    const factor = Number(value);
    return Number.isFinite(factor) && factor > 0 ? factor : null;
  }

  return (
    <div className="mt-4">
      <section
        aria-labelledby="medicine-inventory-title"
        className="w-full rounded-2xl border border-border bg-card p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="medicine-inventory-title"
              className="text-base font-semibold text-foreground"
            >
              Inventory links
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {medicine.name} · {medicine.strength}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close inventory links"
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-3 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          The conversion factor is the number of medicine units represented by
          one inventory item unit. Available stock is the sum of on-hand minus
          reserved quantities across active hospital locations and unexpired
          batches, multiplied by this factor.
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 space-y-3">
          {mappings.map((mapping) => {
            const item = items.find((row) => row.id === mapping.item_id);
            const factorText =
              factorDrafts[mapping.id] ?? String(mapping.conversion_factor);
            const itemIsActive = item?.status === "active";
            return (
              <form
                key={mapping.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  const factor = parseFactor(factorText);
                  if (factor === null) {
                    setError("Enter a conversion factor greater than zero.");
                    return;
                  }
                  void submit(mapping.item_id, factor, "upsert");
                }}
                className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-foreground">
                    {item
                      ? `${item.name} (${item.item_code})`
                      : "Inventory item unavailable"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item?.unit_of_measure ?? "Unknown unit"}
                    {!itemIsActive ? " · Inventory item inactive" : ""}
                    {mapping.status !== "active" ? " · Link inactive" : ""}
                  </p>
                </div>
                <label className="text-xs font-medium text-foreground">
                  Medicine units
                  <input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    required
                    disabled={!itemIsActive || busyKey !== null}
                    value={factorText}
                    onChange={(event) =>
                      setFactorDrafts((current) => ({
                        ...current,
                        [mapping.id]: event.target.value,
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  />
                </label>
                <div className="flex items-end gap-2">
                  <button
                    type="submit"
                    disabled={!itemIsActive || busyKey === mapping.item_id}
                    className="h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                  >
                    {busyKey === mapping.item_id ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() => void submit(mapping.item_id, null, "delete")}
                    className="h-9 rounded-lg border border-input px-3 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-60"
                  >
                    Remove
                  </button>
                </div>
              </form>
            );
          })}
          {!mappings.length && (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No active or inactive inventory links for this medicine yet.
            </p>
          )}
        </div>

        <form
          className="mt-4 grid gap-3 rounded-xl bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedItemId) {
              setError("Choose an inventory item to link.");
              return;
            }
            const factor = parseFactor(newFactor);
            if (factor === null) {
              setError("Enter a conversion factor greater than zero.");
              return;
            }
            void submit(selectedItemId, factor, "upsert");
            setSelectedItemId("");
            setNewFactor("1");
          }}
        >
          <label className="text-xs font-medium text-foreground">
            Add inventory item
            <select
              required
              value={selectedItemId}
              onChange={(event) => setSelectedItemId(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select an active inventory item</option>
              {availableItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.item_code} ({item.unit_of_measure})
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-foreground">
            Medicine units
            <input
              type="number"
              min="0.0001"
              step="0.0001"
              required
              value={newFactor}
              onChange={(event) => setNewFactor(event.target.value)}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <button
            type="submit"
            disabled={!availableItems.length || busyKey !== null}
            className="h-9 self-end rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            Add link
          </button>
        </form>
        {!availableItems.length && (
          <p className="mt-2 text-xs text-muted-foreground">
            No unlinked active inventory items are available.
          </p>
        )}
      </section>
    </div>
  );
}
